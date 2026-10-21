import type { Field } from "@/types/field";
import { normalizePath } from "@/lib/utils/file";

const WEEKLY_CATEGORY = "周刊";

const BLOG_BODY_FIELD = "body";
const BLOG_LINK_GROUPS_FIELD = "linkGroups";

/** Portal target for Source/Preview toggle in blog body header. */
const BLOG_BODY_SWITCHER_SLOT_ID = "blog-body-editor-switcher";

/** Portal target for friend-links toolbar (sort / edit source). */
const BLOG_LINKS_TOOLBAR_SLOT_ID = "blog-links-toolbar-slot";

/** Fields hidden from the blog editor form (not shown in cfBlog either). */
const BLOG_EXCLUDED_FIELDS = new Set(["draft", "aliases"]);

/** Boolean switches shown in props (cfBlog-style). */
const BLOG_META_SWITCHES = ["pinned", "math"] as const;

/** Footer check fields (cfBlog .editor-footer). */
const BLOG_FOOTER_FIELDS = ["comment", "shuffleGroups"] as const;

/**
 * Primary props — exact order as hugo-cfBlog post editor
 * (Slug / 路径 are injected as slots, not schema fields).
 */
const BLOG_META_ROWS: Array<Array<"title" | "date" | "cover" | "description" | "categories" | "tags" | "slug" | "path">> = [
  ["title", "slug"],
  ["path", "date"],
  ["cover", "description"],
  ["categories", "tags"],
];

const BLOG_META_AI = "ai";

/** Shown in props when category is 周刊 (cfBlog post editor). */
const BLOG_META_WEEKLY = ["issue"] as const;

/** Extra CMS-only fields, shown under a secondary "更多" fold. */
const BLOG_META_EXTRA = [
  "layout",
  "tocStartLevel",
  "tocEndLevel",
  "lastmod",
] as const;

/** Display labels matching cfBlog nicknames. */
const BLOG_FIELD_LABELS: Record<string, string> = {
  title: "标题",
  slug: "Slug",
  path: "路径",
  date: "日期",
  cover: "头图",
  description: "描述",
  categories: "分类",
  tags: "标签",
  ai: "AI摘要",
  layout: "布局",
  lastmod: "更新",
  aliases: "别名",
  tocStartLevel: "目录开始",
  tocEndLevel: "目录结束",
  issue: "期号",
  pinned: "置顶",
  math: "公式渲染",
  galleryPost: "画廊模式",
  comment: "开启评论",
  shuffleGroups: "分组随机",
  summary: "摘要",
  linkGroups: "友链",
};

type SplitBlogFields = {
  byName: Map<string, Field>;
  metaAi?: Field;
  metaWeekly: Field[];
  metaSwitches: Field[];
  metaExtra: Field[];
  metaRest: Field[];
  body?: Field;
  linkGroups?: Field;
  footer: Field[];
};

const normalizeCategoryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item == null) continue;
      const text = String(item).trim();
      if (text) return text;
    }
    return "";
  }
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
};

const isWeeklyPostContext = (
  categories: unknown,
  entryPath?: string,
) => {
  if (normalizeCategoryValue(categories) === WEEKLY_CATEGORY) return true;
  if (!entryPath) return false;
  return /(^|\/)posts\/weekly(\/|$)/.test(normalizePath(entryPath));
};

const splitBlogFields = (fields: Field[]): SplitBlogFields => {
  const visible = fields.filter(
    (field) => field && !field.hidden && !BLOG_EXCLUDED_FIELDS.has(field.name),
  );
  const byName = new Map(visible.map((field) => [field.name, field]));

  const body = byName.get(BLOG_BODY_FIELD);
  const linkGroups = byName.get(BLOG_LINK_GROUPS_FIELD);
  const footer: Field[] = [];
  const used = new Set<string>();

  if (body) used.add(BLOG_BODY_FIELD);
  if (linkGroups) used.add(BLOG_LINK_GROUPS_FIELD);

  for (const name of BLOG_FOOTER_FIELDS) {
    const field = byName.get(name);
    if (field) {
      footer.push(field);
      used.add(name);
    }
  }

  used.add("title");
  used.add("date");
  used.add("cover");
  used.add("description");
  used.add("categories");
  used.add("tags");

  const metaAi = byName.get(BLOG_META_AI);
  if (metaAi) used.add(BLOG_META_AI);

  const metaSwitches: Field[] = [];
  for (const name of BLOG_META_SWITCHES) {
    const field = byName.get(name);
    if (field) {
      metaSwitches.push(field);
      used.add(name);
    }
  }

  const metaExtra: Field[] = [];
  for (const name of BLOG_META_EXTRA) {
    const field = byName.get(name);
    if (field) {
      metaExtra.push(field);
      used.add(name);
    }
  }

  const metaWeekly: Field[] = [];
  for (const name of BLOG_META_WEEKLY) {
    const field = byName.get(name);
    if (field) {
      metaWeekly.push(field);
      used.add(name);
    }
  }

  const metaRest = visible.filter((field) => !used.has(field.name));

  return {
    byName,
    metaAi,
    metaWeekly,
    metaSwitches,
    metaExtra,
    metaRest,
    body,
    linkGroups,
    footer,
  };
};

/** Content schemas that use the cfBlog-style editor chrome. */
const BLOG_EDIT_LAYOUT_NAMES = new Set([
  "posts",
  "excalidraw",
  "gallery",
  "moments",
  "about",
  "links",
  "memories",
]);

const usesBlogEditLayout = (
  collectionName?: string,
  schema?: { template?: string } | null,
) => {
  if (schema?.template === "article" || schema?.template === "friend-links") {
    return true;
  }
  if (
    schema?.template === "source-file" ||
    schema?.template === "source-folder" ||
    schema?.template === "source-files"
  ) {
    return false;
  }
  return Boolean(collectionName && BLOG_EDIT_LAYOUT_NAMES.has(collectionName));
};

const withBlogInline = (field: Field, label?: string): Field => ({
  ...field,
  ...(label ? { label } : {}),
  options: {
    ...(field.options ?? {}),
    blogInline: true,
  },
});

const blogFieldLabel = (name: string, fallback?: string | false) =>
  BLOG_FIELD_LABELS[name] ?? (fallback === false ? name : fallback || name);

export {
  BLOG_BODY_FIELD,
  BLOG_BODY_SWITCHER_SLOT_ID,
  BLOG_FIELD_LABELS,
  BLOG_LINK_GROUPS_FIELD,
  BLOG_LINKS_TOOLBAR_SLOT_ID,
  BLOG_META_ROWS,
  BLOG_META_WEEKLY,
  WEEKLY_CATEGORY,
  splitBlogFields,
  usesBlogEditLayout,
  withBlogInline,
  blogFieldLabel,
  isWeeklyPostContext,
  normalizeCategoryValue,
};
export type { SplitBlogFields };
