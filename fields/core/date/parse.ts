import { parse, isValid } from "date-fns";

/** Common Hugo / CMS date strings we accept when reading files. */
const READ_CANDIDATE_FORMATS = [
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "yyyy-MM-dd'T'HH:mm:ssXXX",
  "yyyy-MM-dd'T'HH:mm:ssXX",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  "yyyy-MM-dd",
] as const;

const toDate = (value: unknown): Date | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  const text = String(value).trim();
  if (!text) return null;

  for (const candidate of READ_CANDIDATE_FORMATS) {
    const parsed = parse(text, candidate, new Date());
    if (isValid(parsed)) return parsed;
  }

  const native = new Date(text);
  return Number.isNaN(native.getTime()) ? null : native;
};

export { toDate, READ_CANDIDATE_FORMATS };
