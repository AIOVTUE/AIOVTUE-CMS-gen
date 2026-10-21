import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { emailLoginSettingsTable } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import type { EmailLoginSettingsPublic } from "@/lib/email-login/types";
import {
  assertEmailLoginRateLimit,
  clearEmailLoginRateLimit,
} from "@/lib/email-login/rate-limit";

export type { EmailLoginSettingsPublic };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Soft ceiling only (DoS); no min length or complexity rules. */
const MAX_PASSWORD_LENGTH = 65_536;
const MAX_EMAIL_LENGTH = 254;

/** Dummy scrypt hash so missing-account paths still run verify (timing). */
let dummyPasswordHashPromise: Promise<string> | null = null;

const getDummyPasswordHash = async () => {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = (async () => {
      const auth = await getAuth();
      const ctx = await auth.$context;
      return ctx.password.hash("__email_login_dummy_password__");
    })();
  }
  return dummyPasswordHashPromise;
};

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const assertValidEmail = (value: string) => {
  const email = normalizeEmail(value);
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    throw Object.assign(new Error("邮箱格式无效。"), { status: 400 });
  }
  return email;
};

export const assertValidPassword = (value: string) => {
  if (typeof value !== "string" || value.length === 0) {
    throw Object.assign(new Error("请填写密码。"), { status: 400 });
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw Object.assign(new Error("密码过长。"), { status: 400 });
  }
  return value;
};

export const hashEmail = async (email: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizeEmail(email)),
  );
  return Buffer.from(digest).toString("hex");
};

const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};

const toPublic = async (
  row: typeof emailLoginSettingsTable.$inferSelect | null,
): Promise<EmailLoginSettingsPublic> => {
  if (!row) {
    return {
      enabled: false,
      emailMasked: null,
      hasCredentials: false,
      updatedAt: null,
    };
  }

  let emailMasked: string | null = null;
  try {
    const email = await decrypt(row.emailCiphertext, row.emailIv);
    emailMasked = maskEmail(email);
  } catch {
    emailMasked = "***";
  }

  return {
    enabled: Boolean(row.enabled),
    emailMasked,
    hasCredentials: true,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
};

export const getEmailLoginSettingsPublic = async (
  userId: string,
): Promise<EmailLoginSettingsPublic> => {
  const row = await db.query.emailLoginSettingsTable.findFirst({
    where: eq(emailLoginSettingsTable.userId, userId),
  });
  return toPublic(row ?? null);
};

type UpsertInput = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  enabled?: boolean;
  email?: string;
  password?: string;
  clearCredentials?: boolean;
};

export const upsertEmailLoginSettings = async (
  input: UpsertInput,
): Promise<EmailLoginSettingsPublic> => {
  await ensureDbUser(input.user);
  const existing = await db.query.emailLoginSettingsTable.findFirst({
    where: eq(emailLoginSettingsTable.userId, input.user.id),
  });

  if (input.clearCredentials) {
    if (existing) {
      await db
        .delete(emailLoginSettingsTable)
        .where(eq(emailLoginSettingsTable.userId, input.user.id));
    }
    return toPublic(null);
  }

  const nextEnabled =
    typeof input.enabled === "boolean"
      ? input.enabled
      : Boolean(existing?.enabled);

  const emailProvided =
    typeof input.email === "string" && input.email.trim().length > 0;
  const passwordProvided =
    typeof input.password === "string" && input.password.length > 0;

  if (!existing && (!emailProvided || !passwordProvided)) {
    throw Object.assign(new Error("首次启用需同时设置邮箱和密码。"), {
      status: 400,
    });
  }

  let emailCiphertext = existing?.emailCiphertext ?? "";
  let emailIv = existing?.emailIv ?? "";
  let emailHash = existing?.emailHash ?? "";
  let passwordHash = existing?.passwordHash ?? "";

  if (emailProvided) {
    const email = assertValidEmail(input.email!);
    const encrypted = await encrypt(email);
    emailCiphertext = encrypted.ciphertext;
    emailIv = encrypted.iv;
    emailHash = await hashEmail(email);

    const conflict = await db.query.emailLoginSettingsTable.findFirst({
      where: and(
        eq(emailLoginSettingsTable.emailHash, emailHash),
        ne(emailLoginSettingsTable.userId, input.user.id),
      ),
    });
    if (conflict) {
      throw Object.assign(new Error("该邮箱已被其他账号用于登录。"), {
        status: 409,
      });
    }
  }

  if (passwordProvided) {
    const password = assertValidPassword(input.password!);
    const auth = await getAuth();
    const ctx = await auth.$context;
    passwordHash = await ctx.password.hash(password);
  }

  if (!emailCiphertext || !emailIv || !emailHash || !passwordHash) {
    throw Object.assign(new Error("邮箱和密码均需配置后才能保存。"), {
      status: 400,
    });
  }

  if (nextEnabled && (!passwordHash || !emailHash)) {
    throw Object.assign(
      new Error("开启邮箱登录前请先设置邮箱和密码。"),
      { status: 400 },
    );
  }

  const updatedAt = new Date();
  await db
    .insert(emailLoginSettingsTable)
    .values({
      userId: input.user.id,
      emailHash,
      emailCiphertext,
      emailIv,
      passwordHash,
      enabled: nextEnabled,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: emailLoginSettingsTable.userId,
      set: {
        emailHash,
        emailCiphertext,
        emailIv,
        passwordHash,
        enabled: nextEnabled,
        updatedAt,
      },
    });

  return getEmailLoginSettingsPublic(input.user.id);
};

