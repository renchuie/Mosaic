// Standalone flashcards (the card library), Anki-style: a card type has fields and
// templates; each filled-in item makes one card per template whose front isn't empty.
// Pure, no imports, node-tested.

export type Template = { id: string; name: string; front: string; back: string };
export type CardType = { name: string; fields: string[]; templates: Template[]; kind?: "cloze" | "occlusion"; builtin?: boolean };
export type Mask = { id: string; x: number; y: number; w: number; h: number; label?: string };
export type FlashItem = { type: string; fields: Record<string, string>; course?: string; tags?: string[]; created: number };

/** Built-in types, seeded into the synced "cardTypes" collection (editable, not deletable). */
export const BUILTIN_TYPES: Record<string, CardType> = {
  basic: { name: "Basic", builtin: true, fields: ["Front", "Back"], templates: [{ id: "f", name: "Card", front: "{{Front}}", back: "{{Back}}" }] },
  reverse: {
    name: "Basic, both ways",
    builtin: true,
    fields: ["Front", "Back"],
    templates: [
      { id: "f", name: "Forward", front: "{{Front}}", back: "{{Back}}" },
      { id: "r", name: "Reverse", front: "{{Back}}", back: "{{Front}}" },
    ],
  },
  cloze: { name: "Cloze", builtin: true, kind: "cloze", fields: ["Text", "Extra"], templates: [{ id: "c", name: "Cloze", front: "{{cloze:Text}}", back: "{{cloze:Text}}{{#Extra}}\n\n{{Extra}}{{/Extra}}" }] },
  drug: {
    name: "Drug",
    builtin: true,
    fields: ["Generic", "Brand", "Class", "Mechanism", "Indications", "Dose", "Adverse effects", "Monitoring", "Counselling", "Pearls"],
    templates: [
      { id: "b2g", name: "Brand → generic", front: "{{#Brand}}**{{Brand}}**\n\nGeneric name?{{/Brand}}", back: "**{{Generic}}**{{#Class}}\n\n{{Class}}{{/Class}}" },
      { id: "g2b", name: "Generic → brand", front: "{{#Brand}}**{{Generic}}**\n\nBrand name?{{/Brand}}", back: "**{{Brand}}**" },
      { id: "g2c", name: "Generic → class", front: "{{#Class}}**{{Generic}}**\n\nDrug class?{{/Class}}", back: "**{{Class}}**{{#Mechanism}}\n\n{{Mechanism}}{{/Mechanism}}" },
      { id: "ind", name: "Indications", front: "{{#Indications}}**{{Generic}}**\n\nIndications?{{/Indications}}", back: "{{Indications}}" },
      { id: "ade", name: "Adverse effects", front: "{{#Adverse effects}}**{{Generic}}**\n\nKey adverse effects?{{/Adverse effects}}", back: "{{Adverse effects}}{{#Monitoring}}\n\n*Monitor:* {{Monitoring}}{{/Monitoring}}" },
      { id: "cou", name: "Counselling", front: "{{#Counselling}}**{{Generic}}**\n\nCounselling points?{{/Counselling}}", back: "{{Counselling}}" },
    ],
  },
  occlusion: { name: "Image occlusion", builtin: true, kind: "occlusion", fields: ["Image", "Masks", "Header", "Extra"], templates: [{ id: "m", name: "Each box", front: "{{Header}}", back: "{{Extra}}" }] },
};

const has = (f: Record<string, string>, k: string) => !!(f[k] ?? "").trim();

/** Mustache-ish templates: {{Field}}, {{#Field}}…{{/Field}} (only if filled), {{^Field}}…{{/Field}} (only if empty),
 *  {{cloze:Field}} (cloze gap for card n). */
