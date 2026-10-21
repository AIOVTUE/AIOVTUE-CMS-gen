"use client";

import { useState } from "react";
import { useAppRouter } from "@/hooks/use-app-router";
import { Loader as LucideLoader } from "lucide-react";
import { useConfig } from "@/contexts/config-context";
import { normalizePath } from "@/lib/utils/file";
import { getSchemaByName, initializeState } from "@/lib/schema";
import { requireApiSuccess } from "@/lib/api-client";
import { apiRepoHref, repoHref } from "@/lib/repo-href";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EmptyCreate = ({
  children,
  type,
  name,
  onCreate
}: {
  children: React.ReactNode;
  type: "content" | "media" | "settings";
  name?: string;
  onCreate?: (path: string) => void;
}) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Config not found.`);

  const router = useAppRouter();
  const [isCreating, setIsCreating] = useState(false);

  let path = "";
  let content: string | Record<string, any> = "";
  let toCreate = "";
  let redirectTo = repoHref(config.owner, config.repo, config.branch);

  if (type === "settings") {
    // Bootstrap CMS config in DB from builtin; no Hugo file is created.
    path = ".pages.yml";
    toCreate = "CMS configuration";
  } else if (type === "content" || type === "media") {
    if (!name) throw new Error(`"name" is required.`);
    const schema = getSchemaByName(config.object, name, type);
    if (!schema) throw new Error(`Schema not found for ${name}.`);

    if (type === "media") {
      path = `${schema.input}/.gitkeep`;
      toCreate = "media folder";
      redirectTo = repoHref(
        config.owner,
        config.repo,
        config.branch,
        `/media/${encodeURIComponent(schema.name)}`,
      );
    } else {
      if (schema.type === "file") {
        path = schema.path;
        toCreate = "file";
        if (schema.list) {
          // Root-level list files must serialize as an array.
          content = [];
        } else if (schema.fields && schema.fields.length) {
          content = initializeState(schema.fields, {});
        }
      } else {
        path = `${schema.path}/.gitkeep`;
        toCreate = "collection folder";
      }
      redirectTo = repoHref(
        config.owner,
        config.repo,
        config.branch,
        `/${schema.type}/${encodeURIComponent(schema.name)}`,
      );
    }
  } else {
    throw new Error(`Invalid type "${type}".`);
  }
  
  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    const toastId = toast.loading(`Creating ${toCreate}...`);

    try {
      if (type === "settings") {
        const response = await fetch(
          apiRepoHref(config.owner, config.repo, config.branch, "/cms-config"),
          { method: "GET" },
        );
        await requireApiSuccess<any>(
          response,
          `Failed to create ${toCreate}`,
        );
      } else {
        const response = await fetch(
          apiRepoHref(
            config.owner,
            config.repo,
            config.branch,
            `/files/${encodeURIComponent(normalizePath(path))}`,
          ),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              name,
              content,
              ...(path.endsWith("/.gitkeep") ? { onConflict: "error" } : {}),
            }),
          },
        );
        await requireApiSuccess<any>(
          response,
          `Failed to create ${toCreate}`,
        );
      }

      toast.loading(`Opening ${toCreate}...`, { id: toastId });
      onCreate?.(normalizePath(path));
      // Navigate immediately so destination route can render its loading skeleton.
      router.push(`${redirectTo}?empty-created`);
      router.refresh();
      toast.success(`Created ${toCreate}. Opening...`, { id: toastId });
    } catch (error) {
      setIsCreating(false);
      toast.error(error instanceof Error ? error.message : `Failed to create ${toCreate}.`, {
        id: toastId,
      });
    }
  };

  return (
    <Button type="button" onClick={handleCreate} disabled={isCreating}>
      {isCreating ? (
        <span className="inline-flex items-center gap-x-2">创建中...<LucideLoader className="h-4 w-4 animate-spin" />
        </span>
      ) : children}
    </Button>
  );
};

export { EmptyCreate };
