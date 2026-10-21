import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { parse } from "@/lib/serialization";
import { requireApiUserSession } from "@/lib/session-server";
import { getByPath } from "@/lib/site-settings/paths";
import { logServerError } from "@/lib/security/scrub-secrets";
import { readDeferredFile } from "@/lib/staged-writes/read";
import { getToken } from "@/lib/token";

const SITE_CONFIG_PATH = "hugo.toml";

/**
 * Lightweight theme payload — primaryColor only (no full entry parse/registry).
 *
 * GET /api/[owner]/[repo]/[branch]/theme
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

    const { token } = await getToken(
      sessionResult.user,
      params.owner,
      params.repo,
    );
    if (!token) throw createHttpError("Token not found", 401);

    let content: string;
    try {
      const file = await readDeferredFile(
        {
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
        },
        SITE_CONFIG_PATH,
        { token },
      );
      content = file.content;
    } catch (error: any) {
      if (error?.status === 404) {
        return Response.json({
          status: "success",
          data: { primaryColor: null },
        });
      }
      throw error;
    }

    let primaryColor: string | null = null;
    try {
      const parsed = parse(content || "", { format: "toml" }) as Record<
        string,
        unknown
      >;
      const value = getByPath(parsed, "params.primaryColor");
      if (typeof value === "string" && value.trim()) {
        primaryColor = value.trim();
      }
    } catch {
      primaryColor = null;
    }

    return Response.json(
      {
        status: "success",
        data: { primaryColor },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  } catch (error: any) {
    logServerError(error, "theme GET");
    return toErrorResponse(error);
  }
}
