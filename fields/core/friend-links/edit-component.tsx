"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { useFormContext } from "react-hook-form";
import {
  ArrowDown,
  ArrowUp,
  Code2,
  EllipsisVertical,
  FolderInput,
  GripVertical,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useConfig } from "@/contexts/config-context";
import { BLOG_LINKS_TOOLBAR_SLOT_ID } from "@/lib/entry-blog-layout";
import {
  FRIEND_LINK_CANONICAL_KEYS,
  FRIEND_LINK_FIELD_DEFS,
  denormalizeFriendLinksDocument,
  detectFriendLinksShape,
  normalizeFieldMap,
  normalizeFriendLinksDocument,
  normalizeGroupMap,
  parseFriendLinksSource,
  stringifyFriendLinksSource,
  type FriendLinkCanonicalKey,
  type FriendLinkFieldMap,
  type FriendLinkGroupMap,
} from "@/lib/friend-links-map";
import { getSchemaByName } from "@/lib/schema";
import { cn } from "@/lib/utils";
import "./friend-links.css";

const FRIEND_LINKS_SOURCE_RAW_KEY = "__friendLinksSourceRaw";

const INTERNAL_LINK_KEYS = new Set<string>([
  ...FRIEND_LINK_CANONICAL_KEYS,
  "blog",
  "pinLast",
]);

type LinkDialogField = {
  key: string;
  label: string;
  inputType: "text" | "url" | "textarea";
  mode: "canonical" | "extra";
};

const canonicalInputType = (
  key: FriendLinkCanonicalKey,
): LinkDialogField["inputType"] => {
  if (key === "desc") return "textarea";
  if (key === "url" || key === "avatar" || key === "siteshot" || key === "rss") {
    return "url";
  }
  return "text";
};

const stringifyExtraValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseExtraValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // keep as string
    }
  }
  return trimmed;
};

export type FriendLink = {
  url?: string | null;
  avatar?: string | null;
  name?: string | null;
  blog?: string | null;
  desc?: string | null;
  color?: string | null;
  siteshot?: string | null;
  rss?: string | null;
  pinLast?: boolean | null;
  [key: string]: unknown;
};

export type FriendLinkGroup = {
  name?: string | null;
  desc?: string | null;
  type?: string | null;
  shuffle?: boolean | null;
  links?: FriendLink[] | null;
};

type LinkDraft = {
  url: string;
  avatar: string;
  name: string;
  desc: string;
  color: string;
  siteshot: string;
  rss: string;
  pinLast: boolean;
};

type GroupDraft = {
  name: string;
  desc: string;
  type: "" | "preview" | "simple";
  shuffle: boolean | null;
};

const emptyLink = (): LinkDraft => ({
  url: "",
  avatar: "",
  name: "",
  desc: "",
  color: "",
  siteshot: "",
  rss: "",
  pinLast: false,
});

const emptyGroup = (): GroupDraft => ({
  name: "新分组",
  desc: "",
  type: "",
  shuffle: null,
});

const toLinkDraft = (link?: FriendLink | null): LinkDraft => ({
  url: typeof link?.url === "string" ? link.url : "",
  avatar: typeof link?.avatar === "string" ? link.avatar : "",
  name:
    (typeof link?.blog === "string" && link.blog) ||
    (typeof link?.name === "string" && link.name) ||
    "",
  desc: typeof link?.desc === "string" ? link.desc : "",
  color: typeof link?.color === "string" ? link.color : "",
  siteshot: typeof link?.siteshot === "string" ? link.siteshot : "",
  rss: typeof link?.rss === "string" ? link.rss : "",
  pinLast: Boolean(link?.pinLast),
});

const fromLinkDraft = (
  draft: LinkDraft,
  allowedCanonical?: Set<FriendLinkCanonicalKey>,
): FriendLink => {
  const allow = (key: FriendLinkCanonicalKey) =>
    !allowedCanonical || allowedCanonical.has(key);
  const title = draft.name.trim() || undefined;
  const next: FriendLink = {};
  if (allow("name") && title) {
    next.name = title;
    next.blog = title;
  }
  if (allow("url") && draft.url.trim()) next.url = draft.url.trim();
  if (allow("avatar") && draft.avatar.trim()) next.avatar = draft.avatar.trim();
  if (allow("desc") && draft.desc.trim()) next.desc = draft.desc.trim();
  if (allow("color") && draft.color.trim()) next.color = draft.color.trim();
  if (allow("siteshot") && draft.siteshot.trim()) {
    next.siteshot = draft.siteshot.trim();
  }
  if (allow("rss") && draft.rss.trim()) next.rss = draft.rss.trim();
  if (draft.pinLast) next.pinLast = true;
  return next;
};

