// pdf.js, loaded only when a PDF is opened. The "legacy" build is used because it
// carries the polyfills older WebKitGTK versions need.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<PdfJs> | null = null;

export function pdfjs(): Promise<PdfJs> {
  lib ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl;
    return m;
  });
  return lib;
}
