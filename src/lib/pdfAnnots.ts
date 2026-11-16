// Annotations Mosaic saves INTO the PDF, as standard PDF annotations (Highlight,
// Underline, StrikeOut, Square, Ink, Text) with appearance streams, so any PDF reader
// shows them too. Ours are marked with /NM "sd-…" and carry our own data in /SDData
// (JSON), so they can be read back exactly and replaced on every save; anything else in
// the file (the lecturer's own annotations, forms, links) is left alone.
//
// Coordinates are PDF user space (points, origin bottom-left), which is what pdf.js's
// viewport.convertToPdfPoint gives, so rotation and crop boxes are handled there.
//
// Imports only pdf-lib, so it can be tested with plain node.
import {
  LineCapStyle,
  LineJoinStyle,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingRgbColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  type PDFOperator,
} from "pdf-lib";

export type Rect = [number, number, number, number]; // x1, y1, x2, y2 with x1<x2, y1<y2
export type AnnotKind = "highlight" | "underline" | "strike" | "box" | "pen" | "note";
export type PdfAnnot = {
  id: string; // "sd-…"
  page: number; // 0-based
  kind: AnnotKind;
  color: string; // #rrggbb
  rects: Rect[]; // text lines for highlight/underline/strike, the box, the note icon; bbox for pen
  ink?: number[][]; // pen strokes: [x, y, x, y, …]
  width?: number; // pen width in points
  text?: string; // the selected text
  comment?: string;
  created: number;
  updated?: number;
  card?: string; // library item made from it
  note?: string; // note it was quoted into
};

export const HIGHLIGHTS = [
  { name: "Yellow", color: "#ffe17a" },
  { name: "Rose", color: "#f6a4ac" },
  { name: "Sage", color: "#9fd6c3" },
  { name: "Peach", color: "#fbc28e" },
  { name: "Lavender", color: "#c9b5f5" },
];

