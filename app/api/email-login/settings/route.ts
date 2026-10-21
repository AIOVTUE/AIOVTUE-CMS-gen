import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import {
  getEmailLoginSettingsPublic,
  upsertEmailLoginSettings,
} from "@/lib/email-login/settings";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const data = await getEmailLoginSettingsPublic(sessionResult.user.id);
    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "email-login/settings GET");
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const enabled =
      typeof body.enabled === "boolean" ? body.enabled : undefined;
    const email = typeof body.email === "string" ? body.email : undefined;
    const password =
      typeof body.password === "string" ? body.password : undefined;
    const clearCredentials = Boolean(body.clearCredentials);

    if (
      enabled === undefined &&
      email === undefined &&
      password === undefined &&
      !clearCredentials
    ) {
      throw createHttpError("请提供要更新的字段。", 400);
    }

    const data = await upsertEmailLoginSettings({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        githubUsername: user.githubUsername,
        image: user.image,
      },
      enabled,
      email,
      password,
      clearCredentials,
    });

    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "email-login/settings PUT");
    return toErrorResponse(error);
  }
}
