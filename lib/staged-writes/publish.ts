import "server-only";

import { isLocalRepoRef } from "@/lib/local-repo/config";
import { publishLocalRepo } from "@/lib/local-repo/git";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { normalizePath } from "@/lib/utils/file";
import {
  clearFileCache,
  setBranchHeadSha,
} from "@/lib/github-cache-file";
import {
  getFolderPathsForChanges,
  invalidateFolderScopes,
} from "@/lib/github-cache-folders";
import {
  clearStagedWrites,
  decodeContent,
  listStagedWrites,
  type RepoBranchRef,
  type StagedWriteRow,
} from "@/lib/staged-writes/store";

type TreeItem = {
  path: string;
  mode: "100644" | "100755" | "040000" | "160000" | "120000";
  type: "blob" | "tree" | "commit";
  sha: string | null;
};

/**
 * Publish all staged writes as a single Git commit (one push → one deploy).
 * Uses the Git Data API: blobs → tree → commit → update ref.
 */
const publishStagedWrites = async (
  ref: RepoBranchRef,
  token: string,
  options?: { message?: string },
) => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    return publishLocalRepo(ref, options);
  }

  const rows = await listStagedWrites(ref);
  if (rows.length === 0) {
    return {
      published: false,
      reason: "clean" as const,
      files: [] as Array<{ path: string; status: string }>,
      commitMessage: null as string | null,
      commitSha: null as string | null,
    };
  }

  const octokit = createOctokitInstance(token);
  const message =
    options?.message?.trim() ||
    `Publish CMS changes (${rows.length} files)`;

  const { data: refData } = await octokit.rest.git.getRef({
    owner: ref.owner,
    repo: ref.repo,
    ref: `heads/${ref.branch}`,
  });
  const parentCommitSha = refData.object.sha;

  const { data: parentCommit } = await octokit.rest.git.getCommit({
    owner: ref.owner,
    repo: ref.repo,
    commit_sha: parentCommitSha,
  });
  const baseTreeSha = parentCommit.tree.sha;

  const treeItems: TreeItem[] = [];

  for (const row of rows) {
    const items = await buildTreeItemsForRow(octokit, ref, row);
    treeItems.push(...items);
  }

  // Deduplicate by path (last write wins) — rename may add both delete+create.
  const byPath = new Map<string, TreeItem>();
  for (const item of treeItems) {
    const path = normalizeTreePath(item.path);
    if (!path) continue;
    byPath.set(path, { ...item, path });
  }

  const candidates = Array.from(byPath.values());
  const deletePaths = candidates
    .filter((item) => item.sha === null)
    .map((item) => item.path);

  // Deleting a path missing from base_tree causes GitHub 422 GitRPC::BadObjectState
  // (common when a file was staged as add then deleted before publish).
  const existingPaths = await resolveExistingPaths(
    octokit,
    ref.owner,
    ref.repo,
    baseTreeSha,
    parentCommitSha,
    deletePaths,
  );

  const tree = candidates.filter((item) => {
    if (item.sha !== null) return true;
    return existingPaths.has(item.path);
  });

  if (tree.length === 0) {
    // All staged ops were no-ops against remote (e.g. delete of never-pushed files).
    await clearStagedWrites(ref);
    return {
      published: false,
      reason: "clean" as const,
      files: [] as Array<{ path: string; status: string }>,
      commitMessage: null as string | null,
      commitSha: null as string | null,
    };
  }

  let newTree;
  try {
    const response = await octokit.rest.git.createTree({
      owner: ref.owner,
      repo: ref.repo,
      base_tree: baseTreeSha,
      tree: tree as any,
    });
    newTree = response.data;
  } catch (error: any) {
    const detail =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to create git tree.";
    if (
      typeof detail === "string" &&
      detail.toLowerCase().includes("badobjectstate")
    ) {
      throw Object.assign(
        new Error(
          "提交失败：试图删除远程不存在的文件，或暂存状态与仓库不一致。请撤销相关更改后重试，或先同步仓库。",
        ),
        { status: 422 },
      );
    }
    throw Object.assign(new Error(String(detail)), {
      status: error?.status || error?.response?.status || 500,
    });
  }

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner: ref.owner,
    repo: ref.repo,
    message,
    tree: newTree.sha,
    parents: [parentCommitSha],
  });

  await octokit.rest.git.updateRef({
    owner: ref.owner,
    repo: ref.repo,
    ref: `heads/${ref.branch}`,
    sha: newCommit.sha,
  });

  setBranchHeadSha(ref.owner, ref.repo, ref.branch, newCommit.sha);

  const changedPaths = rows.flatMap((row) =>
    row.newPath && row.newPath !== row.path
      ? [row.path, row.newPath]
      : [row.path],
  );
  try {
    await invalidateFolderScopes(
      ref.owner,
      ref.repo,
      ref.branch,
      getFolderPathsForChanges(changedPaths),
    );
    await clearFileCache(ref.owner, ref.repo, ref.branch);
  } catch {
    // Cache refresh is best-effort; commit already succeeded.
  }

  await clearStagedWrites(ref);

  return {
    published: true,
    reason: "ok" as const,
    files: rows.map((row) => ({
      path: row.newPath || row.path,
      status: row.operation === "delete" ? "D" : row.operation === "add" ? "A" : "M",
    })),
    commitMessage: message,
    commitSha: newCommit.sha,
    ahead: 0,
  };
};

const normalizeTreePath = (path: string) => {
  const normalized = normalizePath(path).replace(/^\/+/, "").trim();
  if (!normalized || normalized.includes("\0")) return "";
  return normalized;
};

const resolveExistingPaths = async (
  octokit: ReturnType<typeof createOctokitInstance>,
  owner: string,
  repo: string,
  treeSha: string,
  commitSha: string,
  deletePaths: string[],
) => {
  const existing = new Set<string>();
  if (deletePaths.length === 0) return existing;

  let truncated = false;
  try {
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "true",
    });
    truncated = Boolean(data.truncated);
    for (const entry of data.tree ?? []) {
      if (!entry.path || entry.type !== "blob") continue;
      const path = normalizeTreePath(entry.path);
      if (path) existing.add(path);
    }
  } catch {
    truncated = true;
  }

  if (!truncated) return existing;

  // Large repos may truncate the recursive tree; verify remaining deletes one-by-one.
  for (const path of deletePaths) {
    if (existing.has(path)) continue;
    try {
      await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: commitSha,
      });
      existing.add(path);
    } catch {
      // 404 / missing — safe to skip this delete.
    }
  }
  return existing;
};

const buildTreeItemsForRow = async (
  octokit: ReturnType<typeof createOctokitInstance>,
  ref: RepoBranchRef,
  row: StagedWriteRow,
): Promise<TreeItem[]> => {
  const path = normalizeTreePath(row.path);
  const newPath = row.newPath ? normalizeTreePath(row.newPath) : "";

  if (!path) return [];

  if (row.operation === "delete") {
    return [
      {
        path,
        mode: "100644",
        type: "blob",
        sha: null,
      },
    ];
  }

  const buffer = row.content != null ? decodeContent(row) : Buffer.alloc(0);
  const { data: blob } = await octokit.rest.git.createBlob({
    owner: ref.owner,
    repo: ref.repo,
    content: buffer.toString("base64"),
    encoding: "base64",
  });

  if (row.operation === "rename" && newPath && newPath !== path) {
    return [
      {
        path: newPath,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      },
      {
        path,
        mode: "100644",
        type: "blob",
        sha: null,
      },
    ];
  }

  return [
    {
      path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    },
  ];
};

export { publishStagedWrites };
