import { type NextRequest } from "next/server";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getRepoReadContext } from "@/lib/api-repo-context";
import {
  extensionToFriendLinksFormat,
  inferFriendLinksFromParsed,
  parseFriendLinksSource,
} from "@/lib/friend-links-map";
import { getCollectionCache } from "@/lib/github-cache-file";
import { isLocalRepoRef } from "@/lib/local-repo/config";
import { listRepoDirectory } from "@/lib/local-repo/fs";
import { logServerError } from "@/lib/security/scrub-secrets";
import { readDeferredFile } from "@/lib/staged-writes/read";
import { assertSafeRepoPath } from "@/lib/security/route-path";
import { isSensitiveRepoPath } from "@/lib/utils/sensitive-path";

/**
 * List files and folders at a repository path (for page template path picking).
 * GET /api/[owner]/[repo]/[branch]/browse?path=
 * With infer=friend-links: read a data file once and return inferred fieldMap.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const { token } = await getRepoReadContext(params);
    const rawPath = request.nextUrl.searchParams.get("path") ?? "";
    const path = rawPath ? assertSafeRepoPath(rawPath) : "";
    const infer = request.nextUrl.searchParams.get("infer");

    if (infer === "friend-links") {
      if (!path) throw createHttpError("Path is required for field inference.", 400);
      const file = await readDeferredFile(
        {
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
        },
        path,
        { token },
      );
      const { format } = extensionToFriendLinksFormat(path);
      try {
        const parsed = parseFriendLinksSource(file.content || "", format);
        const inferred = inferFriendLinksFromParsed(parsed);
        return Response.json({
          status: "success",
          data: {
            path,
            fieldMap: inferred.fieldMap,
            groupMap: inferred.groupMap,
            formatSamples: inferred.formatSamples,
            shape: inferred.shape,
          },
        });
      } catch {
        return Response.json({
          status: "success",
          data: {
            path,
            fieldMap: {},
            groupMap: {},
            formatSamples: { group: "", link: "" },
            shape: "linkGroups",
          },
        });
      }
    }

    // Local disk: metadata-only listing (skip reading every file body).
    const listed = isLocalRepoRef(params.owner, params.repo)
      ? await listRepoDirectory(path, {
          owner: params.owner,
          repo: params.repo,
        })
      : (
          await getCollectionCache(
            params.owner,
            params.repo,
            params.branch,
            path,
            token,
          )
        )
          .filter((item) => item.parentPath === path)
          .map((item) => ({
            name: item.name,
            path: item.path,
            type: (item.type === "dir" ? "dir" : "file") as "dir" | "file",
          }));

    const data = listed
      .filter((item) => !isSensitiveRepoPath(item.path))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-CN");
      });

    return Response.json({ status: "success", data: { path, entries: data } });
  } catch (error: unknown) {
    logServerError(error, "[owner]/[repo]/[branch]/browse GET");
    return toErrorResponse(error);
  }
}
