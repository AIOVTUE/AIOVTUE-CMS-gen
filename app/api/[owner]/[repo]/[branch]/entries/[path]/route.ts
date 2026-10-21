import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { readFns } from "@/fields/registry-schema";
import { deepMap, getSchemaByName } from "@/lib/schema";
import { parse, splitFrontmatterSource } from "@/lib/serialization";
import {
  normalizeFriendLinksDocument,
  parseFriendLinksSource,
} from "@/lib/friend-links-map";
import { getConfig } from "@/lib/config-store";
import { getFileExtension, getFileName, normalizePath } from "@/lib/utils/file";
import { isPathWithinRoot } from "@/lib/utils/path-scope";
import { decodeAndNormalizeRepoPath } from "@/lib/security/route-path";
import { assertGithubIdentity } from "@/lib/authz-shared";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { isFilesystemRepoRef, isLocalRepoRef } from "@/lib/local-repo/config";
import { readDeferredFile } from "@/lib/staged-writes/read";
import { getDeferredDirectoryEntries } from "@/lib/staged-writes/list";
import { getParentPath } from "@/lib/utils/file";
import { configObjectToPagesYml } from "@/lib/menu-settings/apply";
import {
  EXCALIDRAW_COLLECTION,
  formatExcalidrawJson,
  isBlankBody,
  pickExcalidrawPath,
} from "@/lib/excalidraw-bundle";
import { logServerError, scrubSecrets } from "@/lib/security/scrub-secrets";

