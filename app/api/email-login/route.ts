import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { signInWithEmailPassword } from "@/lib/email-login/settings";
import { getRequestIpFromHeaders } from "@/lib/email-login/request-ip";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email.trim() || !password) {
      throw createHttpError("请输入邮箱和密码。", 400);
    }

    const ipAddress = getRequestIpFromHeaders(request.headers);
    const userAgent = request.headers.get("user-agent");

    await signInWithEmailPassword({
      email,
      password,
      ipAddress,
      userAgent,
    });

    return Response.json({ status: "success" });
  } catch (error: unknown) {
    // Never log request body / password material.
    const message =
      error instanceof Error ? error.message : "email login failed";
    logServerError(message, "email-login POST");
    return toErrorResponse(error);
  }
}
