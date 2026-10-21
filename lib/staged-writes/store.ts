import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { createHttpError } from "@/lib/api-error";
import { usesDbStagedStorage } from "@/lib/local-repo/config";
import { db } from "@/db";
import { stagedWriteTable } from "@/db/schema";
import { hashContent } from "@/lib/local-repo/fs";
import { ensureStagedWriteTable } from "@/lib/staged-writes/ensure-table";
import { formatDbError, isConnectionError } from "@/lib/staged-writes/errors";

type StagedOperation = "add" | "modify" | "delete" | "rename";

type RepoBranchRef = {
  owner: string;
  repo: string;
  branch: string;
};

type StagedWriteRow = typeof stagedWriteTable.$inferSelect;

const assertDbStagedStorage = (ref: RepoBranchRef) => {
  if (!usesDbStagedStorage(ref.owner, ref.repo)) {
    throw new Error("Database staged storage is not enabled for this repo.");
  }
};

const wrapStagedWriteError = (error: unknown): never => {
  const message = formatDbError(error);

  if (isConnectionError(error)) {
    throw createHttpError(
      "无法连接 PostgreSQL。请启动数据库；本地开发请使用 LOCAL_REPO_MODE（保存到 hugo-blog-aiovtue 文件夹，无需数据库）。",
      503,
    );
  }

  if (
    message.includes("DATABASE_URL") ||
    message.includes("无法初始化暂存表") ||
    (message.includes("staged_write") &&
      (message.includes("does not exist") || message.includes("relation")))
  ) {
    throw createHttpError(message, 503);
  }

  throw error instanceof Error ? error : new Error(message);
};

const repoScope = (ref: RepoBranchRef) =>
  and(
    sql`lower(${stagedWriteTable.owner}) = lower(${ref.owner})`,
    sql`lower(${stagedWriteTable.repo}) = lower(${ref.repo})`,
    eq(stagedWriteTable.branch, ref.branch),
  );

const decodeContent = (row: Pick<StagedWriteRow, "content" | "contentEncoding">) => {
  if (row.content == null) return Buffer.alloc(0);
  if (row.contentEncoding === "base64") {
    return Buffer.from(row.content, "base64");
  }
  return Buffer.from(row.content, "utf8");
};

const encodeContent = (buffer: Buffer) => {
  const isText = !buffer.includes(0);
  if (isText) {
    return {
      content: buffer.toString("utf8"),
      contentEncoding: "utf8" as const,
    };
  }
  return {
    content: buffer.toString("base64"),
    contentEncoding: "base64" as const,
  };
};

const contentSha = (buffer: Buffer) => hashContent(buffer);

const listStagedWrites = async (ref: RepoBranchRef): Promise<StagedWriteRow[]> => {
  assertDbStagedStorage(ref);
  try {
    await ensureStagedWriteTable();
    return await db
      .select()
      .from(stagedWriteTable)
      .where(repoScope(ref))
      .orderBy(asc(stagedWriteTable.path));
  } catch (error) {
    return wrapStagedWriteError(error);
  }
};

const getStagedWrite = async (
  ref: RepoBranchRef,
  path: string,
): Promise<StagedWriteRow | null> => {
  assertDbStagedStorage(ref);
  try {
    await ensureStagedWriteTable();
    const [row] = await db
      .select()
      .from(stagedWriteTable)
      .where(and(repoScope(ref), eq(stagedWriteTable.path, path)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    return wrapStagedWriteError(error);
  }
};

const getStagedStatus = async (ref: RepoBranchRef) => {
  const rows = await listStagedWrites(ref);
  const files = rows.map((row) => ({
    path: row.path,
    status: row.operation === "delete" ? "D" : row.operation === "add" ? "A" : "M",
    operation: row.operation as StagedOperation,
    newPath: row.newPath,
  }));

  return {
    branch: ref.branch,
    ahead: 0,
    behind: 0,
    files,
    dirty: files.length > 0,
  };
};

const upsertStagedWrite = async (
  ref: RepoBranchRef,
  path: string,
  input: {
    operation: StagedOperation;
    content?: Buffer;
    baseSha?: string;
    newPath?: string;
  },
) => {
  assertDbStagedStorage(ref);
  const encoded =
    input.content != null ? encodeContent(input.content) : { content: null, contentEncoding: "utf8" as const };
  const size = input.content?.byteLength ?? null;
  const now = new Date();

  try {
    await ensureStagedWriteTable();
    const [row] = await db
      .insert(stagedWriteTable)
      .values({
        owner: ref.owner.toLowerCase(),
        repo: ref.repo.toLowerCase(),
        branch: ref.branch,
        path,
        operation: input.operation,
        content: encoded.content,
        contentEncoding: encoded.contentEncoding,
        baseSha: input.baseSha ?? null,
        newPath: input.newPath ?? null,
        size,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          stagedWriteTable.owner,
          stagedWriteTable.repo,
          stagedWriteTable.branch,
          stagedWriteTable.path,
        ],
        set: {
          operation: input.operation,
          content: encoded.content,
          contentEncoding: encoded.contentEncoding,
          baseSha: input.baseSha ?? null,
          newPath: input.newPath ?? null,
          size,
          updatedAt: now,
        },
      })
      .returning();

    return row;
  } catch (error) {
    return wrapStagedWriteError(error);
  }
};

const clearStagedWrites = async (ref: RepoBranchRef) => {
  assertDbStagedStorage(ref);
  try {
    await ensureStagedWriteTable();
    await db.delete(stagedWriteTable).where(repoScope(ref));
  } catch (error) {
    return wrapStagedWriteError(error);
  }
};

const removeStagedWrite = async (ref: RepoBranchRef, path: string) => {
  assertDbStagedStorage(ref);
  try {
    await ensureStagedWriteTable();
    await db.delete(stagedWriteTable).where(and(repoScope(ref), eq(stagedWriteTable.path, path)));
  } catch (error) {
    return wrapStagedWriteError(error);
  }
};

export type { StagedOperation, RepoBranchRef, StagedWriteRow };
export {
  decodeContent,
  encodeContent,
  contentSha,
  listStagedWrites,
  getStagedWrite,
  getStagedStatus,
  upsertStagedWrite,
  clearStagedWrites,
  removeStagedWrite,
};
