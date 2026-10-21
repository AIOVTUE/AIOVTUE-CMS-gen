import { redirect } from "next/navigation";
import { getToken } from "@/lib/token";
import { getRepoSnapshot } from "@/lib/github-cache-file";
import { getServerSession } from "@/lib/session-server";
import { repoHref } from "@/lib/repo-href";

/**
 * Resolve default branch on the server and redirect.
 * Avoid the old client page that `return null` + soft `router.replace`
 * (soft-nav often leaves a blank screen until hard refresh).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoParam } = await params;
  const repo = (() => {
    try {
      return decodeURIComponent(repoParam);
    } catch {
      return repoParam;
    }
  })();

  const session = await getServerSession();
  const user = session?.user;
  if (!user) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/${owner}/${repo}`)}`);
  }

  let branch = "main";
  try {
    const { token } = await getToken(user, owner, repo);
    if (token) {
      const snapshot = await getRepoSnapshot(owner, repo, token, {
        branchList: "default",
      });
      branch = snapshot.defaultBranch || branch;
    }
  } catch {
    // Fall through to main — branch layout handles access errors.
  }

  redirect(repoHref(owner, repo, branch));
}
