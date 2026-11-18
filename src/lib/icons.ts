// Icon values (Nov 19, her ask: Notion-like clean icons in colours, plus every emoji).
// A stored icon is one string, so front matter, folder looks, courses and tags all keep their shape:
//   "i:pill:rose"  a line icon from iconSet.ts, with a colour word (no ":colour" = the text colour)
//   "📘"           an emoji (or any short text)
//   "book"         one of Icon.svelte's own built-in icon names (older tags and courses)
// Pure: imports nothing, so node can test it.

export type IconColour = { id: string; label: string; css: string };
/** Notion-style colours, mixed from the theme so they follow light and dark themes. */
export const ICON_COLOURS: IconColour[] = [
  { id: "", label: "Default", css: "var(--text)" },
  { id: "grey", label: "Grey", css: "var(--text-muted)" },
  { id: "red", label: "Red", css: "var(--alert-ink)" },
  { id: "pink", label: "Pink", css: "color-mix(in srgb, var(--rose-deep) 80%, var(--text))" },
  { id: "orange", label: "Orange", css: "color-mix(in srgb, var(--peach) 60%, var(--text))" },
  { id: "yellow", label: "Yellow", css: "color-mix(in srgb, var(--butter) 55%, var(--text))" },
  { id: "green", label: "Green", css: "color-mix(in srgb, var(--sage-deep) 75%, var(--text))" },
  { id: "blue", label: "Blue", css: "var(--link-ink)" },
  { id: "purple", label: "Purple", css: "color-mix(in srgb, var(--lavender) 55%, var(--text))" },
];
export const colourCss = (id: string | undefined) => ICON_COLOURS.find((c) => c.id === (id ?? ""))?.css ?? "var(--text)";

export type ParsedIcon = { kind: "line"; name: string; colour: string } | { kind: "text"; text: string } | { kind: "none" };

export function parseIcon(v: unknown): ParsedIcon {
  if (typeof v !== "string" || !v.trim()) return { kind: "none" };
  const m = /^i:([a-z0-9-]+)(?::([a-z]+))?$/.exec(v.trim());
  if (m) return { kind: "line", name: m[1], colour: m[2] ?? "" };
  return { kind: "text", text: v.trim() };
}
export const lineIcon = (name: string, colour = "") => `i:${name}${colour ? `:${colour}` : ""}`;
/** the same icon in another colour (emoji and built-ins don't change) */
export function recolour(v: string, colour: string): string {
  const p = parseIcon(v);
  return p.kind === "line" ? lineIcon(p.name, colour) : v;
}
