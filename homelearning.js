/* =====================================================================
   homelearning.js: home learning, as a student does it.

   It used to be sat on an assessment's questions page: the same cards, the
   same bar of numbers up the left, the same red flags on the way out. A
   student who has had a test on Monday should not open Thursday's home
   learning and think it is another one, so nothing here is shared with that
   screen any more, down to the words. It still holds every kind of task an
   assessment does, still marks them when it is handed in, and the marks are
   still worked out where they always were (computeAssessment in lesson.html).

   What it looks like instead: one page of tasks, each with a coloured strip
   along its top saying what sort of task it is and whether it is done, and a
   row of stepping stones that stays at the top of the page. With one task
   there are no stones and no number, because there is nothing to count.

   Loaded before lesson.html's own script, and everything in it is called
   once that has run, so it uses lesson.html's functions by name.
   ===================================================================== */
"use strict";

/* Null unless this lesson is home learning being done on its page.
   { el, items, now, flag, strip, shown }
   items: { step, block, num, item, built, head, chip } one for each task */
var homePage = null;

/* Every page of it on one page, and not where every step is laid out one by
   one instead: a PDF, or All pages on the marking screen. */
function homeLayout(){
  return homeworkView() && pdfParam === null && allParam === null;
}

/* The pages' own sections are moved here whole rather than their tasks being
   lifted out: the section is what holds a page's extension tasks and shows
   them, and it has to stay itself for any of that to go on working. */
function arrangeHomework(){
  document.body.classList.add("home-learning");
  /* Back to the list this came from, not the Lessons one it is not in. */
  const way = $("homeLink");
  if (way && !spectate) way.href = "index.html?tab=homework";
  const page = el("section","home-page");
  const items = [];
  /* The name of a page only helps where there is another page to tell it from. */
  const named = steps.length > 1;
  const addTask = (i, block, item, built) => {
    const it = { step: i, block, num: items.length + 1, item, built, head: null, chip: null };
    items.push(it);
    questionNo[block.id] = it.num;      // the marked work numbers them the same
    item.classList.add("hl-task");
  };
  steps.forEach((st, i) => {
    const b = (lesson.blocks || []).find(x => x.id === st.qid);
    if (!b) return;
    st.section.hidden = false;
    /* An older lesson can have tasks with no page round them. */
    if (b.type !== "page"){
      const bb = briefOf(st, true);
      const item = el("div","pg-item");
      item.dataset.blockId = b.id;
      if (b.type !== "picture"){
        if (bb.title) item.appendChild(el("h3","pg-h", bb.title));
        if (bb.text) item.appendChild(el("p","pg-t", bb.text));
      }
      item.appendChild(st.section);
      page.appendChild(item);
      if (ASSESS_READING.includes(b.type)) item.classList.add("hl-read");
      else addTask(i, b, item, st);
      return;
    }
    if (named && b.title) st.section.insertBefore(tel("h2","hl-part", b.title), st.section.firstChild);
    page.appendChild(st.section);
    (st.taskItems || []).forEach(entry => {
      if (ASSESS_READING.includes(entry.type)) entry.item.classList.add("hl-read");
      else addTask(i, entry.block, entry.item, entry.built);
    });
  });

  homePage = { el: page, items, now: items[0] || null, flag: false, strip: null, shown: false };
  const single = items.length === 1;
  items.forEach(it => {
    const head = el("div","hl-head");
    const icon = el("span","hl-icon", taskIcon(it.block.type));
    head.appendChild(icon);
    head.appendChild(tel("b","hl-name", single ? taskLook(it.block.type).name : "Task " + it.num));
    it.pill = tel("span","hl-pill","");
    head.appendChild(it.pill);
    it.item.insertBefore(head, it.item.firstChild);
    it.head = head;
  });
  if (!single && items.length){
    page.classList.add("has-strip");
    const strip = el("nav","hl-strip no-print");
    strip.setAttribute("aria-label","Tasks");
    homePage.said = tel("span","hl-said","");
    homePage.said.setAttribute("role","status");
    strip.appendChild(homePage.said);
    const row = el("div","hl-chips");
    items.forEach(it => {
      const chip = el("button","hl-chip");
      chip.type = "button";
      chip.appendChild(tel("span","hl-chip-n", String(it.num)));
      chip.addEventListener("click", () => { if (!finished || spectate) homeGoTo(it, true); });
      row.appendChild(chip);
      it.chip = chip;
    });
    strip.appendChild(row);
    page.insertBefore(strip, page.firstChild);
    homePage.strip = strip;
  }
  if (items.length && items.every(it => it.block.type === "revise")) document.body.classList.add("rv-only");
  /* Where the work ends, so nobody scrolls to the bottom of a long one and
     wonders whether that was all of it. */
  if (!single){
    const end = el("div","hl-end");
    end.appendChild(tel("p","", "That is everything. When you are happy with it, hand it in."));
    page.appendChild(end);
  }
  steps.forEach(st => organiserBeside(st));
  page.hidden = true;
  $("blocks").appendChild(page);

  /* Which task is in view, worked out as they scroll, once a frame. The page
     scrolls like any other: a turn of the wheel is not a question here. */
  let queued = false;
  $("stage").addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; noteHomeInView(); });
  }, { passive: true });
}

