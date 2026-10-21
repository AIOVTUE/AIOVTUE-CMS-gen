import { type NextRequest } from "next/server";
import { isContentOperationAllowed } from "@/lib/operations";
import { writeFns } from "@/fields/registry-schema";
import { parseConfig, normalizeConfig } from "@/lib/config";
import YAML from "yaml";
import {
  stringify,
  parse,
  composeFrontmatterFile,
  serialize,
} from "@/lib/serialization";
import {
  denormalizeFriendLinksDocument,
  detectFriendLinksShape,
  parseFriendLinksSource,
  stringifyFriendLinksSource,
  type FriendLinksShape,
} from "@/lib/friend-links-map";
import { deepMap, generateZodSchema, getSchemaByName, sanitizeObject } from "@/lib/schema";
import {
  getConfig,
  getConfigFromDb,
  persistCmsConfigObject,
  saveCmsConfigObject,
  withCmsConfigLock,
} from "@/lib/config-store";
import {
  applyContentLeavesToTree,
  flattenContentLeaves,
} from "@/lib/page-templates";
import {
  normalizeSourceFiles,
  serializeSourceFiles,
} from "@/lib/source-files";
import { getFileExtension, getFileName, normalizePath, serializedTypes, getParentPath } from "@/lib/utils/file";
import {
  assertNonEmptyPathRoot,
  isPathWithinRoot,
} from "@/lib/utils/path-scope";
import { decodeAndNormalizeRepoPath } from "@/lib/security/route-path";
import { assertGithubIdentity } from "@/lib/authz-shared";
import { getWriteToken } from "@/lib/token";
import { updateFileCache } from "@/lib/github-cache-file";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import mergeWith from "lodash.mergewith";
import { resolveCommitIdentity } from "@/lib/commit-message";
import { requireApiUserSession } from "@/lib/session-server";
import { saveDeferredFile, deleteDeferredFile } from "@/lib/staged-writes/save";
import { readDeferredFile } from "@/lib/staged-writes/read";
import {
  EXCALIDRAW_COLLECTION,
  formatExcalidrawJson,
  getDefaultExcalidrawPath,
} from "@/lib/excalidraw-bundle";
import { logServerError } from "@/lib/security/scrub-secrets";
import { getBuiltinConfigObject } from "@/lib/builtin-config";
import { mergeMenusConfig } from "@/lib/menu-settings/defaults";

