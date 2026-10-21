"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Loader } from "lucide-react";
import { toast } from "sonner";
import { useConfig } from "@/contexts/config-context";
import { describePendingChange } from "@/components/repo/pending-change-label";
import { usePublishStatus } from "@/components/repo/use-publish-status";
import { notifyCmsLocalSave } from "@/lib/cms-client-events";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PublishDialogContextValue = {
  openPublishDialog: () => void;
};

const PublishDialogContext = createContext<PublishDialogContextValue | null>(
  null,
);

function PublishDialogProvider({ children }: { children: ReactNode }) {
  const { config } = useConfig();
  const { isMobile, setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");

  const owner = config?.owner ?? "";
  const repo = config?.repo ?? "";
  const branch = config?.branch ?? "";
  const { status, loading, refresh, canAct, apiBase } = usePublishStatus(
    owner,
    repo,
    branch,
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setMessage("");
  }, []);

  const openPublishDialog = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    void refresh();
    window.setTimeout(() => setOpen(true), isMobile ? 160 : 0);
  }, [isMobile, refresh, setOpenMobile]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      const json = await response.json();
      if (!response.ok || json.status === "error") {
        throw new Error(json.message || "提交失败");
      }
      toast.success(json.message || "已提交到 GitHub");
      handleOpenChange(false);
      notifyCmsLocalSave();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setPublishing(false);
    }
  };

  const value = useMemo(
    () => ({ openPublishDialog }),
    [openPublishDialog],
  );

  return (
    <PublishDialogContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[min(100dvh-2rem,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6 sm:py-4">
            <DialogTitle>发布修改</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
            <div className="grid gap-1.5">
              <Label htmlFor="publish-message">提交说明（可选）</Label>
              <Input
                id="publish-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="例如：更新周刊与动态"
              />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              {!status || (loading && !status.files.length) ? (
                <p className="text-muted-foreground">正在检查更改…</p>
              ) : !status.dirty ? (
                <p className="text-muted-foreground">当前没有待提交的更改。</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">
                    待提交文件（{status.files.length}）
                  </p>
                  <ul className="max-h-[min(40dvh,14rem)] space-y-1.5 overflow-y-auto overscroll-contain">
                    {status.files.slice(0, 30).map((file) => {
                      const info = describePendingChange(
                        file,
                        config?.object as Record<string, unknown> | null,
                      );
                      return (
                        <li
                          key={file.path}
                          className="flex min-w-0 items-start gap-2 rounded-md bg-background/80 px-2 py-1.5"
                        >
                          <span className="bg-muted text-foreground shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none">
                            {info.opLabel}
                          </span>
                          <span className="text-muted-foreground min-w-0 flex-1 break-all font-mono text-xs leading-snug">
                            {info.path}
                          </span>
                        </li>
                      );
                    })}
                    {status.files.length > 30 ? (
                      <li className="text-muted-foreground text-xs">
                        …还有 {status.files.length - 30} 个文件
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={publishing}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void handlePublish()}
              disabled={!canAct || publishing}
            >
              {publishing ? (
                <>
                  <Loader className="animate-spin" />
                  提交中…
                </>
              ) : (
                "确认发布"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublishDialogContext.Provider>
  );
}

function usePublishDialog() {
  const context = useContext(PublishDialogContext);
  if (!context) {
    throw new Error("usePublishDialog must be used within PublishDialogProvider");
  }
  return context;
}

export { PublishDialogProvider, usePublishDialog };
