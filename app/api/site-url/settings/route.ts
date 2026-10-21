import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import {
  getSiteUrlSettingsPublic,
  upsertSiteUrlSettings,
} from "@/lib/site-url/settings";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const settings = await getSiteUrlSettingsPublic(sessionResult.user.id);
    return Response.json({ status: "success", data: settings });
  } catch (error: any) {
    logServerError(error, "site-url/settings GET");
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

    const siteUrl = typeof body.siteUrl === "string" ? body.siteUrl : "";
    const iconUrl = typeof body.iconUrl === "string" ? body.iconUrl : "";

    const settings = await upsertSiteUrlSettings({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        githubUsername: user.githubUsername,
        image: user.image,
      },
      siteUrl,
      iconUrl,
    });

    return Response.json({ status: "success", data: settings });
  } catch (error: any) {
    logServerError(error, "site-url/settings PUT");
    return toErrorResponse(error);
  }
}
