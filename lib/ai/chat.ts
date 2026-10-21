import "server-only";

import {
  getAiProvider,
  parseCloudflareApiKey,
  resolveProviderBaseUrl,
  resolveProviderModelId,
} from "@/lib/ai/providers";
import { resolveSummarySystemPrompt } from "@/lib/ai/summary-prompt";
import { scrubSecrets } from "@/lib/security/scrub-secrets";

export {
  DEFAULT_AI_SUMMARY_PROMPT,
  MAX_AI_SUMMARY_PROMPT_LENGTH,
  resolveSummarySystemPrompt,
} from "@/lib/ai/summary-prompt";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionOptions = {
  provider: string;
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Cloudflare Account ID when not embedded in the API key. */
  accountId?: string | null;
};

const chatCompletion = async ({
  provider,
  apiKey,
  model,
  messages,
  temperature = 0.4,
  maxTokens = 800,
  accountId,
}: ChatCompletionOptions): Promise<string> => {
  const def = getAiProvider(provider);
  let resolvedModel = resolveProviderModelId(
    def.id,
    model?.trim() || def.defaultModel,
  );

  let authKey = apiKey.trim();
  let resolvedAccountId = accountId?.trim() || null;
  if (def.id === "cloudflare") {
    const parsed = parseCloudflareApiKey(authKey);
    authKey = parsed.apiKey;
    resolvedAccountId = parsed.accountId || resolvedAccountId;
  }

  const baseUrl = resolveProviderBaseUrl(def.id, {
    accountId: resolvedAccountId,
  });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const rawMessage =
      payload?.error?.message ||
      payload?.errors?.[0]?.message ||
      payload?.message ||
      `${def.label} 请求失败（${response.status}）`;
    throw new Error(scrubSecrets(String(rawMessage)));
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`${def.label} 返回了空内容。`);
  }

  return content.trim();
};

const summarizeArticle = async (options: {
  provider: string;
  apiKey: string;
  model?: string;
  accountId?: string | null;
  /** Optional custom system prompt; blank falls back to default. */
  systemPrompt?: string | null;
  title?: string;
  body: string;
}) => {
  const title = options.title?.trim() || "无标题";
  const body = options.body.trim();
  if (!body) {
    throw new Error("正文为空，无法生成摘要。");
  }

  // Keep prompt payload bounded for long posts.
  const clippedBody = body.length > 12000 ? `${body.slice(0, 12000)}\n…` : body;

  return chatCompletion({
    provider: options.provider,
    apiKey: options.apiKey,
    model: options.model,
    accountId: options.accountId,
    messages: [
      {
        role: "system",
        content: resolveSummarySystemPrompt(options.systemPrompt),
      },
      {
        role: "user",
        content: `标题：${title}\n\n正文：\n${clippedBody}`,
      },
    ],
  });
};

export { chatCompletion, summarizeArticle };
