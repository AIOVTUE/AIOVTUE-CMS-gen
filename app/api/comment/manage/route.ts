import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { getCommentCredentials } from "@/lib/comment-settings/settings";
import {
  deleteTwikooAdminComment,
  setTwikooAdminComment,
} from "@/lib/comment-settings/twikoo";
import { logServerError } from "@/lib/security/scrub-secrets";

type ManageAction = "hide" | "show" | "delete";

const ACTIONS = new Set<ManageAction>(["hide", "show", "delete"]);

export async function POST(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const creds = await getCommentCredentials(sessionResult.user.id);
    if (!creds?.provider || !creds.serverUrl) {
      throw createHttpError("请先在设置中配置评论系统。", 400);
    }
    if (creds.provider !== "twikoo") {
      throw createHttpError("当前仅支持在 CMS 中管理 Twikoo 评论。", 400);
    }
    if (!creds.password) {
      throw createHttpError("请先在设置中填写 Twikoo 管理密码。", 400);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!ACTIONS.has(action as ManageAction)) {
      throw createHttpError("无效的操作。", 400);
    }

    const id =
      typeof body.id === "string"
        ? body.id
        : typeof body.commentId === "string"
          ? body.commentId
          : "";

    if (action === "delete") {
      await deleteTwikooAdminComment({
        serverUrl: creds.serverUrl,
        password: creds.password,
        id,
      });
    } else {
      await setTwikooAdminComment({
        serverUrl: creds.serverUrl,
        password: creds.password,
        id,
        set: { isSpam: action === "hide" },
      });
    }

    return Response.json({
      status: "success",
      data: { action, id: id.trim() },
    });
  } catch (error: unknown) {
    logServerError(error, "comment/manage POST");
    return toErrorResponse(error);
  }
}
