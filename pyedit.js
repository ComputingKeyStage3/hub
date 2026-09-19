/* ============================================================
   The Python editor, in one place.

   The colouring, the line numbers, the mistake spotting and the typing
   behaviour used to live inside lesson.html, which meant the builder's
   "Starter code" box was a plain textarea: no colours, no numbers, and no
   indent after a colon. A teacher wrote the code that students would open in
   the real editor, in a box that behaved nothing like it.

   Everything here is shared by both. lesson.html adds the parts only the
   student needs on top: running, the console, the turtle canvas and the help
   words.
   ============================================================ */
(function(){

const PY_KW = new Set(("and as assert break class continue def del elif else except finally for from global " +
  "if import in is lambda None nonlocal not or pass raise return True False try while with yield").split(" "));
const PY_FN = new Set(("print input int str float len range list dict set tuple bool abs min max sum round sorted " +
  "open type enumerate zip map filter reversed any all chr ord format").split(" "));
const TRIPLES = ["'''", '"""'];

function escHtml(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function el(tag, cls){ const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function tel(tag, cls, text){ const e = el(tag, cls); if (text !== undefined) e.textContent = text; return e; }

/* ---------- colouring one line ----------
   `state.triple` carries a long string over to the next line, so a docstring
   stays green all the way down instead of only on the line it opened. */
function hlLine(line, state, opts){
  const help = (opts && opts.help) || {};
  const tips = !opts || opts.tips !== false;
  let out = "", i = 0;
  if (state.triple){
    const close = line.indexOf(state.triple);
    if (close < 0) return { html: '<span class="t-str">' + escHtml(line) + "</span>" };
    out += '<span class="t-str">' + escHtml(line.slice(0, close + 3)) + "</span>";
    i = close + 3; state.triple = null;
  }
  while (i < line.length){
    const rest = line.slice(i);
    let m;
    if (rest[0] === "#"){ out += '<span class="t-com">' + escHtml(rest) + "</span>"; break; }
    const trip = TRIPLES.find(q => rest.slice(0, 3) === q);
    if (trip){
      const close = rest.indexOf(trip, 3);
      if (close < 0){ state.triple = trip; out += '<span class="t-str">' + escHtml(rest) + "</span>"; break; }
      out += '<span class="t-str">' + escHtml(rest.slice(0, close + 3)) + "</span>";
      i += close + 3; continue;
    }
    if ((m = /^("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)/.exec(rest))){
      out += '<span class="t-str">' + escHtml(m[0]) + "</span>"; i += m[0].length; continue;
    }
    if ((m = /^\d+\.?\d*/.exec(rest))){ out += '<span class="t-num">' + m[0] + "</span>"; i += m[0].length; continue; }
    if ((m = /^[A-Za-z_]\w*/.exec(rest))){
      const w = m[0];
      const call = /^\s*\(/.test(rest.slice(w.length));
      const cls = PY_KW.has(w) ? "t-kw" : (PY_FN.has(w) ? "t-fn" : (call ? "t-call" : ""));
      const helped = Object.prototype.hasOwnProperty.call(help, w) && tips;
      out += cls
        ? '<span class="' + cls + (helped ? " t-help" : "") + '"' + (helped ? ' data-word="' + w + '"' : "") + ">" + w + "</span>"
        : escHtml(w);
      i += w.length; continue;
    }
    if ((m = /^[+\-*\/%=<>!&|^~]+/.exec(rest))){ out += '<span class="t-op">' + escHtml(m[0]) + "</span>"; i += m[0].length; continue; }
    out += escHtml(rest[0]); i++;
  }
  return { html: out || "&nbsp;" };
}

/* ---------- what is a string and what is code ----------
   Walked a character at a time rather than counted. Counting quote marks
   reported print("Great - let's get started") as a missing quote, because the
   apostrophe in "let's" made the number of single quotes odd. It is inside a
   double-quoted string, so it is not a quote mark at all.

   `carry` is whatever triple-quoted string was still open at the end of the
   line before, so a docstring does not turn the lines inside it into code.
   Comes back with the code alone, the string contents blanked, and whatever
   is still open. */
function strip(line, carry){
  let out = "", i = 0, open = carry || "";
  while (i < line.length){
    const three = line.slice(i, i + 3);
    if (open){
      if (open.length === 3){
        if (three === open){ open = ""; i += 3; out += '""'; continue; }
        i++; continue;
      }
      if (line[i] === "\\"){ i += 2; continue; }       // \" does not end the string
      if (line[i] === open){ open = ""; i++; out += '""'; continue; }
      i++; continue;
    }
    if (line[i] === "#") break;                        // the rest is a comment
    if (three === '"""' || three === "'''"){ open = three; i += 3; continue; }
    if (line[i] === '"' || line[i] === "'"){ open = line[i]; i++; continue; }
    out += line[i]; i++;
  }
  return { text: out, open: open };
}

/* ---------- spotting mistakes before the code is even run ---------- */
function checkPython(code){
  const issues = [], lines = code.split("\n");
  const opens = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  let carry = "";                                      // a long string left open above
  lines.forEach((raw, n) => {
    const wasInside = !!carry;
    const st = strip(raw, carry);
    if (st.open && st.open.length === 3){
      carry = st.open;                                 // a docstring carrying on
    } else {
      if (st.open) issues.push({ line:n, msg:"A quote mark is missing from this line." });
      carry = "";
    }
    /* Lines inside a long string are text, not code, so nothing below applies
       to them. */
    if (wasInside) return;
    const t = st.text;
    if (!t.trim()) return;
    for (const ch of t){
      if (opens[ch]) stack.push({ ch, n });
      else if (ch === ")" || ch === "]" || ch === "}"){
        if (!stack.pop()) issues.push({ line:n, msg:"There is a closing bracket here with nothing to close." });
      }
    }

    const printMatch = /^(\s*)print\s+(?!\()(.+)$/.exec(raw);
    if (printMatch) issues.push({ line:n, msg:"In Python 3, print needs brackets around what it prints.",
                          fix:() => printMatch[1] + 'print(' + printMatch[2].trim() + ')' });

    const opener = /^\s*(if|elif|else|for|while|def|class|try|except|finally|with)\b/.exec(t);
    if (opener && !/:\s*$/.test(t.trim())){
      issues.push({ line:n, msg:'Lines starting with "' + opener[1] + '" need a colon (:) at the end.',
                    fix:() => raw.replace(/\s*$/, "") + ":" });
    }
    if (/^\s*(if|elif|while)\b/.test(t) && /[^=!<>+\-*\/%]=[^=]/.test(t.replace(/^\s*\w+/, ""))){
      issues.push({ line:n, msg:"Use == to compare two things. A single = puts a value into a variable.",
                    fix:() => raw.replace(/([^=!<>+\-*\/%])=([^=])/, "$1==$2") });
    }
    const typo = /\b(pirnt|prnit|Print|inptu|inupt|Input|rang|whlie|improt|fro|esle|retrun)\b/.exec(t);
    if (typo){
      const right = { pirnt:"print", prnit:"print", Print:"print", inptu:"input", inupt:"input",
                      Input:"input", rang:"range", whlie:"while", improt:"import", fro:"for",
                      esle:"else", retrun:"return" }[typo[1]];
      issues.push({ line:n, msg:'Did you mean "' + right + '"?',
                    fix:() => raw.replace(new RegExp("\\b" + typo[1] + "\\b"), right) });
    }
    if (/^\t+ +| +\t/.test(raw)) issues.push({ line:n, msg:"This line mixes tabs and spaces. Use spaces only." });
  });
  stack.forEach(o => issues.push({ line:o.n, msg:"This " + o.ch + " is never closed." }));
  return issues;
}

/* ---------- what language the editor is painting ----------
   Everything that differs between Python and the three web languages, in one
   object, so there is one editor rather than one per language. The web one
   came from the lesson page's HTML task, where it was a second copy of all of
   this that had quietly drifted: it indented by two spaces and Python's by
   four, which was right, and it had lost the Fix it buttons, which was not.

     paint(line, state)  the line as coloured HTML
     find(code)          the mistakes, as {line, msg, fix?}
     state()             whatever has to carry from one line to the next
     indent              what Tab puts in
     opens(line)         does this line start a block, so the next is indented */
const pythonLang = {
  paint: (line, state, opts) => hlLine(line, state, opts).html,
  find: checkPython,
  state: () => ({ triple: null }),
  indent: "    ",
  opens: (line) => /:\s*$/.test(line)
};
/* Words, not code. A .txt file a Python program reads opens in the same box
   as the code does, and colouring an ordinary sentence as if it were Python
   turns the word "for" in the middle of it a different colour. */
const plainLang = {
  paint: (line) => escHtml(line) || "&nbsp;",
  find: () => [],
  state: () => ({}),
  indent: "  ",
  opens: () => false
};

/* HTML, CSS and JavaScript, from webhub.js. Asked for by name because a page
   with no web editor on it does not load that file. */
function webLang(which){
  return {
    paint: (line, state) => window.webHighlight ? window.webHighlight(which, line, state) : escHtml(line),
    find: (code) => window.webCheck ? window.webCheck(which, code) : [],
    state: () => ({ block: false }),
    indent: "  ",
    opens: (line) => /[{>]\s*$/.test(line)
  };
}

/* ---------- the editor itself ----------
   Line numbers down the side, the colours painted on a layer behind a
   see-through textarea, and the list of mistakes underneath. Options:
     value      what to start with
     readOnly   look at it but do not change it
     height     how tall the code area is, in pixels
     problems   show the list of mistakes (on unless turned off)
     fixes      offer the "Fix it" buttons (on unless turned off)
     help       the word explanations to underline, if any
     tips       whether those underlines are wanted just now
     onInput    called after every change
   Comes back with the pieces, so anything wanting more can build on them. */
function attach(opts){
  opts = opts || {};
  let lang = opts.lang || pythonLang;
  const editor = el("div","ide-editor");
  const gutter = el("div","ide-gutter");
  const codeWrap = el("div","ide-codewrap");
  const hl = el("div","ide-hl"); hl.setAttribute("aria-hidden","true");
  const ta = el("textarea","ide-code");
  ta.spellcheck = false; ta.autocapitalize = "off"; ta.autocomplete = "off"; ta.wrap = "off";
  ta.value = opts.value || "";
  if (opts.readOnly) ta.readOnly = true;
  if (opts.height) editor.style.height = opts.height + "px";
  codeWrap.appendChild(hl); codeWrap.appendChild(ta);
  editor.appendChild(gutter); editor.appendChild(codeWrap);
  const probs = el("div","ide-probs"); probs.hidden = true;

  let issues = [];
  const showProbs = opts.problems !== false;
  const showFixes = opts.fixes !== false;

  function repaint(){
    const lines = ta.value.split("\n");
    issues = lang.find(ta.value) || [];
    const bad = new Set(issues.map(x => x.line));
    const state = lang.state();
    hl.innerHTML = lines.map((l, n) =>
      '<div class="hl-line' + (bad.has(n) ? " bad" : "") + '">' +
      lang.paint(l, state, { help: opts.help, tips: opts.tips !== false }) + "</div>").join("");
    gutter.innerHTML = lines.map((_, n) =>
      '<div class="gl' + (bad.has(n) ? " bad" : "") + '">' + (n + 1) + "</div>").join("");
    if (!showProbs){ probs.hidden = true; return; }
    probs.innerHTML = "";
    if (!issues.length){ probs.hidden = true; return; }
    probs.hidden = false;
    issues.slice(0, 4).forEach(iss => {
      const row = el("div","ide-prob");
      row.appendChild(tel("span","ide-probline","Line " + (iss.line + 1)));
      row.appendChild(tel("span","ide-probmsg", iss.msg));
      if (iss.fix && showFixes){
        const fixBtn = tel("button","ide-chip","Fix it");
        fixBtn.addEventListener("click", () => {
          const ls = ta.value.split("\n");
          ls[iss.line] = iss.fix();
          ta.value = ls.join("\n");
          repaint();
          if (opts.onInput) opts.onInput();
        });
        row.appendChild(fixBtn);
      }
      probs.appendChild(row);
    });
  }

  ta.addEventListener("input", () => { repaint(); if (opts.onInput) opts.onInput(); });
  ta.addEventListener("scroll", () => {
    hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop;
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab"){
      e.preventDefault();
      const st = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, st) + lang.indent + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = st + lang.indent.length;
      repaint(); if (opts.onInput) opts.onInput();
    } else if (e.key === "Enter"){
      const st = ta.selectionStart;
      const line = ta.value.slice(0, st).split("\n").pop();
      const indent = (line.match(/^[ \t]*/) || [""])[0];
      const extra = lang.opens(line) ? lang.indent : "";
      if (indent || extra){
        e.preventDefault();
        const ins = "\n" + indent + extra;
        ta.value = ta.value.slice(0, st) + ins + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = st + ins.length;
        repaint(); if (opts.onInput) opts.onInput();
      }
    }
  });
  repaint();

  /* Switching language without building the editor again, which is what the
     sandbox's web editor does when it moves between its three files. */
  function setLang(next){ lang = next || pythonLang; repaint(); }

  return { editor, gutter, codeWrap, hl, ta, probs, repaint, setLang,
           issues: () => issues };
}

/* Which editor colours to use when nobody has chosen: dark for the dark
   backgrounds, light for the rest. The builder wants this as much as the
   lesson does, so it lives here beside everything else about the editor. */
function themeFromSite(){
  try{
    const bg = document.documentElement.dataset.bg || "";
    return (bg === "dark" || bg === "night") ? "dark" : "light";
  }catch(e){ return "light"; }
}

/* Keep an editor's colours in step with the site's. The lesson page has its
   own version of this, because a student may choose editor colours of their
   own and those have to win; nowhere else does, so nowhere else needs it. */
/* Anything that wants to know when the site's colours change. One watcher
   for the page however many editors are on it. */
const watchers = [];
function watchSite(fn){
  watchers.push(fn);
  if (watchers.length === 1 && window.MutationObserver){
    try{
      new MutationObserver(() => {
        const t = themeFromSite();
        watchers.forEach(f => { try{ f(t); }catch(e){} });
      }).observe(document.documentElement, { attributes:true, attributeFilter:["data-bg"] });
    }catch(e){}
  }
  fn(themeFromSite());
}
function follow(shell){
  shell.dataset.idesize = "m";
  watchSite((t) => { shell.dataset.idetheme = t; });
  return shell;
}

/* ---------- the cog: editor colours and text size ----------
   Kept per browser under hub_ide and shared by every editor on the site, so
   a student who sets the code large in a lesson finds it large in the
   practice sandbox as well.

   `shell` is the element the .ide styles hang off, which is what carries
   data-idetheme and data-idesize. Comes back with the panel to drop into the
   editor's bar area; it starts hidden and the cog shows it. */
function idePrefs(){ try{ return JSON.parse(localStorage.getItem("hub_ide") || "{}"); }catch(e){ return {}; } }
function saveIdePrefs(p){ try{ localStorage.setItem("hub_ide", JSON.stringify(p)); }catch(e){} }
/* An older version stored a theme every time an editor was drawn, so nearly
   every browser has one saved and stopped following the page. Clear those once. */
(function(){
  try{
    const p = idePrefs();
    if (p.theme && !p.chosen){ delete p.theme; saveIdePrefs(p); }
  }catch(e){}
})();

function idePanel(shell){
  const panel = el("div","ide-settings");
  panel.hidden = true;
  panel.appendChild(tel("span","ide-setlabel","Colours"));
  const themes = el("div","ide-setrow");
  /* "Match the page" first, and it is where everyone starts. Without it,
     picking a colour scheme once meant the editor never followed the site
     again: turning the whole site dark left a white editor sitting in the
     middle of it with no way back short of clearing the browser's storage. */
  [["","Match the page"],["dark","Dark"],["light","Light"],["contrast","High contrast"]].forEach(pair => {
    const chip = tel("button","ide-chip", pair[1]);
    chip.type = "button";
    chip.dataset.theme = pair[0];
    chip.addEventListener("click", () => {
      if (!pair[0]){
        const p = idePrefs();
        delete p.theme; delete p.chosen;
        saveIdePrefs(p);
        setTheme(themeFromSite());
      } else setTheme(pair[0], true);
    });
    themes.appendChild(chip);
  });
  panel.appendChild(themes);
  panel.appendChild(tel("span","ide-setlabel","Text size"));
  const sizes = el("div","ide-setrow");
  [["s","Small"],["m","Medium"],["l","Large"],["xl","Extra large"]].forEach(pair => {
    const chip = tel("button","ide-chip", pair[1]);
    chip.type = "button";
    chip.dataset.size = pair[0];
    chip.addEventListener("click", () => setSize(pair[0]));
    sizes.appendChild(chip);
  });
  panel.appendChild(sizes);

  function setTheme(k, chosen){
    shell.dataset.idetheme = k;
    /* Only remembered when the student picked it, otherwise the editor would
       stop following the site's colours after the first paint. */
    if (chosen){ const p = idePrefs(); p.theme = k; p.chosen = true; saveIdePrefs(p); }
    /* Following the site is a mode of its own, so that is the chip to mark
       rather than whichever colour it happens to be showing. */
    const auto = !idePrefs().theme;
    Array.from(themes.children).forEach(c =>
      c.classList.toggle("on", auto ? c.dataset.theme === "" : c.dataset.theme === k));
  }
  function setSize(k){
    shell.dataset.idesize = k;
    Array.from(sizes.children).forEach(c => c.classList.toggle("on", c.dataset.size === k));
    const p = idePrefs(); p.size = k; saveIdePrefs(p);
  }
  /* Always watching, even when a colour scheme has been chosen. The watcher
     asks about the preference each time it fires, so pressing "Match the page"
     starts following the site again straight away. Registering it only when
     none had been chosen meant that, once one was, nothing was left listening:
     choosing to follow the site again worked once and then stopped until the
     page was reloaded. */
  watchSite((t) => { if (!idePrefs().theme) setTheme(t); });
  const pref = idePrefs();
  if (pref.theme) setTheme(pref.theme, false);
  setSize(pref.size || "m");

  return { panel, toggle(){ panel.hidden = !panel.hidden; }, setTheme, setSize };
}

/* ---------- a word explained ----------
   A one-line explanation for the words a beginner meets. Clicking a coloured
   word in the editor shows the matching note.

   Here beside the colouring rather than in lesson.html, because the practice
   sandbox offers the same Help tab and a list of words kept in two places
   grows apart. */
const PY_HELP = {
  print:"Shows something on the screen.",
  input:"Stops and waits for the person to type, then hands the typing back as text. Store it in a variable to keep it.",
  int:"Makes a whole number out of something, like \"7\" into 7. Anything with a decimal point loses it.",
  str:"Makes text out of something, so a number can be joined onto words.",
  float:"Makes a decimal number out of something, like \"2.5\" into 2.5.",
  len:"Gives the number of items in a list, or the number of characters in some text.",
  range:"Counts from 0 up to but not including the number, so range(5) gives 0, 1, 2, 3, 4.",
  list:"Makes a list, which holds several things in order and can be changed.",
  dict:"Makes a dictionary, which stores pairs so you can look a value up by its name.",
  round:"Rounds to the nearest whole number. Exact halves go to the nearest even one, so round(2.5) is 2.",
  abs:"Gives how far a number is from zero, so the minus sign is dropped.",
  min:"Gives the smallest of the numbers.",
  max:"Gives the biggest of the numbers.",
  sum:"Adds up all the numbers in a list.",
  sorted:"Gives back a new list in order. The original list is left as it was.",
  random:"A toolbox for picking things by chance. Needs import random at the top first.",
  if:"Does something only when a condition is true.",
  elif:"Another condition to try when the ones above were false.",
  else:"What to do when none of the conditions above were true.",
  for:"Repeats something once for each item, like every number in a range.",
  while:"Keeps repeating for as long as a condition stays true.",
  break:"Leaves the loop straight away, without finishing the rest of it.",
  continue:"Skips the rest of this time round the loop and starts the next one.",
  def:"Makes your own command that you can use again later.",
  return:"Sends a value back out of your own command.",
  import:"Brings in extra tools, like turtle or random.",
  from:"Brings in just part of a toolbox.",
  in:"Checks whether something is inside a list or some text.",
  not:"Flips true into false, and false into true.",
  and:"True only when both things are true.",
  or:"True when at least one of the things is true.",
  True:"The value for yes.",
  False:"The value for no.",
  None:"Means nothing at all, no value yet.",
  try:"Attempts something that might go wrong.",
  except:"What to do if the code in try went wrong.",
  class:"A blueprint for making things that each carry their own information.",
  pass:"Does nothing, a placeholder to keep the code valid.",
  global:"Lets a command change a variable that was made outside it, instead of making its own.",
  lambda:"A very short command written on one line, with no name of its own.",
  with:"Opens something, such as a file, and closes it again when the block ends.",
  type:"Tells you what kind of value something is, such as a number or some text.",
  enumerate:"Goes through a list giving both the position, counting from 0, and the item.",
  zip:"Goes through two lists side by side, stopping when the shorter one runs out."
};

window.pyEdit = { attach, checkPython, hlLine, strip, escHtml, themeFromSite, follow,
                  idePanel, idePrefs, saveIdePrefs, pythonLang, webLang, plainLang,
                  PY_KW, PY_FN, PY_HELP };

})();
