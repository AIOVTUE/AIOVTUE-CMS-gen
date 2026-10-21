import { Field } from "@/types/field";
import { z } from "zod";
import * as booleanField from "@/fields/core/boolean";
import * as codeField from "@/fields/core/code";
import * as dateField from "@/fields/core/date";
import * as fileField from "@/fields/core/file";
import * as friendLinksField from "@/fields/core/friend-links";
import * as imageField from "@/fields/core/image";
import * as numberField from "@/fields/core/number";
import * as referenceField from "@/fields/core/reference";
import * as richTextField from "@/fields/core/rich-text";
import * as selectField from "@/fields/core/select";
import * as stringField from "@/fields/core/string";
import * as textField from "@/fields/core/text";
import * as uuidField from "@/fields/core/uuid";
import { fieldTypes } from "@/fields/field-types";

type SchemaFieldModule = {
  label?: string;
  schema?: (...args: any[]) => z.ZodTypeAny;
  defaultValue?: any;
  read?: (...args: any[]) => any;
  write?: (...args: any[]) => any;
};

const labels: Record<string, string> = {};
const schemas: Record<
  string,
  (field: Field, configObject?: Record<string, any>) => z.ZodTypeAny
> = {};
const defaultValues: Record<string, any> = {};
const readFns: Record<
  string,
  (value: any, field: Field, configObject?: Record<string, any>) => void
> = {};
const writeFns: Record<
  string,
  (value: any, field: Field, configObject?: Record<string, any>) => void
> = {};

const registerSchemaField = (fieldName: string, fieldModule: SchemaFieldModule) => {
  if (fieldModule.label) labels[fieldName] = fieldModule.label;
  if (fieldModule.schema) schemas[fieldName] = fieldModule.schema;
  if (fieldModule.defaultValue !== undefined) {
    defaultValues[fieldName] = fieldModule.defaultValue;
  }
  if (fieldModule.read) readFns[fieldName] = fieldModule.read;
  if (fieldModule.write) writeFns[fieldName] = fieldModule.write;
};

registerSchemaField("boolean", booleanField);
registerSchemaField("code", codeField);
registerSchemaField("date", dateField);
registerSchemaField("file", fileField);
registerSchemaField("friend-links", friendLinksField);
registerSchemaField("image", imageField);
registerSchemaField("number", numberField);
registerSchemaField("reference", referenceField);
registerSchemaField("rich-text", richTextField);
registerSchemaField("select", selectField);
registerSchemaField("string", stringField);
registerSchemaField("text", textField);
registerSchemaField("uuid", uuidField);

export {
  labels,
  schemas,
  readFns,
  writeFns,
  defaultValues,
  fieldTypes,
};
