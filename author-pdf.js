/* =====================================================================
   author-pdf.js, reading a PDF into pictures for a PDF viewer task.

   A knowledge organiser arrives as a PDF, and a PDF is the one thing a
   lesson cannot rely on a browser to show. An iPad shows the first page
   of one in a frame and nothing after it, Android Chrome shows none at
   all, and a school laptop with the viewer switched off downloads it
   instead. A picture every one of them shows. So the builder reads each
   page into a picture here, once, and the lesson only ever has pictures.

   Each page goes through upload-image like any other picture, which keeps
   the 750KB cap, the Pictures pop-up and its "where is this used" count
   all working without knowing PDFs exist. Offline there is no database,
   so the pages travel inside the lesson file as data, the way slides do.

   Storage: a dense A4 page of text comes out at 250 to 600KB, and a
   knowledge organiser is one or two pages. That is one copy per lesson,
   not per student, so a whole year's worth is a few MB of the 5GB.

   pdf.js is fetched from jsDelivr the first time a PDF is chosen, the same
   way lesson.html fetches jsPDF. Nothing on a student's side needs it.

   window.readPdfPages(file, progress) -> Promise of
     { pages: [ { imgId | src, w, h } ], total, kept }
   progress(done, of) is told after each page.
   ===================================================================== */
(function(){
"use strict";

/* Version 3 is the last that ships a plain script: 4 onwards is modules
   only, which a classic page cannot load with a <script> tag. */
const BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/";
/* Enough for a knowledge organiser with a page of questions behind it.
   Past this it is a textbook, and every page is another upload. */
const MAX_PAGES = 10;
/* Long side in pixels. Ten point text on A4 needs about this many to stay
   readable when a student zooms in on it; any fewer and the letters blur
   into each other at exactly the moment they are being read. */
const LONG_SIDE = 2200;
/* The server refuses base64 over 1,000,000 characters. A little under, so
   a page that only just fits is not turned away by its own header. */
const TARGET = 990000;
const TOO_BIG = 40 * 1024 * 1024;

let loading = null;
function loadPdfJs(){
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = BASE + "pdf.min.js";
    sc.onload = () => {
      if (!window.pdfjsLib){ loading = null; reject(new Error("The PDF reader did not load.")); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    /* Cleared so pressing it again tries again, rather than handing back
       the same failure for the rest of the visit. */
    sc.onerror = () => { loading = null; sc.remove(); reject(new Error("The PDF reader could not be fetched. Check the internet connection and try again.")); };
    document.head.appendChild(sc);
  });
  return loading;
}

/* One page as a JPEG no bigger than the server takes. Quality comes down
   first, because a smaller picture of text is worse than a softer one;
   only then does the page shrink. */
async function pagePicture(page){
  const at1 = page.getViewport({ scale: 1 });
  let scale = LONG_SIDE / Math.max(at1.width, at1.height);
  for (let tries = 0; tries < 5; tries++){
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(vp.width));
    c.height = Math.max(1, Math.round(vp.height));
    const g = c.getContext("2d");
    /* A PDF page has no background of its own, and a JPEG has no see-
       through parts, so without this the paper comes out black. */
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    /* "print", because for the screen pdf.js waits for the next animation
       frame between pieces of the page, and a tab that is not being drawn
       has none. A teacher who went to another tab while ten pages were
       read came back to it stuck on page one, for good. */
    await page.render({ canvasContext: g, viewport: vp, intent: "print" }).promise;
    for (const q of [0.85, 0.75, 0.65, 0.55]){
      const data = c.toDataURL("image/jpeg", q);
      if (data.length <= TARGET) return { data, w: c.width, h: c.height };
    }
    scale *= 0.8;
  }
  throw new Error("A page of that PDF is too detailed to keep, even made smaller.");
}

async function keep(made){
  if (typeof OFFLINE !== "undefined" && OFFLINE) return { src: made.data, w: made.w, h: made.h };
  const API = (window.HUB && window.HUB.API) || "";
  const r = await fetch(API + "/api/teacher/upload-image", { method: "POST", headers: window.teacherAuth.json(),
    body: JSON.stringify({ data: made.data, mime: "image/jpeg", width: made.w, height: made.h, alt: "" }) });
  if (r.status === 401 || r.status === 403) throw new Error("Sign in again, then choose the PDF again.");
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "A page of that PDF could not be saved.");
  return { imgId: d.id, w: made.w, h: made.h };
}

async function readPdfPages(file, progress){
  if (!file) throw new Error("No file was chosen.");
  if (!/\.pdf$/i.test(file.name || "") && file.type !== "application/pdf")
    throw new Error("That is not a PDF. In Word or PowerPoint, choose File, Save as, then PDF.");
  if (file.size > TOO_BIG) throw new Error("That PDF is over 40MB. Save a smaller copy and try again.");
  const lib = await loadPdfJs();
  let doc;
  try{
    doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  }catch(e){
    throw new Error(e && e.name === "PasswordException"
      ? "That PDF has a password on it. Save a copy without one and try again."
      : "That PDF could not be read. Try saving it again from the program that made it.");
  }
  const total = doc.numPages;
  const kept = Math.min(total, MAX_PAGES);
  const pages = [];
  try{
    for (let n = 1; n <= kept; n++){
      const page = await doc.getPage(n);
      pages.push(await keep(await pagePicture(page)));
      page.cleanup();
      if (progress) progress(n, kept);
    }
  } finally {
    doc.destroy();
  }
  return { pages, total, kept };
}

window.readPdfPages = readPdfPages;
window.PDF_MAX_PAGES = MAX_PAGES;
})();
