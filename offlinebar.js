/* ---------------------------------------------------------------------
   A quiet band at the top of every page when the site is running without
   a server, so nobody wonders why classes and marking are missing.
   --------------------------------------------------------------------- */
(function(){
  "use strict";
  if (!(window.HUB && window.HUB.OFFLINE)) return;

  function put(){
    if (document.getElementById("offBar")) return;
    const bar = document.createElement("div");
    bar.id = "offBar";
    bar.className = "offbar no-print";
    const teacher = /admin\.html|author\.html|work\.html/.test(location.pathname);
    /* Students do not need telling how the site is hosted — the page already
       says their work stays in the browser. */
    if (!teacher) return;
    const b = document.createElement("b");
    b.textContent = "Running without a server.";
    bar.appendChild(b);
    const rest = document.createElement("span");
    rest.textContent = teacher
      ? " The lessons folder is the hub. Classes, marking and saved work are unavailable, and lessons are saved by downloading them into the folder."
      : " Your work is kept in this browser. Save a PDF to hand it in.";
    bar.appendChild(rest);
    if (document.body.firstChild) document.body.insertBefore(bar, document.body.firstChild);
    else document.body.appendChild(bar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", put);
  else put();
})();
