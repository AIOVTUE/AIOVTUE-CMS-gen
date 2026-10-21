export const DEFAULT_PRIMARY_COLOR = "#eab7b9";

/** Lighten brand color for buttons / interactive primary surfaces. */
const UI_PRIMARY_LIGHTEN_LIGHT = 0.22;
const UI_PRIMARY_LIGHTEN_DARK = 0.12;

const THEME_CSS_VARS = [
  "--primary",
  "--primary-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const raw = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;

  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;

  return `#${expanded.toLowerCase()}`;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const value = normalized.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function getContrastForeground(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= 150 ? "#171717" : "#fafafa";
}

export function mixHex(hex: string, target: string, amount: number) {
  const source = hexToRgb(hex);
  const destination = hexToRgb(target);
  const ratio = Math.max(0, Math.min(1, amount));

  return rgbToHex(
    source.r + (destination.r - source.r) * ratio,
    source.g + (destination.g - source.g) * ratio,
    source.b + (destination.b - source.b) * ratio,
  );
}

export function lightenHex(hex: string, amount: number) {
  return mixHex(hex, "#ffffff", amount);
}

const getUiPrimaryColor = (base: string, mode: "light" | "dark") =>
  mode === "dark"
    ? lightenHex(base, UI_PRIMARY_LIGHTEN_DARK)
    : lightenHex(base, UI_PRIMARY_LIGHTEN_LIGHT);

export function applyPrimaryColorTheme(
  color: string | null | undefined,
  mode: "light" | "dark" = "light",
) {
  if (typeof document === "undefined") return;

  const base = normalizeHexColor(color) ?? DEFAULT_PRIMARY_COLOR;
  const isDark = mode === "dark";
  const primary = getUiPrimaryColor(base, isDark ? "dark" : "light");
  const primaryForeground = getContrastForeground(primary);
  const ring = mixHex(primary, isDark ? "#ffffff" : "#000000", isDark ? 0.28 : 0.18);

  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", primaryForeground);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-primary-foreground", primaryForeground);
  root.style.setProperty("--ring", ring);
  root.style.setProperty("--chart-1", lightenHex(base, 0.38));
  root.style.setProperty("--chart-2", lightenHex(base, 0.28));
  root.style.setProperty("--chart-3", lightenHex(base, 0.18));
  root.style.setProperty("--chart-4", base);
  root.style.setProperty("--chart-5", mixHex(base, "#000000", 0.18));
}

export function clearPrimaryColorTheme() {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  for (const name of THEME_CSS_VARS) {
    root.style.removeProperty(name);
  }
}
