import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getSchemaByName } from "@/lib/schema";
import { getConfig } from "@/lib/config-store";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { isPathWithinRoot } from "@/lib/utils/path-scope";
import { decodeAndNormalizeRepoPath } from "@/lib/security/route-path";
import { assertGithubIdentity } from "@/lib/authz-shared";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { isFilesystemRepoRef } from "@/lib/local-repo/config";
import { getFileGitHistory } from "@/lib/local-repo/git";
import { logServerError } from "@/lib/security/scrub-secrets";

/**
 * Fetches the history of a file from GitHub repositories.
 * 
 * GET /api/[owner]/[repo]/[branch]/entries/[path]/history
 * 
 * Requires authentication.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name") || "";
    
    const normalizedPath = decodeAndNormalizeRepoPath(params.path);
    if (normalizedPath === ".pages.yml") {
      assertGithubIdentity(user, "Only GitHub users can access settings history.");
    }
    
    if (name) {
      const config = await getConfig(params.owner, params.repo, params.branch, {
        getToken: async () => token,
      });
      if (!config) throw createHttpError(`Config not found for ${params.owner}/${params.repo}/${params.branch}.`, 404);
      
      const schema = getSchemaByName(config.object, name);
      if (!schema) throw createHttpError(`Schema not found for ${name}.`, 404);

      if (!isPathWithinRoot(normalizedPath, schema.path)) throw createHttpError(`Invalid path "${params.path}" for ${schema.type} "${name}".`, 400);

      const requiredExtension =
        typeof schema.extension === "string" ? schema.extension : "";
      if (
        requiredExtension !== "" &&
        getFileExtension(normalizedPath) !== requiredExtension
      ) {
        throw createHttpError(`Invalid extension "${getFileExtension(normalizedPath)}" for ${schema.type} "${name}".`, 400);
      }
    } else if (normalizedPath !== ".pages.yml") {
      throw createHttpError("If no content entry name is provided, the path must be \".pages.yml\".", 400);
    }

    // CMS config is DB-backed; there is no git history for `.pages.yml`.
    if (!name && normalizedPath === ".pages.yml") {
      return Response.json({
        status: "success",
        data: [],
      });
    }

    if (isFilesystemRepoRef(params.owner, params.repo)) {
      const history = await getFileGitHistory(
        { owner: params.owner, repo: params.repo, branch: params.branch },
        normalizedPath,
      );
      return Response.json({
        status: "success",
        data: history,
      });
    }
    
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.listCommits({
      owner: params.owner,
      repo: params.repo,
      path: decodeURIComponent(normalizedPath),
      sha: params.branch,
    });

    return Response.json({
      status: "success",
      data: response.data
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/entries/[path]/history GET");
    return toErrorResponse(error);
  }
}
