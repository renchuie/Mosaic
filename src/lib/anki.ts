// Anki package import (F1, Nov 19): turns what src-tauri/src/anki.rs read from an .apkg into
// card library items, card types and FSRS records. Pure (no imports but types), node-tested.
//
// Note types: Basic → built-in "basic", Basic + reversed → "reverse", Cloze → "cloze", Image
// Occlusion → "occlusion" (boxes become masks), anything else → a card type of its own with the
// same fields and templates (Anki's {{Field}} templates are what the library uses too).
// Scheduling: Anki's due date, interval, reps and lapses are kept; the FSRS memory state comes
// from the card's own FSRS data when Anki had FSRS on, else from its interval (stability: the
// interval is when recall falls to ~90%) and ease (difficulty). The review log fills Stats days.
import type { CardType, Mask, Template } from "./cardTypes";

export type AnkiType = { id: string; name: string; cloze: boolean; fields: string[]; templates: { ord: number; name: string; q: string; a: string }[] };
export type AnkiNote = { id: string; guid: string; mid: string; tags: string[]; fields: string[] };
export type AnkiCard = { id: string; nid: string; did: string; odid: string; ord: number; type: number; queue: number; due: number; odue: number; ivl: number; factor: number; reps: number; lapses: number; data: string };
export type AnkiRev = { t: number; cid: string; ease: number; ivl: number; ms: number; type: number };
export type AnkiRead = { crt: number; types: AnkiType[]; decks: { id: string; path: string[] }[]; notes: AnkiNote[]; cards: AnkiCard[]; revlog: AnkiRev[]; media: Record<string, string> };

/** An FSRS record as the srs store keeps it (see SrsRec there). */
export type SchedRec = { due: number; stability: number; difficulty: number; scheduled_days: number; learning_steps: number; reps: number; lapses: number; state: number; last_review?: number; suspended?: boolean; born?: number };
export type PlanType = { ankiId: string; name: string; target: string; newType?: CardType; fieldMap: Record<string, string>; notes: number };
export type PlanItem = { guid: string; ankiType: string; fields: Record<string, string>; tags: string[]; deck: string[]; leech: boolean; cards: { suffix: string; rec: SchedRec | null }[] };
export type Plan = { types: PlanType[]; items: PlanItem[]; days: Record<string, { reviews: number; new: number; again: number; ms: number }>; decks: { path: string[]; tag: string; notes: number }[]; scheduled: number; reviews: number };

// ---- text ------------------------------------------------------------------------------------

const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m),
  );

/** Parts that never show on a card: scripts, styles, comments, hidden elements, sounds. */
export const stripHidden = (s: string) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(\w+)[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/\[sound:[^\]]*\]/g, "");

