import { isContentOperationAllowed } from "@/lib/operations";
import { getSchemaByName } from "@/lib/schema";
import { getConfig } from "@/lib/config-store";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import {
  assertNonEmptyPathRoot,
  isPathWithinRoot,
} from "@/lib/utils/path-scope";
import {
  assertSafeRepoPath,
  decodeAndNormalizeRepoPath,
} from "@/lib/security/route-path";
import { getWriteToken } from "@/lib/token";
import { updateFileCache } from "@/lib/github-cache-file";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { resolveCommitIdentity } from "@/lib/commit-message";
import { requireApiUserSession } from "@/lib/session-server";
import { renameDeferredFile } from "@/lib/staged-writes/save";
import { EXCALIDRAW_COLLECTION } from "@/lib/excalidraw-bundle";
import { logServerError } from "@/lib/security/scrub-secrets";

/**
 * Renames a file in a GitHub repository.
 * 
 * POST /api/[owner]/[repo]/[branch]/files/[path]/rename
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

    if (!isContentOperationAllowed("rename", { scope: "settings" }) && params.path === ".pages.yml") {
      throw createHttpError(`Renaming the settings file isn't allowed.`, 403);
    }

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config) throw new Error(`Config not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const data: any = await request.json();

    if (!data.type || !["content", "media"].includes(data.type)) throw new Error(`"type" is required and must be set to "content" or "media".`);
    if (!data.name && data.type === "content") throw new Error(`"name" is required.`);
    if (!data.newPath) throw new Error(`"newPath" is required.`);

    const normalizedPath = decodeAndNormalizeRepoPath(params.path);
    const normalizedNewPath = assertSafeRepoPath(data.newPath);
    if (normalizedPath === normalizedNewPath) throw new Error(`New path "${data.newPath}" is the same as the old path.`);

    let schema;
    let schemaCommitTemplates: Record<string, string> | undefined;
    let schemaCommitIdentity: "app" | "user" | undefined;

    switch (data.type) {
      case "content":
        if (!data.name) throw new Error(`"name" is required for content.`);

        schema = getSchemaByName(config.object, data.name);
        if (!schema) throw new Error(`Content schema not found for ${data.name}.`);
        if (!isContentOperationAllowed("rename", { schema })) {
          throw createHttpError(`Renaming entries isn't allowed for "${data.name}".`, 403);
        }
        schemaCommitTemplates = schema?.commit?.templates;
        schemaCommitIdentity = schema?.commit?.identity;

        if (schema.type === "file") throw new Error(`Renaming content of type "file" isn't allowed.`);
        
        if (!isPathWithinRoot(normalizedPath, schema.path)) throw new Error(`Invalid path "${params.path}" for ${data.type} "${data.name}".`);
        if (!isPathWithinRoot(normalizedNewPath, schema.path)) throw new Error(`Invalid path "${data.newPath}" for ${data.type} "${data.name}".`);

        const isExcalidrawAsset =
          data.name === EXCALIDRAW_COLLECTION &&
          getFileExtension(normalizedPath) === "excalidraw" &&
          getFileExtension(normalizedNewPath) === "excalidraw";

        if (!isExcalidrawAsset) {
          const requiredExtension =
            typeof schema.extension === "string" ? schema.extension : "";
          if (requiredExtension !== "") {
            if (getFileExtension(normalizedPath) !== requiredExtension) {
              throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${data.type} "${data.name}".`);
            }
            if (getFileExtension(normalizedNewPath) !== requiredExtension) {
              throw new Error(`Invalid extension "${getFileExtension(normalizedNewPath)}" for ${data.type} "${data.name}".`);
            }
          }
        }
        break;
      case "media":
        if (!data.name) throw new Error(`"name" is required for media.`);

        schema = getSchemaByName(config.object, data.name, "media");
        if (!schema) throw new Error(`Media schema not found for ${data.name}.`);
        schemaCommitTemplates = schema?.commit?.templates;
        schemaCommitIdentity = schema?.commit?.identity;
        
        assertNonEmptyPathRoot(schema.input ?? "", "media input");
        if (!isPathWithinRoot(normalizedPath, schema.input)) throw new Error(`Invalid path "${params.path}" for media.`);
        if (!isPathWithinRoot(normalizedNewPath, schema.input)) throw new Error(`Invalid path "${data.newPath}" for media.`);
        
        if (
          schema.extensions?.length > 0 &&
          !schema.extensions.includes(getFileExtension(normalizedPath))
        ) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for media.`);
        if (
          schema.extensions?.length > 0 &&
          !schema.extensions.includes(getFileExtension(normalizedNewPath))
        ) throw new Error(`Invalid extension "${getFileExtension(normalizedNewPath)}" for media.`);
        break;
    }

    const commitIdentity = resolveCommitIdentity({
      configObject: config.object,
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
    
    const response = await githubRenameFile(
      token,
      params.owner,
      params.repo,
      params.branch,
      normalizedPath,
      normalizedNewPath,
      {
        configObject: config.object,
        templatesOverride: schemaCommitTemplates,
        contentName: data.name,
        user: user.email || user.name || String(user.id || ""),
        committer,
      }
    );

    // Update the cache with the rename operation
    await updateFileCache(
      data.type === 'content' ? 'collection' : 'media',
      params.owner,
      params.repo,
      params.branch,
      {
        type: 'rename',
        path: normalizedPath,
        newPath: normalizedNewPath,
        commit: {
          sha: response.sha,
          timestamp: Date.now()
        }
      }
    );

    // TODO: remove success message in backend 
    return Response.json({
      status: "success",
      message: `File "${normalizedPath}" moved to "${normalizedNewPath}".`,
      data: {
        path: response?.path,
        newPath: response?.newPath,
      }
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/files/[path]/rename POST");
    return toErrorResponse(error);
  }
};

// /!\ THE FOLLOWING IS A BIT OF A WTF... But hear me out.
// We can't easily rename a file via the GitHub API. We could copy the file with a new path and
// then delete the original, but we'd then lose the commit history. So we resort to a rather
// barbaric approach, chaining 5 sequential API calls. More about the why and how:
// https://stackoverflow.com/questions/31563444/rename-a-file-with-github-api
// https://medium.com/@obodley/renaming-a-file-using-the-git-api-fed1e6f04188
// https://www.levibotelho.com/development/commit-a-file-with-the-github-api/
const githubRenameFile = async (
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  newPath: string,
  _options?: {
    configObject?: Record<string, any>;
    templatesOverride?: Record<string, string>;
    contentName?: string;
    user?: string;
    committer?: { name: string; email: string };
  },
) => {
  // Renames are staged until publish — never rewrite the GitHub tree immediately.
  const renamed = await renameDeferredFile(
    { owner, repo, branch },
    path,
    newPath,
    { token },
  );
  return {
    sha: renamed.sha,
    path: renamed.path,
    newPath: renamed.newPath,
  };
};
