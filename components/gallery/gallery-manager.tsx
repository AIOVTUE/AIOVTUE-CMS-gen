"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import {
  ArrowLeft,
  EllipsisVertical,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useConfig } from "@/contexts/config-context";
import { requireApiSuccess } from "@/lib/api-client";
import { notifyCmsLocalSave } from "@/lib/cms-client-events";
import {
  getFileName,
  joinPathSegments,
  normalizePath,
} from "@/lib/utils/file";
import { Thumbnail } from "@/components/thumbnail";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EditComponent as DateEditComponent } from "@/fields/core/date/edit-component";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import "./gallery-manager.css";

export type GalleryPhoto = {
  url?: string;
  date?: string;
  poster?: string;
};

type AlbumListItem = {
  slug: string;
  folderPath: string;
  indexPath: string;
  sha?: string;
  title: string;
  desc?: string;
  cover?: string;
  date?: string;
  photos: GalleryPhoto[];
};

type AlbumEntry = {
  path: string;
  sha: string;
  contentObject: Record<string, unknown>;
};

type GalleryIndexState = {
  path: string;
  sha: string;
  contentObject: Record<string, unknown>;
};

type GalleryManagerProps = {
  name: string;
  schema: Record<string, any>;
  canCreate: boolean;
  canDelete: boolean;
};

const NODE_FILENAME = "index.md";
const INDEX_FILENAME = "_index.md";
const INDEX_SCHEMA_NAME = "gallery-index";

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const isVideoUrl = (value: string) => {
  const clean = value.trim().split(/[?#]/)[0]?.toLowerCase() || "";
  return (
    clean.endsWith(".mp4") ||
    clean.endsWith(".webm") ||
    clean.endsWith(".mov") ||
    clean.endsWith(".m4v")
  );
};

const toDateInputValue = (value: unknown) => {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const monthKeyFromDate = (value: unknown) => {
  const date = toDateInputValue(value);
  return date ? date.slice(0, 7) : "unknown";
};

const formatMonthLabel = (monthKey: string) => {
  if (monthKey === "unknown") return "未标注日期";
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  return `${match[1]} 年 ${Number(match[2])} 月`;
};

const todayDateInput = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const coerceBoolean = (value: unknown) => {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return Boolean(value);
};

const stackUrlsForAlbum = (album: AlbumListItem) => {
  const urls: string[] = [];
  if (album.cover) urls.push(album.cover);
  for (const photo of album.photos) {
    const url = photo?.url;
    if (!url || url === album.cover) continue;
    urls.push(url);
    if (urls.length >= 3) break;
  }
  return urls.slice(0, 3);
};

const normalizeAlbumSlugs = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const item of value) {
    const slug = String(item ?? "")
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
};

const orderAlbumsByIndex = (
  albums: AlbumListItem[],
  orderedSlugs: string[],
): AlbumListItem[] => {
  if (orderedSlugs.length === 0) return albums;
  const bySlug = new Map(albums.map((album) => [album.slug, album]));
  const ordered: AlbumListItem[] = [];
  const seen = new Set<string>();
  for (const slug of orderedSlugs) {
    const album = bySlug.get(slug);
    if (!album || seen.has(slug)) continue;
    ordered.push(album);
    seen.add(slug);
  }
  for (const album of albums) {
    if (seen.has(album.slug)) continue;
    ordered.push(album);
  }
  return ordered;
};

type SortableAlbumCardProps = {
  album: AlbumListItem;
  mediaName: string;
  canDelete: boolean;
  onOpen: (folderPath: string) => void;
  onEdit: (folderPath: string) => void;
  onDelete: (album: AlbumListItem) => void;
};

function SortableAlbumCard({
  album,
  mediaName,
  canDelete,
  onOpen,
  onEdit,
  onDelete,
}: SortableAlbumCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: album.slug });
  const stack = stackUrlsForAlbum(album);

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "cms-album-grid__item",
        isDragging && "cms-album-grid__item--dragging",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : undefined,
      }}
    >
      <div className="cms-album-grid__card">
        <button
          type="button"
          className="cms-album-grid__drag"
          aria-label={`拖动排序：${album.title}`}
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          className="cms-album-grid__hit"
          onClick={() => onOpen(album.folderPath)}
          aria-label={album.title}
        >
          <div className="cms-album-grid__stack" aria-hidden>
            {stack.length === 0 ? (
              <div className="cms-album-grid__cover cms-album-grid__cover--stack cms-album-grid__cover--stack-1 cms-album-grid__cover--placeholder">
                <span>📷</span>
              </div>
            ) : (
              stack.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className={`cms-album-grid__cover cms-album-grid__cover--stack cms-album-grid__cover--stack-${index + 1}`}
                >
                  {isHttpUrl(url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" />
                  ) : (
                    <Thumbnail
                      name={mediaName}
                      path={url}
                      className="size-full rounded-[14px]"
                    />
                  )}
                </div>
              ))
            )}
          </div>
          <div className="cms-album-grid__caption">
            <h2 className="cms-album-grid__title">{album.title}</h2>
            {album.desc ? (
              <p className="cms-album-grid__desc">{album.desc}</p>
            ) : null}
          </div>
        </button>

        <div className="cms-album-grid__menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="cms-album-grid__menu-btn size-8 rounded-full"
                aria-label="相册操作"
                onClick={(event) => event.stopPropagation()}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  onEdit(album.folderPath);
                }}
              >
                <Pencil className="size-4" />
                编辑相册
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(event) => {
                      event.preventDefault();
                      setTimeout(() => onDelete(album), 0);
                    }}
                  >
                    <Trash2 className="size-4" />
                    删除相册
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

