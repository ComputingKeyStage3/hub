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
    const bar = make("div", "board-bar");
    const stage = make("div", "board-stage");
    const canvas = make("canvas", "board-canvas");
    stage.appendChild(canvas);
    s.appendChild(bar);
    s.appendChild(stage);

    /* what is on the board: each stroke is a colour, a width and points */
    let strokes = Array.isArray(b.starter) ? JSON.parse(JSON.stringify(b.starter)) : [];
    let undone = [];
    let view = { x: 0, y: 0, scale: 1 };
    let tool = "pen", colour = "#1D1D1B", width = 3;
    let drawing = null, panning = null;

    const ctx2 = canvas.getContext("2d");
    function fit(){
      const rect = stage.getBoundingClientRect();
      canvas.width = Math.max(320, rect.width) * devicePixelRatio;
      canvas.height = Math.max(220, rect.height) * devicePixelRatio;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      draw();
    }
    function draw(){
      ctx2.setTransform(1, 0, 0, 1, 0, 0);
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      ctx2.setTransform(view.scale * devicePixelRatio, 0, 0,
                        view.scale * devicePixelRatio,
                        view.x * devicePixelRatio, view.y * devicePixelRatio);
      strokes.forEach(st => {
        if (st.kind === "text"){
          ctx2.fillStyle = st.colour;
          ctx2.font = (st.size || 20) + "px system-ui, sans-serif";
          ctx2.fillText(st.text, st.x, st.y);
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
      });
    }
    /* where a pointer is, in board coordinates rather than screen ones */
    function at(e){
      const r = canvas.getBoundingClientRect();
      return [ (e.clientX - r.left - view.x) / view.scale,
               (e.clientY - r.top  - view.y) / view.scale ];
    }

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      if (tool === "move" || e.button === 1){
        panning = { x: e.clientX - view.x, y: e.clientY - view.y };
        return;
      }
      if (tool === "text"){
        const where = at(e);
        const words = prompt("What should it say?");
        if (words){
          strokes.push({ kind:"text", text: words, x: where[0], y: where[1],
                         colour: colour, size: 20 });
          undone = [];
          draw(); ctx.changed();
        }
        return;
      }
      drawing = { kind:"line", colour: tool === "rub" ? "#FFFFFF" : colour,
                  width: tool === "rub" ? 24 : width, points: [at(e)] };
      strokes.push(drawing);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (panning){ view.x = e.clientX - panning.x; view.y = e.clientY - panning.y; draw(); return; }
      if (!drawing) return;
      drawing.points.push(at(e));
      draw();
    });
    const stop = () => {
      if (drawing){ drawing = null; undone = []; ctx.changed(); }
      panning = null;
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointerleave", stop);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 1.1 : 0.9;
      view.scale = Math.max(0.3, Math.min(4, view.scale * step));
      draw();
    }, { passive:false });

    /* the tools along the top */
    function toolBtn(name, label, title){
      const btn = make("button", "board-tool", label);
      btn.title = title || label;
      btn.addEventListener("click", () => {
        tool = name;
        bar.querySelectorAll(".board-tool").forEach(x => x.classList.remove("on"));
        btn.classList.add("on");
      });
      if (name === "pen") btn.classList.add("on");
      bar.appendChild(btn);
    }
    toolBtn("pen", "\u270E", "Draw");
    toolBtn("rub", "\u25FD", "Rub out");
    toolBtn("text", "T", "Add words");
    toolBtn("move", "\u2725", "Move around");

    ["#1D1D1B","#C0392B","#2F6BAE","#2E7D5B","#B8930A"].forEach(c => {
      const dot = make("button", "board-colour");
      dot.style.background = c;
      dot.title = "Draw in this colour";
      dot.addEventListener("click", () => { colour = c; tool = tool === "rub" ? "pen" : tool; });
      bar.appendChild(dot);
    });

    const undo = make("button", "board-tool", "\u21B6");
    undo.title = "Undo";
    undo.addEventListener("click", () => {
      if (!strokes.length) return;
      undone.push(strokes.pop());
      draw(); ctx.changed();
    });
    const redo = make("button", "board-tool", "\u21B7");
    redo.title = "Redo";
    redo.addEventListener("click", () => {
      if (!undone.length) return;
      strokes.push(undone.pop());
      draw(); ctx.changed();
    });
    const reset = make("button", "board-tool", "\u2302");
    reset.title = "Back to the middle";
    reset.addEventListener("click", () => { view = { x:0, y:0, scale:1 }; draw(); });
    bar.appendChild(undo); bar.appendChild(redo); bar.appendChild(reset);

    if (b.height) stage.style.height = parseInt(b.height, 10) + "px";
    setTimeout(fit, 0);
    window.addEventListener("resize", fit);

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
    const holder = make("div", "label-pic");
    const img = make("img");
    img.src = b.image || "";
    img.alt = b.alt || "";
    holder.appendChild(img);
    s.appendChild(holder);

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
    s.appendChild(tray);
    const check = make("button", "btn-primary", "Check my labels");
    const note = make("p", "label-note");
    note.hidden = true;
    s.appendChild(check);
    s.appendChild(note);

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
    let box;
    if (window.richText){
      box = window.richText(b.starter || "");
      box.classList.add("notes-box");
      s.appendChild(box);
      box.addEventListener("input", ctx.changed);
    } else {
      /* no formatting available, so a plain box rather than nothing */
      box = make("textarea", "notes-box");
      box.rows = 8;
      box.value = b.starter || "";
      box.addEventListener("input", ctx.changed);
      s.appendChild(box);
    }
    const count = make("p", "notes-count", "");
    s.appendChild(count);
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
        if (box.setHtml) box.setHtml(String(v));
        else if (box.getHtml) box.innerHTML = String(v);
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

    function childrenOf(id){ return nodes.filter(n => n.parent === id); }

    function drawNode(node, depth){
      const wrap = make("div", "map-node depth-" + Math.min(depth, 3));
      const row = make("div", "map-row");

      const text = make("input", "map-text");
      text.value = node.text;
      text.readOnly = node.id === "root" && !!b.centre && b.lockCentre === true;
      text.addEventListener("input", () => { node.text = text.value; ctx.changed(); });
      row.appendChild(text);

      const add = make("button", "btn-ghost bmini", "+");
      add.title = "Add a branch from here";
      add.addEventListener("click", () => {
        nodes.push({ id: "n" + (nextId++) + "-" + Date.now(), text: "", parent: node.id });
        paint(); ctx.changed();
      });
      row.appendChild(add);

      if (node.id !== "root"){
        const del = make("button", "btn-ghost bmini", "\u2715");
        del.title = "Remove this and anything under it";
        del.addEventListener("click", () => {
          /* take the branch and everything hanging off it */
          const doomed = new Set([node.id]);
          let grew = true;
          while (grew){
            grew = false;
            nodes.forEach(n => {
              if (n.parent && doomed.has(n.parent) && !doomed.has(n.id)){
                doomed.add(n.id); grew = true;
              }
            });
          }
          nodes = nodes.filter(n => !doomed.has(n.id));
          paint(); ctx.changed();
        });
        row.appendChild(del);
      }

      wrap.appendChild(row);
      const kids = childrenOf(node.id);
      if (kids.length){
        const branch = make("div", "map-branch");
        kids.forEach(k => branch.appendChild(drawNode(k, depth + 1)));
        wrap.appendChild(branch);
      }
      return wrap;
    }
    function paint(){
      holder.innerHTML = "";
      const root = nodes.find(n => n.parent === null) || nodes[0];
      if (root) holder.appendChild(drawNode(root, 0));
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
