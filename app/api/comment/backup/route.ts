import { toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { runCommentBackupForUser } from "@/lib/comment-settings/backup";
import { getCommentSettingsPublic } from "@/lib/comment-settings/settings";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const settings = await getCommentSettingsPublic(sessionResult.user.id);
    return Response.json({
      status: "success",
      data: {
        backupEnabled: settings.backupEnabled,
        backupRemotePath: settings.backupRemotePath,
        backupIntervalHours: settings.backupIntervalHours,
        lastBackupAt: settings.lastBackupAt,
        lastBackupStatus: settings.lastBackupStatus,
        lastBackupMessage: settings.lastBackupMessage,
      },
    });
  } catch (error: unknown) {
    logServerError(error, "comment/backup GET");
    return toErrorResponse(error);
  }
}

/** POST — { mode: "manual" | "auto" }. manual 强制备份；auto 仅在启用且到期时执行。 */
export async function POST(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const body = await request.json().catch(() => ({}));
    const mode =
      body && typeof body === "object" && body.mode === "auto"
        ? "auto"
        : "manual";

    const result = await runCommentBackupForUser({
      userId: sessionResult.user.id,
      force: mode === "manual",
    });

    return Response.json({ status: "success", data: result });
  } catch (error: unknown) {
    logServerError(error, "comment/backup POST");
    return toErrorResponse(error);
  }
}
