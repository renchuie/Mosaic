import "@fontsource/atkinson-hyperlegible-next/latin-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-500.css";
import "@fontsource/atkinson-hyperlegible-next/latin-600.css";
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { loadSettings } from "./lib/stores/settings.svelte";
import { initLabs } from "./lib/stores/labs.svelte";
import { inTauri, invoke } from "./lib/tauri";
import { selfTest } from "./lib/selftest";

await loadSettings().catch((e) => console.error("settings", e));
mount(App, { target: document.getElementById("app")! });
await initLabs().catch((e) => console.error("labs", e));

// STUDYDESK_ROUTE=labs/... opens a page at start; STUDYDESK_ROUTE=selftest prints checks (used for testing).
if (inTauri) {
  const start = await invoke<string | null>("debug_route").catch(() => null);
  if (start === "selftest") void selfTest();
  else if (start) location.hash = `#/${start}`;
}
