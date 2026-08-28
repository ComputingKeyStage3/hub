/* =====================================================================
   tasks-extra.js — four more things a lesson can ask for.

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
    let picked = [];        // everything currently selected

    /* --- picking things up, and typing straight onto the board --- */

    /* what is under the pointer, taking the topmost thing */
    function topmostAt(where){
      for (let i = strokes.length - 1; i >= 0; i--){
        const st = strokes[i];
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

      /* and anything picked up can be recoloured from here */
      ["#1D1D1B","#C0392B","#2F6BAE","#2E7D5B","#B8930A"].forEach(c => {
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
        hidePickTools();
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

    /* type where they clicked, rather than in a browser pop-up */
    function typeHere(where, e, existing){
      const rect = stage.getBoundingClientRect();
      const box = make("input", "board-typing");
      box.style.left = (e.clientX - rect.left) + "px";
      box.style.top = (e.clientY - rect.top - 14) + "px";
      box.style.color = existing ? existing.colour : colour;
      /* the same face and size it will have once written, so nothing jumps */
      const size = (existing && existing.size) || 20;
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
                         size: existing ? existing.size : 20 });
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
        if (st.kind === "text"){
          ctx2.fillStyle = st.colour;
          ctx2.font = (st.size || 20) + "px " + BOARD_FONT;
          ctx2.fillText(st.text, st.x, st.y);
          if (lit){
            ctx2.strokeStyle = "#2F6BAE"; ctx2.lineWidth = 1;
            const w = String(st.text).length * (st.size || 20) * 0.55;
            ctx2.strokeRect(st.x - 3, st.y - (st.size || 20), w + 6, (st.size || 20) + 8);
          }
          return;
        }
        if (!st.points || st.points.length < 2) return;
        ctx2.strokeStyle = lit ? "#2F6BAE" : st.colour;
        ctx2.lineWidth = lit ? st.width + 2 : st.width;
        ctx2.lineCap = "round";
        ctx2.lineJoin = "round";
        ctx2.beginPath();
        ctx2.moveTo(st.points[0][0], st.points[0][1]);
        for (let i = 1; i < st.points.length; i++) ctx2.lineTo(st.points[i][0], st.points[i][1]);
        ctx2.stroke();
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
        hidePickTools();
        draw();
        return;
      }
      const start = at(e);
      clampPoint(start);
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
      drawing.points.push(p);
      draw();
    });
    const stop = (e) => {
      if (drawing){ drawing = null; undone = []; ctx.changed(); }
      if (moving){ moving = null; ctx.changed(); }
      if (marquee){
        picked = insideBox(marquee);
        marquee = null;
        draw();
        if (picked.length && e) showPickTools(e);
      }
      panning = null;
    };
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
      wipe: '<svg viewBox="0 0 20 20"><path d="M7 2h6v2h4v2H3V4h4zM5 7h10l-.8 11H5.8z"/></svg>'
    };
    function toolBtn(name, label, title){
      const btn = make("button", "board-tool");
      btn.innerHTML = ICONS[name] || label;
      btn.title = title || label;
      btn.addEventListener("click", () => {
        tool = name;
        bar.querySelectorAll(".board-tool").forEach(x => x.classList.remove("on"));
        btn.classList.add("on");
        /* the pointer says what will happen when it is pressed */
        stage.dataset.tool = name;
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
    reset.addEventListener("click", () => { view = { x:0, y:0, scale:1 }; draw(); });

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
      get: () => ({ strokes: strokes, view: view }),
      set: (v) => {
        if (!v) return;
        if (Array.isArray(v.strokes)) strokes = v.strokes;
        if (v.view) view = v.view;
        draw();
      },
      done: () => strokes.length > 0
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
      box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("over"); });
      box.addEventListener("dragleave", () => box.classList.remove("over"));
      box.addEventListener("drop", (e) => {
        e.preventDefault();
        box.classList.remove("over");
        const word = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
        if (!word) return;
        /* a word can only be in one place at a time */
        Object.keys(placed).forEach(k => { if (placed[k] === word) delete placed[k]; });
        placed[i] = word;
        paint();
        ctx.changed();
      });
      box.addEventListener("click", () => {
        if (placed[i]){ delete placed[i]; paint(); ctx.changed(); }
      });
      holder.appendChild(box);
      return { box, answer: sp.answer };
    });

    const tray = make("div", "label-words");
    side.appendChild(tray);
    const check = make("button", "btn-primary", "Check my labels");
    const note = make("p", "label-note");
    note.hidden = true;
    side.appendChild(check);
    side.appendChild(note);

    let right = false;
    function paint(){
      tray.innerHTML = "";
      const used = new Set(Object.values(placed));
      (b.words || []).forEach(word => {
        if (used.has(word)) return;
        const chip = make("span", "label-word", word);
        chip.draggable = true;
        chip.addEventListener("dragstart", (e) => {
          if (e.dataTransfer) e.dataTransfer.setData("text/plain", word);
        });
        tray.appendChild(chip);
      });
      if (!tray.children.length) tray.appendChild(make("span", "hint", "Every word is on the picture."));
      spots.forEach((sp, i) => {
        sp.box.textContent = placed[i] || "";
        sp.box.dataset.filled = placed[i] ? "yes" : "no";
        sp.box.dataset.verdict = "";
      });
    }
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
     NOTES
     { type:"notes", title, task, starter }
     Somewhere for a student to keep their own notes, with the same
     formatting bar the lesson builder uses.
     =================================================================== */
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
     MINDMAP
     { type:"mindmap", centre, starter:[{id,text,parent}] }
     A middle idea with branches off it. The teacher can set the middle
     and some first branches; students add their own from there.
     =================================================================== */
  window.rMindmap = function(b, ctx){
    const s = make("section", "mindmap");
    const holder = make("div", "map-holder");
    s.appendChild(holder);

    let nodes = Array.isArray(b.starter) && b.starter.length
      ? JSON.parse(JSON.stringify(b.starter))
      : [{ id:"root", text: b.centre || "The big idea", parent:null }];
    let nextId = 1;

    const childrenOf = (id) => nodes.filter(n => n.parent === id);

    /* A real map rather than a list: the middle sits in the centre and the
       first branches go around it, each with its own branches below. */
    function paint(){
      holder.innerHTML = "";
      const root = nodes.find(n => n.parent === null) || nodes[0];
      if (!root) return;

      const map = make("div", "map-radial");
      const first = childrenOf(root.id);
      /* half the branches to each side, so the middle stays in the middle */
      const half = Math.ceil(first.length / 2);
      const left = make("div", "map-side map-left");
      const right = make("div", "map-side map-right");
      first.slice(0, half).forEach(n => left.appendChild(limb(n, "left")));
      first.slice(half).forEach(n => right.appendChild(limb(n, "right")));

      map.appendChild(left);
      map.appendChild(centre(root));
      map.appendChild(right);
      holder.appendChild(map);
    }

    function nodeBox(node, cls){
      const wrap = make("div", "map-node " + cls);
      const text = make("input", "map-text");
      text.value = node.text;
      text.placeholder = node.parent === null ? "The idea in the middle" : "A branch";
      text.readOnly = node.parent === null && b.lockCentre === true;
      text.addEventListener("input", () => { node.text = text.value; ctx.changed(); });
      wrap.appendChild(text);

      const tools = make("span", "map-tools");
      if (node.parent !== null){
        const add = make("button", "map-btn", "+");
        add.title = "Add a branch from here";
        add.addEventListener("click", () => {
          nodes.push({ id: "n" + (nextId++) + "-" + Date.now(), text: "", parent: node.id });
          paint(); ctx.changed();
        });
        tools.appendChild(add);
      }
      if (node.parent !== null){
        const del = make("button", "map-btn", "\u2715");
        del.title = "Remove this and anything on it";
        del.addEventListener("click", () => {
          const doomed = new Set([node.id]);
          let grew = true;
          while (grew){
            grew = false;
            nodes.forEach(n => {
              if (n.parent && doomed.has(n.parent) && !doomed.has(n.id)){ doomed.add(n.id); grew = true; }
            });
          }
          nodes = nodes.filter(n => !doomed.has(n.id));
          paint(); ctx.changed();
        });
        tools.appendChild(del);
      }
      wrap.appendChild(tools);
      return wrap;
    }

    function centre(root){
      const mid = make("div", "map-centre");
      /* a way to grow the map on either side, so it stays balanced */
      const growLeft = make("button", "map-btn map-grow", "+");
      growLeft.title = "Add a branch on the left";
      const growRight = make("button", "map-btn map-grow", "+");
      growRight.title = "Add a branch on the right";
      const branchOff = () => {
        nodes.push({ id: "n" + (nextId++) + "-" + Date.now(), text: "", parent: root.id });
        paint(); ctx.changed();
      };
      growLeft.addEventListener("click", branchOff);
      growRight.addEventListener("click", branchOff);
      mid.appendChild(growLeft);
      mid.appendChild(nodeBox(root, "is-centre"));
      mid.appendChild(growRight);
      return mid;
    }

    /* A branch and whatever grows off it, laid out sideways: the branch on
       one side, its own branches beside it, so it reads as a map rather than
       an indented list. */
    function limb(node, side){
      const wrap = make("div", "map-limb map-" + side);
      const own = make("div", "map-own");
      own.appendChild(nodeBox(node, "is-branch"));
      wrap.appendChild(own);

      const kids = childrenOf(node.id);
      if (kids.length){
        const twigs = make("div", "map-twigs");
        kids.forEach(k => twigs.appendChild(limb(k, side)));
        wrap.appendChild(twigs);
        wrap.classList.add("has-twigs");
      }
      return wrap;
    }

    paint();

    return {
      section: s,
      get: () => ({ nodes: nodes }),
      set: (v) => {
        if (!v || !Array.isArray(v.nodes) || !v.nodes.length) return;
        nodes = v.nodes;
        paint();
      },
      done: () => nodes.filter(n => n.parent !== null && String(n.text).trim()).length > 0
    };
  };
})();
