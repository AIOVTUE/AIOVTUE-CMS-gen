import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { publishHistoryTable } from "@/db/schema";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import type {
  PublishHistoryFile,
  PublishHistoryItem,
} from "@/types/publish-history";

const PUBLISH_HISTORY_LIMIT = 15;

const toItem = (row: typeof publishHistoryTable.$inferSelect): PublishHistoryItem => ({
  id: row.id,
  owner: row.owner,
  repo: row.repo,
  branch: row.branch,
  commitSha: row.commitSha,
  message: row.message,
  fileCount: row.fileCount,
  files: Array.isArray(row.files) ? row.files : [],
  triggeredByUserId: row.triggeredByUserId,
  triggeredByName: row.triggeredByName,
  triggeredByEmail: row.triggeredByEmail,
  triggeredByGithubUsername: row.triggeredByGithubUsername,
  createdAt: row.createdAt.toISOString(),
});

const repoScope = (owner: string, repo: string, branch: string) =>
  and(
    sql`lower(${publishHistoryTable.owner}) = lower(${owner})`,
    sql`lower(${publishHistoryTable.repo}) = lower(${repo})`,
    eq(publishHistoryTable.branch, branch),
  );

const trimPublishHistory = async (owner: string, repo: string, branch: string) => {
  const rows = await db
    .select({ id: publishHistoryTable.id })
    .from(publishHistoryTable)
    .where(repoScope(owner, repo, branch))
    .orderBy(desc(publishHistoryTable.createdAt), desc(publishHistoryTable.id));

  const overflowIds = rows.slice(PUBLISH_HISTORY_LIMIT).map((row) => row.id);
  if (overflowIds.length === 0) return 0;

  const deleted = await db
    .delete(publishHistoryTable)
    .where(inArray(publishHistoryTable.id, overflowIds))
    .returning({ id: publishHistoryTable.id });

  return deleted.length;
};

const recordPublishHistory = async (input: {
  owner: string;
  repo: string;
  branch: string;
  commitSha?: string | null;
  message?: string | null;
  files: PublishHistoryFile[];
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  } | null;
}) => {
  if (input.user?.id) {
    await ensureDbUser({
      id: input.user.id,
      name: input.user.name,
      email: input.user.email,
      emailVerified: input.user.emailVerified,
      githubUsername: input.user.githubUsername,
      image: input.user.image,
    });
  }

  const [row] = await db
    .insert(publishHistoryTable)
    .values({
      owner: input.owner.toLowerCase(),
      repo: input.repo.toLowerCase(),
      branch: input.branch,
      commitSha: input.commitSha ?? null,
      message: input.message ?? null,
      fileCount: input.files.length,
      files: input.files,
      triggeredByUserId: input.user?.id ?? null,
      triggeredByName: input.user?.name ?? null,
      triggeredByEmail: input.user?.email ?? null,
      triggeredByGithubUsername: input.user?.githubUsername ?? null,
    })
    .returning();

  await trimPublishHistory(input.owner, input.repo, input.branch);
  return row ? toItem(row) : null;
};

const listPublishHistory = async (
  owner: string,
  repo: string,
  branch: string,
  limit = PUBLISH_HISTORY_LIMIT,
) => {
  await trimPublishHistory(owner, repo, branch);

  const rows = await db
    .select()
    .from(publishHistoryTable)
    .where(repoScope(owner, repo, branch))
    .orderBy(desc(publishHistoryTable.createdAt), desc(publishHistoryTable.id))
    .limit(Math.min(limit, PUBLISH_HISTORY_LIMIT));

  return rows.map(toItem);
};

export {
  PUBLISH_HISTORY_LIMIT,
  recordPublishHistory,
  listPublishHistory,
  trimPublishHistory,
};
export type { PublishHistoryFile, PublishHistoryItem };
