export type AiProviderId =
  | "deepseek"
  | "zhipu"
  | "siliconflow"
  | "cloudflare";

export type AiSettingsPublic = {
  provider: AiProviderId | string;
  model: string;
  autoSummary: boolean;
  /** Custom summary system prompt; empty string means use the built-in default. */
  summaryPrompt: string;
  hasApiKey: boolean;
  /** Present for Cloudflare when the account id was saved with the key. */
  hasAccountId?: boolean;
  updatedAt: string | null;
};

export type AiSummaryTaskStatus = "pending" | "running" | "completed" | "failed";

export type AiSummaryTask = {
  id: number;
  userId: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  title: string | null;
  collectionName: string | null;
  status: AiSummaryTaskStatus;
  summary: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type MissingAiSummaryEntry = {
  path: string;
  name: string;
  title: string;
  collectionName: string;
  sha: string | null;
};
