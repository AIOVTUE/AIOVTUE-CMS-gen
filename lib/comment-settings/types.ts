export type CommentProviderId = "" | "twikoo" | "waline";

export type CommentBackupIntervalHours = 6 | 12 | 24 | 168;

export type CommentSettingsPublic = {
  provider: CommentProviderId;
  serverUrl: string;
  /** Whether an admin password is stored (never expose the secret). */
  hasPassword: boolean;
  backupEnabled: boolean;
  backupRemotePath: string;
  backupIntervalHours: CommentBackupIntervalHours;
  lastBackupAt: string | null;
  lastBackupStatus: string;
  lastBackupMessage: string;
  updatedAt: string | null;
};

export type DashboardRecentComment = {
  id: string;
  nick: string;
  comment: string;
  url: string | null;
  mail?: string | null;
  ip?: string | null;
  isSpam?: boolean | null;
  createdAt: string | null;
};

export type CommentListPayload = {
  configured: boolean;
  provider: CommentProviderId;
  comments: DashboardRecentComment[];
  total?: number;
  page?: number;
  per?: number;
  source?: "admin" | "recent";
};

export type CommentBackupResult = {
  ok: boolean;
  skipped?: boolean;
  remotePath?: string;
  total?: number;
  message: string;
  lastBackupAt: string | null;
};
