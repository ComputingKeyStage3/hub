/* Quest: a little explorer runs and jumps through a world of floating
   ground, collecting coins. Guide robots stand in the way and ask a
   question; hazards bob over the path and knock the explorer back. Falling
   goes back to the start of the last island, so nothing can be lost and nobody is
   ever stuck. A wrong answer shows the right one and the guide still lets
   them through.

   { type:"quest", title, task, goal, theme, hazard,
     worlds:[{ name, questions:[{ q, options, answers:[i], why }] }] }

   worlds are visited in order, one level each, then round again as bonus
   levels: a lesson on images can have a world for pixels, one for binary,
   one for colour. A quest with no worlds and a plain questions list is one
   world. theme changes what the world looks like (islands, space, city,
   snow) and what is said, nothing about how it plays. hazard is what a
   teacher wants the hazard to say, in place of the theme's own words.

   Each level is built from its number, so it is the same for everybody and
   nothing about the world has to be saved: only the level, the coins, the
   worlds finished and how many questions were answered. Drawn on a canvas
   from shapes, with no pictures to load. */
(function(){
  "use strict";

  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const clampInt = (n, lo, hi, d) => {
    const v = parseInt(n, 10);
    return isNaN(v) ? d : Math.max(lo, Math.min(hi, v));
  };
  const shuffled = (n) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  /* the same numbers every time for the same level */
  function seeded(seed){
    let s = (seed * 9301 + 49297) % 233280 || 1;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  /* ---------- themes ----------
     place: what one level is called. fall and hit: what is said when they
     fall or a hazard knocks them back. goal: what waits at the end. */
  const THEMES = {
    islands: { name: "Floating islands", place: "Island", sky: ["#7FD0F5", "#D9F3FF"], top: "#5BBF5A", shine: "#77D36F",
               rock: "#8C6A4A", below: "#2E86C9", wave: true, extra: "clouds", hazard: "hook", goal: "boat",
               fall: "Splash! Try that jump again.", hit: "A hook! Do not take the bait." },
    space:   { name: "Outer space", place: "Planet", sky: ["#0B1030", "#2D2A6B"], top: "#C9CED6", shine: "#E6E9EE",
               rock: "#6B6F7A", below: "#3B1F5E", wave: false, extra: "stars", hazard: "meteor", goal: "rocket",
               fall: "Lost in space! Try that jump again.", hit: "Meteor! Bounced back." },
    city:    { name: "City rooftops", place: "Rooftop", sky: ["#FFB37A", "#FFE6C9"], top: "#5E636B", shine: "#80868F",
               rock: "#B65C4A", below: "#2B2B33", wave: false, extra: "towers", hazard: "drone", goal: "flag",
               fall: "Whoops! Try that jump again.", hit: "A drone! Knocked back." },
    snow:    { name: "Snowy peaks", place: "Peak", sky: ["#BFE3F7", "#F4FBFF"], top: "#FFFFFF", shine: "#E8F4FF",
               rock: "#8FA9C2", below: "#5FA8D3", wave: true, extra: "snow", hazard: "snowball", goal: "flag",
               fall: "Brrr, icy water! Try that jump again.", hit: "A snowball! Knocked back." }
  };
  window.QUEST_THEMES = THEMES;

  /* The worlds a quest holds, each with only its usable questions. */
  function questWorlds(b){
    const raw = Array.isArray(b && b.worlds) && b.worlds.length ? b.worlds : [{ name: "", questions: (b && b.questions) || [] }];
    return raw.map(w => ({ name: String((w && w.name) || "").trim(),
      pool: ((w && w.questions) || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length > 1) }))
      .filter(w => w.pool.length);
  }
  window.questWorlds = questWorlds;

  /* Whether a quest has had enough play: the coin bank filled, or about a
     question for every 12 coins in it answered, which is the same few
     levels for someone getting answers wrong; with no bank, every world
     finished once or ten questions. coverwork.js keeps the same rule. */
  window.questDone = function(b, v){
    const goal = clampInt(b && b.goal, 0, 500, 0);
    const n = (k) => Math.max(0, parseInt(v && v[k], 10) || 0);
    if (goal) return n("bank") >= goal || n("asked") >= Math.max(10, Math.ceil(goal / 12));
    return n("levels") >= Math.max(1, questWorlds(b).length) || n("asked") >= 10;
  };

  /* ---------- the world ----------
     Units: the view is 360 high. Ground sits at about y 270 with the edge
     of the world below 322; a jump clears 120 across and 90 up. */
  const VIEW_H = 360, SEA = 322, GRAV = 1500, RUN = 230, JUMP = 560;
  const GUIDES_PER_LEVEL = 4;

  function buildLevel(n){
    const rnd = seeded(n * 7 + 3);
    const plats = [], coins = [], hooks = [], guides = [];
    plats.push({ x: -200, y: 270, w: 620 });            // a wide, safe start
    let x = 420, prevY = 270;
    const segs = GUIDES_PER_LEVEL * 2 + 2;
    for (let i = 0; i < segs; i++){
      const gap = 55 + Math.floor(rnd() * (30 + Math.min(n, 4) * 5));
      x += gap;
      const w = 260 + Math.floor(rnd() * 260);
      /* never more than a small step up or down from the last island, so
         every jump can be made without perfect timing */
      const y = Math.max(220, Math.min(290, prevY + Math.round((rnd() - 0.5) * 60)));
      prevY = y;
      plats.push({ x, y, w });
      /* coins in a little arc over the gap that led here, and some on top */
      for (let c = 0; c < 3; c++) coins.push({ x: x - gap + gap * (c + 1) / 4, y: y - 70 - (c === 1 ? 16 : 0), got: false });
      if (rnd() < 0.6) for (let c = 0; c < 3; c++) coins.push({ x: x + 60 + c * 34, y: y - 30, got: false });
      /* a raised ledge with coins on it now and then */
      if (rnd() < 0.35 && w > 320){
        const lx = x + 120 + Math.floor(rnd() * (w - 260));
        plats.push({ x: lx, y: y - 85, w: 110, ledge: true });
        for (let c = 0; c < 3; c++) coins.push({ x: lx + 20 + c * 35, y: y - 115, got: false });
      }
      /* in the middle of its island, so the ground past it is room to restart on */
      if (i % 2 === 1 && guides.length < GUIDES_PER_LEVEL) guides.push({ x: x + Math.round(w * 0.4), y, open: false });
      else if (i > 0 && rnd() < 0.55) hooks.push({ x: x + w * (0.35 + rnd() * 0.3), base: y - 115, phase: rnd() * 6.28 });
      x += w;
    }
    x += 80;
    plats.push({ x, y: 270, w: 420 });
    return { plats, coins, hooks, guides, end: { x: x + 230, y: 270 }, width: x + 420 };
  }

  window.rQuest = function(b, ctx){
    ctx = ctx || {};
    const goal = clampInt(b.goal, 0, 500, 0);
    const T = THEMES[b.theme] || THEMES.islands;
    const worlds = questWorlds(b);
    const decks = worlds.map(() => []);
    const worldOf = (n) => worlds.length ? (n - 1) % worlds.length : 0;
    const nextQuestion = (wi) => {
      const w = worlds[wi];
      if (!w) return null;
      if (!decks[wi].length) decks[wi] = shuffled(w.pool.length);
      return w.pool[decks[wi].pop()];
    };
    const levelName = (n) => {
      const w = worlds[worldOf(n)];
      const bonus = n > worlds.length && worlds.length ? "Bonus " : "";
      return bonus + T.place + " " + n + (w && w.name ? ": " + w.name : "");
    };

    let level = 1, bank = 0, coins = 0, asked = 0, right = 0, levels = 0, best = 0, touched = false;
    let cleared = [];            // which worlds have been finished at least once
    let world = buildLevel(level);
    const me = { x: 40, y: 230, vx: 0, vy: 0, w: 26, h: 34, ground: false, face: 1, back: 0 };
    let checkpoint = { x: 40, y: 230 };
    let mode = "start";          // start | play | ask | done
    let camX = 0, last = 0, raf = 0, t = 0;
    const keys = { left: false, right: false, jump: false };
    let flash = "", flashUntil = 0;

    const s = make("section", "quest");
    const top = make("div", "qs-top");
    const levelEl = make("span", "qs-level");
    const coinEl = make("span", "qs-coins");
    const map = make("div", "qs-map");
    const bankWrap = make("div", "qs-bank");
    const bankBar = make("div", "qs-bank-bar");
    const bankFill = make("div", "qs-bank-fill");
    const bankSay = make("span", "qs-bank-say");
    bankBar.appendChild(bankFill); bankWrap.appendChild(bankSay); bankWrap.appendChild(bankBar);
    top.appendChild(levelEl); top.appendChild(coinEl);
    if (worlds.length > 1) top.appendChild(map);
    if (goal) top.appendChild(bankWrap);
    s.appendChild(top);

    const stageBox = make("div", "qs-stage");
    const canvas = make("canvas", "qs-canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", "The game. Left and right arrow keys to run, up arrow or space to jump.");
    stageBox.appendChild(canvas);
    const overlay = make("div", "qs-overlay");
    stageBox.appendChild(overlay);
    s.appendChild(stageBox);

    const pad = make("div", "qs-pad");
    const padBtn = (cls, label, key) => {
      const btn = make("button", "qs-padbtn " + cls, label);
      btn.type = "button";
      btn.setAttribute("aria-label", key === "jump" ? "Jump" : key === "left" ? "Run left" : "Run right");
      const on = (e) => { e.preventDefault(); keys[key] = true; if (key === "jump") jump(); };
      const off = () => { keys[key] = false; };
      btn.addEventListener("pointerdown", on);
      btn.addEventListener("pointerup", off);
      btn.addEventListener("pointerleave", off);
      btn.addEventListener("pointercancel", off);
      return btn;
    };
    const leftPad = make("div", "qs-padside");
    leftPad.appendChild(padBtn("qs-left", "◀", "left"));
    leftPad.appendChild(padBtn("qs-right", "▶", "right"));
    pad.appendChild(leftPad);
    pad.appendChild(make("span", "qs-help", "Arrow keys to run, up or space to jump"));
    pad.appendChild(padBtn("qs-jump", "Jump", "jump"));
    s.appendChild(pad);

    /* ---------- the words over the game ---------- */
    function card(){
      overlay.innerHTML = "";
      overlay.hidden = false;
      const c = make("div", "qs-card");
      overlay.appendChild(c);
      return c;
    }
    function hideCard(){ overlay.hidden = true; overlay.innerHTML = ""; }
    function resume(){ hideCard(); mode = "play"; canvas.focus({ preventScroll: true }); loop(); }
    function startCard(){
      const c = card();
      c.appendChild(make("p", "qs-title", levelName(level)));
      c.appendChild(make("p", "qs-text", worlds.length
        ? "Run to the " + (T.goal === "rocket" ? "rocket" : T.goal === "boat" ? "boat" : "flag") +
          " at the end. Collect coins, jump the gaps and dodge what is in the way. Guide robots will ask you a question."
        : "This quest has no questions yet."));
      if (!worlds.length) return;
      const go = make("button", "btn-primary qs-go", level === 1 && !levels ? "Start" : "Go");
      go.type = "button";
      go.addEventListener("click", resume);
      c.appendChild(go);
      go.focus({ preventScroll: true });
    }
    function askCard(guide){
      mode = "ask";
      keys.left = keys.right = false;
      const q = nextQuestion(worldOf(level));
      if (!q){ guide.open = true; mode = "play"; return; }
      const c = card();
      c.classList.add("qs-ask");
      c.appendChild(make("p", "qs-who", "\u{1F916} The guide robot asks:"));
      c.appendChild(make("p", "qs-q", q.q));
      const opts = make("div", "qs-opts");
      const want = Array.isArray(q.answers) && q.answers.length ? Number(q.answers[0]) : 0;
      let answered = false;
      q.options.forEach((o, i) => {
        const btn = make("button", "qs-opt", o);
        btn.type = "button";
        btn.addEventListener("click", () => {
          if (answered) return;
          answered = true;
          asked++;
          const ok = i === want;
          if (ok){ right++; earn(3); }
          opts.querySelectorAll("button").forEach((x, k) => {
            x.disabled = true;
            if (k === want) x.classList.add("right");
            else if (k === i) x.classList.add("wrong");
          });
          const fb = make("div", "qs-fb " + (ok ? "ok" : "no"));
          fb.appendChild(make("b", "", ok ? "Right! 3 coins." : "Not this time. The answer is: " + q.options[want]));
          if (q.why) fb.appendChild(make("p", "", q.why));
          c.appendChild(fb);
          const on = make("button", "btn-primary qs-go", "Carry on");
          on.type = "button";
          on.addEventListener("click", () => {
            guide.open = true;
            checkpoint = { x: guide.x + 40, y: guide.y - me.h };
            resume();
          });
          c.appendChild(on);
          on.focus({ preventScroll: true });
          touched = true;
          paintTop();
          ctx.changed && ctx.changed();
        });
        opts.appendChild(btn);
      });
      c.appendChild(opts);
      const first = opts.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    }
    function doneCard(){
      mode = "done";
      levels++;
      best = Math.max(best, coins);
      const wi = worldOf(level);
      if (cleared.indexOf(wi) < 0) cleared.push(wi);
      const c = card();
      c.appendChild(make("p", "qs-title", "⭐ " + levelName(level) + " complete!"));
      const more = goal && bank < goal ? " Your coin bank needs " + (goal - bank) + " more." : "";
      const next = levelName(level + 1);
      c.appendChild(make("p", "qs-text", "You collected " + coins + " coins." + more + " Next: " + next + "."));
      const go = make("button", "btn-primary qs-go", "Next " + T.place.toLowerCase());
      go.type = "button";
      go.addEventListener("click", () => { newLevel(level + 1); startCard(); });
      c.appendChild(go);
      go.focus({ preventScroll: true });
      touched = true;
      paintTop();
      ctx.changed && ctx.changed();
    }

    function newLevel(n){
      level = n; coins = 0;
      world = buildLevel(level);
      Object.assign(me, { x: 40, y: 230, vx: 0, vy: 0, back: 0 });
      checkpoint = { x: 40, y: 230 };
      camX = -150; mode = "start";
      paintTop(); draw();
    }
    function earn(n){ coins += n; bank += n; }
    function paintTop(){
      levelEl.textContent = levelName(level);
      coinEl.textContent = "\u{1FA99} " + coins + (coins === 1 ? " coin" : " coins");
      if (worlds.length > 1){
        map.innerHTML = "";
        worlds.forEach((w, i) => {
          const chip = make("span", "qs-chip" + (cleared.indexOf(i) >= 0 ? " done" : "") + (worldOf(level) === i ? " here" : ""),
                            (cleared.indexOf(i) >= 0 ? "✓ " : "") + (w.name || T.place + " " + (i + 1)));
          map.appendChild(chip);
        });
      }
      if (goal){
        const full = bank >= goal;
        bankFill.style.width = Math.min(100, bank / goal * 100) + "%";
        bankWrap.classList.toggle("full", full);
        bankSay.textContent = full ? "⭐ Coin bank full! Keep going for a high score."
                                   : "Coin bank: " + bank + " of " + goal;
      }
    }
    function say(words){ flash = words; flashUntil = t + 2.2; }
    function jump(){
      if (mode !== "play") return;
      if (me.ground){ me.vy = -JUMP; me.ground = false; }
    }

    /* ---------- keys, only while this game is on screen ---------- */
    const KEY = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
                  ArrowUp: "jump", w: "jump", W: "jump", " ": "jump" };
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
    function onKey(e, down){
      if (!s.isConnected){ document.removeEventListener("keydown", kd); document.removeEventListener("keyup", ku); return; }
      if (mode !== "play" || typing(e) || !s.getClientRects().length) return;
      const k = KEY[e.key];
      if (!k) return;
      e.preventDefault();
      if (k === "jump"){ if (down && !keys.jump) jump(); keys.jump = down; }
      else keys[k] = down;
    }
    const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
    document.addEventListener("keydown", kd);
    document.addEventListener("keyup", ku);

    /* ---------- moving ---------- */
    const overlap = (a, b2) => a.x < b2.x + b2.w && a.x + a.w > b2.x && a.y < b2.y + b2.h && a.y + a.h > b2.y;
    const hazardY = (h) => h.base + Math.sin(t * 2 + h.phase) * 40;
    function step(dt){
      t += dt;
      /* a hazard knocks them back for a moment, then the keys work again */
      if (me.back > 0){ me.back -= dt; me.vx = -RUN * 1.2; }
      else me.vx = (keys.right ? RUN : 0) - (keys.left ? RUN : 0);
      if (me.vx) me.face = me.vx > 0 ? 1 : -1;
      me.vy = Math.min(900, me.vy + GRAV * dt);
      const wasBottom = me.y + me.h;
      me.x += me.vx * dt;
      me.y += me.vy * dt;
      if (me.x < -150) me.x = -150;
      /* landing on top of the ground, never catching on its side */
      me.ground = false;
      for (const p of world.plats){
        if (me.x + me.w > p.x + 4 && me.x < p.x + p.w - 4 && me.vy >= 0 &&
            wasBottom <= p.y + 2 && me.y + me.h >= p.y){
          me.y = p.y - me.h; me.vy = 0; me.ground = true;
          /* a fall goes back to the start of the last island stood on, not
             all the way back: the jump is tried again straight away */
          if (!p.ledge && p.x + 30 > checkpoint.x) checkpoint = { x: p.x + 30, y: p.y - me.h };
        }
      }
      /* a closed guide is a wall, and walking into it asks the question */
      for (const g of world.guides){
        if (g.open) continue;
        /* at any height, so it cannot be jumped over */
        if (me.x + me.w > g.x - 6 && me.x < g.x + 30){
          me.x = g.x - 6 - me.w;
          askCard(g);
          return;
        }
      }
      for (const c of world.coins){
        if (!c.got && overlap(me, { x: c.x - 9, y: c.y - 9, w: 18, h: 18 })){ c.got = true; earn(1); paintTop(); touched = true; }
      }
      for (const h of world.hooks){
        const hy = hazardY(h);
        if (me.back <= 0 && overlap(me, { x: h.x - 11, y: hy - 4, w: 22, h: 30 })){
          me.back = 0.35; me.vy = -260;
          say(String(b.hazard || "").trim() || T.hit);
        }
      }
      if (me.y > SEA + 20){
        Object.assign(me, { x: checkpoint.x, y: checkpoint.y - 30, vx: 0, vy: 0, back: 0 });
        say(T.fall);
      }
      if (me.x > world.end.x - 20){ doneCard(); return; }
      const viewW = canvas.width / scale();
      camX += ((me.x - viewW * 0.35) - camX) * Math.min(1, dt * 6);
      camX = Math.max(-150, Math.min(world.width - viewW, camX));
    }

    /* ---------- drawing ---------- */
    const scale = () => canvas.height / VIEW_H;
    function fit(){
      const r = stageBox.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const h = r.height || Math.round(r.width * 0.5);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(h * dpr);
      draw();
    }
    function roundRect(x, c, X, Y, W, H, R){
      x.beginPath();
      x.moveTo(X + R, Y); x.lineTo(X + W - R, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + R);
      x.lineTo(X + W, Y + H - R); x.quadraticCurveTo(X + W, Y + H, X + W - R, Y + H);
      x.lineTo(X + R, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - R);
      x.lineTo(X, Y + R); x.quadraticCurveTo(X, Y, X + R, Y);
      x.closePath(); x.fillStyle = c; x.fill();
    }
    /* what is behind everything, moving slower than the ground */
    function backdrop(x, viewW){
      const loopW = viewW + 300, par = (n, sp) => ((n - camX * sp) % loopW + loopW) % loopW - 150;
      if (T.extra === "clouds"){
        x.fillStyle = "rgba(255,255,255,.85)";
        for (let i = 0; i < 8; i++){
          const cx = par(i * 260, 0.3), cy = 40 + (i % 3) * 30;
          x.beginPath(); x.ellipse(cx, cy, 42, 14, 0, 0, 6.29); x.ellipse(cx + 26, cy - 8, 28, 14, 0, 0, 6.29); x.fill();
        }
      } else if (T.extra === "stars"){
        for (let i = 0; i < 70; i++){
          const sx = par(i * 97 % 1400, 0.1), sy = (i * 53) % 300;
          x.fillStyle = "rgba(255,255,255," + (0.4 + 0.6 * Math.abs(Math.sin(t + i))) + ")";
          x.fillRect(sx, sy, 2, 2);
        }
        x.fillStyle = "#E58B52"; x.beginPath(); x.arc(par(500, 0.05), 80, 34, 0, 6.29); x.fill();
        x.strokeStyle = "rgba(255,210,170,.7)"; x.lineWidth = 3; x.beginPath(); x.ellipse(par(500, 0.05), 80, 54, 12, -0.3, 0, 6.29); x.stroke();
      } else if (T.extra === "towers"){
        x.fillStyle = "rgba(120,70,90,.35)";
        for (let i = 0; i < 12; i++){
          const tx = par(i * 130, 0.25), th = 90 + (i * 37) % 120;
          x.fillRect(tx, SEA - th, 70, th);
        }
        x.fillStyle = "#FFD27A"; x.beginPath(); x.arc(par(300, 0.05), 90, 30, 0, 6.29); x.fill();
      } else if (T.extra === "snow"){
        x.fillStyle = "rgba(160,190,215,.5)";
        for (let i = 0; i < 6; i++){
          const mx = par(i * 300, 0.2);
          x.beginPath(); x.moveTo(mx - 140, SEA); x.lineTo(mx, 120 + (i % 2) * 40); x.lineTo(mx + 140, SEA); x.fill();
        }
        x.fillStyle = "#FFFFFF";
        for (let i = 0; i < 50; i++){
          const fx = par(i * 71 % 1300 + Math.sin(t + i) * 10, 0.6), fy = (i * 37 + t * 30) % VIEW_H;
          x.beginPath(); x.arc(fx, fy, 2, 0, 6.29); x.fill();
        }
      }
    }
    function drawHazard(x, h){
      const hy = hazardY(h);
      if (T.hazard === "hook"){
        x.strokeStyle = "#5E636B"; x.lineWidth = 2;
        x.beginPath(); x.moveTo(h.x, 0); x.lineTo(h.x, hy); x.stroke();
        x.strokeStyle = "#B9BDC4"; x.lineWidth = 4;
        x.beginPath(); x.moveTo(h.x, hy); x.lineTo(h.x, hy + 14); x.arc(h.x - 7, hy + 14, 7, 0, Math.PI); x.stroke();
        x.fillStyle = "#FFFFFF"; x.fillRect(h.x - 9, hy + 18, 18, 12);
        x.strokeStyle = "#E23B3B"; x.lineWidth = 1.5; x.strokeRect(h.x - 9, hy + 18, 18, 12);
        x.beginPath(); x.moveTo(h.x - 9, hy + 18); x.lineTo(h.x, hy + 25); x.lineTo(h.x + 9, hy + 18); x.stroke();
      } else if (T.hazard === "meteor"){
        x.fillStyle = "rgba(255,140,60,.35)"; x.beginPath(); x.ellipse(h.x + 10, hy + 6, 20, 9, -0.6, 0, 6.29); x.fill();
        x.fillStyle = "#8A5A33"; x.beginPath(); x.arc(h.x, hy + 12, 12, 0, 6.29); x.fill();
        x.fillStyle = "#5E3A1E"; x.beginPath(); x.arc(h.x - 4, hy + 9, 3, 0, 6.29); x.arc(h.x + 4, hy + 16, 2.5, 0, 6.29); x.fill();
      } else if (T.hazard === "drone"){
        x.fillStyle = "#2B2B33"; x.fillRect(h.x - 10, hy + 8, 20, 9);
        x.fillStyle = "#E23B3B"; x.beginPath(); x.arc(h.x, hy + 12, 2.5, 0, 6.29); x.fill();
        x.strokeStyle = "#2B2B33"; x.lineWidth = 2;
        x.beginPath(); x.moveTo(h.x - 10, hy + 8); x.lineTo(h.x - 16, hy + 3); x.moveTo(h.x + 10, hy + 8); x.lineTo(h.x + 16, hy + 3); x.stroke();
        const spin = Math.abs(Math.sin(t * 30)) * 8 + 2;
        x.fillStyle = "rgba(43,43,51,.6)"; x.fillRect(h.x - 16 - spin / 2, hy + 1, spin, 2); x.fillRect(h.x + 16 - spin / 2, hy + 1, spin, 2);
      } else {
        x.fillStyle = "#FFFFFF"; x.beginPath(); x.arc(h.x, hy + 12, 12, 0, 6.29); x.fill();
        x.strokeStyle = "#B9D3EA"; x.lineWidth = 2; x.stroke();
      }
    }
    function drawGoal(x){
      const e = world.end;
      if (T.goal === "boat"){
        x.fillStyle = "#8A5A33"; x.beginPath(); x.moveTo(e.x - 40, e.y - 24); x.lineTo(e.x + 50, e.y - 24); x.lineTo(e.x + 36, e.y); x.lineTo(e.x - 28, e.y); x.closePath(); x.fill();
        x.fillStyle = "#5E636B"; x.fillRect(e.x + 2, e.y - 100, 4, 76);
        x.fillStyle = "#FFFFFF"; x.beginPath(); x.moveTo(e.x + 6, e.y - 96); x.lineTo(e.x + 46, e.y - 34); x.lineTo(e.x + 6, e.y - 34); x.closePath(); x.fill();
        x.fillStyle = "#E23B3B"; x.beginPath(); x.moveTo(e.x + 6, e.y - 100); x.lineTo(e.x + 26, e.y - 93); x.lineTo(e.x + 6, e.y - 86); x.closePath(); x.fill();
      } else if (T.goal === "rocket"){
        roundRect(x, "#E8EEF5", e.x - 14, e.y - 96, 28, 80, 12);
        x.fillStyle = "#E23B3B"; x.beginPath(); x.moveTo(e.x - 14, e.y - 80); x.lineTo(e.x, e.y - 112); x.lineTo(e.x + 14, e.y - 80); x.closePath(); x.fill();
        x.fillStyle = "#2F6BDE"; x.beginPath(); x.arc(e.x, e.y - 62, 7, 0, 6.29); x.fill();
        x.fillStyle = "#E23B3B"; x.beginPath(); x.moveTo(e.x - 14, e.y - 36); x.lineTo(e.x - 26, e.y); x.lineTo(e.x - 14, e.y - 14); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(e.x + 14, e.y - 36); x.lineTo(e.x + 26, e.y); x.lineTo(e.x + 14, e.y - 14); x.closePath(); x.fill();
        x.fillStyle = "#F6C31C"; x.beginPath(); x.moveTo(e.x - 8, e.y - 16); x.lineTo(e.x, e.y + (Math.sin(t * 20) * 3)); x.lineTo(e.x + 8, e.y - 16); x.closePath(); x.fill();
      } else {
        x.fillStyle = "#5E636B"; x.fillRect(e.x, e.y - 110, 5, 110);
        const wave = Math.sin(t * 4) * 4;
        x.fillStyle = "#E23B3B"; x.beginPath(); x.moveTo(e.x + 5, e.y - 110); x.quadraticCurveTo(e.x + 25, e.y - 104 + wave, e.x + 45, e.y - 98);
        x.lineTo(e.x + 5, e.y - 82); x.closePath(); x.fill();
      }
    }
    function draw(){
      const x = canvas.getContext("2d");
      const k = scale(), viewW = canvas.width / k;
      x.setTransform(1, 0, 0, 1, 0, 0);
      const sky = x.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, T.sky[0]); sky.addColorStop(1, T.sky[1]);
      x.fillStyle = sky; x.fillRect(0, 0, canvas.width, canvas.height);
      x.setTransform(k, 0, 0, k, 0, 0);
      backdrop(x, viewW);
      x.save();
      x.translate(-camX, 0);
      /* the ground: a top surface, and what is underneath tapering away */
      for (const p of world.plats){
        if (p.x > camX + viewW + 20 || p.x + p.w < camX - 20) continue;
        x.fillStyle = T.rock;
        x.beginPath();
        if (T.extra === "towers"){
          x.rect(p.x + 8, p.y + 8, p.w - 16, VIEW_H);           // buildings go all the way down
        } else {
          x.moveTo(p.x + 6, p.y + 8); x.lineTo(p.x + p.w - 6, p.y + 8);
          x.lineTo(p.x + p.w * 0.72, p.y + (p.ledge ? 30 : 64)); x.lineTo(p.x + p.w * 0.3, p.y + (p.ledge ? 30 : 64));
          x.closePath();
        }
        x.fill();
        if (T.extra === "towers" && !p.ledge){
          x.fillStyle = "rgba(255,230,150,.7)";
          for (let wy = p.y + 24; wy < SEA + 30; wy += 26)
            for (let wx = p.x + 22; wx < p.x + p.w - 30; wx += 34) x.fillRect(wx, wy, 12, 12);
        }
        roundRect(x, T.top, p.x, p.y, p.w, 14, 7);
        roundRect(x, T.shine, p.x + 4, p.y + 2, p.w - 8, 5, 3);
      }
      /* the edge of the world: sea, space or a street */
      x.fillStyle = T.below;
      x.beginPath(); x.moveTo(camX - 20, SEA);
      for (let wx = camX - 20; wx <= camX + viewW + 20; wx += 20)
        x.lineTo(wx, SEA + (T.wave ? Math.sin(wx / 30 + t * 2) * 4 : 0));
      x.lineTo(camX + viewW + 20, VIEW_H + 10); x.lineTo(camX - 20, VIEW_H + 10); x.closePath(); x.fill();
      for (const c of world.coins){
        if (c.got || c.x < camX - 20 || c.x > camX + viewW + 20) continue;
        const sq = Math.abs(Math.cos(t * 3 + c.x));
        x.fillStyle = "#F6C31C"; x.beginPath(); x.ellipse(c.x, c.y, 9 * sq + 2, 9, 0, 0, 6.29); x.fill();
        x.fillStyle = "#FFE680"; x.beginPath(); x.ellipse(c.x, c.y, 4 * sq + 1, 4, 0, 0, 6.29); x.fill();
      }
      for (const h of world.hooks){
        if (h.x < camX - 40 || h.x > camX + viewW + 40) continue;
        drawHazard(x, h);
      }
      for (const g of world.guides){
        if (g.x < camX - 60 || g.x > camX + viewW + 60) continue;
        const gx = g.x, gy = g.y;
        if (!g.open){
          x.fillStyle = "rgba(142,75,196,.25)"; x.fillRect(gx + 30, gy - 110, 10, 110);
          x.fillStyle = "rgba(142,75,196,.6)"; x.fillRect(gx + 33, gy - 110, 4, 110);
        }
        roundRect(x, "#E8EEF5", gx, gy - 52, 30, 40, 8);
        roundRect(x, g.open ? "#3FA34D" : "#2F6BDE", gx + 4, gy - 46, 22, 16, 4);
        x.fillStyle = "#FFFFFF"; x.font = "bold 13px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(g.open ? "✓" : "?", gx + 15, gy - 38);
        x.fillStyle = "#5E636B"; x.fillRect(gx + 13, gy - 60, 4, 8);
        x.fillStyle = "#E23B3B"; x.beginPath(); x.arc(gx + 15, gy - 62, 4, 0, 6.29); x.fill();
        x.fillStyle = "#5E636B"; x.fillRect(gx + 6, gy - 12, 6, 12); x.fillRect(gx + 18, gy - 12, 6, 12);
      }
      drawGoal(x);
      /* the explorer: a round body, a backpack, eyes that look where it runs */
      const px = me.x, py = me.y, f = me.face;
      const bob = me.ground && me.vx ? Math.abs(Math.sin(t * 14)) * 2 : 0;
      roundRect(x, "#F28C28", px + (f > 0 ? -5 : me.w - 3), py + 12 - bob, 8, 14, 3);
      roundRect(x, "#2F6BDE", px, py + 8 - bob, me.w, me.h - 14, 9);
      x.fillStyle = "#F2C9A0"; x.beginPath(); x.arc(px + me.w / 2, py + 6 - bob, 11, 0, 6.29); x.fill();
      x.fillStyle = "#3FA34D"; x.beginPath(); x.arc(px + me.w / 2, py + 1 - bob, 11, Math.PI, 0); x.fill();
      x.fillStyle = "#1B1B1F";
      x.beginPath(); x.arc(px + me.w / 2 + f * 4, py + 7 - bob, 1.8, 0, 6.29); x.arc(px + me.w / 2 + f * 9, py + 7 - bob, 1.8, 0, 6.29); x.fill();
      const leg = me.ground && me.vx ? Math.sin(t * 14) * 4 : 0;
      x.fillStyle = "#1B1B1F"; x.fillRect(px + 6 + leg, py + me.h - 6, 5, 6); x.fillRect(px + me.w - 11 - leg, py + me.h - 6, 5, 6);
      x.restore();
      if (flash && t < flashUntil){
        x.font = "bold 16px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
        const wd = x.measureText(flash).width + 28;
        roundRect(x, "rgba(27,27,31,.78)", viewW / 2 - wd / 2, 14, wd, 30, 15);
        x.fillStyle = "#FFFFFF"; x.fillText(flash, viewW / 2, 29);
      }
    }
    function loop(){
      cancelAnimationFrame(raf);
      last = performance.now();
      const tick = (now) => {
        if (!s.isConnected || mode !== "play") return;
        /* off screen (another page of the lesson): wait without moving */
        if (!s.getClientRects().length){ last = now; raf = requestAnimationFrame(tick); return; }
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        step(dt);
        draw();
        if (mode === "play") raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    if (window.ResizeObserver){ try{ new ResizeObserver(fit).observe(stageBox); }catch(e){} }
    camX = -150;
    paintTop();
    startCard();
    requestAnimationFrame(fit);

    return {
      section: s,
      get: () => touched ? { level, bank, asked, right, levels, best, cleared: cleared.slice() } : null,
      set: (v) => {
        if (!v || typeof v !== "object") return;
        bank = Math.max(0, parseInt(v.bank, 10) || 0);
        asked = Math.max(0, parseInt(v.asked, 10) || 0);
        right = Math.max(0, parseInt(v.right, 10) || 0);
        levels = Math.max(0, parseInt(v.levels, 10) || 0);
        best = Math.max(0, parseInt(v.best, 10) || 0);
        cleared = Array.isArray(v.cleared) ? v.cleared.filter(n => Number.isInteger(n) && n >= 0 && n < worlds.length) : [];
        touched = true;
        /* back at the start of the level they were on */
        newLevel(clampInt(v.level, 1, 999, 1));
        startCard();
      },
      done: () => window.questDone(b, { bank, asked, levels })
    };
  };
})();
