import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin";
import {
  getLoginBackgroundPublic,
  upsertLoginBackground,
} from "@/lib/login-background/settings";
import { logServerError } from "@/lib/security/scrub-secrets";

/** Public: used by sign-in page without authentication. */
export async function GET() {
  try {
    const data = await getLoginBackgroundPublic();
    return Response.json({ status: "success", data });
  } catch (error: any) {
    logServerError(error, "login-background GET");
    return toErrorResponse(error);
  }
}

/** Admin only: update image-host URLs (empty string restores local default). */
export async function PUT(request: Request) {
  try {
    await requireAdminSession();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const desktopUrl =
      typeof body.desktopUrl === "string" ? body.desktopUrl : undefined;
    const mobileUrl =
      typeof body.mobileUrl === "string" ? body.mobileUrl : undefined;

    if (desktopUrl === undefined && mobileUrl === undefined) {
      throw createHttpError("请至少提供一个背景字段。", 400);
    }

    const data = await upsertLoginBackground({ desktopUrl, mobileUrl });
    return Response.json({ status: "success", data });
  } catch (error: any) {
    logServerError(error, "login-background PUT");
    return toErrorResponse(error);
  }
}
