/**
 * Config validation for the settings editor.
 * Imports ConfigSchema — keep out of repo shell (sidebar/nav).
 */

import YAML from "yaml";
import { z } from "zod";
import { ConfigSchema } from "@/lib/config-schema";
import { parseConfig } from "@/lib/config";

const validateConfig = (document: YAML.Document.Parsed) => {
  const content = document.toJSON();
  let errors: any[] = [];

  try {
    ConfigSchema.parse(content);
  } catch (zodError: any) {
    if (zodError instanceof z.ZodError) {
      zodError.errors.forEach((error) => {
        processZodError(error, document, errors);
      });
    }
  }

  return errors;
};

const processZodError = (
  error: any,
  document: YAML.Document.Parsed,
  errors: any[],
) => {
  let path = error.path;
  let yamlNode: any = document.getIn(path, true);
  let range = [0, 0];

  switch (error.code) {
    case "invalid_union":
      let invalidUnionCount = 0;
      let invalidUnionMessage = "";
      error.unionErrors.forEach((unionError: any) => {
        unionError.issues.forEach((issue: any) => {
          if (issue.path.length === error.path.length) {
            invalidUnionCount++;
            invalidUnionMessage = issue.message;
          } else {
            processZodError(issue, document, errors);
          }
        });
      });
      if (invalidUnionCount === error.unionErrors.length) {
        yamlNode = document.getIn(error.path, true);
        if (!yamlNode || yamlNode?.range == null) {
          yamlNode = document.getIn(error.path.slice(0, -1), true);
        }
        range = yamlNode && yamlNode.range ? yamlNode.range : [0, 0];
        errors.push({
          code: error.code,
          severity: "error",
          from: range[0] || null,
          to: range[1] || null,
          message: invalidUnionMessage,
        });
      }
      break;

    case "unrecognized_keys":
      error.keys.forEach((key: string) => {
        const parentNode =
          yamlNode &&
          yamlNode.items &&
          yamlNode.items.find((item: any) => item.key.value === key);
        if (parentNode) {
          errors.push({
            severity: "warning",
            from: parentNode.key.range[0] || null,
            to: parentNode.key.range[1] || null,
            message: `Property '${parentNode.key.value}' isn't valid and will be ignored.`,
          });
        }
      });
      break;

    default:
      if (yamlNode?.range == null) {
        path = error.path.slice(0, -1);
        yamlNode = document.getIn(path, true);
      }
      range = yamlNode && yamlNode.range ? yamlNode.range : [0, 0];
      errors.push({
        code: error.code,
        severity: "error",
        from: range[0] || null,
        to: range[1] || null,
        message: error.message,
      });
      break;
  }
};

const parseAndValidateConfig = (content: string) => {
  const { document, errors: parseErrors } = parseConfig(content);
  const validationErrors = validateConfig(document);
  return { document, parseErrors, validationErrors };
};

export { parseAndValidateConfig, validateConfig };
