import "server-only";

import { getAppConfig } from "@/lib/app-config/store";

/**
 * Optional GitHub username allowlist for **GitHub OAuth only**.
 * Email/password and invite OTP logins are not affected.
 */

const parseAllowlist = (raw: string): Set<string> | null => {
  if (!raw.trim()) return null;
  const names = raw
    .split(/[,;\s]+/)
    .map((value) => value.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  if (names.length === 0) return null;
  return new Set(names);
};

export async function getAllowedGithubUsernames(): Promise<Set<string> | null> {
  const config = await getAppConfig();
  return parseAllowlist(config.githubAllowedUsernames);
}

export async function isGithubUsernameAllowed(
  login: string | null | undefined,
): Promise<boolean> {
  const allowlist = await getAllowedGithubUsernames();
  if (!allowlist) return true;
  if (!login) return false;
  return allowlist.has(login.trim().replace(/^@/, "").toLowerCase());
}

export const GITHUB_USERNAME_DENIED_MESSAGE =
  "该 GitHub 账号无权登录。请使用已授权的账号。";
