import "server-only";

import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { appConfigTable } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureAppConfigTable } from "@/lib/app-config/ensure-table";
import type {
  AppConfig,
  AppConfigInput,
  AppConfigPublic,
  EmailProvider,
} from "@/lib/app-config/types";
import { logServerError } from "@/lib/security/scrub-secrets";

const DEV_BASE_URL = "http://localhost:3000";

let cache: AppConfig | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5_000;

const emptyConfig = (): AppConfig => ({
  setupComplete: false,
  baseUrl: "",
  authSecret: "",
  githubAppId: "",
  githubAppName: "",
  githubAppClientId: "",
  githubAppClientSecret: "",
  githubAppPrivateKey: "",
  githubAppWebhookSecret: "",
  emailProvider: "",
  emailFrom: "",
  resendApiKey: "",
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  adminEmails: "",
  githubAllowedUsernames: "",
});

const decryptField = async (ciphertext: string, iv: string) => {
  if (!ciphertext || !iv) return "";
  try {
    return (await decrypt(ciphertext, iv)) || "";
  } catch (error) {
    logServerError(error, "app-config decrypt");
    return "";
  }
};

const encryptField = async (value: string) => {
  if (!value) return { ciphertext: "", iv: "" };
  return encrypt(value);
};

const hasRequiredRuntime = (config: AppConfig) =>
  Boolean(
    config.baseUrl &&
      config.authSecret &&
      config.githubAppClientId &&
      config.githubAppClientSecret &&
      config.githubAppId &&
      config.githubAppPrivateKey,
  );

const rowToConfig = async (
  row: typeof appConfigTable.$inferSelect,
): Promise<AppConfig> => ({
  setupComplete: row.setupComplete,
  baseUrl: row.baseUrl || "",
  authSecret: await decryptField(row.authSecretCiphertext, row.authSecretIv),
  githubAppId: row.githubAppId || "",
  githubAppName: row.githubAppName || "",
  githubAppClientId: row.githubAppClientId || "",
  githubAppClientSecret: await decryptField(
    row.githubAppClientSecretCiphertext,
    row.githubAppClientSecretIv,
  ),
  githubAppPrivateKey: await decryptField(
    row.githubAppPrivateKeyCiphertext,
    row.githubAppPrivateKeyIv,
  ),
  githubAppWebhookSecret: await decryptField(
    row.githubAppWebhookSecretCiphertext,
    row.githubAppWebhookSecretIv,
  ),
  emailProvider: (row.emailProvider as EmailProvider) || "",
  emailFrom: row.emailFrom || "",
  resendApiKey: await decryptField(
    row.resendApiKeyCiphertext,
    row.resendApiKeyIv,
  ),
  smtpHost: row.smtpHost || "",
  smtpPort: row.smtpPort || "587",
  smtpSecure: Boolean(row.smtpSecure),
  smtpUser: row.smtpUser || "",
  smtpPassword: await decryptField(
    row.smtpPasswordCiphertext,
    row.smtpPasswordIv,
  ),
  adminEmails: row.adminEmails || "",
  githubAllowedUsernames: row.githubAllowedUsernames || "",
});

const toPublic = (config: AppConfig): AppConfigPublic => ({
  setupComplete: config.setupComplete,
  baseUrl: config.baseUrl,
  githubAppId: config.githubAppId,
  githubAppName: config.githubAppName,
  githubAppClientId: config.githubAppClientId,
  hasAuthSecret: Boolean(config.authSecret),
  hasGithubAppClientSecret: Boolean(config.githubAppClientSecret),
  hasGithubAppPrivateKey: Boolean(config.githubAppPrivateKey),
  hasGithubAppWebhookSecret: Boolean(config.githubAppWebhookSecret),
  emailProvider: config.emailProvider,
  emailFrom: config.emailFrom,
  hasResendApiKey: Boolean(config.resendApiKey),
  smtpHost: config.smtpHost,
  smtpPort: config.smtpPort,
  smtpSecure: config.smtpSecure,
  smtpUser: config.smtpUser,
  hasSmtpPassword: Boolean(config.smtpPassword),
  adminEmails: config.adminEmails,
  githubAllowedUsernames: config.githubAllowedUsernames,
});

export const invalidateAppConfigCache = () => {
  cache = null;
  cacheAt = 0;
};

/** Clear singleton row so `/setup` can be tested again. */
export const resetAppConfigForSetup = async () => {
  await ensureAppConfigTable();
  await db.delete(appConfigTable).where(eq(appConfigTable.id, 1));
  try {
    const { emailLoginSettingsTable } = await import("@/db/schema");
    await db.delete(emailLoginSettingsTable);
  } catch {
    // table may not exist yet
  }
  invalidateAppConfigCache();
  try {
    const { invalidateAuth } = await import("@/lib/auth");
    invalidateAuth();
  } catch {
    // auth module may not be loaded yet
  }
};

