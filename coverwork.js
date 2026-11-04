/* What counts as having had a real go at a task in a Cover lesson.

   A Cover lesson runs with nobody who can teach it and nobody who can open a
   page. So a student earns the next page by attempting this one, never by
   getting it right: a child stuck on a question with nobody to ask is worse
   than a wrong answer. Everything here asks "did they try?", and the two tasks
   that can be failed for ever, a short answer and a table, give the answer
   after two wrong tries so that the question always has an end.

   Only the tasks listed in need() can hold a page. Anything else (code, a
   Scratch project, a file, a video) depends on something that might not load
   on the machine in front of them, and a task that cannot load must never be
   the thing a class is stuck behind.

   Kept apart from lesson.html so Mark work can read the same facts, and so
   this can be run on its own. Nothing here touches the page. */
(function(){
  "use strict";

  const words = (t) => String(t == null ? "" : t).trim().split(/\s+/).filter(Boolean);

  /* Writing that reaches the word count without saying anything. Deliberately
     forgiving: a real answer from a twelve year old with poor spelling must
     never trip this, so it only looks for the two shapes mashing makes, the
     same few words again and again, and runs of letters with no vowels. */
  function junk(text){
    const list = words(text).map(w => w.toLowerCase());
    if (list.length < 4) return false;
    const different = new Set(list).size;
    if (different / list.length < 0.5) return true;
    const letters = String(text).toLowerCase().replace(/[^a-z]/g, "");
    if (new Set(letters).size < 4) return true;
    const real = list.filter(w => /[aeiouy]/.test(w) || /\d/.test(w)).length;
    return real / list.length < 0.6;
  }

  /* The minimum for each box of a written answer, the way rQuestion reads
     them: undefined has always meant eight, and zero means no length at all. */
  function writtenNeed(b, v){
    const asked = [b].concat(Array.isArray(b.extra) ? b.extra : []);
    const typed = Array.isArray(v) ? v : [v];
    for (let i = 0; i < asked.length; i++){
      const min = asked[i].minWords === undefined ? 8 : Math.max(0, Number(asked[i].minWords) || 0);
      const text = String(typed[i] == null ? "" : typed[i]);
      if (!text.trim()) return "Write your answer.";
      if (words(text).length < min) return "Write a bit more in your answer.";
      if (junk(text)) return "Write your answer in real words.";
    }
    return "";
  }

  function storyNeed(b, v){
    if (b.demo) return "";
    const panels = v && Array.isArray(v.panels) ? v.panels : [];
    const want = Math.max(2, Number(b.panels) || panels.length || 6);
    const drawn = (p) => !!(p && Array.isArray(p.strokes) && p.strokes.length);
    for (let i = 0; i < want; i++){
      const p = panels[i];
      if (!drawn(p)) return b.flip ? "Draw every frame." : "Draw every panel.";
      if (!b.flip && !String(p.text || "").trim()) return "Write what happens in every panel.";
    }
    return "";
  }

  /* What is still needed from one task, in words a student can act on, or ""
     if nothing is. ctx gives what only the lesson page knows:
       read(id)     what the task holds now
       tries(id)    how many different wrong answers it has had
       score(b, v)  { got, max } or null, the page's own marking
       started(b,v) whether anything has been done to it at all */
  function need(b, ctx){
    if (!b || b.required === false) return "";
    const v = ctx.read(b.id);
    switch (b.type){
      case "quiz": {
        const n = (b.questions || []).length;
        const ticked = v && Array.isArray(v.checked) ? v.checked.filter(Boolean).length : 0;
        return n && ticked < n ? "Answer every question in the quiz." : "";
      }
      case "short": case "table": {
        const sc = ctx.score(b, v);
        /* A table of open boxes has nothing to get right. */
        if (!sc || !sc.max) return ctx.started(b, v) ? "" : "Fill in the table.";
        /* Right only counts once Check has been pressed. Otherwise I am
           confused going away the moment the right word was typed would
           tell them it was right before they asked. */
        const checked = !ctx.checked || ctx.checked(b.id);
        if ((sc.got >= sc.max && checked) || ctx.tries(b.id) >= 2) return "";
        return b.type === "table" ? "Fill in the table and press Check."
                                  : "Answer the question and press Check answer.";
      }
      case "blanks": {
        const gaps = (String(b.text || "").match(/\[\[/g) || []).length;
        const filled = Array.isArray(v) ? v.filter(x => x !== null && x !== undefined && x !== "").length : 0;
        return filled < gaps ? "Fill in every gap." : "";
      }
      case "order":   return ctx.started(b, v) ? "" : "Put the list in order.";
      case "mc":      return ctx.started(b, v) ? "" : "Choose an answer.";
      case "hotspot": return ctx.started(b, v) ? "" : "Click on the picture.";
      case "label":   return ctx.started(b, v) ? "" : "Label the picture.";
      case "question": return writtenNeed(b, v);
      case "storyboard": return storyNeed(b, v);
      case "mindmap":
        return v && Array.isArray(v.nodes) && v.nodes.length >= 3 ? "" : "Add at least two branches to the mind map.";
      case "board":
        return v && Array.isArray(v.strokes) && v.strokes.length ? "" : "Draw on the whiteboard.";
      case "notes":
        return String(v == null ? "" : v).replace(/<[^>]*>/g, "").trim() ? "" : "Write your notes.";
      case "choice": {
        if (typeof v !== "number" || v < 0) return "Choose your challenge.";
        const picked = (b.options || [])[v];
        return listNeed(picked ? picked.blocks : [], ctx);
      }
      case "group": return listNeed(b.blocks, ctx);
      default: return "";
    }
  }
  /* Whether a task is something to do rather than something to read. Reading
     has nothing to finish, so only Understood ends it. */
  const WORK = ["quiz","short","table","blanks","order","mc","hotspot","label","question",
                "storyboard","mindmap","board","notes","choice","group"];
  const isWork = (b) => !!b && WORK.indexOf(b.type) >= 0 && !b.demo;
  function listNeed(blocks, ctx){
    for (const b of blocks || []){
      const n = need(b, ctx);
      if (n) return n;
    }
    return "";
  }
  /* Every task on a page still wanting something, top level only: a task
     inside a choice or a group is scrolled to through the thing around it.
     Extension tasks are never in the way. Each task but the last also wants
     its Understood pressed, ctx.ok saying which have been: the last has
     nothing under it to open, so it has no such button. */
  function left(page, ctx){
    const kids = (page && page.type === "page" ? (page.blocks || []) : (page ? [page] : []))
      .filter(b => b.type !== "extension");
    const out = [];
    kids.forEach((b, i) => {
      const words = need(b, ctx) ||
        (ctx.ok && i < kids.length - 1 && !ctx.ok(b.id) ? "Press Understood when you are ready." : "");
      if (words) out.push({ id: b.id, words: words });
    });
    return out;
  }

  /* The quizzes that count, in lesson order, leaving out the extension ones:
     a first-try score is only worth reading on work everybody did. */
  function quizzes(lesson){
    const out = [];
    const walk = (list) => (list || []).forEach(b => {
      if (b.type === "extension") return;
      if (b.type === "quiz") out.push(b);
      walk(b.blocks);
    });
    walk(lesson && lesson.blocks);
    return out;
  }
  const minutes = (ms) => Math.round((Number(ms) || 0) / 60000);

  /* What was saved, in the shape the card and Mark work both show. */
  function facts(lesson, cover){
    const c = cover && typeof cover === "object" ? cover : {};
    const first = c.first || {};
    const list = quizzes(lesson);
    const scores = list.filter(b => Array.isArray(first[b.id]))
      .map(b => ({ title: b.title || "Quiz", got: first[b.id][0], max: first[b.id][1] }));
    const rushed = (Array.isArray(c.rushed) ? c.rushed : [])
      .map(id => { const b = list.find(x => x.id === id); return b ? (b.title || "Quiz") : ""; })
      .filter(Boolean);
    return { pages: Number(c.pages) || 0,
             total: ((lesson && lesson.blocks) || []).length,
             mins: minutes(c.ms), scores, last: scores[scores.length - 1] || null, rushed,
             confused: Object.keys(c.confused || {}).length };
  }

  window.coverWork = { need, left, junk, quizzes, facts, isWork };
})();
