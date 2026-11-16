/* =====================================================================
   motion.js: small movements that say something has happened.

   Every machine in the school has Windows Animation effects switched off,
   which Chromium reports as prefers-reduced-motion, and style.css answers
   that by stopping every CSS animation and transition on the site. So the
   movements here are made with the Web Animations API (element.animate),
   which that rule cannot reach, and they are kept to what that setting is
   not there to spare anyone: fades, a few pixels of travel, a slight scale.
   Nothing sweeps across the screen and nothing spins.

   Settings > Reduce animation is the switch for a student who really does
   need the movement gone. It puts data-motion="less" on <html>, and every
   function here then does the plain thing instead: a busy button still
   says it is busy, in words, and nothing moves.

   Timings follow one rule: a response to a click is over in 100 to 250ms,
   arriving is a little slower than leaving.
   ===================================================================== */
(function(){
  const EASE_OUT = "cubic-bezier(.16, 1, .3, 1)";
  const EASE_IN = "cubic-bezier(.4, 0, 1, 1)";
  function off(){ return document.documentElement.dataset.motion === "less"; }
  function can(el){ return !!(el && el.animate && !off()); }
  function play(el, frames, opts){
    if (!can(el)) return null;
    try{ return el.animate(frames, opts); }catch(e){ return null; }
  }

  /* ---------------- a button that is busy, then done ----------------
     The button keeps its width and its place and shows three dots where its
     words were, then draws a tick, so loading and finishing are one movement
     on the thing that was pressed rather than a line of small text somewhere
     under it. It cannot be pressed again while it is busy, which also stops
     a second save going in behind the first.

       const b = hubMotion.busy(button);
       ... await the work ...
       await b.done("Saved");   // tick, then the button is put back
       b.fail();                // put back at once, with a nudge
  */
  const TICK = '<svg class="mo-tick" viewBox="0 0 24 24" aria-hidden="true">' +
               '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" ' +
               'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  /* A tick that draws itself, then the word, in the button. On its own for
     a button that already has a Saved state of its own (Mark work's Save),
     and as the end of busy() for everything else. */
  function tick(btn, text){
    if (!btn) return;
    btn.classList.add("mo-done");
    btn.innerHTML = TICK + '<span class="mo-done-word">' + text + '</span>';
    const path = btn.querySelector(".mo-tick path");
    if (path && can(path)){
      const len = 22;
      path.style.strokeDasharray = len;
      play(path, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 240, easing: EASE_OUT, fill: "both" });
      play(btn, [{ transform:"scale(1)" }, { transform:"scale(1.04)", offset:.5 }, { transform:"scale(1)" }],
           { duration: 260, easing: EASE_OUT });
    }
  }
  function busy(btn, words){
    const none = { done: () => Promise.resolve(), fail(){}, reset(){} };
    if (!btn || btn.dataset.moBusy === "1") return none;
    const was = { html: btn.innerHTML, disabled: btn.disabled, minW: btn.style.minWidth };
    btn.style.minWidth = btn.getBoundingClientRect().width + "px";
    btn.dataset.moBusy = "1";
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("mo-busy");
    const label = words || "Working";
    /* The words stay in the button, hidden, so it keeps its height and a
       screen reader still has something to say. With motion reduced they
       are what shows, because three still dots read as nothing. */
    btn.innerHTML = '<span class="mo-word">' + label + '…</span>';
    let dots = [];
    if (!off()){
      const row = document.createElement("span");
      row.className = "mo-dots";
      row.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i++){ const d = document.createElement("i"); row.appendChild(d); dots.push(d); }
      btn.appendChild(row);
      btn.classList.add("mo-dotted");
      dots = dots.map((d, i) => play(d,
        [{ transform:"translateY(0)", opacity:.45 }, { transform:"translateY(-4px)", opacity:1, offset:.4 },
         { transform:"translateY(0)", opacity:.45, offset:.8 }, { transform:"translateY(0)", opacity:.45 }],
        { duration: 900, delay: i * 140, iterations: Infinity, easing: "ease-in-out" }));
    }
    let settled = false;
    function putBack(){
      dots.forEach(a => { if (a) a.cancel(); });
      btn.innerHTML = was.html;
      btn.disabled = was.disabled;
      btn.style.minWidth = was.minW;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("mo-busy", "mo-dotted", "mo-done");
      delete btn.dataset.moBusy;
    }
    return {
      done(text, hold){
        if (settled) return Promise.resolve();
        settled = true;
        dots.forEach(a => { if (a) a.cancel(); });
        btn.classList.remove("mo-dotted");
        tick(btn, text || "Done");
        const wait = hold === undefined ? (off() ? 350 : 520) : hold;
        return new Promise(r => setTimeout(() => {
          r();
          /* The caller usually closes the pop-up the moment this resolves.
             Putting the old words back first showed "Save" again in the
             copy that fades out, so it waits a moment: the copy has been
             taken by then, and the real button, hidden or not, is put back
             ready for the next time its pop-up opens. */
          setTimeout(() => { if (btn.dataset.moBusy === "1") putBack(); }, 60);
        }, wait));
      },
      fail(){
        if (settled) return;
        settled = true;
        putBack();
        nudge(btn);
      },
      reset(){ if (!settled){ settled = true; putBack(); } }
    };
  }

  /* ---------------- small reactions ---------------- */
  function nudge(el){
    return play(el, [{ transform:"translateX(0)" }, { transform:"translateX(-5px)" }, { transform:"translateX(4px)" },
                     { transform:"translateX(-2px)" }, { transform:"translateX(0)" }],
                { duration: 300, easing: "ease-out" });
  }
  function pop(el){
    return play(el, [{ transform:"scale(1)" }, { transform:"scale(1.06)", offset:.4 }, { transform:"scale(1)" }],
                { duration: 240, easing: EASE_OUT });
  }
  /* Something has just appeared in place of something else: a screen of the
     console, the next student, a task that has been opened. A fade and a
     few pixels, so the change can be seen without anything travelling. */
  function arrive(el, rise){
    return play(el, [{ opacity: 0, transform: "translateY(" + (rise === undefined ? 6 : rise) + "px)" },
                     { opacity: 1, transform: "none" }],
                { duration: 200, easing: EASE_OUT });
  }
  /* A section that has just been opened grows to its height. The height is
     measured once and the box is let go at the end, so nothing is left
     holding a fixed size when the words inside it change. */
  function reveal(el){
    if (!can(el)) return null;
    const h = el.getBoundingClientRect().height;
    if (!h) return arrive(el);
    const was = el.style.overflow;
    el.style.overflow = "hidden";
    const a = play(el, [{ height: "0px", opacity: 0 }, { height: h + "px", opacity: 1 }],
                   { duration: Math.min(260, 140 + h / 6), easing: EASE_OUT });
    const end = () => { el.style.overflow = was; };
    if (a){ a.onfinish = end; a.oncancel = end; } else end();
    return a;
  }
  /* Something waiting that is not a button, such as the line standing in
     for a picture while it uploads: it fades up and down until it goes.
     With motion reduced it is simply the words. */
  function breathe(el){
    return play(el, [{ opacity: 1 }, { opacity: .45 }, { opacity: 1 }],
                { duration: 1400, iterations: Infinity, easing: "ease-in-out" });
  }

  /* ---------------- pop-ups going away ----------------
     Every pop-up on the site is a .modal-back that is hidden to close it,
     from a dozen places. Rather than teach each of them to wait, a copy of
     what was on screen is laid over the top for the moment it fades, and
     the real one has already gone. Nothing in the copy can be pressed. */
  function fadeOut(el, parent){
    parent = parent || el.parentNode;
    if (!can(el) || !parent) return;
    /* A pop-up that was removed rather than hidden has no size left to
       check, so only one that is still in the page is measured. */
    if (el.isConnected){
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
    }
    const ghost = el.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach(x => x.removeAttribute("id"));
    ghost.querySelectorAll("iframe, video, audio, script").forEach(x => x.remove());
    ghost.hidden = false;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    ghost.classList.add("mo-ghost");
    ghost.style.pointerEvents = "none";
    if (el.isConnected) parent.insertBefore(ghost, el.nextSibling); else parent.appendChild(ghost);
    const box = ghost.querySelector(".modal") || ghost.firstElementChild;
    if (box) play(box, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.98)" }],
                  { duration: 130, easing: EASE_IN, fill: "forwards" });
    const a = play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: EASE_IN, fill: "forwards" });
    const gone = () => ghost.remove();
    if (a){ a.onfinish = gone; a.oncancel = gone; } else gone();
    setTimeout(gone, 400);
  }

  /* ---------------- right and wrong ----------------
     Every task that marks itself says so by setting data-verdict on its
     feedback line, in twenty-odd places across lesson.html and
     tasks-extra.js. One watcher here answers all of them: a pop for right,
     a nudge for not yet. Only straight after a press or a key, so a lesson
     opened again with its answers already marked does not bounce them all
     at once as it draws. */
  let lastAct = 0;
  const acted = () => { lastAct = Date.now(); };
  document.addEventListener("pointerdown", acted, true);
  document.addEventListener("keydown", acted, true);
  function watch(){
    if (!window.MutationObserver || !document.documentElement) return;
    new MutationObserver(list => {
      list.forEach(m => {
        const t = m.target;
        if (!t || t.nodeType !== 1) return;
        if (m.attributeName === "data-verdict"){
          if (Date.now() - lastAct > 700) return;
          const v = t.dataset.verdict;
          if (!v || t.hidden) return;
          if (v === "correct") { arrive(t, 4); pop(t); }
          else if (v === "incorrect") { arrive(t, 4); nudge(t); }
        } else if (m.attributeName === "hidden"){
          if (m.oldValue === null && t.hidden && t.classList.contains("modal-back")) fadeOut(t);
        }
      });
    }).observe(document.documentElement, { subtree: true, attributes: true,
      attributeFilter: ["data-verdict", "hidden"], attributeOldValue: true });
    /* Most of the lesson page's pop-ups are made for the moment and removed
       rather than hidden. They are all hung straight off <body>, so only its
       own children are watched, not the whole page. */
    const onBody = () => new MutationObserver(list => {
      list.forEach(m => m.removedNodes.forEach(n => {
        if (n.nodeType === 1 && n.classList.contains("modal-back") && !n.hidden && !n.classList.contains("mo-ghost"))
          fadeOut(n, document.body);
      }));
    }).observe(document.body, { childList: true });
    if (document.body) onBody(); else document.addEventListener("DOMContentLoaded", onBody, { once: true });
  }
  if (document.documentElement) watch();
  else document.addEventListener("DOMContentLoaded", watch, { once: true });

  /* A list that has just been drawn comes in one item after another, a
     moment apart, so a screen of cards reads as arriving rather than as a
     block that was simply there. Only the first dozen wait their turn: the
     rest come with the twelfth, so a long list is never slow to finish. */
  function stagger(items, rise){
    if (off()) return;
    Array.from(items || []).forEach((el, i) => {
      if (!el || !el.animate || !el.getClientRects().length) return;
      play(el, [{ opacity: 0, transform: "translateY(" + (rise === undefined ? 8 : rise) + "px)" },
                { opacity: 1, transform: "none" }],
           { duration: 240, delay: Math.min(i, 12) * 28, easing: EASE_OUT, fill: "backwards" });
    });
  }
  /* A highlight that moves from one item to another, such as the side
     menu's current screen. A pill is laid over the old item, glides to the
     new one and is taken away, and the new item's own background is held
     back meanwhile (mo-gliding) so there are never two. */
  function glide(from, to, holder, cls){
    if (!can(to) || !from || from === to || !holder) return;
    holder.querySelectorAll(":scope > .mo-pill").forEach(p => p.remove());
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), h = holder.getBoundingClientRect();
    if (!a.height || !b.height) return;
    const pill = document.createElement("span");
    pill.className = "mo-pill " + (cls || "");
    pill.setAttribute("aria-hidden", "true");
    pill.style.left = (b.left - h.left + holder.scrollLeft) + "px";
    pill.style.top = (b.top - h.top + holder.scrollTop) + "px";
    pill.style.width = b.width + "px";
    pill.style.height = b.height + "px";
    holder.appendChild(pill);
    to.classList.add("mo-gliding");
    const anim = play(pill, [{ transform: "translate(" + (a.left - b.left) + "px," + (a.top - b.top) + "px)" },
                             { transform: "none" }],
                      { duration: 260, easing: EASE_OUT });
    const end = () => { pill.remove(); to.classList.remove("mo-gliding"); };
    if (anim){ anim.onfinish = end; anim.oncancel = end; } else end();
    setTimeout(end, 600);
  }
  /* A console screen that has just been changed to. Its cards come in one
     after another; and since most screens fill their cards only once an
     answer comes back from the server, the screen is watched for a moment
     afterwards and cards arriving late come in the same way. A card inside
     another card waits for its parent rather than moving twice. */
  const CARDS = ".lessonCard, .classtile, .lessonpill, .richcard, .ov-row, .who-row, .taskrow, " +
                ".unit-lesson-row, .coverrow, .topicrow, .specrow, .pace-row, .summary-row, .changerow, .mbstat";
  const topCards = (list) => list.filter(el => !(el.parentElement && el.parentElement.closest(CARDS)));
  /* A card is known by what it says, not by the element. Most screens draw
     their cards at once from what is already held and then draw them all
     again a moment later as brand new elements, so remembering elements let
     every class tile come in twice, 7ms apart. A card saying the same as one
     already on its way in is a redraw: its animation is carried over to the
     new element at the point it had reached, so each card arrives once,
     whichever element it ends up being. */
  const cardKey = (el) => (el.className || "") + "|" + (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
  function settle(view, watchMs){
    if (!view || off()) return;
    const going = new Map();       // card key -> its animation
    function bring(list){
      const fresh = [];
      topCards(list).forEach(el => {
        const k = cardKey(el), was = going.get(k);
        if (!was){ fresh.push(el); return; }
        if (was.effect && was.effect.target === el) return;
        if (was.playState === "finished") return;
        const timing = was.effect.getTiming();
        const a = play(el, was.effect.getKeyframes(), timing);
        if (a){ a.currentTime = was.currentTime; going.set(k, a); }
      });
      stagger(fresh);
      fresh.forEach(el => {
        const mine = el.getAnimations ? el.getAnimations().filter(a => !(window.CSSTransition && a instanceof CSSTransition) &&
                                                                       !(window.CSSAnimation && a instanceof CSSAnimation)) : [];
        if (mine.length) going.set(cardKey(el), mine[mine.length - 1]);
      });
    }
    bring(Array.from(view.querySelectorAll(CARDS)));
    if (!window.MutationObserver) return;
    const mo = new MutationObserver(list => {
      const fresh = [];
      list.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches(CARDS)) fresh.push(n);
        n.querySelectorAll(CARDS).forEach(x => fresh.push(x));
      }));
      if (fresh.length) bring(fresh);
    });
    mo.observe(view, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), watchMs || 1500);
  }
  /* The pane under a row of tabs, changing: it comes in from the side of
     the tab that was picked, a short way, so the tabs read as one strip of
     panes lying side by side. 24px, not the width of the screen. */
  function slideAcross(els, dir){
    if (off()) return;
    const x = (dir || 1) * 24;
    Array.from(els || []).forEach(el => play(el,
      [{ opacity: 0, transform: "translateX(" + x + "px)" }, { opacity: 1, transform: "none" }],
      { duration: 240, easing: EASE_OUT }));
  }
  /* Opening something from its tile: the new screen grows out of the tile
     that was pressed, so it reads as going into that class rather than as
     the page being swapped. */
  function zoomFrom(tile, view){
    if (!can(view) || !tile || !tile.isConnected) return arrive(view, 4);
    const t = tile.getBoundingClientRect(), v = view.getBoundingClientRect();
    if (!t.width || !v.width) return arrive(view, 4);
    /* The screen itself does not travel. Moving it from the tile's place
       (with a scale) swept the whole page sideways for a tile at the edge
       of the grid, which threw people off. Instead the screen is already
       where it will be, and a window the shape of the tile opens out to the
       edges of it, so the eye stays on the tile and the class grows from
       it. Only a 2% settle around the tile's centre, nothing sideways. */
    const px = (n) => Math.max(0, n) + "px";
    const top = t.top - v.top, left = t.left - v.left;
    const right = v.right - t.right, bottom = v.bottom - t.bottom;
    const r = tile.radius || "12px";
    const ox = (left + t.width / 2) + "px", oy = (top + t.height / 2) + "px";
    return play(view, [
      { clipPath: "inset(" + px(top) + " " + px(right) + " " + px(bottom) + " " + px(left) + " round " + r + ")",
        transform: "scale(.98)", transformOrigin: ox + " " + oy, opacity: .4 },
      { opacity: 1, offset: .35 },
      { clipPath: "inset(0px 0px 0px 0px round 0px)", transform: "none", transformOrigin: ox + " " + oy, opacity: 1 }
    ], { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" });
  }
  /* Every tab strip on the site (.subtabs) has its highlight glide from the
     old tab to the new one. The page's own handler decides which tab is on,
     often after moving the strip or redrawing it, so the tab that was on is
     noted as the press starts and compared once the handler has run. */
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest(".subtabs > button");
    if (!btn || off()) return;
    const strip = btn.parentElement;
    const was = strip.querySelector(":scope > button.on");
    if (!was || was === btn) return;
    const from = was.getBoundingClientRect();
    /* A timer, not a promise: a promise queued here runs as soon as this
       listener returns, which is before the tab's own handler. */
    setTimeout(() => {
      if (!btn.classList.contains("on") || !btn.isConnected) return;
      const holder = btn.parentElement;
      /* The old tab's place as it was, in case the strip was redrawn and
         the old button is gone. */
      const ghost = { getBoundingClientRect: () => from };
      glide(was.isConnected && was.parentElement === holder ? was : ghost, btn, holder);
    }, 0);
  }, true);
  /* The tile pressed last, and when, so show() can tell a screen opened
     from a tile from one reached any other way. */
  let lastTile = null, lastTileAt = 0;
  document.addEventListener("click", (e) => {
    const t = e.target && e.target.closest && e.target.closest(".classtile");
    if (t){ lastTile = t; lastTileAt = Date.now(); }
  }, true);
  function pressedTile(){
    const t = Date.now() - lastTileAt < 800 && lastTile && lastTile.isConnected ? lastTile : null;
    lastTile = null; lastTileAt = 0;          // one press opens one screen
    return t;
  }
  window.hubMotion = { off, busy, tick, nudge, pop, arrive, reveal, breathe, stagger, glide, settle, slideAcross, zoomFrom, pressedTile, leave: fadeOut };
})();
