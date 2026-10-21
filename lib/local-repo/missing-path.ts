/** Client-safe match for local workspace path errors (no Node imports). */
export const isMissingLocalWorkspaceError = (message: unknown) =>
  typeof message === "string" &&
  (message.includes("未设置本地仓库目录") ||
    message.includes("本地仓库目录不存在") ||
    message.includes("选择本地项目目录"));
