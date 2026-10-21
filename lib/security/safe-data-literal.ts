/**
 * Parse JS/JSON-like object and array *data* literals without code execution.
 * Rejects calls, constructors, getters, comments, and other executable forms.
 */

const FORBIDDEN_IDENT =
  /^(?:import|require|eval|Function|process|globalThis|global|window|document|fetch|setTimeout|setInterval|Promise|Reflect|Proxy|Buffer|constructor|prototype|__proto__|this|arguments|new|class|function|yield|await|with|debugger)$/;

const parseJsonSafe = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

/**
 * Convert a restricted JS object/array literal into JSON text.
 * Only supports double/single-quoted strings, unquoted identifier keys,
 * numbers, true/false/null, nested objects/arrays — no expressions.
 */
const jsDataLiteralToJson = (input: string): string | null => {
  const source = input.trim();
  if (!source || (source[0] !== "{" && source[0] !== "[")) return null;

  let out = "";
  let i = 0;
  let inString: '"' | "'" | null = null;
  let escaped = false;

  while (i < source.length) {
    const ch = source[i]!;

    if (inString) {
      if (escaped) {
        if (ch === "'" && inString === "'") out += "'";
        else if (ch === '"') out += '\\"';
        else out += ch;
        escaped = false;
        i += 1;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        i += 1;
        continue;
      }
      if (ch === inString) {
        out += '"';
        inString = null;
        i += 1;
        continue;
      }
      if (ch === '"' && inString === "'") {
        out += '\\"';
        i += 1;
        continue;
      }
      if (ch === "\n" || ch === "\r") return null;
      out += ch;
      i += 1;
      continue;
    }

    // Line / block comments are not allowed in data literals.
    if (ch === "/" && source[i + 1] === "/") return null;
    if (ch === "/" && source[i + 1] === "*") return null;

    if (ch === '"' || ch === "'") {
      inString = ch;
      out += '"';
      i += 1;
      continue;
    }

    // Disallow executable punctuation outside strings.
    if (ch === "`" || ch === ";" || ch === "(" || ch === ")" || ch === "\\") {
      return null;
    }
    if (ch === "=") return null; // no assignments / arrow / defaults
    if (ch === "." && source[i + 1] === "." && source[i + 2] === ".") {
      return null; // spread
    }

    // JS allows trailing commas; JSON does not — drop `,` before `}` / `]`.
    if (ch === ",") {
      let k = i + 1;
      while (k < source.length && /\s/.test(source[k]!)) k += 1;
      if (source[k] === "}" || source[k] === "]") {
        i += 1;
        continue;
      }
    }

    // Identifier key or bare true/false/null
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[\w$]/.test(source[j]!)) j += 1;
      const ident = source.slice(i, j);
      if (FORBIDDEN_IDENT.test(ident)) return null;
      let k = j;
      while (k < source.length && /\s/.test(source[k]!)) k += 1;
      if (source[k] === ":") {
        out += `"${ident}"`;
        i = j;
        continue;
      }
      if (ident === "true" || ident === "false" || ident === "null") {
        out += ident;
        i = j;
        continue;
      }
      return null;
    }

    out += ch;
    i += 1;
  }

  if (inString) return null;
  return out;
};

const parseSafeDataLiteral = (literal: string, label = "literal"): unknown => {
  const trimmed = literal.trim();
  if (!trimmed) {
    throw new Error(`Empty ${label}.`);
  }

  const asJson = parseJsonSafe(trimmed);
  if (asJson !== undefined) return asJson;

  const converted = jsDataLiteralToJson(trimmed);
  if (!converted) {
    throw new Error(
      `JS ${label} contains unsupported or unsafe expressions.`,
    );
  }
  const parsed = parseJsonSafe(converted);
  if (parsed === undefined) {
    throw new Error(`Failed to parse JS ${label}.`);
  }
  return parsed;
};

export { parseSafeDataLiteral };
