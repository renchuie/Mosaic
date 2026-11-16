import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

// In `tauri dev` the page comes from this dev server, so it also answers
// /__labs/… from the labs folder (the release app does this in Rust).
function labsFolder(): Plugin {
  const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".pdf": "application/pdf" };
  const root = (key: "labsRoot" | "notesRoot" | "pdfRoot", fallback: string) => {
    let p = (key === "pdfRoot" && process.env.STUDYDESK_PDFS) || fallback;
    try {
      const s = JSON.parse(readFileSync(join(homedir(), ".local/share/studydesk/settings.json"), "utf8"));
      if (s[key]) p = s[key];
    } catch {}
    return normalize(p.replace(/^~(?=\/|$)/, homedir()));
  };
  // every PDF under the PDF folder, like the Rust pdfs_list (dev and browser tests only)
  const listPdfs = (base: string, depth = 6) => {
    const files: { rel: string; mtime: number; size: number }[] = [];
    const walk = (dir: string, d: number) => {
      let names: string[] = [];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const n of names) {
        if (n.startsWith(".")) continue;
        const p = join(dir, n);
        const st = statSync(p, { throwIfNoEntry: false });
        if (st?.isDirectory() && d > 0) walk(p, d - 1);
        else if (st?.isFile() && n.toLowerCase().endsWith(".pdf")) files.push({ rel: p.slice(base.length + 1).split(sep).join("/"), mtime: Math.round(st.mtimeMs), size: st.size });
      }
    };
    walk(base, depth);
    return files.sort((a, b) => a.rel.toLowerCase().localeCompare(b.rel.toLowerCase()));
  };
  const pdfRoot = () => root("pdfRoot", "~/GoogleDrive/Pharmacy School");
  type Mw = { use: (path: string, fn: (req: { url?: string }, res: import("node:http").ServerResponse) => void) => void };
  const mount = (mw: Mw, serve: (base: string, req: { url?: string }, res: import("node:http").ServerResponse) => void) => {
    mw.use("/__pdfs/", (req, res) => serve(pdfRoot(), req, res));
    mw.use("/__pdfs-list", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ root: pdfRoot(), files: listPdfs(pdfRoot()) }));
    });
  };
  return {
    name: "studydesk-labs-folder",
    configurePreviewServer(server) {
      mount(server.middlewares as unknown as Mw, (base, req, res) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = normalize(join(base, rel));
        if (!file.startsWith(base + sep) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", types[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    configureServer(server) {
      const serve = (base: string, req: { url?: string }, res: import("node:http").ServerResponse) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = normalize(join(base, rel));
        if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", types[extname(file).toLowerCase()] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).pipe(res);
      };
      server.middlewares.use("/__labs/", (req, res) => serve(root("labsRoot", "~/GoogleDrive/Pharmacy School/Study Lab/Recall Labs"), req, res));
      server.middlewares.use("/__notes/", (req, res) => serve(root("notesRoot", "~/GoogleDrive/Pharmacy School/Study Lab/Notes"), req, res));
      mount(server.middlewares as unknown as Mw, serve);
    },
  };
}

export default defineConfig({
  plugins: [svelte(), labsFolder()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  // one desktop bundle loaded from disk, so a large chunk is fine
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
