import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getAppConfig } from "@/lib/app-config/store";
import type { AppConfig } from "@/lib/app-config/types";
import { repairLegacyGithubStubOnLogin } from "@/lib/github-legacy-stub-repair";
import { sendEmail } from "@/lib/mailer";
import { syncGithubProfileOnLogin } from "@/lib/github-account";
import { bindCollaboratorInvitesToUser } from "@/lib/collaborator-access";
import { LoginEmailTemplate } from "@/components/email/login";
import { render } from "@react-email/render";
import { inviteOnlyEmailOtp } from "@/lib/email-login/otp-guard";
import { hasPendingCollaboratorInvite } from "@/lib/email-login/invite-check";
import { GITHUB_USERNAME_DENIED_MESSAGE } from "@/lib/auth/github-username-allowlist";
import { logServerError } from "@/lib/security/scrub-secrets";

// Plugin endpoints (emailOTP etc.) are not fully inferred through the factory.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthInstance = any;

let authInstance: AuthInstance | null = null;
let authFingerprint = "";
let authPromise: Promise<AuthInstance> | null = null;

const parseAllowlist = (raw: string) => {
  if (!raw.trim()) return null;
  const names = raw
    .split(/[,;\s]+/)
    .map((value) => value.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
};

const fingerprintOf = (config: AppConfig) =>
  [
    config.baseUrl,
    config.authSecret,
    config.githubAppClientId,
    config.githubAppClientSecret,
    config.githubAllowedUsernames,
  ].join("|");

const createAuth = (config: AppConfig): AuthInstance => {
  if (!config.authSecret) {
    throw new Error("未配置登录密钥。请完成初始化。");
  }
  if (!config.baseUrl) {
    throw new Error("未配置站点地址。请完成初始化。");
  }

  const hasGithubOauth =
    Boolean(config.githubAppClientId) && Boolean(config.githubAppClientSecret);

  const allowlist = parseAllowlist(config.githubAllowedUsernames);
  const isAllowed = (login: string | null | undefined) => {
    if (!allowlist) return true;
    if (!login) return false;
    return allowlist.has(login.trim().replace(/^@/, "").toLowerCase());
  };

  return betterAuth({
    baseURL: config.baseUrl.replace(/\/$/, ""),
    secret: config.authSecret,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      },
    },
    user: {
      additionalFields: {
        githubUsername: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["github"],
        disableImplicitLinking: false,
        updateUserInfoOnLink: true,
        allowUnlinkingAll: false,
      },
    },
    socialProviders: hasGithubOauth
      ? {
      github: {
        clientId: config.githubAppClientId,
        clientSecret: config.githubAppClientSecret,
        overrideUserInfoOnSignIn: false,
        mapProfileToUser: (profile) => {
          if (!isAllowed(profile.login)) {
            throw APIError.from("FORBIDDEN", {
              code: "GITHUB_USERNAME_NOT_ALLOWED",
              message: GITHUB_USERNAME_DENIED_MESSAGE,
            });
          }
          return {
            name: profile.name ?? profile.login,
            image: profile.avatar_url ?? null,
            githubUsername: profile.login,
          };
        },
        scope: ["repo", "user:email"],
        getUserInfo: async (token) => {
          const profileResponse = await fetch("https://api.github.com/user", {
            headers: {
              "User-Agent": "better-auth",
              Authorization: `Bearer ${token.accessToken}`,
            },
          });

          if (!profileResponse.ok) {
            logServerError(
              `status=${profileResponse.status} githubRequestId=${profileResponse.headers.get("x-github-request-id")} rateLimitRemaining=${profileResponse.headers.get("x-ratelimit-remaining")}`,
              "auth github getUserInfo",
            );
            return null;
          }

          const profile = await profileResponse.json();

          if (!isAllowed(profile.login)) {
            throw APIError.from("FORBIDDEN", {
              code: "GITHUB_USERNAME_NOT_ALLOWED",
              message: GITHUB_USERNAME_DENIED_MESSAGE,
            });
          }

          let emails:
            | Array<{
                email: string;
                primary: boolean;
                verified: boolean;
                visibility: "public" | "private";
              }>
            | undefined;
          try {
            const emailsResponse = await fetch(
              "https://api.github.com/user/emails",
              {
                headers: {
                  Authorization: `Bearer ${token.accessToken}`,
                  "User-Agent": "better-auth",
                },
              },
            );
            if (emailsResponse.ok) {
              emails = await emailsResponse.json();
            }
          } catch {}

          if (!profile.email && emails) {
            profile.email = (
              emails.find((entry) => entry.primary) ?? emails[0]
            )?.email as string;
          }
          const emailVerified =
            emails?.find((entry) => entry.email === profile.email)?.verified ??
            false;

          const userMap = {
            name: profile.name ?? profile.login,
            image: profile.avatar_url ?? null,
            githubUsername: profile.login,
          };

          return {
            user: {
              id: profile.id,
              email: profile.email,
              emailVerified,
              ...userMap,
            },
            data: profile,
          };
        },
      },
        }
      : {},
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.userTable,
        session: schema.sessionTable,
        account: schema.accountTable,
        verification: schema.verificationTable,
      },
    }),
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            try {
              await repairLegacyGithubStubOnLogin(session.id, session.userId);
            } catch (error) {
              logServerError(error, "auth legacy github stub repair");
            }

            try {
              await syncGithubProfileOnLogin(session.userId);
            } catch (error) {
              logServerError(error, "auth github profile sync");
            }

            try {
              const user = await db.query.userTable.findFirst({
                where: (table, { eq: equals }) =>
                  equals(table.id, session.userId),
              });
              if (user) {
                await bindCollaboratorInvitesToUser(user);
              }
            } catch (error) {
              logServerError(error, "auth collaborator invite binding");
            }
          },
        },
      },
    },
    plugins: [
      nextCookies(),
      inviteOnlyEmailOtp(),
      emailOTP({
        expiresIn: 300,
        otpLength: 6,
        allowedAttempts: 5,
        storeOTP: "encrypted",
        resendStrategy: "reuse",
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in") return;
          if (!(await hasPendingCollaboratorInvite(email))) {
            return;
          }

          const subject = `Your Pages CMS temporary code is ${otp}`;
          const html = await render(
            LoginEmailTemplate({
              email,
              otp,
              preview: subject,
              baseUrl: config.baseUrl,
            }),
          );

          await sendEmail({
            to: email,
            subject,
            html,
          });
        },
      }),
    ],
  });
};

export const invalidateAuth = () => {
  authInstance = null;
  authFingerprint = "";
  authPromise = null;
};

export const getAuth = async (): Promise<AuthInstance> => {
  const config = await getAppConfig();
  const nextFingerprint = fingerprintOf(config);
  if (authInstance && authFingerprint === nextFingerprint) {
    return authInstance;
  }

  if (!authPromise) {
    authPromise = (async () => {
      const latest = await getAppConfig();
      const fp = fingerprintOf(latest);
      authInstance = createAuth(latest);
      authFingerprint = fp;
      return authInstance;
    })().finally(() => {
      authPromise = null;
    });
  }

  return authPromise;
};

/**
 * @deprecated Prefer `await getAuth()`. Kept for gradual migration; throws if
 * auth has not been initialized yet on this isolate.
 */
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    if (!authInstance) {
      throw new Error(
        "Auth 尚未初始化。请使用 await getAuth()，或先完成应用初始化。",
      );
    }
    return Reflect.get(authInstance, prop, receiver);
  },
});
