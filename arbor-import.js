/* =====================================================================
   arbor-import.js, a timetable read out of the PDF Arbor makes.

   Arbor's "Timetable for ..." PDF is one page a week: the times of the day
   across the top, a row for each day down the side, and in each box the
   lesson ("Computing: Year 07: 7y/Co2"), the room and the staff. This
   reads that grid and hands back what is in each box, by day and by time.
   It knows nothing about the console: timetable.js decides which of a
   teacher's periods a box belongs to and which class it is.

     arborTimetable.read(bytes)  ->  Promise of
       { weeks: [ { week:"A"|"B"|"", monday:"YYYY-MM-DD"|"",
                    boxes: [ { day:1-5, start:"HH:MM", end:"HH:MM",
                               lines:[ "Computing: Year 07: 7y/Co2", "IT1", ... ] } ] } ] }

   There is no PDF library behind this, so nothing has to be fetched from
   anywhere the school's filter might block. A PDF is objects and
   compressed streams; the browser's own DecompressionStream opens the
   streams, and what is left is reading where each piece of text is drawn.

   Arbor's PDFs are encrypted with an empty password (RC4, the PDF's
   "standard" security), which stops them being edited but not read. That
   is undone here with MD5 and RC4, the only two things it takes. AES, or
   a PDF with a real password, is turned away with a message.

   Works in a browser, and in Node for testing (module.exports). Nothing
   from the file is kept: the staff names in each box are read along with
   everything else and left to the caller, which keeps only the lesson.
   ===================================================================== */
