"use client";

import { useEffect, useMemo, useState, createElement } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { normalizeHexColor } from "@/lib/theme/primary-color";

export type NavMenuChild = {
  name?: string;
  url?: string;
  icon?: string;
  color?: string;
  enabled?: boolean;
};

export type NavMenuItem = {
  name?: string;
  url?: string;
  icon?: string;
  color?: string;
  navGroup?: string;
  weight?: number;
  enabled?: boolean;
  items?: NavMenuChild[];
};

const DEFAULT_ICON = "ant-design:appstore-filled";

const emptyChild = (): NavMenuChild => ({
  name: "",
  url: "/",
  icon: DEFAULT_ICON,
  color: "",
  enabled: true,
});

const emptyItem = (): NavMenuItem => ({
  name: "",
  url: "/",
  icon: DEFAULT_ICON,
  color: "",
  navGroup: "",
  enabled: true,
  items: [],
});

const asChild = (value: unknown): NavMenuChild => {
  if (!value || typeof value !== "object") return emptyChild();
  const row = value as NavMenuChild;
  return {
    name: row.name ?? "",
    url: row.url ?? "/",
    icon: row.icon?.trim() || DEFAULT_ICON,
    color: row.color ?? "",
    enabled: row.enabled !== false,
  };
};

export const asNavMenuList = (value: unknown): NavMenuItem[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (!item || typeof item !== "object") return emptyItem();
    const row = item as NavMenuItem;
    return {
      name: row.name ?? "",
      url: row.url ?? "/",
      icon: row.icon?.trim() || DEFAULT_ICON,
      color: row.color ?? "",
      navGroup: row.navGroup ?? "",
      weight: typeof row.weight === "number" ? row.weight : index + 1,
      enabled: row.enabled !== false,
      items: Array.isArray(row.items) ? row.items.map(asChild) : [],
    };
  });
};

const withWeights = (items: NavMenuItem[]): NavMenuItem[] =>
  items.map((item, index) => ({ ...item, weight: index + 1 }));

const ensureIconify = () => {
  if (typeof document === "undefined") return;
  if (document.querySelector("script[data-iconify-webcomponent]")) return;
  const script = document.createElement("script");
  script.src =
    "https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js";
  script.async = true;
  script.dataset.iconifyWebcomponent = "1";
  document.head.appendChild(script);
};

/** Mirrors hugo-blog theme `main.scss` nav icon color rules. */
const TOP_LEVEL_BY_URL: Record<string, string> = {
  "/": "#e03131",
  "/posts/weekly/": "#ff6b6b",
  "/comment/": "#fd7e14",
  "/links/": "#fcc419",
  "/about/": "#ffd43b",
};

const TOP_LEVEL_BY_GROUP: Record<string, string> = {
  posts: "#f03e3e",
  personal: "#fab005",
  interact: "#fd7e14",
};

const CHILD_BY_URL: Record<string, string> = {
  "/music/": "#fcc419",
  "/memories/": "#ff8787",
  "/stats/": "#ff6b6b",
  "/bangumi/": "#ff922b",
  "/friend-articles/": "#fcc419",
  "/comment/": "#fd7e14",
};

const CHILD_BY_GROUP: Record<string, string[]> = {
  posts: ["#f03e3e", "#ff8787", "#ff6b6b", "#fa5252"],
  personal: ["#fab005", "#ffc078", "#ff922b", "#fcc419", "#ffd43b"],
  interact: ["#fd7e14", "#ffa94d", "#ff922b"],
};

const normalizeNavUrl = (url?: string) => {
  const raw = (url || "").trim();
  if (!raw) return "/";
  if (raw === "/") return "/";
  return raw.endsWith("/") ? raw : `${raw}/`;
};

