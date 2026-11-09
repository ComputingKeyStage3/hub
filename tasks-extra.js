/* =====================================================================
   tasks-extra.js — more things a lesson can ask for.

   Everything here saves what the student *did*, not a picture of it:
   a whiteboard is a list of strokes, a mindmap is a list of nodes. A
   drawing kept as strokes is around 20KB where the same board saved as
   an image is over a megabyte, which matters when the whole database is
   5GB shared across every year.
   ===================================================================== */
(function(){
  "use strict";

  /* One face for writing on the board, so what is typed matches what appears. */
  const BOARD_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /* ===================================================================
     ADDING A PICTURE, the same on every drawing task
     The poster, the whiteboard and the storyboard all take a picture the
     same way, through one pop-up: find one on the internet, right-click it,
     Copy image, come back and press Paste image. Browse images is there
     for a picture already saved on the computer. Ctrl + V works too, both
     in the pop-up and straight onto the drawing.

     window.pictureKit.ask(got, full) opens the pop-up. got(file) is handed
     the picture as soon as there is one, and the pop-up closes itself, so
     it lands on the drawing in the same press. full, when given, is said
     instead, for a drawing that has no room for another picture.
     =================================================================== */
  const PIC_TYPES = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;
  /* The first picture on the clipboard as a file, or null when there is
     none. Throws when the browser will not let the page look. */
  async function clipboardPictureFile(){
    const items = await navigator.clipboard.read();
    for (const item of items){
      const type = item.types.find(t => t.indexOf("image/") === 0);
      if (type) return new File([await item.getType(type)], "picture", { type: type });
    }
    return null;
  }
  /* After a refused look: true once the browser has been told yes and the
     page has the focus back, false if it says no or nobody answers. */
  async function clipboardYes(){
    let status;
    try{ status = await navigator.permissions.query({ name: "clipboard-read" }); }
    catch(e){ return false; }
    if (status.state === "denied") return false;
    const yes = status.state === "granted" || await new Promise(resolve => {
      const give = (v) => { clearTimeout(timer); status.onchange = null; resolve(v); };
      const timer = setTimeout(() => give(false), 60000);
      status.onchange = () => { if (status.state !== "prompt") give(status.state === "granted"); };
    });
    if (!yes) return false;
    if (document.hasFocus()) return true;
    return new Promise(resolve => {
      const timer = setTimeout(() => { window.removeEventListener("focus", back); resolve(false); }, 10000);
      function back(){ clearTimeout(timer); window.removeEventListener("focus", back); resolve(true); }
      window.addEventListener("focus", back);
    });
  }
  const pastedFile = (e) => [...((e.clipboardData && e.clipboardData.items) || [])]
    .filter(x => x.kind === "file" && /^image\//.test(x.type)).map(x => x.getAsFile())[0] || null;

  window.pictureKit = {
    ask: function(got, full){
      const back = make("div", "modal-back no-print pic-back");
      const box = make("div", "modal pic-modal");
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", "Add an image");
      const x = make("button", "btn-ghost iconbtn modal-x", "✕");
      x.type = "button";
      x.title = "Close";
      x.setAttribute("aria-label", "Close");
      box.appendChild(x);
      /* the scrolling middle, so nothing is cut off on a small screen */
      const middle = make("div", "modal-scroll");
      box.appendChild(middle);
      middle.appendChild(make("h2", "", "Add an image"));
      const close = () => {
        back.remove();
        document.removeEventListener("paste", onPaste, true);
        document.removeEventListener("keydown", onKey, true);
      };
      function onKey(e){ if (e.key === "Escape"){ e.preventDefault(); close(); } }
      function onPaste(e){
        const file = pastedFile(e);
        if (!file) return;
        e.preventDefault(); e.stopPropagation();
        take(file);
      }
      x.addEventListener("click", close);
      back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
      document.addEventListener("keydown", onKey, true);

      if (full){
        middle.appendChild(make("p", "modal-text", full));
        const ok = make("button", "btn-primary modal-cta", "OK");
        ok.type = "button";
        ok.addEventListener("click", close);
        box.appendChild(ok);
        back.appendChild(box);
        document.body.appendChild(back);
        setTimeout(() => ok.focus(), 30);
        return;
      }

      const steps = make("ol", "pic-steps");
      [["Find a picture", " on the internet."],
       ["Right-click it", " and choose Copy image."],
       ["Come back here", " and press Paste image."]].forEach((words, i) => {
        const li = make("li");
        li.appendChild(make("span", "paste-num", String(i + 1)));
        const said = make("span");
        said.appendChild(make("b", "", words[0]));
        said.appendChild(document.createTextNode(words[1]));
        li.appendChild(said);
        steps.appendChild(li);
      });
      middle.appendChild(steps);
      const msg = make("p", "pic-msg");
      msg.setAttribute("role", "status");
      msg.hidden = true;
      middle.appendChild(msg);
      const say = (text) => { msg.textContent = text; msg.hidden = !text; };

      const pasteBtn = make("button", "btn-primary modal-cta pic-paste", "Paste image");
      pasteBtn.type = "button";
      box.appendChild(pasteBtn);
      const browseBtn = make("button", "btn-ghost pic-browse", "Browse images");
      browseBtn.type = "button";
      browseBtn.title = "Choose a picture saved on this computer";
      box.appendChild(browseBtn);

      let done = false;
      function take(file){
        if (done) return;
        if (!file || !PIC_TYPES.test(file.type || "")){ say("That file is not a picture. Try a different one."); return; }
        done = true;
        close();
        got(file);
      }

      const NOTHING = "There was no picture copied. Right-click a picture, choose Copy image, then press Paste image again.";
      pasteBtn.addEventListener("click", async () => {
        say("");
        if (!navigator.clipboard || !navigator.clipboard.read){
          say("Press Ctrl + V on your keyboard to paste the picture.");
          return;
        }
        let file;
        try{ file = await clipboardPictureFile(); }
        catch(err){
          /* Asked once by the browser: wait for their answer, then look again. */
          pasteBtn.textContent = "Press Allow at the top…";
          const ok = await clipboardYes();
          pasteBtn.textContent = "Paste image";
          if (!ok){ say("Your browser will not let this page see what you copied. Press Ctrl + V on your keyboard instead."); return; }
          try{ file = await clipboardPictureFile(); }
          catch(e2){ say("Press Ctrl + V on your keyboard to paste the picture."); return; }
        }
        if (!file){ say(NOTHING); return; }
        take(file);
      });

      /* The Pictures folder where the browser can open there, and the usual
         file picker everywhere else. A page inside a frame is not allowed
         the first, so it falls back the same way. */
      const fileInp = make("input");
      fileInp.type = "file";
      fileInp.accept = "image/*";
      fileInp.hidden = true;
      box.appendChild(fileInp);
      fileInp.addEventListener("change", () => { if (fileInp.files[0]) take(fileInp.files[0]); fileInp.value = ""; });
      browseBtn.addEventListener("click", async () => {
        say("");
        if (window.showOpenFilePicker){
          try{
            const handles = await window.showOpenFilePicker({ startIn: "pictures", multiple: false,
              types: [{ description: "Pictures", accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"] } }] });
            if (handles && handles[0]) take(await handles[0].getFile());
            return;
          }catch(err){
            if (err && err.name === "AbortError") return;      // they closed it
          }
        }
        fileInp.click();
      });

      /* and a picture dragged onto the pop-up from another window */
      box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("pic-over"); });
      box.addEventListener("dragleave", () => box.classList.remove("pic-over"));
      box.addEventListener("drop", (e) => {
        e.preventDefault();
        box.classList.remove("pic-over");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) take(file);
        else say(NOTHING);
      });

      document.addEventListener("paste", onPaste, true);
      back.appendChild(box);
      document.body.appendChild(back);
      setTimeout(() => pasteBtn.focus(), 30);
    },

    /* Ctrl + V straight onto a drawing, while it is the last thing pressed
       on. section is the task's own section; got(file) as for ask. */
    listen: function(section, got){
      let mine = false;
      document.addEventListener("pointerdown", (e) => { mine = section.contains(e.target); }, true);
      document.addEventListener("paste", (e) => {
        if (!mine || section.offsetParent === null) return;
        /* typing in a box on the drawing pastes words, not a picture */
        const t = e.target;
        if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT") && !pastedFile(e)) return;
        const file = pastedFile(e);
        if (file){ e.preventDefault(); got(file); }
      });
    },

    /* A picture made small enough to keep. longest is the most pixels
       across or down; most is the most characters of data the result may
       be. WebP keeps a see-through background, which a JPEG would turn
       black; where the browser cannot make WebP, it is a JPEG on white. */
    shrink: function(file, longest, most){
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          let k = Math.min(1, longest / Math.max(img.width, img.height));
          const c = make("canvas");
          let out = "";
          for (let tries = 0; tries < 5; tries++){
            c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
            const pen = c.getContext("2d");
            pen.clearRect(0, 0, c.width, c.height);
            pen.drawImage(img, 0, 0, c.width, c.height);
            for (const q of [0.8, 0.65, 0.5]){
              out = c.toDataURL("image/webp", q);
              if (out.indexOf("data:image/webp") !== 0){
                pen.globalCompositeOperation = "destination-over";
                pen.fillStyle = "#FFFFFF";
                pen.fillRect(0, 0, c.width, c.height);
                pen.globalCompositeOperation = "source-over";
                out = c.toDataURL("image/jpeg", q);
              }
              if (!most || out.length <= most) return resolve({ src: out, w: c.width, h: c.height });
            }
            k *= 0.75;
          }
          resolve({ src: out, w: c.width, h: c.height });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
        img.src = url;
      });
    }
  };

  /* ===================================================================
     PICTURES ON A BOARD
     A picture on the whiteboard or the storyboard is
       { kind:"photo", pic, x, y, w, h, rot }
     centred on x, y like a drawing. pic names the picture, and the picture
     itself is kept once, beside the strokes, in pics: { name: data }. A
     storyboard panel copied from the one before shares its pictures rather
     than storing them again.

     The cost, worked out before it was built: a picture is shrunk to 480
     pixels across and kept under 45,000 characters, and a task holds four
     at most, so 180KB is the most one student can keep on one task. A whole
     year group doing that on one task is under 50MB, against the poster's
     80MB, and most will add one or two.
     =================================================================== */
  const PIC_MOST = 4;
  const PIC_LONGEST = 480;
  const PIC_CHARS = 45000;
  const PICS = {};                  // name -> { src, img }
  const picWaits = [];              // pictures still loading, for the PDF
  function picLoad(name, src){
    if (!name || typeof src !== "string" || !/^data:image\//.test(src)) return;
    if (PICS[name] && PICS[name].src === src) return;
    const img = new Image();
    PICS[name] = { src: src, img: img };
    picWaits.push(new Promise(resolve => {
      img.onload = () => { resolve(); document.dispatchEvent(new Event("drawkit-picture")); };
      img.onerror = () => resolve();
    }));
    img.src = src;
  }
  function paintPhoto(c, st){
    const w = Number(st.w) || 100, h = Number(st.h) || 100;
    const p = PICS[st.pic];
    c.save();
    c.translate(st.x, st.y);
    if (st.rot) c.rotate(st.rot * Math.PI / 180);
    if (p && p.img.complete && p.img.naturalWidth) c.drawImage(p.img, -w / 2, -h / 2, w, h);
    else {
      /* still loading, or gone: a grey box the size it will be */
      c.fillStyle = "#E4E4E0";
      c.fillRect(-w / 2, -h / 2, w, h);
    }
    c.restore();
  }

  /* ===================================================================
     SHAPES AND DRAWINGS, shared by the whiteboard and the storyboard
     A shape is { kind:"shape", shape:"rect"|"ellipse"|"line"|"arrow",
                  from:[x,y], to:[x,y], colour, width }.
     A drawing dragged in is { kind:"stamp", name, x, y, size, flip }: its
     name and where it sits, never the picture. The pictures themselves are
     drawn here from paths, so a board with ten characters on it is a few
     hundred bytes, and every drawing looks the same wherever it is opened.
     Each is designed in a 100 x 100 box and drawn at size across, centred
     on x, y.
     =================================================================== */
  const INK = "#1D1D1B";
  const dot = (cx, cy, r) => "M" + (cx - r) + " " + cy + "a" + r + " " + r + " 0 1 0 " + (2 * r) +
                             " 0a" + r + " " + r + " 0 1 0 " + (-2 * r) + " 0z";
  const SKIN = "#F2C29B", SKIN_DARK = "#B9804E", GLASS = "#9CD3F0";
  /* Each part is [fill, path] or [null, path, line width, line colour] for a
     line only. A fill of "eye" is a small solid dot with no outline. */
  const face = (y) => [["eye", dot(45, y, 1.8)], ["eye", dot(55, y, 1.8)], [null, "M45 " + (y + 6) + "q5 4 10 0"]];
  const STAMP_LIST = [
    { name:"boy", label:"Boy", group:"Characters", parts: [
      ["#2F4A7A", "M39 68h9v25h-9z"], ["#2F4A7A", "M52 68h9v25h-9z"],
      [INK, "M36 92h13v5h-13z"], [INK, "M51 92h13v5h-13z"],
      [SKIN, "M29 40h8v27h-8z"], [SKIN, "M63 40h8v27h-8z"],
      ["#C0392B", "M34 37h32v33h-32z"],
      [SKIN, dot(50, 22, 13)], ["#5A3A1E", "M37 21a13 13 0 0 1 26 0q-6-5-13-4t-13 4z"]
    ].concat(face(23)) },
    { name:"girl", label:"Girl", group:"Characters", parts: [
      ["#2B1B10", "M35 23a15 15 0 0 1 30 0v19h-30z"],
      [SKIN_DARK, "M41 73h7v20h-7z"], [SKIN_DARK, "M52 73h7v20h-7z"],
      [INK, "M38 92h11v5h-11z"], [INK, "M51 92h11v5h-11z"],
      [SKIN_DARK, "M29 40h7v26h-7z"], [SKIN_DARK, "M64 40h7v26h-7z"],
      ["#8C5BC4", "M37 37h26l9 37h-44z"],
      [SKIN_DARK, dot(50, 22, 13)], ["#2B1B10", "M37 21a13 13 0 0 1 26 0q-13-7-26 0z"]
    ].concat(face(23)) },
    { name:"adult", label:"Grown-up", group:"Characters", parts: [
      ["#5E5E5C", "M39 66h10v27h-10z"], ["#5E5E5C", "M51 66h10v27h-10z"],
      [INK, "M36 92h13v5h-13z"], [INK, "M51 92h13v5h-13z"],
      ["#2F6BAE", "M27 35h9v29h-9z"], ["#2F6BAE", "M64 35h9v29h-9z"],
      [SKIN, "M27 64h9v6h-9z"], [SKIN, "M64 64h9v6h-9z"],
      ["#2F6BAE", "M34 33h32v36h-32z"], ["#C0392B", "M48 33h4l2 15-4 5-4-5z"],
      [SKIN, dot(50, 19, 12)], ["#3B3B3B", "M38 17a12 12 0 0 1 24 0q-12-5-24 0z"]
    ].concat(face(20)) },
    { name:"robot", label:"Robot", group:"Characters", parts: [
      [null, "M50 6v9"], ["#C0392B", dot(50, 6, 3.5)],
      ["#B8C2CC", "M33 15h34v24h-34z"],
      ["#2F6BAE", dot(43, 26, 4)], ["#2F6BAE", dot(57, 26, 4)], [null, "M43 34h14"],
      ["#8FA0B0", "M19 44h10v24h-10z"], ["#8FA0B0", "M71 44h10v24h-10z"],
      ["#8FA0B0", "M29 42h42v34h-42z"], ["#F2B705", "M42 50h16v12h-16z"],
      ["#8FA0B0", "M35 76h11v16h-11z"], ["#8FA0B0", "M54 76h11v16h-11z"],
      [INK, "M33 92h15v5h-15z"], [INK, "M52 92h15v5h-15z"]
    ] },
    { name:"cat", label:"Cat", group:"Characters", parts: [
      [null, "M66 86q24-2 16-30", 6, "#E07B24"],
      ["#F4A340", "M30 92q0-40 20-40t20 40z"],
      ["#F4A340", "M35 33l2-17 11 10z"], ["#F4A340", "M65 33l-2-17-11 10z"],
      ["#F4A340", dot(50, 40, 16)],
      ["eye", dot(44, 39, 2)], ["eye", dot(56, 39, 2)], ["#E88C9A", "M47 45h6l-3 3z"],
      [null, "M30 44l12 2"], [null, "M30 50h12"], [null, "M70 44l-12 2"], [null, "M70 50h-12"]
    ] },
    { name:"dog", label:"Dog", group:"Characters", parts: [
      ["#A0703C", "M28 92q0-38 22-38t22 38z"],
      ["#C08A50", dot(50, 40, 16)],
      ["#6B4423", "M36 28q-12 6-7 24l8-4z"], ["#6B4423", "M64 28q12 6 7 24l-8-4z"],
      ["eye", dot(44, 38, 2)], ["eye", dot(56, 38, 2)], [INK, dot(50, 45, 3)], [null, "M45 50q5 4 10 0"]
    ] },
    { name:"tree", label:"Tree", group:"Objects", parts: [
      ["#8B5A2B", "M44 58h12v36h-12z"],
      ["#3E9B4F", dot(34, 46, 15)], ["#3E9B4F", dot(66, 46, 15)], ["#3E9B4F", dot(50, 30, 22)]
    ] },
    { name:"house", label:"House", group:"Objects", parts: [
      ["#F2D7A6", "M18 48h64v46h-64z"], ["#C0392B", "M12 50l38-34 38 34z"],
      ["#8B5A2B", "M44 66h12v28h-12z"], [GLASS, "M24 58h14v12h-14z"], [GLASS, "M62 58h14v12h-14z"]
    ] },
    { name:"car", label:"Car", group:"Objects", parts: [
      ["#C0392B", "M7 74v-10q0-10 12-11l13-1 11-15h24l12 15h7q9 1 9 12v10z"],
      [GLASS, "M39 51l7-10h9v10z"], [GLASS, "M60 41h6l8 10h-14z"],
      [INK, dot(28, 76, 9)], [INK, dot(72, 76, 9)], ["#B8C2CC", dot(28, 76, 3.5)], ["#B8C2CC", dot(72, 76, 3.5)]
    ] },
    { name:"sun", label:"Sun", group:"Objects", parts: (() => {
      const rays = [];
      for (let k = 0; k < 8; k++){
        const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
        rays.push([null, "M" + (50 + 25 * c).toFixed(1) + " " + (50 + 25 * s).toFixed(1) +
                         "L" + (50 + 38 * c).toFixed(1) + " " + (50 + 38 * s).toFixed(1), 5, "#E8A100"]);
      }
      return rays.concat([["#F2B705", dot(50, 50, 18)]]);
    })() },
    { name:"cloud", label:"Cloud", group:"Objects", parts: [
      ["#FFFFFF", "M24 70a14 14 0 0 1 3-27a18 18 0 0 1 34-7a14 14 0 0 1 20 14a11 11 0 0 1-3 20z"]
    ] },
    { name:"star", label:"Star", group:"Objects", parts: [
      ["#F2B705", (() => {
        let d = "";
        for (let k = 0; k < 10; k++){
          const r = k % 2 ? 17 : 40, a = -Math.PI / 2 + k * Math.PI / 5;
          d += (k ? "L" : "M") + (50 + r * Math.cos(a)).toFixed(1) + " " + (54 + r * Math.sin(a)).toFixed(1);
        }
        return d + "z";
      })()]
    ] },
    { name:"ball", label:"Ball", group:"Objects", parts: [
      ["#F2B705", dot(50, 52, 30)],
      ["#C0392B", "M50 52V22A30 30 0 0 1 76 67z"], ["#2F6BAE", "M50 52L76 67A30 30 0 0 1 24 67z"],
      [null, dot(50, 52, 30)]
    ] },
    { name:"laptop", label:"Laptop", group:"Objects", parts: [
      ["#2B2B2B", "M22 26h56v40h-56z"], [GLASS, "M26 30h48v32h-48z"], ["#B8C2CC", "M12 68h76l-6 9h-64z"]
    ] },
    { name:"phone", label:"Phone", group:"Objects", parts: [
      ["#2B2B2B", "M36 12h28a4 4 0 0 1 4 4v68a4 4 0 0 1-4 4h-28a4 4 0 0 1-4-4v-68a4 4 0 0 1 4-4z"],
      [GLASS, "M36 20h28v56h-28z"], ["#B8C2CC", dot(50, 82, 2.5)]
    ] },
    { name:"speech", label:"Speech bubble", group:"Objects", parts: [
      ["#FFFFFF", "M14 18h72a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6h-46l-16 16v-16h-10a6 6 0 0 1-6-6v-36a6 6 0 0 1 6-6z"]
    ] }
  ];
  const STAMPS = {};
  STAMP_LIST.forEach(st => { STAMPS[st.name] = st; });
  /* Path2D objects are made once, the first time each drawing is needed. */
  const pathCache = {};
  function stampPaths(name){
    if (pathCache[name]) return pathCache[name];
    const def = STAMPS[name];
    if (!def || typeof Path2D === "undefined") return null;
    return (pathCache[name] = def.parts.map(p => ({ fill: p[0], path: new Path2D(p[1]), w: p[2], line: p[3] })));
  }
  function paintStamp(c, st){
    const parts = stampPaths(st.name);
    if (!parts) return;
    /* w and h when it has been stretched, size when it is still square */
    const kx = (Number(st.w) || Number(st.size) || 100) / 100, ky = (Number(st.h) || Number(st.size) || 100) / 100;
    c.save();
    c.translate(st.x, st.y);
    if (st.rot) c.rotate(st.rot * Math.PI / 180);
    c.scale(st.flip ? -kx : kx, ky);
    c.translate(-50, -50);
    c.lineJoin = "round"; c.lineCap = "round";
    parts.forEach(p => {
      if (p.fill === "eye"){ c.fillStyle = INK; c.fill(p.path); return; }
      if (p.fill){ c.fillStyle = p.fill; c.fill(p.path); }
      c.strokeStyle = p.line || INK;
      c.lineWidth = p.w || 2.5;
      c.stroke(p.path);
    });
    c.restore();
  }
  function paintShape(c, st){
    const a = st.from, b = st.to;
    if (!a || !b) return;
    c.save();
    c.strokeStyle = st.colour || INK;
    c.lineWidth = st.width || 3;
    c.lineCap = "round"; c.lineJoin = "round";
    /* A turned rectangle or oval is drawn unturned and turned round its middle. */
    if (st.rot && (st.shape === "rect" || st.shape === "ellipse")){
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      c.translate(mx, my); c.rotate(st.rot * Math.PI / 180); c.translate(-mx, -my);
    }
    c.beginPath();
    if (st.shape === "rect"){
      c.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    } else if (st.shape === "ellipse"){
      c.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 0.1, Math.abs(b[1] - a[1]) / 2 || 0.1, 0, 0, Math.PI * 2);
    } else {
      c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      if (st.shape === "arrow"){
        /* The head grows with the line's width, so a thick arrow still looks like one. */
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const head = Math.max(14, (st.width || 3) * 4);
        c.moveTo(b[0], b[1]);
        c.lineTo(b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45));
        c.moveTo(b[0], b[1]);
        c.lineTo(b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45));
      }
    }
    c.stroke();
    c.restore();
  }
  window.drawKit = {
    STAMPS: STAMP_LIST,
    /* Draws a shape or a drawing. False for anything else, which the caller
       draws itself as it always has. */
    paint: (c, st) => {
      if (!st) return false;
      if (st.kind === "stamp"){ paintStamp(c, st); return true; }
      if (st.kind === "shape"){ paintShape(c, st); return true; }
      if (st.kind === "photo"){ paintPhoto(c, st); return true; }
      return false;
    },
    has: (st) => !!st && (st.kind === "stamp" || st.kind === "shape" || st.kind === "photo"),
    /* Pictures, kept once beside the strokes. lists is every list of
       strokes the task has: one for a whiteboard, a panel each for a
       storyboard. */
    pictures: {
      most: PIC_MOST,
      /* puts saved pictures back where paint() can find them */
      load: (pics) => { if (pics && typeof pics === "object") Object.keys(pics).forEach(k => picLoad(k, pics[k])); },
      add: (src) => {
        const name = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        picLoad(name, src);
        return name;
      },
      /* only the pictures still on the drawing, so a removed one is not kept */
      keep: (lists) => {
        const out = {};
        lists.forEach(list => (list || []).forEach(st => {
          if (st && st.kind === "photo" && PICS[st.pic]) out[st.pic] = PICS[st.pic].src;
        }));
        return Object.keys(out).length ? out : undefined;
      },
      count: (lists) => {
        const seen = new Set();
        lists.forEach(list => (list || []).forEach(st => { if (st && st.kind === "photo") seen.add(st.pic); }));
        return seen.size;
      },
      /* The pop-up, then the picture made small and handed to place(item)
         as a new { kind:"photo" } sized to fit inside fitW x fitH. */
      ask: (lists, fitW, fitH, place, oops) => {
        const room = window.drawKit.pictures.count(lists) < PIC_MOST;
        window.pictureKit.ask((file) => window.drawKit.pictures.fromFile(file, fitW, fitH, place, oops),
          room ? null : "There are already " + PIC_MOST + " pictures here, which is as many as one drawing can keep. Remove one to add another.");
      },
      fromFile: (file, fitW, fitH, place, oops, lists) => {
        if (lists && window.drawKit.pictures.count(lists) >= PIC_MOST){
          if (oops) oops("There are already " + PIC_MOST + " pictures here. Remove one to add another.");
          return;
        }
        window.pictureKit.shrink(file, PIC_LONGEST, PIC_CHARS).then(got => {
          const k = Math.min(fitW / got.w, fitH / got.h, 1.5);
          place({ kind: "photo", pic: window.drawKit.pictures.add(got.src),
                  w: Math.round(got.w * k), h: Math.round(got.h * k) });
        }).catch(() => { if (oops) oops("That picture could not be opened. Try a different one."); });
      }
    },
    /* Resolves once every picture handed over has loaded, so a PDF made
       straight after opening a piece of work has them in it. */
    ready: () => Promise.all(picWaits.slice()),
    /* The box the handles go round, as boxKit wants it: { x, y, w, h, rot }.
       Null for a line or an arrow, which have an end to drag instead. */
    frame: (st) => {
      if (st.kind === "stamp" || st.kind === "photo"){
        const w = Number(st.w) || Number(st.size) || 100, h = Number(st.h) || Number(st.size) || 100;
        return { x: st.x, y: st.y, w: w, h: h, rot: Number(st.rot) || 0 };
      }
      if (st.kind !== "shape" || st.shape === "line" || st.shape === "arrow") return null;
      return { x: (st.from[0] + st.to[0]) / 2, y: (st.from[1] + st.to[1]) / 2,
               w: Math.abs(st.to[0] - st.from[0]), h: Math.abs(st.to[1] - st.from[1]), rot: Number(st.rot) || 0 };
    },
    /* and back: a drawing or shape made to fill a box. Rounded, because
       these are saved with the work and nobody needs the eleventh decimal. */
    reshape: (st, bx) => {
      const r1 = (n) => Math.round(n * 10) / 10;
      const rot = r1(Number(bx.rot) || 0);
      if (st.kind === "stamp" || st.kind === "photo"){
        st.x = r1(bx.x); st.y = r1(bx.y); st.w = r1(bx.w); st.h = r1(bx.h);
        if (st.kind === "stamp") st.size = Math.round(Math.max(bx.w, bx.h));
      } else {
        st.from = [r1(bx.x - bx.w / 2), r1(bx.y - bx.h / 2)];
        st.to = [r1(bx.x + bx.w / 2), r1(bx.y + bx.h / 2)];
      }
      if (rot) st.rot = rot; else delete st.rot;
    },
    /* [left, top, right, bottom], round all of it however it is turned */
    box: (st) => {
      const f = window.drawKit.frame(st);
      if (!f) return [Math.min(st.from[0], st.to[0]), Math.min(st.from[1], st.to[1]),
                      Math.max(st.from[0], st.to[0]), Math.max(st.from[1], st.to[1])];
      const a = f.rot * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const hw = (f.w * c + f.h * s) / 2, hh = (f.w * s + f.h * c) / 2;
      return [f.x - hw, f.y - hh, f.x + hw, f.y + hh];
    },
    move: (st, dx, dy) => {
      if (st.kind === "stamp" || st.kind === "photo"){ st.x += dx; st.y += dy; return; }
      st.from[0] += dx; st.from[1] += dy; st.to[0] += dx; st.to[1] += dy;
    },
    /* The Smaller and Bigger buttons: a drawing or a picture, keeping its shape. */
    grow: (st, by, least, most) => {
      if (st.kind !== "stamp" && st.kind !== "photo") return;
      const f = window.drawKit.frame(st);
      const k = Math.max(least / Math.min(f.w, f.h), Math.min(most / Math.max(f.w, f.h), by));
      window.drawKit.reshape(st, { x: f.x, y: f.y, w: f.w * k, h: f.h * k, rot: f.rot });
    },
    /* What a line near the outline counts as touching. Inside a drawing is
       touching it, and so is inside a shape: a thin outline is hard to hit. */
    hit: (st, p, slack) => {
      const b = window.drawKit.box(st), m = slack || 8;
      if (st.kind === "shape" && (st.shape === "line" || st.shape === "arrow")){
        const ax = st.from[0], ay = st.from[1], bx = st.to[0], by = st.to[1];
        const len = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / len));
        const dx = p[0] - (ax + t * (bx - ax)), dy = p[1] - (ay + t * (by - ay));
        return Math.sqrt(dx * dx + dy * dy) <= m + (st.width || 3);
      }
      const f = window.drawKit.frame(st);
      if (f && f.rot && window.boxKit) return window.boxKit.inside(f, p, m);
      return p[0] >= b[0] - m && p[0] <= b[2] + m && p[1] >= b[1] - m && p[1] <= b[3] + m;
    },
    /* A row of drawings to drag onto a canvas, or tap to drop in the middle.
       Pointer events rather than HTML drag and drop, which does nothing on a
       tablet. drop(name, clientX, clientY) is given no position for a tap. */
    tray: (target, drop) => {
      const tray = make("div", "draw-tray");
      let group = "";
      STAMP_LIST.forEach(def => {
        if (def.group !== group){
          group = def.group;
          tray.appendChild(make("span", "draw-tray-head", group));
        }
        const btn = make("button", "draw-stamp");
        btn.type = "button";
        btn.title = def.label + ": drag it in, or tap to add it";
        btn.setAttribute("aria-label", "Add " + def.label);
        const cv = make("canvas");
        cv.width = 96; cv.height = 96;
        paintStamp(cv.getContext("2d"), { name: def.name, x: 48, y: 48, size: 88 });
        btn.appendChild(cv);
        let start = null, ghost = null;
        btn.addEventListener("pointerdown", (e) => {
          if (e.button) return;
          e.preventDefault();
          start = [e.clientX, e.clientY];
          try{ btn.setPointerCapture(e.pointerId); }catch(err){}
        });
        btn.addEventListener("pointermove", (e) => {
          if (!start) return;
          if (!ghost && Math.abs(e.clientX - start[0]) + Math.abs(e.clientY - start[1]) > 6){
            ghost = make("canvas", "draw-ghost");
            ghost.width = 96; ghost.height = 96;
            paintStamp(ghost.getContext("2d"), { name: def.name, x: 48, y: 48, size: 88 });
            document.body.appendChild(ghost);
          }
          if (ghost){
            ghost.style.left = (e.clientX - 40) + "px";
            ghost.style.top = (e.clientY - 40) + "px";
          }
        });
        const end = (e, cancelled) => {
          if (!start) return;
          const dragged = !!ghost;
          if (ghost){ ghost.remove(); ghost = null; }
          start = null;
          if (cancelled) return;
          if (!dragged){ drop(def.name, null, null); return; }
          const r = target.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
            drop(def.name, e.clientX, e.clientY);
        };
        btn.addEventListener("pointerup", (e) => end(e, false));
        btn.addEventListener("pointercancel", (e) => end(e, true));
        tray.appendChild(btn);
      });
      return tray;
    }
  };
  /* The handles on a drawing or shape that has been picked up, the same on
     the whiteboard and the storyboard. unit is how many of the board's
     units one screen pixel is, so the handles stay finger-sized at any
     zoom; top is the highest point a press can reach, if there is one. */
  window.drawKit.handles = {
    opts: (unit, top) => ({ unit: unit, reach: 13 * unit, gap: 26 * unit, top: top }),
    draw: (c, st, unit, top) => {
      if (!window.boxKit) return;
      const f = window.drawKit.frame(st);
      if (f) window.boxKit.draw(c, f, window.drawKit.handles.opts(unit, top));
      else if (st.from && st.to) window.boxKit.drawEnds(c, st.from, st.to, unit);
    },
    /* which handle is under p, or null */
    hit: (st, p, unit, top) => {
      if (!window.boxKit || !window.drawKit.has(st)) return null;
      const f = window.drawKit.frame(st);
      if (f) return window.boxKit.hit(f, p, window.drawKit.handles.opts(unit, top));
      return window.boxKit.hitEnds(st.from, st.to, p, 13 * unit);
    },
    /* Hold on to how it was when the press began, then call move() with
       each new point. */
    start: (st, name) => ({ st: st, name: name, frame: window.drawKit.frame(st) }),
    move: (press, p, round) => {
      const st = press.st, r = (n) => round ? Math.round(n) : Math.round(n * 10) / 10;
      if (!press.frame){ st[press.name] = [r(p[0]), r(p[1])]; return; }
      window.drawKit.reshape(st, window.boxKit.drag(press.frame, press.name, p, { min: 12 }));
    }
  };
  /* The picture buttons, the same on both boards. */
  const PIC_ICONS = {
    add: '<svg viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="7" cy="8.2" r="1.5"/><path d="M3.5 15l4.2-4.2 3 3 2.3-2.3 3.5 3.5z"/></svg>',
    behind: '<svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="10" height="10" rx="1" opacity=".45"/><rect x="7.5" y="7.5" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
  };
  /* The four shape buttons, drawn the same on both boards. */
  const SHAPE_ICONS = {
    rect:    '<svg viewBox="0 0 20 20"><path d="M3 5h14v10H3z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    ellipse: '<svg viewBox="0 0 20 20"><ellipse cx="10" cy="10" rx="7.5" ry="5.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    line:    '<svg viewBox="0 0 20 20"><path d="M3 16L17 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    arrow:   '<svg viewBox="0 0 20 20"><path d="M3 16L16 4M9.5 4H16v6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stamps:  '<svg viewBox="0 0 20 20"><circle cx="7" cy="6" r="3"/><path d="M2.5 17v-3.5A3.5 3.5 0 016 10h2a3.5 3.5 0 013.5 3.5V17z"/><path d="M12.5 17l3-8 3 8z" opacity=".7"/></svg>'
  };
  const SHAPE_NAMES = { rect:"Draw a rectangle", ellipse:"Draw a circle or oval", line:"Draw a straight line", arrow:"Draw an arrow" };

  /* ===================================================================
     WHITEBOARD
     { type:"board", title, task, height, starter:[strokes] }
     Draw, write, rub out, and move around a board bigger than the screen.
     =================================================================== */
  window.rBoard = function(b, ctx){
    const s = make("section", "board");
    const inner = make("div", "board-inner");
    s.appendChild(inner);
    const bar = make("div", "board-bar");
    const stage = make("div", "board-stage");
    const canvas = make("canvas", "board-canvas");
    stage.appendChild(canvas);
    inner.appendChild(bar);
    inner.appendChild(stage);

    /* what is on the board: each stroke is a colour, a width and points */
    let strokes = Array.isArray(b.starter) ? JSON.parse(JSON.stringify(b.starter)) : [];
    let undone = [];
    let view = { x: 0, y: 0, scale: 1 };
    let tool = "pen", colour = "#1D1D1B", width = 3;
    let drawing = null, panning = null, moving = null, marquee = null;
    let reshaping = null;   // a handle being dragged
    let picked = [];        // everything currently selected

    /* --- picking things up, and typing straight onto the board --- */

    /* what is under the pointer, taking the topmost thing */
    function topmostAt(where){
      for (let i = strokes.length - 1; i >= 0; i--){
        const st = strokes[i];
        if (window.drawKit.has(st)){
          if (window.drawKit.hit(st, where, 10 / view.scale)) return st;
          continue;
        }
        if (st.kind === "text"){
          const w = String(st.text).length * (st.size || 20) * 0.55;
          if (where[0] >= st.x && where[0] <= st.x + w &&
              where[1] >= st.y - (st.size || 20) && where[1] <= st.y + 6) return st;
        } else if (st.points){
          const near = st.points.some(p =>
            Math.abs(p[0] - where[0]) < 10 && Math.abs(p[1] - where[1]) < 10);
          if (near) return st;
        }
      }
      return null;
    }
    /* everything wholly or partly inside the rectangle */
    function insideBox(box){
      const x1 = Math.min(box.from[0], box.to[0]), x2 = Math.max(box.from[0], box.to[0]);
      const y1 = Math.min(box.from[1], box.to[1]), y2 = Math.max(box.from[1], box.to[1]);
      return strokes.filter(st => {
        if (window.drawKit.has(st)){
          const b = window.drawKit.box(st);
          return b[2] >= x1 && b[0] <= x2 && b[3] >= y1 && b[1] <= y2;
        }
        if (st.kind === "text"){
          return st.x >= x1 && st.x <= x2 && st.y >= y1 && st.y <= y2;
        }
        return (st.points || []).some(p => p[0] >= x1 && p[0] <= x2 && p[1] >= y1 && p[1] <= y2);
      });
    }
    /* The board is big, but not endless: roughly two screens each way. Left
       open, a student can drag off into nothing and their work is stored with
       coordinates far from anywhere. */
    const EDGE = 1600;
    function holdInside(){
      const rect = stage.getBoundingClientRect();
      const w = rect.width || 600, h = rect.height || 400;
      const most = EDGE * view.scale;
      view.x = Math.max(-most + w * 0.2, Math.min(most - w * 0.2, view.x));
      view.y = Math.max(-most + h * 0.2, Math.min(most - h * 0.2, view.y));
    }
    /* and nothing may be dragged past the edges either */
    function clampPoint(p){
      p[0] = Math.max(-EDGE, Math.min(EDGE, p[0]));
      p[1] = Math.max(-EDGE, Math.min(EDGE, p[1]));
    }
    function shift(item, dx, dy){
      if (window.drawKit.has(item)){
        /* Held by its middle, so a drawing can sit half off the edge but
           never be lost past it. */
        const b = window.drawKit.box(item);
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        dx = Math.max(-EDGE - cx, Math.min(EDGE - cx, dx));
        dy = Math.max(-EDGE - cy, Math.min(EDGE - cy, dy));
        window.drawKit.move(item, dx, dy);
        return;
      }
      if (item.kind === "text"){
        item.x = Math.max(-EDGE, Math.min(EDGE, item.x + dx));
        item.y = Math.max(-EDGE, Math.min(EDGE, item.y + dy));
        return;
      }
      (item.points || []).forEach(p => { p[0] += dx; p[1] += dy; clampPoint(p); });
    }

    /* a small strip beside whatever has been picked up */
    let pickTools = null;
    function hidePickTools(){
      if (pickTools && pickTools.parentNode) pickTools.parentNode.removeChild(pickTools);
      pickTools = null;
    }
    function movePickTools(e){
      if (!pickTools) return;
      const rect = stage.getBoundingClientRect();
      pickTools.style.left = (e.clientX - rect.left) + "px";
      pickTools.style.top = (e.clientY - rect.top - 46) + "px";
    }
    function showPickTools(e){
      hidePickTools();
      sizesFollowPicked();
      if (!picked.length) return;
      pickTools = make("div", "board-picktools");
      movePickTools(e);
      const moveBtn = make("button", "board-tool");
      moveBtn.innerHTML = ICONS.move;
      moveBtn.title = "Drag to move";
      moveBtn.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        moving = at(ev);
        moveBtn.setPointerCapture(ev.pointerId);
      });
      moveBtn.addEventListener("pointermove", (ev) => {
        if (!moving || !picked.length) return;
        const now = at(ev);
        picked.forEach(item => shift(item, now[0] - moving[0], now[1] - moving[1]));
        moving = now;
        movePickTools(ev);
        draw();
      });
      moveBtn.addEventListener("pointerup", () => { moving = null; ctx.changed(); });
      /* words can be rewritten without starting again */
      const only = picked.length === 1 ? picked[0] : null;
      if (only && only.kind === "text"){
        const editBtn = make("button", "board-tool");
        editBtn.innerHTML = ICONS.text;
        editBtn.title = "Change these words";
        editBtn.addEventListener("click", () => {
          hidePickTools();
          retype(only);
        });
        pickTools.appendChild(editBtn);
      }

      /* a drawing or a picture can be made bigger or smaller */
      if (only && (only.kind === "stamp" || only.kind === "photo")){
        [["−", "Smaller", 1 / 1.25], ["+", "Bigger", 1.25]].forEach(([sign, title, by]) => {
          const btn = make("button", "board-tool", sign);
          btn.title = title;
          btn.addEventListener("click", () => { window.drawKit.grow(only, by, 30, 1200); draw(); ctx.changed(); });
          pickTools.appendChild(btn);
        });
      }
      /* A picture goes on top when it is added, over anything drawn
         already, so it can be sent behind the drawing instead. */
      if (only && only.kind === "photo"){
        const backBtn = make("button", "board-tool");
        backBtn.innerHTML = ICONS.behind;
        backBtn.title = "Put it behind the drawing";
        backBtn.addEventListener("click", () => {
          strokes = [only].concat(strokes.filter(x => x !== only));
          draw(); ctx.changed();
        });
        pickTools.appendChild(backBtn);
      }
      /* and a drawing turned to face the other way */
      if (only && only.kind === "stamp"){
        const flipBtn = make("button", "board-tool");
        flipBtn.innerHTML = ICONS.flip;
        flipBtn.title = "Face the other way";
        flipBtn.addEventListener("click", () => { only.flip = !only.flip; draw(); ctx.changed(); });
        pickTools.appendChild(flipBtn);
      }

      /* and anything picked up can be recoloured from here */
      if (!(only && (only.kind === "stamp" || only.kind === "photo"))) ["#1D1D1B","#C0392B","#2F6BAE","#2E7D5B","#B8930A"].forEach(c => {
        const dot = make("button", "board-colour board-pickcolour");
        dot.style.background = c;
        dot.title = "Change to this colour";
        dot.addEventListener("click", () => {
          picked.forEach(item => { item.colour = c; });
          draw(); ctx.changed();
        });
        pickTools.appendChild(dot);
      });

      const binBtn = make("button", "board-tool");
      binBtn.innerHTML = ICONS.wipe;
      binBtn.title = picked.length > 1 ? "Remove these" : "Remove it";
      binBtn.addEventListener("click", () => {
        strokes = strokes.filter(x => picked.indexOf(x) < 0);
        picked = [];
        hidePickTools(); sizesFollowPicked();
        draw(); ctx.changed();
      });
      pickTools.appendChild(moveBtn); pickTools.appendChild(binBtn);
      stage.appendChild(pickTools);
    }

    /* open an existing piece of writing for changing */
    function retype(item){
      const rect = stage.getBoundingClientRect();
      const screenX = rect.left + item.x * view.scale + view.x;
      const screenY = rect.top + item.y * view.scale + view.y;
      typeHere([item.x, item.y], { clientX: screenX, clientY: screenY }, item);
    }

    /* How big the next piece of writing will be. */
    let textSize = 20;
    /* Four fixed sizes were never quite the one wanted, so it is a number
       with a step either side of it. Small enough to fit a label on a
       diagram, large enough for a heading, and no further in either
       direction: past those it is either unreadable or off the board. */
    const MIN_TEXT = 8, MAX_TEXT = 96;
    const sizeBar = make("div", "board-sizes");
    sizeBar.hidden = true;
    const down = make("button", "board-size board-step", "−");
    down.title = "Smaller";
    const sizeBox = make("input", "board-sizenum");
    sizeBox.type = "number";
    sizeBox.min = String(MIN_TEXT);
    sizeBox.max = String(MAX_TEXT);
    sizeBox.value = String(textSize);
    sizeBox.title = "Size in points";
    const up = make("button", "board-size board-step", "+");
    up.title = "Bigger";
    const unit = make("span", "board-sizeunit", "pt");

    function setTextSize(next, fromBox){
      textSize = Math.max(MIN_TEXT, Math.min(MAX_TEXT, Math.round(Number(next) || textSize)));
      if (!fromBox) sizeBox.value = String(textSize);
      /* anything picked up changes with it */
      const words = picked.filter(x => x.kind === "text");
      if (words.length){ words.forEach(w => { w.size = textSize; }); draw(); ctx.changed(); }
    }
    [down, up].forEach(b => b.addEventListener("mousedown", (ev) => ev.preventDefault()));
    down.addEventListener("click", () => setTextSize(textSize - 2));
    up.addEventListener("click", () => setTextSize(textSize + 2));
    sizeBox.addEventListener("input", () => {
      const n = parseInt(sizeBox.value, 10);
      if (!isNaN(n)) setTextSize(n, true);
    });
    /* Out of range or left empty, it goes back to what it actually is. */
    sizeBox.addEventListener("blur", () => setTextSize(textSize));
    sizeBar.appendChild(down);
    sizeBar.appendChild(sizeBox);
    sizeBar.appendChild(unit);
    sizeBar.appendChild(up);
    stage.appendChild(sizeBar);

    /* Shown while the text tool is chosen, and while words are picked up.
       Clicking away from the words puts it away again: it was staying on
       screen with nothing left for it to change. */
    function showSizes(on){
      sizeBar.hidden = !on;
      if (on){
        const words = picked.filter(x => x.kind === "text");
        if (words.length) sizeBox.value = String(words[0].size || textSize);
      }
    }
    function sizesFollowPicked(){
      showSizes(tool === "text" || picked.some(x => x.kind === "text"));
    }

    /* type where they clicked, rather than in a browser pop-up */
    function typeHere(where, e, existing){
      const rect = stage.getBoundingClientRect();
      const box = make("input", "board-typing");
      box.style.left = (e.clientX - rect.left) + "px";
      box.style.top = (e.clientY - rect.top - 14) + "px";
      box.style.color = existing ? existing.colour : colour;
      /* the same face and size it will have once written, so nothing jumps */
      const size = (existing && existing.size) || textSize;
      box.style.font = (size * view.scale) + "px " + BOARD_FONT;
      if (existing){
        box.value = existing.text;
        /* changing it, so the old one goes when the new one lands */
        strokes = strokes.filter(x => x !== existing);
        picked = [];
        draw();
      }
      stage.appendChild(box);
      /* focused on the next tick, once the click that made it is over */
      setTimeout(() => { box.focus(); box.select(); }, 0);
      let ready = false;
      setTimeout(() => { ready = true; }, 150);
      const finish = (keep) => {
        const words = box.value.trim();
        if (box.parentNode) box.parentNode.removeChild(box);
        /* changed their mind: put the old words back */
        if (!keep && existing){ strokes.push(existing); draw(); }
        if (keep && words){
          strokes.push({ kind:"text", text: words, x: where[0], y: where[1],
                         colour: existing ? existing.colour : colour,
                         size: existing ? existing.size : textSize });
          undone = [];
          draw(); ctx.changed();
        }
      };
      box.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter"){ ev.preventDefault(); finish(true); }
        if (ev.key === "Escape"){ finish(false); }
      });
      box.addEventListener("blur", () => { if (ready) finish(true); });
    }

    const ctx2 = canvas.getContext("2d");
    /* The canvas has to be told its size in real pixels and in css pixels
       separately. Letting css stretch it was what put the ink to the right
       of the pointer. */
    function fit(){
      const rect = stage.getBoundingClientRect();
      const w = Math.max(280, Math.round(rect.width));
      const h = Math.max(200, Math.round(rect.height));
      canvas.width = Math.round(w * devicePixelRatio);
      canvas.height = Math.round(h * devicePixelRatio);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      draw();
    }
    function draw(){
      ctx2.setTransform(1, 0, 0, 1, 0, 0);
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      ctx2.setTransform(view.scale * devicePixelRatio, 0, 0,
                        view.scale * devicePixelRatio,
                        view.x * devicePixelRatio, view.y * devicePixelRatio);
      strokes.forEach(st => {
        const lit = picked.indexOf(st) >= 0;
        if (window.drawKit.paint(ctx2, st)){
          /* one thing picked up has handles to resize and turn it; several
             are outlined, and move together */
          if (lit && picked.length === 1){
            window.drawKit.handles.draw(ctx2, st, 1 / view.scale);
          } else if (lit){
            const b = window.drawKit.box(st);
            ctx2.save();
            ctx2.strokeStyle = "#2F6BAE";
            ctx2.lineWidth = Math.max(2.2, 2.2 / view.scale);
            ctx2.setLineDash([6 / view.scale, 4 / view.scale]);
            ctx2.strokeRect(b[0] - 6, b[1] - 6, b[2] - b[0] + 12, b[3] - b[1] + 12);
            ctx2.restore();
          }
          return;
        }
        if (st.kind === "text"){
          ctx2.fillStyle = st.colour;
          ctx2.font = (st.size || 20) + "px " + BOARD_FONT;
          ctx2.fillText(st.text, st.x, st.y);
          if (lit){
            ctx2.save();
            ctx2.strokeStyle = "#2F6BAE";
            ctx2.lineWidth = Math.max(2.2, 2.2 / view.scale);
            ctx2.setLineDash([6 / view.scale, 4 / view.scale]);
            const w = String(st.text).length * (st.size || 20) * 0.55;
            ctx2.strokeRect(st.x - 3, st.y - (st.size || 20), w + 6, (st.size || 20) + 8);
            ctx2.restore();
          }
          return;
        }
        if (!st.points || st.points.length < 2) return;
        ctx2.strokeStyle = st.colour;
        ctx2.lineWidth = st.width;
        ctx2.lineCap = "round";
        ctx2.lineJoin = "round";
        ctx2.beginPath();
        ctx2.moveTo(st.points[0][0], st.points[0][1]);
        for (let i = 1; i < st.points.length; i++) ctx2.lineTo(st.points[i][0], st.points[i][1]);
        ctx2.stroke();
        /* A thin dashed line alongside, rather than a thick one on top:
           the highlight should not hide the colour it is marking. */
        if (lit){
          ctx2.save();
          ctx2.strokeStyle = "#2F6BAE";
          ctx2.lineWidth = Math.max(2.2, 2.2 / view.scale);
          ctx2.setLineDash([6 / view.scale, 4 / view.scale]);
          ctx2.stroke();
          ctx2.restore();
        }
      });
      if (marquee){
        const x1 = Math.min(marquee.from[0], marquee.to[0]), x2 = Math.max(marquee.from[0], marquee.to[0]);
        const y1 = Math.min(marquee.from[1], marquee.to[1]), y2 = Math.max(marquee.from[1], marquee.to[1]);
        ctx2.strokeStyle = "#2F6BAE";
        ctx2.lineWidth = 1 / view.scale;
        ctx2.setLineDash([6 / view.scale, 4 / view.scale]);
        ctx2.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx2.setLineDash([]);
        ctx2.fillStyle = "rgba(47,107,174,.12)";
        ctx2.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
    /* where a pointer is, in board coordinates rather than screen ones */
    function at(e){
      const r = canvas.getBoundingClientRect();
      return [ (e.clientX - r.left - view.x) / view.scale,
               (e.clientY - r.top  - view.y) / view.scale ];
    }

    canvas.addEventListener("pointerdown", (e) => {
      /* Typing puts a real box on the board, and it needs the focus. Capturing
         the pointer for the canvas first took the focus straight back, so the
         box blurred and vanished before a word could be typed. */
      if (tool === "text"){
        /* Without this the browser moves focus to the canvas straight after,
           which blurs the box we are about to make and removes it again. */
        e.preventDefault();
        typeHere(at(e), e);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      if (tool === "move" || e.button === 1){
        panning = { x: e.clientX - view.x, y: e.clientY - view.y };
        return;
      }
      if (tool === "pick"){
        const where = at(e);
        /* a handle first: they stick out past the thing they belong to */
        const handle = picked.length === 1 && window.drawKit.handles.hit(picked[0], where, 1 / view.scale);
        if (handle){
          reshaping = window.drawKit.handles.start(picked[0], handle);
          hidePickTools();
          return;
        }
        const hit = topmostAt(where);
        if (hit && picked.indexOf(hit) >= 0){
          /* already selected, so this is the start of dragging it */
          moving = where;
          showPickTools(e);
          return;
        }
        if (hit){
          picked = [hit];
          moving = where;
          showPickTools(e);
          draw();
          return;
        }
        /* nothing under the pointer, so draw a rectangle around things */
        marquee = { from: where, to: where };
        picked = [];
        hidePickTools(); sizesFollowPicked();
        draw();
        return;
      }
      const start = at(e);
      clampPoint(start);
      if (SHAPE_ICONS[tool] && tool !== "stamps"){
        const round = start.map(Math.round);
        drawing = { kind:"shape", shape: tool, from: round, to: round.slice(), colour: colour, width: width };
        strokes.push(drawing);
        return;
      }
      drawing = { kind:"line", colour: tool === "rub" ? "#FFFFFF" : colour,
                  width: tool === "rub" ? 24 : width, points: [start] };
      strokes.push(drawing);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (panning){
        view.x = e.clientX - panning.x;
        view.y = e.clientY - panning.y;
        holdInside();
        draw();
        return;
      }
      if (marquee){
        marquee.to = at(e);
        draw();
        return;
      }
      if (reshaping){
        const p = at(e);
        clampPoint(p);
        window.drawKit.handles.move(reshaping, p, true);
        draw();
        return;
      }
      /* the pointer shows what a handle will do before it is pressed */
      if (tool === "pick" && !moving){
        const handle = picked.length === 1 && window.drawKit.handles.hit(picked[0], at(e), 1 / view.scale);
        const f = handle && window.drawKit.frame(picked[0]);
        canvas.style.cursor = handle ? (f ? window.boxKit.cursor(handle, f.rot) : "crosshair") : "";
      }
      if (moving && picked.length){
        const now = at(e);
        picked.forEach(item => shift(item, now[0] - moving[0], now[1] - moving[1]));
        moving = now;
        movePickTools(e);        // the little strip travels with them
        draw();
        return;
      }
      if (!drawing) return;
      const p = at(e);
      clampPoint(p);
      if (drawing.kind === "shape") drawing.to = p.map(Math.round);
      else drawing.points.push(p);
      draw();
    });
    const stop = (e) => {
      /* A shape tapped rather than dragged has no size, and would be an
         invisible thing to select later. */
      if (drawing && drawing.kind === "shape" &&
          Math.abs(drawing.to[0] - drawing.from[0]) + Math.abs(drawing.to[1] - drawing.from[1]) < 4){
        strokes = strokes.filter(x => x !== drawing);
        drawing = null;
        draw();
      }
      if (drawing){ drawing = null; undone = []; ctx.changed(); }
      if (moving){ moving = null; ctx.changed(); }
      if (reshaping){
        reshaping = null;
        ctx.changed();
        if (picked.length && e && e.type === "pointerup") showPickTools(e);
      }
      if (marquee){
        picked = insideBox(marquee);
        marquee = null;
        draw();
        sizesFollowPicked();
        if (picked.length && e) showPickTools(e);
      }
      panning = null;
    };
    /* two quick clicks on writing opens it for changing */
    canvas.addEventListener("dblclick", (e) => {
      const hit = topmostAt(at(e));
      if (hit && hit.kind === "text"){
        picked = [];
        hidePickTools();
        retype(hit);
      }
    });
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointerleave", stop);
    /* Zoom sits on its own buttons: taking over the wheel makes the page
       impossible to scroll past. */
    const zoomBox = make("div", "board-zoom");
    const zoomIn = make("button", "board-tool", "+");
    zoomIn.title = "Zoom in";
    const zoomOut = make("button", "board-tool", "\u2212");
    zoomOut.title = "Zoom out";
    const zoomAt = make("span", "board-zoomat", "100%");
    const setZoom = (next) => {
      /* in tens, so the number shown is always a round one */
      view.scale = Math.max(0.3, Math.min(3, Math.round(next * 10) / 10));
      zoomAt.textContent = Math.round(view.scale * 100) + "%";
      draw();
    };
    zoomIn.addEventListener("click", () => setZoom(view.scale + 0.1));
    zoomOut.addEventListener("click", () => setZoom(view.scale - 0.1));
    zoomBox.appendChild(zoomOut); zoomBox.appendChild(zoomAt); zoomBox.appendChild(zoomIn);
    stage.appendChild(zoomBox);

    /* the tools along the top */
    /* Drawn rather than typed: a character that renders differently on every
       machine is no use as a button. */
    const ICONS = {
      pick: '<svg viewBox="0 0 20 20"><path d="M4 3l12 6-5 1.6L8.6 16z"/></svg>',
      move: '<svg viewBox="0 0 20 20"><path d="M10 2l2.5 2.5h-1.7v4.6h4.6V7.5L18 10l-2.6 2.5v-1.7h-4.6v4.6h1.7L10 18l-2.5-2.6h1.7v-4.6H4.6v1.7L2 10l2.6-2.5v1.7h4.6V4.5H7.5z"/></svg>',
      pen:  '<svg viewBox="0 0 20 20"><path d="M14.5 2.5l3 3L7 16 3 17l1-4z"/></svg>',
      rub:  '<svg viewBox="0 0 20 20"><path d="M8 16H4l-2-2 8-8 6 6-4 4z" opacity=".55"/><path d="M2 17h16v1.6H2z"/></svg>',
      text: '<svg viewBox="0 0 20 20"><path d="M3 3h14v3h-1.6V4.6h-4V16H13v1.5H7V16h1.6V4.6h-4V6H3z"/></svg>',
      undo: '<svg viewBox="0 0 20 20"><path d="M6 7h6a5 5 0 010 10h-3v-2h3a3 3 0 000-6H6v3L1.5 8 6 4z"/></svg>',
      redo: '<svg viewBox="0 0 20 20"><path d="M14 7H8a5 5 0 000 10h3v-2H8a3 3 0 010-6h6v3l4.5-4L14 4z"/></svg>',
      home: '<svg viewBox="0 0 20 20"><path d="M10 2l8 7h-2.4v9h-4v-5h-3.2v5h-4V9H2z"/></svg>',
      wipe: '<svg viewBox="0 0 20 20"><path d="M7 2h6v2h4v2H3V4h4zM5 7h10l-.8 11H5.8z"/></svg>',
      flip: '<svg viewBox="0 0 20 20"><path d="M9 3v14H2zM11 3l7 14h-7z" opacity=".85"/></svg>',
      behind: PIC_ICONS.behind
    };
    function toolBtn(name, label, title){
      const btn = make("button", "board-tool");
      btn.innerHTML = ICONS[name] || SHAPE_ICONS[name] || label;
      btn.title = title || label;
      btn.addEventListener("click", () => {
        tool = name;
        bar.querySelectorAll(".board-tool").forEach(x => x.classList.remove("on"));
        btn.classList.add("on");
        /* the pointer says what will happen when it is pressed */
        stage.dataset.tool = name;
        /* Any other tool lets go of what was picked up, or a drawing dropped
           in a moment ago stays outlined while the next thing is drawn. */
        if (name !== "pick" && picked.length){ picked = []; hidePickTools(); draw(); }
        sizesFollowPicked();
      });
      if (name === "pen") btn.classList.add("on");
      bar.appendChild(btn);
    }
    /* In the order they are reached for, with the pen ready to go. */
    toolBtn("pick", "", "Select things");
    toolBtn("move", "", "Move around the board");
    toolBtn("pen",  "", "Draw");
    toolBtn("rub",  "", "Rub out");
    toolBtn("text", "", "Add words");
    ["rect","ellipse","line","arrow"].forEach(n => toolBtn(n, "", SHAPE_NAMES[n]));

    /* Characters and objects to drag in. Opening the tray picks up the
       select tool too, since what comes next is moving the drawing about. */
    const trayBtn = make("button", "board-tool board-traybtn");
    trayBtn.innerHTML = SHAPE_ICONS.stamps;
    trayBtn.title = "Characters and objects";
    trayBtn.setAttribute("aria-label", "Characters and objects");
    bar.appendChild(trayBtn);
    const tray = window.drawKit.tray(stage, (name, cx, cy) => {
      const rect = stage.getBoundingClientRect();
      const where = cx === null
        ? [(rect.width / 2 - view.x) / view.scale, (rect.height / 2 - view.y) / view.scale]
        : at({ clientX: cx, clientY: cy });
      clampPoint(where);
      const item = { kind:"stamp", name: name, x: Math.round(where[0]), y: Math.round(where[1]), size: 120 };
      strokes.push(item);
      undone = [];
      picked = [item];
      bar.querySelector('.board-tool[title="Select things"]').click();
      draw(); ctx.changed();
    });
    tray.hidden = true;
    inner.insertBefore(tray, stage);
    trayBtn.addEventListener("click", () => {
      tray.hidden = !tray.hidden;
      trayBtn.classList.toggle("open", !tray.hidden);
      setTimeout(fit, 0);
    });

    /* A picture from the internet or the computer, through the same pop-up
       the poster uses. It lands in the middle of what is on screen, picked
       up, so the next thing to do with it is move it. */
    const picBtn = make("button", "board-tool board-picbtn");
    picBtn.innerHTML = PIC_ICONS.add;
    picBtn.title = "Add an image";
    picBtn.setAttribute("aria-label", "Add an image");
    bar.appendChild(picBtn);
    function placePicture(item){
      const rect = stage.getBoundingClientRect();
      const where = [(rect.width / 2 - view.x) / view.scale, (rect.height / 2 - view.y) / view.scale];
      clampPoint(where);
      item.x = Math.round(where[0]); item.y = Math.round(where[1]);
      strokes.push(item);
      undone = [];
      picked = [item];
      bar.querySelector('.board-tool[title="Select things"]').click();
      draw(); ctx.changed();
    }
    const pictureFit = () => {
      const rect = stage.getBoundingClientRect();
      return [Math.max(160, (rect.width || 600) * 0.5 / view.scale), Math.max(120, (rect.height || 400) * 0.6 / view.scale)];
    };
    const boardSay = (text) => {
      const note = make("div", "board-ask");
      note.appendChild(make("p", "", text));
      const ok = make("button", "btn-ghost", "OK");
      ok.addEventListener("click", () => note.remove());
      note.appendChild(ok);
      stage.appendChild(note);
    };
    picBtn.addEventListener("click", () => {
      const fit = pictureFit();
      window.drawKit.pictures.ask([strokes], fit[0], fit[1], placePicture, boardSay);
    });
    window.pictureKit.listen(s, (file) => {
      const fit = pictureFit();
      window.drawKit.pictures.fromFile(file, fit[0], fit[1], placePicture, boardSay, [strokes]);
    });
    document.addEventListener("drawkit-picture", () => { if (s.isConnected) draw(); });

    ["#1D1D1B","#C0392B","#2F6BAE","#2E7D5B","#B8930A"].forEach(c => {
      const dot = make("button", "board-colour");
      dot.style.background = c;
      dot.title = "Draw in this colour";
      dot.addEventListener("click", () => { colour = c; tool = tool === "rub" ? "pen" : tool; });
      bar.appendChild(dot);
    });

    const undo = make("button", "board-tool");
    undo.innerHTML = ICONS.undo;
    undo.title = "Undo";
    undo.addEventListener("click", () => {
      if (!strokes.length) return;
      undone.push(strokes.pop());
      draw(); ctx.changed();
    });
    const redo = make("button", "board-tool");
    redo.innerHTML = ICONS.redo;
    redo.title = "Redo";
    redo.addEventListener("click", () => {
      if (!undone.length) return;
      strokes.push(undone.pop());
      draw(); ctx.changed();
    });
    const reset = make("button", "board-tool");
    reset.innerHTML = ICONS.home;
    reset.title = "Back to the middle";
    reset.addEventListener("click", () => {
      view = { x:0, y:0, scale:1 };
      zoomAt.textContent = "100%";      // the readout has to agree
      draw();
    });

    const wipe = make("button", "board-tool board-wipe");
    wipe.innerHTML = ICONS.wipe;
    wipe.title = "Clear the whole board";
    wipe.addEventListener("click", () => {
      if (!strokes.length) return;
      /* asked here rather than through the browser, and only on this board */
      const ask = make("div", "board-ask");
      ask.appendChild(make("b", "", "Clear the whole board?"));
      ask.appendChild(make("p", "", "Everything drawn here goes. This cannot be undone."));
      const row = make("div", "board-askrow");
      const yes = make("button", "btn-primary", "Clear it");
      yes.style.background = "var(--red)";
      yes.style.borderColor = "var(--red)";
      yes.addEventListener("click", () => {
        undone = strokes.slice();
        strokes = [];
        picked = [];
        ask.remove();
        draw(); ctx.changed();
      });
      const no = make("button", "btn-ghost", "Keep it");
      no.addEventListener("click", () => ask.remove());
      row.appendChild(yes); row.appendChild(no);
      ask.appendChild(row);
      stage.appendChild(ask);
    });

    bar.appendChild(undo); bar.appendChild(redo); bar.appendChild(reset); bar.appendChild(wipe);

    if (b.height) stage.style.height = parseInt(b.height, 10) + "px";
    setTimeout(fit, 0);
    window.addEventListener("resize", fit);
    /* The board can be inside something that opens later or changes size,
       and a canvas measured at the wrong moment cannot be drawn on properly. */
    if (window.ResizeObserver){
      try{ new ResizeObserver(fit).observe(stage); }catch(e){}
    }

    return {
      section: s,
      get: () => {
        const out = { strokes: strokes, view: view };
        const pics = window.drawKit.pictures.keep([strokes]);
        if (pics) out.pics = pics;
        return out;
      },
      set: (v) => {
        if (!v) return;
        window.drawKit.pictures.load(v.pics);
        if (Array.isArray(v.strokes)) strokes = v.strokes;
        if (v.view) view = v.view;
        draw();
      },
      done: () => strokes.length > 0
    };
  };

  /* ===================================================================
     STORYBOARD
     { type:"storyboard", title, task, panels, names:[...], timing, fps,
       minSecs, maxSecs, flip, demo, starter:[{strokes}], keys:[...], speeds:[...] }
     A row of panels, each a small drawing, a sentence and how long it
     lasts. The drawing is kept as strokes, like a whiteboard, so six panels
     are tens of KB rather than six pictures.

     Strokes are stored against a fixed 640 x 360 frame and the canvas is
     stretched by CSS, so a panel drawn on a phone and read on a projector
     lands in the same place. It also means nothing here has to measure the
     canvas before it can draw, which a page that has not been shown yet
     cannot do.

     flip makes it a flip book: pictures only, called frames, played on a loop
     at the speed picked under it. demo takes the drawing tools away as well,
     so a lesson can show an animation moving with no sound and nobody to
     explain it: starter holds the drawings, keys the frames marked as
     keyframes, and nothing is saved.
     =================================================================== */
  const STORY_W = 640, STORY_H = 360;
  /* About 25KB of JSON a panel at most. Nobody drawing a sketch reaches it,
     and it is what stops one student scribbling a panel solid. */
  const STORY_POINTS = 3000;
  const STORY_TEXT = 240;

  function storyPaint(c, strokes, w, h, lit, unit){
    const k = w / STORY_W;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, w, h);
    c.setTransform(k, 0, 0, k, 0, 0);
    c.lineCap = "round"; c.lineJoin = "round";
    (strokes || []).forEach(st => {
      if (window.drawKit.paint(c, st)){
        if (st === lit) window.drawKit.handles.draw(c, st, unit || 1, 0);
        return;
      }
      const pts = st.points || [];
      if (!pts.length) return;
      c.strokeStyle = st.colour || "#1D1D1B";
      c.lineWidth = st.width || 4;
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      /* a round cap on a line of no length is how a single tap makes a dot */
      if (pts.length === 1) c.lineTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.stroke();
    });
  }
  /* For the PDF: the live canvas belongs to one panel at a time. */
  window.storyImage = function(strokes){
    try{
      const cv = document.createElement("canvas");
      cv.width = STORY_W * 1.5; cv.height = STORY_H * 1.5;
      storyPaint(cv.getContext("2d"), strokes, cv.width, cv.height);
      /* JPEG: a PNG off a canvas has transparency, which jsPDF stores
         uncompressed, and six panels came to a 12MB hand-in. The paper is
         always white, so nothing is lost. */
      return cv.toDataURL("image/jpeg", 0.85);
    }catch(e){
      console.warn("storyboard image failed", e);
      return null;
    }
  };
  /* Which frames a panel covers, counted from the seconds of the panels
     before it. Worked out from running totals rather than panel by panel, so
     half seconds at an odd frame rate cannot leave a gap or an overlap. Null
     for a panel with no time on it. */
  window.storyFrames = function(panels, i, fps){
    const secs = (p) => Math.max(0, Number(p && p.secs) || 0);
    if (!secs(panels[i])) return null;
    let before = 0;
    for (let k = 0; k < i; k++) before += secs(panels[k]);
    return { from: Math.round(before * fps) + 1,
             to: Math.round((before + secs(panels[i])) * fps) };
  };
  window.storySeconds = function(panels){
    return (panels || []).reduce((sum, p) => sum + Math.max(0, Number(p && p.secs) || 0), 0);
  };
  const storySaid = (n) => String(Math.round(n * 100) / 100);

  window.rStoryboard = function(b, ctx){
    const flip = b.flip === true, demo = flip && b.demo === true;
    const starter = Array.isArray(b.starter) ? b.starter : [];
    /* A flip book needs more drawings than a plan needs panels. */
    const wanted = Math.max(2, Math.min(flip ? 24 : 12, Number(b.panels) || starter.length || 6));
    const names = Array.isArray(b.names) ? b.names : [];
    const keys = Array.isArray(b.keys) ? b.keys : [];
    const speeds = Array.isArray(b.speeds) && b.speeds.length ? b.speeds : [2, 6, 12];
    let speed = speeds[Math.min(1, speeds.length - 1)];
    const timing = !flip && b.timing !== false;
    const fps = Number(b.fps) || 24;
    const minSecs = Number(b.minSecs) || 0, maxSecs = Number(b.maxSecs) || 0;

    const blank = () => ({ strokes: [], text: "", secs: "" });
    const opening = (i) => Object.assign(blank(),
      starter[i] && Array.isArray(starter[i].strokes)
        ? { strokes: JSON.parse(JSON.stringify(starter[i].strokes)) } : {});
    let panels = Array.from({ length: wanted }, (x, i) => opening(i));
    let at = 0;
    let tool = "pen", colour = "#1D1D1B", width = 4;
    let drawing = null;
    /* What Clear took, so Undo can bring it back. That is what lets Clear go
       without an Are you sure. Not saved: it is only for the next press. */
    const cleared = new Map();

    const s = make("section", "storyboard" + (flip ? " story-flip" : "") + (demo ? " story-demo" : ""));
    const inner = make("div", "story-inner");
    s.appendChild(inner);

    /* --- the tools --- */
    const bar = make("div", "board-bar story-bar");
    bar.hidden = demo;
    inner.appendChild(bar);
    const svg = (d) => '<svg viewBox="0 0 20 20"><path d="' + d + '"/></svg>';
    const toolBtn = (icon, title, fn) => {
      const btn = make("button", "board-tool");
      btn.type = "button";
      btn.innerHTML = icon;
      btn.title = title;
      btn.setAttribute("aria-label", title);
      btn.addEventListener("click", fn);
      bar.appendChild(btn);
      return btn;
    };
    function paintTools(){
      penBtn.classList.toggle("on", tool === "pen");
      rubBtn.classList.toggle("on", tool === "rub");
      moveBtn.classList.toggle("on", tool === "move");
      shapeBtns.forEach(x => x.btn.classList.toggle("on", tool === x.name));
      canvas.dataset.tool = tool;
      thinBtn.classList.toggle("on", width === 4);
      thickBtn.classList.toggle("on", width === 10);
      dots.forEach(d => d.dot.classList.toggle("story-dot-on", (tool === "pen" || !!SHAPE_NAMES[tool]) && colour === d.colour));
    }
    const penBtn = toolBtn(svg("M14.5 2.5l3 3L7 16 3 17l1-4z"), "Draw", () => { tool = "pen"; paintTools(); });
    const rubBtn = toolBtn('<svg viewBox="0 0 20 20"><path d="M8 16H4l-2-2 8-8 6 6-4 4z" opacity=".55"/><path d="M2 17h16v1.6H2z"/></svg>',
                           "Rub out", () => { tool = "rub"; pick(null); paintTools(); });
    /* Picks up a drawing or a shape to drag it somewhere else. */
    const moveBtn = toolBtn(svg("M10 2l2.5 2.5h-1.7v4.6h4.6V7.5L18 10l-2.6 2.5v-1.7h-4.6v4.6h1.7L10 18l-2.5-2.6h1.7v-4.6H4.6v1.7L2 10l2.6-2.5v1.7h4.6V4.5H7.5z"),
                            "Move a drawing or a shape", () => { tool = "move"; paintTools(); });
    const shapeBtns = ["rect","ellipse","line","arrow"].map(n => ({ name: n,
      btn: toolBtn(SHAPE_ICONS[n], SHAPE_NAMES[n], () => { tool = n; pick(null); paintTools(); }) }));
    /* The five the whiteboard has, plus the two a winter scene runs out of
       first. There is no white: the rubber is white, and the paper is. */
    const dots = ["#1D1D1B","#C0392B","#2F6BAE","#2E7D5B","#B8930A","#DC8A3E","#8C5BC4"].map(c => {
      const dot = make("button", "board-colour story-dot");
      dot.type = "button";
      dot.style.background = c;
      dot.title = "Draw in this colour";
      dot.setAttribute("aria-label", "Draw in this colour");
      dot.addEventListener("click", () => {
        colour = c;
        if (tool !== "pen" && !SHAPE_NAMES[tool]) tool = "pen";
        paintTools();
      });
      bar.appendChild(dot);
      return { dot: dot, colour: c };
    });
    const thinBtn = toolBtn('<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.5"/></svg>', "Thin line",
                            () => { width = 4; paintTools(); });
    const thickBtn = toolBtn('<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6"/></svg>', "Thick line",
                             () => { width = 10; paintTools(); });
    toolBtn(svg("M6 7h6a5 5 0 010 10h-3v-2h3a3 3 0 000-6H6v3L1.5 8 6 4z"), "Undo", () => {
      const p = panels[at];
      pick(null);
      if (p.strokes.length) p.strokes.pop();
      else if (cleared.has(p)){ p.strokes = cleared.get(p); cleared.delete(p); }
      else return;
      paintPanel(); ctx.changed();
    });
    const wipeBtn = toolBtn(svg("M7 2h6v2h4v2H3V4h4zM5 7h10l-.8 11H5.8z"), "Clear this drawing", () => {
      const p = panels[at];
      if (!p.strokes.length) return;
      pick(null);
      cleared.set(p, p.strokes);
      p.strokes = [];
      paintPanel(); ctx.changed();
    });
    wipeBtn.classList.add("board-wipe");
    const trayBtn = toolBtn(SHAPE_ICONS.stamps, "Characters and objects", () => {
      tray.hidden = !tray.hidden;
      trayBtn.classList.toggle("open", !tray.hidden);
    });
    trayBtn.classList.add("board-traybtn");
    /* A picture, through the same pop-up the poster uses. It goes on the
       panel on screen, in the middle, picked up with the move tool. */
    const picBtn = toolBtn(PIC_ICONS.add, "Add an image", () => {
      window.drawKit.pictures.ask(panels.map(p => p.strokes), STORY_W * 0.55, STORY_H * 0.7, placePicture, storySay);
    });
    picBtn.classList.add("board-picbtn");

    /* --- the panel being worked on --- */
    const main = make("div", "story-main");
    inner.appendChild(main);
    const paper = make("div", "story-paper");
    main.appendChild(paper);
    const canvas = make("canvas", "story-canvas");
    canvas.width = STORY_W * 1.5; canvas.height = STORY_H * 1.5;
    canvas.setAttribute("role", "img");
    paper.appendChild(canvas);
    const pen = canvas.getContext("2d");
    /* Dropped where it lands, or in the middle for a tap, and picked up
       straight away with the move tool so it can be put in its place. */
    const tray = window.drawKit.tray(canvas, (name, cx, cy) => {
      if (demo) return;
      if (pointsIn(panels[at]) >= STORY_POINTS){
        full.textContent = "This drawing is full. Undo a few things to carry on.";
        full.hidden = false;
        return;
      }
      const p = cx === null ? [STORY_W / 2, STORY_H / 2] : where({ clientX: cx, clientY: cy });
      const item = { kind:"stamp", name: name, x: p[0], y: p[1], size: 110 };
      panels[at].strokes.push(item);
      cleared.delete(panels[at]);
      tool = "move";
      pick(item);
      paintTools();
      paintPanel(); ctx.changed();
    });
    tray.hidden = true;
    inner.insertBefore(tray, main);
    /* What the move tool has hold of, and the small strip of buttons above it. */
    let lit = null;
    const litTools = make("div", "board-picktools story-picktools");
    litTools.hidden = true;
    paper.appendChild(litTools);
    function pick(item){
      lit = item;
      litTools.innerHTML = "";
      litTools.hidden = !item;
      if (!item) return;
      const btn = (label, title, fn, html) => {
        const b2 = make("button", "board-tool", html ? undefined : label);
        b2.type = "button";
        if (html) b2.innerHTML = html;
        b2.title = title;
        b2.setAttribute("aria-label", title);
        b2.addEventListener("pointerdown", (e) => e.stopPropagation());
        b2.addEventListener("click", (e) => { e.stopPropagation(); fn(); paintPanel(); ctx.changed(); });
        litTools.appendChild(b2);
      };
      if (item.kind === "stamp" || item.kind === "photo"){
        btn("\u2212", "Smaller", () => window.drawKit.grow(item, 1 / 1.25, 24, 600));
        btn("+", "Bigger", () => window.drawKit.grow(item, 1.25, 24, 600));
      }
      if (item.kind === "photo") btn("", "Put it behind the drawing", () => {
        panels[at].strokes = [item].concat(panels[at].strokes.filter(x => x !== item));
      }, PIC_ICONS.behind);
      if (item.kind === "stamp"){
        btn("", "Face the other way", () => { item.flip = !item.flip; },
            '<svg viewBox="0 0 20 20"><path d="M9 3v14H2zM11 3l7 14h-7z" opacity=".85"/></svg>');
      }
      btn("", "Remove it", () => {
        panels[at].strokes = panels[at].strokes.filter(x => x !== item);
        pick(null);
      }, '<svg viewBox="0 0 20 20"><path d="M7 2h6v2h4v2H3V4h4zM5 7h10l-.8 11H5.8z"/></svg>');
      placeLitTools();
    }
    /* Above the thing picked up, in the paper's own percentages so it stays
       put whatever size the paper is drawn at. */
    function placeLitTools(){
      if (!lit) return;
      const b = window.drawKit.box(lit);
      litTools.style.left = Math.max(0, Math.min(100, (b[0] + b[2]) / 2 / STORY_W * 100)) + "%";
      litTools.style.top = Math.max(0, b[1] / STORY_H * 100) + "%";
    }
    const full = make("p", "story-full");
    full.hidden = true;
    paper.appendChild(full);
    function storySay(text){ full.textContent = text; full.hidden = !text; }
    function placePicture(item){
      if (demo) return;
      item.x = STORY_W / 2; item.y = STORY_H / 2;
      stopPlay();
      panels[at].strokes.push(item);
      cleared.delete(panels[at]);
      tool = "move";
      pick(item);
      paintTools();
      paintPanel(); ctx.changed();
    }
    if (!demo) window.pictureKit.listen(s, (file) => {
      window.drawKit.pictures.fromFile(file, STORY_W * 0.55, STORY_H * 0.7, placePicture, storySay,
                                       panels.map(p => p.strokes));
    });
    document.addEventListener("drawkit-picture", () => { if (s.isConnected){ paintPanel(); paintStrip(); } });

    const side = make("div", "story-side");
    main.appendChild(side);
    const panelName = make("h4", "story-name");
    side.appendChild(panelName);
    const wordsId = "story-" + (b.id || "t") + "-words";
    const wordsLabel = make("label", "story-label", "What happens?");
    wordsLabel.htmlFor = wordsId;
    side.appendChild(wordsLabel);
    const words = make("textarea", "story-words");
    words.id = wordsId;
    words.rows = 3;
    words.maxLength = STORY_TEXT;
    words.placeholder = "What can we see? What moves?";
    side.appendChild(words);
    wordsLabel.hidden = words.hidden = flip;

    let secsBox = null, framesNote = null;
    if (timing){
      const row = make("label", "story-time");
      row.appendChild(make("span", "story-label", "How long?"));
      secsBox = make("input", "story-secs");
      secsBox.type = "number";
      secsBox.min = "0"; secsBox.max = "60"; secsBox.step = "0.5";
      secsBox.inputMode = "decimal";
      row.appendChild(secsBox);
      row.appendChild(make("span", "story-unit", "seconds"));
      side.appendChild(row);
      framesNote = make("p", "story-frames");
      side.appendChild(framesNote);
    }
    const copyBtn = make("button", "btn-ghost story-copy", "Copy the last drawing");
    copyBtn.type = "button";
    copyBtn.title = "Start from the panel before, then change what has moved";
    side.appendChild(copyBtn);
    const nextBtn = make("button", "btn-ghost story-next", flip ? "Next frame" : "Next panel");
    nextBtn.type = "button";
    side.appendChild(nextBtn);

    /* --- every panel, in order --- */
    const strip = make("div", "story-strip");
    inner.appendChild(strip);
    let thumbs = [];
    const filled = (p) => p.strokes.length > 0 && (flip || String(p.text).trim() !== "");
    const started = (p) => p.strokes.length > 0 || String(p.text).trim() !== "";
    const isKey = (i) => keys.indexOf(i + 1) >= 0;
    const nameOf = (i) => (flip ? "Frame " : "Panel ") + (i + 1) +
      (isKey(i) ? ": a keyframe" : names[i] ? ": " + names[i] : "");

    function buildStrip(){
      strip.innerHTML = "";
      thumbs = panels.map((p, i) => {
        const btn = make("button", "story-thumb");
        btn.type = "button";
        btn.title = nameOf(i);
        const cv = make("canvas");
        cv.width = 192; cv.height = 108;
        btn.appendChild(cv);
        const label = make("span", "story-thumbnum", String(i + 1));
        btn.appendChild(label);
        btn.addEventListener("click", () => { stopPlay(); show(i); });
        strip.appendChild(btn);
        return { btn: btn, c: cv.getContext("2d"), label: label };
      });
    }

    const foot = make("div", "story-foot");
    inner.appendChild(foot);
    const playWords = flip ? "Play" : "Play my storyboard";
    const playBtn = make("button", "btn-primary story-play", playWords);
    playBtn.type = "button";
    foot.appendChild(playBtn);
    /* Changed while it plays, so the same drawings can be felt to speed up. */
    const speedBtns = !flip ? [] : speeds.map(n => {
      const btn = make("button", "btn-ghost story-speed", n + " a second");
      btn.type = "button";
      btn.title = "Play " + n + " frames every second";
      btn.addEventListener("click", () => { speed = n; paintSpeeds(); });
      foot.appendChild(btn);
      return { btn: btn, n: n };
    });
    function paintSpeeds(){
      speedBtns.forEach(x => x.btn.classList.toggle("on", x.n === speed));
    }
    const total = make("p", "story-total");
    foot.appendChild(total);

    function paintThumb(i){
      const t = thumbs[i];
      if (!t) return;
      storyPaint(t.c, panels[i].strokes, 192, 108);
      t.btn.classList.toggle("on", i === at);
      t.btn.classList.toggle("done", !demo && filled(panels[i]));
      t.btn.classList.toggle("key", isKey(i));
      t.label.textContent = (!demo && filled(panels[i]) ? "✓ " : "") + (i + 1);
    }
    function paintTotals(){
      const done = panels.filter(filled).length, all = panels.length;
      if (demo){ total.textContent = all + " frames"; return; }
      /* the same encouragement a written answer gets, and nothing to dismiss */
      const cheer = done === all ? "Looking good!" : done * 2 >= all ? "Keep going!" : "";
      let line = done + " of " + all + (flip ? " frames drawn." : " panels finished.") + (cheer ? " " + cheer : "");
      if (timing){
        const secs = window.storySeconds(panels);
        if (secs > 0){
          line += " It lasts " + storySaid(secs) + (secs === 1 ? " second" : " seconds") +
                  ", which is " + Math.round(secs * fps) + " frames.";
          if (minSecs && secs < minSecs) line += " Aim for at least " + storySaid(minSecs) + " seconds.";
          else if (maxSecs && secs > maxSecs) line += " Try to keep it to " + storySaid(maxSecs) + " seconds.";
        }
      }
      total.textContent = line;
    }
    function paintFrames(){
      if (!framesNote) return;
      const f = window.storyFrames(panels, at, fps);
      framesNote.textContent = f ? "Frames " + f.from + " to " + f.to : "";
    }
    function paintCopy(){
      const before = panels[at - 1];
      copyBtn.hidden = demo || !(before && before.strokes.length && !panels[at].strokes.length);
    }
    /* After anything changes in the panel on screen */
    function paintPanel(){
      if (lit && panels[at].strokes.indexOf(lit) < 0) pick(null);
      storyPaint(pen, panels[at].strokes, canvas.width, canvas.height, lit, storyUnit());
      placeLitTools();
      paintThumb(at);
      paintTotals();
      paintCopy();
      full.hidden = true;
    }
    function show(i){
      const was = at;
      at = Math.max(0, Math.min(panels.length - 1, i));
      if (at !== was) pick(null);
      const p = panels[at];
      panelName.textContent = nameOf(at);
      canvas.setAttribute("aria-label", "Drawing for panel " + (at + 1));
      words.value = p.text;
      if (secsBox) secsBox.value = p.secs === "" ? "" : p.secs;
      nextBtn.hidden = demo || at === panels.length - 1;
      /* Only the two that changed: this runs twelve times a second in a
         flip book, and repainting every thumbnail each time is the slow part. */
      paintThumb(was);
      paintFrames();
      paintPanel();
    }

    words.addEventListener("input", () => {
      panels[at].text = words.value;
      paintThumb(at); paintTotals();
      ctx.changed();
    });
    if (secsBox) secsBox.addEventListener("input", () => {
      const n = Number(secsBox.value);
      panels[at].secs = secsBox.value === "" || !isFinite(n) ? "" : Math.max(0, Math.min(60, n));
      paintFrames(); paintTotals();
      ctx.changed();
    });
    copyBtn.addEventListener("click", () => {
      const before = panels[at - 1];
      if (!before) return;
      panels[at].strokes = JSON.parse(JSON.stringify(before.strokes));
      paintPanel(); ctx.changed();
    });
    nextBtn.addEventListener("click", () => { stopPlay(); show(at + 1); });

    /* --- drawing --- */
    function where(e){
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / (r.width || 1) * STORY_W;
      const y = (e.clientY - r.top) / (r.height || 1) * STORY_H;
      return [ Math.round(Math.max(0, Math.min(STORY_W, x))),
               Math.round(Math.max(0, Math.min(STORY_H, y))) ];
    }
    /* A drawing or a shape counts as a short line towards the limit: it is
       tiny to store, but a panel stacked with hundreds is still too many. */
    const pointsIn = (p) => p.strokes.reduce((n, st) => n + (Array.isArray(st.points) ? st.points.length : 20), 0);
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button || demo) return;
      e.preventDefault();
      stopPlay();
      if (pointsIn(panels[at]) >= STORY_POINTS){
        full.textContent = "This drawing is full. Undo a few lines to carry on.";
        full.hidden = false;
        return;
      }
      try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
      if (tool === "move"){
        const p = where(e), list = panels[at].strokes;
        /* a handle on what is already picked up comes first, as they stick
           out past the drawing they belong to */
        const handle = lit && window.drawKit.handles.hit(lit, p, storyUnit(), 0);
        if (handle){ reshaping = window.drawKit.handles.start(lit, handle); return; }
        let hit = null;
        for (let k = list.length - 1; k >= 0 && !hit; k--)
          if (window.drawKit.has(list[k]) && window.drawKit.hit(list[k], p, 8)) hit = list[k];
        pick(hit);
        dragging = hit ? p : null;
        paintPanel();
        return;
      }
      if (SHAPE_NAMES[tool]){
        const p = where(e);
        drawing = { kind:"shape", shape: tool, from: p, to: p.slice(), colour: colour, width: width };
      } else {
        drawing = { colour: tool === "rub" ? "#FFFFFF" : colour,
                    width: tool === "rub" ? 24 : width, points: [where(e)] };
      }
      panels[at].strokes.push(drawing);
      cleared.delete(panels[at]);
      storyPaint(pen, panels[at].strokes, canvas.width, canvas.height);
    });
    let dragging = null, reshaping = null;
    /* how many of the panel's units one screen pixel is */
    function storyUnit(){
      const w = canvas.getBoundingClientRect().width;
      return w ? STORY_W / w : 1;
    }
    canvas.addEventListener("pointermove", (e) => {
      if (reshaping){
        window.drawKit.handles.move(reshaping, where(e), true);
        storyPaint(pen, panels[at].strokes, canvas.width, canvas.height, lit, storyUnit());
        placeLitTools();
        return;
      }
      if (tool === "move" && !dragging){
        const handle = lit && window.drawKit.handles.hit(lit, where(e), storyUnit(), 0);
        const f = handle && window.drawKit.frame(lit);
        canvas.style.cursor = handle ? (f ? window.boxKit.cursor(handle, f.rot) : "crosshair") : "";
      }
      if (dragging && lit){
        const p = where(e);
        window.drawKit.move(lit, p[0] - dragging[0], p[1] - dragging[1]);
        dragging = p;
        storyPaint(pen, panels[at].strokes, canvas.width, canvas.height, lit, storyUnit());
        placeLitTools();
        return;
      }
      if (!drawing) return;
      if (drawing.kind === "shape"){
        drawing.to = where(e);
        storyPaint(pen, panels[at].strokes, canvas.width, canvas.height);
        return;
      }
      const p = where(e), last = drawing.points[drawing.points.length - 1];
      /* Points closer than this draw the same line and only take up room. */
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 2) return;
      drawing.points.push(p);
      storyPaint(pen, panels[at].strokes, canvas.width, canvas.height);
      if (pointsIn(panels[at]) >= STORY_POINTS) finishLine();
    });
    function finishLine(){
      if (reshaping){ reshaping = null; paintPanel(); ctx.changed(); return; }
      if (dragging){ dragging = null; paintPanel(); ctx.changed(); return; }
      if (!drawing) return;
      /* a shape tapped rather than dragged has no size to see */
      if (drawing.kind === "shape" &&
          Math.abs(drawing.to[0] - drawing.from[0]) + Math.abs(drawing.to[1] - drawing.from[1]) < 4)
        panels[at].strokes = panels[at].strokes.filter(x => x !== drawing);
      drawing = null;
      paintPanel();
      ctx.changed();
    }
    canvas.addEventListener("pointerup", finishLine);
    canvas.addEventListener("pointercancel", finishLine);

    /* --- playing it back ---
       Timers rather than a CSS animation. Every machine in school reports
       prefers-reduced-motion, and style.css turns animations off for that.
       Each panel stays up for as long as it was given, so this is the
       length the plan really is. */
    let playTimer = null;
    function stopPlay(){
      if (playTimer === null) return;
      clearTimeout(playTimer);
      playTimer = null;
      playBtn.textContent = playWords;
      s.classList.remove("story-playing");
    }
    playBtn.addEventListener("click", () => {
      if (playTimer !== null){ stopPlay(); return; }
      const order = panels.map((p, i) => i).filter(i => started(panels[i]));
      if (!order.length){
        total.textContent = "Draw something in a panel first, then press Play.";
        return;
      }
      playBtn.textContent = "Stop";
      s.classList.add("story-playing");
      let n = 0;
      if (flip){
        /* Round and round until stopped, reading the speed each time so a
           new one takes effect at once. A page that has been left stops it:
           offsetParent is empty once the section is out of sight. */
        const turn = () => {
          if (s.offsetParent === null){ stopPlay(); return; }
          show(order[n++ % order.length]);
          playTimer = setTimeout(turn, 1000 / speed);
        };
        turn();
        return;
      }
      const step = () => {
        const i = order[n++];
        show(i);
        const secs = Number(panels[i].secs) || 1;
        playTimer = setTimeout(() => {
          if (n < order.length) step();
          else { stopPlay(); show(order[0]); }
        }, Math.min(secs, 10) * 1000);
      };
      step();
    });

    const paintStrip = () => thumbs.forEach((t, k) => paintThumb(k));
    buildStrip();
    show(0);
    paintStrip();
    paintTools();
    paintSpeeds();

    /* --- all of it on screen at once ---
       The drawing is 16:9 at the full width of its column, so on a wide,
       short laptop screen it alone was taller than the room there is, and
       Play, the speeds and the frames were under the bar along the bottom.
       Scrolling down to press Play, then back up to draw, is not something
       anybody should have to do on every frame of a flip book. So the room
       between the top of the scrolling area and the bottom bar is measured,
       everything that is not the drawing is taken off it, and the drawing
       is made narrow enough that its height fits what is left. Short
       screens also get the compact strip and buttons first. Below
       STORY_LEAST tall the drawing is too small to draw on, and the page
       scrolls rather than shrinking it further. */
    const STORY_LEAST = 170;
    function scroller(){
      for (let e = s.parentElement; e && e !== document.body; e = e.parentElement){
        if (/(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.clientHeight) return e;
      }
      return null;
    }
    let fitting = false;
    function fitHeight(){
      if (fitting || !s.offsetParent) return;
      const box = scroller();
      let room;
      if (box){
        const cs = getComputedStyle(box);
        room = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - 24;
      } else {
        const dock = document.getElementById("dock");
        room = (dock && dock.offsetParent ? dock.getBoundingClientRect().top : window.innerHeight) - 24;
      }
      if (!(room > 0)) return;
      fitting = true;
      try{
        s.classList.toggle("story-tight", room < 640);
        /* measured with nothing held back, so it is what the drawing wants */
        paper.style.maxWidth = "";
        side.style.maxHeight = "";
        const whole = inner.getBoundingClientRect().height;
        const drawn = canvas.getBoundingClientRect().height;
        const sideBox = side.getBoundingClientRect(), paperBox = paper.getBoundingClientRect();
        /* side by side on a laptop, one under the other in a demo or on a phone */
        const beside = !side.hidden && sideBox.height > 0 && Math.abs(sideBox.top - paperBox.top) < 4;
        const row = beside ? Math.max(paperBox.height, sideBox.height) : paperBox.height;
        const rest = whole - row + (paperBox.height - drawn);
        const tall = Math.max(STORY_LEAST, Math.floor(room - rest));
        if (tall < drawn) paper.style.maxWidth = Math.floor(tall * STORY_W / STORY_H + 2) + "px";
        /* the words beside it scroll, rather than stretching the row back out */
        if (beside) side.style.maxHeight = Math.max(STORY_LEAST, Math.min(tall, drawn)) + "px";
      } finally { fitting = false; }
    }
    if (window.ResizeObserver){
      try{
        let lastW = 0, lastH = 0;
        const watch = new ResizeObserver(() => {
          const box = scroller();
          const w = s.clientWidth, h = box ? box.clientHeight : window.innerHeight;
          if (w === lastW && h === lastH) return;
          lastW = w; lastH = h;
          fitHeight();
        });
        watch.observe(s);
        /* the scrolling area is only known once the task is on the page */
        setTimeout(() => { const box = scroller(); if (box) watch.observe(box); fitHeight(); }, 0);
      }catch(e){}
    }
    window.addEventListener("resize", fitHeight);

    return {
      section: s,
      /* A demo is the teacher's drawing, so there is nothing of theirs to keep. */
      get: () => {
        if (demo) return null;
        const out = { panels: panels };
        const pics = window.drawKit.pictures.keep(panels.map(p => p.strokes));
        if (pics) out.pics = pics;
        return out;
      },
      set: (v) => {
        if (demo || !v || !Array.isArray(v.panels)) return;
        window.drawKit.pictures.load(v.pics);
        const got = v.panels.map(p => ({
          strokes: Array.isArray(p && p.strokes) ? p.strokes : [],
          text: String((p && p.text) || "").slice(0, STORY_TEXT),
          secs: (p && p.secs !== "" && p.secs !== undefined && p.secs !== null && isFinite(Number(p.secs)))
                ? Number(p.secs) : ""
        }));
        /* Fewer panels set in the builder after work was saved must not lose
           the ones a student already drew, so the longer of the two wins. */
        while (got.length < wanted) got.push(opening(got.length));
        panels = got;
        cleared.clear();
        buildStrip();
        show(0);
        paintStrip();
      },
      done: () => demo || panels.every(started)
    };
  };

  /* ===================================================================
     LABELLING A PICTURE
     { type:"label", image, words:[...], spots:[{x,y,w,h,answer}] }
     Boxes are drawn on the picture in the builder; students drag a word
     into each one. Everything is a percentage, so it works at any size.
     =================================================================== */
  window.rLabel = function(b, ctx){
    const s = make("section", "labeltask");
    const layout = make("div", "label-layout");
    const holder = make("div", "label-pic");
    const img = make("img");
    img.src = b.image || "";
    img.alt = b.alt || "";
    img.draggable = false;
    holder.appendChild(img);
    layout.appendChild(holder);
    const side = make("div", "label-side");
    layout.appendChild(side);
    s.appendChild(layout);

    const placed = {};        // spot index -> the word in it
    const spots = (b.spots || []).map((sp, i) => {
      const box = make("div", "label-spot");
      box.style.left = sp.x + "%";
      box.style.top = sp.y + "%";
      box.style.width = sp.w + "%";
      box.style.height = sp.h + "%";
      box.dataset.index = String(i);
      holder.appendChild(box);
      return { box, answer: sp.answer };
    });

    const tray = make("div", "label-words");
    side.appendChild(tray);
    const check = make("button", "btn-primary", "Check my labels");
    const note = make("p", "label-note");
    note.hidden = true;
    /* In an assessment the labels are marked when it is handed in. A Check
       button there would tell them which ones to move before they did. */
    if (!(ctx && ctx.assessment)){
      side.appendChild(check);
      side.appendChild(note);
    }

    let right = false;
    function paint(){
      tray.innerHTML = "";
      /* Taken off one at a time rather than looked up, so two boxes wanting
         the same word each have a copy of it to take. */
      const onPicture = Object.values(placed);
      (b.words || []).forEach(word => {
        const at = onPicture.indexOf(word);
        if (at >= 0){ onPicture.splice(at, 1); return; }
        tray.appendChild(make("span", "label-word", word));
      });
      if (!tray.children.length) tray.appendChild(make("span", "hint", "Every word is on the picture."));
      spots.forEach((sp, i) => {
        sp.box.textContent = "";
        if (placed[i]) sp.box.appendChild(make("span", "label-placed", placed[i]));
        sp.box.dataset.filled = placed[i] ? "yes" : "no";
        sp.box.dataset.verdict = "";
      });
    }

    /* Moving a word. Done with pointer events and not the browser's own drag,
       which cannot pick a word back up out of a box, draws its own see-through
       copy that nothing can animate, and does nothing on a touch screen.

       Every movement is el.animate() rather than a CSS transition. Every
       machine in the school reports prefers-reduced-motion, and the blanket
       rule near the top of style.css stops transitions dead, so a transition
       here would look right at home and never run in a classroom. */
    const GLIDE = { duration: 260, easing: "cubic-bezier(.2,.8,.3,1)" };
    const trayChips = () => Array.from(tray.querySelectorAll(".label-word"));

    function flyer(word, at){
      const ghost = make("div", "label-flyer");
      ghost.textContent = word;
      ghost.style.left = at.left + "px";
      ghost.style.top = at.top + "px";
      ghost.style.width = at.width + "px";
      ghost.style.height = at.height + "px";
      /* on the body: a transformed parent would turn fixed into relative */
      document.body.appendChild(ghost);
      return ghost;
    }
    function fly(ghost, from, to, landing){
      landing.style.visibility = "hidden";
      const box = (r) => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
      const land = () => { ghost.remove(); landing.style.visibility = ""; };
      ghost.getAnimations().forEach(a => a.cancel());
      const flight = ghost.animate([box(from), box(to)], { ...GLIDE, fill: "forwards" });
      flight.onfinish = land;
      flight.oncancel = land;
    }
    /* Everything that moves goes through here: the change is made and drawn
       straight away, so what is saved never waits for an animation, and the
       words are then flown from where they were. A move is
       { word, from, to, ghost }, to being a box's index or "tray". */
    function settle(change, moves){
      const wasInTray = trayChips().map(c => ({ word: c.textContent, at: c.getBoundingClientRect() }));
      if (change) change();
      paint();
      trayChips().forEach(chip => {
        const was = wasInTray.findIndex(w => w.word === chip.textContent);
        if (was < 0) return;
        const old = wasInTray.splice(was, 1)[0].at, now = chip.getBoundingClientRect();
        const dx = old.left - now.left, dy = old.top - now.top;
        if (dx || dy) chip.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], GLIDE);
      });
      moves.forEach(m => {
        const inTray = m.to === "tray";
        const landing = inTray ? trayChips().reverse().find(c => c.textContent === m.word && !c.style.visibility)
                               : spots[m.to].box.firstChild;
        if (!landing){ if (m.ghost) m.ghost.remove(); return; }
        const to = (inTray ? landing : spots[m.to].box).getBoundingClientRect();
        fly(m.ghost || flyer(m.word, m.from), m.from, to, landing);
      });
      if (change) ctx.changed();
    }

    let lift = null;          // the word being held, while one is
    function aim(){
      const under = document.elementFromPoint(lift.x, lift.y);
      const box = under && under.closest(".label-spot");
      lift.spot = box && holder.contains(box) ? Number(box.dataset.index) : null;
      lift.side = !!(under && side.contains(under));
      spots.forEach((sp, i) => sp.box.classList.toggle("over", i === lift.spot));
      side.classList.toggle("over", lift.side && lift.from !== "tray");
    }
    /* The browser's drag scrolled by itself near the edge of the page. On a
       phone the words sit below the picture, so without this the top boxes
       cannot be reached with a word in hand. */
    function scrollerOf(n){
      for (n = n.parentElement; n; n = n.parentElement){
        const o = getComputedStyle(n).overflowY;
        if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
      }
      return document.scrollingElement;
    }
    function nudgeScroll(){
      if (!lift || !lift.ghost) return;
      const page = lift.scroller === document.scrollingElement;
      const edges = page ? { top: 0, bottom: innerHeight } : lift.scroller.getBoundingClientRect();
      const by = lift.y < edges.top + 90 ? -9 : lift.y > edges.bottom - 90 ? 9 : 0;
      if (by){ lift.scroller.scrollBy(0, by); aim(); }
      requestAnimationFrame(nudgeScroll);
    }
    function follow(e){
      if (!lift || e.pointerId !== lift.pointer) return;
      lift.x = e.clientX; lift.y = e.clientY;
      const dx = lift.x - lift.startX, dy = lift.y - lift.startY;
      if (!lift.ghost){
        /* a press that wanders a pixel or two is still a press */
        if (Math.hypot(dx, dy) < 5) return;
        lift.ghost = flyer(lift.word, lift.at);
        lift.ghost.classList.add("held");
        lift.ghost.animate([{ transform: "none" }, { transform: "scale(1.06)" }], { duration: 120, fill: "forwards" });
        lift.shown.style.visibility = "hidden";
        if (lift.from !== "tray") spots[lift.from].box.dataset.filled = "no";
        requestAnimationFrame(nudgeScroll);
      }
      lift.ghost.style.left = lift.at.left + dx + "px";
      lift.ghost.style.top = lift.at.top + dy + "px";
      aim();
    }
    function letGo(e){
      if (!lift || e.pointerId !== lift.pointer) return;
      const held = lift;
      lift = null;
      document.removeEventListener("pointermove", follow);
      document.removeEventListener("pointerup", letGo);
      document.removeEventListener("pointercancel", letGo);
      spots.forEach(sp => sp.box.classList.remove("over"));
      side.classList.remove("over");
      const { word, from, ghost } = held;

      /* Pressed and let go without moving: a box gives its word back. */
      if (!ghost){
        if (from !== "tray")
          settle(() => { delete placed[from]; }, [{ word, from: held.at, to: "tray" }]);
        return;
      }
      const was = ghost.getBoundingClientRect();
      const target = e.type === "pointercancel" ? null : held.spot;
      if (target !== null && target !== from){
        const other = placed[target];
        const moves = [{ word, from: was, to: target, ghost }];
        /* the word already there goes where this one came from, so a swap
           between two boxes is a swap, and from the side it goes to the side */
        if (other) moves.push({ word: other, from: spots[target].box.getBoundingClientRect(), to: from });
        settle(() => {
          if (from !== "tray") delete placed[from];
          placed[target] = word;
          if (other && from !== "tray") placed[from] = other;
        }, moves);
      } else if (from !== "tray" && held.side && e.type !== "pointercancel"){
        settle(() => { delete placed[from]; }, [{ word, from: was, to: "tray", ghost }]);
      } else {
        /* let go somewhere that is not a place: it goes back where it was */
        settle(null, [{ word, from: was, to: from, ghost }]);
      }
    }
    s.addEventListener("pointerdown", (e) => {
      if (e.button || lift) return;
      const grabbed = e.target.closest && e.target.closest(".label-word, .label-spot[data-filled=yes]");
      if (!grabbed) return;
      e.preventDefault();
      const inBox = grabbed.classList.contains("label-spot");
      lift = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
               word: grabbed.textContent, from: inBox ? Number(grabbed.dataset.index) : "tray",
               shown: inBox ? grabbed.firstChild : grabbed, at: grabbed.getBoundingClientRect(),
               scroller: scrollerOf(s), ghost: null, spot: null, side: false };
      document.addEventListener("pointermove", follow);
      document.addEventListener("pointerup", letGo);
      document.addEventListener("pointercancel", letGo);
    });

    check.addEventListener("click", () => {
      let got = 0;
      spots.forEach((sp, i) => {
        const ok = placed[i] && String(placed[i]).toLowerCase() === String(sp.answer || "").toLowerCase();
        sp.box.dataset.verdict = ok ? "yes" : placed[i] ? "no" : "";
        if (ok) got++;
      });
      right = got === spots.length && spots.length > 0;
      note.hidden = false;
      note.textContent = got + " of " + spots.length + " in the right place.";
      /* After right is set: what was checked is compared with what is saved. */
      if (ctx.pressed) ctx.pressed();
      if (ctx.tried && !right && ctx.tried(JSON.stringify(placed)) >= 2)
        note.textContent += " You can carry on.";
      ctx.changed();
    });

    paint();
    return {
      section: s,
      get: () => ({ placed: placed, done: right }),
      set: (v) => {
        if (!v || !v.placed) return;
        Object.keys(placed).forEach(k => delete placed[k]);
        Object.keys(v.placed).forEach(k => { placed[k] = v.placed[k]; });
        right = !!v.done;
        paint();
      },
      done: () => right
    };
  };

  /* ===================================================================
     CLICK THE RIGHT SPOT
     { type:"hotspot", image, x, y, r, ratio, shape, w, h }
     The student clicks once on a picture. The right spot is a point, x
     and y as percentages of the picture's width and height, with a circle
     round it r per cent of the picture's width across. ratio is the
     picture's height over its width, so the circle stays a circle on a
     picture that is not square. With shape "rect" it is a rectangle
     instead, centred on the point, w per cent of the width across and h
     per cent of the height down. A circle stretched into an oval has ry
     as well, its half-height in the same units as r; rot turns either
     shape round its middle, in degrees. What they clicked is saved as a
     point, never as a picture.
     =================================================================== */
  window.hotspotHit = function(b, v){
    if (!v || typeof v.x !== "number" || typeof v.y !== "number") return false;
    /* Measured in per cent of the width both ways, so a turn is a true
       turn on a picture that is not square, then turned back upright. */
    const ratio = Number(b.ratio) > 0 ? Number(b.ratio) : 1;
    const a = (Number(b.rot) || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const dx = v.x - Number(b.x || 0), dy = (v.y - Number(b.y || 0)) * ratio;
    const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
    if (b.shape === "rect")
      return Math.abs(lx) <= Number(b.w || 0) / 2 + 1e-9 && Math.abs(ly) <= Number(b.h || 0) / 2 * ratio + 1e-9;
    const rx = Number(b.r || 0), ry = Number(b.ry) > 0 ? Number(b.ry) : rx;
    if (!rx || !ry) return false;
    return (lx / rx) * (lx / rx) + (ly / ry) * (ly / ry) <= 1 + 1e-9;
  };
  /* Lays a ring element over the picture where the right spot is. Its
     height is a share of the picture's height, so an oval's ry, measured
     against the width, is divided by the picture's shape. */
  window.hotspotRing = function(ring, b){
    const ratio = Number(b.ratio) > 0 ? Number(b.ratio) : 1;
    ring.style.left = Number(b.x || 0) + "%";
    ring.style.top = Number(b.y || 0) + "%";
    if (b.shape === "rect"){
      ring.dataset.shape = "rect";
      ring.style.width = Number(b.w || 0) + "%";
      ring.style.height = Number(b.h || 0) + "%";
    } else {
      const r = Number(b.r || 0), ry = Number(b.ry) > 0 ? Number(b.ry) : 0;
      ring.dataset.shape = ry ? "oval" : "circle";
      ring.style.width = 2 * r + "%";
      ring.style.height = ry ? 2 * ry / ratio + "%" : "";
    }
    ring.style.transform = "translate(-50%,-50%) rotate(" + (Number(b.rot) || 0) + "deg)";
  };
  window.rHotspot = function(b, ctx){
    const s = make("section", "hotspottask");
    const holder = make("div", "hotspot-pic");
    /* a picture can be pressed with the keyboard too: Tab to it, the arrow
       keys move the marker, which starts in the middle */
    holder.tabIndex = 0;
    holder.setAttribute("role", "application");
    holder.setAttribute("aria-label", "Click on the picture, or use the arrow keys to move the marker");
    const img = make("img");
    img.src = b.image || "";
    img.alt = b.alt || "";
    img.draggable = false;
    /* The builder measures the picture's shape when the spot is set. A
       lesson written by hand may not say, so it is read off the picture. */
    img.addEventListener("load", () => {
      if (!(Number(b.ratio) > 0) && img.naturalWidth) b.ratio = img.naturalHeight / img.naturalWidth;
    });
    holder.appendChild(img);
    const pin = make("div", "hotspot-pin");
    pin.hidden = true;
    holder.appendChild(pin);
    s.appendChild(holder);
    const said = make("p", "hotspot-said");
    said.hidden = true;

    let at = null;
    let right = false;
    const round = (n) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
    function paint(){
      pin.hidden = !at;
      if (at){ pin.style.left = at.x + "%"; pin.style.top = at.y + "%"; }
    }
    function moved(){
      holder.dataset.verdict = "";
      said.hidden = true;
      right = false;
      paint();
      ctx.changed();
    }
    holder.addEventListener("click", (e) => {
      const r = img.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (e.clientX - r.left) / r.width * 100;
      const y = (e.clientY - r.top) / r.height * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      at = { x: round(x), y: round(y) };
      moved();
    });
    holder.addEventListener("keydown", (e) => {
      const step = { ArrowLeft:[-2,0], ArrowRight:[2,0], ArrowUp:[0,-2], ArrowDown:[0,2] }[e.key];
      if (!step) return;
      e.preventDefault();
      if (!at) at = { x: 50, y: 50 };
      else at = { x: round(at.x + step[0]), y: round(at.y + step[1]) };
      moved();
    });

    /* In a lesson they can check where they clicked and try again. In an
       assessment it is marked when it is handed in, like everything else. */
    if (!(ctx && ctx.assessment)){
      const btn = make("button", "btn-primary hotspot-check", "Check my answer");
      btn.type = "button";
      btn.addEventListener("click", () => {
        said.hidden = false;
        if (!at){ said.dataset.verdict = ""; said.textContent = "Click on the picture first."; return; }
        right = window.hotspotHit(b, at);
        holder.dataset.verdict = right ? "yes" : "no";
        said.dataset.verdict = right ? "yes" : "no";
        said.textContent = right ? "That is the right spot." : "Not quite. Have another go.";
        if (ctx.pressed) ctx.pressed();
        if (ctx.tried && !right && ctx.tried(JSON.stringify(at)) >= 2)
          said.textContent = "Not quite. You can carry on.";
        ctx.changed();
      });
      s.appendChild(btn);
    }
    s.appendChild(said);

    return {
      section: s,
      get: () => at ? { x: at.x, y: at.y } : null,
      set: (v) => {
        if (!v || typeof v.x !== "number" || typeof v.y !== "number") return;
        at = { x: v.x, y: v.y };
        paint();
      },
      done: () => !!at
    };
  };

  /* ===================================================================
     NOTES
     { type:"notes", title, task, starter }
     Somewhere for a student to keep their own notes, with the same
     formatting bar the lesson builder uses.
     =================================================================== */
  /* ===================================================================
     PHOTOSHOP HELP
     { type:"helper", title, task, topic:"photoshop" }
     The help chat from helper.js, on the page like any other task, for a
     lesson done in Photoshop. Nothing is saved and nothing is marked: it is
     there to be asked, and what it is asked stays on the student's computer.
     Set to float, lesson.html puts this same section in a panel behind a
     Help button rather than on its page. The answers are fetched the first
     time one of these is drawn, so a lesson without one never loads them.
     =================================================================== */
  window.rHelper = function(b){
    const s = make("section", "helpertask");
    const box = make("div", "hp-task");
    s.appendChild(box);
    const start = () => {
      box.textContent = "";
      window.hubHelper.mount(box, window.HELP_PHOTOSHOP, {});
    };
    if (!window.hubHelper) box.textContent = "The help could not be loaded.";
    else if (window.HELP_PHOTOSHOP) start();
    else {
      box.textContent = "Loading the help\u2026";
      let tag = document.querySelector('script[data-help-pack]');
      if (!tag){
        tag = document.createElement("script");
        tag.src = "help-photoshop.js";
        tag.dataset.helpPack = "1";
        document.head.appendChild(tag);
      }
      tag.addEventListener("load", start);
      tag.addEventListener("error", () => { box.textContent = "The help could not be loaded. Check the internet connection and refresh."; });
    }
    return {
      section: s,
      get: () => null,
      set: () => {},
      /* never holds anyone up: it is help, not a task to finish */
      done: () => true
    };
  };

  window.rNotes = function(b, ctx){
    const s = make("section", "notestask");
    const inner = make("div", "notes-inner");
    s.appendChild(inner);
    let box;
    if (window.richText){
      box = window.richText(b.starter || "", null, { pictures:false });
      box.classList.add("notes-box");
      inner.appendChild(box);
      box.addEventListener("input", ctx.changed);
    } else {
      /* no formatting available, so a plain box rather than nothing */
      box = make("textarea", "notes-box");
      box.rows = 8;
      box.value = b.starter || "";
      box.addEventListener("input", ctx.changed);
      inner.appendChild(box);
    }
    const count = make("p", "notes-count", "");
    inner.appendChild(count);
    const words = () => {
      const t = box.getHtml ? box.getHtml().replace(/<[^>]*>/g, " ") : box.value;
      return (t.trim().match(/\S+/g) || []).length;
    };
    const tick = () => { count.textContent = words() + " words"; };
    box.addEventListener("input", tick);
    tick();

    return {
      section: s,
      get: () => (box.getHtml ? box.getHtml() : box.value),
      set: (v) => {
        if (v === undefined || v === null) return;
        /* setHtml puts it in the editable part. Setting innerHTML on the
           wrapper would throw the toolbar away with it. */
        if (box.setHtml) box.setHtml(String(v));
        else box.value = String(v);
        tick();
      },
      done: () => words() > 0
    };
  };

  /* ===================================================================
     KEYWORD DEFINITIONS
     { type:"keywords", title, task, words:[{word, hint}] }
     The words down the left, a box beside each for the student to put the
     meaning in their own words. Saved as a list of what they wrote, by
     position, so a teacher can add or reword a keyword later without the
     answers sliding onto the wrong rows.
     =================================================================== */
  window.rKeywords = function(b, ctx){
    const s = make("section", "keywordstask");
    const table = make("div", "kw-table");
    const words = Array.isArray(b.words) ? b.words : [];
    const boxes = [];

    /* A heading row on a wide screen. On a phone the rows stack, and a header
       floating above stacked rows says nothing, so it is hidden there. */
    const head = make("div", "kw-row kw-head");
    head.appendChild(make("div", "kw-word", "Keyword"));
    head.appendChild(make("div", "kw-def", "What it means, in your own words"));
    table.appendChild(head);

    words.forEach((w, i) => {
      const row = make("div", "kw-row");
      const left = make("div", "kw-word");
      left.appendChild(make("b", "", w.word || ""));
      if (w.hint) left.appendChild(make("span", "kw-hint", w.hint));
      row.appendChild(left);

      const right = make("div", "kw-def");
      const box = make("textarea", "kw-box");
      box.rows = 2;
      box.placeholder = "Write what it means";
      box.addEventListener("input", () => { mark(i); ctx.changed(); });
      right.appendChild(box);
      row.appendChild(right);
      table.appendChild(row);
      boxes.push(box);
    });

    if (!words.length) table.appendChild(make("p", "kw-none", "No keywords have been added yet."));
    s.appendChild(table);

    const count = make("p", "kw-count");
    s.appendChild(count);

    /* A row counts as written once there is something in it. Nothing here is
       marked right or wrong: they are their own words, and judging them by
       keyword matching would punish a good definition worded differently. */
    const written = (i) => (boxes[i].value || "").trim().length > 0;
    function mark(i){
      boxes[i].closest(".kw-row").dataset.done = written(i) ? "yes" : "";
      tally();
    }
    function tally(){
      if (!boxes.length) return;
      const n = boxes.filter((_, i) => written(i)).length;
      count.textContent = n + " of " + boxes.length + " written";
      count.dataset.all = n === boxes.length ? "yes" : "";
    }
    tally();

    return {
      section: s,
      get: () => boxes.map(x => x.value),
      set: (v) => {
        if (!Array.isArray(v)) return;
        v.forEach((text, i) => { if (boxes[i]) boxes[i].value = text == null ? "" : String(text); });
        boxes.forEach((_, i) => mark(i));
      },
      done: () => boxes.length > 0 && boxes.every((_, i) => written(i))
    };
  };

  /* ===================================================================
     MINDMAP
     { type:"mindmap", centre, lockCentre, starter:[{id,text,parent,side}] }
     Saved as { nodes:[{ id, text, parent, side }] }: the words and what
     each one hangs off, never where it sits. side is only on the first
     branches, "left" or "right".

     It used to be built out of nested flex boxes with lines drawn by CSS,
     and that was the trouble with it. Both "+" buttons by the middle did
     the same thing and the branches were then shared out half and half, so
     a branch added on the left could turn up on the right and push one
     already there across. The lines were drawn to where a box was expected
     to be rather than where it was, and the buttons only showed on hover,
     on top of the next branch along, which a tablet cannot do at all.

     Now every box is placed by layout() from the sizes the words need, and
     the lines are drawn between the places it worked out, so they meet.
     Each first branch keeps the side it was added on. Below 620 pixels
     across, a map with two sides does not fit, so it is laid out as a tree
     down the page instead, from the same data.
     =================================================================== */
  const MAP_COLOURS = ["#2F6BAE","#C0392B","#2E7D5B","#8C5BC4","#DC8A3E","#1F8A8A","#B8930A","#D35D8A"];
  const MAP_MOST = 60;          // boxes in one map, the middle included
  const MAP_DEEP = 3;           // a branch, a branch off that, and one more
  const MAP_WORDS = 80;         // characters in one box

  window.rMindmap = function(b, ctx){
    const s = make("section", "mindmap");
    const bar = make("div", "map-bar");
    const hint = make("p", "map-hint",
      "Press + to add a branch. Press Enter in a box to add another one beside it.");
    const undoBtn = make("button", "btn-ghost map-undo", "Undo");
    undoBtn.type = "button";
    undoBtn.disabled = true;
    bar.appendChild(hint);
    bar.appendChild(undoBtn);
    s.appendChild(bar);
    const holder = make("div", "map-holder");
    const sizer = make("div", "map-sizer");
    const board = make("div", "map-board");
    const NS = "http://www.w3.org/2000/svg";
    const lines = document.createElementNS(NS, "svg");
    lines.setAttribute("class", "map-lines");
    lines.setAttribute("aria-hidden", "true");
    board.appendChild(lines);
    sizer.appendChild(board);
    holder.appendChild(sizer);
    s.appendChild(holder);
    const full = make("p", "map-full");
    full.hidden = true;
    s.appendChild(full);

    let nodes = [];
    let nextId = 1;
    const history = [];
    const boxes = new Map();      // id -> { wrap, text, add, del }
    const rootAdds = { left: null, right: null };

    const rootOf = () => nodes.find(n => n.parent === null);
    const kidsOf = (id) => nodes.filter(n => n.parent === id);
    const byId = (id) => nodes.find(n => n.id === id);
    function depthOf(n){
      let d = 0, at = n;
      while (at && at.parent !== null && d < 20){ at = byId(at.parent); d++; }
      return d;
    }
    /* The first branch a box belongs to, which decides its colour and side. */
    function limbOf(n){
      let at = n;
      while (at && at.parent !== null){
        const up = byId(at.parent);
        if (!up || up.parent === null) return at;
        at = up;
      }
      return null;
    }
    function colourOf(n){
      const limb = limbOf(n);
      if (!limb) return "";
      const firsts = kidsOf(rootOf().id);
      return MAP_COLOURS[Math.max(0, firsts.indexOf(limb)) % MAP_COLOURS.length];
    }

    /* Anything handed over is made safe to draw: one middle, every box
       hanging off something that exists, and a side on every first branch.
       Old saved maps have no sides, so they alternate, starting on the
       right, which is what they looked like before. */
    function tidy(list){
      const out = [];
      const seen = new Set();
      (Array.isArray(list) ? list : []).forEach(n => {
        if (!n || n.id === undefined || n.id === null || seen.has(String(n.id))) return;
        seen.add(String(n.id));
        out.push({ id: String(n.id), text: String(n.text || "").slice(0, MAP_WORDS),
                   parent: n.parent === null || n.parent === undefined ? null : String(n.parent),
                   side: n.side === "left" || n.side === "right" ? n.side : undefined });
      });
      let root = out.find(n => n.parent === null);
      if (!root){
        root = { id: "root", text: b.centre || "", parent: null };
        out.unshift(root);
      }
      /* a second middle, or a box whose branch has gone, hangs off the middle */
      const ids = new Set(out.map(n => n.id));
      out.forEach(n => { if (n !== root && (n.parent === null || !ids.has(n.parent) || n.parent === n.id)) n.parent = root.id; });
      let flip = 0;
      out.forEach(n => {
        if (n.parent === root.id){ if (!n.side) n.side = flip % 2 ? "left" : "right"; flip++; }
        else delete n.side;
      });
      return out.slice(0, MAP_MOST);
    }

    function newId(){ return "n" + (nextId++) + "-" + Date.now().toString(36); }
    function remember(){
      history.push(JSON.stringify(nodes));
      if (history.length > 40) history.shift();
      undoBtn.disabled = false;
    }
    function say(text){ full.textContent = text; full.hidden = !text; }

    /* --- adding and taking away --- */
    function addUnder(parent, side, after){
      if (nodes.length >= MAP_MOST){ say("This mind map is full. Remove a branch to add another."); return null; }
      if (parent.parent !== null && depthOf(parent) >= MAP_DEEP) return null;
      remember();
      const n = { id: newId(), text: "", parent: parent.id };
      if (parent.parent === null) n.side = side || quieterSide();
      /* straight after the box Enter was pressed in, so it lands beside it */
      const at = after ? nodes.indexOf(after) : -1;
      if (at >= 0) nodes.splice(at + 1, 0, n); else nodes.push(n);
      paint();
      ctx.changed();
      focusOn(n);
      return n;
    }
    /* Enter in the middle adds to whichever side has less on it. */
    function quieterSide(){
      const firsts = kidsOf(rootOf().id);
      const right = firsts.filter(n => n.side === "right").length;
      return right > firsts.length - right ? "left" : "right";
    }
    function remove(n){
      if (n.parent === null) return;
      remember();
      const doomed = new Set([n.id]);
      let grew = true;
      while (grew){
        grew = false;
        nodes.forEach(x => { if (x.parent !== null && doomed.has(x.parent) && !doomed.has(x.id)){ doomed.add(x.id); grew = true; } });
      }
      /* where the typing goes next: the box before it, or what it hung off */
      const sibs = kidsOf(n.parent);
      const before = sibs[sibs.indexOf(n) - 1];
      nodes = nodes.filter(x => !doomed.has(x.id));
      say("");
      paint();
      ctx.changed();
      focusOn(before || byId(n.parent));
    }
    function focusOn(n){
      const box = n && boxes.get(n.id);
      if (!box) return;
      /* without preventScroll the page jumps to put the box at the top */
      try{ box.text.focus({ preventScroll: true }); }catch(e){ box.text.focus(); }
      const end = box.text.value.length;
      try{ box.text.setSelectionRange(end, end); }catch(e){}
    }
    undoBtn.addEventListener("click", () => {
      const last = history.pop();
      undoBtn.disabled = !history.length;
      if (!last) return;
      nodes = JSON.parse(last);
      say("");
      paint();
      ctx.changed();
    });

    /* --- the boxes themselves --- */
    function plusButton(title, fn){
      const btn = make("button", "map-add", "+");
      btn.type = "button";
      btn.title = title;
      btn.setAttribute("aria-label", title);
      btn.addEventListener("click", fn);
      board.appendChild(btn);
      return btn;
    }
    function boxFor(n){
      if (boxes.has(n.id)) return boxes.get(n.id);
      const isRoot = n.parent === null;
      const wrap = make("div", "map-node" + (isRoot ? " is-centre" : ""));
      const text = make("textarea", "map-text");
      text.rows = 1;
      text.maxLength = MAP_WORDS;
      text.spellcheck = true;
      text.value = n.text;
      text.setAttribute("aria-label", isRoot ? "The idea in the middle" : "A branch");
      text.readOnly = isRoot && b.lockCentre === true;
      wrap.appendChild(text);
      const box = { wrap: wrap, text: text, add: null, del: null, node: n };
      text.addEventListener("focus", () => { box.typedFrom = text.value; });
      text.addEventListener("input", () => {
        /* one undo step for a run of typing, taken as it starts */
        if (box.typedFrom !== undefined && box.typedFrom === box.node.text){
          history.push(JSON.stringify(nodes));
          undoBtn.disabled = false;
          box.typedFrom = undefined;
        }
        /* a pasted line break would make a box no layout expects */
        if (/\n/.test(text.value)) text.value = text.value.replace(/\s*\n\s*/g, " ");
        box.node.text = text.value;
        layout();
        ctx.changed();
      });
      text.addEventListener("keydown", (e) => {
        const me = box.node;
        if (e.key === "Enter"){
          e.preventDefault();
          if (me.parent === null) addUnder(me, quieterSide());
          else addUnder(byId(me.parent), me.side, me);
        } else if (e.key === "Backspace" && me.parent !== null && !text.value && !kidsOf(me.id).length){
          e.preventDefault();
          remove(me);
        }
      });
      if (!isRoot){
        const del = make("button", "map-del", "✕");
        del.type = "button";
        del.title = "Remove this branch and anything on it";
        del.setAttribute("aria-label", del.title);
        /* pressed before the box loses the focus, or it vanishes first */
        del.addEventListener("pointerdown", (e) => e.preventDefault());
        del.addEventListener("click", () => remove(box.node));
        wrap.appendChild(del);
        box.del = del;
        box.add = plusButton("Add a branch coming off this one", () => addUnder(box.node));
      }
      board.appendChild(wrap);
      boxes.set(n.id, box);
      return box;
    }

    /* --- how much room the words take --- */
    let ruler = null;
    function textWidth(str, el){
      if (!ruler) ruler = document.createElement("canvas").getContext("2d");
      const cs = getComputedStyle(el);
      ruler.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      return ruler.measureText(str).width;
    }
    /* Fits the box to its words: wider up to a limit, then onto a second line. */
    function fitBox(box, most){
      const n = box.node, isRoot = n.parent === null;
      const least = isRoot ? 150 : 96;
      const el = box.text;
      const shown = el.value || el.placeholder || "";
      const pad = 30;
      const w = Math.round(Math.max(least, Math.min(most, textWidth(shown, el) + pad + 4)));
      el.style.width = w + "px";
      el.style.height = "auto";
      /* a box on a page not shown yet measures nothing, so it is guessed */
      /* scrollHeight leaves out the border, and the box's height includes it */
      let h = el.scrollHeight ? el.scrollHeight + (el.offsetHeight - el.clientHeight) : 0;
      if (!h){
        const line = isRoot ? 26 : 21;
        h = Math.ceil(Math.max(1, (textWidth(shown, el) + pad) / Math.max(40, w - pad))) * line + (isRoot ? 22 : 16);
      }
      h = Math.max(isRoot ? 50 : 38, h);
      el.style.height = h + "px";
      return { w: w, h: h };
    }

    /* --- where everything goes --- */
    const GAP_OUT = 64;      // from the middle out to the first branches
    const GAP_X = 50;        // between a branch and the ones off it
    const GAP_Y = 12;        // between one branch and the next down
    const PLUS = 26;         // the + on the end of a branch
    const INDENT = 30;       // each step in on a phone
    let narrow = false;

    function layout(){
      const root = rootOf();
      if (!root) return;
      const avail = holder.clientWidth || s.clientWidth || 900;
      narrow = avail < 620;
      s.classList.toggle("map-narrow", narrow);
      const size = {};
      nodes.forEach(n => {
        const d = depthOf(n);
        const most = narrow ? Math.max(120, Math.min(260, avail - 30 - d * INDENT - PLUS - 16))
                            : (n.parent === null ? 240 : 190);
        size[n.id] = fitBox(boxes.get(n.id), most);
      });
      const pos = {};
      if (narrow){
        /* a tree down the page: each box under the one it hangs off */
        let y = 0;
        const place = (n, d) => {
          pos[n.id] = { x: d * INDENT, y: y, w: size[n.id].w, h: size[n.id].h, d: d };
          y += size[n.id].h + (d === 0 ? 16 : 10);
          kidsOf(n.id).forEach(k => place(k, d + 1));
        };
        place(root, 0);
      } else {
        /* How tall each branch is with everything on it, so the ones off
           a branch are centred on it and nothing overlaps. */
        const tall = {};
        const measure = (n) => {
          const kids = kidsOf(n.id);
          const under = kids.reduce((a, k) => a + measure(k), 0) + GAP_Y * Math.max(0, kids.length - 1);
          return (tall[n.id] = Math.max(size[n.id].h, under));
        };
        const place = (n, dir, edge, top, d) => {
          const w = size[n.id].w, h = size[n.id].h, mid = top + tall[n.id] / 2;
          const x = dir > 0 ? edge : edge - w;
          pos[n.id] = { x: x, y: mid - h / 2, w: w, h: h, dir: dir, d: d };
          const kids = kidsOf(n.id);
          const under = kids.reduce((a, k) => a + tall[k.id], 0) + GAP_Y * Math.max(0, kids.length - 1);
          let y = mid - under / 2;
          const next = dir > 0 ? x + w + GAP_X : x - GAP_X;
          kids.forEach(k => { place(k, dir, next, y, d + 1); y += tall[k.id] + GAP_Y; });
        };
        const rw = size[root.id].w, rh = size[root.id].h;
        pos[root.id] = { x: -rw / 2, y: -rh / 2, w: rw, h: rh, d: 0 };
        ["right", "left"].forEach(side => {
          const firsts = kidsOf(root.id).filter(n => n.side === side);
          const dir = side === "right" ? 1 : -1;
          firsts.forEach(measure);
          /* the first branches a little further apart than the rest */
          const gap = GAP_Y + 8;
          const total = firsts.reduce((a, k) => a + tall[k.id], 0) + gap * Math.max(0, firsts.length - 1);
          let y = -total / 2;
          firsts.forEach(k => { place(k, dir, dir * (rw / 2 + GAP_OUT), y, 1); y += tall[k.id] + gap; });
        });
      }

      /* Where each + goes: on the outside end of its box, which is where a
         branch off it will leave from. */
      const plus = {};
      nodes.forEach(n => {
        const p = pos[n.id];
        if (n.parent === null || p.d >= MAP_DEEP) return;
        plus[n.id] = { x: narrow || p.dir > 0 ? p.x + p.w + 6 : p.x - 6 - PLUS, y: p.y + p.h / 2 - PLUS / 2 };
      });
      const rp = pos[root.id];
      const rootPlus = { right: { x: rp.x + rp.w + 8, y: rp.y + rp.h / 2 - PLUS / 2 },
                         left: narrow ? null : { x: rp.x - 8 - PLUS, y: rp.y + rp.h / 2 - PLUS / 2 } };

      /* everything moved so the top left corner is at the edge of the board */
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      const reach = (x, y, w, h) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h); };
      Object.values(pos).forEach(p => reach(p.x, p.y, p.w, p.h));
      Object.values(plus).concat([rootPlus.right, rootPlus.left]).forEach(q => { if (q) reach(q.x, q.y, PLUS, PLUS); });
      const PAD = 10;
      const W = Math.ceil(x2 - x1 + PAD * 2), H = Math.ceil(y2 - y1 + PAD * 2);
      const dx = PAD - x1, dy = PAD - y1;
      Object.values(pos).forEach(p => { p.x += dx; p.y += dy; });
      Object.values(plus).concat([rootPlus.right, rootPlus.left]).forEach(q => { if (q){ q.x += dx; q.y += dy; } });

      /* the boxes */
      nodes.forEach(n => {
        const p = pos[n.id], box = boxes.get(n.id);
        box.wrap.style.left = p.x + "px";
        box.wrap.style.top = p.y + "px";
        box.wrap.classList.toggle("is-left", !narrow && p.dir < 0);
        box.wrap.classList.toggle("is-first", p.d === 1);
        box.wrap.classList.toggle("is-deep", p.d > 1);
        const c = colourOf(n);
        if (c) box.wrap.style.setProperty("--branch", c); else box.wrap.style.removeProperty("--branch");
        if (box.add){
          /* Only as deep as a map can usefully go. Past that the + is gone
             rather than greyed, since there is nothing it could ever do. */
          const q = plus[n.id];
          box.add.hidden = !q;
          if (q){ box.add.style.left = q.x + "px"; box.add.style.top = q.y + "px"; }
          if (c) box.add.style.setProperty("--branch", c);
        }
      });
      rootAdds.right.style.left = rootPlus.right.x + "px";
      rootAdds.right.style.top = rootPlus.right.y + "px";
      rootAdds.right.title = narrow ? "Add a branch" : "Add a branch on the right";
      rootAdds.right.setAttribute("aria-label", rootAdds.right.title);
      rootAdds.left.hidden = !rootPlus.left;
      if (rootPlus.left){
        rootAdds.left.style.left = rootPlus.left.x + "px";
        rootAdds.left.style.top = rootPlus.left.y + "px";
      }

      /* the lines, drawn between where the boxes really are */
      lines.setAttribute("width", W); lines.setAttribute("height", H);
      lines.setAttribute("viewBox", "0 0 " + W + " " + H);
      let svg = "";
      /* Down the page, every line from the middle runs down the same trunk.
         Drawn last first, each stretch of trunk shows the branch it leads to,
         rather than the last branch's colour covering the whole of it. */
      (narrow ? nodes.slice().reverse() : nodes).forEach(n => {
        if (n.parent === null) return;
        const p = pos[n.id], up = pos[n.parent];
        if (!p || !up) return;
        const c = colourOf(n) || "#8A8A85";
        const thick = p.d === 1 ? 4 : p.d === 2 ? 2.6 : 1.8;
        let d;
        if (narrow){
          const x = up.x + 16, top = up.y + up.h, y = p.y + p.h / 2;
          d = "M" + x + " " + top + "V" + (y - 8) + "Q" + x + " " + y + " " + (x + 8) + " " + y + "H" + p.x;
        } else {
          const fromX = p.dir > 0 ? up.x + up.w : up.x;
          const fromY = up.y + up.h / 2;
          const toX = p.dir > 0 ? p.x : p.x + p.w;
          const toY = p.y + p.h / 2;
          const bend = (toX - fromX) / 2;
          d = "M" + fromX + " " + fromY + "C" + (fromX + bend) + " " + fromY + " " + (toX - bend) + " " + toY + " " + toX + " " + toY;
        }
        svg += '<path d="' + d + '" stroke="' + c + '" stroke-width="' + thick + '" fill="none" stroke-linecap="round"/>';
      });
      lines.innerHTML = svg;

      /* Smaller to fit rather than a sideways scroll, down to where the
         words are still easy to read. Past that it scrolls. */
      board.style.width = W + "px";
      board.style.height = H + "px";
      const k = Math.max(0.7, Math.min(1, (avail - 4) / W));
      board.style.transform = k < 1 ? "scale(" + k + ")" : "";
      sizer.style.width = Math.ceil(W * k) + "px";
      sizer.style.height = Math.ceil(H * k) + "px";
    }

    /* Boxes are kept between paints, so typing in one is never interrupted
       by it being made again. */
    function paint(){
      const keep = new Set(nodes.map(n => n.id));
      boxes.forEach((box, id) => {
        if (keep.has(id)) return;
        box.wrap.remove();
        if (box.add) box.add.remove();
        boxes.delete(id);
      });
      nodes.forEach(n => {
        const box = boxFor(n);
        box.node = n;                 // undo hands back new objects with the same ids
        if (box.text.value !== n.text) box.text.value = n.text;
        box.text.placeholder = n.parent === null ? (b.centre ? "" : "The big idea")
                             : depthOf(n) === 1 ? "A branch" : "An idea";
      });
      layout();
    }

    rootAdds.right = plusButton("Add a branch on the right", () => addUnder(rootOf(), narrow ? quieterSide() : "right"));
    rootAdds.left = plusButton("Add a branch on the left", () => addUnder(rootOf(), "left"));
    rootAdds.right.classList.add("map-add-root");
    rootAdds.left.classList.add("map-add-root");

    nodes = tidy(Array.isArray(b.starter) && b.starter.length ? JSON.parse(JSON.stringify(b.starter)) : []);
    paint();

    /* A page not on screen yet has no width, so it is laid out again once
       it has one, and again when the fonts arrive and the words change size. */
    if (window.ResizeObserver){
      let lastW = 0;
      try{ new ResizeObserver(() => {
        const w = holder.clientWidth;
        if (w && w !== lastW){ lastW = w; layout(); }
      }).observe(holder); }catch(e){}
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());

    return {
      section: s,
      get: () => ({ nodes: nodes.map(n => {
        const o = { id: n.id, text: n.text, parent: n.parent };
        if (n.side) o.side = n.side;
        return o;
      }) }),
      set: (v) => {
        if (!v || !Array.isArray(v.nodes) || !v.nodes.length) return;
        nodes = tidy(v.nodes);
        history.length = 0;
        undoBtn.disabled = true;
        paint();
      },
      done: () => nodes.filter(n => n.parent !== null && String(n.text).trim()).length > 0
    };
  };

  /* ===================================================================
     TABLE
     { type:"table", title, task, head:[...],
       rows: [ [ {t:"18"}, {t:"360", fill:true}, ... ], ... ] }

     A table with some of it already filled in and some of it for the
     student to complete: a trace table, a conversion table, a "state the
     output for each of these" table. It is the shape a KS4 worksheet is
     most often in and the one shape the site had no task for, so a whole
     worksheet had to become a written answer with the table described in
     words.

     A cell is either given or blank:
       { t:"18" }               shown, and cannot be typed in
       { t:"360", fill:true }   a box, and 360 is the answer
       { t:"",    fill:true }   a box with no right answer, read by a teacher
       also: ["..."]            more answers a box accepts, beside its own

     Any cell can carry a picture as well, given or a box: imgId for one
     uploaded to the images table, url for an address (or a data: address
     in a file not yet imported). The picture sits above the cell's words
     or its box, so a row of logos can each have a box to name it.

     Marking is shortmatch, the same comparison Short answers use, so "8"
     and " 8 " are the same answer and nothing is marked right for merely
     containing the right characters. A cell with no answer on it is never
     marked, and a table with no answers anywhere has no Check button at
     all: it is then a worksheet to be read, which is a perfectly good
     thing for it to be.

     How it is laid out, all optional:
       widths:  [ "", "narrow", "wide", ... ]  one per column, "" is auto
       lines:   [ 1, 3, ... ]                  one per row, how tall it is
       sideHead: true                          the first column is headings
     A row taller than one line gets boxes that take more than one line,
     because "explain what this line does" does not fit in a box sized
     for a number.
     =================================================================== */
  /* rem, not em: a heading cell and a body cell are set in different sizes,
     and a column has to be one width all the way down. */
  const TT_WIDTHS = { narrow: "4.5rem", medium: "9rem", wide: "15rem", wider: "24rem" };
  /* The lesson page's own pictureSrc turns an id into an address on this
     server; anything else (the builder's preview of one cell) falls back to
     the address itself. */
  function cellPicture(cell){
    if (!cell || (!cell.imgId && !cell.url)) return null;
    const src = typeof window.pictureSrc === "function" ? window.pictureSrc(cell) : (cell.url || "");
    if (!src) return null;
    const img = make("img", "tt-pic");
    img.src = src;
    /* Under a box, the words in it are the answer, so the picture is not
       described by them; a given cell's words are its caption. */
    img.alt = !cell.fill && String(cell.t || "").trim() ? String(cell.t).trim() : "Picture";
    img.loading = "lazy";
    img.draggable = false;
    return img;
  }
  window.rTable = function(b, ctx){
    const s = make("section", "tabletask");
    const head = Array.isArray(b.head) ? b.head : [];
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const widths = Array.isArray(b.widths) ? b.widths : [];
    const lines = Array.isArray(b.lines) ? b.lines : [];
    const linesOf = (r) => Math.min(Math.max(parseInt(lines[r], 10) || 1, 1), 6);
    /* A set width goes on every cell of the column, not just the heading:
       a table with no heading row still has to honour it. */
    const sizeCell = (cell, c) => {
      const w = TT_WIDTHS[widths[c]];
      if (w){ cell.style.width = w; cell.dataset.sized = ""; }
    };
    const boxes = [];                 // one per fillable cell, in order

    /* A table on a phone is the one thing that genuinely cannot be made
       narrower, so it scrolls sideways inside its own box rather than
       pushing the whole page wide. */
    const scroller = make("div", "tt-scroll");
    const table = make("table", "tt");
    if (head.length){
      const thead = make("thead");
      const tr = make("tr");
      head.forEach((h, c) => {
        const th = make("th", "", String(h == null ? "" : h));
        sizeCell(th, c);
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    const body = make("tbody");
    rows.forEach((row, r) => {
      const tr = make("tr");
      const tall = linesOf(r);
      if (tall > 1){ tr.className = "tt-tall"; tr.style.setProperty("--tt-lines", tall); }
      (Array.isArray(row) ? row : []).forEach((cell, c) => {
        const want = cell && typeof cell === "object" ? cell : { t: String(cell == null ? "" : cell) };
        /* A heading down the side is only ever a given cell. One the
           teacher left as a box stays a box, or it would vanish. */
        const td = make(b.sideHead && c === 0 && !want.fill ? "th" : "td");
        if (td.tagName === "TH") td.scope = "row";
        sizeCell(td, c);
        const pic = cellPicture(want);
        if (pic) td.appendChild(pic);
        if (want.fill){
          td.className = "tt-fill";
          const input = make(tall > 1 ? "textarea" : "input", "tt-in");
          if (tall > 1) input.rows = tall; else input.type = "text";
          input.autocomplete = "off"; input.autocapitalize = "off"; input.spellcheck = false;
          const side = b.sideHead && c > 0 && row[0] && !row[0].fill ? String(row[0].t || "") : "";
          input.setAttribute("aria-label",
            (head[c] ? head[c] + ", " : "") + (side || "row " + (r + 1)));
          input.addEventListener("input", () => { td.dataset.verdict = ""; ctx.changed(); });
          td.appendChild(input);
          boxes.push({ input: input, td: td, answer: String(want.t == null ? "" : want.t).trim(), cell: want });
        } else if (pic){
          /* Under a picture the words are its caption. */
          const said = String(want.t == null ? "" : want.t);
          if (said.trim()) td.appendChild(make("span", "tt-cap", said));
        } else {
          td.textContent = String(want.t == null ? "" : want.t);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    scroller.appendChild(table);
    s.appendChild(scroller);

    const markable = boxes.filter(x => x.answer);
    const fb = make("p", "tt-said");
    fb.hidden = true;
    /* An assessment marks the table when it is handed in, so it has no Check
       button of its own: one would put the answers on screen during the test. */
    if (markable.length && !(ctx && ctx.assessment)){
      const row = make("div", "tt-actions");
      const btn = make("button", "btn-primary tt-check", "Check the table");
      btn.addEventListener("click", () => {
        if (ctx.pressed) ctx.pressed();
        let right = 0;
        boxes.forEach(x => {
          if (!x.answer){ x.td.dataset.verdict = ""; return; }
          const ok = window.shortAnswer.mark(window.shortAnswer.forCell(x.cell), x.input.value).ok;
          x.td.dataset.verdict = x.input.value.trim() ? (ok ? "right" : "wrong") : "";
          if (ok) right++;
        });
        fb.hidden = false;
        fb.textContent = right === markable.length
          ? "All " + markable.length + " right."
          : right + " out of " + markable.length + " right so far. Have another go at the others.";
        fb.dataset.stage = right === markable.length ? "all" : right ? "some" : "none";
        /* A Cover lesson has nobody to ask, so two goes with something
           different in the boxes brings the answers out. */
        if (ctx.tried && right < markable.length &&
            ctx.tried(boxes.map(x => x.input.value.trim().toLowerCase()).join("|")) >= 2)
          fb.textContent = "Here are the answers: " + markable.map(x => x.cell.t).join(", ") + ". Type them in and press Check the table.";
        ctx.changed();
      });
      row.appendChild(btn);
      s.appendChild(row);
    }
    s.appendChild(fb);

    const written = () => boxes.filter(x => x.input.value.trim()).length;
    return {
      section: s,
      get: () => boxes.map(x => x.input.value),
      set: (v) => {
        if (!Array.isArray(v)) return;
        /* What this saves is a flat list, one answer per box. Work can also
           arrive as the whole grid, a row for each row of the table with
           the given cells in it too, heading row first. Read that as a flat
           list and every box got a whole row joined with commas: ",101"
           where "101" was typed. So a grid is read by where each box sits. */
        if (v.some(Array.isArray)){
          const skip = head.length && v.length === rows.length + 1 ? 1 : 0;
          let n = 0;
          rows.forEach((row, r) => {
            (Array.isArray(row) ? row : []).forEach((cell, c) => {
              if (!(cell && typeof cell === "object" && cell.fill)) return;
              const line = v[r + skip];
              const text = Array.isArray(line) ? line[c] : "";
              if (boxes[n]) boxes[n].input.value = text == null ? "" : String(text);
              n++;
            });
          });
          return;
        }
        v.forEach((text, i) => { if (boxes[i]) boxes[i].input.value = text == null ? "" : String(text); });
      },
      done: () => boxes.length > 0 && written() === boxes.length,
      /* What the table scored, for a lesson that adds its marks up. Null
         where there is nothing to mark against. */
      result: () => {
        if (!markable.length) return null;
        let right = 0;
        markable.forEach(x => {
          if (window.shortAnswer.mark({ answers: [x.answer] }, x.input.value).ok) right++;
        });
        return { marks: right, outOf: markable.length };
      }
    };
  };

  /* ===================================================================
     EXAM QUESTION
     { type:"exam", prompt, marks, command, answer:"short"|"lines",
       lines, answers:[...], scheme:[{text,marks}], model,
       point, code, strand }

     A question off a past paper, worth marks, filed against a point of
     the specification.

     There are two ways of marking one, and which a question gets is
     decided by how it is answered rather than by a switch:

       "short"  one line, and the whole line is the answer. Marked here
                and now by shortmatch, the same comparison the Short
                answer task uses, so a recall question tells a student
                straight away.

       "lines"  a written answer. The mark scheme appears once they have
                had a go and they tick off the points they made. Their
                teacher can change the mark afterwards.

     Nothing longer than a line is marked automatically. Marking a six
     marker by looking for words in it is the keyword marking that was
     taken out of Short answers on purpose: it passes an answer naming
     the right things in the wrong order and fails one that is right in
     its own words. A wrong mark on a GCSE answer costs more than no
     mark at all.

     Nothing here stands in the way. The mark scheme is not shown until
     it is asked for, and Continue never waits for any of it.
     =================================================================== */
  window.rExam = function(b, ctx){
    const s = make("section", "examq");
    const marks = Math.max(0, parseInt(b.marks, 10) || 0);
    const short = b.answer === "short";
    const scheme = Array.isArray(b.scheme) ? b.scheme.filter(x => x && String(x.text || "").trim()) : [];

    /* The line above the question: what it is asking them to do, where it
       sits in the specification, and what it is worth. */
    const top = make("div", "examq-top");
    if (b.command) top.appendChild(make("span", "examq-cmd", b.command));
    if (b.code) top.appendChild(make("span", "examq-point", b.code + (b.strand ? " " + b.strand : "")));
    if (marks) top.appendChild(make("span", "examq-marks", marks + (marks === 1 ? " mark" : " marks")));
    if (top.childNodes.length) s.appendChild(top);

    if (b.prompt){
      const ask = make("div", "examq-ask");
      ask.innerHTML = b.prompt;            // written with the formatting buttons
      s.appendChild(ask);
    }

    let box;
    if (short){
      box = make("input", "answer examq-line");
      box.type = "text";
      box.autocomplete = "off"; box.autocapitalize = "off"; box.spellcheck = false;
      box.placeholder = "Your answer…";
    } else {
      box = make("textarea", "answer examq-box");
      /* A four marker wants more room than a one marker. Two lines a mark is
         about what the paper gives them, and a teacher can say otherwise. */
      box.rows = Math.max(2, Math.min(14, parseInt(b.lines, 10) || (marks ? marks * 2 : 4)));
      box.placeholder = "Write your answer here…";
    }
    s.appendChild(box);

    const fb = make("div", "feedback examq-fb");
    fb.hidden = true;
    const schemeBox = make("div", "examq-scheme");
    schemeBox.hidden = true;
    const btn = make("button", "btn-primary examq-check", short ? "Check answer" : "Mark your answer");
    /* In a test nothing is marked on screen, the same rule the Short answer
       task follows. The builder keeps exam questions out of an assessment,
       so this is only reached by a lesson that has been turned into one
       afterwards, and the answer then waits for the markbook. */
    const inTest = !!(ctx && ctx.assessment);
    if (inTest) btn.hidden = true;
    const tally = make("p", "examq-tally");
    tally.hidden = true;

    const row = make("div", "examq-actions");
    row.appendChild(btn);
    row.appendChild(tally);
    s.appendChild(row);
    s.appendChild(fb);
    s.appendChild(schemeBox);

    /* ---------- a written answer, marked against the scheme ---------- */
    const ticks = [];
    let shown = false;                     // the scheme is on screen
    function buildScheme(){
      if (!scheme.length){
        schemeBox.appendChild(make("p", "examq-none",
          "There is no mark scheme on this one, so your teacher will read it."));
        return;
      }
      schemeBox.appendChild(make("p", "examq-schemehead", "Tick each point you made."));
      scheme.forEach((point) => {
        const worth = Math.max(1, parseInt(point.marks, 10) || 1);
        const line = make("label", "examq-row");
        const cb = make("input");
        cb.type = "checkbox";
        cb.addEventListener("change", () => { paintTally(); ctx.changed(); });
        line.appendChild(cb);
        line.appendChild(make("span", "examq-row-text", point.text));
        if (worth > 1) line.appendChild(make("span", "examq-row-worth", worth + " marks"));
        schemeBox.appendChild(line);
        ticks.push({ cb: cb, worth: worth });
      });
      if (b.model){
        const m = make("div", "examq-model");
        m.appendChild(make("b", "", "A full answer"));
        m.appendChild(make("span", "", b.model));
        schemeBox.appendChild(m);
      }
    }
    const selfMark = () => ticks.reduce((n, t) => n + (t.cb.checked ? t.worth : 0), 0);
    function outOf(){
      if (marks) return marks;
      return ticks.reduce((n, t) => n + t.worth, 0) || scheme.length || 1;
    }
    function paintTally(){
      if (!shown){ tally.hidden = true; return; }
      const got = selfMark(), of = outOf();
      tally.hidden = false;
      tally.textContent = got + " out of " + of + (of === 1 ? " mark" : " marks");
      tally.dataset.stage = got >= of ? "all" : got > 0 ? "some" : "none";
    }
    function showScheme(on){
      shown = !!on;
      schemeBox.hidden = !shown;
      btn.textContent = shown ? "Hide the mark scheme" : "Mark your answer";
      paintTally();
    }

    /* ---------- a one line answer, marked here ---------- */
    let autoRight = null;                  // null until they have checked
    function checkShort(){
      const given = box.value.trim();
      fb.hidden = false;
      fb.innerHTML = "";
      if (!given){
        fb.dataset.verdict = "incorrect";
        fb.appendChild(make("b", "", "Write something first"));
        return;
      }
      const r = window.shortAnswer.mark({ answers: b.answers || [] }, given);
      if (r.mode === "none"){
        /* Nothing to mark it against. Telling a student they are wrong for
           that would be unfair: it is a gap in the question, not in them. */
        autoRight = null;
        fb.dataset.verdict = "correct";
        fb.appendChild(make("b", "", "Answer saved"));
        fb.appendChild(make("span", "", "Your teacher will read this one."));
        return;
      }
      autoRight = r.ok;
      fb.dataset.verdict = r.ok ? "correct" : "incorrect";
      fb.appendChild(make("b", "", r.ok ? "That is right" : "Not quite yet"));
      if (r.ok) fb.appendChild(make("span", "", marks === 1 ? "One mark." : marks + " marks."));
      else {
        /* marked like a Short answer, which has no model answer any more */
        fb.appendChild(make("span", "", "Check your spelling and have another go."));
      }
    }

    if (short){
      btn.addEventListener("click", checkShort);
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter"){ e.preventDefault(); checkShort(); }
      });
      box.addEventListener("input", () => { fb.hidden = true; autoRight = null; ctx.changed(); });
    } else {
      buildScheme();
      btn.addEventListener("click", () => {
        /* Pressing it again puts the scheme away, so a student adding to
           their answer is not reading the answers while they write. */
        if (shown){ showScheme(false); return; }
        if (!box.value.trim()){
          fb.hidden = false;
          fb.dataset.verdict = "incorrect";
          fb.innerHTML = "";
          fb.appendChild(make("b", "", "Have a go first"));
          fb.appendChild(make("span", "", "Write what you can, then mark it against the scheme."));
          return;
        }
        fb.hidden = true;
        showScheme(true);
        ctx.changed();
      });
      box.addEventListener("input", () => ctx.changed());
    }

    return {
      section: s,
      get: () => {
        const out = { text: box.value };
        if (short){
          if (autoRight !== null){
            out.marks = autoRight ? (marks || 1) : 0;
            out.outOf = marks || 1;
            out.auto = true;
          }
        } else if (shown){
          out.ticks = ticks.map(t => !!t.cb.checked);
          out.marks = selfMark();
          out.outOf = outOf();
          out.auto = false;
        }
        return out;
      },
      set: (v) => {
        if (!v) return;
        if (typeof v === "string"){ box.value = v; return; }     // an older save
        box.value = v.text == null ? "" : String(v.text);
        if (!short && Array.isArray(v.ticks) && v.ticks.length){
          v.ticks.forEach((on, i) => { if (ticks[i]) ticks[i].cb.checked = !!on; });
          showScheme(true);
        }
        if (short && v.auto && v.outOf) autoRight = Number(v.marks) >= Number(v.outOf);
      },
      done: () => box.value.trim().length > 0,
      /* What this one scored and what it was worth, for the markbook and the
         specification coverage screen. Out here rather than inside get() so
         the lesson page can ask without having to know the saved shape. */
      result: () => ({
        point: b.point || "",
        code: b.code || "",
        outOf: marks || outOf(),
        marks: short ? (autoRight === null ? null : (autoRight ? (marks || 1) : 0))
                     : (shown ? selfMark() : null),
        auto: !!short
      })
    };
  };
  /* ===================================================================
     POSTER
     { type:"poster", title, task, heading }
     A photo editor simple enough to use without being shown: one row of
     big buttons (Background, Add words, Add an image, Stickers), and
     whatever is picked shows its own few choices underneath. Anything on
     the poster is moved by dragging it and resized by its corner handle.

     Saved as one compressed picture, not as the pieces. A poster holds the
     student's own photos, and keeping those as pieces would cost far more
     than the finished JPEG: 600 x 848 at this quality is 40 to 150KB, so a
     year group making one each is about 80MB, once. Reopened, the saved
     poster comes back as the background, and anything new goes on top.
     =================================================================== */
  const POSTER_W = 600, POSTER_H = 848;
  const POSTER_MAX = 350000;          // characters of JPEG data URL
  const POSTER_FONTS = [
    { id: "bold",    label: "Bold",    face: '"Segoe UI", system-ui, sans-serif', weight: 800 },
    { id: "fun",     label: "Fun",     face: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive', weight: 700 },
    { id: "classic", label: "Classic", face: 'Georgia, "Times New Roman", serif', weight: 700 }
  ];
  const POSTER_COLOURS = ["#1D1D1B","#FFFFFF","#C0392B","#E67E22","#F2B705","#2E7D5B","#2F6BAE","#8C5BC4","#E88C9A","#7B5A3C"];
  const POSTER_BGS = [
    { kind: "colour", c1: "#FFFFFF" }, { kind: "colour", c1: "#FFF4C2" }, { kind: "colour", c1: "#D9ECFF" },
    { kind: "colour", c1: "#DFF3E4" }, { kind: "colour", c1: "#1D1D1B" }, { kind: "colour", c1: "#2F6BAE" },
    { kind: "gradient", c1: "#FFB25E", c2: "#E8456B" }, { kind: "gradient", c1: "#6DD5FA", c2: "#2F6BAE" },
    { kind: "gradient", c1: "#A8E063", c2: "#2E7D5B" }, { kind: "gradient", c1: "#C9A7F5", c2: "#4B2C83" }
  ];
  const posterFont = (id) => POSTER_FONTS.find(f => f.id === id) || POSTER_FONTS[0];

  window.rPoster = function(b, ctx){
    const s = make("section", "poster");
    /* Tools down the left, the poster in the middle, and the choices for
       whatever is picked down the right, so the whole poster fits on a
       laptop screen with nothing to scroll past. */
    const body = make("div", "poster-body");
    s.appendChild(body);
    const bar = make("div", "poster-bar");
    body.appendChild(bar);
    const stage = make("div", "poster-stage");
    body.appendChild(stage);
    const panel = make("div", "poster-panel");      // the choices for whatever is picked
    body.appendChild(panel);
    const canvas = make("canvas", "poster-canvas");
    canvas.width = POSTER_W * 2; canvas.height = POSTER_H * 2;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Your poster");
    canvas.tabIndex = 0;
    stage.appendChild(canvas);
    const note = make("p", "poster-note");
    s.appendChild(note);
    const pen = canvas.getContext("2d");

    let bg = { kind: "colour", c1: "#FFFFFF" };
    let base = null;            // the poster as last saved, put back as the background
    let items = [];
    let picked = null;
    let saved = null;           // { img } once there is anything to keep
    let touched = false;        // whether they have changed anything yet
    const history = [];

    /* --- what is on the poster --- */
    function snapshot(){
      return { bg: Object.assign({}, bg), base: base, items: items.map(it => Object.assign({}, it)) };
    }
    function remember(){
      history.push(snapshot());
      if (history.length > 40) history.shift();
    }
    function textLines(it){ return String(it.text || " ").split("\n"); }
    function fontOf(it){
      const f = posterFont(it.font);
      return f.weight + " " + it.size + "px " + f.face;
    }
    /* Words have a little room round them, so the handles are not on top of the letters. */
    const PAD_X = 6, PAD_Y = 4;
    function wordsWide(it){
      pen.save();
      pen.font = fontOf(it);
      const w = Math.max(20, ...textLines(it).map(l => pen.measureText(l).width));
      pen.restore();
      return w;
    }
    /* What each thing takes up, as boxKit wants it: { x, y, w, h, rot }. */
    function frameOf(it){
      const rot = Number(it.rot) || 0;
      if (it.kind === "text")
        return { x: it.x, y: it.y, rot: rot,
                 w: wordsWide(it) * (it.stretch || 1) + PAD_X * 2,
                 h: textLines(it).length * it.size * 1.15 + PAD_Y * 2 };
      if (it.kind === "photo") return { x: it.x, y: it.y, w: it.w, h: it.h, rot: rot };
      return { x: it.x, y: it.y, w: it.w || it.size, h: it.h || it.size, rot: rot };
    }
    /* And back: a thing made to fill the box a handle has been dragged to.
       Words are a size and a stretch rather than a width and a height, so
       a taller box is bigger letters and a wider one stretches them. */
    function reshape(it, bx, was){
      it.x = Math.max(0, Math.min(POSTER_W, bx.x));
      it.y = Math.max(0, Math.min(POSTER_H, bx.y));
      if (bx.rot) it.rot = bx.rot; else delete it.rot;
      if (it.kind === "text"){
        const tall = (bx.h - PAD_Y * 2) / (was.h - PAD_Y * 2);
        it.size = Math.max(12, Math.min(260, was.size * tall));
        const natural = (was.w - PAD_X * 2) / (was.stretch || 1) * it.size / was.size;
        const stretch = Math.max(0.3, Math.min(4, (bx.w - PAD_X * 2) / natural));
        if (Math.abs(stretch - 1) < 0.02) delete it.stretch; else it.stretch = Math.round(stretch * 100) / 100;
        return;
      }
      it.w = bx.w; it.h = bx.h;
      if (it.kind === "stamp") it.size = Math.max(bx.w, bx.h);
    }
    function paintBg(c){
      if (bg.kind === "gradient"){
        const g = c.createLinearGradient(0, 0, 0, POSTER_H);
        g.addColorStop(0, bg.c1); g.addColorStop(1, bg.c2);
        c.fillStyle = g;
      } else c.fillStyle = bg.c1;
      c.fillRect(0, 0, POSTER_W, POSTER_H);
      if (base) c.drawImage(base, 0, 0, POSTER_W, POSTER_H);
    }
    const FILTERS = { none: "none", bw: "grayscale(1)", bright: "brightness(1.25) saturate(1.15)",
                      warm: "sepia(0.45) saturate(1.3)", faded: "contrast(0.8) brightness(1.1) saturate(0.7)" };
    /* A sticker stretched with its side handles keeps that shape as it grows. */
    function growStamp(it, by){
      const f = frameOf(it);
      const k = Math.max(30 / Math.min(f.w, f.h), Math.min(700 / Math.max(f.w, f.h), by));
      it.w = f.w * k; it.h = f.h * k; it.size = Math.max(it.w, it.h);
    }
    function paintItem(c, it){
      /* Everything is drawn round its own middle, so turning it is one line. */
      if (it.rot){
        c.save();
        c.translate(it.x, it.y); c.rotate(it.rot * Math.PI / 180); c.translate(-it.x, -it.y);
        paintFlat(c, it);
        c.restore();
      } else paintFlat(c, it);
    }
    function paintFlat(c, it){
      if (it.kind === "text"){
        c.save();
        if (it.stretch && it.stretch !== 1){
          c.translate(it.x, 0); c.scale(it.stretch, 1); c.translate(-it.x, 0);
        }
        c.font = fontOf(it);
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineJoin = "round";
        const lines = textLines(it), lh = it.size * 1.15;
        lines.forEach((line, i) => {
          const y = it.y - (lines.length - 1) * lh / 2 + i * lh;
          if (it.outline){
            c.strokeStyle = it.colour === "#FFFFFF" || it.colour === "#F2B705" ? "#1D1D1B" : "#FFFFFF";
            c.lineWidth = Math.max(3, it.size / 7);
            c.strokeText(line, it.x, y);
          }
          c.fillStyle = it.colour;
          c.fillText(line, it.x, y);
        });
        c.restore();
      } else if (it.kind === "photo"){
        c.save();
        c.filter = FILTERS[it.filter] || "none";
        c.drawImage(it.img, it.x - it.w / 2, it.y - it.h / 2, it.w, it.h);
        c.restore();
        if (it.frame){
          c.save(); c.strokeStyle = "#FFFFFF"; c.lineWidth = 10;
          c.strokeRect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h); c.restore();
        }
      } else if (it.kind === "stamp"){
        window.drawKit.paint(c, { kind: "stamp", name: it.name, x: it.x, y: it.y, size: it.size,
                                  w: it.w, h: it.h, flip: it.flip });
      }
    }
    /* How many poster units one screen pixel is, so the handles stay the
       same size on screen however big the poster is drawn. */
    function unit(){
      const w = canvas.getBoundingClientRect().width;
      return w ? POSTER_W / w : 1;
    }
    const handleOpts = () => { const u = unit(); return { unit: u, reach: 13 * u, gap: 26 * u, top: 0 }; };
    function draw(){
      pen.setTransform(2, 0, 0, 2, 0, 0);
      paintBg(pen);
      items.forEach(it => paintItem(pen, it));
      if (picked && window.boxKit) window.boxKit.draw(pen, frameOf(picked), handleOpts());
    }

    /* --- saving: the finished picture, a moment after the last change --- */
    let saveTimer = null;
    function changed(){
      touched = true;
      draw();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 700);
    }
    function exportPoster(){
      const out = make("canvas");
      out.width = POSTER_W; out.height = POSTER_H;
      const c = out.getContext("2d");
      paintBg(c);
      items.forEach(it => paintItem(c, it));
      let url = out.toDataURL("image/jpeg", 0.78);
      for (const q of [0.62, 0.48, 0.35]) if (url.length > POSTER_MAX) url = out.toDataURL("image/jpeg", q);
      return url;
    }
    function saveNow(){
      clearTimeout(saveTimer);
      if (!touched) return;
      try{ saved = { img: exportPoster() }; }catch(e){ return; }
      ctx.changed();
    }

    /* --- the buttons along the top --- */
    const ICON = {
      bg: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 100 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5C21 6.5 17 3 12 3z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="11" r="1.4"/><circle cx="10" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/></svg>',
      text: '<svg viewBox="0 0 24 24"><path d="M4 5h16v3h-2V7h-5v11h2v2H9v-2h2V7H6v1H4z"/></svg>',
      photo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4z"/></svg>',
      stickers: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8 6.2 20l1.4-6.4L2.7 9.2l6.5-.7z"/></svg>',
      undo: '<svg viewBox="0 0 24 24"><path d="M7 8h7a6 6 0 010 12h-4v-2.5h4a3.5 3.5 0 000-7H7V14L1.5 9.2 7 4.5z"/></svg>'
    };
    function bigBtn(icon, label, fn){
      const btn = make("button", "poster-btn");
      btn.type = "button";
      btn.innerHTML = icon + "<span>" + label + "</span>";
      btn.addEventListener("click", fn);
      bar.appendChild(btn);
      return btn;
    }
    let open = "";                 // which of Background or Stickers is showing
    const bgBtn = bigBtn(ICON.bg, "Background", () => { pick(null); open = open === "bg" ? "" : "bg"; paintPanel(); });
    bigBtn(ICON.text, "Add words", addWords);
    /* the same pop-up as every other drawing: paste one copied from the
       internet, or browse for one on the computer */
    bigBtn(ICON.photo, "Add an image", () => window.pictureKit.ask(loadPhoto));
    const stickBtn = bigBtn(ICON.stickers, "Stickers", () => { pick(null); open = open === "stickers" ? "" : "stickers"; paintPanel(); });
    const undoBtn = bigBtn(ICON.undo, "Undo", () => {
      const last = history.pop();
      if (!last) return;
      bg = last.bg; base = last.base; items = last.items; picked = null;
      paintPanel(); changed();
    });
    undoBtn.classList.add("poster-btn-quiet");
    /* What the poster is about, kept beside the tools so it is in view the
       whole time they are making it, rather than scrolled away above. */
    if (b.task){
      const brief = make("div", "poster-brief");
      brief.appendChild(make("b", "poster-brief-head", "Your poster should..."));
      const words = make("div", "poster-brief-text");
      words.innerHTML = b.task;
      brief.appendChild(words);
      bar.appendChild(brief);
    }

    function addWords(){
      remember();
      const it = { kind: "text", text: "Your words", x: POSTER_W / 2, y: POSTER_H / 2, size: 48,
                   colour: bg.kind === "colour" && /^#(1D1D1B|2F6BAE)$/.test(bg.c1) ? "#FFFFFF" : "#1D1D1B",
                   font: "bold", outline: false };
      items.push(it);
      pick(it, true);
      changed();
    }
    function loadPhoto(file){
      if (!file || !/^image\//.test(file.type)){ say("That file is not a picture."); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        /* Shrunk on the way in: a phone photo is 4000 pixels across, and
           nothing on a 600 pixel poster needs more than this. */
        const k = Math.min(1, 1000 / Math.max(img.width, img.height));
        const c = make("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const small = new Image();
        small.onload = () => {
          remember();
          const fit = Math.min((POSTER_W * 0.7) / small.width, (POSTER_H * 0.5) / small.height);
          const it = { kind: "photo", img: small, x: POSTER_W / 2, y: POSTER_H / 2,
                       w: small.width * fit, h: small.height * fit, filter: "none", frame: false };
          items.push(it);
          pick(it);
          changed();
          say("");
        };
        /* A JPEG would turn a see-through background black, and clip art
           off the internet often has one. This copy only lives while the
           poster is open, so its size does not matter. */
        small.src = /jpe?g/i.test(file.type) ? c.toDataURL("image/jpeg", 0.85) : c.toDataURL("image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); say("That picture could not be opened."); };
      img.src = url;
    }
    /* A picture copied from anywhere can be pasted straight in, while the
       poster is the last thing they pressed on. */
    window.pictureKit.listen(s, loadPhoto);
    function say(text){ note.textContent = text; note.hidden = !text; }
    say("");

    /* --- the choices under the buttons --- */
    function swatch(colour, on, fn, title){
      const d = make("button", "poster-swatch" + (on ? " on" : ""));
      d.type = "button";
      d.style.background = colour;
      d.title = title || "This colour";
      d.setAttribute("aria-label", d.title);
      d.addEventListener("click", fn);
      return d;
    }
    function chip(label, on, fn, title){
      const c = make("button", "poster-chip" + (on ? " on" : ""), label);
      c.type = "button";
      if (title) c.title = title;
      c.addEventListener("click", fn);
      return c;
    }
    function group(label){
      const g = make("div", "poster-group");
      g.appendChild(make("span", "poster-label", label));
      panel.appendChild(g);
      return g;
    }
    function paintPanel(){
      panel.innerHTML = "";
      bgBtn.classList.toggle("on", open === "bg" && !picked);
      stickBtn.classList.toggle("on", open === "stickers" && !picked);
      if (picked){
        const it = picked;
        if (it.kind === "text"){
          const g = group("Words");
          const box = make("textarea", "poster-words");
          box.rows = 2;
          box.value = it.text;
          box.addEventListener("focus", () => remember(), { once: true });
          box.addEventListener("input", () => { it.text = box.value; changed(); });
          g.appendChild(box);
          wordsBox = box;
          const cg = group("Colour");
          POSTER_COLOURS.forEach(c => cg.appendChild(swatch(c, it.colour === c, () => { remember(); it.colour = c; paintPanel(); changed(); })));
          const sg = group("Style");
          POSTER_FONTS.forEach(f => {
            const b2 = chip(f.label, it.font === f.id, () => { remember(); it.font = f.id; paintPanel(); changed(); });
            b2.style.fontFamily = f.face;
            sg.appendChild(b2);
          });
          sg.appendChild(chip("Outline", !!it.outline, () => { remember(); it.outline = !it.outline; paintPanel(); changed(); },
                              "A line round the letters, so they stand out"));
          const zg = group("Size");
          zg.appendChild(chip("−", false, () => { remember(); it.size = Math.max(14, Math.round(it.size / 1.15)); changed(); }, "Smaller"));
          zg.appendChild(chip("+", false, () => { remember(); it.size = Math.min(220, Math.round(it.size * 1.15)); changed(); }, "Bigger"));
        } else if (it.kind === "photo"){
          const fg = group("Look");
          [["none","Normal"],["bw","Black and white"],["bright","Brighter"],["warm","Warm"],["faded","Faded"]].forEach(([id, label]) =>
            fg.appendChild(chip(label, it.filter === id, () => { remember(); it.filter = id; paintPanel(); changed(); })));
          fg.appendChild(chip("White border", !!it.frame, () => { remember(); it.frame = !it.frame; paintPanel(); changed(); }));
          const zg = group("Size");
          zg.appendChild(chip("−", false, () => { remember(); it.w /= 1.15; it.h /= 1.15; changed(); }, "Smaller"));
          zg.appendChild(chip("+", false, () => { remember(); it.w *= 1.15; it.h *= 1.15; changed(); }, "Bigger"));
          zg.appendChild(chip("Fill the poster", false, () => {
            remember();
            const k = Math.max(POSTER_W / it.w, POSTER_H / it.h);
            it.w *= k; it.h *= k; it.x = POSTER_W / 2; it.y = POSTER_H / 2;
            delete it.rot;      // a turned photo would leave the corners bare
            items = [it].concat(items.filter(x => x !== it));
            changed();
          }, "Make the photo the background"));
        } else {
          const zg = group("Sticker");
          zg.appendChild(chip("−", false, () => { remember(); growStamp(it, 1 / 1.2); changed(); }, "Smaller"));
          zg.appendChild(chip("+", false, () => { remember(); growStamp(it, 1.2); changed(); }, "Bigger"));
          zg.appendChild(chip("Flip", !!it.flip, () => { remember(); it.flip = !it.flip; paintPanel(); changed(); }, "Face the other way"));
        }
        const lg = group("Layer");
        lg.appendChild(chip("To front", false, () => { remember(); items = items.filter(x => x !== it).concat([it]); changed(); }));
        lg.appendChild(chip("To back", false, () => { remember(); items = [it].concat(items.filter(x => x !== it)); changed(); }));
        const del = chip("Delete", false, () => { remember(); items = items.filter(x => x !== it); pick(null); changed(); });
        del.classList.add("poster-chip-delete");
        lg.appendChild(del);
        lg.appendChild(chip("Done", false, () => pick(null)));
        return;
      }
      if (open === "bg"){
        const g = group("Background");
        POSTER_BGS.forEach(o => {
          const fill = o.kind === "gradient" ? "linear-gradient(" + o.c1 + "," + o.c2 + ")" : o.c1;
          const on = bg.kind === o.kind && bg.c1 === o.c1 && bg.c2 === o.c2;
          g.appendChild(swatch(fill, on, () => { remember(); bg = Object.assign({}, o); paintPanel(); changed(); },
                               o.kind === "gradient" ? "A colour that fades" : "This colour"));
        });
        if (base){
          g.appendChild(chip("Start again", false, () => { remember(); base = null; items = []; bg = { kind: "colour", c1: "#FFFFFF" }; paintPanel(); changed(); },
                             "Clear the poster you made before"));
        }
        return;
      }
      if (open === "stickers"){
        const tray = window.drawKit.tray(canvas, (name, cx, cy) => {
          remember();
          const p = cx === null ? [POSTER_W / 2, POSTER_H / 2] : at({ clientX: cx, clientY: cy });
          const it = { kind: "stamp", name: name, x: p[0], y: p[1], size: 150, flip: false };
          items.push(it);
          open = "";
          pick(it);
          changed();
        });
        tray.classList.add("poster-tray");
        panel.appendChild(tray);
        return;
      }
      panel.appendChild(make("p", "poster-hint", base
        ? "Your saved poster is now the background, so add new words, photos and stickers on top. To start again from nothing, press Background, then Start again."
        : "Tap anything on your poster to change it. Drag it to move it. Drag a corner to make it bigger or smaller, a side to stretch it, and the dot above it to turn it."));
    }
    let wordsBox = null;
    function pick(it, typeNow){
      picked = it;
      if (it) open = "";
      wordsBox = null;
      paintPanel();
      draw();
      if (typeNow && wordsBox){ wordsBox.focus(); wordsBox.select(); }
    }

    /* --- moving and resizing on the poster --- */
    function at(e){
      const r = canvas.getBoundingClientRect();
      return [ (e.clientX - r.left) / (r.width || 1) * POSTER_W, (e.clientY - r.top) / (r.height || 1) * POSTER_H ];
    }
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      /* Without preventScroll, focusing scrolls the poster into view first,
         and the press is then read against where the poster used to be. */
      canvas.focus({ preventScroll: true });
      const p = at(e);
      /* a handle first: the corners and the turning dot stick out past it */
      const handle = picked && window.boxKit && window.boxKit.hit(frameOf(picked), p, handleOpts());
      if (handle){
        remember();
        const was = frameOf(picked);
        was.size = picked.size; was.stretch = picked.stretch;
        drag = { mode: handle, it: picked, start: was };
        try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
        return;
      }
      let hit = null;
      for (let i = items.length - 1; i >= 0 && !hit; i--)
        if (window.boxKit.inside(frameOf(items[i]), p)) hit = items[i];
      if (hit !== picked) pick(hit);
      if (hit){
        remember();
        drag = { mode: "move", it: hit, from: p, x: hit.x, y: hit.y };
        try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = at(e);
      if (!drag){
        /* the pointer shows what a handle will do before it is pressed */
        const handle = picked && window.boxKit.hit(frameOf(picked), p, handleOpts());
        canvas.style.cursor = handle ? window.boxKit.cursor(handle, picked.rot) : "";
        return;
      }
      const it = drag.it;
      if (drag.mode === "move"){
        it.x = Math.max(0, Math.min(POSTER_W, drag.x + p[0] - drag.from[0]));
        it.y = Math.max(0, Math.min(POSTER_H, drag.y + p[1] - drag.from[1]));
      } else {
        const least = it.kind === "text" ? 16 : it.kind === "photo" ? 30 : 24;
        reshape(it, window.boxKit.drag(drag.start, drag.mode, p, { min: least, max: 2400 }), drag.start);
      }
      draw();
    });
    const endDrag = () => { if (drag){ drag = null; changed(); } };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("dblclick", () => { if (picked && picked.kind === "text" && wordsBox){ wordsBox.focus(); wordsBox.select(); } });
    canvas.addEventListener("keydown", (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && picked){
        e.preventDefault();
        remember(); items = items.filter(x => x !== picked); pick(null); changed();
      }
    });

    /* A poster to start from: a title waiting to be written. It is not
       their work until they change something, so it is not saved yet. */
    items.push({ kind: "text", text: b.heading || "Your title here", x: POSTER_W / 2, y: 110, size: 64,
                 colour: "#1D1D1B", font: "bold", outline: false });
    paintPanel();
    draw();

    return {
      section: s,
      get: () => { if (touched) saveNow(); return saved; },
      set: (v) => {
        if (!v || typeof v.img !== "string" || !/^data:image\//.test(v.img)) return;
        saved = { img: v.img };
        const img = new Image();
        img.onload = () => { base = img; items = []; picked = null; paintPanel(); draw(); };
        img.src = v.img;
      },
      done: () => !!saved
    };
  };
  /* For the PDF and anything else that only wants the picture. */
  window.posterImage = (v) => (v && typeof v.img === "string") ? v.img : "";

  /* ===================================================================
     BOSS BATTLE
     { type:"boss", title, task, boss, look, hits, hearts,
       questions:[{ q, options, answers:[i], why, hint }] }
     A quiz with something at stake. Every right answer knocks a heart off
     the boss's health bar; every wrong one costs the student a heart, and
     shows them the right answer and why, so a lost heart still teaches
     something. Run out of questions and they come round again in a new
     order. Lose, and Try again starts a fresh fight: nobody is stuck, and
     the second go is easier because they have just learnt the answers.
     =================================================================== */
  const BOSS_LOOKS = {
    goblin: { body: "#5DAA4B", dark: "#3C7A2F", extra: "horns" },
    dragon: { body: "#D9533F", dark: "#9E3527", extra: "spikes" },
    robot:  { body: "#8FA0B0", dark: "#5D6F80", extra: "antenna" },
    ghost:  { body: "#B9A6E8", dark: "#7D67B8", extra: "none" }
  };
  function bossSvg(look){
    const L = BOSS_LOOKS[look] || BOSS_LOOKS.goblin;
    const extra = L.extra === "horns"
      ? '<path d="M40 38 L30 10 L55 30 Z M120 38 L130 10 L105 30 Z" fill="#F2E3B3" stroke="#1D1D1B" stroke-width="3"/>'
      : L.extra === "spikes"
      ? '<path d="M50 30 L60 8 L70 28 L80 4 L90 28 L100 8 L110 30 Z" fill="' + L.dark + '" stroke="#1D1D1B" stroke-width="3"/>'
      : L.extra === "antenna"
      ? '<path d="M80 30 V10" stroke="#1D1D1B" stroke-width="4"/><circle cx="80" cy="8" r="7" fill="#C0392B" stroke="#1D1D1B" stroke-width="3"/>'
      : "";
    const shape = look === "robot"
      ? '<rect x="25" y="28" width="110" height="110" rx="18" fill="' + L.body + '" stroke="#1D1D1B" stroke-width="4"/>'
      : look === "ghost"
      ? '<path d="M25 140 V80 a55 55 0 0 1 110 0 V140 l-18 -14 -18 14 -19 -14 -18 14 -19 -14 z" fill="' + L.body + '" stroke="#1D1D1B" stroke-width="4"/>'
      : '<ellipse cx="80" cy="88" rx="58" ry="56" fill="' + L.body + '" stroke="#1D1D1B" stroke-width="4"/>';
    return '<svg class="boss-art" viewBox="0 0 160 160" aria-hidden="true">' + extra + shape +
      '<path d="M48 66 l20 8 M112 66 l-20 8" stroke="#1D1D1B" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="60" cy="84" r="10" fill="#FFFFFF" stroke="#1D1D1B" stroke-width="3"/><circle cx="100" cy="84" r="10" fill="#FFFFFF" stroke="#1D1D1B" stroke-width="3"/>' +
      '<circle class="boss-eye" cx="62" cy="86" r="4.5" fill="#1D1D1B"/><circle class="boss-eye" cx="98" cy="86" r="4.5" fill="#1D1D1B"/>' +
      '<path class="boss-mouth" d="M58 112 q22 -14 44 0" fill="none" stroke="#1D1D1B" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M66 108 l4 8 4 -7 M86 109 l4 7 4 -8" fill="#FFFFFF" stroke="#1D1D1B" stroke-width="2"/></svg>';
  }
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.3 4.3 2.5h2c.7-1.2 2.1-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';

  window.rBoss = function(b, ctx){
    const qs = (b.questions || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length > 1);
    const maxHits = Math.max(1, Math.min(30, Number(b.hits) || Math.min(8, qs.length || 1)));
    const maxHearts = Math.max(1, Math.min(10, Number(b.hearts) || 3));
    const name = b.boss || "The Boss";
    const s = make("section", "boss");

    const arena = make("div", "boss-arena");
    s.appendChild(arena);
    const foe = make("div", "boss-foe");
    foe.innerHTML = bossSvg(b.look);
    arena.appendChild(foe);
    const stats = make("div", "boss-stats");
    arena.appendChild(stats);
    stats.appendChild(make("b", "boss-name", name));
    const hpOuter = make("div", "boss-hp");
    hpOuter.setAttribute("role", "progressbar");
    hpOuter.setAttribute("aria-label", name + "'s health");
    const hpFill = make("div", "boss-hp-fill");
    hpOuter.appendChild(hpFill);
    stats.appendChild(hpOuter);
    const hpWords = make("span", "boss-hp-words");
    stats.appendChild(hpWords);
    const you = make("div", "boss-you");
    stats.appendChild(you);
    you.appendChild(make("span", "boss-you-label", "Your hearts"));
    const heartRow = make("span", "boss-hearts");
    you.appendChild(heartRow);

    const card = make("div", "boss-card");
    s.appendChild(card);

    let hp = maxHits, hearts = maxHearts, order = [], at = 0;
    let won = false, tries = 0, bestHearts = 0, right = 0, asked = 0;
    let state = "start";              // start, ask, answered, won, lost

    function shuffle(list){
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    function nextQuestion(){
      if (at >= order.length){ order = shuffle(qs.map((q, i) => i)); at = 0; }
      return qs[order[at++]];
    }
    function paintStats(){
      hpFill.style.width = (hp / maxHits * 100) + "%";
      hpOuter.setAttribute("aria-valuenow", String(hp));
      hpOuter.setAttribute("aria-valuemax", String(maxHits));
      hpWords.textContent = hp + " of " + maxHits + " health left";
      heartRow.innerHTML = "";
      for (let i = 0; i < maxHearts; i++){
        const h = make("span", "boss-heart" + (i < hearts ? "" : " lost"));
        h.innerHTML = HEART;
        heartRow.appendChild(h);
      }
      heartRow.setAttribute("aria-label", hearts + " hearts left");
    }
    /* A short shake or flash. Kept in a custom property so the
       reduced-motion rule lets it through, the same as the waiting dots. */
    function flash(el, cls){
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 700);
    }
    function startFight(){
      hp = maxHits; hearts = maxHearts;
      order = shuffle(qs.map((q, i) => i)); at = 0;
      state = "ask";
      foe.classList.remove("boss-beaten");
      paintStats();
      ask();
    }
    function ask(){
      const q = nextQuestion();
      card.innerHTML = "";
      card.appendChild(make("p", "boss-q-count", "Question " + (asked + 1)));
      const qt = make("p", "boss-q");
      qt.innerHTML = q.q;
      card.appendChild(qt);
      const opts = make("div", "boss-opts");
      card.appendChild(opts);
      const answers = (q.answers || [q.answer || 0]).map(Number);
      q.options.forEach((o, i) => {
        const btn = make("button", "boss-opt");
        btn.type = "button";
        btn.innerHTML = o;
        btn.addEventListener("click", () => answer(q, i, answers, opts));
        opts.appendChild(btn);
      });
    }
    function answer(q, i, answers, opts){
      if (state !== "ask") return;
      state = "answered";
      asked++;
      const ok = answers.indexOf(i) >= 0;
      [...opts.children].forEach((btn, k) => {
        btn.disabled = true;
        if (answers.indexOf(k) >= 0) btn.classList.add("right");
        else if (k === i) btn.classList.add("wrong");
      });
      const fb = make("div", "boss-fb " + (ok ? "ok" : "no"));
      if (ok){
        right++; hp--;
        fb.appendChild(make("b", "", hp > 0 ? "Hit! " + name + " loses a heart." : "Final hit!"));
        flash(foe, "boss-hit");
      } else {
        hearts--;
        fb.appendChild(make("b", "", "Ouch! You lose a heart."));
        flash(foe, "boss-laugh");
        flash(heartRow, "boss-hurt");
      }
      if (q.why){
        const w = make("p", "");
        w.innerHTML = q.why;
        fb.appendChild(w);
      }
      card.appendChild(fb);
      paintStats();
      ctx.changed();
      const go = make("button", "btn-primary boss-next");
      go.type = "button";
      if (hp <= 0){ go.textContent = "See what happened"; go.addEventListener("click", winFight); }
      else if (hearts <= 0){ go.textContent = "See what happened"; go.addEventListener("click", loseFight); }
      else { go.textContent = "Next question"; go.addEventListener("click", () => { state = "ask"; ask(); }); }
      card.appendChild(go);
      go.focus();
    }
    function endCard(title, words, again){
      card.innerHTML = "";
      card.appendChild(make("p", "boss-end-title", title));
      card.appendChild(make("p", "boss-end-words", words));
      const btn = make("button", "btn-primary", again);
      btn.type = "button";
      btn.addEventListener("click", startFight);
      card.appendChild(btn);
    }
    function winFight(){
      state = "won"; won = true; tries++;
      bestHearts = Math.max(bestHearts, hearts);
      foe.classList.add("boss-beaten");
      ctx.changed();
      endCard("You beat " + name + "!",
        "You won with " + hearts + (hearts === 1 ? " heart" : " hearts") + " left. " +
        (hearts === maxHearts ? "Not a single heart lost. Legendary!" : "Can you win without losing a heart?"),
        "Fight again");
    }
    function loseFight(){
      state = "lost"; tries++;
      ctx.changed();
      endCard(name + " won this time.",
        "Every answer you saw was a clue. Try again: you know more than you did a minute ago.", "Try again");
    }
    function startCard(){
      state = "start";
      card.innerHTML = "";
      card.appendChild(make("p", "boss-end-title", "Can you beat " + name + "?"));
      card.appendChild(make("p", "boss-end-words",
        "Each right answer knocks a heart off " + name + ". Each wrong answer costs you one of your " + maxHearts +
        ". Hit " + maxHits + " times to win."));
      const btn = make("button", "btn-primary", "Start the battle");
      btn.type = "button";
      btn.addEventListener("click", startFight);
      card.appendChild(btn);
      paintStats();
    }
    if (!qs.length){ card.appendChild(make("p", "boss-end-words", "This battle has no questions yet.")); }
    else startCard();

    return {
      section: s,
      get: () => ({ won: won, tries: tries, bestHearts: bestHearts, right: right, asked: asked }),
      set: (v) => {
        if (!v || typeof v !== "object") return;
        won = !!v.won; tries = Number(v.tries) || 0; bestHearts = Number(v.bestHearts) || 0;
        right = Number(v.right) || 0; asked = Number(v.asked) || 0;
        if (won && state === "start" && qs.length){
          foe.classList.add("boss-beaten");
          hp = 0; paintStats();
          endCard("You beat " + name + "!", "Your best: " + bestHearts + (bestHearts === 1 ? " heart" : " hearts") + " left.", "Fight again");
        }
      },
      done: () => won || tries >= 2
    };
  };

})();
