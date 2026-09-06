/* ============================================================
   Signing in as a teacher, from anywhere that is not the console.

   The console swaps the teacher key for a session token, and once a second
   factor is switched on it stops keeping the key in the browser at all. The
   builder and the work viewer open in their own tabs and used to carry a key
   of their own in localStorage, which meant two things went wrong at once:
   with 2FA on they had no key and asked for one on every save, and whatever
   was typed was written down unchecked. A wrong key was remembered for good,
   the pop-up never came back, and every save failed from then on with no way
   to put it right.

   So: the token first, the key only where there is no second factor, and
   nothing is remembered until the server has said it is right.
   ============================================================ */
(function(){

const api = () => (window.HUB && window.HUB.API) || "";

function token(){ try{ return sessionStorage.getItem("hub_ttoken") || ""; }catch(e){ return ""; } }
function key(){ try{ return localStorage.getItem("hub_tkey") || ""; }catch(e){ return ""; } }

/* What to send. A session first, because it is the only thing that works once
   a second factor is on. */
function headers(){
  const t = token();
  if (t) return { "Authorization": "Bearer " + t };
  const k = key();
  return k ? { "x-teacher-key": k } : {};
}
function json(){ return Object.assign({ "Content-Type": "application/json" }, headers()); }
function have(){ return !!(token() || key()); }
function forget(){
  try{ sessionStorage.removeItem("hub_ttoken"); }catch(e){}
  try{ localStorage.removeItem("hub_tkey"); }catch(e){}
}

/* A 401 or 403 means whatever was being sent is no longer any good: expired,
   signed out from another machine, or simply wrong. Throw it away so the next
   attempt asks rather than failing the same way for ever. */
function rejected(status){ return status === 401 || status === 403; }

async function signIn(k, code){
  if (!api()) throw new Error("This copy of the site has no server address in config.js.");
  let device = "";
  try{ device = localStorage.getItem("hub_tdevice") || ""; }catch(e){}
  const r = await fetch(api() + "/api/teacher/sign-in", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: k, code: code || "", device: device })
  });
  let d = {};
  try{ d = await r.json(); }catch(e){}
  if (!r.ok){
    /* A note of the last code that is out of date is worse than none: it makes
       every sign-in ask for a code and never replaces it. */
    if (d.needCode){ try{ localStorage.removeItem("hub_tdevice"); }catch(e){} }
    const err = new Error(d.error || "That was not accepted.");
    err.needCode = !!d.needCode;
    throw err;
  }
  try{
    sessionStorage.setItem("hub_ttoken", d.token || "");
    if (d.device) localStorage.setItem("hub_tdevice", d.device);
    /* Keeping the key beside the device note would put both halves of a
       two-factor sign-in on the same machine, which is one factor again. */
    if (d.twoFactor) localStorage.removeItem("hub_tkey");
    else localStorage.setItem("hub_tkey", k);
  }catch(e){}
  return d;
}

/* Fills a page's own pop-up box with the sign-in. The box, the ✕ and the
   scrolling all belong to the page; only what goes inside is here.
     opts.close   shut the pop-up
     opts.then    what to do once it is accepted
     opts.why     a line saying what was being attempted, if it helps
   The pop-up stays open until the server accepts something, so a typo is a
   typo rather than the end of the afternoon. */
function form(box, opts){
  opts = opts || {};
  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  box.appendChild(mk("h2","","Teacher sign-in"));
  box.appendChild(mk("p","modal-text", opts.why ||
    "Type the teacher key. If a code is wanted as well, a box for it appears."));

  const kw = mk("div","bfield");
  kw.appendChild(mk("label","","Teacher key"));
  const kIn = document.createElement("input");
  kIn.type = "password"; kIn.autocomplete = "off";
  try{ kIn.value = key(); }catch(e){}
  kw.appendChild(kIn); box.appendChild(kw);

  const cw = mk("div","bfield"); cw.hidden = true;
  cw.appendChild(mk("label","","Code from your authenticator app"));
  const cIn = document.createElement("input");
  cIn.type = "text"; cIn.autocomplete = "one-time-code"; cIn.inputMode = "numeric";
  cIn.maxLength = 6; cIn.placeholder = "123456";
  cw.appendChild(cIn); box.appendChild(cw);

  const msg = mk("p","hint","");
  box.appendChild(msg);

  const go = mk("button","btn-primary modal-cta","Sign in");
  async function attempt(){
    const k = kIn.value.trim();
    if (!k){ msg.textContent = "Type the teacher key first."; kIn.focus(); return; }
    go.disabled = true;
    msg.textContent = "Checking…";
    try{
      await signIn(k, cIn.value.trim());
      msg.textContent = "";
      if (opts.close) opts.close();
      if (opts.then) opts.then();
    }catch(e){
      if (e.needCode){ cw.hidden = false; cIn.focus(); }
      msg.textContent = e.message === "Failed to fetch" ? "Could not reach the server." : e.message;
      cIn.value = "";
      go.disabled = false;
    }
  }
  go.addEventListener("click", attempt);
  kIn.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  cIn.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  box.appendChild(go);

  const no = mk("button","btn-ghost modal-stay","Cancel");
  no.addEventListener("click", () => { if (opts.close) opts.close(); });
  box.appendChild(no);
  setTimeout(() => { try{ kIn.focus(); }catch(e){} }, 30);
}

window.teacherAuth = { headers, json, have, forget, signIn, form, rejected };

})();
