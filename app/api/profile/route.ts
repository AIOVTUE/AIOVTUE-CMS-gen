import { eq } from "drizzle-orm";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { logServerError } from "@/lib/security/scrub-secrets";

const assertImageUrl = (value: string | null) => {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https:\/\//i.test(trimmed)) {
    throw createHttpError("头像地址需为 https 链接", 400);
  }
  if (trimmed.length > 2048) {
    throw createHttpError("头像地址过长", 400);
  }
  return trimmed;
};

export async function PUT(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const name =
      typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      throw createHttpError("名称不能为空", 400);
    }
    if (name.length > 120) {
      throw createHttpError("名称过长", 400);
    }

    const image =
      body.image === null
        ? null
        : typeof body.image === "string"
          ? assertImageUrl(body.image)
          : undefined;

    await ensureDbUser({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      githubUsername: user.githubUsername,
      image: user.image,
    });

    const patch: Partial<typeof userTable.$inferInsert> = {
      name,
      updatedAt: new Date(),
    };
    if (image !== undefined) {
      patch.image = image;
    }

    await db
      .update(userTable)
      .set(patch)
      .where(eq(userTable.id, user.id));

    const row = await db.query.userTable.findFirst({
      where: eq(userTable.id, user.id),
    });

    return Response.json({
      status: "success",
      data: {
        id: row?.id ?? user.id,
        name: row?.name ?? name,
        email: row?.email ?? user.email,
        image: row?.image ?? null,
        githubUsername: row?.githubUsername ?? user.githubUsername ?? null,
      },
    });
  } catch (error: any) {
    logServerError(error, "profile PUT");
    return toErrorResponse(error);
  }
}
