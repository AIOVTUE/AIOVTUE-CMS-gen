/**
 * CMS configuration: builtin schema + DB overlays (menus / settings).
 * Does not read or write Hugo project `.pages.yml`.
 */

import { Config } from "@/types/config";
import { db } from "@/db";
import { configTable } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { configVersion, normalizeConfig } from "@/lib/config";
import {
  BUILTIN_SHA,
  createBuiltinConfig,
  getBuiltinConfigObject,
} from "@/lib/builtin-config";
import { mergeMenusConfig, applySidebarContentDefaultsUpgrade } from "@/lib/menu-settings/defaults";

const getConfigFromDb = async (
  owner: string,
  repo: string,
  branch: string,
): Promise<Config | null> => {
  if (!owner || !repo || !branch) {
    throw new Error(`Owner, repo, and branch must all be provided.`);
  }

  const config = await db.query.configTable.findFirst({
    where: and(
      sql`lower(${configTable.owner}) = lower(${owner})`,
      sql`lower(${configTable.repo}) = lower(${repo})`,
      eq(configTable.branch, branch),
    ),
  });

  if (!config) return null;

  return {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    sha: config.sha,
    version: config.version,
    object: JSON.parse(config.object),
    lastCheckedAt: config.lastCheckedAt,
  };
};

const saveConfig = async (config: Config): Promise<Config> => {
  await db
    .insert(configTable)
    .values({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      sha: config.sha,
      version: config.version,
      object: JSON.stringify(config.object),
      lastCheckedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [configTable.owner, configTable.repo, configTable.branch],
      set: {
        sha: config.sha,
        version: config.version,
        object: JSON.stringify(config.object),
        lastCheckedAt: new Date(),
      },
    });

  return config;
};

const updateConfig = async (config: Config): Promise<Config> => {
  await db
    .update(configTable)
    .set({
      sha: config.sha,
      version: config.version,
      object: JSON.stringify(config.object),
      lastCheckedAt: new Date(),
    })
    .where(
      and(
        sql`lower(${configTable.owner}) = lower(${config.owner})`,
        sql`lower(${configTable.repo}) = lower(${config.repo})`,
        eq(configTable.branch, config.branch),
      ),
    );

  return config;
};

const touchConfigCheck = async (
  owner: string,
  repo: string,
  branch: string,
) => {
  await db
    .update(configTable)
    .set({
      lastCheckedAt: new Date(),
    })
    .where(
      and(
        sql`lower(${configTable.owner}) = lower(${owner})`,
        sql`lower(${configTable.repo}) = lower(${repo})`,
        eq(configTable.branch, branch),
      ),
    );
};

/**
 * Builtin media/settings + DB overlays.
 * Content pages start empty until the user configures templates for this project.
 */
const mergeBuiltinWithStored = (
  owner: string,
  repo: string,
  branch: string,
  stored: Config | null,
): { config: Config; shouldPersist: boolean } => {
  const builtin = getBuiltinConfigObject();
  const storedObject = stored?.object ?? {};

  const upgraded = applySidebarContentDefaultsUpgrade(
    mergeMenusConfig(storedObject.menus ?? builtin.menus),
    {
      ...(builtin.settings ?? {}),
      ...(storedObject.settings ?? {}),
    },
  );

  const hasStoredContent =
    Array.isArray(storedObject.content) && storedObject.content.length > 0;
  const hasStoredMedia =
    Array.isArray(storedObject.media) &&
    storedObject.media.some(
      (item: { input?: unknown }) =>
        typeof item?.input === "string" && item.input.trim() !== "",
    );
  // Keep user content even if a legacy upgrade cleared pagesManaged flags.
  let pagesManaged = upgraded.settings?.pagesManaged === true;
  let mediaManaged = upgraded.settings?.mediaManaged === true;
  let settingsChanged = false;
  if (
    hasStoredContent &&
    (upgraded.settings?.pagesManaged !== true ||
      upgraded.settings?.templatesConfigured !== true)
  ) {
    upgraded.settings = {
      ...upgraded.settings,
      pagesManaged: true,
      templatesConfigured: true,
    };
    pagesManaged = true;
    settingsChanged = true;
  }
  if (hasStoredMedia && upgraded.settings?.mediaManaged !== true) {
    upgraded.settings = {
      ...upgraded.settings,
      mediaManaged: true,
    };
    mediaManaged = true;
    settingsChanged = true;
  }

  const object = normalizeConfig({
    ...builtin,
    content:
      pagesManaged && Array.isArray(storedObject.content)
        ? storedObject.content
        : [],
    media:
      mediaManaged && Array.isArray(storedObject.media)
        ? storedObject.media
        : builtin.media,
    menus: upgraded.menus,
    settings: upgraded.settings,
  });

  return {
    config: {
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      branch,
      sha: stored?.sha ?? BUILTIN_SHA,
      version: configVersion,
      object,
      lastCheckedAt: stored?.lastCheckedAt,
    },
    shouldPersist: upgraded.changed || settingsChanged || !stored,
  };
};

