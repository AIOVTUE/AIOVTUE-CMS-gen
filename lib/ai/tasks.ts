import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { aiSummaryTaskTable } from "@/db/schema";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import type { AiSummaryTask, AiSummaryTaskStatus } from "@/lib/ai/types";
import { scrubSecrets } from "@/lib/security/scrub-secrets";

export type { AiSummaryTask, AiSummaryTaskStatus };

const toTask = (row: typeof aiSummaryTaskTable.$inferSelect): AiSummaryTask => ({
  id: row.id,
  userId: row.userId,
  owner: row.owner,
  repo: row.repo,
  branch: row.branch,
  path: row.path,
  title: row.title,
  collectionName: row.collectionName,
  status: row.status as AiSummaryTaskStatus,
  summary: row.summary,
  error: row.error,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
});

const listAiSummaryTasks = async (options: {
  userId: string;
  owner: string;
  repo: string;
  branch: string;
  limit?: number;
}) => {
  const rows = await db.query.aiSummaryTaskTable.findMany({
    where: and(
      eq(aiSummaryTaskTable.userId, options.userId),
      eq(aiSummaryTaskTable.owner, options.owner.toLowerCase()),
      eq(aiSummaryTaskTable.repo, options.repo.toLowerCase()),
      eq(aiSummaryTaskTable.branch, options.branch),
    ),
    orderBy: [desc(aiSummaryTaskTable.createdAt)],
    limit: options.limit ?? 100,
  });
  return rows.map(toTask);
};

const createAiSummaryTask = async (options: {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  owner: string;
  repo: string;
  branch: string;
  path: string;
  title?: string | null;
  collectionName?: string | null;
  status?: AiSummaryTaskStatus;
}) => {
  await ensureDbUser(options.user);
  const [row] = await db
    .insert(aiSummaryTaskTable)
    .values({
      userId: options.user.id,
      owner: options.owner.toLowerCase(),
      repo: options.repo.toLowerCase(),
      branch: options.branch,
      path: options.path,
      title: options.title ?? null,
      collectionName: options.collectionName ?? null,
      status: options.status ?? "pending",
    })
    .returning();
  return toTask(row);
};

const updateAiSummaryTask = async (
  id: number,
  userId: string,
  patch: {
    status?: AiSummaryTaskStatus;
    summary?: string | null;
    error?: string | null;
    title?: string | null;
    completedAt?: Date | null;
  },
) => {
  const next: Partial<typeof aiSummaryTaskTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.status) next.status = patch.status;
  if ("summary" in patch) next.summary = patch.summary ?? null;
  if ("error" in patch) {
    next.error =
      patch.error == null ? null : scrubSecrets(String(patch.error)).slice(0, 2000);
  }
  if ("title" in patch) next.title = patch.title ?? null;
  if ("completedAt" in patch) next.completedAt = patch.completedAt ?? null;

  const [row] = await db
    .update(aiSummaryTaskTable)
    .set(next)
    .where(and(eq(aiSummaryTaskTable.id, id), eq(aiSummaryTaskTable.userId, userId)))
    .returning();

  return row ? toTask(row) : null;
};

const clearAiSummaryTasks = async (options: {
  userId: string;
  owner: string;
  repo: string;
  branch: string;
  /** When true, also remove in-flight tasks. Default keeps running tasks. */
  includeRunning?: boolean;
}) => {
  const conditions = [
    eq(aiSummaryTaskTable.userId, options.userId),
    eq(aiSummaryTaskTable.owner, options.owner.toLowerCase()),
    eq(aiSummaryTaskTable.repo, options.repo.toLowerCase()),
    eq(aiSummaryTaskTable.branch, options.branch),
  ];

  if (!options.includeRunning) {
    conditions.push(ne(aiSummaryTaskTable.status, "running"));
  }

  const deleted = await db
    .delete(aiSummaryTaskTable)
    .where(and(...conditions))
    .returning({ id: aiSummaryTaskTable.id });

  return deleted.length;
};

const getAiSummaryTask = async (id: number, userId: string) => {
  const row = await db.query.aiSummaryTaskTable.findFirst({
    where: and(eq(aiSummaryTaskTable.id, id), eq(aiSummaryTaskTable.userId, userId)),
  });
  return row ? toTask(row) : null;
};

export {
  listAiSummaryTasks,
  createAiSummaryTask,
  updateAiSummaryTask,
  clearAiSummaryTasks,
  getAiSummaryTask,
};
