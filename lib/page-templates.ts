import slugify from "slugify";
import {
  extensionToFriendLinksFormat,
  normalizeFieldMap,
  normalizeGroupMap,
  type FriendLinkFieldMap,
  type FriendLinkGroupMap,
} from "@/lib/friend-links-map";
import {
  normalizeSourceFiles,
  serializeSourceFiles,
} from "@/lib/source-files";

const PAGE_TEMPLATE_KINDS = [
  "article",
  "source-file",
  "source-folder",
  "source-files",
  "friend-links",
] as const;

type PageTemplateKind = (typeof PAGE_TEMPLATE_KINDS)[number];

type PageTemplateMeta = {
  kind: PageTemplateKind;
  label: string;
  description: string;
  pathKind: "folder" | "file" | "files";
};

const PAGE_TEMPLATES: Record<PageTemplateKind, PageTemplateMeta> = {
  article: {
    kind: "article",
    label: "文章模版",
    description: "文件夹 + 文件列表；属性区编辑 frontmatter 原文，正文单独编辑。",
    pathKind: "folder",
  },
  "source-file": {
    kind: "source-file",
    label: "源文件样式",
    description: "指向单个文件，页面直接编辑源码。",
    pathKind: "file",
  },
  "source-folder": {
    kind: "source-folder",
    label: "源文件文件夹样式",
    description: "和文章页一样浏览文件夹，点开后编辑源文件。",
    pathKind: "folder",
  },
  "source-files": {
    kind: "source-files",
    label: "多源文件列表",
    description: "自选多个文件，同一页列表展示（同文章列表），点开后编辑源码。",
    pathKind: "files",
  },
  "friend-links": {
    kind: "friend-links",
    label: "友链模版",
    description:
      "选择友链数据文件；可粘贴分组/友链格式样例以适配不同主题结构。",
    pathKind: "file",
  },
};

const ARTICLE_FIELDS = [
  { name: "title", label: "标题", type: "string" },
  {
    name: "date",
    label: "日期",
    type: "date",
    options: {
      time: true,
      format: "yyyy-MM-dd'T'HH:mm:ss",
      emptyDefault: true,
    },
  },
  { name: "cover", label: "头图", type: "string" },
  { name: "description", label: "描述", type: "string" },
  { name: "categories", label: "分类", type: "string" },
  { name: "tags", label: "标签", type: "string", list: true },
  { name: "body", label: "正文", type: "rich-text" },
];

type ContentPageDraft = {
  name?: string;
  label: string;
  template: PageTemplateKind;
  path: string;
  /** Scaffold text applied when creating a new entry (stored in CMS config). */
  entryTemplate?: string;
  files?: Array<string | { path: string; label?: string }>;
  fieldMap?: FriendLinkFieldMap;
  groupMap?: FriendLinkGroupMap;
  groupFormat?: string;
  linkFormat?: string;
};

const normalizeContentPath = (value: string) =>
  value.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");

const resolveEntryTemplate = (value?: string) => {
  if (typeof value !== "string") return undefined;
  // Keep authored content; whitespace-only means unset.
  return value.trim() ? value : undefined;
};

const TEMPLATE_NAME_FALLBACKS: Record<PageTemplateKind, string> = {
  article: "posts",
  "source-file": "source-file",
  "source-folder": "source-folder",
  "source-files": "source-files",
  "friend-links": "friends",
};