/**
 * Create, update and delete individual files in a GitHub repository.
 * 
 * POST /api/[owner]/[repo]/[branch]/files/[path]
 * DELETE /api/[owner]/[repo]/[branch]/files/[path]
 * 
 * Requires authentication.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getWriteToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    const normalizedPath = decodeAndNormalizeRepoPath(params.path);

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config && normalizedPath !== ".pages.yml") throw new Error(`Config not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const data: any = await request.json();
    const onConflict = data.onConflict === "error" ? "error" : "rename";

    let contentBase64;
    let schema;
    let schemaCommitTemplates: Record<string, string> | undefined;
    let schemaCommitIdentity: "app" | "user" | undefined;

    switch (data.type) {
      case "content":
        if (!data.name) throw new Error(`"name" is required for content.`);

        schema = getSchemaByName(config?.object, data.name);
        if (!schema) throw new Error(`Content schema not found for ${data.name}.`);
        if (!data.sha && !isContentOperationAllowed("create", { schema })) {
          throw createHttpError(`Creating entries isn't allowed for "${data.name}".`, 403);
        }
        schemaCommitTemplates = schema?.commit?.templates;
        schemaCommitIdentity = schema?.commit?.identity;

        if (!isPathWithinRoot(normalizedPath, schema.path)) throw new Error(`Invalid path "${params.path}" for ${data.type} "${data.name}".`);

        if (schema.subfolders === false && getParentPath(normalizedPath) !== schema.path) {
          throw new Error(`Subfolders are not allowed for collection "${data.name}".`);
        }

        if (getFileName(normalizedPath) === ".gitkeep") {
          // Folder creation
          contentBase64 = "";
        } else {
          {
            const requiredExtension =
              typeof schema.extension === "string" ? schema.extension : "";
            if (
              requiredExtension !== "" &&
              getFileExtension(normalizedPath) !== requiredExtension
            ) {
              throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${data.type} "${data.name}".`);
            }
          }

          if (serializedTypes.includes(schema.format) && schema.fields) {
            let contentFields;
            let contentObject;
            let frontmatterRaw: string | null = null;
            let friendLinksSourceRaw: string | null = null;

            // Wrapping things in listWrapper to deal with lists at the root
            if (schema.list) {
              contentObject = { listWrapper: data.content };
              contentFields = [{
                name: "listWrapper",
                type: "object",
                list: true,
                fields: schema.fields
              }]
            } else {
              const incoming =
                data.content && typeof data.content === "object"
                  ? { ...(data.content as Record<string, unknown>) }
                  : data.content;
              if (
                incoming &&
                typeof incoming === "object" &&
                typeof (incoming as Record<string, unknown>).__frontmatterRaw === "string"
              ) {
                frontmatterRaw = (incoming as Record<string, unknown>)
                  .__frontmatterRaw as string;
                delete (incoming as Record<string, unknown>).__frontmatterRaw;
              }
              if (
                incoming &&
                typeof incoming === "object" &&
                typeof (incoming as Record<string, unknown>)
                  .__friendLinksSourceRaw === "string"
              ) {
                friendLinksSourceRaw = (incoming as Record<string, unknown>)
                  .__friendLinksSourceRaw as string;
                delete (incoming as Record<string, unknown>)
                  .__friendLinksSourceRaw;
              }
              contentObject = incoming;
              contentFields = schema.fields;
            }
            
            // Front matter may use YAML null for empty optional scalars (cover/layout).
            const contentForValidation =
              contentObject && typeof contentObject === "object" && !Array.isArray(contentObject)
                ? Object.fromEntries(
                    Object.entries(contentObject as Record<string, unknown>).map(
                      ([key, value]) => [key, value === null ? undefined : value],
                    ),
                  )
                : contentObject;

            // Raw YAML / article / posts: attributes may be left empty (title etc.).
            const relaxMetaRequired =
              typeof frontmatterRaw === "string" ||
              schema.template === "article" ||
              data.name === "posts";

            let parsedContent: Record<string, unknown> =
              contentForValidation &&
              typeof contentForValidation === "object" &&
              !Array.isArray(contentForValidation)
                ? (contentForValidation as Record<string, unknown>)
                : {};

            // Raw frontmatter text is authoritative — skip schema meta validation.
            if (typeof frontmatterRaw !== "string") {
              const fieldsForValidation =
                relaxMetaRequired && Array.isArray(contentFields)
                  ? contentFields.map(
                      (field: { name?: string; required?: boolean }) =>
                        field?.name === "body"
                          ? field
                          : { ...field, required: false },
                    )
                  : contentFields;
              const zodSchema = generateZodSchema(fieldsForValidation);
              const zodValidation = zodSchema.safeParse(contentForValidation);

              if (zodValidation.success === false) {
                const errorMessages = zodValidation.error.errors.map(
                  (error: any) => {
                    let message = error.message;
                    if (error.path.length > 0) {
                      message = `${message} at ${error.path.join(".")}`;
                    }
                    return message;
                  },
                );
                throw new Error(
                  `Content validation failed: ${errorMessages.join(", ")}`,
                );
              }
              parsedContent = zodValidation.data as Record<string, unknown>;
            }

            const validatedContentObject = deepMap(
              parsedContent,
              contentFields,
              (value, field) => {
                const fieldType = field.type as string;
                return writeFns[fieldType] ? writeFns[fieldType](value, field, config || {}) : value;
              }
            );

            const unwrappedContentObject = schema.list
              ? validatedContentObject.listWrapper
              : validatedContentObject;

            let finalContentObject = JSON.parse(JSON.stringify(unwrappedContentObject));

            if (config?.object?.settings?.content?.merge && data.sha && !schema.list) {
              const existingFile = await readDeferredFile(
                {
                  owner: params.owner,
                  repo: params.repo,
                  branch: params.branch,
                },
                normalizedPath,
                { token },
              );
              const existingContentObject = parse(existingFile.content, {
                format: schema.format,
                delimiters: schema.delimiters,
              });

              finalContentObject = mergeWith({}, existingContentObject, unwrappedContentObject, (objValue: any, srcValue: any) => {
                if (Array.isArray(srcValue)) {
                  return srcValue;
                }
              });
            }

            if (data.name === EXCALIDRAW_COLLECTION && !schema.list) {
              const bodyJson =
                typeof finalContentObject.body === "string"
                  ? finalContentObject.body.trim()
                  : "";
              if (bodyJson) {
                const excalidrawPath = getDefaultExcalidrawPath(normalizedPath);
                await saveDeferredFile(
                  {
                    owner: params.owner,
                    repo: params.repo,
                    branch: params.branch,
                  },
                  excalidrawPath,
                  Buffer.from(formatExcalidrawJson(bodyJson), "utf8"),
                  { token },
                );
                finalContentObject.body = "";
              }
            }
            
            let stringifiedContentObject: string;
            if (schema.template === "friend-links" && !schema.list) {
              if (typeof friendLinksSourceRaw === "string") {
                // User edited the on-disk source text; write it verbatim after a parse check.
                try {
                  parseFriendLinksSource(
                    friendLinksSourceRaw,
                    schema.format || "yaml",
                  );
                } catch (error) {
                  throw createHttpError(
                    error instanceof Error
                      ? `友链源文件解析失败：${error.message}`
                      : "友链源文件解析失败。",
                    400,
                  );
                }
                stringifiedContentObject = friendLinksSourceRaw.endsWith("\n")
                  ? friendLinksSourceRaw
                  : `${friendLinksSourceRaw}\n`;
              } else {
                const linkField = Array.isArray(schema.fields)
                  ? schema.fields.find((field: any) => field?.name === "linkGroups")
                  : null;
                const fieldMap =
                  schema.fieldMap ?? linkField?.options?.fieldMap ?? null;
                const groupMap =
                  schema.groupMap ?? linkField?.options?.groupMap ?? null;
                let shape: FriendLinksShape = "linkGroups";
                let existingSourceText: string | undefined;
                if (data.sha) {
                  try {
                    const existingFile = await readDeferredFile(
                      {
                        owner: params.owner,
                        repo: params.repo,
                        branch: params.branch,
                      },
                      normalizedPath,
                      { token },
                    );
                    existingSourceText = existingFile.content;
                    shape = detectFriendLinksShape(
                      parseFriendLinksSource(
                        existingFile.content,
                        schema.format || "yaml",
                      ),
                      groupMap ?? {},
                    );
                  } catch {
                    shape = "root-array";
                  }
                } else {
                  shape = "root-array";
                }
                const output = denormalizeFriendLinksDocument(
                  finalContentObject,
                  fieldMap,
                  shape,
                  groupMap,
                );
                if (schema.format === "javascript") {
                  stringifiedContentObject = stringifyFriendLinksSource(
                    output,
                    "javascript",
                    { templateSource: existingSourceText },
                  );
                } else {
                  const isRootArrayShape =
                    shape === "root-array" || shape === "groups-array";
                  if (isRootArrayShape) {
                    if (schema.format === "json") {
                      stringifiedContentObject = `${JSON.stringify(output, null, 2)}\n`;
                    } else if (schema.format === "toml") {
                      // TOML has no root array; fall back to linkGroups object.
                      stringifiedContentObject = serialize(
                        Array.isArray(output)
                          ? { linkGroups: output }
                          : (output as Record<string, any>),
                        "toml",
                      );
                    } else {
                      stringifiedContentObject = Array.isArray(output)
                        ? YAML.stringify(output)
                        : serialize(output as Record<string, any>, "yaml");
                    }
                    if (
                      stringifiedContentObject &&
                      !stringifiedContentObject.endsWith("\n")
                    ) {
                      stringifiedContentObject += "\n";
                    }
                  } else if (schema.format === "json") {
                    stringifiedContentObject = stringifyFriendLinksSource(
                      output,
                      "json",
                    );
                  } else {
                    stringifiedContentObject = stringify(
                      sanitizeObject(output as Record<string, any>),
                      {
                        format: schema.format,
                        delimiters: schema.delimiters,
                      },
                    );
                  }
                }
              }
            } else if (frontmatterRaw != null && !schema.list) {
              stringifiedContentObject = composeFrontmatterFile(
                frontmatterRaw,
                typeof finalContentObject.body === "string"
                  ? finalContentObject.body
                  : "",
                {
                  format: schema.format,
                  delimiters: schema.delimiters,
                },
              );
            } else {
              stringifiedContentObject = stringify(
                sanitizeObject(finalContentObject),
                {
                  format: schema.format,
                  delimiters: schema.delimiters,
                },
              );
            }
            contentBase64 = Buffer.from(stringifiedContentObject).toString("base64");
          } else {
            contentBase64 = Buffer.from(data.content.body ?? "").toString("base64");
          }
        }
        break;
      case "media":
        if (!data.name) throw new Error(`"name" is required for media.`);

        schema = getSchemaByName(config?.object, data.name, "media");
        if (!schema) throw new Error(`Media schema not found for ${data.name}.`);
        schemaCommitTemplates = schema?.commit?.templates;
        schemaCommitIdentity = schema?.commit?.identity;

        assertNonEmptyPathRoot(schema.input ?? "", "media input");
        if (!isPathWithinRoot(normalizedPath, schema.input)) throw new Error(`Invalid path "${params.path}" for media "${data.name}".`);
        
        if (getFileName(normalizedPath) === ".gitkeep") {
          // Folder creation
          contentBase64 = "";
        } else {
          if (
            schema.extensions?.length > 0 &&
            !schema.extensions.includes(getFileExtension(normalizedPath))
          ) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for media.`);

          contentBase64 = data.content;
        }
        break;
      case "settings": {
        // CMS config lives in DB (builtin + overlays). Do not write Hugo `.pages.yml`.
        assertGithubIdentity(user, "Only GitHub users can manage settings.");
        if (normalizedPath !== ".pages.yml") {
          throw new Error(`Invalid path "${params.path}" for settings.`);
        }
        if (!data.sha && !isContentOperationAllowed("create", { scope: "settings" })) {
          throw createHttpError(`Creating the settings file isn't allowed.`, 403);
        }

        const rawBody =
          typeof data.content?.body === "string" ? data.content.body : "";
        let configObject: Record<string, any>;
        if (rawBody.trim()) {
          const parsedConfig = parseConfig(rawBody);
          configObject = normalizeConfig(parsedConfig.document.toJSON());
        } else {
          configObject = getBuiltinConfigObject();
        }

        const builtin = getBuiltinConfigObject();
        const newConfig = await saveCmsConfigObject(
          params.owner,
          params.repo,
          params.branch,
          {
            menus: mergeMenusConfig(configObject.menus ?? builtin.menus),
            settings: {
              ...(builtin.settings ?? {}),
              ...(configObject.settings ?? {}),
            },
          },
        );

        return Response.json({
          status: "success",
          message: `Settings saved for ${params.owner}/${params.repo}`,
          data: {
            type: "file",
            path: ".pages.yml",
            sha: newConfig.sha,
            name: ".pages.yml",
            config: newConfig,
          },
        });
      }
      default:
        throw new Error(`Invalid type "${data.type}".`);
    }

    const commitIdentity = resolveCommitIdentity({
      configObject: config?.object,
      identityOverride: schemaCommitIdentity,
    });
    const committer = (
      commitIdentity === "user" &&
      user.email
    )
      ? {
          name: user.name?.trim() || user.email,
          email: user.email,
        }
      : undefined;
    
    const response = await githubSaveFile(
      token,
      params.owner,
      params.repo,
      params.branch,
      normalizedPath,
      contentBase64,
      data.sha,
      {
        configObject: config?.object,
        templatesOverride: schemaCommitTemplates,
        contentName: data.name,
        user: user.email || user.name || String(user.id || ""),
        onConflict,
        committer,
      }
    );
  
    const savedPath = response?.data.content?.path;

    if (response?.data.content && response?.data.commit) {
      await updateFileCache(
        data.type === 'content' ? 'collection' : 'media',
        params.owner,
        params.repo,
        params.branch,
        {
          type: data.sha ? 'modify' : 'add',
          path: response.data.content.path!,
          sha: response.data.content.sha!,
          content: Buffer.from(contentBase64, 'base64').toString('utf-8'),
          size: response.data.content.size,
          downloadUrl: response.data.content.download_url ?? undefined,
          commit: {
            sha: response.data.commit.sha!,
            timestamp: new Date(response.data.commit.committer?.date ?? new Date().toISOString()).getTime()
          }
        }
      );
    }

    return Response.json({
      status: "success",
      message: savedPath !== normalizedPath
        ? `File "${normalizedPath}" saved successfully but renamed to "${savedPath}" to avoid naming conflict.`
        : `File "${normalizedPath}" saved successfully.`,
      data: {
        type: response?.data.content?.type,
        sha: response?.data.content?.sha,
        name: response?.data.content?.name,
        path: savedPath,
        extension: getFileExtension(response?.data.content?.name || ""),
        size: response?.data.content?.size,
        url: response?.data.content?.download_url,
      }
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/files/[path] POST");
    return toErrorResponse(error);
  }
};

// Helper: always stage locally (disk) or in PostgreSQL — never write GitHub immediately.
const githubSaveFile = async (
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  contentBase64: string,
  sha?: string,
  _options?: {
    configObject?: Record<string, any>;
    templatesOverride?: Record<string, string>;
    contentName?: string;
    user?: string;
    onConflict?: "rename" | "error";
    committer?: { name: string; email: string };
  },
) => {
  const contentBuffer = Buffer.from(contentBase64, "base64");
  const saved = await saveDeferredFile(
    { owner, repo, branch },
    path,
    contentBuffer,
    { sha, token, isNew: !sha },
  );

  return {
    data: {
      content: {
        type: "file",
        sha: saved.sha,
        name: saved.path.split("/").pop(),
        path: saved.path,
        size: saved.size,
        download_url: null,
      },
      commit: {
        sha: saved.sha,
        committer: { date: saved.updatedAt.toISOString() },
      },
    },
  };
};

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getWriteToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    if (!isContentOperationAllowed("delete", { scope: "settings" }) && params.path === ".pages.yml") {
      throw createHttpError(`Deleting the settings file isn't allowed.`, 403);
    }

    const searchParams = request.nextUrl.searchParams;
    const sha = searchParams.get("sha");
    const type = searchParams.get("type");
    const name = searchParams.get("name");

    if (!type || !["content", "media"].includes(type)) throw new Error(`"type" is required and must be set to "content" or "media".`);
    if (!name && type === "content") throw new Error(`"name" is required.`);
    if (!sha) throw new Error(`"sha" is required.`);

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config) throw new Error(`Config not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const normalizedPath = decodeAndNormalizeRepoPath(params.path);
    let schema;

    switch (type) {
      case "content":
        if (!name) throw new Error(`"name" is required for content.`);

        schema = getSchemaByName(config.object, name);
        if (!schema) throw new Error(`Content schema not found for ${name}.`);
        if (!isContentOperationAllowed("delete", { schema })) {
          throw createHttpError(`Deleting entries isn't allowed for "${name}".`, 403);
        }
        
        if (!isPathWithinRoot(normalizedPath, schema.path)) throw new Error(`Invalid path "${params.path}" for ${type} "${name}".`);
        
        if (schema.subfolders === false && getParentPath(normalizedPath) !== schema.path) {
          throw new Error(`Subfolders are not allowed for collection "${name}".`);
        }

        // Folder placeholders (.gitkeep) are allowed, same as create.
        // Empty extension = accept any file (source-folder / raw editors).
        if (getFileName(normalizedPath) !== ".gitkeep") {
          const requiredExtension =
            typeof schema.extension === "string" ? schema.extension : "";
          if (
            requiredExtension !== "" &&
            getFileExtension(normalizedPath) !== requiredExtension
          ) {
            throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${type} "${name}".`);
          }
        }
        break;
      case "media":
        if (!name) throw new Error(`"name" is required for media.`);

        schema = getSchemaByName(config.object, name, "media");
        if (!schema) throw new Error(`Media schema not found for ${name}.`);

        assertNonEmptyPathRoot(schema.input ?? "", "media input");
        if (!isPathWithinRoot(normalizedPath, schema.input)) throw new Error(`Invalid path "${params.path}" for media "${name}".`);

        if (
          schema.extensions?.length > 0 &&
          !schema.extensions.includes(getFileExtension(normalizedPath))
        ) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for media.`);
        break;
    }

    const contentSchema = schema as Record<string, any> | undefined;
    const shouldPruneSourceFiles = Boolean(
      type === "content" &&
        contentSchema &&
        (contentSchema.template === "source-files" ||
          (Array.isArray(contentSchema.files) &&
            contentSchema.files.length > 0)),
    );
    const sourceFilesSnapshot = shouldPruneSourceFiles
      ? normalizeSourceFiles(contentSchema?.files)
      : [];

    const pruneSourceFileFromConfig = async (removePath: boolean) => {
      await withCmsConfigLock(
        params.owner,
        params.repo,
        params.branch,
        async () => {
          const latest =
            (await getConfigFromDb(
              params.owner,
              params.repo,
              params.branch,
            )) ?? config;
          const tree = Array.isArray(latest.object?.content)
            ? latest.object.content
            : [];
          const leaves = flattenContentLeaves(tree).map((entry: any) => {
            if (entry?.name !== name) return entry;
            const currentFiles = normalizeSourceFiles(entry.files);
            const nextFiles = removePath
              ? currentFiles.filter(
                  (item) => normalizePath(item.path) !== normalizedPath,
                )
              : (() => {
                  // Restore path if blob delete failed after prune.
                  const already = currentFiles.some(
                    (item) => normalizePath(item.path) === normalizedPath,
                  );
                  if (already) return currentFiles;
                  const previous = sourceFilesSnapshot.find(
                    (item) => normalizePath(item.path) === normalizedPath,
                  );
                  return previous
                    ? [...currentFiles, previous]
                    : [...currentFiles, { path: normalizedPath }];
                })();
            return { ...entry, files: serializeSourceFiles(nextFiles) };
          });
          const nextContent = applyContentLeavesToTree(tree, leaves);
          await persistCmsConfigObject(
            params.owner,
            params.repo,
            params.branch,
            {
              ...(latest.object as Record<string, any>),
              content: nextContent,
              settings: {
                ...(latest.object?.settings ?? {}),
                pagesManaged: true,
                templatesConfigured: true,
              },
            },
          );
        },
      );
    };

    // Prune CMS files[] before deleting the blob so a successful delete cannot
    // leave a ghost list row. Roll back the prune if blob delete fails.
    if (shouldPruneSourceFiles) {
      await pruneSourceFileFromConfig(true);
    }

    try {
      const deleted = await deleteDeferredFile(
        {
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
        },
        normalizedPath,
        { sha, token },
      );

      return Response.json({
        status: "success",
        message: `File "${normalizedPath}" deleted successfully.`,
        data: {
          sha: deleted.sha,
          name: normalizedPath.split("/").pop(),
          path: normalizedPath,
        },
      });
    } catch (deleteError) {
      if (shouldPruneSourceFiles) {
        try {
          await pruneSourceFileFromConfig(false);
        } catch (restoreError) {
          logServerError(
            restoreError,
            "[owner]/[repo]/[branch]/files/[path] DELETE restore files[]",
          );
        }
      }
      throw deleteError;
    }
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/files/[path] DELETE");
    return toErrorResponse(error);
  }
};
