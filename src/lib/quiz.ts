// Mosaic quiz format v1: parsing and grading. Pure (imports nothing), node-tested.
// The format is written up in docs/mosaic-format.md and in QUIZ_GUIDE below (the text she
// copies into Claude). Files are never changed by Mosaic; question ids are fingerprints of
// the question itself, so progress survives re-ordering and edits elsewhere in the file.

export type QType = "single" | "sata" | "tf" | "blank" | "dropdown" | "calc";
export type Blank = { kind: "text"; answers: string[] } | { kind: "select"; options: string[]; correct: number };
export type Part = { t: "text"; s: string } | { t: "blank"; i: number };
export type Question = {
  id: string;
  n: number; // 1-based position in the file
  type: QType;
  topic: string;
  stem: string; // Markdown (for blank/dropdown, the {{…}} groups are still in it; see `parts`)
  options: { text: string; correct: boolean }[]; // single, sata
  blanks: Blank[]; // blank, dropdown
  parts: Part[]; // stem split around the blanks
  answer?: boolean; // tf
  calc?: { value: number; tol: number; rel: boolean; unit: string };
  explanation: string;
  line: number;
};
export type QuizMeta = { mosaic: string; version: number; id: string; title: string; course?: string; exam?: string; topics: string[] };
export type Problem = { line: number; n?: number; msg: string };
export type Quiz = { meta: QuizMeta; questions: Question[]; problems: Problem[]; intro: string };

