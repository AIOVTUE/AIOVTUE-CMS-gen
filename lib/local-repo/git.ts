import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import {
  getFilesystemRepoBranch,
  getFilesystemRepoPath,
} from "@/lib/local-repo/config";

const execFileAsync = promisify(execFile);

type GitStatusFile = {
  path: string;
  status: string;
};

type GitStatus = {
  branch: string;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  dirty: boolean;
};

type GitRepoRef = {
  owner: string;
  repo: string;
  branch: string;
};

const runGit = async (
  args: string[],
  ref: Pick<GitRepoRef, "owner" | "repo">,
  options?: { env?: NodeJS.ProcessEnv },
) => {
  const cwd = getFilesystemRepoPath(ref.owner, ref.repo);
  if (!fs.existsSync(cwd)) {
    throw new Error(
      `本地仓库目录不存在: ${cwd}。请在仓库菜单中「选择本地项目目录」。`,
    );
  }
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        ...options?.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });
    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "未找到 git 可执行文件。请安装 Git 并确保其已加入 PATH。",
      );
    }
    throw error;
  }
};

const parseStatusPorcelain = (output: string): GitStatusFile[] => {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const xy = line.slice(0, 2);
      const rest = line.slice(3);
      const path = rest.includes(" -> ") ? rest.split(" -> ").pop()!.trim() : rest;
      // Map porcelain XY to a single UI status (keep untracked as add).
      let status = "M";
      if (xy === "??" || xy.includes("A")) status = "A";
      else if (xy.includes("D")) status = "D";
      else if (xy.includes("R")) status = "R";
      else if (xy.includes("M")) status = "M";
      else status = xy.trim() || xy;
      return { path, status };
    });
};

const isGitRepository = (cwd: string) => {
  try {
    return (
      fs.existsSync(cwd) &&
      (fs.existsSync(`${cwd}/.git`) || fs.existsSync(`${cwd}\\.git`))
    );
  } catch {
    return false;
  }
};

const getGitStatus = async ({ owner, repo, branch }: GitRepoRef): Promise<GitStatus> => {
  const branchName = getFilesystemRepoBranch(owner, repo, branch);
  const ref = { owner, repo };
  const emptyStatus = (): GitStatus => ({
    branch: branchName,
    ahead: 0,
    behind: 0,
    files: [],
    dirty: false,
  });

  let cwd = "";
  try {
    cwd = getFilesystemRepoPath(owner, repo);
  } catch {
    return emptyStatus();
  }

  // Non-git folders should not 500 the sidebar publish poller.
  if (!isGitRepository(cwd)) {
    return emptyStatus();
  }

  let porcelain = "";
  try {
    ({ stdout: porcelain } = await runGit(["status", "--porcelain"], ref));
  } catch (error: any) {
    const message = String(error?.stderr || error?.message || "");
    if (/not a git repository/i.test(message)) {
      return emptyStatus();
    }
    throw error;
  }
  const files = parseStatusPorcelain(porcelain);

  let ahead = 0;
  let behind = 0;
  try {
    const { stdout: counts } = await runGit(
      ["rev-list", "--left-right", "--count", `HEAD...@{upstream}`],
      ref,
    );
    const [left, right] = counts.trim().split(/\s+/).map((n) => Number(n) || 0);
    ahead = left;
    behind = right;
  } catch {
    // No upstream yet — treat dirty working tree as needing publish.
  }

  return {
    branch: branchName,
    ahead,
    behind,
    files,
    dirty: files.length > 0 || ahead > 0,
  };
};

const discardLocalChanges = async (
  { owner, repo, branch }: GitRepoRef,
  options?: { path?: string },
) => {
  const ref = { owner, repo };
  const status = await getGitStatus({ owner, repo, branch });

  if (options?.path) {
    const target = options.path.replace(/\\/g, "/");
    const matched = status.files.filter(
      (file) => file.path === target || file.path.endsWith(`/${target}`),
    );
    if (matched.length === 0) {
      return { discarded: 0, paths: [] as string[] };
    }

    try {
      await runGit(["restore", "--worktree", "--staged", "--", target], ref);
    } catch {
      // Untracked or already clean — try clean.
    }
    try {
      await runGit(["clean", "-f", "--", target], ref);
    } catch {
      // Ignore if file was tracked-only.
    }

    return { discarded: 1, paths: [target] };
  }

  const paths = status.files.map((file) => file.path);
  if (paths.length === 0 && status.ahead === 0) {
    return { discarded: 0, paths: [] as string[] };
  }

  // Drop uncommitted working-tree + index changes. Do not rewrite published commits.
  await runGit(["reset", "--hard", "HEAD"], ref);
  await runGit(["clean", "-fd"], ref);

  return { discarded: paths.length, paths };
};