/** True only when the DB row is marked setup_complete (ignores env / local bypass). */
export const isDbSetupComplete = async (): Promise<boolean> => {
  try {
    await ensureAppConfigTable();
    const row = await db.query.appConfigTable.findFirst({
      where: eq(appConfigTable.id, 1),
    });
    return Boolean(row?.setupComplete);
  } catch {
    return false;
  }
};

export const getAppConfig = async (): Promise<AppConfig> => {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    await ensureAppConfigTable();
    const row = await db.query.appConfigTable.findFirst({
      where: eq(appConfigTable.id, 1),
    });

    if (row) {
      const config = await rowToConfig(row);
      cache = config;
      cacheAt = Date.now();
      return config;
    }
  } catch (error) {
    logServerError(error, "app-config load");
  }

  const empty = emptyConfig();
  cache = empty;
  cacheAt = Date.now();
  return empty;
};

export const getAppConfigPublic = async (): Promise<AppConfigPublic> => {
  return toPublic(await getAppConfig());
};

/** Ready for normal app use (DB setup marked complete with required fields). */
export const isAppSetupComplete = async (): Promise<boolean> => {
  // Local single-user bypass never goes through GitHub App OAuth bootstrap.
  if (process.env.LOCAL_DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production") {
    return true;
  }
  try {
    await ensureAppConfigTable();
    const row = await db.query.appConfigTable.findFirst({
      where: eq(appConfigTable.id, 1),
    });
    if (row?.setupComplete) {
      const config = await rowToConfig(row);
      return hasRequiredRuntime(config);
    }
  } catch (error) {
    logServerError(error, "app-config setup check");
  }
  return false;
};

export const resolveBaseUrl = async (): Promise<string> => {
  const config = await getAppConfig();
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return DEV_BASE_URL;
  throw new Error("未配置站点地址。请完成初始化。");
};

/**
 * True once the first admin email+password has been bootstrapped
 * (auth secret + admin email exist), even if GitHub/setup is unfinished.
 */
export const isAdminBootstrapped = async (): Promise<boolean> => {
  try {
    await ensureAppConfigTable();
    const config = await getAppConfig();
    if (!config.authSecret || !config.adminEmails.trim()) return false;
    const { ensureEmailLoginSettingsTable } = await import(
      "@/lib/email-login/ensure-table"
    );
    await ensureEmailLoginSettingsTable();
    const { emailLoginSettingsTable } = await import("@/db/schema");
    const row = await db.query.emailLoginSettingsTable.findFirst();
    return Boolean(row?.enabled && row.passwordHash);
  } catch (error) {
    logServerError(error, "app-config admin bootstrap check");
    return false;
  }
};

/** Persist authSecret + baseUrl + adminEmails without marking setup complete. */
export const saveBootstrapAppConfig = async (input: {
  baseUrl: string;
  adminEmails: string;
}): Promise<AppConfigPublic> => {
  await ensureAppConfigTable();
  if (!process.env.CRYPTO_KEY?.trim()) {
    throw new Error("未配置 CRYPTO_KEY，无法加密保存密钥。");
  }

  const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("请填写站点地址。");
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid");
    }
  } catch {
    throw new Error("站点地址必须是有效的 http(s) URL。");
  }

  const adminEmails = input.adminEmails.trim();
  if (!adminEmails) throw new Error("请填写管理员邮箱。");

  const existing = await db.query.appConfigTable.findFirst({
    where: eq(appConfigTable.id, 1),
  });
  const previous = existing ? await rowToConfig(existing) : emptyConfig();
  if (previous.setupComplete) {
    throw new Error("初始化已完成，无法再次创建管理员。");
  }

  const authSecret =
    previous.authSecret || randomBytes(32).toString("base64");
  const authEnc = await encryptField(authSecret);

  const values = {
    id: 1 as const,
    setupComplete: false,
    baseUrl,
    authSecretCiphertext: authEnc.ciphertext,
    authSecretIv: authEnc.iv,
    githubAppId: previous.githubAppId || "",
    githubAppName: previous.githubAppName || "",
    githubAppClientId: previous.githubAppClientId || "",
    githubAppClientSecretCiphertext: existing?.githubAppClientSecretCiphertext || "",
    githubAppClientSecretIv: existing?.githubAppClientSecretIv || "",
    githubAppPrivateKeyCiphertext: existing?.githubAppPrivateKeyCiphertext || "",
    githubAppPrivateKeyIv: existing?.githubAppPrivateKeyIv || "",
    githubAppWebhookSecretCiphertext:
      existing?.githubAppWebhookSecretCiphertext || "",
    githubAppWebhookSecretIv: existing?.githubAppWebhookSecretIv || "",
    emailProvider: "",
    emailFrom: "",
    resendApiKeyCiphertext: "",
    resendApiKeyIv: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPasswordCiphertext: "",
    smtpPasswordIv: "",
    adminEmails,
    githubAllowedUsernames: previous.githubAllowedUsernames || "",
    updatedAt: new Date(),
  };

  await db
    .insert(appConfigTable)
    .values(values)
    .onConflictDoUpdate({
      target: appConfigTable.id,
      set: values,
    });

  invalidateAppConfigCache();
  const { invalidateAuth } = await import("@/lib/auth");
  invalidateAuth();

  return getAppConfigPublic();
};

