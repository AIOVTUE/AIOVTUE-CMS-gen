const formatDbError = (error: unknown) => {
  const parts: string[] = [];
  const seen = new Set<unknown>();

  const walk = (current: unknown, depth: number) => {
    if (!current || depth > 6 || seen.has(current)) return;
    seen.add(current);

    if (current instanceof AggregateError) {
      const code = (current as AggregateError & { code?: string }).code;
      parts.push(`AggregateError${code ? `[${code}]` : ""}`);
      for (const nested of current.errors) walk(nested, depth + 1);
      return;
    }

    if (current instanceof Error) {
      const code = (current as NodeJS.ErrnoException).code;
      if (current.message?.trim()) parts.push(current.message.trim());
      if (code) parts.push(`code=${code}`);
      if (current.cause) walk(current.cause, depth + 1);
      return;
    }

    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (typeof record.code === "string") parts.push(`code=${record.code}`);
      if (typeof record.message === "string" && record.message.trim()) {
        parts.push(record.message.trim());
      }
      if (Array.isArray(record.errors)) {
        for (const nested of record.errors) walk(nested, depth + 1);
      }
      return;
    }

    parts.push(String(current));
  };

  walk(error, 0);
  return parts.filter(Boolean).join(" | ") || "未知数据库错误";
};

const isConnectionError = (error: unknown) => {
  const message = formatDbError(error);
  const code =
    (error instanceof Error && (error as NodeJS.ErrnoException).code) ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code: string }).code);

  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("too many clients already")
  );
};

export { formatDbError, isConnectionError };