const TYPE_ALIASES: Record<string, QType> = {
  single: "single", mc: "single", mcq: "single", "multiple choice": "single", choice: "single", "single choice": "single",
  sata: "sata", multi: "sata", multiple: "sata", "select all": "sata", "select all that apply": "sata", checkbox: "sata",
  tf: "tf", "t/f": "tf", "true/false": "tf", truefalse: "tf", "true false": "tf",
  blank: "blank", fill: "blank", "fill in the blank": "blank", "fill-in": "blank", cloze: "blank",
  dropdown: "dropdown", "drop-down": "dropdown", select: "dropdown", dropdowns: "dropdown",
  calc: "calc", calculation: "calc", numeric: "calc", number: "calc", math: "calc",
};
export const TYPE_LABEL: Record<QType, string> = {
  single: "Multiple choice", sata: "Select all that apply", tf: "True or false", blank: "Fill in the blank", dropdown: "Drop-downs", calc: "Calculation",
};

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** FNV-1a, base 36: short stable ids. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.%/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function frontMatter(text: string): { meta: Record<string, string>; body: string; bodyLine: number } {
  const t = text.replace(/^﻿/, "").replace(/\r/g, "");
  if (!t.startsWith("---\n")) return { meta: {}, body: t, bodyLine: 1 };
  const end = t.indexOf("\n---", 4);
  if (end < 0) return { meta: {}, body: t, bodyLine: 1 };
  const meta: Record<string, string> = {};
  for (const l of t.slice(4, end).split("\n")) {
    const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
    if (m) meta[m[1].toLowerCase()] = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  const after = t.indexOf("\n", end + 4);
  const body = after < 0 ? "" : t.slice(after + 1);
  return { meta, body, bodyLine: t.slice(0, after + 1).split("\n").length };
}

const list = (v?: string) =>
  (v ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((x) => x.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

function parseHeading(h: string): { type?: QType; topic: string } {
  const tokens = h
    .split(/\s*(?:·|•|\||—|–|\s-\s)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (tokens.length && /^q\s*\d+[.:)]?$/i.test(tokens[0])) tokens.shift();
  let type: QType | undefined;
  const rest: string[] = [];
  for (const tk of tokens) {
    const key = tk.toLowerCase().replace(/[()[\]]/g, "").trim();
    if (!type && TYPE_ALIASES[key]) type = TYPE_ALIASES[key];
    else rest.push(tk.replace(/^topic\s*:\s*/i, ""));
  }
  return { type, topic: rest.join(" · ") };
}

const NUM = /-?\d+(?:[.,]\d+)?/;
export function parseCalc(s: string): Question["calc"] | null {
  const m = NUM.exec(s);
  if (!m) return null;
  const value = parseFloat(m[0].replace(",", "."));
  let rest = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
  let tol = 1;
  let rel = true; // default: within 1 %
  const t = /(?:±|\+\/-|\+-)\s*(\d+(?:[.,]\d+)?)\s*(%)?/.exec(rest);
  if (t) {
    tol = parseFloat(t[1].replace(",", "."));
    rel = !!t[2];
    rest = rest.replace(t[0], " ");
  }
  return { value, tol, rel, unit: rest.replace(/\s+/g, " ").trim() };
}

const GROUP = /\{\{([^{}]+)\}\}/g;

export function parseQuiz(text: string, fallbackTitle = "Quiz"): Quiz {
  const { meta: fm, body, bodyLine } = frontMatter(text);
  const title = fm.title || fallbackTitle;
  const meta: QuizMeta = {
    mosaic: (fm.mosaic ?? "").toLowerCase(),
    version: Number(fm.version) || 1,
    id: fm.id || slugify(title),
    title,
    course: fm.course || undefined,
    exam: fm.exam || undefined,
    topics: list(fm.topics ?? fm.topic),
  };
  const problems: Problem[] = [];
  if (meta.mosaic && meta.mosaic !== "quiz") problems.push({ line: 1, msg: `This file is a "${meta.mosaic}", not a quiz.` });
  if (!meta.mosaic) problems.push({ line: 1, msg: 'The header is missing "mosaic: quiz".' });

  // split into question blocks at "## " lines (outside code fences)
  const lines = body.split("\n");
  const blocks: { head: string; line: number; rows: { s: string; line: number }[] }[] = [];
  const intro: string[] = [];
  let inCode = false;
  lines.forEach((l, i) => {
    const line = bodyLine + i;
    if (/^\s*```/.test(l)) inCode = !inCode;
    const h = !inCode && /^##\s+(.*)$/.exec(l);
    if (h) blocks.push({ head: h[1].trim(), line, rows: [] });
    else if (blocks.length) blocks[blocks.length - 1].rows.push({ s: l, line });
    else intro.push(l);
  });

  const questions: Question[] = [];
  const seen = new Set<string>();
  blocks.forEach((b, k) => {
    const n = k + 1;
    const head = parseHeading(b.head);
    const stem: string[] = [];
    const expl: string[] = [];
    const options: Question["options"] = [];
    let answer: string | null = null;
    let answerLine = b.line;
    for (const r of b.rows) {
      const opt = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(r.s);
      const ex = /^\s*>\s?(.*)$/.exec(r.s);
      const an = /^\s*(?:\*\*)?(?:answer|correct answer)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*?)\s*(?:\*\*)?\s*$/i.exec(r.s);
      if (opt) options.push({ text: opt[2].trim(), correct: opt[1] !== " " });
      else if (ex) expl.push(ex[1]);
      else if (an) {
        answer = an[1];
        answerLine = r.line;
      } else if (!options.length && answer === null) stem.push(r.s);
      else if (r.s.trim()) expl.push(r.s); // stray text after the answer: keep it as explanation
    }
    const stemText = stem.join("\n").trim();
    const groups = [...stemText.matchAll(GROUP)].map((m) => m[1]);
    // infer a missing type
    let type = head.type;
    if (!type) {
      if (groups.some((g) => g.split("|").some((p) => p.trim().startsWith("*")))) type = "dropdown";
      else if (groups.length) type = "blank";
      else if (options.length) type = options.filter((o) => o.correct).length > 1 ? "sata" : "single";
      else if (answer !== null && /^(true|false|t|f|yes|no)\.?$/i.test(answer)) type = "tf";
      else if (answer !== null && NUM.test(answer)) type = "calc";
      else type = "single";
    }
    const bad = (msg: string, line = b.line) => problems.push({ line, n, msg: `Question ${n}: ${msg}` });
    const q: Question = { id: "", n, type, topic: head.topic || meta.topics[0] || "", stem: stemText, options: [], blanks: [], parts: [], explanation: expl.join("\n").trim().replace(/^explanation\s*:\s*/i, ""), line: b.line };
    if (!stemText) return bad("it has no question text.");

    if (type === "single" || type === "sata") {
      // true/false written as two options
      q.options = options;
      const right = options.filter((o) => o.correct).length;
      if (options.length < 2) return bad("it needs at least two options written as “- [ ] …”, with “- [x]” for the right one.");
      if (type === "single" && right !== 1) return bad(`multiple choice needs exactly one “- [x]” (it has ${right}). Use “sata” for more than one.`);
      if (type === "sata" && right < 1) return bad("select-all needs at least one “- [x]”.");
    } else if (type === "tf") {
      let v: boolean | null = null;
      if (answer !== null) v = /^(true|t|yes)\.?$/i.test(answer) ? true : /^(false|f|no)\.?$/i.test(answer) ? false : null;
      else if (options.length) {
        const c = options.find((o) => o.correct)?.text.toLowerCase();
        v = c?.startsWith("t") ? true : c?.startsWith("f") ? false : null;
      }
      if (v === null) return bad("true/false needs “Answer: true” or “Answer: false”.", answerLine);
      q.answer = v;
    } else if (type === "blank" || type === "dropdown") {
      if (!groups.length) return bad("put each blank in the sentence as {{answer}}" + (type === "dropdown" ? " with choices {{*right|wrong|wrong}}." : ", alternatives as {{apixaban|Eliquis}}."));
      for (const g of groups) {
        const parts = g.split("|").map((p) => p.trim()).filter(Boolean);
        const stars = parts.filter((p) => p.startsWith("*")).length;
        if (stars) {
          if (stars !== 1) return bad(`each drop-down needs exactly one *right choice ({{${g}}}).`);
          q.blanks.push({ kind: "select", options: parts.map((p) => p.replace(/^\*\s*/, "")), correct: parts.findIndex((p) => p.startsWith("*")) });
        } else q.blanks.push({ kind: "text", answers: parts });
      }
      let last = 0;
      let i = 0;
      for (const m of stemText.matchAll(GROUP)) {
        if (m.index! > last) q.parts.push({ t: "text", s: stemText.slice(last, m.index) });
        q.parts.push({ t: "blank", i: i++ });
        last = m.index! + m[0].length;
      }
      if (last < stemText.length) q.parts.push({ t: "text", s: stemText.slice(last) });
    } else if (type === "calc") {
      const c = answer !== null ? parseCalc(answer) : null;
      if (!c) return bad("a calculation needs “Answer: 45 mL/min” (optionally “± 2” or “± 5%”).", answerLine);
      q.calc = c;
    }
    const plain = norm(stemText.replace(GROUP, "_"));
    let id = "q" + hash(type + "|" + plain);
    while (seen.has(id)) id += "x"; // the same question twice in one file
    seen.add(id);
    q.id = id;
    questions.push(q);
  });
  if (!blocks.length) problems.push({ line: bodyLine, msg: "No questions found. Each question starts with a line like “## Q1 · single”." });
  return { meta, questions, problems, intro: intro.join("\n").trim() };
}

// ---- grading --------------------------------------------------------------------------

export type Response = number | number[] | boolean | string[] | string | null;
export type Result = { correct: boolean; parts?: boolean[] };

export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** Typed answer vs accepted answers: case, accents, punctuation and small typos forgiven. */
export function textMatches(given: string, answers: string[]): boolean {
  const g = norm(given);
  if (!g) return false;
  return answers.some((a) => {
    const t = norm(a);
    if (g === t) return true;
    if (/\d/.test(t)) return g.replace(/\s+/g, "") === t.replace(/\s+/g, ""); // numbers must be exact
    const allowed = t.length >= 10 ? 2 : t.length >= 5 ? 1 : 0;
    return lev(g, t) <= allowed;
  });
}

export function calcMatches(given: string, c: NonNullable<Question["calc"]>): boolean {
  const m = NUM.exec(given ?? "");
  if (!m) return false;
  const v = parseFloat(m[0].replace(",", "."));
  const tol = c.rel ? Math.abs(c.value) * (c.tol / 100) : c.tol;
  return Math.abs(v - c.value) <= tol + 1e-9;
}

export function grade(q: Question, r: Response): Result {
  switch (q.type) {
    case "single":
      return { correct: typeof r === "number" && !!q.options[r]?.correct };
    case "sata": {
      // all or nothing: exactly the right set
      const picked = new Set(Array.isArray(r) ? (r as number[]) : []);
      return { correct: q.options.every((o, i) => o.correct === picked.has(i)) };
    }
    case "tf":
      return { correct: typeof r === "boolean" && r === q.answer };
    case "blank":
    case "dropdown": {
      const given = Array.isArray(r) ? (r as string[]) : [];
      const parts = q.blanks.map((b, i) => (b.kind === "text" ? textMatches(given[i] ?? "", b.answers) : String(b.correct) === String(given[i] ?? "")));
      return { correct: parts.every(Boolean), parts };
    }
    case "calc":
      return { correct: typeof r === "string" && calcMatches(r, q.calc!) };
  }
}

/** The right answer, written out, for feedback. */
export function rightAnswer(q: Question): string {
  switch (q.type) {
    case "single":
    case "sata":
      return q.options.filter((o) => o.correct).map((o) => o.text).join("; ");
    case "tf":
      return q.answer ? "True" : "False";
    case "blank":
    case "dropdown":
      return q.blanks.map((b) => (b.kind === "text" ? b.answers[0] : b.options[b.correct])).join(" · ");
    case "calc": {
      const c = q.calc!;
      return `${c.value}${c.unit ? " " + c.unit : ""}${c.tol ? ` (± ${c.tol}${c.rel ? "%" : c.unit ? " " + c.unit : ""})` : ""}`;
    }
  }
}

export function shuffled<T>(a: T[], rand = Math.random): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Copy-ready instructions for Claude / NotebookLM (an early piece of the prompt kit). */
export const QUIZ_GUIDE = `Write the quiz as a Mosaic quiz file (Markdown). Output only the file, nothing before or after it.

Start with this header:
---
mosaic: quiz
title: <short title>
course: <course name>
exam: <exam name, optional>
---

Then each question starts with a heading line: "## Q<number> · <type> · <topic>".
Types: single, sata, tf, blank, dropdown, calc.

single (one right answer) and sata (select all that apply; all-or-nothing):
## Q1 · single · DOAC dosing
A 72-year-old with AF and CrCl 45 mL/min starts apixaban. Which dose?
- [ ] 2.5 mg twice daily
- [x] 5 mg twice daily
- [ ] 10 mg twice daily
> Explanation: only 1 of the 3 dose-reduction criteria is met.

tf:
## Q2 · tf · Warfarin
Vitamin K is the reversal agent for dabigatran.
Answer: false
> Idarucizumab reverses dabigatran.

blank (each blank in double braces; list accepted alternatives with |):
## Q3 · blank · Reversal agents
The antidote for dabigatran is {{idarucizumab|Praxbind}}.

dropdown (choices in double braces, * marks the right one):
## Q4 · dropdown · Heparin
Unfractionated heparin is monitored with the {{*aPTT|INR|anti-Xa only}} and reversed with {{*protamine|vitamin K|andexanet}}.

calc (the number, optional unit, optional tolerance as ± number or ± percent):
## Q5 · calc · Renal dosing
Calculate CrCl (Cockcroft–Gault) for a 68-year-old woman, 82 kg, SCr 1.4 mg/dL.
Answer: 50 mL/min ± 2
> (140 − 68) × 82 × 0.85 / (72 × 1.4) = 49.8 mL/min.

Rules: every question has an explanation line starting with ">". Use Markdown tables for lab values. Don't number options. Keep one question per heading.`;
