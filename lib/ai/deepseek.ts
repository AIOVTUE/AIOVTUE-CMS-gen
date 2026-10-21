import "server-only";

/**
 * Backward-compatible DeepSeek helpers.
 * Prefer `@/lib/ai/chat` + `@/lib/ai/providers` for new code.
 */

import { getAiProvider } from "@/lib/ai/providers";
import { chatCompletion as genericChat, summarizeArticle as genericSummarize } from "@/lib/ai/chat";

const DEFAULT_MODEL = getAiProvider("deepseek").defaultModel;

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekChatOptions = {
  apiKey: string;
  model?: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  maxTokens?: number;
};

const chatCompletion = async (options: DeepSeekChatOptions): Promise<string> =>
  genericChat({
    provider: "deepseek",
    ...options,
  });

const summarizeArticle = async (options: {
  apiKey: string;
  model?: string;
  title?: string;
  body: string;
}) =>
  genericSummarize({
    provider: "deepseek",
    ...options,
  });

export { DEFAULT_MODEL, chatCompletion, summarizeArticle };
