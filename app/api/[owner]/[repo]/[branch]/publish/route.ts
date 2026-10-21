import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { isFilesystemRepoRef, isLocalRepoRef } from "@/lib/local-repo/config";
import { getGitStatus } from "@/lib/local-repo/git";
import { getStagedStatus } from "@/lib/staged-writes/store";
import { publishStagedWrites } from "@/lib/staged-writes/publish";
import { recordPublishHistory } from "@/lib/publish-history";
import { scrubSecrets, logServerError } from "@/lib/security/scrub-secrets";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken, getWriteToken } from "@/lib/token";

/**
 * Deferred-commit publish status / sync to GitHub.
 *
 * GET  /api/[owner]/[repo]/[branch]/publish — pending changes
 * POST /api/[owner]/[repo]/[branch]/publish — commit + push
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    if (!isFilesystemRepoRef(params.owner, params.repo)) {
      throw createHttpError("Publish is only available for deferred-commit repos.", 400);
    }

    await getToken(user, params.owner, params.repo, true);

    const status = isLocalRepoRef(params.owner, params.repo)
      ? await getGitStatus(params)
      : await getStagedStatus(params);
    return Response.json({
      status: "success",
      data: status,
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/publish GET");
    return toErrorResponse(error);
  }
}

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
      throw createHttpError("Publish is only available for deferred-commit repos.", 400);
    }

    const { token } = await getWriteToken(user, params.owner, params.repo);
    if (!token) {
      throw createHttpError("Token not found", 401);
    }

    let message: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.message === "string") message = body.message;
    } catch {
      // Empty body is fine.
    }

    const result = await publishStagedWrites(params, token, { message });

    if (!result.published && result.reason === "clean") {
      return Response.json({
        status: "success",
        message: "没有待提交的更改。",
        data: result,
      });
    }

    try {
      await recordPublishHistory({
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        commitSha: result.commitSha ?? null,
        message: result.commitMessage,
        files: (result.files || []).map((file) => ({
          path: file.path,
          status: file.status,
        })),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          githubUsername: user.githubUsername,
          image: user.image,
        },
      });
    } catch (error) {
      logServerError(error, "publish POST history");
    }

    return Response.json({
      status: "success",
      message:
        result.files.length > 0
          ? `已提交到 GitHub（${result.files.length} 个文件）。`
          : "已将更改推送到 GitHub。",
      data: result,
    });
  } catch (error: any) {
    logServerError(error?.stderr || error?.message || "Publish failed.", "publish POST");
    const detail = scrubSecrets(
      error?.stderr ||
      error?.message ||
      "Publish failed.",
    );
    return toErrorResponse(
      createHttpError(detail.trim().slice(0, 500), error?.status || 500),
    );
  }
}
