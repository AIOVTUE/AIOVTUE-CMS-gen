import type { AiProviderId } from "@/lib/ai/types";

export type AiModelOption = {
  id: string;
  /** Display name in the dropdown. */
  label: string;
  /** Highlighted as free / free-tier friendly. */
  free?: boolean;
};

export type AiProviderDefinition = {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  defaultBaseUrl: string;
  envBaseUrlKey?: string;
  /** Preset models (dropdown). Users can still type a custom id. */
  models: AiModelOption[];
  /** Shown under the API key field. */
  apiKeyHint: string;
  /** Placeholder for the API key input. */
  apiKeyPlaceholder: string;
  /** Extra help when Cloudflare needs an account id. */
  needsAccountId?: boolean;
};

const AI_PROVIDERS: Record<AiProviderId, AiProviderDefinition> = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com",
    envBaseUrlKey: "DEEPSEEK_API_BASE",
    models: [
      { id: "deepseek-chat", label: "deepseek-chat（通用）" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner（推理）" },
    ],
    apiKeyHint: "在 DeepSeek 开放平台创建 API Key。",
    apiKeyPlaceholder: "sk-...",
  },
  zhipu: {
    id: "zhipu",
    label: "智谱 GLM",
    defaultModel: "glm-4-flash",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envBaseUrlKey: "ZHIPU_API_BASE",
    models: [
      { id: "glm-4-flash", label: "GLM-4-Flash", free: true },
      { id: "glm-4-flash-250414", label: "GLM-4-Flash-250414", free: true },
      { id: "glm-4.1v-thinking-flash", label: "GLM-4.1V-Thinking-Flash", free: true },
      { id: "glm-4-air", label: "GLM-4-Air" },
      { id: "glm-4-airx", label: "GLM-4-AirX" },
      { id: "glm-4-plus", label: "GLM-4-Plus" },
    ],
    apiKeyHint: "在智谱开放平台创建 API Key（OpenAI 兼容接口）。Flash 系列通常有免费额度。",
    apiKeyPlaceholder: "xxx.yyy",
  },
  siliconflow: {
    id: "siliconflow",
    label: "硅基流动",
    defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    envBaseUrlKey: "SILICONFLOW_API_BASE",
    models: [
      {
        id: "deepseek-ai/DeepSeek-V4-Flash",
        label: "DeepSeek-V4-Flash",
        free: true,
      },
      {
        id: "Qwen/Qwen3-8B",
        label: "Qwen3-8B",
        free: true,
      },
      {
        id: "Qwen/Qwen3-32B",
        label: "Qwen3-32B",
      },
      {
        id: "deepseek-ai/DeepSeek-V3.2",
        label: "DeepSeek-V3.2",
      },
      {
        id: "Pro/zai-org/GLM-5.1",
        label: "GLM-5.1（Pro）",
      },
      {
        id: "Pro/deepseek-ai/DeepSeek-V4",
        label: "DeepSeek-V4（Pro）",
      },
    ],
    apiKeyHint:
      "在硅基流动控制台创建 API Key。模型名以控制台为准；免费额度常见于 V4-Flash / Qwen3-8B 等。",
    apiKeyPlaceholder: "sk-...",
  },
  cloudflare: {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    defaultModel: "@cf/meta/llama-3.1-8b-instruct-fast",
    defaultBaseUrl: "https://api.cloudflare.com/client/v4/accounts",
    envBaseUrlKey: "CLOUDFLARE_AI_BASE",
    models: [
      {
        id: "@cf/meta/llama-3.1-8b-instruct-fast",
        label: "Llama 3.1 8B Instruct Fast",
        free: true,
      },
      {
        id: "@cf/zai-org/glm-4.7-flash",
        label: "GLM-4.7-Flash",
        free: true,
      },
      {
        id: "@cf/meta/llama-4-scout-17b-16e-instruct",
        label: "Llama 4 Scout 17B",
        free: true,
      },
      {
        id: "@cf/google/gemma-4-26b-a4b-it",
        label: "Gemma 4 26B A4B IT",
        free: true,
      },
      {
        id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        label: "Llama 3.3 70B Instruct Fast",
      },
      {
        id: "@cf/moonshotai/kimi-k2.6",
        label: "Kimi K2.6",
      },
    ],
    apiKeyHint:
      "填写 Cloudflare API Token。Account ID 可写在下方，或设环境变量 CLOUDFLARE_ACCOUNT_ID。Workers AI 有每日免费额度。",
    apiKeyPlaceholder: "API Token",
    needsAccountId: true,
  },
};

const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[];

const isAiProviderId = (value: string): value is AiProviderId =>
  value in AI_PROVIDERS;

const getAiProvider = (provider: string): AiProviderDefinition => {
  if (isAiProviderId(provider)) return AI_PROVIDERS[provider];
  return AI_PROVIDERS.deepseek;
};