const collectExtraLinkKeys = (
  groups: FriendLinkGroup[],
  fieldMap: FriendLinkFieldMap,
): string[] => {
  const skip = new Set<string>([
    ...INTERNAL_LINK_KEYS,
    ...Object.values(fieldMap).filter(Boolean),
  ]);
  const keys = new Set<string>();
  for (const group of groups) {
    for (const link of group.links ?? []) {
      if (!link || typeof link !== "object") continue;
      for (const key of Object.keys(link)) {
        if (skip.has(key)) continue;
        keys.add(key);
      }
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b, "zh-CN"));
};

const buildLinkDialogFields = (
  fieldMap: FriendLinkFieldMap,
  groups: FriendLinkGroup[],
): LinkDialogField[] => {
  const fields: LinkDialogField[] = [];
  const mapped = FRIEND_LINK_FIELD_DEFS.filter((def) =>
    Boolean(fieldMap[def.key]),
  );

  if (mapped.length > 0) {
    for (const def of mapped) {
      fields.push({
        key: def.key,
        label: def.label,
        inputType: canonicalInputType(def.key),
        mode: "canonical",
      });
    }
  } else {
    // No explicit map yet: still expose whatever keys already appear in the file.
    const seenCanonical = new Set<FriendLinkCanonicalKey>();
    for (const group of groups) {
      for (const link of group.links ?? []) {
        if (!link || typeof link !== "object") continue;
        for (const def of FRIEND_LINK_FIELD_DEFS) {
          if (seenCanonical.has(def.key)) continue;
          const value = link[def.key];
          if (value == null || value === "") continue;
          seenCanonical.add(def.key);
          fields.push({
            key: def.key,
            label: def.label,
            inputType: canonicalInputType(def.key),
            mode: "canonical",
          });
        }
      }
    }
    if (fields.length === 0) {
      for (const def of FRIEND_LINK_FIELD_DEFS) {
        fields.push({
          key: def.key,
          label: def.label,
          inputType: canonicalInputType(def.key),
          mode: "canonical",
        });
      }
    }
  }

  for (const key of collectExtraLinkKeys(groups, fieldMap)) {
    fields.push({
      key,
      label: key,
      inputType: "text",
      mode: "extra",
    });
  }

  return fields;
};

const toGroupDraft = (group?: FriendLinkGroup | null): GroupDraft => {
  const type =
    group?.type === "preview" || group?.type === "simple" ? group.type : "";
  return {
    name: group?.name ?? "",
    desc: group?.desc ?? "",
    type,
    shuffle: typeof group?.shuffle === "boolean" ? group.shuffle : null,
  };
};

const normalizeGroups = (value: unknown): FriendLinkGroup[] => {
  if (!Array.isArray(value)) return [];
  return value.map((group) => ({
    ...(group && typeof group === "object" ? group : {}),
    links: Array.isArray((group as FriendLinkGroup)?.links)
      ? ([...(group as FriendLinkGroup).links!] as FriendLink[])
      : [],
  }));
};

type SortItem = { id: string; index: number; name: string };

const SortableGroupRow = ({
  item,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  item: SortItem;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "bg-background flex items-center gap-2 rounded-md border px-2 py-2",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none p-1"
        aria-label="拖动排序"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {item.name}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={isFirst}
        aria-label="上移"
        onClick={onMoveUp}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={isLast}
        aria-label="下移"
        onClick={onMoveDown}
      >
        <ArrowDown className="size-3.5" />
      </Button>
    </div>
  );
};

const linkSortId = (groupIndex: number, linkIndex: number) =>
  `link-${groupIndex}-${linkIndex}`;

