import YAML from "yaml";
import { parse as parseSerialized, serialize, stringify as stringifySerialized } from "@/lib/serialization";
import { parseSafeDataLiteral } from "@/lib/security/safe-data-literal";

/** Canonical CMS keys for a single friend link. */
const FRIEND_LINK_CANONICAL_KEYS = [
  "name",
  "url",
  "avatar",
  "desc",
  "siteshot",
  "rss",
  "color",
] as const;

type FriendLinkCanonicalKey = (typeof FRIEND_LINK_CANONICAL_KEYS)[number];

type FriendLinkFieldMap = Partial<Record<FriendLinkCanonicalKey, string>>;

/** Canonical CMS keys for a friend-link group. */
const FRIEND_LINK_GROUP_KEYS = ["name", "desc", "links"] as const;

type FriendLinkGroupCanonicalKey = (typeof FRIEND_LINK_GROUP_KEYS)[number];

type FriendLinkGroupMap = Partial<Record<FriendLinkGroupCanonicalKey, string>>;

/** How the source file is structured (controls denormalize write-back). */
type FriendLinksShape =
  | "linkGroups" // { linkGroups: [{ name, links }] }
  | "groups" // { groups: [{ name, links }] } — common Hugo/data YAML
  | "links" // { links: [...] }
  | "root-array" // [ link, link, ... ]
  | "groups-array"; // [ { ...group }, ... ] — keys from groupMap

/** Root object keys that hold an array of friend-link groups. */
const ROOT_GROUP_ARRAY_KEYS = ["groups", "linkGroups", "friendGroups"] as const;

type FriendLinksFormatSamples = {
  group: string;
  link: string;
};

type FriendLinksInferResult = {
  fieldMap: FriendLinkFieldMap;
  groupMap: FriendLinkGroupMap;
  formatSamples: FriendLinksFormatSamples;
  shape: FriendLinksShape;
};

const FRIEND_LINK_FIELD_DEFS: Array<{
  key: FriendLinkCanonicalKey;
  label: string;
  placeholder: string;
}> = [
  { key: "name", label: "站点名称", placeholder: "name" },
  { key: "url", label: "站点链接", placeholder: "link" },
  { key: "avatar", label: "站点头像", placeholder: "avatar" },
  { key: "desc", label: "站点描述", placeholder: "descr" },
  { key: "siteshot", label: "站点截图", placeholder: "siteshot" },
  { key: "rss", label: "RSS", placeholder: "rss" },
  { key: "color", label: "主题色", placeholder: "color" },
];

const FRIEND_LINK_GROUP_DEFS: Array<{
  key: FriendLinkGroupCanonicalKey;
  label: string;
  placeholder: string;
}> = [
  { key: "name", label: "分组名称", placeholder: "class_name" },
  { key: "desc", label: "分组描述", placeholder: "class_desc" },
  { key: "links", label: "友链列表", placeholder: "link_list / data" },
];

/** Default source keys (common in Hexo / theme data files). */
const DEFAULT_FIELD_MAP: FriendLinkFieldMap = {
  name: "name",
  url: "link",
  avatar: "avatar",
  desc: "descr",
  siteshot: "siteshot",
  rss: "rss",
  color: "color",
};

const DEFAULT_GROUP_MAP: FriendLinkGroupMap = {
  name: "name",
  desc: "desc",
  links: "links",
};

const ALIAS_TO_CANONICAL: Record<string, FriendLinkCanonicalKey> = {
  name: "name",
  blog: "name",
  title: "name",
  site: "name",
  sitename: "name",
  url: "url",
  link: "url",
  href: "url",
  website: "url",
  siteurl: "url",
  siteUrl: "url",
  site_url: "url",
  avatar: "avatar",
  img: "avatar",
  image: "avatar",
  icon: "avatar",
  imgurl: "avatar",
  imgUrl: "avatar",
  img_url: "avatar",
  desc: "desc",
  descr: "desc",
  description: "desc",
  intro: "desc",
  siteshot: "siteshot",
  screenshot: "siteshot",
  shot: "siteshot",
  cover: "siteshot",
  rss: "rss",
  feed: "rss",
  color: "color",
  theme: "color",
  themecolor: "color",
};

const GROUP_ALIAS_TO_CANONICAL: Record<string, FriendLinkGroupCanonicalKey> = {
  name: "name",
  title: "name",
  class_name: "name",
  classname: "name",
  group: "name",
  group_name: "name",
  groupname: "name",
  category: "name",
  desc: "desc",
  description: "desc",
  class_desc: "desc",
  classdesc: "desc",
  group_desc: "desc",
  groupdesc: "desc",
  intro: "desc",
  links: "links",
  link_list: "links",
  linklist: "links",
  items: "links",
  friends: "links",
  friendsdata: "links",
  friendsconfig: "links",
  friendsprojects: "links",
  list: "links",
  data: "links",
};

const FALLBACK_LINK_ARRAY_KEYS = [
  "friendsConfig",
  "friendsProjects",
  "friendsData",
  "friendLinks",
  "data",
  "link_list",
  "linkList",
  "links",
  "items",
  "friends",
] as const;

const NAMED_ARRAY_EXPORT_CANDIDATES = [
  "friendsConfig",
  "friendsProjects",
  "friendsData",
  "friendLinks",
  "friendLinkList",
  "linksData",
  "links",
  "friends",
  "data",
] as const;

const FRIEND_LINK_HINT_KEYS = [
  "title",
  "name",
  "siteurl",
  "siteUrl",
  "url",
  "link",
  "imgurl",
  "imgUrl",
  "avatar",
  "siteshot",
  "screenshot",
] as const;

