import "server-only";

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

/**
 * Ensure a user row exists before inserting FK-dependent AI rows.
 * Needed for local-dev bypass users that never go through better-auth signup.
 */
const ensureDbUser = async (user: EnsureUserInput) => {
  const email = user.email?.trim() || `${user.id}@local.pagescms`;
  const name = user.name?.trim() || email;

  await db
    .insert(userTable)
    .values({
      id: user.id,
      name,
      email,
      emailVerified: Boolean(user.emailVerified),
      githubUsername: user.githubUsername ?? null,
      image: user.image ?? null,
    })
    .onConflictDoNothing({ target: userTable.id });
};

export { ensureDbUser };
