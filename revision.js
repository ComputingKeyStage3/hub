/* =====================================================================
   revision.js: the Revision task.

     { type:"revise", title, task, kinds:["cards","mindmap","poster","quiz","photo"],
       target, branches, words:["bit", ...] }
     Saved as { kind, cards:[{f,b,i}], quiz:[{q,a,i}], map:{nodes}, poster:{img},
                pwords, photos:[data url], binned, look:{c,p} }

   Home learning near the end of a unit: make something to revise from,
   here or on paper. Each kind keeps its own part of the value, so changing
   their mind from flashcards to a quiz and back loses nothing, and only
   `kind` says which one is handed in.

   There are two halves, and a student never sees both at once:
     window.rRevise     making it, in the lesson
     reviseKit.page()   testing themselves with it, on a page of its own
                        that the summary opens once it is finished
   Testing used to be a pop-up beside the cards as they were written, which
   is testing what was typed half a minute ago.

   Everything made here is words, a few KB. A picture on a card is the NAME
   of one of the drawings in tasks-extra.js (drawKit.STAMPS), and one nobody
   picked is worked out from the words each time and not saved at all. The
   exception is a photo of paper work, which is why there are at most two
   and why each is squeezed harder than a screenshot (see squeezePhoto). A
   teacher can clear photos away once they have looked; `binned` is then the
   time they did, and the photos are in the recycle bin, not here.

   Loaded by work.html as well, for At a glance, which uses the counting and
   none of the drawing.
   ===================================================================== */