type GetConfigOptions = {
  /** Kept for callers; CMS config no longer syncs from the Hugo repo. */
  sync?: boolean;
  getToken?: () => Promise<string>;
  bootstrapOnMiss?: boolean;
  ttlMs?: number;
  backgroundRefreshWhenStale?: boolean;
  /**
   * When false, never write/update the config table (soft-fail / unauthorized shells).
   * Defaults to true.
   */
  persist?: boolean;
  /**
   * When false, ignore DB overlays and return an in-memory builtin config only.
   * Use for unauthorized owner/repo shells to avoid leaking another repo's CMS menus.
   * Defaults to true.
   */
  useStored?: boolean;
};

const configSyncInFlight = new Map<string, Promise<Config | null>>();
const getConfigSyncKey = (
  owner: string,
  repo: string,
  branch: string,
  options?: Pick<GetConfigOptions, "persist" | "useStored" | "bootstrapOnMiss">,
) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}::p${options?.persist === false ? 0 : 1}::s${options?.useStored === false ? 0 : 1}::b${options?.bootstrapOnMiss === false ? 0 : 1}`;

const getConfig = async (
  owner: string,
  repo: string,
  branch: string,
  options?: GetConfigOptions,
): Promise<Config | null> => {
  const bootstrapOnMiss = options?.bootstrapOnMiss ?? true;
  const persist = options?.persist !== false;
  const useStored = options?.useStored !== false;
  const normalizedOwner = owner.toLowerCase();
  const normalizedRepo = repo.toLowerCase();
  const key = getConfigSyncKey(normalizedOwner, normalizedRepo, branch, {
    persist,
    useStored,
    bootstrapOnMiss,
  });
  const existing = configSyncInFlight.get(key);
  if (existing) return existing;

  const run = (async (): Promise<Config | null> => {
    const stored = useStored
      ? await getConfigFromDb(normalizedOwner, normalizedRepo, branch)
      : null;

    if (!stored && !bootstrapOnMiss) {
      return createBuiltinConfig(normalizedOwner, normalizedRepo, branch);
    }

    const { config: merged, shouldPersist } = mergeBuiltinWithStored(
      normalizedOwner,
      normalizedRepo,
      branch,
      stored,
    );

    if (persist && shouldPersist) {
      // Re-merge under the write lock so we never clobber a concurrent PUT/DELETE.
      return withCmsConfigLock(
        normalizedOwner,
        normalizedRepo,
        branch,
        async () => {
          const latestStored = useStored
            ? await getConfigFromDb(normalizedOwner, normalizedRepo, branch)
            : null;
          const latest = mergeBuiltinWithStored(
            normalizedOwner,
            normalizedRepo,
            branch,
            latestStored,
          );
          if (!latest.shouldPersist) return latest.config;

          if (latestStored) {
            await updateConfig({
              ...latest.config,
              sha: latestStored.sha?.startsWith("cms-")
                ? `cms-${Date.now().toString(36)}`
                : latest.config.sha,
            });
          } else {
            await saveConfig({
              ...latest.config,
              sha: BUILTIN_SHA,
              object: latest.config.object,
            });
          }
          return latest.config;
        },
      );
    }

    return merged;
  })();

  configSyncInFlight.set(key, run);
  try {
    return await run;
  } finally {
    configSyncInFlight.delete(key);
  }
};

const cmsSaveChain = new Map<string, Promise<unknown>>();

/** Serialize CMS config writes per repo/branch to avoid lost updates. */
const withCmsConfigLock = async <T>(
  owner: string,
  repo: string,
  branch: string,
  run: () => Promise<T>,
): Promise<T> => {
  const key = `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;
  const previous = cmsSaveChain.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  cmsSaveChain.set(key, chained);
  await previous.catch(() => undefined);
  try {
    return await run();
  } finally {
    release();
    if (cmsSaveChain.get(key) === chained) {
      cmsSaveChain.delete(key);
    }
  }
};