export const newAnnotId = () => `sd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const textOf = (o: unknown): string | undefined => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffe17a;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function bbox(a: Pick<PdfAnnot, "rects" | "ink" | "width">): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of a.rects) xs.push(r[0], r[2]), ys.push(r[1], r[3]);
  for (const s of a.ink ?? []) for (let i = 0; i + 1 < s.length; i += 2) xs.push(s[i]), ys.push(s[i + 1]);
  if (!xs.length) return [0, 0, 0, 0];
  const pad = (a.width ?? 0) / 2 + 1;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

/** Merge selection rectangles that sit on the same text line into one per line. */
export function mergeLines(rects: Rect[]): Rect[] {
  const sorted = rects.filter((r) => r[2] - r[0] > 0.5 && r[3] - r[1] > 0.5).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const h = Math.min(r[3] - r[1], last ? last[3] - last[1] : Infinity);
    const overlap = last ? Math.min(r[3], last[3]) - Math.max(r[1], last[1]) : 0;
    if (last && overlap > h * 0.5 && r[0] <= last[2] + h * 1.5) {
      last[0] = Math.min(last[0], r[0]);
      last[1] = Math.min(last[1], r[1]);
      last[2] = Math.max(last[2], r[2]);
      last[3] = Math.max(last[3], r[3]);
    } else out.push([...r] as Rect);
  }
  return out;
}

export type ReadResult = {
  annots: PdfAnnot[];
  /** The PDF without our annotations, for pdf.js to draw (we draw ours on top). */
  clean: Uint8Array;
  pages: number;
  /** pdf-lib can't re-save encrypted PDFs, so those open read-only. */
  readOnly: boolean;
};

async function load(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
}

/** Remove our annotations from every page; returns what they were. */
function strip(doc: PDFDocument): PdfAnnot[] {
  const found: PdfAnnot[] = [];
  doc.getPages().forEach((page, pi) => {
    const arr = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!arr) return;
    for (let i = arr.size() - 1; i >= 0; i--) {
      const raw = arr.get(i);
      const dict = doc.context.lookupMaybe(raw, PDFDict);
      const nm = dict && textOf(dict.get(PDFName.of("NM")));
      if (!dict || !nm?.startsWith("sd-")) continue;
      arr.remove(i);
      if (raw instanceof PDFRef) doc.context.delete(raw);
      try {
        const data = JSON.parse(textOf(dict.get(PDFName.of("SDData"))) ?? "");
        if (data && typeof data === "object" && Array.isArray(data.rects)) found.push({ ...data, id: nm, page: pi });
      } catch {
        /* an sd- annotation without readable data is dropped */
      }
    }
  });
  return found.sort((a, b) => a.page - b.page || b.rects[0]?.[3] - a.rects[0]?.[3] || a.created - b.created);
}

export async function readAnnots(bytes: Uint8Array): Promise<ReadResult> {
  const doc = await load(bytes);
  const annots = strip(doc);
  const readOnly = doc.isEncrypted;
  const clean = annots.length && !readOnly ? await doc.save() : bytes;
  return { annots, clean, pages: doc.getPageCount(), readOnly };
}

function appearance(a: PdfAnnot): { ops: PDFOperator[]; blend: boolean } {
  const [r, g, b] = rgb(a.color);
  const ops: PDFOperator[] = [pushGraphicsState()];
  let blend = false;
  if (a.kind === "highlight") {
    blend = true;
    ops.push(setGraphicsState("GS0"), setFillingRgbColor(r, g, b));
    for (const q of a.rects) ops.push(rectangle(q[0], q[1], q[2] - q[0], q[3] - q[1]), fill());
  } else if (a.kind === "underline" || a.kind === "strike") {
    ops.push(setStrokingRgbColor(r * 0.8, g * 0.8, b * 0.8));
    for (const q of a.rects) {
      const h = q[3] - q[1];
      const y = a.kind === "underline" ? q[1] + h * 0.08 : q[1] + h * 0.45;
      ops.push(setLineWidth(Math.max(1, h * 0.07)), moveTo(q[0], y), lineTo(q[2], y), stroke());
    }
  } else if (a.kind === "box") {
    const q = a.rects[0];
    ops.push(setStrokingRgbColor(r * 0.85, g * 0.85, b * 0.85), setLineWidth(2), setLineJoin(LineJoinStyle.Round), rectangle(q[0] + 1, q[1] + 1, q[2] - q[0] - 2, q[3] - q[1] - 2), stroke());
  } else if (a.kind === "pen") {
    ops.push(setStrokingRgbColor(r * 0.8, g * 0.8, b * 0.8), setLineWidth(a.width ?? 2), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round));
    for (const s of a.ink ?? []) {
      if (s.length < 2) continue;
      ops.push(moveTo(s[0], s[1]));
      for (let i = 2; i + 1 < s.length; i += 2) ops.push(lineTo(s[i], s[i + 1]));
      if (s.length === 2) ops.push(lineTo(s[0] + 0.1, s[1]));
      ops.push(stroke());
    }
  } else if (a.kind === "note") {
    const q = a.rects[0];
    ops.push(setFillingRgbColor(r, g, b), rectangle(q[0], q[1], q[2] - q[0], q[3] - q[1]), fill());
    ops.push(setStrokingRgbColor(0.23, 0.19, 0.2), setLineWidth(1));
    const w = q[2] - q[0];
    const h = q[3] - q[1];
    for (const f of [0.68, 0.5, 0.32]) ops.push(moveTo(q[0] + w * 0.22, q[1] + h * f), lineTo(q[0] + w * (f === 0.32 ? 0.55 : 0.78), q[1] + h * f), stroke());
  }
  ops.push(popGraphicsState());
  return { ops, blend };
}

const SUBTYPE: Record<AnnotKind, string> = { highlight: "Highlight", underline: "Underline", strike: "StrikeOut", box: "Square", pen: "Ink", note: "Text" };

/** The PDF with exactly `annots` as our annotations (old ones replaced). */
export async function writeAnnots(bytes: Uint8Array, annots: PdfAnnot[]): Promise<Uint8Array> {
  const doc = await load(bytes);
  if (doc.isEncrypted) throw new Error("This PDF is encrypted, so Mosaic can't save into it.");
  strip(doc);
  const ctx = doc.context;
  const pages = doc.getPages();
  const now = new Date();
  for (const a of annots) {
    const page = pages[a.page];
    if (!page || !(a.kind === "pen" ? a.ink?.length : a.rects.length)) continue;
    const rect = a.kind === "note" ? a.rects[0] : bbox(a);
    const { ops, blend } = appearance(a);
    const resources = blend ? { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply", ca: 1, CA: 1 } } } : {};
    const ap = ctx.register(ctx.formXObject(ops, { BBox: rect, Resources: resources }));
    const { id: _id, page: _page, ...data } = a;
    const dict: Record<string, unknown> = {
      Type: "Annot",
      Subtype: SUBTYPE[a.kind],
      Rect: rect,
      C: rgb(a.color),
      F: 4, // print
      NM: PDFString.of(a.id),
      T: PDFHexString.fromText("Mosaic"),
      M: PDFString.fromDate(new Date(a.updated ?? a.created ?? now)),
      CreationDate: PDFString.fromDate(new Date(a.created ?? now)),
      Contents: PDFHexString.fromText(a.comment || (a.kind === "note" ? "" : (a.text ?? ""))),
      AP: { N: ap },
      SDData: PDFHexString.fromText(JSON.stringify(data)),
    };
    if (a.kind === "highlight" || a.kind === "underline" || a.kind === "strike") dict.QuadPoints = a.rects.flatMap((q) => [q[0], q[3], q[2], q[3], q[0], q[1], q[2], q[1]]);
    if (a.kind === "pen") {
      dict.InkList = a.ink ?? [];
      dict.BS = { W: a.width ?? 2 };
    }
    if (a.kind === "box") dict.BS = { W: 2 };
    if (a.kind === "note") {
      dict.Name = "Comment";
      dict.Open = false;
    }
    if (a.kind === "highlight") dict.CA = 1;
    page.node.addAnnot(ctx.register(ctx.obj(dict as Parameters<typeof ctx.obj>[0])));
  }
  return doc.save();
}
