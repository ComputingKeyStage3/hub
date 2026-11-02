/* =====================================================================
   timetable.js, a teacher's timetable and the Home dashboard built on it.

     Timetable    the periods of the day, which class is in each one, a
                  Week A and a Week B, and the holidays. Opened from the
                  Timetable button on the Classes screen.
     Lunch        P4 is always split, as the school's lunch is fixed: 12:10 to 13:10 for the
                  early lunch, 12:55 to 13:55 for the late one. The period holds
                  both sets of times and each lesson in it says which.
     Doubles      nothing is stored for one. Two periods in a row with the
                  same class, no more than five minutes apart, are shown as
                  one lesson on Home.
     Week A / B   the weeks alternate, but a holiday week does not count:
                  Week A, then half term, then Week B.
     Holidays     one day or many. A single day off leaves the week as it
                  is; a week with no school days in it at all is skipped.
                  The holidays set under All (Admin) are the school's, and
                  every teacher uses them until they choose to customise
                  their own. A teacher with their own list is offered any
                  school holiday they do not have yet.
     Dashboard    Home greets the teacher and shows what their classes can
                  see now beside today's lessons in period order.
                  Settings > Console layout > Home dashboard turns it off.

   Each teacher has their own timetable, kept by the server at
   /api/teacher/timetable. A copy stays in this browser as well, so a save
   that could not reach the server is not lost: it goes up the next time
   the timetable is opened.

   Classic script loaded after the console's own: meCode, show, el, $ and
   the rest are read by name at the time they are used.
   ===================================================================== */
