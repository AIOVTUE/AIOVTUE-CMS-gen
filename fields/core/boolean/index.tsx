import { z } from "zod";
import { Field } from "@/types/field";

const schema = (field: Field) => {
  // Accept legacy number/string frontmatter (e.g. pinned: 1) and normalize to boolean.
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["false", "0", "no", "off"].includes(normalized)) return false;
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
    }
    return Boolean(value);
  }, z.boolean());
};

const defaultValue = false;
const label = "Boolean";

export { label, schema, defaultValue };