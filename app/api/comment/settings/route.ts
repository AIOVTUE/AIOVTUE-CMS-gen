import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import {
  getCommentSettingsPublic,
  upsertCommentSettings,
} from "@/lib/comment-settings/settings";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const settings = await getCommentSettingsPublic(sessionResult.user.id);
    return Response.json({ status: "success", data: settings });
  } catch (error: unknown) {
    logServerError(error, "comment/settings GET");
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

    const provider = typeof body.provider === "string" ? body.provider : "";
    const serverUrl = typeof body.serverUrl === "string" ? body.serverUrl : "";
    const passwordTouched = Boolean(
      (body as { passwordTouched?: unknown }).passwordTouched,
    );
    const password =
      typeof (body as { password?: unknown }).password === "string"
        ? (body as { password: string }).password
        : "";
    const backupEnabled = Boolean(
      (body as { backupEnabled?: unknown }).backupEnabled,
    );
    const backupRemotePath =
      typeof (body as { backupRemotePath?: unknown }).backupRemotePath ===
      "string"
        ? (body as { backupRemotePath: string }).backupRemotePath
        : undefined;
    const backupIntervalHours =
      typeof (body as { backupIntervalHours?: unknown }).backupIntervalHours ===
      "number"
        ? (body as { backupIntervalHours: number }).backupIntervalHours
        : typeof (body as { backupIntervalHours?: unknown })
              .backupIntervalHours === "string"
          ? Number(
              (body as { backupIntervalHours: string }).backupIntervalHours,
            )
          : undefined;

    const settings = await upsertCommentSettings({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        githubUsername: user.githubUsername,
        image: user.image,
      },
      provider,
      serverUrl,
      password,
      passwordTouched,
      backupEnabled,
      backupRemotePath,
      backupIntervalHours,
    });

    return Response.json({ status: "success", data: settings });
  } catch (error: unknown) {
    logServerError(error, "comment/settings PUT");
    return toErrorResponse(error);
  }
}
