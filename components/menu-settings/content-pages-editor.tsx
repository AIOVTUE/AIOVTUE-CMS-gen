"use client";

import { useState } from "react";
import { EllipsisVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PagePathPicker } from "@/components/menu-settings/page-path-picker";
import { MenuSettingsColorSwatch } from "@/components/menu-settings/menu-settings-color-swatch";
import {
  RepoNavIcon,
  REPO_NAV_ICON_KINDS,
  REPO_NAV_ICON_LABELS,
  isRepoNavIconKind,
  resolveRepoNavIconKind,
  type RepoNavIconKind,
} from "@/components/repo/repo-nav-icons";
import { useConfig } from "@/contexts/config-context";
import {
  FRIEND_LINK_FIELD_DEFS,
  FRIEND_LINK_GROUP_DEFS,
  applyFormatSamples,
  normalizeFieldMap,
  normalizeGroupMap,
  type FriendLinkFieldMap,
  type FriendLinkGroupMap,
} from "@/lib/friend-links-map";
import {
  PAGE_TEMPLATES,
  PAGE_TEMPLATE_KINDS,
  buildContentEntry,
  inferPageTemplate,
  normalizeContentPath,
  uniqueContentName,
  type PageTemplateKind,
} from "@/lib/page-templates";
import {
  normalizeSourceFiles,
  serializeSourceFiles,
  type SourceFileEntry,
} from "@/lib/source-files";

type ContentPagesEditorProps = {
  content: any[];
  onChange: (next: any[]) => void;
};

type EditorState = {
  index: number | null;
  label: string;
  name: string;
  template: PageTemplateKind | "custom";
  sourceKind: PageTemplateKind | "custom";
  path: string;
  entryTemplate: string;
  files: SourceFileEntry[];
  icon: RepoNavIconKind;
  iconColor: string;
  fieldMap: FriendLinkFieldMap;
  groupMap: FriendLinkGroupMap;
  groupFormat: string;
  linkFormat: string;
};

type PickerTarget = "path" | "files";

const resolveEntryIcon = (entry?: Record<string, any> | null): RepoNavIconKind => {
  if (isRepoNavIconKind(entry?.icon)) return entry.icon;
  return resolveRepoNavIconKind({
    name: entry?.name,
    label: entry?.label,
    type: entry?.type,
  });
};

const emptyEditor = (): EditorState => ({
  index: null,
  label: "",
  name: "",
  template: "article",
  sourceKind: "article",
  path: "",
  entryTemplate: "",
  files: [],
  icon: "file",
  iconColor: "",
  fieldMap: {},
  groupMap: {},
  groupFormat: "",
  linkFormat: "",
});

const supportsEntryTemplate = (
  template: PageTemplateKind | "custom",
  sourceKind?: PageTemplateKind | "custom",
) =>
  template === "article" ||
  template === "source-folder" ||
  (template === "custom" &&
    (sourceKind === "article" || sourceKind === "source-folder"));

const applyEntryTemplateField = (
  entry: Record<string, any>,
  template: PageTemplateKind | "custom",
  entryTemplate: string,
  sourceKind?: PageTemplateKind | "custom",
) => {
  const next = { ...entry };
  if (!supportsEntryTemplate(template, sourceKind)) {
    delete next.entryTemplate;
    return next;
  }
  if (entryTemplate.trim()) next.entryTemplate = entryTemplate;
  else delete next.entryTemplate;
  return next;
};

const withPageIcon = (
  entry: Record<string, any>,
  icon: RepoNavIconKind,
  iconColor: string,
) => {
  const next: Record<string, any> = { ...entry, icon };
  const color = iconColor.trim();
  if (color) next.iconColor = color;
  else delete next.iconColor;
  return next;
};

const readLinkField = (entry: Record<string, any> | null | undefined) => {
  if (!entry || !Array.isArray(entry.fields)) return null;
  return entry.fields.find((field: any) => field?.type === "friend-links") ?? null;
};

