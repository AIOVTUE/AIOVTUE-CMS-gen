"use client";

/** Human-readable row for a pending staged/git file change. */
const OPERATION_LABEL: Record<string, string> = {
  add: "新增",
  A: "新增",
  modify: "修改",
  M: "修改",
  delete: "删除",
  D: "删除",
  rename: "重命名",
  R: "重命名",
};

type ContentSchemaLike = {
  name?: string;
  label?: string;
  type?: string;
  path?: string;
  input?: string;
};

const describePendingChange = (
  file: { path: string; status: string; operation?: string; newPath?: string | null },
  configObject?: Record<string, any> | null,
) => {
  const path = (file.newPath || file.path || "").replace(/\\/g, "/");
  const opKey = file.operation || file.status || "M";
  const opLabel = OPERATION_LABEL[opKey] || OPERATION_LABEL[opKey.trim()] || "修改";

  const content = Array.isArray(configObject?.content) ? configObject.content : [];
  const media = Array.isArray(configObject?.media) ? configObject.media : [];

  let schemaLabel = "文件";
  let schemaName: string | null = null;

  const matchContent = (content as ContentSchemaLike[])
    .filter((item) => item?.path)
    .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0))
    .find((item) => {
      const base = (item.path || "").replace(/\\/g, "/").replace(/\/$/, "");
      return path === base || path.startsWith(`${base}/`);
    });

  if (matchContent) {
    schemaLabel = matchContent.label || matchContent.name || "内容";
    schemaName = matchContent.name || null;
  } else {
    const matchMedia = (media as ContentSchemaLike[])
      .filter((item) => item?.input)
      .sort((a, b) => (b.input?.length || 0) - (a.input?.length || 0))
      .find((item) => {
        const base = (item.input || "").replace(/\\/g, "/").replace(/\/$/, "");
        return path === base || path.startsWith(`${base}/`);
      });
    if (matchMedia) {
      schemaLabel = matchMedia.label || matchMedia.name || "媒体";
      schemaName = matchMedia.name || null;
    } else if (path === ".pages.yml") {
      schemaLabel = "配置";
    } else if (path === "hugo.toml" || path.endsWith("/hugo.toml")) {
      schemaLabel = "站点配置";
    }
  }

  const fileName = path.split("/").pop() || path;
  const title = `${schemaLabel} · ${opLabel}`;
  const subtitle = path;

  return {
    title,
    subtitle,
    fileName,
    schemaLabel,
    schemaName,
    opLabel,
    path,
  };
};

export { describePendingChange, OPERATION_LABEL };
