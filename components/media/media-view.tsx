"use client";

import { Fragment, memo, type ReactNode, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useAppRouter } from "@/hooks/use-app-router";
import { useConfig } from "@/contexts/config-context";
import { RepoActionButtons } from "@/components/repo/repo-action-buttons";
import { LocalWorkspaceDialog } from "@/components/repo/local-workspace-dialog";
import { PagePathPicker } from "@/components/menu-settings/page-path-picker";
import {
    extensionCategories,
    getParentPath,
    getFileName,
    getRelativePath,
    joinPathSegments,
    normalizePath
} from "@/lib/utils/file";
import { FolderCreate} from "@/components/folder-create";
import { EmptyCreate } from "@/components/empty-create";
import { FileOptions } from "@/components/file/file-options";
import { useOptionalRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { MediaUpload} from "./media-upload";
import { MediaPreview } from "./media-preview";
import { Thumbnail } from "@/components/thumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { requireApiSuccess } from "@/lib/api-client";
import { getSchemaActions } from "@/lib/actions";
import { isMissingLocalWorkspaceError } from "@/lib/local-repo/missing-path";
import type { ApiSuccess, FileSaveData, MediaItem } from "@/types/api";
import type { Config } from "@/types/config";
import useSWR, { useSWRConfig } from "swr";
import {
  CornerLeftUp,
  House,
  Ban,
  Check,
  EllipsisVertical,  
  File,
  Folder,
  FolderPlus,
  Upload
} from "lucide-react";

const mediaFolderIconClassName =
  "h-[5.5rem] w-[5.5rem] fill-[#ffcc4d] text-[#c2850a] stroke-[#c2850a] stroke-[0.5]";

function MediaHeaderActions({
  actionNode,
  mediaName,
  path,
  onFolderCreate,
}: {
  actionNode?: ReactNode;
  mediaName: string;
  path: string;
  onFolderCreate: (entry: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-x-2 shrink-0">
      {actionNode}
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <FolderCreate path={path} name={mediaName} type="media" onCreate={onFolderCreate}>
              <Button type="button" variant="outline" size="icon">
                <FolderPlus />
              </Button>
            </FolderCreate>
          </div>
        </TooltipTrigger>
        <TooltipContent>创建文件夹</TooltipContent>
      </Tooltip>
      <MediaUpload.Trigger>
        <Button type="button" className="gap-2">
          <Upload />上传</Button>
      </MediaUpload.Trigger>
    </div>
  );
}

type MediaFolderTileProps = {
  item: MediaItem;
  onNavigate: (path: string) => void;
};

const MediaFolderTile = memo(function MediaFolderTile({ item, onNavigate }: MediaFolderTileProps) {
  return (
    <button
      className="hover:bg-muted focus:ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 outline-none rounded-md block w-full"
      onClick={() => onNavigate(item.path)}
    >
      <div className="flex aspect-[4/3] items-center justify-center rounded-md">
        <Folder className={mediaFolderIconClassName} />
      </div>
      <div className="flex items-center justify-center p-2">
        <div className="overflow-hidden h-9">
          <div className="text-sm font-medium truncate">{item.name}</div>
        </div>
      </div>
    </button>
  );
});

type MediaFileTileProps = {
  item: MediaItem;
  mediaName: string;
  selectable: boolean;
  isSelected: boolean;
  isPreviewable: boolean;
  portalContainer: HTMLDivElement | null;
  onSelect: (path: string) => void;
  onPreview: (item: MediaItem) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newPath: string) => void;
};

const MediaFileTile = memo(function MediaFileTile({
  item,
  mediaName,
  selectable,
  isSelected,
  isPreviewable,
  portalContainer,
  onSelect,
  onPreview,
  onDelete,
  onRename,
}: MediaFileTileProps) {
  const previewNode = isPreviewable ? (
    <button
      type="button"
      className="block w-full cursor-zoom-in overflow-hidden rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPreview(item);
      }}
      aria-label={`预览 ${item.name}`}
    >
      <Thumbnail
        name={mediaName}
        path={item.path}
        src={item.url}
        className="aspect-[4/3] rounded-md"
      />
    </button>
  ) : (
    <div className="flex aspect-[4/3] items-center justify-center rounded-md">
      <File className="stroke-[0.5] h-24 w-24"/>
    </div>
  );

  const content = (
    <div className={cn(
      "relative rounded-md",
      selectable && "hover:bg-muted peer-focus:ring-offset-background peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 peer-checked:ring-offset-background peer-checked:ring-offset-2 peer-checked:ring-2 peer-checked:ring-ring",
    )}>
      {previewNode}
      <div className="absolute top-1 right-1 z-10">
        <FileOptions
          path={item.path}
          sha={item.sha || ""}
          type="media"
          name={mediaName}
          onDelete={onDelete}
          onRename={onRename}
          portalProps={{ container: portalContainer }}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-7 bg-black/35 text-white shadow-sm backdrop-blur-[2px] hover:bg-black/50 hover:text-white"
            aria-label={`更多操作：${item.name}`}
          >
            <EllipsisVertical />
          </Button>
        </FileOptions>
      </div>
      {selectable && isSelected && (
        <div className="text-primary-foreground bg-primary p-0.5 rounded-full absolute top-2 left-2">
          <Check className="stroke-[3] w-3 h-3"/>
        </div>
      )}
    </div>
  );

  if (!selectable) return content;

  return (
    <label>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={isSelected}
        onChange={() => onSelect(item.path)}
      />
      {content}
    </label>
  );
});