function showHomeScreen(i){
  const H = homePage;
  steps.forEach(st => { st.section.hidden = false; });
  H.el.hidden = false;
  steps.forEach(st => { try{ if (st.onShow) st.onShow(); }catch(e){} });
  try{ tuneColours(); }catch(e){}

  const note = $("resumeNote");
  if (note) note.hidden = true;
  if (note && restoredWork && !resumeShown && !wasDone){
    note.hidden = false;
    resumeShown = true;
    setTimeout(() => {
      note.classList.add("fading");
      setTimeout(() => { note.hidden = true; note.classList.remove("fading"); }, 3000);
    }, 5000);
  }

  const revision = document.body.classList.contains("rv-only");
  $("briefTitle").textContent = revision ? "Make your revision resource" : "Home learning";
  $("briefText").textContent = revision ? "Press Hand in when you are done, then test yourself with it."
    : H.items.length === 1 ? "Do the task, then press Hand in."
    : "Work through the tasks, then press Hand in.";
  $("briefTitle").hidden = false;
  $("briefText").hidden = false;
  $("brief").hidden = false;

  $("backBtn").hidden = true;
  $("nextBtn").textContent = workFrozen ? "STAR Feedback" : "Hand in";

  /* A page further in is asked for by a teacher reading the work, and by a
     student coming back to where they were. */
  $("stage").scrollTop = 0;
  const it = H.items.find(x => x.step === i) || H.items[0];
  H.now = it || null;
  step = it ? it.step : 0;
  H.shown = true;
  if (it && it !== H.items[0]) $("stage").scrollTop = homeTop(it);
  paintTracker();
  paintRubricButton();
  paintRail();
  refreshGate();
}
/* How far down the page a task starts, clear of the stones stuck above it. */
function homeTop(it){
  const stage = $("stage");
  const over = homePage.strip ? homePage.strip.offsetHeight + 8 : 0;
  return Math.max(0, it.item.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop - over - 8);
}
function homeGoTo(it, flash){
  homePage.pinned = Date.now() + 900;      // passing the others on the way is not being at them
  homePage.now = it;
  step = it.step;
  paintTracker();
  glideStage(homeTop(it));
  if (flash){
    it.item.classList.add("justopened");
    setTimeout(() => it.item.classList.remove("justopened"), 1800);
  }
}
function noteHomeInView(){
  const H = homePage;
  if (!H || H.el.hidden || !H.items.length || Date.now() < (H.pinned || 0)) return;
  const stage = $("stage"), box = stage.getBoundingClientRect();
  const line = box.top + Math.min(200, box.height * 0.4);
  let cur = H.items[0];
  H.items.forEach(it => { if (it.item.getBoundingClientRect().top <= line) cur = it; });
  /* at the very bottom the last task may never reach the line */
  if (stage.scrollTop > 0 && stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 4) cur = H.items[H.items.length - 1];
  if (cur !== H.now){ H.now = cur; step = cur.step; paintTracker(); }
}

