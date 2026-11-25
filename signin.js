/* Keeping a student signed in.

   Students never sign out: each has their own school Windows account, so a
   sign-in lives in their own browser. It lasts 28 days, and once it is a
   week old the home page or a lesson asks the server for a fresh one, so
   anybody on the site once a month never sees the sign-in page again.

   The date a sign-in runs out is written inside it, readable without the
   server, so a page can tell straight away that one has run out instead
   of finding out when a save is refused. That is how a Year 10 class lost
   a lesson's work: the lesson opened as normal on a sign-in that had run
   out, and every save at the end said Try again.

   Nothing is stored but the one sign-in it replaces. */
(function(){
  const WEEK = 7 * 24 * 3600 * 1000;
  let renewing = null;               // one ask per page, however many call

  /* What is inside a sign-in: { sid, name, group, exp, v, iat }. The part
     before the dot is plain base64; only the part after it is secret. */
  function payload(token){
    try{
      const part = String(token || "").split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(part)) || null;
    }catch(e){ return null; }
  }
  /* Only a sign-in that can be read and says it has run out. The lesson
     Preview's pretend student holds "preview", which is not one at all,
     and reading that as run out put the sign-in card over the preview's
     home page. Anything unreadable is left for the server to judge. */
  function expired(token){
    if (window.hubInPreview) return false;
    const p = payload(token);
    return !!(p && p.exp && Date.now() > p.exp);
  }
  /* Sign-ins from before 18.5 carry no iat, and lasted 60 days: they are
     due straight away, so the whole school moves onto the new kind on its
     next visit. */
  function due(token){
    const p = payload(token);
    return !!p && !(p.iat && Date.now() - p.iat < WEEK);
  }

  /* Answers the new sign-in when one was made, "refused" when the server
     turned this one away (it ran out, or a teacher signed them out), and
     null when nothing needed doing or the server could not be reached. A
     sign-in that cannot be renewed because the network is down is left
     exactly as it was. */
  function renew(){
    if (renewing) return renewing;
    renewing = (async () => {
      const H = window.HUB || {};
      const token = localStorage.getItem("hub_token");
      if (window.hubInPreview || H.OFFLINE || !H.API || !token || !payload(token)) return null;
      if (expired(token)) return "refused";
      if (!due(token)) return null;
      try{
        const r = await fetch(H.API + "/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ action: "renew" })
        });
        if (r.status === 401) return "refused";
        if (!r.ok) return null;
        const d = await r.json();
        if (!d || !d.renewed || !d.token) return null;
        /* Only over the sign-in it was asked for: another tab may have
           signed somebody in since. */
        if (localStorage.getItem("hub_token") !== token) return null;
        localStorage.setItem("hub_token", d.token);
        if (d.name) localStorage.setItem("hub_name", d.name);
        if (d.group) localStorage.setItem("hub_group", d.group);
        return d.token;
      }catch(e){ return null; }
    })();
    return renewing;
  }

  window.hubSignIn = { payload, expired, due, renew };
})();
