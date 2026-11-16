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
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.density = settings.density;
}

export async function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  applyLook();
  await saveDoc("settings", $state.snapshot(settings));
}
