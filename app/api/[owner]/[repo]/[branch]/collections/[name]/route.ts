import { logServerError, scrubSecrets } from "@/lib/security/scrub-secrets";
export const maxDuration = 30;

import { type NextRequest } from "next/server";
import { readFns } from "@/fields/registry-schema";
import { parse } from "@/lib/serialization";
import { deepMap, getDateFromFilename, getFieldByPath, getPrimaryField, getSchemaByName, safeAccess } from "@/lib/schema";
import { getRepoReadContext } from "@/lib/api-repo-context";
import { getFileName, normalizePath } from "@/lib/utils/file";
import { isPathWithinRoot } from "@/lib/utils/path-scope";
import { getCollectionCache } from "@/lib/github-cache-file";
import {
  collectFlatNodeEntries,
  getNodeEntryFilename,
  usesFlatNodeList,
} from "@/lib/collection-flat-nodes";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { normalizeSourceFiles } from "@/lib/source-files";

/**
 * Fetches and parses collection contents from GitHub repositories
 * (for collection views and searches)
 * 
 * GET /api/[owner]/[repo]/[branch]/collections/[name]
 * 
 * Requires authentication. If type is set to "search", we filter the contents
 * based on the query and fields parameters.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string, repo: string, branch: string, name: string }> }
) {
  try {
    const params = await context.params;
    const { token, config } = await getRepoReadContext(params);

    const schema = getSchemaByName(config.object, params.name);
    if (!schema) throw createHttpError(`Schema not found for ${params.name}.`, 404);

    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get("path") ?? schema.path ?? "";
    const type = searchParams.get("type");
    const query = searchParams.get("query") || "";
    const fields = searchParams.get("fields")?.split(",") || ["name"];

    const normalizedPath = normalizePath(path);
    const listedFiles = normalizeSourceFiles(schema.files);
    const usesFixedFileList =
      schema.template === "source-files" || listedFiles.length > 0;

    if (usesFixedFileList) {
      for (const entry of listedFiles) {
        if (!isPathWithinRoot(entry.path, schema.path ?? "")) {
          throw createHttpError(
            `Invalid file "${entry.path}" for collection "${params.name}".`,
            400,
          );
        }
      }
    } else if (!isPathWithinRoot(normalizedPath, schema.path)) {
      throw createHttpError(`Invalid path "${path}" for collection "${params.name}".`, 400);
    }

    const flatNodeList = usesFlatNodeList(schema, normalizedPath);

    if (!usesFixedFileList && schema.subfolders === false) {
      if (normalizedPath !== schema.path) throw createHttpError(`Invalid path "${path}" for collection "${params.name}".`, 400);
    }

    if (flatNodeList && normalizedPath !== normalizePath(schema.path)) {
      throw createHttpError(`Invalid path "${path}" for collection "${params.name}".`, 400);
    }

    let entries: any[] = [];
    if (usesFixedFileList) {
      const rootPath = normalizePath(schema.path ?? "");
      entries = listedFiles.map((fileEntry) => {
        const fileName = getFileName(fileEntry.path) || fileEntry.path;
        const alias = fileEntry.label?.trim() || "";
        return {
          type: "file",
          name: alias || fileName,
          label: alias || undefined,
          path: fileEntry.path,
          parentPath: rootPath,
          content: null,
          sha: null,
        };
      });
    } else if (flatNodeList) {
      entries = await collectFlatNodeEntries({
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        token,
        schema,
      });
    } else {
      entries = await getCollectionCache(
        params.owner,
        params.repo,
        params.branch,
        normalizedPath,
        token,
        getNodeEntryFilename(schema),
      );
    }

    if (!flatNodeList && !usesFixedFileList) {
      entries = entries.filter((item: any) => item.parentPath === normalizedPath);
    }

    if (!flatNodeList && schema.view?.node?.filename) {
      // Remove node entries from subfolders
      entries = entries.filter((item: any) => item.isNode || item.parentPath === schema.path || item.name !== schema.view.node.filename);
    }

    if (!flatNodeList && ['all', 'nodes', 'others'].includes(schema.view?.node?.hideDirs)) {
      if (schema.view.node.hideDirs === "all") {
        // Remove all dirs
        entries = entries.filter((item: any) => item.type !== "dir");
      } else if (["nodes", "others"].includes(schema.view.node.hideDirs)) {
        // Remove node dirs or non node dirs
        entries = entries.filter((item: any) =>
          item.type !== "dir" ||
          (schema.view.node.hideDirs === "others"
            ? entries.some((subItem: any) => subItem.parentPath === item.path && subItem.isNode)
            : !entries.some((subItem: any) => subItem.parentPath === item.path && subItem.isNode)
          )
        );
      }
    }
    
    let data: {
      contents: Record<string, any>[],
      errors: string[]
    } = {
      contents: [],
      errors: []
    };
    
    if (entries) {
      data = parseContents(entries, schema, config, fields);
      
      // If this is a search request, filter the contents
      if (type === "search" && query) {
        const searchQuery = query.toLowerCase();
        const searchFields = Array.isArray(fields) ? fields : fields ? [fields] : [];
        
        data.contents = data.contents.filter(item => {
          if (searchFields.length === 0) {
            if (
              (item.name && item.name.toLowerCase().includes(searchQuery)) ||
              (item.path && item.path.toLowerCase().includes(searchQuery))
            ) {
              return true;
            }

            return item.content && item.content.toLowerCase().includes(searchQuery);
          }
          
          return searchFields.some(field => {
            if (field === 'name' || field === 'path') {
              const value = item[field];
              return value && String(value).toLowerCase().includes(searchQuery);
            }
            
            if (field.startsWith('fields.')) {
              const fieldPath = field.replace('fields.', '');
              const value = safeAccess(item.fields, fieldPath);
              return value && String(value).toLowerCase().includes(searchQuery);
            }
            
            return false;
          });
        });
      }
    }

    return Response.json({
      status: "success",
      data
    });
  } catch (error: any) {
    logServerError(error, "[owner]/[repo]/[branch]/collections/[name] GET");
    return toErrorResponse(error);
  }
}

// Parse the list of entries into objects based on the content schema.
const parseContents = (
  contents: any,
  schema: Record<string, any>,
  config: Record<string, any>,
  selectedFields?: string[],
): {
  contents: Record<string, any>[],
  errors: string[]
} => {
  const serializedTypes = ["yaml-frontmatter", "json-frontmatter", "toml-frontmatter", "yaml", "json", "toml"];
  const excludedFiles = schema.exclude || [];
  const extension = schema.extension ?? "";

  let parsedContents: Record<string, any>[] = [];
  let parsedErrors: string[] = [];

  parsedContents = contents.map((item: any) => {
    // Folder placeholders are not content entries — Git needs them, the UI does not.
    if (item.type === "file" && item.name === ".gitkeep") {
      return null;
    }
    // If it's a file and it matches the schema extension
    if (item.type === "file" && (extension === "" || item.path.endsWith(`.${extension}`)) && !excludedFiles.includes(item.name)) {
      let contentObject: Record<string, any> = {};
      
      if (serializedTypes.includes(schema.format) && schema.fields) {
        // If we are dealing with a serialized format and we have fields defined
        try {
          const parsedObject = parse(item.content, { format: schema.format, delimiters: schema.delimiters });
          if (Array.isArray(selectedFields) && selectedFields.length > 0) {
            const requestedFieldPaths = selectedFields
              .filter((fieldPath) => fieldPath !== "path")
              .map((fieldPath) => fieldPath.startsWith("fields.") ? fieldPath.replace(/^fields\./, "") : fieldPath);
            if (item.isNode) {
              const primaryField = getPrimaryField(schema);
              if (primaryField) requestedFieldPaths.push(primaryField);
              if (!requestedFieldPaths.includes("title")) requestedFieldPaths.push("title");
            }
            contentObject = pickAndTransformFields(parsedObject, schema.fields, requestedFieldPaths, config);
          } else {
            // TODO: review if this works for blocks
            contentObject = deepMap(parsedObject, schema.fields, (value, field) => {
              if (typeof field.type === "string" && readFns[field.type]) {
                return readFns[field.type](value, field, config);
              }
              return value;
            });
          }
        } catch (error: any) {
          // TODO: send this to the client?
          logServerError(error, "frontmatter parse");
          parsedErrors.push(
            `Error parsing frontmatter for file "${item.path}": ${scrubSecrets(error.message)}`,
          );
        }
      }

      if (
        item.isNode &&
        item.content &&
        serializedTypes.includes(schema.format) &&
        schema.fields
      ) {
        const primaryField = getPrimaryField(schema);
        const currentTitle = primaryField ? safeAccess(contentObject, primaryField) : undefined;
        if (currentTitle == null || String(currentTitle).trim() === "") {
          try {
            const parsedObject = parse(item.content, {
              format: schema.format,
              delimiters: schema.delimiters,
            });
            if (primaryField) {
              const resolved = safeAccess(parsedObject, primaryField);
              if (resolved != null && String(resolved).trim() !== "") {
                setByPath(contentObject, primaryField, resolved);
              }
            }
          } catch {
            // Ignore — entry still lists with slug fallback.
          }
        }
      }

      if (!schema.fields || schema.fields.length === 0) {
        // Multi-file lists: alias (or file name) as title; path in its own column.
        const isFixedFileList =
          schema.template === "source-files" ||
          (Array.isArray(schema.files) && schema.files.length > 0);
        contentObject.name = isFixedFileList
          ? item.label || item.name || getFileName(item.path)
          : item.name;
        contentObject.path = item.path;
      }
      
      // TODO: make this configurable
      // TODO: support other date formats
      if (!contentObject.date && typeof schema.filename === "string" && schema.filename.startsWith("{year}-{month}-{day}")) {
        // If we couldn"t get a date from the content and filenames have a date, we extract it
        const filenameDate = getDateFromFilename(item.name);
        if (filenameDate) {
          contentObject.date = filenameDate.string;
        }
      }
      
      // TODO: handle proper returns
      return {
        sha: item.sha,
        name: item.name,
        parentPath: item.parentPath,
        path: item.path,
        content: item.content,
        fields: contentObject,
        type: "file",
        isNode: item.isNode,
      };
    } else if (item.type === "dir" && !excludedFiles.includes(item.name) && schema.subfolders !== false) {
      return {
        name: item.name,
        parentPath: item.parentPath,
        path: item.path,
        type: "dir",
      };
    }
  }).filter((item: any) => item != null);

  return {
    contents: parsedContents,
    errors: parsedErrors
  }
}

const pickAndTransformFields = (
  parsedObject: Record<string, any>,
  schemaFields: any[],
  fieldPaths: string[],
  config: Record<string, any>,
) => {
  const output: Record<string, any> = {};
  const dedupedPaths = Array.from(new Set(fieldPaths));

  dedupedPaths.forEach((fieldPath) => {
    const field = getFieldByPath(schemaFields, fieldPath);
    if (!field) return;

    let value = safeAccess(parsedObject, fieldPath);
    if (typeof field.type === "string" && readFns[field.type]) {
      const transformedValue = readFns[field.type](value, field, config);
      if (transformedValue !== undefined) value = transformedValue;
    }
    setByPath(output, fieldPath, value);
  });

  return output;
};

const setByPath = (target: Record<string, any>, path: string, value: any) => {
  if (!path) return;
  const segments = path.split(".");
  let cursor: Record<string, any> = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (cursor[key] == null || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[segments[segments.length - 1]] = value;
};
