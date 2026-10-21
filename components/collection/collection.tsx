"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import { useConfig } from "@/contexts/config-context";
import {
  getParentPath,
  getFileName,
  getRelativePath,
  joinPathSegments,
  normalizePath,
  sortFiles,
} from "@/lib/utils/file";
import { viewComponents } from "@/fields/registry-view";
import {
  getSchemaByName,
  getPrimaryField,
  getFieldByPath,
  safeAccess,
} from "@/lib/schema";
import { resolveCollectionEntryTitle } from "@/lib/collection-entry-title";
import { requireApiSuccess } from "@/lib/api-client";
import { apiRepoHref, encodeRepoPathParam, repoHref } from "@/lib/repo-href";
import { notifyCmsLocalSave } from "@/lib/cms-client-events";
import { useIsMobile } from "@/hooks/use-mobile";
import { EmptyCreate } from "@/components/empty-create";
import { FileOptions } from "@/components/file/file-options";
import { CollectionTable } from "./collection-table";
import { FolderOptions } from "./folder-options";
import { FolderCreate } from "@/components/folder-create";
import { LocalWorkspaceDialog } from "@/components/repo/local-workspace-dialog";
import { isMissingLocalWorkspaceError } from "@/lib/local-repo/missing-path";
import dynamic from "next/dynamic";
import {
  MomentsTabList,
  type MomentsTab,
} from "@/components/moments/moments-tabs";
import { useHugoSiteConfig } from "@/lib/site-settings/use-hugo-site-config";
import { getByPath } from "@/lib/site-settings/paths";
import { useGithubAccess } from "@/contexts/github-access-context";
import { resolveContentOperations } from "@/lib/operations";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { toDate } from "@/fields/core/date/parse";
import type { SortingFn } from "@tanstack/react-table";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import useSWR, { useSWRConfig } from "swr";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, FolderPlus, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const GalleryManager = dynamic(
  () =>
    import("@/components/gallery/gallery-manager").then((m) => m.GalleryManager),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 flex-col gap-3 p-1">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);

const MomentsApiManager = dynamic(
  () =>
    import("@/components/moments/moments-api-manager").then(
      (m) => m.MomentsApiManager,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 flex-col gap-3 p-1">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);

type GroupTrailItem = {
  name: string;
  label?: string | null;
};

const CollectionHeaderActions = memo(function CollectionHeaderActions({
  addEntryHref,
  addEntryLabel,
  collectionPath,
  name,
  showAddEntry,
  showFolderCreate,
  onFolderCreate,
}: {
  addEntryHref: string;
  addEntryLabel: string;
  collectionPath: string;
  name: string;
  showAddEntry: boolean;
  showFolderCreate: boolean;
  onFolderCreate: (entry: any) => void;
}) {
  return (
    <div className="flex w-auto shrink-0 items-center gap-1.5 sm:gap-x-2">
      {showFolderCreate && (
        <>
          <FolderCreate
            path={collectionPath}
            type="content"
            name={name}
            onCreate={onFolderCreate}
          >
            <Button
              type="button"
              variant="outline"
              className="hidden shrink-0 sm:inline-flex"
            >
              新建文件夹
            </Button>
          </FolderCreate>
          <FolderCreate
            path={collectionPath}
            type="content"
            name={name}
            onCreate={onFolderCreate}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 sm:hidden"
              aria-label="新建文件夹"
            >
              <FolderPlus className="size-4" />
            </Button>
          </FolderCreate>
        </>
      )}
      {showAddEntry && (
        <>
          <Link
            className={cn(buttonVariants(), "hidden shrink-0 sm:flex")}
            href={addEntryHref}
          >{addEntryLabel}</Link>
          <Link
            className={cn(buttonVariants({ size: "icon" }), "shrink-0 sm:hidden")}
            href={addEntryHref}
            aria-label={addEntryLabel}
          >
            <Plus className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
});

export function Collection({ name, path }: { name: string; path?: string }) {
  const [tableSearch, setTableSearch] = useState("");
  const [momentsTab, setMomentsTab] = useState<MomentsTab>("posts");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { cache, mutate } = useSWRConfig();
  const isMobile = useIsMobile();

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useAppRouter();

  const { config } = useConfig();
  if (!config) throw new Error(`Config not found.`);

  const schema = useMemo(
    () => getSchemaByName(config?.object, name),
    [config, name],
  );
  if (!schema) throw new Error(`Schema not found for "${name}".`);
  if (schema.type !== "collection")
    throw new Error(`"${name}" is not a collection.`);
  const operations = useMemo(() => resolveContentOperations({ schema }), [schema]);
  const canCreate = operations.create;
  const canRename = operations.rename;
  const canDelete = operations.delete;

  const { parsed: hugoSiteConfig, isLoading: hugoConfigLoading } =
    useHugoSiteConfig();
  const { status: githubAccessStatus } = useGithubAccess();
  const momentsSource = useMemo(() => {
    // While hugo.toml is still loading, leave source unknown.
    if (hugoConfigLoading) return null;
    if (!hugoSiteConfig) {
      // Only fall back to API when GitHub OAuth itself expired/failed so Memos
      // remains usable. Other access failures keep local collection UX.
      return githubAccessStatus === "auth" ? "api" : "local";
    }
    const raw = getByPath(hugoSiteConfig, "params.moments.source");
    return typeof raw === "string" ? raw.trim().toLowerCase() : "local";
  }, [githubAccessStatus, hugoConfigLoading, hugoSiteConfig]);
  const isMomentsApi = name === "moments" && momentsSource === "api";
  const momentsModePending = name === "moments" && momentsSource === null;

  const viewFields = useMemo(() => {
    let pathAndFieldArray: any[] = [];
    if (schema.fields) {
      if (schema.view?.fields && schema.view?.fields.length > 0) {
        // If we have a list of fields defined for the view
        schema.view.fields.forEach((path: string) => {
          const field = getFieldByPath(schema.fields, path);
          if (field && !["object", "block"].includes(field.type))
            pathAndFieldArray.push({ path: path, field: field });
        });
      } else {
        pathAndFieldArray = schema.fields
          .filter(
            (field: any) =>
              !["object", "block"].includes(field.type) && !field.hidden,
          )
          .map((field: any) => ({ path: field.name, field: field }));
      }
    } else {
      const isFixedFileList =
        schema.template === "source-files" ||
        (Array.isArray(schema.files) && schema.files.length > 0);
      // Fixed file lists always show alias (name) + path, even for older configs
      // that only stored view.fields: ["path"].
      const viewPaths = isFixedFileList
        ? ["name", "path"]
        : Array.isArray(schema.view?.fields) && schema.view.fields.length > 0
          ? schema.view.fields
          : ["name"];
      for (const path of viewPaths) {
        if (path === "name") {
          pathAndFieldArray.push({
            path: "name",
            field: {
              label: "名称",
              name: "name",
              type: "string",
            },
          });
          continue;
        }
        if (path === "path") {
          pathAndFieldArray.push({
            path: "path",
            field: {
              label: "路径",
              name: "path",
              type: "string",
            },
          });
        }
      }
      if (pathAndFieldArray.length === 0) {
        pathAndFieldArray.push({
          path: "name",
          field: {
            label: "名称",
            name: "name",
            type: "string",
          },
        });
      }
    }

    // If the filename starts with {year}-{month}-{day} and date is listed in the
    // view fields and is not an actual field, or if there are no fields, we add a date field
    if (
      !pathAndFieldArray.find((item: any) => item.path === "date") &&
      schema.filename.startsWith("{year}-{month}-{day}") &&
      ((schema.view?.fields && schema.view?.fields.includes("date")) ||
        !schema.view?.fields)
    ) {
      pathAndFieldArray.push({
        path: "date",
        field: {
          label: "日期",
          name: "date",
          type: "date",
        },
      });
    }

    return pathAndFieldArray;
  }, [schema]);

  const primaryField = useMemo(() => {
    const isFixedFileList =
      schema?.template === "source-files" ||
      (Array.isArray(schema?.files) && schema.files.length > 0);
    if (isFixedFileList) return "name";
    return getPrimaryField(schema) ?? "name";
  }, [schema]);
  const requestedFieldPaths = useMemo(() => {
    const paths = new Set<string>(["name", "path", primaryField]);
    viewFields.forEach((item: any) => paths.add(item.path));
    return Array.from(paths);
  }, [primaryField, viewFields]);

  const buildCollectionApiUrl = useCallback(
    (fetchPath: string): string => {
      const params = new URLSearchParams({
        path: fetchPath,
        fields: requestedFieldPaths.join(","),
      });
      return `${apiRepoHref(config.owner, config.repo, config.branch)}/collections/${encodeURIComponent(name)}?${params.toString()}`;
    },
    [config.branch, config.owner, config.repo, name, requestedFieldPaths],
  );

  const fetchCollectionByUrl = useCallback(
    async (apiUrl: string): Promise<Record<string, any>[]> => {
      const response = await fetch(apiUrl);
      const result = await requireApiSuccess<any>(response, "加载失败");

      if (result.data.errors?.length) {
        result.data.errors.forEach((e: any) => toast.error(e));
      }

      const useFlatFileList = name === "excalidraw" || schema.view?.flatNodes;
      const isFixedFileList =
        schema.template === "source-files" ||
        (Array.isArray(schema.files) && schema.files.length > 0);
      const unsortedData = (result.data.contents || []).filter(
        (item: any) => !useFlatFileList || item.type === "file",
      );
      if (unsortedData.length === 0) return [];
      // Keep CMS files[] authoring order for multi-source lists.
      if (isFixedFileList) return unsortedData;
      if (useFlatFileList) {
        const sortField = schema.view?.default?.sort || "date";
        const desc = schema.view?.default?.order !== "asc";
        return unsortedData.sort((a: any, b: any) => {
          const av = safeAccess(a.fields, sortField) ?? a[sortField] ?? "";
          const bv = safeAccess(b.fields, sortField) ?? b[sortField] ?? "";
          if (sortField === "date") {
            const da = toDate(av)?.getTime() ?? 0;
            const db = toDate(bv)?.getTime() ?? 0;
            return desc ? db - da : da - db;
          }
          const cmp = String(av).localeCompare(String(bv), "zh-CN", {
            numeric: true,
            sensitivity: "base",
          });
          return desc ? -cmp : cmp;
        });
      }
      return unsortedData.sort((a: any, b: any) => {
        if (a.type === "dir" && b.type === "file")
          return schema.view?.foldersFirst ? -1 : 1;
        if (a.type === "file" && b.type === "dir")
          return schema.view?.foldersFirst ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    },
    [
      name,
      schema.files,
      schema.template,
      schema.view?.default?.order,
      schema.view?.default?.sort,
      schema.view?.flatNodes,
      schema.view?.foldersFirst,
    ],
  );

  const collectionPath =
    name === "gallery" || name === "excalidraw"
      ? schema.path
      : schema.view?.layout === "tree"
        ? schema.path
        : path || schema.path;
  const rootCollectionKey = useMemo(
    () => buildCollectionApiUrl(collectionPath),
    [buildCollectionApiUrl, collectionPath],
  );

  const { data: swrCollectionData, error: swrCollectionError } = useSWR<
    Record<string, any>[]
  >(
    isMomentsApi || momentsModePending ? null : rootCollectionKey,
    fetchCollectionByUrl,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    },
  );

  useEffect(() => {
    setData([]);
    setError(null);
  }, [rootCollectionKey]);

  useEffect(() => {
    if (!swrCollectionData) return;
    const rows =
      name === "excalidraw"
        ? swrCollectionData.filter((item: any) => item.type === "file")
        : swrCollectionData;
    setData(rows);
    setError(null);
  }, [swrCollectionData, name]);

  useEffect(() => {
    if (name !== "excalidraw" || !path) return;
    if (normalizePath(path) === normalizePath(schema.path)) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("path", schema.path);
    router.replace(`${pathname}?${params.toString()}`);
  }, [name, path, pathname, router, schema.path, searchParams]);

  useEffect(() => {
    if (!swrCollectionError) return;
    setError(
      swrCollectionError instanceof Error
        ? swrCollectionError.message
        : "加载失败",
    );
  }, [swrCollectionError]);

  const fetchCollectionData = useCallback(
    async (fetchPath: string): Promise<Record<string, any>[] | undefined> => {
      const apiUrl = buildCollectionApiUrl(fetchPath);
      const cachedValue = cache.get(apiUrl) as
        | { data?: Record<string, any>[] }
        | undefined;
      if (cachedValue?.data) return cachedValue.data;

      try {
        const rows = await fetchCollectionByUrl(apiUrl);
        await mutate(apiUrl, rows, { revalidate: false });
        return rows;
      } catch (err: any) {
        console.error(`Fetch failed for path ${fetchPath}:`, err);
        if (fetchPath === (path || schema.path)) {
          setError(err.message);
        } else {
          toast.error(
            `无法加载「${getFileName(fetchPath)}」内的项目：${err.message}`,
          );
        }
        return undefined;
      }
    },
    [
      buildCollectionApiUrl,
      cache,
      fetchCollectionByUrl,
      mutate,
      path,
      schema.path,
    ],
  );

  const handleDelete = useCallback((path: string) => {
    setData((prevData) => prevData?.filter((item: any) => item.path !== path));
  }, []);

  const handleFolderDeleted = useCallback(
    (folderPath: string) => {
      const normalizedFolder = normalizePath(folderPath);
      handleDelete(normalizedFolder);

      const current = normalizePath(path || schema.path);
      if (
        current === normalizedFolder ||
        current.startsWith(`${normalizedFolder}/`)
      ) {
        const parent = getParentPath(normalizedFolder) || schema.path;
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.set("path", parent);
        router.push(`${pathname}?${params.toString()}`);
        return;
      }

      void mutate(rootCollectionKey);
    },
    [
      handleDelete,
      mutate,
      path,
      pathname,
      rootCollectionKey,
      router,
      schema.path,
      searchParams,
    ],
  );

  const handleRename = useCallback((path: string, newPath: string) => {
    setData((prevData: any) => {
      if (!prevData) return prevData;

      const updateNestedData = (items: any[]): any[] => {
        return items.map((item: any) => {
          // If this is the item being renamed
          if (item.path === path) {
            return { ...item, path: newPath, name: getFileName(newPath) };
          }

          // If this item has subRows, recursively update them
          if (item.subRows && Array.isArray(item.subRows)) {
            const updatedSubRows = updateNestedData(item.subRows);
            // Only create a new item reference if subRows changed
            if (updatedSubRows !== item.subRows) {
              return { ...item, subRows: updatedSubRows };
            }
          }

          // Return the original item if no changes
          return item;
        });
      };

      // Check if the item is moving to a different folder
      if (
        getParentPath(normalizePath(path)) !==
        getParentPath(normalizePath(newPath))
      ) {
        // For items moved to a different folder, we need to:
        // 1. Remove the item from its original location (recursively)
        const removeItem = (items: any[]): any[] => {
          return items
            .filter((item) => item.path !== path)
            .map((item) => {
              if (item.subRows && Array.isArray(item.subRows)) {
                const updatedSubRows = removeItem(item.subRows);
                if (updatedSubRows !== item.subRows) {
                  return { ...item, subRows: updatedSubRows };
                }
              }
              return item;
            });
        };

        return sortFiles(removeItem(prevData));
      }

      // For items renamed within the same folder, update the item
      return sortFiles(updateNestedData(prevData));
    });
  }, []);

  const handleFolderCreate = useCallback(
    (entry: any) => {
      // FolderCreate writes `<folder>/.gitkeep`; parent path is the new folder.
      const folderPath = normalizePath(getParentPath(entry.path));
      const folder = {
        type: "dir",
        name: getFileName(folderPath),
        path: folderPath,
        size: 0,
        url: null,
      };

      setData((prevData) => {
        if (!prevData) return [folder];
        if (prevData.some((item: any) => item.path === folderPath)) {
          return prevData;
        }
        return sortFiles([...prevData, folder]);
      });

      // Match cfBlog: after creating a folder, enter it.
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("path", folderPath);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const handleConfirmRenameNode = useCallback(
    (path: string, newPath: string) => {
      try {
        const normalizedPath = normalizePath(path);
        const normalizedNewPath = normalizePath(newPath);

        const renamePromise = new Promise(async (resolve, reject) => {
          try {
            const response = await fetch(
              `${apiRepoHref(config.owner, config.repo, config.branch)}/files/${encodeURIComponent(normalizedPath)}/rename`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "content",
                  name,
                  newPath: normalizedNewPath,
                }),
              },
            );
            const data = await requireApiSuccess<any>(
              response,
              "重命名文件失败",
            );

            resolve(data);
          } catch (error) {
            reject(error);
          }
        });

        toast.promise(renamePromise, {
          loading: `正在将「${path}」重命名为「${newPath}」`,
          success: (data: any) => {
            notifyCmsLocalSave();
            router.push(
              `${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(getParentPath(normalizedNewPath))}`,
            );
            return data.message;
          },
          error: (error: any) => error.message,
        });
      } catch (error) {
        console.error(error);
      }
    },
    [config.owner, config.repo, config.branch, name, router],
  );

  const columns = useMemo(() => {
    const foldersFirst = Boolean(schema.view?.foldersFirst);

    const compareEntryType = (a: any, b: any) => {
      if (a?.type === b?.type) return 0;
      if (foldersFirst) return a?.type === "dir" ? -1 : 1;
      return a?.type === "dir" ? 1 : -1;
    };

    const toSortText = (value: unknown) => {
      if (value == null) return "";
      if (Array.isArray(value)) {
        return value
          .map((item) => (item == null ? "" : String(item).trim()))
          .filter(Boolean)
          .join(", ");
      }
      return String(value).trim();
    };

    const makeSortingFn = (fieldType: string): SortingFn<any> => {
      return (rowA, rowB, columnId) => {
        const typeCmp = compareEntryType(rowA.original, rowB.original);
        if (typeCmp !== 0) return typeCmp;

        const a = rowA.getValue(columnId);
        const b = rowB.getValue(columnId);

        if (fieldType === "date") {
          const da = toDate(a)?.getTime() ?? 0;
          const db = toDate(b)?.getTime() ?? 0;
          return da === db ? 0 : da > db ? 1 : -1;
        }

        return toSortText(a).localeCompare(toSortText(b), "zh-CN", {
          numeric: true,
          sensitivity: "base",
        });
      };
    };

    let tableColumns: any;
    tableColumns =
      viewFields
        .map((pathAndField: any) => {
          const path = pathAndField.path;
          const field = pathAndField.field;
          if (!field) return null;

          return {
            id: path,
            accessorKey: path,
            accessorFn: (originalRow: any) => {
              const value: unknown = safeAccess(originalRow.fields, path);
              if (
                (value == null || value === "") &&
                path === "path" &&
                originalRow?.path
              ) {
                return originalRow.path;
              }
              // Dirs / missing title: fall back so sorting still works.
              if (
                (value == null || value === "") &&
                path === primaryField &&
                originalRow?.path
              ) {
                return resolveCollectionEntryTitle(
                  originalRow,
                  primaryField,
                  schema.format,
                );
              }
              return value;
            },
            header: field?.label ?? field.name,
            sortingFn: makeSortingFn(field.type),
            sortDescFirst: field.type === "date",
            meta: {
              className:
                path === primaryField
                  ? "min-w-0 w-full max-w-none"
                  : path === "date"
                    ? "w-[6.75rem] shrink-0 whitespace-nowrap text-center sm:w-[8.5rem]"
                    : path === "path"
                      ? "hidden w-[14rem] shrink-0 text-center md:table-cell lg:w-[18rem]"
                      : "hidden md:table-cell",
            },
            cell: ({ cell, row }: { cell: any; row: any }) => {
              const cellValue = cell.getValue();
              const FieldComponent = viewComponents?.[field.type];
              // Prefer raw field value for display (not the name fallback used for sorting).
              const displayValue =
                path === primaryField
                  ? (safeAccess(row.original.fields, path) ?? cellValue)
                  : cellValue;
              const CellView = FieldComponent ? (
                <FieldComponent value={displayValue} field={field} />
              ) : Array.isArray(displayValue) ? (
                displayValue.join(", ")
              ) : (
                displayValue
              );
              if (path === primaryField) {
                const resolvedTitle = resolveCollectionEntryTitle(
                  row.original,
                  primaryField,
                  schema.format,
                );
                const rawTitle = safeAccess(row.original.fields, path);
                const hasFieldTitle =
                  rawTitle != null && String(rawTitle).trim() !== "";
                const label = hasFieldTitle ? CellView : resolvedTitle;
                return (
                  <Link
                    className="block min-w-0 max-w-full truncate font-medium"
                    href={`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeRepoPathParam(row.original.path)}`}
                  >
                    {label}
                  </Link>
                );
              }
              if (path === "date") {
                return (
                  <div className="truncate text-center text-muted-foreground tabular-nums">
                    {CellView}
                  </div>
                );
              }
              if (path === "path") {
                return (
                  <div className="mx-auto w-full max-w-[12rem] truncate text-center">
                    {CellView}
                  </div>
                );
              }
              return (
                <div className="w-full max-w-[12rem] truncate">{CellView}</div>
              );
            },
          };
        })
        .filter(Boolean) || [];

    // Fixed multi-source file lists: open by row click only — no ⋯ menu.
    const isFixedFileList =
      schema.template === "source-files" ||
      (Array.isArray(schema.files) && schema.files.length > 0);
    if (!isFixedFileList) {
    tableColumns.push({
      accessorKey: "actions",
      header: () => <span className="sr-only">操作</span>,
      meta: {
        className: "w-10",
      },
      cell: ({ row }: { row: any }) => (
        <div className="flex justify-end">
          {row.original.type === "dir" && canDelete && (
            <FolderOptions
              path={row.original.path}
              name={row.original.name}
              collectionName={name}
              canDelete={canDelete}
              listChildren={async (folderPath) => {
                const rows = await fetchCollectionData(folderPath);
                return (rows || []).map((item: any) => ({
                  type: item.type,
                  path: item.path,
                  sha: item.sha,
                  name: item.name,
                }));
              }}
              onDeleted={handleFolderDeleted}
            >
              <Button variant="ghost" size="icon-sm" aria-label="更多操作">
                <EllipsisVertical />
              </Button>
            </FolderOptions>
          )}
          {row.original.type === "file" && (
            <FileOptions
              path={row.original.path}
              sha={row.original.sha}
              type="collection"
              name={name}
              canDelete={canDelete}
              canRename={canRename}
              editHref={`${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeRepoPathParam(row.original.path)}`}
              onDelete={handleDelete}
              onRename={handleRename}
            >
              <Button variant="ghost" size="icon-sm" aria-label="更多操作">
                <EllipsisVertical />
              </Button>
            </FileOptions>
          )}
          {canCreate &&
            schema.view?.layout === "tree" &&
            (row.original.type === "file" &&
            !row.original.isNode &&
            !(
              row.depth === 0 &&
              row.original.name === schema.view?.node?.filename
            ) ? (
              canRename ? (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="w-8 h-8"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>添加子条目</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>先重命名此文件？</AlertDialogTitle>
                    <AlertDialogDescription>
                      在为此文件添加子条目之前，需要先将其从「{row.original.path}」
                      重命名为「
                      {row.original.path.replace(
                        `.${schema.extension}`,
                        `/${schema.view?.node?.filename}`,
                      )}
                      」。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        handleConfirmRenameNode(
                          row.original.path,
                          row.original.path.replace(
                            `.${schema.extension}`,
                            `/${schema.view?.node?.filename}`,
                          ),
                        )
                      }
                    >重命名</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              ) : null
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon-sm" }),
                      "w-8 h-8",
                    )}
                    href={
                      row.original.isNode
                        ? `${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(row.original.parentPath)}`
                        : row.original.type === "dir"
                          ? `${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(row.original.path)}`
                          : `${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(row.original.path)}`
                    }
                  >
                    <Plus className="size-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>添加子条目</TooltipContent>
              </Tooltip>
            ))}
        </div>
      ),
      enableSorting: false,
    });
    }

    return tableColumns;
  }, [
    config.owner,
    config.repo,
    config.branch,
    name,
    schema.template,
    schema.files,
    viewFields,
    primaryField,
    handleDelete,
    handleFolderDeleted,
    handleRename,
    fetchCollectionData,
    schema.view?.foldersFirst,
    schema.view?.layout,
    schema.view?.node?.filename,
    schema.extension,
    schema.format,
    handleConfirmRenameNode,
    canCreate,
    canDelete,
    canRename,
  ]);

  // Mobile: only primary + actions. Hiding columns with `display:none` breaks
  // table-layout / colSpan and clips folder names on small screens.
  const visibleColumns = useMemo(() => {
    if (!isMobile) return columns;
    return columns.filter((column: any) => {
      const key = column.id ?? column.accessorKey;
      return (
        key === primaryField ||
        key === "actions" ||
        key === "name" ||
        key === "date"
      );
    });
  }, [columns, isMobile, primaryField]);

  const initialState = useMemo(() => {
    const isFixedFileList =
      schema.template === "source-files" ||
      (Array.isArray(schema.files) && schema.files.length > 0);
    const sortId = isFixedFileList
      ? null
      : viewFields == null
        ? "name"
        : schema.view?.default?.sort ||
          (viewFields.find((item: any) => item.field.name === "date") &&
            "date") ||
          primaryField;

    const configuredPageSize =
      typeof schema.view?.pageSize === "number" && schema.view.pageSize > 0
        ? schema.view.pageSize
        : null;

    return {
      sorting: sortId
        ? [
            {
              id: sortId,
              desc:
                sortId === "date"
                  ? true
                  : schema.view?.default?.order === "desc"
                    ? true
                    : false,
            },
          ]
        : [],
      pagination: {
        pageSize: configuredPageSize ?? (isMobile ? 50 : 25),
      },
    };
  }, [schema, primaryField, viewFields, isMobile]);

  const handleNavigate = useCallback(
    (newPath: string) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("path", newPath || schema.path);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, schema.path, searchParams],
  );

  const handleExpand = useCallback(
    async (row: any) => {
      if (!row) return;
      const subRows = await fetchCollectionData(
        row.isNode ? row.parentPath : row.path,
      );
      if (subRows !== undefined) {
        setData((currentData: any[]) => {
          const updateNestedData = (items: any[]): any[] => {
            return items.map((item: any) => {
              if (item.path === row.path) return { ...item, subRows };
              if (item.subRows && Array.isArray(item.subRows)) {
                const updatedSubRows = updateNestedData(item.subRows);
                if (updatedSubRows !== item.subRows) {
                  return { ...item, subRows: updatedSubRows };
                }
              }
              return item;
            });
          };

          return updateNestedData(currentData);
        });
      }
    },
    [fetchCollectionData],
  );

  const loadingSkeleton = useMemo(
    () => (
      <table className="w-full">
        <thead>
          <tr className="border-b font-medium">
            <th className="p-2 h-10 align-middle">
              <Skeleton className="w-8 h-4 rounded" />
            </th>
            <th className="p-2 h-10 align-middle">
              <Skeleton className="w-16 h-4 rounded" />
            </th>
            <th className="p-2 h-10 align-middle">
              <Skeleton className="w-12 h-4 rounded" />
            </th>
            <th className="p-2 h-10 align-middle">
              <Skeleton className="w-12 h-4 rounded" />
            </th>
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, index) => (
            <tr className="border-b" key={index}>
              <td className="p-2 py-0 h-12 align-middle">
                <Skeleton className="h-8 w-8 rounded-md" />
              </td>
              <td className="p-2 py-0 h-12 align-middle w-full min-w-[12rem] max-w-px">
                <Skeleton className="w-full h-5 rounded" />
              </td>
              <td className="p-2 py-0 h-12 align-middle">
                <Skeleton className="w-24 h-5 rounded" />
              </td>
              <td className="p-2 py-0 h-12 align-middle w-10">
                <div className="flex justify-end">
                  <Button variant="ghost" size="icon-sm" disabled>
                    <EllipsisVertical className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    [schema.view?.layout],
  );

  const isGallery = name === "gallery";
  const isExcalidraw = name === "excalidraw";
  const hideCollectionChrome = isGallery || isMomentsApi || momentsModePending;

  const addEntryHref = `${repoHref(config.owner, config.repo, config.branch)}/collection/${encodeURIComponent(name)}/new${
    !isExcalidraw &&
    schema.view?.layout !== "tree" &&
    path &&
    path !== schema.path
      ? `?parent=${encodeURIComponent(path)}`
      : ""
  }`;
  const addEntryLabel =
    name === "posts"
      ? "新建文章"
      : name === "excalidraw"
        ? "新建画板"
      : name === "moments"
        ? "新建动态"
        : isGallery
          ? "新增相册"
          : "添加条目";

  const breadcrumbNode = useMemo(() => {
    if (isExcalidraw) {
      const groupTrail: GroupTrailItem[] = Array.isArray(schema.groupTrail)
        ? schema.groupTrail
        : [];
      return (
        <Breadcrumb>
          <BreadcrumbList className="repo-page-header__breadcrumb min-w-0 flex-nowrap items-center gap-x-1 gap-y-0.5 overflow-hidden md:gap-1.5">
            {groupTrail.map((group) => (
              <Fragment key={`group-${group.name}`}>
                <BreadcrumbItem className="hidden shrink-0 md:inline-flex">
                  <span className="whitespace-nowrap">{group.label || group.name}</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
              </Fragment>
            ))}
            <BreadcrumbItem className="min-w-0 shrink">
              <BreadcrumbPage className="repo-page-header__crumb repo-page-header__crumb--current">
                {schema.label || schema.name}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      );
    }

    const groupTrail: GroupTrailItem[] = Array.isArray(schema.groupTrail)
      ? schema.groupTrail
      : [];
    const normalizedRootPath = normalizePath(schema.path);
    const normalizedCurrentPath = normalizePath(collectionPath);
    const relativePath = getRelativePath(
      normalizedCurrentPath,
      normalizedRootPath,
    );
    const segments = relativePath
      ? relativePath.split("/").filter(Boolean)
      : [];

    const entries = segments.map((segment, index) => ({
      name: segment,
      path: joinPathSegments([
        normalizedRootPath,
        segments.slice(0, index + 1).join("/"),
      ]),
    }));

    const middleEntries = entries.length > 3 ? entries.slice(1, -1) : [];
    const visibleEntries =
      entries.length > 3 ? [entries[0], entries[entries.length - 1]] : entries;

    return (
      <Breadcrumb>
        <BreadcrumbList className="repo-page-header__breadcrumb min-w-0 flex-nowrap items-center gap-x-1 gap-y-0.5 overflow-hidden md:gap-1.5">
          {groupTrail.map((group) => (
            <Fragment key={`group-${group.name}`}>
              <BreadcrumbItem className="hidden shrink-0 md:inline-flex">
                <span className="whitespace-nowrap">{group.label || group.name}</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
            </Fragment>
          ))}
          <BreadcrumbItem className="min-w-0 shrink">
            {entries.length > 0 ? (
              <BreadcrumbLink
                className="repo-page-header__crumb"
                onClick={() => handleNavigate(schema.path)}
              >
                {schema.label || schema.name}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="repo-page-header__crumb repo-page-header__crumb--current">
                {schema.label || schema.name}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {entries.length > 0 && <BreadcrumbSeparator className="shrink-0" />}

          {entries.length > 3 && (
            <>
              <BreadcrumbItem className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center">
                    <BreadcrumbEllipsis className="size-4" />
                    <span className="sr-only">显示隐藏路径段</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {middleEntries.map((entry) => (
                      <DropdownMenuItem
                        key={entry.path}
                        onClick={() => handleNavigate(entry.path)}
                        className="cursor-pointer"
                      >
                        {entry.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="shrink-0" />
            </>
          )}

          {visibleEntries.map((entry, index) => {
            const isLast = index === visibleEntries.length - 1;
            return (
              <Fragment key={entry.path}>
                <BreadcrumbItem className="min-w-0 shrink">
                  {isLast ? (
                    <BreadcrumbPage className="repo-page-header__crumb repo-page-header__crumb--current">
                      {entry.name}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="repo-page-header__crumb"
                      onClick={() => handleNavigate(entry.path)}
                    >
                      {entry.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator className="shrink-0" />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }, [
    collectionPath,
    handleNavigate,
    isExcalidraw,
    schema.groupTrail,
    schema.label,
    schema.name,
    schema.path,
  ]);

  const isCollectionRoot =
    normalizePath(collectionPath) === normalizePath(schema.path);
  const goToCollectionHome = useCallback(() => {
    if (!isCollectionRoot) {
      handleNavigate(schema.path);
    }
  }, [handleNavigate, isCollectionRoot, schema.path]);

  const headerNode = useMemo(
    () => (
      <RepoPageHeader
        className="gap-1.5 sm:gap-2"
        mainClassName="min-w-0 flex-1 overflow-hidden"
        mobileMainClick={isCollectionRoot ? undefined : goToCollectionHome}
        title={
          isMomentsApi ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              {breadcrumbNode}
              <MomentsTabList value={momentsTab} onChange={setMomentsTab} />
            </div>
          ) : (
            breadcrumbNode
          )
        }
      >
        {isMomentsApi ? null : (
          <CollectionHeaderActions
            addEntryHref={addEntryHref}
            addEntryLabel={addEntryLabel}
            collectionPath={collectionPath}
            name={name}
            showAddEntry={canCreate && !hideCollectionChrome}
            showFolderCreate={
              schema.subfolders !== false &&
              canCreate &&
              !hideCollectionChrome &&
              !isExcalidraw
            }
            onFolderCreate={handleFolderCreate}
          />
        )}
      </RepoPageHeader>
    ),
    [
      addEntryHref,
      addEntryLabel,
      breadcrumbNode,
      collectionPath,
      goToCollectionHome,
      handleFolderCreate,
      canCreate,
      isCollectionRoot,
      isExcalidraw,
      isMomentsApi,
      hideCollectionChrome,
      momentsTab,
      name,
      schema.path,
      schema.subfolders,
    ],
  );

  useRepoHeader({
    header: headerNode,
  });

  const isLoading =
    momentsModePending ||
    (!isMomentsApi &&
      !swrCollectionData &&
      !swrCollectionError &&
      data.length === 0);

  const isFixedFileListTable =
    schema.template === "source-files" ||
    (Array.isArray(schema.files) && schema.files.length > 0);

  const collectionTableNode = (
    <CollectionTable
      columns={visibleColumns}
      data={data}
      search={tableSearch}
      setSearch={setTableSearch}
      initialState={initialState}
      onExpand={handleExpand}
      pathname={pathname}
      path={collectionPath}
      isTree={schema.view?.layout === "tree"}
      flatList={Boolean(isExcalidraw || schema.view?.flatNodes)}
      primaryField={primaryField}
      disableSorting={isFixedFileListTable}
    />
  );

  const contentNode = momentsModePending ? (
    loadingSkeleton
  ) : isMomentsApi ? (
    <MomentsApiManager
      canCreate={canCreate}
      canDelete={canDelete}
      activeTab={momentsTab}
      onTabChange={setMomentsTab}
    />
  ) : isLoading ? (
    loadingSkeleton
  ) : error ? (
    <div className="flex flex-1 items-center justify-center">
      <Empty className="max-w-[420px] flex-none">
        <EmptyHeader>
          <EmptyTitle>
            {error === "Not found"
              ? "找不到文件夹"
              : "出了点问题"}
          </EmptyTitle>
          <EmptyDescription>
            {error === "Not found"
              ? `集合文件夹「${schema.path}」尚不存在。`
              : error}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {error === "Not found" ? (
            canCreate ? (
              <EmptyCreate type="content" name={schema.name}>创建文件夹</EmptyCreate>
            ) : null
          ) : isMissingLocalWorkspaceError(error) ? (
            <Button type="button" onClick={() => setWorkspaceOpen(true)}>
              选择本地项目目录
            </Button>
          ) : (
            <Link
              className={buttonVariants({ variant: "default" })}
              href={`${repoHref(config.owner, config.repo, config.branch)}`}
            >
              返回项目
            </Link>
          )}
        </EmptyContent>
      </Empty>
      {isMissingLocalWorkspaceError(error) ? (
        <LocalWorkspaceDialog
          open={workspaceOpen}
          onOpenChange={setWorkspaceOpen}
        />
      ) : null}
    </div>
  ) : isGallery ? (
    <GalleryManager
      name={name}
      schema={schema}
      canCreate={canCreate}
      canDelete={canDelete}
    />
  ) : name === "moments" ? (
    <div className="min-w-0 space-y-4">
      <div className="text-muted-foreground text-xs sm:text-sm">
        <span className="line-clamp-1">来源：本地</span>
      </div>
      {collectionTableNode}
    </div>
  ) : (
    collectionTableNode
  );

  return <div className="min-w-0 flex flex-col space-y-6">{contentNode}</div>;
}
