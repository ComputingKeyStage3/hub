/* ---------------------------------------------------------------------
   What a cover lesson is about.

   The builder offers these when a cover lesson is filed, and the console's
   cover shelves group other units' and other years' cover lessons by them.
   Both ask here, so the starting topics are written down once.

   A topic a teacher adds is not stored anywhere of its own: it exists
   because some cover lesson carries it, and renaming one in Manage topics
   rewrites the lessons that use it. Deleting one moves its lessons to
   Other. A starting topic would come straight back from this list, so one
   that is deleted is remembered in the catalogue's removedTopics.
   --------------------------------------------------------------------- */
(function(){
  "use strict";

  const DEFAULTS = ["Programming (Scratch)", "Programming (Python)", "Graphics & Animation",
    "Hardware & Software", "Binary", "Web Design", "Spreadsheets", "AI", "Careers", "Video Editing"];
  /* Where a deleted topic's lessons go. Always last, and never renamed or
     deleted itself, or there would be nowhere for them to go. */
  const OTHER = "Other";

  const clean = (t) => String(t || "").trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

  /* The starting topics not deleted, then every other topic a cover lesson
     uses, A to Z, then Other. Spelt the way it is first met, so "graphics &
     animation" typed by hand is the topic already there and not a second.
     A deleted starting topic still shows while a lesson carries it. */
  function all(lessons, extra, removed){
    const gone = (removed || []).map(clean);
    const list = DEFAULTS.filter(t => !gone.some(g => same(g, t)));
    const added = [];
    const take = (t) => {
      t = clean(t);
      if (t && !same(t, OTHER) && !list.concat(added).some(x => same(x, t))) added.push(t);
    };
    (lessons || []).forEach(l => { if (l && l.cover) take(l.cover_topic); });
    (extra || []).forEach(take);
    return list.concat(added.sort((a, b) => a.localeCompare(b)), [OTHER]);
  }

  /* The topic as the list spells it, or what was typed if it is new. */
  function spelt(t, lessons){
    return all(lessons).find(x => same(x, t)) || clean(t);
  }

  window.coverTopics = { DEFAULTS, OTHER, all, same, spelt };
})();