export function render(tpl: string, fields: Record<string, string>, cloze?: { n: number; reveal: boolean }): string {
  let s = tpl;
  // sections, innermost first
  for (let guard = 0; guard < 20; guard++) {
    const next = s.replace(/\{\{([#^])([^}]+)\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\2\}\}/g, (_m, kind, name, inner) =>
      (kind === "#") === has(fields, name.trim()) ? inner : "",
    );
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\{\{cloze:([^}]+)\}\}/g, (_m, name) => clozeText(fields[name.trim()] ?? "", cloze?.n ?? 1, cloze?.reveal ?? false));
  return s.replace(/\{\{([^#^/{}][^{}]*)\}\}/g, (_m, name) => fields[name.trim()] ?? "").trim();
}

/** Anki-style {{c1::text::hint}} cloze: hide group n, show the rest. */
export function clozeText(text: string, n: number, reveal: boolean): string {
  return text.replace(/\{\{c(\d+)::([^{}]*?)(?:::([^{}]*))?\}\}/g, (_m, num, body, hint) =>
    Number(num) === n ? (reveal ? `==${body}==` : `[${hint?.trim() || "…"}]`) : body,
  );
}
export const clozeNumbers = (text: string) => [...new Set([...text.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

export type GenCard = { key: string; template: string; front: string; back: string; masks?: Mask[]; target?: string; image?: string };

/** The cards an item makes. Keys: `fl:<itemId>:<templateId>` (cloze `:cN`, occlusion `:m<maskId>`). */
export function generate(itemId: string, item: FlashItem, type: CardType): GenCard[] {
  const f = item.fields;
  const out: GenCard[] = [];
  if (type.kind === "occlusion") {
    let masks: Mask[] = [];
    try {
      masks = JSON.parse(f.Masks || "[]");
    } catch {}
    for (const m of masks) out.push({ key: `fl:${itemId}:m${m.id}`, template: "m", front: render(type.templates[0].front, f), back: render(type.templates[0].back, f), masks, target: m.id, image: f.Image });
    return out;
  }
  for (const t of type.templates) {
    if (type.kind === "cloze" || /\{\{cloze:/.test(t.front)) {
      const field = /\{\{cloze:([^}]+)\}\}/.exec(t.front)?.[1]?.trim() ?? "Text";
      for (const n of clozeNumbers(f[field] ?? ""))
        out.push({ key: `fl:${itemId}:c${n}`, template: t.id, front: render(t.front, f, { n, reveal: false }), back: render(t.back, f, { n, reveal: true }) });
      continue;
    }
    const front = render(t.front, f);
    // Anki's rule: no card if the front is empty or shows no field content
    const bare = render(t.front.replace(/\{\{[^#^/][^}]*\}\}/g, ""), {});
    if (!front || front === bare) continue;
    out.push({ key: `fl:${itemId}:${t.id}`, template: t.id, front, back: render(t.back, f) });
  }
  return out;
}

// ---- CSV / TSV (including Anki's "Notes in Plain Text" export) ---------------------------

/** Rows from CSV/TSV text. Detects the separator; honours quotes; skips Anki's `#key:value` header lines. */
export function parseDelimited(text: string): { rows: string[][]; sep: string; html: boolean } {
  let sep = "";
  let html = false;
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const body: string[] = [];
  for (const l of lines) {
    const h = /^#(\w+):(.*)$/.exec(l);
    if (h && !body.length) {
      if (h[1] === "separator") sep = { tab: "\t", comma: ",", semicolon: ";", pipe: "|", space: " " }[h[2].trim().toLowerCase()] ?? h[2].trim();
      if (h[1] === "html") html = h[2].trim() === "true";
      continue;
    }
    body.push(l);
  }
  const src = body.join("\n");
  if (!sep) {
    const first = body.find((l) => l.trim()) ?? "";
    sep = [..."\t;,|"].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return { rows, sep, html };
}

/** Anki exports HTML: turn the common tags into Markdown-ish text. */
export function fromHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**")
    .replace(/<(i|em)>(.*?)<\/\1>/gi, "*$2*")
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, "![]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Guess which column feeds which field, by header name. */
export function guessMapping(header: string[], fields: string[]): Record<string, number> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out: Record<string, number> = {};
  fields.forEach((f, i) => {
    const j = header.findIndex((h) => norm(h) === norm(f) || (norm(h).length > 2 && (norm(f).startsWith(norm(h)) || norm(h).includes(norm(f)))));
    out[f] = j >= 0 ? j : i < header.length ? i : -1;
  });
  return out;
}
