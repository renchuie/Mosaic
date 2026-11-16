import { loadDoc, saveDoc } from "../tauri";

export type Settings = {
  name: string;
  labsRoot: string;
  scanDepth: number;
  /** comma-separated words that mark a calendar event as an exam */
  examKeywords: string;
  syncEnabled: boolean;
  syncDir: string;
  /** folder of Markdown notes (Study → Notes) */
  notesRoot: string;
  /** folder searched for PDFs (Study → PDFs), and how many folders deep */
  pdfRoot: string;
  pdfDepth: number;
  /** flashcards: new cards introduced per day, and FSRS target retention (0.7–0.97) */
  newPerDay: number;
  retention: number;
  /** keep cards in an exam's course from being scheduled past the evening before it */
  examAware: boolean;
  /** look: frosted glass (default since Nov 16) or the original solid pastel */
  theme: "glass" | "pastel";
  /** spacing: spacious (default), original, compact */
  density: "spacious" | "original" | "compact";
  /** flashcards in notes: soft background on card lines, arrow pill colour, cloze colour */
  cardBg: boolean;
  arrowColor: string;
  clozeColor: string;
};

/** Arrow pill colours: [one way, both ways]. "mosaic" is the original pink / periwinkle pair. */
export const ARROW_COLOURS: Record<string, [string, string]> = {
  mosaic: ["linear-gradient(135deg, #e3949b, #c58bd6)", "linear-gradient(135deg, #8b9be8, #c58bd6)"],
  rose: ["#e3949b", "#d07f87"],
  lavender: ["#a993e0", "#8f78cf"],
  sage: ["#7fb3a6", "#679d90"],
  peach: ["#e9a978", "#d8925f"],
  blue: ["#7fa6d9", "#6a91c6"],
  charcoal: ["#3b3033", "#5a4d51"],
};
/** Cloze colours: [fill, underline]. */
export const CLOZE_COLOURS: Record<string, [string, string]> = {
  butter: ["#fbe29a", "#d9a93a"],
  rose: ["#f6c9c7", "#d98a91"],
  sage: ["#cfe5dd", "#7fb3a6"],
  peach: ["#fadcc0", "#e3a36e"],
  lavender: ["#e3d9f7", "#a993e0"],
  blue: ["#d3e3f5", "#7fa6d9"],
};

export const DEFAULT_SETTINGS: Settings = {
  name: "Jazmine",
  /** Materials folder (Study → Materials); was the Recall Labs folder before Nov 16 */
  labsRoot: "~/GoogleDrive/Pharmacy School/Study Lab/Materials",
  scanDepth: 4,
  examKeywords: "Exam",
  syncEnabled: true,
  syncDir: "~/GoogleDrive/Pharmacy School/Study Lab/Study Desk Sync",
  notesRoot: "~/GoogleDrive/Pharmacy School/Study Lab/Notes",
  pdfRoot: "~/GoogleDrive/Pharmacy School",
  pdfDepth: 6,
  newPerDay: 20,
  retention: 0.9,
  examAware: true,
  theme: "glass",
  density: "spacious",
  cardBg: true,
  arrowColor: "mosaic",
  clozeColor: "butter",
};

export const settings = $state<Settings>({ ...DEFAULT_SETTINGS });

export async function loadSettings() {
  const saved = await loadDoc<Partial<Settings>>("settings");
  Object.assign(settings, DEFAULT_SETTINGS, saved ?? {});
  applyLook();
}

/** Theme and density are CSS variable sets chosen by attributes on <html> (tokens.css). */
export function applyLook() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.density = settings.density;
  root.dataset.cardbg = settings.cardBg === false ? "off" : "on";
  const [a1, a2] = ARROW_COLOURS[settings.arrowColor] ?? ARROW_COLOURS.mosaic;
  root.style.setProperty("--arrow-bg", a1);
  root.style.setProperty("--arrow2-bg", a2);
  const [c1, c2] = CLOZE_COLOURS[settings.clozeColor] ?? CLOZE_COLOURS.butter;
  root.style.setProperty("--cloze-bg", c1);
  root.style.setProperty("--cloze-line", c2);
}

export async function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  applyLook();
  await saveDoc("settings", $state.snapshot(settings));
}
