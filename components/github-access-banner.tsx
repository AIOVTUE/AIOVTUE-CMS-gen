"use client";

import { useGithubAccess } from "@/contexts/github-access-context";
import { GithubAuthorizePrompt } from "@/components/github-authorize-prompt";

/**
 * Content-area gate when GitHub access is missing/expired.
 * Replaces page content with the authorize prompt (or status message) only —
 * sidebar stays available for non-GitHub features.
 */
export function GithubAccessContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useGithubAccess();

  if (status === "ok") return <>{children}</>;

  if (status === "auth") {
    return (
      <GithubAuthorizePrompt
        className="relative inset-auto flex min-h-[min(60vh,32rem)] flex-1 rounded-lg border"
        title="需要重新连接 GitHub"
        description="GitHub 授权已过期或失效。请授权后继续访问仓库内容。"
      />
    );
  }

  if (status === "forbidden") {
    return (
      <GithubAuthorizePrompt
        className="relative inset-auto flex min-h-[min(60vh,32rem)] flex-1 rounded-lg border"
        title="没有权限访问当前仓库"
        description="当前会话无法访问此仓库（常见于授权过期）。请授权 GitHub 后重试。"
      />
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex min-h-[min(60vh,32rem)] flex-1 items-center justify-center rounded-lg border p-6 text-center text-sm">
        <div className="max-w-md space-y-1">
          <div className="font-medium">找不到仓库</div>
          <p className="text-muted-foreground">
            该仓库可能已被删除、重命名，或 URL 不正确。
          </p>
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="flex min-h-[min(60vh,32rem)] flex-1 items-center justify-center rounded-lg border p-6 text-center text-sm">
        <div className="max-w-md space-y-1">
          <div className="font-medium">空仓库</div>
          <p className="text-muted-foreground">
            请先在 GitHub 上创建分支后再使用仓库内容。
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** @deprecated Use GithubAccessContent — banner+children layout removed. */
export function GithubAccessBanner() {
  return null;
}
