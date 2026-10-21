import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getConfig } from "@/lib/config-store";
import { isFilesystemRepoRef } from "@/lib/local-repo/config";
import { readDeferredFile } from "@/lib/staged-writes/read";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import { normalizePath } from "@/lib/utils/file";
import { isPathWithinRoot } from "@/lib/utils/path-scope";
import { decodeAndNormalizeRepoPath } from "@/lib/security/route-path";
import { logServerError } from "@/lib/security/scrub-secrets";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

const ALLOWED_RAW_EXTENSIONS = new Set(Object.keys(CONTENT_TYPES));

/**
 * Serve deferred-commit file bytes for media preview.
 * Paths must sit under a configured media root and use an allowlisted extension.
 *
 * GET /api/[owner]/[repo]/[branch]/raw/[path]
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{ owner: string; repo: string; branch: string; path: string }>;
  },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    if (!isFilesystemRepoRef(params.owner, params.repo)) {
      throw createHttpError(
        "Raw file serving is only available for deferred-commit repos.",
        400,
      );
    }

    const { token } = await getToken(
      sessionResult.user,
      params.owner,
      params.repo,
      true,
    );
    const normalizedPath = decodeAndNormalizeRepoPath(params.path);

    const extension = path.extname(normalizedPath).toLowerCase();
    if (!ALLOWED_RAW_EXTENSIONS.has(extension)) {
      throw createHttpError("File type not allowed for raw preview.", 400);
    }

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
      persist: false,
    });
    const mediaRoots = Array.isArray(config?.object?.media)
      ? config.object.media
          .map((item: { input?: unknown }) =>
            typeof item?.input === "string" ? normalizePath(item.input) : "",
          )
          .filter(Boolean)
      : [];

    if (mediaRoots.length === 0) {
      throw createHttpError("Media is not configured for this repository.", 400);
    }

    const withinMedia = mediaRoots.some((root: string) =>
      isPathWithinRoot(normalizedPath, root),
    );
    if (!withinMedia) {
      throw createHttpError("Path is outside configured media directories.", 403);
    }

    const file = await readDeferredFile(
      {
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
      },
      normalizedPath,
      { token: token ?? undefined },
    );
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    };
    // SVG can carry scripts — force download instead of inline render.
    if (extension === ".svg") {
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Disposition"] =
        `attachment; filename="${path.basename(normalizedPath).replace(/"/g, "")}"`;
    }

    return new Response(new Uint8Array(file.buffer), { headers });
  } catch (error: any) {
    if (error?.status === 404) {
      return toErrorResponse(createHttpError("Not found", 404));
    }
    logServerError(error, "raw/[path] GET");
    return toErrorResponse(error);
  }
}
