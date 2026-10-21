"use client";

import { repoHref } from "@/lib/repo-href";

export type DefaultRepo = {
  owner: string;
  repo: string;
  branch: string;
};

const STORAGE_KEY = "pagescms.defaultRepo";

const getDefaultRepo = (): DefaultRepo | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DefaultRepo>;
    if (!parsed?.owner || !parsed?.repo || !parsed?.branch) return null;
    return {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch,
    };
  } catch {
    return null;
  }
};

const setDefaultRepo = (owner: string, repo: string, branch: string) => {
  try {
    const next: DefaultRepo = { owner, repo, branch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Failed to save default repository", error);
  }
};

const clearDefaultRepo = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear default repository", error);
  }
};

const getRepoBasePath = (repo: DefaultRepo) =>
  repoHref(repo.owner, repo.repo, repo.branch);

const getDefaultRepoPath = () => {
  const current = getDefaultRepo();
  if (!current) return null;
  // Branch root resolves to first content page (or configuration).
  return getRepoBasePath(current);
};

export {
  getDefaultRepo,
  setDefaultRepo,
  clearDefaultRepo,
  getDefaultRepoPath,
  getRepoBasePath,
};
