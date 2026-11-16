// Tiny hash router: #/labs, #/calendar … Keeps Back/Forward working without a dependency.
export const PAGES = ["dashboard", "labs", "calendar", "tasks", "courses", "settings"] as const;
export type Page = (typeof PAGES)[number];

function read(): Page {
  const p = location.hash.replace(/^#\/?/, "").split("/")[0];
  return (PAGES as readonly string[]).includes(p) ? (p as Page) : "dashboard";
}

export const route = $state({ page: read() });
window.addEventListener("hashchange", () => (route.page = read()));
