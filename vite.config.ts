import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

// In `tauri dev` the page comes from this dev server, so it also answers
// /__labs/… from the labs folder (the release app does this in Rust).
function labsFolder(): Plugin {
  const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };
  const root = (key: "labsRoot" | "notesRoot", fallback: string) => {
    let p = fallback;
    try {
      const s = JSON.parse(readFileSync(join(homedir(), ".local/share/studydesk/settings.json"), "utf8"));
      if (s[key]) p = s[key];
    } catch {}
    return normalize(p.replace(/^~(?=\/|$)/, homedir()));
  };
  return {
    name: "studydesk-labs-folder",
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
