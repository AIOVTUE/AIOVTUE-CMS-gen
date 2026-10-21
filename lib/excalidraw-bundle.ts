import { getParentPath } from "@/lib/utils/file";

const EXCALIDRAW_COLLECTION = "excalidraw";
const EXCALIDRAW_FILE_SUFFIX = ".excalidraw";

const EMPTY_EXCALIDRAW_SCENE = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [],
  appState: {
    gridSize: null,
    viewBackgroundColor: "#ffffff",
  },
  files: {},
} as const;

const EMPTY_EXCALIDRAW_JSON = JSON.stringify(EMPTY_EXCALIDRAW_SCENE, null, 2);

const isBlankBody = (body: unknown) =>
  body == null || (typeof body === "string" && body.trim() === "");

const getExcalidrawBundleDir = (entryPath: string) => getParentPath(entryPath);

const getDefaultExcalidrawPath = (entryPath: string) => {
  const dir = getExcalidrawBundleDir(entryPath);
  const folderName = dir.split("/").pop() || "drawing";
  return `${dir}/${folderName}${EXCALIDRAW_FILE_SUFFIX}`;
};

const pickExcalidrawPath = (entryPath: string, siblingFileNames: string[]) => {
  const dir = getExcalidrawBundleDir(entryPath);
  const excalidrawFiles = siblingFileNames.filter((name) =>
    name.endsWith(EXCALIDRAW_FILE_SUFFIX),
  );
  if (excalidrawFiles.length > 0) {
    return `${dir}/${excalidrawFiles[0]}`;
  }
  return getDefaultExcalidrawPath(entryPath);
};

const formatExcalidrawJson = (raw: string) => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export {
  EXCALIDRAW_COLLECTION,
  EXCALIDRAW_FILE_SUFFIX,
  EMPTY_EXCALIDRAW_JSON,
  formatExcalidrawJson,
  getDefaultExcalidrawPath,
  getExcalidrawBundleDir,
  isBlankBody,
  pickExcalidrawPath,
};
