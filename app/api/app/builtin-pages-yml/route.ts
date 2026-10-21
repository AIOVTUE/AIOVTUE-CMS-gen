import { readBuiltinPagesYml } from "@/lib/builtin-config";
import { toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { logServerError } from "@/lib/security/scrub-secrets";

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const body = readBuiltinPagesYml();
    return Response.json({
      status: "success",
      data: { body },
    });
  } catch (error: unknown) {
    logServerError(error, "app/builtin-pages-yml GET");
    return toErrorResponse(error);
  }
}
