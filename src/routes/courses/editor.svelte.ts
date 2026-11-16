// Opens the course settings dialog from anywhere on the Courses pages.
export const courseEditor = $state({
  id: null as string | null,
  shown: false,
  open(id: string | null) {
    courseEditor.id = id;
    courseEditor.shown = true;
  },
});
