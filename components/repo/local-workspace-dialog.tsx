"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { requireApiSuccess } from "@/lib/api-client";
import { encodeRepoRestPath } from "@/lib/repo-href";
import type { ApiSuccess } from "@/types/api";
import { useConfigOptional } from "@/contexts/config-context";
import { useRepoOptional } from "@/contexts/repo-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FolderOpen, Loader2 } from "lucide-react";

type WorkspaceData = {
  path: string;
  source: "override" | "env" | "unset";
  exists: boolean;
  writable: boolean;
  isGitRepo: boolean;
  placeholder: string;
  canBrowse: boolean;
  available?: boolean;
  href?: string;
};

const sourceLabel = (source: WorkspaceData["source"]) => {
  if (source === "override") return "已选择";
  if (source === "env") return "环境变量";
  return "未选择";
};

type LocalWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Use `/api/local-repo/workspace` (session-only, no GitHub token).
   * After save, navigate to the local project home.
   */
  localProject?: boolean;
};

export function LocalWorkspaceDialog({
  open,
  onOpenChange,
  localProject = false,
}: LocalWorkspaceDialogProps) {
  const repoCtx = useRepoOptional();
  const configCtx = useConfigOptional();
  const owner = repoCtx?.owner ?? "";
  const repo = repoCtx?.repo ?? "";
  const branch = configCtx?.config?.branch ?? "";
  const isLocalOwner =
    localProject || owner.toLowerCase() === "local";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [draftPath, setDraftPath] = useState("");
  const [info, setInfo] = useState<WorkspaceData | null>(null);

  const apiBase = useMemo(() => {
    // Prefer the session-only endpoint for local repos — avoids colliding with
    // page segments under /[owner]/[repo]/[branch]/… in the Next.js router.
    if (localProject || owner === "local") return "/api/local-repo/workspace";
    if (owner && repo && branch) {
      return `/api/${owner}/${repo}/${encodeURIComponent(branch)}/workspace`;
    }
    return null;
  }, [branch, localProject, owner, repo]);

  const load = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const response = await fetch(apiBase);
      const payload = await requireApiSuccess<ApiSuccess<WorkspaceData>>(
        response,
        "加载本地目录失败",
      );
      setInfo(payload.data);
      setDraftPath(payload.data.path || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载本地目录失败");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleBrowse = async () => {
    if (!apiBase) return;
    setBrowsing(true);
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "browse" }),
      });
      const payload = await requireApiSuccess<
        ApiSuccess<{
          cancelled: boolean;
          path: string | null;
          canBrowse?: boolean;
        }>
      >(response, "打开目录选择器失败");
      if (payload.data.cancelled || !payload.data.path) {
        if (payload.data.canBrowse === false) {
          toast.message("当前环境不支持系统目录选择，请手动输入路径。");
        }
        return;
      }
      setDraftPath(payload.data.path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开目录选择器失败");
    } finally {
      setBrowsing(false);
    }
  };

  const handleSave = async () => {
    if (!apiBase) return;
    setSaving(true);
    try {
      const response = await fetch(apiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: draftPath }),
      });
      const payload = await requireApiSuccess<ApiSuccess<WorkspaceData>>(
        response,
        "保存本地目录失败",
      );
      setInfo(payload.data);
      setDraftPath(payload.data.path);
      toast.success("已设置本地项目目录");
      onOpenChange(false);
      const href = payload.data.href?.trim();
      if (href && (localProject || isLocalOwner)) {
        // Preserve page under the branch; re-encode rest so Chinese / *.ts
        // paths stay on a stable form (avoids soft-nav → root 页面未找到).
        const rest = encodeRepoRestPath(window.location.pathname);
        window.location.assign(`${href.replace(/\/$/, "")}${rest}`);
        return;
      }
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存本地目录失败");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!apiBase) return;
    setSaving(true);
    try {
      const response = await fetch(apiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const payload = await requireApiSuccess<ApiSuccess<WorkspaceData>>(
        response,
        "清除本地目录失败",
      );
      setInfo(payload.data);
      setDraftPath(payload.data.path || "");
      toast.success("已清除本地目录");
      onOpenChange(false);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清除本地目录失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {localProject ? "选择本地项目" : "选择本地项目目录"}
          </DialogTitle>
          <DialogDescription>
            {isLocalOwner
              ? "请手动选择本机项目目录，CMS 将从此目录读写博客文件。无默认路径。"
              : "为当前仓库绑定本机目录（用于 Git 历史等本地能力）。线上编辑仍按原有方式暂存；路径需是 CMS 服务器可访问的绝对路径。"}
          </DialogDescription>
        </DialogHeader>

        {loading && !info ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="space-y-3">
            {info ? (
              <p className="text-muted-foreground text-xs">
                当前来源：{sourceLabel(info.source)}
                {info.source === "unset"
                  ? " · 请选择目录后保存"
                  : info.exists
                    ? " · 目录可用"
                    : " · 目录不存在"}
                {info.isGitRepo ? " · 含 .git" : ""}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={draftPath}
                placeholder={info?.placeholder || "绝对路径"}
                className="font-mono text-xs"
                onChange={(event) => setDraftPath(event.target.value)}
              />
              {info?.canBrowse !== false ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={browsing || saving}
                  onClick={() => void handleBrowse()}
                  title="浏览文件夹"
                >
                  {browsing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FolderOpen className="size-4" />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {info?.source === "override" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => void handleClear()}
            >
              清除选择
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || !draftPath.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : localProject ? (
              "打开项目"
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
