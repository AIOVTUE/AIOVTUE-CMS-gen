import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  serial,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const userTable = pgTable("user", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  image: text("image"),
  githubUsername: text("github_username"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

const sessionTable = pgTable("session", {
  id: text("id").notNull().primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" })
}, table => ({
  idx_session_userId: index("idx_session_userId").on(table.userId)
}));

const accountTable = pgTable("account", {
  id: text("id").notNull().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  idx_account_userId: index("idx_account_userId").on(table.userId),
  idx_account_providerId: index("idx_account_providerId").on(table.providerId)
}));

const verificationTable = pgTable("verification", {
  id: text("id").notNull().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  idx_verification_identifier: index("idx_verification_identifier").on(table.identifier)
}));

const githubInstallationTokenTable = pgTable("github_installation_token", {
  id: serial("id").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  installationId: integer("installation_id").notNull(),
  expiresAt: timestamp("expires_at").notNull()
}, table => ({
  uq_github_installation_token_installationId: uniqueIndex("uq_github_installation_token_installationId").on(table.installationId)
}));

const collaboratorTable = pgTable("collaborator", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  installationId: integer("installation_id").notNull(),
  ownerId: integer("owner_id").notNull(),
  repoId: integer("repo_id"),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch"),
  email: text("email").notNull(),
  userId: text("user_id").references(() => userTable.id),
  invitedBy: text("invited_by").references(() => userTable.id)
}, table => ({
  idx_collaborator_owner_repo_email: index("idx_collaborator_owner_repo_email").on(table.owner, table.repo, table.email),
  idx_collaborator_userId: index("idx_collaborator_userId").on(table.userId),
  uq_collaborator_owner_repo_email_ci: uniqueIndex("uq_collaborator_owner_repo_email_ci").on(
    sql`lower(${table.owner})`,
    sql`lower(${table.repo})`,
    sql`lower(${table.email})`,
  ),
}));

const collaboratorInviteTable = pgTable("collaborator_invite", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  email: text("email").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  uq_collaborator_invite_token: uniqueIndex("uq_collaborator_invite_token").on(table.token),
  idx_collaborator_invite_owner_repo_email: index("idx_collaborator_invite_owner_repo_email").on(table.owner, table.repo, table.email),
  uq_collaborator_invite_owner_repo_email_ci: uniqueIndex("uq_collaborator_invite_owner_repo_email_ci").on(
    sql`lower(${table.owner})`,
    sql`lower(${table.repo})`,
    sql`lower(${table.email})`,
  ),
}));

const configTable = pgTable("config", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  sha: text("sha").notNull(),
  version: text("version").notNull(),
  object: text("object").notNull(),
  lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow()
}, table => ({
  idx_config_owner_repo_branch: uniqueIndex("idx_config_owner_repo_branch").on(table.owner, table.repo, table.branch)
}));

const cacheFileTable = pgTable("cache_file", {
  id: serial("id").primaryKey(),
  context: text("context").notNull().default('collection'),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  parentPath: text("parent_path").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  type: text("type").notNull(),
  content: text("content"),
  sha: text("sha"),
  size: integer("size"),
  downloadUrl: text("download_url"),
  commitSha: text('commit_sha'),
  commitTimestamp: timestamp('commit_timestamp'),
  updatedAt: timestamp("updated_at").notNull()
}, table => ({
  idx_cache_file_owner_repo_branch_parentPath: index("idx_cache_file_owner_repo_branch_parentPath").on(table.owner, table.repo, table.branch, table.parentPath),
  idx_cache_file_owner_repo_branch_path: uniqueIndex("idx_cache_file_owner_repo_branch_path").on(table.owner, table.repo, table.branch, table.path)
}));

const cacheFileMetaTable = pgTable("cache_file_meta", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  path: text("path").notNull().default(""),
  context: text("context").notNull().default("branch"),
  commitSha: text("commit_sha"),
  commitTimestamp: timestamp("commit_timestamp"),
  status: text("status").notNull().default("ok"),
  error: text("error"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow(),
}, table => ({
  idx_cache_file_meta_owner_repo_branch_path_context: uniqueIndex("idx_cache_file_meta_owner_repo_branch_path_context").on(table.owner, table.repo, table.branch, table.path, table.context)
}));

const cachePermissionTable = pgTable("cache_permission", {
  id: serial("id").primaryKey(),
  githubId: integer("github_id").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  lastUpdated: timestamp("last_updated").notNull()
}, table => ({
  idx_cache_permission_githubId_owner_repo: uniqueIndex("idx_cache_permission_githubId_owner_repo").on(table.githubId, table.owner, table.repo)
}));

