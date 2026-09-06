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
    issues = checkPython(ta.value);
    const bad = new Set(issues.map(x => x.line));
    const state = { triple: null };
    hl.innerHTML = lines.map((l, n) =>
      '<div class="hl-line' + (bad.has(n) ? " bad" : "") + '">' +
      hlLine(l, state, { help: opts.help, tips: opts.tips !== false }).html + "</div>").join("");
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
      ta.value = ta.value.slice(0, st) + "    " + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = st + 4;
      repaint(); if (opts.onInput) opts.onInput();
    } else if (e.key === "Enter"){
      const st = ta.selectionStart;
      const line = ta.value.slice(0, st).split("\n").pop();
      const indent = (line.match(/^[ \t]*/) || [""])[0];
      const extra = /:\s*$/.test(line) ? "    " : "";
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

  return { editor, gutter, codeWrap, hl, ta, probs, repaint,
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
const followers = [];
function follow(shell){
  shell.dataset.idetheme = themeFromSite();
  shell.dataset.idesize = "m";
  followers.push(shell);
  if (followers.length === 1 && window.MutationObserver){
    try{
      new MutationObserver(() => {
        const t = themeFromSite();
        followers.forEach(x => { x.dataset.idetheme = t; });
      }).observe(document.documentElement, { attributes:true, attributeFilter:["data-bg"] });
    }catch(e){}
  }
  return shell;
}

window.pyEdit = { attach, checkPython, hlLine, strip, escHtml, themeFromSite, follow,
                  PY_KW, PY_FN };

})();
