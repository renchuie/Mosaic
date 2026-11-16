// Callout types and the quote style (her block style manager), in the synced store so they follow
// her between machines: collection "calloutTypes" (one record per callout kind, the word written
// in the note as `> [!kind]`) and "blockStyles" (record "quote").
// The look reaches the editor as generated CSS (`blockStylesCss`), so a change shows everywhere at once.
import { del, entries, get, put, seed } from "./synced.svelte";

export type CalloutType = { label: string; icon: string; color: string; order: number; hidden?: boolean };
export type QuoteStyle = { bar: string | null; tint: boolean; italic: boolean };

export const BUILTIN_CALLOUTS: Record<string, CalloutType> = {
  note: { label: "Note", icon: "✎", color: "#C9B8F0", order: 0 },
  tip: { label: "Tip", icon: "✦", color: "#A9CDC3", order: 1 },
  exam: { label: "Exam", icon: "★", color: "#F2B8B5", order: 2 },
  warning: { label: "Warning", icon: "!", color: "#F5B79E", order: 3 },
  info: { label: "Info", icon: "i", color: "#B9D4EE", order: 4 },
  example: { label: "Example", icon: "❖", color: "#F6CFA8", order: 5 },
  question: { label: "Question", icon: "?", color: "#F7E3B0", order: 6 },
  success: { label: "Key point", icon: "✓", color: "#A9CDC3", order: 7 },
};
export const CALLOUT_ICONS = ["✎", "✦", "★", "!", "i", "❖", "?", "✓", "♥", "☀", "⚠", "✿", "☕", "💊", "🧠", "💡", "📌", "🔑", "🎯", "🩺", "🧪", "📖", "⏰", "🔥"];
const DEFAULT_QUOTE: QuoteStyle = { bar: null, tint: false, italic: false };

export const styleManager = $state<{ open: boolean; tab: "callouts" | "quotes" | "highlights" }>({ open: false, tab: "callouts" });

export function initBlockStyles() {
  for (const [id, t] of Object.entries(BUILTIN_CALLOUTS)) seed("calloutTypes", id, t);
  initHighlights();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");

export const calloutTypes = () =>
  entries<CalloutType>("calloutTypes").sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label));
/** Types offered in the "/" menu and the badge menu. */
export const visibleCallouts = () => calloutTypes().filter(([, t]) => !t.hidden);
/** The style of a kind written in a note; unknown kinds (from other apps) get a soft default. */
export const calloutStyle = (kind: string): CalloutType =>
  get<CalloutType>("calloutTypes", kind) ?? { label: cap(kind), icon: "•", color: "#C9B8F0", order: 99 };
export const isBuiltinCallout = (kind: string) => kind in BUILTIN_CALLOUTS;

/** A kind word for a new type: lowercase letters, digits and dashes, not already used. */
export function calloutKindFor(label: string): string {
  const base = label.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 24) || "callout";
  let id = base;
  for (let n = 2; get("calloutTypes", id); n++) id = `${base}-${n}`;
  return id;
}

export function saveCallout(kind: string | null, t: Omit<CalloutType, "order"> & { order?: number }): string {
  const id = kind ?? calloutKindFor(t.label);
  const order = t.order ?? (kind ? (get<CalloutType>("calloutTypes", kind)?.order ?? 0) : Math.max(-1, ...calloutTypes().map(([, x]) => x.order)) + 1);
  put("calloutTypes", id, { ...t, order });
  return id;
}
/** Custom types can be deleted (callouts already written keep their word and get the default look). */
export function deleteCallout(kind: string) {
  if (!isBuiltinCallout(kind)) del("calloutTypes", kind);
}
export function moveCallout(kind: string, dir: -1 | 1) {
  const list = calloutTypes();
  const i = list.findIndex(([k]) => k === kind);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach(([k, t], n) => t.order !== n && put("calloutTypes", k, { ...t, order: n }));
}

export const quoteStyle = (): QuoteStyle => ({ ...DEFAULT_QUOTE, ...(get<QuoteStyle>("blockStyles", "quote") ?? {}) });
export const saveQuote = (patch: Partial<QuoteStyle>) => put("blockStyles", "quote", { ...quoteStyle(), ...patch });

const cssStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\3c ").replace(/\n/g, " ")}"`;
const cssId = (s: string) => s.replace(/[^\w-]/g, "");
/** Colours go into CSS, so only hex colours are used (they come from the palette or a colour picker). */
const hex = (c: string | null | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null);

/** CSS for every callout type and the quote style (put in a <style> by the editor). */
export function blockStylesCss(): string {
  const out: string[] = [];
  for (const [k, t] of calloutTypes()) {
    out.push(`.mosaic-doc .b-callout[data-kind="${cssId(k)}"]{--cc:${hex(t.color) ?? "#C9B8F0"}}`);
    out.push(`.mosaic-doc .b-callout[data-kind="${cssId(k)}"] .b-cbadge::before{content:${cssStr(t.icon || "•")}}`);
    out.push(`.mosaic-doc .b-callout[data-kind="${cssId(k)}"] .b-cbadge::after{content:${cssStr(t.label)}}`);
  }
  const q = quoteStyle();
  const qbar = hex(q.bar);
  const bar = qbar ?? "color-mix(in srgb, var(--text) 25%, transparent)";
  out.push(highlightCss());
  out.push(`.mosaic-doc .b-quote{border-left-color:${bar};${q.tint ? `background:color-mix(in srgb, ${qbar ?? "var(--text)"} ${qbar ? 14 : 5}%, transparent);border-radius:0 12px 12px 0;padding:8px 14px 8px 16px;` : ""}${q.italic ? "font-style:italic;" : ""}}`);
  return out.join("\n");
}

// ---- highlight colours and palettes ---------------------------------------------------------------
// Collection "hlColors": one record per colour, keyed by the word written in the note
// (`<mark class="rose">`; "yellow" is written `==…==`). Collection "hlPalettes": named, ordered sets
// of colour words; record "hlActive" in "blockStyles" says which palette the toolbars and the
// Ctrl+Shift+1…9 shortcuts use.

export type HlColor = { label: string; color: string; order: number };
export type HlPalette = { name: string; colors: string[]; order: number };

export const BUILTIN_HL: Record<string, HlColor> = {
  yellow: { label: "Yellow", color: "#F9DE8C", order: 0 },
  rose: { label: "Rose", color: "#F5CDCB", order: 1 },
  sage: { label: "Sage", color: "#C2DCD5", order: 2 },
  peach: { label: "Peach", color: "#F8DBBE", order: 3 },
  lavender: { label: "Lavender", color: "#D9CCF5", order: 4 },
  blue: { label: "Blue", color: "#C4DBF2", order: 5 },
  mint: { label: "Mint", color: "#C9EFD9", order: 6 },
  coral: { label: "Coral", color: "#F7C0AE", order: 7 },
  lilac: { label: "Lilac", color: "#E6D4F7", order: 8 },
  sky: { label: "Sky", color: "#CFE6F7", order: 9 },
  lemon: { label: "Lemon", color: "#F6EE9E", order: 10 },
  grey: { label: "Grey", color: "#E4E0E2", order: 11 },
};
export const BUILTIN_PALETTES: Record<string, HlPalette> = {
  mosaic: { name: "Mosaic", colors: ["yellow", "rose", "sage", "peach", "lavender", "blue"], order: 0 },
  traffic: { name: "Traffic light", colors: ["sage", "lemon", "coral"], order: 1 },
  cool: { name: "Cool", colors: ["sky", "lilac", "mint", "blue"], order: 2 },
};
export const MAX_PALETTE = 9;

export function initHighlights() {
  for (const [id, c] of Object.entries(BUILTIN_HL)) seed("hlColors", id, c);
  for (const [id, p] of Object.entries(BUILTIN_PALETTES)) seed("hlPalettes", id, p);
}

export const hlColors = () => entries<HlColor>("hlColors").sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label));
export const hlColor = (id: string) => get<HlColor>("hlColors", id);
export const isBuiltinHl = (id: string) => id in BUILTIN_HL;
export const palettes = () => entries<HlPalette>("hlPalettes").sort((a, b) => a[1].order - b[1].order || a[1].name.localeCompare(b[1].name));
export const isBuiltinPalette = (id: string) => id in BUILTIN_PALETTES;
export const activePaletteId = () => {
  const id = get<{ id: string }>("blockStyles", "hlActive")?.id ?? "mosaic";
  return get("hlPalettes", id) ? id : "mosaic";
};
/** Colour words of the palette in use, only ones that still exist. */
export const activePalette = (): string[] => (get<HlPalette>("hlPalettes", activePaletteId())?.colors ?? BUILTIN_PALETTES.mosaic.colors).filter((c) => hlColor(c));
export const setActivePalette = (id: string) => put("blockStyles", "hlActive", { id });

function wordFor(coll: string, label: string, fallback: string) {
  const base = label.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 24) || fallback;
  let id = base;
  for (let n = 2; get(coll, id); n++) id = `${base}-${n}`;
  return id;
}
export function saveHlColor(id: string | null, c: { label: string; color: string; order?: number }): string {
  const key = id ?? wordFor("hlColors", c.label, "colour");
  const order = c.order ?? (id ? (hlColor(id)?.order ?? 0) : Math.max(-1, ...hlColors().map(([, x]) => x.order)) + 1);
  put("hlColors", key, { label: c.label, color: c.color, order });
  return key;
}
/** Her own colours can be deleted: they leave every palette; highlights already written show in yellow. */
export function deleteHlColor(id: string) {
  if (isBuiltinHl(id)) return;
  del("hlColors", id);
  for (const [pid, p] of palettes()) if (p.colors.includes(id)) put("hlPalettes", pid, { ...p, colors: p.colors.filter((c) => c !== id) });
}
export function savePalette(id: string | null, p: { name: string; colors: string[]; order?: number }): string {
  const key = id ?? wordFor("hlPalettes", p.name, "palette");
  const order = p.order ?? (id ? (get<HlPalette>("hlPalettes", id)?.order ?? 0) : Math.max(-1, ...palettes().map(([, x]) => x.order)) + 1);
  put("hlPalettes", key, { name: p.name, colors: p.colors.slice(0, MAX_PALETTE), order });
  return key;
}
export function deletePalette(id: string) {
  if (isBuiltinPalette(id)) return;
  if (activePaletteId() === id) setActivePalette("mosaic");
  del("hlPalettes", id);
}

/** CSS for highlight colours: `[data-color="word"] { --hl }`, used by marks and by the colour dots. */
export function highlightCss(): string {
  const out: string[] = [];
  for (const [k, c] of hlColors()) {
    const h = hex(c.color);
    if (h) out.push(`[data-color="${cssId(k)}"]{--hl:${h}}`);
  }
  const y = hex(hlColor("yellow")?.color);
  if (y) out.push(`.mosaic-doc mark.b-hl:not([data-color]){--hl:${y}}`);
  return out.join("\n");
}
