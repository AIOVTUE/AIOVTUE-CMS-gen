/**
 * AES-GCM helpers for secrets at rest (GitHub tokens, AI API keys).
 *
 * CRYPTO_KEY may be:
 * - base64 of 16 / 24 / 32 raw bytes (preferred), or
 * - any string — hashed with SHA-256 to a 32-byte key
 */

const AES_LENGTHS = new Set([16, 24, 32]);

const tryDecodeBase64Key = (value: string): Uint8Array | null => {
  try {
    const normalized = value.replace(/\s+/g, "");
    // atob throws on invalid base64; Buffer is more tolerant of padding.
    const raw =
      typeof Buffer !== "undefined"
        ? new Uint8Array(Buffer.from(normalized, "base64"))
        : Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
    if (!AES_LENGTHS.has(raw.byteLength)) return null;
    return raw;
  } catch {
    return null;
  }
};

const deriveKeyMaterial = async (secret: string): Promise<Uint8Array> => {
  const fromBase64 = tryDecodeBase64Key(secret);
  if (fromBase64) return fromBase64;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return new Uint8Array(digest);
};

const importKey = async (secret: string) => {
  const rawKey = await deriveKeyMaterial(secret);
  const bitLength = rawKey.byteLength * 8;
  if (bitLength !== 128 && bitLength !== 192 && bitLength !== 256) {
    throw new Error(
      "CRYPTO_KEY 无效：请使用任意字符串，或 base64 编码的 16/24/32 字节密钥。",
    );
  }

  return crypto.subtle.importKey(
    "raw",
    rawKey as BufferSource,
    { name: "AES-GCM", length: bitLength },
    false,
    ["encrypt", "decrypt"],
  );
};

const toBase64 = (bytes: Uint8Array) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
};

const requireCryptoKey = () => {
  const key = process.env.CRYPTO_KEY?.trim();
  if (!key) {
    throw new Error("未配置 CRYPTO_KEY，无法加密保存 API Key。");
  }
  return key;
};

const encrypt = async (text: string) => {
  const key = await importKey(requireCryptoKey());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);

  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedText,
  );

  return {
    ciphertext: toBase64(new Uint8Array(encryptedData)),
    iv: toBase64(iv),
  };
};

const decrypt = async (ciphertext: string, iv: string) => {
  const key = await importKey(requireCryptoKey());
  const ivArray = fromBase64(iv);
  const encryptedDataArray = fromBase64(ciphertext);

  try {
    const decryptedData = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivArray },
      key,
      encryptedDataArray,
    );
    return new TextDecoder().decode(decryptedData);
  } catch {
    throw new Error(
      "解密失败：CRYPTO_KEY 可能已变更，请重新填写并保存 API Key。",
    );
  }
};

export { encrypt, decrypt };
