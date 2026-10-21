"use client";

import { useMemo } from "react";
import { useConfig } from "@/contexts/config-context";
import { normalizePath } from "@/lib/utils/file";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function FileOptions({
  path,
  sha,
  type,
  name,
  canDelete,
  editHref,
  portalProps,
  onBeforeDelete,
  onDelete,
  onDeleteError,
  children,
}: {
  path: string;
  sha: string;
  type: "collection" | "file" | "media" | "settings";
  name?: string;
  canDelete?: boolean;
  /** Reserved — rename UI not wired in this menu. */
  canRename?: boolean;
  editHref?: string;
  portalProps?: any;
  onBeforeDelete?: () => void;
  onDelete?: (path: string) => void;
  onDeleteError?: () => void;
  /** Reserved — rename UI not wired in this menu. */
  onRename?: (path: string, newPath: string) => void;
  children: React.ReactNode;
}) {
  const { config } = useConfig();
  if (!config) throw new Error(`Config not found.`);

  const normalizedPath = useMemo(() => normalizePath(path), [path]);
  const showDelete = type !== "settings" && canDelete !== false;

  const handleConfirmDelete = async () => {
    try {
      onBeforeDelete?.();
      const deletePromise = new Promise(async (resolve, reject) => {
        try {
          const params = new URLSearchParams({
            sha,
            type: type === "collection" || type === "file" ? "content" : type,
          });
          if (name) params.set("name", name);

          const response = await fetch(
            `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(normalizedPath)}?${params.toString()}`,
            {
              method: "DELETE",
            },
          );

          const data = await requireApiSuccess<any>(response, "Failed to delete file");

          resolve(data);
        } catch (error) {
          reject(error);
        }
      });

      toast.promise(deletePromise, {
        loading: `Deleting ${path}`,
        success: (data: any) => {
          if (onDelete) onDelete(path);
          notifyCmsLocalSave();
          return data.message;
        },
        error: (error: any) => {
          onDeleteError?.();
          return error.message;
        },
      });
    } catch (error) {
      onDeleteError?.();
      console.error(error);
    }
  };

  return (
    <AlertDialog>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" portalProps={portalProps}>
          {editHref ? (
            <DropdownMenuItem asChild>
              <a href={editHref}>编辑</a>
            </DropdownMenuItem>
          ) : null}
          {showDelete ? (
            <>
              {editHref ? <DropdownMenuSeparator /> : null}
              <AlertDialogTrigger asChild>
                <DropdownMenuItem variant="destructive">删除</DropdownMenuItem>
              </AlertDialogTrigger>
            </>
          ) : null}
        </DropdownMenuContent>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will premanently delete &quot;{path}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </DropdownMenu>
    </AlertDialog>
  );
}