const readFieldMap = (entry: Record<string, any> | null | undefined): FriendLinkFieldMap => {
  if (!entry) return {};
  if (entry.fieldMap && typeof entry.fieldMap === "object") {
    return normalizeFieldMap(entry.fieldMap);
  }
  const linkField = readLinkField(entry);
  if (linkField?.options?.fieldMap) {
    return normalizeFieldMap(linkField.options.fieldMap);
  }
  return {};
};

const readGroupMap = (entry: Record<string, any> | null | undefined): FriendLinkGroupMap => {
  if (!entry) return {};
  if (entry.groupMap && typeof entry.groupMap === "object") {
    return normalizeGroupMap(entry.groupMap);
  }
  const linkField = readLinkField(entry);
  if (linkField?.options?.groupMap) {
    return normalizeGroupMap(linkField.options.groupMap);
  }
  return {};
};

const isFriendLinksTemplate = (
  template: PageTemplateKind | "custom",
  sourceKind: PageTemplateKind | "custom",
) => template === "friend-links" || (template === "custom" && sourceKind === "friend-links");

const ContentPagesEditor = ({ content, onChange }: ContentPagesEditorProps) => {
  const { config } = useConfig();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>("path");
  const [inferring, setInferring] = useState(false);

  const openPicker = (target: PickerTarget) => {
    setPickerTarget(target);
    setPickerOpen(true);
  };

  const inferMapsFromFile = async (filePath: string) => {
    const trimmed = normalizeContentPath(filePath);
    if (!trimmed || !config) {
      return {
        fieldMap: {} as FriendLinkFieldMap,
        groupMap: {} as FriendLinkGroupMap,
        groupFormat: "",
        linkFormat: "",
      };
    }
    setInferring(true);
    try {
      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/browse?path=${encodeURIComponent(trimmed)}&infer=friend-links`,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "无法读取文件以识别格式");
      }
      return {
        fieldMap: normalizeFieldMap(body?.data?.fieldMap ?? {}),
        groupMap: normalizeGroupMap(body?.data?.groupMap ?? {}),
        groupFormat:
          typeof body?.data?.formatSamples?.group === "string"
            ? body.data.formatSamples.group
            : "",
        linkFormat:
          typeof body?.data?.formatSamples?.link === "string"
            ? body.data.formatSamples.link
            : "",
      };
    } finally {
      setInferring(false);
    }
  };

  const applyInferredFromFile = async (filePath: string) => {
    const trimmed = normalizeContentPath(filePath);
    if (!trimmed) return;
    try {
      const inferred = await inferMapsFromFile(trimmed);
      const fieldCount = Object.keys(inferred.fieldMap).length;
      const groupCount = Object.keys(inferred.groupMap).length;
      setEditor((prev) =>
        prev
          ? {
              ...prev,
              path: trimmed,
              fieldMap: inferred.fieldMap,
              groupMap: inferred.groupMap,
              groupFormat: inferred.groupFormat || prev.groupFormat,
              linkFormat: inferred.linkFormat || prev.linkFormat,
            }
          : prev,
      );
      if (fieldCount === 0 && groupCount === 0) {
        toast.message("未从文件识别到格式，请粘贴分组/友链样例或手动填写");
      } else {
        toast.success(
          `已识别分组 ${groupCount} 项、友链 ${fieldCount} 项，并填入格式样例`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "格式识别失败");
    }
  };

  const applyPastedFormats = () => {
    if (!editor) return;
    const { fieldMap, groupMap } = applyFormatSamples(
      editor.groupFormat,
      editor.linkFormat,
    );
    const fieldCount = Object.keys(fieldMap).length;
    const groupCount = Object.keys(groupMap).length;
    if (fieldCount === 0 && groupCount === 0) {
      toast.message("未能从粘贴内容解析出键名，请检查 YAML 格式");
      return;
    }
    setEditor({
      ...editor,
      fieldMap: fieldCount > 0 ? fieldMap : editor.fieldMap,
      groupMap: groupCount > 0 ? groupMap : editor.groupMap,
    });
    toast.success(`已从样例应用：分组 ${groupCount} 项、友链 ${fieldCount} 项`);
  };

  const openCreate = () => setEditor(emptyEditor());

  const openEdit = (index: number) => {
    const entry = content[index];
    const inferred = inferPageTemplate(entry);
    const files = normalizeSourceFiles(entry?.files);
    setEditor({
      index,
      label: entry?.label || entry?.name || "",
      name: entry?.name || "",
      template: inferred,
      sourceKind: inferred,
      path: entry?.path || "",
      entryTemplate:
        typeof entry?.entryTemplate === "string" ? entry.entryTemplate : "",
      files,
      icon: resolveEntryIcon(entry),
      iconColor:
        typeof entry?.iconColor === "string" ? entry.iconColor : "",
      fieldMap: readFieldMap(entry),
      groupMap: readGroupMap(entry),
      groupFormat: typeof entry?.groupFormat === "string" ? entry.groupFormat : "",
      linkFormat: typeof entry?.linkFormat === "string" ? entry.linkFormat : "",
    });
  };

  const canSave = () => {
    if (!editor) return false;
    if (!editor.label.trim()) return false;
    if (editor.template === "source-files") return editor.files.length > 0;
    if (editor.template === "custom" && editor.sourceKind === "source-files") {
      return editor.files.length > 0;
    }
    return Boolean(editor.path.trim());
  };

  const handleSaveEntry = () => {
    if (!editor || !canSave()) return;
    const label = editor.label.trim();
    const path = editor.path.trim();
    const fieldMap = normalizeFieldMap(editor.fieldMap);
    const groupMap = normalizeGroupMap(editor.groupMap);
    const groupFormat = editor.groupFormat;
    const linkFormat = editor.linkFormat;
    const friendLinksDraft = {
      fieldMap,
      groupMap,
      groupFormat,
      linkFormat,
    };

    const others = content
      .filter((_, index) => index !== editor.index)
      .map((entry) => (typeof entry?.name === "string" ? entry.name : ""))
      .filter(Boolean);
    const keepExisting =
      editor.index != null &&
      (editor.template === "custom" || editor.template === editor.sourceKind);
    const current = editor.index != null ? content[editor.index] : null;

    let nextEntry: Record<string, any>;
    if (keepExisting && current && editor.template === "custom") {
      nextEntry = {
        ...current,
        name: uniqueContentName(
          label,
          others,
          editor.name || current.name,
          current.template === "friend-links" ? "friends" : "page",
        ),
        label,
        path:
          current.template === "source-files" ||
          inferPageTemplate(current) === "source-files"
            ? ""
            : path,
        ...(Array.isArray(current.files) || editor.files.length > 0
          ? { files: serializeSourceFiles(editor.files) }
          : {}),
        ...(isFriendLinksTemplate(editor.template, editor.sourceKind)
          ? {
              ...friendLinksDraft,
              fields: Array.isArray(current.fields)
                ? current.fields.map((field: any) =>
                    field?.type === "friend-links"
                      ? {
                          ...field,
                          options: {
                            ...(field.options ?? {}),
                            fieldMap,
                            groupMap,
                          },
                        }
                      : field,
                  )
                : current.fields,
            }
          : {}),
      };
    } else if (keepExisting && current && editor.template === "source-files") {
      nextEntry = buildContentEntry(
        {
          name: editor.name || current.name,
          label,
          template: "source-files",
          path: "",
          files: editor.files,
        },
        others,
      );
    } else if (keepExisting && current && editor.template === "friend-links") {
      nextEntry = buildContentEntry(
        {
          name: editor.name || current.name,
          label,
          template: "friend-links",
          path,
          ...friendLinksDraft,
        },
        others,
      );
    } else if (keepExisting && current) {
      nextEntry = {
        ...current,
        name: uniqueContentName(
          label,
          others,
          editor.name || current.name,
          editor.template === "friend-links" ? "friends" : "page",
        ),
        label,
        path,
      };
    } else {
      const template =
        editor.template === "custom" ? "article" : editor.template;
      nextEntry = buildContentEntry(
        {
          name: editor.name,
          label,
          template,
          path: template === "source-files" ? "" : path,
          entryTemplate: editor.entryTemplate,
          files: template === "source-files" ? editor.files : undefined,
          ...(template === "friend-links" ? friendLinksDraft : {}),
        },
        others,
      );
    }

    nextEntry = withPageIcon(nextEntry, editor.icon, editor.iconColor);
    nextEntry = applyEntryTemplateField(
      nextEntry,
      editor.template,
      editor.entryTemplate,
      editor.sourceKind,
    );

    if (editor.index == null) {
      onChange([...content, nextEntry]);
    } else {
      const next = content.slice();
      next[editor.index] = nextEntry;
      onChange(next);
    }
    setEditor(null);
  };

  const handleDelete = (index: number) => {
    onChange(content.filter((_, itemIndex) => itemIndex !== index));
  };

  const pickerMode =
    !editor
      ? "folder"
      : editor.template === "source-files" ||
          (editor.template === "custom" &&
            editor.index != null &&
            inferPageTemplate(content[editor.index]) === "source-files")
        ? "files"
        : editor.template === "source-file" ||
            editor.template === "friend-links" ||
            (editor.template === "custom" &&
              editor.index != null &&
              content[editor.index]?.type === "file")
          ? "file"
          : "folder";

  const showFriendLinkMap =
    editor != null && isFriendLinksTemplate(editor.template, editor.sourceKind);
  const showEntryTemplate =
    editor != null &&
    supportsEntryTemplate(editor.template, editor.sourceKind);

  return (
    <section className="menu-settings__section">
      <div className="menu-settings__section-head">
        <div className="menu-settings__section-title">内容页面</div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          添加页面
        </Button>
      </div>

      {content.length === 0 ? (
        <div className="menu-settings__empty">
          当前项目还没有页面模版。请先添加至少一个页面（文章 / 源文件 / 友链等），保存后才能使用侧栏内容。
        </div>
      ) : (
        <div className="menu-settings__list">
          {content.map((entry, index) => {
            return (
              <div key={entry.name || index} className="menu-settings__page-row">
                <div className="menu-settings__page-main">
                  <RepoNavIcon
                    kind={resolveEntryIcon(entry)}
                    iconColor={
                      typeof entry.iconColor === "string"
                        ? entry.iconColor
                        : undefined
                    }
                  />
                  <div className="menu-settings__label-wrap">
                    <div className="menu-settings__label">
                      {entry.label || entry.name}
                    </div>
                  </div>
                </div>
                <div className="menu-settings__controls">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`更多操作：${entry.label || entry.name || "页面"}`}
                      >
                        <EllipsisVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(index)}>
                        <Pencil className="size-4" />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => handleDelete(index)}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editor?.index == null ? "添加内容页面" : "编辑内容页面"}
            </DialogTitle>
          </DialogHeader>

          {editor ? (
            <div className="grid max-h-[70vh] gap-3 overflow-auto pr-1">
              <div className="menu-settings__fields-row">
                <div className="menu-settings__icon-field">
                  <Label>侧栏图标</Label>
                  <div className="menu-settings__icon-row">
                    <Select
                      value={editor.icon}
                      onValueChange={(value) =>
                        setEditor({
                          ...editor,
                          icon: value as RepoNavIconKind,
                        })
                      }
                    >
                      <SelectTrigger
                        className="menu-settings__icon-select"
                        aria-label={`图标：${REPO_NAV_ICON_LABELS[editor.icon] ?? editor.icon}`}
                      >
                        <SelectValue>
                          <RepoNavIcon
                            kind={editor.icon}
                            iconColor={editor.iconColor || undefined}
                          />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        align="end"
                        className="menu-settings__icon-menu"
                      >
                        {REPO_NAV_ICON_KINDS.map((kind) => (
                          <SelectItem
                            key={kind}
                            value={kind}
                            className="menu-settings__icon-option"
                            aria-label={REPO_NAV_ICON_LABELS[kind] ?? kind}
                            textValue={REPO_NAV_ICON_LABELS[kind] ?? kind}
                          >
                            <RepoNavIcon kind={kind} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <MenuSettingsColorSwatch
                      value={editor.iconColor}
                      onCommit={(iconColor) =>
                        setEditor((prev) =>
                          prev ? { ...prev, iconColor } : prev,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="menu-settings__inline-field">
                  <Label>页面模版</Label>
                  <Select
                    value={editor.template}
                    onValueChange={(value) => {
                      const template = value as PageTemplateKind | "custom";
                      const keepFriendMaps =
                        template === "friend-links" ||
                        (template === "custom" &&
                          editor.sourceKind === "friend-links");
                      setEditor({
                        ...editor,
                        template,
                        path: template === "source-files" ? "" : editor.path,
                        entryTemplate: supportsEntryTemplate(
                          template,
                          editor.sourceKind,
                        )
                          ? editor.entryTemplate
                          : "",
                        icon:
                          template === "friend-links" && editor.icon === "file"
                            ? "links"
                            : editor.icon,
                        fieldMap: keepFriendMaps ? editor.fieldMap : {},
                        groupMap: keepFriendMaps ? editor.groupMap : {},
                      });
                    }}
                  >
                    <SelectTrigger className="menu-settings__inline-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {editor.sourceKind === "custom" ? (
                        <SelectItem value="custom">
                          自定义（保留现有字段）
                        </SelectItem>
                      ) : null}
                      {PAGE_TEMPLATE_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {PAGE_TEMPLATES[kind].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="page-label">显示名称</Label>
                <Input
                  id="page-label"
                  value={editor.label}
                  onChange={(event) => {
                    const label = event.target.value;
                    const shouldGuessIcon =
                      editor.index == null &&
                      editor.icon ===
                        resolveRepoNavIconKind({
                          name: editor.name,
                          label: editor.label,
                          type:
                            editor.template === "source-file" ||
                            editor.template === "friend-links"
                              ? "file"
                              : "collection",
                        });
                    setEditor({
                      ...editor,
                      label,
                      icon: shouldGuessIcon
                        ? resolveRepoNavIconKind({
                            name: editor.name,
                            label,
                            type:
                              editor.template === "source-file" ||
                              editor.template === "friend-links"
                                ? "file"
                                : "collection",
                          })
                        : editor.icon,
                    });
                  }}
                  placeholder="例如：友链、文章、配置"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="page-path">
                  {editor.template === "source-files" ||
                  (editor.template === "custom" &&
                    editor.sourceKind === "source-files")
                    ? "文件列表"
                    : editor.template !== "custom" &&
                        PAGE_TEMPLATES[editor.template].pathKind === "file"
                      ? "数据文件"
                      : "路径"}
                </Label>
                {editor.template === "source-files" ||
                (editor.template === "custom" &&
                  editor.sourceKind === "source-files") ? (
                  <div className="grid gap-2">
                    <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-2">
                      {editor.files.length === 0 ? (
                        <div className="px-1 py-1.5 text-xs text-muted-foreground">
                          尚未选择文件
                        </div>
                      ) : (
                        editor.files.map((file, fileIndex) => (
                          <div
                            key={file.path}
                            className="grid gap-1.5 rounded-md bg-muted/40 px-2 py-2"
                          >
                            <div
                              className="truncate text-xs text-muted-foreground"
                              title={file.path}
                            >
                              {file.path}
                            </div>
                            <Input
                              value={file.label ?? ""}
                              placeholder="显示别名（可选，如「关于」）"
                              className="h-8 text-sm"
                              onChange={(event) => {
                                const label = event.target.value;
                                setEditor({
                                  ...editor,
                                  files: editor.files.map((item, index) =>
                                    index === fileIndex
                                      ? { ...item, label }
                                      : item,
                                  ),
                                });
                              }}
                            />
                          </div>
                        ))
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openPicker("files")}
                    >
                      浏览并多选文件
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id="page-path"
                      value={editor.path}
                      onChange={(event) =>
                        setEditor({ ...editor, path: event.target.value })
                      }
                      placeholder={
                        showFriendLinkMap
                          ? "例如 data/link.yml / source/_data/links.json"
                          : editor.template !== "custom" &&
                              PAGE_TEMPLATES[editor.template].pathKind === "file"
                            ? "例如 config.toml"
                            : "例如 content/posts"
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openPicker("path")}
                    >
                      浏览
                    </Button>
                  </div>
                )}
              </div>

              {showEntryTemplate ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="page-entry-template">新建条目模板</Label>
                  <p className="text-xs text-muted-foreground">
                    可选。直接填写模板正文，保存到配置后，新建时预填到编辑器。
                  </p>
                  <Textarea
                    id="page-entry-template"
                    value={editor.entryTemplate}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        entryTemplate: event.target.value,
                      })
                    }
                    placeholder={`---\ntitle:\ndate:\n---\n\n`}
                    className="min-h-36 font-mono text-xs"
                  />
                </div>
              ) : null}

              {showFriendLinkMap ? (
                <div className="grid gap-3 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">格式适配</div>
                      <p className="text-xs text-muted-foreground">
                        粘贴一段分组样例和一条友链样例；选择文件时也会尝试自动识别一次。
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!editor.path.trim() || inferring}
                        onClick={() =>
                          void applyInferredFromFile(editor.path.trim())
                        }
                      >
                        {inferring ? "识别中…" : "从文件识别"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={applyPastedFormats}
                      >
                        应用样例
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="friend-group-format">分组格式</Label>
                    <Textarea
                      id="friend-group-format"
                      value={editor.groupFormat}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          groupFormat: event.target.value,
                        })
                      }
                      placeholder={`YAML 例：\n- class_name: 推荐站点\n  class_desc: 说明\n  link_list:\n\n或 JS 模块：\napi: ''\ndata:`}
                      className="min-h-24 font-mono text-xs"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="friend-link-format">友链格式</Label>
                    <Textarea
                      id="friend-link-format"
                      value={editor.linkFormat}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          linkFormat: event.target.value,
                        })
                      }
                      placeholder={`- name: Hexo\n  link: https://hexo.io/\n  avatar: https://...\n  descr: 简介`}
                      className="min-h-28 font-mono text-xs"
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      分组字段映射
                    </div>
                    {FRIEND_LINK_GROUP_DEFS.map((def) => (
                      <div
                        key={def.key}
                        className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2"
                      >
                        <Label
                          htmlFor={`friend-group-map-${def.key}`}
                          className="text-xs text-muted-foreground"
                        >
                          {def.label}
                        </Label>
                        <Input
                          id={`friend-group-map-${def.key}`}
                          value={editor.groupMap[def.key] ?? ""}
                          placeholder={def.placeholder}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              groupMap: {
                                ...editor.groupMap,
                                [def.key]: event.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      友链字段映射
                    </div>
                    {FRIEND_LINK_FIELD_DEFS.map((def) => (
                      <div
                        key={def.key}
                        className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2"
                      >
                        <Label
                          htmlFor={`friend-map-${def.key}`}
                          className="text-xs text-muted-foreground"
                        >
                          {def.label}
                        </Label>
                        <Input
                          id={`friend-map-${def.key}`}
                          value={editor.fieldMap[def.key] ?? ""}
                          placeholder={def.placeholder}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              fieldMap: {
                                ...editor.fieldMap,
                                [def.key]: event.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>
              取消
            </Button>
            <Button type="button" disabled={!canSave()} onClick={handleSaveEntry}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editor ? (
        <PagePathPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          mode={pickerMode}
          value={editor.path}
          values={editor.files.map((file) => file.path)}
          onSelect={(path) => {
            if (
              editor &&
              isFriendLinksTemplate(editor.template, editor.sourceKind)
            ) {
              setEditor({ ...editor, path });
              void applyInferredFromFile(path);
              return;
            }
            setEditor({ ...editor!, path });
          }}
          onSelectMany={(paths) => {
            const previousLabels = new Map(
              editor.files.map((file) => [
                file.path,
                file.label?.trim() || "",
              ]),
            );
            setEditor({
              ...editor!,
              files: paths.map((path) => {
                const label = previousLabels.get(path) || "";
                return label ? { path, label } : { path };
              }),
              path: "",
            });
          }}
        />
      ) : null}
    </section>
  );
};

export { ContentPagesEditor };
