/* Pixel studio: a grid coloured in square by square, with frames to play
   as an animation. Its own file because the lesson builder draws the
   picture to copy on the same grid the student uses, and the builder does
   not load tasks-extra.js. */
(function(){
  "use strict";

  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /* ===================================================================
     PIXEL STUDIO
     { type:"pixels", title, task, w, h, depth, depthChoice,
       target, clue:"picture"|"binary", frames, maxFrames, fps, start,
       binary }
     A grid coloured in square by square. Each frame is kept as one string,
     a hex digit a square saying which colour it is, so a 16 by 16 picture
     is 256 characters and eight frames of it about 2KB. Never a picture.

     depth is bits a pixel (1 to 4), which decides how many of the sixteen
     colours below can be used: 1 bit is the first two, 2 bits the first
     four, and so on. depthChoice lets the student change it, and the size
     beside the grid changes with it, which is the point.

     target is a frame to copy, the same string shape; clue "binary" shows
     it as rows of bits to decode rather than as a picture. Check compares
     the first frame with it. frames:true adds the frame strip, Play and a
     frames-a-second slider; start is the frames it opens with.
     =================================================================== */
  const PIXEL_COLOURS = [
    ["#FFFFFF", "white"], ["#1B1B1F", "black"], ["#E23B3B", "red"], ["#2F6BDE", "blue"],
    ["#F6C31C", "yellow"], ["#3FA34D", "green"], ["#F28C28", "orange"], ["#8E4BC4", "purple"],
    ["#F58DB5", "pink"], ["#8A5A33", "brown"], ["#B9BDC4", "light grey"], ["#5E636B", "dark grey"],
    ["#7CCBF2", "sky blue"], ["#1F6B3A", "dark green"], ["#F2C9A0", "peach"], ["#7A1F2B", "dark red"]
  ];
  window.PIXEL_COLOURS = PIXEL_COLOURS;
  const pixClamp = (n, lo, hi, d) => {
    const v = parseInt(n, 10);
    return isNaN(v) ? d : Math.max(lo, Math.min(hi, v));
  };
  /* The size of a pixel task as it will be drawn, and a frame string made
     the right length: a hand-written lesson with a short row still opens. */
  function pixelShape(b){
    return { w: pixClamp(b.w, 2, 32, 8), h: pixClamp(b.h, 2, 32, 8) };
  }
  function pixelFrame(str, n, most){
    const out = new Uint8Array(n);
    const s = String(str == null ? "" : str);
    for (let i = 0; i < n && i < s.length; i++){
      const v = parseInt(s[i], 16);
      out[i] = isNaN(v) ? 0 : Math.min(v, most);
    }
    return out;
  }
  const pixelString = (f) => Array.prototype.map.call(f, v => v.toString(16)).join("");
  /* How many squares of the first frame match the picture to copy, shared
     with progressmath.js, which has its own copy because work.html does not
     load this file. Keep the two the same. */
  window.pixelMatch = function(b, v){
    const sh = pixelShape(b), n = sh.w * sh.h;
    if (!b.target) return { got: 0, max: 0 };
    const want = pixelFrame(b.target, n, 15);
    const mine = pixelFrame(v && Array.isArray(v.frames) ? v.frames[0] : "", n, 15);
    let got = 0;
    for (let i = 0; i < n; i++) if (want[i] === mine[i]) got++;
    return { got: got, max: n };
  };
  const bitsOf = (v, depth) => {
    let s = v.toString(2);
    while (s.length < depth) s = "0" + s;
    return s;
  };
  /* Draws one frame into a canvas the size of the grid times cell. */
  function paintPixels(c, f, sh, cell, opts){
    const o = opts || {};
    const x = c.getContext("2d");
    x.fillStyle = "#FFFFFF";
    x.fillRect(0, 0, sh.w * cell, sh.h * cell);
    for (let i = 0; i < f.length; i++){
      const col = i % sh.w, row = Math.floor(i / sh.w);
      let v = f[i];
      if (!v && o.ghost && o.ghost[i]){
        x.globalAlpha = 0.25;
        x.fillStyle = PIXEL_COLOURS[o.ghost[i]][0];
        x.fillRect(col * cell, row * cell, cell, cell);
        x.globalAlpha = 1;
        continue;
      }
      if (!v) continue;
      x.fillStyle = PIXEL_COLOURS[v][0];
      x.fillRect(col * cell, row * cell, cell, cell);
    }
    if (o.lines){
      x.strokeStyle = "rgba(0,0,0,.14)";
      x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i <= sh.w; i++){ x.moveTo(i * cell + .5, 0); x.lineTo(i * cell + .5, sh.h * cell); }
      for (let i = 0; i <= sh.h; i++){ x.moveTo(0, i * cell + .5); x.lineTo(sh.w * cell, i * cell + .5); }
      x.stroke();
    }
    if (o.wrong){
      x.strokeStyle = "#CF1111";
      x.lineWidth = Math.max(2, cell / 8);
      o.wrong.forEach(i => {
        const col = i % sh.w, row = Math.floor(i / sh.w), m = x.lineWidth / 2 + 1;
        x.strokeRect(col * cell + m, row * cell + m, cell - 2 * m, cell - 2 * m);
      });
    }
    if (o.cursor !== undefined && o.cursor !== null){
      const col = o.cursor % sh.w, row = Math.floor(o.cursor / sh.w);
      x.strokeStyle = "#2F6BAE"; x.lineWidth = 3;
      x.strokeRect(col * cell + 1.5, row * cell + 1.5, cell - 3, cell - 3);
    }
  }
  /* A finished frame as a PNG, for the PDF of a hand-in. */
  window.pixelImage = function(b, str){
    const sh = pixelShape(b), cell = Math.max(4, Math.floor(320 / Math.max(sh.w, sh.h)));
    const c = document.createElement("canvas");
    c.width = sh.w * cell; c.height = sh.h * cell;
    paintPixels(c, pixelFrame(str, sh.w * sh.h, 15), sh, cell, { lines: true });
    return c.toDataURL("image/png");
  };

  window.rPixels = function(b, ctx){
    ctx = ctx || {};
    const sh = pixelShape(b), N = sh.w * sh.h;
    const target = b.target ? pixelFrame(b.target, N, 15) : null;
    const animated = b.frames === true;
    const maxFrames = pixClamp(b.maxFrames, 2, 24, 8);
    /* the picture to copy decides the colours too: it would be unfair to
       ask for a colour the grid cannot make */
    let depth = pixClamp(b.depth, 1, 4, 1);
    if (target){
      const most = Math.max.apply(null, Array.from(target));
      while ((1 << depth) <= most && depth < 4) depth++;
    }
    let fps = pixClamp(b.fps, 1, 24, 6);
    const colours = () => 1 << depth;
    const startFrames = () => {
      const list = Array.isArray(b.start) && b.start.length ? b.start : [""];
      return list.slice(0, animated ? maxFrames : 1).map(s => pixelFrame(s, N, 15));
    };
    let frames = startFrames();
    let cur = 0, tool = "paint", ink = 1, onion = false, showBits = b.binary === "open";
    let wrong = null, right = false, cursor = null, touched = false;
    const undo = [];

    const s = make("section", "pixtask");
    const wrap = make("div", "pix-wrap");
    s.appendChild(wrap);

    /* ---------- tools and colours, beside the grid ---------- */
    const tools = make("div", "pix-tools");
    const toolRow = make("div", "pix-toolrow");
    const toolBtns = {};
    [["paint", "Pencil", "Colour one square at a time. Drag to colour lots."],
     ["fill", "Fill", "Colour a whole area of the same colour."],
     ["rubber", "Rubber", "Turn squares back to white."]].forEach(t => {
      const btn = make("button", "btn-ghost pix-tool", t[1]);
      btn.type = "button"; btn.title = t[2];
      btn.addEventListener("click", () => { tool = t[0]; paintTools(); });
      toolBtns[t[0]] = btn;
      toolRow.appendChild(btn);
    });
    const undoBtn = make("button", "btn-ghost pix-tool", "Undo");
    undoBtn.type = "button";
    const clearBtn = make("button", "btn-ghost pix-tool", "Clear");
    clearBtn.type = "button";
    toolRow.appendChild(undoBtn); toolRow.appendChild(clearBtn);
    tools.appendChild(toolRow);

    const palHead = make("p", "pix-label", "Colours");
    tools.appendChild(palHead);
    const pal = make("div", "pix-palette");
    tools.appendChild(pal);
    const depthBox = make("div", "pix-depth");
    if (b.depthChoice === true){
      depthBox.appendChild(make("p", "pix-label", "How many colours"));
      [1, 2, 3, 4].forEach(d => {
        const btn = make("button", "btn-ghost pix-depthbtn", (1 << d) + " colours (" + d + (d === 1 ? " bit)" : " bits)"));
        btn.type = "button";
        btn.dataset.depth = String(d);
        btn.addEventListener("click", () => setDepth(d));
        depthBox.appendChild(btn);
      });
      tools.appendChild(depthBox);
    }
    const lostNote = make("p", "pix-note");
    lostNote.hidden = true;
    tools.appendChild(lostNote);
    const bitsBtn = make("button", "btn-ghost pix-tool pix-bitsbtn", "Show the binary");
    bitsBtn.type = "button";
    if (b.binary !== false) tools.appendChild(bitsBtn);
    wrap.appendChild(tools);

    /* ---------- the grid ---------- */
    const board = make("div", "pix-board");
    const CELL = 24;
    const canvas = make("canvas", "pix-canvas");
    canvas.width = sh.w * CELL; canvas.height = sh.h * CELL;
    canvas.style.aspectRatio = sh.w + " / " + sh.h;
    canvas.style.setProperty("--pix-ratio", String(sh.w / sh.h));
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", "A grid of " + sh.w + " by " + sh.h + " squares. Click a square to colour it, or use the arrow keys and press Space.");
    board.appendChild(canvas);
    const bitsOut = make("div", "pix-binary");
    bitsOut.hidden = true;
    board.appendChild(bitsOut);
    wrap.appendChild(board);

    /* ---------- the side: what to copy, the size, the frames ---------- */
    const side = make("div", "pix-side");
    wrap.appendChild(side);
    let said = null;
    if (target){
      const card = make("div", "pix-card");
      if (b.clue === "binary"){
        card.appendChild(make("p", "pix-label", "Decode this binary"));
        const rows = make("div", "pix-cluerows");
        for (let r = 0; r < sh.h; r++){
          const line = make("div", "pix-clue");
          line.appendChild(make("span", "pix-rowno", String(r + 1))); line.title = "Row " + (r + 1);
          const bits = [];
          for (let c = 0; c < sh.w; c++) bits.push(bitsOf(target[r * sh.w + c], depth));
          line.appendChild(make("code", "", bits.join(depth > 1 ? " " : "")));
          rows.appendChild(line);
        }
        card.appendChild(rows);
        if (depth > 1) card.appendChild(make("p", "pix-hint", "Each group of " + depth + " bits is one square. The code for each colour is on its button."));
        else card.appendChild(make("p", "pix-hint", "1 is black and 0 is white. Each row of bits is one row of squares."));
      } else {
        card.appendChild(make("p", "pix-label", "Make yours look like this"));
        const tc = make("canvas", "pix-target");
        const tcell = Math.max(4, Math.floor(160 / Math.max(sh.w, sh.h)));
        tc.width = sh.w * tcell; tc.height = sh.h * tcell;
        paintPixels(tc, target, sh, tcell, { lines: true });
        card.appendChild(tc);
      }
      if (!ctx.assessment){
        const btn = make("button", "btn-primary pix-check", "Check my picture");
        btn.type = "button";
        said = make("p", "pix-said");
        said.setAttribute("aria-live", "polite");
        said.hidden = true;
        btn.addEventListener("click", () => {
          const n = matches();
          right = n === N;
          wrong = [];
          for (let i = 0; i < N; i++) if (frames[0][i] !== target[i]) wrong.push(i);
          if (cur !== 0){ cur = 0; paintStrip(); }
          said.hidden = false;
          said.dataset.verdict = right ? "yes" : "no";
          said.textContent = right ? "Every square is right. Well done!"
            : n + " of " + N + " squares are right. The wrong ones have a red border.";
          if (ctx.pressed) ctx.pressed();
          if (ctx.tried && !right && ctx.tried(pixelString(frames[0])) >= 2)
            said.textContent += " You can carry on, or keep fixing it.";
          draw();
          ctx.changed && ctx.changed();
        });
        card.appendChild(btn);
        card.appendChild(said);
      }
      side.appendChild(card);
    }

    const sizeCard = make("div", "pix-card pix-size");
    side.appendChild(sizeCard);

    let strip = null, playBtn = null, preview = null, fpsIn = null, fpsSaid = null, onionBtn = null;
    if (animated){
      const fcard = make("div", "pix-card pix-frames");
      fcard.appendChild(make("p", "pix-label", "Frames"));
      strip = make("div", "pix-strip");
      fcard.appendChild(strip);
      const frow = make("div", "pix-toolrow");
      const addBtn = make("button", "btn-ghost pix-tool", "Add a frame");
      addBtn.type = "button"; addBtn.title = "A copy of this frame, ready to change a little";
      const delBtn = make("button", "btn-ghost pix-tool", "Delete frame");
      delBtn.type = "button";
      onionBtn = make("button", "btn-ghost pix-tool", "See the last frame");
      onionBtn.type = "button"; onionBtn.title = "Shows the frame before this one faintly, so you can line things up";
      frow.appendChild(addBtn); frow.appendChild(delBtn); frow.appendChild(onionBtn);
      fcard.appendChild(frow);
      addBtn.addEventListener("click", () => {
        if (frames.length >= maxFrames) return;
        remember();
        frames.splice(cur + 1, 0, frames[cur].slice());
        cur++;
        edited();
      });
      delBtn.addEventListener("click", () => {
        if (frames.length < 2) return;
        remember();
        frames.splice(cur, 1);
        cur = Math.min(cur, frames.length - 1);
        edited();
      });
      onionBtn.addEventListener("click", () => { onion = !onion; onionBtn.classList.toggle("on", onion); draw(); });

      const play = make("div", "pix-play");
      preview = make("canvas", "pix-preview");
      const pcell = Math.max(3, Math.floor(120 / Math.max(sh.w, sh.h)));
      preview.width = sh.w * pcell; preview.height = sh.h * pcell;
      preview.dataset.cell = String(pcell);
      play.appendChild(preview);
      const pctl = make("div", "pix-playctl");
      playBtn = make("button", "btn-primary pix-playbtn", "Play");
      playBtn.type = "button";
      pctl.appendChild(playBtn);
      const fl = make("label", "pix-fps");
      fpsSaid = make("span", "pix-fpsnum");
      fpsIn = make("input");
      fpsIn.type = "range"; fpsIn.min = "1"; fpsIn.max = "24"; fpsIn.value = String(fps);
      fpsIn.setAttribute("aria-label", "Frames a second");
      fl.appendChild(fpsSaid); fl.appendChild(fpsIn);
      pctl.appendChild(fl);
      play.appendChild(pctl);
      fcard.appendChild(play);
      side.appendChild(fcard);
      fpsIn.addEventListener("input", () => {
        fps = pixClamp(fpsIn.value, 1, 24, 6);
        paintFps();
        if (timer){ stopPlay(); startPlay(); }
        ctx.changed && ctx.changed();
      });
      playBtn.addEventListener("click", () => timer ? stopPlay() : startPlay());
    }

    /* ---------- playing ---------- */
    let timer = null, shown = 0;
    function startPlay(){
      if (!preview) return;
      playBtn.textContent = "Stop";
      shown = 0;
      timer = setInterval(() => {
        /* gone from the page: a lesson moved on or the task redrawn */
        if (!s.isConnected){ stopPlay(); return; }
        paintPixels(preview, frames[shown % frames.length], sh, Number(preview.dataset.cell), {});
        Array.from(strip.children).forEach((t, i) => t.classList.toggle("playing", i === shown % frames.length));
        shown++;
      }, 1000 / fps);
    }
    function stopPlay(){
      clearInterval(timer); timer = null;
      if (playBtn) playBtn.textContent = "Play";
      if (strip) Array.from(strip.children).forEach(t => t.classList.remove("playing"));
      if (preview) paintPixels(preview, frames[cur], sh, Number(preview.dataset.cell), {});
    }
    function paintFps(){
      if (!fpsSaid) return;
      fpsSaid.textContent = fps + (fps === 1 ? " frame a second" : " frames a second");
    }

    /* ---------- drawing it all ---------- */
    function matches(){
      let n = 0;
      for (let i = 0; i < N; i++) if (frames[0][i] === target[i]) n++;
      return n;
    }
    function paintTools(){
      Object.keys(toolBtns).forEach(k => toolBtns[k].classList.toggle("on", k === tool));
      pal.innerHTML = "";
      for (let i = 0; i < colours(); i++){
        const sw = make("button", "pix-swatch" + (i === ink && tool !== "rubber" ? " on" : ""));
        sw.type = "button";
        sw.style.setProperty("--sw", PIXEL_COLOURS[i][0]);
        sw.title = PIXEL_COLOURS[i][1];
        sw.setAttribute("aria-label", PIXEL_COLOURS[i][1] + ", code " + bitsOf(i, depth));
        sw.appendChild(make("span", "pix-code", bitsOf(i, depth)));
        sw.addEventListener("click", () => { ink = i; if (tool === "rubber") tool = "paint"; paintTools(); });
        pal.appendChild(sw);
      }
      depthBox.querySelectorAll(".pix-depthbtn").forEach(btn => btn.classList.toggle("on", Number(btn.dataset.depth) === depth));
      bitsBtn.textContent = showBits ? "Hide the binary" : "Show the binary";
      bitsBtn.classList.toggle("on", showBits);
    }
    function paintSize(){
      const pixels = N, bits = pixels * depth * frames.length, bytes = bits / 8;
      const nice = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);
      sizeCard.innerHTML = "";
      sizeCard.appendChild(make("p", "pix-label", "How big the file is"));
      const lines = [
        sh.w + " × " + sh.h + " = " + pixels + " pixels",
        pixels + " pixels × " + depth + (depth === 1 ? " bit" : " bits") + " = " + (pixels * depth) + " bits"
      ];
      if (animated) lines.push((pixels * depth) + " bits × " + frames.length + (frames.length === 1 ? " frame" : " frames") + " = " + bits + " bits");
      lines.push(bits + " bits ÷ 8 = " + nice(bytes) + " bytes");
      lines.forEach(t => sizeCard.appendChild(make("p", "pix-sum", t)));
    }
    function paintBits(){
      bitsOut.hidden = !showBits;
      if (!showBits) return;
      bitsOut.innerHTML = "";
      const f = frames[cur];
      for (let r = 0; r < sh.h; r++){
        const line = make("div", "pix-clue");
        line.appendChild(make("span", "pix-rowno", String(r + 1))); line.title = "Row " + (r + 1);
        const bits = [];
        for (let c = 0; c < sh.w; c++) bits.push(bitsOf(f[r * sh.w + c], depth));
        line.appendChild(make("code", "", bits.join(depth > 1 ? " " : "")));
        bitsOut.appendChild(line);
      }
    }
    function paintStrip(){
      if (!strip) return;
      strip.innerHTML = "";
      const tcell = Math.max(2, Math.floor(44 / Math.max(sh.w, sh.h)));
      frames.forEach((f, i) => {
        const t = make("button", "pix-thumb" + (i === cur ? " on" : ""));
        t.type = "button";
        t.setAttribute("aria-label", "Frame " + (i + 1));
        const c = make("canvas");
        c.width = sh.w * tcell; c.height = sh.h * tcell;
        paintPixels(c, f, sh, tcell, {});
        t.appendChild(c);
        t.appendChild(make("span", "pix-thumbno", String(i + 1)));
        t.addEventListener("click", () => { cur = i; wrong = null; draw(); paintStrip(); });
        strip.appendChild(t);
      });
    }
    function draw(){
      paintPixels(canvas, frames[cur], sh, CELL, {
        lines: true,
        ghost: onion && cur > 0 ? frames[cur - 1] : null,
        wrong: cur === 0 ? wrong : null,
        cursor: document.activeElement === canvas ? cursor : null
      });
      if (preview && !timer) paintPixels(preview, frames[cur], sh, Number(preview.dataset.cell), {});
      paintBits();
      paintSize();
    }
    function paintAll(){ paintTools(); paintStrip(); paintFps(); draw(); }

    /* ---------- changing it ---------- */
    function remember(){
      undo.push({ frames: frames.map(f => f.slice()), cur: cur, depth: depth });
      if (undo.length > 60) undo.shift();
    }
    function edited(){
      wrong = null; right = false; touched = true;
      if (said) said.hidden = true;
      paintStrip(); draw();
      ctx.changed && ctx.changed();
    }
    function setDepth(d){
      if (d === depth) return;
      remember();
      depth = d;
      let lost = 0;
      frames.forEach(f => { for (let i = 0; i < f.length; i++) if (f[i] >= colours()){ f[i] = 1; lost++; } });
      if (ink >= colours()) ink = 1;
      lostNote.hidden = !lost;
      lostNote.textContent = lost ? "Squares in colours you can no longer use are now black." : "";
      paintTools(); edited();
    }
    undoBtn.addEventListener("click", () => {
      const last = undo.pop();
      if (!last) return;
      frames = last.frames; cur = Math.min(last.cur, frames.length - 1);
      /* a change to how many colours goes back too, with the squares it turned black */
      if (last.depth !== depth){ depth = last.depth; lostNote.hidden = true; paintTools(); }
      edited();
    });
    clearBtn.addEventListener("click", () => {
      remember();
      frames[cur] = new Uint8Array(N);
      edited();
    });
    bitsBtn.addEventListener("click", () => { showBits = !showBits; paintTools(); paintBits(); });

    function fill(at, to){
      const f = frames[cur], from = f[at];
      if (from === to) return;
      const todo = [at];
      while (todo.length){
        const i = todo.pop();
        if (f[i] !== from) continue;
        f[i] = to;
        const c = i % sh.w;
        if (c > 0) todo.push(i - 1);
        if (c < sh.w - 1) todo.push(i + 1);
        if (i >= sh.w) todo.push(i - sh.w);
        if (i < N - sh.w) todo.push(i + sh.w);
      }
    }
    const inkNow = () => tool === "rubber" ? 0 : ink;
    function cellAt(e){
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const col = Math.floor((e.clientX - r.left) / r.width * sh.w);
      const row = Math.floor((e.clientY - r.top) / r.height * sh.h);
      if (col < 0 || row < 0 || col >= sh.w || row >= sh.h) return null;
      return row * sh.w + col;
    }
    /* every square between the last one and this one, so a quick drag
       leaves a line rather than dots */
    function line(a, z, v){
      let x0 = a % sh.w, y0 = Math.floor(a / sh.w);
      const x1 = z % sh.w, y1 = Math.floor(z / sh.w);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;){
        frames[cur][y0 * sh.w + x0] = v;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy){ err += dy; x0 += sx; }
        if (e2 <= dx){ err += dx; y0 += sy; }
      }
    }
    let stroke = null;
    canvas.addEventListener("pointerdown", (e) => {
      const at = cellAt(e);
      if (at === null) return;
      e.preventDefault();
      remember();
      if (tool === "fill"){ fill(at, ink); edited(); return; }
      try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
      stroke = { last: at, v: inkNow() };
      frames[cur][at] = stroke.v;
      wrong = null; draw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!stroke) return;
      const at = cellAt(e);
      if (at === null || at === stroke.last) return;
      line(stroke.last, at, stroke.v);
      stroke.last = at;
      draw();
    });
    const endStroke = () => { if (!stroke) return; stroke = null; edited(); };
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    canvas.addEventListener("focus", () => { if (cursor === null) cursor = 0; draw(); });
    canvas.addEventListener("blur", () => draw());
    canvas.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -sh.w, ArrowDown: sh.w }[e.key];
      if (step){
        e.preventDefault();
        const next = cursor + step;
        const sameRow = Math.abs(step) !== 1 || Math.floor(next / sh.w) === Math.floor(cursor / sh.w);
        if (next >= 0 && next < N && sameRow) cursor = next;
        draw();
      } else if (e.key === " " || e.key === "Enter"){
        e.preventDefault();
        remember();
        if (tool === "fill") fill(cursor, ink); else frames[cur][cursor] = inkNow();
        edited();
      }
    });

    paintAll();

    const anyDrawn = () => frames.some(f => f.some(v => v !== 0));
    return {
      section: s,
      get: () => {
        if (!touched && !right) return null;
        const v = { depth: depth, frames: frames.map(pixelString) };
        if (animated) v.fps = fps;
        return v;
      },
      set: (v) => {
        if (!v || !Array.isArray(v.frames) || !v.frames.length) return;
        if (b.depthChoice === true || !target) depth = pixClamp(v.depth, 1, 4, depth);
        frames = v.frames.slice(0, animated ? maxFrames : 1).map(str => pixelFrame(str, N, colours() - 1));
        if (animated && v.fps) fps = pixClamp(v.fps, 1, 24, fps);
        if (fpsIn) fpsIn.value = String(fps);
        cur = 0; touched = true;
        if (target) right = matches() === N;
        paintAll();
      },
      done: () => right || anyDrawn()
    };
  };

})();
