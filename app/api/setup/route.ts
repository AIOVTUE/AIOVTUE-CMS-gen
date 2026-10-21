import { createHttpError, toErrorResponse } from "@/lib/api-error";
import {
  getAppConfigPublic,
  isAdminBootstrapped,
  isDbSetupComplete,
  saveAppConfig,
} from "@/lib/app-config/store";
import type { AppConfigInput, EmailProvider } from "@/lib/app-config/types";
import { requireAdminSession } from "@/lib/admin";
import { logServerError } from "@/lib/security/scrub-secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getAppConfigPublic();
    const complete = await isDbSetupComplete();
    const bootstrapped = await isAdminBootstrapped();
    return Response.json({
      status: "success",
      data: {
        config: { ...config, setupComplete: complete },
        complete,
        bootstrapped,
      },
    });
  } catch (error: unknown) {
    logServerError(error, "setup GET");
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const complete = await isDbSetupComplete();
    const bootstrapped = await isAdminBootstrapped();

    // First-time setup (bootstrapped but not complete): no login required.
    // After setup is marked complete, only admins may change deployment config.
    if (complete) {
      await requireAdminSession();
    } else if (!bootstrapped) {
      throw createHttpError("请先创建管理员账号。", 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("无效的请求体。", 400);
    }

    const emailProviderRaw =
      typeof body.emailProvider === "string"
        ? body.emailProvider.trim().toLowerCase()
        : "";
    const emailProvider: EmailProvider =
      emailProviderRaw === "resend" || emailProviderRaw === "smtp"
        ? emailProviderRaw
        : "";

    const input: AppConfigInput = {
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : "",
      authSecret:
        typeof body.authSecret === "string" ? body.authSecret : undefined,
      githubAppId: typeof body.githubAppId === "string" ? body.githubAppId : "",
      githubAppName:
        typeof body.githubAppName === "string" ? body.githubAppName : "",
      githubAppClientId:
        typeof body.githubAppClientId === "string"
          ? body.githubAppClientId
          : "",
      githubAppClientSecret:
        typeof body.githubAppClientSecret === "string"
          ? body.githubAppClientSecret
          : undefined,
      githubAppPrivateKey:
        typeof body.githubAppPrivateKey === "string"
          ? body.githubAppPrivateKey
          : undefined,
      githubAppWebhookSecret:
        typeof body.githubAppWebhookSecret === "string"
          ? body.githubAppWebhookSecret
          : undefined,
      emailProvider,
      emailFrom: typeof body.emailFrom === "string" ? body.emailFrom : "",
      resendApiKey:
        typeof body.resendApiKey === "string" ? body.resendApiKey : undefined,
      smtpHost: typeof body.smtpHost === "string" ? body.smtpHost : undefined,
      smtpPort: typeof body.smtpPort === "string" ? body.smtpPort : undefined,
      smtpSecure:
        typeof body.smtpSecure === "boolean" ? body.smtpSecure : undefined,
      smtpUser: typeof body.smtpUser === "string" ? body.smtpUser : undefined,
      smtpPassword:
        typeof body.smtpPassword === "string" ? body.smtpPassword : undefined,
      adminEmails: typeof body.adminEmails === "string" ? body.adminEmails : "",
      githubAllowedUsernames:
        typeof body.githubAllowedUsernames === "string"
          ? body.githubAllowedUsernames
          : undefined,
    };

    const config = await saveAppConfig(input);
    return Response.json({ status: "success", data: { config, complete: true } });
  } catch (error: unknown) {
    logServerError(error, "setup PUT");
    return toErrorResponse(error);
  }
}
