import { toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { getCommentSettingsPublic } from "@/lib/comment-settings/settings";
import { fetchRecentComments } from "@/lib/comment-settings/recent";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const settings = await getCommentSettingsPublic(sessionResult.user.id);
    if (!settings.provider || !settings.serverUrl) {
      return Response.json({
        status: "success",
        data: {
          configured: false,
          provider: settings.provider,
          comments: [],
        },
      });
    }

    const comments = await fetchRecentComments({
      provider: settings.provider,
      serverUrl: settings.serverUrl,
      limit: 10,
    });

    return Response.json({
      status: "success",
      data: {
        configured: true,
        provider: settings.provider,
        comments,
      },
    });
  } catch (error: unknown) {
    logServerError(error, "comment/recent");
    return toErrorResponse(error);
  }
}
