import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getFilesystemRepoPath } from "@/lib/local-repo/config";

type RepoFsRef = {
  owner: string;
  repo: string;
};

const normalizeRepoPath = (repoPath: string) =>
  repoPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\0/g, "");

const isUnderRoot = (absolute: string, root: string) => {
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  return absolute === root || absolute.startsWith(rootWithSep);
};

/**
 * Resolve a repo-relative path under the workspace root.
 * Uses realpath on the root (and on the target when it exists) so symlinks
 * cannot escape the configured workspace.
 */
const resolveRepoPath = async (repoPath: string, ref: RepoFsRef) => {
  if (repoPath.includes("\0")) {
    throw new Error(`Invalid path "${repoPath}".`);
  }

  const configuredRoot = path.resolve(getFilesystemRepoPath(ref.owner, ref.repo));
  let root: string;
  try {
    root = await fs.realpath(configuredRoot);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      root = configuredRoot;
    } else {
      throw error;
    }
  }

  const normalized = normalizeRepoPath(repoPath);
  // Empty path = workspace root (folder picker / browse starts here).
  if (!normalized) {
    return root;
  }

  // Reject Windows drive / UNC / absolute inputs before resolve.
  if (
    path.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.startsWith("//")
  ) {
    throw new Error(`Invalid path "${repoPath}".`);
  }

  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.win32.isAbsolute(relative) ||
    !isUnderRoot(absolute, root)
  ) {
    throw new Error(`Invalid path "${repoPath}".`);
  }

  // If the path (or an ancestor) exists, realpath must still stay under root.
  try {
    const real = await fs.realpath(absolute);
    if (!isUnderRoot(real, root)) {
      throw new Error(`Invalid path "${repoPath}".`);
    }
    return real;
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  // Walk existing ancestors so a symlink in the path cannot escape.
  let cursor = path.dirname(absolute);
  while (cursor && cursor !== root && isUnderRoot(cursor, root)) {
    try {
      const realCursor = await fs.realpath(cursor);
      if (!isUnderRoot(realCursor, root)) {
        throw new Error(`Invalid path "${repoPath}".`);
      }
      const suffix = path.relative(cursor, absolute);
      const rebuilt = path.resolve(realCursor, suffix);
      if (!isUnderRoot(rebuilt, root)) {
        throw new Error(`Invalid path "${repoPath}".`);
      }
      return rebuilt;
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  }

  return absolute;
};

const hashContent = (content: string | Buffer) =>
  createHash("sha1").update(content).digest("hex");

const readRepoFile = async (repoPath: string, ref: RepoFsRef) => {
  const absolute = await resolveRepoPath(repoPath, ref);
  const buffer = await fs.readFile(absolute);
  const stat = await fs.stat(absolute);

  return {
    path: normalizeRepoPath(repoPath),
    /** UTF-8 view for text files; do not use for binary (images, etc.). */
    content: buffer.toString("utf8"),
    buffer,
    sha: hashContent(buffer),
    size: buffer.byteLength,
    updatedAt: stat.mtime,
  };
};

const writeRepoFile = async (repoPath: string, ref: RepoFsRef, content: string) =>
  writeRepoFileBuffer(repoPath, ref, Buffer.from(content, "utf8"));

const writeRepoFileBuffer = async (
  repoPath: string,
  ref: RepoFsRef,
  content: Buffer,
) => {
  const absolute = await resolveRepoPath(repoPath, ref);
  // Refuse writing through a symlink leaf (escape / confuse audit trails).
  try {
    const lst = await fs.lstat(absolute);
    if (lst.isSymbolicLink()) {
      throw new Error(`Invalid path "${repoPath}".`);
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content);
  const stat = await fs.stat(absolute);

  return {
    path: normalizeRepoPath(repoPath),
    content,
    sha: hashContent(content),
    size: content.byteLength,
    updatedAt: stat.mtime,
  };
};

const deleteRepoFile = async (repoPath: string, ref: RepoFsRef) => {
  const absolute = await resolveRepoPath(repoPath, ref);
  await fs.unlink(absolute);
};

/**
 * Remove empty parent directories after a file delete, up to (but not including) the repo root.
 * Ensures folder rows disappear from listings once their contents are gone.
 */
const pruneEmptyParentDirs = async (repoPath: string, ref: RepoFsRef) => {
  const configuredRoot = path.resolve(getFilesystemRepoPath(ref.owner, ref.repo));
  let root: string;
  try {
    root = await fs.realpath(configuredRoot);
  } catch {
    root = configuredRoot;
  }
  let current = path.dirname(await resolveRepoPath(repoPath, ref));

  while (isUnderRoot(current, root) && current !== root) {
    let entries: string[];
    try {
      entries = await fs.readdir(current);
    } catch (error: any) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (entries.length > 0) break;
    await fs.rmdir(current);
    current = path.dirname(current);
  }
};

const renameRepoFile = async (fromPath: string, toPath: string, ref: RepoFsRef) => {
  const fromAbsolute = await resolveRepoPath(fromPath, ref);
  const toAbsolute = await resolveRepoPath(toPath, ref);
  await fs.mkdir(path.dirname(toAbsolute), { recursive: true });
  await fs.rename(fromAbsolute, toAbsolute);
  const file = await readRepoFile(toPath, ref);

  return {
    path: normalizeRepoPath(fromPath),
    newPath: file.path,
    sha: file.sha,
  };
};

const pathExists = async (repoPath: string, ref: RepoFsRef) => {
  try {
    await fs.access(await resolveRepoPath(repoPath, ref));
    return true;
  } catch {
    return false;
  }
};

const listRepoDirectory = async (repoPath: string, ref: RepoFsRef) => {
  const absolute = await resolveRepoPath(repoPath, ref);
  let entries;

  try {
    entries = await fs.readdir(absolute, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const parentPath = normalizeRepoPath(repoPath);

  return entries
    .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
    .map((entry) => {
      const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      return {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? ("dir" as const) : ("file" as const),
      };
    });
};

export type { RepoFsRef };
export {
  normalizeRepoPath,
  resolveRepoPath,
  hashContent,
  readRepoFile,
  writeRepoFile,
  writeRepoFileBuffer,
  deleteRepoFile,
  pruneEmptyParentDirs,
  renameRepoFile,
  pathExists,
  listRepoDirectory,
};
