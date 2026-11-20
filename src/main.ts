import "@fontsource/atkinson-hyperlegible-next/latin-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-500.css";
import "@fontsource/atkinson-hyperlegible-next/latin-600.css";
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/print.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { loadSettings, settings } from "./lib/stores/settings.svelte";
import { initLabs, migrateLabDocs } from "./lib/stores/labs.svelte";
import { initSynced } from "./lib/stores/synced.svelte";
import { initCalendar } from "./lib/stores/calendar.svelte";
import { initBlockStyles } from "./lib/stores/blockStyles.svelte";
import { initPlan } from "./lib/stores/plan.svelte";
import { initCourses } from "./lib/stores/courses.svelte";
import { startFiles } from "./lib/stores/startup";
import { initLibrary } from "./lib/stores/library.svelte";
import { inTauri, invoke } from "./lib/tauri";
import { filesTest, pptxTest, materialsTest, pdfTest, selfTest, timerTest } from "./lib/selftest";

await loadSettings().catch((e) => console.error("settings", e));
mount(App, { target: document.getElementById("app")! });
await initSynced(migrateLabDocs).catch((e) => console.error("sync", e));
initCalendar();
initBlockStyles();
initCourses();
initLibrary();
await initPlan().catch((e) => console.error("plan", e));
await initLabs().catch((e) => console.error("labs", e));
// a fresh install starts these once onboarding has chosen where the files live
if (settings.onboarded || !inTauri) await startFiles();

// STUDYDESK_ROUTE=labs/... opens a page at start; STUDYDESK_ROUTE=selftest prints checks (used for testing).
if (inTauri) {
  const start = await invoke<string | null>("debug_route").catch(() => null);
  if (start === "selftest") void selfTest();
  else if (start === "selftest-timer") void timerTest();
  else if (start === "selftest-pdf") void pdfTest();
  else if (start === "selftest-materials") setTimeout(() => void materialsTest(), 1500);
  else if (start === "selftest-files") setTimeout(() => void filesTest(), 2500);
  else if (start === "selftest-pptx") setTimeout(() => void pptxTest(), 2500);
  else if (start) location.hash = `#/${start}`;
}
