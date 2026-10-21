/** Built-in system prompt when the user has not set a custom one. */
export const DEFAULT_AI_SUMMARY_PROMPT =
  "你是中文博客编辑助手。请根据文章标题与正文生成简洁的 AI 摘要，用于文章顶部展示。" +
  "要求：使用简体中文；2～4 句；客观概括主题与要点；不要使用 Markdown；不要加「摘要：」等前缀；不要编造正文未提及的信息。";

export const MAX_AI_SUMMARY_PROMPT_LENGTH = 4000;

export const resolveSummarySystemPrompt = (custom?: string | null) => {
  const trimmed = typeof custom === "string" ? custom.trim() : "";
  return trimmed || DEFAULT_AI_SUMMARY_PROMPT;
};
