import "server-only";

import { parse } from "@/lib/serialization";
import { getCollectionCache } from "@/lib/github-cache-file";
import { normalizePath } from "@/lib/utils/file";
import { isBlankAiSummary, normalizePlainText } from "@/lib/ai/text";
import type { MissingAiSummaryEntry } from "@/lib/ai/types";
import { flattenContentLeaves } from "@/lib/page-templates";

export type { MissingAiSummaryEntry };

type CollectionSchema = {
  name: string;
  type?: string;
  path?: string;
  format?: string;
  extension?: string;
  exclude?: string[];
  fields?: Array<{ name: string; type?: string }>;
  subfolders?: boolean;
  delimiters?: string | string[];
};

const EXCALIDRAW_LAYOUT = "excalidraw";
const GALLERY_POST_LAYOUT = "gallery-post";

const isAiSummaryExemptLayout = (layout: unknown) =>
  layout === EXCALIDRAW_LAYOUT || layout === GALLERY_POST_LAYOUT;

const findCollectionsWithAiField = (configObject: Record<string, any> | null | undefined) => {
  const content = flattenContentLeaves(configObject?.content);
  return content.filter((item: CollectionSchema) => {
    if (!item || item.type !== "collection" || !item.path) return false;
    if (item.name === "excalidraw") return false;
    return Array.isArray(item.fields) && item.fields.some((field) => field?.name === "ai");
  }) as CollectionSchema[];
};

const listCollectionFilesRecursive = async (
  owner: string,
  repo: string,
  branch: string,
  schema: CollectionSchema,
  token: string,
) => {
  const root = normalizePath(schema.path || "");
  const queue = [root];
  const files: Array<{
    path: string;
    name: string;
    content: string | null;
    sha: string | null;
  }> = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const dirPath = queue.shift()!;
    if (visited.has(dirPath)) continue;
    visited.add(dirPath);

    const entries = await getCollectionCache(owner, repo, branch, dirPath, token);
    for (const entry of entries) {
      if (entry.parentPath !== dirPath) continue;
      if (entry.type === "dir") {
        if (schema.subfolders === false) continue;
        queue.push(entry.path);
        continue;
      }
      if (entry.type !== "file") continue;
      files.push({
        path: entry.path,
        name: entry.name,
        content: entry.content ?? null,
        sha: entry.sha ?? null,
      });
    }
  }

  return files;
};

const listMissingAiSummaries = async (options: {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  configObject: Record<string, any>;
}): Promise<MissingAiSummaryEntry[]> => {
  const collections = findCollectionsWithAiField(options.configObject);
  const missing: MissingAiSummaryEntry[] = [];

  for (const schema of collections) {
    const extension = schema.extension ?? "";
    const excluded = new Set(schema.exclude || []);
    const files = await listCollectionFilesRecursive(
      options.owner,
      options.repo,
      options.branch,
      schema,
      options.token,
    );

    for (const file of files) {
      if (excluded.has(file.name)) continue;
      if (extension && !file.path.endsWith(`.${extension}`)) continue;
      if (!file.content) continue;

      let title = file.name;
      let aiValue: unknown = "";
      let layout: unknown = "";
      try {
        if (schema.format && schema.fields) {
          const parsed = parse(file.content, {
            format: schema.format as any,
            delimiters: schema.delimiters as any,
          }) as Record<string, unknown>;
          if (typeof parsed.title === "string" && parsed.title.trim()) {
            title = parsed.title.trim();
          }
          aiValue = parsed.ai;
          layout = parsed.layout;
        }
      } catch {
        continue;
      }

      if (isAiSummaryExemptLayout(layout)) continue;
      if (!isBlankAiSummary(aiValue)) continue;

      missing.push({
        path: file.path,
        name: file.name,
        title,
        collectionName: schema.name,
        sha: file.sha,
      });
    }
  }

  missing.sort((a, b) => a.path.localeCompare(b.path));
  return missing;
};

export {
  findCollectionsWithAiField,
  listMissingAiSummaries,
  normalizePlainText,
};
