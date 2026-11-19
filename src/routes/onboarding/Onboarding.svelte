<script lang="ts">
  // First launch (O2, Nov 19), built from the canvas boards "Onboarding" (the flow) and
  // "Onboarding2" (ideas A, C, F, G). Welcome → You → Courses → Exams → Files → Look → A day →
  // You're set. "I already use Mosaic" goes Welcome → Files → You're set. Nothing is saved until
  // a step's Continue (files) or Finish (everything else), except the look, which is live.
  import Icon from "../../lib/components/Icon.svelte";
  import IconPicker from "../../lib/components/IconPicker.svelte";
  import { PALETTE } from "../../lib/calendar";
  import { FIELDS, daysUntil, iconFor, newCardsFor, shortName } from "../../lib/onboarding";
  import { currentTerm, saveSettings, settings } from "../../lib/stores/settings.svelte";
  import { blankGrading, courses, saveCourse } from "../../lib/stores/courses.svelte";
  import { saveEvent } from "../../lib/stores/calendar.svelte";
  import { syncNow } from "../../lib/stores/synced.svelte";
  import { FAMILIES, THEMES, type ThemeFamily } from "../../lib/themes";
  import { inTauri, invoke } from "../../lib/tauri";
  import { untrack } from "svelte";

  let { ondone }: { ondone: (go?: string) => void } = $props();

  type Step = "welcome" | "you" | "courses" | "exams" | "files" | "look" | "day" | "done";
  const FULL: Step[] = ["welcome", "you", "courses", "exams", "files", "look", "day", "done"];
  const RETURNING: Step[] = ["welcome", "files", "done"];
  let isReturning = $state(false);
  const flow = $derived(isReturning ? RETURNING : FULL);
  let at = $state(0);
  const step = $derived(flow[at]);
  // the dots count the steps between Welcome and You're set
  const counted = $derived(flow.slice(1, -1));
  const pos = $derived(counted.indexOf(step));
  let back = $state(false);
  const go = (d: number) => {
    back = d < 0;
    at = Math.max(0, Math.min(flow.length - 1, at + d));
  };

  // ---- you ----
  let name = $state(untrack(() => settings.name));
  let field = $state(untrack(() => settings.field ?? ""));
  let use = $state<"school" | "personal" | "both">(untrack(() => settings.use ?? "school"));

  // ---- courses ----
  type Draft = { name: string; code: string; codeEdited: boolean; color: string; icon: string };
  let term = $state(untrack(() => currentTerm()));
  let list = $state<Draft[]>([]);
  let typed = $state("");
  let typedCode = $state("");
  let pickingIcon = $state(-1);
  function addCourse() {
    const n = typed.trim();
    if (!n) return;
    list.push({ name: n, code: typedCode.trim() || shortName(n), codeEdited: !!typedCode.trim(), color: PALETTE[[0, 8, 7, 2, 10, 4, 1, 6, 11, 3][list.length % 10]], icon: iconFor(n) });
    typed = typedCode = "";
  }
  const nextColour = (c: string) => PALETTE[(PALETTE.indexOf(c) + 1) % PALETTE.length];

  // ---- exams ----
  type ExamDraft = { course: string; title: string; date: string };
  let exams = $state<ExamDraft[]>([]);
  let exCourse = $state("");
  let exTitle = $state("");
  let exDate = $state("");
  const courseList = $derived(list.map((c) => c.name).filter(Boolean));
  function addExam() {
    if (!exTitle.trim() || !exDate) return;
    exams.push({ course: exCourse, title: exTitle.trim(), date: exDate });
    exams.sort((a, b) => a.date.localeCompare(b.date));
    exTitle = exDate = "";
  }
  const colourOf = (course: string) => list.find((c) => c.name === course)?.color ?? "var(--lavender)";
  const shortDate = (d: string) => new Date(d + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ---- files ----
  type Where = "local" | "synced" | "already";
  const SERVICES: { id: string; name: string; paths: string[] }[] = [
    { id: "gdrive", name: "Google Drive", paths: ["~/GoogleDrive", "~/Google Drive", "~/My Drive", "G:\\My Drive", "~/Library/CloudStorage/GoogleDrive"] },
    { id: "dropbox", name: "Dropbox", paths: ["~/Dropbox", "~/Library/CloudStorage/Dropbox"] },
    { id: "onedrive", name: "OneDrive", paths: ["~/OneDrive", "~/Library/CloudStorage/OneDrive"] },
    { id: "icloud", name: "iCloud Drive", paths: ["~/iCloudDrive", "~/Library/Mobile Documents/com~apple~CloudDocs"] },
  ];
  let where = $state<Where>("local");
  let found = $state<Record<string, string>>({});
  let service = $state("");
  let folder = $state("~/Mosaic");
  let editing = $state(false);
  let hasMosaic = $state(false);
  let busy = $state(false);
  let error = $state("");
  // which services this computer has (first path that exists)
  $effect(() => {
    if (!inTauri) return void (found = { gdrive: "~/GoogleDrive" });
    void Promise.all(
      SERVICES.map(async (s) => {
        const info = await invoke<{ path: string; dir: boolean }[]>("paths_info", { paths: s.paths }).catch(() => []);
        const i = info.findIndex((x) => x.dir);
        return [s.id, i >= 0 ? s.paths[i] : ""] as const;
      }),
    ).then((r) => (found = Object.fromEntries(r.filter(([, p]) => p))));
  });
  function choose(w: Where) {
    where = w;
    error = "";
    editing = false;
    if (w === "local") return void (folder = "~/Mosaic");
    if (!service || !found[service]) service = SERVICES.find((s) => found[s.id])?.id ?? "";
    folder = service ? `${found[service]}/Mosaic` : "";
    if (!service) editing = true;
  }
  function pickService(id: string) {
    service = id;
    if (found[id]) {
      folder = `${found[id]}/Mosaic`;
      editing = false;
    } else editing = true;
  }
  // a folder made by Mosaic on the other computer: its Notes are already there
  $effect(() => {
    const f = folder;
    if (where === "local" || !f || !inTauri) return void (hasMosaic = false);
    void invoke<{ path: string; dir: boolean }[]>("paths_info", { paths: [`${f}/Notes`] }).then((r) => (hasMosaic = !!r[0]?.dir)).catch(() => (hasMosaic = false));
  });
  const pretty = (p: string) => p.replace(/^~[\\/]/, "").replace(/[\\/]/g, " / ");
  async function saveFiles(): Promise<boolean> {
    const f = folder.trim().replace(/[\\/]+$/, "");
    if (!f) {
      error = "Pick a folder.";
      return false;
    }
    if (where === "already" && inTauri && !hasMosaic) {
      error = "No Mosaic files in that folder.";
      return false;
    }
    busy = true;
    error = "";
    try {
      if (inTauri) await invoke<string>("vault_create", { path: f });
      const synced = where !== "local";
      await saveSettings({
        storage: synced ? "synced" : "local",
        vault: f,
        notesRoot: `${f}/Notes`,
        labsRoot: `${f}/Materials`,
        pdfRoot: `${f}/PDFs`,
        syncEnabled: synced,
        syncDir: `${f}/Sync`,
        backupDrive: synced ? `${f}/Backups` : "",
      });
      if (synced) void syncNow();
      return true;
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
      return false;
    } finally {
      busy = false;
    }
  }

  // ---- look (live) ----
  let family = $state<ThemeFamily>(untrack(() => THEMES.find((t) => t.id === settings.theme)?.family ?? "glass"));
  const FRAMES: { id: "curve" | "sheet" | "float"; name: string }[] = [
    { id: "curve", name: "Curve" },
    { id: "sheet", name: "Glass rail" },
    { id: "float", name: "Floating" },
  ];

  // ---- a day ----
  let minutes = $state(untrack(() => settings.dailyMinutes ?? 30));
  let own = $state(false);
  const PRESETS = [
    { m: 15, word: "light" },
    { m: 30, word: "steady" },
    { m: 60, word: "serious" },
  ];

  // ---- moving on ----
  async function next() {
    if (step === "files" && !(await saveFiles())) return;
    if (step === "courses" && typed.trim()) addCourse();
    if (step === "exams" && exTitle.trim() && exDate) addExam();
    go(1);
    if (flow[at] === "exams") exCourse ||= courseList[0] ?? "";
  }
  function skip() {
    if (step === "courses") list = [];
    if (step === "exams") exams = [];
    go(1);
  }
  function returning() {
    isReturning = true;
    at = 1;
    choose("already");
  }

  async function finish(goTo?: string) {
    if (!isReturning) {
      const order = courses(true).length;
      list.forEach((c, i) =>
        saveCourse(null, { name: c.name, code: c.code || undefined, color: c.color, icon: c.icon, term, grading: blankGrading(), order: order + i }),
      );
      for (const e of exams) saveEvent(null, { title: e.course ? `${shortOf(e.course)} ${e.title}` : e.title, kind: "exam", course: e.course || undefined, date: e.date, allDay: true });
      await saveSettings({
        name: name.trim(),
        field: field || undefined,
        use,
        term: term.trim() && term.trim() !== currentTerm() ? term.trim() : undefined,
        dailyMinutes: minutes,
        newPerDay: newCardsFor(minutes),
        onboarded: true,
      });
    } else await saveSettings({ onboarded: true });
    ondone(goTo);
  }
  const shortOf = (course: string) => list.find((c) => c.name === course)?.code || course;
  async function restore() {
    await saveSettings({ onboarded: true });
    ondone("#/settings/backups");
  }

  // Enter moves on (not inside the course / exam boxes, which add a row)
  function key(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.shiftKey || busy) return;
    const t = e.target as HTMLElement;
    if (t.closest(".adder") || t.closest(".ipop") || t.tagName === "BUTTON" || t.tagName === "A") return;
    if (step === "welcome" || step === "done") return;
    e.preventDefault();
    void next();
  }
