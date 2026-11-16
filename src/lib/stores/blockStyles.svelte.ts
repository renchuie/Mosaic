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

export const styleManager = $state({ open: false });

export function initBlockStyles() {
  for (const [id, t] of Object.entries(BUILTIN_CALLOUTS)) seed("calloutTypes", id, t);
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
  out.push(`.mosaic-doc .b-quote{border-left-color:${bar};${q.tint ? `background:color-mix(in srgb, ${qbar ?? "var(--text)"} ${qbar ? 14 : 5}%, transparent);border-radius:0 12px 12px 0;padding:8px 14px 8px 16px;` : ""}${q.italic ? "font-style:italic;" : ""}}`);
  return out.join("\n");
}