/** Persist CMS overlays (menus / settings / optional custom content pages). */
const persistCmsConfigObject = async (
  owner: string,
  repo: string,
  branch: string,
  object: Record<string, any>,
): Promise<Config> => {
  const normalizedOwner = owner.toLowerCase();
  const normalizedRepo = repo.toLowerCase();
  const builtin = getBuiltinConfigObject();
  const hasContent =
    Array.isArray(object.content) && object.content.length > 0;
  const hasMedia =
    Array.isArray(object.media) &&
    object.media.some(
      (item: { input?: unknown }) =>
        typeof item?.input === "string" && item.input.trim() !== "",
    );
  const pagesManaged =
    object.settings?.pagesManaged === true ||
    object.settings?.templatesConfigured === true ||
    hasContent;
  const mediaManaged =
    object.settings?.mediaManaged === true || hasMedia;

  const nextObject = normalizeConfig({
    ...builtin,
    content:
      pagesManaged && Array.isArray(object.content)
        ? object.content
        : [],
    media:
      mediaManaged && Array.isArray(object.media)
        ? object.media
        : builtin.media,
    menus: mergeMenusConfig(object.menus ?? builtin.menus),
    settings: {
      ...(builtin.settings ?? {}),
      ...(object.settings ?? {}),
      pagesManaged,
      mediaManaged,
      ...(pagesManaged ? { templatesConfigured: true } : {}),
    },
  });

  const nextConfig: Config = {
    owner: normalizedOwner,
    repo: normalizedRepo,
    branch,
    sha: `cms-${Date.now().toString(36)}`,
    version: configVersion,
    object: nextObject,
    lastCheckedAt: new Date(),
  };

  const existing = await getConfigFromDb(
    normalizedOwner,
    normalizedRepo,
    branch,
  );
  if (existing) {
    await updateConfig(nextConfig);
  } else {
    await saveConfig(nextConfig);
  }

  return nextConfig;
};

/** Persist CMS overlays (menus / settings / optional custom content pages). */
const saveCmsConfigObject = async (
  owner: string,
  repo: string,
  branch: string,
  object: Record<string, any>,
): Promise<Config> =>
  withCmsConfigLock(owner, repo, branch, () =>
    persistCmsConfigObject(owner, repo, branch, object),
  );

/** Clear configured content templates / media path (when a new project path is selected). */
const resetProjectContentPages = async (
  owner: string,
  repo: string,
  branch: string,
): Promise<void> => {
  const stored = await getConfigFromDb(owner, repo, branch);
  await saveCmsConfigObject(owner, repo, branch, {
    ...(stored?.object ?? {}),
    content: [],
    media: undefined,
    settings: {
      ...(stored?.object?.settings ?? {}),
      pagesManaged: false,
      templatesConfigured: false,
      mediaManaged: false,
    },
  });
};

export {
  getConfig,
  saveConfig,
  updateConfig,
  touchConfigCheck,
  saveCmsConfigObject,
  persistCmsConfigObject,
  withCmsConfigLock,
  resetProjectContentPages,
  mergeBuiltinWithStored,
  getConfigFromDb,
};
