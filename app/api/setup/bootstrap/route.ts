import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { bootstrapAdminAccount } from "@/lib/setup/bootstrap-admin";
import { logServerError } from "@/lib/security/scrub-secrets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("无效的请求体。", 400);
    }

    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    // Never trust Origin alone — attacker-controlled Origin can poison auth baseURL.
    const baseUrlRaw =
      typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";

    if (!email.trim() || !password) {
      throw createHttpError("请填写邮箱和密码。", 400);
    }
    if (!baseUrlRaw) {
      throw createHttpError("请填写站点 URL。", 400);
    }

    const data = await bootstrapAdminAccount({
      email,
      password,
      baseUrl: baseUrlRaw,
    });

    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "setup bootstrap POST");
    return toErrorResponse(error);
  }
}
