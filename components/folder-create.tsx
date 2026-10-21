"use client";

import { useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { joinPathSegments, normalizePath } from "@/lib/utils/file";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type FolderCreateResult = {
  path: string;
  [key: string]: unknown;
};

const FolderCreate = ({
  children,
  path,
  type,
  name,
  onCreate,
}: {
  children: React.ReactElement<{ onClick: () => void }>;
  path: string;
  type: "content" | "media";
  name?: string;
  onCreate?: (entry: FolderCreateResult) => void;
}) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Config not found.`);

  const [open, setOpen] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleCreate = async () => {
    const normalizedFolderInput = normalizePath(folderPath.trim());
    if (!normalizedFolderInput) {
      toast.error("请填写文件夹名称。");
      return;
    }

    const fullNewPath = joinPathSegments([
      normalizePath(path),
      normalizedFolderInput,
    ]);

    setIsSubmitting(true);
    try {
      const createPromise: Promise<{
        status: string;
        message?: string;
        data: FolderCreateResult;
      }> = fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(fullNewPath + "/.gitkeep")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name,
          content: "",
          onConflict: "error",
        }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 409) {
            throw new Error(`文件夹「${fullNewPath}」已存在。`);
          }

          throw new Error(payload?.message || "创建文件夹失败");
        }

        if (!payload || payload.status !== "success") {
          throw new Error(payload?.message || "创建文件夹失败");
        }

        return payload;
      });

      await toast.promise(createPromise, {
        loading: `正在创建文件夹「${fullNewPath}」…`,
        success: `已创建文件夹「${fullNewPath}」`,
        error: (error: any) => error.message,
      });

      const result = await createPromise;
      if (onCreate) onCreate(result.data);
      setFolderPath("");
      setOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setFolderPath("");
          setIsSubmitting(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>
            在「{normalizePath(path)}」下创建文件夹
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!isSubmitting) await handleCreate();
          }}
          className="space-y-4"
        >
          <Input
            autoFocus
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="文件夹名称"
            aria-label="文件夹名称"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isSubmitting}>取消</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || !folderPath.trim()}>创建</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export { FolderCreate };
