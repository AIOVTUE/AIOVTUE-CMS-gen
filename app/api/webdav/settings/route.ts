import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import {
  getWebdavSettingsPublic,
  upsertWebdavSettings,
} from "@/lib/webdav-settings/settings";
import { testWebdavConnection } from "@/lib/webdav-settings/client";
import { getWebdavSession } from "@/lib/webdav-settings/settings";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const settings = await getWebdavSettingsPublic(sessionResult.user.id);
    return Response.json({ status: "success", data: settings });
  } catch (error: unknown) {
    logServerError(error, "webdav/settings GET");
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const settings = await upsertWebdavSettings({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        githubUsername: user.githubUsername,
        image: user.image,
      },
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : "",
      username: typeof body.username === "string" ? body.username : "",
      passwordTouched: Boolean(body.passwordTouched),
      password: typeof body.password === "string" ? body.password : "",
    });

    return Response.json({ status: "success", data: settings });
  } catch (error: unknown) {
    logServerError(error, "webdav/settings PUT");
    return toErrorResponse(error);
  }
}

/** POST { action: "test" } — verify WebDAV credentials. */
export async function POST(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const body = await request.json().catch(() => null);
    const action =
      body && typeof body === "object" && typeof body.action === "string"
        ? body.action
        : "test";
    if (action !== "test") {
      throw createHttpError("无效的操作。", 400);
    }

    const session = await getWebdavSession(sessionResult.user.id);
    if (!session) {
      throw createHttpError("请先保存 WebDAV 地址、用户名与密码。", 400);
    }

    await testWebdavConnection(session);
    return Response.json({
      status: "success",
      data: { ok: true, message: "WebDAV 连接正常。" },
    });
  } catch (error: unknown) {
    logServerError(error, "webdav/settings POST");
    return toErrorResponse(error);
  }
}
