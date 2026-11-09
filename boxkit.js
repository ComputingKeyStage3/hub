/* ===================================================================
   BOX KIT
   The handles every picture and box on the site is resized and turned
   with, so they all behave the same way and the way other programs do:

     a dot on each corner   bigger or smaller, keeping its shape
     a bar on each side     wider, narrower, taller or shorter
     a dot above the top    turns it round its middle

   A box is { x, y, w, h, rot }: its middle, its size and how far it is
   turned in degrees, all in whatever units the caller draws in, as long
   as a step across is the same length as a step down. A picture
   measured in per cent of its width one way and its height the other
   is turned into pixels first, or a turned box would come out squashed.

   Used by canvases (poster, whiteboard, storyboard), which draw the
   handles themselves with draw() and ask hit() what was pressed, and by
   the builder and the rich-text box, which lay real elements over the
   picture with overlay().
   =================================================================== */
(function(){
  const RAD = Math.PI / 180;
  /* where each handle sits, as a share of half the width and half the height */
  const SPOTS = { nw:[-1,-1], n:[0,-1], ne:[1,-1], e:[1,0], se:[1,1], s:[0,1], sw:[-1,1], w:[-1,0] };
  const CORNERS = ["nw","ne","se","sw"], SIDES = ["n","e","s","w"];
  const BLUE = "#2F6BAE";

  function turn(bx){ const a = (Number(bx.rot) || 0) * RAD; return [Math.cos(a), Math.sin(a)]; }
  /* from the box's own frame (centred, unturned) to the page, and back */
  function out(bx, lx, ly){
    const [c, s] = turn(bx);
    return [bx.x + lx * c - ly * s, bx.y + lx * s + ly * c];
  }
  function inward(bx, px, py){
    const [c, s] = turn(bx), dx = px - bx.x, dy = py - bx.y;
    return [dx * c + dy * s, -dx * s + dy * c];
  }
  function want(opts){
    opts = opts || {};
    return { corners: opts.corners !== false, sides: opts.sides !== false, rotate: opts.rotate !== false,
             gap: opts.gap == null ? 28 : opts.gap, top: opts.top,
             under: typeof opts.under === "boolean" ? opts.under : null };
  }

  /* How far from the middle the turning dot is, down being positive. It
     sits a little above the top edge, clear of the top bar, unless that is
     past top, the highest anything can be pressed on the canvas or page:
     then it goes below instead, or a box pushed up to the edge could not
     be turned. */
  function stalk(bx, o){
    const up = -bx.h / 2 - o.gap;
    /* Held where it was for the length of a drag: worked out afresh, the
       dot would jump from below to above as the box came round, away from
       the pointer turning it. */
    if (o.under !== null) return o.under ? -up : up;
    if (o.top == null) return up;
    return out(bx, 0, up)[1] < o.top + 8 ? -up : up;
  }
  /* Every handle the box shows, where it is on the page. */
  function points(bx, opts){
    const o = want(opts), hw = bx.w / 2, hh = bx.h / 2, list = [];
    if (o.rotate){
      const p = out(bx, 0, stalk(bx, o));
      list.push({ name: "rot", x: p[0], y: p[1] });
    }
    if (o.corners) CORNERS.forEach(n => {
      const p = out(bx, SPOTS[n][0] * hw, SPOTS[n][1] * hh); list.push({ name: n, x: p[0], y: p[1] });
    });
    if (o.sides) SIDES.forEach(n => {
      const p = out(bx, SPOTS[n][0] * hw, SPOTS[n][1] * hh); list.push({ name: n, x: p[0], y: p[1] });
    });
    return list;
  }

  /* Which handle a press landed on, if any. reach is how near counts, in
     the caller's units: a fingertip needs more than a mouse. The turning
     dot is looked at first and corners before sides, so on a small box
     the handle that is easiest to mean wins. */
  function hit(bx, p, opts){
    const reach = (opts && opts.reach) || 12;
    let best = null, near = Infinity;
    points(bx, opts).forEach(h => {
      const d = Math.hypot(p[0] - h.x, p[1] - h.y);
      const rank = h.name === "rot" ? 0 : h.name.length === 2 ? 0.5 : 1;   // ties go to the better handle
      if (d <= reach && d + rank < near){ near = d + rank; best = h.name; }
    });
    return best;
  }

  /* Inside the box, turned or not. slack widens it a little all round. */
  function inside(bx, p, slack){
    const l = inward(bx, p[0], p[1]), m = slack || 0;
    return Math.abs(l[0]) <= bx.w / 2 + m && Math.abs(l[1]) <= bx.h / 2 + m;
  }

  /* The box a handle has been dragged to, worked out from the box as it
     was when the press began, so nothing creeps as the pointer moves.
     The opposite corner or side stays exactly where it was. min and max
     are the smallest and largest either side may be; ratio:false lets
     the corners stretch too, which nothing on the site asks for yet. */
  function drag(start, name, p, opts){
    opts = opts || {};
    const min = opts.min || 8, max = opts.max || Infinity;
    const bx = { x: start.x, y: start.y, w: start.w, h: start.h, rot: Number(start.rot) || 0 };
    if (name === "rot"){
      /* pointing straight up is no turn at all */
      let deg = Math.atan2(p[1] - start.y, p[0] - start.x) / RAD + 90;
      /* A dot below the box points down when the box is upright. Read as if
         it were above, the first move turned the box upside down. */
      if (opts.under) deg += 180;
      deg = ((deg % 360) + 540) % 360 - 180;
      /* Close to upright, a quarter turn or upside down, it settles there:
         nobody can hold a mouse at exactly 90 degrees. */
      const near = Math.round(deg / 45) * 45;
      if (Math.abs(deg - near) < 4) deg = near;
      bx.rot = Math.round(deg * 10) / 10;
      if (bx.rot === -180) bx.rot = 180;
      return bx;
    }
    const sp = SPOTS[name];
    if (!sp) return bx;
    const l = inward(start, p[0], p[1]);
    const ax = -sp[0] * start.w / 2, ay = -sp[1] * start.h / 2;     // the part that stays put
    let w = start.w, h = start.h;
    const fit = (n) => Math.max(min, Math.min(max, n));
    if (sp[0] && sp[1] && opts.ratio !== false){
      /* How far along the diagonal the pointer has gone, so moving the mouse
         a little off the line still grows it evenly. */
      const dx = (l[0] - ax) * sp[0], dy = (l[1] - ay) * sp[1];
      let k = (dx * start.w + dy * start.h) / (start.w * start.w + start.h * start.h);
      const lo = Math.max(min / start.w, min / start.h), hi = Math.min(max / start.w, max / start.h);
      k = Math.max(lo, Math.min(hi, k));
      w = start.w * k; h = start.h * k;
    } else {
      if (sp[0]) w = fit((l[0] - ax) * sp[0]);
      if (sp[1]) h = fit((l[1] - ay) * sp[1]);
    }
    const mid = out(start, ax + sp[0] * w / 2, ay + sp[1] * h / 2);
    /* on a side handle the other direction keeps its own middle */
    const keep = out(start, sp[0] ? ax + sp[0] * w / 2 : 0, sp[1] ? ay + sp[1] * h / 2 : 0);
    bx.x = sp[0] && sp[1] ? mid[0] : keep[0];
    bx.y = sp[0] && sp[1] ? mid[1] : keep[1];
    bx.w = w; bx.h = h;
    return bx;
  }

  /* The cursor a handle shows, turned with the box: a side handle on a box
     turned a quarter of the way round points the other way. */
  const RESIZE = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
  const ANGLE = { e:0, se:45, s:90, sw:135, w:180, nw:225, n:270, ne:315 };
  function cursor(name, rot){
    if (name === "rot") return "grab";
    if (!(name in ANGLE)) return "";
    const a = ((ANGLE[name] + (Number(rot) || 0)) % 180 + 180) % 180;
    return RESIZE[Math.round(a / 45) % 4];
  }

  /* The outline and handles, drawn onto a canvas. unit is how many of the
     canvas's units one screen pixel is, so the handles stay the same size
     on screen whatever the zoom. */
  function draw(c, bx, opts){
    const o = want(opts), u = (opts && opts.unit) || 1, hw = bx.w / 2, hh = bx.h / 2;
    c.save();
    c.translate(bx.x, bx.y);
    c.rotate((Number(bx.rot) || 0) * RAD);
    c.strokeStyle = BLUE; c.lineWidth = 1.5 * u;
    c.setLineDash([6 * u, 4 * u]);
    c.strokeRect(-hw, -hh, bx.w, bx.h);
    c.setLineDash([]);
    const dot = stalk(bx, o);
    if (o.rotate){
      c.beginPath(); c.moveTo(0, dot < 0 ? -hh : hh); c.lineTo(0, dot); c.stroke();
    }
    c.fillStyle = "#FFFFFF"; c.lineWidth = 2 * u;
    if (o.sides) SIDES.forEach(n => {
      /* a short bar along the side, so it reads as "pull this side" */
      const along = SPOTS[n][0] ? [5 * u, 14 * u] : [14 * u, 5 * u];
      const x = SPOTS[n][0] * hw - along[0] / 2, y = SPOTS[n][1] * hh - along[1] / 2;
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, along[0], along[1], 2.5 * u); else c.rect(x, y, along[0], along[1]);
      c.fill(); c.stroke();
    });
    if (o.corners) CORNERS.forEach(n => {
      c.beginPath(); c.arc(SPOTS[n][0] * hw, SPOTS[n][1] * hh, 6 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    });
    if (o.rotate){
      c.fillStyle = BLUE;
      c.beginPath(); c.arc(0, dot, 6.5 * u, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#FFFFFF"; c.lineWidth = 1.6 * u;
      c.beginPath(); c.arc(0, dot, 3 * u, -Math.PI * 0.9, Math.PI * 0.45); c.stroke();
    }
    c.restore();
  }

  /* A straight line or an arrow has no sides to pull: a dot on each end
     moves that end, the way a drawing program does it. */
  function drawEnds(c, a, b, unit){
    const u = unit || 1;
    c.save();
    c.fillStyle = "#FFFFFF"; c.strokeStyle = BLUE; c.lineWidth = 2 * u;
    [a, b].forEach(p => { c.beginPath(); c.arc(p[0], p[1], 6 * u, 0, Math.PI * 2); c.fill(); c.stroke(); });
    c.restore();
  }
  function hitEnds(a, b, p, reach){
    const r = reach || 12;
    if (Math.hypot(p[0] - b[0], p[1] - b[1]) <= r) return "to";
    if (Math.hypot(p[0] - a[0], p[1] - a[1]) <= r) return "from";
    return null;
  }

  /* --- real elements laid over a picture, for the builder and rich text ---
     holder is what the box is measured against (positioned, so the handles
     can sit inside it). get() gives the box in pixels from the holder's top
     left; set(box, handle) is told where it has been dragged to; done() once
     the pointer is let go. Returns { place, remove, frame } so the caller can
     redraw it after moving the box some other way. */
  function overlay(holder, opts){
    const o = want(opts);
    const frame = document.createElement("div");
    frame.className = "bk-frame";
    frame.setAttribute("aria-hidden", "true");
    const knobs = {};
    const names = [].concat(o.rotate ? ["rot"] : [], o.corners ? CORNERS : [], o.sides ? SIDES : []);
    if (o.rotate){
      const stalk = document.createElement("div");
      stalk.className = "bk-stalk";
      stalk.style.height = o.gap + "px";
      frame.appendChild(stalk);
    }
    names.forEach(n => {
      const k = document.createElement("div");
      k.className = "bk-knob bk-" + (n === "rot" ? "rot" : n.length === 2 ? "corner" : "side bk-side-" + (SPOTS[n][0] ? "x" : "y"));
      k.dataset.handle = n;
      k.title = n === "rot" ? "Drag to turn it" : n.length === 2 ? "Drag to make it bigger or smaller" : "Drag to stretch it";
      if (n === "rot") k.style.top = -o.gap + "px";
      else { k.style.left = (SPOTS[n][0] + 1) * 50 + "%"; k.style.top = (SPOTS[n][1] + 1) * 50 + "%"; }
      frame.appendChild(k);
      knobs[n] = k;
    });
    holder.appendChild(frame);

    function place(){
      const bx = opts.get();
      if (!bx){ frame.hidden = true; return; }
      frame.hidden = false;
      frame.style.left = (bx.x - bx.w / 2) + "px";
      frame.style.top = (bx.y - bx.h / 2) + "px";
      frame.style.width = bx.w + "px";
      frame.style.height = bx.h + "px";
      frame.style.transform = "rotate(" + (Number(bx.rot) || 0) + "deg)";
      if (o.rotate){
        const under = stalk(bx, press ? Object.assign({}, o, { under: press.under }) : o) > 0;
        frame.classList.toggle("bk-under", under);
        knobs.rot.style.top = under ? "calc(100% + " + o.gap + "px)" : -o.gap + "px";
      }
      names.forEach(n => { knobs[n].style.cursor = cursor(n, bx.rot); });
    }
    let press = null;
    const here = (e) => {
      const r = holder.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    frame.addEventListener("pointerdown", (e) => {
      const n = e.target && e.target.dataset && e.target.dataset.handle;
      if (!n) return;
      e.preventDefault(); e.stopPropagation();
      try{ e.target.setPointerCapture(e.pointerId); }catch(err){}
      press = { name: n, start: opts.get(), el: e.target };
      press.under = !!press.start && stalk(press.start, o) > 0;
      if (n === "rot") e.target.style.cursor = "grabbing";
    });
    frame.addEventListener("pointermove", (e) => {
      if (!press || !press.start) return;
      e.preventDefault();
      opts.set(drag(press.start, press.name, here(e), Object.assign({}, opts, { under: press.under })), press.name);
      place();
    });
    const end = () => {
      if (!press) return;
      press = null;
      place();
      if (opts.done) opts.done();
    };
    frame.addEventListener("pointerup", end);
    frame.addEventListener("pointercancel", end);
    /* a press on a handle is not a click on whatever is underneath */
    frame.addEventListener("click", (e) => e.stopPropagation());
    place();
    return { place, frame, remove: () => frame.remove(), busy: () => !!press };
  }

  /* Whether the turning dot is below the box rather than above it. Asked
     when a press begins, and passed back as opts.under until it ends. */
  const under = (bx, opts) => stalk(bx, want(opts)) > 0;
  window.boxKit = { points, hit, inside, drag, cursor, draw, drawEnds, hitEnds, overlay, out, inward, under };
})();
