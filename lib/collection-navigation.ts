import { getParentPath, normalizePath } from "@/lib/utils/file";
import { repoHref } from "@/lib/repo-href";

type CollectionListHrefOptions = {
  owner: string;
  repo: string;
  branch: string;
  collectionName: string;
  schemaPath?: string;
  layout?: string;
  entryPath?: string;
  parent?: string;
  isNodeBundle?: boolean;
};

const resolveCollectionFolderPath = ({
  schemaPath,
  layout,
  entryPath,
  parent,
  isNodeBundle,
}: Pick<
  CollectionListHrefOptions,
  "schemaPath" | "layout" | "entryPath" | "parent" | "isNodeBundle"
>) => {
  if (layout === "tree") return null;

  const rootPath = schemaPath ? normalizePath(schemaPath) : "";

  let folderPath: string | undefined;
  if (entryPath) {
    const normalizedEntry = normalizePath(entryPath);
    folderPath = isNodeBundle
      ? getParentPath(getParentPath(normalizedEntry))
      : getParentPath(normalizedEntry);
  } else if (parent) {
    folderPath = normalizePath(parent);
  }

  if (!folderPath) return null;
  const normalizedFolder = normalizePath(folderPath);
  if (!rootPath || normalizedFolder === rootPath) return null;
  return normalizedFolder;
};

export const getCollectionListHref = ({
  owner,
  repo,
  branch,
  collectionName,
  schemaPath,
  layout,
  entryPath,
  parent,
  isNodeBundle,
}: CollectionListHrefOptions) => {
  const base = `${repoHref(owner, repo, branch)}/collection/${encodeURIComponent(collectionName)}`;
  const folderPath = resolveCollectionFolderPath({
    schemaPath,
    layout,
    entryPath,
    parent,
    isNodeBundle,
  });

  if (folderPath) {
    return `${base}?path=${encodeURIComponent(folderPath)}`;
  }
  return base;
};