const GalleryManager = ({
  name,
  schema,
  canCreate,
  canDelete,
}: GalleryManagerProps) => {
  const { config } = useConfig();
  if (!config) throw new Error("Config not found.");

  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rootPath = normalizePath(schema.path || "content/gallery");
  const currentPath = normalizePath(searchParams.get("path") || rootPath);
  const isAlbumView =
    currentPath !== rootPath && currentPath.startsWith(`${rootPath}/`);

  const mediaName = config.object.media?.[0]?.name || "images";

  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
  const [galleryIndex, setGalleryIndex] = useState<GalleryIndexState | null>(
    null,
  );
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState(false);

  const [albumEntry, setAlbumEntry] = useState<AlbumEntry | null>(null);
  const [loadingAlbum, setLoadingAlbum] = useState(false);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [photoDialog, setPhotoDialog] = useState<{
    index: number | null;
    url: string;
    date: string;
    poster: string;
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSlug, setCreateSlug] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createCover, setCreateCover] = useState("");
  const [createEncrypted, setCreateEncrypted] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    path: string;
    title: string;
  } | null>(null);
  const [editDraft, setEditDraft] = useState<{
    path: string;
    sha: string;
    folderPath: string;
    contentObject: Record<string, unknown>;
    title: string;
    desc: string;
    cover: string;
    encrypted: boolean;
    password: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const indexPath = useMemo(
    () => joinPathSegments([rootPath, INDEX_FILENAME]),
    [rootPath],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const photos = useMemo(() => {
    const raw = albumEntry?.contentObject?.photos;
    return Array.isArray(raw) ? (raw as GalleryPhoto[]) : [];
  }, [albumEntry]);

  const timelineGroups = useMemo(() => {
    const items = photos.map((photo, index) => ({ photo, index }));
    items.sort((a, b) => {
      const dateA = toDateInputValue(a.photo.date);
      const dateB = toDateInputValue(b.photo.date);
      if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      return b.index - a.index;
    });

    const groups: Array<{
      key: string;
      label: string;
      items: Array<{ photo: GalleryPhoto; index: number }>;
    }> = [];
    const byKey = new Map<string, Array<{ photo: GalleryPhoto; index: number }>>();

    for (const item of items) {
      const key = monthKeyFromDate(item.photo.date);
      const list = byKey.get(key);
      if (list) list.push(item);
      else byKey.set(key, [item]);
    }

    for (const item of items) {
      const key = monthKeyFromDate(item.photo.date);
      if (groups.some((group) => group.key === key)) continue;
      groups.push({
        key,
        label: formatMonthLabel(key),
        items: byKey.get(key) || [],
      });
    }

    return groups;
  }, [photos]);

  const setAlbumPath = useCallback(
    (nextPath: string) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      const normalized = normalizePath(nextPath);
      if (!normalized || normalized === rootPath) params.delete("path");
      else params.set("path", normalized);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, rootPath, router, searchParams],
  );

  const fetchAlbumEntry = useCallback(
    async (folderPath: string): Promise<AlbumEntry | null> => {
      const albumIndexPath = joinPathSegments([folderPath, NODE_FILENAME]);
      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(albumIndexPath)}?name=${encodeURIComponent(name)}`,
      );
      const payload = await requireApiSuccess<any>(response, "加载相册失败");
      return {
        path: albumIndexPath,
        sha: payload.data.sha,
        contentObject: payload.data.contentObject || {},
      };
    },
    [config.branch, config.owner, config.repo, name],
  );

  const fetchGalleryIndex = useCallback(async (): Promise<GalleryIndexState> => {
    const response = await fetch(
      `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(indexPath)}?name=${encodeURIComponent(INDEX_SCHEMA_NAME)}`,
    );
    if (response.status === 404) {
      return {
        path: indexPath,
        sha: "",
        contentObject: {
          title: "相册",
          cover: "/img/default-cover.png",
          layout: "gallery",
          albums: [],
        },
      };
    }
    const payload = await requireApiSuccess<any>(response, "加载相册索引失败");
    const contentObject =
      payload.data.contentObject && typeof payload.data.contentObject === "object"
        ? { ...payload.data.contentObject }
        : {};
    if (!contentObject.title) contentObject.title = "相册";
    if (!contentObject.layout) contentObject.layout = "gallery";
    if (!Array.isArray(contentObject.albums)) contentObject.albums = [];
    return {
      path: indexPath,
      sha: payload.data.sha || "",
      contentObject,
    };
  }, [config.branch, config.owner, config.repo, indexPath]);

  const saveGalleryIndexAlbums = useCallback(
    async (nextSlugs: string[], base?: GalleryIndexState | null) => {
      const current = base ?? galleryIndex ?? (await fetchGalleryIndex());
      const contentObject: Record<string, unknown> = {
        ...current.contentObject,
        title:
          typeof current.contentObject.title === "string" &&
          current.contentObject.title.trim()
            ? current.contentObject.title
            : "相册",
        layout:
          typeof current.contentObject.layout === "string" &&
          current.contentObject.layout.trim()
            ? current.contentObject.layout
            : "gallery",
        cover:
          typeof current.contentObject.cover === "string"
            ? current.contentObject.cover
            : "/img/default-cover.png",
        albums: nextSlugs,
      };
      setSavingIndex(true);
      try {
        const response = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(current.path)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "content",
              name: INDEX_SCHEMA_NAME,
              content: contentObject,
              ...(current.sha ? { sha: current.sha } : {}),
            }),
          },
        );
        const payload = await requireApiSuccess<any>(
          response,
          "保存相册索引失败",
        );
        const nextIndex: GalleryIndexState = {
          path: current.path,
          sha: payload.data.sha || current.sha,
          contentObject,
        };
        setGalleryIndex(nextIndex);
        notifyCmsLocalSave();
        return nextIndex;
      } finally {
        setSavingIndex(false);
      }
    },
    [
      config.branch,
      config.owner,
      config.repo,
      fetchGalleryIndex,
      galleryIndex,
    ],
  );

  const loadAlbums = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const [indexState, listPayload] = await Promise.all([
        fetchGalleryIndex(),
        (async () => {
          const params = new URLSearchParams({
            path: rootPath,
            fields: "title,cover,desc,date,photos",
          });
          const response = await fetch(
            `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collections/${encodeURIComponent(name)}?${params}`,
          );
          return requireApiSuccess<any>(response, "加载相册列表失败");
        })(),
      ]);

      setGalleryIndex(indexState);
      const orderedSlugs = normalizeAlbumSlugs(indexState.contentObject.albums);

      const dirs = (listPayload.data.contents || []).filter(
        (item: any) => item.type === "dir",
      );

      const loaded = await Promise.all(
        dirs.map(async (dir: any) => {
          try {
            const entry = await fetchAlbumEntry(dir.path);
            const fields = entry?.contentObject || {};
            const photosList = Array.isArray(fields.photos)
              ? (fields.photos as GalleryPhoto[])
              : [];
            return {
              slug: dir.name,
              folderPath: dir.path,
              indexPath: joinPathSegments([dir.path, NODE_FILENAME]),
              sha: entry?.sha,
              title:
                typeof fields.title === "string" && fields.title.trim()
                  ? fields.title.trim()
                  : dir.name,
              desc:
                typeof fields.desc === "string" ? fields.desc : undefined,
              cover:
                typeof fields.cover === "string" ? fields.cover : undefined,
              date:
                fields.date != null ? String(fields.date) : undefined,
              photos: photosList,
            } satisfies AlbumListItem;
          } catch {
            return {
              slug: dir.name,
              folderPath: dir.path,
              indexPath: joinPathSegments([dir.path, NODE_FILENAME]),
              title: dir.name,
              photos: [],
            } satisfies AlbumListItem;
          }
        }),
      );

      const ordered = orderAlbumsByIndex(loaded, orderedSlugs);
      setAlbums(ordered);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "加载相册列表失败",
      );
    } finally {
      setLoadingList(false);
    }
  }, [
    config.branch,
    config.owner,
    config.repo,
    fetchAlbumEntry,
    fetchGalleryIndex,
    name,
    rootPath,
  ]);

  const loadAlbumDetail = useCallback(async () => {
    if (!isAlbumView) {
      setAlbumEntry(null);
      return;
    }
    setLoadingAlbum(true);
    setAlbumError(null);
    setSelected(new Set());
    try {
      const entry = await fetchAlbumEntry(currentPath);
      setAlbumEntry(entry);
    } catch (error) {
      setAlbumEntry(null);
      setAlbumError(
        error instanceof Error ? error.message : "加载相册失败",
      );
    } finally {
      setLoadingAlbum(false);
    }
  }, [currentPath, fetchAlbumEntry, isAlbumView]);

  useEffect(() => {
    if (isAlbumView) void loadAlbumDetail();
    else void loadAlbums();
  }, [isAlbumView, loadAlbumDetail, loadAlbums]);

  const saveAlbumContent = useCallback(
    async (
      nextContent: Record<string, unknown>,
      options?: { quiet?: boolean },
    ) => {
      if (!albumEntry) return;
      setSaving(true);
      const savePromise = (async () => {
        const response = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(albumEntry.path)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "content",
              name,
              content: nextContent,
              sha: albumEntry.sha,
            }),
          },
        );
        const payload = await requireApiSuccess<any>(response, "保存相册失败");
        setAlbumEntry({
          path: albumEntry.path,
          sha: payload.data.sha,
          contentObject: nextContent,
        });
        notifyCmsLocalSave();
        return payload;
      })();

      if (options?.quiet) {
        try {
          await savePromise;
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "保存相册失败",
          );
          throw error;
        } finally {
          setSaving(false);
        }
        return;
      }

      toast.promise(savePromise, {
        loading: "正在保存…",
        success: () => "已保存",
        error: (error: unknown) =>
          error instanceof Error ? error.message : "保存相册失败",
      });
      try {
        await savePromise;
      } finally {
        setSaving(false);
      }
    },
    [albumEntry, config.branch, config.owner, config.repo, name],
  );

  const updatePhotos = useCallback(
    async (nextPhotos: GalleryPhoto[]) => {
      if (!albumEntry) return;
      const nextContent: Record<string, unknown> = {
        ...albumEntry.contentObject,
        photos: nextPhotos,
      };
      const cover = nextContent.cover;
      if (
        (cover == null || cover === "") &&
        nextPhotos[0]?.url
      ) {
        nextContent.cover = nextPhotos[0].url;
      }
      await saveAlbumContent(nextContent);
    },
    [albumEntry, saveAlbumContent],
  );

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const nextPhotos = photos.filter((_, index) => !selected.has(index));
    setSelected(new Set());
    await updatePhotos(nextPhotos);
  };

  const openEditPhoto = (index: number) => {
    const photo = photos[index];
    setPhotoDialog({
      index,
      url: photo?.url || "",
      date: toDateInputValue(photo?.date) || todayDateInput(),
      poster: photo?.poster || "",
    });
  };

  const openAddPhotoManual = () => {
    setPhotoDialog({
      index: null,
      url: "",
      date: todayDateInput(),
      poster: "",
    });
  };

  const savePhotoDialog = async () => {
    if (!photoDialog) return;
    const url = photoDialog.url.trim();
    if (!url) {
      toast.error("请填写图片或视频链接");
      return;
    }
    const poster = photoDialog.poster.trim();
    const nextPhoto: GalleryPhoto = {
      url,
      date: photoDialog.date || todayDateInput(),
      ...(isVideoUrl(url) && poster ? { poster } : {}),
    };
    if (photoDialog.index == null) {
      await updatePhotos([...photos, nextPhoto]);
    } else {
      const next = photos.map((photo, index) =>
        index === photoDialog.index ? nextPhoto : photo,
      );
      await updatePhotos(next);
    }
    setPhotoDialog(null);
  };

  const handleCreateAlbum = async () => {
    const slug = createSlug
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop();
    if (!slug) {
      toast.error("请填写相册目录名");
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(slug)) {
      toast.error("目录名仅支持字母、数字、点、下划线和短横线");
      return;
    }
    const title = createTitle.trim() || slug;
    const desc = createDesc.trim();
    const cover = createCover.trim();
    const password = createEncrypted ? createPassword.trim() : "";
    if (createEncrypted && !password) {
      toast.error("加密相册请填写密码");
      return;
    }
    const folderPath = joinPathSegments([rootPath, slug]);
    const indexPath = joinPathSegments([folderPath, NODE_FILENAME]);
    setCreating(true);
    try {
      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(indexPath)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "content",
            name,
            content: {
              title,
              date: todayDateInput(),
              cover,
              desc,
              encrypted: createEncrypted,
              password,
              photos: [],
            },
          }),
        },
      );
      await requireApiSuccess(response, "创建相册失败");

      const currentIndex = galleryIndex ?? (await fetchGalleryIndex());
      const currentSlugs = normalizeAlbumSlugs(currentIndex.contentObject.albums);
      const nextSlugs = currentSlugs.includes(slug)
        ? currentSlugs
        : [...currentSlugs, slug];
      await saveGalleryIndexAlbums(nextSlugs, currentIndex);

      setCreateOpen(false);
      setCreateSlug("");
      setCreateTitle("");
      setCreateDesc("");
      setCreateCover("");
      setCreateEncrypted(false);
      setCreatePassword("");
      toast.success("相册已创建");
      setAlbumPath(folderPath);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "创建相册失败",
      );
    } finally {
      setCreating(false);
    }
  };

  const openEditAlbum = async (folderPath: string) => {
    try {
      const entry = await fetchAlbumEntry(folderPath);
      if (!entry) {
        toast.error("读取相册失败");
        return;
      }
      const content = entry.contentObject;
      setEditDraft({
        path: entry.path,
        sha: entry.sha,
        folderPath,
        contentObject: content,
        title:
          typeof content.title === "string" && content.title.trim()
            ? content.title
            : getFileName(folderPath),
        desc: typeof content.desc === "string" ? content.desc : "",
        cover: typeof content.cover === "string" ? content.cover : "",
        encrypted: coerceBoolean(content.encrypted),
        password:
          typeof content.password === "string" ? content.password : "",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "读取相册失败",
      );
    }
  };

  const handleSaveEditAlbum = async () => {
    if (!editDraft) return;
    const title = editDraft.title.trim();
    if (!title) {
      toast.error("请填写标题");
      return;
    }
    const password = editDraft.encrypted ? editDraft.password.trim() : "";
    if (editDraft.encrypted && !password) {
      toast.error("加密相册请填写密码");
      return;
    }
    const nextContent: Record<string, unknown> = {
      ...editDraft.contentObject,
      title,
      desc: editDraft.desc.trim(),
      cover: editDraft.cover.trim(),
      encrypted: editDraft.encrypted,
      password,
    };
    setEditSaving(true);
    try {
      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(editDraft.path)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "content",
            name,
            content: nextContent,
            sha: editDraft.sha,
          }),
        },
      );
      const payload = await requireApiSuccess<any>(response, "保存相册失败");
      const nextSha = payload.data.sha as string;
      setAlbums((prev) =>
        prev.map((album) =>
          album.folderPath === editDraft.folderPath
            ? {
                ...album,
                sha: nextSha,
                title,
                desc:
                  typeof nextContent.desc === "string"
                    ? nextContent.desc
                    : undefined,
                cover:
                  typeof nextContent.cover === "string"
                    ? nextContent.cover
                    : undefined,
                date:
                  typeof nextContent.date === "string"
                    ? nextContent.date
                    : album.date,
              }
            : album,
        ),
      );
      if (albumEntry?.path === editDraft.path) {
        setAlbumEntry({
          path: editDraft.path,
          sha: nextSha,
          contentObject: nextContent,
        });
      }
      notifyCmsLocalSave();
      setEditDraft(null);
      toast.success("相册信息已保存");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "保存相册失败",
      );
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!deleteTarget) return;
    const folderPath = deleteTarget.path;
    setDeleteTarget(null);
    const deletePromise = (async () => {
      const albumNodePath = joinPathSegments([folderPath, NODE_FILENAME]);
      // Delete index.md first, then remaining children if any.
      const listParams = new URLSearchParams({ path: folderPath });
      const listRes = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collections/${encodeURIComponent(name)}?${listParams}`,
      );
      const listPayload = await requireApiSuccess<any>(
        listRes,
        "读取相册内容失败",
      );
      const children = (listPayload.data.contents || []) as Array<{
        type: string;
        path: string;
        sha?: string;
      }>;
      const pathsToDelete = new Map<string, string | undefined>();
      pathsToDelete.set(albumNodePath, undefined);
      for (const child of children) {
        if (child.type !== "file") continue;
        pathsToDelete.set(child.path, child.sha);
      }

      for (const [filePath, listedSha] of pathsToDelete) {
        let sha = listedSha;
        if (!sha) {
          try {
            const metaRes = await fetch(
              `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(filePath)}?name=${encodeURIComponent(name)}`,
            );
            if (metaRes.ok) {
              const metaPayload = await metaRes.json();
              sha = metaPayload?.data?.sha;
            }
          } catch {
            // ignore missing
          }
        }
        if (!sha) continue;
        const delParams = new URLSearchParams({
          sha,
          type: "content",
          name,
        });
        const delRes = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(filePath)}?${delParams}`,
          { method: "DELETE" },
        );
        await requireApiSuccess(delRes, `删除「${getFileName(filePath)}」失败`);
      }
      // Remove empty folder marker if present via folder delete API pattern
      const keepPath = joinPathSegments([folderPath, ".gitkeep"]);
      try {
        const keepRes = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(keepPath)}?name=${encodeURIComponent(name)}`,
        );
        if (keepRes.ok) {
          const keepPayload = await keepRes.json();
          const sha = keepPayload?.data?.sha;
          if (sha) {
            const keepDelParams = new URLSearchParams({
              sha,
              type: "content",
              name,
            });
            await fetch(
              `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(keepPath)}?${keepDelParams}`,
              { method: "DELETE" },
            );
          }
        }
      } catch {
        // ignore missing .gitkeep
      }
      notifyCmsLocalSave();

      const currentIndex = galleryIndex ?? (await fetchGalleryIndex());
      const slug = getFileName(folderPath);
      const nextSlugs = normalizeAlbumSlugs(
        currentIndex.contentObject.albums,
      ).filter((item) => item !== slug);
      await saveGalleryIndexAlbums(nextSlugs, currentIndex);
    })();

    toast.promise(deletePromise, {
      loading: "正在删除相册…",
      success: "相册已删除",
      error: (error: unknown) =>
        error instanceof Error ? error.message : "删除相册失败",
    });
    try {
      await deletePromise;
      if (isAlbumView && currentPath === folderPath) setAlbumPath(rootPath);
      else await loadAlbums();
    } catch {
      // toast handled
    }
  };

  const handleAlbumDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = albums.findIndex((album) => album.slug === active.id);
    const newIndex = albums.findIndex((album) => album.slug === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = albums;
    const nextAlbums = arrayMove(albums, oldIndex, newIndex);
    setAlbums(nextAlbums);
    try {
      const currentIndex = galleryIndex ?? (await fetchGalleryIndex());
      await saveGalleryIndexAlbums(
        nextAlbums.map((album) => album.slug),
        currentIndex,
      );
    } catch (error) {
      setAlbums(previous);
      toast.error(
        error instanceof Error ? error.message : "保存相册顺序失败",
      );
    }
  };

  const albumDialogs = (
    <>
      <Dialog
        open={Boolean(editDraft)}
        onOpenChange={(open) => {
          if (!open && !editSaving) setEditDraft(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑相册</DialogTitle>
          </DialogHeader>
          {editDraft && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="gallery-edit-title">标题</Label>
                <Input
                  id="gallery-edit-title"
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, title: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gallery-edit-desc">简介</Label>
                <Textarea
                  id="gallery-edit-desc"
                  value={editDraft.desc}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, desc: event.target.value })
                  }
                  rows={3}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gallery-edit-cover">封面</Label>
                <Input
                  id="gallery-edit-cover"
                  value={editDraft.cover}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, cover: event.target.value })
                  }
                  placeholder="图床链接，例如 https://..."
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="grid gap-0.5">
                  <Label htmlFor="gallery-edit-encrypted">加密相册</Label>
                  <span className="text-muted-foreground text-xs">
                    开启后需密码才能查看
                  </span>
                </div>
                <Switch
                  id="gallery-edit-encrypted"
                  checked={editDraft.encrypted}
                  onCheckedChange={(checked) =>
                    setEditDraft({ ...editDraft, encrypted: checked })
                  }
                />
              </div>
              {editDraft.encrypted ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="gallery-edit-password">密码</Label>
                  <Input
                    id="gallery-edit-password"
                    value={editDraft.password}
                    onChange={(event) =>
                      setEditDraft({
                        ...editDraft,
                        password: event.target.value,
                      })
                    }
                    placeholder="请输入相册密码"
                    autoComplete="new-password"
                  />
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={editSaving}
              onClick={() => setEditDraft(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={editSaving}
              onClick={() => void handleSaveEditAlbum()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除此相册？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除「{deleteTarget?.title || ""}」
              {deleteTarget?.path
                ? `（${getFileName(deleteTarget.path)}）`
                : ""}
              及其全部图片记录，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void handleDeleteAlbum()}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (isAlbumView) {
    return (
      <div className="cms-gallery">
        <div className="cms-gallery__toolbar">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setAlbumPath(rootPath)}
          >
            <ArrowLeft className="size-4" />
            返回
          </Button>
          <div className="cms-gallery__toolbar-actions">
            {selected.size > 0 && canDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={saving}
                onClick={() => void deleteSelected()}
              >
                <Trash2 className="size-4" />
                删除（{selected.size}）
              </Button>
            )}
            {canCreate && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={openAddPhotoManual}
              >
                <Plus className="size-4" />
                添加媒体
              </Button>
            )}
          </div>
        </div>

        {loadingAlbum ? (
          <div className="cms-gallery__empty">加载中…</div>
        ) : albumError ? (
          <div className="cms-gallery__empty text-destructive">{albumError}</div>
        ) : photos.length === 0 ? (
          <div className="cms-gallery__empty">暂无图片或视频，点击上方按钮添加</div>
        ) : (
          <div className="cms-gallery-timeline">
            {timelineGroups.map((group) => (
              <section key={group.key} className="cms-gallery-timeline__group">
                <h3 className="cms-gallery-timeline__month">{group.label}</h3>
                <ul className="cms-gallery-photos">
                  {group.items.map(({ photo, index }) => {
                    const url = photo.url || "";
                    const video = Boolean(url && isVideoUrl(url));
                    const checked = selected.has(index);
                    return (
                      <li
                        key={`${url}-${index}`}
                        className="cms-gallery-photos__item"
                      >
                        <div
                          className="cms-gallery-photos__card"
                          data-selected={checked || undefined}
                          data-video={video || undefined}
                        >
                          <label className="cms-gallery-photos__check">
                            <Checkbox
                              className="size-3.5 rounded-full"
                              checked={checked}
                              onCheckedChange={() => toggleSelect(index)}
                              aria-label={video ? "选择视频" : "选择图片"}
                            />
                          </label>
                          <button
                            type="button"
                            className="cms-gallery-photos__thumb"
                            onClick={() => openEditPhoto(index)}
                          >
                            {url ? (
                              video ? (
                                photo.poster && isHttpUrl(photo.poster) ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={photo.poster} alt="" />
                                ) : isHttpUrl(url) ? (
                                  <video
                                    className="cms-gallery-photos__video"
                                    src={url}
                                    preload="metadata"
                                    muted
                                    playsInline
                                  />
                                ) : (
                                  <span className="cms-gallery-photos__placeholder">
                                    视频
                                  </span>
                                )
                              ) : isHttpUrl(url) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={url} alt="" />
                              ) : (
                                <Thumbnail
                                  name={mediaName}
                                  path={url}
                                  className="size-full rounded-none"
                                />
                              )
                            ) : (
                              <span className="cms-gallery-photos__placeholder">
                                无媒体
                              </span>
                            )}
                            {video ? (
                              <span
                                className="cms-gallery-photos__play"
                                aria-hidden
                              >
                                ▶
                              </span>
                            ) : null}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <Dialog
          open={Boolean(photoDialog)}
          onOpenChange={(open) => {
            if (!open) setPhotoDialog(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {photoDialog?.index == null ? "添加媒体" : "编辑媒体"}
              </DialogTitle>
            </DialogHeader>
            {photoDialog && (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="gallery-photo-url">图片 / 视频链接</Label>
                  <Input
                    id="gallery-photo-url"
                    value={photoDialog.url}
                    onChange={(event) =>
                      setPhotoDialog({
                        ...photoDialog,
                        url: event.target.value,
                      })
                    }
                    placeholder="https://...（支持 .mp4 / .webm / .mov）"
                  />
                </div>
                {isVideoUrl(photoDialog.url) ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="gallery-photo-poster">封面图（可选）</Label>
                    <Input
                      id="gallery-photo-poster"
                      value={photoDialog.poster}
                      onChange={(event) =>
                        setPhotoDialog({
                          ...photoDialog,
                          poster: event.target.value,
                        })
                      }
                      placeholder="视频封面图床链接"
                    />
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label>时间</Label>
                  <DateEditComponent
                    field={{ name: "date" }}
                    name="gallery-photo-date"
                    value={photoDialog.date}
                    onChange={(event: { target: { value: string } }) =>
                      setPhotoDialog({
                        ...photoDialog,
                        date: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPhotoDialog(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => void savePhotoDialog()}
              >
                确定
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {albumDialogs}
      </div>
    );
  }

  return (
    <div className="cms-gallery">
      <div className="cms-gallery__toolbar">
        <div>
          <div className="cms-gallery__toolbar-title">相册</div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            拖动卡片可调整前台展示顺序（写入 `_index.md` 的 albums）
            {savingIndex ? " · 保存中…" : ""}
          </p>
        </div>
        {canCreate && (
          <div className="cms-gallery__toolbar-actions">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              新增相册
            </Button>
          </div>
        )}
      </div>

      {loadingList ? (
        <div className="cms-gallery__empty">加载中…</div>
      ) : listError ? (
        <div className="cms-gallery__empty text-destructive">{listError}</div>
      ) : albums.length === 0 ? (
        <div className="cms-gallery__empty">暂无相册，点击右上角新增</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => {
            void handleAlbumDragEnd(event);
          }}
        >
          <SortableContext
            items={albums.map((album) => album.slug)}
            strategy={rectSortingStrategy}
          >
            <ul className="cms-album-grid">
              {albums.map((album) => (
                <SortableAlbumCard
                  key={album.folderPath}
                  album={album}
                  mediaName={mediaName}
                  canDelete={canDelete}
                  onOpen={setAlbumPath}
                  onEdit={(folderPath) => {
                    void openEditAlbum(folderPath);
                  }}
                  onDelete={(item) => {
                    setDeleteTarget({
                      path: item.folderPath,
                      title: item.title,
                    });
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增相册</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="gallery-create-title">标题</Label>
              <Input
                id="gallery-create-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="相册名称"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gallery-create-slug">目录名</Label>
              <Input
                id="gallery-create-slug"
                value={createSlug}
                onChange={(event) => setCreateSlug(event.target.value)}
                placeholder="例如 bizhi"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gallery-create-desc">简介</Label>
              <Textarea
                id="gallery-create-desc"
                value={createDesc}
                onChange={(event) => setCreateDesc(event.target.value)}
                placeholder="相册简介"
                rows={3}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gallery-create-cover">封面</Label>
              <Input
                id="gallery-create-cover"
                value={createCover}
                onChange={(event) => setCreateCover(event.target.value)}
                placeholder="图床链接，例如 https://..."
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="grid gap-0.5">
                <Label htmlFor="gallery-create-encrypted">加密相册</Label>
                <span className="text-muted-foreground text-xs">
                  开启后需密码才能查看
                </span>
              </div>
              <Switch
                id="gallery-create-encrypted"
                checked={createEncrypted}
                onCheckedChange={setCreateEncrypted}
              />
            </div>
            {createEncrypted ? (
              <div className="grid gap-1.5">
                <Label htmlFor="gallery-create-password">密码</Label>
                <Input
                  id="gallery-create-password"
                  value={createPassword}
                  onChange={(event) => setCreatePassword(event.target.value)}
                  placeholder="请输入相册密码"
                  autoComplete="new-password"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={creating}
              onClick={() => void handleCreateAlbum()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {albumDialogs}
    </div>
  );
};

export { GalleryManager };
