import path from "node:path";
import {
  findLocalWorkspaceOverride,
  getActiveLocalRepoName,
  getWorkspacePathOverride,
  localRepoNameFromPath,
  setActiveLocalRepoName,
  setWorkspacePathOverride,
} from "@/lib/local-repo/workspace-path";
import { repoHref } from "@/lib/repo-href";

const LOCAL_REPO_OWNER = "local";
const LOCAL_REPO_NAME = "hugo-blog";
const LOCAL_REPO_BRANCH = "main";

const isLocalRepoMode = () => process.env.LOCAL_REPO_MODE === "true";

const getLocalRepoOwner = () =>
  process.env.LOCAL_REPO_OWNER || LOCAL_REPO_OWNER;

const getDefaultLocalRepoName = () =>
  process.env.LOCAL_REPO_NAME || LOCAL_REPO_NAME;

/**
 * @deprecated Always on for non-local repos. Kept for older env docs / callers.
 * Immediate GitHub uploads have been removed — saves always stage first.
 */
const isStagedWritesMode = () => true;

/** Local repo mode skips login only when explicitly enabled, never in production. */
const isLocalDevBypassAuth = () => {
  if (!isLocalRepoMode()) return false;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.LOCAL_DEV_BYPASS_AUTH === "true";
};

const getStagedRepoOwner = () => process.env.STAGED_REPO_OWNER || "";
const getStagedRepoName = () => process.env.STAGED_REPO_NAME || "";

/** Any project under the local owner is disk-backed when LOCAL_REPO_MODE is on. */
const isLocalRepoRef = (owner: string, repo: string) =>
  isLocalRepoMode() &&
  owner.toLowerCase() === getLocalRepoOwner().toLowerCase() &&
  Boolean(repo?.trim());

/**
 * All non-local (GitHub) repos use DB staging until manual publish.
 * Local folder mode writes to disk instead.
 */
const isStagedRepoRef = (owner: string, repo: string) => !isLocalRepoRef(owner, repo);

/** Local disk OR GitHub-with-DB-staging (everything except immediate GitHub writes). */
const isFilesystemRepoRef = (owner: string, repo: string) =>
  isLocalRepoRef(owner, repo) || isStagedRepoRef(owner, repo);

/** Alias — saves are always deferred until manual publish (or local disk write). */
const isDeferredCommitRepo = isFilesystemRepoRef;

/** GitHub repos stage into PostgreSQL; local mode uses the folder directly. */
const usesDbStagedStorage = (owner: string, repo: string) => isStagedRepoRef(owner, repo);

const resolveConfiguredPath = (value: string | undefined | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
};

/** Optional env-only path. No built-in default — path must be chosen in the UI. */
const getConfiguredLocalRepoPath = () =>
  resolveConfiguredPath(process.env.LOCAL_REPO_PATH);

const MISSING_LOCAL_PATH_MESSAGE =
  "未设置本地仓库目录。请在仓库菜单中「选择本地项目目录」。";

/**
 * Resolved local path from env only.
 * Prefer getFilesystemRepoPath (UI override wins). Throws if unset.
 */
const getLocalRepoPath = () => {
  const configured = getConfiguredLocalRepoPath();
  if (!configured) {
    throw new Error(MISSING_LOCAL_PATH_MESSAGE);
  }
  return configured;
};

const getStagedRepoPath = () => {
  const configured = resolveConfiguredPath(process.env.STAGED_REPO_PATH);
  if (configured) return configured;
  const local = getConfiguredLocalRepoPath();
  if (local) return local;
  throw new Error(MISSING_LOCAL_PATH_MESSAGE);
};

/**
 * Effective on-disk root for a repo.
 * Per-repo UI override wins over optional LOCAL_REPO_PATH / STAGED_REPO_PATH.
 * There is no built-in default folder.
 */
const getFilesystemRepoPath = (owner: string, repo: string) => {
  const override = getWorkspacePathOverride(owner, repo);
  if (override) return override;
  if (isLocalRepoRef(owner, repo)) {
    const configured = getConfiguredLocalRepoPath();
    if (configured) return configured;
    throw new Error(MISSING_LOCAL_PATH_MESSAGE);
  }
  return getStagedRepoPath();
};

const getFilesystemRepoBranch = (owner: string, repo: string, branch: string) => {
  if (isLocalRepoRef(owner, repo)) {
    return process.env.LOCAL_REPO_BRANCH || LOCAL_REPO_BRANCH;
  }
  if (isStagedRepoRef(owner, repo)) {
    return process.env.STAGED_REPO_BRANCH || branch;
  }
  return branch;
};

