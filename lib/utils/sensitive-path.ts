import { normalizePath } from "@/lib/utils/file";

const SENSITIVE_BASENAMES = new Set([
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa.pub",
  "id_ed25519.pub",
  "credentials.json",
  "credentials",
  "credentials.yml",
  "credentials.yaml",
  "service-account.json",
  "google-services.json",
  "auth.json",
  "secrets.json",
  "secrets.yaml",
  "secrets.yml",
  ".npmrc",
  ".pypirc",
  ".envrc",
  "netrc",
  ".netrc",
  "authorized_keys",
  "known_hosts",
  "shadow",
  "passwd",
  "wrangler.toml",
  ".dev.vars",
]);

const SENSITIVE_EXTENSIONS = [
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".asc",
];

const SENSITIVE_DIR_SEGMENTS = new Set([
  ".git",
  ".ssh",
  ".gnupg",
  ".svn",
  ".hg",
  ".aws",
  ".docker",
  ".kube",
  ".azure",
  ".terraform",
  ".vault",
]);

/** Block access to VCS metadata and common secret files via raw/preview endpoints. */
export const isSensitiveRepoPath = (filePath: string) => {
  const normalized = normalizePath(filePath).toLowerCase();
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) return true;
  if (filePath.includes("\0")) return true;
  if (segments.some((segment) => SENSITIVE_DIR_SEGMENTS.has(segment))) {
    return true;
  }
  if (
    segments.some(
      (segment) =>
        segment === ".env" ||
        segment.startsWith(".env.") ||
        segment === ".envrc" ||
        segment.endsWith(".env"),
    )
  ) {
    return true;
  }

  const basename = segments[segments.length - 1] ?? "";
  if (SENSITIVE_BASENAMES.has(basename)) return true;
  if (basename.startsWith("id_") && !basename.includes(".")) return true;
  if (SENSITIVE_EXTENSIONS.some((ext) => basename.endsWith(ext))) return true;
  if (basename.endsWith(".pem.bak") || basename.endsWith(".key.bak")) return true;
  if (/^secrets?\.(ya?ml|json|toml|env)$/i.test(basename)) return true;

  return false;
};

/** True when the normalized path is empty or blocked. */
export const isBlockedRepoPath = (normalizedPath: string) =>
  !normalizedPath || isSensitiveRepoPath(normalizedPath);
