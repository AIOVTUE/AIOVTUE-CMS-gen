const getByPath = (source: unknown, path: string): unknown => {
  if (!path) return source;
  const parts = path.split(".");
  let current: any = source;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
};

const setByPath = (source: Record<string, any>, path: string, value: unknown) => {
  const parts = path.split(".");
  let current: Record<string, any> = source;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (
      current[part] == null ||
      typeof current[part] !== "object" ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
};

const cloneConfig = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export { getByPath, setByPath, cloneConfig };
