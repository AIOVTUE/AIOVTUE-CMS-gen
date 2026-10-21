import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cacheFileTable, cachePermissionTable, configTable } from "@/db/schema";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import {
  clearFileCache,
  ensureFileCacheFreshness,
} from "@/lib/github-cache-file";
import { logServerError } from "@/lib/security/scrub-secrets";
import { clearPermissionCache } from "@/lib/github-cache-permissions";
import { deleteCacheFileMeta, getCacheFileMeta, listCacheFileMeta, upsertCacheFileMeta } from "@/lib/github-cache-meta";
import { getConfig, touchConfigCheck } from "@/lib/config-store";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { isCacheEnabled } from "@/lib/config-flags";
import { getBranchHeadSha } from "@/lib/github-cache-file";
import { requireApiUserSession } from "@/lib/session-server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const { token } = await requireGithubRepoWriteAccess(
      sessionResult.user,
      params.owner,
      params.repo,
      "Only GitHub users can view cache status.",
    );

    const config = await getConfig(
      params.owner,
      params.repo,
      params.branch,
      {
        sync: true,
        getToken: async () => token,
        backgroundRefreshWhenStale: true,
      },
    );
    if (!config?.object || !isCacheEnabled(config.object)) {
      throw createHttpError("Cache is disabled for this repository.", 403);
    }

    // Keep DB access mostly sequential to avoid spiking pool usage on the cache dashboard.
    const meta = await getCacheFileMeta(params.owner, params.repo, params.branch);
    const metaEntries = await listCacheFileMeta(params.owner, params.repo, params.branch);
    const folderMeta = metaEntries.filter((entry) => entry.context !== "branch");
    const fileCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(cacheFileTable)
      .where(
        and(
          eq(cacheFileTable.owner, params.owner.toLowerCase()),
          eq(cacheFileTable.repo, params.repo.toLowerCase()),
          eq(cacheFileTable.branch, params.branch),
        ),
      );
    const permissionCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(cachePermissionTable)
      .where(
        and(
          eq(cachePermissionTable.owner, params.owner.toLowerCase()),
          eq(cachePermissionTable.repo, params.repo.toLowerCase()),
        ),
      );
    const cachedConfig = await db.query.configTable.findFirst({
      where: and(
        sql`lower(${configTable.owner}) = lower(${params.owner})`,
        sql`lower(${configTable.repo}) = lower(${params.repo})`,
        eq(configTable.branch, params.branch),
      ),
    });
    const branchHeadSha = await getBranchHeadSha(params.owner, params.repo, params.branch, token);

    return Response.json({
      status: "success",
      data: {
        fileMeta: meta ?? null,
        folderMeta,
        fileCount: Number(fileCountResult[0]?.count || 0),
        permissionCount: Number(permissionCountResult[0]?.count || 0),
        config: cachedConfig
          ? {
              sha: cachedConfig.sha,
              lastCheckedAt: cachedConfig.lastCheckedAt,
              version: cachedConfig.version,
            }
          : null,
        branchHeadSha,
      },
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/cache GET");
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const body = (await request.json()) as { action?: string };
    const action = body?.action || "";

    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const { token } = await requireGithubRepoWriteAccess(
      sessionResult.user,
      params.owner,
      params.repo,
      "Only GitHub users can manage cache.",
    );

    const config = await getConfig(
      params.owner,
      params.repo,
      params.branch,
      {
        sync: true,
        getToken: async () => token,
        backgroundRefreshWhenStale: true,
      },
    );
    if (!config?.object || !isCacheEnabled(config.object)) {
      throw createHttpError("Cache is disabled for this repository.", 403);
    }

    switch (action) {
      case "reconcile-file-cache":
        await ensureFileCacheFreshness(params.owner, params.repo, params.branch, token, {
          force: true,
        });
        return Response.json({
          status: "success",
          message: "File cache reconciled.",
        });
      case "clear-file-cache":
        await clearFileCache(params.owner, params.repo, params.branch);
        await deleteCacheFileMeta(params.owner, params.repo, params.branch);
        await upsertCacheFileMeta(params.owner, params.repo, params.branch, {
          commitSha: null,
          status: "ok",
          error: null,
        });
        return Response.json({
          status: "success",
          message: "File cache cleared.",
        });
      case "clear-permission-cache":
        await clearPermissionCache(params.owner, params.repo);
        return Response.json({
          status: "success",
          message: "Permission cache cleared.",
        });
      case "refresh-config": {
        // CMS config is DB-backed (builtin + overlays); re-merge and bump lastCheckedAt.
        const refreshed = await getConfig(
          params.owner,
          params.repo,
          params.branch,
          {
            sync: true,
            getToken: async () => token,
            ttlMs: 0,
          },
        );
        if (refreshed) {
          await touchConfigCheck(params.owner, params.repo, params.branch);
        }
        return Response.json({
          status: "success",
          message: "Config cache refreshed.",
        });
      }
      case "clear-config-cache":
        // Do not delete configTable: it now stores CMS overlays (menus/settings),
        // not a disposable cache of Hugo `.pages.yml`.
        await touchConfigCheck(params.owner, params.repo, params.branch);
        return Response.json({
          status: "success",
          message: "Config cache cleared.",
        });
      case "clear-all-cache":
        await clearFileCache(params.owner, params.repo, params.branch);
        await deleteCacheFileMeta(params.owner, params.repo, params.branch);
        await upsertCacheFileMeta(params.owner, params.repo, params.branch, {
          commitSha: null,
          status: "ok",
          error: null,
        });
        await clearPermissionCache(params.owner, params.repo);
        return Response.json({
          status: "success",
          message: "All cache cleared.",
        });
      default:
        throw createHttpError(`Invalid action "${action}".`, 400);
    }
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/cache POST");
    return toErrorResponse(error);
  }
}