const actionRunTable = pgTable("action_run", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  ref: text("ref").notNull(),
  workflowRef: text("workflow_ref").notNull(),
  sha: text("sha").notNull(),
  actionName: text("action_name").notNull(),
  contextType: text("context_type").notNull(),
  contextName: text("context_name"),
  contextPath: text("context_path"),
  workflow: text("workflow").notNull(),
  workflowRunId: bigint("workflow_run_id", { mode: "number" }),
  status: text("status").notNull(),
  conclusion: text("conclusion"),
  htmlUrl: text("html_url"),
  triggeredBy: jsonb("triggered_by").notNull(),
  failure: jsonb("failure"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, table => ({
  idx_action_run_owner_repo_createdAt: index("idx_action_run_owner_repo_createdAt").on(table.owner, table.repo, table.createdAt),
  idx_action_run_owner_repo_actionName: index("idx_action_run_owner_repo_actionName").on(table.owner, table.repo, table.actionName),
  idx_action_run_owner_repo_status: index("idx_action_run_owner_repo_status").on(table.owner, table.repo, table.status),
  idx_action_run_context: index("idx_action_run_context").on(table.owner, table.repo, table.contextType, table.contextName, table.contextPath),
  idx_action_run_workflowRunId: uniqueIndex("idx_action_run_workflowRunId").on(table.workflowRunId),
}));

/** Unpublished CMS edits — overlay on GitHub / local files until manual publish. */
const stagedWriteTable = pgTable("staged_write", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  path: text("path").notNull(),
  operation: text("operation").notNull(),
  content: text("content"),
  contentEncoding: text("content_encoding").notNull().default("utf8"),
  baseSha: text("base_sha"),
  newPath: text("new_path"),
  size: integer("size"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => ({
  uq_staged_write_repo_path: uniqueIndex("uq_staged_write_repo_path").on(
    table.owner,
    table.repo,
    table.branch,
    table.path,
  ),
  idx_staged_write_repo: index("idx_staged_write_repo").on(
    table.owner,
    table.repo,
    table.branch,
  ),
}));

/** Per-user AI provider settings (API key encrypted at rest). */
const aiSettingsTable = pgTable("ai_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("deepseek"),
  model: text("model").notNull().default("deepseek-chat"),
  apiKeyCiphertext: text("api_key_ciphertext"),
  apiKeyIv: text("api_key_iv"),
  autoSummary: boolean("auto_summary").notNull().default(false),
  /** Custom system prompt for article summaries; empty = built-in default. */
  summaryPrompt: text("summary_prompt"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** AI summary generation job history (batch + manual runs). */
const aiSummaryTaskTable = pgTable("ai_summary_task", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  path: text("path").notNull(),
  title: text("title"),
  collectionName: text("collection_name"),
  status: text("status").notNull().default("pending"),
  summary: text("summary"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, table => ({
  idx_ai_summary_task_user_repo: index("idx_ai_summary_task_user_repo").on(
    table.userId,
    table.owner,
    table.repo,
    table.branch,
  ),
  idx_ai_summary_task_status: index("idx_ai_summary_task_status").on(
    table.userId,
    table.owner,
    table.repo,
    table.branch,
    table.status,
  ),
}));

/** Global login page background URLs (image host only; empty = local defaults). */
const loginBackgroundTable = pgTable("login_background", {
  id: integer("id").primaryKey().default(1),
  desktopUrl: text("desktop_url").notNull().default(""),
  mobileUrl: text("mobile_url").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Per-user email/password login (set in settings after GitHub login).
 * Email encrypted at rest; password stored as one-way hash (not reversible).
 * emailHash used for lookup only.
 */
const emailLoginSettingsTable = pgTable("email_login_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  emailHash: text("email_hash").notNull(),
  emailCiphertext: text("email_ciphertext").notNull(),
  emailIv: text("email_iv").notNull(),
  passwordHash: text("password_hash").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => ({
  uq_email_login_settings_email_hash: uniqueIndex("uq_email_login_settings_email_hash").on(table.emailHash),
}));

/**
 * Global deployment settings (singleton id=1).
 * Secrets are AES-GCM encrypted with CRYPTO_KEY from env.
 */
const appConfigTable = pgTable("app_config", {
  id: integer("id").primaryKey().default(1),
  setupComplete: boolean("setup_complete").notNull().default(false),
  baseUrl: text("base_url").notNull().default(""),
  authSecretCiphertext: text("auth_secret_ciphertext").notNull().default(""),
  authSecretIv: text("auth_secret_iv").notNull().default(""),
  githubAppId: text("github_app_id").notNull().default(""),
  githubAppName: text("github_app_name").notNull().default(""),
  githubAppClientId: text("github_app_client_id").notNull().default(""),
  githubAppClientSecretCiphertext: text(
    "github_app_client_secret_ciphertext",
  ).notNull().default(""),
  githubAppClientSecretIv: text("github_app_client_secret_iv")
    .notNull()
    .default(""),
  githubAppPrivateKeyCiphertext: text(
    "github_app_private_key_ciphertext",
  ).notNull().default(""),
  githubAppPrivateKeyIv: text("github_app_private_key_iv").notNull().default(""),
  githubAppWebhookSecretCiphertext: text(
    "github_app_webhook_secret_ciphertext",
  ).notNull().default(""),
  githubAppWebhookSecretIv: text("github_app_webhook_secret_iv")
    .notNull()
    .default(""),
  emailProvider: text("email_provider").notNull().default(""),
  emailFrom: text("email_from").notNull().default(""),
  resendApiKeyCiphertext: text("resend_api_key_ciphertext").notNull().default(""),
  resendApiKeyIv: text("resend_api_key_iv").notNull().default(""),
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: text("smtp_port").notNull().default("587"),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPasswordCiphertext: text("smtp_password_ciphertext").notNull().default(""),
  smtpPasswordIv: text("smtp_password_iv").notNull().default(""),
  adminEmails: text("admin_emails").notNull().default(""),
  githubAllowedUsernames: text("github_allowed_usernames").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Per-user public site URL for sidebar「返回站点」. */
const siteUrlSettingsTable = pgTable("site_url_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  siteUrl: text("site_url").notNull().default(""),
  iconUrl: text("icon_url").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Per-user comment system (Twikoo / Waline) for dashboard recent comments. */
const commentSettingsTable = pgTable("comment_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default(""),
  serverUrl: text("server_url").notNull().default(""),
  /** Optional Twikoo admin password (AES-GCM). Plaintext never returned to client. */
  passwordCiphertext: text("password_ciphertext").notNull().default(""),
  passwordIv: text("password_iv").notNull().default(""),
  /** Auto-export comments to WebDAV. */
  backupEnabled: boolean("backup_enabled").notNull().default(false),
  backupRemotePath: text("backup_remote_path").notNull().default("/pagecms/comments"),
  backupIntervalHours: integer("backup_interval_hours").notNull().default(24),
  lastBackupAt: timestamp("last_backup_at"),
  lastBackupStatus: text("last_backup_status").notNull().default(""),
  lastBackupMessage: text("last_backup_message").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Per-user WebDAV credentials for comment backups (password AES-GCM). */
const webdavSettingsTable = pgTable("webdav_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull().default(""),
  username: text("username").notNull().default(""),
  passwordCiphertext: text("password_ciphertext").notNull().default(""),
  passwordIv: text("password_iv").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Per-user Webanalysi analytics endpoint for dashboard visit stats. */
const webanalysiSettingsTable = pgTable("webanalysi_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  apiUrl: text("api_url").notNull().default(""),
  passwordCiphertext: text("password_ciphertext").notNull().default(""),
  passwordIv: text("password_iv").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Per-user Hugo Memos (动态) API endpoint for CMS editing when source=api. */
const memosSettingsTable = pgTable("memos_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  apiUrl: text("api_url").notNull().default(""),
  /** AIOVTUE-memos admin username (plain). */
  username: text("username").notNull().default(""),
  passwordCiphertext: text("password_ciphertext").notNull().default(""),
  passwordIv: text("password_iv").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** History of manual「提交到 GitHub」publishes (keep latest 15 per repo branch). */
const publishHistoryTable = pgTable("publish_history", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  commitSha: text("commit_sha"),
  message: text("message"),
  fileCount: integer("file_count").notNull().default(0),
  files: jsonb("files").$type<Array<{ path: string; status: string }>>().notNull().default([]),
  triggeredByUserId: text("triggered_by_user_id"),
  triggeredByName: text("triggered_by_name"),
  triggeredByEmail: text("triggered_by_email"),
  triggeredByGithubUsername: text("triggered_by_github_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => ({
  idx_publish_history_repo_created: index("idx_publish_history_repo_created").on(
    table.owner,
    table.repo,
    table.branch,
    table.createdAt,
  ),
}));

export {
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  githubInstallationTokenTable,
  collaboratorTable,
  collaboratorInviteTable,
  configTable,
  cacheFileTable,
  cacheFileMetaTable,
  cachePermissionTable,
  actionRunTable,
  stagedWriteTable,
  aiSettingsTable,
  aiSummaryTaskTable,
  publishHistoryTable,
  loginBackgroundTable,
  emailLoginSettingsTable,
  appConfigTable,
  siteUrlSettingsTable,
  commentSettingsTable,
  webdavSettingsTable,
  webanalysiSettingsTable,
  memosSettingsTable,
};
