import { z, ZodIssueCode } from "zod";
import { Field } from "@/types/field";
import { swapPrefix } from "@/lib/github-image";
import { getSchemaByName } from "@/lib/schema";
import { getFileExtension, normalizeMediaPath } from "@/lib/utils/file";
import { getAllowedExtensions } from "./helpers";

const IMAGE_OBJECT_KEYS = [
  "url",
  "src",
  "path",
  "href",
  "value",
  "source",
  "image",
] as const;

const coerceImageValue = (value: unknown): string | string[] | null => {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => coerceImageValue(item))
      .flatMap((item) => (item == null ? [] : Array.isArray(item) ? item : [item]))
      .filter((item): item is string => typeof item === "string" && item.trim() !== "");
    return items.length ? items : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of IMAGE_OBJECT_KEYS) {
      if (key in record) {
        const nested = coerceImageValue(record[key]);
        if (nested != null) return nested;
      }
    }
  }
  return null;
};

const read = (
  value: any,
  field: Field,
  config: Record<string, any>,
): string | string[] | null => {
  const coerced = coerceImageValue(value);
  if (coerced == null) return null;

  const isMultiple = !!field.options?.multiple;
  const normalizedInput = isMultiple
    ? Array.isArray(coerced)
      ? coerced
      : [coerced]
    : Array.isArray(coerced)
      ? coerced[0] ?? null
      : coerced;
  if (normalizedInput == null) return null;

  const mediaConfig =
    config?.object?.media?.length && field.options?.media !== false
      ? field.options?.media && typeof field.options.media === "string"
        ? getSchemaByName(config.object, field.options.media, "media")
        : config.object.media[0]
      : undefined;

  if (!mediaConfig) return normalizedInput;

  if (Array.isArray(normalizedInput)) {
    return normalizedInput.map((v) =>
      swapPrefix(
        normalizeMediaPath(String(v)),
        mediaConfig.output,
        mediaConfig.input,
        true,
      ),
    );
  }

  return swapPrefix(
    normalizeMediaPath(String(normalizedInput)),
    mediaConfig.output,
    mediaConfig.input,
    true,
  );
};

const write = (
  value: any,
  field: Field,
  config: Record<string, any>,
): string | string[] | null => {
  if (!value) return null;
  if (Array.isArray(value) && !value.length) return null;

  const mediaConfig =
    config?.object?.media?.length && field.options?.media !== false
      ? field.options?.media && typeof field.options.media === "string"
        ? getSchemaByName(config.object, field.options.media, "media")
        : config.object.media[0]
      : undefined;

  if (!mediaConfig) return value;

  if (Array.isArray(value)) {
    return value.map((v) => write(v, field, config)) as string[];
  }
  const normalizedValue = normalizeMediaPath(String(value));
  return swapPrefix(normalizedValue, mediaConfig.input, mediaConfig.output);
};

const schema = (field: Field, configObject?: Record<string, any>) => {
  const mediaConfig =
    configObject &&
    (field.options?.media === false
      ? undefined
      : field.options?.media && typeof field.options.media === "string"
        ? getSchemaByName(configObject, field.options.media, "media")
        : configObject.media?.[0]);
  const mediaInputPath = mediaConfig?.input;
  const allowedExtensions = getAllowedExtensions(field, mediaConfig);
  let zodSchema: z.ZodTypeAny;

  const isMultiple = !!field.options?.multiple;
  const enforceUnique = isMultiple && field.options?.unique === true;

  zodSchema = isMultiple
    ? z.array(z.string()).optional().nullable()
    : z.string().optional().nullable();

  zodSchema = zodSchema.superRefine((data, ctx) => {
    let isEmpty = false;
    let hasEmptyElementInArray = false;

    if (isMultiple) {
      isEmpty = data === null || data === undefined || data.length === 0;
      if (Array.isArray(data) && data.length > 0) {
        hasEmptyElementInArray = data.some(
          (s) => typeof s === "string" && s === "",
        );
      }
    } else {
      isEmpty = data === null || data === undefined || data === "";
    }

    if (field.required && isEmpty) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: "此字段为必填项",
      });
    }

    if (isMultiple && hasEmptyElementInArray) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: "Image path cannot be empty within the list.",
      });
      return;
    }

    if (enforceUnique && Array.isArray(data)) {
      const normalizedPaths = data
        .filter((path): path is string => typeof path === "string" && path !== "")
        .map((path) => normalizeMediaPath(path));
      if (new Set(normalizedPaths).size !== normalizedPaths.length) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          message: "Image paths must be unique.",
        });
        return;
      }
    }

    if (isEmpty) return;

    const checkPath = (path: unknown) => {
      if (typeof path !== "string" || path === "") return;

      if (mediaInputPath && !path.startsWith(mediaInputPath)) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          message: `Path must start with the media directory: ${mediaInputPath}`,
        });
      }

      const fileExtension = getFileExtension(path);
      if (allowedExtensions && allowedExtensions.length > 0) {
        if (!allowedExtensions.includes(fileExtension)) {
          ctx.addIssue({
            code: ZodIssueCode.custom,
            message: `Invalid file extension '.${fileExtension}'. Allowed: ${allowedExtensions.map((e: string) => `.${e}`).join(", ")}`,
          });
        }
      }
    };

    if (isMultiple && Array.isArray(data)) {
      data.forEach(checkPath);
    } else if (!isMultiple && typeof data === "string") {
      checkPath(data);
    }
  });

  return zodSchema;
};

const defaultValue = (field: Field) => {
  return field.options?.multiple ? [] : "";
};

const label = "Image";

export { label, schema, read, write, defaultValue, getAllowedExtensions };
