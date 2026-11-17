import { loadDoc, saveDoc } from "../tauri";
import { THEMES, themeById, type ThemeId } from "../themes";

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
  /** look: one of the 15 themes in src/lib/themes.ts (Mosaic = the frosted glass, default) */
  theme: ThemeId;
  /** spacing: spacious (default), original, compact */
  density: "spacious" | "original" | "compact";
  /** the window's frame (Nov 18, canvas "Native look, Mosaic vibe"): curve = the page is one sheet
   *  with a big curve beside the rail (default), sheet = a frosted rail column and a straight page,
   *  float = the original floating rail and panel inside a glass border */
  frame?: "curve" | "sheet" | "float";
  /** flashcards in notes: soft background on card lines, arrow pill colour, cloze colour
   *  ("theme" = the theme's own colours) */
  cardBg: boolean;
  arrowColor: string;
  clozeColor: string;
  /** review screen: card text left-aligned (default) or centred */
  cardAlign?: "left" | "center";
  /** review screen: write your answer in a scratchpad before the card can be turned over */
  cardScratch?: boolean;
};

/** Arrow pill colours: [one way, both ways, card tint one way, card tint both ways].
 *  "mosaic" is the original pink / periwinkle pair. Card lines are tinted to match the arrow. */
export const ARROW_COLOURS: Record<string, [string, string, string, string]> = {
  /** the theme's own colours (no override); the swatch shows Mosaic's */
  theme: ["linear-gradient(135deg, #e3949b, #c58bd6)", "linear-gradient(135deg, #8b9be8, #c58bd6)", "", ""],
  mosaic: ["linear-gradient(135deg, #e3949b, #c58bd6)", "linear-gradient(135deg, #8b9be8, #c58bd6)", "#f2b8b5", "#b9c2f0"],
  rose: ["#e3949b", "#d07f87", "#f2b8b5", "#eaa5ab"],
  lavender: ["#a993e0", "#8f78cf", "#c9b8f0", "#b9a5e8"],
  sage: ["#7fb3a6", "#679d90", "#a9cdc3", "#93bfb3"],
  peach: ["#e9a978", "#d8925f", "#f6cfa8", "#efbd91"],
  blue: ["#7fa6d9", "#6a91c6", "#b9d4ee", "#a3c3e6"],
  charcoal: ["#3b3033", "#5a4d51", "#8a8085", "#a39a9e"],
};
/** Cloze colours: [fill, underline]. */
export const CLOZE_COLOURS: Record<string, [string, string]> = {
  theme: ["#fbe29a", "#d9a93a"],
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
  theme: "mosaic",
  density: "spacious",
  cardBg: true,
  arrowColor: "theme",
  clozeColor: "theme",
};

export const settings = $state<Settings>({ ...DEFAULT_SETTINGS });

export async function loadSettings() {
  const saved = await loadDoc<Partial<Settings> & { theme?: string }>("settings");
  Object.assign(settings, DEFAULT_SETTINGS, saved ?? {});
  // Nov 17: "glass" became Mosaic, the solid "pastel" look was retired; the old default arrow and
  // cloze colours (mosaic / butter) now mean "follow the theme"
  if (!THEMES.some((t) => t.id === settings.theme)) settings.theme = "mosaic";
  if (settings.arrowColor === "mosaic") settings.arrowColor = "theme";
  if (settings.clozeColor === "butter") settings.clozeColor = "theme";
  applyLook();
}

/** Theme and density are CSS variable sets chosen by attributes on <html> (tokens.css). */
export function applyLook() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.family = themeById(settings.theme).family;
  root.dataset.density = settings.density;
  root.dataset.frame = settings.frame ?? "curve";
  root.dataset.cardbg = settings.cardBg === false ? "off" : "on";
  // flashcard colours: the theme's own unless she picked some
  const props = ["--arrow-bg", "--arrow2-bg", "--card-bg", "--card-bg2", "--cloze-bg", "--cloze-line"];
  if (settings.arrowColor === "theme" || !ARROW_COLOURS[settings.arrowColor]) props.slice(0, 4).forEach((p) => root.style.removeProperty(p));
  else {
    const [a1, a2, t1, t2] = ARROW_COLOURS[settings.arrowColor];
    root.style.setProperty("--arrow-bg", a1);
    root.style.setProperty("--arrow2-bg", a2);
    const tint = (c: string) => `linear-gradient(90deg, color-mix(in srgb, ${c} ${settings.arrowColor === "charcoal" ? 12 : 18}%, transparent), transparent 85%)`;
    root.style.setProperty("--card-bg", tint(t1));
    root.style.setProperty("--card-bg2", tint(t2));
  }
  if (settings.clozeColor === "theme" || !CLOZE_COLOURS[settings.clozeColor]) props.slice(4).forEach((p) => root.style.removeProperty(p));
  else {
    const [c1, c2] = CLOZE_COLOURS[settings.clozeColor];
    root.style.setProperty("--cloze-bg", c1);
    root.style.setProperty("--cloze-line", c2);
  }
}

export async function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  applyLook();
  await saveDoc("settings", $state.snapshot(settings));
}
