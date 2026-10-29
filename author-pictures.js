/* =====================================================================
   author-pictures.js, the builder's Pictures pop-up.

   Every picture uploaded to the database, with where each one is used,
   from the `images` action in api/teacher/[action].js. Two ways in:

     More > Pictures             look through them all and delete the ones
                                 nothing uses any more
     a picture task's "Choose    the same pop-up, where pressing a picture
     an uploaded picture"        puts it in the task

   Only a picture nothing uses can be ticked and deleted, and the server
   looks again before it deletes anything. Two places the server cannot
   see count as in use here as well: the lesson open in this builder, and
   any draft this browser is holding (a lesson not saved yet keeps its
   pictures in localStorage). A picture uploaded a minute ago into an
   unsaved lesson is exactly the one that must not be thrown away.

   Classic script, loaded after the builder's own: el, openModal,
   closeModal, pictureSrc, compile, lesson and authFailed are read by name
   when they are used.
   ===================================================================== */
(function(){
  "use strict";
  const ID = /\bim[0-9a-f]{24}\b/g;
  const API = () => (window.HUB && window.HUB.API) || "";
  const size = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB";
  const toast = (words) => { if (window.hubUI && window.hubUI.toast) window.hubUI.toast(words); };

  /* Ids written anywhere this browser knows of but the server does not:
     the lesson on screen, and every draft kept in localStorage. */
  function heldHere(){
    const ids = new Set();
    try{ (JSON.stringify(compile()).match(ID) || []).forEach(id => ids.add(id)); }catch(e){}
    try{
      for (let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        (String(localStorage.getItem(k) || "").match(ID) || []).forEach(id => ids.add(id));
      }
    }catch(e){}
    return ids;
  }

  async function fetchAll(){
    const r = await fetch(API() + "/api/teacher/images", { headers: window.teacherAuth.headers(), cache: "no-store" });
    if (authFailed(r.status, () => {})) throw new Error("Sign in again, then open Pictures.");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "The pictures could not be loaded.");
    return d.images || [];
  }

  /* opts.pick(id): pressing a picture hands its id back and closes. */
  function open(opts){
    opts = opts || {};
    let pics = null, err = "", onlyUnused = false;
    const ticked = new Set();
    openModal(box => {
      box.classList.add("piclib");
      box.appendChild(el("h2","", opts.pick ? "Choose a picture" : "Pictures"));
      const sum = el("p","modal-text piclib-sum","Loading the pictures…");
      box.appendChild(sum);
      const bar = el("div","piclib-bar");
      box.appendChild(bar);
      const grid = el("div","piclib-grid");
      box.appendChild(grid);
      const foot = el("div","piclib-foot modal-cta");
      box.appendChild(foot);

      const held = heldHere();
      const usedBy = (p) => (p.uses || []).length ? "saved" : held.has(p.id) ? "here" : "";

      function paint(){
        grid.innerHTML = ""; bar.innerHTML = ""; foot.innerHTML = "";
        if (err){ sum.textContent = err; return; }
        if (!pics) return;
        const unused = pics.filter(p => !usedBy(p));
        const total = pics.reduce((n, p) => n + (Number(p.bytes) || 0), 0);
        sum.textContent = pics.length
          ? pics.length + " picture" + (pics.length === 1 ? "" : "s") + " · " + size(total) +
            (unused.length ? " · " + unused.length + " not used" : " · every one is used")
          : "No pictures have been uploaded yet.";
        if (!pics.length) return;
        if (!opts.pick){
          ["All", "Not used"].forEach((w, i) => {
            const c = el("button","chip-filter" + ((i === 1) === onlyUnused ? " on" : ""), w);
            c.type = "button";
            c.setAttribute("aria-pressed", (i === 1) === onlyUnused ? "true" : "false");
            c.addEventListener("click", () => { onlyUnused = i === 1; paint(); });
            bar.appendChild(c);
          });
        }
        const list = onlyUnused ? unused : pics;
        if (!list.length) grid.appendChild(el("p","hint","Every picture is used somewhere."));
        list.forEach(p => grid.appendChild(card(p)));
        if (!opts.pick){
          const n = [...ticked].filter(id => pics.some(p => p.id === id && !usedBy(p))).length;
          const all = el("button","btn-ghost", unused.length && n === unused.length ? "Untick all" : "Tick all not used");
          all.type = "button";
          all.disabled = !unused.length;
          all.addEventListener("click", () => {
            if (n === unused.length) ticked.clear(); else unused.forEach(p => ticked.add(p.id));
            paint();
          });
          const del = el("button","btn-primary piclib-del", n ? "Delete " + n + " picture" + (n === 1 ? "" : "s") : "Delete");
          del.type = "button";
          del.disabled = !n;
          del.addEventListener("click", () => confirmDelete(n));
          foot.appendChild(all);
          foot.appendChild(del);
        }
      }

      function card(p){
        const how = usedBy(p);
        const c = el(opts.pick ? "button" : "div", "piclib-card" + (how ? "" : " unused") + (ticked.has(p.id) ? " on" : ""));
        if (opts.pick){ c.type = "button"; c.addEventListener("click", () => { closeModal(); opts.pick(p.id); }); }
        const frame = el("div","piclib-img");
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = p.alt || "";
        img.src = pictureSrc({ imgId: p.id });
        frame.appendChild(img);
        c.appendChild(frame);
        const meta = el("div","piclib-meta");
        meta.appendChild(el("span","piclib-size",
          (p.width && p.height ? p.width + " × " + p.height + " · " : "") + size(p.bytes)));
        const where = el("span","piclib-where");
        if (how === "saved"){
          const names = p.uses.map(u => (u.kind === "task" ? "Task: " : "") + u.title);
          where.textContent = names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : "");
          where.title = names.join("\n");
        } else if (how === "here") where.textContent = "In a lesson not saved yet";
        else { where.textContent = "Not used"; where.classList.add("none"); }
        meta.appendChild(where);
        c.appendChild(meta);
        if (!opts.pick && !how){
          const tick = document.createElement("input");
          tick.type = "checkbox";
          tick.className = "piclib-tick";
          tick.checked = ticked.has(p.id);
          tick.setAttribute("aria-label", "Delete this picture");
          tick.addEventListener("change", () => { if (tick.checked) ticked.add(p.id); else ticked.delete(p.id); paint(); });
          c.appendChild(tick);
          frame.addEventListener("click", () => { tick.checked = !tick.checked; tick.dispatchEvent(new Event("change")); });
        }
        return c;
      }

      /* Said plainly before anything goes: there is no bin to get it back
         from, and the last backup is the only copy afterwards. */
      function confirmDelete(n){
        foot.innerHTML = "";
        foot.appendChild(el("span","piclib-warn",
          n + " picture" + (n === 1 ? "" : "s") + " will be removed for good. Nothing uses " + (n === 1 ? "it" : "them") + "."));
        const no = el("button","btn-ghost","Cancel");
        no.type = "button";
        no.addEventListener("click", paint);
        const yes = el("button","btn-primary piclib-del","Delete for good");
        yes.type = "button";
        yes.addEventListener("click", async () => {
          yes.disabled = no.disabled = true;
          yes.textContent = "Deleting…";
          try{
            const ids = [...ticked].filter(id => pics.some(p => p.id === id && !usedBy(p)));
            const r = await fetch(API() + "/api/teacher/images", { method:"POST", headers: window.teacherAuth.json(),
              body: JSON.stringify({ op:"delete", ids }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "They could not be deleted.");
            const gone = new Set(d.deleted || []);
            pics = pics.filter(p => !gone.has(p.id));
            ticked.clear();
            /* used somewhere since the list was drawn: kept, and shown as used */
            (d.kept || []).forEach(k => { const p = pics.find(x => x.id === k.id); if (p) p.uses = k.uses; });
            toast(gone.size + " picture" + (gone.size === 1 ? "" : "s") + " deleted" +
                  ((d.kept || []).length ? ". " + d.kept.length + " kept, because a lesson uses them now" : ""));
            paint();
          }catch(e){ err = e.message; paint(); }
        });
        foot.appendChild(no);
        foot.appendChild(yes);
      }

      fetchAll().then(list => { pics = list; paint(); }).catch(e => { err = e.message; paint(); });
    });
  }

  window.pictureLibrary = { open };
})();
