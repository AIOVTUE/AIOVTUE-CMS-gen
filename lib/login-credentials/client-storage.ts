const STORAGE_KEY = "pagescms:login-credentials";
const STORAGE_VERSION = 1;
const PBKDF2_ITERATIONS = 120_000;
const MAX_STORAGE_BYTES = 8192;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;

export type SavedLoginCredentials = {
  email: string;
  password: string;
};

type StoredPayload = {
  v: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const getPassphrase = () => {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}:pagescms:login-v1`;
};

const isValidStoredPayload = (value: unknown): value is StoredPayload => {
  if (!value || typeof value !== "object") return false;

  const payload = value as Record<string, unknown>;
  return (
    payload.v === STORAGE_VERSION &&
    typeof payload.salt === "string" &&
    typeof payload.iv === "string" &&
    typeof payload.ciphertext === "string" &&
    payload.salt.length > 0 &&
    payload.salt.length <= 64 &&
    payload.iv.length > 0 &&
    payload.iv.length <= 32 &&
    payload.ciphertext.length > 0 &&
    payload.ciphertext.length <= 4096
  );
};

const deriveKey = async (salt: Uint8Array) => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getPassphrase()),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const encryptCredentials = async (credentials: SavedLoginCredentials) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  const payload: StoredPayload = {
    v: STORAGE_VERSION,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const decryptCredentials = async (
  payload: StoredPayload,
): Promise<SavedLoginCredentials | null> => {
  try {
    const key = await deriveKey(fromBase64(payload.salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.ciphertext),
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as {
      email?: unknown;
      password?: unknown;
    };

    if (typeof parsed.email !== "string" || typeof parsed.password !== "string") {
      return null;
    }

    const email = parsed.email.trim().toLowerCase();
    const password = parsed.password;

    if (
      !email ||
      !password ||
      email.length > MAX_EMAIL_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      return null;
    }

    return { email, password };
  } catch {
    return null;
  }
};

export const hasSavedLoginCredentials = () => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
};

export const loadSavedLoginCredentials = async () => {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > MAX_STORAGE_BYTES) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const payload = JSON.parse(raw) as unknown;
    if (!isValidStoredPayload(payload)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const credentials = await decryptCredentials(payload);
    if (!credentials) {
      localStorage.removeItem(STORAGE_KEY);
    }
    return credentials;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const saveLoginCredentials = async (
  credentials: SavedLoginCredentials,
) => {
  if (typeof window === "undefined") return;

  const email = credentials.email.trim().toLowerCase();
  const password = credentials.password;

  if (
    !email ||
    !password ||
    email.length > MAX_EMAIL_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    clearSavedLoginCredentials();
    return;
  }

  await encryptCredentials({ email, password });
};

export const clearSavedLoginCredentials = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
};