export { hasPendingCollaboratorInvite } from "@/lib/email-login/invite-check";

export const signInWithEmailPassword = async (input: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) => {
  const email = assertValidEmail(input.email);
  const password = input.password;
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    throw Object.assign(new Error("邮箱或密码错误，或未启用邮箱登录。"), {
      status: 401,
    });
  }

  const rateKey = `${input.ipAddress || "unknown"}:${await hashEmail(email)}`;
  assertEmailLoginRateLimit(rateKey);

  const emailHash = await hashEmail(email);
  const row = await db.query.emailLoginSettingsTable.findFirst({
    where: eq(emailLoginSettingsTable.emailHash, emailHash),
  });

  const fail = () => {
    throw Object.assign(new Error("邮箱或密码错误，或未启用邮箱登录。"), {
      status: 401,
    });
  };

  const auth = await getAuth();
  const ctx = await auth.$context;
  const hashToVerify = row?.passwordHash || (await getDummyPasswordHash());
  let passwordMatches = false;
  try {
    passwordMatches = await ctx.password.verify({
      hash: hashToVerify,
      password,
    });
  } catch {
    passwordMatches = false;
  }

  if (!row || !row.enabled || !passwordMatches) {
    fail();
  }

  let storedEmail: string;
  try {
    storedEmail = await decrypt(row!.emailCiphertext, row!.emailIv);
  } catch {
    fail();
    return;
  }

  if (normalizeEmail(storedEmail) !== email) {
    fail();
  }

  const session = await ctx.internalAdapter.createSession(row!.userId, false);
  if (!session) {
    throw Object.assign(new Error("无法创建登录会话。"), { status: 500 });
  }

  if (input.ipAddress || input.userAgent) {
    try {
      await ctx.internalAdapter.updateSession(session.token, {
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
      });
    } catch {
      // non-fatal
    }
  }

  // better-auth reads session via getSignedCookie — raw token cookies are ignored.
  const signedValue = await signBetterAuthCookieValue(
    session.token,
    ctx.secret,
  );

  const cookie = ctx.authCookies.sessionToken;
  const cookieStore = await cookies();
  const sameSiteRaw = cookie.attributes.sameSite;
  const sameSite =
    typeof sameSiteRaw === "string"
      ? (sameSiteRaw.toLowerCase() as "lax" | "strict" | "none")
      : "lax";

  cookieStore.set(cookie.name, signedValue, {
    httpOnly: cookie.attributes.httpOnly,
    secure: cookie.attributes.secure,
    path: cookie.attributes.path ?? "/",
    maxAge: cookie.attributes.maxAge,
    sameSite,
    expires: session.expiresAt,
  });

  clearEmailLoginRateLimit(rateKey);

  // Never return the session token in JSON — cookie only.
  return { userId: row!.userId };
};

/** Match better-call signCookieValue (HMAC-SHA256 + base64), without URI-encoding. */
const signBetterAuthCookieValue = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  const signatureB64 = Buffer.from(signature).toString("base64");
  return `${value}.${signatureB64}`;
};
