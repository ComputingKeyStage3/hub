/* The home page for a GCSE or A Level student.

   KS3 keeps the home page it has always had. A student whose lessons belong
   to a GCSE or A Level year group gets this instead: a rail of three sections
   down the side (along the bottom on a phone), the way the console is laid
   out, rather than a row of tabs.

     Home           what to do now: carry on, due soon, newest feedback,
                    and the practice activities underneath
     Learning Map   every lesson filed under its point of the specification,
                    one tab per exam component, with three marks beside each
                    point: done in lesson, revised, and how confident they are
     Feedback       the Assessments tab as it was

   There used to be separate Lessons, Topics and Revise sections. Lessons and
   Topics drew the same lessons in the same order twice, once by date and once
   by point, and Revise was a list that sent you back to Topics. The map is
   all three in one place.

   Nothing here asks the server for anything new. It is drawn from what
   index.html already fetched (the catalogue, the finished list, the results
   and feedback), and it calls that page's own functions by name, so the
   results are drawn by exactly the code KS3 uses.

   How a student is known to be GCSE: a class has no year group of its own.
   Each lesson it has been given is filed in a unit, each unit belongs to a
   year group, and a year group carries a level. Whatever most of their
   lessons say is what they are. */
(function(){
  const SECTIONS = [
    { id: "today",    label: "Home",         icon: "home" },
    { id: "map",      label: "Learning Map", icon: "coverage" },
    { id: "feedback", label: "Feedback",     icon: "star" }
  ];
  /* Old addresses, from a bookmark or the back button, land somewhere real */
  const RENAMED = { lessons: "map", topics: "map", revise: "map" };
  const RATINGS = [
    { id: "r", label: "Not yet",       title: "I don't get this yet" },
    { id: "a", label: "Getting there", title: "I partly get this" },
    { id: "g", label: "Got it",        title: "I'm confident with this" }
  ];
  /* The two written papers. The student's catalogue carries no specification,
     only the strands and points lessons are filed under, so the names are
     written here. A point's first number says which paper it is on. */
  const COMPONENTS = {
    "GCSE":    { "1": "Computer systems", "2": "Computational thinking, algorithms and programming" },
    "A Level": { "1": "Computer systems", "2": "Algorithms and programming" }
  };
  /* Revised this long ago still shows, but faded: it is worth doing again. */
  const FRESH_DAYS = 21;

  const state = { on: false, built: false, section: "today", comp: "", openPoint: "", scrollTo: false, level: "GCSE" };
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

  /* ---------- the student's own notes to themselves ----------
     Kept in this browser, under their username, so a shared computer does not
     show one child's red points to the next. Nothing is marked by them and the
     teacher does not see them. */
  const user = () => localStorage.getItem("hub_user") || "";
  const rateKey = () => "hub_rag_" + user();
  function ratings(){
    try{ return JSON.parse(localStorage.getItem(rateKey()) || "{}") || {}; }catch(e){ return {}; }
  }
  function rate(point, value){
    const all = ratings();
    if (all[point] === value) delete all[point]; else all[point] = value;
    try{ localStorage.setItem(rateKey(), JSON.stringify(all)); }catch(e){}
  }
  /* The days a point was revised. Going back into a lesson already finished
     counts, and so does pressing "I revised this", because most revision at
     this age happens on paper and in a revision guide, not on this site. Ten
     days a point is plenty to say "when did I last", and keeps it tiny. */
  const revKey = () => "hub_rev_" + user();
  function revisions(){
    try{ return JSON.parse(localStorage.getItem(revKey()) || "{}") || {}; }catch(e){ return {}; }
  }
  function logRevision(point, take){
    const all = revisions();
    const today = todayHere();
    let days = (all[point] || []).filter(d => d !== today);
    if (!take) days.push(today);
    days = days.sort().slice(-10);
    if (days.length) all[point] = days; else delete all[point];
    try{ localStorage.setItem(revKey(), JSON.stringify(all)); }catch(e){}
  }
  const lastRevised = (point) => { const d = revisions()[point]; return d && d.length ? d[d.length - 1] : ""; };
  function daysSince(day){
    if (!day) return Infinity;
    return Math.round((new Date(todayHere() + "T12:00:00") - new Date(day + "T12:00:00")) / 86400000);
  }
  function agoWords(day){
    const n = daysSince(day);
    if (n === Infinity) return "";
    if (n <= 0) return "today";
    if (n === 1) return "yesterday";
    if (n < 14) return n + " days ago";
    if (n < 60) return Math.round(n / 7) + " weeks ago";
    return "over a month ago";
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
  const seenKey = () => "hub_fbseen_" + user();
  function unseenFeedback(){
    const seen = localStorage.getItem(seenKey()) || "";
    return feedbackRows().filter(f => f.at > seen).length;
  }
  /* A mark as a fraction, for any lesson that sent one: a lesson of exam
     questions does, an ordinary lesson does not. */
  function marks(){
    const res = (myResults && myResults.results) || [];
    const m = new Map(res.filter(r => r.out_of).map(r => [r.lesson_id, r.score / r.out_of]));
    m.at = new Map(res.map(r => [r.lesson_id, String(r.updated_at || "").slice(0, 10)]));
    return m;
  }

  /* A point's own number, "1.2.1", for keying ratings: the wording a teacher
     gives it can change, the number does not. */
  const pointKey = (name) => (String(name).match(/^\s*(\d+(?:\.\d+)*)/) || [, name])[1];
  const numOrder = (x, y) => window.lessonOrder ? window.lessonOrder.compareText(x, y) : (x < y ? -1 : x > y ? 1 : 0);

  /* The units in the specification's order, each with its points in number
     order and the lessons under each point. A strand is a unit here and a
     point is a subunit, because that is what a student's catalogue carries:
     the specification itself is only ever sent to a teacher. */
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
    return Array.from(tree.entries()).map(([unit, points]) => ({ unit, points, first: firstNum(points) })).sort((a, b) => {
      if (a.first && b.first && a.first !== b.first) return numOrder(a.first, b.first);
      const ia = units.indexOf(a.unit), ib = units.indexOf(b.unit);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.unit.localeCompare(b.unit);
    });
  }
  /* Which paper a strand is on: the first number of its first point. A strand
     whose points have no numbers goes under Other, a third tab that only
     appears when there is something in it. */
  const componentOf = (strand) => /^\d/.test(strand.first) ? strand.first.split(".")[0] : "other";

  /* Everything the map says about one point, worked out once per drawing. */
  function pointFacts(unit, point, lessons, mine, revs, markOf){
    const key = pointKey(point);
    /* "In lesson" is the lessons taught in class. Home learning not handed in
       yet has its own flag and its own place under Focus on, and counting it
       here as well left a point taught in full looking half done. A point
       that only has home learning counts that, or it would never fill. */
    const taught = lessons.filter(c => !c.homework);
    const counted = taught.length ? taught : lessons;
    const done = counted.filter(isDone).length;
    const days = revs[key] || [];
    const last = days.length ? days[days.length - 1] : "";
    const marked = lessons.filter(c => markOf.has(c.lesson_id));
    /* A low mark stops being a thing to focus on once the point has been
       revised since it came back, or it would sit at the top for good. */
    const low = marked.filter(c => markOf.get(c.lesson_id) < 0.5 && !(last && last >= (markOf.at.get(c.lesson_id) || "")));
    const homework = lessons.filter(c => c.homework && !isDone(c) && !closed(c));
    return { unit, point, key, lessons, done, total: counted.length, rated: mine[key] || "",
             last, fresh: daysSince(last) <= FRESH_DAYS, marked, low, homework };
  }
  function allPoints(){
    const mine = ratings(), revs = revisions(), markOf = marks();
    return topicTree().map(s => Object.assign(s, {
      comp: componentOf(s),
      facts: Array.from(s.points.entries()).map(([point, lessons]) => pointFacts(s.unit, point, lessons, mine, revs, markOf))
    }));
  }

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

    ["today", "map"].forEach(id => {
      const v = make("div", "gh-view");
      v.id = "gh-" + id;
      v.hidden = true;
      page.appendChild(v);
    });
    window.addEventListener("hashchange", () => {
      const want = RENAMED[location.hash.slice(1)] || location.hash.slice(1);
      if (state.on && SECTIONS.some(s => s.id === want) && want !== state.section) go(want, true);
    });
  }

  /* Coming back from a lesson lands on index.html with no hash, so where the
     student was is kept for the visit: a child who opened a lesson from the
     map wants the map back, with the same point open, not Home. */
  const placeKey = "gh_place";
  function remember(){
    try{ sessionStorage.setItem(placeKey, JSON.stringify({ section: state.section, comp: state.comp, point: state.openPoint })); }catch(e){}
  }
  function recall(){
    try{ return JSON.parse(sessionStorage.getItem(placeKey) || "null"); }catch(e){ return null; }
  }

  function go(section, fromHash){
    section = RENAMED[section] || section;
    state.section = section;
    if (!fromHash && location.hash.slice(1) !== section){
      try{ history.pushState(null, "", "#" + section); }catch(e){ location.hash = section; }
    }
    document.querySelectorAll(".gh-nav").forEach(b => {
      const on = b.dataset.section === section;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    /* The lesson list is the map now: everything in it is under a point */
    byId("view-lessons").hidden = true;
    byId("view-results").hidden = section !== "feedback";
    byId("view-practice").hidden = section !== "today";
    ["today", "map"].forEach(id => { byId("gh-" + id).hidden = section !== id; });
    /* openTab is what the refresh button reads */
    openTab = section === "feedback" ? "results" : "lessons";
    if (section === "feedback"){
      loadResults().then(() => {
        const newest = feedbackRows()[0];
        if (newest) try{ localStorage.setItem(seenKey(), newest.at); }catch(e){}
        badges();
      });
    }
    if (section === "today"){
      paintToday();
      /* Practice sits under Home rather than in a section of its own */
      byId("gh-today").after(byId("view-practice"));
      paintPractice();
    }
    if (section === "map") paintMap();
    remember();
    if (!state.scrollTo) window.scrollTo(0, 0);
  }

  function badges(){
    const set = (id, n, words) => {
      const b = document.querySelector('.gh-nav[data-section="' + id + '"] .gh-badge');
      if (!b) return;
      b.hidden = !n;
      b.textContent = n > 9 ? "9+" : String(n || "");
      b.setAttribute("aria-label", n + " " + words);
    };
    set("today", dueSoon().length, "due soon");
    set("feedback", unseenFeedback(), "new");
  }

  /* Opens the map on one point: its tab chosen, its tile scrolled to, and
     the topic itself opened over it. */
  function showPoint(point){
    const s = allPoints().find(x => x.facts.some(f => f.point === point));
    if (s) state.comp = s.comp;
    state.openPoint = point;
    state.scrollTo = true;
    go("map");
    openTopic(point);
  }

  /* ---------- Home ---------- */
  function card(title, cls){
    const c = make("section", "gh-card" + (cls ? " " + cls : ""));
    if (title) c.appendChild(make("h2", "gh-card-title", title));
    return c;
  }
  /* One lesson as a row. Opening one already finished is going back over it,
     so it counts as revising its point. */
  function lessonLink(c, extra, markOf){
    const a = make("a", "gh-row");
    a.href = "lesson.html?id=" + encodeURIComponent(c.lesson_id);
    const words = make("span", "gh-row-words");
    words.appendChild(make("b", "", (lastById[c.lesson_id] || {}).title || c.lesson_id));
    if (extra) words.appendChild(make("span", "", extra));
    a.appendChild(words);
    if (markOf && markOf.has(c.lesson_id)){
      const part = markOf.get(c.lesson_id);
      a.appendChild(make("span", "gh-mark" + (part < 0.5 ? " low" : ""), Math.round(part * 100) + "%"));
    }
    if (isDone(c)){
      a.appendChild(make("span", "gh-tick", "✓"));
      a.addEventListener("click", () => { if (c.subunit) logRevision(pointKey(c.subunit)); });
    }
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
      carry.appendChild(make("p", "gh-quiet", "You have finished everything that is open. Have a look at your Learning Map for something to revise."));
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
      topic.appendChild(make("p", "gh-quiet", r ? "You rated it: " + RATINGS.find(x => x.id === r).label + "." : "How confident are you with it? Rate it on your Learning Map."));
      const open = make("button", "btn-ghost gh-more", "Open on the map");
      open.type = "button";
      open.addEventListener("click", () => showPoint(next.subunit));
      topic.appendChild(open);
      grid.appendChild(topic);
    }
    box.appendChild(grid);
    box.appendChild(make("h2", "gh-section-title", "Practise on your own"));
  }

  /* ---------- the Learning Map ---------- */
  function ratingButtons(key, after){
    const wrap = make("span", "gh-rag");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "How confident are you?");
    const mine = ratings()[key];
    RATINGS.forEach(r => {
      const b = make("button", "gh-rag-btn gh-rag-" + r.id + (mine === r.id ? " on" : ""));
      b.type = "button";
      b.title = r.title;
      b.setAttribute("aria-pressed", mine === r.id ? "true" : "false");
      b.appendChild(make("span", "gh-dot"));
      b.appendChild(make("span", "gh-rag-word", r.label));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        rate(key, r.id);
        after();
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* The few things worth doing next, at most three, so the top of the map
     is a nudge and not another list. Home learning first, because a teacher
     is waiting for it; then anything the student said they do not get, a
     mark that came back under half, a "getting there" not revised lately,
     and last a point finished in lesson that has never been rated. */
  function focusList(strands){
    const out = [];
    const facts = [].concat(...strands.map(s => s.facts));
    lessonsNow().filter(c => c.homework && !c.assessment && !isDone(c) && !closed(c))
      .sort((a, b) => String(a.close_on || "9").localeCompare(String(b.close_on || "9")))
      .forEach(c => out.push({ kind: "Home learning", title: lastById[c.lesson_id].title,
                               words: c.close_on ? niceDate(c.close_on) : (c.subunit || "Set by your teacher"),
                               lesson: c, tone: "hw" }));
    const seen = new Set();
    const add = (f, kind, words, tone) => {
      if (seen.has(f.point)) return;
      seen.add(f.point);
      out.push({ kind, title: f.point, words, point: f.point, tone });
    };
    facts.filter(f => f.rated === "r").forEach(f => add(f, "You said: Not yet", f.last ? "Last revised " + agoWords(f.last) : "Not revised yet", "r"));
    facts.filter(f => f.low.length).forEach(f => add(f, "Mark under half", "Go over it, then try again", "r"));
    facts.filter(f => f.rated === "a" && !f.fresh).forEach(f => add(f, "Getting there", f.last ? "Last revised " + agoWords(f.last) : "Not revised yet", "a"));
    facts.filter(f => f.done && f.done === f.total && !f.rated).forEach(f => add(f, "Finished in lesson", "How confident are you? Rate it", "none"));
    return out;
  }
  function paintFocus(box, strands){
    const list = focusList(strands);
    const wrap = make("section", "gh-focus");
    wrap.appendChild(make("h2", "gh-focus-title", "Focus on"));
    if (!list.length){
      wrap.appendChild(make("p", "gh-quiet", "Nothing needs your attention. Pick any topic below to revise."));
      box.appendChild(wrap);
      return;
    }
    const row = make("div", "gh-focus-row");
    list.slice(0, state.focusAll ? list.length : 3).forEach(item => {
      const el = item.lesson ? make("a", "gh-focus-card gh-tone-" + item.tone) : make("button", "gh-focus-card gh-tone-" + item.tone);
      if (item.lesson) el.href = "lesson.html?id=" + encodeURIComponent(item.lesson.lesson_id);
      else { el.type = "button"; el.addEventListener("click", () => showPoint(item.point)); }
      el.appendChild(make("span", "gh-focus-kind", item.kind));
      el.appendChild(make("b", "", item.title));
      el.appendChild(make("span", "gh-focus-words", item.words));
      row.appendChild(el);
    });
    wrap.appendChild(row);
    /* The rest are a press away rather than on show, so the top of the map
       stays three things long however much has piled up. */
    if (list.length > 3){
      const more = make("button", "btn-ghost gh-focus-more", state.focusAll ? "Show fewer" : "Show " + (list.length - 3) + " more");
      more.type = "button";
      more.addEventListener("click", () => { state.focusAll = !state.focusAll; paintMap(); });
      wrap.appendChild(more);
    }
    box.appendChild(wrap);
  }

  function paintMap(){
    const box = byId("gh-map");
    const keepY = state.scrollTo ? null : window.scrollY;
    box.innerHTML = "";
    const strands = allPoints();
    if (!strands.length){ box.appendChild(make("p", "hint", "No lessons have been given to your class yet.")); return; }
    paintFocus(box, strands);

    /* The tabs: the two papers, and Other only if something has no number */
    const names = COMPONENTS[state.level] || COMPONENTS.GCSE;
    const comps = ["1", "2"].concat(strands.some(s => s.comp === "other") ? ["other"] : []);
    if (!comps.includes(state.comp)){
      const next = lessonsNow().filter(c => !c.assessment && !isDone(c) && !closed(c)).sort(bySubunit)[0];
      const home = next && strands.find(s => s.facts.some(f => f.lessons.includes(next)));
      state.comp = home ? home.comp : "1";
    }
    const tabs = make("div", "gh-comp-tabs");
    tabs.setAttribute("role", "tablist");
    comps.forEach(id => {
      const t = make("button", "gh-comp-tab" + (state.comp === id ? " on" : ""));
      t.type = "button";
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", state.comp === id ? "true" : "false");
      t.appendChild(make("b", "", id === "other" ? "Other" : "Component " + id));
      t.appendChild(make("span", "", id === "other" ? "Not filed under a point" : names[id]));
      t.addEventListener("click", () => { state.comp = id; state.openPoint = ""; remember(); paintMap(); });
      tabs.appendChild(t);
    });
    box.appendChild(tabs);

    const mine = strands.filter(s => s.comp === state.comp);
    const panel = make("div", "gh-comp-panel");
    panel.setAttribute("role", "tabpanel");
    if (!mine.length){
      panel.appendChild(make("p", "gh-quiet gh-empty", "Nothing from " + (state.comp === "other" ? "here" : "Component " + state.comp) + " has been given to your class yet. Topics appear here as you are taught them."));
      box.appendChild(panel);
      return;
    }

    /* The whole paper in three numbers, before any detail */
    const facts = [].concat(...mine.map(s => s.facts));
    const sum = make("div", "gh-overview");
    const stat = (n, of, label, cls) => {
      const s = make("div", "gh-stat " + cls);
      const big = make("b", "", String(n));
      big.appendChild(make("small", "", " of " + of));
      s.appendChild(big);
      s.appendChild(make("span", "", label));
      const bar = make("span", "gh-stat-bar");
      const fill = make("span", "");
      fill.style.width = (of ? Math.round(n / of * 100) : 0) + "%";
      bar.appendChild(fill);
      s.appendChild(bar);
      sum.appendChild(s);
    };
    stat(facts.filter(f => f.total && f.done === f.total).length, facts.length, "topics done in lesson", "gh-stat-lesson");
    stat(facts.filter(f => f.fresh).length, facts.length, "revised in the last 3 weeks", "gh-stat-rev");
    stat(facts.filter(f => f.rated === "g").length, facts.length, "rated Got it", "gh-stat-conf");
    panel.appendChild(sum);

    /* The key, once, in the same shapes the tiles use */
    const key = make("div", "gh-key");
    const keyItem = (swatch, words) => {
      const k = make("span", "gh-key-item");
      k.appendChild(swatch);
      k.appendChild(make("span", "", words));
      key.appendChild(k);
    };
    RATINGS.forEach(r => keyItem(make("span", "gh-key-tile gh-tile-" + r.id), r.label));
    keyItem(make("span", "gh-key-tile"), "Not rated");
    const keyBar = make("span", "gh-key-bar");
    keyBar.appendChild(make("span", ""));
    keyItem(keyBar, "Done in lesson");
    keyItem(make("span", "gh-rev-badge", "↻"), "Revised");
    panel.appendChild(key);

    /* One region per strand, every topic in it a tile. Nothing is folded:
       the point of a map is seeing all of it at once. */
    const regions = make("div", "gh-regions");
    mine.forEach(s => {
      const region = make("section", "gh-region");
      const head = make("div", "gh-region-head");
      head.appendChild(make("h3", "", s.unit));
      const done = s.facts.filter(f => f.total && f.done === f.total).length;
      head.appendChild(make("span", "", done + " of " + s.facts.length + " done in lesson"));
      region.appendChild(head);
      const tiles = make("div", "gh-tiles");
      s.facts.forEach(f => tiles.appendChild(tile(f)));
      region.appendChild(tiles);
      regions.appendChild(region);
    });
    panel.appendChild(regions);
    box.appendChild(panel);

    if (state.scrollTo){
      state.scrollTo = false;
      const t = box.querySelector(".gh-tile.picked");
      if (t) setTimeout(() => t.scrollIntoView({ block: "center" }), 0);
    } else if (keepY !== null) window.scrollTo(0, keepY);
  }

  /* A topic as a tile. Three things at once, each in a different channel so
     none hides another: the colour is how confident they said they are, the
     bar along the foot fills as its lessons are finished, and the corner
     badge says it has been revised (faded when that was a while ago). */
  function tile(f){
    const t = make("button", "gh-tile" + (f.rated ? " gh-tile-" + f.rated : "") + (state.openPoint === f.point ? " picked" : ""));
    t.type = "button";
    const num = /^\d/.test(f.key) ? f.key : "";
    const name = num ? String(f.point).replace(/^\s*\d+(?:\.\d+)*\s*/, "") : f.point;
    const top = make("span", "gh-tile-top");
    top.appendChild(make("span", "gh-tile-num", num));
    if (f.homework.length){
      const hw = make("span", "gh-hw-badge", "Home learning");
      top.appendChild(hw);
    }
    if (f.last) top.appendChild(make("span", "gh-rev-badge" + (f.fresh ? "" : " faded"), "↻"));
    t.appendChild(top);
    t.appendChild(make("span", "gh-tile-name", name || f.point));
    const bar = make("span", "gh-tile-bar");
    const fill = make("span", "");
    fill.style.width = (f.total ? Math.round(f.done / f.total * 100) : 0) + "%";
    bar.appendChild(fill);
    t.appendChild(bar);
    /* the same three things in words, for a screen reader and on hover */
    const said = [f.point,
      "done in lesson: " + f.done + " of " + f.total,
      f.last ? "revised " + agoWords(f.last) : "not revised yet",
      f.rated ? "you said: " + RATINGS.find(r => r.id === f.rated).label : "not rated yet"];
    if (f.homework.length) said.push("home learning to do");
    t.setAttribute("aria-label", said.join(", "));
    t.title = said.slice(1).join("\n");
    t.addEventListener("click", () => openTopic(f.point));
    return t;
  }

  /* A topic opened: a pop-up over the map, so the map is still there behind
     it when it closes. Its facts are worked out again on every change, so
     rating it or saying it was revised shows at once, here and on the tile. */
  function openTopic(point){
    state.openPoint = point;
    remember();
    const back = make("div", "modal-back gh-topic-back");
    const box = make("div", "modal gh-topic-pop");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    back.appendChild(box);
    /* Closed by hand, nothing is picked any more. Left by opening one of its
       lessons, it stays picked, so coming back finds that tile again. */
    const close = () => {
      back.remove();
      document.removeEventListener("keydown", onKey);
      state.openPoint = "";
      remember();
      paintMap();
      const t = Array.from(document.querySelectorAll(".gh-tile")).find(x => x.getAttribute("aria-label").startsWith(point + ","));
      if (t) t.focus();
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
    const fill = () => {
      const f = [].concat(...allPoints().map(s => s.facts)).find(x => x.point === point);
      box.innerHTML = "";
      if (!f){ close(); return; }
      box.setAttribute("aria-label", f.point);
      const x = make("button", "btn-ghost iconbtn modal-x", "✕");
      x.type = "button";
      x.setAttribute("aria-label", "Close");
      x.addEventListener("click", close);
      box.appendChild(x);
      box.appendChild(make("p", "gh-eyebrow", f.unit));
      box.appendChild(make("h2", "gh-pop-title", f.point));
      box.appendChild(topicBody(f, () => { fill(); paintMap(); }));
    };
    fill();
    document.body.appendChild(back);
    const first = box.querySelector(".modal-x");
    if (first) first.focus();
  }

  function topicBody(f, repaint){
    const markOf = marks();
    const body = make("div", "gh-point-body");

    /* 1. what was done in lesson */
    const lessons = make("div", "gh-part");
    lessons.appendChild(make("h3", "gh-part-title", "In lesson"));
    lessons.appendChild(make("p", "gh-part-sum", f.done === f.total ? "All " + f.total + " finished." : f.done + " of " + f.total + " finished."));
    const list = make("div", "gh-list");
    inOrder(f.lessons).forEach(c => {
      const extra = c.homework ? "Home learning" + (c.close_on && !closed(c) ? ", " + niceDate(c.close_on).toLowerCase() : "")
                  : isDone(c) ? "Open it again to revise"
                  : closed(c) ? "Closed" : "Not finished yet";
      list.appendChild(lessonLink(c, extra, markOf));
    });
    lessons.appendChild(list);
    body.appendChild(lessons);

    /* 2. revision */
    const rev = make("div", "gh-part");
    rev.appendChild(make("h3", "gh-part-title", "Revised"));
    rev.appendChild(make("p", "gh-part-sum", f.last ? "Last revised " + agoWords(f.last) + "." : "Not revised yet."));
    const today = f.last === todayHere();
    const logBtn = make("button", "btn-ghost gh-log" + (today ? " on" : ""), today ? "✓ Revised today" : "I revised this");
    logBtn.type = "button";
    logBtn.title = today ? "Press again to take it off" : "Flashcards, a revision guide, notes, anything counts";
    logBtn.setAttribute("aria-pressed", today ? "true" : "false");
    logBtn.addEventListener("click", () => { logRevision(f.key, today); repaint(); });
    rev.appendChild(logBtn);
    rev.appendChild(make("p", "gh-quiet gh-small", "Opening a lesson you have finished counts too."));
    body.appendChild(rev);

    /* 3. confidence */
    const conf = make("div", "gh-part");
    conf.appendChild(make("h3", "gh-part-title", "How confident are you?"));
    conf.appendChild(ratingButtons(f.key, repaint));
    body.appendChild(conf);

    const targets = feedbackRows().filter(fb => fb.target && f.lessons.some(c => c.lesson_id === fb.lesson));
    if (targets.length){
      const t = make("div", "gh-part gh-targets");
      t.appendChild(make("h3", "gh-part-title", "Your targets"));
      targets.forEach(fb => t.appendChild(make("p", "me-fb", fb.target)));
      body.appendChild(t);
    }
    return body;
  }

  /* ---------- turning it on and off ---------- */
  function loaded(){
    if (OFFLINE || levelOf(catalogue) === "KS3"){ off(); return; }
    build();
    state.on = true;
    state.level = levelOf(catalogue);
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
    /* Where to start: the address first, then wherever they were before
       opening a lesson, then a link from the sandbox or a home learning page. */
    const hash = RENAMED[location.hash.slice(1)] || location.hash.slice(1);
    const back = recall();
    const asked = new URLSearchParams(location.search).get("tab");
    let first = state.section;
    if (SECTIONS.some(s => s.id === hash)) first = hash;
    else if (back && SECTIONS.some(s => s.id === back.section)) first = back.section;
    else if (asked === "practice") first = "today";
    else if (asked === "homework") first = "map";
    if (back && !state.comp){
      state.comp = back.comp || "";
      state.openPoint = back.point || "";
      state.scrollTo = !!state.openPoint && first === "map";
    }
    go(first, true);
    badges();
    /* Results feed Home, the map's marks and the Feedback badge, so they are
       asked for straight away rather than when Feedback is first opened. */
    Promise.resolve(loadResults()).then(() => {
      badges();
      if (state.section === "today") paintToday();
      if (state.section === "map") paintMap();
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
    ["today", "map"].forEach(id => { const v = byId("gh-" + id); if (v) v.hidden = true; });
  }
  /* Signing out: the next student at this computer may well be KS3, and must
     not open on the last one's map. */
  function reset(){
    off();
    state.section = "today";
    state.comp = "";
    state.openPoint = "";
    try{ sessionStorage.removeItem(placeKey); }catch(e){}
    if (location.hash) try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){}
  }

  window.gcseHome = {
    loaded, reset,
    get on(){ return state.on; }
  };
})();
