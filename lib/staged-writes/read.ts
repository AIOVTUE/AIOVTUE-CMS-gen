import "server-only";

import { createHttpError } from "@/lib/api-error";
import { isLocalRepoRef, usesDbStagedStorage } from "@/lib/local-repo/config";
import { readRepoFile } from "@/lib/local-repo/fs";
import { createOctokitInstance } from "@/lib/utils/octokit";
import {
  contentSha,
  decodeContent,
  getStagedWrite,
  type RepoBranchRef,
} from "@/lib/staged-writes/store";

type ResolvedFile = {
  path: string;
  content: string;
  buffer: Buffer;
  sha: string;
  size: number;
  updatedAt: Date;
  fromStaged: boolean;
};

const readGithubFile = async (
  ref: RepoBranchRef,
  path: string,
  token: string,
): Promise<ResolvedFile | null> => {
  const octokit = createOctokitInstance(token);
  try {
    const response = await octokit.rest.repos.getContent({
      owner: ref.owner,
      repo: ref.repo,
      path,
      ref: ref.branch,
    });
    if (Array.isArray(response.data) || response.data.type !== "file") {
      return null;
    }
    const buffer = Buffer.from(response.data.content, "base64");
    return {
      path,
      content: buffer.toString("utf8"),
      buffer,
      sha: response.data.sha,
      size: response.data.size,
      updatedAt: new Date(),
      fromStaged: false,
    };
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
};

const readBaseFile = async (
  ref: RepoBranchRef,
  path: string,
  token?: string,
): Promise<ResolvedFile | null> => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    try {
      const file = await readRepoFile(path, { owner: ref.owner, repo: ref.repo });
      return {
        path: file.path,
        content: file.content,
        buffer: file.buffer,
        sha: file.sha,
        size: file.size,
        updatedAt: file.updatedAt,
        fromStaged: false,
      };
    } catch (error: any) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  if (!token) return null;
  return readGithubFile(ref, path, token);
};

const readDeferredFile = async (
  ref: RepoBranchRef,
  path: string,
  options?: { token?: string; expectedSha?: string },
): Promise<ResolvedFile> => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    const base = await readBaseFile(ref, path, options?.token);
    if (!base) throw createHttpError("Not found", 404);
    if (options?.expectedSha && options.expectedSha !== base.sha) {
      throw createHttpError("File has changed.", 409);
    }
    return base;
  }

  if (usesDbStagedStorage(ref.owner, ref.repo)) {
    const staged = await getStagedWrite(ref, path);

    if (staged?.operation === "delete") {
      throw createHttpError("Not found", 404);
    }

    if (staged && (staged.operation === "add" || staged.operation === "modify")) {
      const buffer = decodeContent(staged);
      const sha = contentSha(buffer);
      if (options?.expectedSha && options.expectedSha !== sha) {
        throw createHttpError("File has changed.", 409);
      }
      return {
        path,
        content: buffer.toString("utf8"),
        buffer,
        sha,
        size: buffer.byteLength,
        updatedAt: staged.updatedAt,
        fromStaged: true,
      };
    }
  }

  const base = await readBaseFile(ref, path, options?.token);
  if (!base) {
    throw createHttpError("Not found", 404);
  }

  if (options?.expectedSha && options.expectedSha !== base.sha) {
    throw createHttpError("File has changed.", 409);
  }

  return base;
};

const resolveCurrentSha = async (
  ref: RepoBranchRef,
  path: string,
  token?: string,
): Promise<string | null> => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    const base = await readBaseFile(ref, path, token);
    return base?.sha ?? null;
  }

  if (usesDbStagedStorage(ref.owner, ref.repo)) {
    const staged = await getStagedWrite(ref, path);
    if (staged?.operation === "delete") return staged.baseSha ?? null;
    if (staged && staged.operation !== "rename") {
      return contentSha(decodeContent(staged));
    }
  }

  const base = await readBaseFile(ref, path, token);
  return base?.sha ?? null;
};

export type { ResolvedFile };
export { readDeferredFile, readBaseFile, resolveCurrentSha };
