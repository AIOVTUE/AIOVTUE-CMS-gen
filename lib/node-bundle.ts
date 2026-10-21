import {
  getFileName,
  getParentPath,
  joinPathSegments,
  normalizePath,
} from "@/lib/utils/file";

const getNodeEntryFilename = (schema?: Record<string, unknown> | null) => {
  const node = schema?.view as { node?: { filename?: string } | string } | undefined;
  if (!node?.node) return undefined;
  if (typeof node.node === "string") return node.node;
  return typeof node.node.filename === "string" ? node.node.filename : undefined;
};

const usesNodeBundle = (schema?: Record<string, unknown> | null) =>
  Boolean(getNodeEntryFilename(schema));

const resolveNodeBundleSlug = (entryPath: string, nodeFilename: string) => {
  const normalized = normalizePath(entryPath);
  const fileName = getFileName(normalized);
  if (fileName === nodeFilename) {
    return getFileName(getParentPath(normalized));
  }
  return fileName.replace(/\.[^.]+$/, "");
};

const buildNodeBundleEntryPath = (
  basePath: string,
  slug: string,
  nodeFilename: string,
) => joinPathSegments([basePath, slug, nodeFilename]);

const normalizeNodeBundleSlug = (value: string) =>
  normalizePath(value.replace(/[\\/]/g, "")).split("/").pop() || "";

export {
  buildNodeBundleEntryPath,
  getNodeEntryFilename,
  normalizeNodeBundleSlug,
  resolveNodeBundleSlug,
  usesNodeBundle,
};
