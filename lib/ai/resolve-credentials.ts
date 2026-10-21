import "server-only";

import { createHttpError } from "@/lib/api-error";
import { getAiSettingsWithSecret } from "@/lib/ai/settings";
import { getAiProvider, isAiProviderId } from "@/lib/ai/providers";

export type ResolvedAiCredentials = {
  provider: string;
  model: string;
  apiKey: string;
  accountId: string | null;
};

/**
 * Resolve credentials for a test call.
 * Prefers request overrides (draft form values), falls back to saved settings.
 */
const resolveAiCredentialsForTest = async (
  userId: string,
  body: Record<string, unknown>,
): Promise<ResolvedAiCredentials> => {
  const settings = await getAiSettingsWithSecret(userId);

  const providerRaw =
    typeof body.provider === "string" && body.provider.trim()
      ? body.provider.trim()
      : settings.provider;
  if (!isAiProviderId(providerRaw)) {
    throw createHttpError("不支持的 AI 服务商。", 400);
  }
  const provider = getAiProvider(providerRaw);

  const model =
    (typeof body.model === "string" && body.model.trim()) ||
    settings.model ||
    provider.defaultModel;

  const draftKey =
    typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : null;
  if (draftKey && draftKey.length > 2048) {
    throw createHttpError("API Key 过长。", 400);
  }
  const apiKey = draftKey || settings.apiKey;
  if (!apiKey) {
    throw createHttpError(
      "请先填写 API Key，或保存后再测试。",
      400,
    );
  }

  const accountId =
    typeof body.accountId === "string" && body.accountId.trim()
      ? body.accountId.trim()
      : null;
  if (accountId && accountId.length > 128) {
    throw createHttpError("Account ID 过长。", 400);
  }

  return {
    provider: provider.id,
    model,
    apiKey,
    accountId,
  };
};

export { resolveAiCredentialsForTest };
