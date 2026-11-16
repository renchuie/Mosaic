// Preview data for running the UI in a plain browser (npm run dev). The app
// itself always shows your real labs folder.
import type { Folder, Item } from "../stores/labs.svelte";

const lab = (rel: string, title: string, slug: string): Item => ({
  name: rel.split("/").pop()!, rel, kind: "lab", ext: "html", size: 2_400_000, mtime: 1794700000,
  lab: { title, version: "3.14.1", slug, slug_guessed: false },
});
const file = (rel: string, kind: "note" | "file"): Item => ({
  name: rel.split("/").pop()!, rel, kind, ext: rel.split(".").pop()!, size: 180_000, mtime: 1794600000, lab: null,
});

export const sampleTree: Folder = {
  name: "Recall Labs", rel: "", truncated: false, items: [],
  folders: [
    {
      name: "Ther IV", rel: "Ther IV", truncated: false,
      items: [file("Ther IV/Syllabus.pdf", "file")],
      folders: [
        {
          name: "Exam 4", rel: "Ther IV/Exam 4", truncated: false, folders: [],
          items: [lab("Ther IV/Exam 4/Ther IV Exam 4 Recall Lab.html", "Ther IV Exam 4 lab", "ther4-exam4"), file("Ther IV/Exam 4/Exam 4 notes.docx", "note"), file("Ther IV/Exam 4/Lipids slides.pdf", "file")],
        },
        {
          name: "Exam 5", rel: "Ther IV/Exam 5", truncated: false, folders: [],
          items: [
            lab("Ther IV/Exam 5/Ther IV Exam 5 Recall Lab.html", "Ther IV Exam 5 lab", "ther4-exam5"),
            file("Ther IV/Exam 5/Heart failure notes.md", "note"),
            file("Ther IV/Exam 5/Arrhythmia notes.docx", "note"),
            file("Ther IV/Exam 5/HF guideline 2022.pdf", "file"),
            file("Ther IV/Exam 5/Anticoag dosing chart.png", "file"),
          ],
        },
      ],
    },
    { name: "Pharmacy Law", rel: "Pharmacy Law", truncated: false, folders: [], items: [file("Pharmacy Law/CSA schedules.md", "note")] },
  ],
};

export const sampleProgress: Record<string, string> = {
  "recallLab.ther4-exam5.v3": JSON.stringify({ best: { hf: 82, arr: 64, anticoag: 45, stroke: 30 }, missed: Array(12).fill("q"), known: Array(40).fill("c"), sims: [{ d: 1, pct: 70 }, { d: 2, pct: 78 }, { d: 3, pct: 74 }] }),
  "recallLab.ther4-exam4.v3": JSON.stringify({ best: { a: 90, b: 86, c: 92, d: 80, e: 88, f: 91, g: 85, h: 93, i: 87 }, missed: Array(5).fill("q"), known: Array(120).fill("c"), sims: [{ d: 1, pct: 91 }, { d: 2, pct: 86 }] }),
};
