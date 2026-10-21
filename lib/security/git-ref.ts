/**
 * Restrict Git branch / ref names to a safe subset (no shell metacharacters,
 * no path tricks). Rejects empty, leading `-`, and `..` segments.
 */
export function assertSafeGitRefName(name: string, label = "branch"): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw Object.assign(new Error(`"${label}" is required.`), { status: 400 });
  }
  if (trimmed.length > 200) {
    throw Object.assign(new Error(`"${label}" is too long.`), { status: 400 });
  }
  if (trimmed.startsWith("-") || trimmed.startsWith(".") || trimmed.endsWith(".")) {
    throw Object.assign(new Error(`Invalid ${label} name.`), { status: 400 });
  }
  if (trimmed.includes("..") || trimmed.includes("//")) {
    throw Object.assign(new Error(`Invalid ${label} name.`), { status: 400 });
  }
  // Allow letters, digits, underscore, hyphen, slash, dot (common branch chars).
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    throw Object.assign(new Error(`Invalid ${label} name.`), { status: 400 });
  }
  return trimmed;
}
