/**
 * Compatibility barrel for schema/IO only.
 * Prefer `@/fields/registry-schema`, `@/fields/registry-edit`, or `@/fields/registry-view`.
 * Do not re-export edit/view here — that would pull client editors into server/shell graphs.
 */
export {
  labels,
  schemas,
  readFns,
  writeFns,
  defaultValues,
  fieldTypes,
} from "@/fields/registry-schema";