const getPushRemoteUrl = async (ref: Pick<GitRepoRef, "owner" | "repo">) => {
  const token =
    process.env.STAGED_REPO_GITHUB_TOKEN ||
    process.env.LOCAL_REPO_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    "";

  const { stdout } = await runGit(["remote", "get-url", "origin"], ref);
  const remoteUrl = stdout.trim();

  if (!token) return remoteUrl;

  try {
    const url = new URL(remoteUrl.replace(/^git@([^:]+):/, "https://$1/"));
    if (url.hostname.includes("github.com")) {
      url.username = "x-access-token";
      url.password = token;
      return url.toString();
    }
  } catch {
    // Fall through to original remote.
  }

  return remoteUrl;
};

const publishLocalRepo = async (
  { owner, repo, branch }: GitRepoRef,
  options?: { message?: string },
) => {
  const ref = { owner, repo };
  const branchName = getFilesystemRepoBranch(owner, repo, branch);
  const status = await getGitStatus({ owner, repo, branch });

  if (status.files.length > 0) {
    await runGit(["add", "-A"], ref);

    // Single-line message only — block option injection via newlines / leading dashes.
    const rawMessage =
      options?.message?.trim() ||
      `Publish CMS changes (${status.files.length} files)`;
    const message = rawMessage
      .replace(/[\r\n\0]/g, " ")
      .replace(/^-+/, "")
      .trim()
      .slice(0, 500) || `Publish CMS changes (${status.files.length} files)`;

    await runGit(
      [
        "-c",
        "user.name=Pages CMS",
        "-c",
        "user.email=cms@local.pagescms",
        "commit",
        "-m",
        message,
      ],
      ref,
    );
  }

  const afterCommit = await getGitStatus({ owner, repo, branch });
  if (
    afterCommit.files.length === 0 &&
    afterCommit.ahead === 0 &&
    status.files.length === 0 &&
    status.ahead === 0
  ) {
    return {
      published: false,
      reason: "clean" as const,
      files: [] as GitStatusFile[],
      commitMessage: null as string | null,
      commitSha: null as string | null,
    };
  }

  const remoteUrl = await getPushRemoteUrl(ref);
  await runGit(["push", remoteUrl, `HEAD:refs/heads/${branchName}`], ref);

  let commitSha: string | null = null;
  try {
    const { stdout } = await runGit(["rev-parse", "HEAD"], ref);
    commitSha = stdout.trim() || null;
  } catch {
    commitSha = null;
  }

  const finalStatus = await getGitStatus({ owner, repo, branch });
  return {
    published: true,
    reason: "ok" as const,
    files: status.files,
    commitMessage:
      options?.message?.trim() ||
      (status.files.length
        ? `Publish CMS changes (${status.files.length} files)`
        : "Push pending CMS commits"),
    commitSha,
    ahead: finalStatus.ahead,
  };
};

const getFileGitHistory = async (
  { owner, repo, branch }: GitRepoRef,
  filePath: string,
  limit = 20,
) => {
  const ref = { owner, repo };
  try {
    const { stdout } = await runGit(
      [
        "log",
        `--max-count=${limit}`,
        "--pretty=format:%H%x1f%an%x1f%ae%x1f%at%x1f%s",
        "--",
        filePath,
      ],
      ref,
    );

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha, name, email, timestamp, ...messageParts] = line.split("\x1f");
        const message = messageParts.join("\x1f");
        const date = new Date(Number(timestamp) * 1000).toISOString();
        return {
          sha,
          html_url: "",
          author: { login: name || email || undefined },
          commit: {
            message,
            author: {
              name: name || null,
              email: email || null,
              date,
            },
          },
        };
      });
  } catch {
    return [];
  }
};

export { getGitStatus, publishLocalRepo, getFileGitHistory, discardLocalChanges };
export type { GitStatus, GitStatusFile, GitRepoRef };
