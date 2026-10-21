"use client";

import { useEffect, useMemo, useState } from "react";
import { getRawUrl } from "@/lib/github-image";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";
import { extensionCategories, getFileExtension, getFileName } from "@/lib/utils/file";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ban, Loader } from "lucide-react";

const VIDEO_EXTENSIONS = new Set(
  (extensionCategories.video || []).map((ext) => ext.toLowerCase()),
);

const isVideoPath = (path: string) =>
  VIDEO_EXTENSIONS.has(getFileExtension(path).toLowerCase());

type MediaPreviewProps = {
  mediaName: string;
  path: string | null;
  /** Prefer list-API url when available. */
  src?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MediaPreview = ({
  mediaName,
  path,
  src,
  open,
  onOpenChange,
}: MediaPreviewProps) => {
  const { owner, repo, isPrivate } = useRepo();
  const { config } = useConfig();
  const branch = config?.branch!;
  const [rawUrl, setRawUrl] = useState<string | null>(src ?? null);
  const [error, setError] = useState<string | null>(null);
  const isVideo = useMemo(() => (path ? isVideoPath(path) : false), [path]);
  const title = path ? getFileName(path) : "预览";

  useEffect(() => {
    if (!open || !path) {
      setRawUrl(null);
      setError(null);
      return;
    }

    if (src) {
      setRawUrl(src);
      setError(null);
      return;
    }

    let cancelled = false;
    setRawUrl(null);
    setError(null);

    void (async () => {
      try {
        const url = await getRawUrl(owner, repo, branch, mediaName, path, isPrivate);
        if (!cancelled) {
          if (!url) setError("无法获取预览地址");
          else setRawUrl(url);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "预览加载失败");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, path, src, owner, repo, branch, mediaName, isPrivate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(100dvh-2rem,56rem)] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="bg-muted/40 flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-4">
          {error ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Ban className="size-4" />
              <span>{error}</span>
            </div>
          ) : !rawUrl ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader className="size-4 animate-spin" />
              <span>加载中…</span>
            </div>
          ) : isVideo ? (
            <video
              key={rawUrl}
              src={rawUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[min(80dvh,48rem)] max-w-full rounded-md bg-black"
            />
          ) : (
            // Dynamic repo media URLs; next/image is not suitable here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={rawUrl}
              src={rawUrl}
              alt={title}
              className="max-h-[min(80dvh,48rem)] max-w-full rounded-md object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { MediaPreview, isVideoPath };
