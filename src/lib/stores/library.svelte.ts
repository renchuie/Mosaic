// The card library: standalone flashcards with card types and fields (synced
// collections "cardTypes" and "cardItems"), CSV/Anki-text import, occlusion images.
import { BUILTIN_TYPES, fromHtml, generate, type CardType, type FlashItem, type GenCard } from "../cardTypes";
import { inTauri, invoke } from "../tauri";
import { del, entries, get, newId, put, seed } from "./synced.svelte";

export function initLibrary() {
  for (const [id, t] of Object.entries(BUILTIN_TYPES)) seed("cardTypes", id, t);
}

export const cardTypes = () =>
  entries<CardType>("cardTypes").sort((a, b) => Number(!!b[1].builtin) - Number(!!a[1].builtin) || a[1].name.localeCompare(b[1].name));
export const getType = (id: string) => get<CardType>("cardTypes", id) ?? BUILTIN_TYPES[id];
export const items = () => entries<FlashItem>("cardItems").sort((a, b) => b[1].created - a[1].created);
export const getItem = (id: string) => get<FlashItem>("cardItems", id);

const cache = new WeakMap<object, GenCard[]>();
export function cardsOfItem(id: string, item: FlashItem): GenCard[] {
  const hit = cache.get(item);
  if (hit) return hit;
  const t = getType(item.type);
  const out = t ? generate(id, item, t) : [];
  cache.set(item, out);
  return out;
}

export function saveItem(id: string | null, item: FlashItem): string {
  const key = id ?? `it-${newId()}`;
  put("cardItems", key, item);
  return key;
}
export const deleteItem = (id: string) => del("cardItems", id);

export function saveType(id: string | null, t: CardType): string {
  const key = id ?? `type-${newId()}`;
  put("cardTypes", key, t);
  return key;
}
export function deleteType(id: string): boolean {
  if (getType(id)?.builtin || items().some(([, i]) => i.type === id)) return false;
  del("cardTypes", id);
  return true;
}

/** Add rows from a CSV/TSV file. `map`: field → column index (-1 = leave empty). */
export function importRows(rows: string[][], type: string, map: Record<string, number>, opts: { course?: string; tags?: string[]; html?: boolean }): number {
  let n = 0;
  for (const r of rows) {
    const fields: Record<string, string> = {};
    for (const [f, i] of Object.entries(map)) fields[f] = i >= 0 ? (opts.html ? fromHtml(r[i] ?? "") : (r[i] ?? "").trim()) : "";
    if (!Object.values(fields).some((v) => v.trim())) continue;
    saveItem(null, { type, fields, course: opts.course || undefined, tags: opts.tags?.length ? opts.tags : undefined, created: Date.now() + n });
    n++;
  }
  return n;
}

/** Save an image for occlusion cards into the notes folder's attachments; returns its path there. */
export async function saveCardImage(dataUrl: string, ext: string): Promise<string> {
  const rel = `attachments/card-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  if (inTauri) await invoke("notes_write_file", { rel, base64: dataUrl });
  else previewImages.set(rel, dataUrl);
  return rel;
}
/** In a plain-browser preview there's no disk, so images live in memory. */
export const previewImages = new Map<string, string>();
