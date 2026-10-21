import "server-only";

import { postgresClient } from "@/db";
import { STAGED_WRITE_DDL } from "@/lib/staged-writes/ddl";
import { formatDbError, isConnectionError } from "@/lib/staged-writes/errors";

let ensurePromise: Promise<void> | null = null;
let tableReady = false;

const ensureStagedWriteTable = async () => {
  if (tableReady) return;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置，无法使用数据库暂存（保存内容需要 PostgreSQL）。");
  }

  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        const existing = await postgresClient<{ table_exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'staged_write'
          ) AS table_exists
        `;

        if (existing[0]?.table_exists) {
          tableReady = true;
          return;
        }

        for (const statement of STAGED_WRITE_DDL) {
          await postgresClient.unsafe(statement);
        }

        tableReady = true;
      } catch (error) {
        ensurePromise = null;
        if (isConnectionError(error)) {
          throw new Error(
            "无法连接 PostgreSQL（localhost:5432）。请启动数据库，或本地开发时使用 LOCAL_REPO_MODE（无需数据库）。",
            { cause: error },
          );
        }
        const detail = formatDbError(error);
        throw new Error(`无法初始化暂存表 staged_write：${detail}`, { cause: error });
      }
    })();
  }

  await ensurePromise;
};

export { ensureStagedWriteTable };
