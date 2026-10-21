import { getAppConfig } from "@/lib/app-config/store";

const DEV_BASE_URL = "http://localhost:3000";

/**
 * Sync base URL for module-level metadata (fallback only).
 * Runtime code should use `getBaseUrlAsync()` / `resolveBaseUrl()`.
 */
export const getBaseUrl = () => DEV_BASE_URL;

export const getBaseUrlAsync = async () => {
  try {
    const config = await getAppConfig();
    if (config.baseUrl) return config.baseUrl.replace(/\/$/, "");
  } catch {
    // ignore
  }
  return DEV_BASE_URL;
};
