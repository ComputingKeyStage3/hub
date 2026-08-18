/* ------------------------------------------------------------------
   A small rich-text box for the lesson builder.

   Teachers get buttons rather than markdown. The result is stored as
   simple HTML, and everything that comes back out is cleaned so a pasted
   chunk of a website cannot drag styling (or scripts) into a lesson.
   ------------------------------------------------------------------ */
(function(){
  "use strict";

  const ALLOWED = { B:1, STRONG:1, I:1, EM:1, U:1, S:1, BR:1, P:1, UL:1, OL:1, LI:1, SPAN:1, CODE:1, A:1, FONT:1 };
  const COLOURS = [
    ["Automatic", ""],
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
        /* browsers still write <font color> for a colour change, so it is
           turned into a span that carries the colour as a style */
        const asTag = tag === "STRONG" ? "b" : tag === "EM" ? "i" : tag === "FONT" ? "span" : tag.toLowerCase();
        const keep = document.createElement(asTag);
        if (tag === "FONT"){
          const colour = n.getAttribute("color") || (n.style && n.style.color);
          if (colour) keep.style.color = colour;
        }
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
      b.addEventListener("click", () => { run(); box.focus(); fire(); if (typeof refreshState === "function") refreshState(); });
      bar.appendChild(b);
      return b;
    }
    const cmd = (name, value) => { try{ document.execCommand(name, false, value || null); }catch(e){} };

    const boldBtn = tool("<b>B</b>", "Bold (Ctrl+B)", () => cmd("bold"));
    const italicBtn = tool("<i>I</i>", "Italic (Ctrl+I)", () => cmd("italic"));
    const underBtn = tool("<u>U</u>", "Underline (Ctrl+U)", () => cmd("underline"));
    const strikeBtn = tool("<s>S</s>", "Strikethrough", () => cmd("strikeThrough"));
    tool("&bull;&nbsp;List", "Bullet list", () => cmd("insertUnorderedList"));
    tool("1.&nbsp;List", "Numbered list", () => cmd("insertOrderedList"));
    if (o.code !== false) tool("&lt;/&gt;", "Show as code", () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const code = document.createElement("code");
      try{ range.surroundContents(code); }catch(e){}
    });

    /* the colour picker: a swatch that opens a small palette */
    const colourWrap = document.createElement("span");
    colourWrap.className = "rt-colourwrap";
    const colourBtn = document.createElement("button");
    colourBtn.type = "button";
    colourBtn.className = "rt-btn rt-colourbtn";
    colourBtn.title = "Text colour";
    const swatch = document.createElement("span");
    swatch.className = "rt-swatch";
    colourBtn.appendChild(document.createTextNode("A"));
    colourBtn.appendChild(swatch);
    const palette = document.createElement("div");
    palette.className = "rt-palette";
    palette.hidden = true;
    COLOURS.forEach(c => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "rt-swatchbtn";
      opt.dataset.colour = c[1];
      opt.title = c[0];
      const dot = document.createElement("span");
      dot.className = "rt-dot";
      if (c[1]) dot.style.background = c[1];
      else dot.classList.add("rt-auto");
      opt.appendChild(dot);
      opt.appendChild(document.createTextNode(c[0]));
      opt.addEventListener("mousedown", (e) => e.preventDefault());
      opt.addEventListener("click", () => {
        restore(saved);
        /* "Automatic" puts it back to whatever the page uses */
        cmd("foreColor", c[1] || "currentColor");
        if (!c[1]) clearColour();
        palette.hidden = true;
        box.focus(); fire(); refreshState();
      });
      palette.appendChild(opt);
    });
    colourBtn.addEventListener("mousedown", (e) => { e.preventDefault(); saved = save(); });
    colourBtn.addEventListener("click", () => { palette.hidden = !palette.hidden; });
    document.addEventListener("pointerdown", (e) => {
      if (palette.hidden) return;
      if (colourWrap.contains(e.target)) return;
      palette.hidden = true;
    });
    colourWrap.appendChild(colourBtn);
    colourWrap.appendChild(palette);
    bar.appendChild(colourWrap);

    /* take the colour off, rather than painting the default over it */
    function clearColour(){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const holder = document.createElement("span");
      try{
        holder.appendChild(range.extractContents());
        holder.querySelectorAll("[style]").forEach(n => { n.style.removeProperty("color"); });
        holder.querySelectorAll("font[color]").forEach(n => { n.removeAttribute("color"); });
        while (holder.firstChild) range.insertNode(holder.lastChild);
      }catch(e){}
    }

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
    /* Show which options are already on for the text under the cursor, so
       the toolbar tells you the state rather than just setting it. */
    const stateOf = { bold:boldBtn, italic:italicBtn, underline:underBtn, strikeThrough:strikeBtn };
    function refreshState(){
      Object.keys(stateOf).forEach(name => {
        const btn = stateOf[name];
        if (!btn) return;
        let on = false;
        try{ on = document.queryCommandState(name); }catch(e){}
        btn.classList.toggle("on", !!on);
      });
      let colour = "";
      try{ colour = document.queryCommandValue("foreColor") || ""; }catch(e){}
      swatch.style.background = normaliseColour(colour) || "transparent";
    }
    function normaliseColour(v){
      if (!v) return "";
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
      if (!m) return v;
      const hex = "#" + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
      /* the everyday text colour counts as no colour at all */
      return COLOURS.some(c => c[1] && c[1].toUpperCase() === hex) ? hex : "";
    }
    box.addEventListener("keyup", refreshState);
    box.addEventListener("mouseup", refreshState);
    box.addEventListener("focus", refreshState);
    document.addEventListener("selectionchange", () => {
      if (document.activeElement === box) refreshState();
    });

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
