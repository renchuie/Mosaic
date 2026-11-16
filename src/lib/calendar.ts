// Local calendar: event and tag shapes, dates as "YYYY-MM-DD" strings (local
// time, no time-zone surprises), and repeat rules. Pure, no imports, so it
// can be tested with plain node.

/** Built-in tag ids. Tags themselves (name, colour, exam flag) live in the "tags" collection. */
export type EventKind = string;

export type Tag = { name: string; color: string; exam?: boolean; order: number };

export const DEFAULT_TAGS: Record<string, Tag> = {
  class: { name: "Class", color: "#F7E3B0", order: 0 },
  exam: { name: "Exam", color: "#F2B8B5", exam: true, order: 1 },
  study: { name: "Study", color: "#A9CDC3", order: 2 },
  other: { name: "Other", color: "#F6CFA8", order: 3 },
};
export const BUILTIN_TAGS = Object.keys(DEFAULT_TAGS);

/** Soft colours offered for tags; any colour can also be picked by hand. */
export const PALETTE = [
  "#F2B8B5", "#F5C6D6", "#F6CFA8", "#E3B8A0", "#F7E3B0", "#E6D3BD",
  "#C5E8D5", "#A9CDC3", "#B9D4EE", "#B8C4E0", "#D9CCF0", "#CDB4F7",
];

export type Freq = "daily" | "weekly" | "monthly" | "yearly";

export type Repeat = {
  freq: Freq;
  /** every N days/weeks/months/years */
  interval: number;
  /** weekly: 0 = Monday … 6 = Sunday */
  weekdays?: number[];
  /** monthly: same date ("date", e.g. the 16th) or same weekday ("weekday", e.g. 3rd Monday / last Friday) */
  monthly?: "date" | "weekday";
  /** ends on this day (inclusive) … */
  until?: string;
  /** … or after this many times */
  count?: number;
};

export type CalEvent = {
  title: string;
  /** tag id */
  kind: EventKind;
  course?: string;
  /** first (or only) day */
  date: string;
  allDay?: boolean;
  /** "HH:MM", 24 h */
  start?: string;
  end?: string;
  location?: string;
  notes?: string;
  repeat?: Repeat;
  /** repeat days that were deleted */
  skip?: string[];
};

