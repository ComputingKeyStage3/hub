/* =====================================================================
   THE ONE FILE YOU EDIT TO CHANGE HOW THE SITE RUNS
   =====================================================================

   OFFLINE
   -------
   false  Normal running. Lessons, classes, marking and saved work all go
          through the Vercel backend and the Turso database.

   true   Everything runs from GitHub Pages alone. No backend is called at
          all — not even to check. Lessons are read from the lessons
          folder, students reach one by a link you hand out or by typing
          its four digit code on the front page, their work is kept in
          their own browser, and they hand it in by saving a PDF.

          Use this if the IT team need to look at Vercel and Turso before
          they are allowed, or if they are not allowed at all. Change the
          one word below, commit, and the whole site switches over.
          OFFLINE-MODE.md sets out what changes.

   Switching back and forth is safe: work saved in a browser stays there,
   and anything already in the database is untouched.
   ===================================================================== */
window.HUB = {
  OFFLINE: true,

  // Your Vercel address — no trailing slash. Ignored entirely when OFFLINE
  // is true, so it can be left as it is.
  API: "https://hub-backend-azure.vercel.app".replace(/\/+$/, "")
};

/* Everything below works out what that means, so no page has to. */
if (window.HUB.OFFLINE) window.HUB.API = "";
window.hubOffline = function(){ return !!(window.HUB && window.HUB.OFFLINE); };