/** an <img>: src in double quotes, single quotes or bare */
const IMG = /<img[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

/** Anki field HTML → the library's Markdown-ish text; image paths go through `media`. */
export function fieldText(html: string, media: Record<string, string> = {}): string {
  return decodeEntities(
    stripHidden(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|h\d)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<(b|strong)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "**$3**")
      .replace(/<(i|em)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "*$3*")
      .replace(IMG, (_m, a?: string, b?: string, c?: string) => {
        const src = decodeEntities(a ?? b ?? c ?? "");
        return `![](${media[src] ?? src})`;
      })
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SPECIAL = new Set(["FrontSide", "Tags", "Deck", "Subdeck", "Card", "CardFlag", "Type", "CardID"]);
/** A template → the library's syntax: field filters dropped (cloze: kept), the answer without
 *  the front copy Anki puts above <hr id=answer>, Anki's special fields removed. */
export function templateText(html: string, back = false): string {
  let s = stripHidden(html);
  if (back) {
    const hr = s.search(/<hr[^>]*id\s*=\s*["']?answer["']?[^>]*>/i);
    if (hr >= 0) s = s.slice(hr).replace(/^<hr[^>]*>/i, "");
    s = s.replace(/\{\{FrontSide\}\}/g, "");
  }
  s = s.replace(/\{\{([#^/]?)([^{}]+)\}\}/g, (_m, sig: string, body: string) => {
    const parts = body.split(":").map((x) => x.trim());
    const name = parts[parts.length - 1];
    if (!sig && SPECIAL.has(name)) return "";
    if (!sig && parts.length > 1) return parts.includes("cloze") ? `{{cloze:${name}}}` : `{{${name}}}`;
    return `{{${sig}${name}}}`;
  });
  return fieldText(s);
}

// ---- note types --------------------------------------------------------------------------------

const refs = (t: string) => [...t.matchAll(/\{\{(?:cloze:)?([^#^/{}][^{}]*)\}\}/g)].map((m) => m[1].trim());
const only = (t: string, f: string) => {
  const r = refs(t);
  return r.length === 1 && r[0] === f;
};

export function isOcclusion(t: AnkiType) {
  return t.fields.includes("Occlusion") && t.fields.includes("Image") && t.templates.some((x) => /image-occlusion/i.test(x.q + x.a));
}

/** Where an Anki note type goes. `existing`: the library's types (id, type), so a type made by an
 *  earlier import is used again instead of a second copy. */
export function mapType(t: AnkiType, existing: [string, CardType][] = []): Omit<PlanType, "notes"> {
  const fields = t.fields;
  const tp = t.templates.map((x) => ({ q: templateText(x.q), a: templateText(x.a, true) }));
  const base = { ankiId: t.id, name: t.name };
  if (isOcclusion(t)) return { ...base, target: "occlusion", fieldMap: { Header: "Header", "Back Extra": "Extra" } };
  if (t.cloze) {
    const text = fields.find((f) => tp.some((x) => x.q.includes(`{{cloze:${f}}}`))) ?? fields[0];
    const extra = fields.find((f) => f !== text);
    if (fields.length <= 2) return { ...base, target: "cloze", fieldMap: { [text]: "Text", ...(extra ? { [extra]: "Extra" } : {}) } };
  } else if (fields.length === 2) {
    const [a, b] = fields;
    const fwd = (x: { q: string; a: string }) => only(x.q, a) && refs(x.a).includes(b);
    const rev = (x: { q: string; a: string }) => only(x.q, b) && refs(x.a).includes(a);
    if (tp.length === 1 && fwd(tp[0])) return { ...base, target: "basic", fieldMap: { [a]: "Front", [b]: "Back" } };
    if (tp.length === 2 && fwd(tp[0]) && rev(tp[1])) return { ...base, target: "reverse", fieldMap: { [a]: "Front", [b]: "Back" } };
  }
  const templates: Template[] = t.templates.map((x, i) => ({ id: `t${x.ord}`, name: x.name || `Card ${x.ord + 1}`, front: tp[i].q, back: tp[i].a }));
  const same = existing.find(([, c]) => c.name === t.name && c.fields.join("\u0001") === fields.join("\u0001"));
  const fieldMap = Object.fromEntries(fields.map((f) => [f, f]));
  if (same) return { ...base, target: same[0], fieldMap };
  return { ...base, target: "new", fieldMap, newType: { name: t.name, fields: [...fields], templates, ...(t.cloze ? { kind: "cloze" as const } : {}) } };
}

/** Anki image occlusion: {{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.1:oi=1}} → masks */
export function occlusionMasks(text: string): Mask[] {
  const out: Mask[] = [];
  const seen: Record<number, number> = {};
  for (const m of text.matchAll(/\{\{c(\d+)::image-occlusion:([a-z]+)((?::[a-z]+=[^:}]*)*)/gi)) {
    const n = Number(m[1]);
    const kv = Object.fromEntries([...m[3].matchAll(/:([a-z]+)=([^:}]*)/gi)].map((x) => [x[1].toLowerCase(), x[2]]));
    const num = (k: string) => Number(kv[k] ?? 0) || 0;
    let x = num("left"), y = num("top"), w = num("width"), h = num("height");
    if (m[2].toLowerCase() === "ellipse") {
      w = num("rx") * 2 || w;
      h = num("ry") * 2 || h;
    }
    if (!w || !h) continue;
    // a cloze number with several shapes: the first is the card, the rest show as "-2", "-3"…
    seen[n] = (seen[n] ?? 0) + 1;
    out.push({ id: seen[n] === 1 ? String(n) : `${n}-${seen[n]}`, x, y, w, h });
  }
  return out;
}

// ---- scheduling ---------------------------------------------------------------------------------

const DAY = 86_400_000;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** One Anki card's schedule as an FSRS record (null: new and active, so it stays new). */
export function schedule(c: AnkiCard, crt: number, revs: AnkiRev[], now = Date.now()): SchedRec | null {
  const suspended = c.queue === -1;
  const last = revs.length ? revs[revs.length - 1].t : undefined;
  const first = revs.length ? revs[0].t : undefined;
  if (c.type === 0) return suspended ? { due: now, stability: 0, difficulty: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, suspended: true } : null;
  let data: { s?: number; d?: number } = {};
  try {
    data = JSON.parse(c.data || "{}");
  } catch {}
  const due0 = c.odid !== "0" && c.odue ? c.odue : c.due;
  // review cards count days from the collection's start; learning cards keep a time (or a day)
  const due = c.type === 2 || due0 < 1e8 ? (crt + due0 * 86400) * 1000 : due0 * 1000;
  const ivl = Math.max(0, c.ivl);
  const stability = data.s && data.s > 0 ? data.s : c.type === 2 ? Math.max(1, ivl) : 0.5;
  const difficulty = data.d && data.d > 0 ? data.d : clamp(5 + (2500 - (c.factor || 2500)) / 300, 1, 10);
  const lastReview = last ?? (c.type === 2 ? due - ivl * DAY : now);
  return {
    due,
    stability,
    difficulty,
    scheduled_days: c.type === 2 ? ivl : 0,
    learning_steps: 0,
    reps: c.reps,
    lapses: c.lapses,
    state: c.type === 2 ? 2 : c.type === 3 ? 3 : 1,
    last_review: lastReview,
    born: first ?? lastReview,
    ...(suspended ? { suspended: true } : {}),
  };
}

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const deckTag = (path: string[]) => (path[path.length - 1] ?? "anki").trim().replace(/\s+/g, "-");

/** Everything an import will do. `existingTypes`: the library's types; `history`: bring the
 *  schedule and review log along. */
export function plan(read: AnkiRead, opts: { existingTypes?: [string, CardType][]; history?: boolean; now?: number; known?: Set<string> } = {}): Plan {
  const now = opts.now ?? Date.now();
  const history = opts.history !== false;
  const types = new Map(read.types.map((t) => [t.id, t]));
  const deckPath = new Map(read.decks.map((d) => [d.id, d.path]));
  const cardsBy = new Map<string, AnkiCard[]>();
  for (const c of read.cards) cardsBy.set(c.nid, [...(cardsBy.get(c.nid) ?? []), c]);
  const revsBy = new Map<string, AnkiRev[]>();
  for (const r of read.revlog) if (r.type <= 3) revsBy.set(r.cid, [...(revsBy.get(r.cid) ?? []), r]);

  const mapped = new Map<string, PlanType>();
  const items: PlanItem[] = [];
  const deckCount = new Map<string, { path: string[]; notes: number }>();
  let scheduled = 0;
  for (const n of read.notes) {
    const t = types.get(n.mid);
    if (!t) continue;
    let pt = mapped.get(t.id);
    if (!pt) mapped.set(t.id, (pt = { ...mapType(t, opts.existingTypes), notes: 0 }));
    pt.notes++;
    const raw = Object.fromEntries(t.fields.map((f, i) => [f, n.fields[i] ?? ""]));
    const fields: Record<string, string> = {};
    if (pt.target === "occlusion") {
      const im = new RegExp(IMG.source, "i").exec(raw.Image ?? "");
      const src = im ? decodeEntities(im[1] ?? im[2] ?? im[3] ?? "") : "";
      fields.Image = src ? (read.media[src] ?? src) : "";
      fields.Masks = JSON.stringify(occlusionMasks(raw.Occlusion ?? ""));
      fields.Header = fieldText(raw.Header ?? "", read.media);
      fields.Extra = fieldText(raw["Back Extra"] ?? "", read.media);
    } else for (const [from, to] of Object.entries(pt.fieldMap)) fields[to] = fieldText(raw[from] ?? "", read.media);

    const cards = (cardsBy.get(n.id) ?? []).sort((a, b) => a.ord - b.ord);
    const did = cards[0] ? (cards[0].odid !== "0" ? cards[0].odid : cards[0].did) : "";
    const path = (deckPath.get(did) ?? []).filter((p, i, all) => !(all.length === 1 && p === "Default"));
    if (path.length) {
      const k = path.join("\u001f");
      deckCount.set(k, { path, notes: (deckCount.get(k)?.notes ?? 0) + 1 });
    }
    const ankiTpl = (ord: number) => t.templates.find((x) => x.ord === ord) ?? t.templates[ord];
    const suffix = (c: AnkiCard): string => {
      if (pt.target === "occlusion") return `m${c.ord + 1}`;
      if (t.cloze) return `c${c.ord + 1}`;
      if (pt.target === "basic") return "f";
      if (pt.target === "reverse") return c.ord === 0 ? "f" : "r";
      return `t${ankiTpl(c.ord)?.ord ?? c.ord}`;
    };
    items.push({
      guid: n.guid,
      ankiType: t.id,
      fields,
      tags: [...n.tags.filter((x) => !/^leech$/i.test(x)), ...(path.length ? [deckTag(path)] : [])],
      deck: path,
      leech: n.tags.some((x) => /^leech$/i.test(x)),
      cards: cards.map((c) => {
        const rec = history ? schedule(c, read.crt, revsBy.get(c.id) ?? [], now) : null;
        if (rec && rec.state) scheduled++;
        return { suffix: suffix(c), rec };
      }),
    });
  }
  const days: Plan["days"] = {};
  let reviews = 0;
  if (history) {
    // notes already in the library from an earlier import: their history is counted already
    const noteOf = new Map(read.cards.map((c) => [c.id, c.nid]));
    const guidOf = new Map(read.notes.map((n) => [n.id, n.guid]));
    const firstSeen = new Set<string>();
    for (const r of read.revlog) {
      if (r.type > 3) continue;
      if (opts.known?.has(guidOf.get(noteOf.get(r.cid) ?? "") ?? "")) continue;
      const k = dayKey(r.t);
      const d = (days[k] ??= { reviews: 0, new: 0, again: 0, ms: 0 });
      d.reviews++;
      reviews++;
      if (!firstSeen.has(r.cid)) {
        firstSeen.add(r.cid);
        d.new++;
      }
      if (r.ease === 1) d.again++;
      d.ms += Math.min(Math.max(0, r.ms), 120_000);
    }
  }
  return {
    types: [...mapped.values()],
    items,
    days,
    decks: [...deckCount.values()].map((d) => ({ path: d.path, tag: deckTag(d.path), notes: d.notes })),
    scheduled,
    reviews,
  };
}
