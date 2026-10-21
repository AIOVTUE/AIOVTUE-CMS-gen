"use client";

import { useCallback, useEffect, useState } from "react";
import { Folder, FileText, ChevronRight, Check } from "lucide-react";
import { useConfig } from "@/contexts/config-context";
import { requireApiSuccess } from "@/lib/api-client";
import { apiRepoHref } from "@/lib/repo-href";
import type { ApiSuccess } from "@/types/api";
import { getParentPath, normalizePath } from "@/lib/utils/file";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BrowseEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
};

type PagePathPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "file" | "folder" | "files";
  value: string;
  values?: string[];
  onSelect: (path: string) => void;
  onSelectMany?: (paths: string[]) => void;
};

const EMPTY_VALUES: string[] = [];

const PagePathPicker = ({
  open,
  onOpenChange,
  mode,
  value,
  values = EMPTY_VALUES,
  onSelect,
  onSelectMany,
}: PagePathPickerProps) => {
  const { config } = useConfig();
  const owner = config?.owner ?? "";
  const repo = config?.repo ?? "";
  const branch = config?.branch ?? "";
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(value);
  const [selectedMany, setSelectedMany] = useState<string[]>(values);
  const valuesKey = values.join("\0");

  const load = useCallback(
    async (path: string) => {
      if (!owner || !repo || !branch) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${apiRepoHref(owner, repo, branch, "/browse")}?path=${encodeURIComponent(path)}`,
        );
        const payload = await requireApiSuccess<
          ApiSuccess<{ path?: string; entries?: BrowseEntry[] }>
        >(response, "无法列出目录");
        setCurrentPath(payload.data?.path ?? path);
        setEntries(payload.data?.entries ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "无法列出目录");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [branch, owner, repo],
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "files") {
      const first = values[0] ? normalizePath(values[0]) : "";
      setSelectedMany(values.map((item) => normalizePath(item)).filter(Boolean));
      void load(first ? getParentPath(first) : "");
      return;
    }
    const start =
      mode === "file" ? getParentPath(normalizePath(value)) : normalizePath(value);
    setSelected(value);
    void load(start);
    // valuesKey stands in for `values` to avoid [] identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- values read via valuesKey
  }, [load, mode, open, value, valuesKey]);

  const crumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];
  const selectedSet = new Set(selectedMany);

  const toggleFile = (path: string) => {
    setSelectedMany((prev) => {
      if (prev.includes(path)) return prev.filter((item) => item !== path);
      return [...prev, path].sort((a, b) => a.localeCompare(b, "zh-CN"));
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "files"
              ? "选择多个文件"
              : mode === "file"
                ? "选择文件"
                : "选择文件夹"}
          </DialogTitle>
          <DialogDescription>
            {mode === "files"
              ? "进入目录后勾选多个文件，确认后显示在同一列表页。"
              : mode === "file"
                ? "进入目录后点选一个文件。"
                : "进入目标目录后点「使用当前文件夹」。"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => void load("")}
          >
            仓库根目录
          </button>
          {crumbs.map((segment, index) => {
            const nextPath = crumbs.slice(0, index + 1).join("/");
            return (
              <span key={nextPath} className="flex items-center gap-1">
                <ChevronRight className="size-3" />
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => void load(nextPath)}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </div>

        {mode === "files" && selectedMany.length > 0 ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            已选 {selectedMany.length} 个文件
          </div>
        ) : null}

        <div className="max-h-72 overflow-auto rounded-md border">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">加载中…</div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">此目录为空</div>
          ) : (
            <ul>
              {entries.map((entry) => {
                const isSelected =
                  mode === "files"
                    ? selectedSet.has(entry.path)
                    : selected === entry.path;
                const canPickFile =
                  (mode === "file" || mode === "files") && entry.type === "file";
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                        isSelected ? "bg-accent" : ""
                      }`}
                      onClick={() => {
                        if (entry.type === "dir") {
                          void load(entry.path);
                          if (mode === "folder") setSelected(entry.path);
                          return;
                        }
                        if (mode === "files" && canPickFile) {
                          toggleFile(entry.path);
                          return;
                        }
                        if (canPickFile) setSelected(entry.path);
                      }}
                    >
                      {mode === "files" && entry.type === "file" ? (
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {isSelected ? <Check className="size-3" /> : null}
                        </span>
                      ) : entry.type === "dir" ? (
                        <Folder className="size-4 shrink-0 text-amber-500" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {mode === "folder" ? (
            <Button
              type="button"
              onClick={() => {
                onSelect(currentPath);
                onOpenChange(false);
              }}
            >
              使用当前文件夹
            </Button>
          ) : mode === "files" ? (
            <Button
              type="button"
              disabled={selectedMany.length === 0}
              onClick={() => {
                onSelectMany?.(selectedMany);
                onOpenChange(false);
              }}
            >
              使用已选文件（{selectedMany.length}）
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onSelect(selected);
                onOpenChange(false);
              }}
            >
              使用此文件
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { PagePathPicker };
