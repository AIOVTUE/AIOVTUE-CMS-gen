/**
 * Static field type names for config validation.
 * Keep in sync with registries — do not import field modules here.
 */
export const FIELD_TYPE_NAMES = [
  "boolean",
  "code",
  "date",
  "file",
  "friend-links",
  "image",
  "number",
  "reference",
  "rich-text",
  "select",
  "string",
  "text",
  "uuid",
] as const;

export type FieldTypeName = (typeof FIELD_TYPE_NAMES)[number];

export const fieldTypes = new Set<string>(FIELD_TYPE_NAMES);
