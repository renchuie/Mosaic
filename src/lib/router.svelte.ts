// Tiny hash router: #/labs, #/labs/<folder or lab path>, #/calendar …
export const PAGES = ["dashboard", "labs", "calendar", "tasks", "courses", "settings"] as const;
export type Page = (typeof PAGES)[number];

function read(): { page: Page; rest: string } {
  const [head, ...tail] = location.hash.replace(/^#\/?/, "").split("/");
  const page = (PAGES as readonly string[]).includes(head) ? (head as Page) : "dashboard";
  let rest = "";
  try {
    rest = tail.map(decodeURIComponent).join("/");
  } catch {
    rest = tail.join("/");
  }
  return { page, rest };
}

export const route = $state(read());
window.addEventListener("hashchange", () => Object.assign(route, read()));
