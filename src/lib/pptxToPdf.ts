// PowerPoint → PDF inside Mosaic (Nov 20; step 2 of slide support, no other app needed).
// pptx-svg draws each slide as SVG (text stays text), svg2pdf.js + jsPDF turn each SVG into a PDF
// page, pdf-lib joins the pages. Each slide is its own little PDF first, so one slide the PDF
// library can't read never spoils the next (a failure there left the graphics state unbalanced and
// flipped the following page); such a slide becomes a picture of itself instead. TIFF pictures
// (browsers can't draw them) are turned into PNG with UTIF first. Hidden slides are left out, like
// PowerPoint's own "Save as PDF". The libraries load only when a deck is converted.
export type Converted = { pdf: Uint8Array; pages: number; pictures: number };

export async function pptxToPdf(bytes: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<Converted> {
  const [{ PptxRenderer }, { jsPDF }, , utifMod, { PDFDocument }] = await Promise.all([
    import("pptx-svg"),
    import("jspdf"),
    import("svg2pdf.js"),
    import("utif"),
    import("pdf-lib"),
  ]);
  const UTIF = (utifMod as { default?: unknown }).default ?? utifMod;
  const r = new PptxRenderer();
  await r.init();
  await r.loadPptx(bytes);
  const total = r.getSlideCount();
  const out = await PDFDocument.create();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;";
  document.body.appendChild(host);
  let pictures = 0;
  try {
    for (let i = 0; i < total; i++) {
      onProgress?.(i, total);
      if (r.isSlideHidden(i)) continue;
      const svgText = await pngTiffs(r.renderSlideSvg(i), UTIF as Utif);
      host.innerHTML = svgText;
      const sv = host.querySelector("svg");
      if (!sv) continue;
      const w = parseFloat(sv.getAttribute("width") ?? "") || 960;
      const h = parseFloat(sv.getAttribute("height") ?? "") || 540;
      if (!sv.getAttribute("viewBox")) sv.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const fmt = { orientation: (w > h ? "l" : "p") as "l" | "p", unit: "pt" as const, format: [w, h] };
      let page: ArrayBuffer;
      try {
        const doc = new jsPDF(fmt);
        await (doc as unknown as { svg: (el: Element, o: object) => Promise<unknown> }).svg(sv, { x: 0, y: 0, width: w, height: h });
        page = doc.output("arraybuffer");
      } catch {
        const doc = new jsPDF(fmt);
        doc.addImage(await rasterize(svgText, w, h), "PNG", 0, 0, w, h);
        page = doc.output("arraybuffer");
        pictures++;
      }
      const src = await PDFDocument.load(page);
      const [p] = await out.copyPages(src, [0]);
      out.addPage(p);
      // let the window breathe between slides
      await new Promise((res) => setTimeout(res));
    }
  } finally {
    host.remove();
  }
  onProgress?.(total, total);
  return { pdf: await out.save(), pages: out.getPageCount(), pictures };
}

type Utif = {
  decode: (b: ArrayBuffer) => { width: number; height: number }[];
  decodeImage: (b: ArrayBuffer, ifd: object) => void;
  toRGBA8: (ifd: object) => Uint8Array;
};

/** data:image/tiff → data:image/png (a picture that can't be read is left as it was) */
async function pngTiffs(svg: string, UTIF: Utif): Promise<string> {
  if (!svg.includes("data:image/tiff")) return svg;
  return svg.replace(/data:image\/tiff;base64,([A-Za-z0-9+/=]+)/g, (whole, b64: string) => {
    try {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const ifds = UTIF.decode(buf.buffer);
      UTIF.decodeImage(buf.buffer, ifds[0]);
      const rgba = UTIF.toRGBA8(ifds[0]);
      const c = document.createElement("canvas");
      c.width = ifds[0].width;
      c.height = ifds[0].height;
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), c.width, c.height), 0, 0);
      return c.toDataURL("image/png");
    } catch {
      return whole;
    }
  });
}

/** a picture of a slide, for the rare slide the PDF library can't draw as text */
function rasterize(svg: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(w * 2);
      c.height = Math.round(h * 2);
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't draw a slide"));
    };
    img.src = url;
  });
}
