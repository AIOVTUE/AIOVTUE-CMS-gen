"use client";

import { useEffect, useMemo, useState } from "react";
import { getRawUrl } from "@/lib/github-image";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";
import { cn } from "@/lib/utils";
import { extensionCategories, getFileExtension } from "@/lib/utils/file";
import { Ban, ImageOff, Loader, Play } from "lucide-react";

const VIDEO_EXTENSIONS = new Set(
  (extensionCategories.video || []).map((ext) => ext.toLowerCase()),
);

const isVideoPath = (path: string | null) => {
  if (!path) return false;
  return VIDEO_EXTENSIONS.has(getFileExtension(path).toLowerCase());
};

export function Thumbnail({
  name,
  path,
  src,
  className,
}: {
  name: string;
  path: string | null;
  /** Prefer list-API url to avoid per-tile getRawUrl fan-out. */
  src?: string | null;
  className?: string;
}) {
  const [rawUrl, setRawUrl] = useState<string | null>(src ?? null);
  const [error, setError] = useState<string | null>(null);
  const isVideo = useMemo(() => isVideoPath(path), [path]);

  const { owner, repo, isPrivate } = useRepo();
  const { config } = useConfig();
  const branch = config?.branch!;

  useEffect(() => {
    let cancelled = false;

    if (!path) {
      setRawUrl(null);
      setError(null);
      return;
    }

    if (src) {
      setRawUrl(src);
      setError(null);
      return;
    }

    setError(null);
    setRawUrl(null);
    void (async () => {
      try {
        const url = await getRawUrl(owner, repo, branch, name, path, isPrivate);
        if (!cancelled) setRawUrl(url);
      } catch (err: unknown) {
        if (cancelled) return;
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.warn(errorMessage);
        setError(errorMessage);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, src, owner, repo, branch, isPrivate, name]);

  return (
    <div
      className={cn(
        "bg-muted w-full aspect-square overflow-hidden relative",
        className,
      )}
    >
      {path ? (
        error ? (
          <div
            className="flex justify-center items-center absolute inset-0 text-muted-foreground"
            title={error}
          >
            <Ban className="h-4 w-4" />
          </div>
        ) : rawUrl ? (
          isVideo ? (
            <>
              <video
                src={`${rawUrl}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setError("无法加载视频预览")}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-black/55 p-2 text-white shadow-sm">
                  <Play className="size-4 fill-current" />
                </span>
              </div>
            </>
          ) : (
            <img
              src={rawUrl}
              alt={path.split("/").pop() || "thumbnail"}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setError("无法加载图片")}
            />
          )
        ) : (
          <div
            className="flex justify-center items-center absolute inset-0 text-muted-foreground"
            title="加载中..."
          >
            <Loader className="h-4 w-4 animate-spin" />
          </div>
        )
      ) : (
        <div
          className="flex justify-center items-center absolute inset-0 text-muted-foreground"
          title="无图片"
        >
          <ImageOff className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