(function(){
  "use strict";
  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };
  const button = (cls, text, fn) => {
    const b = make("button", cls, text);
    b.type = "button";
    if (fn) b.addEventListener("click", fn);
    return b;
  };
  /* Web Animations, not CSS, for the reason at the top of motion.js: the
     school's computers all ask for reduced motion and style.css obeys.
     Settings > Reduce animation is the switch that turns these off. */
  const still = () => !!(window.hubMotion && window.hubMotion.off());
  const OUT = "cubic-bezier(.16, 1, .3, 1)";
  function anim(el, frames, ms, more){
    if (!el || !el.animate || still()) return null;
    try{ return el.animate(frames, Object.assign({ duration: ms, easing: OUT }, more || {})); }catch(e){ return null; }
  }
  const wait = (ms) => new Promise(go => setTimeout(go, still() ? 0 : ms));
  /* Paper thrown out from the middle of something, and gone. */
  function burst(from, many){
    if (!from || still() || !from.animate) return;
    const r = from.getBoundingClientRect();
    if (!r.width) return;
    for (let i = 0; i < (many || 18); i++){
      const bit = make("i", "rv-bit");
      bit.style.left = (r.left + r.width / 2) + "px";
      bit.style.top = (r.top + r.height / 2) + "px";
      bit.style.background = HUES[i % HUES.length];
      document.body.appendChild(bit);
      const a = Math.random() * Math.PI * 2, far = 50 + Math.random() * 110;
      const dx = Math.cos(a) * far, dy = Math.sin(a) * far - 30;
      const ms = 600 + Math.random() * 400;
      anim(bit, [{ transform: "translate(0,0) rotate(0deg)", opacity: 1 },
                 { transform: "translate(" + dx + "px," + dy + "px) rotate(200deg)", opacity: 1, offset: .6 },
                 { transform: "translate(" + dx + "px," + (dy + 70) + "px) rotate(340deg)", opacity: 0 }], ms, { easing: "ease-out" });
      setTimeout(() => bit.remove(), ms);
    }
  }

  const KINDS = {
    cards:   { name: "Flashcards",     say: "A question or word on the front, the answer on the back",  one: "card",     many: "cards" },
    mindmap: { name: "Mind map",       say: "The big idea in the middle, with branches",                one: "branch",   many: "branches" },
    poster:  { name: "Poster",         say: "One page with the key facts on it",                        one: "", many: "" },
    quiz:    { name: "Quiz",           say: "Questions to answer later without looking",                one: "question", many: "questions" },
    photo:   { name: "I did it on paper", say: "Take a photo of it and hand that in",                   one: "photo", many: "photos" }
  };
  const ORDER = ["cards", "mindmap", "poster", "quiz", "photo"];
  const MOST = 60;               // cards or questions
  const WORDS = 300;             // characters on one side of a card
  const LONG = 140;              // a back longer than this is hard to learn
  const PHOTO_MOST = 2;

  /* --- pictures --- */
  const HUES = ["#2F6BAE","#2E7D5B","#DC8A3E","#8C5BC4","#D35D8A","#1F8A8A","#C0392B","#B8930A"];
  const PATTERNS = [["plain","Plain"],["dots","Dots"],["lines","Stripes"],["grid","Squares"]];
  const KIND_HUE = { cards: HUES[0], mindmap: HUES[1], poster: HUES[2], quiz: HUES[3], photo: HUES[5] };
  const stamps = () => (window.drawKit && window.drawKit.STAMPS) || [];
  const stampOf = (name) => stamps().find(s => s.name === name) || null;
  const pack = () => window.iconPack || null;
  const known = (name) => !!stampOf(name) || !!(pack() && pack().has(name));
  function iconSvg(name, size, hue){
    if (/^ip:/.test(name || "")) return pack() ? pack().svg(name, size, hue) : "";
    const def = stampOf(name);
    if (!def) return "";
    const INK = "#1D1D1B";
    return '<svg class="rv-icon" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      def.parts.map(p => p[0] === "eye"
        ? '<path d="' + p[1] + '" fill="' + INK + '"/>'
        : '<path d="' + p[1] + '" fill="' + (p[0] || "none") + '" stroke="' + (p[3] || INK) + '" stroke-width="' +
          ((p[2] || 2.5) * 1.3) + '" stroke-linejoin="round" stroke-linecap="round"/>').join("") + '</svg>';
  }
  /* The picture that goes with some words, or "". Looked for in this order,
     so the particular comes before the general: "public key" is a key before
     anything else in the sentence is a person. */
  const GUESSES = [
    [/\bphish|\bscam|\bsmish|\bblagg/, "hook"],
    [/\bvirus|\bmalware|\bworm|\btrojan|\bransom|\bspyware|\bbugs?\b|\bdebug|\bhack/, "bug"],
    [/\bpassword|\bpadlock|\bauthenti|\bbiometric|\bprivate\b/, "padlock"],
    [/\bencrypt|\bdecrypt|\bcipher|\bcaesar|\bkeys?\b/, "keys"],
    [/\bfirewall|\bsecur|\bprotect|\bantivirus|\banti-malware|\bsafe/, "shield"],
    [/\blaw|\bact\b|\bcopyright|\blegal|\bethic|\bgdpr|\blicen[cs]e/, "law"],
    [/\bbinary|\bbits?\b|\bbytes?\b|\bnibble|\bbase 2\b|\b[01]{4,8}\b/, "binary"],
    [/\bkilobyte|\bmegabyte|\bgigabyte|\bterabyte|\bstorage|\bdatabase|\bhard (disk|drive)|\bssd\b|\brom\b|\bsecondary/, "database"],
    [/\bcpu\b|\bprocessor|\bram\b|\bmemory|\bregister|\balu\b|\bcache|\bfetch|\bhardware|\bcore\b|\bclock/, "cpu"],
    [/\bpixel|\bresolution|\bbitmap|\bcolou?r depth|\bsprite/, "pixelart"],
    [/\bimage|\bphoto|\bpicture|\bgraphic|\bvector/, "photo"],
    [/\bsound|\baudio|\bsample|\bmusic|\bfrequency/, "sound"],
    [/\bascii|\bunicode|\bcharacter|\bstrings?\b|\btext\b|\bfont/, "letters"],
    [/\binteger|\bfloat|\bnumber|\breal\b|\bboolean|\badd(ition)?\b|\bsum\b|\bcalculat|\bhexadecimal|\bhex\b|\bdenary/, "sums"],
    [/\bloop|\biterat|\brepeat|\bwhile\b|\bfor loop/, "loop"],
    [/\balgorithm|\bflow ?chart|\bsequence|\bselection|\bdecompos|\babstraction|\bif statement|\belse\b|\belif\b|\bsort/, "flow"],
    [/\bcode|\bpython|\bprogram|\bvariable|\bfunction|\bhtml|\bcss|\bscratch|\bsyntax|\bsoftware|\blogic error/, "codewin"],
    [/\bwi-?fi|\bwireless|\bbluetooth|\brouter/, "wifi"],
    [/\bserver|\bhost|\bcloud|\bclient/, "server"],
    [/\bnetwork|\blan\b|\bwan\b|\btopolog|\bpacket|\bswitch|\bhub\b|\bprotocol|\btcp\b/, "network"],
    [/\binternet|\bworld wide web|\bwww\b|\bwebsite|\bweb\b|\bbrowser|\bdns\b|\burl\b|\bhttps?\b|\bonline/, "globe"],
    [/\bsearch|\bfind\b|\blook up/, "lens"],
    [/\be-?mail|\bmessage|\bspam/, "mail"],
    [/\bfolder|\bfiles?\b|\bdirectory/, "folder"],
    [/\bkeyboard|\binput\b|\btyp(e|ing)\b/, "keyboard"],
    [/\bmouse|\bclick/, "mouse"],
    [/\blaptop|\bcomputer|\bmonitor|\bdesktop|\boutput\b|\bscreen/, "laptop"],
    [/\bphone|\bmobile|\btablet|\bapps?\b/, "phone"],
    [/\brobot|\bai\b|\bartificial|\bmachine learning/, "robot"],
    [/\bsetting|\boperating system|\butility|\bsystem/, "gear"],
    [/\bpeople|\busers?\b|\bsocial|\bfriend|\bcyberbull|\bstranger|\bperson/, "people"],
    [/\bimportant|\bremember|\bfast|\bspeed|\bpower|\belectric/, "spark"],
    [/\bidea\b|\bthink/, "bulb"]
  ];
  function guess(words){
    const t = String(words || "").toLowerCase();
    if (t.trim().length < 2) return "";
    const hit = GUESSES.find(g => g[0].test(t));
    if (hit) return hit[1];
    return pack() ? pack().guess(t) : "";
  }
  /* How long after the last key a picture is chosen. Chosen as they typed, it
     changed its mind at every word, and a card flickered through four. */
  const CHOOSE_MS = 2000;
  /* The icon a card shows: what they picked, nothing if they took it off,
     or one to go with the front, and failing that the back. */
  function cardIcon(x, a, z){
    if (x.i === "none") return "";
    if (x.i && known(x.i)) return x.i;
    /* one they picked, from a pack that has not arrived: wait for it rather
       than show them something else in its place */
    if (x.i) return "";
    return guess(x[a]) || guess(x[z]) || "";
  }
  /* All the pictures there are, under whatever was pressed. One at a time.
     `o.words` is what is on the card, for what to offer first; `o.hue` the
     colour they come in; `o.always` leaves out Choose for me and No picture,
     for a poster, where nothing chooses and nothing is an option already. */
  let openPicker = null;
  const FIRST = 90;             // as many as are drawn before scrolling asks for more
  function pickIcon(anchor, now, chosen, o){
    o = o || {};
    if (openPicker){ const same = openPicker.anchor === anchor; openPicker.close(); if (same) return; }
    const box = make("div", "rv-picker no-print");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Pick a picture");
    const find = make("input", "rv-picker-find");
    find.type = "search"; find.placeholder = "Search for a picture"; find.autocomplete = "off"; find.spellcheck = false;
    find.setAttribute("aria-label", "Search for a picture");
    find.setAttribute("enterkeyhint", "search");
    box.appendChild(find);
    if (!o.always){
      const top = make("div", "rv-picker-top");
      [["Choose for me", ""], ["No picture", "none"]].forEach(([said, name]) => {
        const on = (now || "") === name;
        const b = button("btn-ghost" + (on ? " on" : ""), said, () => done(name));
        b.setAttribute("aria-pressed", String(on));
        top.appendChild(b);
      });
      box.appendChild(top);
    }
    const said = make("p", "rv-picker-said");
    said.setAttribute("role", "status");
    box.appendChild(said);
    const grid = make("div", "rv-picker-grid");
    box.appendChild(grid);
    document.body.appendChild(box);
    const labelOf = (name) => { const st = stampOf(name); return st ? st.label : pack() ? pack().label(name) : name; };
    let list = [], drawn = 0;
    function more(){
      list.slice(drawn, drawn + FIRST).forEach(name => {
        const b = button("rv-picker-one" + (now === name ? " on" : ""), "", () => done(name));
        b.innerHTML = iconSvg(name, 34, o.hue);
        b.title = labelOf(name); b.setAttribute("aria-label", b.title);
        grid.appendChild(b);
      });
      drawn = Math.min(list.length, drawn + FIRST);
    }
    /* Nothing searched for: what goes with the card, then the computing ones,
       then everything else. */
    function fill(){
      const q = find.value.trim();
      const P = pack();
      if (q){
        list = P ? P.search(q, 300) : stamps().filter(st => st.label.toLowerCase().indexOf(q.toLowerCase()) >= 0).map(st => st.name);
        said.textContent = list.length ? list.length + (list.length === 1 ? " picture" : " pictures") + " for " + q
          : P && !P.ready() ? "Getting the pictures…" : "Nothing found for " + q + ". Try another word.";
      } else {
        const mine = P && o.words ? P.search(o.words, 12) : [];
        const own = stamps().slice().sort((m, n) => (n.group === "Computing") - (m.group === "Computing")).map(st => st.name);
        list = [...new Set(mine.concat(own, P ? P.all() : []))];
        said.textContent = mine.length ? "The first few go with your words" : "";
      }
      grid.innerHTML = ""; drawn = 0; grid.scrollTop = 0;
      more();
    }
    let findTimer = 0;
    find.addEventListener("input", () => { clearTimeout(findTimer); findTimer = setTimeout(fill, 140); });
    find.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      clearTimeout(findTimer); fill();
      if (find.value.trim() && list.length) done(list[0]);
    });
    /* An iPad's keyboard covers the bottom of the screen, and the list with it. */
    find.addEventListener("focus", () => { if (window.matchMedia("(pointer:coarse)").matches) box.style.top = "8px"; });
    grid.addEventListener("scroll", () => { if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 120 && drawn < list.length) more(); });
    fill();
    if (pack() && !pack().ready()) pack().when(() => { if (box.isConnected) fill(); });
    /* Again a moment later: opening it takes the keyboard away on an iPad,
       and the page slides back down from where that had pushed it. */
    const opened = Date.now();
    function place(){
      const r = anchor.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
      box.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - 10)) + "px";
      const under = r.bottom + 8, over = r.top - h - 8;
      box.style.top = Math.max(8, Math.min(innerHeight - h - 8, under + h < innerHeight - 8 ? under : over > 8 ? over : under)) + "px";
    }
    place();
    setTimeout(() => { if (box.isConnected && document.activeElement !== find) place(); }, 500);
    anim(box, [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], 160);
    function close(){
      box.remove();
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scrolled, true);
      openPicker = null;
    }
    function done(name){ close(); chosen(name); try{ anchor.focus({ preventScroll: true }); }catch(e){} }
    function away(e){ if (!box.contains(e.target) && !anchor.contains(e.target)) close(); }
    function key(e){ if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(); } }
    /* it is fixed to the screen, so it cannot follow the page scrolling away */
    function scrolled(e){
      /* the keyboard coming up for the search box moves the page behind */
      if (document.activeElement === find) return;
      if (e.target !== grid && !box.contains(e.target) && Date.now() - opened > 900) close();
    }
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scrolled, true);
    openPicker = { anchor, close };
    /* With a mouse the search box is ready to type in. On a touch screen that
       would bring the keyboard up over the pictures before they were seen. */
    if (!window.matchMedia("(pointer:coarse)").matches) find.focus({ preventScroll: true });
    else { const first = box.querySelector(".on") || box.querySelector("button"); if (first) first.focus({ preventScroll: true }); }
  }

  /* The drawing on each choice: the thing itself, small. */
  const KIND_ART = {
    cards: '<rect x="30" y="16" width="54" height="40" rx="6" class="a2" transform="rotate(9 57 36)"/><rect x="18" y="20" width="54" height="40" rx="6" class="a1"/><path d="M28 36h34M28 46h22" class="ln"/>',
    mindmap: '<path d="M50 40C34 40 34 20 22 20M50 40C66 40 66 20 78 20M50 40C34 40 34 62 22 62M50 40C66 40 66 62 78 62" class="ln"/><rect x="34" y="28" width="32" height="24" rx="9" class="a1"/><rect x="8" y="11" width="24" height="17" rx="6" class="a2"/><rect x="68" y="11" width="24" height="17" rx="6" class="a2"/><rect x="8" y="53" width="24" height="17" rx="6" class="a2"/><rect x="68" y="53" width="24" height="17" rx="6" class="a2"/>',
    poster: '<rect x="27" y="8" width="46" height="64" rx="4" class="a2"/><rect x="34" y="15" width="32" height="9" rx="2" class="a1"/><circle cx="50" cy="40" r="10" class="a1"/><path d="M36 57h28M36 64h20" class="ln"/>',
    quiz: '<path d="M16 14h52a7 7 0 0 1 7 7v28a7 7 0 0 1-7 7h-28l-14 13v-13h-10a7 7 0 0 1-7-7v-28a7 7 0 0 1 7-7z" class="a2"/><path d="M34 30a8 8 0 1 1 11 8c-3 1-4 3-4 6" class="ln thick"/><circle cx="41" cy="50" r="2.6" class="dot"/><circle cx="78" cy="56" r="15" class="a1"/><path d="M71 56l5 6l9-11" class="ln thick"/>',
    photo: '<path d="M14 24h16l6-9h28l6 9h16a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6h-72a6 6 0 0 1-6-6v-34a6 6 0 0 1 6-6z" class="a2"/><circle cx="50" cy="46" r="16" class="a1"/><circle cx="50" cy="46" r="7" class="a2"/>'
  };
  const kindArt = (k) => '<svg class="rv-art" viewBox="0 0 100 80" aria-hidden="true">' + KIND_ART[k] + '</svg>';

  /* --- photos --- */
  /* A photo of a page of handwriting. Longest side 1400px keeps pencil
     legible when the teacher zooms in. Colour is kept but turned down:
     a page of paper is mostly white with a few pens on it, and the
     strength of the colour is a big part of what a JPEG has to store.
     Measured on a made-up 12MP photo of a page of coloured-pen notes
     (noise and lighting added, 3.9MB from the "camera"): 141KB this way
     against 300KB as a full-colour 0.8 JPEG at the same size. Not yet
     measured on a real phone photo. */
  const PHOTO_SIDE = 1400;
  const PHOTO_BYTES = 260000;    // characters of data URL, about 190KB
  function squeezePhoto(file, cb){
    if (!file || !/^image\//.test(file.type || "")){ cb(null, "That file is not a picture. Try a different one."); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h){ cb(null, "That picture could not be opened."); return; }
      const r = Math.min(1, PHOTO_SIDE / Math.max(w, h));
      w = Math.round(w * r); h = Math.round(h * r);
      const c = make("canvas");
      c.width = w; c.height = h;
      const pen = c.getContext("2d");
      pen.fillStyle = "#FFFFFF";
      pen.fillRect(0, 0, w, h);
      pen.filter = "saturate(0.5)";
      pen.imageSmoothingQuality = "high";
      pen.drawImage(img, 0, 0, w, h);
      let out = c.toDataURL("image/jpeg", 0.6);
      for (const q of [0.5, 0.4, 0.3]) if (out.length > PHOTO_BYTES) out = c.toDataURL("image/jpeg", q);
      cb(out, null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); cb(null, "That picture could not be opened. Try taking it again."); };
    img.src = url;
  }
  /* A quarter turn of a photo already squeezed. The canvas has no filter
     this time: the colour was turned down once and doing it again would
     wash it out. */
  function turnPhoto(src, cb){
    const img = new Image();
    img.onload = () => {
      const c = make("canvas");
      c.width = img.naturalHeight; c.height = img.naturalWidth;
      const pen = c.getContext("2d");
      pen.translate(c.width, 0);
      pen.rotate(Math.PI / 2);
      pen.drawImage(img, 0, 0);
      cb(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => cb(src);
    img.src = src;
  }

  /* --- what a value holds --- */
  const cleanPairs = (list, a, b) => (Array.isArray(list) ? list : []).slice(0, MOST)
    .filter(x => x && typeof x === "object")
    .map(x => {
      const out = { [a]: String(x[a] || "").slice(0, WORDS), [b]: String(x[b] || "").slice(0, WORDS) };
      if (typeof x.i === "string" && x.i) out.i = x.i.slice(0, 20);
      return out;
    });
  /* The ones with something on both sides, which are the only ones a
     student can be tested on. */
  const fullPairs = (list, a, b) => cleanPairs(list, a, b).filter(x => x[a].trim() && x[b].trim());
  function cleanLook(look){
    const c = Number(look && look.c), p = look && look.p;
    return { c: Number.isInteger(c) && c >= 0 && c < HUES.length ? c : -1,
             p: PATTERNS.some(x => x[0] === p) ? p : "plain" };
  }
  const hueOf = (look, i) => HUES[look.c >= 0 ? look.c : i % HUES.length];
  function branchesOf(map){
    return (map && Array.isArray(map.nodes) ? map.nodes : []).filter(n => n && n.parent !== null && n.parent !== undefined && String(n.text || "").trim());
  }

  /* Words as they are compared: no capitals, no punctuation, one space. */
  const plain = (t) => " " + String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
  /* A key word counts in the plural too, and with its hyphen or without. */
  function says(text, word){
    const w = plain(word).trim();
    if (!w) return false;
    const t = plain(text);
    return t.includes(" " + w + " ") || t.includes(" " + w + "s ") || t.includes(" " + w + "es ") ||
           t.replace(/ /g, "").includes(w.replace(/ /g, "")) && w.includes(" ");
  }
  const wordsOf = (b) => (Array.isArray(b && b.words) ? b.words : []).map(w => String(w || "").trim()).filter(Boolean).slice(0, 30);

  window.reviseKit = {
    KINDS,
    squeezePhoto,
    /* What Test me runs on, and what the PDF prints. */
    items(v){
      if (!v || typeof v !== "object") return [];
      if (v.kind === "cards") return fullPairs(v.cards, "f", "b");
      if (v.kind === "quiz") return fullPairs(v.quiz, "q", "a");
      return [];
    },
    /* How many of whatever they made there are: 0 for a poster or a photo,
       which are not made of anything countable. */
    count(v){
      if (!v) return 0;
      return v.kind === "mindmap" ? branchesOf(v.map).length : this.items(v).length;
    },
    /* What the teacher asked for, or 0 for no number. */
    target(b, kind){
      const n = Math.round(Number(kind === "mindmap" ? b.branches : (kind === "cards" || kind === "quiz") ? b.target : 0) || 0);
      return Math.max(0, Math.min(MOST - 1, n));
    },
    /* Which of the teacher's key words are in it. Null where there is no
       telling, which is a photo, and a poster made before words were kept. */
    wordsUsed(b, v){
      const words = wordsOf(b);
      if (!words.length || !v || !v.kind || v.kind === "photo") return null;
      if (v.kind === "poster"){
        if (!Array.isArray(v.pwords)) return null;
        return words.filter(w => v.pwords.indexOf(w) >= 0);
      }
      const text = v.kind === "mindmap" ? (v.map && Array.isArray(v.map.nodes) ? v.map.nodes : []).map(n => n && n.text)
        : (v.kind === "quiz" ? v.quiz : v.cards || []) || [];
      const all = v.kind === "mindmap" ? text : text.reduce((out, x) => out.concat(x ? [x.f, x.b, x.q, x.a] : []), []);
      return words.filter(w => all.some(t => t && says(t, w)));
    },
    /* Can be revised from on screen. A photo cannot, which is why its
       revising is never counted. */
    canRevise(v){
      if (!v || typeof v !== "object") return false;
      if (v.kind === "cards" || v.kind === "quiz") return this.items(v).length > 0;
      if (v.kind === "mindmap") return branchesOf(v.map).length > 0;
      if (v.kind === "poster") return !!(v.poster && v.poster.img);
      return false;
    },
    /* The first few cards fanned out, for the finished screen. */
    fan(v){
      const box = make("div", "rv-fan");
      box.setAttribute("aria-hidden", "true");
      const look = cleanLook(v.look);
      if (v.kind === "cards" || v.kind === "quiz"){
        const a = v.kind === "quiz" ? "q" : "f", z = v.kind === "quiz" ? "a" : "b";
        const all = this.items(v), shown = all.slice(0, 3);
        shown.forEach((x, i) => {
          const c = make("div", "rv-fan-card rv-pat-" + look.p);
          c.style.setProperty("--rv", hueOf(look, i));
          c.style.transform = "rotate(" + (shown.length === 1 ? 0 : (i - (shown.length - 1) / 2) * 11) + "deg)";
          const pic = make("span", "rv-fan-icon");
          const drawPic = () => { const icon = cardIcon(x, a, z); if (icon) pic.innerHTML = iconSvg(icon, 34, hueOf(look, i)); };
          drawPic();
          if (pack() && !pack().ready()) pack().when(drawPic);
          c.appendChild(pic);
          c.appendChild(make("span", "", x[a].slice(0, 40)));
          box.appendChild(c);
          anim(c, [{ transform: "translateY(40px) rotate(0deg)", opacity: 0 }, { transform: c.style.transform, opacity: 1 }], 420, { delay: 120 * i, fill: "backwards" });
        });
      } else if (v.kind === "poster"){
        const im = make("img", "rv-fan-poster");
        im.src = v.poster.img; im.alt = "";
        box.appendChild(im);
      } else {
        const c = make("div", "rv-fan-art");
        c.style.setProperty("--rv", KIND_HUE[v.kind]);
        c.innerHTML = kindArt(v.kind);
        box.appendChild(c);
      }
      return box;
    },
    page: testPage
  };

  /* ===================================================================
     MAKING IT
     =================================================================== */
  const STARTERS = [
    ["What does ... mean?", "What does … mean?"],
    ["Why do we use ...?", "Why do we use …?"],
    ["Give an example of ...", "Give an example of …"],
    ["How are ... and ... different?", "How are … and … different?"]
  ];

  window.rRevise = function(b, ctx){
    const s = make("section", "revise");
    const allowed = ORDER.filter(k => !Array.isArray(b.kinds) || !b.kinds.length || b.kinds.indexOf(k) >= 0);
    const words = wordsOf(b);
    if (pack()) pack().load();
    let v = { kind: "", cards: [], quiz: [], map: null, poster: null, pwords: undefined, photos: [], look: cleanLook() };
    let sub = null;               // the mind map or poster drawn inside this task
    let meter = null;             // repaints the target and the key words
    let reached = false;          // the target, so it is cheered once and not at every key
    let undoTimer = 0;
    const changed = () => { if (meter) meter(); if (ctx && ctx.changed) ctx.changed(); };
    const tellKind = () => { if (ctx && ctx.kind) ctx.kind(v.kind); };

    /* The poster keeps its picture a moment after the last change, so it is
       taken before its editor is thrown away. */
    function takeSub(){
      if (!sub) return;
      if (sub.kind === "poster"){
        const got = sub.made.get();
        if (got) v.poster = got;
        if (got && words.length) v.pwords = posterWords();
      }
      if (sub.kind === "mindmap") v.map = sub.made.get();
    }
    /* A poster opened again is one picture. The words counted on it last
       time still are on it, until it is started again from nothing. */
    function posterWords(){
      const on = sub.made.texts();
      if (!sub.made.fresh()) sub.loaded = true;
      const old = sub.hadImg && !(sub.loaded && sub.made.fresh()) ? sub.was : [];
      return words.filter(w => old.indexOf(w) >= 0 || on.some(t => says(t, w)));
    }
    const value = () => { const x = Object.assign({}, v); if (sub && sub.kind === "mindmap") x.map = sub.made.get();
                          if (sub && sub.kind === "poster" && words.length) x.pwords = posterWords(); return x; };

    function paint(){
      takeSub();
      sub = null; meter = null;
      clearTimeout(undoTimer);
      if (openPicker) openPicker.close();
      if (!v.kind && allowed.length === 1) v.kind = allowed[0];
      s.innerHTML = "";
      s.style.setProperty("--rv", KIND_HUE[v.kind] || HUES[0]);
      s.dataset.kind = v.kind || "";
      tellKind();
      if (!v.kind){ paintChoice(); return; }
      paintTop();
      if (v.kind === "cards") paintPairs("cards", "f", "b", "Front", "Back", "Add a card");
      else if (v.kind === "quiz") paintPairs("quiz", "q", "a", "Question", "Answer", "Add a question");
      else if (v.kind === "photo") paintPhotos();
      else paintDrawn(v.kind);
      reached = false;
      if (meter) meter(true);
    }

    /* --- choosing --- */
    function paintChoice(){
      s.appendChild(make("p", "rv-ask", "What would you like to make?"));
      const grid = make("div", "rv-kinds");
      allowed.forEach((k, i) => {
        const btn = button("rv-pick", "", () => { v.kind = k; changed(); paint(); });
        btn.style.setProperty("--rv", KIND_HUE[k]);
        btn.innerHTML = kindArt(k);
        btn.appendChild(make("b", "", KINDS[k].name));
        btn.appendChild(make("span", "", KINDS[k].say));
        /* Work in the ones they are not using now is still there. */
        const n = k === "photo" ? v.photos.length : k === "poster" ? 0 : window.reviseKit.count(Object.assign({}, v, { kind: k }));
        if (n || (k === "poster" && v.poster))
          btn.appendChild(make("em", "rv-kept", k === "poster" ? "You have one started" : "You have " + n + " " + (n === 1 ? KINDS[k].one : KINDS[k].many)));
        const art = btn.querySelector(".rv-art");
        btn.addEventListener("pointerenter", () => anim(art, [{ transform: "none" }, { transform: "translateY(-5px) rotate(-4deg) scale(1.06)" }, { transform: "none" }], 420));
        grid.appendChild(btn);
        anim(btn, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], 300, { delay: i * 60, fill: "backwards" });
      });
      s.appendChild(grid);
    }

    /* --- the strip along the top of whichever it is --- */
    function paintTop(){
      const top = make("div", "rv-top");
      if (allowed.length > 1) top.appendChild(button("btn-ghost rv-back", "← Make something else", () => {
        v.kind = "";
        paint();               // first: what counts the old kind must be gone before anything is counted
        changed();
      }));
      const target = window.reviseKit.target(b, v.kind);
      const counts = v.kind === "cards" || v.kind === "quiz" || v.kind === "mindmap";
      let pips = null, said = null;
      if (counts){
        const how = make("div", "rv-how");
        if (target){
          pips = make("div", "rv-pips");
          for (let i = 0; i < Math.min(target, 20); i++){
            const p = make("i", "rv-pip");
            p.style.setProperty("--rv", HUES[i % HUES.length]);
            pips.appendChild(p);
          }
          how.appendChild(pips);
        }
        said = make("p", "rv-said");
        said.setAttribute("role", "status");
        how.appendChild(said);
        top.appendChild(how);
      }
      s.appendChild(top);

      let chips = [];
      if (words.length){
        const row = make("div", "rv-words");
        row.appendChild(make("span", "rv-words-head", v.kind === "photo" ? "Words to have on your page" : "Key words to use"));
        words.forEach(w => {
          const chip = v.kind === "photo" ? make("span", "rv-word", w) : button("rv-word", w, () => useWord(w));
          if (v.kind !== "photo") chip.title = "Press to use this word";
          row.appendChild(chip);
          chips.push(chip);
        });
        s.appendChild(row);
      }
      if (!counts && v.kind !== "poster") return;

      let last = -1, usedBefore = null;
      meter = (first) => {
        const val = value();
        if (said){
          const n = window.reviseKit.count(val), K = KINDS[v.kind];
          said.textContent = !target ? (n ? n + " " + (n === 1 ? K.one : K.many) + " so far" : "")
            : n >= target ? (n === target ? "That's all " + target + "! Add more if you like." : n + " " + K.many + ". Brilliant!")
            : n + " of " + target + " " + K.many + (n === 0 ? "" : n === target - 1 ? ". Nearly there!" : n < target / 2 ? ". Good start!" : ". Keep going!");
          if (pips){
            const lit = Math.floor(Math.min(1, n / target) * pips.children.length);
            [...pips.children].forEach((p, i) => {
              const on = i < lit, was = p.classList.contains("on");
              p.classList.toggle("on", on);
              if (on && !was && !first) anim(p, [{ transform: "scale(.4)" }, { transform: "scale(1.5)", offset: .5 }, { transform: "none" }], 380);
            });
            if (n >= target && !reached && !first && last >= 0 && last < target) burst(pips, 22);
          }
          if (target && n >= target) reached = true;
          s.classList.toggle("rv-reached", !!target && n >= target);
          last = n;
        }
        if (chips.length && v.kind !== "photo"){
          const used = window.reviseKit.wordsUsed(b, val) || [];
          chips.forEach((c, i) => {
            const on = used.indexOf(words[i]) >= 0;
            if (on && usedBefore && usedBefore.indexOf(words[i]) < 0) anim(c, [{ transform: "scale(1)" }, { transform: "scale(1.14)", offset: .4 }, { transform: "none" }], 320);
            c.classList.toggle("on", on);
            c.setAttribute("aria-label", words[i] + (on ? ", used" : ""));
          });
          if (usedBefore && used.length === words.length && usedBefore.length < words.length && !first) burst(chips[chips.length - 1], 14);
          usedBefore = used;
        }
      };
    }

    /* A key word pressed: somewhere to write about it. */
    let giveWord = null;
    function useWord(w){ if (giveWord) giveWord(w); }

    /* --- flashcards and quiz questions ---
       The same thing with different words on: two faces a row, the front
       in its colour and the back plain, as the card will be. */
    function paintPairs(key, a, z, aSaid, zSaid, addSaid){
      if (!v[key].length) v[key] = [{ [a]: "", [z]: "" }, { [a]: "", [z]: "" }];
      let lastFront = null;

      /* how it looks */
      const style = make("div", "rv-style");
      const styleBtn = button("btn-ghost rv-stylebtn", "", () => {
        panel.hidden = !panel.hidden;
        styleBtn.setAttribute("aria-expanded", String(!panel.hidden));
        if (!panel.hidden) anim(panel, [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], 180);
      });
      styleBtn.innerHTML = '<span class="rv-dots" aria-hidden="true">' + HUES.slice(0, 4).map(h => '<i style="background:' + h + '"></i>').join("") + '</span>Colours and patterns';
      styleBtn.setAttribute("aria-expanded", "false");
      const panel = make("div", "rv-stylepanel");
      panel.hidden = true;
      function paintStyle(){
        panel.innerHTML = "";
        const colours = make("div", "rv-swatches");
        const sw = (c, fill, label) => {
          const d = button("rv-swatch" + (v.look.c === c ? " on" : ""), "", () => { v.look.c = c; changed(); paintStyle(); recolour(); });
          d.style.background = fill; d.title = label; d.setAttribute("aria-label", label); d.setAttribute("aria-pressed", String(v.look.c === c));
          colours.appendChild(d);
        };
        sw(-1, "conic-gradient(" + HUES.join(",") + "," + HUES[0] + ")", "A different colour each");
        HUES.forEach((h, i) => sw(i, h, "All this colour"));
        panel.appendChild(colours);
        const pats = make("div", "rv-swatches");
        PATTERNS.forEach(([id, name]) => {
          const d = button("rv-patbtn rv-pat-" + id + (v.look.p === id ? " on" : ""), name, () => { v.look.p = id; changed(); paintStyle(); recolour(); });
          d.style.setProperty("--rv", hueOf(v.look, 0));
          d.setAttribute("aria-pressed", String(v.look.p === id));
          pats.appendChild(d);
        });
        panel.appendChild(pats);
      }
      paintStyle();

      /* something to write when the box is empty and so is the head */
      const starters = make("div", "rv-starters");
      starters.hidden = true;
      const startBtn = button("btn-ghost rv-startbtn", "Stuck? Get a start", () => {
        starters.hidden = !starters.hidden;
        startBtn.setAttribute("aria-expanded", String(!starters.hidden));
        if (!starters.hidden) anim(starters, [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], 180);
      });
      startBtn.setAttribute("aria-expanded", "false");
      STARTERS.forEach(([label, text]) => starters.appendChild(button("rv-starter", label, () => {
        const box = frontToFill();
        box.value = text;
        box.dispatchEvent(new Event("input"));
        const at = text.indexOf("…");
        box.focus(); box.setSelectionRange(at, at + 1);
      })));
      const tools = make("div", "rv-tools");
      tools.appendChild(startBtn); tools.appendChild(styleBtn);
      s.appendChild(tools);
      s.appendChild(starters);
      s.appendChild(panel);

      const list = make("ol", "rv-pairs");
      s.appendChild(list);
      const rows = [];
      function grow(box){
        box.style.height = "auto";
        if (box.scrollHeight) box.style.height = Math.max(72, box.scrollHeight + 2) + "px";
      }
      function recolour(){
        rows.forEach((r, i) => {
          r.li.style.setProperty("--rv", hueOf(v.look, i));
          PATTERNS.forEach(([id]) => r.front.classList.toggle("rv-pat-" + id, v.look.p === id));
          r.num.textContent = String(i + 1);
          r.paintIcon();                        // in the card's own colour
          r.boxA.setAttribute("aria-label", aSaid + " " + (i + 1));
          r.boxZ.setAttribute("aria-label", zSaid + " " + (i + 1));
          r.del.setAttribute("aria-label", "Remove " + KINDS[key].one + " " + (i + 1));
        });
      }
      function rowFor(item){
        const li = make("li", "rv-pair");
        const front = make("div", "rv-face rv-front"), back = make("div", "rv-face rv-backside");
        const num = make("span", "rv-num");
        const myHue = () => hueOf(v.look, Math.max(0, v[key].indexOf(item)));
        const iconBtn = button("rv-iconbtn", "", () => pickIcon(iconBtn, item.i || "", (name) => {
          if (name) item.i = name; else delete item.i;
          paintIcon(); changed();
        }, { words: item[a] + " " + item[z], hue: myHue() }));
        iconBtn.title = "Change the picture"; iconBtn.setAttribute("aria-label", "Change the picture");
        let shown, chooseTimer = 0;
        /* Typing only starts the wait again. What is there stays until then. */
        function chooseSoon(){
          if (item.i) return;
          clearTimeout(chooseTimer);
          iconBtn.classList.add("is-waiting");
          chooseTimer = setTimeout(() => { iconBtn.classList.remove("is-waiting"); paintIcon(); }, CHOOSE_MS);
        }
        function paintIcon(){
          clearTimeout(chooseTimer);
          iconBtn.classList.remove("is-waiting");
          const name = cardIcon(item, a, z), hue = myHue();
          if (shown === name + hue) return;
          const first = shown === undefined || shown.indexOf(name) === 0;
          shown = name + hue;
          iconBtn.innerHTML = name ? iconSvg(name, 40, hue)
            : item.i === "none" ? '<span class="rv-noicon" aria-hidden="true"></span>'
            : '<span class="rv-addicon" aria-hidden="true">+</span>';
          iconBtn.title = item.i === "none" ? "No picture. Press to choose one" : "Change the picture";
          iconBtn.classList.toggle("is-empty", !name);
          if (!first && name) anim(iconBtn.firstChild, [{ transform: "scale(.2) rotate(-25deg)" }, { transform: "scale(1.2) rotate(6deg)", offset: .6 }, { transform: "none" }], 420);
        }
        const boxA = make("textarea", "rv-in"), boxZ = make("textarea", "rv-in");
        [boxA, boxZ].forEach(x => { x.rows = 2; x.maxLength = WORDS; x.spellcheck = true; });
        boxA.placeholder = key === "quiz" ? "Write your question" : "A word or a question";
        boxZ.placeholder = key === "quiz" ? "Write the answer" : "What it means, in your own words";
        boxA.value = item[a]; boxZ.value = item[z];
        const nudge = make("p", "rv-nudge", "That is a lot to learn. Can you say it in one short sentence?");
        nudge.hidden = true;
        const look = () => { nudge.hidden = boxZ.value.trim().length <= LONG; };
        boxA.addEventListener("input", () => { item[a] = boxA.value; grow(boxA); chooseSoon(); changed(); });
        boxZ.addEventListener("input", () => { item[z] = boxZ.value; grow(boxZ); chooseSoon(); look(); changed(); });
        boxA.addEventListener("focus", () => { lastFront = boxA; });
        /* Enter moves on, as it does in the mind map, so a deck can be typed
           without reaching for the mouse. Shift and Enter is a new line. */
        boxA.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); boxZ.focus(); } });
        boxZ.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
          e.preventDefault();
          const next = rows[rows.findIndex(r => r.item === item) + 1];
          if (next) next.boxA.focus(); else addRow();
        });
        const del = button("btn-ghost iconbtn rv-del", "✕", () => removeRow(item));
        del.title = "Remove this one";
        front.appendChild(num); front.appendChild(iconBtn); front.appendChild(make("span", "rv-label", aSaid)); front.appendChild(boxA);
        back.appendChild(make("span", "rv-label", zSaid)); back.appendChild(boxZ); back.appendChild(nudge);
        li.appendChild(front); li.appendChild(back); li.appendChild(del);
        const r = { item, li, front, num, boxA, boxZ, del, paintIcon };
        paintIcon(); look();
        if (pack() && !pack().ready()) pack().when(() => { if (li.isConnected) paintIcon(); });
        requestAnimationFrame(() => { grow(boxA); grow(boxZ); });
        return r;
      }
      function frontToFill(){
        const bare = lastFront && rows.some(r => r.boxA === lastFront) && !lastFront.value.trim() ? lastFront : null;
        const row = rows.find(r => !r.boxA.value.trim());
        return bare || (row && row.boxA) || addRow().boxA;
      }
      function addRow(){
        if (v[key].length >= MOST) return rows[rows.length - 1];
        const item = { [a]: "", [z]: "" };
        v[key].push(item);
        const r = rowFor(item);
        rows.push(r);
        list.appendChild(r.li);
        recolour(); paintAdd(); changed();
        anim(r.li, [{ opacity: 0, transform: "translateY(-18px) rotate(-2deg)" }, { opacity: 1, transform: "none" }], 320);
        r.boxA.focus();
        return r;
      }
      function removeRow(item){
        const at = v[key].indexOf(item);
        if (at < 0) return;
        const r = rows[at];
        v[key].splice(at, 1); rows.splice(at, 1);
        const gone = () => r.li.remove();
        const flight = anim(r.li, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(40px) rotate(3deg)" }], 200, { easing: "ease-in" });
        if (flight) setTimeout(gone, 190); else gone();
        recolour(); paintAdd(); changed();
        /* Nothing to bring back from a card with nothing on it. */
        if (!item[a].trim() && !item[z].trim()) return;
        undo.hidden = false;
        undoSaid.textContent = (key === "quiz" ? "Question" : "Card") + " removed.";
        undoBtn.onclick = () => {
          undo.hidden = true;
          v[key].splice(Math.min(at, v[key].length), 0, item);
          const back = rowFor(item);
          const before = rows[at];
          rows.splice(Math.min(at, rows.length), 0, back);
          list.insertBefore(back.li, before ? before.li : null);
          recolour(); paintAdd(); changed();
          anim(back.li, [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], 260);
          back.boxA.focus();
        };
        clearTimeout(undoTimer);
        undoTimer = setTimeout(() => { undo.hidden = true; }, 10000);
      }
      const undo = make("div", "rv-undo");
      undo.setAttribute("role", "status");
      undo.hidden = true;
      const undoSaid = make("span", "");
      const undoBtn = button("btn-ghost", "Undo");
      undo.appendChild(undoSaid); undo.appendChild(undoBtn);
      const addBtn = button("rv-add", "", () => addRow());
      addBtn.innerHTML = '<span aria-hidden="true">+</span> ' + addSaid;
      function paintAdd(){ addBtn.hidden = v[key].length >= MOST; }
      v[key].forEach(item => { const r = rowFor(item); rows.push(r); list.appendChild(r.li); });
      recolour(); paintAdd();
      s.appendChild(undo);
      s.appendChild(addBtn);
      s.appendChild(make("p", "rv-small", "Press Enter to go to the next box."));

      giveWord = (w) => {
        const there = rows.find(r => says(r.boxA.value, w));
        if (there){ there.boxZ.focus(); return; }
        const box = frontToFill();
        box.value = key === "quiz" ? "What does " + w + " mean?" : w;
        box.dispatchEvent(new Event("input"));
        const row = rows.find(r => r.boxA === box);
        anim(row.front, [{ transform: "scale(1)" }, { transform: "scale(1.03)", offset: .4 }, { transform: "none" }], 260);
        row.boxZ.focus();
      };
    }

    /* The lesson's own mind map and poster, drawn inside this task with
       this task's part of the value. */
    function paintDrawn(kind){
      const inner = { type: kind, id: b.id + "_" + kind, title: "", task: "", icons: kind === "mindmap",
                      centre: kind === "mindmap" ? (b.title || "") : undefined,
                      heading: kind === "poster" ? (b.title || "") : undefined };
      const build = kind === "mindmap" ? window.rMindmap : window.rPoster;
      const had = kind === "mindmap" ? v.map : v.poster;
      const made = build(inner, { changed(){
        if (kind === "mindmap") v.map = made.get();
        else { const got = made.get(); if (got){ v.poster = got; if (words.length && sub) v.pwords = posterWords(); } }
        changed();
      }, icon: guess, iconSvg, pickIcon, chooseMs: CHOOSE_MS, assessment: ctx && ctx.assessment });
      if (kind === "mindmap" && pack() && !pack().ready()) pack().when(() => { if (made.section.isConnected) made.repaintIcons(); });
      sub = { kind, made, hadImg: !!had, was: Array.isArray(v.pwords) ? v.pwords : [], loaded: false };
      if (had) made.set(had);
      s.appendChild(made.section);
      giveWord = (w) => { if (kind === "mindmap") made.addBranch(w); else { made.addWords(w); if (meter) meter(); } };
    }

    function paintPhotos(){
      s.appendChild(make("p", "rv-ask", v.photos.length ? "Your photos" : "Take a photo of your revision resource"));
      if (v.binned && !v.photos.length)
        s.appendChild(make("p", "rv-note", "Your teacher has looked at your photos and cleared them away."));
      const grid = make("div", "rv-photos");
      v.photos.forEach((src, i) => {
        const fig = make("figure", "rv-photo");
        const im = make("img");
        im.src = src; im.alt = "Photo " + (i + 1) + " of your revision resource";
        fig.appendChild(im);
        const tools = make("div", "rv-photo-tools");
        const turn = button("btn-ghost", "↻ Turn", () => turnPhoto(src, (out) => { v.photos[i] = out; changed(); paint(); }));
        turn.title = "Turn it round a quarter";
        tools.appendChild(turn);
        tools.appendChild(button("btn-ghost", "✕ Remove", () => { v.photos.splice(i, 1); changed(); paint(); }));
        fig.appendChild(tools);
        grid.appendChild(fig);
      });
      s.appendChild(grid);
      const msg = make("p", "rv-note");
      msg.setAttribute("role", "status");
      msg.hidden = true;
      if (v.photos.length < PHOTO_MOST){
        /* accept="image/*" and no capture attribute: a phone then offers
           the camera and the photo library both, and a computer the
           Pictures folder. */
        const input = make("input");
        input.type = "file"; input.accept = "image/*"; input.multiple = true; input.hidden = true;
        const take = button("btn-primary rv-take", v.photos.length ? "+ Add another photo" : "Take or choose a photo", () => input.click());
        input.addEventListener("change", () => {
          const files = [...(input.files || [])].slice(0, PHOTO_MOST - v.photos.length);
          if (!files.length) return;
          take.disabled = true; take.textContent = "Getting it ready…";
          let left = files.length;
          files.forEach(f => squeezePhoto(f, (out, err) => {
            if (out && v.photos.length < PHOTO_MOST){ v.photos.push(out); v.binned = undefined; }
            if (err){ msg.textContent = err; msg.hidden = false; }
            if (--left === 0){ changed(); paint(); if (err){ const m = s.querySelector(".rv-photos + .rv-note"); if (m){ m.textContent = err; m.hidden = false; } } }
          }));
        });
        s.appendChild(msg);
        s.appendChild(take);
        s.appendChild(input);
        s.appendChild(make("p", "rv-small", "Up to " + PHOTO_MOST + " photos. Make sure all your writing is in the picture and easy to read."));
      } else {
        s.appendChild(msg);
        s.appendChild(make("p", "rv-small", "That's the most photos you can add. Remove one to take it again."));
      }
    }

    paint();
    return {
      section: s,
      kind: () => v.kind,
      get: () => {
        takeSub();
        const out = { kind: v.kind || "" };
        if (v.cards.length) out.cards = cleanPairs(v.cards, "f", "b");
        if (v.quiz.length) out.quiz = cleanPairs(v.quiz, "q", "a");
        if (v.map) out.map = v.map;
        if (v.poster) out.poster = v.poster;
        if (v.poster && Array.isArray(v.pwords)) out.pwords = v.pwords;
        if (v.photos.length) out.photos = v.photos.slice(0, PHOTO_MOST);
        if (v.binned) out.binned = v.binned;
        if (v.look.c >= 0 || v.look.p !== "plain") out.look = { c: v.look.c, p: v.look.p };
        return out;
      },
      set: (val) => {
        if (!val || typeof val !== "object") return;
        sub = null;               // what is on screen is about to be replaced, not kept
        v = {
          kind: KINDS[val.kind] ? val.kind : "",
          cards: cleanPairs(val.cards, "f", "b"),
          quiz: cleanPairs(val.quiz, "q", "a"),
          map: val.map && typeof val.map === "object" ? val.map : null,
          poster: val.poster && typeof val.poster === "object" ? val.poster : null,
          pwords: Array.isArray(val.pwords) ? val.pwords.map(String) : undefined,
          photos: (Array.isArray(val.photos) ? val.photos : []).filter(p => typeof p === "string" && /^data:image\//.test(p)).slice(0, PHOTO_MOST),
          binned: typeof val.binned === "string" ? val.binned : undefined,
          look: cleanLook(val.look)
        };
        paint();
      },
      /* Handed in once there is something of the kind they chose, however
         little: the target is encouragement and never a gate. A photo that a
         teacher has already cleared away still counts: they did it. */
      done: () => {
        takeSub();
        if (v.kind === "photo") return v.photos.length > 0 || !!v.binned;
        return window.reviseKit.canRevise(v);
      }
    };
  };

  /* ===================================================================
     TESTING THEMSELVES
     A page of its own. Nothing in here is saved: it is practice, and the
     only thing anyone learns from it is that it was started (onStart, which
     the lesson page counts).
     =================================================================== */
  function testPage(b, v, o){
    const page = make("section", "rv-test");
    const look = cleanLook(v.look);
    const K = KINDS[v.kind];
    page.style.setProperty("--rv", KIND_HUE[v.kind]);
    const head = make("div", "rv-test-head");
    head.appendChild(button("btn-ghost rv-test-back", "← " + o.backSaid, o.back));
    const name = make("div", "rv-test-name");
    name.innerHTML = kindArt(v.kind);
    const h = make("h2", "", (b && b.title) || "Your " + K.name.toLowerCase());
    name.appendChild(h);
    head.appendChild(name);
    page.appendChild(head);
    const tabs = make("div", "rv-modes");
    const stage = make("div", "rv-stage");
    const started = () => { if (o.onStart) try{ o.onStart(); }catch(e){} };
    let leave = null;              // stops whatever the last way of testing had running
    const go = (modes, i) => {
      if (leave){ leave(); leave = null; }
      [...tabs.children].forEach((t, n) => { t.classList.toggle("on", n === i); t.setAttribute("aria-pressed", String(n === i)); });
      stage.innerHTML = "";
      started();
      leave = modes[i][1]() || null;
    };
    const items = window.reviseKit.items(v);
    const a = v.kind === "quiz" ? "q" : "f", z = v.kind === "quiz" ? "a" : "b";
    const deck = items.map((x, i) => ({ front: x[a], back: x[z], get icon(){ return cardIcon(x, a, z); }, hue: hueOf(look, i), pat: look.p }));
    const modes = v.kind === "cards" ? [["Flip the cards", () => flipGame(stage, deck, started)]]
      : v.kind === "quiz" ? [["Type the answers", () => typeGame(stage, deck, started)]]
      : v.kind === "mindmap" ? [["Cover it up", () => mapTest(stage, b, v)]]
      : [["Cover it up", () => posterTest(stage, v)]];
    /* Two cards match themselves: with one left there is only one answer. */
    if (deck.length >= 3) modes.push(["Match them up", () => matchGame(stage, deck, started)]);
    if (modes.length > 1){
      modes.forEach((m, i) => tabs.appendChild(button("rv-mode", m[0], () => go(modes, i))));
      page.appendChild(tabs);
    }
    page.appendChild(stage);
    /* after it is on the page: a mind map has to be measured */
    page.start = () => {
      if (pack()) pack().load().then(() => { if (page.isConnected) go(modes, 0); }); else go(modes, 0);
    };
    page.stop = () => { if (leave) leave(); leave = null; };
    return page;
  }
  function shuffle(list){
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  const SMALL = (n) => n + (n === 1 ? " to go" : " still to learn");

  /* How far through: a pip for each card, filled once it is known, and how
     many in a row have been. Shared by the two that go through a deck. */
  function scoreBar(total){
    const box = make("div", "rv-score");
    const pips = make("div", "rv-pips");
    const some = Math.min(total, 30);
    for (let i = 0; i < some; i++) pips.appendChild(make("i", "rv-pip"));
    const left = make("span", "rv-left"), run = make("span", "rv-run");
    run.hidden = true;
    left.setAttribute("role", "status");
    const row = make("div", "rv-score-row");
    row.appendChild(left); row.appendChild(run);
    box.appendChild(pips); box.appendChild(row);
    let streak = 0;
    return { el: box,
      show(known, right){
        const lit = Math.floor(known / total * some);
        [...pips.children].forEach((p, i) => {
          const on = i < lit;
          if (on && !p.classList.contains("on")) anim(p, [{ transform: "scale(.4)" }, { transform: "scale(1.6)", offset: .5 }, { transform: "none" }], 360);
          p.classList.toggle("on", on);
        });
        left.textContent = SMALL(total - known);
        if (right === true) streak++; else if (right === false) streak = 0;
        run.hidden = streak < 2;
        if (streak >= 2){
          run.innerHTML = iconSvg("spark", 20);
          run.appendChild(document.createTextNode(" " + streak + " in a row!"));
          if (right) anim(run, [{ transform: "scale(.7)" }, { transform: "scale(1.2)", offset: .5 }, { transform: "none" }], 320);
        }
      } };
  }
  /* The end of a round: one to three stars, and another go. */
  function finishCard(stage, known, total, again, words){
    stage.innerHTML = "";
    const box = make("div", "rv-finish");
    const share = known / total, stars = share >= 1 ? 3 : share >= .6 ? 2 : 1;
    const row = make("div", "rv-stars");
    row.setAttribute("role", "img");
    row.setAttribute("aria-label", stars + (stars === 1 ? " star" : " stars") + " out of 3");
    for (let i = 0; i < 3; i++){
      const st = make("span", "rv-star" + (i < stars ? "" : " off"));
      st.innerHTML = iconSvg("star", 72);
      row.appendChild(st);
      if (i < stars) anim(st, [{ transform: "scale(0) rotate(-60deg)", opacity: 0 }, { transform: "scale(1.25) rotate(8deg)", opacity: 1, offset: .7 }, { transform: "none" }], 520, { delay: 160 + i * 200, fill: "backwards" });
    }
    box.appendChild(row);
    box.appendChild(make("h3", "", stars === 3 ? "You know them all!" : stars === 2 ? "Nearly there!" : "Good start!"));
    box.appendChild(make("p", "", words));
    const btn = button("btn-primary rv-again", "Go again", again);
    box.appendChild(btn);
    stage.appendChild(box);
    if (stars === 3) setTimeout(() => { if (row.isConnected) burst(row, 34); }, still() ? 0 : 700);
    btn.focus({ preventScroll: true });
  }

  function face(card, cls, words, label){
    const f = make("div", "rv-cardface " + cls);
    f.appendChild(make("span", "rv-label", label));
    if (card.icon){ const i = make("span", "rv-cardicon"); i.innerHTML = iconSvg(card.icon, 84, card.hue); f.appendChild(i); }
    const t = make("p", "rv-cardwords" + (words.length > 110 ? " is-long" : ""), words);
    f.appendChild(t);
    return f;
  }

  /* --- flip: front first. "Not yet" puts it back at the bottom, so a round
     finishes once every card has been known. */
  function flipGame(stage, deck, started){
    let queue, missed, known, busy, current, flipped, stopped = false;
    const score = { el: null, show(){} };
    const pile = make("div", "rv-pile");
    /* Turned edge on and back, with the words changed while it is edge on.
       Two faces back to back in 3D is the usual way, and it is the one part
       of CSS Safari on an iPad still gets wrong inside something that
       scrolls: the back shows through, or neither side does. */
    const card = button("rv-flip", "");
    const moves = make("div", "rv-moves");
    const turn = button("btn-primary rv-big", "Turn it over", () => flip());
    const no = button("rv-answer rv-no", "Not yet", () => answer(false));
    const yes = button("rv-answer rv-yes", "I knew it", () => answer(true));
    [no, turn, yes].forEach(x => moves.appendChild(x));
    card.addEventListener("click", () => flip());
    function start(){
      queue = shuffle(deck.map((_, i) => i)); missed = new Set(); known = 0; busy = false;
      stage.innerHTML = "";
      Object.assign(score, scoreBar(deck.length));
      stage.appendChild(score.el); stage.appendChild(pile); stage.appendChild(moves);
      score.show(0);
      next();
    }
    function next(){
      if (!queue.length){
        const first = deck.length - missed.size;
        finishCard(stage, first, deck.length, () => { started(); start(); },
          "You knew " + first + " of " + deck.length + " first time.");
        return;
      }
      current = queue.shift();
      flipped = false;
      const c = deck[current];
      card.style.setProperty("--rv", c.hue);
      show("front");
      pile.innerHTML = "";
      /* the ones still to come, peeping out from behind */
      for (let i = Math.min(2, queue.length); i > 0; i--){
        const under = make("div", "rv-under");
        under.style.transform = "translateY(" + (i * 9) + "px) scale(" + (1 - i * 0.035) + ")";
        under.style.setProperty("--rv", deck[queue[i - 1]].hue);
        pile.appendChild(under);
      }
      pile.appendChild(card);
      anim(card, [{ transform: "translateY(16px) scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }], 260);
      turn.hidden = false; yes.hidden = no.hidden = true;
      turn.focus({ preventScroll: true });
    }
    async function flip(){
      if (busy) return;
      busy = true;
      flipped = !flipped;
      const was = current;
      anim(card, [{ transform: "scaleX(1)" }, { transform: "scaleX(.02) translateY(-8px)" }], 150, { easing: "ease-in" });
      await wait(145);
      if (stopped || current !== was || !card.isConnected) return;
      show(flipped ? "back" : "front");
      anim(card, [{ transform: "scaleX(.02) translateY(-8px)" }, { transform: "scaleX(1.03)", offset: .7 }, { transform: "scaleX(1)" }], 230);
      busy = false;
      /* once it has been turned over, the two answers stay, whichever way up
         it is turned after that */
      turn.hidden = true; yes.hidden = no.hidden = false;
      if (flipped) yes.focus({ preventScroll: true });
    }
    function show(side){
      const c = deck[current];
      card.innerHTML = "";
      card.appendChild(side === "front" ? face(c, "is-front rv-pat-" + c.pat, c.front, "Front")
                                        : face({ icon: "" }, "is-back", c.back, "Back"));
      card.setAttribute("aria-label", side === "front" ? "Front: " + c.front + ". Press to turn it over" : "Back: " + c.back);
    }
    async function answer(right){
      if (busy) return;
      busy = true;
      if (right) known++; else { missed.add(current); queue.push(current); }
      score.show(known, right);
      if (right) burst(yes, 8);
      anim(card, [{ transform: "translateX(0)", opacity: 1 },
                  { transform: "translateX(" + (right ? 130 : -130) + "px) rotate(" + (right ? 9 : -9) + "deg)", opacity: 0 }], 240, { easing: "ease-in", fill: "forwards" });
      await wait(230);
      if (stopped) return;
      card.getAnimations && card.getAnimations().forEach(x => x.cancel());
      busy = false;
      next();
    }
    start();
    return () => { stopped = true; };
  }

  /* --- type: write it without looking, then see the two side by side. One
     that matches is right; anything else is theirs to judge, because a
     sentence in other words can be every bit as right. */
  function typeGame(stage, deck, started){
    let queue, missed, known, current, stopped = false;
    let score = null;
    function start(){
      queue = shuffle(deck.map((_, i) => i)); missed = new Set(); known = 0;
      stage.innerHTML = "";
      score = scoreBar(deck.length);
      stage.appendChild(score.el);
      score.show(0);
      stage.appendChild(box);
      next();
    }
    const box = make("div", "rv-ask-card");
    function next(){
      if (!queue.length){
        const first = deck.length - missed.size;
        finishCard(stage, first, deck.length, () => { started(); start(); },
          "You got " + first + " of " + deck.length + " first time.");
        return;
      }
      current = queue.shift();
      const c = deck[current];
      box.innerHTML = "";
      box.style.setProperty("--rv", c.hue);
      const q = make("div", "rv-q rv-pat-" + c.pat);
      if (c.icon){ const i = make("span", "rv-cardicon"); i.innerHTML = iconSvg(c.icon, 72, c.hue); q.appendChild(i); }
      q.appendChild(make("p", "rv-cardwords" + (c.front.length > 110 ? " is-long" : ""), c.front));
      box.appendChild(q);
      const input = make("textarea", "rv-in rv-typed");
      input.rows = 2; input.maxLength = WORDS; input.placeholder = "Type your answer"; input.setAttribute("aria-label", "Your answer");
      input.autocomplete = "off";
      const row = make("div", "rv-moves");
      const dunno = button("rv-answer rv-no", "I don't know", () => reveal(true));
      const check = button("btn-primary rv-big", "Check", () => { if (input.value.trim()) reveal(false); else { anim(input, [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "none" }], 260); input.focus(); } });
      row.appendChild(dunno); row.appendChild(check);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); check.click(); } });
      box.appendChild(input); box.appendChild(row);
      anim(box, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], 260);
      input.focus({ preventScroll: true });
      function reveal(gaveUp){
        const given = input.value.trim();
        const same = !gaveUp && !!(window.shortAnswer && window.shortAnswer.mark({ answers: [c.back] }, given).ok);
        input.remove(); row.remove();
        const two = make("div", "rv-two-answers");
        if (given){
          const mine = make("div", "rv-said-box" + (same ? " is-right" : ""));
          mine.appendChild(make("span", "rv-label", "You wrote"));
          mine.appendChild(make("p", "", given));
          two.appendChild(mine);
        }
        const real = make("div", "rv-said-box is-real");
        real.appendChild(make("span", "rv-label", "Your answer"));
        real.appendChild(make("p", "", c.back));
        real.querySelector(".rv-label").textContent = "The answer on your card";
        two.appendChild(real);
        box.appendChild(two);
        anim(two, [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], 240);
        const end = make("div", "rv-moves");
        if (same){
          settle(true);
          box.insertBefore(make("p", "rv-spot", "Spot on!"), two);
          burst(two, 16);
          const on = button("btn-primary rv-big", queue.length ? "Next question" : "Finish", next);
          end.appendChild(on);
          box.appendChild(end);
          on.focus({ preventScroll: true });
          return;
        }
        const no = button("rv-answer rv-no", gaveUp ? "Try it again later" : "Not yet", () => { settle(false); next(); });
        end.appendChild(no);
        if (!gaveUp){
          box.appendChild(make("p", "rv-judge", "Does yours mean the same?"));
          end.appendChild(button("rv-answer rv-yes", "Yes, I got it", (e) => { settle(true); burst(e.currentTarget, 10); next(); }));
        }
        box.appendChild(end);
        (gaveUp ? no : end.lastChild).focus({ preventScroll: true });
      }
    }
    function settle(right){
      if (stopped) return;
      if (right) known++; else { missed.add(current); queue.push(current); }
      score.show(known, right);
    }
    start();
    return () => { stopped = true; };
  }

  /* --- match: every front and every back, mixed up, against a clock that
     counts up. Six pairs is as many as a phone shows without scrolling. */
  function matchGame(stage, deck, started){
    const PAIRS = 6;
    let clock = 0;
    function start(){
      clearInterval(clock);
      stage.innerHTML = "";
      const some = shuffle(deck).slice(0, PAIRS);
      const top = make("div", "rv-score-row rv-match-top");
      const left = make("span", "rv-left"), time = make("span", "rv-run");
      top.appendChild(left); top.appendChild(time);
      const grid = make("div", "rv-match");
      stage.appendChild(top); stage.appendChild(grid);
      const t0 = Date.now();
      let first = null, matched = 0, slips = 0;
      const tick = () => { const n = Math.floor((Date.now() - t0) / 1000); time.textContent = n + (n === 1 ? " second" : " seconds"); };
      tick(); clock = setInterval(tick, 500);
      const say = () => { left.textContent = matched + " of " + some.length + " matched"; };
      say();
      const tiles = shuffle(some.reduce((out, c) => out.concat([{ c, side: "front" }, { c, side: "back" }]), []));
      tiles.forEach((t, i) => {
        const btn = button("rv-tile is-" + t.side + (t.c[t.side].length > 60 ? " is-long" : ""), "", () => press(t, btn));
        if (t.side === "front" && t.c.icon) btn.innerHTML = iconSvg(t.c.icon, 34, t.c.hue);
        btn.appendChild(make("span", "", t.c[t.side]));
        t.btn = btn;
        grid.appendChild(btn);
        anim(btn, [{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "none" }], 260, { delay: i * 35, fill: "backwards" });
      });
      function press(t, btn){
        if (btn.disabled) return;
        if (first === t){ first = null; btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false"); return; }
        if (!first || first.side === t.side){
          if (first){ first.btn.classList.remove("on"); first.btn.setAttribute("aria-pressed", "false"); }
          first = t;
          btn.classList.add("on");
          btn.setAttribute("aria-pressed", "true");
          anim(btn, [{ transform: "scale(1)" }, { transform: "scale(1.05)", offset: .4 }, { transform: "none" }], 180);
          return;
        }
        const was = first;
        first = null;
        was.btn.classList.remove("on");
        /* By the words and not by the card: two cards with the same answer
           on are both right for either. */
        const fr = t.side === "front" ? t : was, bk = t.side === "front" ? was : t;
        const good = fr.c === bk.c || some.some(c => c.front === fr.c.front && c.back === bk.c.back);
        if (!good){
          slips++;
          [was.btn, btn].forEach(x => {
            x.classList.add("wrong");
            anim(x, [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "none" }], 280);
            setTimeout(() => x.classList.remove("wrong"), 600);
          });
          return;
        }
        matched++;
        [was.btn, btn].forEach(x => {
          x.disabled = true;
          x.classList.add("gone");
          burst(x, 7);
          anim(x, [{ transform: "none", opacity: 1 }, { transform: "scale(1.08)", opacity: 1, offset: .4 }, { transform: "scale(.5)", opacity: 0 }], 340, { fill: "forwards", easing: "ease-in" });
        });
        say();
        if (matched < some.length) return;
        clearInterval(clock);
        const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
        setTimeout(() => {
          if (!grid.isConnected) return;
          finishCard(stage, Math.max(0, some.length - slips), some.length, () => { started(); start(); },
            some.length + " pairs in " + secs + (secs === 1 ? " second" : " seconds") +
            (slips ? ", with " + slips + (slips === 1 ? " slip." : " slips.") : ", with no slips."));
        }, still() ? 0 : 420);
      }
    }
    start();
    return () => clearInterval(clock);
  }

  /* --- a mind map or poster with its details covered, to be said out loud
     before they are looked at --- */
  function coverButton(btn, done){
    const flight = anim(btn, [{ transform: "none", opacity: 1 }, { transform: "rotateX(90deg)", opacity: 0 }], 220, { easing: "ease-in", fill: "forwards" });
    if (flight) setTimeout(done, 210); else done();
  }
  function mapTest(stage, b, v){
    const bar = make("div", "rv-cover-bar");
    const said = make("p", "rv-left");
    said.setAttribute("role", "status");
    const toggle = button("btn-primary", "Cover it up", () => { if (covers.length) uncoverAll(); else cover(); });
    bar.appendChild(said); bar.appendChild(toggle);
    stage.appendChild(bar);
    const made = window.rMindmap({ type: "mindmap", centre: (b && b.title) || "", readOnly: true, icons: true },
                                 { changed(){}, icon: guess, iconSvg, pickIcon(){} });
    made.set(v.map);
    stage.appendChild(made.section);
    let covers = [], total = 0;
    function paint(){
      const n = total - covers.length;
      said.textContent = covers.length ? "Say what is under each one, then press it to check."
        : total ? "That's all " + total + " uncovered!" : "Look it over, then cover it up and see what you remember.";
      toggle.textContent = covers.length ? "Uncover them all" : "Cover it up";
      if (total && n === total) burst(toggle, 16);
    }
    function cover(){
      total = 0;
      let further = 0;
      made.each((wrap, depth, n) => { if (depth > 1 && String(n.text).trim()) further++; });
      made.each((wrap, depth, n) => {
        /* the first branches stay, to say what is being asked for, unless
           there is next to nothing beyond them to ask */
        if (!String(n.text).trim() || (further > 2 && depth === 1)) return;
        total++;
        const c = button("rv-cover", "?", () => coverButton(c, () => {
          c.remove(); covers = covers.filter(x => x !== c); paint();
        }));
        c.setAttribute("aria-label", "Covered. Press to see it");
        wrap.appendChild(c);
        covers.push(c);
        anim(c, [{ transform: "rotateX(90deg)" }, { transform: "none" }], 240, { delay: Math.min(400, total * 25), fill: "backwards" });
      });
      paint();
    }
    function uncoverAll(){ covers.forEach(c => c.remove()); covers = []; total = 0; paint(); }
    paint();
  }
  function posterTest(stage, v){
    const bar = make("div", "rv-cover-bar");
    const said = make("p", "rv-left", "Look it over, then cover it up and see what you remember.");
    said.setAttribute("role", "status");
    let hidden = false;
    const toggle = button("btn-primary", "Cover it up", () => {
      hidden = !hidden;
      holder.classList.toggle("is-hidden", hidden);
      toggle.textContent = hidden ? "Show me" : "Cover it up";
      said.textContent = hidden ? "Say as many facts from it as you can, then check." : "How many did you get?";
      anim(hidden ? shutter : im, [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], 240);
    });
    bar.appendChild(said); bar.appendChild(toggle);
    const holder = make("div", "rv-posterbox");
    const im = make("img");
    im.src = v.poster.img; im.alt = "Your poster";
    const shutter = make("div", "rv-shutter");
    shutter.innerHTML = iconSvg("bulb", 120);
    shutter.appendChild(make("p", "", "What was on it?"));
    holder.appendChild(im); holder.appendChild(shutter);
    stage.appendChild(bar); stage.appendChild(holder);
  }
})();
