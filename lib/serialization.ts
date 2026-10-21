/**
 * Handles frontmatter parsing and stringifying with support for YAML, TOML, and JSON.
 */

import YAML from "yaml";
import * as TOML from "@ltd/j-toml"

type FrontmatterFormat = "json-frontmatter" | "yaml-frontmatter" | "toml-frontmatter";
type SerialFormat = "json" | "yaml" | "toml";
type Format = FrontmatterFormat | SerialFormat;

type SplitFrontmatterSource = {
  /** Raw frontmatter text between delimiters (no leading/trailing ---). */
  frontmatter: string;
  body: string;
  delimiters: [string, string] | null;
  matched: boolean;
};

/** Split a file into raw frontmatter text + body without re-serializing. */
const splitFrontmatterSource = (
  content: string = "",
  options: { delimiters?: string | [string, string]; format?: Format } = {},
): SplitFrontmatterSource => {
  const format = options.format || "yaml-frontmatter";

  if (["yaml", "json", "toml"].includes(format)) {
    return {
      frontmatter: content,
      body: "",
      delimiters: null,
      matched: true,
    };
  }

  const delimiters = setDelimiter(options.delimiters, format as FrontmatterFormat);
  const isDefaultJsonFrontmatter =
    format === "json-frontmatter" &&
    delimiters[0] === "{" &&
    delimiters[1] === "}";

  const match = isDefaultJsonFrontmatter
    ? content.match(/^(\{[\s\S]*\})\n*([\s\S]*)$/)
    : (() => {
        const startDelimiter = delimiters[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const endDelimiter = delimiters[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const frontmatterRegex = new RegExp(
          `^${startDelimiter}\\r?\\n([\\s\\S]*?)\\r?\\n${endDelimiter}(?:\\r?\\n([\\s\\S]*))?$`,
        );
        return frontmatterRegex.exec(content);
      })();

  if (!match) {
    return {
      frontmatter: "",
      body: content,
      delimiters,
      matched: false,
    };
  }

  return {
    frontmatter: match[1] ?? "",
    body: (match[2] || "").replace(/^\r?\n/, ""),
    delimiters,
    matched: true,
  };
};

/** Join raw frontmatter text + body using the same delimiters as stringify. */
const composeFrontmatterFile = (
  frontmatterRaw: string,
  body: string = "",
  options: { delimiters?: string | [string, string]; format?: Format } = {},
) => {
  const format = options.format || "yaml-frontmatter";
  if (["yaml", "json", "toml"].includes(format)) {
    return frontmatterRaw;
  }

  const delimiters = setDelimiter(options.delimiters, format as FrontmatterFormat);
  const fm = frontmatterRaw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

  if (
    format === "json-frontmatter" &&
    delimiters[0] === "{" &&
    delimiters[1] === "}"
  ) {
    return `${fm.trim() ? `${fm.trim()}\n` : ""}${body}`;
  }

  const fmBlock = fm.trim() ? (fm.endsWith("\n") ? fm : `${fm}\n`) : "";
  return `${delimiters[0]}\n${fmBlock}${delimiters[1]}\n${body}`;
};

// Parse straight YAML/JSON/TOML and YAML/JSON/TOML frontmatter strings into an object
const parse = (content: string = "", options: { delimiters?: string, format?: Format } = {}) => {
  const format = options.format || "yaml-frontmatter";
  
  // YAML/JSON/TOML without frontmatter
  if (["yaml", "json", "toml"].includes(format)) return deserialize(content, format as SerialFormat);

  const split = splitFrontmatterSource(content, options);
  if (!split.matched) return { body: content };

  const parsed = deserialize(
    split.frontmatter,
    format.split("-")[0] as SerialFormat,
  );
  const contentObject =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, any>) }
      : {};
  contentObject.body = split.body;

  return contentObject;
};

// Deserialize a YAML/JSON/TOML string to an object
const deserialize = (content: string = "", format: SerialFormat = "yaml") => {
  if (!content.trim()) return {}; // Empty content returns an empty object

  switch (format) {
    case "yaml":
      return YAML.parse(content, { strict: false, uniqueKeys: false });
    case "json":
      return JSON.parse(content);
    case "toml":
      const tomlObject = TOML.parse(content, 1.0, "\n", false);
      return JSON.parse(JSON.stringify(tomlObject));
    default:
      return {};
  }
};

// Convert an object into straight YAML/JSON/TOML or YAML/JSON/TOML frontmatter strings
const stringify = (contentObject: Record<string, any> = {}, options: { delimiters?: string, format?: Format } = {}) => {
  const format = options.format || "yaml-frontmatter";
  
  // YAML/JSON/TOML without frontmatter
  if (["yaml", "json", "toml"].includes(format)) return serialize(contentObject, format as SerialFormat);

  // Frontmatter
  const delimiters = setDelimiter(options.delimiters, format as FrontmatterFormat);

  let contentObjectCopy = JSON.parse(JSON.stringify(contentObject));
  const body = contentObjectCopy.body || "";
  delete contentObjectCopy.body;

  let frontmatter = serialize(contentObjectCopy, format.split("-")[0] as SerialFormat);
  frontmatter = (frontmatter.trim()) ? frontmatter.trim() + "\n" : ""; // Make sure we don"t have extra newlines
  
  // For json-frontmatter with default delimiters, the serialized content already includes braces
  if (format === "json-frontmatter" && delimiters[0] === "{" && delimiters[1] === "}") {
    return `${frontmatter}${body}`;
  }
  
  return `${delimiters[0]}\n${frontmatter}${delimiters[1]}\n${body}`;
};

// Serialize an object to a YAML/JSON/TOML string
const serialize = (contentObject: Record<string, any> = {}, format: SerialFormat = "yaml") => {
  if (Object.keys(contentObject).length === 0) return ""; // Empty object returns an empty string
  switch (format) {
    case "yaml":
      return YAML.stringify(contentObject);
    case "json":
      return JSON.stringify(contentObject, null, 2);
    case "toml":
      return TOML.stringify(contentObject, { newline: "\n"});
    default:
      return "";
  }
}

// Sets the start/end delimiters for frontmatter
const setDelimiter = (delimiters: string | [string, string] | null | undefined, format: FrontmatterFormat): [string, string] => {
  if (delimiters == null) {
    switch (format) {
      case "toml-frontmatter":
        return ["+++", "+++"];
      case "json-frontmatter":
        return ["{", "}"];
      case "yaml-frontmatter":
      default:
        return ["---", "---"];
    }
  } else if (typeof delimiters === "string") {
    return [delimiters, delimiters];
  } else if (Array.isArray(delimiters)) {
    if (delimiters.length === 2 && typeof delimiters[0] === "string" && typeof delimiters[1] === "string") {
      return delimiters as [string, string];
    } else {
      throw new Error("Delimiters array must have exactly two string elements");
    }
  } else {
    throw new Error("Invalid delimiters format");
  }
};

export {
  parse,
  stringify,
  splitFrontmatterSource,
  composeFrontmatterFile,
  serialize,
  deserialize,
};
export type { SplitFrontmatterSource };