(function(root){
  "use strict";

  const latin1 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };
  const fromHex = (h) => { const out = new Uint8Array(h.length >> 1); for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16); return out; };
  const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; parts.forEach(p => { out.set(p, at); at += p.length; }); return out; };

  /* ---------- MD5 (RFC 1321), for the encryption key ---------- */
  function md5(bytes){
    const K = new Int32Array(64), S = [7,12,17,22, 5,9,14,20, 4,11,16,23, 6,10,15,21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    const n = bytes.length, words = ((n + 8) >>> 6) + 1, M = new Int32Array(words * 16);
    for (let i = 0; i < n; i++) M[i >> 2] |= bytes[i] << ((i % 4) * 8);
    M[n >> 2] |= 0x80 << ((n % 4) * 8);
    M[words * 16 - 2] = n * 8;
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let w = 0; w < words * 16; w += 16){
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++){
        let F, g;
        if (i < 16){ F = (B & C) | (~B & D); g = i; }
        else if (i < 32){ F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48){ F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const t = D; D = C; C = B;
        const x = (A + F + K[i] + M[w + g]) | 0, r = S[(i >> 4) * 4 + (i % 4)];
        B = (B + ((x << r) | (x >>> (32 - r)))) | 0; A = t;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, i) => { for (let j = 0; j < 4; j++) out[i * 4 + j] = (v >>> (j * 8)) & 255; });
    return out;
  }
  function rc4(key, data){
    const S = new Uint8Array(256); for (let i = 0; i < 256; i++) S[i] = i;
    for (let i = 0, j = 0; i < 256; i++){ j = (j + S[i] + key[i % key.length]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t; }
    const out = new Uint8Array(data.length);
    for (let k = 0, i = 0, j = 0; k < data.length; k++){
      i = (i + 1) & 255; j = (j + S[i]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t;
      out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
    }
    return out;
  }
  const PAD = fromHex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A");

  /* The key for the empty password, or null when the PDF is not encrypted.
     Checked against /U, so a PDF that does have a password is caught here
     rather than read as nonsense. */
  function encryptionKey(text){
    const ref = /\/Encrypt\s+(\d+)\s+0\s+R/.exec(text);
    if (!ref) return null;
    const dict = objectText(text, +ref[1]) || "";
    if (!/\/Filter\s*\/Standard/.test(dict)) throw readError();
    const R = +((/\/R\s+(\d+)/.exec(dict) || [])[1] || 0);
    const V = +((/\/V\s+(\d+)/.exec(dict) || [])[1] || 0);
    if (V > 2 || R > 3) throw readError();                     // AES: not handled
    const hexOf = (k) => { const m = new RegExp("\\/" + k + "\\s*<([0-9A-Fa-f]+)>").exec(dict); return m ? fromHex(m[1]) : null; };
    const O = hexOf("O"), U = hexOf("U");
    const P = +((/\/P\s+(-?\d+)/.exec(dict) || [])[1] || 0);
    const len = R >= 3 ? (+((/\/Length\s+(\d+)/.exec(dict) || [])[1] || 40)) / 8 : 5;
    const id = /\/ID\s*\[\s*<([0-9A-Fa-f]+)>/.exec(text);
    if (!O || !U || !id) throw readError();
    const p = new Uint8Array([P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >> 24) & 255]);
    let key = md5(concat(PAD, O, p, fromHex(id[1]))).subarray(0, len);
    if (R >= 3) for (let i = 0; i < 50; i++) key = md5(key).subarray(0, len);
    let check;
    if (R >= 3){
      check = md5(concat(PAD, fromHex(id[1])));
      for (let i = 0; i < 20; i++) check = rc4(key.map(b => b ^ i), check);
      if (!check.subarray(0, 16).every((b, i) => b === U[i])) throw readError("This PDF has a password, so it cannot be read here.");
    } else {
      check = rc4(key, PAD);
      if (!check.every((b, i) => b === U[i])) throw readError("This PDF has a password, so it cannot be read here.");
    }
    return { key, len };
  }
  function objectKey(enc, num, gen){
    const b = new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]);
    return md5(concat(enc.key, b)).subarray(0, Math.min(enc.len + 5, 16));
  }

  function readError(words){
    const e = new Error(words || "That PDF could not be read. Download the timetable from Arbor again and choose the new file.");
    e.readable = true;
    return e;
  }

  /* ---------- objects and streams ---------- */
  /* The text of object `num`, outside any stream. */
  function objectText(text, num){
    const re = new RegExp("(?:^|[\\r\\n\\s])" + num + "\\s+0\\s+obj\\b", "g");
    const m = re.exec(text);
    if (!m) return null;
    const end = text.indexOf("endobj", m.index);
    return text.slice(m.index, end < 0 ? undefined : end);
  }
  async function inflate(bytes){
    if (typeof DecompressionStream === "undefined") throw readError("This browser cannot open PDFs here. Try Chrome or Edge.");
    const ds = new DecompressionStream("deflate");
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  /* Every stream in the file, decrypted and opened, by object number. */
  async function streams(bytes, text, enc){
    const out = {};
    const re = /stream\r?\n/g; let m;
    while ((m = re.exec(text))){
      if (text.slice(m.index - 3, m.index) === "end") continue;
      const objAt = text.lastIndexOf(" obj", m.index);
      const head = /(\d+)\s+(\d+)$/.exec(text.slice(Math.max(0, objAt - 14), objAt));
      if (!head) continue;
      const dict = text.slice(objAt, m.index);
      const start = m.index + m[0].length;
      let end = text.indexOf("endstream", start);
      while (end > start && (text[end - 1] === "\n" || text[end - 1] === "\r")) end--;
      let data = bytes.subarray(start, end);
      if (enc && !/\/Type\s*\/XRef/.test(dict)) data = rc4(objectKey(enc, +head[1], +head[2]), data);
      if (/\/FlateDecode/.test(dict)){
        try{ data = await inflate(data); }catch(e){ continue; }
      }
      out[+head[1]] = { dict, text: latin1(data) };
    }
    return out;
  }
  /* Objects packed inside object streams, by number, as text. */
  function packedObjects(all){
    const out = {};
    Object.values(all).forEach(st => {
      if (!/\/Type\s*\/ObjStm/.test(st.dict)) return;
      const first = +((/\/First\s+(\d+)/.exec(st.dict) || [])[1] || 0);
      const nums = st.text.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < nums.length; i += 2){
        const from = first + nums[i + 1], to = i + 3 < nums.length ? first + nums[i + 3] : st.text.length;
        out[nums[i]] = st.text.slice(from, to);
      }
    });
    return out;
  }

  /* ---------- the text on a page, and where it is ---------- */
  const unescape = (t) => t.replace(/\\(\d{1,3}|[\s\S])/g, (a, c) =>
    /^\d/.test(c) ? String.fromCharCode(parseInt(c, 8)) :
    c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c === "b" ? "\b" : c === "f" ? "\f" :
    c === "\n" || c === "\r" ? "" : c);
  function runsOf(content){
    const runs = [];
    let x = 0, y = 0, lineX = 0, lineY = 0, leading = 0;
    const tok = /\[((?:\\[\s\S]|[^\]\\])*)\]\s*TJ|\(((?:\\[\s\S]|[^)\\])*)\)\s*(Tj|')|(-?[\d.]+)\s+(-?[\d.]+)\s+(Td|TD)|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|(-?[\d.]+)\s+TL|\bT\*|\bBT\b/g;
    let t;
    while ((t = tok.exec(content))){
      const w = t[0];
      if (w === "BT"){ x = y = lineX = lineY = 0; continue; }
      if (w === "T*"){ lineY -= leading; x = lineX; y = lineY; continue; }
      if (t[13] !== undefined){ leading = +t[13]; continue; }
      if (t[4] !== undefined){ lineX += +t[4]; lineY += +t[5]; if (t[6] === "TD") leading = -(+t[5]); x = lineX; y = lineY; continue; }
      if (t[7] !== undefined){ lineX = x = +t[11]; lineY = y = +t[12]; continue; }
      if (t[3] === "'"){ lineY -= leading; x = lineX; y = lineY; }
      const str = t[1] !== undefined
        ? [...t[1].matchAll(/\(((?:\\[\s\S]|[^)\\])*)\)/g)].map(z => unescape(z[1])).join("")
        : unescape(t[2]);
      if (str) runs.push({ x, y, text: str });
    }
    return runs;
  }

  /* ---------- Arbor's grid ---------- */
  const TIME = /(\d{1,2}:\d\d)\s*-\s*(\d{1,2}:\d\d)/g;
  const DAYNAMES = ["monday","tuesday","wednesday","thursday","friday"];
  const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const near = (a, b) => Math.abs(a - b) < 1.5;
  const median = (list) => { const s = list.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (t) => { const [h, m] = t.split(":"); return pad(+h) + ":" + m; };

  /* The runs on one line, joined in order. Arbor splits words at kerning
     ("Y" "ear 08"), so runs are put together without a space; where the
     words did have a space between them, the PDF draws the space. */
  function lineText(runs){ return runs.slice().sort((a, b) => a.x - b.x).map(r => r.text).join("").replace(/\s+/g, " ").trim(); }

  function readWeek(runs){
    const ys = [...new Set(runs.map(r => Math.round(r.y * 10) / 10))].sort((a, b) => b - a);
    const atY = (y) => runs.filter(r => near(r.y, y));
    /* The title is the top line: which week, and the Monday it starts. */
    const title = lineText(atY(ys[0] || 0));
    const wk = /Week\s+([AB])\b/i.exec(title);
    /* "Monday, 02 November 2026", drawn as separate pieces with no spaces
       between them once they are joined: "Monday,02November2026". */
    const dm = /Monday,?\s*(\d{1,2})\s*([A-Za-z]+?)\s*(\d{4})/.exec(title);
    let monday = "";
    if (dm && MONTHS.indexOf(dm[2].toLowerCase()) >= 0)
      monday = dm[3] + "-" + pad(MONTHS.indexOf(dm[2].toLowerCase()) + 1) + "-" + pad(+dm[1]);
    /* The times across the top: the first line with two or more of them. */
    let headY = null, cols = [];
    for (const y of ys){
      const line = atY(y).sort((a, b) => a.x - b.x);
      let joined = "", at = [];
      line.forEach(r => { at.push({ from: joined.length, x: r.x }); joined += r.text; });
      const found = [...joined.matchAll(TIME)];
      if (found.length >= 2){
        headY = y;
        cols = found.map(f => ({ x: at.filter(a => a.from <= f.index).pop().x, start: hhmm(f[1]), end: hhmm(f[2]) }));
        break;
      }
    }
    if (headY === null || cols.length < 2) return null;
    cols.sort((a, b) => a.x - b.x);
    const colW = median(cols.slice(1).map((c, i) => c.x - cols[i].x));
    const leftEdge = cols[0].x - colW * 0.6;
    /* The days down the side, left of the first column. */
    const days = [];
    ys.filter(y => y < headY).forEach(y => {
      const words = lineText(atY(y).filter(r => r.x < leftEdge)).toLowerCase();
      const d = DAYNAMES.findIndex(n => words.indexOf(n) === 0);
      if (d >= 0) days.push({ day: d + 1, y });
    });
    if (!days.length) return null;
    const band = days.length > 1 ? median(days.slice(1).map((d, i) => days[i].y - d.y)) : 90;
    /* Everything else is in a box. A line of runs is cut into the boxes it
       crosses: a new box starts where a run begins a column's width or
       more past the start of the last one. */
    const boxes = new Map();
    ys.filter(y => y < headY).forEach(y => {
      const line = atY(y).filter(r => r.x >= leftEdge).sort((a, b) => a.x - b.x);
      const pieces = [];
      line.forEach(r => {
        const last = pieces[pieces.length - 1];
        if (last && r.x < last.x + colW * 0.9) last.runs.push(r);
        else pieces.push({ x: r.x, runs: [r] });
      });
      pieces.forEach(p => {
        /* the column is the last one whose time starts no further right
           than a quarter of a column past this box's text */
        const col = cols.filter(c => c.x <= p.x + colW * 0.25).pop();
        const day = days.slice().sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
        if (!col || Math.abs(day.y - y) > band / 2) return;
        const k = day.day + "|" + col.start;
        if (!boxes.has(k)) boxes.set(k, { day: day.day, start: col.start, end: col.end, lines: [] });
        boxes.get(k).lines.push(lineText(p.runs));
      });
    });
    return { week: wk ? wk[1].toUpperCase() : "", monday, boxes: [...boxes.values()] };
  }

  async function read(input){
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const text = latin1(bytes);
    if (text.slice(0, 5) !== "%PDF-") throw readError("That file is not a PDF.");
    const enc = encryptionKey(text);
    const all = await streams(bytes, text, enc);
    const packed = packedObjects(all);
    const obj = (n) => packed[n] !== undefined ? packed[n] : objectText(text, n);
    /* Pages in their own order: the /Kids of the page tree. */
    const rootRef = /\/Root\s+(\d+)\s+0\s+R/.exec(text);
    const pagesRef = rootRef && /\/Pages\s+(\d+)\s+0\s+R/.exec(obj(+rootRef[1]) || "");
    const kids = [];
    const walk = (n, depth) => {
      const o = obj(n) || "";
      if (depth > 8) return;
      const k = /\/Kids\s*\[([^\]]*)\]/.exec(o);
      if (k) [...k[1].matchAll(/(\d+)\s+0\s+R/g)].forEach(r => walk(+r[1], depth + 1));
      else kids.push(o);
    };
    if (pagesRef) walk(+pagesRef[1], 0);
    const weeks = [];
    kids.forEach(page => {
      const c = /\/Contents\s*(?:\[([^\]]*)\]|(\d+)\s+0\s+R)/.exec(page);
      if (!c) return;
      const refs = c[1] ? [...c[1].matchAll(/(\d+)\s+0\s+R/g)].map(r => +r[1]) : [+c[2]];
      const content = refs.map(r => (all[r] || {}).text || "").join("\n");
      const week = readWeek(runsOf(content));
      if (week) weeks.push(week);
    });
    if (!weeks.length) throw readError("That does not look like a timetable from Arbor. Download it from Arbor as a PDF and choose that file.");
    return { weeks };
  }

  const api = { read };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.arborTimetable = api;
})(typeof window !== "undefined" ? window : this);
