"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { canManageRepoSettings } from "@/lib/authz-shared";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireApiSuccess } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import { mergeMenusConfig } from "@/lib/menu-settings/defaults";
import { applyMenusDraft } from "@/lib/menu-settings/apply";
import type { MenusConfig } from "@/lib/menu-settings/types";
import { ContentPagesEditor } from "@/components/menu-settings/content-pages-editor";
import {
  applyContentLeavesToTree,
  flattenContentLeaves,
} from "@/lib/page-templates";
import "./menu-settings.css";

const AUTO_SAVE_MS = 600;
const MAX_CONFLICT_RETRIES = 3;

const contentKeysFromPages = (pages: any[]) =>
  pages
    .map((entry) => (entry?.name ? `content:${entry.name}` : ""))
    .filter(Boolean);

/**
 * On 409: keep remote-added pages, prefer remote files[] (DELETE prunes),
 * and keep local-only pages / local field edits for shared names.
 */
const mergePagesAfterConflict = (localPages: any[], remoteTree: any[]) => {
  const remoteLeaves = flattenContentLeaves(remoteTree);
  const localByName = new Map(
    localPages
      .filter((entry) => entry?.name)
      .map((entry) => [String(entry.name), entry as Record<string, any>]),
  );
  const used = new Set<string>();
  const merged: any[] = [];

  for (const remote of remoteLeaves) {
    const name = remote?.name ? String(remote.name) : "";
    if (!name) continue;
    used.add(name);
    const local = localByName.get(name);
    if (!local) {
      merged.push(remote);
      continue;
    }
    const next = { ...local };
    if (Array.isArray(remote.files) || Array.isArray(local.files)) {
      next.files = remote.files ?? [];
    }
    merged.push(next);
  }

  for (const local of localPages) {
    const name = local?.name ? String(local.name) : "";
    if (!name || used.has(name)) continue;
    merged.push(local);
  }

  return merged;
};

const ensureContentSidebarItems = (
  menus: MenusConfig,
  pages: any[],
): MenusConfig => {
  const base = mergeMenusConfig(menus);
  const items = { ...(base.sidebar?.items ?? {}) };
  const keep = new Set(contentKeysFromPages(pages));

  pages.forEach((entry, index) => {
    if (!entry?.name) return;
    const key = `content:${entry.name}`;
    const prev = items[key] ?? {};
    const next = {
      ...prev,
      enabled: prev.enabled ?? true,
      order: index * 10,
    } as Record<string, unknown>;
    if (typeof entry.icon === "string" && entry.icon.trim()) {
      next.icon = entry.icon.trim();
    }
    if (typeof entry.iconColor === "string" && entry.iconColor.trim()) {
      next.iconColor = entry.iconColor.trim();
    } else if (entry.iconColor === "") {
      delete next.iconColor;
    }
    items[key] = next;
  });

  for (const key of Object.keys(items)) {
    if (key.startsWith("content:") && !keep.has(key)) {
      delete items[key];
    }
  }

  return {
    ...base,
    sidebar: {
      ...base.sidebar,
      items,
    },
  };
};

const snapshotDraft = (
  menus: MenusConfig,
  contentPages: any[],
  pagesManaged: boolean,
) =>
  JSON.stringify({
    menus,
    contentPages,
    pagesManaged,
  });

