export const GLASS_STORAGE_KEY = "pagescms-glass";
export const GLASS_OFF_CLASS = "glass-off";
export const GLASS_CHANGE_EVENT = "pagescms-glass-change";

/** Default off: only explicit `"1"` enables glass / transparent background. */
export function readGlassEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GLASS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function applyGlassEnabled(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(GLASS_OFF_CLASS, !enabled);
}

export function writeGlassEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(GLASS_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
  applyGlassEnabled(enabled);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(GLASS_CHANGE_EVENT, { detail: enabled }),
    );
  }
}

/**
 * Boot before paint — keep in sync with keys/classes above.
 * Glass on → dark. Glass off (default) → next-themes "theme" (default light).
 */
export const GLASS_BOOT_SCRIPT = `try{var on=localStorage.getItem(${JSON.stringify(GLASS_STORAGE_KEY)})==="1";var d=document.documentElement;if(on){d.classList.remove(${JSON.stringify(GLASS_OFF_CLASS)});d.classList.add("dark")}else{d.classList.add(${JSON.stringify(GLASS_OFF_CLASS)});var t=localStorage.getItem("theme");if(t==="dark")d.classList.add("dark");else d.classList.remove("dark")}}catch(e){}`;