const getLocalRepoRef = () => {
  const owner = getLocalRepoOwner();
  const branch = process.env.LOCAL_REPO_BRANCH || LOCAL_REPO_BRANCH;
  const active = getActiveLocalRepoName();
  const repo = active || getDefaultLocalRepoName();
  return { owner, repo, branch };
};

const getFilesystemRepoRef = (owner: string, repo: string, branch: string) => ({
  owner,
  repo,
  branch: getFilesystemRepoBranch(owner, repo, branch),
  rootPath: getFilesystemRepoPath(owner, repo),
});

const getLocalProjectPath = () => {
  const { owner, repo, branch } = getLocalRepoRef();
  return repoHref(owner, repo, branch);
};

export type FilesystemPathSource = "override" | "env" | "unset";

const describeFilesystemRepoPath = (owner: string, repo: string) => {
  const override = getWorkspacePathOverride(owner, repo);
  if (override) {
    return { path: override, source: "override" as const };
  }
  if (isLocalRepoRef(owner, repo)) {
    const configured = getConfiguredLocalRepoPath();
    if (configured) {
      return { path: configured, source: "env" as const };
    }
    return { path: "", source: "unset" as const };
  }
  const staged = resolveConfiguredPath(process.env.STAGED_REPO_PATH);
  if (staged) {
    return { path: staged, source: "env" as const };
  }
  const localFallback = getConfiguredLocalRepoPath();
  if (localFallback) {
    return { path: localFallback, source: "env" as const };
  }
  return { path: "", source: "unset" as const };
};

/**
 * Align URL [repo] with the on-disk folder name. Returns a redirect href when
 * the current route slug is stale (e.g. still `/local/hugo-blog/...`).
 */
const canonicalizeLocalRepoRoute = async (options: {
  owner: string;
  repo: string;
  branch: string;
  /** Path after `/owner/repo/branch`, e.g. `/configuration`. */
  restPath?: string;
}): Promise<string | null> => {
  if (!isLocalRepoRef(options.owner, options.repo)) return null;

  let absolute =
    getWorkspacePathOverride(options.owner, options.repo) ||
    findLocalWorkspaceOverride(options.owner)?.path ||
    null;
  if (!absolute) {
    const configured = getConfiguredLocalRepoPath();
    if (configured) absolute = configured;
  }
  if (!absolute) return null;

  let folderName: string;
  try {
    folderName = localRepoNameFromPath(absolute);
  } catch {
    return null;
  }

  const currentRepo = (() => {
    try {
      return decodeURIComponent(options.repo);
    } catch {
      return options.repo;
    }
  })();

  const needsMigrate =
    currentRepo.toLowerCase() !== folderName.toLowerCase() ||
    getActiveLocalRepoName()?.toLowerCase() !== folderName.toLowerCase() ||
    !getWorkspacePathOverride(options.owner, folderName);

  if (needsMigrate) {
    const found = findLocalWorkspaceOverride(options.owner);
    if (currentRepo.toLowerCase() !== folderName.toLowerCase()) {
      await setWorkspacePathOverride(options.owner, currentRepo, null);
    }
    if (
      found &&
      found.storeRepo.toLowerCase() !== folderName.toLowerCase() &&
      found.storeRepo.toLowerCase() !== currentRepo.toLowerCase()
    ) {
      await setWorkspacePathOverride(options.owner, found.storeRepo, null);
    }
    await setWorkspacePathOverride(options.owner, folderName, absolute);
    await setActiveLocalRepoName(folderName);
  }

  if (currentRepo.toLowerCase() === folderName.toLowerCase()) {
    return null;
  }

  const rest = options.restPath?.startsWith("/")
    ? options.restPath
    : options.restPath
      ? `/${options.restPath}`
      : "";
  return repoHref(options.owner, folderName, options.branch, rest);
};

export {
  LOCAL_REPO_OWNER,
  LOCAL_REPO_NAME,
  LOCAL_REPO_BRANCH,
  isLocalRepoMode,
  isStagedWritesMode,
  isLocalDevBypassAuth,
  isLocalRepoRef,
  isStagedRepoRef,
  isFilesystemRepoRef,
  isDeferredCommitRepo,
  usesDbStagedStorage,
  getConfiguredLocalRepoPath,
  getLocalRepoPath,
  getStagedRepoPath,
  getFilesystemRepoPath,
  getFilesystemRepoBranch,
  getLocalRepoRef,
  getFilesystemRepoRef,
  getLocalProjectPath,
  getStagedRepoOwner,
  getStagedRepoName,
  describeFilesystemRepoPath,
  canonicalizeLocalRepoRoute,
  MISSING_LOCAL_PATH_MESSAGE,
};
