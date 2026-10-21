import { toErrorResponse } from "@/lib/api-error";
import { listPublishHistory } from "@/lib/publish-history";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import { logServerError } from "@/lib/security/scrub-secrets";

/**
 * GET /api/[owner]/[repo]/[branch]/publish-history
 * Latest GitHub publish records (max 15; older rows are pruned).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    await getToken(sessionResult.user, params.owner, params.repo, true);

    const items = await listPublishHistory(
      params.owner,
      params.repo,
      params.branch,
    );

    return Response.json({
      status: "success",
      data: { items },
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/publish-history GET");
    return toErrorResponse(error);
  }
}
