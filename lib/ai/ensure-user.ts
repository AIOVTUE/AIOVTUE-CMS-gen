import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userTable } from "@/db/schema";

type EnsureUserInput = {
  id: string;
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  githubUsername?: string | null;
  image?: string | null;
};

const schemaHint =
  "数据库用户表未就绪或结构过旧。请确认已设置 DATABASE_URL，并执行 npm run db:migrate（Vercel 需能连库；勿设 SKIP_DB_MIGRATE=1）。";

const isMissingRelationOrColumn = (error: unknown) => {
  const text = [
    error instanceof Error ? error.message : String(error ?? ""),
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    text.includes("does not exist") ||
    text.includes("undefined_table") ||
    text.includes("undefined_column") ||
    text.includes('relation "user"')
  );
};

/**
 * Ensure a user row exists before inserting FK-dependent rows.
 * Needed for local-dev bypass users and setup bootstrap.
 */
const ensureDbUser = async (user: EnsureUserInput) => {
  const email = user.email?.trim() || `${user.id}@local.pagescms`;
  const name = user.name?.trim() || email;

  try {
    const byId = await db.query.userTable.findFirst({
      where: eq(userTable.id, user.id),
    });
    if (byId) return byId;

    const byEmail = await db.query.userTable.findFirst({
      where: sql`lower(${userTable.email}) = lower(${email})`,
    });
    if (byEmail) return byEmail;

    await db
      .insert(userTable)
      .values({
        id: user.id,
        name,
        email,
        emailVerified: Boolean(user.emailVerified),
        githubUsername: user.githubUsername?.trim() || null,
        image: user.image?.trim() || null,
      })
      .onConflictDoNothing({ target: userTable.id });

    const created = await db.query.userTable.findFirst({
      where: eq(userTable.id, user.id),
    });
    if (created) return created;

    // Race: another request inserted the same email with a different id.
    const again = await db.query.userTable.findFirst({
      where: sql`lower(${userTable.email}) = lower(${email})`,
    });
    if (again) return again;

    throw Object.assign(new Error("创建用户失败，请重试。"), { status: 500 });
  } catch (error) {
    if (isMissingRelationOrColumn(error)) {
      throw Object.assign(new Error(schemaHint), {
        status: 503,
        cause: error,
      });
    }
    throw error;
  }
};

export { ensureDbUser };
