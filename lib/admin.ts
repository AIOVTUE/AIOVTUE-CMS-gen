import "server-only";

import { createHttpError } from "@/lib/api-error";
import type { User } from "@/types/user";
import { isLocalDevBypassAuth } from "@/lib/local-repo/config";
import { getServerSession } from "@/lib/session-server";
import { getAppConfig } from "@/lib/app-config/store";

const parseEmailList = (raw: string) =>
  new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

const getAdminEmails = async () => {
  const config = await getAppConfig();
  return parseEmailList(config.adminEmails);
};

const isBootstrapAdminEmail = async (email: string | null | undefined) => {
  if (!email) return false;
  const admins = await getAdminEmails();
  return admins.has(email.trim().toLowerCase());
};

/** Sync helper for rare call sites; prefer hasAdminAccessAsync. */
const hasAdminAccess = (_user: Pick<User, "email"> | null | undefined) => {
  if (isLocalDevBypassAuth()) return true;
  return false;
};

const hasAdminAccessAsync = async (
  user: Pick<User, "email"> | null | undefined,
) => {
  if (isLocalDevBypassAuth()) return true;
  return isBootstrapAdminEmail(user?.email);
};

const requireAdminSession = async () => {
  const session = await getServerSession();
  const user = session?.user;

  if (!user) {
    throw createHttpError("Not signed in.", 401);
  }

  if (!(await hasAdminAccessAsync(user))) {
    throw createHttpError("Admin access required.", 403);
  }

  return { session, user };
};

export {
  getAdminEmails,
  hasAdminAccess,
  hasAdminAccessAsync,
  isBootstrapAdminEmail,
  requireAdminSession,
};