const uniqueContentName = (
  label: string,
  existing: string[],
  preferred?: string,
  fallback = "page",
) => {
  const base =
    (preferred && /^[a-zA-Z0-9-_]+$/.test(preferred) ? preferred : "") ||
    slugify(label, { lower: true, strict: true }) ||
    fallback;
  if (!existing.includes(base)) return base;
  let index = 2;
  while (existing.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
};

const buildContentEntry = (
  draft: ContentPageDraft,
  existingNames: string[] = [],
) => {
  const path = normalizeContentPath(draft.path);
  const name = uniqueContentName(
    draft.label,
    existingNames,
    draft.name,
    TEMPLATE_NAME_FALLBACKS[draft.template] ?? "page",
  );
  const label = draft.label.trim() || name;

  if (draft.template === "source-file") {
    return {
      name,
      label,
      template: "source-file" as const,
      type: "file" as const,
      path,
    };
  }

  if (draft.template === "source-folder") {
    const entryTemplate = resolveEntryTemplate(draft.entryTemplate);
    return {
      name,
      label,
      template: "source-folder" as const,
      type: "collection" as const,
      path,
      ...(entryTemplate ? { entryTemplate } : {}),
      filename: "{primary}",
      extension: "",
      subfolders: true,
      view: {
        foldersFirst: true,
        primary: "name",
        fields: ["name"],
        pageSize: 12,
        default: { sort: "name", order: "asc" as const },
      },
    };
  }

  if (draft.template === "source-files") {
    const files = serializeSourceFiles(normalizeSourceFiles(draft.files));
    return {
      name,
      label,
      template: "source-files" as const,
      type: "collection" as const,
      // Repo root so any selected file path stays in scope.
      path: "",
      files,
      filename: "{primary}",
      extension: "",
      subfolders: false,
      // Delete removes the git file and prunes CMS files[]; rename is unsupported.
      operations: { create: false, rename: false, delete: true },
      view: {
        foldersFirst: false,
        primary: "name",
        fields: ["name", "path"],
        pageSize: 24,
        // Preserve authoring order from schema.files (no default sort).
        default: { order: "asc" as const },
      },
    };
  }

  if (draft.template === "friend-links") {
    const fieldMap = normalizeFieldMap(draft.fieldMap ?? {});
    const groupMap = normalizeGroupMap(draft.groupMap ?? {});
    const groupFormat =
      typeof draft.groupFormat === "string" ? draft.groupFormat : "";
    const linkFormat =
      typeof draft.linkFormat === "string" ? draft.linkFormat : "";
    const { extension, format } = extensionToFriendLinksFormat(path);
    return {
      name,
      label,
      template: "friend-links" as const,
      type: "file" as const,
      path,
      extension,
      format,
      fieldMap,
      groupMap,
      groupFormat,
      linkFormat,
      fields: [
        {
          name: "linkGroups",
          label: "友链",
          type: "friend-links",
          options: { fieldMap, groupMap },
        },
      ],
    };
  }

  const entryTemplate = resolveEntryTemplate(draft.entryTemplate);
  return {
    name,
    label,
    template: "article" as const,
    type: "collection" as const,
    path,
    ...(entryTemplate ? { entryTemplate } : {}),
    format: "yaml-frontmatter",
    filename: "{year}-{month}-{day}-{primary}.md",
    extension: "md",
    subfolders: true,
    exclude: ["_index.md"],
    view: {
      foldersFirst: true,
      fields: ["title", "date"],
      primary: "title",
      sort: ["date", "title"],
      pageSize: 12,
      default: { sort: "date", order: "desc" as const },
    },
    fields: ARTICLE_FIELDS,
  };
};

const inferPageTemplate = (entry: Record<string, any> | null | undefined): PageTemplateKind | "custom" => {
  if (!entry || typeof entry !== "object") return "custom";
  if (PAGE_TEMPLATE_KINDS.includes(entry.template)) return entry.template;
  const hasFields = Array.isArray(entry.fields) && entry.fields.length > 0;
  if (
    entry.type === "file" &&
    Array.isArray(entry.fields) &&
    entry.fields.some((field: any) => field?.type === "friend-links")
  ) {
    return "friend-links";
  }
  if (entry.type === "file" && !hasFields) return "source-file";
  if (
    entry.type === "collection" &&
    !hasFields &&
    Array.isArray(entry.files) &&
    normalizeSourceFiles(entry.files).length > 0
  ) {
    return "source-files";
  }
  if (entry.type === "collection" && !hasFields) return "source-folder";
  if (entry.type === "collection" && hasFields) return "article";
  return "custom";
};

const isPagesManaged = (settings?: Record<string, any> | null) =>
  settings?.pagesManaged === true;

const hasConfiguredContentPages = (configObject?: Record<string, any> | null) =>
  configObject?.settings?.templatesConfigured === true &&
  isPagesManaged(configObject?.settings) &&
  flattenContentLeaves(configObject?.content).length > 0;

const flattenContentLeaves = (entries: any[] | undefined): any[] => {
  if (!Array.isArray(entries)) return [];
  const leaves: any[] = [];
  entries.forEach((entry) => {
    if (entry?.type === "group" && Array.isArray(entry.items)) {
      leaves.push(...flattenContentLeaves(entry.items));
      return;
    }
    if (entry?.name) leaves.push(entry);
  });
  return leaves;
};

/**
 * Merge an ordered flat leaf list back into a content tree, preserving groups.
 * Match by name first. A single unmatched tree slot + single unmatched leaf is
 * treated as a rename (keeps group placement). Otherwise empty slots are dropped
 * and unmatched leaves append at root (avoids delete+add stealing a group seat).
 */
const applyContentLeavesToTree = (
  tree: any[] | undefined,
  leaves: any[],
): any[] => {
  const leafByName = new Map<string, any>();
  for (const leaf of leaves) {
    if (leaf?.name) leafByName.set(String(leaf.name), leaf);
  }
  const usedNames = new Set<string>();

  type Slot =
    | { kind: "group"; node: any; children: Slot[] }
    | { kind: "leaf"; prevName: string; leaf: any | null };

  const buildSlots = (nodes: any[] | undefined): Slot[] => {
    if (!Array.isArray(nodes)) return [];
    const slots: Slot[] = [];
    for (const node of nodes) {
      if (node?.type === "group" && Array.isArray(node.items)) {
        slots.push({
          kind: "group",
          node,
          children: buildSlots(node.items),
        });
        continue;
      }
      const prevName = node?.name ? String(node.name) : "";
      if (!prevName) continue;
      if (leafByName.has(prevName)) {
        usedNames.add(prevName);
        slots.push({
          kind: "leaf",
          prevName,
          leaf: leafByName.get(prevName),
        });
      } else {
        slots.push({ kind: "leaf", prevName, leaf: null });
      }
    }
    return slots;
  };

  const countEmptySlots = (slots: Slot[]): number =>
    slots.reduce((count, slot) => {
      if (slot.kind === "group") return count + countEmptySlots(slot.children);
      return count + (slot.leaf ? 0 : 1);
    }, 0);

  const unmatchedLeaves = leaves.filter(
    (leaf) => leaf?.name && !usedNames.has(String(leaf.name)),
  );
  const rootSlots = buildSlots(tree);
  // Only remap as rename when exactly one old name disappeared and one new name appeared.
  const allowRenameRemap =
    countEmptySlots(rootSlots) === 1 && unmatchedLeaves.length === 1;
  let unmatchedIndex = 0;

  const fillSlots = (slots: Slot[]): any[] => {
    const next: any[] = [];
    for (const slot of slots) {
      if (slot.kind === "group") {
        const items = fillSlots(slot.children);
        if (items.length === 0) continue;
        next.push({ ...slot.node, items });
        continue;
      }
      if (slot.leaf) {
        next.push(slot.leaf);
        continue;
      }
      if (!allowRenameRemap) continue;
      const replacement = unmatchedLeaves[unmatchedIndex++];
      if (replacement?.name) {
        usedNames.add(String(replacement.name));
        next.push(replacement);
      }
    }
    return next;
  };

  const merged = fillSlots(rootSlots);
  for (const leaf of unmatchedLeaves) {
    const name = leaf?.name ? String(leaf.name) : "";
    if (!name || usedNames.has(name)) continue;
    usedNames.add(name);
    merged.push(leaf);
  }
  return merged;
};

const templateLabel = (kind: PageTemplateKind | "custom") => {
  if (kind === "custom") return "自定义";
  return PAGE_TEMPLATES[kind].label;
};

export {
  ARTICLE_FIELDS,
  PAGE_TEMPLATES,
  PAGE_TEMPLATE_KINDS,
  applyContentLeavesToTree,
  buildContentEntry,
  flattenContentLeaves,
  hasConfiguredContentPages,
  inferPageTemplate,
  isPagesManaged,
  normalizeContentPath,
  templateLabel,
  uniqueContentName,
};
export type { ContentPageDraft, PageTemplateKind, PageTemplateMeta };
export type { FriendLinkFieldMap };
