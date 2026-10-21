import type { User } from "@/types/user";

type UserLike = Pick<User, "githubUsername"> | null | undefined;

const hasGithubIdentity = (user: UserLike): boolean => Boolean(user?.githubUsername);

/** GitHub users, or anyone on a local workspace (`owner === "local"`). */
const canManageRepoSettings = (
  user: UserLike,
  owner?: string | null,
): boolean =>
  hasGithubIdentity(user) || (owner || "").toLowerCase() === "local";

const assertGithubIdentity = (
  user: UserLike,
  message = "Only GitHub users can perform this action.",
) => {
  if (!hasGithubIdentity(user)) {
    throw new Error(message);
  }
};

export { hasGithubIdentity, canManageRepoSettings, assertGithubIdentity };
