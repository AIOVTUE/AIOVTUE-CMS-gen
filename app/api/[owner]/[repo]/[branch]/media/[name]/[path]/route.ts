import { getRepoReadContext } from "@/lib/api-repo-context";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import {
  assertNonEmptyPathRoot,
  isPathWithinRoot,
} from "@/lib/utils/path-scope";
import { isBlockedRepoPath } from "@/lib/utils/sensitive-path";
import { getMediaCache } from "@/lib/github-cache-file";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { logServerError } from "@/lib/security/scrub-secrets";

/**
 * Get the list of media files in a directory.
 *
 * GET /api/[owner]/[repo]/[branch]/media/[path]
 * 
 * Requires authentication.
 */

export async function GET(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string, name: string, path: string }> }
) {
  try {
    const params = await context.params;
    const { token, config } = await getRepoReadContext(params);
    
    const mediaConfig = config.object.media.find((item: any) => item.name === params.name) || config.object.media[0];

    if (!mediaConfig) {
      if (params.name) throw createHttpError(`No media configuration named "${params.name}" found for ${params.owner}/${params.repo}/${params.branch}.`, 404);
      throw createHttpError(`No media configuration found for ${params.owner}/${params.repo}/${params.branch}.`, 404);
    }

    const normalizedPath = normalizeMediaPath(
      params.path,
      params.owner,
      params.repo,
      params.branch,
    );
    if (isBlockedRepoPath(normalizedPath)) {
      throw createHttpError("Invalid path.", 400);
    }
    const mediaRoot = assertNonEmptyPathRoot(
      typeof mediaConfig.input === "string" ? mediaConfig.input : "",
      "media input",
    );
    if (!isPathWithinRoot(normalizedPath, mediaRoot)) {
      throw createHttpError(
        `Invalid path "${params.path}" for media "${params.name}".`,
        400,
      );
    }

    const allowedFolders: string[] | undefined = Array.isArray(mediaConfig.folders)
      ? mediaConfig.folders
      : undefined;
    if (!isMediaPathAllowed(mediaRoot, normalizedPath, allowedFolders)) {
      throw createHttpError(`Invalid path "${params.path}" for media "${params.name}".`, 400);
    }

    const { searchParams } = new URL(request.url);
    const nocache = searchParams.get('nocache');

    let results;
    try {
      results = await getMediaCache(params.owner, params.repo, params.branch, normalizedPath, token, !!nocache);
    } catch (error: any) {
      if (error?.status === 404) {
        results = [];
      } else {
        throw error;
      }
    }

    results = results.filter((item: any) => item.parentPath === normalizedPath);

    if (
      allowedFolders &&
      allowedFolders.length > 0 &&
      normalizedPath === mediaConfig.input
    ) {
      const allowed = new Set(allowedFolders);
      results = results.filter(
        (item: any) => item.type === "dir" && allowed.has(item.name),
      );
    }

    if (mediaConfig.extensions && mediaConfig.extensions.length > 0) {
      results = results.filter((item) => {
        if (item.type === "dir") return true;
        const extension = getFileExtension(item.name);
        return mediaConfig.extensions.includes(extension);
      });
    }

    results.sort((a: any, b: any) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      } else {
        return a.type === "dir" ? -1 : 1;
      }
    });

    return Response.json({
      status: "success",
      data: results.map((item: any) => {
        return {
          type: item.type,
          sha: item.sha,
          name: item.name,
          path: item.path,
          extension: item.type === "dir" ? undefined : getFileExtension(item.name),
          size: item.size,
          url: item.downloadUrl
        };
      }),
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/media/[name]/[path] GET");
    return toErrorResponse(error);
  }
}

const normalizeMediaPath = (
  rawPath: string,
  owner: string,
  repo: string,
  branch: string,
) => {
  let decodedPath = rawPath || "";
  try {
    if (decodedPath.includes("%")) {
      decodedPath = decodeURIComponent(decodedPath);
    }
  } catch {
    throw createHttpError("Invalid path encoding.", 400);
  }

  // Handle markdown-link wrappers: [label](target)
  const markdownMatch = decodedPath.match(/^\[.*?\]\((.+)\)$/);
  const markdownLooseMatch = decodedPath.match(/^\[.*?\]\((.+)$/);
  const candidate = (
    markdownMatch?.[1]
    || markdownLooseMatch?.[1]?.replace(/\)$/, "")
    || decodedPath
  ).trim();

  // If caller accidentally passes a raw.githubusercontent URL, map it back to repo-relative path.
  let repoRelativePath = candidate;
  if (candidate.startsWith("https://raw.githubusercontent.com/")) {
    try {
      const url = new URL(candidate);
      let pathname = url.pathname || "";
      try {
        if (pathname.includes("%")) pathname = decodeURIComponent(pathname);
      } catch {
        throw createHttpError("Invalid path encoding.", 400);
      }
      const branchPrefix = `/${owner}/${repo}/${branch}/`;
      if (pathname.startsWith(branchPrefix)) {
        repoRelativePath = pathname.slice(branchPrefix.length);
      }
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) throw error;
      repoRelativePath = candidate;
    }
  }

  repoRelativePath = repoRelativePath.split("#")[0]?.split("?")[0] || repoRelativePath;

  return normalizePath(repoRelativePath);
};

const isMediaPathAllowed = (
  root: string,
  path: string,
  folders?: string[],
) => {
  if (!folders || folders.length === 0) return true;
  const normalizedRoot = normalizePath(root);
  const normalizedPath = normalizePath(path);
  if (normalizedPath === normalizedRoot) return true;
  const prefix = normalizedRoot ? `${normalizedRoot}/` : "";
  return folders.some((folder) => {
    const allowedRoot = `${prefix}${folder}`;
    return (
      normalizedPath === allowedRoot ||
      normalizedPath.startsWith(`${allowedRoot}/`)
    );
  });
};
