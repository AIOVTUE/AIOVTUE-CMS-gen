import { clearFileCache, updateMultipleFilesCache } from "@/lib/github-cache-file";
import { deleteCacheFileMeta, upsertCacheFileMeta } from "@/lib/github-cache-meta";
import { clearScopedFileCache } from "@/lib/github-webhook-installation";
import { getInstallationToken } from "@/lib/token";
import { normalizePath } from "@/lib/utils/file";
import { logServerError } from "@/lib/security/scrub-secrets";

const WEBHOOK_PUSH_INCREMENTAL_MAX_FILES = Number.parseInt(
  process.env.WEBHOOK_PUSH_INCREMENTAL_MAX_FILES ?? "120",
  10,
);
const WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES = Number.parseInt(
  process.env.WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES ?? "800",
  10,
);

const handlePushWebhookEvent = async (event: string | null, data: any) => {
  if (event !== "push") return false;
  if (data.deleted === true) return true;

  const pushOwner = data.repository?.owner?.login;
  const pushRepo = data.repository?.name;
  const ref = typeof data.ref === "string" ? data.ref : "";
  const pushBranch = ref.replace("refs/heads/", "");

  if (!pushOwner || !pushRepo || !pushBranch) {
    logServerError(
      `Missing push webhook data: owner=${pushOwner} repo=${pushRepo} branch=${pushBranch} ref=${ref}`,
      "github-webhook-push",
    );
    return true;
  }

  const commits = Array.isArray(data.commits) ? data.commits : [];
  const removedPathSet = new Set<string>();
  const modifiedPathSet = new Set<string>();
  const addedPathSet = new Set<string>();

  for (const commit of commits) {
    for (const path of commit.removed ?? []) removedPathSet.add(normalizePath(path));
    for (const path of commit.modified ?? []) modifiedPathSet.add(normalizePath(path));
    for (const path of commit.added ?? []) addedPathSet.add(normalizePath(path));
  }

  // Prefer added/modified over removed when the same path appears across commits.
  for (const path of addedPathSet) {
    removedPathSet.delete(path);
    modifiedPathSet.delete(path);
  }
  for (const path of modifiedPathSet) {
    removedPathSet.delete(path);
  }

  const removedFiles = Array.from(removedPathSet).map((path) => ({ path }));
  const modifiedFiles = Array.from(modifiedPathSet).map((path) => ({
    path,
    sha: data.head_commit?.id,
  }));
  const addedFiles = Array.from(addedPathSet).map((path) => ({
    path,
    sha: data.head_commit?.id,
  }));

  const changedPaths = [
    ...removedFiles.map((file) => file.path),
    ...modifiedFiles.map((file) => file.path),
    ...addedFiles.map((file) => file.path),
  ];
  const uniqueChangedPaths = Array.from(new Set(changedPaths));
  const changedCount = uniqueChangedPaths.length;

  const commitTimestamp = Date.parse(data.head_commit?.timestamp ?? "");
  const commit = {
    sha: data.head_commit?.id ?? data.after ?? null,
    timestamp: Number.isNaN(commitTimestamp) ? Date.now() : commitTimestamp,
  };

  const largePush =
    WEBHOOK_PUSH_INCREMENTAL_MAX_FILES > 0
    && changedCount > WEBHOOK_PUSH_INCREMENTAL_MAX_FILES;
  const hugePush =
    WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES > 0
    && changedCount > WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES;

  if (hugePush) {
    logServerError(
      `Push webhook exceeded scoped threshold (${changedCount} files). Falling back to branch cache clear for ${pushOwner}/${pushRepo}@${pushBranch}.`,
      "github-webhook-push",
    );

    await clearFileCache(pushOwner, pushRepo, pushBranch);
    await deleteCacheFileMeta(pushOwner, pushRepo, pushBranch);
    await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
      commitSha: commit.sha,
      status: "ok",
      error: null,
    });
    return true;
  }

  if (largePush) {
    logServerError(
      `Push webhook exceeded incremental threshold (${changedCount} files). Falling back to scoped cache clear for ${pushOwner}/${pushRepo}@${pushBranch}.`,
      "github-webhook-push",
    );

    await clearScopedFileCache(pushOwner, pushRepo, pushBranch, uniqueChangedPaths);
    await deleteCacheFileMeta(pushOwner, pushRepo, pushBranch);
    await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
      commitSha: commit.sha,
      status: "ok",
      error: null,
    });
    return true;
  }

  const installationToken = await getInstallationToken(pushOwner, pushRepo);

  await updateMultipleFilesCache(
    pushOwner,
    pushRepo,
    pushBranch,
    removedFiles,
    modifiedFiles,
    addedFiles,
    installationToken,
    commit.sha
      ? {
        sha: commit.sha,
        timestamp: commit.timestamp,
      }
      : undefined,
  );

  await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
    commitSha: commit.sha,
    status: "ok",
    error: null,
  });

  // CMS config is DB-backed (builtin + overlays). Ignore Hugo `.pages.yml`.
  return true;
};

export { handlePushWebhookEvent };
