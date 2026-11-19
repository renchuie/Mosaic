// Pure helpers for first-launch onboarding (no imports, so they can be tested with plain node).

/** Subjects offered in "What are you studying?" (only shape suggestions, never switch tools on). */
export const FIELDS = [
  "Pharmacy", "Nursing", "Medicine", "Biology", "Law", "Engineering",
  "Computer science", "Psychology", "Business", "Something else",
];

const ROMAN = /^(?:[ivx]+|\d+[a-z]?)$/i;
const VOWEL = /[aeiouy]/i;

/** Common course words and their usual short forms. */
const KNOWN: Record<string, string> = {
  biochemistry: "Biochem", chemistry: "Chem", statistics: "Stats", mathematics: "Math",
  psychology: "Psych", pharmacology: "Pharm", physiology: "Physio", microbiology: "Micro",
  introduction: "Intro", economics: "Econ", biology: "Bio", therapeutics: "Ther",
  pathophysiology: "Pathophys", pharmaceutics: "Pharmaceutics", engineering: "Eng",
  accounting: "Acct", literature: "Lit", philosophy: "Phil", sociology: "Soc",
};

/** "Pharmacology" → "Pharm": a known short form, else cut a long word just before its first
 *  vowel after the 4th letter. */
function shortWord(w: string): string {
  const k = KNOWN[w.toLowerCase()];
  if (k) return k;
  if (w.length <= 7) return w;
  for (let i = 4; i < w.length; i++) if (VOWEL.test(w[i]) && !VOWEL.test(w[i - 1])) return w.slice(0, i);
  return w.slice(0, 6);
}

/** A short name guessed from a course name: "Pharmacology II" → "Pharm II",
 *  "Introduction to Organic Chemistry" → "IOC", "Statistics" → "Stats" (editable anyway). */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const last = words[words.length - 1];
  const tail = words.length > 1 && ROMAN.test(last) ? " " + last.toUpperCase() : "";
  const core = tail ? words.slice(0, -1) : words;
  const big = core.filter((w) => !/^(of|to|and|the|in|for|&)$/i.test(w));
  if (big.length >= 3) return big.map((w) => w[0].toUpperCase()).join("") + tail;
  if (big.length === 2) return (core.join(" ").length <= 12 ? core.join(" ") : big.map(shortWord).join(" ")) + tail;
  return shortWord(big[0] ?? core[0]) + tail;
}

/** New flashcards a day for a daily study time: about two thirds of the minutes. */
export const newCardsFor = (minutes: number) => Math.max(5, Math.min(200, Math.round((minutes * 2) / 3 / 5) * 5));

/** Whole days from today to a "YYYY-MM-DD" date. */
export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}

/** A line icon guessed from a course name ("i:<lucide name>"), else a book. */
const ICONS: [RegExp, string][] = [
  [/pharm|drug|therap|toxic/i, "pill"], [/bio|genet|cell/i, "dna"], [/micro|patho|lab/i, "microscope"],
  [/chem/i, "flask-conical"], [/law|legal|ethic/i, "scale"], [/stat|data/i, "chart-column"],
  [/calc|math|algebra|geometr/i, "sigma"], [/physic/i, "atom"], [/psych|neuro/i, "brain"],
  [/comput|program|software|cs\b/i, "code"], [/nurs|clinic|patient/i, "stethoscope"],
  [/anat|physio|cardio|medic|health/i, "heart-pulse"], [/business|econ|account|financ|market/i, "briefcase"],
  [/language|spanish|french|german|japanese|chinese|english/i, "languages"], [/art|design/i, "palette"],
  [/histor|geograph|politic|global/i, "globe"], [/environ|ecolog|botan|plant/i, "leaf"],
  [/pediatr|child/i, "baby"], [/immun|vaccin/i, "syringe"],
];
export const iconFor = (name: string) => "i:" + (ICONS.find(([re]) => re.test(name))?.[1] ?? "book-open");
