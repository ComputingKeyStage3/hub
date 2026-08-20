/* =====================================================================
   THE ONE FILE YOU EDIT TO CHANGE HOW THE SITE RUNS
   =====================================================================

   OFFLINE
   -------
   false  Normal running. Lessons, classes, marking and saved work all go
          through the Vercel backend and the Turso database.

   true   Everything runs from GitHub Pages alone. No backend is called at
          all — not even to check. Lessons are read from the lessons
          folder, students' work is kept in their own browser, and they
          hand work in by saving a PDF.

          Use this if the IT team need to look at Vercel and Turso before
          they are allowed, or if they are not allowed at all. Change the
          one word below, commit, and the whole site switches over.

   Switching back and forth is safe: work saved in a browser stays there,
   and anything already in the database is untouched.
   ===================================================================== */
window.HUB = {
  OFFLINE: false,

  // Your Vercel address — no trailing slash. Ignored entirely when OFFLINE
  // is true, so it can be left as it is.
  API: "PASTE_YOUR_VERCEL_URL_HERE".replace(/\/+$/, ""),

  // The year groups students can pick from when the site runs without a
  // server. Add or change these freely — they are just names, and they must
  // match the "year" written on each lesson in lessons/index.json.
  YEARS: ["Year 7", "Year 8", "Year 9"]
};

/* Everything below works out what that means, so no page has to. */
if (window.HUB.OFFLINE) window.HUB.API = "";
window.hubOffline = function(){ return !!(window.HUB && window.HUB.OFFLINE); };
