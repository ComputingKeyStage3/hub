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

  function checkPythonOne(check, code, output){
    const label = check.label || "Check";
    const bare = realCode(code);
    const value = String(check.value || "");
    const out = String(output == null ? "" : output);
    const cased = check.caseSensitive === true;

    switch (check.kind){
      case "codeHas":
        if (!value) return broken(label, "This check has nothing to look for.");
        return has(bare, value, cased) ? pass(label)
          : fail(label, "Your code does not use " + value + " yet.");

      case "codeLacks":
        if (!value) return broken(label, "This check has nothing to look for.");
        return !has(bare, value, cased) ? pass(label)
          : fail(label, "Try doing this without " + value + ".");

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

  window.runPythonChecks = function(checks, code, output){
    return (checks || []).map(c => {
      try{ return checkPythonOne(c, code, output); }
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

  function checkWebOne(check, files){
    const label = check.label || "Check";
    const doc = parsePage(files);
    const css = String((files && files.css) || "");
    const js = String((files && files.js) || "");
    const value = String(check.value || "");
    const selector = String(check.selector || "").trim();
    const want = parseInt(check.count, 10) || 1;

    const cased = check.caseSensitive === true;

    switch (check.kind){
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
          : fail(label, "The " + attr + " is set, but not to " + value + ".");
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
          : fail(label, prop + " is set, but not to " + value + ".");
      }

      case "fileHas": {
        const which = String(check.file || "html").toLowerCase();
        const text = which === "css" ? css : which === "js" ? js : String((files && files.html) || "");
        if (!value) return broken(label, "This check has nothing to look for.");
        return has(text, value, cased) ? pass(label)
          : fail(label, "Your " + which.toUpperCase() + " does not include " + value + " yet.");
      }

      default:
        return broken(label, "Unknown kind of check: " + check.kind);
    }
  }

  window.runWebChecks = function(checks, files){
    return (checks || []).map(c => {
      try{ return checkWebOne(c, files); }
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

    const list = document.createElement("ul");
    list.className = "checklist-items";
    wrap.appendChild(list);

    (checks || []).forEach(c => {
      const li = document.createElement("li");
      li.className = "check";
      const mark = document.createElement("span");
      mark.className = "check-mark";
      mark.textContent = "\u25CB";
      const text = document.createElement("span");
      text.className = "check-text";
      text.textContent = c.label || "Check";
      const note = document.createElement("span");
      note.className = "check-note";
      li.appendChild(mark); li.appendChild(text); li.appendChild(note);
      list.appendChild(li);
    });

    /* called with the results of running the checks */
    wrap.show = function(results){
      const items = list.querySelectorAll(".check");
      let done = 0;
      results.forEach((r, i) => {
        const li = items[i];
        if (!li) return;
        li.dataset.state = r.broken ? "broken" : r.ok ? "yes" : "no";
        li.querySelector(".check-mark").textContent =
          r.broken ? "!" : r.ok ? "\u2713" : "\u25CB";
        li.querySelector(".check-note").textContent = r.note || "";
        if (r.ok) done++;
      });
      score.textContent = done + " of " + results.length;
      wrap.dataset.allDone = done === results.length ? "yes" : "no";
      return done === results.length;
    };
    wrap.reset = function(){
      list.querySelectorAll(".check").forEach(li => {
        li.dataset.state = "";
        li.querySelector(".check-mark").textContent = "\u25CB";
        li.querySelector(".check-note").textContent = "";
      });
      score.textContent = "";
      wrap.dataset.allDone = "no";
    };
    return wrap;
  };
})();
