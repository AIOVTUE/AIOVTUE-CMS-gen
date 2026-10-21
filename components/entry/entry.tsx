"use client";

import { Fragment, useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useAppRouter } from "@/hooks/use-app-router";
import Link from "next/link";
import { useConfig } from "@/contexts/config-context";
import { parseAndValidateConfig } from "@/lib/config-validate";
import { resolveContentOperations } from "@/lib/operations";
import { isDeferredCommitRepoClient } from "@/lib/deferred-commits-client";
import { notifyCmsLocalSave } from "@/lib/cms-client-events";
import { requireApiSuccess } from "@/lib/api-client";
import { getSchemaActions } from "@/lib/actions";
import {
  generateFilename,
  getPrimaryField,
  getSchemaByName,
  safeAccess,
} from "@/lib/schema";
import {
  getFileExtension,
  getFileName,
  getParentPath,
  getRelativePath,
  joinPathSegments,
  normalizePath
} from "@/lib/utils/file";
import { parse, splitFrontmatterSource } from "@/lib/serialization";
import type { ApiSuccess, EntryData, EntryHistoryItem } from "@/types/api";
import { EntryForm } from "./entry-form";
import { usesBlogEditLayout, isWeeklyPostContext } from "@/lib/entry-blog-layout";
import {
  EXCALIDRAW_COLLECTION,
  getDefaultExcalidrawPath,
} from "@/lib/excalidraw-bundle";
import {
  buildNodeBundleEntryPath,
  getNodeEntryFilename,
  normalizeNodeBundleSlug,
  resolveNodeBundleSlug,
} from "@/lib/node-bundle";
import { getCollectionListHref } from "@/lib/collection-navigation";
import { EntryHistoryDropdown } from "./entry-history";
import "./entry-blog-props.css";
import { EmptyCreate } from "@/components/empty-create";
import { FileOptions } from "@/components/file/file-options";
import { RepoActionButtons } from "@/components/repo/repo-action-buttons";
import { LocalWorkspaceDialog } from "@/components/repo/local-workspace-dialog";
import { isMissingLocalWorkspaceError } from "@/lib/local-repo/missing-path";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
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
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { encodeRepoPathParam, repoHref } from "@/lib/repo-href";
import { EllipsisVertical, Lock, LockOpen, Save } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";

type LintView = {
  state: {
    doc: {
      toString(): string;
    };
  };
};

type GroupTrailItem = {
  name: string;
  label?: string | null;
};

