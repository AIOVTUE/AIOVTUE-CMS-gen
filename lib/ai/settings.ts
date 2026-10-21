import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettingsTable } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import { getAiProvider, isAiProviderId } from "@/lib/ai/providers";
import { MAX_AI_SUMMARY_PROMPT_LENGTH } from "@/lib/ai/summary-prompt";
import type { AiSettingsPublic } from "@/lib/ai/types";

export type { AiSettingsPublic };

export type AiSettingsSecret = AiSettingsPublic & {
  apiKey: string | null;
};

const toPublic = (row: typeof aiSettingsTable.$inferSelect | null): AiSettingsPublic => {
  const provider = row?.provider || "deepseek";
  const def = getAiProvider(provider);
  return {
    provider,
    model: row?.model || def.defaultModel,
    autoSummary: Boolean(row?.autoSummary),
    summaryPrompt: typeof row?.summaryPrompt === "string" ? row.summaryPrompt : "",
    hasApiKey: Boolean(row?.apiKeyCiphertext && row?.apiKeyIv),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
};

const getAiSettingsRow = async (userId: string) => {
  return db.query.aiSettingsTable.findFirst({
    where: eq(aiSettingsTable.userId, userId),
  });
};

const getAiSettingsPublic = async (userId: string): Promise<AiSettingsPublic> => {
  const row = await getAiSettingsRow(userId);
  return toPublic(row ?? null);
};

const getAiSettingsWithSecret = async (userId: string): Promise<AiSettingsSecret> => {
  const row = await getAiSettingsRow(userId);
  const publicSettings = toPublic(row ?? null);
  if (!row?.apiKeyCiphertext || !row.apiKeyIv) {
    return { ...publicSettings, apiKey: null };
  }
  const apiKey = await decrypt(row.apiKeyCiphertext, row.apiKeyIv);
  return { ...publicSettings, apiKey };
};

type UpsertAiSettingsInput = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  provider?: string;
  model?: string;
  autoSummary?: boolean;
  summaryPrompt?: string | null;
  apiKey?: string | null;
  /** Cloudflare Account ID; combined into stored API key as `accountId:token`. */
  accountId?: string | null;
  clearApiKey?: boolean;
};

const upsertAiSettings = async (input: UpsertAiSettingsInput): Promise<AiSettingsPublic> => {
  await ensureDbUser(input.user);
  const existing = await getAiSettingsRow(input.user.id);

  let apiKeyCiphertext = existing?.apiKeyCiphertext ?? null;
  let apiKeyIv = existing?.apiKeyIv ?? null;

  const provider =
    (input.provider?.trim() && isAiProviderId(input.provider.trim())
      ? input.provider.trim()
      : null) ||
    existing?.provider ||
    "deepseek";
  const def = getAiProvider(provider);

  if (input.clearApiKey) {
    apiKeyCiphertext = null;
    apiKeyIv = null;
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    let keyToStore = input.apiKey.trim();
    if (keyToStore.length > 2048) {
      throw Object.assign(new Error("API Key 过长。"), { status: 400 });
    }
    if (def.needsAccountId) {
      const accountId = input.accountId?.trim();
      if (accountId && accountId.length > 128) {
        throw Object.assign(new Error("Account ID 过长。"), { status: 400 });
      }
      if (accountId && !/^[^:|\s]+[:|]/.test(keyToStore)) {
        keyToStore = `${accountId}:${keyToStore}`;
      }
    }
    try {
      const encrypted = await encrypt(keyToStore);
      apiKeyCiphertext = encrypted.ciphertext;
      apiKeyIv = encrypted.iv;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "加密 API Key 失败。";
      throw Object.assign(new Error(message), { status: 400 });
    }
  } else if (
    def.needsAccountId &&
    typeof input.accountId === "string" &&
    input.accountId.trim() &&
    existing?.apiKeyCiphertext &&
    existing?.apiKeyIv
  ) {
    // Update account id while keeping the existing token.
    try {
      const existingKey = await decrypt(existing.apiKeyCiphertext, existing.apiKeyIv);
      const token = existingKey.includes(":") || existingKey.includes("|")
        ? existingKey.replace(/^[^:|\s]+[:|]/, "")
        : existingKey;
      const encrypted = await encrypt(`${input.accountId.trim()}:${token}`);
      apiKeyCiphertext = encrypted.ciphertext;
      apiKeyIv = encrypted.iv;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "更新 Account ID 失败。";
      throw Object.assign(new Error(message), { status: 400 });
    }
  }

  let summaryPrompt =
    typeof existing?.summaryPrompt === "string" ? existing.summaryPrompt : null;
  if (typeof input.summaryPrompt === "string") {
    const trimmed = input.summaryPrompt.trim();
    if (trimmed.length > MAX_AI_SUMMARY_PROMPT_LENGTH) {
      throw Object.assign(new Error("自定义提示词过长。"), { status: 400 });
    }
    summaryPrompt = trimmed || null;
  }

  const next = {
    userId: input.user.id,
    provider,
    model: input.model?.trim() || existing?.model || def.defaultModel,
    apiKeyCiphertext,
    apiKeyIv,
    autoSummary:
      typeof input.autoSummary === "boolean"
        ? input.autoSummary
        : Boolean(existing?.autoSummary),
    summaryPrompt,
    updatedAt: new Date(),
  };

  await db
    .insert(aiSettingsTable)
    .values({
      ...next,
      createdAt: existing?.createdAt ?? new Date(),
    })
    .onConflictDoUpdate({
      target: aiSettingsTable.userId,
      set: {
        provider: next.provider,
        model: next.model,
        apiKeyCiphertext: next.apiKeyCiphertext,
        apiKeyIv: next.apiKeyIv,
        autoSummary: next.autoSummary,
        summaryPrompt: next.summaryPrompt,
        updatedAt: next.updatedAt,
      },
    });

  return getAiSettingsPublic(input.user.id);
};

export {
  getAiSettingsPublic,
  getAiSettingsWithSecret,
  upsertAiSettings,
};
