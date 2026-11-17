// The 15 themes (Nov 17), in the order of the picker in Settings → Appearance. The colours of
// each theme live in src/styles/tokens.css; `preview` is only for the little cards in the picker.

export type ThemeFamily = "glass" | "neutral" | "dark";
export type ThemeId =
  | "mosaic" | "pink" | "green" | "blue" | "purple"
  | "linen" | "stone" | "oat" | "plain" | "default"
  | "catppuccin" | "tokyonight" | "rosepine" | "gruvbox" | "everforest";

export type Theme = {
  id: ThemeId;
  name: string;
  note: string;
  family: ThemeFamily;
  /** backdrop (any CSS background), panel, text, flashcard arrow, highlight */
  preview: { bg: string; panel: string; text: string; accent: string; hl: string };
};

const bloom = (a: string, b: string, c: string, base: string) =>
  `radial-gradient(60% 70% at 10% 10%, ${a}, transparent 70%), radial-gradient(55% 60% at 95% 20%, ${b}, transparent 70%), radial-gradient(70% 60% at 50% 110%, ${c}, transparent 70%), ${base}`;
const glassPanel = "rgba(255, 255, 255, 0.62)";

export const THEMES: Theme[] = [
  { id: "mosaic", name: "Mosaic", note: "Soft pink, periwinkle and mint", family: "glass", preview: { bg: bloom("#ffc9da", "#c9d3ff", "#bfebdd", "#f6f1f7"), panel: glassPanel, text: "#23263a", accent: "#e3949b", hl: "#f7e3b0" } },
  { id: "pink", name: "Pink", note: "All blush", family: "glass", preview: { bg: bloom("#ffc7d9", "#ffd9e6", "#f9bcd0", "#fbf1f4"), panel: glassPanel, text: "#3e2c33", accent: "#e0809e", hl: "#ffd3e1" } },
  { id: "green", name: "Green", note: "Sage and mint", family: "glass", preview: { bg: bloom("#c6e8d4", "#d8f0e2", "#b7dec8", "#f1f7f3"), panel: glassPanel, text: "#25362d", accent: "#5fa580", hl: "#d3eedd" } },
  { id: "blue", name: "Blue", note: "Sky and periwinkle", family: "glass", preview: { bg: bloom("#c8daff", "#dce7ff", "#b9cef7", "#f2f6fd"), panel: glassPanel, text: "#26314a", accent: "#6b92db", hl: "#d5e3ff" } },
  { id: "purple", name: "Purple", note: "Lavender and lilac", family: "glass", preview: { bg: bloom("#e0d0ff", "#ece2ff", "#d2bff7", "#f6f2fd"), panel: glassPanel, text: "#33294a", accent: "#9a7bdb", hl: "#e6dbff" } },

  { id: "linen", name: "Linen", note: "Warm cream, clay accent", family: "neutral", preview: { bg: "#ede7df", panel: "#fffdfa", text: "#2e2925", accent: "#b5876a", hl: "#f2e2b6" } },
  { id: "stone", name: "Stone", note: "Cool greige, sage accent", family: "neutral", preview: { bg: "#e7e7e3", panel: "#ffffff", text: "#24262a", accent: "#6f8a80", hl: "#e3ead6" } },
  { id: "oat", name: "Oat", note: "Oat paper, navy ink", family: "neutral", preview: { bg: "#ece5d8", panel: "#fffdf7", text: "#1f2430", accent: "#6e86a6", hl: "#f1e4bc" } },
  { id: "plain", name: "Plain", note: "White and black, no colour", family: "neutral", preview: { bg: "#f6f6f6", panel: "#ffffff", text: "#171717", accent: "#171717", hl: "#ececec" } },
  { id: "default", name: "Default", note: "White, colour where it helps", family: "neutral", preview: { bg: "#f6f6f7", panel: "#ffffff", text: "#18181b", accent: "#2f6feb", hl: "#fef08a" } },

  { id: "catppuccin", name: "Catppuccin", note: "Mocha", family: "dark", preview: { bg: "#11111b", panel: "#1e1e2e", text: "#cdd6f4", accent: "#cba6f7", hl: "#f9e2af" } },
  { id: "tokyonight", name: "Tokyo Night", note: "Night", family: "dark", preview: { bg: "#16161e", panel: "#1f2335", text: "#c0caf5", accent: "#7aa2f7", hl: "#e0af68" } },
  { id: "rosepine", name: "Rosé Pine", note: "Main", family: "dark", preview: { bg: "#191724", panel: "#26233a", text: "#e0def4", accent: "#ebbcba", hl: "#f6c177" } },
  { id: "gruvbox", name: "Gruvbox", note: "Dark", family: "dark", preview: { bg: "#1d2021", panel: "#32302f", text: "#ebdbb2", accent: "#fe8019", hl: "#fabd2f" } },
  { id: "everforest", name: "Everforest", note: "Dark", family: "dark", preview: { bg: "#232a2e", panel: "#343f44", text: "#d3c6aa", accent: "#a7c080", hl: "#dbbc7f" } },
];

export const FAMILIES: { id: ThemeFamily; name: string; note: string }[] = [
  { id: "glass", name: "Glass", note: "Soft colour behind frosted panels" },
  { id: "neutral", name: "Neutral", note: "Quiet, paper-like, simple" },
  { id: "dark", name: "Dark", note: "Ricing favourites, easy on the eyes at night" },
];

export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