export function Entry({
  name = "",
  path: initialPath,
  parent,
  title,
  headerMeta,
  onSave,
}: {
  name?: string;
  path?: string;
  parent?: string;
  title?: string;
  headerMeta?: ReactNode;
  onSave?: (data: Record<string, unknown>) => void;
}) {
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [entry, setEntry] = useState<EntryData | null>();
  const [sha, setSha] = useState<string | undefined>();
  const [displayTitle, setDisplayTitle] = useState<string>(() => {
    if (title) return title;
    if (initialPath && initialPath !== ".pages.yml") {
      return getFileName(normalizePath(initialPath));
    }
    return "条目";
  });
  const [isLoading, setIsLoading] = useState(path ? true : false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [hasRegisteredChanges, setHasRegisteredChanges] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [error, setError] = useState<string | undefined | null>(null);
  const changeVersionRef = useRef(0);
  const { mutate } = useSWRConfig();

  const router = useAppRouter();
  
  const { config } = useConfig();
  if (!config) throw new Error(`Config not found.`);
  
  const schema = useMemo(() => {
    if (!name) return;
    return getSchemaByName(config?.object, name)
  }, [config, name]);
  const schemaType = schema?.type;
  const operations = useMemo(
    () =>
      resolveContentOperations({
        schema,
        scope:
          path === ".pages.yml" || initialPath === ".pages.yml"
            ? "settings"
            : undefined,
      }),
    [initialPath, path, schema],
  );
  const canCreate = operations.create;
  const canRename = operations.rename;
  const canDelete = operations.delete;
  const isFileEditorMode = !schema?.fields || schema.fields.length === 0;
  const usesBlogLayout = usesBlogEditLayout(name, schema);
  const nodeEntryFilename = useMemo(
    () => getNodeEntryFilename(schema),
    [schema],
  );
  const isNodeBundle = Boolean(nodeEntryFilename);
  const collectionLayout = (schema?.view as { layout?: string } | undefined)?.layout;
  const getCollectionHref = useCallback(
    (entryPath?: string, folderParent?: string) =>
      getCollectionListHref({
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        collectionName: name,
        schemaPath: schema?.path,
        layout: collectionLayout,
        entryPath,
        parent: folderParent ?? parent,
        isNodeBundle,
      }),
    [
      collectionLayout,
      config.branch,
      config.owner,
      config.repo,
      isNodeBundle,
      name,
      parent,
      schema?.path,
    ],
  );
  const entryExtension = (schema?.extension || "md").replace(/^\./, "");
  const filenameFieldMode = useMemo(() => {
    if (!schema || schema.type !== "collection") return "hidden";
    // Blog editor always exposes Slug (filename stem) next to title.
    if (usesBlogLayout) return "enabled";
    if (schema.filenameField === true) return "enabled";
    if (schema.filenameField === "create") return "create";
    if (schema.filenameField === false) return "hidden";
    return isFileEditorMode ? "enabled" : "hidden";
  }, [isFileEditorMode, schema, usesBlogLayout]);
  const showFilenameField = useMemo(() => {
    if (schemaType !== "collection") return false;
    if (filenameFieldMode === "enabled") return true;
    if (filenameFieldMode === "create") return !path;
    return false;
  }, [filenameFieldMode, path, schemaType]);
  const [filenameValue, setFilenameValue] = useState("");
  const [isFilenameUnlocked, setIsFilenameUnlocked] = useState(false);
  /** Blog layout: slug is always editable (no lock toggle). */
  const slugEditable = !path || isFilenameUnlocked || usesBlogLayout;

  const stripEntryExtension = useCallback((filename: string) => {
    const normalized = normalizePath(filename).split("/").pop() || "";
    if (
      entryExtension &&
      normalized.toLowerCase().endsWith(`.${entryExtension.toLowerCase()}`)
    ) {
      return normalized.slice(0, -(entryExtension.length + 1));
    }
    return normalized;
  }, [entryExtension]);

  const withEntryExtension = useCallback((slug: string) => {
    const stem = normalizePath(slug.replace(/[\\/]/g, "")).split("/").pop() || "";
    if (!stem) return "";
    if (
      entryExtension &&
      stem.toLowerCase().endsWith(`.${entryExtension.toLowerCase()}`)
    ) {
      return stem;
    }
    return entryExtension ? `${stem}.${entryExtension}` : stem;
  }, [entryExtension]);

  const slugInputValue = stripEntryExtension(filenameValue);

  const handleSlugChange = useCallback((next: string) => {
    if (isNodeBundle) {
      setFilenameValue(normalizeNodeBundleSlug(next));
      return;
    }
    setFilenameValue(withEntryExtension(next));
  }, [isNodeBundle, withEntryExtension]);

  /** Path shown in props — last segment always tracks the current slug. */
  const displayEntryPath = useMemo(() => {
    if (isNodeBundle && nodeEntryFilename) {
      const slug = normalizeNodeBundleSlug(filenameValue || slugInputValue);
      const basePath = path
        ? getParentPath(getParentPath(normalizePath(path)))
        : parent ?? schema?.path;
      if (!basePath || !slug) return undefined;
      return buildNodeBundleEntryPath(basePath, slug, nodeEntryFilename);
    }

    const fileName = withEntryExtension(filenameValue || slugInputValue);
    if (!fileName && !path) return undefined;
    if (path) {
      const parentDir = getParentPath(normalizePath(path));
      return fileName
        ? joinPathSegments([parentDir, fileName].filter(Boolean))
        : normalizePath(path);
    }
    const basePath = parent ?? schema?.path;
    if (!basePath || !fileName) return undefined;
    return joinPathSegments([basePath, fileName]);
  }, [
    filenameValue,
    isNodeBundle,
    nodeEntryFilename,
    parent,
    path,
    schema?.path,
    slugInputValue,
    withEntryExtension,
  ]);
  
  const entryFields = useMemo(() => {
    return !schema?.fields || schema.fields.length === 0
      ? [{
          name: "body",
          type: "code",
          label: showFilenameField ? "内容" : false,
          options: {
            format: schema?.extension || (entry?.name && getFileExtension(entry.name)) || "markdown",
            lintFn: path === ".pages.yml"
              ? (view: LintView) => {
                  const {parseErrors, validationErrors} = parseAndValidateConfig(view.state.doc.toString());
                  return [...parseErrors, ...validationErrors];
                }
              : undefined
          }
        }]
      : schema?.list === true
        ? [{
            name: "listWrapper",
            label: false,
            type: "object",
            list: true,
            fields: schema.fields
          }]
        : schema.fields;
  }, [schema, entry, path, showFilenameField]);

  const entryTemplateSeed = useMemo(() => {
    if (path) return null;
    const templateText =
      typeof schema?.entryTemplate === "string" ? schema.entryTemplate : "";
    if (!templateText.trim()) return null;
    const useFrontmatter =
      schema?.template === "article" ||
      (typeof schema?.format === "string" &&
        schema.format.includes("frontmatter"));
    if (useFrontmatter) {
      const options = {
        format: schema?.format,
        delimiters: schema?.delimiters,
      };
      const split = splitFrontmatterSource(templateText, options);
      const contentObject = parse(templateText, options) as Record<
        string,
        unknown
      >;
      return {
        contentObject:
          contentObject && typeof contentObject === "object"
            ? contentObject
            : { body: templateText },
        frontmatterRaw: split.matched ? split.frontmatter : "",
      };
    }
    return {
      contentObject: { body: templateText },
      frontmatterRaw: null as string | null,
    };
  }, [
    path,
    schema?.delimiters,
    schema?.entryTemplate,
    schema?.format,
    schema?.template,
  ]);

  const entryContentObject = useMemo(() => {
    return path
      ? schema?.list === true
        ? { listWrapper: entry?.contentObject }
        : entry?.contentObject
      : schema?.list === true
        ? { listWrapper: [] }
        : (entryTemplateSeed?.contentObject ?? {});
  }, [schema, entry, path, entryTemplateSeed]);

  useEffect(() => {
    if (!showFilenameField || schemaType !== "collection" || !schema) return;

    if (path) {
      if (isNodeBundle && nodeEntryFilename) {
        setFilenameValue(resolveNodeBundleSlug(path, nodeEntryFilename));
      } else {
        setFilenameValue(getFileName(normalizePath(path)));
      }
      setIsFilenameUnlocked(false);
      return;
    }

    if (usesBlogLayout) {
      // New blog posts: leave slug empty for manual input.
      setFilenameValue("");
      setIsFilenameUnlocked(true);
    }
  }, [path, schema, schemaType, showFilenameField, usesBlogLayout, isNodeBundle, nodeEntryFilename]);

  useEffect(() => {
    if (
      !showFilenameField ||
      schemaType !== "collection" ||
      !schema ||
      path ||
      usesBlogLayout
    ) {
      return;
    }

    const generated = generateFilename(
      schema.filename,
      schema,
      entryContentObject as Record<string, unknown>,
    );
    setFilenameValue(generated || "未命名");
    setIsFilenameUnlocked(true);
  }, [
    entryContentObject,
    path,
    schema,
    schemaType,
    showFilenameField,
    usesBlogLayout,
  ]);

  const entryApiUrl = useMemo(() => (
    path
      ? `/api${repoHref(config.owner, config.repo, config.branch)}/entries/${encodeURIComponent(path)}?name=${encodeURIComponent(name)}`
      : null
  ), [config.branch, config.owner, config.repo, name, path]);

  const fetchEntryByUrl = useCallback(async (apiUrl: string): Promise<EntryData> => {
    const response = await fetch(apiUrl);
    const data = await requireApiSuccess<any>(
      response,
      "加载条目失败",
    );
    return data.data as EntryData;
  }, []);

  const {
    data: swrEntryData,
    error: swrEntryError,
    isLoading: swrEntryLoading,
    mutate: mutateEntry,
  } = useSWR<EntryData>(
    entryApiUrl,
    fetchEntryByUrl,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    },
  );

  useEffect(() => {
    if (!path) return;
    setIsLoading(swrEntryLoading);
  }, [path, swrEntryLoading]);

  const appliedEntryPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!swrEntryData || !path) return;
    // Don't wipe in-progress edits on SWR reconnect/revalidate.
    if (
      (isFormDirty || hasRegisteredChanges) &&
      appliedEntryPathRef.current === path
    ) {
      return;
    }
    appliedEntryPathRef.current = path;
    setEntry(swrEntryData);
    setSha(swrEntryData.sha);
    setHasRegisteredChanges(false);
    setIsLoading(false);
    setError(null);

    if (initialPath && schema && schema.type === "collection") {
      const primaryField = getPrimaryField(schema);
      const primaryValue = primaryField
        ? safeAccess(swrEntryData.contentObject ?? {}, primaryField)
        : undefined;
      const hasPrimaryValue = typeof primaryValue === "string"
        ? primaryValue !== ""
        : primaryValue != null;
      const titleValue = hasPrimaryValue
        ? String(primaryValue)
        : getFileName(normalizePath(path));
      setDisplayTitle(titleValue);
    } else if (!title && path && path !== ".pages.yml") {
      setDisplayTitle(getFileName(normalizePath(path)));
    }
  }, [
    hasRegisteredChanges,
    initialPath,
    isFormDirty,
    path,
    schema,
    swrEntryData,
    title,
  ]);

  useEffect(() => {
    if (!swrEntryError) return;
    const message = swrEntryError instanceof Error ? swrEntryError.message : "加载条目失败。";
    setError(message);
    setIsLoading(false);
  }, [swrEntryError]);

  const historyApiUrl = useMemo(() => (
    path
      ? `/api${repoHref(config.owner, config.repo, config.branch)}/entries/${encodeURIComponent(path)}/history?name=${encodeURIComponent(name)}`
      : null
  ), [config.branch, config.owner, config.repo, name, path]);

  const historyKey = useMemo(
    () => historyApiUrl ? [historyApiUrl, sha ?? ""] as const : null,
    [historyApiUrl, sha],
  );

  const fetchEntryHistory = useCallback(async ([apiUrl]: readonly [string, string]): Promise<EntryHistoryItem[]> => {
    const response = await fetch(apiUrl);
    const data = await requireApiSuccess<any>(
      response,
      "加载条目历史失败",
    );
    return data.data as EntryHistoryItem[];
  }, []);

  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: historyData, isLoading: historyLoading } = useSWR<EntryHistoryItem[]>(
    historyOpen ? historyKey : null,
    fetchEntryHistory,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5000,
    },
  );

  const currentFilename = useMemo(() => {
    if (!path) return "";
    if (isNodeBundle && nodeEntryFilename) {
      return resolveNodeBundleSlug(path, nodeEntryFilename);
    }
    return getFileName(normalizePath(path));
  }, [path, isNodeBundle, nodeEntryFilename]);
  const filenameChanged = showFilenameField
    && filenameValue.trim().length > 0
    && filenameValue.trim() !== currentFilename;

  const onSubmit = async (rawContentObject: Record<string, unknown>) => {
    setIsSaving(true);
    const submitStartChangeVersion = changeVersionRef.current;

    const savePromise = new Promise<ApiSuccess<EntryData>>(async (resolve, reject) => {
      try {
        let savePath = path;
        let contentObject = { ...rawContentObject };
        const trimmedFilename = filenameValue.trim();
        const normalizedFilename = isNodeBundle
          ? normalizeNodeBundleSlug(trimmedFilename)
          : withEntryExtension(
              normalizePath(trimmedFilename).split("/").pop() || "",
            );

        if (showFilenameField && !normalizedFilename) {
          throw new Error("请填写文件名。");
        }

        if (!savePath) {
          if (!schema) throw new Error("缺少内容结构，无法创建条目。");
          if (!canCreate) throw new Error("此内容不允许新建条目。");
          const basePath = parent ?? schema.path;
          if (basePath == null) throw new Error("缺少目标路径，无法创建条目。");
          if (isNodeBundle && nodeEntryFilename) {
            savePath = buildNodeBundleEntryPath(
              basePath,
              normalizedFilename,
              nodeEntryFilename,
            );
          } else {
            const generatedFilename = showFilenameField
              ? normalizedFilename
              : generateFilename(schema.filename, schema, contentObject);
            savePath = joinPathSegments([basePath, generatedFilename]);
          }
        } else if (filenameChanged && !canRename && schemaType === "collection") {
          throw new Error("不允许重命名此条目。");
        } else if (
          showFilenameField
          && filenameFieldMode === "enabled"
          && slugEditable
          && filenameChanged
          && schemaType === "collection"
        ) {
          const newPath = isNodeBundle && nodeEntryFilename
            ? buildNodeBundleEntryPath(
                getParentPath(getParentPath(normalizePath(savePath))),
                normalizedFilename,
                nodeEntryFilename,
              )
            : joinPathSegments([getParentPath(savePath), normalizedFilename]);
          const renameResponse = await fetch(
            `/api${repoHref(config.owner, config.repo, config.branch)}/files/${encodeURIComponent(savePath)}/rename`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "content",
                name,
                newPath,
              }),
            },
          );
          await requireApiSuccess<any>(renameResponse, "重命名文件失败");

          if (name === EXCALIDRAW_COLLECTION) {
            const oldExcalidrawPath = getDefaultExcalidrawPath(savePath);
            const newExcalidrawPath = getDefaultExcalidrawPath(newPath);
            if (oldExcalidrawPath !== newExcalidrawPath) {
              const excalidrawRenameResponse = await fetch(
                `/api${repoHref(config.owner, config.repo, config.branch)}/files/${encodeURIComponent(oldExcalidrawPath)}/rename`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "content",
                    name,
                    newPath: newExcalidrawPath,
                  }),
                },
              );
              if (excalidrawRenameResponse.ok) {
                await requireApiSuccess<any>(
                  excalidrawRenameResponse,
                  "重命名画板文件失败",
                );
              }
            }
          }

          savePath = newPath;
          setPath(newPath);
          setIsFilenameUnlocked(false);

          const collectionKeyPrefix = `/api${repoHref(config.owner, config.repo, config.branch)}/collections/${encodeURIComponent(name)}?`;
          void mutate((key) => typeof key === "string" && key.startsWith(collectionKeyPrefix));
        }

        const response = await fetch(`/api${repoHref(config.owner, config.repo, config.branch)}/files/${encodeURIComponent(savePath)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: path === ".pages.yml" ? "settings" : "content",
            name,
            content: schema?.list === true
              ? contentObject.listWrapper
              : contentObject,
            sha: sha
          }),
        });
        const data = await requireApiSuccess<any>(
          response,
          "保存文件失败",
        );
        
        if (data.data.sha !== sha) setSha(data.data.sha);
        if (submitStartChangeVersion === changeVersionRef.current) {
          setHasRegisteredChanges(false);
        }

        if (schemaType === "collection") {
          const collectionKeyPrefix = `/api${repoHref(config.owner, config.repo, config.branch)}/collections/${encodeURIComponent(name)}?`;
          void mutate((key) => typeof key === "string" && key.startsWith(collectionKeyPrefix));

          // Return to collection list after save (stay on settings / single-file pages).
          router.push(getCollectionHref(savePath));
        }

        resolve(data);
      } catch (error) {
        reject(error);
      }
    });

    toast.promise(savePromise, {
      loading: "正在保存…",
      success: (response: ApiSuccess<EntryData>) => {
        if (onSave) onSave(response.data);
        if (isDeferredCommitRepoClient(config.owner, config.repo)) {
          notifyCmsLocalSave();
          return config.owner === "local"
            ? "已保存到本地（尚未发布到 GitHub）"
            : "已保存到数据库（尚未发布到 GitHub）";
        }
        return response.message;
      },
      error: (error: unknown) => error instanceof Error ? error.message : "保存文件失败。",
    });

    try {
      await savePromise;
      if (submitStartChangeVersion === changeVersionRef.current) {
        setHasRegisteredChanges(false);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isBusy = isLoading || isSaving || isDeleting;

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey) return;

      event.preventDefault();
      if (isBusy) return;

      const form = document.getElementById("entry-form");
      if (form instanceof HTMLFormElement) {
        form.requestSubmit();
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [isBusy]);

  const handleBeforeDelete = useCallback(() => {
    setIsDeleting(true);
  }, []);

  const handleDelete = useCallback((path: string) => {
    setIsDeleting(false);
    if (schemaType === "collection") {
      const collectionKeyPrefix = `/api${repoHref(config.owner, config.repo, config.branch)}/collections/${encodeURIComponent(name)}?`;
      void mutate((key) => typeof key === "string" && key.startsWith(collectionKeyPrefix));
    }
    if (schemaType === "collection") {
      router.push(getCollectionHref(path));
    } else {
      if (entryApiUrl) {
        void mutate(entryApiUrl, undefined, { revalidate: true });
      }
      void mutateEntry();
    }
  }, [config.branch, config.owner, config.repo, entryApiUrl, getCollectionHref, mutate, mutateEntry, name, router, schemaType]);

  const handleRename = useCallback((oldPath: string, newPath: string) => {
    if (schemaType === "collection") {
      const collectionKeyPrefix = `/api${repoHref(config.owner, config.repo, config.branch)}/collections/${encodeURIComponent(name)}?`;
      void mutate((key) => typeof key === "string" && key.startsWith(collectionKeyPrefix));
    }
    if (entryApiUrl) {
      void mutate(entryApiUrl, undefined, { revalidate: false });
    }
    setPath(newPath);
    router.replace(`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeRepoPathParam(newPath)}`);
  }, [config.branch, config.owner, config.repo, entryApiUrl, mutate, name, router, schemaType]);

  const breadcrumbCurrentLabel = displayTitle;

  const breadcrumbNode = useMemo(() => {
    const pageLabel = (
      <BreadcrumbPage className="repo-page-header__crumb repo-page-header__crumb--current">
        {breadcrumbCurrentLabel}
      </BreadcrumbPage>
    );

    if (!schema) {
      return pageLabel;
    }

    const groupTrail: GroupTrailItem[] = Array.isArray(schema.groupTrail)
      ? schema.groupTrail
      : [];

    const groupTrailNodes = groupTrail.map((group) => (
      <Fragment key={`group-${group.name}`}>
        <BreadcrumbItem className="hidden md:inline-flex">
          <span className="repo-page-header__crumb">{group.label || group.name}</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
      </Fragment>
    ));

    if (schemaType !== "collection") {
      return (
        <>
          {groupTrailNodes}
          <BreadcrumbItem>{pageLabel}</BreadcrumbItem>
        </>
      );
    }

    const rootLabel = schema.label || schema.name || name;

    if (!path) {
      return (
        <>
          {groupTrailNodes}
          <BreadcrumbItem className="shrink-0">
            <BreadcrumbLink asChild>
              <Link
                className="repo-page-header__crumb"
                href={`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}`}
              >
                {rootLabel}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>{pageLabel}</BreadcrumbItem>
        </>
      );
    }

    const rootPath = normalizePath(schema.path);
    const parentPath = normalizePath(getParentPath(path));
    const relativePath = getRelativePath(parentPath, rootPath);
    const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];

    const parentEntries = segments.map((segment, index) => ({
      name: segment,
      path: joinPathSegments([rootPath, segments.slice(0, index + 1).join("/")]),
    }));

    const immediateParent = parentEntries.length > 0 ? parentEntries[parentEntries.length - 1] : null;
    const middleEntries = parentEntries.length > 1 ? parentEntries.slice(0, -1) : [];

    return (
      <>
        {groupTrailNodes}
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink asChild>
            <Link
              className="repo-page-header__crumb"
              href={`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}`}
            >
              {rootLabel}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />

        {middleEntries.length > 0 && (
          <>
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center">
                  <BreadcrumbEllipsis className="h-4 w-4" />
                  <span className="sr-only">显示隐藏路径</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {middleEntries.map((entry) => (
                    <DropdownMenuItem key={entry.path} asChild>
                      <Link href={`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}?path=${encodeURIComponent(entry.path)}`}>
                        {entry.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        {immediateParent && (
          <>
            <BreadcrumbItem className="min-w-0 max-w-full shrink">
              <BreadcrumbLink asChild>
                <Link
                  className="repo-page-header__crumb"
                  href={`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}?path=${encodeURIComponent(immediateParent.path)}`}
                >
                  {immediateParent.name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        <BreadcrumbItem>{pageLabel}</BreadcrumbItem>
      </>
    );
  }, [breadcrumbCurrentLabel, config.branch, config.owner, config.repo, name, path, schema, schemaType]);
  const isCreationBlocked = !path && schemaType === "collection" && !canCreate;
  const showHeaderActions = error !== "Not found" && !isCreationBlocked;
  const headerActionsNode = useMemo(() => {
    if (!schema || !path) return null;

    if (schemaType === "file") {
      const fileActions = getSchemaActions(schema);
      if (fileActions.length === 0) return null;

      return (
        <RepoActionButtons
          actions={fileActions}
          owner={config.owner}
          repo={config.repo}
          refName={config.branch}
          contextType="file"
          contextName={schema.name}
          contextPath={path}
          contextData={{
            label: schema.label || schema.name,
            sha: sha ?? null,
            content: entry?.contentObject ?? null,
          }}
        />
      );
    }

    if (schemaType === "collection" && entry) {
      const entryActions = getSchemaActions(schema, "entry");
      if (entryActions.length === 0) return null;

      return (
        <RepoActionButtons
          actions={entryActions}
          owner={config.owner}
          repo={config.repo}
          refName={config.branch}
          contextType="entry"
          contextName={schema.name}
          contextPath={path}
          contextData={{
            label: schema.label || schema.name,
            entryName: entry.name ?? null,
            sha: sha ?? null,
            content: entry.contentObject ?? null,
          }}
        />
      );
    }

    return null;
  }, [config.branch, config.owner, config.repo, entry, path, schema, schemaType, sha]);

  const isFixedFileList =
    schema?.template === "source-files" ||
    (Array.isArray(schema?.files) && schema.files.length > 0);
  const collectionRootHref = `${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}`;
  const cancelHref =
    schemaType === "file"
      ? `${repoHref(config.owner, config.repo, config.branch)}`
      : isFixedFileList
        ? collectionRootHref
        : getCollectionHref(path);
  const blogEditorHeading = useMemo(() => {
    if (schemaType === "file") {
      return schema?.label || name || "页面";
    }
    if (name === "moments") {
      return path ? "动态" : "新建动态";
    }
    if (name === "gallery") {
      return path ? "图库" : "新建图库";
    }
    if (name === "excalidraw") {
      return path ? "画板" : "新建画板";
    }
    if (name === "links" || schema?.template === "friend-links") {
      return schema?.label || "友链";
    }
    if (name === "about") {
      return "关于";
    }
    if (name === "memories") {
      return path ? "回忆" : "新建回忆";
    }
    if (
      name === "posts" &&
      isWeeklyPostContext(entry?.contentObject?.categories, path ?? undefined)
    ) {
      return path ? "周刊" : "新建周刊";
    }
    return path ? (schema?.label || "文章") : "新建文章";
  }, [
    entry?.contentObject?.categories,
    name,
    path,
    schema?.label,
    schema?.template,
    schemaType,
  ]);
  const saveDisabled =
    isBusy ||
    (showFilenameField && filenameValue.trim().length === 0) ||
    (
      Boolean(path) &&
      !(
        isFormDirty
        || hasRegisteredChanges
        || (
          showFilenameField
          && filenameFieldMode === "enabled"
          && slugEditable
          && filenameChanged
        )
      )
    );

  const headerNode = useMemo(() => {
    if (usesBlogEditLayout(name, schema)) {
      return (
        <RepoPageHeader
          title={blogEditorHeading}
          mobileMainClick={() => router.push(cancelHref)}
        >
          {showHeaderActions && (
            <>
              <Button
                type="button"
                variant="ghost"
                className="entry-blog-editor-head__btn"
                asChild
              >
                <Link href={cancelHref}>取消</Link>
              </Button>
              <Button
                type="submit"
                form="entry-form"
                variant="ghost"
                className="entry-blog-editor-head__btn entry-blog-editor-head__btn--save"
                disabled={saveDisabled}
              >
                保存
              </Button>
              {path && sha && name !== "about" && name !== "links" && (
                <FileOptions
                  path={path}
                  sha={sha}
                  type={path === ".pages.yml" ? "settings" : (schemaType ?? "content")}
                  name={name}
                  canDelete={canDelete}
                  canRename={canRename}
                  onBeforeDelete={handleBeforeDelete}
                  onDelete={handleDelete}
                  onDeleteError={() => setIsDeleting(false)}
                  onRename={handleRename}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="entry-blog-editor-head__more"
                    disabled={isBusy}
                    aria-label="更多操作"
                  >
                    <EllipsisVertical className="size-4" />
                  </Button>
                </FileOptions>
              )}
            </>
          )}
        </RepoPageHeader>
      );
    }

    // Multi-source file lists: same head chrome as friend-links / blog editor.
    if (isFixedFileList) {
      const listTitle = schema?.label || schema?.name || name;
      return (
        <RepoPageHeader
          title={listTitle}
          className="gap-1.5 sm:gap-2"
          mobileMainClick={() => router.push(cancelHref)}
        >
          {showHeaderActions && (
            <>
              <Button
                type="button"
                variant="ghost"
                className="entry-blog-editor-head__btn"
                asChild
              >
                <Link href={cancelHref}>返回</Link>
              </Button>
              <Button
                type="submit"
                form="entry-form"
                variant="ghost"
                className="entry-blog-editor-head__btn entry-blog-editor-head__btn--save"
                disabled={saveDisabled}
              >
                保存
              </Button>
              {path && sha ? (
                <FileOptions
                  path={path}
                  sha={sha}
                  type={path === ".pages.yml" ? "settings" : (schemaType ?? "content")}
                  name={name}
                  canDelete={canDelete}
                  canRename={canRename}
                  onBeforeDelete={handleBeforeDelete}
                  onDelete={handleDelete}
                  onDeleteError={() => setIsDeleting(false)}
                  onRename={handleRename}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="entry-blog-editor-head__more"
                    disabled={isBusy}
                    aria-label="更多操作"
                  >
                    <EllipsisVertical className="size-4" />
                  </Button>
                </FileOptions>
              ) : null}
            </>
          )}
        </RepoPageHeader>
      );
    }

    const hasBreadcrumbTrail = Boolean(
      schema &&
        (schemaType === "collection" ||
          (Array.isArray(schema.groupTrail) && schema.groupTrail.length > 0)),
    );

    if (!hasBreadcrumbTrail) {
      return (
        <RepoPageHeader
          title={displayTitle}
          mobileMainClick={() => router.push(cancelHref)}
        >
          {headerMeta}
          {showHeaderActions && (
            <>
              <div className="hidden sm:contents">{headerActionsNode}</div>
              {path && (
                <EntryHistoryDropdown
                  history={historyData}
                  loading={historyLoading}
                  onOpenChange={setHistoryOpen}
                  path={path}
                  triggerVariant="outline"
                  triggerSize="icon"
                />
              )}
              <Button
                type="submit"
                form="entry-form"
                size="icon"
                className="sm:h-9 sm:w-auto sm:px-4 sm:has-[>svg]:px-3"
                disabled={saveDisabled}
                aria-label="保存"
              >
                <Save className="size-4 sm:hidden" />
                <span className="hidden sm:inline">保存</span>
              </Button>
              {path && (
                <ButtonGroup>
                  {sha
                    ? (
                      <FileOptions
                        path={path}
                        sha={sha}
                        type={path === ".pages.yml" ? "settings" : (schemaType ?? "content")}
                        name={name}
                        canDelete={canDelete}
                        canRename={canRename}
                        onBeforeDelete={handleBeforeDelete}
                        onDelete={handleDelete}
                        onDeleteError={() => setIsDeleting(false)}
                        onRename={handleRename}
                      >
                        <Button variant="outline" size="icon" disabled={isBusy}>
                          <EllipsisVertical />
                        </Button>
                      </FileOptions>
                    )
                    : <Button variant="outline" size="icon" disabled><EllipsisVertical /></Button>
                  }
                </ButtonGroup>
              )}
            </>
          )}
        </RepoPageHeader>
      );
    }

    return (
    <RepoPageHeader
      className="gap-1.5 sm:gap-2"
      mainClassName="min-w-0 flex-1 overflow-hidden"
      mobileMainClick={() => router.push(cancelHref)}
      title={
        <Breadcrumb>
          <BreadcrumbList className="repo-page-header__breadcrumb min-w-0 flex-nowrap items-center gap-x-1 gap-y-0.5 overflow-hidden md:gap-1.5">
            {breadcrumbNode}
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      {headerMeta}
      {showHeaderActions && (
        <>
          <div className="hidden sm:contents">{headerActionsNode}</div>
          {path && (
            <EntryHistoryDropdown
              history={historyData}
              loading={historyLoading}
              onOpenChange={setHistoryOpen}
              path={path}
              triggerVariant="outline"
              triggerSize="icon"
            />
          )}
          <Button
            type="submit"
            form="entry-form"
            size="icon"
            className="sm:h-9 sm:w-auto sm:px-4 sm:has-[>svg]:px-3"
            disabled={saveDisabled}
            aria-label="保存"
          >
            <Save className="size-4 sm:hidden" />
            <span className="hidden sm:inline">保存</span>
          </Button>
          {path && (
            <ButtonGroup>
              {sha
                ? (
                  <FileOptions
                    path={path}
                    sha={sha}
                    type={path === ".pages.yml" ? "settings" : (schemaType ?? "content")}
                    name={name}
                    canDelete={canDelete}
                    canRename={canRename}
                    onBeforeDelete={handleBeforeDelete}
                    onDelete={handleDelete}
                    onDeleteError={() => setIsDeleting(false)}
                    onRename={handleRename}
                  >
                    <Button variant="outline" size="icon" disabled={isBusy}>
                      <EllipsisVertical />
                    </Button>
                  </FileOptions>
                )
                : <Button variant="outline" size="icon" disabled><EllipsisVertical /></Button>
              }
            </ButtonGroup>
          )}
        </>
      )}
    </RepoPageHeader>
    );
  }, [blogEditorHeading, breadcrumbNode, canDelete, canRename, cancelHref, displayTitle, handleBeforeDelete, handleDelete, handleRename, headerActionsNode, headerMeta, historyData, historyLoading, isBusy, isFixedFileList, name, path, router, saveDisabled, schema, schemaType, sha, showHeaderActions]);

  useRepoHeader({ header: headerNode });

  // 新建：属性默认展开；编辑已有条目（含关于页）：默认收起
  const propsDefaultOpen =
    name === "links" || schema?.template === "friend-links" ? false : !path;

  const loadingSkeleton = useMemo(() => (
    <div className={cn(
      "w-full mx-auto grid items-start gap-4 sm:gap-6",
      usesBlogLayout ? "max-w-screen-lg" : "max-w-screen-md",
    )}>
      {path !== ".pages.yml"
        ? 
          <>
            <div className="space-y-2">
              <Skeleton className="w-24 h-5 rounded" />
              <Skeleton className="w-full h-10 rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="w-24 h-5 rounded" />
              <Skeleton className="w-full h-10 rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="w-24 h-5 rounded" />
              <div className="grid grid-flow-col auto-cols-max gap-4">
                <Skeleton className="w-28 h-28 rounded-md" />
                <Skeleton className="w-28 h-28 rounded-md" />
                <Skeleton className="w-28 h-28 rounded-md" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="w-24 h-5 rounded" />
              <Skeleton className="w-full h-60 rounded-md" />
            </div>
          </>
        : <Skeleton className="w-full h-96 rounded-md" />
      }
    </div>
  ), [path, usesBlogLayout]);

  
  if (error) {
    // TODO: should we use a custom error class with code?
    // TODO: errors show no header (unlike collection and media). Consider standardizing templates.
    if (error === "Not found") {
      const isSettingsPage = path === ".pages.yml";
      return (
        <div className="absolute inset-0 p-4 md:p-6 flex items-center justify-center">
          <Empty className="max-w-[420px] flex-none">
            <EmptyHeader>
              <EmptyTitle>{isSettingsPage ? "找不到配置" : "找不到文件"}</EmptyTitle>
              <EmptyDescription>
                {isSettingsPage
                  ? "CMS 配置尚未初始化。"
                  : `文件「${path ?? schema?.path ?? "未知"}」还不存在。`}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {isSettingsPage ? (
                <EmptyCreate type="settings">初始化配置</EmptyCreate>
              ) : canCreate ? (
                <EmptyCreate type="content" name={schema?.name ?? name}>创建文件</EmptyCreate>
              ) : null}
            </EmptyContent>
          </Empty>
        </div>
      );
    } else {
      const needsLocalWorkspace = isMissingLocalWorkspaceError(error);
      return (
        <div className="absolute inset-0 p-4 md:p-6 flex items-center justify-center">
          <Empty className="max-w-[420px] flex-none">
            <EmptyHeader>
              <EmptyTitle>出了点问题</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {needsLocalWorkspace ? (
                <Button type="button" onClick={() => setWorkspaceOpen(true)}>
                  选择本地项目目录
                </Button>
              ) : (
                <Link
                  className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
                  href={`${repoHref(config.owner, config.repo, config.branch)}`}
                >
                  返回项目
                </Link>
              )}
            </EmptyContent>
          </Empty>
          {needsLocalWorkspace ? (
            <LocalWorkspaceDialog
              open={workspaceOpen}
              onOpenChange={setWorkspaceOpen}
            />
          ) : null}
        </div>
      );
    }
  }

  if (!path && schemaType === "collection" && !canCreate) {
    return (
      <div className="absolute inset-0 p-4 md:p-6 flex items-center justify-center">
        <Empty className="max-w-[420px] flex-none">
          <EmptyHeader>
            <EmptyTitle>条目创建已禁用</EmptyTitle>
            <EmptyDescription>
              此集合不允许新建条目。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
              href={`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}`}
            >返回集合</Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }
  
  return (
    isLoading
      ? loadingSkeleton
      : <EntryForm
        fields={entryFields}
        contentObject={entryContentObject}
        onSubmit={onSubmit}
        layout={usesBlogLayout ? "blog" : "default"}
        collectionName={name}
        entryPath={displayEntryPath}
        propsDefaultOpen={propsDefaultOpen}
        rawFrontmatterProps={schema?.template === "article"}
        frontmatterRaw={
          schema?.template === "article"
            ? path
              ? (entry?.frontmatterRaw ?? null)
              : (entryTemplateSeed?.frontmatterRaw ?? null)
            : null
        }
        friendLinksSourceRaw={
          schema?.template === "friend-links"
            ? (entry?.sourceRaw ?? null)
            : null
        }
        filePath={
          showFilenameField
            ? <InputGroup
                data-disabled={path && !slugEditable ? true : false}
                className="entry-blog-props__slug-input"
              >
                <InputGroupInput
                  value={slugInputValue}
                  onChange={(event) => handleSlugChange(event.target.value)}
                  placeholder={usesBlogLayout ? "文件名称叫什么呢" : "文件名（不含扩展名）"}
                  disabled={Boolean(path) && !slugEditable}
                  aria-label="Slug"
                />
                {path && filenameFieldMode === "enabled" && canRename && !usesBlogLayout && (
                  <InputGroupAddon align="inline-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InputGroupButton
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setIsFilenameUnlocked((prev) => !prev)}
                          aria-label={isFilenameUnlocked ? "锁定文件名" : "解锁文件名"}
                        >
                          {isFilenameUnlocked
                            ? <LockOpen className="size-3.5" />
                            : <Lock className="size-3.5" />}
                        </InputGroupButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isFilenameUnlocked ? "锁定文件名" : "解锁后可编辑"}
                      </TooltipContent>
                    </Tooltip>
                  </InputGroupAddon>
                )}
              </InputGroup>
            : undefined
        }
        onDirtyChange={setIsFormDirty}
        onChangeRegistered={() => {
          changeVersionRef.current += 1;
          setHasRegisteredChanges(true);
        }}
      />
  );
};
