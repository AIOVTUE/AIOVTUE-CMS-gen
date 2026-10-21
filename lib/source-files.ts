import { normalizePath } from "@/lib/utils/file";

export type SourceFileEntry = {
  path: string;
  /** Display alias in the collection list; empty = use file name. */
  label?: string;
};

const normalizeContentPath = (value: string) =>
  value.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");

/** Accept legacy string paths or `{ path, label }` objects. */
const normalizeSourceFiles = (files: unknown): SourceFileEntry[] => {
  if (!Array.isArray(files)) return [];
  const seen = new Set<string>();
  const out: SourceFileEntry[] = [];

  for (const item of files) {
    let path = "";
    let label = "";
    if (typeof item === "string") {
      path = normalizeContentPath(item);
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      path = normalizeContentPath(String(record.path ?? ""));
      label =
        typeof record.label === "string" ? record.label.trim() : "";
    }
    if (!path || seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    out.push(label ? { path, label } : { path });
  }

  // Preserve authoring order (collection UI may sort for display).
  return out;
};

const sourceFilePaths = (files: unknown): string[] =>
  normalizeSourceFiles(files).map((entry) => entry.path);

const sourceFileLabelMap = (files: unknown): Map<string, string> => {
  const map = new Map<string, string>();
  for (const entry of normalizeSourceFiles(files)) {
    if (entry.label) map.set(normalizePath(entry.path), entry.label);
  }
  return map;
};

/** Persist compact form: plain string when no alias. */
const serializeSourceFiles = (files: SourceFileEntry[]): Array<string | SourceFileEntry> =>
  normalizeSourceFiles(files).map((entry) =>
    entry.label ? { path: entry.path, label: entry.label } : entry.path,
  );

export {
  normalizeSourceFiles,
  serializeSourceFiles,
  sourceFileLabelMap,
  sourceFilePaths,
};
