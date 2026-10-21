export type EmailProvider = "resend" | "smtp" | "";

/** Decrypted runtime config used by auth / mailer / GitHub App. */
export type AppConfig = {
  setupComplete: boolean;
  baseUrl: string;
  authSecret: string;
  githubAppId: string;
  githubAppName: string;
  githubAppClientId: string;
  githubAppClientSecret: string;
  githubAppPrivateKey: string;
  githubAppWebhookSecret: string;
  emailProvider: EmailProvider;
  emailFrom: string;
  resendApiKey: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  adminEmails: string;
  githubAllowedUsernames: string;
};

/** Non-secret fields safe to return to the setup UI. */
export type AppConfigPublic = {
  setupComplete: boolean;
  baseUrl: string;
  githubAppId: string;
  githubAppName: string;
  githubAppClientId: string;
  hasAuthSecret: boolean;
  hasGithubAppClientSecret: boolean;
  hasGithubAppPrivateKey: boolean;
  hasGithubAppWebhookSecret: boolean;
  emailProvider: EmailProvider;
  emailFrom: string;
  hasResendApiKey: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPassword: boolean;
  adminEmails: string;
  githubAllowedUsernames: string;
};

export type AppConfigInput = {
  baseUrl: string;
  authSecret?: string;
  githubAppId: string;
  githubAppName: string;
  githubAppClientId: string;
  githubAppClientSecret?: string;
  githubAppPrivateKey?: string;
  githubAppWebhookSecret?: string;
  emailProvider: EmailProvider;
  emailFrom: string;
  resendApiKey?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  adminEmails: string;
  githubAllowedUsernames?: string;
  /** Keep existing secret when the field is omitted / blank. */
  keepSecrets?: boolean;
};
