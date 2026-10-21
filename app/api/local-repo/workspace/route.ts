import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { hasAdminAccessAsync } from "@/lib/admin";
import {
  describeFilesystemRepoPath,
  getLocalProjectPath,
  getLocalRepoRef,
  isLocalRepoMode,
} from "@/lib/local-repo/config";
import {
  assertUsableWorkspacePath,
  browseWorkspacePath,
  getWorkspacePlaceholder,
  inspectWorkspacePath,
  localRepoNameFromPath,
  setActiveLocalRepoName,
  setWorkspacePathOverride,
  type WorkspacePathInfo,
} from "@/lib/local-repo/workspace-path";
import { requireApiUserSession } from "@/lib/session-server";
import { logServerError } from "@/lib/security/scrub-secrets";
import { resetProjectContentPages } from "@/lib/config-store";
import path from "node:path";
import type { User } from "@/types/user";

/**
 * Workspace picker for the synthetic local repo.
 * Remount / browse require admin (or LOCAL_REPO_ALLOW_ANY_USER).
 */

const assertWorkspaceAdmin = async (user: User) => {
  const allowAny =
    process.env.LOCAL_REPO_ALLOW_ANY_USER === "true" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.LOCAL_REPO_ALLOW_ANY_USER_IN_PRODUCTION === "true");
  if (!(await hasAdminAccessAsync(user)) && !allowAny) {
    throw createHttpError("Admin access required to change workspace path.", 403);
  }
};

const buildInfo = async (): Promise<
  WorkspacePathInfo & {
    placeholder: string;
    canBrowse: boolean;
    available: boolean;
    owner: string;
    repo: string;
    branch: string;
    href: string;
  }
> => {
  const ref = getLocalRepoRef();
  const described = describeFilesystemRepoPath(ref.owner, ref.repo);
  if (!described.path) {
    return {
      path: "",
      source: described.source,
      exists: false,
      writable: false,
      isGitRepo: false,
      placeholder: getWorkspacePlaceholder(),
      canBrowse: process.platform === "win32" || process.platform === "darwin",
      available: isLocalRepoMode(),
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      href: getLocalProjectPath(),
    };
  }
  const inspected = await inspectWorkspacePath(described.path);
  return {
    path: inspected.path,
    source: described.source,
    exists: inspected.exists,
    writable: inspected.writable,
    isGitRepo: inspected.isGitRepo,
    placeholder: getWorkspacePlaceholder(),
    canBrowse: process.platform === "win32" || process.platform === "darwin",
    available: isLocalRepoMode(),
    owner: ref.owner,
    repo: ref.repo,
    branch: ref.branch,
    href: getLocalProjectPath(),
  };
};

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const data = await buildInfo();
    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "local-repo/workspace GET");
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    await assertWorkspaceAdmin(sessionResult.user as User);

    if (!isLocalRepoMode()) {
      throw createHttpError(
        "未启用本地仓库模式（LOCAL_REPO_MODE）。请在服务器配置中开启后再试。",
        400,
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const previousRef = getLocalRepoRef();
    const clear = Boolean((body as { clear?: unknown }).clear);
    const rawPath = (body as { path?: unknown }).path;

    if (clear) {
      await setWorkspacePathOverride(previousRef.owner, previousRef.repo, null);
      await setActiveLocalRepoName(null);
      const data = await buildInfo();
      return Response.json({ status: "success", data });
    }

    if (typeof rawPath !== "string") {
      throw createHttpError("请提供本地目录路径。", 400);
    }

    const previousPath = describeFilesystemRepoPath(
      previousRef.owner,
      previousRef.repo,
    ).path;
    const inspected = await assertUsableWorkspacePath(rawPath);
    const nextRepo = localRepoNameFromPath(inspected.path);

    // Bind path under folder-named slug and point the active local project at it.
    if (
      previousRef.repo.toLowerCase() !== nextRepo.toLowerCase()
    ) {
      await setWorkspacePathOverride(previousRef.owner, previousRef.repo, null);
    }
    await setWorkspacePathOverride(previousRef.owner, nextRepo, inspected.path);
    await setActiveLocalRepoName(nextRepo);

    const previousResolved = previousPath ? path.resolve(previousPath) : "";
    if (previousResolved !== path.resolve(inspected.path)) {
      await resetProjectContentPages(
        previousRef.owner,
        nextRepo,
        previousRef.branch,
      );
    }

    const data = await buildInfo();
    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "local-repo/workspace PUT");
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    await assertWorkspaceAdmin(sessionResult.user as User);

    const body = await request.json().catch(() => ({}));
    const action =
      body && typeof body === "object" && typeof (body as { action?: unknown }).action === "string"
        ? (body as { action: string }).action
        : "browse";

    if (action !== "browse") {
      throw createHttpError("Unsupported action.", 400);
    }

    const selected = await browseWorkspacePath();
    if (!selected) {
      return Response.json({
        status: "success",
        data: {
          cancelled: true,
          path: null as string | null,
          canBrowse: process.platform === "win32" || process.platform === "darwin",
        },
      });
    }

    const inspected = await inspectWorkspacePath(selected);
    return Response.json({
      status: "success",
      data: {
        cancelled: false,
        path: inspected.path,
        exists: inspected.exists,
        writable: inspected.writable,
        isGitRepo: inspected.isGitRepo,
        canBrowse: true,
      },
    });
  } catch (error: unknown) {
    logServerError(error, "local-repo/workspace POST");
    return toErrorResponse(error);
  }
}