const MediaView = ({
  media,
  initialPath,
  initialSelected,
  maxSelected,
  onSelect,
  onUpload,
  extensions,
  usePageHeader = true,
}: {
  media: string,
  initialPath?: string,
  initialSelected?: string[],
  maxSelected?: number,
  onSelect?: (newSelected: string[]) => void,
  onUpload?: (entry: FileSaveData) => void,
  extensions?: string[],
  usePageHeader?: boolean,
}) => {
  const { config, setConfig } = useConfig();
  if (!config) throw new Error(`Config not found.`);
  const { mutate } = useSWRConfig();

  const mediaConfig = useMemo(() => {
    if (!media) return config.object.media[0];
    return config.object.media.find((item: { name: string }) => item.name === media);
  }, [media, config.object.media]);

  const pathname = usePathname();
  const router = useAppRouter();
  const [pathPickerOpen, setPathPickerOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [savingPath, setSavingPath] = useState(false);

  const filteredExtensions = useMemo(() => {
    if (!mediaConfig?.extensions && !extensions) return [];
    
    const allowedExtensions = extensions 
      ? mediaConfig?.extensions
        ? extensions.filter(ext => mediaConfig.extensions.includes(ext))
        : extensions
      : mediaConfig.extensions;

    return allowedExtensions || [];
  }, [extensions, mediaConfig?.extensions]);
  const mediaActions = useMemo(
    () => getSchemaActions(mediaConfig),
    [mediaConfig],
  );

  const filteredExtensionsSet = useMemo(
    () => new Set((filteredExtensions || []).map((ext: string) => ext.toLowerCase())),
    [filteredExtensions],
  );

  const imageExtensionsSet = useMemo(
    () => new Set(extensionCategories.image),
    [],
  );
  const videoExtensionsSet = useMemo(
    () => new Set(extensionCategories.video),
    [],
  );

  const filesGridRef = useRef<HTMLDivElement | null>(null);

  const [error, setError] = useState<string | null | undefined>(null);
  const [selected, setSelected] = useState(initialSelected || []);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  useEffect(() => {
    setSelected(initialSelected || []);
  }, [initialSelected]);

  const [path, setPath] = useState(() => {
    if (!mediaConfig?.input) return "";
    if (!initialPath) return mediaConfig.input;
    const normalizedInitialPath = normalizePath(initialPath);
    if (normalizedInitialPath.startsWith(mediaConfig.input)) return normalizedInitialPath;
    console.warn(`"${initialPath}" is not within media root "${mediaConfig.input}". Defaulting to media root.`);
    return mediaConfig.input;
  });
  const [data, setData] = useState<MediaItem[] | undefined>(undefined);

  useEffect(() => {
    if (!mediaConfig?.input) {
      setPath("");
      setPathPickerOpen(true);
      return;
    }
    if (!initialPath) {
      setPath(mediaConfig.input);
      return;
    }
    const normalizedInitialPath = normalizePath(initialPath);
    if (normalizedInitialPath.startsWith(mediaConfig.input)) {
      setPath(normalizedInitialPath);
      return;
    }
    setPath(mediaConfig.input);
  }, [initialPath, mediaConfig?.input]);
  
  // Filter the data based on filteredExtensions when displaying
  const filteredData = useMemo(() => {
    if (!data) return undefined;
    if (filteredExtensionsSet.size === 0) return data;
    return data.filter(item => 
      item.type === "dir" ||
      filteredExtensionsSet.has(item.extension?.toLowerCase())
    );
  }, [data, filteredExtensionsSet]);

  const sortMediaItems = useCallback((items: MediaItem[]) => {
    return [...items].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });
  }, []);
  
  const buildMediaApiUrl = useCallback((targetPath: string): string => (
    `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${encodeURIComponent(mediaConfig.name)}/${encodeURIComponent(targetPath)}`
  ), [config.branch, config.owner, config.repo, mediaConfig.name]);

  const mediaKey = useMemo(() => {
    if (!mediaConfig?.input || !path) return null;
    return buildMediaApiUrl(path);
  }, [buildMediaApiUrl, mediaConfig?.input, path]);
  const fetchMediaByUrl = useCallback(async (apiUrl: string): Promise<MediaItem[]> => {
    const response = await fetch(apiUrl);
    const payload = await requireApiSuccess<any>(
      response,
      "加载媒体失败",
    );
    return payload.data as MediaItem[];
  }, []);

  const {
    data: swrMediaData,
    error: swrMediaError,
    isLoading: swrMediaLoading,
  } = useSWR<MediaItem[]>(
    mediaKey,
    fetchMediaByUrl,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    },
  );

  const handleSaveMediaPath = useCallback(
    async (selectedPath: string) => {
      const nextInput = normalizePath(selectedPath);
      if (!nextInput || !mediaConfig) return;
      setSavingPath(true);
      try {
        const nextMedia = (config.object.media ?? []).map(
          (item: Record<string, unknown>) =>
            item.name === mediaConfig.name
              ? { ...item, input: nextInput, folders: undefined }
              : item,
        );
        if (!nextMedia.some((item: { name?: string }) => item.name === mediaConfig.name)) {
          nextMedia.push({
            ...mediaConfig,
            input: nextInput,
            folders: undefined,
          });
        }
        const response = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/cms-config`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ media: nextMedia }),
          },
        );
        const payload = await requireApiSuccess<ApiSuccess<{ config: Config }>>(
          response,
          "保存媒体目录失败",
        );
        setConfig(payload.data.config);
        setPath(nextInput);
        setPathPickerOpen(false);
        toast.success("媒体目录已保存");
      } catch (saveError) {
        toast.error(
          saveError instanceof Error ? saveError.message : "保存媒体目录失败",
        );
      } finally {
        setSavingPath(false);
      }
    },
    [config, mediaConfig, setConfig],
  );

  useEffect(() => {
    if (!swrMediaData) return;
    setData(swrMediaData);
    setError(null);
  }, [swrMediaData]);

  useEffect(() => {
    if (!swrMediaError) return;
    const message = swrMediaError instanceof Error ? swrMediaError.message : "加载媒体失败。";
    setError(message);
  }, [swrMediaError]);

  const isLoading = swrMediaLoading && !data;

  const handleUpload = useCallback((entry: FileSaveData) => {
    if (!entry.path || !entry.name) return;
    const mediaEntry: MediaItem = {
      type: "file",
      sha: entry.sha,
      name: entry.name,
      path: entry.path,
      extension: entry.extension,
      size: entry.size,
      url: entry.url,
    };

    setData((prevData) => {
      if (!prevData) return [mediaEntry];

        const existingIndex = prevData.findIndex((item) => item.path === mediaEntry.path);
        if (existingIndex >= 0) {
          const next = [...prevData];
          next[existingIndex] = { ...next[existingIndex], ...mediaEntry };
          return sortMediaItems(next);
        }

        return sortMediaItems([...prevData, mediaEntry]);
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
    onUpload?.(entry);
  }, [mediaConfig.name, mutate, onUpload, sortMediaItems]);

  const handleDelete = useCallback((deletedPath: string) => {
    setData((prevData) => {
      if (!prevData) return prevData;
      const next = prevData.filter((item) => item.path !== deletedPath);
      return next.length === prevData.length ? prevData : next;
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate]);

  const handleRename = useCallback((oldPath: string, newPath: string) => {
    setData((prevData) => {
      if (!prevData || oldPath === newPath) return prevData;

      if (getParentPath(normalizePath(oldPath)) === getParentPath(normalizePath(newPath))) {
        let changed = false;
        const next = prevData.map((item) => {
          if (item.path !== oldPath) return item;
          changed = true;
          return { ...item, path: newPath, name: getFileName(newPath) };
        });
        return changed ? sortMediaItems(next) : prevData;
      }

      const next = prevData.filter((item) => item.path !== oldPath);
      return next.length === prevData.length ? prevData : next;
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate, sortMediaItems]);

  const handleFolderCreate = useCallback((entry: unknown) => {
    const createdPath = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && "path" in entry
        ? (entry as { path?: string }).path
        : undefined;

    if (!createdPath) return;

    const parentPath = getParentPath(createdPath);
    if (!parentPath) return;

    const parent: MediaItem = {
      type: "dir",
      name: getFileName(parentPath),
      path: parentPath,
      size: 0,
      url: null,
    };
    
    setData((prevData) => {
      if (!prevData) return [parent];
      if (prevData.some((item) => item.path === parent.path && item.type === "dir")) {
        return prevData;
      }
      return sortMediaItems([...prevData, parent]);
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate, sortMediaItems]);

  const handleNavigate = useCallback((newPath: string) => {
    setPath(newPath);
    if (!onSelect) {
      const params = new URLSearchParams(window.location.search);
      params.set("path", newPath || mediaConfig.input);
      router.push(`${pathname}?${params.toString()}`);
    }
  }, [mediaConfig.input, onSelect, pathname, router]);

  const handleNavigateParent = () => {
    if (!path || path === mediaConfig.input) return;
    handleNavigate(getParentPath(path));
  }

  const handleSelect = useCallback((path: string) => {
    startTransition(() => {
      setSelected((prevSelected) => {
        const isSelected = prevSelected.includes(path);
        if (isSelected) {
          return prevSelected.filter((item) => item !== path);
        }

        const nextSelected = [...prevSelected, path];
        if (maxSelected == null) return nextSelected;
        if (maxSelected <= 0) return [];
        if (nextSelected.length <= maxSelected) return nextSelected;

        return nextSelected.slice(nextSelected.length - maxSelected);
      });
    });
  }, [maxSelected]);

  useEffect(() => {
    if (onSelect) onSelect(selected);
  }, [selected, onSelect]);

  const loadingSkeleton = useMemo(() => (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
      <li>
        <div className="flex aspect-[4/3] items-center justify-center rounded-md text-muted">
          <Folder className={`${mediaFolderIconClassName} animate-pulse`} />
        </div>
        <div className="flex items-center justify-center p-2">
          <div className="overflow-hidden h-9">
            <Skeleton className="mb-2 h-5 w-24 rounded"/>
          </div>
        </div>
      </li>
      {[...Array(3)].map((_, index) => (
        <li key={index}>
          <Skeleton className="aspect-[4/3] rounded-md" />
        </li>
      ))}
    </ul>
  ), []);

  const breadcrumbNode = useMemo(() => {
    const breadcrumbTextClass = usePageHeader
      ? "min-w-0 flex-nowrap items-center gap-x-1 gap-y-0.5 overflow-hidden text-xs font-medium leading-none md:gap-1.5"
      : "text-sm flex-nowrap";
    const isDialog = !usePageHeader;
    const mediaTitle = mediaConfig.label || mediaConfig.name || "Media";
    const rootPath = normalizePath(mediaConfig.input);
    const currentPath = normalizePath(path || mediaConfig.input);
    const relativePath = getRelativePath(currentPath, rootPath);
    const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];

    if (isDialog && segments.length === 0) return null;

    const entries = segments.map((segment, index) => ({
      name: segment,
      path: joinPathSegments([rootPath, segments.slice(0, index + 1).join("/")]),
    }));

    const middleEntries = entries.length > 3 ? entries.slice(1, -1) : [];
    const visibleEntries = entries.length > 3
      ? [entries[0], entries[entries.length - 1]]
      : entries;

    const currentPageClass = usePageHeader
      ? "repo-page-header__title block truncate font-bold"
      : "block max-w-full truncate";

    return (
      <Breadcrumb>
        <BreadcrumbList className={breadcrumbTextClass}>
          <BreadcrumbItem className={entries.length === 0 ? "min-w-0 max-w-full truncate" : undefined}>
            {entries.length > 0 ? (
              <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(rootPath)}>
                {isDialog ? (
                  <>
                    <House className="size-3.5" />
                    <span className="sr-only">{mediaTitle}</span>
                  </>
                ) : (
                  mediaTitle
                )}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className={currentPageClass}>{mediaTitle}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {entries.length > 0 && <BreadcrumbSeparator />}

          {entries.length > 3 && (
            <>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center">
                    <BreadcrumbEllipsis className="h-4 w-4" />
                    <span className="sr-only">Show hidden segments</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {middleEntries.map((entry) => (
                      <DropdownMenuItem
                        key={entry.path}
                        className="cursor-pointer"
                        onClick={() => handleNavigate(entry.path)}
                      >
                        {entry.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}

          {visibleEntries.map((entry, index) => {
            const isLast = index === visibleEntries.length - 1;
            return (
              <Fragment key={entry.path}>
                <BreadcrumbItem className={isLast ? "min-w-0 max-w-full truncate" : undefined}>
                  {isLast ? (
                    <BreadcrumbPage className={currentPageClass}>{entry.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(entry.path)}>
                      {entry.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }, [handleNavigate, mediaConfig.input, mediaConfig.label, mediaConfig.name, path, usePageHeader]);

  const isMediaRoot =
    normalizePath(path || mediaConfig.input) ===
    normalizePath(mediaConfig.input);
  const goToMediaHome = useCallback(() => {
    if (!isMediaRoot) {
      handleNavigate(mediaConfig.input);
    }
  }, [handleNavigate, isMediaRoot, mediaConfig.input]);

  const headerNode = useMemo(() => (
    <RepoPageHeader
      mobileMainClick={isMediaRoot ? undefined : goToMediaHome}
      title={
        <div className="min-w-0 truncate overflow-hidden">{breadcrumbNode}</div>
      }
    >
      <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
        <MediaHeaderActions
          actionNode={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingPath}
                onClick={() => setPathPickerOpen(true)}
              >
                更改路径
              </Button>
              {mediaActions.length > 0 ? (
                <RepoActionButtons
                  actions={mediaActions}
                  owner={config.owner}
                  repo={config.repo}
                  refName={config.branch}
                  contextType="media"
                  contextName={mediaConfig.name}
                  contextPath={path}
                  contextData={{
                    label: mediaConfig.label || mediaConfig.name,
                    input: mediaConfig.input,
                    output: mediaConfig.output,
                  }}
                />
              ) : null}
            </>
          }
          mediaName={mediaConfig.name}
          path={path}
          onFolderCreate={handleFolderCreate}
        />
      </MediaUpload>
    </RepoPageHeader>
  ), [breadcrumbNode, config.branch, config.owner, config.repo, filteredExtensions, goToMediaHome, handleFolderCreate, handleUpload, isMediaRoot, mediaActions, mediaConfig.input, mediaConfig.label, mediaConfig.name, mediaConfig.output, path, savingPath]);

  useOptionalRepoHeader(
    { header: headerNode },
    { enabled: usePageHeader },
  );

  const selectedPaths = useMemo(() => new Set(selected), [selected]);

  const gridItems = useMemo(() => {
    if (!filteredData) return [];

    return filteredData.map((item) => {
      const extension = (item.extension || "").toLowerCase();
      return {
        item,
        isPreviewable:
          item.type === "file" &&
          (imageExtensionsSet.has(extension) || videoExtensionsSet.has(extension)),
      };
    });
  }, [filteredData, imageExtensionsSet, videoExtensionsSet]);

  const mediaPathDialogs = (
    <>
      <PagePathPicker
        open={pathPickerOpen}
        onOpenChange={setPathPickerOpen}
        mode="folder"
        value={mediaConfig?.input || ""}
        onSelect={(selectedPath) => {
          void handleSaveMediaPath(selectedPath);
        }}
      />
      <LocalWorkspaceDialog
        open={workspaceOpen}
        onOpenChange={setWorkspaceOpen}
      />
    </>
  );

  if (!mediaConfig?.input) {
    return (
      <>
        <Empty className="w-full flex-1 border-0 shadow-none">
          <EmptyHeader>
            <EmptyTitle>选择媒体目录</EmptyTitle>
            <EmptyDescription>
              首次使用请选择仓库中存放图片等静态资源的目录（如 static、public）。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              disabled={savingPath}
              onClick={() => setPathPickerOpen(true)}
            >
              选择路径
            </Button>
          </EmptyContent>
        </Empty>
        {mediaPathDialogs}
      </>
    );
  }

  if (error) {
    if (error === "Not found") {
      const isRootFolder = path === mediaConfig.input;
      return (
        <>
          <Empty className="w-full flex-1 border-0 shadow-none">
            <EmptyHeader>
              <EmptyTitle>媒体文件夹不存在</EmptyTitle>
              <EmptyDescription>
                {isRootFolder
                  ? `媒体目录「${mediaConfig.input}」尚未创建。`
                  : `找不到文件夹「${path}」。`}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex flex-wrap gap-2">
              {isRootFolder ? (
                <EmptyCreate type="media" name={mediaConfig.name}>
                  创建文件夹
                </EmptyCreate>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={savingPath}
                onClick={() => setPathPickerOpen(true)}
              >
                重新选择路径
              </Button>
            </EmptyContent>
          </Empty>
          {mediaPathDialogs}
        </>
      );
    }

    const needsLocalWorkspace = isMissingLocalWorkspaceError(error);
    return (
      <>
        <Empty className="w-full flex-1 border-0 shadow-none">
          <EmptyHeader>
            <EmptyTitle>出了点问题</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex flex-wrap gap-2">
            {needsLocalWorkspace ? (
              <Button type="button" onClick={() => setWorkspaceOpen(true)}>
                选择本地项目目录
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => handleNavigate(mediaConfig.input)}
                >
                  打开媒体根目录
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingPath}
                  onClick={() => setPathPickerOpen(true)}
                >
                  重新选择路径
                </Button>
              </>
            )}
          </EmptyContent>
        </Empty>
        {mediaPathDialogs}
      </>
    );
  }

  const mediaGrid = (
    <MediaUpload.DropZone className="flex-1 overflow-auto scrollbar">
      <div className="h-full relative flex flex-col" ref={filesGridRef}>
        {isLoading
          ? loadingSkeleton
          : gridItems.length > 0
            ? <ul className="grid grid-cols-2 gap-4 p-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
                {gridItems.map(({ item, isPreviewable }) => 
                  <li
                    key={item.path}
                    className="[content-visibility:auto] [contain-intrinsic-size:auto_12rem]"
                  >
                    {item.type === "dir"
                      ? <MediaFolderTile item={item} onNavigate={handleNavigate} />
                      : <MediaFileTile
                          item={item}
                          mediaName={mediaConfig.name}
                          selectable={!!onSelect}
                          isSelected={selectedPaths.has(item.path)}
                          isPreviewable={isPreviewable}
                          portalContainer={filesGridRef.current}
                          onSelect={handleSelect}
                          onPreview={setPreviewItem}
                          onDelete={handleDelete}
                          onRename={handleRename}
                        />
                    }
                    
                  </li>
                )}
              </ul>
            : <Empty className="border-0 shadow-none">
                <EmptyHeader>
                  <EmptyTitle>空文件夹</EmptyTitle>
                  <EmptyDescription>将文件拖放到此处，或使用「上传」添加到此文件夹。</EmptyDescription>
                </EmptyHeader>
              </Empty>
        }
      </div>
    </MediaUpload.DropZone>
  );

  if (!usePageHeader) {
    return (
      <>
        <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
          <div className="flex-1 flex flex-col space-y-4">
            <header className="flex items-center gap-x-2 justify-between">
              <div className="sm:flex-1">
                <div className="hidden sm:block min-w-0 truncate overflow-hidden">{breadcrumbNode}</div>
                <Button onClick={handleNavigateParent} size="icon-sm" variant="outline" className="shrink-0 sm:hidden" disabled={!path || path === mediaConfig.input}>
                  <CornerLeftUp className="w-4 h-4"/>
                </Button>
              </div>
              <MediaHeaderActions
                actionNode={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingPath}
                      onClick={() => setPathPickerOpen(true)}
                    >
                      更改路径
                    </Button>
                    {mediaActions.length > 0 ? (
                      <RepoActionButtons
                        actions={mediaActions}
                        owner={config.owner}
                        repo={config.repo}
                        refName={config.branch}
                        contextType="media"
                        contextName={mediaConfig.name}
                        contextPath={path}
                        contextData={{
                          label: mediaConfig.label || mediaConfig.name,
                          input: mediaConfig.input,
                          output: mediaConfig.output,
                        }}
                      />
                    ) : null}
                  </>
                }
                mediaName={mediaConfig.name}
                path={path}
                onFolderCreate={handleFolderCreate}
              />
            </header>
            {mediaGrid}
          </div>
        </MediaUpload>
        <MediaPreview
          mediaName={mediaConfig.name}
          path={previewItem?.path ?? null}
          src={previewItem?.url}
          open={Boolean(previewItem)}
          onOpenChange={(open) => {
            if (!open) setPreviewItem(null);
          }}
        />
        {mediaPathDialogs}
      </>
    );
  }

  return (
    <>
      <div className="flex-1 flex flex-col space-y-4">
        <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
          {mediaGrid}
        </MediaUpload>
      </div>
      <MediaPreview
        mediaName={mediaConfig.name}
        path={previewItem?.path ?? null}
        src={previewItem?.url}
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
      />
      {mediaPathDialogs}
    </>
  );
};

export { MediaView };
