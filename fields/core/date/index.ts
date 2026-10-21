import { z } from "zod";
import { Field } from "@/types/field";
import { toDate } from "./parse";
import { parse, format, isValid, isBefore, isAfter } from "date-fns";

const DATE_ONLY = "yyyy-MM-dd";
const DATETIME_LOCAL = "yyyy-MM-dd'T'HH:mm";

const defaultValue = (field: Field) => {
  // Optional dates like lastmod stay empty until set manually.
  if (field.options?.emptyDefault === true) return "";
  if (field.name === "lastmod") return "";
  const inputFormat = field?.options?.time ? DATETIME_LOCAL : DATE_ONLY;
  return format(new Date(), inputFormat);
};

const read = (value: any, field: Field) => {
  const inputFormat = field?.options?.time ? DATETIME_LOCAL : DATE_ONLY;
  const parsedDate = toDate(value);

  if (!parsedDate) {
    if (value) {
      console.warn(
        `Invalid date for field ${field.name}: "${value}" could not be parsed.`,
      );
    }
    return "";
  }

  return format(parsedDate, inputFormat);
};

const write = (value: any, field: Field) => {
  const inputFormat = field?.options?.time ? DATETIME_LOCAL : DATE_ONLY;
  const saveFormat =
    (field?.options?.format as string) || inputFormat;

  const parsedDate =
    toDate(value) ?? parse(String(value ?? ""), inputFormat, new Date(0, 0));

  if (isValid(parsedDate)) {
    return format(parsedDate, saveFormat);
  }

  console.warn(`Invalid date for field ${field.name}: "${value}".`);
  return "";
};

const schema = (field: Field) => {
  const inputFormat = field?.options?.time ? DATETIME_LOCAL : DATE_ONLY;

  let zodSchema = z.string()
    .refine(val => {
      if (!val) return !field.required;
      return isValid(parse(val, inputFormat, new Date())) || Boolean(toDate(val));
    }, "Invalid date")
    .refine(val => {
      if (!val || !field.options?.min) return true;
      const date = toDate(val) ?? parse(val, inputFormat, new Date());
      const minDate = toDate(field.options.min as string) ?? parse(field.options.min as string, inputFormat, new Date());
      return isValid(minDate) && isValid(date) && !isBefore(date, minDate);
    }, `Date must be after ${field.options?.min}`)
    .refine(val => {
      if (!val || !field.options?.max) return true;
      const date = toDate(val) ?? parse(val, inputFormat, new Date());
      const maxDate = toDate(field.options.max as string) ?? parse(field.options.max as string, inputFormat, new Date());
      return isValid(maxDate) && isValid(date) && !isAfter(date, maxDate);
    }, `Date must be before ${field.options?.max}`);
  
  return zodSchema;
};

export { schema, read, write, defaultValue };
