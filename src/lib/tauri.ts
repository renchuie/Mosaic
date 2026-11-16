// Thin wrapper so the UI also runs in a plain browser (npm run dev) with sample data.
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function invoke<T>(cmd: string, args?: Record<string, unknown> | Uint8Array, options?: { headers: Record<string, string> }): Promise<T> {
  if (!inTauri) return Promise.reject(new Error(`${cmd}: not running inside the app`));
  return tauriInvoke<T>(cmd, args, options);
}

export async function loadDoc<T>(name: string): Promise<T | null> {
  if (!inTauri) return null;
  return invoke<T | null>("load_doc", { name });
}

export async function saveDoc(name: string, value: unknown): Promise<void> {
  if (!inTauri) return;
  await invoke("save_doc", { name, value });
}

export function log(msg: string) {
  if (inTauri) void invoke("debug_log", { msg });
  else console.log(msg);
}
