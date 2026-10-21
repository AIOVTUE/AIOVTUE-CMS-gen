import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { getCommentCredentials } from "@/lib/comment-settings/settings";
import { fetchRecentComments } from "@/lib/comment-settings/recent";
import { fetchTwikooAdminComments } from "@/lib/comment-settings/twikoo";
import type { CommentListPayload } from "@/lib/comment-settings/types";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const creds = await getCommentCredentials(sessionResult.user.id);
    if (!creds) {
      const empty: CommentListPayload = {
        configured: false,
        provider: "",
        comments: [],
      };
      return Response.json({ status: "success", data: empty });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
    const per = Math.min(
      Math.max(Number(searchParams.get("per") || "20") || 20, 1),
      50,
    );
    const keyword = (searchParams.get("keyword") || "").trim();
    const typeRaw = (searchParams.get("type") || "").trim().toUpperCase();
    const type =
      typeRaw === "VISIBLE" || typeRaw === "HIDDEN"
        ? typeRaw
        : ("" as const);

    if (creds.provider === "twikoo" && creds.password) {
      try {
        const result = await fetchTwikooAdminComments({
          serverUrl: creds.serverUrl,
          password: creds.password,
          page,
          per,
          keyword: keyword || undefined,
          type: type || undefined,
        });
        const data: CommentListPayload = {
          configured: true,
          provider: "twikoo",
          comments: result.comments,
          total: result.total,
          page,
          per,
          source: "admin",
        };
        return Response.json({ status: "success", data });
      } catch (error) {
        // Fall through to public recent list when admin auth fails.
        logServerError(error, "comment/list admin");
      }
    }

    if (creds.provider === "twikoo" || creds.provider === "waline") {
      const comments = await fetchRecentComments({
        provider: creds.provider,
        serverUrl: creds.serverUrl,
        limit: per,
      });
      const data: CommentListPayload = {
        configured: true,
        provider: creds.provider,
        comments,
        total: comments.length,
        page: 1,
        per,
        source: "recent",
      };
      return Response.json({ status: "success", data });
    }

    throw createHttpError("未配置支持的评论系统。", 400);
  } catch (error: unknown) {
    logServerError(error, "comment/list");
    return toErrorResponse(error);
  }
}
