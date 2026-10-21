import "server-only";

import { isLocalRepoRef } from "@/lib/local-repo/config";
import { listRepoDirectory, readRepoFile } from "@/lib/local-repo/fs";
import {
  contentSha,
  decodeContent,
  listStagedWrites,
  type RepoBranchRef,
} from "@/lib/staged-writes/store";

type DirectoryEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  content?: string | null;
  sha?: string | null;
  size?: number | null;
  updatedAt?: Date;
};

const normalizeParent = (dirPath: string) => dirPath.replace(/\\/g, "/").replace(/^\/+/, "");

const isDirectChild = (parentPath: string, entryPath: string) => {
  const parent = normalizeParent(parentPath);
  const entry = normalizeParent(entryPath);
  if (parent === "") {
    return !entry.includes("/");
  }
  if (!entry.startsWith(`${parent}/`)) return false;
  const rest = entry.slice(parent.length + 1);
  return rest.length > 0 && !rest.includes("/");
};

/** First-level directory under parent that contains a nested staged file path. */
const getDirectChildDir = (parentPath: string, entryPath: string): string | null => {
  const parent = normalizeParent(parentPath);
  const entry = normalizeParent(entryPath);
  if (!entry) return null;

  if (parent === "") {
    const slash = entry.indexOf("/");
    if (slash <= 0) return null;
    return entry.slice(0, slash);
  }

  if (!entry.startsWith(`${parent}/`)) return null;
  const rest = entry.slice(parent.length + 1);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return `${parent}/${rest.slice(0, slash)}`;
};

const applyStagedOverlay = (
  baseEntries: DirectoryEntry[],
  stagedRows: Awaited<ReturnType<typeof listStagedWrites>>,
  parentPath: string,
): DirectoryEntry[] => {
  const parent = normalizeParent(parentPath);
  const byPath = new Map(baseEntries.map((entry) => [entry.path, entry]));
  const nestedDirsNeeded = new Set<string>();

  for (const row of stagedRows) {
    if (row.operation === "delete") {
      byPath.delete(row.path);
      // Empty folders are represented by .gitkeep — hide the folder once it is deleted.
      if (row.path.endsWith("/.gitkeep")) {
        const folderPath = row.path.slice(0, -"/.gitkeep".length);
        if (folderPath && isDirectChild(parent, folderPath)) {
          byPath.delete(folderPath);
        }
      }
      continue;
    }

    if (row.operation === "rename" && row.newPath) {
      byPath.delete(row.path);
      const buffer = row.content != null ? decodeContent(row) : Buffer.alloc(0);
      const name = row.newPath.split("/").pop() || row.newPath;
      if (isDirectChild(parent, row.newPath)) {
        byPath.set(row.newPath, {
          name,
          path: row.newPath,
          type: "file",
          content: buffer.toString("utf8"),
          sha: contentSha(buffer),
          size: buffer.byteLength,
          updatedAt: row.updatedAt,
        });
      } else {
        const dirPath = getDirectChildDir(parent, row.newPath);
        if (dirPath) nestedDirsNeeded.add(dirPath);
      }
      continue;
    }

    if (isDirectChild(parent, row.path)) {
      const buffer = row.content != null ? decodeContent(row) : Buffer.alloc(0);
      const name = row.path.split("/").pop() || row.path;
      byPath.set(row.path, {
        name,
        path: row.path,
        type: "file",
        content: buffer.toString("utf8"),
        sha: contentSha(buffer),
        size: buffer.byteLength,
        updatedAt: row.updatedAt,
      });
      continue;
    }

    // Nested staged file (e.g. content/gallery/new-album/index.md while listing
    // content/gallery) — synthesize the intermediate directory so unpublished
    // album folders appear in collection listings.
    const dirPath = getDirectChildDir(parent, row.path);
    if (dirPath) nestedDirsNeeded.add(dirPath);
  }

  for (const dirPath of nestedDirsNeeded) {
    if (byPath.has(dirPath)) continue;
    const name = dirPath.split("/").pop() || dirPath;
    byPath.set(dirPath, {
      name,
      path: dirPath,
      type: "dir",
    });
  }

  return Array.from(byPath.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const listDeferredDirectory = async (
  ref: RepoBranchRef,
  dirPath: string,
  baseEntries: DirectoryEntry[],
) => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    return baseEntries;
  }

  const stagedRows = await listStagedWrites(ref);
  return applyStagedOverlay(baseEntries, stagedRows, dirPath);
};

const listLocalBaseDirectory = async (
  ref: RepoBranchRef,
  dirPath: string,
  options?: { includeContent?: boolean },
): Promise<DirectoryEntry[]> => {
  const fsRef = { owner: ref.owner, repo: ref.repo };
  const items = await listRepoDirectory(dirPath, fsRef);
  const includeContent = options?.includeContent !== false;

  if (!includeContent) {
    return items;
  }

  return Promise.all(
    items.map(async (item) => {
      if (item.type === "dir") return item;
      try {
        const file = await readRepoFile(item.path, fsRef);
        return {
          ...item,
          content: file.content,
          sha: file.sha,
          size: file.size,
          updatedAt: file.updatedAt,
        };
      } catch {
        return item;
      }
    }),
  );
};

const getDeferredDirectoryEntries = async (
  ref: RepoBranchRef,
  dirPath: string,
  baseEntries?: DirectoryEntry[],
  options?: { includeContent?: boolean },
) => {
  const base =
    baseEntries ??
    (isLocalRepoRef(ref.owner, ref.repo)
      ? await listLocalBaseDirectory(ref, dirPath, options)
      : []);

  return listDeferredDirectory(ref, dirPath, base);
};

export type { DirectoryEntry };
export { applyStagedOverlay, listDeferredDirectory, getDeferredDirectoryEntries };
