/**
 * Ensure login_background table exists.
 */
import "../envConfig";
import { postgresClient } from "../index";

const sql = `
CREATE TABLE IF NOT EXISTS "login_background" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"desktop_url" text DEFAULT '' NOT NULL,
	"mobile_url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
`;

async function main() {
  await postgresClient.unsafe(sql);
  console.log("login_background ensured.");
  await postgresClient.end({ timeout: 5 });
}

main().catch(async (error) => {
  console.error(error);
  try {
    await postgresClient.end({ timeout: 5 });
  } catch {
    // ignore
  }
  process.exit(1);
});