/** Extract a balanced `{...}` or `[...]` starting at `start`. */
const extractBalancedLiteral = (
  source: string,
  start: number,
): string | null => {
  const open = source[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) return null;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if ((inSingle || inDouble || inTemplate) && ch === "\\") {
      escaped = true;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === "`") inTemplate = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      inTemplate = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
};

const extractBalancedObject = (source: string, start: number) =>
  source[start] === "{" ? extractBalancedLiteral(source, start) : null;

const extractBalancedArray = (source: string, start: number) =>
  source[start] === "[" ? extractBalancedLiteral(source, start) : null;

const evalJsLiteral = (literal: string, label: string): unknown => {
  try {
    return parseSafeDataLiteral(literal, label);
  } catch (error) {
    throw new Error(
      `Failed to parse JS ${label}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
};

type JsNamedArrayExport = {
  name: string;
  /** Absolute index of `[` in source */
  arrayStart: number;
  arrayLiteral: string;
};

const findAllNamedConstArrayExports = (
  source: string,
): JsNamedArrayExport[] => {
  const re =
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;]+?)?\s*=\s*/g;
  let match: RegExpExecArray | null;
  const found: JsNamedArrayExport[] = [];
  while ((match = re.exec(source)) != null) {
    const name = match[1];
    const afterEq = match.index + match[0].length;
    let i = afterEq;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (source[i] !== "[") continue;
    const arrayLiteral = extractBalancedArray(source, i);
    if (!arrayLiteral) continue;
    found.push({ name, arrayStart: i, arrayLiteral });
  }
  return found;
};

const findNamedConstArrayExport = (
  source: string,
  preferredName?: string,
): JsNamedArrayExport | null => {
  const found = findAllNamedConstArrayExports(source);
  if (found.length === 0) return null;
  if (preferredName) {
    const hit = found.find((item) => item.name === preferredName);
    if (hit) return hit;
  }
  for (const candidate of NAMED_ARRAY_EXPORT_CANDIDATES) {
    const hit = found.find((item) => item.name === candidate);
    if (hit) return hit;
  }
  return found[0] ?? null;
};

const looksLikeFriendLinkArray = (value: unknown): value is unknown[] => {
  if (!Array.isArray(value) || value.length === 0) return false;
  const sample = value.find(
    (item) => item && typeof item === "object" && !Array.isArray(item),
  ) as Record<string, unknown> | undefined;
  if (!sample) return false;
  return FRIEND_LINK_HINT_KEYS.some((key) => key in sample);
};

const findDefaultExportLiteral = (
  source: string,
): { kind: "object" | "array"; start: number; literal: string } | null => {
  const exportMatch = source.match(
    /(?:export\s+default|module\.exports\s*=|exports\.default\s*=)\s*/,
  );
  if (!exportMatch || exportMatch.index == null) return null;
  let i = exportMatch.index + exportMatch[0].length;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] === "{") {
    const literal = extractBalancedObject(source, i);
    return literal ? { kind: "object", start: i, literal } : null;
  }
  if (source[i] === "[") {
    const literal = extractBalancedArray(source, i);
    return literal ? { kind: "array", start: i, literal } : null;
  }
  return null;
};

/**
 * Parse friend-link JS/TS modules:
 * - `export default { api, data: [...] }`
 * - `export default [...]`
 * - `export const friendsData / friendsConfig / friendsProjects = [...]`
 * - Multiple named FriendLink[] exports → `{ groups: [{ name, links }] }`
 */
const parseJsFriendLinksModule = (content: string): unknown => {
  const raw = content.replace(/^\uFEFF/, "");

  const allNamed = findAllNamedConstArrayExports(raw);
  const friendNamed: Array<{ name: string; links: unknown[] }> = [];
  for (const named of allNamed) {
    try {
      const arrayValue = evalJsLiteral(
        named.arrayLiteral,
        `const ${named.name}`,
      );
      if (!looksLikeFriendLinkArray(arrayValue)) continue;
      friendNamed.push({ name: named.name, links: arrayValue });
    } catch {
      // skip non-evaluable exports
    }
  }

  if (friendNamed.length > 1) {
    // Keep source order (e.g. friendsProjects then friendsConfig).
    return {
      groups: friendNamed.map((item) => ({
        name: item.name,
        desc: "",
        links: item.links,
      })),
    };
  }

  if (friendNamed.length === 1) {
    const only = friendNamed[0];
    return { [only.name]: only.links };
  }

  const defaultExport = findDefaultExportLiteral(raw);
  if (defaultExport) {
    return evalJsLiteral(
      defaultExport.literal,
      defaultExport.kind === "object" ? "default object" : "default array",
    );
  }

  throw new Error(
    "未找到友链数据导出（需要 export const … = […] 或 export default）。",
  );
};

/** @deprecated Use parseJsFriendLinksModule */
const parseJsModuleDefaultExport = parseJsFriendLinksModule;

const formatJsArrayLiteral = (value: unknown[]): string => {
  const json = JSON.stringify(value, null, "\t");
  // Keep trailing comma style light; JSON.stringify is enough for round-trip.
  return json;
};

const replaceLiteralInSource = (
  source: string,
  start: number,
  oldLiteral: string,
  nextLiteral: string,
): string =>
  `${source.slice(0, start)}${nextLiteral}${source.slice(start + oldLiteral.length)}`;

const getLinksArrayFromGroupRecord = (
  group: Record<string, unknown>,
): unknown[] | null => {
  for (const key of FALLBACK_LINK_ARRAY_KEYS) {
    if (Array.isArray(group[key])) return group[key] as unknown[];
  }
  if (Array.isArray(group.links)) return group.links;
  return null;
};

const stringifyJsFriendLinksModule = (
  value: unknown,
  templateSource?: string,
): string => {
  const template = typeof templateSource === "string" ? templateSource : "";

  if (template) {
    // Multi named FriendLink[] exports stored as `{ groups: [{ name, links }] }`.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const rootGroups = Array.isArray(record.groups)
        ? (record.groups as unknown[])
        : Array.isArray(record.linkGroups)
          ? (record.linkGroups as unknown[])
          : null;
      if (rootGroups && rootGroups.length > 0) {
        let result = template;
        // Patch from the end so earlier arrayStart indices stay valid.
        const patches: Array<{
          start: number;
          oldLiteral: string;
          nextLiteral: string;
        }> = [];
        for (const rawGroup of rootGroups) {
          if (!rawGroup || typeof rawGroup !== "object") continue;
          const group = rawGroup as Record<string, unknown>;
          const exportName =
            typeof group.name === "string" ? group.name.trim() : "";
          if (!exportName) continue;
          const links = getLinksArrayFromGroupRecord(group);
          if (!links) continue;
          const named = findNamedConstArrayExport(result, exportName);
          if (!named) continue;
          patches.push({
            start: named.arrayStart,
            oldLiteral: named.arrayLiteral,
            nextLiteral: formatJsArrayLiteral(links),
          });
        }
        patches.sort((a, b) => b.start - a.start);
        for (const patch of patches) {
          result = replaceLiteralInSource(
            result,
            patch.start,
            patch.oldLiteral,
            patch.nextLiteral,
          );
        }
        if (patches.length > 0) return result;
      }
    }

    // Prefer patching a named const array in place (keeps interfaces / helpers).
    let preferredName: string | undefined;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      preferredName = FALLBACK_LINK_ARRAY_KEYS.find((key) =>
        Array.isArray(record[key]),
      );
    }
    const named = findNamedConstArrayExport(template, preferredName);
    if (named) {
      const record =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
      const arrayValue = Array.isArray(value)
        ? value
        : Array.isArray(record?.[named.name])
          ? (record![named.name] as unknown[])
          : Array.isArray(record?.[preferredName ?? ""])
            ? (record![preferredName as string] as unknown[])
            : null;
      if (arrayValue) {
        return replaceLiteralInSource(
          template,
          named.arrayStart,
          named.arrayLiteral,
          formatJsArrayLiteral(arrayValue),
        );
      }
    }

    const defaultExport = findDefaultExportLiteral(template);
    if (defaultExport) {
      const nextLiteral = Array.isArray(value)
        ? formatJsArrayLiteral(value)
        : JSON.stringify(value ?? {}, null, 2);
      if (
        (defaultExport.kind === "array" && Array.isArray(value)) ||
        (defaultExport.kind === "object" &&
          value &&
          typeof value === "object" &&
          !Array.isArray(value))
      ) {
        return replaceLiteralInSource(
          template,
          defaultExport.start,
          defaultExport.literal,
          nextLiteral,
        );
      }
      if (
        defaultExport.kind === "object" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        return replaceLiteralInSource(
          template,
          defaultExport.start,
          defaultExport.literal,
          JSON.stringify(value, null, 2),
        );
      }
    }
  }

  if (Array.isArray(value)) {
    return `export const friendsConfig = ${formatJsArrayLiteral(value)};\n`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.groups) || Array.isArray(record.linkGroups)) {
      const rootGroups = (record.groups ?? record.linkGroups) as unknown[];
      const chunks: string[] = [];
      for (const rawGroup of rootGroups) {
        if (!rawGroup || typeof rawGroup !== "object") continue;
        const group = rawGroup as Record<string, unknown>;
        const exportName =
          typeof group.name === "string" && group.name.trim()
            ? group.name.trim()
            : "friendsConfig";
        const links = getLinksArrayFromGroupRecord(group) ?? [];
        chunks.push(
          `export const ${exportName} = ${formatJsArrayLiteral(links)};\n`,
        );
      }
      if (chunks.length > 0) return chunks.join("\n");
    }
    const namedKey = FALLBACK_LINK_ARRAY_KEYS.find((key) =>
      Array.isArray(record[key]),
    );
    if (namedKey) {
      return `export const ${namedKey} = ${formatJsArrayLiteral(
        record[namedKey] as unknown[],
      )};\n`;
    }
    return `export default ${JSON.stringify(value, null, 2)}\n`;
  }
  return `export default ${JSON.stringify(value ?? {}, null, 2)}\n`;
};

const stringifyJsModuleDefaultExport = (value: unknown): string =>
  stringifyJsFriendLinksModule(value);

type FriendLinksFileFormat =
  | "yaml"
  | "json"
  | "toml"
  | "yaml-frontmatter"
  | "javascript";

const parseFriendLinksSource = (
  content: string,
  format: FriendLinksFileFormat | string,
): unknown => {
  if (format === "javascript") {
    return parseJsFriendLinksModule(content);
  }
  return parseSerialized(content || "", {
    format: format as "yaml" | "json" | "toml" | "yaml-frontmatter",
  });
};

const stringifyFriendLinksSource = (
  value: unknown,
  format: FriendLinksFileFormat | string,
  options?: { templateSource?: string },
): string => {
  if (format === "javascript") {
    return stringifyJsFriendLinksModule(value, options?.templateSource);
  }
  if (format === "json") {
    return `${JSON.stringify(value ?? (Array.isArray(value) ? [] : {}), null, 2)}\n`;
  }
  if (Array.isArray(value)) {
    const yaml = YAML.stringify(value);
    return yaml.endsWith("\n") ? yaml : `${yaml}\n`;
  }
  if (format === "yaml" || format === "toml") {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const text = serialize(value as Record<string, any>, format);
      return text.endsWith("\n") ? text : `${text}\n`;
    }
    const yaml = YAML.stringify(value);
    return yaml.endsWith("\n") ? yaml : `${yaml}\n`;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return stringifySerialized(value as Record<string, any>, {
      format: format as "yaml-frontmatter",
    });
  }
  const yaml = YAML.stringify(value);
  return yaml.endsWith("\n") ? yaml : `${yaml}\n`;
};

const normalizeKey = (value: string) =>
  value.trim().replace(/^\.+/, "").replace(/\s+/g, "");

const normalizeFieldMap = (raw?: FriendLinkFieldMap | null): FriendLinkFieldMap => {
  const next: FriendLinkFieldMap = {};
  if (!raw || typeof raw !== "object") return next;
  for (const def of FRIEND_LINK_FIELD_DEFS) {
    const value = raw[def.key];
    if (typeof value !== "string") continue;
    const trimmed = normalizeKey(value);
    if (!trimmed) continue;
    next[def.key] = trimmed;
  }
  return next;
};

const normalizeGroupMap = (raw?: FriendLinkGroupMap | null): FriendLinkGroupMap => {
  const next: FriendLinkGroupMap = {};
  if (!raw || typeof raw !== "object") return next;
  for (const def of FRIEND_LINK_GROUP_DEFS) {
    const value = raw[def.key];
    if (typeof value !== "string") continue;
    const trimmed = normalizeKey(value);
    if (!trimmed) continue;
    next[def.key] = trimmed;
  }
  return next;
};

const resolveSourceKey = (
  canonical: FriendLinkCanonicalKey,
  fieldMap: FriendLinkFieldMap,
): string | null => {
  const mapped = fieldMap[canonical];
  if (typeof mapped === "string" && mapped.trim()) return mapped.trim();
  return null;
};

const resolveGroupSourceKey = (
  canonical: FriendLinkGroupCanonicalKey,
  groupMap: FriendLinkGroupMap,
): string | null => {
  const mapped = groupMap[canonical];
  if (typeof mapped === "string" && mapped.trim()) return mapped.trim();
  return null;
};

const lookupCanonicalForSourceKey = (
  key: string,
): FriendLinkCanonicalKey | null => {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[_-]/g, "");
  return (
    ALIAS_TO_CANONICAL[trimmed] ??
    ALIAS_TO_CANONICAL[lower] ??
    ALIAS_TO_CANONICAL[compact] ??
    null
  );
};

const lookupGroupCanonicalForSourceKey = (
  key: string,
): FriendLinkGroupCanonicalKey | null => {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[_-]/g, "");
  return (
    GROUP_ALIAS_TO_CANONICAL[trimmed] ??
    GROUP_ALIAS_TO_CANONICAL[lower] ??
    GROUP_ALIAS_TO_CANONICAL[compact] ??
    null
  );
};

const getGroupLinks = (
  group: Record<string, unknown>,
  groupMap: FriendLinkGroupMap = {},
): unknown[] | null => {
  const mapped = resolveGroupSourceKey("links", groupMap);
  if (mapped && Array.isArray(group[mapped])) {
    return group[mapped] as unknown[];
  }
  for (const key of FALLBACK_LINK_ARRAY_KEYS) {
    if (Array.isArray(group[key])) return group[key] as unknown[];
  }
  return null;
};

const getGroupLinksKey = (
  group: Record<string, unknown>,
  groupMap: FriendLinkGroupMap = {},
): string | null => {
  const mapped = resolveGroupSourceKey("links", groupMap);
  if (mapped && (Array.isArray(group[mapped]) || mapped in group)) return mapped;
  for (const key of FALLBACK_LINK_ARRAY_KEYS) {
    if (Array.isArray(group[key]) || key in group) return key;
  }
  return null;
};

const isLinkGroupLike = (
  value: unknown,
  groupMap: FriendLinkGroupMap = {},
) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return getGroupLinks(value as Record<string, unknown>, groupMap) != null
    || getGroupLinksKey(value as Record<string, unknown>, groupMap) != null;
};

const pickGroupName = (
  group: Record<string, unknown>,
  groupMap: FriendLinkGroupMap,
) => {
  const mapped = resolveGroupSourceKey("name", groupMap);
  if (mapped && typeof group[mapped] === "string") return group[mapped] as string;
  for (const key of Object.keys(group)) {
    if (lookupGroupCanonicalForSourceKey(key) !== "name") continue;
    if (typeof group[key] === "string") return group[key] as string;
  }
  if (typeof group.name === "string") return group.name;
  return "";
};

const pickGroupDesc = (
  group: Record<string, unknown>,
  groupMap: FriendLinkGroupMap,
) => {
  const mapped = resolveGroupSourceKey("desc", groupMap);
  if (mapped && typeof group[mapped] === "string") return group[mapped] as string;
  for (const key of Object.keys(group)) {
    if (lookupGroupCanonicalForSourceKey(key) !== "desc") continue;
    if (typeof group[key] === "string") return group[key] as string;
  }
  if (typeof group.desc === "string") return group.desc;
  return "";
};

const getRootGroupArray = (
  record: Record<string, unknown>,
): unknown[] | null => {
  for (const key of ROOT_GROUP_ARRAY_KEYS) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return null;
};

const getRootGroupArrayKey = (
  record: Record<string, unknown>,
): (typeof ROOT_GROUP_ARRAY_KEYS)[number] | null => {
  for (const key of ROOT_GROUP_ARRAY_KEYS) {
    if (Array.isArray(record[key])) return key;
  }
  return null;
};

const firstSampleGroup = (
  parsed: unknown,
  groupMap: FriendLinkGroupMap = {},
): Record<string, unknown> | null => {
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (isLinkGroupLike(item, groupMap)) {
        return item as Record<string, unknown>;
      }
    }
    return null;
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const rootGroups = getRootGroupArray(record);
    if (rootGroups) {
      for (const group of rootGroups) {
        if (group && typeof group === "object" && !Array.isArray(group)) {
          return group as Record<string, unknown>;
        }
      }
    }
    if (isLinkGroupLike(record, groupMap)) return record;
  }
  return null;
};

const firstSampleLink = (
  parsed: unknown,
  groupMap: FriendLinkGroupMap = {},
): Record<string, unknown> | null => {
  const takeLink = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  };

  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && parsed.every((item) => isLinkGroupLike(item, groupMap))) {
      for (const group of parsed) {
        const links = getGroupLinks(group as Record<string, unknown>, groupMap);
        if (!links) continue;
        for (const link of links) {
          const sample = takeLink(link);
          if (sample) return sample;
        }
      }
      return null;
    }
    for (const item of parsed) {
      const sample = takeLink(item);
      if (sample) return sample;
    }
    return null;
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const rootGroups = getRootGroupArray(record);
    if (rootGroups) {
      for (const group of rootGroups) {
        if (!group || typeof group !== "object") continue;
        const links = getGroupLinks(group as Record<string, unknown>, groupMap);
        if (!links) continue;
        for (const link of links) {
          const sample = takeLink(link);
          if (sample) return sample;
        }
      }
    }
    for (const key of FALLBACK_LINK_ARRAY_KEYS) {
      if (!Array.isArray(record[key])) continue;
      for (const link of record[key] as unknown[]) {
        const sample = takeLink(link);
        if (sample) return sample;
      }
    }
  }

  return null;
};

/** Collect several link samples so optional fields (e.g. rss) still get inferred. */
const collectSampleLinks = (
  parsed: unknown,
  groupMap: FriendLinkGroupMap = {},
  limit = 24,
): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = [];
  const pushLink = (value: unknown) => {
    if (out.length >= limit) return;
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    out.push(value as Record<string, unknown>);
  };

  if (Array.isArray(parsed)) {
    if (
      parsed.length > 0 &&
      parsed.every((item) => isLinkGroupLike(item, groupMap))
    ) {
      for (const group of parsed) {
        const links = getGroupLinks(group as Record<string, unknown>, groupMap);
        if (!links) continue;
        for (const link of links) {
          pushLink(link);
          if (out.length >= limit) return out;
        }
      }
      return out;
    }
    for (const item of parsed) {
      pushLink(item);
      if (out.length >= limit) return out;
    }
    return out;
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const rootGroups = getRootGroupArray(record);
    if (rootGroups) {
      for (const group of rootGroups) {
        if (!group || typeof group !== "object") continue;
        const links = getGroupLinks(group as Record<string, unknown>, groupMap);
        if (!links) continue;
        for (const link of links) {
          pushLink(link);
          if (out.length >= limit) return out;
        }
      }
    }
    for (const key of FALLBACK_LINK_ARRAY_KEYS) {
      if (!Array.isArray(record[key])) continue;
      for (const link of record[key] as unknown[]) {
        pushLink(link);
        if (out.length >= limit) return out;
      }
    }
  }

  return out;
};

/** Infer CMS→source key map from link samples found in a parsed file. */
const inferFriendLinkFieldMapFromParsed = (
  parsed: unknown,
  groupMap: FriendLinkGroupMap = {},
): FriendLinkFieldMap => {
  const samples = collectSampleLinks(parsed, groupMap);
  if (samples.length === 0) {
    const sample = firstSampleLink(parsed, groupMap);
    if (!sample) return {};
    samples.push(sample);
  }
  const next: FriendLinkFieldMap = {};
  const claimed = new Set<FriendLinkCanonicalKey>();
  for (const sample of samples) {
    for (const key of Object.keys(sample)) {
      const canonical = lookupCanonicalForSourceKey(key);
      if (!canonical || claimed.has(canonical)) continue;
      next[canonical] = key;
      claimed.add(canonical);
    }
    if (claimed.size >= FRIEND_LINK_CANONICAL_KEYS.length) break;
  }
  return next;
};

/** Infer group key map from the first group object (or a pasted group sample). */
const inferFriendLinkGroupMapFromParsed = (
  parsed: unknown,
): FriendLinkGroupMap => {
  const sample = firstSampleGroup(parsed) ?? (
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object"
        ? (parsed[0] as Record<string, unknown>)
        : null
  );
  if (!sample) return {};
  const next: FriendLinkGroupMap = {};
  const claimed = new Set<FriendLinkGroupCanonicalKey>();
  for (const key of Object.keys(sample)) {
    const value = sample[key];
    let canonical = lookupGroupCanonicalForSourceKey(key);
    if (!canonical && (Array.isArray(value) || value == null)) {
      // Empty `link_list:` often parses as null — treat as links list key.
      if (/link/i.test(key) || /list/i.test(key) || /item/i.test(key)) {
        canonical = "links";
      }
    }
    if (!canonical || claimed.has(canonical)) continue;
    next[canonical] = key;
    claimed.add(canonical);
  }
  return next;
};

/** Parse a pasted YAML/JSON/JS format snippet (group or link sample). */
const parseFormatSnippet = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return YAML.parse(trimmed, { strict: false, uniqueKeys: false });
  } catch {
    // continue
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  try {
    if (
      /(?:export\s+default|module\.exports\s*=)/.test(trimmed) ||
      trimmed.startsWith("{")
    ) {
      if (trimmed.startsWith("{")) {
        const literal = extractBalancedObject(trimmed, 0);
        if (!literal) return null;
        try {
          return parseSafeDataLiteral(literal, "object");
        } catch {
          return null;
        }
      }
      return parseJsModuleDefaultExport(trimmed);
    }
  } catch {
    return null;
  }
  return null;
};

const stringifyFormatSample = (value: unknown): string => {
  if (value == null) return "";
  try {
    return YAML.stringify(value).trimEnd();
  } catch {
    return "";
  }
};

const buildFormatSamplesFromParsed = (
  parsed: unknown,
  groupMap: FriendLinkGroupMap = {},
): FriendLinksFormatSamples => {
  const group = firstSampleGroup(parsed, groupMap);
  const link = firstSampleLink(parsed, groupMap);
  let groupFormat = "";
  if (group) {
    const linksKey = getGroupLinksKey(group, groupMap) ?? "links";
    const sampleGroup: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(group)) {
      if (key === linksKey) {
        sampleGroup[key] = null;
        continue;
      }
      if (Array.isArray(value)) continue;
      sampleGroup[key] = value;
    }
    if (!(linksKey in sampleGroup)) sampleGroup[linksKey] = null;
    groupFormat = stringifyFormatSample([sampleGroup]);
  }
  const linkFormat = link ? stringifyFormatSample([link]) : "";
  return { group: groupFormat, link: linkFormat };
};

/**
 * Apply pasted group/link format snippets → maps.
 * Either snippet may be empty; only provided ones are used.
 */
const applyFormatSamples = (
  groupFormat: string,
  linkFormat: string,
): {
  fieldMap: FriendLinkFieldMap;
  groupMap: FriendLinkGroupMap;
} => {
  let groupMap: FriendLinkGroupMap = {};
  let fieldMap: FriendLinkFieldMap = {};

  const groupParsed = parseFormatSnippet(groupFormat);
  if (groupParsed != null) {
    groupMap = inferFriendLinkGroupMapFromParsed(groupParsed);
  }

  const linkParsed = parseFormatSnippet(linkFormat);
  if (linkParsed != null) {
    // Link snippet is usually a single object or a one-item array.
    const sample =
      Array.isArray(linkParsed) && linkParsed[0] && typeof linkParsed[0] === "object"
        ? (linkParsed[0] as Record<string, unknown>)
        : linkParsed && typeof linkParsed === "object" && !Array.isArray(linkParsed)
          ? (linkParsed as Record<string, unknown>)
          : null;
    if (sample) {
      const next: FriendLinkFieldMap = {};
      const claimed = new Set<FriendLinkCanonicalKey>();
      for (const key of Object.keys(sample)) {
        const canonical = lookupCanonicalForSourceKey(key);
        if (!canonical || claimed.has(canonical)) continue;
        next[canonical] = key;
        claimed.add(canonical);
      }
      fieldMap = next;
    }
  }

  return { fieldMap, groupMap };
};

const inferFriendLinksFromParsed = (parsed: unknown): FriendLinksInferResult => {
  const groupMap = inferFriendLinkGroupMapFromParsed(parsed);
  const fieldMap = inferFriendLinkFieldMapFromParsed(parsed, groupMap);
  const shape = detectFriendLinksShape(parsed, groupMap);
  const formatSamples = buildFormatSamplesFromParsed(parsed, groupMap);
  return { fieldMap, groupMap, formatSamples, shape };
};

/** Coerce rss/url-like values; arrays (multi-feed) → first non-empty string. */
const coerceLinkFieldValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim() !== "") return item.trim();
    }
    return undefined;
  }
  return value;
};

const isNonEmptyLinkFieldValue = (value: unknown): boolean => {
  const coerced = coerceLinkFieldValue(value);
  if (coerced == null) return false;
  if (typeof coerced === "string") return coerced.trim() !== "";
  return true;
};

const pickSourceValue = (
  source: Record<string, unknown>,
  canonical: FriendLinkCanonicalKey,
  fieldMap: FriendLinkFieldMap,
) => {
  const mapped = resolveSourceKey(canonical, fieldMap);
  if (mapped && isNonEmptyLinkFieldValue(source[mapped])) {
    return coerceLinkFieldValue(source[mapped]);
  }
  for (const [alias, key] of Object.entries(ALIAS_TO_CANONICAL)) {
    if (key !== canonical) continue;
    if (isNonEmptyLinkFieldValue(source[alias])) {
      return coerceLinkFieldValue(source[alias]);
    }
  }
  if (isNonEmptyLinkFieldValue(source[canonical])) {
    return coerceLinkFieldValue(source[canonical]);
  }
  return undefined;
};

const mapLinkFromSource = (
  raw: unknown,
  fieldMap: FriendLinkFieldMap,
): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const next: Record<string, unknown> = { ...source };
  for (const def of FRIEND_LINK_FIELD_DEFS) {
    const value = pickSourceValue(source, def.key, fieldMap);
    if (value == null || value === "") {
      delete next[def.key];
      continue;
    }
    next[def.key] = value;
    if (def.key === "name") next.blog = value;
    if (def.key === "url") next.url = value;
  }
  return next;
};

const mapLinkToSource = (
  link: Record<string, unknown>,
  fieldMap: FriendLinkFieldMap,
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  const mappedSourceKeys = new Set(
    Object.values(fieldMap).filter((value): value is string => Boolean(value)),
  );
  for (const [key, value] of Object.entries(link)) {
    if (
      FRIEND_LINK_CANONICAL_KEYS.includes(key as FriendLinkCanonicalKey) ||
      key === "blog" ||
      key === "pinLast" ||
      mappedSourceKeys.has(key)
    ) {
      continue;
    }
    next[key] = value;
  }
  for (const def of FRIEND_LINK_FIELD_DEFS) {
    const sourceKey = resolveSourceKey(def.key, fieldMap);
    const value =
      def.key === "name"
        ? link.blog ?? link.name
        : link[def.key];
    if (value == null || value === "") continue;
    if (sourceKey) {
      next[sourceKey] = value;
      continue;
    }
    // Unmapped optional fields (e.g. rss) keep identity key so they are not dropped.
    if (!(def.key in next)) next[def.key] = value;
  }
  if (link.pinLast === true) next.pinLast = true;
  return next;
};

const mapGroupFromSource = (
  raw: unknown,
  fieldMap: FriendLinkFieldMap,
  groupMap: FriendLinkGroupMap,
): Record<string, unknown> => {
  const g =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const rawLinks = getGroupLinks(g, groupMap) ?? [];
  const linksKey = getGroupLinksKey(g, groupMap);
  const nameKey = resolveGroupSourceKey("name", groupMap);
  const descKey = resolveGroupSourceKey("desc", groupMap);
  const next: Record<string, unknown> = { ...g };
  if (linksKey) delete next[linksKey];
  if (nameKey) delete next[nameKey];
  if (descKey) delete next[descKey];
  // Drop common alias leftovers so CMS uses canonical name/desc/links.
  delete next.link_list;
  delete next.linkList;
  delete next.class_name;
  delete next.class_desc;
  next.name = pickGroupName(g, groupMap);
  next.desc = pickGroupDesc(g, groupMap);
  next.links = rawLinks.map((link) => mapLinkFromSource(link, fieldMap));
  return next;
};

const mapGroupToSource = (
  group: Record<string, unknown>,
  fieldMap: FriendLinkFieldMap,
  groupMap: FriendLinkGroupMap,
): Record<string, unknown> => {
  const links = Array.isArray(group.links)
    ? group.links.map((link) =>
        mapLinkToSource(
          link && typeof link === "object"
            ? (link as Record<string, unknown>)
            : {},
          fieldMap,
        ),
      )
    : [];

  const nameKey = resolveGroupSourceKey("name", groupMap) ?? "name";
  const descKey = resolveGroupSourceKey("desc", groupMap) ?? "desc";
  const linksKey = resolveGroupSourceKey("links", groupMap) ?? "links";

  const reserved = new Set([
    "links",
    "name",
    "desc",
    "link_list",
    "linkList",
    "class_name",
    "class_desc",
    nameKey,
    descKey,
    linksKey,
  ]);

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(group)) {
    if (reserved.has(key)) continue;
    rest[key] = value;
  }

  const next: Record<string, unknown> = { ...rest };
  if (resolveGroupSourceKey("name", groupMap) || groupMap.name) {
    next[nameKey] =
      (typeof group.name === "string" ? group.name : "") ||
      (typeof group[nameKey] === "string" ? (group[nameKey] as string) : "");
  } else if (typeof group.name === "string" && group.name) {
    next[nameKey] = group.name;
  }

  if (resolveGroupSourceKey("desc", groupMap) || groupMap.desc) {
    next[descKey] =
      (typeof group.desc === "string" ? group.desc : "") ||
      (typeof group[descKey] === "string" ? (group[descKey] as string) : "");
  } else if (typeof group.desc === "string" && group.desc) {
    next[descKey] = group.desc;
  }

  next[linksKey] = links;
  return next;
};

const detectFriendLinksShape = (
  parsed: unknown,
  groupMap: FriendLinkGroupMap = {},
): FriendLinksShape => {
  if (Array.isArray(parsed)) {
    if (
      parsed.length > 0 &&
      parsed.every((item) => isLinkGroupLike(item, groupMap))
    ) {
      return "groups-array";
    }
    return "root-array";
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const rootKey = getRootGroupArrayKey(record);
    if (rootKey === "groups") return "groups";
    if (rootKey === "friendGroups") return "groups";
    if (rootKey === "linkGroups") return "linkGroups";
    const linksKey = resolveGroupSourceKey("links", groupMap);
    if (linksKey && Array.isArray(record[linksKey])) return "links";
    for (const key of FALLBACK_LINK_ARRAY_KEYS) {
      if (Array.isArray(record[key])) return "links";
    }
  }
  return "linkGroups";
};

const normalizeFriendLinksDocument = (
  parsed: unknown,
  fieldMapInput?: FriendLinkFieldMap | null,
  groupMapInput?: FriendLinkGroupMap | null,
): {
  document: Record<string, unknown>;
  shape: FriendLinksShape;
} => {
  const fieldMap = normalizeFieldMap(fieldMapInput);
  const groupMap = normalizeGroupMap(
    groupMapInput && Object.keys(normalizeGroupMap(groupMapInput)).length > 0
      ? groupMapInput
      : inferFriendLinkGroupMapFromParsed(parsed),
  );
  const shape = detectFriendLinksShape(parsed, groupMap);

  let groups: Array<Record<string, unknown>> = [];
  let meta: Record<string, unknown> = {};

  if (Array.isArray(parsed)) {
    if (
      parsed.length > 0 &&
      parsed.every((item) => isLinkGroupLike(item, groupMap))
    ) {
      groups = parsed.map((group) =>
        mapGroupFromSource(group, fieldMap, groupMap),
      );
    } else {
      groups = [
        {
          name: "",
          desc: "",
          type: "",
          links: parsed.map((link) => mapLinkFromSource(link, fieldMap)),
        },
      ];
    }
  } else if (parsed && typeof parsed === "object") {
    const record = { ...(parsed as Record<string, unknown>) };
    const rootKey = getRootGroupArrayKey(record);
    if (rootKey && Array.isArray(record[rootKey])) {
      groups = (record[rootKey] as unknown[]).map((group) =>
        mapGroupFromSource(group, fieldMap, groupMap),
      );
      for (const key of ROOT_GROUP_ARRAY_KEYS) {
        delete record[key];
      }
      meta = record;
    } else {
      const linksKey =
        resolveGroupSourceKey("links", groupMap) ??
        FALLBACK_LINK_ARRAY_KEYS.find((key) => Array.isArray(record[key])) ??
        null;
      if (linksKey && Array.isArray(record[linksKey])) {
        groups = [
          {
            name: "",
            desc: "",
            type: "",
            links: (record[linksKey] as unknown[]).map((link) =>
              mapLinkFromSource(link, fieldMap),
            ),
          },
        ];
        delete record[linksKey];
        meta = record;
      } else {
        meta = record;
        groups = [];
      }
    }
  }

  return {
    shape,
    document: {
      ...meta,
      linkGroups: groups,
    },
  };
};

const denormalizeFriendLinksDocument = (
  contentObject: Record<string, unknown>,
  fieldMapInput: FriendLinkFieldMap | null | undefined,
  shape: FriendLinksShape,
  groupMapInput?: FriendLinkGroupMap | null,
): unknown => {
  const fieldMap = normalizeFieldMap(fieldMapInput);
  const groupMap = normalizeGroupMap(
    groupMapInput && Object.keys(normalizeGroupMap(groupMapInput)).length > 0
      ? groupMapInput
      : DEFAULT_GROUP_MAP,
  );
  const groups = Array.isArray(contentObject.linkGroups)
    ? (contentObject.linkGroups as Array<Record<string, unknown>>)
    : [];
  const meta = { ...contentObject };
  delete meta.linkGroups;
  delete meta.__friendLinksShape;
  for (const key of ROOT_GROUP_ARRAY_KEYS) {
    delete meta[key];
  }

  if (shape === "groups-array") {
    return groups.map((group) => mapGroupToSource(group, fieldMap, groupMap));
  }

  const mappedGroups = groups.map((group) =>
    mapGroupToSource(group, fieldMap, {
      name: groupMap.name ?? "name",
      desc: groupMap.desc ?? "desc",
      links: groupMap.links ?? "links",
    }),
  );

  if (shape === "root-array") {
    const linksKey = resolveGroupSourceKey("links", groupMap) ?? "links";
    if (mappedGroups.length === 1) {
      const only = mappedGroups[0];
      return Array.isArray(only?.[linksKey]) ? only[linksKey] : [];
    }
    return mappedGroups;
  }

  if (shape === "links") {
    const linksKey = resolveGroupSourceKey("links", groupMap) ?? "links";
    const links =
      mappedGroups.length === 1
        ? (Array.isArray(mappedGroups[0]?.[linksKey])
            ? mappedGroups[0][linksKey]
            : [])
        : mappedGroups.flatMap((group) =>
            Array.isArray(group[linksKey]) ? group[linksKey] : [],
          );
    return { ...meta, [linksKey]: links };
  }

  if (shape === "groups") {
    return { ...meta, groups: mappedGroups };
  }

  return {
    ...meta,
    linkGroups: mappedGroups,
  };
};

const extensionToFriendLinksFormat = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return { extension: "json", format: "json" as const };
  if (ext === "toml") return { extension: "toml", format: "toml" as const };
  if (ext === "yaml" || ext === "yml") {
    return { extension: ext, format: "yaml" as const };
  }
  if (ext === "js" || ext === "mjs" || ext === "cjs" || ext === "ts") {
    return { extension: ext, format: "javascript" as const };
  }
  if (ext === "md" || ext === "markdown" || ext === "mdx") {
    return { extension: ext, format: "yaml-frontmatter" as const };
  }
  return { extension: ext || "yml", format: "yaml" as const };
};

export {
  ALIAS_TO_CANONICAL,
  DEFAULT_FIELD_MAP,
  DEFAULT_GROUP_MAP,
  FRIEND_LINK_CANONICAL_KEYS,
  FRIEND_LINK_FIELD_DEFS,
  FRIEND_LINK_GROUP_DEFS,
  FRIEND_LINK_GROUP_KEYS,
  applyFormatSamples,
  denormalizeFriendLinksDocument,
  detectFriendLinksShape,
  extensionToFriendLinksFormat,
  inferFriendLinkFieldMapFromParsed,
  inferFriendLinkGroupMapFromParsed,
  inferFriendLinksFromParsed,
  mapLinkFromSource,
  mapLinkToSource,
  normalizeFieldMap,
  normalizeFriendLinksDocument,
  normalizeGroupMap,
  parseFormatSnippet,
  parseFriendLinksSource,
  parseJsModuleDefaultExport,
  stringifyFriendLinksSource,
  stringifyJsModuleDefaultExport,
};
export type {
  FriendLinkCanonicalKey,
  FriendLinkFieldMap,
  FriendLinkGroupCanonicalKey,
  FriendLinkGroupMap,
  FriendLinksFileFormat,
  FriendLinksFormatSamples,
  FriendLinksInferResult,
  FriendLinksShape,
};
