/* Shared display settings (background + font). Include on any page:
     <script src="settings.js"></script>  then  initSettings(buttonElement)
   Choices persist per device in localStorage under hub_prefs. */
(function(){
  const BGS = [
    ["","Beige","#F3ECDD"], ["blue","Soft blue","#EAF1F7"], ["green","Soft green","#ECF3EA"],
    ["peach","Peach","#FAEFE5"], ["yellow","Soft yellow","#FAF3D8"], ["dark","Dark","#23262E"]
  ];
  const FONTS = [
    ["","Lexend \u2014 the standard font","'Lexend'"],
    ["nunito","Nunito \u2014 soft and rounded","'Nunito'"],
    ["atkinson","Atkinson Hyperlegible \u2014 extra-clear letters","'Atkinson Hyperlegible'"]
  ];
  function prefs(){ try{ return JSON.parse(localStorage.getItem("hub_prefs") || "{}"); }catch(e){ return {}; } }
  function apply(p){
    if (p.bg) document.documentElement.dataset.bg = p.bg; else delete document.documentElement.dataset.bg;
    if (p.font) document.documentElement.dataset.font = p.font; else delete document.documentElement.dataset.font;
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
      '<div class="field"><label>Current password</label><input type="password" id="pwCur" autocomplete="current-password"></div>' +
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
    if (localStorage.getItem("hub_token") && API) grp.hidden = false;
    back.querySelector("#pwGo").addEventListener("click", async () => {
      const msg = back.querySelector("#pwMsg");
      const next = back.querySelector("#pwNew").value, again = back.querySelector("#pwNew2").value;
      if (next.length < 12 || next.length > 25){ msg.textContent = "Your password must be 12 to 25 characters."; return; }
      if (next !== again){ msg.textContent = "The two new passwords don't match."; return; }
      msg.textContent = "Saving\u2026";
      try{
        const r = await fetch(API + "/api/login", { method:"POST",
          headers:{ "Content-Type":"application/json", Authorization: "Bearer " + localStorage.getItem("hub_token") },
          body: JSON.stringify({ action:"set-password", currentPassword: back.querySelector("#pwCur").value, newPassword: next }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not change it.");
        msg.textContent = "Password changed \u2713";
        back.querySelector("#pwCur").value = back.querySelector("#pwNew").value = back.querySelector("#pwNew2").value = "";
      }catch(e){ msg.textContent = e.message; }
    });
    back.querySelector("#setDone").addEventListener("click", () => { back.hidden = true; });
    back.addEventListener("click", (e) => { if (e.target === back) back.hidden = true; });
    return { back, paint };
  }
  let ui = null;
  window.initSettings = function(btn){
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!ui) ui = build();
      ui.paint(); ui.back.hidden = false;
    });
  };
  apply(prefs());
})();
