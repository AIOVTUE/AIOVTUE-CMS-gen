import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import {
  getWebanalysiSettingsPublic,
  upsertWebanalysiSettings,
} from "@/lib/webanalysi-settings/settings";
import { logServerError } from "@/lib/security/scrub-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const settings = await getWebanalysiSettingsPublic(sessionResult.user.id);
    return Response.json({ status: "success", data: settings });
  } catch (error: unknown) {
    logServerError(error, "webanalysi/settings GET");
    return toErrorResponse(error);
  }
}

async function saveSettings(request: Request) {
  const sessionResult = await requireApiUserSession();
  if ("response" in sessionResult) return sessionResult.response;
  const user = sessionResult.user;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw createHttpError("Invalid request body.", 400);
  }

  const apiUrl = typeof body.apiUrl === "string" ? body.apiUrl : "";
  const passwordTouched = "password" in body;
  const password =
    typeof body.password === "string" || body.password == null
      ? body.password
      : undefined;

  try {
    const settings = await upsertWebanalysiSettings({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        githubUsername: user.githubUsername,
        image: user.image,
      },
      apiUrl,
      password,
      passwordTouched,
    });
    return Response.json({ status: "success", data: settings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (message.includes("CRYPTO_KEY")) {
      throw createHttpError(
        "服务器未配置 CRYPTO_KEY，无法加密保存访问密码。请在 Vercel 环境变量中设置 CRYPTO_KEY 后重试。",
        500,
      );
    }
    throw error;
  }
}

/** Prefer POST — some CDNs / proxies mishandle PUT and return HTML pages. */
export async function POST(request: Request) {
  try {
    return await saveSettings(request);
  } catch (error: unknown) {
    logServerError(error, "webanalysi/settings POST");
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    return await saveSettings(request);
  } catch (error: unknown) {
    logServerError(error, "webanalysi/settings PUT");
    return toErrorResponse(error);
  }
}
