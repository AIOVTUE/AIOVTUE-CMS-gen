import postgres from "postgres";

const url =
  process.env.DATABASE_URL ||
  "postgresql://pagescms:pagescms@localhost:5432/pagescms";

const sql = postgres(url, { max: 1 });

try {
  await sql.unsafe(`
CREATE TABLE IF NOT EXISTS "app_config" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "setup_complete" boolean DEFAULT false NOT NULL
);
`);
  const result = await sql`DELETE FROM app_config WHERE id = 1`;
  console.log(`reset ok, deleted=${result.count}`);
} finally {
  await sql.end();
}
