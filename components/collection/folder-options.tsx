"use client";

import { useMemo, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { getFileName, normalizePath } from "@/lib/utils/file";
import { requireApiSuccess } from "@/lib/api-client";
import { notifyCmsLocalSave } from "@/lib/cms-client-events";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type FolderChild = {
  type: "file" | "dir";
  path: string;
  sha?: string;
  name?: string;
};

/**
 * Folder row actions aligned with hugo-cfBlog explorer (delete folder + contents).
 */
export function FolderOptions({
  path,
  name,
  collectionName,
  canDelete,
  listChildren,
  onDeleted,
  children,
}: {
  path: string;
  name?: string;
  collectionName: string;
  canDelete?: boolean;
  listChildren: (folderPath: string) => Promise<FolderChild[]>;
  onDeleted?: (folderPath: string) => void;
  children: React.ReactNode;
}) {
  const { config } = useConfig();
  if (!config) throw new Error(`Config not found.`);

  const normalizedPath = useMemo(() => normalizePath(path), [path]);
  const folderLabel = name || getFileName(normalizedPath) || normalizedPath;
  const showDelete = canDelete !== false;
  const [isDeleting, setIsDeleting] = useState(false);

  const resolveSha = async (filePath: string, knownSha?: string) => {
    if (knownSha) return knownSha;
    const response = await fetch(
      `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(filePath)}?name=${encodeURIComponent(collectionName)}`,
    );
    const data = await requireApiSuccess<any>(response, "读取文件失败");
    const sha = data?.data?.sha;
    if (!sha) throw new Error(`缺少「${filePath}」的文件校验信息。`);
    return sha as string;
  };

  const deleteFile = async (filePath: string, knownSha?: string) => {
    const sha = await resolveSha(filePath, knownSha);
    const params = new URLSearchParams({
      sha,
      type: "content",
      name: collectionName,
    });
    const response = await fetch(
      `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(filePath)}?${params.toString()}`,
      { method: "DELETE" },
    );
    await requireApiSuccess(response, `删除失败：「${filePath}」`);
  };

  const deleteFolderRecursive = async (folderPath: string): Promise<number> => {
    const children = await listChildren(folderPath);
    let removed = 0;

    for (const child of children) {
      if (child.type === "dir") {
        removed += await deleteFolderRecursive(child.path);
      } else {
        await deleteFile(child.path, child.sha);
        removed += 1;
      }
    }

    try {
      await deleteFile(`${folderPath}/.gitkeep`);
      removed += 1;
    } catch (error: any) {
      const message = String(error?.message || "");
      // Missing placeholder is fine; other failures must surface.
      if (!/not found|404|missing sha/i.test(message)) {
        throw error;
      }
    }

    return removed;
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const deletePromise = deleteFolderRecursive(normalizedPath).then((count) => ({
        count,
      }));

      await toast.promise(deletePromise, {
        loading: `正在删除文件夹「${folderLabel}」…`,
        success: (data) => {
          onDeleted?.(normalizedPath);
          notifyCmsLocalSave();
          return `已删除文件夹「${folderLabel}」（${data.count} 个文件）`;
        },
        error: (error: any) => error?.message || "删除文件夹失败",
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!showDelete) return null;

  return (
    <AlertDialog>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <AlertDialogTrigger asChild>
            <DropdownMenuItem variant="destructive">删除文件夹</DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除「{folderLabel}」及其下全部文章与子文件夹，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => {
                void handleConfirmDelete();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </DropdownMenu>
    </AlertDialog>
  );
}
