import "server-only";

import { isLocalRepoRef, usesDbStagedStorage } from "@/lib/local-repo/config";
import {
  deleteRepoFile,
  hashContent as contentSha,
  pruneEmptyParentDirs,
  readRepoFile,
  renameRepoFile,
  writeRepoFileBuffer,
} from "@/lib/local-repo/fs";
import { resolveCurrentSha as resolveDbSha } from "@/lib/staged-writes/read";
import {
  upsertStagedWrite,
  type RepoBranchRef,
} from "@/lib/staged-writes/store";

const saveDeferredFile = async (
  ref: RepoBranchRef,
  path: string,
  content: Buffer,
  options?: { sha?: string; token?: string; isNew?: boolean },
) => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    const fsRef = { owner: ref.owner, repo: ref.repo };
    if (options?.sha) {
      const existing = await readRepoFile(path, fsRef);
      if (existing.sha !== options.sha) {
        const error: any = new Error("File has changed.");
        error.status = 409;
        throw error;
      }
    }
    const saved = await writeRepoFileBuffer(path, fsRef, content);
    return {
      path: saved.path,
      sha: saved.sha,
      size: saved.size,
      updatedAt: saved.updatedAt,
    };
  }

  if (!usesDbStagedStorage(ref.owner, ref.repo)) {
    throw new Error("Not a deferred-commit repo.");
  }

  const currentSha = await resolveDbSha(ref, path, options?.token);
  if (options?.sha && currentSha && options.sha !== currentSha) {
    const error: any = new Error("File has changed.");
    error.status = 409;
    throw error;
  }

  const operation = options?.isNew || !currentSha ? "add" : "modify";
  await upsertStagedWrite(ref, path, {
    operation,
    content,
    baseSha: options?.sha ?? currentSha ?? undefined,
  });

  return {
    path,
    sha: contentSha(content),
    size: content.byteLength,
    updatedAt: new Date(),
  };
};

const deleteDeferredFile = async (
  ref: RepoBranchRef,
  path: string,
  options?: { sha?: string; token?: string },
) => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    const fsRef = { owner: ref.owner, repo: ref.repo };
    const existing = await readRepoFile(path, fsRef);
    if (options?.sha && existing.sha !== options.sha) {
      throw Object.assign(new Error("File has changed."), { status: 409 });
    }
    await deleteRepoFile(path, fsRef);
    await pruneEmptyParentDirs(path, fsRef);
    return { path, sha: existing.sha };
  }

  const currentSha = await resolveDbSha(ref, path, options?.token);
  if (options?.sha && currentSha && options.sha !== currentSha) {
    throw Object.assign(new Error("File has changed."), { status: 409 });
  }

  await upsertStagedWrite(ref, path, {
    operation: "delete",
    baseSha: options?.sha ?? currentSha ?? undefined,
  });

  return { path, sha: currentSha ?? options?.sha ?? null };
};

const renameDeferredFile = async (
  ref: RepoBranchRef,
  fromPath: string,
  toPath: string,
  options?: { token?: string },
) => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    const renamed = await renameRepoFile(fromPath, toPath, {
      owner: ref.owner,
      repo: ref.repo,
    });
    return { path: renamed.path, newPath: renamed.newPath, sha: renamed.sha };
  }

  const { readDeferredFile } = await import("@/lib/staged-writes/read");
  const file = await readDeferredFile(ref, fromPath, { token: options?.token });

  await upsertStagedWrite(ref, fromPath, {
    operation: "rename",
    content: file.buffer,
    newPath: toPath,
    baseSha: file.sha,
  });

  return { path: fromPath, newPath: toPath, sha: contentSha(file.buffer) };
};

export { saveDeferredFile, deleteDeferredFile, renameDeferredFile };