const SortableLinkItem = ({
  id,
  color,
  disabled,
  children,
}: {
  id: string;
  color: string;
  disabled?: boolean;
  children: React.ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{
        ["--link-color" as string]: color,
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "cms-fl-item",
        !disabled && "cms-fl-item--with-handle",
        isDragging && "cms-fl-item--dragging",
      )}
    >
      {children}
      {!disabled ? (
        <button
          type="button"
          className="cms-fl-item__drag"
          aria-label="拖动排序"
          title="按住拖动排序"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
};

const EditComponent = forwardRef(function FriendLinksEdit(
  props: {
    field?: {
      label?: string | false;
      readonly?: boolean;
      options?: {
        fieldMap?: FriendLinkFieldMap;
        groupMap?: FriendLinkGroupMap;
      };
    };
    value?: FriendLinkGroup[] | null;
    onChange?: (value: FriendLinkGroup[]) => void;
    onBlur?: () => void;
    name?: string;
  },
  _ref: React.Ref<HTMLDivElement>,
) {
  const { value, onChange, field, name: fieldName } = props;
  const readonly = Boolean(field?.readonly);
  const form = useFormContext();
  const { config } = useConfig();
  const routeParams = useParams<{ name?: string }>();
  const schemaName = useMemo(() => {
    const raw = routeParams?.name;
    if (typeof raw !== "string" || !raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [routeParams?.name]);
  const schema = useMemo(
    () => (config && schemaName ? getSchemaByName(config.object, schemaName) : null),
    [config, schemaName],
  );
  const fieldMap = useMemo<FriendLinkFieldMap>(() => {
    const linkField = Array.isArray(schema?.fields)
      ? schema.fields.find((item: any) => item?.type === "friend-links")
      : null;
    return normalizeFieldMap(
      schema?.fieldMap ?? linkField?.options?.fieldMap ?? field?.options?.fieldMap,
    );
  }, [field, schema]);
  const groupMap = useMemo<FriendLinkGroupMap>(() => {
    const linkField = Array.isArray(schema?.fields)
      ? schema.fields.find((item: any) => item?.type === "friend-links")
      : null;
    return normalizeGroupMap(
      schema?.groupMap ?? linkField?.options?.groupMap ?? field?.options?.groupMap,
    );
  }, [field, schema]);
  const sourceFormat = (schema?.format as string) || "yaml";
  const groups = useMemo(() => normalizeGroups(value), [value]);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last full on-disk / applied source text — used to patch named TS/JS exports. */
  const sourceTemplateRef = useRef<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  useEffect(() => {
    const loaded = form?.getValues?.(FRIEND_LINKS_SOURCE_RAW_KEY);
    if (typeof loaded === "string" && loaded.trim()) {
      sourceTemplateRef.current = loaded;
    }
  }, [form]);

  const scheduleEntryAutoSave = useCallback(() => {
    if (readonly || typeof document === "undefined") return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      const formEl = document.getElementById("entry-form");
      if (formEl instanceof HTMLFormElement) {
        formEl.requestSubmit();
      }
    }, 80);
  }, [readonly]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const linkDialogFields = useMemo(
    () => buildLinkDialogFields(fieldMap, groups),
    [fieldMap, groups],
  );
  const allowedCanonicalKeys = useMemo(() => {
    const keys = new Set<FriendLinkCanonicalKey>();
    for (const item of linkDialogFields) {
      if (item.mode === "canonical") {
        keys.add(item.key as FriendLinkCanonicalKey);
      }
    }
    return keys;
  }, [linkDialogFields]);
  const extraFieldKeys = useMemo(
    () =>
      linkDialogFields
        .filter((item) => item.mode === "extra")
        .map((item) => item.key),
    [linkDialogFields],
  );

  const [linkDialog, setLinkDialog] = useState<{
    groupIndex: number;
    linkIndex: number | null;
    draft: LinkDraft;
    extras: Record<string, string>;
  } | null>(null);

  const [groupDialog, setGroupDialog] = useState<{
    groupIndex: number | null;
    draft: GroupDraft;
  } | null>(null);

  const [sortOpen, setSortOpen] = useState(false);
  const [sortItems, setSortItems] = useState<SortItem[]>([]);

  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    groupIndex: number;
    linkIndex: number;
    title: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let frame = 0;
    const findSlot = () => {
      if (cancelled) return;
      const el = document.getElementById(BLOG_LINKS_TOOLBAR_SLOT_ID);
      if (el) {
        setToolbarSlot(el);
        return;
      }
      if (attempts++ < 30) {
        frame = window.requestAnimationFrame(findSlot);
      }
    };
    findSlot();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const clearSourceRaw = useCallback(() => {
    if (!form?.setValue) return;
    form.setValue(FRIEND_LINKS_SOURCE_RAW_KEY, null, {
      shouldDirty: true,
      shouldTouch: true,
    });
  }, [form]);

  const commit = (
    next: FriendLinkGroup[],
    options?: { autoSave?: boolean; keepSourceRaw?: boolean },
  ) => {
    const shouldAutoSave = options?.autoSave !== false;
    if (!options?.keepSourceRaw) clearSourceRaw();
    onChange?.(next);
    if (fieldName && form?.setValue) {
      form.setValue(fieldName, next, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
    if (shouldAutoSave) scheduleEntryAutoSave();
  };

  const buildSourceTextFromForm = useCallback(() => {
    const values = (form?.getValues?.() ?? {}) as Record<string, unknown>;
    const document: Record<string, unknown> = {
      ...values,
      linkGroups: normalizeGroups(values.linkGroups ?? groups),
    };
    delete document[FRIEND_LINKS_SOURCE_RAW_KEY];
    const pendingRaw = form?.getValues?.(FRIEND_LINKS_SOURCE_RAW_KEY);
    let shape = detectFriendLinksShape(
      { linkGroups: document.linkGroups },
      groupMap,
    );
    if (typeof pendingRaw === "string" && pendingRaw.trim()) {
      try {
        shape = detectFriendLinksShape(
          parseFriendLinksSource(pendingRaw, sourceFormat),
          groupMap,
        );
      } catch {
        // keep default
      }
    } else if (typeof values[FRIEND_LINKS_SOURCE_RAW_KEY] === "string") {
      try {
        shape = detectFriendLinksShape(
          parseFriendLinksSource(
            values[FRIEND_LINKS_SOURCE_RAW_KEY] as string,
            sourceFormat,
          ),
          groupMap,
        );
      } catch {
        // keep default
      }
    }
    const output = denormalizeFriendLinksDocument(
      document,
      fieldMap,
      shape,
      groupMap,
    );
    return stringifyFriendLinksSource(output, sourceFormat, {
      templateSource: sourceTemplateRef.current ?? undefined,
    });
  }, [fieldMap, form, groupMap, groups, sourceFormat]);

  const openGroupSort = () => {
    setSortItems(
      groups.map((group, index) => ({
        id: `g-${index}`,
        index,
        name: group.name || `分组 ${index + 1}`,
      })),
    );
    setSortOpen(true);
  };

  const applyGroupSort = () => {
    commit(sortItems.map((item) => groups[item.index]));
    setSortOpen(false);
  };

  const handleSortDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSortItems((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const openSourceEditor = async () => {
    setSourceLoading(true);
    try {
      // 1) Pending / loaded on-disk text kept on the form
      const pending = form?.getValues?.(FRIEND_LINKS_SOURCE_RAW_KEY);
      if (typeof pending === "string") {
        sourceTemplateRef.current = pending;
        setSourceText(pending);
        setSourceOpen(true);
        return;
      }

      // 2) Fetch disk text first so TS modules keep interface / helpers as template
      if (config && schema?.path && schemaName) {
        const response = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(schema.path)}?name=${encodeURIComponent(schemaName)}`,
        );
        const body = await response.json().catch(() => null);
        if (response.ok && typeof body?.data?.sourceRaw === "string") {
          sourceTemplateRef.current = body.data.sourceRaw;
        }
      }

      // 3) Rebuild in the real source format (patches named exports when template known)
      try {
        setSourceText(buildSourceTextFromForm());
        setSourceOpen(true);
        return;
      } catch {
        // continue
      }

      if (sourceTemplateRef.current) {
        setSourceText(sourceTemplateRef.current);
        setSourceOpen(true);
        return;
      }

      throw new Error("无法读取源文件内容");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "无法读取源文件",
      );
    } finally {
      setSourceLoading(false);
    }
  };

  const applySourceEditor = () => {
    try {
      const parsed = parseFriendLinksSource(sourceText, sourceFormat);
      const { document } = normalizeFriendLinksDocument(
        parsed,
        fieldMap,
        groupMap,
      );
      if (form?.setValue) {
        for (const [key, nextValue] of Object.entries(document)) {
          if (key === "linkGroups") continue;
          form.setValue(key, nextValue, {
            shouldDirty: true,
            shouldTouch: true,
          });
        }
        form.setValue(FRIEND_LINKS_SOURCE_RAW_KEY, sourceText, {
          shouldDirty: true,
          shouldTouch: true,
        });
      }
      sourceTemplateRef.current = sourceText;
      commit(normalizeGroups(document.linkGroups), {
        autoSave: false,
        keepSourceRaw: true,
      });
      setSourceOpen(false);
      toast.success("源文件已应用，请点击保存");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "源文件解析失败",
      );
    }
  };

  const updateGroup = (groupIndex: number, patch: Partial<FriendLinkGroup>) => {
    const next = groups.map((group, index) =>
      index === groupIndex ? { ...group, ...patch } : group,
    );
    commit(next);
  };

  const updateLinks = (groupIndex: number, links: FriendLink[]) => {
    updateGroup(groupIndex, { links });
  };

  const handleLinkDragEnd = (groupIndex: number, event: DragEndEvent) => {
    if (readonly) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const links = groups[groupIndex]?.links ?? [];
    const oldIndex = links.findIndex(
      (_, index) => linkSortId(groupIndex, index) === String(active.id),
    );
    const newIndex = links.findIndex(
      (_, index) => linkSortId(groupIndex, index) === String(over.id),
    );
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    updateLinks(groupIndex, arrayMove(links, oldIndex, newIndex));
  };

  const buildExtrasDraft = (link?: FriendLink | null): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const key of extraFieldKeys) {
      next[key] = stringifyExtraValue(link?.[key]);
    }
    return next;
  };

  const openNewLink = (groupIndex: number) => {
    if (readonly) return;
    setLinkDialog({
      groupIndex,
      linkIndex: null,
      draft: emptyLink(),
      extras: buildExtrasDraft(null),
    });
  };

  const openEditLink = (groupIndex: number, linkIndex: number) => {
    const link = groups[groupIndex]?.links?.[linkIndex];
    setLinkDialog({
      groupIndex,
      linkIndex,
      draft: toLinkDraft(link),
      extras: buildExtrasDraft(link),
    });
  };

  const saveLink = () => {
    if (!linkDialog) return;
    const { groupIndex, linkIndex, draft, extras } = linkDialog;
    const mapped = fromLinkDraft(draft, allowedCanonicalKeys);
    const previous =
      linkIndex != null
        ? (groups[groupIndex]?.links?.[linkIndex] as FriendLink | undefined)
        : undefined;
    const next: FriendLink = {
      ...(previous && typeof previous === "object" ? previous : {}),
      ...mapped,
    };

    // Drop canonical keys that are intentionally hidden for this file.
    for (const key of FRIEND_LINK_CANONICAL_KEYS) {
      if (allowedCanonicalKeys.has(key)) continue;
      delete next[key];
      if (key === "name") delete next.blog;
    }

    for (const key of extraFieldKeys) {
      const parsed = parseExtraValue(extras[key] ?? "");
      if (parsed === undefined) delete next[key];
      else next[key] = parsed;
    }

    const current = [...(groups[groupIndex]?.links ?? [])];
    if (linkIndex == null) current.push(next);
    else current[linkIndex] = next;
    updateLinks(groupIndex, current);
    setLinkDialog(null);
  };

  const deleteLink = (groupIndex: number, linkIndex: number) => {
    if (readonly) return;
    const current = [...(groups[groupIndex]?.links ?? [])];
    current.splice(linkIndex, 1);
    updateLinks(groupIndex, current);
  };

  const requestDeleteLink = (groupIndex: number, linkIndex: number) => {
    if (readonly) return;
    const link = groups[groupIndex]?.links?.[linkIndex];
    setDeleteTarget({
      groupIndex,
      linkIndex,
      title: link?.blog || link?.name || "该友链",
    });
  };

  const confirmDeleteLink = () => {
    if (!deleteTarget) return;
    deleteLink(deleteTarget.groupIndex, deleteTarget.linkIndex);
    setDeleteTarget(null);
  };

  const moveLinkToGroup = (
    fromGroupIndex: number,
    linkIndex: number,
    toGroupIndex: number,
  ) => {
    if (readonly) return;
    if (fromGroupIndex === toGroupIndex) return;
    if (
      fromGroupIndex < 0 ||
      toGroupIndex < 0 ||
      fromGroupIndex >= groups.length ||
      toGroupIndex >= groups.length
    ) {
      return;
    }

    const next = groups.map((group) => ({
      ...group,
      links: [...(group.links ?? [])],
    }));
    const sourceLinks = next[fromGroupIndex]!.links;
    if (linkIndex < 0 || linkIndex >= sourceLinks.length) return;
    const [moved] = sourceLinks.splice(linkIndex, 1);
    if (!moved) return;
    next[toGroupIndex]!.links.push(moved);
    commit(next);
    toast.success(
      `已移动到「${next[toGroupIndex]!.name || `分组 ${toGroupIndex + 1}`}」`,
    );
  };

  const openNewGroup = () => {
    if (readonly) return;
    setGroupDialog({ groupIndex: null, draft: emptyGroup() });
  };

  const openEditGroup = (groupIndex: number) => {
    setGroupDialog({
      groupIndex,
      draft: toGroupDraft(groups[groupIndex]),
    });
  };

  const saveGroup = () => {
    if (!groupDialog) return;
    const { groupIndex, draft } = groupDialog;
    const patch: FriendLinkGroup = {
      name: draft.name.trim() || "未命名分组",
      desc: draft.desc.trim() || undefined,
      type: draft.type || undefined,
    };
    if (draft.shuffle === null) {
      // leave unset / remove override
    } else {
      patch.shuffle = draft.shuffle;
    }

    if (groupIndex == null) {
      commit([
        ...groups,
        {
          ...patch,
          links: [],
        },
      ]);
    } else {
      const next = groups.map((group, index) => {
        if (index !== groupIndex) return group;
        const merged: FriendLinkGroup = {
          ...group,
          name: patch.name,
          desc: patch.desc,
          type: patch.type,
        };
        if (draft.shuffle === null) {
          delete merged.shuffle;
        } else {
          merged.shuffle = draft.shuffle;
        }
        return merged;
      });
      commit(next);
    }
    setGroupDialog(null);
  };

  const deleteGroup = (groupIndex: number) => {
    if (readonly) return;
    commit(groups.filter((_, index) => index !== groupIndex));
  };

  return (
    <div className="cms-fl" data-readonly={readonly || undefined}>
      {!readonly &&
        toolbarSlot &&
        createPortal(
          <div className="cms-fl-toolbar">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="entry-blog-body__toggle inline-flex h-auto items-center gap-1 px-2 py-1 text-xs"
              onClick={openGroupSort}
              disabled={groups.length < 2}
            >
              <ListOrdered className="size-3.5" />
              分组排序
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="entry-blog-body__toggle inline-flex h-auto items-center gap-1 px-2 py-1 text-xs"
              disabled={sourceLoading}
              onClick={() => void openSourceEditor()}
            >
              <Code2 className="size-3.5" />
              {sourceLoading ? "读取中…" : "编辑源文件"}
            </Button>
          </div>,
          toolbarSlot,
        )}

      {groups.length === 0 ? (
        <div className="cms-fl-empty">暂无友链分组，点击下方添加</div>
      ) : (
        <div className="cms-fl__groups">
          {groups.map((group, groupIndex) => {
            const links = group.links ?? [];

            return (
              <section
                key={`group-${groupIndex}`}
                className="cms-fl-group cms-fl-group--simple"
              >
                <header className="cms-fl-group__header">
                  <div className="cms-fl-group__title-row">
                    <h2 className="cms-fl-group__title">
                      <span className="cms-fl-group__title-icon" aria-hidden>
                        📌
                      </span>
                      <span className="cms-fl-group__title-text">
                        {group.name || "未命名分组"}
                      </span>
                    </h2>
                    {!readonly && (
                      <div className="cms-fl-group__actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="添加友链"
                          onClick={() => openNewLink(groupIndex)}
                        >
                          <Plus className="size-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-label="分组操作"
                            >
                              <EllipsisVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onSelect={() => openEditGroup(groupIndex)}
                            >
                              <Pencil className="size-4" />
                              编辑分组
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => deleteGroup(groupIndex)}
                            >
                              <Trash2 className="size-4" />
                              删除分组
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                  {group.desc ? (
                    <p className="cms-fl-group__desc">
                      分类描述 🌸：{group.desc}
                    </p>
                  ) : null}
                </header>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleLinkDragEnd(groupIndex, event)}
                >
                  <SortableContext
                    items={links.map((_, linkIndex) =>
                      linkSortId(groupIndex, linkIndex),
                    )}
                    strategy={rectSortingStrategy}
                  >
                    <ul className="cms-fl-grid">
                      {links.map((link, linkIndex) => {
                        const color = link.color || "#0078e7";
                        const title = link.blog || link.name || "未命名";
                        const sortableId = linkSortId(groupIndex, linkIndex);

                        return (
                          <SortableLinkItem
                            key={sortableId}
                            id={sortableId}
                            color={color}
                            disabled={readonly}
                          >
                            {!readonly && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="cms-fl-item__menu size-7 shadow-sm"
                                    aria-label="友链操作"
                                    onPointerDown={(event) =>
                                      event.stopPropagation()
                                    }
                                  >
                                    <EllipsisVertical className="size-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      openEditLink(groupIndex, linkIndex)
                                    }
                                  >
                                    <Pencil className="size-4" />
                                    编辑
                                  </DropdownMenuItem>
                                  {groups.length > 1 ? (
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>
                                        <FolderInput className="size-4" />
                                        移动到分组
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                        {groups.map(
                                          (targetGroup, targetIndex) => {
                                            const isCurrent =
                                              targetIndex === groupIndex;
                                            return (
                                              <DropdownMenuItem
                                                key={`move-${groupIndex}-${linkIndex}-${targetIndex}`}
                                                disabled={isCurrent}
                                                onSelect={() =>
                                                  moveLinkToGroup(
                                                    groupIndex,
                                                    linkIndex,
                                                    targetIndex,
                                                  )
                                                }
                                              >
                                                {targetGroup.name ||
                                                  `分组 ${targetIndex + 1}`}
                                                {isCurrent ? "（当前）" : ""}
                                              </DropdownMenuItem>
                                            );
                                          },
                                        )}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() =>
                                      requestDeleteLink(groupIndex, linkIndex)
                                    }
                                  >
                                    <Trash2 className="size-4" />
                                    删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}

                            <div className="cms-fl-card cms-fl-card--simple">
                              {link.avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  className="cms-fl-avatar"
                                  src={link.avatar}
                                  alt=""
                                  draggable={false}
                                />
                              ) : (
                                <span className="cms-fl-avatar" aria-hidden />
                              )}
                              <div className="cms-fl-text">
                                <div className="cms-fl-name">{title}</div>
                                <div className="cms-fl-desc">
                                  {link.desc || " "}
                                </div>
                              </div>
                            </div>
                          </SortableLinkItem>
                        );
                      })}

                      {!readonly && (
                        <li className="cms-fl-item">
                          <button
                            type="button"
                            className="cms-fl-add"
                            aria-label="添加友链"
                            onClick={() => openNewLink(groupIndex)}
                          >
                            <Plus className="size-5" />
                          </button>
                        </li>
                      )}
                    </ul>
                  </SortableContext>
                </DndContext>
              </section>
            );
          })}
        </div>
      )}

      {!readonly && (
        <button
          type="button"
          className="cms-fl-add-group"
          onClick={openNewGroup}
        >
          <Plus className="size-4" />
          添加分组
        </button>
      )}

      <Dialog
        open={Boolean(linkDialog)}
        onOpenChange={(open) => {
          if (!open) setLinkDialog(null);
        }}
      >
        <DialogContent className="flex max-h-[min(100dvh-2rem,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6 sm:py-4">
            <DialogTitle>
              {linkDialog?.linkIndex == null ? "添加友链" : "编辑友链"}
            </DialogTitle>
          </DialogHeader>
          {linkDialog && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
              <div className="grid gap-3">
                {linkDialogFields.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    当前文件尚未配置可编辑字段，请先在「内容与侧栏」中设置字段映射。
                  </p>
                ) : (
                  linkDialogFields.map((item) => {
                    const inputId = `fl-link-${item.key}`;
                    const value =
                      item.mode === "canonical"
                        ? String(
                            linkDialog.draft[
                              item.key as keyof LinkDraft
                            ] ?? "",
                          )
                        : (linkDialog.extras[item.key] ?? "");
                    const onChange = (nextValue: string) => {
                      if (item.mode === "canonical") {
                        setLinkDialog({
                          ...linkDialog,
                          draft: {
                            ...linkDialog.draft,
                            [item.key]: nextValue,
                          },
                        });
                        return;
                      }
                      setLinkDialog({
                        ...linkDialog,
                        extras: {
                          ...linkDialog.extras,
                          [item.key]: nextValue,
                        },
                      });
                    };

                    return (
                      <div key={item.key} className="grid gap-1.5">
                        <Label htmlFor={inputId}>{item.label}</Label>
                        {item.inputType === "textarea" ? (
                          <Textarea
                            id={inputId}
                            value={value}
                            rows={2}
                            onChange={(event) => onChange(event.target.value)}
                          />
                        ) : (
                          <Input
                            id={inputId}
                            type={item.inputType}
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLinkDialog(null)}
            >
              取消
            </Button>
            <Button type="button" onClick={saveLink}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(groupDialog)}
        onOpenChange={(open) => {
          if (!open) setGroupDialog(null);
        }}
      >
        <DialogContent className="flex max-h-[min(100dvh-2rem,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6 sm:py-4">
            <DialogTitle>
              {groupDialog?.groupIndex == null ? "添加分组" : "编辑分组"}
            </DialogTitle>
          </DialogHeader>
          {groupDialog && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="fl-group-name">分组名</Label>
                  <Input
                    id="fl-group-name"
                    value={groupDialog.draft.name}
                    onChange={(event) =>
                      setGroupDialog({
                        ...groupDialog,
                        draft: {
                          ...groupDialog.draft,
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="fl-group-desc">描述</Label>
                  <Textarea
                    id="fl-group-desc"
                    rows={2}
                    value={groupDialog.draft.desc}
                    onChange={(event) =>
                      setGroupDialog({
                        ...groupDialog,
                        draft: {
                          ...groupDialog.draft,
                          desc: event.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="fl-group-type">布局</Label>
                  <select
                    id="fl-group-type"
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    value={groupDialog.draft.type}
                    onChange={(event) =>
                      setGroupDialog({
                        ...groupDialog,
                        draft: {
                          ...groupDialog.draft,
                          type: event.target.value as GroupDraft["type"],
                        },
                      })
                    }
                  >
                    <option value="">默认（preview）</option>
                    <option value="preview">preview 卡片截图</option>
                    <option value="simple">simple 长条</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">本组随机排序</div>
                    <div className="text-muted-foreground text-xs">
                      关闭后继承全局「分组随机排序」
                    </div>
                  </div>
                  <Switch
                    checked={groupDialog.draft.shuffle === true}
                    onCheckedChange={(checked) =>
                      setGroupDialog({
                        ...groupDialog,
                        draft: {
                          ...groupDialog.draft,
                          shuffle: checked ? true : null,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGroupDialog(null)}
            >
              取消
            </Button>
            <Button type="button" onClick={saveGroup}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sortOpen} onOpenChange={setSortOpen}>
        <DialogContent className="flex max-h-[min(100dvh-2rem,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6 sm:py-4">
            <DialogTitle>分组排序</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSortDragEnd}
            >
              <SortableContext
                items={sortItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {sortItems.map((item, index) => (
                    <SortableGroupRow
                      key={item.id}
                      item={item}
                      isFirst={index === 0}
                      isLast={index === sortItems.length - 1}
                      onMoveUp={() =>
                        setSortItems((items) =>
                          arrayMove(items, index, index - 1),
                        )
                      }
                      onMoveDown={() =>
                        setSortItems((items) =>
                          arrayMove(items, index, index + 1),
                        )
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSortOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={applyGroupSort}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="flex max-h-[min(100dvh-2rem,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6 sm:py-4">
            <DialogTitle>编辑源文件</DialogTitle>
            <DialogDescription>
              编辑磁盘上的真实源文件内容（YAML / JSON / JS 模块）。应用后需再点保存写入。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
            <Textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              spellCheck={false}
              className="min-h-[min(60dvh,28rem)] font-mono text-xs leading-5"
            />
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSourceOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={applySourceEditor}>
              应用
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
            <AlertDialogTitle>删除友链？</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleteTarget?.title}」吗？删除后需保存才会写入文件。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteLink}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export { EditComponent };
