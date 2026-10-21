"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { getAuthCallbackURL, getSafeRedirect } from "@/lib/auth-redirect";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { LocalWorkspaceDialog } from "@/components/repo/local-workspace-dialog";
import { FolderOpen, Github, Loader } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type GithubAuthorizePromptProps = {
  title?: string;
  description?: string;
  className?: string;
  /** Show “选择本地仓库” (default true). */
  showLocalRepo?: boolean;
};

/**
 * Shown when the current session cannot access a repo because GitHub OAuth
 * is missing or expired (common after long-lived email-only sessions).
 */
const GithubAuthorizePrompt = ({
  title = "需要 GitHub 授权",
  description = "当前登录方式无法访问该仓库（常见于邮箱登录且 GitHub 授权过期）。请授权 GitHub 后继续。",
  className,
  showLocalRepo = true,
}: GithubAuthorizePromptProps) => {
  const [loading, setLoading] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);

  const handleAuthorizeGithub = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const returnTo = getSafeRedirect(
        `${window.location.pathname}${window.location.search}`,
      );
      const callbackURL = getAuthCallbackURL(returnTo);
      const errorCallbackURL =
        returnTo === "/"
          ? "/sign-in"
          : `/sign-in?redirect=${encodeURIComponent(returnTo)}`;

      const result = await signIn.social({
        provider: "github",
        callbackURL,
        errorCallbackURL,
        disableRedirect: true,
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        setLoading(false);
        return;
      }

      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }

      toast.error("无法启动 GitHub 授权，请重试。");
      setLoading(false);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "无法启动 GitHub 授权。",
      );
      setLoading(false);
    }
  };

  return (
    <>
      <Empty className={cn("absolute inset-0 rounded-none border-0", className)}>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          <Button
            variant="default"
            onClick={() => void handleAuthorizeGithub()}
            disabled={loading}
          >
            <Github className="size-4" />
            授权 GitHub
            {loading && <Loader className="size-4 animate-spin" />}
          </Button>
          {showLocalRepo ? (
            <Button
              variant="outline"
              onClick={() => setLocalOpen(true)}
              disabled={loading}
            >
              <FolderOpen className="size-4" />
              选择本地仓库
            </Button>
          ) : null}
        </EmptyContent>
      </Empty>
      {showLocalRepo ? (
        <LocalWorkspaceDialog
          open={localOpen}
          onOpenChange={setLocalOpen}
          localProject
        />
      ) : null}
    </>
  );
};

export { GithubAuthorizePrompt };
