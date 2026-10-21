import { parse } from "@/lib/serialization";
import { safeAccess } from "@/lib/schema";
import { getFileName, getParentPath } from "@/lib/utils/file";

type CollectionEntryRow = {
  fields?: Record<string, unknown>;
  content?: string | null;
  isNode?: boolean;
  name?: string;
  path?: string;
};

/** Resolve list title: frontmatter primary field, then bundle slug, then file name. */
const resolveCollectionEntryTitle = (
  row: CollectionEntryRow,
  primaryField: string,
  format?: string,
) => {
  const fromFields = safeAccess(row.fields ?? {}, primaryField);
  if (fromFields != null && String(fromFields).trim() !== "") {
    return String(fromFields);
  }

  if (row.content && row.isNode && format) {
    try {
      const parsed = parse(row.content, { format: format as "yaml-frontmatter" });
      const fromContent = safeAccess(parsed, primaryField);
      if (fromContent != null && String(fromContent).trim() !== "") {
        return String(fromContent);
      }
    } catch {
      // Ignore malformed frontmatter in list view.
    }
  }

  if (row.isNode && row.path) {
    return getFileName(getParentPath(row.path));
  }

  if (primaryField === "path" && row.path) {
    return row.path;
  }

  return row.path || row.name || "";
};

export { resolveCollectionEntryTitle };
export type { CollectionEntryRow };
