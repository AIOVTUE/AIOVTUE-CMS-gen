import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { isFilesystemRepoRef } from "@/lib/local-repo/config";
import { discardStagedChanges } from "@/lib/staged-writes/discard";
import { requireApiUserSession } from "@/lib/session-server";
import { getWriteToken } from "@/lib/token";
import { normalizePath } from "@/lib/utils/file";
import { isBlockedRepoPath } from "@/lib/utils/sensitive-path";
import { logServerError } from "@/lib/security/scrub-secrets";

/**
 * Discard staged / uncommitted CMS changes.
 *
 * POST /api/[owner]/[repo]/[branch]/staged/discard
 * Body: { path?: string } — omit path to discard everything.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    if (!isFilesystemRepoRef(params.owner, params.repo)) {
      throw createHttpError("Discard is only available for deferred-commit repos.", 400);
    }

    const { token } = await getWriteToken(user, params.owner, params.repo);
    if (!token) {
      throw createHttpError("Token not found", 401);
    }

    let path: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.path === "string" && body.path.trim()) {
        const normalized = normalizePath(body.path.trim());
        if (!normalized || normalized.includes("..") || isBlockedRepoPath(normalized)) {
          throw createHttpError("Invalid path.", 400);
        }
        path = normalized;
      }
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) throw error;
      // empty body = discard all
    }

    const result = await discardStagedChanges(params, { path });

    return Response.json({
      status: "success",
      message: path
        ? result.discarded > 0
          ? `已撤销：${path}`
          : "该文件没有待撤销的更改。"
        : result.discarded > 0
          ? `已撤销 ${result.discarded} 处更改。`
          : "没有待撤销的更改。",
      data: result,
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/staged/discard POST");
    return toErrorResponse(error);
  }
}