</script>

<svelte:window onkeydown={key} />

<div class="ob" class:back>
  {#key step}
  <section class="sheet" class:wide={step === "files" || step === "look"} class:centre={step === "welcome" || step === "done"} aria-live="polite">
    {#if pos >= 0}
      <div class="top">
        <div class="dots" aria-hidden="true">{#each counted as _, i}<i class:past={i < pos} class:now={i === pos}></i>{/each}</div>
        <span class="count">{pos + 1} of {counted.length}</span>
      </div>
    {/if}

    {#if step === "welcome"}
      <svg class="logo" viewBox="0 0 120 120" aria-hidden="true">
        <rect width="120" height="120" rx="28" fill="#8A74DE" />
        <g transform="translate(18 18) scale(.7)">
          <rect x="14" y="10" width="26" height="80" rx="9" fill="#fff" transform="rotate(-8 27 50)" />
          <rect x="80" y="10" width="26" height="80" rx="9" fill="#fff" transform="rotate(8 93 50)" />
          <rect x="46" y="48" width="28" height="28" rx="6" fill="#FFD7E4" transform="rotate(45 60 62)" />
        </g>
      </svg>
      <h1>Welcome to Mosaic</h1>
      <p class="lead">Your student life in full view.</p>
      <button type="button" class="btn primary big" onclick={() => go(1)}>Get started</button>
      <div class="links">
        <button type="button" class="link" onclick={returning}>I already use Mosaic on another computer</button>
        <button type="button" class="link" onclick={restore}>Restore from a backup file</button>
      </div>

    {:else if step === "you"}
      <h2>Hi! What should we call you?</h2>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input name" bind:value={name} aria-label="Your name" autocomplete="given-name" autofocus />
      <span class="q">What are you studying?</span>
      <div class="chips" role="radiogroup" aria-label="What are you studying?">
        {#each FIELDS as f}
          <button type="button" role="radio" aria-checked={field === f} class:on={field === f} onclick={() => (field = field === f ? "" : f)}>{f}</button>
        {/each}
      </div>
      <span class="q">What will you use Mosaic for?</span>
      <div class="uses" role="radiogroup" aria-label="What will you use Mosaic for?">
        {#each [{ id: "school", icon: "i:graduation-cap", name: "School", note: "Courses, notes, flashcards, exams" }, { id: "personal", icon: "i:house", name: "Personal", note: "Journal, habits, plans" }, { id: "both", icon: "i:infinity", name: "Both", note: "Student life and the rest" }] as u (u.id)}
          <button type="button" role="radio" aria-checked={use === u.id} class="use" class:on={use === u.id} onclick={() => (use = u.id as typeof use)}>
            <span class="uic u-{u.id}"><Icon name={u.icon} size={20} colour={false} /></span>
            <b>{u.name}</b><span>{u.note}</span>
          </button>
        {/each}
      </div>

    {:else if step === "courses"}
      <h2>What are you taking this term?</h2>
      <label class="term"><span>Term</span><input class="input" bind:value={term} aria-label="Term" /></label>
      <div class="rows">
        {#each list as c, i (c)}
          <div class="crow">
            <button type="button" class="cdot" style="background: {c.color}" aria-label="Change colour" onclick={() => (c.color = nextColour(c.color))}></button>
            <div class="ipop">
              <button type="button" class="ctile" style="--c: {c.color}" aria-label="Change icon" onclick={() => (pickingIcon = pickingIcon === i ? -1 : i)}><Icon name={c.icon} size={17} colour={false} /></button>
              {#if pickingIcon === i}
                <div class="picker"><IconPicker value={c.icon} colours={false} remove={false} onpick={(v) => { if (v) c.icon = v; pickingIcon = -1; }} /></div>
              {/if}
            </div>
            <input class="cname" bind:value={c.name} aria-label="Course name" oninput={() => !c.codeEdited && (c.code = shortName(c.name))} />
            <input class="ccode" bind:value={c.code} aria-label="Short name" oninput={() => (c.codeEdited = true)} />
            <button type="button" class="x" aria-label="Remove {c.name}" onclick={() => list.splice(i, 1)}><Icon name="x" size={15} /></button>
          </div>
        {/each}
        <form class="crow adder" onsubmit={(e) => { e.preventDefault(); addCourse(); }}>
          <span class="plus" aria-hidden="true"><Icon name="plus" size={16} /></span>
          <!-- svelte-ignore a11y_autofocus -->
          <input class="cname" bind:value={typed} placeholder="Add a course" aria-label="Add a course" autofocus />
          <input class="ccode" bind:value={typedCode} placeholder={typed.trim() ? shortName(typed) : "Short name"} aria-label="Short name" />
          <button type="submit" hidden>Add</button>
        </form>
      </div>

    {:else if step === "exams"}
      <h2>Any exams coming up?</h2>
      <p class="sub">Your cards will be ready in time.</p>
      <div class="rows">
        {#each exams as e, i (e)}
          {@const d = daysUntil(e.date)}
          <div class="erow">
            <span class="edot" style="background: {colourOf(e.course)}"></span>
            <span class="etitle">{e.course ? `${e.course} · ` : ""}{e.title}</span>
            <span class="pill">{shortDate(e.date)}</span>
            <span class="pill days" class:soon={d <= 14}>{d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`}</span>
            <button type="button" class="x" aria-label="Remove {e.title}" onclick={() => exams.splice(i, 1)}><Icon name="x" size={15} /></button>
          </div>
        {/each}
        <form class="erow adder" onsubmit={(e) => { e.preventDefault(); addExam(); }}>
          {#if courseList.length}
            <select class="input esel" bind:value={exCourse} aria-label="Course">
              <option value="">No course</option>
              {#each courseList as c}<option value={c}>{c}</option>{/each}
            </select>
          {/if}
          <input class="input" bind:value={exTitle} placeholder="Exam" aria-label="Exam name" />
          <input class="input edate" class:empty={!exDate} type="date" bind:value={exDate} aria-label="Date" />
          <button type="submit" class="btn quiet sm" disabled={!exTitle.trim() || !exDate}>Add</button>
        </form>
      </div>

    {:else if step === "files"}
      <h2>{isReturning ? "Where's your Mosaic folder?" : "Where should your notes live?"}</h2>
      <p class="sub">Notes, PDFs and materials are normal files you can open anywhere.</p>
      <div class="opts" role="radiogroup" aria-label="Where your files live">
        {#each [{ id: "local", name: "This computer only", note: "Simple, no account. Backups still run daily." }, { id: "synced", name: "A synced folder", note: "Same notes and progress on every computer." }, { id: "already", name: "Already using Mosaic", note: "Pick the folder from your other computer." }] as o (o.id)}
          <div class="opt" class:on={where === o.id}>
            <button type="button" role="radio" aria-checked={where === o.id} class="ohead" onclick={() => choose(o.id as Where)}>
              <span class="radio" aria-hidden="true"></span>
              <span class="otxt"><b>{o.name}</b><span>{o.note}</span></span>
            </button>
            {#if where === o.id && o.id !== "local"}
              <div class="obody">
                <div class="svcs">
                  {#each SERVICES as s}
                    <button type="button" class="svc" class:on={service === s.id && !editing} class:found={!!found[s.id]} onclick={() => pickService(s.id)}>
                      {s.name}{#if found[s.id]} <Icon name="check" size={13} />{/if}
                    </button>
                  {/each}
                  <button type="button" class="svc" class:on={editing} onclick={() => { editing = true; service = ""; }}>Other folder…</button>
                </div>
                {#if editing}
                  <input class="input path" bind:value={folder} aria-label="Folder" placeholder="~/Folder/Mosaic" />
                {:else}
                  <div class="where">
                    <span>{pretty(folder)}</span>
                    <button type="button" class="link" onclick={() => (editing = true)}>Change</button>
                  </div>
                {/if}
                {#if hasMosaic}<span class="ok"><Icon name="check" size={14} /> Mosaic files found</span>{/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      {#if error}<p class="err" role="alert">{error}</p>{/if}

    {:else if step === "look"}
      <h2>Pick a look</h2>
      <div class="fams" role="tablist" aria-label="Theme family">
        {#each FAMILIES as f}
          <button type="button" role="tab" aria-selected={family === f.id} class:on={family === f.id} onclick={() => (family = f.id)}>{f.name}</button>
        {/each}
      </div>
      <div class="themes" role="radiogroup" aria-label="Theme">
        {#each THEMES.filter((t) => t.family === family) as t (t.id)}
          <button type="button" role="radio" aria-checked={settings.theme === t.id} class="theme" class:on={settings.theme === t.id} onclick={() => saveSettings({ theme: t.id })}>
            <span class="sw" style="background: {t.preview.bg}"><i style="background: {t.preview.panel}"><s style="background: {t.preview.accent}"></s><s style="background: {t.preview.text}; opacity: .25"></s></i></span>
            <span class="tn">{t.name}</span>
          </button>
        {/each}
      </div>
      <span class="q">Window</span>
      <div class="frames" role="radiogroup" aria-label="Window">
        {#each FRAMES as f (f.id)}
          <button type="button" role="radio" aria-checked={(settings.frame ?? "curve") === f.id} class="frame f-{f.id}" class:on={(settings.frame ?? "curve") === f.id} onclick={() => saveSettings({ frame: f.id })}>
            <span class="fr"><i></i><b></b></span>
            <span class="tn">{f.name}</span>
          </button>
        {/each}
      </div>

    {:else if step === "day"}
      <h2>How much do you want to study a day?</h2>
      <div class="mins" role="radiogroup" aria-label="Minutes a day">
        {#each PRESETS as p (p.m)}
          <button type="button" role="radio" aria-checked={!own && minutes === p.m} class="min" class:on={!own && minutes === p.m} onclick={() => { own = false; minutes = p.m; }}>
            <b>{p.m}</b><span>min, {p.word}</span>
          </button>
        {/each}
        <button type="button" role="radio" aria-checked={own} class="min" class:on={own} onclick={() => (own = true)}>
          {#if own}
            <!-- svelte-ignore a11y_autofocus -->
            <input type="number" min="5" max="600" step="5" bind:value={minutes} aria-label="Minutes" autofocus onclick={(e) => e.stopPropagation()} />
          {:else}<b>…</b>{/if}
          <span>my own</span>
        </button>
      </div>
      <ul class="sums">
        <li>About {newCardsFor(minutes || 30)} new flashcards a day</li>
        <li>{minutes || 30} minutes a day</li>
      </ul>

    {:else if step === "done"}
      <div class="tiles" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i></div>
      <h1>{name.trim() ? `You're all set, ${name.trim()}` : "You're all set"}</h1>
      {#if !isReturning}
        <div class="firsts">
          <button type="button" class="first" onclick={() => finish("#/calendar")}><span class="fic rose"><Icon name="calendar" size={17} /></span>Add your first exam date<em>Calendar</em></button>
          <button type="button" class="first" onclick={() => finish("#/study/notes")}><span class="fic lav"><Icon name="i:pencil" size={17} /></span>Write a note with a flashcard in it<em>Notes</em></button>
          <button type="button" class="first" onclick={() => finish("#/tasks/plan")}><span class="fic sage"><Icon name="check" size={17} /></span>Plan today's study blocks<em>Tasks</em></button>
        </div>
      {:else}
        <p class="lead">Your notes, cards and courses come along from your other computer.</p>
      {/if}
      <button type="button" class="btn primary big" onclick={() => finish()}>Open Mosaic</button>
    {/if}

    {#if step !== "welcome" && step !== "done"}
      <div class="foot">
        <button type="button" class="btn quiet" onclick={() => (isReturning && at === 1 ? ((isReturning = false), (at = 0)) : go(-1))}>Back</button>
        <span class="grow"></span>
        {#if step === "courses" || step === "exams" || step === "look"}<button type="button" class="link" onclick={skip}>Skip</button>{/if}
        <button type="button" class="btn primary" onclick={next} disabled={busy}>{busy ? "Setting up…" : "Continue"}</button>
      </div>
    {/if}
  </section>
  {/key}
</div>

<style>
  .ob {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    overflow-y: auto;
    z-index: 50;
  }
  .sheet {
    width: min(620px, 100%);
    background: var(--surface-float);
    border-radius: 34px;
    padding: 34px 38px 30px;
    box-shadow: 0 30px 80px -30px color-mix(in srgb, var(--text) 28%, transparent), 0 0 0 1px var(--edge, transparent);
    display: flex;
    flex-direction: column;
    animation: rise 0.5s var(--spring) backwards;
  }
  .back .sheet {
    animation-name: rise-back;
  }
  .sheet.wide {
    width: min(720px, 100%);
  }
  .sheet.centre {
    align-items: center;
    text-align: center;
    padding: 44px 40px 40px;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(18px) scale(0.98); }
  }
  @keyframes rise-back {
    from { opacity: 0; transform: translateY(-14px) scale(0.98); }
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
  }
  .dots {
    display: flex;
    gap: 6px;
  }
  .dots i {
    width: 26px;
    height: 5px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--text) 10%, transparent);
    transition: background 0.3s;
  }
  .dots i.past {
    background: color-mix(in srgb, var(--accent, #8a74de) 45%, var(--white));
  }
  .dots i.now {
    background: var(--accent, #8a74de);
  }
  .count {
    font-size: 13px;
    color: var(--text-muted);
  }
  h1 {
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 18px 0 6px;
  }
  h2 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 18px;
    letter-spacing: -0.01em;
  }
  .sub {
    color: var(--text-muted);
    margin: -10px 0 18px;
  }
  .lead {
    color: var(--text-muted);
    margin: 0 0 26px;
    font-size: 17px;
  }
  .logo {
    width: 96px;
    height: 96px;
    filter: drop-shadow(0 12px 22px rgba(138, 116, 222, 0.35));
  }
  .btn.big {
    min-height: 52px;
    padding: 0 34px;
    font-size: 17px;
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 18px;
  }
  .link {
    background: none;
    border: 0;
    padding: 6px 4px;
    font: inherit;
    font-weight: 600;
    color: var(--link-ink);
    cursor: pointer;
    border-radius: 8px;
  }
  .link:hover {
    text-decoration: underline;
  }
  .input.name {
    font-size: 18px;
    min-height: 52px;
    margin-bottom: 22px;
  }
  .q {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    margin: 0 0 10px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 22px;
  }
  .chips button,
  .fams button,
  .svc {
    border: 0;
    border-radius: 99px;
    padding: 9px 16px;
    min-height: 40px;
    font: inherit;
    font-size: 15px;
    background: var(--chip, color-mix(in srgb, var(--text) 7%, transparent));
    color: var(--text);
    cursor: pointer;
    transition: transform 0.2s var(--spring), background 0.2s;
  }
  .chips button:hover,
  .fams button:hover,
  .svc:hover {
    transform: translateY(-1px);
  }
  .chips button.on,
  .fams button.on {
    background: var(--primary);
    color: var(--on-primary, var(--white));
  }
  .uses {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .use {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px 10px 14px;
    border-radius: 20px;
    border: 0;
    background: var(--surface);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 8%, transparent);
    font: inherit;
    color: var(--text);
    cursor: pointer;
    text-align: center;
    transition: box-shadow 0.2s, transform 0.2s var(--spring);
  }
  .use:hover {
    transform: translateY(-2px);
  }
  .use.on {
    box-shadow: inset 0 0 0 2px var(--accent, #8a74de);
    background: color-mix(in srgb, var(--accent, #8a74de) 6%, var(--surface));
  }
  .use span:last-child {
    font-size: 13px;
    color: var(--text-muted);
  }
  .uic {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    margin-bottom: 6px;
  }
  .u-school { background: color-mix(in srgb, var(--lavender) 45%, var(--white)); }
  .u-personal { background: color-mix(in srgb, var(--peach) 50%, var(--white)); }
  .u-both { background: color-mix(in srgb, var(--sage) 45%, var(--white)); }

  .term {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }
  .term span {
    font-weight: 600;
    color: var(--text-muted);
    font-size: 14px;
  }
  .term .input {
    flex: 1;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .crow,
  .erow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 14px;
    min-height: 54px;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 7%, transparent);
    animation: rise 0.35s var(--spring) backwards;
  }
  .cdot,
  .edot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 0;
    flex: none;
    cursor: pointer;
    padding: 0;
  }
  .edot {
    cursor: default;
  }
  .ipop {
    position: relative;
  }
  .ctile {
    width: 34px;
    height: 34px;
    border-radius: 11px;
    border: 0;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: var(--text);
    background: color-mix(in srgb, var(--c) 40%, var(--white));
  }
  .picker {
    position: absolute;
    top: 40px;
    left: 0;
    z-index: 5;
  }
  .cname,
  .ccode {
    border: 0;
    background: transparent;
    font: inherit;
    color: var(--text);
    min-width: 0;
    padding: 8px 4px;
    border-radius: 8px;
  }
  .cname {
    flex: 1;
    font-size: 16px;
  }
  .ccode {
    width: 130px;
    color: var(--text-muted);
  }
  .cname:focus,
  .ccode:focus {
    outline: none;
    background: var(--field);
  }
  .adder {
    background: transparent;
  }
  .plus {
    width: 34px;
    height: 34px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    background: var(--chip, color-mix(in srgb, var(--text) 7%, transparent));
    margin-left: 24px;
    color: var(--text-muted);
  }
  .x {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .x:hover {
    background: var(--chip, color-mix(in srgb, var(--text) 7%, transparent));
  }
  .etitle {
    flex: 1;
    font-weight: 500;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pill {
    font-size: 13px;
    padding: 4px 10px;
    border-radius: 99px;
    background: var(--chip, color-mix(in srgb, var(--text) 7%, transparent));
    white-space: nowrap;
  }
  .pill.days {
    background: color-mix(in srgb, var(--peach) 45%, var(--white));
  }
  .pill.days.soon {
    background: color-mix(in srgb, var(--rose) 45%, var(--white));
    color: var(--alert-ink);
    font-weight: 600;
  }
  .erow.adder {
    padding-left: 10px;
    gap: 8px;
  }
  .erow.adder .input {
    min-height: 40px;
    flex: 1;
    min-width: 0;
  }
  .erow.adder .esel {
    flex: 0 1 170px;
  }
  .erow.adder .edate {
    flex: 0 0 150px;
  }
  .input.empty {
    color: var(--text-muted);
  }

  .opts {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .opt {
    border-radius: 22px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 8%, transparent);
    transition: box-shadow 0.2s;
  }
  .opt.on {
    box-shadow: inset 0 0 0 2px var(--accent, #8a74de);
    background: color-mix(in srgb, var(--accent, #8a74de) 5%, var(--surface));
  }
  .ohead {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    width: 100%;
    padding: 16px 18px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .radio {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex: none;
    margin-top: 2px;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--text) 22%, transparent);
    transition: box-shadow 0.2s var(--spring);
  }
  .opt.on .radio {
    box-shadow: inset 0 0 0 6px var(--accent, #8a74de);
  }
  .otxt {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .otxt b {
    font-size: 17px;
  }
  .otxt span {
    color: var(--text-muted);
    font-size: 14px;
  }
  .obody {
    padding: 0 18px 16px 52px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .svcs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .svc {
    font-size: 14px;
    padding: 7px 13px;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .svc.found {
    color: var(--go-ink);
  }
  .svc.on {
    background: color-mix(in srgb, var(--sage) 45%, var(--white));
    color: var(--go-ink);
    font-weight: 600;
  }
  .where {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 6px 6px 14px;
    border-radius: 14px;
    background: var(--field);
    color: var(--text-muted);
    font-size: 15px;
  }
  .input.path {
    min-height: 44px;
  }
  .ok {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 14px;
    color: var(--go-ink);
    font-weight: 600;
  }
  .err {
    color: var(--alert-ink);
    margin: 12px 0 0;
    font-size: 14px;
  }

  .fams {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
  }
  .fams button {
    background: transparent;
  }
  .fams button.on {
    background: var(--chip, color-mix(in srgb, var(--text) 7%, transparent));
    color: var(--text);
    font-weight: 600;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 22px;
  }
  .theme,
  .frame {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .theme.on,
  .frame.on {
    color: var(--text);
    font-weight: 600;
  }
  .sw {
    width: 100%;
    aspect-ratio: 1.55;
    border-radius: 16px;
    display: block;
    position: relative;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 8%, transparent);
    transition: box-shadow 0.2s, transform 0.2s var(--spring);
    overflow: hidden;
  }
  .sw i {
    position: absolute;
    inset: 28% 12% 0 30%;
    border-radius: 8px 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
  }
  .sw s {
    display: block;
    height: 5px;
    border-radius: 9px;
    width: 60%;
  }
  .theme:hover .sw,
  .frame:hover .fr {
    transform: translateY(-2px);
  }
  .theme.on .sw,
  .frame.on .fr {
    box-shadow: 0 0 0 3px var(--accent, #8a74de);
  }
  .frames {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .fr {
    width: 100%;
    aspect-ratio: 2.6;
    border-radius: 14px;
    display: block;
    position: relative;
    background: linear-gradient(120deg, color-mix(in srgb, var(--rose) 35%, var(--white)), color-mix(in srgb, var(--lavender) 35%, var(--white)));
    transition: box-shadow 0.2s, transform 0.2s var(--spring);
    overflow: hidden;
  }
  .fr i {
    position: absolute;
    left: 6%;
    top: 14%;
    bottom: 14%;
    width: 6%;
    border-radius: 99px;
    background: color-mix(in srgb, var(--text) 20%, transparent);
  }
  .fr b {
    position: absolute;
    background: var(--white);
    right: 0;
    top: 0;
    bottom: 0;
    left: 18%;
    border-radius: 18px 0 0 18px;
  }
  .f-sheet .fr b {
    border-radius: 0;
    left: 16%;
  }
  .f-sheet .fr i {
    top: 0;
    bottom: 0;
    left: 0;
    width: 16%;
    border-radius: 0;
    background: color-mix(in srgb, var(--white) 45%, transparent);
    box-shadow: inset -1px 0 0 color-mix(in srgb, var(--text) 14%, transparent);
  }
  .f-float .fr b {
    inset: 10% 5% 10% 18%;
    border-radius: 10px;
  }

  .mins {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }
  .min {
    border: 0;
    border-radius: 20px;
    padding: 18px 8px 14px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 8%, transparent);
    font: inherit;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    transition: box-shadow 0.2s, transform 0.2s var(--spring);
  }
  .min:hover {
    transform: translateY(-2px);
  }
  .min b {
    font-size: 28px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.2;
  }
  .min.on {
    box-shadow: inset 0 0 0 2px var(--accent, #8a74de);
    background: color-mix(in srgb, var(--accent, #8a74de) 6%, var(--surface));
  }
  .min input {
    width: 70px;
    font: inherit;
    font-size: 24px;
    font-weight: 600;
    text-align: center;
    border: 0;
    border-radius: 10px;
    background: var(--field);
    color: var(--text);
    padding: 2px 0;
  }
  .sums {
    list-style: none;
    margin: 0;
    padding: 14px 18px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--lavender) 22%, var(--white));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sums li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sums li::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent, #8a74de);
  }

  .tiles {
    position: relative;
    width: 170px;
    height: 104px;
  }
  .tiles i {
    position: absolute;
    border-radius: 14px;
    animation: rise 0.6s var(--spring) backwards;
  }
  .tiles .a { left: 6px; top: 22px; width: 44px; height: 70px; background: var(--rose); transform: rotate(-8deg); }
  .tiles .b { left: 58px; top: 0; width: 50px; height: 50px; background: var(--lavender); transform: rotate(6deg); animation-delay: 0.08s; }
  .tiles .c { left: 66px; top: 62px; width: 36px; height: 36px; background: var(--sage); border-radius: 50%; animation-delay: 0.16s; }
  .tiles .d { left: 116px; top: 26px; width: 44px; height: 70px; background: var(--butter); transform: rotate(8deg); animation-delay: 0.24s; }
  .firsts {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 18px 0 26px;
  }
  .first {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 16px 10px 10px;
    min-height: 58px;
    border-radius: 18px;
    border: 0;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 7%, transparent);
    font: inherit;
    font-size: 16px;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: transform 0.2s var(--spring);
  }
  .first:hover {
    transform: translateY(-2px);
  }
  .first em {
    margin-left: auto;
    font-style: normal;
    font-size: 14px;
    color: var(--text-muted);
  }
  .fic {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: grid;
    place-items: center;
  }
  .fic.rose { background: color-mix(in srgb, var(--rose) 40%, var(--white)); }
  .fic.lav { background: color-mix(in srgb, var(--lavender) 40%, var(--white)); }
  .fic.sage { background: color-mix(in srgb, var(--sage) 40%, var(--white)); }

  .foot {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 28px;
  }
  .grow {
    flex: 1;
  }
  @media (max-width: 640px) {
    .sheet { padding: 26px 22px 22px; border-radius: 28px; }
    h1 { font-size: 32px; }
    h2 { font-size: 23px; }
    .uses, .mins { grid-template-columns: repeat(2, 1fr); }
    .themes { grid-template-columns: repeat(3, 1fr); }
    .ccode { width: 80px; }
    .erow.adder { flex-wrap: wrap; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet, .crow, .erow, .tiles i { animation: none; }
  }
</style>
