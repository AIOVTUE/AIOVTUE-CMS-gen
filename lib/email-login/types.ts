export type EmailLoginSettingsPublic = {
  enabled: boolean;
  /** Masked email when credentials are configured; null otherwise. */
  emailMasked: string | null;
  hasCredentials: boolean;
  updatedAt: string | null;
};
