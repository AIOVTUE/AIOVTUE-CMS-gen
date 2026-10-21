import "../envConfig";
import postgres from "postgres";
import { STAGED_WRITE_DDL } from "../../lib/staged-writes/ddl";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Error: DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(url);

  try {
    const existing = await sql<{ table_exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'staged_write'
      ) AS table_exists
    `;
    console.log("staged_write exists:", existing[0]?.table_exists === true);

    if (!existing[0]?.table_exists) {
      for (const statement of STAGED_WRITE_DDL) {
        console.log("Running:", statement.slice(0, 80).replace(/\s+/g, " ") + "...");
        await sql.unsafe(statement);
      }
      console.log("Migration applied.");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : "";
    console.error("Error:", message || cause || error);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
