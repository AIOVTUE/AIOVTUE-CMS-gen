import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { hasAdminAccessAsync } from "@/lib/admin";
import { getRepoReadContext } from "@/lib/api-repo-context";
import {
  describeFilesystemRepoPath,
} from "@/lib/local-repo/config";
import {
  assertUsableWorkspacePath,
  browseWorkspacePath,
  getWorkspacePlaceholder,
  inspectWorkspacePath,
  setWorkspacePathOverride,
  type WorkspacePathInfo,
} from "@/lib/local-repo/workspace-path";
import { logServerError } from "@/lib/security/scrub-secrets";
import { resetProjectContentPages } from "@/lib/config-store";
import path from "node:path";
import type { User } from "@/types/user";

type RouteParams = {
  params: Promise<{ owner: string; repo: string; branch: string }>;
};

const assertWorkspaceAdmin = async (user: User) => {
  const allowAny =
    process.env.LOCAL_REPO_ALLOW_ANY_USER === "true" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.LOCAL_REPO_ALLOW_ANY_USER_IN_PRODUCTION === "true");
  if (!(await hasAdminAccessAsync(user)) && !allowAny) {
    throw createHttpError("Admin access required to change workspace path.", 403);
  }
};

const buildInfo = async (
  owner: string,
  repo: string,
): Promise<WorkspacePathInfo & { placeholder: string; canBrowse: boolean }> => {
  const described = describeFilesystemRepoPath(owner, repo);
  if (!described.path) {
    return {
      path: "",
      source: described.source,
      exists: false,
      writable: false,
      isGitRepo: false,
      placeholder: getWorkspacePlaceholder(),
      canBrowse: process.platform === "win32" || process.platform === "darwin",
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
  };
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { owner, repo, branch } = await params;
    await getRepoReadContext({ owner, repo, branch });
    const data = await buildInfo(owner, repo);
    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "workspace GET");
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { owner, repo, branch } = await params;
    const { user } = await getRepoReadContext({ owner, repo, branch });
    await assertWorkspaceAdmin(user);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const clear = Boolean((body as { clear?: unknown }).clear);
    const rawPath = (body as { path?: unknown }).path;

    if (clear) {
      await setWorkspacePathOverride(owner, repo, null);
      const data = await buildInfo(owner, repo);
      return Response.json({ status: "success", data });
    }

    if (typeof rawPath !== "string") {
      throw createHttpError("请提供本地目录路径。", 400);
    }

    const previous = describeFilesystemRepoPath(owner, repo).path;
    const inspected = await assertUsableWorkspacePath(rawPath);
    await setWorkspacePathOverride(owner, repo, inspected.path);
    const previousResolved = previous ? path.resolve(previous) : "";
    if (previousResolved !== path.resolve(inspected.path)) {
      await resetProjectContentPages(owner, repo, branch);
    }
    const data = await buildInfo(owner, repo);
    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "workspace PUT");
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { owner, repo, branch } = await params;
    const { user } = await getRepoReadContext({ owner, repo, branch });
    await assertWorkspaceAdmin(user);

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
    logServerError(error, "workspace POST");
    return toErrorResponse(error);
  }
}
