/**
 * Lightweight config feature flags — safe for repo shell (sidebar/nav).
 * Do not import ConfigSchema or field registries from here.
 */

const resolveSettingsObject = (configObject?: Record<string, any>) => {
  if (!configObject || typeof configObject !== "object") return {};
  return configObject.settings && typeof configObject.settings === "object"
    ? configObject.settings
    : {};
};

const isConfigEnabled = (configObject?: Record<string, any>) => {
  const settings = resolveSettingsObject(configObject);

  if (typeof settings.config === "boolean") return settings.config;
  if (typeof settings.hide === "boolean") return !settings.hide;
  return true;
};

const isCacheEnabled = (configObject?: Record<string, any>) => {
  const settings = resolveSettingsObject(configObject);

  if (typeof settings.cache === "boolean") return settings.cache;
  if (typeof (configObject as any)?.cache === "boolean") {
    return Boolean((configObject as any).cache);
  }
  return false;
};

export { isCacheEnabled, isConfigEnabled, resolveSettingsObject };