(function(){
  "use strict";
  if (typeof VIEWS === "undefined" || typeof OFFLINE === "undefined") return;
  const UI = window.hubUI;
  const ic = (n, s) => UI ? UI.icon(n, s) : "";
  const toast = (words, o) => { if (UI) UI.toast(words, o); };

  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
  const SHORT = ["Mon","Tue","Wed","Thu","Fri"];
  /* Things that fill a period without being a class. */
  const OTHERS = ["PPA","DIRECT","Duty","Meeting","Cover"];
  /* Lessons in Arbor that are taught but do not use the hub, so they go in
     by name under "Not a class" rather than being matched to a class: the
     EPQ (Extended Project Qualification) is a real class with no lessons
     or students on this site. */
  const OTHER_LESSONS = ["EPQ"];

  /* ================= dates ================= */
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseDay = (s) => {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const toMins = (t) => { const m = /^(\d\d?):(\d\d)$/.exec(String(t || "")); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fromMins = (n) => pad(Math.floor(n / 60) % 24) + ":" + pad(n % 60);
  const longDate = (d) => d.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  const shortDate = (d) => d.toLocaleDateString(undefined, { day:"numeric", month:"short" });
  const dayName = (d) => d.toLocaleDateString(undefined, { weekday:"long" });
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ================= the timetable itself ================= */
  /* The late lunch's P4, for the school's split lunch. */
  const LATE_P4 = { start:"12:55", end:"13:55" };
  function blank(){
    return {
      v: 2,
      twoWeek: true,
      anchor: isoDay(mondayOf(new Date())),   // a Monday...
      anchorWeek: "A",     // ...and which week it is
      periods: [
        { id:"p1", name:"P1", start:"08:50", end:"09:50" },
        { id:"p2", name:"P2", start:"09:50", end:"10:50" },
        { id:"p3", name:"P3", start:"11:10", end:"12:10" },
        { id:"p4", name:"P4", start:"12:10", end:"13:10", late: { start: LATE_P4.start, end: LATE_P4.end } },
        { id:"p5", name:"P5", start:"14:00", end:"15:00" }
      ],
      slots: { A:{}, B:{} },   // slots[week][day 1-5][period id] = { cls | text }
      holidays: [],            // { id, name, start, end } as YYYY-MM-DD
      holidayMode: "school",   // "school": Admin's holidays; "own": the list above
      dismissed: [],           // school holidays this teacher said no to, as start|end
      savedAt: ""
    };
  }
  /* Whatever came back, from the server or from an older copy in this
     browser, made into the shape above. */
  function normal(t){
    const b = blank();
    if (!t || typeof t !== "object") return b;
    const out = {
      v: 2,
      twoWeek: t.twoWeek !== false,
      anchor: parseDay(t.anchor) ? t.anchor : b.anchor,
      anchorWeek: t.anchorWeek === "B" ? "B" : "A",
      periods: Array.isArray(t.periods) ? t.periods.filter(p => p && p.id).map(p => {
        const q = { id: String(p.id), name: String(p.name || ""), start: toMins(p.start) === null ? "" : p.start,
                    end: toMins(p.end) === null ? "" : p.end };
        if (p.late && toMins(p.late.start) !== null && toMins(p.late.end) !== null)
          q.late = { start: p.late.start, end: p.late.end };
        return q;
      }) : b.periods,
      slots: { A:{}, B:{} },
      holidays: Array.isArray(t.holidays) ? t.holidays.filter(h => h && parseDay(h.start)).map(h => ({
        id: String(h.id || newId("h")), name: String(h.name || "Holiday"),
        start: h.start, end: parseDay(h.end) && h.end >= h.start ? h.end : h.start })) : [],
      holidayMode: "school",
      dismissed: Array.isArray(t.dismissed) ? t.dismissed.map(String) : [],
      savedAt: String(t.savedAt || "")
    };
    /* A timetable from before the school's holidays existed kept its own, so
       a list that is already there stays in use. */
    out.holidayMode = t.holidayMode === "own" || t.holidayMode === "school" ? t.holidayMode
                    : out.holidays.length ? "own" : "school";
    ["A","B"].forEach(w => {
      const src = (t.slots && t.slots[w]) || {};
      for (let d = 1; d <= 5; d++){
        const day = src[d] || src[String(d)];
        if (!day) continue;
        Object.keys(day).forEach(pid => {
          const s = day[pid];
          if (!s || (!s.cls && !s.text)) return;
          const keep = { cls: s.cls ? String(s.cls) : "", text: s.cls ? "" : String(s.text || "") };
          if (s.late) keep.late = true;
          (out.slots[w][d] = out.slots[w][d] || {})[pid] = keep;
        });
      }
    });
    /* P4 is always split: the school's lunch is fixed, so there is no
       switch for it. A timetable saved before the split had P4 at the
       early times only, and is given the late ones here. */
    const p4 = out.periods.find(p => /^p\s*4$/i.test(p.name.trim()));
    if (p4 && !p4.late) p4.late = { start: LATE_P4.start, end: LATE_P4.end };
    return out;
  }
  const sortedPeriods = (t) => t.periods.slice().sort((a, b) => (toMins(a.start) ?? 9999) - (toMins(b.start) ?? 9999));

  /* ---------- holidays and weeks ---------- */
  /* The holidays that count for this timetable: its own, or the school's. */
  function holsOf(t){
    if (t.holidayMode === "own" || !schoolHols) return t.holidays;
    return schoolHols;
  }
  function holidayOn(t, day){
    const s = typeof day === "string" ? day : isoDay(day);
    return holsOf(t).find(h => h.start <= s && s <= h.end) || null;
  }
  /* A week with no school day left in it. One day off is still a school
     week, and still counts as its A or B. */
  function holidayWeek(t, monday){
    for (let i = 0; i < 5; i++) if (!holidayOn(t, addDays(monday, i))) return false;
    return true;
  }
  /* "A", "B", "" for a one-week timetable, or null for a holiday week.
     Counted from the week the teacher said was A or B, one flip for every
     school week in between, so holiday weeks leave the order alone. */
  function weekOf(t, date){
    const mon = mondayOf(date);
    if (holidayWeek(t, mon)) return null;
    if (!t.twoWeek) return "";
    const a = mondayOf(parseDay(t.anchor) || mon);
    let flips = 0, guard = 0;
    if (mon > a){
      for (let w = addDays(a, 7); w <= mon && guard < 600; w = addDays(w, 7), guard++) if (!holidayWeek(t, w)) flips++;
    } else if (mon < a){
      for (let w = mon; w < a && guard < 600; w = addDays(w, 7), guard++) if (!holidayWeek(t, w)) flips++;
    }
    return ((t.anchorWeek === "B" ? 1 : 0) + flips) % 2 ? "B" : "A";
  }
  /* The first Monday on or after this one that is not a holiday week. */
  function nextSchoolMonday(t, from){
    let w = mondayOf(from);
    for (let i = 0; i < 60 && holidayWeek(t, w); i++) w = addDays(w, 7);
    return w;
  }
  /* When a lesson in a period starts and ends: the late lunch's times when
     the period is split and the lesson is on the late one. */
  function timesOf(period, slot){
    const late = !!(slot && slot.late && period.late);
    return late ? { start: period.late.start, end: period.late.end, late }
                : { start: period.start, end: period.end, late };
  }
  /* What a day holds: nothing because it is a weekend or a holiday, or the
     lessons in period order, each with its own times. */
  function dayPlan(t, date){
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return { kind:"weekend", list:[] };
    const hol = holidayOn(t, date);
    if (hol) return { kind:"holiday", holiday: hol, list:[] };
    const week = weekOf(t, date);
    const table = t.slots[week === "B" ? "B" : "A"][dow] || {};
    const list = sortedPeriods(t).filter(p => table[p.id]).map(p => Object.assign({ period: p, slot: table[p.id] }, timesOf(p, table[p.id])));
    return { kind:"school", week, list };
  }
  function nextSchoolDay(t, from){
    for (let i = 1; i < 120; i++){
      const d = addDays(from, i);
      const p = dayPlan(t, d);
      if (p.kind === "school") return { date: d, plan: p };
    }
    return null;
  }
  const hasLessons = (t) => ["A","B"].some(w => Object.keys(t.slots[w]).some(d => Object.keys(t.slots[w][d] || {}).length));
  const slotName = (s) => s.cls || s.text || "";
  /* Two lessons in a row with the same class make a double, as long as
     nothing longer than a changeover sits between them: P2 and P3 have
     break between them and stay two lessons. Late P4 into P5 is a double,
     five minutes apart. */
  const DOUBLE_GAP = 5;
  const sameLesson = (a, b) => !!slotName(a) && (a.cls ? a.cls === b.cls : !b.cls && a.text === b.text);
  function doubled(a, b){
    const end = toMins(a.end), start = toMins(b.start);
    return sameLesson(a.slot, b.slot) && end !== null && start !== null && start >= end && start - end <= DOUBLE_GAP;
  }
  /* A day's list with each double made one entry, from the first period's
     start to the second one's end. */
  function withDoubles(list){
    const out = [];
    list.forEach(x => {
      const last = out[out.length - 1];
      if (last && doubled(last, x)){
        last.end = x.end;
        last.parts.push(x.period);
        return;
      }
      out.push(Object.assign({}, x, { parts: [x.period] }));
    });
    return out;
  }
  function partsName(parts){
    const first = parts[0].name || "Period";
    if (parts.length < 2) return first;
    const last = parts[parts.length - 1].name || "";
    /* "P1–2" fits where "P1–P2" would wrap */
    const m = /^([A-Za-z]+)\s*(\d+)$/.exec(first), n = /^([A-Za-z]+)\s*(\d+)$/.exec(last);
    return m && n && m[1].toLowerCase() === n[1].toLowerCase() ? first + "–" + n[2] : first + "–" + last;
  }

  /* ================= keeping it ================= */
  let tt = null, ttFor = null, loading = null;
  let serverKeeps = null;           // null until asked, then whether the server kept it
  let schoolHols = null;            // Admin's holidays, for a teacher; null for Admin
  const who = () => (typeof meCode === "string" ? meCode : "") || "";
  const localKey = () => "hub_timetable:" + (who() || "_all");

  function readLocal(code){
    try{ return JSON.parse(localStorage.getItem("hub_timetable:" + (code || "_all")) || "null"); }catch(e){ return null; }
  }
  /* One teacher's timetable from the server, or undefined when it could not
     be asked. "" is All (Admin), whose holidays are the school's. */
  async function fetchOne(code){
    if (OFFLINE || !API || (typeof TOKEN !== "undefined" && !TOKEN && !KEY)) return undefined;
    try{
      const r = await fetch(API + "/api/teacher/timetable?teacher=" + encodeURIComponent(code),
                            { headers: H(), cache:"no-store" });
      if (!r.ok) return undefined;
      const d = await r.json();
      return d.timetable || null;
    }catch(e){ return undefined; }
  }
  const newer = (a, b) => a && b ? ((a.savedAt || "") >= (b.savedAt || "") ? a : b) : (a || b);
  function load(force){
    const me = who();
    if (tt && ttFor === me && !force) return Promise.resolve(tt);
    if (loading && loading.me === me) return loading.p;
    const p = (async () => {
      const local = readLocal(me);
      /* A teacher's own and, alongside it, Admin's for the school holidays. */
      const [remote, schoolRemote] = await Promise.all([fetchOne(me), me ? fetchOne("") : Promise.resolve(undefined)]);
      serverKeeps = remote !== undefined;
      /* The newer of the two, so a timetable made on this machine before the
         server could keep one is not lost the day it starts to. */
      const pick = newer(remote, local);
      if (who() !== me) return tt;         // they changed teacher while this was out
      tt = normal(pick);
      ttFor = me;
      if (me){
        const sc = newer(schoolRemote, readLocal(""));
        schoolHols = sc ? normal(sc).holidays : [];
      } else schoolHols = null;

      if (serverKeeps && local && pick === local) push();
      return tt;
    })();
    loading = { me, p };
    p.finally(() => { if (loading && loading.p === p) loading = null; });
    return p;
  }
  let pushTimer = null;
  function save(){
    if (!tt) return;
    tt.savedAt = new Date().toISOString();
    try{ localStorage.setItem(localKey(), JSON.stringify(tt)); }catch(e){}
    savedNote("Saving…");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 700);
  }
  async function push(){
    if (!tt || OFFLINE || !API){ savedNote("Saved in this browser"); return; }
    const body = JSON.stringify({ teacher: ttFor || "", timetable: tt });
    try{
      const r = await fetch(API + "/api/teacher/timetable", { method:"POST", headers: HJ(), body });
      if (!r.ok) throw new Error(String(r.status));
      serverKeeps = true;
      savedNote("Saved");
    }catch(e){
      serverKeeps = false;
      savedNote("Could not save to the server just now. It is kept in this browser and will be sent the next time the timetable opens.");
    }
  }
  function savedNote(words){ const s = $("ttSaved"); if (s) s.textContent = words; }

  /* ================= the editor ================= */
  let editWeek = "A";
  function open(){
    show("timetableView");
    paintEditor();
  }
  async function paintEditor(){
    const box = $("ttBody");
    if (!box) return;
    if (!tt || ttFor !== who()){
      box.innerHTML = "";
      box.appendChild(UI ? UI.skeleton("rows", 5) : waiting("Loading your timetable"));
    }
    await load();
    if ($("timetableView").hidden) return;
    if (serverKeeps === false) savedNote("Could not reach the server, so this is the copy kept in this browser.");
    else if (tt.savedAt) savedNote("Saved");
    else savedNote("");
    box.innerHTML = "";
    /* A teacher with nothing on their timetable yet is asked one thing:
       import it, or fill it in. Admin keeps the school holidays here, so
       goes straight to the page. */
    if (who() && !hasLessons(tt) && !byHand) box.appendChild(landing());
    else {
      box.appendChild(gridSection());
      /* The rest is set once and rarely looked at again, so it is folded
         away under the lessons with a line saying where it stands. */
      box.appendChild(weeksSection());
      box.appendChild(periodsSection());
      box.appendChild(holidaysSection());
    }
    if (UI && UI.swapEmoji) UI.swapEmoji(box);
  }
  /* Set when a teacher chooses to fill the timetable in themselves, so an
     empty grid is not taken back to the landing page on the next repaint. */
  let byHand = false;
  function landing(){
    const s = el("section","tt-section tt-start");
    s.appendChild(el("h3","tt-start-title","Set up your timetable"));
    s.appendChild(el("p","hint tt-note","Once it is set up, Home shows the classes you teach today in order."));
    const choices = el("div","tt-choices");
    const arbor = el("div","tt-choice main");
    const ah = el("b","tt-choice-head");
    ah.innerHTML = ic("upload", 20);
    ah.appendChild(el("span","", "Import from Arbor"));
    arbor.appendChild(ah);
    arbor.appendChild(el("p","tt-choice-words",
      "Choose the two week timetable PDF from Arbor. Your classes, double lessons and early or late lunch are filled in for you."));
    arbor.appendChild(arborButton("Choose the PDF", "btn-primary bmini2"));
    const hand = el("div","tt-choice");
    const hh = el("b","tt-choice-head");
    hh.innerHTML = ic("edit", 20);
    hh.appendChild(el("span","", "Fill it in yourself"));
    hand.appendChild(hh);
    hand.appendChild(el("p","tt-choice-words", "Pick the class you teach in each period of Week A and Week B."));
    const go = el("button","btn-ghost bmini2","Start");
    go.type = "button";
    go.addEventListener("click", () => { byHand = true; paintEditor(); });
    hand.appendChild(go);
    choices.appendChild(arbor);
    choices.appendChild(hand);
    s.appendChild(choices);
    return s;
  }
  /* A section folded shut under its title, with a few words on the right
     saying what is in it. Which ones are open survives the repaint that
     every change makes. */
  const openFolds = new Set();
  function fold(key, icon, title, summary){
    const d = el("details","tt-section tt-fold");
    if (openFolds.has(key)) d.open = true;
    const sum = el("summary","tt-fold-head");
    const h = el("span","dash-head tt-fold-title");
    h.innerHTML = ic(icon, 18);
    h.appendChild(el("span","", title));
    sum.appendChild(h);
    if (summary) sum.appendChild(el("span","tt-fold-sum", summary));
    d.appendChild(sum);
    d.addEventListener("toggle", () => { if (d.open) openFolds.add(key); else openFolds.delete(key); });
    return d;
  }
  function section(icon, title, note){
    const s = el("section","tt-section");
    const h = el("h3","dash-head");
    h.innerHTML = ic(icon, 18);
    h.appendChild(el("span","", title));
    s.appendChild(h);
    if (note) s.appendChild(el("p","hint tt-note", note));
    return s;
  }
  function switchBtn(title, words, onNow, fn){
    const b = el("button","set-switch" + (onNow ? " on" : ""));
    b.type = "button";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", onNow ? "true" : "false");
    const w = el("span","set-switch-words");
    w.appendChild(el("b","", title));
    w.appendChild(el("span","", words));
    b.appendChild(w);
    const k = el("span","set-switch-knob"); k.setAttribute("aria-hidden", "true");
    b.appendChild(k);
    b.addEventListener("click", fn);
    return b;
  }
  function chip(words, onNow, fn){
    const c = el("button","chip-filter" + (onNow ? " on" : ""), words);
    c.type = "button";
    c.setAttribute("aria-pressed", onNow ? "true" : "false");
    c.addEventListener("click", fn);
    return c;
  }

  /* ---------- Week A and Week B ---------- */
  function weeksSection(){
    const now = weekOf(tt, nextSchoolMonday(tt, new Date()));
    const s = fold("weeks", "calendar", "Weeks",
      tt.twoWeek ? "Two weeks" + (now ? ", this week is Week " + now : "") : "The same every week");
    s.appendChild(switchBtn("Two-week timetable",
      "Week A and Week B take turns. Holiday weeks are skipped, so the week after a holiday carries on from the week before it.",
      tt.twoWeek, () => { tt.twoWeek = !tt.twoWeek; if (!tt.twoWeek) editWeek = "A"; save(); paintEditor(); }));
    const today = new Date();
    /* The next few weeks, so a teacher can see the holidays doing their job. */
    const ahead = el("div","tt-ahead");
    const from = mondayOf(today);
    for (let i = 0; i < 8; i++){
      const mon = addDays(from, i * 7);
      const w = weekOf(tt, mon);
      const c = el("span","tt-wk" + (w === null ? " hol" : w === "B" ? " b" : " a") + (i === 0 ? " now" : ""));
      c.appendChild(el("span","tt-wk-date", i === 0 ? "This week" : shortDate(mon)));
      c.appendChild(el("b","", w === null ? "Holiday" : w ? "Week " + w : "School"));
      ahead.appendChild(c);
    }
    s.appendChild(ahead);
    return s;
  }

  /* ---------- the grid of lessons ---------- */
  function classList(){
    const mine = (typeof myClasses === "function" && typeof allClasses === "function") ? myClasses(allClasses()) : [];
    return mine.map(g => g.name).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric:true }));
  }
  function gridSection(){
    const s = section("classes", "Lessons");
    /* Import sits in the heading, out of the way of the grid, since it is
       done once a year. */
    s.querySelector(".dash-head").appendChild(arborButton("Import from Arbor", "btn-ghost bmini2 tt-import"));
    s.appendChild(el("p","hint tt-note","Pick the class you teach in each period. Leave it empty when you are free."));
    if (importNote) s.appendChild(el("p","hint tt-note tt-importnote", importNote));
    if (tt.twoWeek){
      const tabs = el("div","tt-row");
      ["A","B"].forEach(w => tabs.appendChild(chip("Week " + w, editWeek === w, () => { editWeek = w; paintEditor(); })));
      /* Which week this is, the one thing about the weeks that has to be
         right for Home to be right, so it is here rather than folded away. */
      const base = nextSchoolMonday(tt, new Date());
      const thisWeek = +base === +mondayOf(new Date());
      const now = weekOf(tt, base);
      const which = el("label","tt-which");
      which.appendChild(el("span","", thisWeek ? "This week is" : "Back after the holiday on " + shortDate(base) + " is"));
      const pickWeek = document.createElement("select");
      pickWeek.className = "tt-sel tt-whichsel";
      ["A","B"].forEach(w => { const o = document.createElement("option"); o.value = w; o.textContent = "Week " + w; pickWeek.appendChild(o); });
      pickWeek.value = now || "A";
      pickWeek.addEventListener("change", () => {
        tt.anchor = isoDay(base); tt.anchorWeek = pickWeek.value; save(); paintEditor(); paintHome();
      });
      which.appendChild(pickWeek);
      tabs.appendChild(which);
      const other = editWeek === "A" ? "B" : "A";
      const copy = el("button","btn-ghost bmini2 tt-copy","Copy Week " + editWeek + " to Week " + other);
      copy.type = "button";
      copy.addEventListener("click", () => {
        const was = JSON.stringify(tt.slots[other]);
        tt.slots[other] = JSON.parse(JSON.stringify(tt.slots[editWeek]));
        save(); paintEditor(); paintHome();
        toast("Week " + editWeek + " copied to Week " + other, { action:"Undo", onAction: () => {
          tt.slots[other] = JSON.parse(was); save(); paintEditor(); paintHome();
        } });
      });
      tabs.appendChild(copy);
      s.appendChild(tabs);
    }
    const week = tt.twoWeek ? editWeek : "A";
    const periods = sortedPeriods(tt);
    if (!periods.length){
      s.appendChild(el("p","hint","Add the periods of your day under Period times first."));
      return s;
    }
    const classes = classList();
    const scroll = el("div","tt-scroll");
    const table = el("table","tt-grid");
    const hr = el("tr");
    hr.appendChild(el("th","tt-corner",""));
    const todayDow = new Date().getDay();
    const todayWeek = weekOf(tt, new Date());
    DAYS.forEach((d, i) => {
      const th = el("th","", "");
      th.appendChild(el("span","tt-dlong", d));
      th.appendChild(el("span","tt-dshort", SHORT[i]));
      if (todayDow === i + 1 && (!tt.twoWeek || todayWeek === week)) th.classList.add("tt-today");
      hr.appendChild(th);
    });
    table.appendChild(hr);
    periods.forEach(p => {
      const tr = el("tr");
      const th = el("th","tt-period");
      th.appendChild(el("b","", p.name || "Period"));
      const times = (p.start || "?") + "–" + (p.end || "?");
      if (p.late){
        th.appendChild(el("span","tt-period-late", "Early " + times));
        th.appendChild(el("span","tt-period-late", "Late " + p.late.start + "–" + p.late.end));
      } else if (p.start || p.end) th.appendChild(el("span","", times));
      tr.appendChild(th);
      for (let d = 1; d <= 5; d++) tr.appendChild(cell(week, d, p, classes));
      table.appendChild(tr);
    });
    scroll.appendChild(table);
    s.appendChild(scroll);
    return s;
  }
  /* ---------- importing from Arbor ----------
     Arbor's "Timetable for ..." PDF, one page a week, read by
     arbor-import.js. Only the teaching periods come across, P1 to P5:
     registration, break and lunch duties and after-school clubs are in
     columns of their own in Arbor, between the periods, and are left out
     by where they sit; anything named as one is left out wherever it is.
     Nothing is asked first: it replaces both weeks, and Undo puts back
     what was there. */
  let importNote = "";
  const SKIP = /\b(duty|duties|club|registration|reg|tutor time|form time|detention|assembly|extra[- ]?curricular|after school)\b/i;
  function arborButton(words, cls){
    const wrap = el("span","tt-importwrap");
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".pdf,application/pdf";
    file.hidden = true;
    const b = el("button", cls, "");
    b.type = "button";
    b.title = "The two week timetable PDF from Arbor";
    b.innerHTML = ic("upload", 16);
    b.appendChild(el("span","", words));
    b.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      b.disabled = true;
      try{ await importArbor(f); }
      catch(e){ toast(e && e.readable ? e.message : "That timetable could not be read."); }
      finally{ b.disabled = false; }
    });
    wrap.appendChild(b);
    wrap.appendChild(file);
    return wrap;
  }
  async function importArbor(f){
    if (!window.arborTimetable) throw new Error("no reader");
    const read = await window.arborTimetable.read(await f.arrayBuffer());
    const got = fromArbor(read.weeks);
    if (!got.count) throw Object.assign(new Error("Nothing in that PDF fell in P1 to P5."), { readable: true });
    const was = JSON.stringify({ slots: tt.slots, twoWeek: tt.twoWeek, anchor: tt.anchor, anchorWeek: tt.anchorWeek });
    tt.slots.A = got.A;
    if (got.B){ tt.slots.B = got.B; tt.twoWeek = true; }
    if (got.anchor){ tt.anchor = got.anchor.day; tt.anchorWeek = got.anchor.week; }
    importNote = got.unmatched.length
      ? "Kept as written, because none of the classes has that name: " + got.unmatched.join(", ") +
        ". Pick the class in each of those periods."
      : "";
    editWeek = "A";
    save(); paintEditor(); paintHome();
    const said = [got.count + " period" + (got.count === 1 ? "" : "s")];
    if (got.doubles) said.push(got.doubles + " double" + (got.doubles === 1 ? "" : "s"));
    if (got.late) said.push(got.late + " on late lunch");
    toast("Timetable imported: " + said.join(", "), { action:"Undo", onAction: () => {
      const back = JSON.parse(was);
      Object.assign(tt, back);
      importNote = "";
      save(); paintEditor(); paintHome();
    } });
  }
  /* Arbor's boxes onto this timetable's periods. A box fills every period
     it covers at least half of, so a double from 08:50 to 10:50 fills P1
     and P2, and late P4 into P5, 12:55 to 15:00, fills both of those. A
     split period is matched against its early and its late times and
     takes whichever the box covers more of, which is how a lesson comes
     in on the right lunch.

     A box too short to cover half of any period goes in the one it
     overlaps most, if that is at least half of the box: Arbor sometimes
     cuts a lesson at lunch into two columns, and both halves belong to the
     same period. Those are placed after every whole box, and only where
     nothing is yet, so a sliver of a late lesson from 12:55 to 13:10 cannot
     put it on the early lunch before the rest of it is seen. */
  function fromArbor(weeks){
    let periods = sortedPeriods(tt).filter(p => /^p\s*[1-5]$/i.test(String(p.name || "").trim()));
    if (!periods.length) periods = sortedPeriods(tt);
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const names = (typeof allClasses === "function" ? allClasses().map(g => g.name) : []).concat(classList());
    const byKey = new Map(names.map(n => [norm(n), n]));
    const out = { A: null, B: null, anchor: null, count: 0, doubles: 0, late: 0, unmatched: [] };
    const span = (p, late) => late ? [toMins(p.late.start), toMins(p.late.end)] : [toMins(p.start), toMins(p.end)];
    const overlap = (a0, a1, [b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0);
    /* how much of a period the box covers, on whichever lunch it covers more */
    const fit = (p, b0, b1) => {
      const early = overlap(b0, b1, span(p, false));
      const late = p.late ? overlap(b0, b1, span(p, true)) : 0;
      /* a box that starts when the late lunch's lesson starts is on the
         late lunch even when it covers no more of it than of the early */
      const use = !!p.late && (late > early || (late === early && b0 === toMins(p.late.start)));
      const [s0, s1] = span(p, use);
      return { p, late: use, o: use ? late : early, len: s1 - s0 };
    };
    const unmatched = new Set();
    weeks.slice(0, 2).forEach((w, i) => {
      const letter = w.week === "A" || w.week === "B" ? w.week : (i === 0 ? "A" : "B");
      if (out[letter]) return;
      const slots = {}, slivers = [];
      w.boxes.forEach(box => {
        const lines = box.lines || [];
        const head = String(lines[0] || "").trim();
        if (!head || /^year\s*\d+\s*:/i.test(head)) return;           // a form group's registration
        if (SKIP.test(lines.slice(0, 2).join(" "))) return;
        const b0 = toMins(box.start), b1 = toMins(box.end);
        if (b0 === null || b1 === null) return;
        const fits = periods.map(p => fit(p, b0, b1));
        const whole = fits.filter(f => f.len > 0 && f.o * 2 >= f.len);
        let best = null;
        if (!whole.length){
          fits.forEach(f => { if (f.o > 0 && (!best || f.o > best.o)) best = f; });
          if (!best || best.o * 2 < b1 - b0) return;
        }
        /* "Computing: Year 07: 7y/Co2", wrapped over as many lines as the
           box needed. The class is what follows the year. */
        let lesson = null, acc = "";
        for (const line of lines.slice(0, 4)){
          acc = (acc + " " + line).trim();
          const m = /^(.*?):\s*Year\s*\d+\s*:\s*(.+)$/i.exec(acc);
          if (m){ lesson = { subject: m[1].trim(), code: m[2].trim() }; break; }
        }
        let slot;
        if (lesson && OTHER_LESSONS.some(n => n.toLowerCase() === lesson.subject.toLowerCase()))
          slot = { cls:"", text: OTHER_LESSONS.find(n => n.toLowerCase() === lesson.subject.toLowerCase()) };
        else if (lesson){
          const hit = byKey.get(norm(lesson.code));
          if (hit) slot = { cls: hit, text:"" };
          else { slot = { cls:"", text: (lesson.code + " " + lesson.subject).slice(0, 30) }; unmatched.add(lesson.code); }
        } else {
          const known = OTHERS.find(n => n.toLowerCase() === head.toLowerCase());
          slot = { cls:"", text: known || head.slice(0, 30) };
        }
        if (whole.length) whole.forEach(f => place(box.day, f, slot, false));
        else slivers.push([box.day, best, slot]);
      });
      slivers.forEach(([day, f, slot]) => place(day, f, slot, true));
      function place(d, f, slot, onlyEmpty){
        const day = slots[d] = slots[d] || {};
        const there = day[f.p.id];
        if (there && (onlyEmpty || there.cls || !slot.cls)) return;   // a class beats anything else
        if (!there) out.count++;
        day[f.p.id] = f.p.late && f.late ? Object.assign({ late: true }, slot) : Object.assign({}, slot);
      }
      /* What the toast reports: lunches by the late flag, doubles by the
         same rule Home uses to join them. */
      Object.keys(slots).forEach(d => {
        const list = periods.filter(p => slots[d][p.id]).map(p => Object.assign({ slot: slots[d][p.id] }, timesOf(p, slots[d][p.id])));
        list.forEach((x, i) => { if (x.late) out.late++; if (i && doubled(list[i - 1], x)) out.doubles++; });
      });
      out[letter] = slots;
      if (!out.anchor && /^\d{4}-\d\d-\d\d$/.test(w.monday || "")) out.anchor = { day: w.monday, week: letter };
    });
    if (!out.A){ out.A = out.B || {}; out.B = null; }
    out.unmatched = [...unmatched].sort((a, b) => a.localeCompare(b, undefined, { numeric:true }));
    return out;
  }

  function cell(week, day, period, classes){
    const td = el("td","tt-cell");
    const days = tt.slots[week];
    const slot = (days[day] && days[day][period.id]) || null;
    const put = (next) => {
      /* changing the class keeps the lunch it was on */
      if (next && slot && slot.late && period.late) next.late = true;
      days[day] = days[day] || {};
      if (!next || (!next.cls && !next.text)){
        delete days[day][period.id];
        if (!Object.keys(days[day]).length) delete days[day];
      } else days[day][period.id] = next;
      save(); paintHome();
    };
    const sel = document.createElement("select");
    sel.className = "tt-sel";
    sel.setAttribute("aria-label", DAYS[day - 1] + " " + (period.name || "period") + (tt.twoWeek ? ", Week " + week : ""));
    const add = (parent, value, words) => {
      const o = document.createElement("option"); o.value = value; o.textContent = words; parent.appendChild(o); return o;
    };
    add(sel, "", "—");
    const names = classes.slice();
    if (slot && slot.cls && names.indexOf(slot.cls) < 0) names.push(slot.cls);   // a class that has since gone
    if (names.length){
      const g = document.createElement("optgroup"); g.label = "Classes";
      names.forEach(n => add(g, "c:" + n, n));
      sel.appendChild(g);
    }
    const g2 = document.createElement("optgroup"); g2.label = "Not a class";
    OTHERS.forEach(n => add(g2, "t:" + n, n));
    add(g2, "other", "Something else…");
    sel.appendChild(g2);
    const custom = slot && slot.text && OTHERS.indexOf(slot.text) < 0;
    sel.value = !slot ? "" : slot.cls ? "c:" + slot.cls : custom ? "other" : "t:" + slot.text;
    td.appendChild(sel);

    const text = el("input","tt-in tt-text");
    text.type = "text";
    text.placeholder = "What is it?";
    text.maxLength = 30;
    text.setAttribute("aria-label", "What is in this period");
    text.value = custom ? slot.text : "";
    text.hidden = !custom;
    td.appendChild(text);

    /* A split period asks which lunch, quietly, under the class. Early is
       the starting point and is what an empty pick goes back to. */
    let lunch = null;
    if (period.late){
      lunch = el("div","tt-lunch");
      lunch.setAttribute("role","group");
      lunch.setAttribute("aria-label","Which lunch");
      const isLate = () => !!(days[day] && days[day][period.id] && days[day][period.id].late);
      const paintLunch = () => lunch.querySelectorAll("button").forEach(b => {
        const on = (b.dataset.late === "1") === isLate();
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const pn = period.name || "";
      [["Early " + pn, period.start + "–" + period.end, false], ["Late " + pn, period.late.start + "–" + period.late.end, true]].forEach(([words, times, late]) => {
        const b = el("button","tt-lunch-btn", words.trim());
        b.type = "button";
        b.dataset.late = late ? "1" : "0";
        b.title = words.trim() + ", " + times;
        b.addEventListener("click", () => {
          const cur = days[day] && days[day][period.id];
          if (!cur) return;
          if (late) cur.late = true; else delete cur.late;
          save(); paintHome(); paintLunch();
        });
        lunch.appendChild(b);
      });
      lunch.hidden = !slot;
      paintLunch();
      td.appendChild(lunch);
    }

    td.classList.toggle("filled", !!slot);
    sel.addEventListener("change", () => {
      const v = sel.value;
      if (lunch) lunch.hidden = !v;
      if (!v){ put(null); text.hidden = true; td.classList.remove("filled"); return; }
      if (v === "other"){
        text.hidden = false; td.classList.add("filled");
        text.value = text.value || "";
        text.focus();
        if (text.value.trim()) put({ cls:"", text: text.value.trim() });
        return;
      }
      text.hidden = true; td.classList.add("filled");
      put(v.slice(0, 2) === "c:" ? { cls: v.slice(2), text:"" } : { cls:"", text: v.slice(2) });
    });
    text.addEventListener("change", () => {
      const t = text.value.trim();
      put(t ? { cls:"", text: t } : null);
      if (!t){ sel.value = ""; text.hidden = true; td.classList.remove("filled"); }
    });
    return td;
  }

  /* ---------- the periods of the day ---------- */
  function periodsSection(){
    const periods = sortedPeriods(tt);
    const split = periods.filter(p => p.late).map(p => p.name || "A period");
    const s = fold("periods", "progress", "Period times",
      (periods.length ? periods.length + " period" + (periods.length === 1 ? "" : "s") : "None yet") +
      (split.length ? ", " + split.join(" and ") + " with an early and a late lunch" : ""));
    s.appendChild(el("p","hint tt-note","The same periods every day. Names and times can be anything your school uses."));
    const list = el("div","tt-list");
    periods.forEach(p => {
      const row = el("div","tt-line");
      const name = el("input","tt-in tt-pname");
      name.type = "text"; name.value = p.name; name.maxLength = 16; name.placeholder = "Name";
      name.setAttribute("aria-label", "Period name");
      name.addEventListener("change", () => { p.name = name.value.trim() || p.name; save(); paintEditor(); paintHome(); });
      const start = timeIn(p.start, "Starts");
      const end = timeIn(p.end, "Ends");
      const fix = () => {
        p.start = start.value; p.end = end.value;
        if (toMins(p.start) !== null && toMins(p.end) !== null && toMins(p.end) <= toMins(p.start))
          p.end = fromMins(toMins(p.start) + 60);
        save(); paintEditor(); paintHome();
      };
      start.addEventListener("change", fix);
      end.addEventListener("change", fix);
      const x = el("button","btn-ghost iconbtn","\u{1F5D1}");
      x.type = "button"; x.title = "Remove " + (p.name || "this period");
      x.addEventListener("click", () => {
        const was = JSON.stringify(tt);
        tt.periods = tt.periods.filter(q => q.id !== p.id);
        ["A","B"].forEach(w => Object.keys(tt.slots[w]).forEach(d => { delete tt.slots[w][d][p.id]; }));
        save(); paintEditor(); paintHome();
        toast((p.name || "Period") + " removed", { action:"Undo", onAction: () => {
          tt = normal(JSON.parse(was)); save(); paintEditor(); paintHome();
        } });
      });
      row.appendChild(name);
      row.appendChild(start);
      row.appendChild(el("span","tt-dash","to"));
      row.appendChild(end);
      row.appendChild(x);
      list.appendChild(row);
      if (p.late){
        const lr = el("div","tt-line tt-lateline");
        lr.appendChild(el("span","tt-pname tt-latename", "Late " + (p.name || "period")));
        const ls = timeIn(p.late.start, "Late " + (p.name || "period") + " starts");
        const le = timeIn(p.late.end, "Late " + (p.name || "period") + " ends");
        const fixLate = () => {
          p.late.start = ls.value || p.late.start; p.late.end = le.value || p.late.end;
          if (toMins(p.late.end) <= toMins(p.late.start)) p.late.end = fromMins(toMins(p.late.start) + 60);
          save(); paintEditor(); paintHome();
        };
        ls.addEventListener("change", fixLate);
        le.addEventListener("change", fixLate);
        lr.appendChild(ls);
        lr.appendChild(el("span","tt-dash","to"));
        lr.appendChild(le);
        list.appendChild(lr);
      }
    });
    s.appendChild(list);
    const addBtn = el("button","btn-ghost bmini2","+ Add a period");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      const last = periods[periods.length - 1];
      const from = last && toMins(last.end) !== null ? toMins(last.end) : 9 * 60;
      tt.periods.push({ id: newId("p"), name: "P" + (tt.periods.length + 1), start: fromMins(from), end: fromMins(from + 60) });
      save(); paintEditor();
    });
    s.appendChild(addBtn);
    return s;
  }
  function timeIn(value, label){
    const i = el("input","tt-in tt-time");
    i.type = "time"; i.value = value || ""; i.step = 300;
    i.setAttribute("aria-label", label);
    return i;
  }

  /* ---------- holidays ---------- */
  function schoolDaysIn(h){
    let n = 0;
    const a = parseDay(h.start), b = parseDay(h.end);
    if (!a || !b) return 0;
    for (let d = a; d <= b && n < 400; d = addDays(d, 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++;
    return n;
  }
  const holKey = (h) => h.start + "|" + h.end;
  function holidaysSection(){
    const admin = !who();
    const school = schoolHols || [];
    const useSchool = !admin && tt.holidayMode !== "own";
    const today = isoDay(new Date());
    const ahead = (useSchool ? school : tt.holidays).filter(h => h.end >= today).length;
    const s = fold("holidays", "calendar", admin ? "School holidays" : "Holidays",
      (useSchool ? "The school's, " : admin ? "" : "Your own, ") +
      (ahead === 1 ? "1 still to come" : ahead ? ahead + " still to come" : "none still to come"));
    /* Admin opens this page for the school holidays, so they start open. */
    if (admin && !openFolds.has("holidays-shut")) s.open = true;
    s.addEventListener("toggle", () => { if (admin){ if (s.open) openFolds.delete("holidays-shut"); else openFolds.add("holidays-shut"); } });
    s.appendChild(el("p","hint tt-note",
      "Half terms, INSET days, bank holidays: anything from one day upwards. There are no lessons on a holiday, " +
      "and a week that is all holiday does not count as Week A or Week B." +
      (admin ? " These are the school's holidays: every teacher uses them unless they customise their own." : "")));

    /* A teacher on the school's holidays sees them, but changes nothing
       until they choose to have their own. */
    if (useSchool){
      const note = el("div","tt-school");
      note.appendChild(el("p","tt-school-words", school.length
        ? "Using the school holidays set by Admin."
        : "Admin has not set any school holidays yet."));
      const own = el("button","btn-ghost bmini2", school.length ? "Customise" : "Add my own");
      own.type = "button";
      own.addEventListener("click", () => {
        tt.holidayMode = "own";
        tt.holidays = school.map(h => ({ id: newId("h"), name: h.name, start: h.start, end: h.end }));
        tt.dismissed = [];
        save(); paintEditor(); paintHome();
        toast(school.length ? "Your own copy of the school holidays, to change as you like" : "Add your holidays below");
      });
      note.appendChild(own);
      s.appendChild(note);
      const list = el("div","tt-list");
      school.slice().sort((a, b) => a.start.localeCompare(b.start)).forEach(h => {
        const row = el("div","tt-line tt-hol tt-ro" + (h.end < today ? " past" : ""));
        row.appendChild(el("b","tt-hname-ro", h.name));
        row.appendChild(el("span","tt-when-ro", niceDate(h.start) + (h.end !== h.start ? " to " + niceDate(h.end) : "")));
        const n = schoolDaysIn(h);
        row.appendChild(el("span","tt-count", n === 1 ? "1 day" : n + " days"));
        list.appendChild(row);
      });
      s.appendChild(list);
      return s;
    }

    /* Their own list: anything the school has that they have not got, and
       have not turned down, is offered to them. */
    if (!admin){
      const mine = new Set(tt.holidays.map(holKey));
      const missing = school.filter(h => !mine.has(holKey(h)) && tt.dismissed.indexOf(holKey(h)) < 0 && h.end >= today);
      if (missing.length){
        const sug = el("div","tt-suggest");
        const head = el("div","tt-suggest-head");
        head.appendChild(el("b","", "Admin has set " + missing.length + " school holiday" + (missing.length === 1 ? "" : "s") + " you do not have"));
        const all = el("button","btn-primary bmini2", missing.length === 1 ? "Add it" : "Add all");
        all.type = "button";
        all.addEventListener("click", () => {
          missing.forEach(h => tt.holidays.push({ id: newId("h"), name: h.name, start: h.start, end: h.end }));
          save(); paintEditor(); paintHome();
        });
        head.appendChild(all);
        sug.appendChild(head);
        missing.slice().sort((a, b) => a.start.localeCompare(b.start)).forEach(h => {
          const r = el("div","tt-line");
          r.appendChild(el("b","tt-hname-ro", h.name));
          r.appendChild(el("span","tt-when-ro", niceDate(h.start) + (h.end !== h.start ? " to " + niceDate(h.end) : "")));
          const add = el("button","btn-ghost bmini2","Add");
          add.type = "button";
          add.addEventListener("click", () => {
            tt.holidays.push({ id: newId("h"), name: h.name, start: h.start, end: h.end });
            save(); paintEditor(); paintHome();
          });
          const no = el("button","btn-ghost bmini2","Not for me");
          no.type = "button";
          no.addEventListener("click", () => { tt.dismissed.push(holKey(h)); save(); paintEditor(); });
          r.appendChild(add); r.appendChild(no);
          sug.appendChild(r);
        });
        s.appendChild(sug);
      }
    }

    const list = el("div","tt-list");
    const hols = tt.holidays.slice().sort((a, b) => a.start.localeCompare(b.start));
    if (!hols.length) list.appendChild(el("p","hint","No holidays yet."));
    hols.forEach(h => {
      const row = el("div","tt-line tt-hol" + (h.end < today ? " past" : ""));
      const name = el("input","tt-in tt-hname");
      name.type = "text"; name.value = h.name; name.maxLength = 40; name.placeholder = "Name";
      name.setAttribute("aria-label", "Holiday name");
      name.addEventListener("change", () => { h.name = name.value.trim() || "Holiday"; save(); paintHome(); });
      const from = dateIn(h.start, "First day");
      const to = dateIn(h.end, "Last day");
      const fix = () => {
        if (!from.value) return;
        h.start = from.value;
        h.end = to.value && to.value >= from.value ? to.value : from.value;
        save(); paintEditor(); paintHome();
      };
      from.addEventListener("change", fix);
      to.addEventListener("change", fix);
      const n = schoolDaysIn(h);
      const count = el("span","tt-count", n === 1 ? "1 day" : n + " days");
      const x = el("button","btn-ghost iconbtn","\u{1F5D1}");
      x.type = "button"; x.title = "Remove " + h.name;
      x.addEventListener("click", () => {
        const was = JSON.stringify(tt.holidays);
        tt.holidays = tt.holidays.filter(q => q.id !== h.id);
        /* a school holiday taken out on purpose is not offered straight back */
        if (!admin && school.some(q => holKey(q) === holKey(h))) tt.dismissed.push(holKey(h));
        save(); paintEditor(); paintHome();
        toast(h.name + " removed", { action:"Undo", onAction: () => {
          tt.holidays = JSON.parse(was);
          tt.dismissed = tt.dismissed.filter(k => k !== holKey(h));
          save(); paintEditor(); paintHome();
        } });
      });
      row.appendChild(name);
      row.appendChild(from);
      row.appendChild(el("span","tt-dash","to"));
      row.appendChild(to);
      row.appendChild(count);
      row.appendChild(x);
      list.appendChild(row);
    });
    s.appendChild(list);
    const tools = el("div","tt-row");
    const addBtn = el("button","btn-ghost bmini2","+ Add a holiday");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      const d = isoDay(new Date());
      tt.holidays.push({ id: newId("h"), name: "Holiday", start: d, end: d });
      save();
      paintEditor().then(() => {
        /* the new one sorts by its date, which is today, so find it that way */
        const fresh = Array.from($("ttBody").querySelectorAll(".tt-hname"))
          .find(r => r.value === "Holiday" && r.closest(".tt-line").querySelector(".tt-date").value === d);
        if (fresh){ fresh.focus(); fresh.select(); }
      });
    });
    tools.appendChild(addBtn);
    if (!admin){
      const back = el("button","btn-ghost bmini2","Use the school holidays instead");
      back.type = "button";
      back.addEventListener("click", () => {
        const was = { hols: JSON.stringify(tt.holidays), dis: JSON.stringify(tt.dismissed) };
        tt.holidayMode = "school";
        save(); paintEditor(); paintHome();
        toast("Using the school holidays", { action:"Undo", onAction: () => {
          tt.holidayMode = "own"; tt.holidays = JSON.parse(was.hols); tt.dismissed = JSON.parse(was.dis);
          save(); paintEditor(); paintHome();
        } });
      });
      tools.appendChild(back);
    }
    s.appendChild(tools);
    return s;
  }
  function dateIn(value, label){
    const i = el("input","tt-in tt-date");
    i.type = "date"; i.value = value || "";
    i.setAttribute("aria-label", label);
    return i;
  }

  /* ================= Home: the dashboard ================= */
  let paintNo = 0, clock = null;
  function greeting(){
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }
  function dashOn(){ return !OFFLINE && (!UI || UI.pref("homeDash")); }
  function clearHome(){
    const v = $("homeView");
    if (v) v.classList.remove("homedash");
    ["homeGreet","homeDash"].forEach(id => { const e = $(id); if (e) e.remove(); });
    clearInterval(clock); clock = null;
  }
  function holders(){
    const v = $("homeView");
    v.classList.add("homedash");
    let greet = $("homeGreet");
    if (!greet){
      greet = el("div","home-greet"); greet.id = "homeGreet";
      const head = v.querySelector(".viewhead") || v.querySelector("h2");
      if (head && head.nextSibling) v.insertBefore(greet, head.nextSibling); else v.appendChild(greet);
    }
    let dash = $("homeDash");
    if (!dash){ dash = el("div","classdash homedash-grid"); dash.id = "homeDash"; v.appendChild(dash); }
    return { greet, dash };
  }
  async function paintHome(){
    if (!dashOn()){ clearHome(); return; }
    const v = $("homeView");
    if (!v || v.hidden) return;
    const { greet, dash } = holders();
    const no = ++paintNo;
    const signedIn = typeof TOKEN !== "undefined" && !!TOKEN;
    const entry = document.body.classList.contains("entry-open");
    /* Behind the sign-in there is nobody to show anything for yet, so it is
       the shape of the dashboard and nothing more. */
    if (!signedIn || (entry && !dash.dataset.painted)){
      greet.innerHTML = "";
      greet.appendChild(el("h2","home-hello", greeting()));
      greet.appendChild(el("p","home-date", longDate(new Date())));
      dash.innerHTML = "";
      if (UI) dash.appendChild(UI.skeleton("tiles", 2));
      return;
    }
    if (entry) return;                     // keep what is there under the picker
    if (!dash.dataset.painted){ dash.innerHTML = ""; if (UI) dash.appendChild(UI.skeleton("tiles", 2)); }
    await load();
    if (no !== paintNo) return;
    paintGreet(greet);
    /* Today first, from the timetable alone, so the most useful panel is up
       before anything has been asked of the server. */
    dash.innerHTML = "";
    dash.dataset.painted = "1";
    /* Two panels side by side: the day's lessons on the left, and what the
       classes can see now on the right. */
    const today = panel(dash, "calendar", "Today");
    today.id = "dashToday";
    paintToday(today);
    const live = panel(dash, "eye", "Live now");
    live.appendChild(UI ? UI.skeleton("lines", 3) : waiting("Loading"));
    clearInterval(clock);
    clock = setInterval(() => {
      const t = $("dashToday");
      if (!t || $("homeView").hidden) return;
      paintToday(t);
      paintGreet($("homeGreet"));
    }, 60000);

    try{ await loadCatalogue(); }catch(e){}
    if (no !== paintNo) return;
    const mine = new Set(classList().map(n => String(n).toLowerCase()));
    const ours = (name) => !who() || mine.has(String(name || "").toLowerCase());
    paintLive(live, ours);
  }
  function panel(dash, icon, title){
    const p = el("section","dash-panel");
    const h = el("h3","dash-head");
    h.innerHTML = ic(icon, 18);
    h.appendChild(el("span","", title));
    p.appendChild(h);
    dash.appendChild(p);
    return p;
  }
  function count(p, n){
    const h = p.querySelector(".dash-head");
    let c = h.querySelector(".dash-count");
    if (!c){ c = el("span","dash-count"); h.appendChild(c); }
    c.textContent = String(n);
  }
  function body(p){
    Array.from(p.children).forEach(k => { if (!k.classList.contains("dash-head")) k.remove(); });
  }
  const btn = (words, cls, fn) => { const b = el("button", cls || "btn-ghost bmini2", words); b.type = "button"; b.addEventListener("click", fn); return b; };
  function row(p, words, sub, buttons, extra){
    const r = el("div","dash-row" + (extra ? " " + extra : ""));
    const t = el("div","dash-words");
    t.appendChild(el("b","", words));
    if (sub) t.appendChild(el("span","", sub));
    r.appendChild(t);
    (buttons || []).forEach(b => r.appendChild(b));
    p.appendChild(r);
    return r;
  }

  function paintGreet(greet){
    if (!greet || !tt) return;
    greet.innerHTML = "";
    const name = who() ? ((typeof teacherNames === "object" && teacherNames[who()]) || who()) : "";
    /* The greeting is the page's title; the date and the week sit under it
       as one line of the same quiet text. */
    greet.appendChild(el("h2","home-hello", greeting() + (name ? ", " + name : "")));
    const now = new Date();
    const plan = dayPlan(tt, now);
    const w = weekOf(tt, now);
    const bits = [longDate(now)];
    if (plan.kind === "holiday") bits.push(plan.holiday.name);
    else if (w === null) bits.push("Holiday week");
    else if (w) bits.push("Week " + w);
    greet.appendChild(el("p","home-date", bits.join("  \u00B7  ")));
  }

  /* ---------- today's lessons ---------- */
  function paintToday(p){
    body(p);
    const now = new Date();
    const head = p.querySelector(".dash-head span:not(.hi-wrap):not(.dash-count)");
    if (!hasLessons(tt)){
      if (head) head.textContent = "Today";
      p.appendChild(el("p","hint","Add your timetable and the classes you teach today will be here, in period order."));
      p.appendChild(btn("Set up your timetable", "btn-primary bmini2", open));
      return;
    }
    const plan = dayPlan(tt, now);
    const mins = now.getHours() * 60 + now.getMinutes();
    let list = plan.list, when = now, label = "Today";
    const done = plan.kind === "school" && list.length &&
                 list.every(x => toMins(x.end) !== null && toMins(x.end) <= mins);
    if (plan.kind !== "school" || !list.length || done){
      const why = plan.kind === "weekend" ? "No lessons today, it is the weekend."
                : plan.kind === "holiday" ? "No lessons today: " + plan.holiday.name + "."
                : done ? "That is everything for today."
                : "No lessons on your timetable today.";
      p.appendChild(el("p","hint dash-why", why));
      const next = nextSchoolDay(tt, now);
      if (!next){ if (head) head.textContent = "Today"; return; }
      when = next.date;
      list = next.plan.list;
      const tomorrow = isoDay(addDays(now, 1)) === isoDay(when);
      label = tomorrow ? "Tomorrow" : dayName(when);
      p.appendChild(el("p","dash-sub", "Next: " + (tomorrow ? "tomorrow" : longDate(when)) +
        (next.plan.week ? ", Week " + next.plan.week : "")));
      if (!list.length) p.appendChild(el("p","hint","Nothing on your timetable that day."));
    }
    if (head) head.textContent = label;
    list = withDoubles(list);
    count(p, list.filter(x => x.slot.cls).length);
    const isToday = when === now;
    let nextMarked = false;
    list.forEach(x => {
      const a = toMins(x.start), b = toMins(x.end);
      let state = "";
      if (isToday && a !== null && b !== null){
        if (mins >= b) state = "done";
        else if (mins >= a) state = "now";
        else if (!nextMarked){ state = "next"; nextMarked = true; }
      }
      const r = el("div","dash-row tt-lesson" + (state ? " " + state : ""));
      const time = el("div","tt-when");
      time.appendChild(el("b","", partsName(x.parts)));
      time.appendChild(el("span","", x.start || ""));
      r.appendChild(time);
      const t = el("div","dash-words");
      const title = el("b","", slotName(x.slot));
      if (state === "now") title.appendChild(el("span","home-chip now","Now"));
      if (state === "next") title.appendChild(el("span","home-chip next", a !== null ? "In " + until(a - mins) : "Next"));
      t.appendChild(title);
      const sub = [(x.start && x.end) ? x.start + "–" + x.end : "",
                   x.parts.length > 1 ? "Double" : "", x.late ? "Late lunch" : ""].filter(Boolean).join("  ·  ");
      if (sub) t.appendChild(el("span","", sub));
      r.appendChild(t);
      if (x.slot.cls) r.appendChild(btn("View class", "btn-ghost bmini2", () => openClass(x.slot.cls)));
      p.appendChild(r);
    });
  }
  function until(n){
    if (n < 60) return n + " min";
    const h = Math.floor(n / 60), m = n % 60;
    return h + " hr" + (m ? " " + m + " min" : "");
  }

  /* ---------- what is open to students now ---------- */
  const liveNow = (a) => {
    if (!a || !a.published) return false;
    const now = new Date().toISOString();
    if (a.release_at && a.release_at > now) return false;
    if (a.close_on && a.close_on < isoDay(new Date())) return false;
    return true;
  };
  function paintLive(p, ours){
    body(p);
    const live = (assigns || []).filter(a => ours(a.group_name) && liveNow(a));
    count(p, live.length);
    if (!live.length){ p.appendChild(el("p","hint","Nothing is open to your classes at the moment.")); return; }
    const byClass = new Map();
    live.forEach(a => {
      const k = a.group_name;
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k).push(a);
    });
    Array.from(byClass.keys()).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric:true })).slice(0, 8).forEach(g => {
      const list = byClass.get(g);
      const names = list.map(a => titleOf(a.lesson_id));
      /* Straight to the unit when everything open is in the one unit (and
         the one part of it); the class's own page when it is spread about. */
      const shelves = new Set(list.map(a => {
        const l = (cat.lessons || []).find(x => x.lesson_id === a.lesson_id) || {};
        return (l.unit || "") + "\u0000" + (l.subunit || "");
      }));
      const go = shelves.size === 1
        ? btn("View lessons", "btn-ghost bmini2", () => { const [u, part] = Array.from(shelves)[0].split("\u0000"); goToUnit(g, u, part); })
        : btn("View class", "btn-ghost bmini2", () => openClass(g));
      row(p, g, names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : ""), [go]);
    });
    if (byClass.size > 8) p.appendChild(el("p","hint","And " + (byClass.size - 8) + " more classes."));
  }

  /* A class's lessons in one unit, the way coming back to them after a
     refresh does: the class named, the catalogue there, then the unit and
     the part of it. */
  async function goToUnit(group, unitName, part){
    try{
      nameClass(group);
      await loadCatalogue();
      openUnit(unitName);
      if (part || partsOfUnit().length) openPart(part || "");
    }catch(e){ openClass(group); }
  }

  /* ================= the next lesson with a class ================= */
  /* When this teacher next has the class, from their own timetable: today's
     lesson if it has not finished yet, else the next school day that has one.
     null when the timetable has nothing for the class. */
  async function nextLessonFor(name){
    await load();
    const k = String(name || "").toLowerCase();
    if (!tt || !k) return null;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let i = 0; i < 70; i++){
      const d = addDays(today, i);
      const plan = dayPlan(tt, d);
      if (plan.kind !== "school") continue;
      for (const x of plan.list){
        if (String(x.slot.cls || "").toLowerCase() !== k) continue;
        const a = toMins(x.start), b = toMins(x.end);
        if (i === 0 && b !== null && b <= mins) continue;
        /* the period with this lesson's own times, so a late P4 says 12:55 */
        return { date: d, period: Object.assign({}, x.period, { start: x.start, end: x.end }), week: plan.week,
                 today: i === 0, now: i === 0 && a !== null && a <= mins,
                 tomorrow: i === 1 };
      }
    }
    return null;
  }

  /* ================= hooking in ================= */
  const baseShow = window.show;
  window.show = function(view){
    const out = baseShow.apply(this, arguments);
    if (view === "homeView" || view === "keyView" || view === "whoView") paintHome();
    return out;
  };
  window.addEventListener("hubui", (e) => {
    if (e.detail && e.detail.name === "homeDash"){ const d = $("homeDash"); if (d) delete d.dataset.painted; paintHome(); }
  });
  /* Whatever is on screen already, since the sign-in may have gone up first. */
  if ($("homeView") && !$("homeView").hidden) paintHome();

  window.timetable = { open, paintEditor, paintHome, load, nextLessonFor,
                       hasLessons: () => !!tt && hasLessons(tt),
                       weekOf: (d) => tt ? weekOf(tt, d || new Date()) : undefined,
                       _test: { normal, weekOf, holsOf, dayPlan, holidayWeek, nextSchoolDay, fromArbor, withDoubles } };
})();
