import { getDeferredDirectoryEntries, type DirectoryEntry } from "@/lib/staged-writes/list";
import { joinPathSegments } from "@/lib/utils/file";
import { readRepoFile } from "@/lib/local-repo/fs";

type LocalCacheEntry = {
  context: "collection" | "media";
  owner: string;
  repo: string;
  branch: string;
  parentPath: string;
  name: string;
  path: string;
  type: "file" | "dir";
  content: string | null;
  sha: string | null;
  size: number | null;
  downloadUrl: string | null;
  updatedAt: Date;
  commitSha: string;
  commitTimestamp: number;
  isNode?: boolean;
};

type RepoRef = {
  owner: string;
  repo: string;
  branch: string;
};

const toCacheEntry = (
  context: "collection" | "media",
  ref: RepoRef,
  parentPath: string,
  item: DirectoryEntry,
): LocalCacheEntry => {
  const { owner, repo, branch } = ref;
  const now = Date.now();

  return {
    context,
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch,
    parentPath,
    name: item.name,
    path: item.path,
    type: item.type,
    content: item.content ?? null,
    sha: item.sha ?? null,
    size: item.size ?? null,
    downloadUrl:
      context === "media" && item.type === "file"
        ? `/api/${owner}/${repo}/${encodeURIComponent(branch)}/raw/${encodeURIComponent(item.path)}`
        : null,
    updatedAt: item.updatedAt ?? new Date(),
    commitSha: item.sha ?? "staged",
    commitTimestamp: item.updatedAt?.getTime() ?? now,
  };
};

const getLocalCollectionEntries = async (
  ref: RepoRef,
  dirPath: string,
  nodeEntryFilename?: string,
  baseEntries?: DirectoryEntry[],
) => {
  const items = await getDeferredDirectoryEntries(ref, dirPath, baseEntries);
  const fsRef = { owner: ref.owner, repo: ref.repo };

  const nodeDirs = nodeEntryFilename
    ? items.filter((item) => item.type === "dir")
    : [];

  const nodeFiles = await Promise.all(
    nodeDirs.map(async (item) => {
      const nodePath = joinPathSegments([item.path, nodeEntryFilename!]);
      try {
        const file = await readRepoFile(nodePath, fsRef);
        return {
          ...toCacheEntry("collection", ref, item.path, {
            name: nodeEntryFilename!,
            path: nodePath,
            type: "file" as const,
            content: file.content,
            sha: file.sha,
            size: file.size,
            updatedAt: file.updatedAt,
          }),
          isNode: true as const,
        };
      } catch {
        return null;
      }
    }),
  );

  const entries: LocalCacheEntry[] = items.map((item) => {
    const entry = toCacheEntry("collection", ref, dirPath, item);
    if (nodeEntryFilename && item.type === "file" && item.name === nodeEntryFilename) {
      return { ...entry, isNode: true };
    }
    return entry;
  });

  for (const node of nodeFiles) {
    if (node) entries.push(node);
  }

  return entries;
};

const getLocalMediaEntries = async (
  ref: RepoRef,
  dirPath: string,
  baseEntries?: DirectoryEntry[],
) => {
  const items = await getDeferredDirectoryEntries(ref, dirPath, baseEntries);
  return items.map((item) => toCacheEntry("media", ref, dirPath, item));
};

export { getLocalCollectionEntries, getLocalMediaEntries };
export type { LocalCacheEntry, RepoRef };
