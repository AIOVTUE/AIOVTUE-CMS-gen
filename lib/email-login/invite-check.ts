import "server-only";

import { and, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorInviteTable } from "@/db/schema";

export const normalizeInviteEmail = (value: string) => value.trim().toLowerCase();

export const hasPendingCollaboratorInvite = async (email: string) => {
  const normalized = normalizeInviteEmail(email);
  if (!normalized) return false;

  const invite = await db.query.collaboratorInviteTable.findFirst({
    where: and(
      sql`lower(${collaboratorInviteTable.email}) = ${normalized}`,
      gt(collaboratorInviteTable.expiresAt, new Date()),
    ),
  });
  return Boolean(invite);
};
