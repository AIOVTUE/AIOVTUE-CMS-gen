import "server-only";

import { headers } from "next/headers";
import { APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { hasPendingCollaboratorInvite } from "@/lib/email-login/invite-check";
import { hashEmail } from "@/lib/email-login/settings";
import {
  assertEmailOtpSendRateLimit,
  assertEmailOtpVerifyRateLimit,
} from "@/lib/email-login/rate-limit";
import { getRequestIpFromHeaders } from "@/lib/email-login/request-ip";

const OTP_SEND_PATHS = new Set([
  "/email-otp/send-verification-otp",
  "/email-otp/create-verification-otp",
]);

const OTP_VERIFY_PATHS = new Set([
  "/sign-in/email-otp",
]);

/**
 * OTP sign-in is invite-only. Password login is the normal email path.
 * Blocks OTP creation/verification before better-auth stores codes
 * (sendVerificationOTP runs in background and cannot be relied on to fail the request).
 */
export const inviteOnlyEmailOtp = (): BetterAuthPlugin => ({
  id: "invite-only-email-otp",
  hooks: {
    before: [
      {
        matcher: (ctx) => {
          const path = ctx.path ?? "";
          return OTP_SEND_PATHS.has(path) || OTP_VERIFY_PATHS.has(path);
        },
        handler: createAuthMiddleware(async (ctx) => {
          const path = ctx.path ?? "";
          const body = (ctx.body ?? {}) as {
            email?: string;
            type?: string;
          };
          const email =
            typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
          if (!email) {
            throw APIError.from("BAD_REQUEST", {
              code: "INVALID_EMAIL",
              message: "邮箱无效。",
            });
          }

          const ip = getRequestIpFromHeaders(await headers()) || "unknown";
          const emailHash = await hashEmail(email);

          try {
            if (OTP_SEND_PATHS.has(path)) {
              assertEmailOtpSendRateLimit(`send:${ip}:${emailHash}`);
            } else {
              assertEmailOtpVerifyRateLimit(`verify:${ip}:${emailHash}`);
            }
          } catch (error: unknown) {
            const status =
              error && typeof error === "object" && "status" in error
                ? (error as { status?: number }).status
                : undefined;
            if (status === 429) {
              throw APIError.fromStatus(429, {
                code: "OTP_RATE_LIMIT",
                message:
                  error instanceof Error
                    ? error.message
                    : "尝试过于频繁，请稍后再试。",
              });
            }
            throw error;
          }

          const isSignInPath = path === "/sign-in/email-otp";
          const isSignInType =
            isSignInPath ||
            body.type === "sign-in" ||
            body.type === undefined;

          if (!isSignInType) {
            return;
          }

          const allowed = await hasPendingCollaboratorInvite(email);
          if (!allowed) {
            throw APIError.from("FORBIDDEN", {
              code: "OTP_INVITE_ONLY",
              message: "邮箱登录请使用密码。验证码仅用于接受协作邀请。",
            });
          }
        }),
      },
    ],
  },
});