export type Occurrence = { id: string; ev: CalEvent; date: string };

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const pad = (n: number) => String(n).padStart(2, "0");
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const todayKey = () => toKey(new Date());
export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
};
export const addMonths = (k: string, n: number) => {
  const d = fromKey(k);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toKey(d);
};
/** 0 = Monday … 6 = Sunday */
export const weekday = (k: string) => (fromKey(k).getDay() + 6) % 7;
export const mondayOf = (k: string) => addDays(k, -weekday(k));
export const monthStart = (k: string) => `${k.slice(0, 7)}-01`;
export const daysInMonth = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();
export const daysBetween = (from: string, to: string) => Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 864e5);
export const minutes = (hhmm?: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmtTime = (hhmm?: string) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m || 0)} ${h < 12 ? "AM" : "PM"}`;
};

/** Which week of the month a day falls in (1–5), and whether it is the last such weekday. */
export function nthWeekday(k: string) {
  const day = Number(k.slice(8, 10));
  return { n: Math.ceil(day / 7), last: day + 7 > daysInMonth(k) };
}

/** Accepts the Phase 3 shape ({weekdays, until}) too. */
export function normalizeRepeat(r: unknown, start: string): Repeat | undefined {
  if (!r || typeof r !== "object") return undefined;
  const o = r as Partial<Repeat> & { weekdays?: number[] };
  const freq: Freq = o.freq ?? "weekly";
  const rep: Repeat = { freq, interval: Math.max(1, Math.floor(o.interval ?? 1)) };
  if (freq === "weekly") rep.weekdays = o.weekdays?.length ? [...o.weekdays].sort() : [weekday(start)];
  if (freq === "monthly") rep.monthly = o.monthly ?? "date";
  if (o.until) rep.until = o.until;
  else if (o.count) rep.count = Math.max(1, Math.floor(o.count));
  return rep;
}

/** Does a repeating event fall on day d (ignoring skips and end)? */
function matches(rep: Repeat, start: string, d: string): boolean {
  if (d < start) return false;
  switch (rep.freq) {
    case "daily":
      return daysBetween(start, d) % rep.interval === 0;
    case "weekly":
      return (rep.weekdays ?? [weekday(start)]).includes(weekday(d)) && (daysBetween(mondayOf(start), mondayOf(d)) / 7) % rep.interval === 0;
    case "monthly": {
      const months = (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(start.slice(5, 7));
      if (months % rep.interval !== 0) return false;
      if (rep.monthly === "weekday") {
        if (weekday(d) !== weekday(start)) return false;
        const s = nthWeekday(start);
        const t = nthWeekday(d);
        return s.n === 5 || (s.last && s.n >= 4) ? t.last : t.n === s.n;
      }
      return d.slice(8, 10) === start.slice(8, 10);
    }
    case "yearly":
      return d.slice(5) === start.slice(5) && (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) % rep.interval === 0;
  }
}

/** Every occurrence on days from..to (inclusive), sorted by day then start time. */
export function occurrences(events: [string, CalEvent][], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const [id, ev] of events) {
    const rep = normalizeRepeat(ev.repeat, ev.date);
    if (!rep) {
      if (ev.date >= from && ev.date <= to) out.push({ id, ev, date: ev.date });
      continue;
    }
    const last = rep.until && rep.until < to ? rep.until : to;
    // With a count we must walk from the first day so earlier repeats are counted.
    let d = rep.count ? ev.date : ev.date > from ? ev.date : from;
    let n = 0;
    for (; d <= last; d = addDays(d, 1)) {
      if (!matches(rep, ev.date, d)) continue;
      n++;
      if (rep.count && n > rep.count) break;
      if (d >= from && !ev.skip?.includes(d)) out.push({ id, ev, date: d });
    }
  }
  return out.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.ev.allDay ? -1 : minutes(a.ev.start)) - (b.ev.allDay ? -1 : minutes(b.ev.start)),
  );
}

/** "Every 2 weeks on Mon, Wed until Dec 18" */
export function describeRepeat(rep: Repeat | undefined, start: string): string {
  if (!rep) return "Does not repeat";
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[rep.freq];
  let s = rep.interval === 1 ? (rep.freq === "daily" ? "Every day" : `Every ${unit}`) : `Every ${rep.interval} ${unit}s`;
  if (rep.freq === "weekly") {
    const days = rep.weekdays ?? [weekday(start)];
    s += days.length === 5 && days.every((x) => x < 5) ? " on weekdays" : ` on ${days.map((x) => WEEKDAYS[x]).join(", ")}`;
  } else if (rep.freq === "monthly") {
    if (rep.monthly === "weekday") {
      const { n, last } = nthWeekday(start);
      s += ` on the ${n === 5 || last ? "last" : ["first", "second", "third", "fourth"][n - 1]} ${WEEKDAYS_LONG[weekday(start)]}`;
    } else s += ` on day ${Number(start.slice(8, 10))}`;
  } else if (rep.freq === "yearly") {
    s += ` on ${MONTHS[Number(start.slice(5, 7)) - 1]} ${Number(start.slice(8, 10))}`;
  }
  if (rep.until) s += ` until ${MONTHS[Number(rep.until.slice(5, 7)) - 1].slice(0, 3)} ${Number(rep.until.slice(8, 10))}, ${rep.until.slice(0, 4)}`;
  else if (rep.count) s += `, ${rep.count} times`;
  return s;
}

/** Exam = a tag marked "counts as exam", or tag "other" with a keyword in the title
 *  (case-insensitive, whole word). So "Exam 4 sim run" tagged Study stays a study block. */
export function isExam(ev: CalEvent, keywords: string[], tagIsExam: (id: string) => boolean): boolean {
  if (tagIsExam(ev.kind)) return true;
  if (ev.kind !== "other") return false;
  return keywords.some((k) => k.trim() && new RegExp(`\\b${k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(ev.title));
}

/** Dark text on light colours, light text on dark ones. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#3B3033";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.36 ? "#3B3033" : "#FFFDFB";
}
