/** Fired after local/staged writes (save, delete, discard, publish). */
export const CMS_LOCAL_SAVE_EVENT = "pagescms:local-save";

export function notifyCmsLocalSave() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CMS_LOCAL_SAVE_EVENT));
}
