// Small Markdown → HTML for material text (quiz stems, explanations, later cases and
// summaries): paragraphs, line breaks, - and 1. lists, pipe tables, ### headings, bold,
// italic, code, ==highlight== and images. Everything is escaped first. Pure; node-tested.

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function mdInline(md: string, img: (src: string) => string = (s) => s): string {
  let s = esc(md);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => `<img src="${esc(img(src))}" alt="${alt}">`);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>").replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, "$1<i>$2</i>");
  s = s.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  s = s.replace(/\^([^\s^]+)\^/g, "<sup>$1</sup>").replace(/~([^\s~]+)~/g, "<sub>$1</sub>");
  return s;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function mdHtml(md: string, img?: (src: string) => string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  let out = "";
  let para: string[] = [];
  const flush = () => {
    if (para.length) out += `<p>${para.map((l) => mdInline(l, img)).join("<br>")}</p>`;
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) {
      flush();
      continue;
    }
    // table: a pipe row followed by a divider row
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1]) && lines[i + 1].includes("|")) {
      flush();
      const head = cells(l);
      let html = `<table><thead><tr>${head.map((c) => `<th>${mdInline(c, img)}</th>`).join("")}</tr></thead><tbody>`;
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        html += `<tr>${cells(lines[i]).map((c) => `<td>${mdInline(c, img)}</td>`).join("")}</tr>`;
        i++;
      }
      i--;
      out += html + "</tbody></table>";
      continue;
    }
    const h = /^(#{3,6})\s+(.*)$/.exec(l);
    if (h) {
      flush();
      out += `<h4>${mdInline(h[2], img)}</h4>`;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      const ordered = /^\s*\d/.test(l);
      let html = ordered ? "<ol>" : "<ul>";
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        html += `<li>${mdInline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""), img)}</li>`;
        i++;
      }
      i--;
      out += html + (ordered ? "</ol>" : "</ul>");
      continue;
    }
    para.push(l.trim());
  }
  flush();
  return out;
}