const MenuSettings = () => {
  const { config, setConfig } = useConfig();
  const { user } = useUser();
  // Local disk repos are managed by any signed-in admin (email login OK).
  const canManageRepo = canManageRepoSettings(user, config?.owner);
  const [menus, setMenus] = useState<MenusConfig | null>(null);
  const [contentPages, setContentPages] = useState<any[]>([]);
  const [pagesManaged, setPagesManaged] = useState(false);
  const [contentTree, setContentTree] = useState<any[]>([]);
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const trailingSaveRef = useRef(false);
  const draftRef = useRef({
    menus: null as MenusConfig | null,
    contentPages: [] as any[],
    pagesManaged: false,
    contentTree: [] as any[],
  });

  useEffect(() => {
    if (!config?.object) return;
    // Don't clobber in-progress edits when setConfig returns after auto-save.
    if (dirtyRef.current || savingRef.current) return;
    const tree = Array.isArray((config.object as any).content)
      ? ((config.object as any).content as any[])
      : [];
    const pages = flattenContentLeaves(tree);
    const mergedMenus = ensureContentSidebarItems(
      mergeMenusConfig((config.object as any).menus),
      pages,
    );
    const managed = (config.object as any)?.settings?.pagesManaged === true;
    setMenus(mergedMenus);
    setContentPages(pages);
    setContentTree(tree);
    setPagesManaged(managed);
    setBaseline(snapshotDraft(mergedMenus, pages, managed));
  }, [config?.object]);

  const dirty = useMemo(() => {
    if (!menus) return false;
    return snapshotDraft(menus, contentPages, pagesManaged) !== baseline;
  }, [baseline, contentPages, menus, pagesManaged]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    draftRef.current = { menus, contentPages, pagesManaged, contentTree };
  }, [menus, contentPages, pagesManaged, contentTree]);

  const handlePagesChange = useCallback((next: any[]) => {
    setContentPages(next);
    setPagesManaged(true);
    setMenus((current) =>
      ensureContentSidebarItems(mergeMenusConfig(current ?? undefined), next),
    );
  }, []);

  const persistDraft = useCallback(async () => {
    if (!config || !canManageRepo) return;
    if (savingRef.current) {
      trailingSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    setSaving(true);
    let baseSha = config.sha;
    let configObject = config.object as Record<string, any>;
    let conflictTries = 0;

    try {
      do {
        trailingSaveRef.current = false;
        const {
          menus: draftMenus,
          contentPages: draftPages,
          pagesManaged: draftManaged,
          contentTree: draftTree,
        } = draftRef.current;
        if (!draftMenus) break;

        const savedSnapshot = snapshotDraft(
          draftMenus,
          draftPages,
          draftManaged,
        );
        const managePages = draftManaged || draftPages.length > 0;
        const nextMenus = ensureContentSidebarItems(draftMenus, draftPages);
        const hierarchicalContent = applyContentLeavesToTree(
          draftTree,
          draftPages,
        );
        const contentOrder = contentKeysFromPages(draftPages);
        const nextObject = applyMenusDraft(
          {
            ...configObject,
            content: hierarchicalContent,
          },
          nextMenus,
          contentOrder,
          [],
        );
        const persistedContent =
          nextObject.content ?? hierarchicalContent;

        const response = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/cms-config`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseSha,
              menus: nextObject.menus,
              settings: {
                ...(nextObject.settings ?? {}),
                ...(managePages
                  ? { pagesManaged: true, templatesConfigured: true }
                  : {}),
              },
              ...(managePages ? { content: persistedContent } : {}),
            }),
          },
        );

        if (response.status === 409) {
          conflictTries += 1;
          if (conflictTries > MAX_CONFLICT_RETRIES) {
            toast.error("配置冲突次数过多，请刷新后重试。");
            break;
          }
          trailingSaveRef.current = true;
          try {
            const fresh = await fetch(
              `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/cms-config`,
            );
            const freshPayload = await requireApiSuccess<
              ApiSuccess<{ config?: typeof config }>
            >(fresh, "刷新配置失败");
            if (freshPayload.data?.config) {
              const remote = freshPayload.data.config;
              baseSha = remote.sha;
              configObject = remote.object as Record<string, any>;
              const remoteTree = Array.isArray(configObject.content)
                ? configObject.content
                : [];
              const mergedPages = mergePagesAfterConflict(
                draftRef.current.contentPages,
                remoteTree,
              );
              draftRef.current = {
                ...draftRef.current,
                contentPages: mergedPages,
                contentTree: remoteTree,
              };
              setContentPages(mergedPages);
              setContentTree(remoteTree);
              setConfig(remote);
            }
          } catch {
            // ignore; next trailing save still uses local draft
          }
          continue;
        }

        const payload = await requireApiSuccess<
          ApiSuccess<{ config?: typeof config }>
        >(response, "保存菜单设置失败");

        if (payload.data?.config) {
          baseSha = payload.data.config.sha;
          configObject = payload.data.config.object as Record<string, any>;
        }

        const stillSame =
          snapshotDraft(
            draftRef.current.menus!,
            draftRef.current.contentPages,
            draftRef.current.pagesManaged,
          ) === savedSnapshot;

        if (stillSame) {
          if (payload.data?.config) {
            setConfig(payload.data.config);
          }
          const savedTree = Array.isArray(configObject.content)
            ? configObject.content
            : persistedContent;
          setMenus(nextMenus);
          setContentPages(draftPages);
          setContentTree(savedTree);
          setPagesManaged(managePages);
          setBaseline(snapshotDraft(nextMenus, draftPages, managePages));
          dirtyRef.current = false;
        } else {
          // Newer local edits arrived during the request — keep draft, save again.
          trailingSaveRef.current = true;
        }
      } while (trailingSaveRef.current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
      trailingSaveRef.current = false;
    }
  }, [canManageRepo, config, setConfig]);

  useEffect(() => {
    if (!dirty || !menus || !canManageRepo || saving) return;
    const timer = setTimeout(() => {
      void persistDraft();
    }, AUTO_SAVE_MS);
    return () => clearTimeout(timer);
  }, [
    dirty,
    menus,
    contentPages,
    pagesManaged,
    canManageRepo,
    saving,
    persistDraft,
  ]);

  const headerNode = useMemo(
    () => (
      <RepoPageHeader title="内容页面">
        {saving ? (
          <span className="text-muted-foreground text-sm">保存中…</span>
        ) : null}
      </RepoPageHeader>
    ),
    [saving],
  );

  useRepoHeader({ header: headerNode });

  if (!config || !menus) {
    return (
      <div className="menu-settings">
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="menu-settings">
      <ContentPagesEditor
        content={contentPages}
        onChange={handlePagesChange}
      />
    </div>
  );
};

export { MenuSettings };
