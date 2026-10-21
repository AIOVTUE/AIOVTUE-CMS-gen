"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { parse, stringify } from "@/lib/serialization";
import { requireApiSuccess } from "@/lib/api-client";
import { notifyCmsLocalSave } from "@/lib/cms-client-events";
import type { ApiSuccess } from "@/types/api";
import { useConfig } from "@/contexts/config-context";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cloneConfig, getByPath, setByPath } from "@/lib/site-settings/paths";
import {
  NavMenuField,
  asNavMenuList,
  type NavMenuItem,
} from "@/components/site-settings/nav-menu-field";
import { mergeMenusConfig } from "@/lib/menu-settings/defaults";
import { deriveContentVisibilityFromNav } from "@/lib/menu-settings/nav-content-sync";
import {
  DEFAULT_NAV_MENU,
  cloneDefaultNavMenu,
} from "@/lib/menu-settings/default-nav-menu";
import "@/components/site-settings/site-settings.css";

type EntryPayload = {
  sha: string;
  path: string;
  contentObject?: { body?: string };
};

const SITE_CONFIG_PATH = "hugo.toml";
const SITE_CONFIG_NAME = "site-config";
const MENU_PATH = "params.menu.main";

const NavMenuSettings = () => {
  const { config, setConfig } = useConfig();
  const [draftMenu, setDraftMenu] = useState<NavMenuItem[] | null>(null);
  const [baseline, setBaseline] = useState("");
  const [fullConfig, setFullConfig] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);

  const entryApiUrl = useMemo(() => {
    if (!config) return null;
    return `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(SITE_CONFIG_PATH)}?name=${encodeURIComponent(SITE_CONFIG_NAME)}`;
  }, [config]);

  const { data, error, isLoading, mutate } = useSWR(
    entryApiUrl,
    async (url: string) => {
      const response = await fetch(url);
      const payload = await requireApiSuccess<ApiSuccess<EntryPayload>>(
        response,
        "加载站点配置失败",
      );
      return payload.data;
    },
  );

  useEffect(() => {
    if (!data?.contentObject) return;
    const body =
      typeof data.contentObject.body === "string"
        ? data.contentObject.body
        : stringify(data.contentObject, { format: "toml" });
    try {
      const parsed = parse(body || "", { format: "toml" }) as Record<
        string,
        any
      >;
      const next = cloneConfig(parsed);
      const menu = asNavMenuList(getByPath(next, MENU_PATH));
      setFullConfig(next);
      setDraftMenu(menu);
      setBaseline(JSON.stringify(menu));
    } catch (parseError) {
      toast.error(
        parseError instanceof Error
          ? parseError.message
          : "无法解析 hugo.toml",
      );
    }
  }, [data]);

  const dirty = useMemo(() => {
    if (!draftMenu) return false;
    return JSON.stringify(draftMenu) !== baseline;
  }, [baseline, draftMenu]);

  const isDefault = useMemo(() => {
    if (!draftMenu) return true;
    return JSON.stringify(draftMenu) === JSON.stringify(DEFAULT_NAV_MENU);
  }, [draftMenu]);

  const syncCmsContentVisibility = useCallback(
    async (menu: NavMenuItem[]) => {
      if (!config?.object) return;

      const visibility = deriveContentVisibilityFromNav(menu);
      if (Object.keys(visibility).length === 0) return;

      const nextObject = cloneConfig(config.object as Record<string, any>);
      const menus = mergeMenusConfig(nextObject.menus);
      const items = { ...(menus.sidebar?.items ?? {}) };

      for (const [contentName, enabled] of Object.entries(visibility)) {
        const key = `content:${contentName}`;
        items[key] = {
          ...(items[key] ?? {}),
          enabled,
        };
      }

      nextObject.menus = {
        ...menus,
        sidebar: {
          ...menus.sidebar,
          items,
        },
      };

      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/cms-config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menus: nextObject.menus }),
        },
      );
      const payload = await requireApiSuccess<
        ApiSuccess<{ config?: typeof config }>
      >(response, "同步内容栏目显示失败");
      if (payload.data?.config) {
        setConfig(payload.data.config);
      }
    },
    [config, setConfig],
  );

  const handleSave = useCallback(async () => {
    if (!config || !draftMenu || !fullConfig) return;
    setSaving(true);
    try {
      const next = cloneConfig(fullConfig);
      setByPath(next, MENU_PATH, draftMenu);
      const body = stringify(next, { format: "toml" });
      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(SITE_CONFIG_PATH)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "content",
            name: SITE_CONFIG_NAME,
            sha: data?.sha || undefined,
            content: { body },
          }),
        },
      );
      await requireApiSuccess(response, "保存菜单失败");
      await syncCmsContentVisibility(draftMenu);
      setFullConfig(next);
      setBaseline(JSON.stringify(draftMenu));
      toast.success("顶栏菜单已保存");
      notifyCmsLocalSave();
      await mutate();
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  }, [
    config,
    data?.sha,
    draftMenu,
    fullConfig,
    mutate,
    syncCmsContentVisibility,
  ]);

  const handleDiscard = useCallback(() => {
    if (!baseline) return;
    setDraftMenu(JSON.parse(baseline) as NavMenuItem[]);
  }, [baseline]);

  const handleReset = useCallback(() => {
    setDraftMenu(cloneDefaultNavMenu());
  }, []);

  const headerNode = useMemo(
    () => (
      <RepoPageHeader title="顶栏菜单">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isDefault || saving}
            >
              重置
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>恢复默认菜单？</AlertDialogTitle>
              <AlertDialogDescription>
                将还原为主题默认的顶栏菜单结构与开关状态。确认后仍需点击「保存」才会写入仓库。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>恢复默认</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          type="button"
          variant="ghost"
          className="repo-page-header__btn"
          disabled={!dirty || saving}
          onClick={handleDiscard}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="repo-page-header__btn repo-page-header__btn--save"
          disabled={!dirty || saving || !draftMenu}
          onClick={() => void handleSave()}
        >
          {saving ? "保存中…" : "保存"}
        </Button>
      </RepoPageHeader>
    ),
    [dirty, draftMenu, handleDiscard, handleReset, handleSave, isDefault, saving],
  );

  useRepoHeader({ header: headerNode });

  if (error) {
    return (
      <div className="text-destructive p-4 text-sm">
        无法加载 hugo.toml：
        {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  if (isLoading || !draftMenu) {
    return (
      <div className="site-settings">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="site-settings">
      <NavMenuField
        label="导航菜单"
        value={draftMenu}
        onChange={setDraftMenu}
      />
    </div>
  );
};

export { NavMenuSettings };
