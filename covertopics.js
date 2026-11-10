/* ---------------------------------------------------------------------
   The topics cover lessons are grouped by in a unit's Cover tab.

   A topic is given to units, not to lessons: every cover lesson filed in
   8.2 Digital Graphics comes under whatever topic 8.2 has. Which units are
   in which topic is set in Manage topics on the console.

   The list itself is the catalogue's coverTopics once a teacher has changed
   it, and these starting ones until then. They are sent along with the
   first change, so the list starts from what was on screen.
   --------------------------------------------------------------------- */
(function(){
  "use strict";

  const DEFAULTS = ["Programming (Scratch)", "Programming (Python)", "Graphics & Animation",
    "Hardware & Software", "Binary", "Web Design", "Spreadsheets", "AI", "Careers", "Video Editing"];
  /* Where a deleted topic's units go. Always last, never stored, and never
     renamed or deleted, or there would be nowhere for them to go. */
  const OTHER = "Other";

  const clean = (t) => String(t || "").trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

  /* The topics in order, then any a unit carries that the list has lost
     (it should not happen, but a unit in a topic nobody can see could never
     be moved out of it), then Other. */
  function all(stored, units){
    const list = (Array.isArray(stored) && stored.length ? stored : DEFAULTS)
      .map(clean).filter(t => t && !same(t, OTHER));
    (units || []).forEach(u => {
      const t = clean(u && u.topic);
      if (t && !same(t, OTHER) && !list.some(x => same(x, t))) list.push(t);
    });
    return list.concat([OTHER]);
  }

  window.coverTopics = { DEFAULTS, OTHER, all, same };
})();
