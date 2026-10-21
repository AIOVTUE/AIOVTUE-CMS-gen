import "server-only";

import { EXCALIDRAW_COLLECTION } from "@/lib/excalidraw-bundle";
import { getCollectionCache } from "@/lib/github-cache-file";
import { isFilesystemRepoRef } from "@/lib/local-repo/config";
import { readDeferredFile } from "@/lib/staged-writes/read";
import { normalizePath } from "@/lib/utils/file";

const getNodeEntryFilename = (schema: Record<string, any>) => {
  const node = schema.view?.node;
  if (!node) return undefined;
  if (typeof node === "string") return node;
  return typeof node.filename === "string" ? node.filename : undefined;
};

const usesFlatNodeList = (schema: Record<string, any>, normalizedPath: string) => {
  const nodeFilename = getNodeEntryFilename(schema);
  if (!nodeFilename) return false;
  if (normalizedPath !== normalizePath(schema.path || "")) return false;
  if (schema.name === EXCALIDRAW_COLLECTION) return true;
  return schema.view?.flatNodes === true;
};

const dedupeNodeEntries = (entries: any[]) => {
  const byPath = new Map<string, any>();
  for (const entry of entries) {
    const existing = byPath.get(entry.path);
    if (!existing || (!existing.content && entry.content)) {
      byPath.set(entry.path, entry);
    }
  }
  return Array.from(byPath.values());
};

const hydrateNodeEntryContent = async (
  entry: any,
  owner: string,
  repo: string,
  branch: string,
  token: string,
) => {
  if (entry.type !== "file" || entry.content) return entry;
  if (!isFilesystemRepoRef(owner, repo)) return entry;

  try {
    const file = await readDeferredFile(
      { owner, repo, branch },
      entry.path,
      { token },
    );
    return {
      ...entry,
      content: file.content,
      sha: file.sha ?? entry.sha,
      size: file.size ?? entry.size,
    };
  } catch {
    return entry;
  }
};

/** Recursively collect page-bundle node entries (e.g. index.md) as a flat list. */
const collectFlatNodeEntries = async (options: {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  schema: Record<string, any>;
}) => {
  const { owner, repo, branch, token, schema } = options;
  const root = normalizePath(schema.path || "");
  const nodeFilename = getNodeEntryFilename(schema);
  if (!root || !nodeFilename) return [];

  const collected: any[] = [];
  const queue = [root];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const dirPath = queue.shift()!;
    if (visited.has(dirPath)) continue;
    visited.add(dirPath);

    const entries = await getCollectionCache(
      owner,
      repo,
      branch,
      dirPath,
      token,
      nodeFilename,
    );

    for (const entry of entries) {
      if ((entry as { isNode?: boolean }).isNode) {
        collected.push(entry);
        continue;
      }
      if (entry.type === "dir" && normalizePath(entry.parentPath) === dirPath) {
        queue.push(entry.path);
      }
    }
  }

  const unique = dedupeNodeEntries(collected);
  return Promise.all(
    unique.map((entry) =>
      hydrateNodeEntryContent(entry, owner, repo, branch, token),
    ),
  );
};

export {
  collectFlatNodeEntries,
  getNodeEntryFilename,
  usesFlatNodeList,
};
