/* =====================================================================
   autograder.js, the checklist a student sees above their code.

   A teacher writes a list of checks in the lesson builder. Each one is a
   small object saying what to look for. This file runs them against
   whatever the student has written and reports pass or fail with a
   sentence saying what to try.

   The shape of a check follows CodeHS's TestCase idea, cut down to the
   things that are useful at KS3:

     { label, kind, ... }

   Python:
     codeHas      value          the code contains this text
     codeLacks    value          the code does not contain this text
     defines      value          def <value>( appears
     calls        value          <value>( appears
     uses         value          a for loop, while loop, if, input, list…
     outputHas    value          the printed output contains this
     outputIs     value          the printed output is exactly this
     lineCount    count          at least this many lines of real code

   Web:
     tag          selector,count      that many of a tag exist
     classOrId    selector            .thing or #thing exists
     attr         selector,attr,value an attribute is set (and matches)
     contentHas   value               the page text contains this
     cssHas       selector,property,value  a rule sets that property
     fileHas      file,value          a named file contains this

   Nothing here touches the network, and a broken check never stops the
   student working, it reports itself as needing the teacher's attention.
   ===================================================================== */
(function(){
  "use strict";

  const pass = (label) => ({ label, ok:true,  note:"" });
  const fail = (label, note) => ({ label, ok:false, note: note || "" });
  /* An unusable check is the teacher's problem, not the student's, so it
     is shown differently rather than as work they got wrong. */
  const broken = (label, why) => ({ label, ok:false, broken:true, note: why });

  /* ---------- Python ---------- */

  /* Comments and blank lines are not what a check is about. */
  function realCode(code){
    return String(code || "")
      .split("\n")
      .map(l => l.replace(/#.*$/, "").trimEnd())
      .filter(l => l.trim() !== "")
      .join("\n");
  }

  /* A condition that assigns rather than compares is a mistake, not an if
     statement. "if x = 5:" does not run, so it should not tick anything off. */
  function conditionLooksRight(line){
    const cond = (line.split(":")[0] || "").replace(/^\s*(if|elif|while)\b/, "");
    /* strip the comparisons that legitimately contain = */
    const rest = cond.replace(/[=!<>]=|<|>/g, "");
    return !/=/.test(rest);
  }
  /* Looks for a keyword on a line that is actually written correctly. */
  function soundLine(code, word){
    return code.split("\n").some(line => {
      const re = new RegExp("^\\s*" + word + "\\b");
      if (!re.test(line)) return false;
      if (!/:\s*$/.test(line.trimEnd()) && !/:/.test(line)) return false;
      return conditionLooksRight(line);
    });
  }

  const PY_PATTERNS = {
    "for loop":    /\bfor\s+\w+\s+in\b.*:/,
    "while loop":  (code) => soundLine(code, "while"),
    "if":          (code) => soundLine(code, "if"),
    "else":        /\belse\s*:/,
    "elif":        (code) => soundLine(code, "elif"),
    "input":       /\binput\s*\(/,
    "print":       /\bprint\s*\(/,
    "list":        /=\s*\[|\.append\s*\(/,
    "function":    /\bdef\s+\w+\s*\(/,
    "variable":    /^\s*\w+\s*=[^=]/m,
    "comment":     /#/,
    "random":      /\brandom\b/,
    "turtle":      /\bturtle\b|\bforward\s*\(|\bpenup\s*\(/
  };

  /* ---------- extra conditions on a check ----------
     A check can carry more conditions after the first, joined with and/or, so
     one line of a checklist can ask for something a single rule cannot say.

     Each one can be told where to look. "Everywhere" is the whole program;
     "in what was just found" is only the lines the condition before it matched,
     which is what makes "uses an input, and that input mentions food" possible
     rather than "uses an input somewhere and mentions food somewhere else".

     Read strictly left to right with no precedence, so "A and B or C" means
     "(A and B) or C". Anything cleverer would be a query language, and a
     teacher writing a checklist should not have to think about brackets. */
  const EXTRA_KINDS = { codeHas:1, codeLacks:1, outputHas:1 };

  /* The lines of some text that contain a phrase, which is what a later
     condition looks inside when it is scoped to what was found. */
  function linesWith(text, needle, cased){
    const n = String(needle || "");
    if (!n) return "";
    return String(text || "").split("\n").filter(l => has(l, n, cased)).join("\n");
  }

  /* One extra condition, against whatever text it has been given. */
  function extraHolds(cond, text, out, cased){
    const v = String(cond.value || "");
    if (!v) return { ok:false, why:"one of the extra conditions has nothing to look for" };
    const c = cond.caseSensitive === true || cased;
    if (cond.kind === "codeLacks")
      return { ok: !has(text, v, c), why:"it still includes “" + v + "”" };
    if (cond.kind === "outputHas")
      return { ok: has(out, v, c), why:"the output does not include “" + v + "”" };
    /* codeHas, and anything unrecognised, reads as "contains" */
    return { ok: has(text, v, c), why:"it does not include “" + v + "”" };
  }

  /* Walks the chain and folds the answer of the first condition together with
     the rest. `found` is what the first condition matched, so a scoped
     condition has something to look inside. */
  function withExtras(check, first, opts){
    const more = Array.isArray(check.more) ? check.more.filter(m => m && m.value) : [];
    if (!more.length || !first || first.broken) return first;
    const cased = check.caseSensitive === true;
    const label = check.label || "Check";
    let ok = !!first.ok;
    let found = opts.found || "";
    let why = "";
    more.forEach(m => {
      if (!EXTRA_KINDS[m.kind]) m = Object.assign({}, m, { kind:"codeHas" });
      const where = (m.scope === "match") ? found : opts.code;
      const r = extraHolds(m, where, opts.output, cased);
      if (!r.ok && !why) why = r.why;
      ok = (m.join === "or") ? (ok || r.ok) : (ok && r.ok);
      /* what this condition matched becomes the place the next one can look */
      if (r.ok && m.kind !== "codeLacks") found = linesWith(where, m.value, cased);
    });
    if (ok) return pass(label);
    return fail(label, first.ok
      ? ("Nearly: " + (why || "one of the other conditions is not met yet") + ".")
      : first.note);
  }

  function checkPythonOne(check, code, output, runs){
    const label = check.label || "Check";
    const bare = realCode(code);
    const value = String(check.value || "");
    const out = String(output == null ? "" : output);
    const cased = check.caseSensitive === true;

    switch (check.kind){
      case "codeHas":
        if (!value) return broken(label, "This check has nothing to look for.");
        return has(bare, value, cased) ? pass(label)
          : fail(label, "Your code does not include “" + value + "” yet.");

      case "codeLacks":
        if (!value) return broken(label, "This check has nothing to look for.");
        return !has(bare, value, cased) ? pass(label)
          : fail(label, "Try doing this without “" + value + "”.");

      case "defines": {
        if (!value) return broken(label, "This check does not say which function.");
        const re = new RegExp("\\bdef\\s+" + value.replace(/[^\w]/g, "") + "\\s*\\(", cased ? "" : "i");
        return re.test(bare) ? pass(label)
          : fail(label, "Write a function called " + value + ".");
      }

      case "calls": {
        if (!value) return broken(label, "This check does not say what to call.");
        const name = value.replace(/[^\w]/g, "");
        const called = new RegExp("(?<!def\\s)\\b" + name + "\\s*\\(", cased ? "" : "i").test(bare);
        return called ? pass(label) : fail(label, "Nothing calls " + value + " yet.");
      }

      case "uses": {
        /* No choice made in the builder means the first one, rather than a
           check that can never pass. */
        const which = String(value || "for loop").toLowerCase();
        const test = PY_PATTERNS[which];
        if (!test) return broken(label, "Unknown thing to look for: " + which);
        const found = typeof test === "function" ? test(bare) : test.test(bare);
        if (found) return pass(label);
        /* say so when the right word is there but written wrongly */
        const nearly = new RegExp("\\b" + which.split(" ")[0] + "\\b").test(bare);
        return fail(label, nearly
          ? "There is a " + which + " there, but it is not quite right yet."
          : "Your code does not use a " + which + " yet.");
      }

      case "outputHas":
        if (!out.trim()) return fail(label, "Run your code first.");
        return has(out, value, cased) ? pass(label)
          : fail(label, "Your output does not include \u201c" + value + "\u201d.");

      case "outputIs": {
        if (!out.trim()) return fail(label, "Run your code first.");
        const tidy = (t) => t.replace(/\r/g, "").trim().replace(/[ \t]+$/gm, "");
        return same(tidy(out), tidy(value), cased) ? pass(label)
          : fail(label, "Your output is not quite right yet.");
      }

      /* Counted rather than looked for in the code: the point of it is to get
         them to press Run, which nothing about the text of their program can
         show. One run is the useful case, as a plain "have a go" tick. */
      case "runCount": {
        const want = Math.max(1, parseInt(check.count, 10) || 1);
        const got = Math.max(0, parseInt(runs, 10) || 0);
        if (got >= want) return pass(label);
        return fail(label, got === 0
          ? (want === 1 ? "Press Run to try your code."
                        : "Press Run to try your code, " + want + " times in all.")
          : "Run it again: " + got + " of " + want + " so far.");
      }

      case "lineCount": {
        const want = parseInt(check.count, 10) || 1;
        const got = bare.split("\n").filter(l => l.trim()).length;
        return got >= want ? pass(label)
          : fail(label, "Only " + got + " line" + (got === 1 ? "" : "s") + " so far, " + want + " are needed.");
      }

      default:
        return broken(label, "Unknown kind of check: " + check.kind);
    }
  }

  /* A teacher can write their own words for a line the student has not met
     yet, in place of the wording built in here. Only for a plain miss: a
     "broken" result means the check itself is set up wrong, and hiding that
     behind a friendly sentence would leave a lesson quietly not working. */
  function ownWords(check, res){
    if (!res || res.ok || res.broken) return res;
    const own = String((check && check.hint) || "").trim();
    if (own) res.note = own;
    return res;
  }

  window.runPythonChecks = function(checks, code, output, runs){
    return (checks || []).map(c => {
      if (c && c.manual === true) return { ok:false, manual:true, label:c.label || "Check" };
      try{
        const bare = realCode(code);
        const first = checkPythonOne(c, code, output, runs);
        const joined = withExtras(c, first, {
          code: bare, output: String(output == null ? "" : output),
          found: linesWith(bare, c.value, c.caseSensitive === true)
        });
        return ownWords(c, joined);
      }
      catch(e){ return broken(c.label || "Check", "This check could not run."); }
    });
  };

  /* ---------- HTML, CSS and JavaScript ---------- */

  /* The three files become one page, so a check can look at the whole
     thing the way a browser would. */
  function parsePage(files){
    const html = String((files && files.html) || "");
    const doc = new DOMParser().parseFromString(
      /<html[\s>]/i.test(html) ? html : "<!DOCTYPE html><html><body>" + html + "</body></html>",
      "text/html");
    return doc;
  }

  function checkWebOne(check, files, runs){
    const label = check.label || "Check";
    const doc = parsePage(files);
    const css = String((files && files.css) || "");
    const js = String((files && files.js) || "");
    const value = String(check.value || "");
    const selector = String(check.selector || "").trim();
    const want = parseInt(check.count, 10) || 1;

    const cased = check.caseSensitive === true;

    switch (check.kind){
      case "runCount": {
        const want = Math.max(1, parseInt(check.count, 10) || 1);
        const got = Math.max(0, parseInt(runs, 10) || 0);
        if (got >= want) return pass(label);
        return fail(label, got === 0 ? "Press Run to see your page."
                                     : "Run it again: " + got + " of " + want + " so far.");
      }

      case "tag": {
        if (!selector) return broken(label, "This check does not say which tag.");
        let found;
        try{ found = doc.querySelectorAll(selector.replace(/[^\w-]/g, "")); }
        catch(e){ return broken(label, "That tag name cannot be searched for."); }
        return found.length >= want ? pass(label)
          : fail(label, found.length
              ? "Found " + found.length + ", " + want + " are needed."
              : "There is no <" + selector + "> yet.");
      }

      case "classOrId": {
        if (!/^[.#]/.test(selector))
          return broken(label, "Start with . for a class or # for an id.");
        let found;
        try{ found = doc.querySelectorAll(selector); }
        catch(e){ return broken(label, "That selector cannot be searched for."); }
        return found.length >= want ? pass(label)
          : fail(label, "Nothing has " + selector + " yet.");
      }

      case "attr": {
        if (!selector) return broken(label, "This check does not say which element.");
        const attr = String(check.attr || "").trim();
        if (!attr) return broken(label, "This check does not say which attribute.");
        let found;
        try{ found = Array.from(doc.querySelectorAll(selector)); }
        catch(e){ return broken(label, "That selector cannot be searched for."); }
        const withAttr = found.filter(n => n.hasAttribute(attr));
        if (!withAttr.length)
          return fail(label, "No " + selector + " has a " + attr + " yet.");
        if (!value) return pass(label);
        const matching = withAttr.filter(n => has(n.getAttribute(attr) || "", value, cased));
        return matching.length ? pass(label)
          : fail(label, "The " + attr + " is set, but not to “" + value + "”.");
      }

      case "contentHas": {
        if (!value) return broken(label, "This check has nothing to look for.");
        const text = (doc.body ? doc.body.textContent : "") || "";
        return has(text, value, cased) ? pass(label)
          : fail(label, "The page does not show \u201c" + value + "\u201d yet.");
      }

      case "cssHas": {
        const prop = String(check.property || "").trim();
        if (!selector || !prop) return broken(label, "This check needs a selector and a property.");
        /* find the block for that selector, then the property inside it */
        const blocks = css.split("}");
        const block = blocks.find(b => {
          const head = b.split("{")[0] || "";
          return head.split(",").map(x => x.trim()).includes(selector);
        });
        if (!block) return fail(label, "There is no rule for " + selector + " yet.");
        const body = block.split("{")[1] || "";
        const line = new RegExp("(?:^|;)\\s*" + prop.replace(/[^\w-]/g, "") + "\\s*:\\s*([^;]+)").exec(body);
        if (!line) return fail(label, selector + " does not set " + prop + " yet.");
        if (!value) return pass(label);
        return has(line[1].trim(), value, cased) ? pass(label)
          : fail(label, prop + " is set, but not to “" + value + "”.");
      }

      case "fileHas": {
        const which = String(check.file || "html").toLowerCase();
        const text = which === "css" ? css : which === "js" ? js : String((files && files.html) || "");
        if (!value) return broken(label, "This check has nothing to look for.");
        return has(text, value, cased) ? pass(label)
          : fail(label, "Your " + which.toUpperCase() + " does not include “" + value + "” yet.");
      }

      default:
        return broken(label, "Unknown kind of check: " + check.kind);
    }
  }

  window.runWebChecks = function(checks, files, runs){
    return (checks || []).map(c => {
      if (c && c.manual === true) return { ok:false, manual:true, label:c.label || "Check" };
      try{
        const all = [ (files && files.html) || "", (files && files.css) || "",
                      (files && files.js) || "" ].join("\n");
        const first = checkWebOne(c, files, runs);
        const joined = withExtras(c, first, {
          code: all, output: all,
          found: linesWith(all, c.value, c.caseSensitive === true)
        });
        return ownWords(c, joined);
      }
      catch(e){ return broken(c.label || "Check", "This check could not run."); }
    });
  };

  /* ---------- what the student sees ---------- */

  /* Case is ignored unless a teacher deliberately asks for it. A student who
     writes Print where the check says print has usually made a different
     mistake from the one the check is about, and marking it wrong teaches
     nothing. Each check carries its own caseSensitive flag. */
  function has(hay, needle, cased){
    const h = String(hay == null ? "" : hay), n = String(needle == null ? "" : needle);
    return cased ? h.includes(n) : h.toLowerCase().includes(n.toLowerCase());
  }
  function same(a, b, cased){
    const x = String(a == null ? "" : a), y = String(b == null ? "" : b);
    return cased ? x === y : x.toLowerCase() === y.toLowerCase();
  }

  window.buildChecklist = function(checks){
    const all = checks || [];
    const isManual = (c) => c && c.manual === true;
    const autoCount = all.filter(c => !isManual(c)).length;
    const manualCount = all.filter(isManual).length;
    const mixed = autoCount > 0 && manualCount > 0;

    const wrap = document.createElement("div");
    wrap.className = "checklist";
    const head = document.createElement("div");
    head.className = "checklist-head";
    const title = document.createElement("b");
    title.textContent = "What this task needs";
    head.appendChild(title);
    const score = document.createElement("span");
    score.className = "checklist-score";
    head.appendChild(score);
    wrap.appendChild(head);

    /* Two columns only when there is something in both: the checks the page can
       do on its own down the left, the ones a teacher has to look at down the
       right. With only one kind there is nothing to compare it against, so it
       takes the whole width. */
    const body = document.createElement("div");
    body.className = "checklist-body" + (mixed ? " split" : "");
    wrap.appendChild(body);

    function column(kind, note){
      const col = document.createElement("div");
      col.className = "checklist-col " + kind;
      if (note){
        const p = document.createElement("p");
        p.className = "checklist-note";
        p.textContent = note;
        col.appendChild(p);
      }
      const ul = document.createElement("ul");
      ul.className = "checklist-items";
      col.appendChild(ul);
      body.appendChild(col);
      return ul;
    }
    const autoList = autoCount ? column("auto", null) : null;
    const manualList = manualCount
      ? column("manual", "Your teacher will check " + (manualCount === 1 ? "this one" : "these") + " after the lesson.")
      : null;

    /* Kept in the order they were written, so results line up by position. */
    const items = [];
    all.forEach(c => {
      const li = document.createElement("li");
      li.className = "check" + (isManual(c) ? " check-manual" : "");
      const mark = document.createElement("span");
      mark.className = "check-mark";
      mark.textContent = "○";
      const text = document.createElement("span");
      text.className = "check-text";
      text.textContent = c.label || "Check";
      const note = document.createElement("span");
      note.className = "check-note";
      li.appendChild(mark); li.appendChild(text); li.appendChild(note);
      (isManual(c) ? manualList : autoList).appendChild(li);
      items.push({ li, mark, note, manual: isManual(c) });
    });

    /* A teacher looking at the work can tick these; a student cannot. */
    let manualOn = false;
    items.forEach((it, i) => {
      if (!it.manual) return;
      it.li.addEventListener("click", () => {
        if (!manualOn) return;
        const now = it.li.dataset.state === "yes";
        it.li.dataset.state = now ? "" : "yes";
        it.mark.textContent = now ? "○" : "✓";
        tally();
        if (typeof wrap.onManual === "function") wrap.onManual(wrap.getManual());
      });
    });

    function tally(){
      let done = 0, counted = 0;
      items.forEach(it => {
        counted++;
        if (it.li.dataset.state === "yes") done++;
      });
      score.textContent = done + " of " + counted;
      wrap.dataset.allDone = done === counted ? "yes" : "no";
      return done === counted;
    }

    /* called with the results of running the checks */
    wrap.show = function(results){
      (results || []).forEach((r, i) => {
        const it = items[i];
        if (!it || it.manual) return;         // a teacher's tick is not overwritten
        it.li.dataset.state = r.broken ? "broken" : r.ok ? "yes" : "no";
        it.mark.textContent = r.broken ? "!" : r.ok ? "✓" : "○";
        it.note.textContent = r.note || "";
      });
      return tally();
    };
    wrap.reset = function(){
      items.forEach(it => {
        if (it.manual) return;
        it.li.dataset.state = "";
        it.mark.textContent = "○";
        it.note.textContent = "";
      });
      tally();
    };
    /* Which of the teacher-checked lines are ticked, by position in the whole
       list, so they can be saved with the work and put back later. */
    wrap.getManual = function(){
      const out = {};
      items.forEach((it, i) => { if (it.manual && it.li.dataset.state === "yes") out[i] = true; });
      return out;
    };
    wrap.setManual = function(flags){
      if (!flags) return;
      items.forEach((it, i) => {
        if (!it.manual) return;
        const on = !!flags[i];
        it.li.dataset.state = on ? "yes" : "";
        it.mark.textContent = on ? "✓" : "○";
      });
      tally();
    };
    wrap.allowManual = function(on){
      manualOn = !!on;
      wrap.classList.toggle("can-tick", manualOn);
      items.forEach(it => { if (it.manual) it.li.title = manualOn ? "Click to tick this off" : ""; });
    };
    /* Only the automatic lines can be finished by the student, so only those
       decide whether they are nudged about it. */
    wrap.autoAllDone = function(){
      return items.every(it => it.manual || it.li.dataset.state === "yes");
    };
    tally();
    return wrap;
  };
})();
