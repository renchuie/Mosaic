import { loadDoc, saveDoc } from "../tauri";

export type Settings = {
  name: string;
  labsRoot: string;
  scanDepth: number;
};

export const DEFAULT_SETTINGS: Settings = {
  name: "Jazmine",
  labsRoot: "~/GoogleDrive/Pharmacy School/Study Lab/Recall Labs",
  scanDepth: 4,
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
