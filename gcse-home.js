/* The home page for a GCSE or A Level student.

   KS3 keeps the home page it has always had. A student whose lessons belong
   to a GCSE or A Level year group gets this instead: a rail of five sections
   down the side (along the bottom on a phone), the way the console is laid
   out, rather than a row of tabs.

     Home       what to do now: carry on, due soon, newest feedback
     Lessons    the usual list, homework in it, with Active / Due / Past
     Topics     every lesson filed under its strand and point, with the
                student's own red / amber / green beside each point
     Revise     weak spots, then the Practice activities
     Feedback   the Assessments tab as it was

   Nothing here asks the server for anything new. It is drawn from what
   index.html already fetched (the catalogue, the finished list, the results
   and feedback), and it calls that page's own functions by name, so the
   lesson list and the results are drawn by exactly the code KS3 uses.

   How a student is known to be GCSE: a class has no year group of its own.
   Each lesson it has been given is filed in a unit, each unit belongs to a
   year group, and a year group carries a level. Whatever most of their
   lessons say is what they are. */
(function(){
  const SECTIONS = [
    { id: "today",    label: "Home",     icon: "home" },
    { id: "lessons",  label: "Lessons",  icon: "lessons" },
    { id: "topics",   label: "Topics",   icon: "coverage" },
    { id: "revise",   label: "Revise",   icon: "practice" },
    { id: "feedback", label: "Feedback", icon: "star" }
  ];
  const RATINGS = [
    { id: "r", label: "Not yet",    title: "I don't get this yet" },
    { id: "a", label: "Getting there", title: "I partly get this" },
    { id: "g", label: "Got it",     title: "I'm confident with this" }
  ];

  const state = { on: false, built: false, section: "today" };
  const byId = (id) => document.getElementById(id);
  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  /* ---------- which level are they? ---------- */
  function levelOf(cat){
    if (!cat) return "KS3";
    const yearOfUnit = new Map((cat.units || []).map(u => [u.name, u.year || ""]));
    const levelOfYear = new Map((cat.years || []).map(y => [y.name, y.level || "KS3"]));
    const count = {};
    (cat.lessons || []).forEach(c => {
      const lv = levelOfYear.get(yearOfUnit.get(c.unit || "")) || "";
      if (lv) count[lv] = (count[lv] || 0) + 1;
    });
    let best = "KS3", most = 0;
    Object.keys(count).forEach(k => { if (count[k] > most){ most = count[k]; best = k; } });
    return best;
  }

  /* ---------- the student's own ratings ----------
     Kept in this browser, under their username, so a shared computer does not
     show one child's red points to the next. It is their note to themselves:
     nothing is marked by it and the teacher does not see it. */
  const rateKey = () => "hub_rag_" + (localStorage.getItem("hub_user") || "");
  function ratings(){
    try{ return JSON.parse(localStorage.getItem(rateKey()) || "{}") || {}; }catch(e){ return {}; }
  }
  function rate(point, value){
    const all = ratings();
    if (all[point] === value) delete all[point]; else all[point] = value;
    try{ localStorage.setItem(rateKey(), JSON.stringify(all)); }catch(e){}
  }

  /* ---------- what the page already has ---------- */
  function lessonsNow(){
    const cat = (catalogue || {}).lessons || [];
    return cat.filter(c => lastById[c.lesson_id] && !lockedLessons.has(c.lesson_id));
  }
  const isDone = (c) => doneLessons.has(c.lesson_id);
  const closed = (c) => c.close_on && c.close_on < todayHere();
  function dueSoon(){
    const today = todayHere();
    const week = new Date(Date.now() + 7 * 86400000);
    const limit = week.getFullYear() + "-" + String(week.getMonth() + 1).padStart(2, "0") + "-" + String(week.getDate()).padStart(2, "0");
    return lessonsNow()
      .filter(c => c.close_on && c.close_on >= today && c.close_on <= limit && !isDone(c))
      .sort((a, b) => a.close_on.localeCompare(b.close_on));
  }
  function niceDate(day){
    if (!day) return "";
    const d = new Date(day + "T12:00:00");
    const diff = Math.round((d - new Date(todayHere() + "T12:00:00")) / 86400000);
    if (diff === 0) return "Due today";
    if (diff === 1) return "Due tomorrow";
    return "Due " + d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  }
  function feedbackRows(){
    return ((myResults && myResults.feedback) || [])
      .map(r => Object.assign({ at: r.updated_at || "", lesson: r.lesson_id }, parseFeedback(r.feedback)))
      .filter(f => f.strength || f.target || f.comment)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  const seenKey = () => "hub_fbseen_" + (localStorage.getItem("hub_user") || "");
  function unseenFeedback(){
    const seen = localStorage.getItem(seenKey()) || "";
    return feedbackRows().filter(f => f.at > seen).length;
  }

  /* The units in the teacher's order, each with its points in number order
     and the lessons under each point. A strand is a unit here and a point is
     a subunit, because that is what a student's catalogue carries: the
     specification itself is only ever sent to a teacher. */
  function topicTree(){
    const units = ((catalogue && catalogue.units) || []).map(u => u.name);
    const tree = new Map();
    lessonsNow().filter(c => !c.assessment).slice().sort(bySubunit).forEach(c => {
      const unit = c.unit || "Other";
      if (!tree.has(unit)) tree.set(unit, new Map());
      const point = c.subunit || unit;
      const points = tree.get(unit);
      if (!points.has(point)) points.set(point, []);
      points.get(point).push(c);
    });
    /* A strand is named in words ("Memory and storage"), so the list of units
       on its own puts it before "Systems architecture". The number of its
       first point is the order the specification teaches it in. */
    const firstNum = (points) => {
      const nums = Array.from(points.keys()).map(pointKey).filter(k => /^\d/.test(k));
      return nums.sort(numOrder)[0] || "";
    };
    const numOrder = (x, y) => window.lessonOrder ? window.lessonOrder.compareText(x, y) : (x < y ? -1 : x > y ? 1 : 0);
    return Array.from(tree.entries()).sort((a, b) => {
      const na = firstNum(a[1]), nb = firstNum(b[1]);
      if (na && nb && na !== nb) return numOrder(na, nb);
      const ia = units.indexOf(a[0]), ib = units.indexOf(b[0]);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a[0].localeCompare(b[0]);
    });
  }
  /* A point's own number, "1.2.1", for keying ratings: the wording a teacher
     gives it can change, the number does not. */
  const pointKey = (name) => (String(name).match(/^\s*(\d+(?:\.\d+)*)/) || [, name])[1];

  /* ---------- the shell ---------- */
  function build(){
    if (state.built) return;
    state.built = true;
    const page = document.querySelector(".page");
    const nav = make("nav", "gh-rail");
    nav.id = "ghRail";
    nav.setAttribute("aria-label", "Sections");
    SECTIONS.forEach(s => {
      const b = make("button", "gh-nav");
      b.type = "button";
      b.dataset.section = s.id;
      const ico = make("span");
      ico.dataset.icon = s.icon;
      ico.dataset.size = "20";
      b.appendChild(ico);
      b.appendChild(make("span", "gh-label", s.label));
      const badge = make("span", "gh-badge");
      badge.hidden = true;
      b.appendChild(badge);
      b.addEventListener("click", () => go(s.id));
      nav.appendChild(b);
    });
    document.body.insertBefore(nav, page);

    ["today", "topics", "revise"].forEach(id => {
      const v = make("div", "gh-view");
      v.id = "gh-" + id;
      v.hidden = true;
      page.appendChild(v);
    });
    /* A third choice on the lesson list: what has a closing date coming up.
       Homework is in this list too, so this is where it is found. */
    const sub = document.querySelector("#view-lessons .subtabs");
    if (sub && !byId("tabDue")){
      const due = make("button", "", "Due");
      due.id = "tabDue";
      due.type = "button";
      sub.insertBefore(due, byId("tabDone"));
      due.addEventListener("click", () => {
        showing = "due";
        ["tabActive", "tabDue", "tabDone"].forEach(t => byId(t).classList.toggle("on", t === "tabDue"));
        loadLessons();
      });
      ["tabActive", "tabDone"].forEach(t => byId(t).addEventListener("click", () => byId("tabDue").classList.remove("on")));
    }
    window.addEventListener("hashchange", () => {
      const want = location.hash.slice(1);
      if (state.on && SECTIONS.some(s => s.id === want) && want !== state.section) go(want, true);
    });
  }

  function go(section, fromHash){
    state.section = section;
    if (!fromHash && location.hash.slice(1) !== section){
      try{ history.pushState(null, "", "#" + section); }catch(e){ location.hash = section; }
    }
    document.querySelectorAll(".gh-nav").forEach(b => {
      const on = b.dataset.section === section;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    byId("view-lessons").hidden = section !== "lessons";
    byId("view-results").hidden = section !== "feedback";
    byId("view-practice").hidden = section !== "revise";
    ["today", "topics", "revise"].forEach(id => { byId("gh-" + id).hidden = section !== id; });
    /* openTab is what the refresh button and the lesson list read */
    openTab = section === "feedback" ? "results" : "lessons";
    if (section === "lessons") loadLessons();
    if (section === "feedback"){
      loadResults().then(() => {
        const newest = feedbackRows()[0];
        if (newest) try{ localStorage.setItem(seenKey(), newest.at); }catch(e){}
        badges();
      });
    }
    if (section === "today") paintToday();
    if (section === "topics") paintTopics();
    if (section === "revise"){
      paintRevise();
      /* Practice sits under the weak spots rather than in a tab of its own */
      const box = byId("gh-revise");
      box.after(byId("view-practice"));
      paintPractice();
    }
    window.scrollTo(0, 0);
  }

  function badges(){
    const set = (id, n) => {
      const b = document.querySelector('.gh-nav[data-section="' + id + '"] .gh-badge');
      if (!b) return;
      b.hidden = !n;
      b.textContent = n > 9 ? "9+" : String(n || "");
      b.setAttribute("aria-label", n + (id === "lessons" ? " due soon" : " new"));
    };
    set("lessons", dueSoon().length);
    set("feedback", unseenFeedback());
  }

  /* ---------- Today ---------- */
  function card(title, cls){
    const c = make("section", "gh-card" + (cls ? " " + cls : ""));
    if (title) c.appendChild(make("h2", "gh-card-title", title));
    return c;
  }
  function lessonLink(c, extra){
    const a = make("a", "gh-row");
    a.href = "lesson.html?id=" + encodeURIComponent(c.lesson_id);
    const words = make("span", "gh-row-words");
    words.appendChild(make("b", "", (lastById[c.lesson_id] || {}).title || c.lesson_id));
    if (extra) words.appendChild(make("span", "", extra));
    a.appendChild(words);
    if (isDone(c)) a.appendChild(make("span", "gh-tick", "✓"));
    a.appendChild(make("span", "gh-go", "→"));
    return a;
  }
  function paintToday(){
    const box = byId("gh-today");
    box.innerHTML = "";
    const open = lessonsNow().filter(c => !c.assessment && !isDone(c) && !closed(c));
    const ordered = open.slice().sort(bySubunit);
    const next = ordered.find(c => !c.homework) || ordered[0];

    const carry = card("", "gh-carry");
    if (next){
      carry.appendChild(make("p", "gh-eyebrow", "Carry on"));
      const a = make("a", "gh-carry-link");
      a.href = "lesson.html?id=" + encodeURIComponent(next.lesson_id);
      a.appendChild(make("b", "", lastById[next.lesson_id].title));
      if (next.subunit && next.subunit !== lastById[next.lesson_id].title) a.appendChild(make("span", "", next.subunit));
      a.appendChild(make("span", "gh-carry-go", "Open lesson →"));
      carry.appendChild(a);
    } else {
      carry.appendChild(make("p", "gh-eyebrow", "All caught up"));
      carry.appendChild(make("p", "gh-quiet", "You have finished everything that is open. Have a look in Revise for something to practise."));
    }
    box.appendChild(carry);

    const grid = make("div", "gh-grid");
    const due = dueSoon();
    const dueCard = card("Due soon");
    if (due.length) due.slice(0, 4).forEach(c => dueCard.appendChild(lessonLink(c, niceDate(c.close_on))));
    else dueCard.appendChild(make("p", "gh-quiet", "Nothing due in the next week."));
    grid.appendChild(dueCard);

    const fb = feedbackRows()[0];
    const fbCard = card("Latest feedback");
    if (fb){
      fbCard.appendChild(make("p", "gh-from", lessonTitles[fb.lesson] || ""));
      if (fb.strength){ const p = make("p", "me-fb"); p.appendChild(make("b", "fb-str", "Strength ")); p.appendChild(document.createTextNode(fb.strength)); fbCard.appendChild(p); }
      if (fb.target){ const p = make("p", "me-fb"); p.appendChild(make("b", "fb-tgt", "Target ")); p.appendChild(document.createTextNode(fb.target)); fbCard.appendChild(p); }
      const more = make("button", "btn-ghost gh-more", "All feedback");
      more.type = "button";
      more.addEventListener("click", () => go("feedback"));
      fbCard.appendChild(more);
    } else fbCard.appendChild(make("p", "gh-quiet", myResults ? "No feedback yet." : "Loading…"));
    grid.appendChild(fbCard);

    if (next && next.subunit){
      const topic = card("This topic");
      topic.appendChild(make("p", "gh-topic", next.subunit));
      const r = ratings()[pointKey(next.subunit)];
      topic.appendChild(make("p", "gh-quiet", r ? "You rated it: " + RATINGS.find(x => x.id === r).label + "." : "How confident are you with it? Rate it in Topics."));
      const open = make("button", "btn-ghost gh-more", "Open in Topics");
      open.type = "button";
      open.addEventListener("click", () => { state.openPoint = next.subunit; go("topics"); });
      topic.appendChild(open);
      grid.appendChild(topic);
    }
    box.appendChild(grid);
  }

  /* ---------- Topics ---------- */
  function ratingButtons(point, after){
    const wrap = make("span", "gh-rag");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "How confident are you?");
    const mine = ratings()[pointKey(point)];
    RATINGS.forEach(r => {
      const b = make("button", "gh-rag-btn gh-rag-" + r.id + (mine === r.id ? " on" : ""));
      b.type = "button";
      b.title = r.title;
      b.setAttribute("aria-pressed", mine === r.id ? "true" : "false");
      b.appendChild(make("span", "gh-dot"));
      b.appendChild(make("span", "gh-rag-word", r.label));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        rate(pointKey(point), r.id);
        after();
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
  function paintTopics(){
    const box = byId("gh-topics");
    box.innerHTML = "";
    const tree = topicTree();
    if (!tree.length){ box.appendChild(make("p", "hint", "No lessons have been given to your class yet.")); return; }
    box.appendChild(make("p", "gh-intro", "Everything you have been taught, by topic. Rate each one so you know what to revise."));
    const mine = ratings();
    tree.forEach(([unit, points]) => {
      const strand = make("section", "gh-strand");
      const head = make("h2", "gh-strand-title", unit);
      const keys = Array.from(points.keys());
      const rated = keys.map(p => mine[pointKey(p)]).filter(Boolean);
      const dots = make("span", "gh-strand-dots");
      keys.forEach(p => dots.appendChild(make("span", "gh-dot gh-dot-" + (mine[pointKey(p)] || "none"))));
      dots.setAttribute("aria-label", rated.length + " of " + keys.length + " rated");
      head.appendChild(dots);
      strand.appendChild(head);
      points.forEach((lessons, point) => {
        const row = make("div", "gh-point");
        const top = make("button", "gh-point-head");
        top.type = "button";
        const done = lessons.filter(isDone).length;
        top.appendChild(make("span", "gh-dot gh-dot-" + (mine[pointKey(point)] || "none")));
        top.appendChild(make("b", "", point));
        top.appendChild(make("span", "gh-count", done + " of " + lessons.length + " done"));
        const body = make("div", "gh-point-body");
        const openNow = state.openPoint === point;
        body.hidden = !openNow;
        top.classList.toggle("open", openNow);
        top.setAttribute("aria-expanded", openNow ? "true" : "false");
        top.addEventListener("click", () => {
          body.hidden = !body.hidden;
          top.classList.toggle("open", !body.hidden);
          top.setAttribute("aria-expanded", body.hidden ? "false" : "true");
          state.openPoint = body.hidden ? "" : point;
        });
        body.appendChild(make("p", "gh-ask", "How confident are you with this?"));
        body.appendChild(ratingButtons(point, () => { state.openPoint = point; paintTopics(); }));
        const list = make("div", "gh-list");
        inOrder(lessons).forEach(c => list.appendChild(lessonLink(c, c.homework ? "Home learning" : (closed(c) ? "Closed" : ""))));
        body.appendChild(list);
        const targets = feedbackRows().filter(f => f.target && lessons.some(c => c.lesson_id === f.lesson));
        if (targets.length){
          const t = make("div", "gh-targets");
          t.appendChild(make("p", "gh-ask", "Your targets on this topic"));
          targets.forEach(f => t.appendChild(make("p", "me-fb", f.target)));
          body.appendChild(t);
        }
        row.appendChild(top);
        row.appendChild(body);
        strand.appendChild(row);
      });
      box.appendChild(strand);
    });
    if (state.openPoint){
      const openRow = box.querySelector(".gh-point-head.open");
      if (openRow) setTimeout(() => openRow.scrollIntoView({ block: "center" }), 0);
    }
  }

  /* ---------- Revise ---------- */
  function paintRevise(){
    const box = byId("gh-revise");
    box.innerHTML = "";
    const mine = ratings();
    const res = (myResults && myResults.results) || [];
    const markOf = new Map(res.filter(r => r.out_of).map(r => [r.lesson_id, r.score / r.out_of]));
    const weak = [];
    topicTree().forEach(([unit, points]) => points.forEach((lessons, point) => {
      const r = mine[pointKey(point)];
      const low = lessons.filter(c => markOf.has(c.lesson_id) && markOf.get(c.lesson_id) < 0.5);
      if (r === "r" || r === "a" || low.length) weak.push({ unit, point, lessons, r, low: low.length });
    }));
    weak.sort((a, b) => (a.r === "r" ? 0 : a.r === "a" ? 1 : 2) - (b.r === "r" ? 0 : b.r === "a" ? 1 : 2));

    const c = card("My weak spots");
    if (weak.length){
      c.appendChild(make("p", "gh-quiet", "The topics you rated Not yet or Getting there, and any where a mark came back under half."));
      weak.forEach(w => {
        const row = make("button", "gh-weak");
        row.type = "button";
        row.appendChild(make("span", "gh-dot gh-dot-" + (w.r || "none")));
        const words = make("span", "gh-row-words");
        words.appendChild(make("b", "", w.point));
        words.appendChild(make("span", "", w.low ? "A mark under half came back on this" : w.unit));
        row.appendChild(words);
        row.appendChild(make("span", "gh-go", "→"));
        row.addEventListener("click", () => { state.openPoint = w.point; go("topics"); });
        c.appendChild(row);
      });
    } else {
      c.appendChild(make("p", "gh-quiet", "Nothing yet. Rate the topics in Topics and anything you are unsure of will be listed here."));
      const b = make("button", "btn-ghost gh-more", "Go to Topics");
      b.type = "button";
      b.addEventListener("click", () => go("topics"));
      c.appendChild(b);
    }
    box.appendChild(c);
    box.appendChild(make("h2", "gh-section-title", "Practise on your own"));
  }

  /* ---------- turning it on and off ---------- */
  function loaded(){
    if (OFFLINE || levelOf(catalogue) === "KS3"){ off(); return; }
    build();
    state.on = true;
    document.documentElement.classList.add("gcse-home");
    /* The rail starts under the top bar, whose height depends on the font
       picked in Settings. Measured again on resize, and skipped while it
       reads 0: a hidden tab measures everything as nothing. */
    const bar = document.querySelector(".homebar");
    const fit = () => { const h = bar ? bar.offsetHeight : 0; if (h) document.documentElement.style.setProperty("--gh-top", h + "px"); };
    fit();
    if (!state.fitting){ state.fitting = true; window.addEventListener("resize", fit); }
    const tabs = byId("tabs");
    if (tabs) tabs.hidden = true;
    /* the refresh button lives at the foot of the rail */
    const ref = byId("refTab"), rail = byId("ghRail");
    if (ref && rail && ref.parentNode !== rail){ ref.hidden = false; rail.appendChild(ref); }
    /* Results feed Today, Revise and the Feedback badge, so they are asked for
       straight away rather than when Feedback is first opened. */
    const want = location.hash.slice(1);
    const first = SECTIONS.some(s => s.id === want) ? want
                : (new URLSearchParams(location.search).get("tab") === "practice" ? "revise" : state.section);
    go(first, true);
    badges();
    Promise.resolve(loadResults()).then(() => {
      badges();
      if (state.section === "today") paintToday();
      if (state.section === "revise") paintRevise();
    }).catch(() => {});
  }
  function off(){
    if (!state.on) return;
    state.on = false;
    document.documentElement.classList.remove("gcse-home");
    const tabs = byId("tabs"), ref = byId("refTab");
    if (ref && tabs && ref.parentNode !== tabs) tabs.appendChild(ref);
    const practice = byId("view-practice"), results = byId("view-results");
    if (practice && results) results.after(practice);
    ["today", "topics", "revise"].forEach(id => { const v = byId("gh-" + id); if (v) v.hidden = true; });
    if (showing === "due") showing = "active";
    const due = byId("tabDue");
    if (due) due.classList.remove("on");
  }
  /* Signing out: the next student at this computer may well be KS3. */
  function reset(){
    off();
    state.section = "today";
    state.openPoint = "";
    if (location.hash) try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){}
  }

  window.gcseHome = {
    loaded, reset,
    get on(){ return state.on; },
    /* paintLessons asks this before splitting homework into a tab of its own */
    dueFilter: (c) => !!c.close_on && c.close_on >= todayHere() && !doneLessons.has(c.lesson_id)
  };
})();