export const saveAppConfig = async (
  input: AppConfigInput,
): Promise<AppConfigPublic> => {
  await ensureAppConfigTable();
  if (!process.env.CRYPTO_KEY?.trim()) {
    throw new Error("未配置 CRYPTO_KEY，无法加密保存密钥。");
  }

  const existing = await db.query.appConfigTable.findFirst({
    where: eq(appConfigTable.id, 1),
  });
  const previous = existing ? await rowToConfig(existing) : emptyConfig();

  const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("请填写站点地址。");
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid");
    }
  } catch {
    throw new Error("站点地址必须是有效的 http(s) URL。");
  }

  const githubAppId = input.githubAppId.trim();
  const githubAppName = input.githubAppName.trim();
  const githubAppClientId = input.githubAppClientId.trim();
  if (!githubAppId || !githubAppName || !githubAppClientId) {
    throw new Error("请填写 GitHub App ID、名称与 Client ID。");
  }

  const authSecret =
    input.authSecret?.trim() ||
    previous.authSecret ||
    randomBytes(32).toString("base64");

  const githubAppClientSecret =
    input.githubAppClientSecret?.trim() || previous.githubAppClientSecret;
  const githubAppPrivateKey =
    input.githubAppPrivateKey?.trim() || previous.githubAppPrivateKey;
  const githubAppWebhookSecret =
    input.githubAppWebhookSecret?.trim() || previous.githubAppWebhookSecret;

  if (!githubAppClientSecret) {
    throw new Error("请填写 GitHub App Client Secret。");
  }
  if (!githubAppPrivateKey) {
    throw new Error("请填写 GitHub App 私钥。");
  }

  const adminEmails = input.adminEmails.trim();
  if (!adminEmails) throw new Error("请至少填写一个管理员邮箱。");

  // Email delivery is not configured via setup; keep columns empty.
  const [authEnc, clientSecretEnc, privateKeyEnc, webhookEnc] =
    await Promise.all([
      encryptField(authSecret),
      encryptField(githubAppClientSecret),
      encryptField(githubAppPrivateKey),
      encryptField(githubAppWebhookSecret),
    ]);
  const resendEnc = { ciphertext: "", iv: "" };
  const smtpPassEnc = { ciphertext: "", iv: "" };

  const values = {
    id: 1 as const,
    setupComplete: true,
    baseUrl,
    authSecretCiphertext: authEnc.ciphertext,
    authSecretIv: authEnc.iv,
    githubAppId,
    githubAppName,
    githubAppClientId,
    githubAppClientSecretCiphertext: clientSecretEnc.ciphertext,
    githubAppClientSecretIv: clientSecretEnc.iv,
    githubAppPrivateKeyCiphertext: privateKeyEnc.ciphertext,
    githubAppPrivateKeyIv: privateKeyEnc.iv,
    githubAppWebhookSecretCiphertext: webhookEnc.ciphertext,
    githubAppWebhookSecretIv: webhookEnc.iv,
    emailProvider: "",
    emailFrom: "",
    resendApiKeyCiphertext: resendEnc.ciphertext,
    resendApiKeyIv: resendEnc.iv,
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPasswordCiphertext: smtpPassEnc.ciphertext,
    smtpPasswordIv: smtpPassEnc.iv,
    adminEmails,
    githubAllowedUsernames: input.githubAllowedUsernames?.trim() || "",
    updatedAt: new Date(),
  };

  await db
    .insert(appConfigTable)
    .values(values)
    .onConflictDoUpdate({
      target: appConfigTable.id,
      set: values,
    });

  invalidateAppConfigCache();
  // Force auth rebuild on next request.
  const { invalidateAuth } = await import("@/lib/auth");
  invalidateAuth();

  return getAppConfigPublic();
};