const resolveNavIconColor = (options: {
  color?: string;
  url?: string;
  navGroup?: string;
  parentNavGroup?: string;
  childIndex?: number;
}) => {
  const explicit = options.color?.trim();
  if (explicit) return explicit;

  const url = normalizeNavUrl(options.url);

  if (options.childIndex != null) {
    if (CHILD_BY_URL[url]) return CHILD_BY_URL[url];
    const group = options.parentNavGroup?.trim();
    if (group && CHILD_BY_GROUP[group]) {
      const palette = CHILD_BY_GROUP[group];
      return palette[Math.min(options.childIndex, palette.length - 1)] ?? palette[0];
    }
    return "#64748b";
  }

  if (TOP_LEVEL_BY_URL[url]) return TOP_LEVEL_BY_URL[url];
  const group = options.navGroup?.trim();
  if (group && TOP_LEVEL_BY_GROUP[group]) return TOP_LEVEL_BY_GROUP[group];
  return "#64748b";
};

const IconPreview = ({
  icon,
  color,
  url,
  navGroup,
  parentNavGroup,
  childIndex,
  className,
}: {
  icon?: string;
  color?: string;
  url?: string;
  navGroup?: string;
  parentNavGroup?: string;
  childIndex?: number;
  className?: string;
}) => {
  const resolved = resolveNavIconColor({
    color,
    url,
    navGroup,
    parentNavGroup,
    childIndex,
  });

  return (
    <span
      className={cn("site-settings__nav-icon", className)}
      style={{ color: resolved, ["--nav-icon-color" as string]: resolved }}
    >
      {createElement("iconify-icon", {
        icon: icon?.trim() || DEFAULT_ICON,
        class: "site-settings__nav-iconify sakura-nav-link-icon",
        "aria-hidden": "true",
      })}
    </span>
  );
};

type EditState =
  | { kind: "item"; index: number | null; draft: NavMenuItem }
  | { kind: "child"; parentIndex: number; index: number | null; draft: NavMenuChild };

type DragPreview = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  url?: string;
  navGroup?: string;
  parentNavGroup?: string;
  childIndex?: number;
  child?: boolean;
};

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.4",
      },
    },
  }),
};

function SortableRow({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "site-settings__nav-row",
        isDragging && "site-settings__nav-row--placeholder",
        className,
      )}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
    >
      <button
        type="button"
        className="site-settings__nav-drag touch-none"
        aria-label="拖动排序"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </div>
  );
}

function DragPreviewRow({
  preview,
}: {
  preview: DragPreview;
}) {
  return (
    <div
      className={cn(
        "site-settings__nav-row site-settings__nav-row--overlay",
        preview.child && "site-settings__nav-row--child",
      )}
    >
      <span className="site-settings__nav-drag" aria-hidden="true">
        <GripVertical className="size-4" />
      </span>
      <IconPreview
        icon={preview.icon}
        color={preview.color}
        url={preview.url}
        navGroup={preview.navGroup}
        parentNavGroup={preview.parentNavGroup}
        childIndex={preview.childIndex}
      />
      <div className="site-settings__nav-label">
        <div className="site-settings__nav-name">
          {preview.name || "未命名"}
        </div>
      </div>
    </div>
  );
}

