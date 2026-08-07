/* ===================================================================
   webhub.js — everything the HTML/CSS/JavaScript editor needs.

   Colouring, mistake-spotting and plain-English explanations for the
   three web languages, plus the little bit of glue that turns what a
   student typed into a page the browser can show. Nothing here touches
   the network or the database.
   =================================================================== */

(function(){
  "use strict";

  const esc = (t) => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  /* ---------------- what the words mean ---------------- */
  window.WEB_HELP = {
    html: {
      "html":"Wraps the whole page.",
      "head":"Holds information about the page that visitors do not see, like its title.",
      "title":"The name shown on the browser tab.",
      "body":"Everything people actually see goes in here.",
      "h1":"The biggest heading. Use one per page.",
      "h2":"A smaller heading, for a section.",
      "h3":"A smaller heading again, inside a section.",
      "p":"A paragraph of writing.",
      "a":"A link to another page. The address goes in href.",
      "img":"Shows a picture. The address goes in src.",
      "ul":"An unordered list — the one with bullet points.",
      "ol":"An ordered list — the one with numbers.",
      "li":"One item in a list.",
      "div":"A box you can style or move around. Very common.",
      "span":"A small box around some words inside a line.",
      "button":"A button people can click.",
      "input":"A box people can type in.",
      "form":"Groups boxes together so they can be sent somewhere.",
      "table":"A table of rows and columns.",
      "tr":"One row of a table.",
      "td":"One cell in a table row.",
      "th":"A heading cell in a table.",
      "br":"Starts a new line.",
      "hr":"Draws a line across the page.",
      "style":"Somewhere to write CSS inside the page.",
      "script":"Somewhere to write JavaScript inside the page.",
      "link":"Attaches something to the page, usually a stylesheet.",
      "class":"A label you give an element so CSS can find it.",
      "id":"A name for one element only, so CSS or JavaScript can find it.",
      "href":"The address a link goes to.",
      "src":"The address of a picture, video or script.",
      "alt":"Words describing a picture, read aloud to people who cannot see it.",
      "strong":"Makes words important — shown bold.",
      "em":"Adds emphasis — shown in italics.",
      "header":"The top part of a page or section.",
      "footer":"The bottom part of a page or section.",
      "nav":"The menu of links.",
      "section":"A part of a page that belongs together.",
      "select":"A drop-down list of choices.",
      "option":"One choice inside a drop-down list.",
      "label":"Words that go with an input box."
    },
    css: {
      "color":"The colour of the writing.",
      "background":"What sits behind an element — a colour or a picture.",
      "background-color":"The colour behind an element.",
      "font-size":"How big the writing is.",
      "font-family":"Which typeface the writing uses.",
      "font-weight":"How bold the writing is.",
      "text-align":"Lines writing up left, right or in the centre.",
      "margin":"Space outside an element, pushing others away.",
      "padding":"Space inside an element, between its edge and its contents.",
      "border":"A line drawn around an element.",
      "border-radius":"Rounds the corners.",
      "width":"How wide an element is.",
      "height":"How tall an element is.",
      "display":"How an element behaves — block, inline, flex, grid, or none to hide it.",
      "flex":"Shares out space between items in a row or column.",
      "justify-content":"Spreads items along a flex row.",
      "align-items":"Lines items up across a flex row.",
      "position":"Takes an element out of the normal flow so you can place it.",
      "top":"How far down a positioned element sits.",
      "left":"How far across a positioned element sits.",
      "opacity":"How see-through something is, from 0 to 1.",
      "box-shadow":"A shadow behind an element.",
      "text-decoration":"Underlines writing, or removes the line under links.",
      "line-height":"The space between lines of writing.",
      "cursor":"What the mouse pointer looks like over an element.",
      "transition":"Makes a change happen smoothly instead of instantly.",
      "transform":"Moves, turns or resizes an element.",
      "hover":"The style used while the mouse is over something.",
      "gap":"Space between items in a flex or grid layout.",
      "overflow":"What happens when the contents are too big to fit."
    },
    js: {
      "let":"Makes a variable whose value can change.",
      "const":"Makes a variable whose value must not change.",
      "var":"An older way of making a variable. let and const are better.",
      "function":"Makes your own command you can use again.",
      "return":"Sends a value back out of a function.",
      "if":"Does something only when a condition is true.",
      "else":"What to do when the condition was false.",
      "for":"Repeats something a set number of times.",
      "while":"Keeps repeating while a condition stays true.",
      "true":"The value for yes.",
      "false":"The value for no.",
      "null":"Deliberately nothing.",
      "undefined":"No value has been given yet.",
      "console":"The place messages go. console.log() prints one.",
      "log":"Prints a message to the console.",
      "alert":"Shows a pop-up message.",
      "prompt":"Asks the person to type something.",
      "document":"The web page itself, so JavaScript can change it.",
      "getElementById":"Finds the one element with that id.",
      "querySelector":"Finds the first element matching a CSS selector.",
      "addEventListener":"Runs some code when something happens, like a click.",
      "innerHTML":"The HTML inside an element. Setting it replaces the contents.",
      "textContent":"The words inside an element, without any HTML.",
      "value":"What someone has typed into an input box.",
      "length":"How many items or letters there are.",
      "push":"Adds an item to the end of an array.",
      "parseInt":"Turns text into a whole number.",
      "Math":"A toolbox of number tricks, like Math.random().",
      "random":"Gives a random number between 0 and 1.",
      "setTimeout":"Runs some code once, after a wait.",
      "setInterval":"Runs some code over and over, on a timer.",
      "classList":"Adds or removes CSS classes on an element.",
      "typeof":"Tells you what kind of value something is."
    }
  };

  /* ---------------- colouring ---------------- */
  function hlHtml(line){
    let out = "", i = 0;
    while (i < line.length){
      const rest = line.slice(i);
      let m;
      if ((m = /^<!--[\s\S]*?(-->|$)/.exec(rest))){
        out += '<span class="t-com">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^(<\/?)\s*([A-Za-z][\w-]*)/.exec(rest))){
        const tag = m[2];
        const helped = window.WEB_HELP.html[tag.toLowerCase()];
        out += '<span class="t-op">' + esc(m[1]) + "</span>" +
               '<span class="t-tag' + (helped ? " t-help" : "") + '">' + esc(tag) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^([A-Za-z-]+)(?=\s*=)/.exec(rest))){
        const helped = window.WEB_HELP.html[m[1].toLowerCase()];
        out += '<span class="t-attr' + (helped ? " t-help" : "") + '">' + esc(m[1]) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^("[^"]*"?|'[^']*'?)/.exec(rest))){
        out += '<span class="t-str">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^[<>\/=]+/.exec(rest))){
        out += '<span class="t-op">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      out += esc(rest[0]); i++;
    }
    return out || "&nbsp;";
  }

  function hlCss(line){
    let out = "", i = 0;
    while (i < line.length){
      const rest = line.slice(i);
      let m;
      if ((m = /^\/\*[\s\S]*?(\*\/|$)/.exec(rest))){
        out += '<span class="t-com">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^([a-z-]+)(?=\s*:)/.exec(rest))){
        const helped = window.WEB_HELP.css[m[1]];
        out += '<span class="t-prop' + (helped ? " t-help" : "") + '">' + esc(m[1]) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^(#[0-9a-fA-F]{3,8}\b|\d+\.?\d*(px|em|rem|%|vh|vw|s|deg)?)/.exec(rest))){
        out += '<span class="t-num">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^("[^"]*"?|'[^']*'?)/.exec(rest))){
        out += '<span class="t-str">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^([.#][\w-]+|:[a-z-]+)/.exec(rest))){
        const bare = m[0].replace(/^[.#:]/, "");
        const helped = window.WEB_HELP.css[bare];
        out += '<span class="t-sel' + (helped ? " t-help" : "") + '">' + esc(m[0]) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^[{}:;,]/.exec(rest))){
        out += '<span class="t-op">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      out += esc(rest[0]); i++;
    }
    return out || "&nbsp;";
  }

  const JS_KW = new Set(("let const var function return if else for while do break continue new " +
    "typeof this class extends try catch finally throw switch case default of in await async").split(" "));

  function hlJs(line, state){
    let out = "", i = 0;
    if (state && state.block){
      const close = line.indexOf("*/");
      if (close < 0) return '<span class="t-com">' + esc(line) + "</span>";
      out += '<span class="t-com">' + esc(line.slice(0, close + 2)) + "</span>";
      i = close + 2; state.block = false;
    }
    while (i < line.length){
      const rest = line.slice(i);
      let m;
      if (rest.slice(0, 2) === "//"){ out += '<span class="t-com">' + esc(rest) + "</span>"; break; }
      if (rest.slice(0, 2) === "/*"){
        const close = rest.indexOf("*/", 2);
        if (close < 0){ if (state) state.block = true; out += '<span class="t-com">' + esc(rest) + "</span>"; break; }
        out += '<span class="t-com">' + esc(rest.slice(0, close + 2)) + "</span>"; i += close + 2; continue;
      }
      if ((m = /^("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)/.exec(rest))){
        out += '<span class="t-str">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^\d+\.?\d*/.exec(rest))){ out += '<span class="t-num">' + m[0] + "</span>"; i += m[0].length; continue; }
      if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))){
        const w = m[0];
        const helped = !!window.WEB_HELP.js[w];
        const cls = JS_KW.has(w) ? "t-kw" : (helped ? "t-fn" : "");
        out += (cls || helped)
          ? '<span class="' + cls + (helped ? " t-help" : "") + '">' + esc(w) + "</span>"
          : esc(w);
        i += w.length; continue;
      }
      if ((m = /^[+\-*\/%=<>!&|^~?:]+/.exec(rest))){
        out += '<span class="t-op">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      out += esc(rest[0]); i++;
    }
    return out || "&nbsp;";
  }

  window.webHighlight = function(lang, line, state){
    if (lang === "css") return hlCss(line);
    if (lang === "js") return hlJs(line, state);
    return hlHtml(line);
  };

  /* ---------------- spotting mistakes ---------------- */
  const VOID_TAGS = new Set(["br","hr","img","input","meta","link","area","base","col","source","track","wbr","!doctype"]);

  function checkHtml(code){
    const issues = [];
    const lines = code.split("\n");
    const stack = [];
    lines.forEach((raw, n) => {
      const clean = raw.replace(/<!--[\s\S]*?-->/g, "");
      const re = /<(\/?)\s*([A-Za-z!][\w-]*)([^>]*?)(\/?)>/g;
      let m;
      while ((m = re.exec(clean)) !== null){
        const closing = m[1] === "/";
        const tag = m[2].toLowerCase();
        const selfClosed = m[4] === "/";
        if (closing){
          const top = stack.pop();
          if (!top){
            issues.push({ line:n, msg: "</" + tag + "> closes something that was never opened." });
          } else if (top.tag !== tag){
            issues.push({ line:n, msg: "Expected </" + top.tag + "> here, but found </" + tag + ">." });
            stack.push(top);
          }
        } else if (!selfClosed && !VOID_TAGS.has(tag)){
          stack.push({ tag: tag, line: n });
        }
      }
      if ((clean.match(/"/g) || []).length % 2)
        issues.push({ line:n, msg:"A quote mark is missing from this line." });
      const lastOpen = clean.lastIndexOf("<"), lastClose = clean.lastIndexOf(">");
      if (lastOpen > lastClose && /<[A-Za-z]/.test(clean.slice(lastOpen)))
        issues.push({ line:n, msg:"This tag is missing its closing >." });
    });
    stack.forEach(o => issues.push({ line:o.line, msg:"<" + o.tag + "> is never closed." }));
    return issues;
  }

  function checkCss(code){
    const issues = [];
    const lines = code.split("\n");
    let depth = 0, openLine = 0, inComment = false;
    lines.forEach((raw, n) => {
      let t = raw;
      if (inComment){
        const close = t.indexOf("*/");
        if (close < 0) return;
        t = t.slice(close + 2); inComment = false;
      }
      t = t.replace(/\/\*[\s\S]*?\*\//g, "");
      if (t.indexOf("/*") >= 0){ inComment = true; t = t.slice(0, t.indexOf("/*")); }
      for (const ch of t){
        if (ch === "{"){ if (!depth) openLine = n; depth++; }
        else if (ch === "}"){
          depth--;
          if (depth < 0){ issues.push({ line:n, msg:"There is a } here with no { to match it." }); depth = 0; }
        }
      }
      const body = t.trim();
      if (!body) return;
      const looksLikeStyling = /^[a-z-]+\s*:/.test(body);
      if (looksLikeStyling && depth > 0 && !/[;{}]$/.test(body)){
        issues.push({ line:n, msg:"This line needs a semicolon (;) at the end.",
                      fix:() => raw.replace(/\s*$/, "") + ";" });
      }
      if (looksLikeStyling && depth === 0 && !/^@/.test(body)){
        issues.push({ line:n, msg:"This styling is not inside a rule — it needs a selector and { } around it." });
      }
    });
    if (depth > 0) issues.push({ line:openLine, msg:"This rule is never closed with a }." });
    return issues;
  }

  function checkJs(code){
    const issues = [];
    const lines = code.split("\n");
    const opens = { "(":")", "[":"]", "{":"}" };
    const stack = [];
    let inComment = false;
    lines.forEach((raw, n) => {
      let t = raw;
      if (inComment){
        const close = t.indexOf("*/");
        if (close < 0) return;
        t = t.slice(close + 2); inComment = false;
      }
      t = t.replace(/\/\*[\s\S]*?\*\//g, "");
      if (t.indexOf("/*") >= 0){ inComment = true; t = t.slice(0, t.indexOf("/*")); }
      t = t.replace(/\/\/.*/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1?/g, '""');
      for (const ch of t){
        if (opens[ch]) stack.push({ ch, n });
        else if (ch === ")" || ch === "]" || ch === "}"){
          if (!stack.pop()) issues.push({ line:n, msg:"There is a " + ch + " here with nothing to close." });
        }
      }
      const body = t.trim();
      if (!body) return;
      if (/=\s*$/.test(body)) issues.push({ line:n, msg:"This line ends with = and nothing after it." });
      const cmp = /^(if|while)\s*\(([^)]*)\)/.exec(body);
      if (cmp && /[^=!<>]=[^=]/.test(cmp[2])){
        issues.push({ line:n, msg:"Use === to compare two things. A single = puts a value into a variable.",
                      fix:() => raw.replace(/([^=!<>])=([^=])/, "$1===$2") });
      }
      const typo = /\b(consol|documnet|fuction|functoin|retrun|lenght|getElementByID|querySelectorall)\b/.exec(t);
      if (typo){
        const right = { consol:"console", documnet:"document", fuction:"function", functoin:"function",
                        retrun:"return", lenght:"length", getElementByID:"getElementById",
                        querySelectorall:"querySelectorAll" }[typo[1]];
        issues.push({ line:n, msg:'Did you mean "' + right + '"?',
                      fix:() => raw.replace(new RegExp("\\b" + typo[1] + "\\b"), right) });
      }
    });
    stack.forEach(o => issues.push({ line:o.n, msg:"This " + o.ch + " is never closed." }));
    return issues;
  }

  window.webCheck = function(lang, code){
    try{
      if (lang === "css") return checkCss(code || "");
      if (lang === "js") return checkJs(code || "");
      return checkHtml(code || "");
    }catch(e){ return []; }
  };

  /* ---------------- building the page to show ----------------
     The student's three files are put together into one document. A small
     piece of glue at the top sends console messages and errors up to the
     lesson page, so mistakes appear in the console instead of vanishing. */
  window.webAssemble = function(html, css, js){
    const page = String(html || "");
    const style = css ? "<style>\n" + css + "\n</style>" : "";
    const S = "<" + "script>", E = "<" + "/" + "script>";
    const bridge = S + "(function(){\n" +
      "  function send(kind, args){\n" +
      "    var text = Array.prototype.map.call(args, function(a){\n" +
      "      try{ return (a && typeof a === 'object') ? JSON.stringify(a) : String(a); }\n" +
      "      catch(e){ return String(a); }\n" +
      "    }).join(' ');\n" +
      "    try{ parent.postMessage({ hubConsole: true, kind: kind, text: text }, '*'); }catch(e){}\n" +
      "  }\n" +
      "  ['log','warn','error','info'].forEach(function(k){\n" +
      "    var was = console[k];\n" +
      "    console[k] = function(){ send(k, arguments); if (was) try{ was.apply(console, arguments); }catch(e){} };\n" +
      "  });\n" +
      "  window.onerror = function(msg, src, line){ send('error', [msg + '  (line ' + line + ')']); return false; };\n" +
      "})();" + E;
    const script = js ? S + "\ntry{\n" + js + "\n}catch(e){ console.error(e.message); }\n" + E : "";

    if (/<html[\s>]/i.test(page)){
      let out = page;
      if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, bridge + style + "</head>");
      else out = out.replace(/<body([^>]*)>/i, "<body$1>" + bridge + style);
      if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, script + "</body>");
      else out += script;
      return out;
    }
    return "<!DOCTYPE html><html><head><meta charset='utf-8'>" + bridge + style +
           "</head><body>" + page + script + "</body></html>";
  };
})();
