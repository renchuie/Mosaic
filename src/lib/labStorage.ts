// Labs are served from the app's own origin (/__labs/…), so their localStorage
// is the dashboard's localStorage. No bridge needed.

export function labUrl(rel: string): string {
  return `/__labs/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

/** Every recallLab.* key, as raw strings. */
export function readAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("recallLab.")) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
}

/** Write one recallLab.* key (used by the progress import). */
export function setKey(key: string, value: string) {
  if (!key.startsWith("recallLab.")) throw new Error("Only recallLab.* keys can be written");
  localStorage.setItem(key, value);
}

/** Writes a timestamp and returns the previous one, to prove storage survives restarts. */
export function probe(): string | null {
  const prev = localStorage.getItem("studydesk.probe");
  localStorage.setItem("studydesk.probe", String(Date.now()));
  return prev;
}