const getProviderModelOptions = (provider: string): AiModelOption[] =>
  getAiProvider(provider).models;

const formatModelOptionLabel = (option: AiModelOption) =>
  option.free ? `${option.label} · 免费` : option.label;

const resolveProviderBaseUrl = (
  provider: string,
  options?: { accountId?: string | null },
): string => {
  const def = getAiProvider(provider);
  const envOverride = def.envBaseUrlKey
    ? process.env[def.envBaseUrlKey]?.trim()
    : undefined;
  if (envOverride) return envOverride.replace(/\/$/, "");

  if (def.id === "cloudflare") {
    const accountId =
      options?.accountId?.trim() ||
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
      "";
    if (!accountId) {
      throw new Error(
        "Cloudflare Workers AI 需要 Account ID（设置页填写或设置 CLOUDFLARE_ACCOUNT_ID）。",
      );
    }
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
  }

  return def.defaultBaseUrl.replace(/\/$/, "");
};

/**
 * Cloudflare API key storage: either a bare token (with account id stored
 * separately / via env), or `accountId:token` / `accountId|token`.
 */
const parseCloudflareApiKey = (
  raw: string,
): { accountId: string | null; apiKey: string } => {
  const value = raw.trim();
  const match = value.match(/^([^:|\s]+)[:|](.+)$/);
  if (match) {
    return { accountId: match[1].trim(), apiKey: match[2].trim() };
  }
  return { accountId: null, apiKey: value };
};

/** Map deprecated Workers AI model ids to current replacements. */
const CLOUDFLARE_DEPRECATED_MODEL_ALIASES: Record<string, string> = {
  "@cf/meta/llama-3.1-8b-instruct": "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.1-8b-instruct-awq": "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3-8b-instruct": "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3-8b-instruct-awq": "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.1-70b-instruct": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/mistral/mistral-7b-instruct-v0.1":
    "@cf/meta/llama-3.1-8b-instruct-fast",
  "@hf/mistral/mistral-7b-instruct-v0.2":
    "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/google/gemma-2-9b-it": "@cf/google/gemma-4-26b-a4b-it",
  "@cf/google/gemma-3-12b-it": "@cf/google/gemma-4-26b-a4b-it",
  "@cf/qwen/qwen1.5-7b-chat-awq": "@cf/zai-org/glm-4.7-flash",
  "@cf/moonshotai/kimi-k2.5": "@cf/moonshotai/kimi-k2.6",
};

/** Map discontinued SiliconFlow model ids to current replacements. */
const SILICONFLOW_DEPRECATED_MODEL_ALIASES: Record<string, string> = {
  "Qwen/Qwen2.5-7B-Instruct": "Qwen/Qwen3-8B",
  "Qwen/Qwen2.5-Coder-7B-Instruct": "Qwen/Qwen3-8B",
  "Pro/Qwen/Qwen2.5-Coder-7B-Instruct": "Qwen/Qwen3-8B",
  "THUDM/GLM-4-Flash": "deepseek-ai/DeepSeek-V4-Flash",
  "THUDM/glm-4-9b-chat": "Qwen/Qwen3-8B",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B": "deepseek-ai/DeepSeek-V4-Flash",
  "Pro/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B":
    "deepseek-ai/DeepSeek-V4-Flash",
  "deepseek-ai/DeepSeek-V3": "deepseek-ai/DeepSeek-V3.2",
  "Pro/deepseek-ai/DeepSeek-V3": "Pro/deepseek-ai/DeepSeek-V4",
  "deepseek-ai/DeepSeek-V3.1": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-ai/DeepSeek-V3.2-Exp": "deepseek-ai/DeepSeek-V3.2",
};

const resolveCloudflareModelId = (model: string): string => {
  const trimmed = model.trim();
  return CLOUDFLARE_DEPRECATED_MODEL_ALIASES[trimmed] || trimmed;
};

const resolveSiliconflowModelId = (model: string): string => {
  const trimmed = model.trim();
  return SILICONFLOW_DEPRECATED_MODEL_ALIASES[trimmed] || trimmed;
};

const resolveProviderModelId = (provider: string, model: string): string => {
  const trimmed = model.trim();
  if (provider === "cloudflare") return resolveCloudflareModelId(trimmed);
  if (provider === "siliconflow") return resolveSiliconflowModelId(trimmed);
  return trimmed;
};

export {
  AI_PROVIDERS,
  AI_PROVIDER_IDS,
  isAiProviderId,
  getAiProvider,
  getProviderModelOptions,
  formatModelOptionLabel,
  resolveProviderBaseUrl,
  parseCloudflareApiKey,
  resolveCloudflareModelId,
  resolveSiliconflowModelId,
  resolveProviderModelId,
};
