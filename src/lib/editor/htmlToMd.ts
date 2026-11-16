// Pasted HTML (Google Docs, web pages) → Markdown, so headings, bold / italic / strike,
// highlights, lists (nested), tables and links survive a paste into a note. Google Docs marks
// bold and italic with inline styles on <span>s (and wraps everything in a fake <b>), so styles
// are read as well as tags. Runs in the webview (uses DOMParser).

type Fmt = { b?: boolean; i?: boolean; s?: boolean; hl?: boolean; code?: boolean };

function styleFmt(el: HTMLElement, inherit: Fmt): Fmt {
  const f = { ...inherit };
  const tag = el.tagName.toLowerCase();
  const st = el.style;
  const w = st.fontWeight;
  if (tag === "b" || tag === "strong") f.b = !(w === "normal" || w === "400" || (el.id ?? "").startsWith("docs-internal-guid"));
  if (w) f.b = w === "bold" || Number(w) >= 600;
  if (tag === "i" || tag === "em") f.i = true;
  if (st.fontStyle === "italic") f.i = true;
  if (st.fontStyle === "normal") f.i = false;
  if (tag === "s" || tag === "del" || tag === "strike" || /line-through/.test(st.textDecoration || st.textDecorationLine || "")) f.s = true;
  if (tag === "mark") f.hl = true;
  const bg = st.backgroundColor;
  if (bg && !/^(transparent|rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)|#fff(fff)?|white|inherit|initial)$/i.test(bg.trim())) f.hl = true;
  if (tag === "code" || /monospace|courier|consolas/i.test(st.fontFamily)) f.code = true;
  return f;
}

/** Wrap text in markers, keeping spaces outside them ("** x **" is not bold in Markdown). */
function wrap(text: string, f: Fmt): string {
  if (!text.trim()) return text;
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text)![0];
  let core = text.trim();
  if (f.code) return `${lead}\`${core}\`${trail}`;
  if (f.s) core = `~~${core}~~`;
  if (f.i) core = `*${core}*`;
  if (f.b) core = `**${core}**`;
  if (f.hl) core = `==${core}==`;
  return lead + core + trail;
}

const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "blockquote", "pre", "hr", "section", "article"]);

function inline(node: Node, f: Fmt): string {
  if (node.nodeType === Node.TEXT_NODE) return wrap((node.textContent ?? "").replace(/ /g, " ").replace(/\s+/g, " "), f);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "img") return "";
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    const text = [...el.childNodes].map((c) => inline(c, styleFmt(el, f))).join("").trim();
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return text;
    const clean = href.replace(/^https:\/\/www\.google\.com\/url\?q=([^&]+).*$/, (_m, u) => decodeURIComponent(u));
    return text && text !== clean ? `[${text}](${clean})` : clean;
  }
  const g = styleFmt(el, f);
  return [...el.childNodes].map((c) => inline(c, g)).join("");
}

/** Merge "**a****b**" left behind by adjacent spans. */
const tidy = (s: string) => s.replace(/\*\*\*\*/g, "").replace(/(?<!\*)\*\*(?!\*)/g, "**").replace(/==\s*==/g, "").replace(/~~~~/g, "");

function block(node: Node, depth: number, out: string[], f: Fmt) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? "").replace(/\s+/g, " ");
    if (t.trim()) out.push(t.trim());
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const g = styleFmt(el, f);
  const hasBlocks = [...el.children].some((c) => BLOCK.has(c.tagName.toLowerCase()));
  const lineOf = () => tidy([...el.childNodes].map((c) => inline(c, g)).join("")).replace(/[ \t]+\n/g, "\n").trim();
  if (/^h[1-6]$/.test(tag)) {
    // headings are bold already: drop bold marks Google Docs adds to them
    const text = tidy([...el.childNodes].map((c) => inline(c, { ...g, b: false })).join("")).replace(/\*\*/g, "").trim();
    if (text) out.push(`${"#".repeat(Number(tag[1]))} ${text.replace(/\n/g, " ")}`, "");
    return;
  }
  if (tag === "ul" || tag === "ol") {
    let n = 1;
    for (const li of el.children) {
      if (li.tagName.toLowerCase() !== "li") {
        block(li, depth + 1, out, g);
        continue;
      }
      const marker = tag === "ol" ? `${n++}. ` : "- ";
      const own: string[] = [];
      const nested: Element[] = [];
      for (const c of li.childNodes) {
        if (c.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes((c as Element).tagName.toLowerCase())) nested.push(c as Element);
        else own.push(inline(c, styleFmt(li as HTMLElement, g)));
      }
      const text = tidy(own.join("")).replace(/\n+/g, " ").trim();
      out.push("  ".repeat(depth) + marker + text);
      for (const c of nested) block(c, depth + 1, out, g);
    }
    if (depth === 0) out.push("");
    return;
  }
  if (tag === "table") {
    const rows = [...el.querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("td, th")].map((td) => tidy([...td.childNodes].map((c) => (c.nodeType === Node.ELEMENT_NODE && BLOCK.has((c as Element).tagName.toLowerCase()) ? inline(c, g) + " " : inline(c, g))).join("")).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim()),
    );
    if (!rows.length) return;
    const cols = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => r[i] ?? "");
    rows[0] = rows[0].map((c) => c.replace(/^\*\*(.*)\*\*$/, "$1")); // header cells are bold already
    out.push(`| ${pad(rows[0]).join(" | ")} |`, `| ${Array(cols).fill("---").join(" | ")} |`, ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`), "");
    return;
  }
  if (tag === "hr") {
    out.push("---", "");
    return;
  }
  if (tag === "blockquote") {
    const inner: string[] = [];
    for (const c of el.childNodes) block(c, 0, inner, g);
    out.push(...inner.filter((l, i, a) => l || (i > 0 && a[i - 1])).map((l) => (l ? `> ${l}` : ">")), "");
    return;
  }
  if (tag === "pre") {
    out.push("```", (el.textContent ?? "").replace(/\n$/, ""), "```", "");
    return;
  }
  if (hasBlocks) {
    for (const c of el.childNodes) block(c, depth, out, g);
    return;
  }
  const text = lineOf();
  if (text) out.push(text, tag === "li" ? "" : "");
  else if (tag === "p") out.push("");
}

/** True when the HTML carries structure worth keeping (otherwise let the plain text paste). */
export function richHtml(html: string): boolean {
  return /<(h[1-6]|ul|ol|li|table|b|strong|em|i|s|del|mark|blockquote|a\s)[\s>]|font-weight|font-style|line-through|background-color/i.test(html);
}

export function htmlToMd(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, meta, title, head").forEach((n) => n.remove());
  const out: string[] = [];
  for (const c of doc.body.childNodes) block(c, 0, out, {});
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
