// Daily study plan (synced collection "plans", one per day) and the study
// timer (one per machine, saved locally so it survives page changes and restarts).
import { currentBlock, type Block, type Plan, type Timer } from "../plan";
import { todayKey } from "../calendar";
import { inTauri, loadDoc, saveDoc } from "../tauri";
import { markStudyDay } from "./labs.svelte";
import { get, newId, put } from "./synced.svelte";

export const getPlan = (date: string): Plan => get<Plan>("plans", date) ?? { blocks: [] };
const savePlan = (date: string, plan: Plan) => put("plans", date, $state.snapshot(plan) as Plan);

export const clock = $state({ now: Date.now(), timer: null as Timer | null, chimed: "" });
let ticker = 0;

function persistTimer() {
  if (inTauri) void saveDoc("timer", clock.timer ?? {});
  else
    try {
      localStorage.setItem("studydesk.timer", JSON.stringify(clock.timer));
    } catch {}
}

function startTicking() {
  if (ticker) return;
  ticker = window.setInterval(() => {
    clock.now = Date.now();
    checkChime();
  }, 1000);
}
function stopTicking() {
  window.clearInterval(ticker);
  ticker = 0;
}

export async function initPlan() {
  let t: Timer | null = null;
  if (inTauri) {
    const saved = await loadDoc<Timer>("timer");
    t = saved?.blockId ? saved : null;
  } else {
    try {
      t = JSON.parse(localStorage.getItem("studydesk.timer") ?? "null");
    } catch {}
  }
  if (t?.startedAt) {
    // Left running when the app closed: keep counting, but never more than the block plus 30 minutes.
    const b = getPlan(t.date).blocks.find((x) => x.id === t!.blockId);
    if (!b || b.done) t = null;
    else if (Date.now() - t.startedAt + b.spentMs > (b.minutes + 30) * 60000) {
      commit(t, (b.minutes + 30) * 60000 - b.spentMs);
      t = { ...t, startedAt: null };
    }
  }
  clock.timer = t;
  if (t?.startedAt) startTicking();
}

/** Time spent on a block, including the running stretch. */
export function spent(date: string, b: Block): number {
  const t = clock.timer;
  return b.spentMs + (t && t.date === date && t.blockId === b.id && t.startedAt ? clock.now - t.startedAt : 0);
}

export const isRunning = (date: string, id: string) => !!(clock.timer && clock.timer.date === date && clock.timer.blockId === id && clock.timer.startedAt);

/** Save the running stretch into the block. */
function commit(t: Timer, ms?: number) {
  if (!t.startedAt && ms === undefined) return;
  const plan = getPlan(t.date);
  const add = ms ?? Date.now() - (t.startedAt ?? Date.now());
  savePlan(t.date, { ...plan, blocks: plan.blocks.map((b) => (b.id === t.blockId ? { ...b, spentMs: b.spentMs + Math.max(0, add) } : b)) });
}

export function startBlock(date: string, id: string) {
  if (clock.timer?.startedAt) commit(clock.timer);
  clock.timer = { date, blockId: id, startedAt: Date.now() };
  clock.now = Date.now();
  clock.chimed = "";
  persistTimer();
  startTicking();
}

export function pauseBlock() {
  const t = clock.timer;
  if (!t?.startedAt) return;
  commit(t);
  clock.timer = { ...t, startedAt: null };
  persistTimer();
  stopTicking();
}

export function completeBlock(date: string, id: string) {
  if (clock.timer?.date === date && clock.timer.blockId === id) {
    if (clock.timer.startedAt) commit(clock.timer);
    clock.timer = null;
    persistTimer();
    stopTicking();
  }
  const plan = getPlan(date);
  const b = plan.blocks.find((x) => x.id === id);
  savePlan(date, { ...plan, blocks: plan.blocks.map((x) => (x.id === id ? { ...x, done: true, doneAt: Date.now() } : x)) });
  if (b?.kind === "study") markStudyDay("blocks");
}

export function reopenBlock(date: string, id: string) {
  const plan = getPlan(date);
  savePlan(date, { ...plan, blocks: plan.blocks.map((x) => (x.id === id ? { ...x, done: false, doneAt: undefined } : x)) });
}

// ---- editing a plan ---------------------------------------------------------

export function addBlock(date: string, b: Partial<Block> & { title: string; minutes: number }) {
  const plan = getPlan(date);
  const block: Block = { id: newId(), kind: "study", done: false, spentMs: 0, ...b };
  savePlan(date, { ...plan, blocks: [...plan.blocks, block] });
  return block.id;
}

export function updateBlock(date: string, id: string, patch: Partial<Block>) {
  const plan = getPlan(date);
  savePlan(date, { ...plan, blocks: plan.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
}

export function removeBlock(date: string, id: string) {
  if (clock.timer?.date === date && clock.timer.blockId === id) {
    clock.timer = null;
    persistTimer();
    stopTicking();
  }
  const plan = getPlan(date);
  savePlan(date, { ...plan, blocks: plan.blocks.filter((x) => x.id !== id) });
}

export function setBlocks(date: string, blocks: Block[]) {
  savePlan(date, { ...getPlan(date), blocks });
}

export function setStart(date: string, start: string | undefined) {
  savePlan(date, { ...getPlan(date), start });
}

/** Unfinished study blocks from an earlier day, copied (time on the clock not carried over). */
export function bringOver(from: string, to: string) {
  const left = getPlan(from).blocks.filter((b) => !b.done && b.kind === "study");
  const plan = getPlan(to);
  savePlan(to, { ...plan, blocks: [...plan.blocks, ...left.map((b) => ({ ...b, id: newId(), spentMs: 0 }))] });
}

/** The running or next block today, for the dashboard and the floating timer. */
export function nowBlock() {
  const date = clock.timer?.startedAt ? clock.timer.date : todayKey();
  const plan = getPlan(date);
  const b = currentBlock(plan.blocks, clock.timer, date);
  return b ? { date, block: b, plan } : null;
}

// ---- a gentle chime when a block's time is up ---------------------------------

function checkChime() {
  const t = clock.timer;
  if (!t?.startedAt) return;
  const b = getPlan(t.date).blocks.find((x) => x.id === t.blockId);
  if (!b) return;
  const key = `${t.date}/${b.id}`;
  if (clock.chimed !== key && spent(t.date, b) >= b.minutes * 60000) {
    clock.chimed = key;
    chime();
  }
}

function chime() {
  try {
    const ctx = new AudioContext();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
    setTimeout(() => void ctx.close(), 2000);
  } catch {}
}
