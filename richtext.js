/* ------------------------------------------------------------------
   A small rich-text box for the lesson builder.

   Teachers get buttons rather than markdown. The result is stored as
   simple HTML, and everything that comes back out is cleaned so a pasted
   chunk of a website cannot drag styling (or scripts) into a lesson.
   ------------------------------------------------------------------ */
(function(){
  "use strict";

  const ALLOWED = { B:1, STRONG:1, I:1, EM:1, U:1, S:1, BR:1, P:1, UL:1, OL:1, LI:1, SPAN:1, CODE:1, A:1 };
  const COLOURS = [
    ["Normal", ""],
    ["Red", "#C0392B"],
    ["Orange", "#B5651D"],
    ["Green", "#2E7B54"],
    ["Blue", "#1B5FA8"],
    ["Purple", "#6B3FA0"]
  ];

  /* Keep the tags we offer, drop everything else but its words. */
  function clean(node){
    const out = document.createElement("div");
    (function walk(from, to){
      Array.from(from.childNodes).forEach(n => {
        if (n.nodeType === 3){ to.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (!ALLOWED[tag]){
          const holder = document.createElement("span");
          walk(n, holder);
          while (holder.firstChild) to.appendChild(holder.firstChild);
          return;
        }
        const keep = document.createElement(tag === "STRONG" ? "b" : tag === "EM" ? "i" : tag.toLowerCase());
        if (tag === "SPAN" || tag === "A"){
          const colour = n.style && n.style.color;
          if (colour) keep.style.color = colour;
        }
        if (tag === "A"){
          const href = n.getAttribute("href") || "";
          if (/^https?:\/\//i.test(href)){ keep.setAttribute("href", href); keep.setAttribute("target", "_blank"); }
        }
        walk(n, keep);
        // a span with nothing special about it is just noise
        if (keep.tagName === "SPAN" && !keep.style.color){
          while (keep.firstChild) to.appendChild(keep.firstChild);
        } else {
          to.appendChild(keep);
        }
      });
    })(node, out);
    return out.innerHTML.replace(/<span><\/span>/g, "").trim();
  }

  /* Build the editor. onChange gets the cleaned HTML. */
  window.richText = function(initialHtml, onChange, opts){
    const o = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "rt";

    const bar = document.createElement("div");
    bar.className = "rt-bar";

    function tool(label, title, run, cls){
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rt-btn" + (cls ? " " + cls : "");
      b.title = title;
      b.innerHTML = label;
      b.addEventListener("mousedown", (e) => e.preventDefault());   // keep the selection
      b.addEventListener("click", () => { run(); box.focus(); fire(); });
      bar.appendChild(b);
      return b;
    }
    const cmd = (name, value) => { try{ document.execCommand(name, false, value || null); }catch(e){} };

    tool("<b>B</b>", "Bold (Ctrl+B)", () => cmd("bold"));
    tool("<i>I</i>", "Italic (Ctrl+I)", () => cmd("italic"));
    tool("<u>U</u>", "Underline (Ctrl+U)", () => cmd("underline"));
    tool("<s>S</s>", "Strikethrough", () => cmd("strikeThrough"));
    tool("&bull;&nbsp;List", "Bullet list", () => cmd("insertUnorderedList"));
    tool("1.&nbsp;List", "Numbered list", () => cmd("insertOrderedList"));
    if (o.code !== false) tool("&lt;/&gt;", "Show as code", () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const code = document.createElement("code");
      try{ range.surroundContents(code); }catch(e){}
    });

    const colour = document.createElement("select");
    colour.className = "rt-colour";
    colour.title = "Text colour";
    COLOURS.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c[1]; opt.textContent = c[0];
      colour.appendChild(opt);
    });
    colour.addEventListener("mousedown", () => { saved = save(); });
    colour.addEventListener("change", () => {
      restore(saved);
      cmd("foreColor", colour.value || "#3B352C");
      colour.selectedIndex = 0;
      box.focus(); fire();
    });
    bar.appendChild(colour);

    tool("&#10006;", "Remove formatting", () => cmd("removeFormat"), "rt-clear");

    const box = document.createElement("div");
    box.className = "rt-box";
    box.contentEditable = "true";
    box.spellcheck = true;
    if (o.rows) box.style.minHeight = (o.rows * 26) + "px";
    if (o.placeholder) box.dataset.placeholder = o.placeholder;
    box.innerHTML = initialHtml || "";

    let saved = null;
    function save(){
      const sel = window.getSelection();
      return (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;
    }
    function restore(range){
      if (!range) return;
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    }

    let timer = null;
    function fire(){
      clearTimeout(timer);
      timer = setTimeout(() => { if (onChange) onChange(clean(box)); }, 200);
    }
    box.addEventListener("input", fire);
    box.addEventListener("blur", () => { if (onChange) onChange(clean(box)); });
    // paste as plain words, so a copied web page cannot bring its styling in
    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      cmd("insertText", text);
    });

    wrap.appendChild(bar);
    wrap.appendChild(box);
    wrap.getHtml = () => clean(box);
    wrap.setHtml = (html) => { box.innerHTML = html || ""; };
    return wrap;
  };

  /* Turn stored HTML back into something safe, used when loading a lesson. */
  window.cleanRichText = function(html){
    const holder = document.createElement("div");
    holder.innerHTML = String(html || "");
    return clean(holder);
  };
})();
