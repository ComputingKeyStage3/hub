/* Shared display settings (background + font). Include on any page:
     <script src="settings.js"></script>  then  initSettings(buttonElement)
   Choices persist per device in localStorage under hub_prefs. */
(function(){
  const BGS = [
    ["","School white","#EDEDED"], ["night","School dark","#1D1D1B"],
    ["warm","Warm beige","#F3ECDD"], ["blue","Soft blue","#E2EDF7"],
    ["green","Soft green","#DDEDD5"], ["peach","Peach","#FAEADC"],
    ["yellow","Soft yellow","#F9F0CB"], ["dark","Dark grey","#23262E"]
  ];
  const FONTS = [
    ["","Barlow \u2014 the standard font","'Barlow'"],
    ["lexend","Lexend \u2014 easier for some readers","'Lexend'"],
    ["nunito","Nunito \u2014 soft and rounded","'Nunito'"],
    ["atkinson","Atkinson Hyperlegible \u2014 extra-clear letters","'Atkinson Hyperlegible'"]
  ];
  function prefs(){ try{ return JSON.parse(localStorage.getItem("hub_prefs") || "{}"); }catch(e){ return {}; } }
  function apply(p){
    if (p.bg) document.documentElement.dataset.bg = p.bg; else delete document.documentElement.dataset.bg;
    if (p.font) document.documentElement.dataset.font = p.font; else delete document.documentElement.dataset.font;
    /* editors on the page follow along */
    try{ window.dispatchEvent(new Event("hubprefs")); }catch(e){}
  }
  function build(){
    const back = document.createElement("div");
    back.className = "modal-back no-print"; back.id = "setModal"; back.hidden = true;
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<h2 style="margin-top:0">Settings</h2>' +
      '<div class="set-group"><span class="set-label">Background colour</span><div class="swatches" id="setSw">' +
      BGS.map(b => '<button class="swatch" data-bg="' + b[0] + '" style="background:' + b[2] + '" title="' + b[1] + '"></button>').join("") +
      '</div></div>' +
      '<div class="set-group"><span class="set-label">Font</span><div class="font-opts" id="setFo">' +
      FONTS.map(f => '<button class="font-opt" data-font="' + f[0] + '" style="font-family:' + f[2] + '">' + f[1] + '</button>').join("") +
      '</div></div>' +
      '<div class="set-group" id="pwGroup" hidden><span class="set-label">Your password</span>' +
      '<div class="field"><label>New password (12\u201325 characters)</label><input type="password" id="pwNew" autocomplete="new-password"></div>' +
      '<div class="field"><label>Type it again</label><input type="password" id="pwNew2" autocomplete="new-password"></div>' +
      '<button class="btn-ghost" id="pwGo">Change password</button>' +
      '<p class="hint" id="pwMsg" style="margin-top:10px"></p>' +
      '<p class="subnote">Tip: three random words joined together is long, strong and easy to remember.</p></div>' +
      '<button class="btn-primary modal-cta" id="setDone">Done</button></div>';
    document.body.appendChild(back);
    function paint(){
      const p = prefs();
      back.querySelectorAll(".swatch").forEach(b => b.classList.toggle("on", (p.bg || "") === b.dataset.bg));
      back.querySelectorAll(".font-opt").forEach(b => b.classList.toggle("on", (p.font || "") === b.dataset.font));
    }
    back.querySelectorAll(".swatch").forEach(b => b.addEventListener("click", () => {
      const p = prefs(); p.bg = b.dataset.bg; localStorage.setItem("hub_prefs", JSON.stringify(p)); apply(p); paint();
    }));
    back.querySelectorAll(".font-opt").forEach(b => b.addEventListener("click", () => {
      const p = prefs(); p.font = b.dataset.font; localStorage.setItem("hub_prefs", JSON.stringify(p)); apply(p); paint();
    }));
    const API = (window.HUB && window.HUB.API) || "";
    const grp = back.querySelector("#pwGroup");
    // only students have a password to change here
    const isStudent = !!localStorage.getItem("hub_token");
    const onConsole = /admin\.html|author\.html|work\.html/.test(location.pathname);
    const isTeacher = !!localStorage.getItem("hub_tkey");
    if (isStudent && API && !onConsole && !isTeacher) grp.hidden = false;
    if (window.settingsExtra){
      const extra = document.createElement("button");
      extra.className = "btn-ghost";
      extra.style.width = "100%";
      extra.style.marginTop = "10px";
      extra.style.marginBottom = "10px";
      extra.textContent = window.settingsExtra.label;
      extra.addEventListener("click", () => { back.hidden = true; window.settingsExtra.run(); });
      const done = back.querySelector("#setDone");
      if (done && done.parentNode) done.parentNode.insertBefore(extra, done);
    }
    back.querySelector("#pwGo").addEventListener("click", async () => {
      const msg = back.querySelector("#pwMsg");
      const next = back.querySelector("#pwNew").value, again = back.querySelector("#pwNew2").value;
      if (next.length < 12 || next.length > 25){ msg.textContent = "Your password must be 12 to 25 characters."; return; }
      if (next !== again){ msg.textContent = "The two new passwords don't match."; return; }
      msg.textContent = "Saving\u2026";
      try{
        const r = await fetch(API + "/api/login", { method:"POST",
          headers:{ "Content-Type":"application/json", Authorization: "Bearer " + localStorage.getItem("hub_token") },
          body: JSON.stringify({ action:"set-password", newPassword: next }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not change it.");
        msg.textContent = "Password changed \u2713";
        back.querySelector("#pwNew").value = back.querySelector("#pwNew2").value = "";
      }catch(e){ msg.textContent = e.message; }
    });
    back.querySelector("#setDone").addEventListener("click", () => { back.hidden = true; });
    back.addEventListener("mousedown", (e) => { if (e.target === back) back.hidden = true; });
    return { back, paint };
  }
  let ui = null;
  /* A page can add its own item to the settings pop-up — the console uses
     this for changing which teacher is signed in. */
  window.settingsExtra = null;
  window.initSettings = function(btn){
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!ui) ui = build();
      ui.paint(); ui.back.hidden = false;
    });
  };
  apply(prefs());
})();
