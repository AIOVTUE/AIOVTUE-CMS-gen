import { createOctokitInstance } from "@/lib/utils/octokit";
import { getToken, getWriteToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { assertSafeGitRefName } from "@/lib/security/git-ref";
import { logServerError } from "@/lib/security/scrub-secrets";
import { isLocalRepoRef, getLocalRepoRef } from "@/lib/local-repo/config";
import { getRepoSnapshot } from "@/lib/github-cache-file";

/**
 * List repository branches (full list for branch switcher hydration).
 *
 * GET /api/[owner]/[repo]/[branch]/branches
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{ owner: string; repo: string; branch: string }>;
  },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    if (isLocalRepoRef(params.owner, params.repo)) {
      const { branch } = getLocalRepoRef();
      return Response.json({
        status: "success",
        data: {
          defaultBranch: branch,
          branches: [branch],
        },
      });
    }

    const { token } = await getToken(
      sessionResult.user,
      params.owner,
      params.repo,
    );
    if (!token) throw createHttpError("Token not found", 401);

    const snapshot = await getRepoSnapshot(params.owner, params.repo, token, {
      branchList: "full",
    });

    return Response.json(
      {
        status: "success",
        data: {
          defaultBranch: snapshot.defaultBranch,
          branches: snapshot.branches ?? [],
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/branches GET");
    return toErrorResponse(error);
  }
}

/**
 * Creates a new branch in a GitHub repository.
 *
 * POST /api/[owner]/[repo]/[branch]/branches
 */
export async function POST(
  request: Request,
  context: {
    params: Promise<{ owner: string; repo: string; branch: string }>;
  },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getWriteToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const data: any = await request.json();
    if (!data.name) throw createHttpError(`"name" is required.`, 400);

    const baseBranch = assertSafeGitRefName(params.branch, "branch");
    const newBranch = assertSafeGitRefName(String(data.name), "name");

    const octokit = createOctokitInstance(token);

    const { data: refData } = await octokit.rest.git.getRef({
      owner: params.owner,
      repo: params.repo,
      ref: `heads/${baseBranch}`,
    });
    const sha = refData.object.sha;

    const response = await octokit.rest.git.createRef({
      owner: params.owner,
      repo: params.repo,
      ref: `refs/heads/${newBranch}`,
      sha,
    });

    return Response.json({
      status: "success",
      message: `Branch "${newBranch}" created successfully from "${baseBranch}".`,
      data: response.data,
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/branches POST");
    return toErrorResponse(error);
  }
}