function paintHomeTracker(){
  const H = homePage;
  let done = 0;
  H.items.forEach(it => {
    const has = questionAnswered(it);
    if (has) done++;
    /* Amber, and only once they have tried to hand in. Nothing at home is
       marked wrong before it has been looked at. */
    const missed = !has && H.flag;
    const was = it.was;
    it.was = has;
    it.item.classList.toggle("is-done", has);
    it.item.classList.toggle("is-missed", missed);
    it.pill.textContent = has ? "✓ Done" : missed ? "Not done yet" : "To do";
    if (has && was === false && window.hubMotion) window.hubMotion.pop(it.pill);
    if (!it.chip) return;
    it.chip.className = "hl-chip" + (has ? " done" : "") + (missed ? " missed" : "") + (it === H.now ? " now" : "");
    if (has && was === false && window.hubMotion) window.hubMotion.pop(it.chip);
    const words = "Task " + it.num + ", " + taskLook(it.block.type).name + (has ? ", done" : ", not done yet");
    it.chip.title = words;
    it.chip.setAttribute("aria-label", words);
    if (it === H.now) it.chip.setAttribute("aria-current", "step"); else it.chip.removeAttribute("aria-current");
  });
  /* The organiser's button is for the task beside it, and not while another
     one is being done. */
  if (H.items.length > 1) H.el.querySelectorAll(".rv-beside").forEach(pg => pg.classList.toggle("rv-away", !(H.now && pg.contains(H.now.item))));
  if (H.said) H.said.textContent = done === H.items.length ? "All done!" : done + " of " + H.items.length + " done";
  if (H.strip && H.now && H.now.chip && H.strip.offsetParent) keepChipInView(H.now.chip);
}
/* Along its own row only. scrollIntoView would move the page as well, and
   this is called while the page is being scrolled. */
function keepChipInView(chip){
  const row = chip.parentNode;
  const left = chip.offsetLeft - row.offsetLeft, right = left + chip.offsetWidth;
  if (left < row.scrollLeft + 8) row.scrollLeft = Math.max(0, left - 40);
  else if (right > row.scrollLeft + row.clientWidth - 8) row.scrollLeft = right - row.clientWidth + 40;
}

/* ---------- handing it in ----------
   Never held up, and not asked "are you sure": done alone at home, one
   question is plenty, and there is none at all when everything is done.
   Where something is not, it says what, in a list they can press, rather
   than sending them to hunt for it. */
function askToHandInHome(){
  const H = homePage;
  const missing = H.items.filter(it => !questionAnswered(it));
  if (!missing.length){ finishLesson(); return; }
  H.flag = true;
  paintTracker();
  if (H.items.length === 1){
    const it = H.items[0];
    const revise = it.block.type === "revise";
    const kind = revise && it.built && fields[it.block.id] ? fields[it.block.id].get().kind : "";
    handInModal({
      title: revise ? "You have not made anything yet" : "You have not done this yet",
      text: !revise ? "Have a go at it before you hand it in."
        : kind === "cards" ? "A flashcard counts once it has something on the front and the back."
        : kind === "quiz" ? "A question counts once it has an answer too."
        : kind === "mindmap" ? "Add a branch with something written in it."
        : kind === "poster" ? "Add something to your poster first."
        : kind === "photo" ? "Take a photo of your work, or make something here instead."
        : "Choose what you would like to make to get started.",
      yes: { label: "Go back to it", act: () => homeGoTo(it, true) },
      no:  { label: "Hand it in anyway", act: finishLesson },
      focus: "yes"
    });
    return;
  }
  const list = el("div","hl-missing");
  let shut = () => {};
  missing.forEach(it => {
    const b = el("button","hl-missing-one");
    b.type = "button";
    b.appendChild(el("span","hl-icon", taskIcon(it.block.type)));
    b.appendChild(tel("b","", "Task " + it.num));
    b.appendChild(tel("span","hl-missing-what", homeTaskSaid(it)));
    b.addEventListener("click", () => { shut(); homeGoTo(it, true); });
    list.appendChild(b);
  });
  handInModal({
    title: missing.length === H.items.length ? "You have not started yet"
         : missing.length === 1 ? "One task is not done yet" : missing.length + " tasks are not done yet",
    text: "Press one to go to it.",
    extra: list,
    opened: (close) => { shut = close; },
    yes: { label: "Go back and finish", act: () => homeGoTo(missing[0], true) },
    no:  { label: "Hand it in anyway", act: finishLesson },
    focus: "yes"
  });
}
/* A few words of a task, to know it by in a list. */
function homeTaskSaid(it){
  const b = it.block;
  const said = stripTags(String(b.title || b.heading || b.prompt || b.q || b.question || b.task || "")).replace(/\s+/g, " ").trim();
  return said ? (said.length > 60 ? said.slice(0, 58) + "…" : said) : taskLook(b.type).name;
}