/**
 * Fetches and parses individual file contents from GitHub repositories
 * (usually for editing).
 * 
 * GET /api/[owner]/[repo]/[branch]/entries/[path]?name=[schemaName]
 * 
 * Requires authentication. If no schema name is provided, we return the raw
 * contents.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");
    const metaOnly =
      searchParams.get("meta") === "true" ||
      searchParams.get("meta") === "1";
    
    const normalizedPath = decodeAndNormalizeRepoPath(params.path);
    if (normalizedPath === ".pages.yml") {
      if (!isLocalRepoRef(params.owner, params.repo)) {
        assertGithubIdentity(user, "Only GitHub users can access settings.");
      }
    }

    if (!name && normalizedPath !== ".pages.yml") {
      throw createHttpError("If no content entry name is provided, the path must be \".pages.yml\".", 400);
    }

    // CMS config is DB-backed (builtin + overlays). Do not read Hugo `.pages.yml`.
    if (!name && normalizedPath === ".pages.yml") {
      const cachedConfig = await getConfig(params.owner, params.repo, params.branch, {
        getToken: async () => token,
      });
      if (!cachedConfig) {
        throw createHttpError("Config not found.", 404);
      }
      if (metaOnly) {
        return Response.json({
          status: "success",
          data: {
            sha: cachedConfig.sha ?? null,
            version: cachedConfig.version ?? null,
            lastCheckedAt: cachedConfig.lastCheckedAt ?? null,
          },
        });
      }
      return Response.json({
        status: "success",
        data: {
          sha: cachedConfig.sha,
          name: ".pages.yml",
          path: ".pages.yml",
          contentObject: {
            body: configObjectToPagesYml(cachedConfig.object as Record<string, any>),
          },
        },
      });
    }

    let config;
    let schema;

    config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config) throw createHttpError(`Config not found for ${params.owner}/${params.repo}/${params.branch}.`, 404);

    schema = getSchemaByName(config.object, name!);
    if (!schema) throw createHttpError(`Schema not found for ${name}.`, 404);

    if (!isPathWithinRoot(normalizedPath, schema.path)) throw createHttpError(`Invalid path "${params.path}" for ${schema.type} "${name}".`, 400);

    const isGitkeepPath = getFileName(normalizedPath) === ".gitkeep";
    // Empty extension = accept any file (source-folder / raw editors).
    const requiredExtension =
      typeof schema.extension === "string" ? schema.extension : "";
    if (
      !isGitkeepPath &&
      requiredExtension !== "" &&
      getFileExtension(normalizedPath) !== requiredExtension
    ) {
      throw createHttpError(`Invalid extension "${getFileExtension(normalizedPath)}" for ${schema.type} "${name}".`, 400);
    }
    
    let content: string;
    let fileMeta: { sha: string; name: string; path: string };

    if (isFilesystemRepoRef(params.owner, params.repo)) {
      try {
        const file = await readDeferredFile(
          {
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
          },
          normalizedPath,
          { token },
        );
        content = file.content;
        fileMeta = {
          sha: file.sha,
          name: normalizedPath.split("/").pop() || normalizedPath,
          path: file.path,
        };
      } catch (error: any) {
        if (error?.status === 404) {
          throw createHttpError("Not found", 404);
        }
        throw error;
      }
    } else {
      const octokit = createOctokitInstance(token);
      let response;
      try {
        response = await octokit.rest.repos.getContent({
          owner: params.owner,
          repo: params.repo,
          path: normalizedPath,
          ref: params.branch
        });
      } catch (error: any) {
        if (error?.status === 404) {
          throw createHttpError("Not found", 404);
        }
        throw error;
      }
      
      if (Array.isArray(response.data)) {
        throw createHttpError("Expected a file but found a directory", 400);
      } else if (response.data.type !== "file") {
        throw createHttpError("Invalid response type", 500);
      }

      content = Buffer.from(response.data.content, "base64").toString();
      fileMeta = {
        sha: response.data.sha,
        name: response.data.name,
        path: response.data.path,
      };
    }

    const isGitkeep = getFileName(normalizedPath) === ".gitkeep";
    let contentObject = name && !isGitkeep
      ? parseContent(content, schema, config)
      : { body: content };

    if (
      name === EXCALIDRAW_COLLECTION &&
      !isGitkeep &&
      isBlankBody(contentObject.body)
    ) {
      const ref = {
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
      };
      const bundleDir = getParentPath(normalizedPath);
      const entries = await getDeferredDirectoryEntries(ref, bundleDir);
      const siblingNames = entries
        .filter((entry) => entry.type === "file")
        .map((entry) => entry.name);
      const excalidrawPath = pickExcalidrawPath(normalizedPath, siblingNames);
      const bundled = entries.find((entry) => entry.path === excalidrawPath);

      if (bundled?.content) {
        contentObject = {
          ...contentObject,
          body: formatExcalidrawJson(bundled.content),
        };
      } else {
        try {
          const excalidrawFile = await readDeferredFile(ref, excalidrawPath, {
            token,
          });
          contentObject = {
            ...contentObject,
            body: formatExcalidrawJson(excalidrawFile.content),
          };
        } catch {
          // No sibling .excalidraw file yet.
        }
      }
    }

    const frontmatterFormats = [
      "yaml-frontmatter",
      "json-frontmatter",
      "toml-frontmatter",
    ];
    const frontmatterRaw =
      name &&
      !isGitkeep &&
      frontmatterFormats.includes(schema.format)
        ? splitFrontmatterSource(content, {
            format: schema.format,
            delimiters: schema.delimiters,
          }).frontmatter
        : null;

    const sourceRaw =
      name && !isGitkeep && schema?.template === "friend-links"
        ? content
        : null;

    return Response.json({
      status: "success",
      data: {
        sha: fileMeta.sha,
        name: fileMeta.name,
        path: fileMeta.path,
        contentObject,
        frontmatterRaw,
        sourceRaw,
      }
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/entries/[path] GET");
    return toErrorResponse(error);
  }
}

// Parse the entry into an object based on the content schema.
const parseContent = (
  content: string,
  schema: Record<string, any>,
  config: Record<string, any>
) => {
  const serializedTypes = [
    "yaml-frontmatter",
    "json-frontmatter",
    "toml-frontmatter",
    "yaml",
    "json",
    "toml",
    "javascript",
  ];
  
  let contentObject: Record<string, any> = {};

  if (serializedTypes.includes(schema && schema.format) && schema.fields && schema.fields.length > 0) {
    // If we are dealing with a serialized format and we have fields defined
    try {
      const parsedObject =
        schema.template === "friend-links"
          ? parseFriendLinksSource(content, schema.format || "yaml")
          : parse(content, {
              format: schema.format,
              delimiters: schema.delimiters,
            });

      // Friend-links template: coerce flat arrays / links[] into linkGroups + fieldMap.
      let mappedInput: Record<string, any> = parsedObject;
      if (schema.template === "friend-links") {
        const linkField = Array.isArray(schema.fields)
          ? schema.fields.find((field: any) => field?.name === "linkGroups")
          : null;
        const fieldMap =
          schema.fieldMap ?? linkField?.options?.fieldMap ?? null;
        const groupMap =
          schema.groupMap ?? linkField?.options?.groupMap ?? null;
        const { document } = normalizeFriendLinksDocument(
          parsedObject,
          fieldMap,
          groupMap,
        );
        mappedInput = document;
      }

      // We resort to the same trick as with the client, wrapping things in a listWrapper object if we're dealing with a list at the root
      let entryFields;
      if (schema.list) {
        mappedInput = { listWrapper: mappedInput };
        entryFields = [{
          name: "listWrapper",
          type: "object",
          list: true,
          fields: schema.fields
        }]
      } else {
        entryFields = schema.fields;
      }

      const mappedObject = deepMap(
        mappedInput,
        entryFields,
        (value, field) => {
          const type = field.type;
          if (typeof type === 'string' && readFns[type]) {
            return readFns[type](value, field, config);
          }
          return value;
        }
      );
      if (schema.list) {
        contentObject = mappedObject.listWrapper;
      } else if (schema.template === "friend-links") {
        contentObject = { ...mappedInput, ...mappedObject };
      } else {
        // Keep custom/unknown frontmatter keys the schema does not declare yet.
        contentObject = {
          ...(parsedObject && typeof parsedObject === "object" && !Array.isArray(parsedObject)
            ? parsedObject
            : {}),
          ...mappedObject,
        };
      }
    } catch (error: any) {
      throw createHttpError(`Error parsing frontmatter: ${scrubSecrets(error.message)}`, 400);
    }
  } else {
    contentObject = { body: content };
  }
  
  return contentObject; 
};