export function NavMenuField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (next: NavMenuItem[]) => void;
}) {
  const rows = useMemo(() => asNavMenuList(value), [value]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [activePreview, setActivePreview] = useState<DragPreview | null>(null);

  useEffect(() => {
    ensureIconify();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const editIconColorArgs = useMemo(() => {
    if (!edit) return null;
    return {
      color: edit.draft.color,
      url: edit.draft.url,
      navGroup: edit.kind === "item" ? edit.draft.navGroup : undefined,
      parentNavGroup:
        edit.kind === "child" ? rows[edit.parentIndex]?.navGroup : undefined,
      childIndex:
        edit.kind === "child"
          ? edit.index ?? rows[edit.parentIndex]?.items?.length ?? 0
          : undefined,
    };
  }, [edit, rows]);

  const editResolvedIconColor = editIconColorArgs
    ? resolveNavIconColor(editIconColorArgs)
    : "#64748b";
  const editDefaultIconColor = editIconColorArgs
    ? resolveNavIconColor({ ...editIconColorArgs, color: undefined })
    : "#64748b";
  const editColorSwatch =
    normalizeHexColor(editResolvedIconColor) ?? "#64748b";

  const commit = (next: NavMenuItem[]) => onChange(withWeights(next));

  const clearDrag = () => setActivePreview(null);

  const handleParentDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const index = rows.findIndex((_, i) => `nav-${i}` === id);
    const item = rows[index];
    if (!item) return;
    setActivePreview({
      id,
      name: item.name || "未命名",
      icon: item.icon,
      color: item.color,
      url: item.url,
      navGroup: item.navGroup,
    });
  };

  const handleParentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    clearDrag();
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((_, i) => `nav-${i}` === String(active.id));
    const newIndex = rows.findIndex((_, i) => `nav-${i}` === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    commit(arrayMove(rows, oldIndex, newIndex));
  };

  const handleChildDragStart =
    (parentIndex: number) => (event: DragStartEvent) => {
      const id = String(event.active.id);
      const children = rows[parentIndex]?.items ?? [];
      const childIndex = children.findIndex(
        (_, i) => `nav-${parentIndex}-child-${i}` === id,
      );
      const child = children[childIndex];
      if (!child) return;
      setActivePreview({
        id,
        name: child.name || "未命名",
        icon: child.icon,
        color: child.color,
        url: child.url,
        parentNavGroup: rows[parentIndex]?.navGroup,
        childIndex,
        child: true,
      });
    };

  const handleChildDragEnd = (parentIndex: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    clearDrag();
    if (!over || active.id === over.id) return;
    const children = rows[parentIndex]?.items ?? [];
    const oldIndex = children.findIndex(
      (_, i) => `nav-${parentIndex}-child-${i}` === String(active.id),
    );
    const newIndex = children.findIndex(
      (_, i) => `nav-${parentIndex}-child-${i}` === String(over.id),
    );
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...rows];
    next[parentIndex] = {
      ...next[parentIndex],
      items: arrayMove(children, oldIndex, newIndex),
    };
    commit(next);
  };

  const saveEdit = () => {
    if (!edit) return;
    if (edit.kind === "item") {
      const nextItem: NavMenuItem = {
        name: edit.draft.name?.trim() ?? "",
        url: edit.draft.url?.trim() || "/",
        icon: edit.draft.icon?.trim() || DEFAULT_ICON,
        color: edit.draft.color?.trim() ?? "",
        navGroup: edit.draft.navGroup?.trim() ?? "",
        enabled: edit.draft.enabled !== false,
        items: edit.draft.items ?? [],
      };
      if (edit.index == null) {
        commit([...rows, nextItem]);
      } else {
        const next = [...rows];
        next[edit.index] = {
          ...next[edit.index],
          ...nextItem,
          items: next[edit.index].items,
        };
        commit(next);
      }
    } else {
      const nextChild: NavMenuChild = {
        name: edit.draft.name?.trim() ?? "",
        url: edit.draft.url?.trim() || "/",
        icon: edit.draft.icon?.trim() || DEFAULT_ICON,
        color: edit.draft.color?.trim() ?? "",
        enabled: edit.draft.enabled !== false,
      };
      const next = [...rows];
      const children = [...(next[edit.parentIndex]?.items ?? [])];
      if (edit.index == null) {
        children.push(nextChild);
      } else {
        children[edit.index] = nextChild;
      }
      next[edit.parentIndex] = { ...next[edit.parentIndex], items: children };
      commit(next);
    }
    setEdit(null);
  };

  return (
    <div className="site-settings__field site-settings__nav-menu">
      <div className="site-settings__nav-head">
        <span>{label}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setEdit({ kind: "item", index: null, draft: emptyItem() })}>
          <Plus className="size-4" />
          添加菜单
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={handleParentDragStart}
        onDragEnd={handleParentDragEnd}
        onDragCancel={clearDrag}
      >
        <SortableContext
          items={rows.map((_, i) => `nav-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="site-settings__nav-list">
            {rows.map((item, index) => {
              const childCount = item.items?.length ?? 0;
              const isOpen = expanded[index] ?? false;
              return (
                <div key={`nav-${index}`} className="site-settings__nav-block">
                  <SortableRow id={`nav-${index}`}>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="展开子菜单"
                      onClick={() =>
                        setExpanded((current) => ({
                          ...current,
                          [index]: !isOpen,
                        }))
                      }
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </Button>
                    <IconPreview
                      icon={item.icon}
                      color={item.color}
                      url={item.url}
                      navGroup={item.navGroup}
                    />
                    <div className="site-settings__nav-label">
                      <div className="site-settings__nav-name">
                        {item.name || "未命名"}
                        {childCount > 0 ? (
                          <span className="site-settings__nav-badge">
                            {childCount} 子项
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Switch
                      checked={item.enabled !== false}
                      onCheckedChange={(checked) => {
                        const next = [...rows];
                        next[index] = { ...next[index], enabled: Boolean(checked) };
                        commit(next);
                      }}
                      aria-label={`${item.name || "菜单"} 显示`}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="icon-sm" variant="ghost">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setEdit({
                              kind: "item",
                              index,
                              draft: { ...item },
                            })
                          }
                        >
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setEdit({
                              kind: "child",
                              parentIndex: index,
                              index: null,
                              draft: emptyChild(),
                            })
                          }
                        >
                          添加子菜单
                        </DropdownMenuItem>
                        {rows.length > 1 && !(item.items?.length) ? (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              移入为子菜单
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {rows.map((target, targetIndex) => {
                                if (targetIndex === index) return null;
                                return (
                                  <DropdownMenuItem
                                    key={`move-into-${targetIndex}`}
                                    onClick={() => {
                                      const next = [...rows];
                                      const [moved] = next.splice(index, 1);
                                      if (!moved) return;
                                      // After splice, target index may shift.
                                      const destIndex =
                                        targetIndex > index
                                          ? targetIndex - 1
                                          : targetIndex;
                                      const dest = next[destIndex];
                                      if (!dest) return;
                                      const child: NavMenuChild = {
                                        name: moved.name,
                                        url: moved.url,
                                        icon: moved.icon,
                                        color: moved.color,
                                        enabled: moved.enabled !== false,
                                      };
                                      next[destIndex] = {
                                        ...dest,
                                        items: [...(dest.items ?? []), child],
                                      };
                                      commit(next);
                                      setExpanded((current) => ({
                                        ...current,
                                        [destIndex]: true,
                                      }));
                                    }}
                                  >
                                    {target.name || "未命名"}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        ) : null}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            commit(rows.filter((_, i) => i !== index))
                          }
                        >
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SortableRow>

                  {isOpen ? (
                    <div className="site-settings__nav-children">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis]}
                        onDragStart={handleChildDragStart(index)}
                        onDragEnd={handleChildDragEnd(index)}
                        onDragCancel={clearDrag}
                      >
                        <SortableContext
                          items={(item.items ?? []).map(
                            (_, i) => `nav-${index}-child-${i}`,
                          )}
                          strategy={verticalListSortingStrategy}
                        >
                          {(item.items ?? []).map((child, childIndex) => (
                            <SortableRow
                              key={`nav-${index}-child-${childIndex}`}
                              id={`nav-${index}-child-${childIndex}`}
                              className="site-settings__nav-row--child"
                            >
                              <IconPreview
                                icon={child.icon}
                                color={child.color}
                                url={child.url}
                                parentNavGroup={item.navGroup}
                                childIndex={childIndex}
                              />
                              <div className="site-settings__nav-label">
                                <div className="site-settings__nav-name">
                                  {child.name || "未命名"}
                                </div>
                              </div>
                              <Switch
                                checked={child.enabled !== false}
                                onCheckedChange={(checked) => {
                                  const next = [...rows];
                                  const children = [...(next[index].items ?? [])];
                                  children[childIndex] = {
                                    ...children[childIndex],
                                    enabled: Boolean(checked),
                                  };
                                  next[index] = { ...next[index], items: children };
                                  commit(next);
                                }}
                              />
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" size="icon-sm" variant="ghost">
                                    <MoreHorizontal className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setEdit({
                                        kind: "child",
                                        parentIndex: index,
                                        index: childIndex,
                                        draft: { ...child },
                                      })
                                    }
                                  >
                                    编辑
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const next = [...rows];
                                      const children = [
                                        ...(next[index].items ?? []),
                                      ];
                                      const [moved] = children.splice(
                                        childIndex,
                                        1,
                                      );
                                      if (!moved) return;
                                      next[index] = {
                                        ...next[index],
                                        items: children,
                                      };
                                      const promoted: NavMenuItem = {
                                        name: moved.name,
                                        url: moved.url,
                                        icon: moved.icon,
                                        color: moved.color,
                                        enabled: moved.enabled !== false,
                                        navGroup: "",
                                        items: [],
                                      };
                                      next.splice(index + 1, 0, promoted);
                                      commit(next);
                                    }}
                                  >
                                    移出为一级菜单
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      const next = [...rows];
                                      next[index] = {
                                        ...next[index],
                                        items: (next[index].items ?? []).filter(
                                          (_, i) => i !== childIndex,
                                        ),
                                      };
                                      commit(next);
                                    }}
                                  >
                                    删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </SortableRow>
                          ))}
                        </SortableContext>
                        <DragOverlay dropAnimation={dropAnimation}>
                          {activePreview?.child ? (
                            <DragPreviewRow preview={activePreview} />
                          ) : null}
                        </DragOverlay>
                      </DndContext>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-1"
                        onClick={() =>
                          setEdit({
                            kind: "child",
                            parentIndex: index,
                            index: null,
                            draft: emptyChild(),
                          })
                        }
                      >
                        <Plus className="size-4" />
                        添加子菜单
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={dropAnimation}>
          {activePreview && !activePreview.child ? (
            <DragPreviewRow preview={activePreview} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {rows.length === 0 ? (
        <div className="site-settings__empty">暂无菜单项，点击「添加菜单」开始配置。</div>
      ) : null}

      <Dialog open={Boolean(edit)} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {edit?.kind === "child"
                ? edit.index == null
                  ? "添加子菜单"
                  : "编辑子菜单"
                : edit?.index == null
                  ? "添加菜单"
                  : "编辑菜单"}
            </DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5 min-w-0">
                  <Label>名称</Label>
                  <Input
                    value={edit.draft.name ?? ""}
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        draft: { ...edit.draft, name: event.target.value },
                      } as EditState)
                    }
                  />
                </div>
                <div className="grid gap-1.5 min-w-0">
                  <Label>链接</Label>
                  <Input
                    value={edit.draft.url ?? ""}
                    placeholder="/about/"
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        draft: { ...edit.draft, url: event.target.value },
                      } as EditState)
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>图标（Iconify）</Label>
                <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2">
                  <span className="flex size-9 items-center justify-center">
                    <IconPreview
                      icon={edit.draft.icon}
                      color={edit.draft.color}
                      url={editIconColorArgs?.url}
                      navGroup={editIconColorArgs?.navGroup}
                      parentNavGroup={editIconColorArgs?.parentNavGroup}
                      childIndex={editIconColorArgs?.childIndex}
                    />
                  </span>
                  <Input
                    value={edit.draft.icon ?? ""}
                    placeholder="ant-design:home-filled"
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        draft: { ...edit.draft, icon: event.target.value },
                      } as EditState)
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>图标颜色</Label>
                <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2">
                  <input
                    type="color"
                    className="site-settings__color-swatch size-9 rounded border"
                    value={editColorSwatch}
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        draft: { ...edit.draft, color: event.target.value },
                      } as EditState)
                    }
                  />
                  <Input
                    value={edit.draft.color ?? ""}
                    placeholder={editDefaultIconColor}
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        draft: { ...edit.draft, color: event.target.value },
                      } as EditState)
                    }
                    spellCheck={false}
                  />
                </div>
                {!edit.draft.color?.trim() ? (
                  <span className="site-settings__hint">
                    未填写时使用主题默认色（与图标预览一致）。
                  </span>
                ) : null}
              </div>
              {edit.kind === "item" ? (
                <div className="grid gap-1.5">
                  <Label>导航分组（可选）</Label>
                  <Input
                    value={edit.draft.navGroup ?? ""}
                    placeholder="posts / personal"
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        draft: { ...edit.draft, navGroup: event.target.value },
                      })
                    }
                  />
                  <span className="site-settings__hint">
                    对应主题 CSS 的 data-nav-group，用于默认配色。
                  </span>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={edit.draft.enabled !== false}
                  onCheckedChange={(checked) =>
                    setEdit({
                      ...edit,
                      draft: { ...edit.draft, enabled: Boolean(checked) },
                    } as EditState)
                  }
                />
                在前台显示
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEdit(null)}>
              取消
            </Button>
            <Button type="button" onClick={saveEdit}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
