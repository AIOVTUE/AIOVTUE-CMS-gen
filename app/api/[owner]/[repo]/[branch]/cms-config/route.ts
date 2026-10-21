import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken, getWriteToken } from "@/lib/token";
import { assertGithubIdentity } from "@/lib/authz-shared";
import {
  getConfig,
  getConfigFromDb,
  persistCmsConfigObject,
  withCmsConfigLock,
} from "@/lib/config-store";
import { cloneConfig } from "@/lib/site-settings/paths";
import { mergeMenusConfig } from "@/lib/menu-settings/defaults";
import { isLocalRepoRef } from "@/lib/local-repo/config";
import { safeAssign } from "@/lib/security/safe-merge";
import { logServerError } from "@/lib/security/scrub-secrets";

/**
 * CMS config (builtin schema + DB overlays). Not the Hugo `.pages.yml` file.
 *
 * GET  /api/[owner]/[repo]/[branch]/cms-config
 * PUT  /api/[owner]/[repo]/[branch]/cms-config  body: { menus?, settings?, content?, media?, pagesManaged?, baseSha?, object? }
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

    const config = await getConfig(params.owner, params.repo, params.branch);
    if (!config) throw createHttpError("Config not found.", 404);

    return Response.json({ status: "success", data: { config } });
  } catch (error: unknown) {
    logServerError(error, "[owner]/[repo]/[branch]/cms-config GET");
    return toErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    if (!isLocalRepoRef(params.owner, params.repo)) {
      assertGithubIdentity(
        sessionResult.user,
        "Only GitHub users can manage CMS configuration.",
      );
    }

    await getWriteToken(sessionResult.user, params.owner, params.repo);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    // Bootstrap outside the write lock — getConfig may itself take the lock to persist.
    let bootstrapped = await getConfigFromDb(
      params.owner,
      params.repo,
      params.branch,
    );
    if (!bootstrapped) {
      bootstrapped = await getConfig(params.owner, params.repo, params.branch);
    }
    if (!bootstrapped) throw createHttpError("Config not found.", 404);

    const config = await withCmsConfigLock(
      params.owner,
      params.repo,
      params.branch,
      async () => {
        // Re-read inside the lock so partial updates (menus-only) merge onto latest.
        const current =
          (await getConfigFromDb(params.owner, params.repo, params.branch)) ??
          bootstrapped;
        if (!current) throw createHttpError("Config not found.", 404);

        const baseSha =
          typeof body.baseSha === "string" ? body.baseSha.trim() : "";
        if (baseSha && current.sha && baseSha !== current.sha) {
          throw createHttpError(
            "配置已被其他操作更新，请重试。",
            409,
          );
        }

        const nextObject = cloneConfig(current.object as Record<string, any>);

        if (body.object && typeof body.object === "object") {
          if (body.object.menus) {
            nextObject.menus = mergeMenusConfig(body.object.menus);
          }
          if (body.object.settings && typeof body.object.settings === "object") {
            nextObject.settings = safeAssign(
              { ...(nextObject.settings ?? {}) },
              body.object.settings as Record<string, unknown>,
            );
          }
          if (Array.isArray(body.object.content)) {
            nextObject.content = body.object.content;
            nextObject.settings = {
              ...(nextObject.settings ?? {}),
              pagesManaged: true,
              templatesConfigured: true,
            };
          }
          if (Array.isArray(body.object.media)) {
            nextObject.media = body.object.media;
            nextObject.settings = {
              ...(nextObject.settings ?? {}),
              mediaManaged: true,
            };
          }
        }

        if (body.menus) {
          nextObject.menus = mergeMenusConfig(body.menus);
        }
        if (body.settings && typeof body.settings === "object") {
          nextObject.settings = safeAssign(
            { ...(nextObject.settings ?? {}) },
            body.settings as Record<string, unknown>,
          );
        }
        if (Array.isArray(body.content)) {
          nextObject.content = body.content;
          nextObject.settings = {
            ...(nextObject.settings ?? {}),
            pagesManaged: true,
            templatesConfigured: true,
          };
        }
        if (Array.isArray(body.media)) {
          nextObject.media = body.media;
          nextObject.settings = {
            ...(nextObject.settings ?? {}),
            mediaManaged: true,
          };
        }
        if (body.pagesManaged === false) {
          nextObject.settings = {
            ...(nextObject.settings ?? {}),
            pagesManaged: false,
            templatesConfigured: false,
          };
          delete nextObject.content;
        }
        if (body.mediaManaged === false) {
          nextObject.settings = {
            ...(nextObject.settings ?? {}),
            mediaManaged: false,
          };
          delete nextObject.media;
        }

        return persistCmsConfigObject(
          params.owner,
          params.repo,
          params.branch,
          nextObject,
        );
      },
    );

    return Response.json({ status: "success", data: { config } });
  } catch (error: unknown) {
    logServerError(error, "[owner]/[repo]/[branch]/cms-config PUT");
    return toErrorResponse(error);
  }
}
