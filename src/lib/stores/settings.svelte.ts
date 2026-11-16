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
};

export const DEFAULT_SETTINGS: Settings = {
  name: "Jazmine",
  labsRoot: "~/GoogleDrive/Pharmacy School/Study Lab/Recall Labs",
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
};

export const settings = $state<Settings>({ ...DEFAULT_SETTINGS });

export async function loadSettings() {
  const saved = await loadDoc<Partial<Settings>>("settings");
  Object.assign(settings, DEFAULT_SETTINGS, saved ?? {});
}

export async function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  await saveDoc("settings", $state.snapshot(settings));
}
