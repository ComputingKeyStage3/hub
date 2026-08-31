/* ------------------------------------------------------------------
   A small rich-text box for the lesson builder.

   Teachers get buttons rather than markdown. The result is stored as
   simple HTML, and everything that comes back out is cleaned so a pasted
   chunk of a website cannot drag styling (or scripts) into a lesson.
   ------------------------------------------------------------------ */
(function(){
  "use strict";

  const ALLOWED = { B:1, STRONG:1, I:1, EM:1, U:1, BR:1, P:1, UL:1, OL:1, LI:1, SPAN:1, CODE:1, A:1, FONT:1, DIV:1, IMG:1, KBD:1 };
  /* A swatch like the ones in Office: a row of hues, each with lighter and
     darker versions underneath. */
  const HUES = [
    ["Black",  "#000000"], ["Grey",   "#6B6B6B"], ["Red",    "#C0392B"],
    ["Orange", "#B5651D"], ["Yellow", "#B8930A"], ["Green",  "#2E7B54"],
    ["Teal",   "#1D7C7C"], ["Blue",   "#1B5FA8"], ["Purple", "#6B3FA0"],
    ["Pink",   "#B03A6E"]
  ];
  const SHADES = [0.65, 0.35, 0, -0.25, -0.45];   // lighter, then the hue, then darker
  function shade(hex, amount){
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (c) => amount >= 0
      ? Math.round(c + (255 - c) * amount)
      : Math.round(c * (1 + amount));
    r = mix(r); g = mix(g); b = mix(b);
    return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

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
          const size = n.style && n.style.fontSize;
          if (size) keep.style.fontSize = size;
        }
        if (tag === "IMG"){
          /* keep where it points and how big it was made */
          const src = n.getAttribute ? n.getAttribute("src") : "";
          if (src) keep.setAttribute("src", src);
          if (n.style && n.style.width) keep.style.width = n.style.width;
          if (n.style && n.style.height) keep.style.height = n.style.height;
        }
        if (tag === "OL" || tag === "UL"){
          const kind = n.style && n.style.listStyleType;
          if (kind) keep.style.listStyleType = kind;
        }
        if (tag === "FONT" && n.getAttribute && n.getAttribute("size")){
          const px = { "1":"11px","2":"13px","3":"","4":"18px","5":"22px","6":"28px","7":"36px" }[n.getAttribute("size")];
          if (px) keep.style.fontSize = px;
        }
        if (tag === "A"){
          const href = n.getAttribute("href") || "";
          if (/^https?:\/\//i.test(href)){ keep.setAttribute("href", href); keep.setAttribute("target", "_blank"); }
        }
        walk(n, keep);
        // a span with nothing special about it is just noise
        if (keep.tagName === "SPAN" && !keep.style.color && !keep.style.fontSize){
          while (keep.firstChild) to.appendChild(keep.firstChild);
        } else {
          to.appendChild(keep);
        }
      });
    })(node, out);
    /* An empty span, or one left with no colour at all, is invisible on the
       page and confuses everything downstream. Take them out. */
    let html = out.innerHTML;
    html = html.replace(/<span[^>]*>\s*<\/span>/g, "");
    html = html.replace(/<span style="color:\s*(transparent|rgba\([^)]*,\s*0\))[^"]*"[^>]*>/g, "<span>");
    html = html.replace(/<span><\/span>/g, "");
    return html.trim();
  }

  /* Opens a menu under the button that asked for it, or above when there is
     more room up there, and always inside the screen.

     These hang off document.body with a top worked out from the button, and
     nothing was stopping one running off the bottom: a menu 620px tall opened
     from a toolbar 375px down a 700px screen went 300px past the edge, with
     the box at the foot of it unreachable. Now it is capped to the room it has
     and scrolls inside itself. */
  function openMenuAt(btn, menu){
    menu.hidden = false;
    /* measured at its full size first, or the cap from last time is read back */
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
    const r = btn.getBoundingClientRect();
    const GAP = 6, EDGE = 10;
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const wanted = menu.offsetHeight;
    const goUp = wanted > below && above > below;
    /* never squeezed to nothing: below this it is worth scrolling instead */
    const room = Math.max(140, goUp ? above : below);
    const height = Math.min(wanted, room);
    if (wanted > room){
      menu.style.maxHeight = room + "px";
      menu.style.overflowY = "auto";
    }
    menu.style.top = ((goUp ? r.top - GAP - height : r.bottom + GAP) + window.scrollY) + "px";
    /* and kept on the screen sideways too, using its real width rather than a
       guess at one */
    const left = Math.min(r.left + window.scrollX,
                          window.innerWidth - menu.offsetWidth - EDGE);
    menu.style.left = Math.max(EDGE, left) + "px";
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
    /* The size is shown as a number rather than guessed at with two A buttons,
       and uses the same range in points as the whiteboard so the two places a
       teacher sets type size agree with each other. */
    const MIN_TEXT = 8, MAX_TEXT = 96;
    const sizeWrap = document.createElement("span");
    sizeWrap.className = "rt-sizes";
    const sizeDown = document.createElement("button");
    sizeDown.type = "button"; sizeDown.className = "rt-btn rt-step";
    sizeDown.textContent = "−"; sizeDown.title = "Smaller";
    const sizeBox = document.createElement("input");
    sizeBox.type = "number"; sizeBox.className = "rt-sizenum";
    sizeBox.min = String(MIN_TEXT); sizeBox.max = String(MAX_TEXT);
    sizeBox.title = "Size in points";
    const sizeUp = document.createElement("button");
    sizeUp.type = "button"; sizeUp.className = "rt-btn rt-step";
    sizeUp.textContent = "+"; sizeUp.title = "Bigger";
    const sizeUnit = document.createElement("span");
    sizeUnit.className = "rt-sizeunit"; sizeUnit.textContent = "pt";
    sizeWrap.appendChild(sizeDown); sizeWrap.appendChild(sizeBox);
    sizeWrap.appendChild(sizeUnit); sizeWrap.appendChild(sizeUp);
    bar.appendChild(sizeWrap);
    [sizeDown, sizeUp, sizeBox].forEach(n =>
      n.addEventListener("mousedown", (e) => { if (n !== sizeBox) e.preventDefault(); saved = save(); }));
    sizeDown.addEventListener("click", () => stepSize(-2));
    sizeUp.addEventListener("click", () => stepSize(2));
    sizeBox.addEventListener("change", () => applySize(parseInt(sizeBox.value, 10)));
    tool("&bull;", "Bullet list", () => { cmd("insertUnorderedList"); refreshState(); }, "rt-bullet");
    /* numbered lists come in two kinds, so this one offers a choice */
    const numBtn = tool("1.", "Numbered list", () => {}, "rt-numbtn");
    const numMenu = document.createElement("div");
    numMenu.className = "rt-palette rt-nummenu";
    numMenu.hidden = true;
    [["1. 2. 3.", ""], ["a. b. c.", "lower-alpha"]].forEach(pair => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rt-auto-btn";
      b.textContent = pair[0];
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        restore(saved);
        cmd("insertOrderedList");
        if (pair[1]) markList(pair[1]);
        numMenu.hidden = true;
        box.focus(); fire();
      });
      numMenu.appendChild(b);
    });
    document.body.appendChild(numMenu);
    numBtn.addEventListener("mousedown", () => { saved = save(); });
    numBtn.addEventListener("click", () => {
      if (!numMenu.hidden){ numMenu.hidden = true; return; }
      openMenuAt(numBtn, numMenu);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!numMenu.hidden && !numMenu.contains(e.target) && e.target !== numBtn) numMenu.hidden = true;
    });

    /* remember which kind of numbering a list uses */
    function markList(style){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      let n = sel.getRangeAt(0).startContainer;
      while (n && n !== box && n.tagName !== "OL") n = n.parentNode;
      if (n && n.tagName === "OL") n.style.listStyleType = style;
    }
    /* What size the writing under the cursor actually is, in points. Read from
       the page rather than from queryCommandValue, which only ever answers on
       the old 1 to 7 scale and cannot say what that means in points. */
    function sizeNow(){
      const sel = window.getSelection();
      let n = (sel && sel.rangeCount) ? sel.getRangeAt(0).commonAncestorContainer : box;
      if (n && n.nodeType === 3) n = n.parentNode;
      if (!n || !box.contains(n)) n = box;
      const px = parseFloat(getComputedStyle(n).fontSize) || 16;
      return Math.round(px * 0.75);            // 96dpi: 1pt is 4/3 of a pixel
    }
    /* Wrapped by hand, the same as the colour, because execCommand is
       deprecated, works differently between browsers, and cannot set a size
       in points at all. */
    function applySize(pt){
      if (isNaN(pt)) { showSize(); return; }
      const want = Math.max(MIN_TEXT, Math.min(MAX_TEXT, pt));
      const range = saved || lastRange;
      if (!range || range.collapsed){ showSize(want); return; }
      restore(range);
      let contents;
      try{ contents = range.extractContents(); }
      catch(e){ showSize(); return; }
      contents.querySelectorAll && contents.querySelectorAll("[style*='font-size'], font[size]")
        .forEach(n => {
          if (n.style) n.style.fontSize = "";
          if (n.removeAttribute) n.removeAttribute("size");
        });
      const span = document.createElement("span");
      span.style.fontSize = want + "pt";
      span.appendChild(contents);
      range.insertNode(span);
      const sel = window.getSelection();
      sel.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(span);
      sel.addRange(after);
      saved = after.cloneRange();
      showSize(want);
      box.focus(); fire();
    }
    function stepSize(by){ applySize(sizeNow() + by); }
    function showSize(n){ sizeBox.value = String(n || sizeNow()); }
    /* Pressing it again turns it off: the writing inside the tag is put back
       where the tag was, which is what people expect from a toggle. */
    function insideTag(name){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      let n = sel.getRangeAt(0).commonAncestorContainer;
      while (n && n !== box){
        if (n.nodeType === 1 && n.tagName === name) return n;
        n = n.parentNode;
      }
      return null;
    }
    function unwrap(node){
      const parent = node.parentNode;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
    }
    if (o.code !== false) tool("&lt;/&gt;", "Show as code", () => {
      const already = insideTag("CODE");
      if (already){ unwrap(already); box.focus(); fire(); refreshState(); return; }
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const code = document.createElement("code");
      try{ range.surroundContents(code); }catch(e){}
      box.focus(); fire(); refreshState();
    }, "rt-code");

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
    /* The palette is put on the page itself, not inside the toolbar, so
       nothing further down the page can cover it. */
    const palette = document.createElement("div");
    palette.className = "rt-palette";
    palette.hidden = true;
    /* Colour is put on by hand rather than through execCommand, which is
       deprecated and behaves differently from browser to browser: it was
       sometimes doing nothing at all. Wrapping the chosen words in a span
       always works, and always survives being saved and read back. */
    function paintColour(range, colour){
      if (!range || range.collapsed) return false;
      let contents;
      try{ contents = range.extractContents(); }
      catch(e){ return false; }
      /* anything already coloured inside loses its own, so the new one shows */
      contents.querySelectorAll && contents.querySelectorAll("[style*='color'], font[color]")
        .forEach(n => {
          if (n.style) n.style.color = "";
          if (n.removeAttribute) n.removeAttribute("color");
        });
      const span = document.createElement("span");
      span.style.color = colour;
      span.appendChild(contents);
      range.insertNode(span);
      /* leave the words selected, so another colour can be tried at once */
      const sel = window.getSelection();
      sel.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(span);
      sel.addRange(after);
      saved = after.cloneRange();
      return true;
    }

    function pick(colour){
      if (!saved) saved = lastRange;
      restore(saved);
      /* Automatic means take the colour off, never paint a see-through one */
      if (colour && !/transparent|rgba\([^)]*,\s*0\s*\)/.test(colour)){
        if (saved && saved.collapsed){
          /* Nothing selected, so they are mid-sentence: start a coloured span
             at the cursor and carry on typing inside it, rather than stopping. */
          const span = document.createElement("span");
          span.style.color = colour;
          span.appendChild(document.createTextNode("\u200B"));
          saved.insertNode(span);
          const sel = window.getSelection();
          const put = document.createRange();
          put.setStart(span.firstChild, 1);
          put.collapse(true);
          sel.removeAllRanges(); sel.addRange(put);
          saved = put.cloneRange();
        }
        else if (!paintColour(saved, colour)) cmd("foreColor", colour);
      }
      else clearColour();
      palette.hidden = true;
      box.focus(); fire(); refreshState();
    }
    const auto = document.createElement("button");
    auto.type = "button";
    auto.className = "rt-auto-btn";
    auto.textContent = "Automatic";
    auto.addEventListener("mousedown", (e) => e.preventDefault());
    auto.addEventListener("click", () => pick(""));
    palette.appendChild(auto);

    const grid = document.createElement("div");
    grid.className = "rt-grid";
    SHADES.forEach(amount => {
      HUES.forEach(h => {
        const colour = amount === 0 ? h[1] : shade(h[1], amount);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "rt-cell";
        cell.style.background = colour;
        cell.title = h[0];
        cell.dataset.colour = colour;
        cell.addEventListener("mousedown", (e) => e.preventDefault());
        cell.addEventListener("click", () => pick(colour));
        grid.appendChild(cell);
      });
    });
    palette.appendChild(grid);

    const more = document.createElement("label");
    more.className = "rt-more";
    more.textContent = "More colours";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.addEventListener("mousedown", (e) => e.stopPropagation());
    picker.addEventListener("input", () => pick(picker.value));
    picker.addEventListener("change", () => pick(picker.value));
    more.appendChild(picker);
    palette.appendChild(more);
    document.body.appendChild(palette);
    colourBtn.addEventListener("mousedown", (e) => { e.preventDefault(); saved = save(); });
    colourBtn.addEventListener("click", () => {
      if (!palette.hidden){ palette.hidden = true; return; }
      openMenuAt(colourBtn, palette);
    });
    document.addEventListener("pointerdown", (e) => {
      if (palette.hidden) return;
      /* The palette hangs off document.body so nothing can cover it, which
         puts it outside colourWrap. Checking only colourWrap counted a press
         on a swatch as a press outside, so the palette was hidden between
         mousedown and mouseup: with the swatch gone no click ever completed
         and pick() never ran. The colour button did nothing, and the colour
         code itself was never at fault. */
      if (colourWrap.contains(e.target) || palette.contains(e.target)) return;
      palette.hidden = true;
    });
    colourWrap.appendChild(colourBtn);
    bar.appendChild(colourWrap);

    /* ---------- keys off the keyboard ----------
       Lessons keep naming keys to press, and writing Enter as ordinary words
       reads as part of the sentence. These go in as <kbd>, which is what the
       tag is for, and are drawn to look like the key itself. */
    /* The symbol printed on the key itself, alongside its name, so a student
       can match what they read to what is in front of them. Only the ones with
       a symbol everybody agrees on: Ctrl and Alt are left as words, because the
       symbols for those are a Mac convention and these are Windows machines. */
    const KEY_SYMBOL = {
      "Enter":"↵", "Shift":"⇧", "Tab":"⇥", "Backspace":"⌫",
      "Delete":"⌦", "Caps Lock":"⇪", "Space":"␣"
    };
    const keyLabel = (name) => (KEY_SYMBOL[name] ? KEY_SYMBOL[name] + " " + name : name);
    const KEYS = ["Enter","Esc","Tab","Space","Shift","Ctrl","Alt","Backspace",
                  "Delete","Caps Lock","F1","F5","F11",
                  "↑","↓","←","→"];
    const COMBOS = [["Ctrl","C"],["Ctrl","V"],["Ctrl","X"],["Ctrl","Z"],["Ctrl","Y"],
                    ["Ctrl","S"],["Ctrl","A"],["Ctrl","F"],["Ctrl","P"],
                    ["Shift","Enter"],["Alt","Tab"],["Ctrl","Shift","Esc"]];

    function insertKeys(parts){
      const range = saved || lastRange;
      if (!range) return;
      restore(range);
      const frag = document.createDocumentFragment();
      parts.forEach((label, i) => {
        if (i) frag.appendChild(document.createTextNode(" + "));
        const k = document.createElement("kbd");
        k.textContent = keyLabel(label);
        frag.appendChild(k);
      });
      /* a space after it, or the next word is written hard against the key */
      frag.appendChild(document.createTextNode(" "));
      /* the fragment is emptied by insertNode, so what to put the cursor after
         has to be held on to first */
      const last = frag.lastChild;
      try{
        range.deleteContents();
        range.insertNode(frag);
        const sel = window.getSelection();
        const after = document.createRange();
        after.setStartAfter(last);
        after.collapse(true);
        sel.removeAllRanges(); sel.addRange(after);
        saved = after.cloneRange();
      }catch(e){}
      keyMenu.hidden = true;
      box.focus(); fire();
    }

    const keyWrap = document.createElement("span");
    keyWrap.className = "rt-keywrap";
    const keyBtn = document.createElement("button");
    keyBtn.type = "button";
    keyBtn.className = "rt-btn rt-keybtn";
    keyBtn.title = "Put a key in, like Enter or Ctrl + C";
    keyBtn.textContent = "⌨";
    const keyMenu = document.createElement("div");
    keyMenu.className = "rt-palette rt-keymenu";
    keyMenu.hidden = true;

    function keySection(name, list, asCombo){
      const h = document.createElement("p");
      h.className = "rt-keyhead";
      h.textContent = name;
      keyMenu.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "rt-keygrid" + (asCombo ? " wide" : "");
      list.forEach(entry => {
        const parts = asCombo ? entry : [entry];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rt-keycell";
        parts.forEach((pp, i) => {
          if (i) b.appendChild(document.createTextNode(" + "));
          const k = document.createElement("kbd");
          k.textContent = keyLabel(pp);
          b.appendChild(k);
        });
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => insertKeys(parts));
        grid.appendChild(b);
      });
      keyMenu.appendChild(grid);
    }
    keySection("Keys", KEYS, false);
    keySection("Together", COMBOS, true);

    /* No list can hold every key, so one can be typed instead. */
    const ownRow = document.createElement("div");
    ownRow.className = "rt-keyown";
    const ownIn = document.createElement("input");
    ownIn.type = "text";
    ownIn.placeholder = "Another key";
    const ownGo = document.createElement("button");
    ownGo.type = "button";
    ownGo.className = "rt-auto-btn";
    ownGo.textContent = "Add";
    const addOwn = () => {
      const v = ownIn.value.trim();
      if (!v) return;
      /* "Ctrl + Alt + D" typed by hand becomes three keys, same as the list */
      insertKeys(v.split("+").map(x => x.trim()).filter(Boolean));
      ownIn.value = "";
    };
    ownGo.addEventListener("mousedown", (e) => e.preventDefault());
    ownGo.addEventListener("click", addOwn);
    ownIn.addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); addOwn(); } });
    ownRow.appendChild(ownIn); ownRow.appendChild(ownGo);
    keyMenu.appendChild(ownRow);
    document.body.appendChild(keyMenu);

    keyBtn.addEventListener("mousedown", (e) => { e.preventDefault(); saved = save(); });
    keyBtn.addEventListener("click", () => {
      if (!keyMenu.hidden){ keyMenu.hidden = true; return; }
      openMenuAt(keyBtn, keyMenu);
    });
    /* The menu hangs off document.body so nothing can cover it, which puts it
       outside keyWrap. It has to be spared here or pressing a key in it would
       count as a press outside, hiding the menu between mousedown and mouseup
       so the click never landed. */
    document.addEventListener("pointerdown", (e) => {
      if (keyMenu.hidden) return;
      if (keyWrap.contains(e.target) || keyMenu.contains(e.target)) return;
      keyMenu.hidden = true;
    });
    keyWrap.appendChild(keyBtn);
    bar.appendChild(keyWrap);

    /* take the colour off, rather than painting the default over it */
    /* Whether the selection covers everything inside this element. */
    function fills(range, node){
      try{
        const r = document.createRange();
        r.selectNodeContents(node);
        return range.compareBoundaryPoints(Range.START_TO_START, r) <= 0
            && range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
      }catch(e){ return false; }
    }
    /* Automatic: put the writing back to whatever the page's own colour is, so
       it stays readable in both light and dark mode.

       The colour is nearly always on a span wrapped *around* the words rather
       than on anything inside them. Taking the contents out only ever reached
       the children, so the words went back inside the same coloured wrapper
       and the button looked as though it did nothing. Wrappers the selection
       fills are dealt with first, before anything is moved. */
    function clearColour(){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;

      let up = range.commonAncestorContainer;
      if (up.nodeType === 3) up = up.parentNode;
      const covered = [];
      while (up && up !== box && box.contains(up)){
        if (fills(range, up)) covered.push(up);
        up = up.parentNode;
      }
      covered.forEach(n => {
        if (n.style) n.style.removeProperty("color");
        if (n.removeAttribute) n.removeAttribute("color");
      });

      /* Is any colour still reaching these words from a wrapper the selection
         only partly fills? Stripping that wrapper would uncolour words outside
         the selection too, so it is overridden instead. */
      let outside = false;
      let p = range.startContainer;
      if (p.nodeType === 3) p = p.parentNode;
      while (p && p !== box && box.contains(p)){
        if (p.style && p.style.color){ outside = true; break; }
        p = p.parentNode;
      }

      const holder = document.createElement("span");
      try{
        holder.appendChild(range.extractContents());
        holder.querySelectorAll("[style]").forEach(n => { n.style.removeProperty("color"); });
        holder.querySelectorAll("font[color]").forEach(n => { n.removeAttribute("color"); });
        if (outside){
          /* var(--text) and not a fixed colour, so it follows the theme rather
             than being black on a dark page. */
          const back = document.createElement("span");
          back.style.color = "var(--text)";
          while (holder.firstChild) back.appendChild(holder.firstChild);
          range.insertNode(back);
        } else {
          while (holder.firstChild) range.insertNode(holder.lastChild);
        }
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
    /* so the number reads the box's own size before anyone has clicked in it */
    try{ showSize(); }catch(e){}

    let saved = null;
    /* The words being worked on are remembered whenever the selection moves
       inside this box. Relying on a single mousedown to catch them was
       fragile: if anything else handled that event first, there was nothing
       to colour and the button appeared to do nothing at all. */
    let lastRange = null;
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (box.contains(r.commonAncestorContainer)) lastRange = r.cloneRange();
    });
    function save(){
      const sel = window.getSelection();
      if (sel && sel.rangeCount){
        const r = sel.getRangeAt(0);
        if (box.contains(r.commonAncestorContainer)) return r.cloneRange();
      }
      return lastRange;      // whatever was last worked on in this box
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
    const stateOf = { bold:boldBtn, italic:italicBtn, underline:underBtn };
    function refreshState(){
      /* so the number always says what the writing under the cursor really is */
      try{ showSize(); }catch(e){}
      Object.keys(stateOf).forEach(name => {
        const btn = stateOf[name];
        if (!btn) return;
        let on = false;
        try{ on = document.queryCommandState(name); }catch(e){}
        btn.classList.toggle("on", !!on);
      });
      /* lists and code show as on when the cursor is inside one, so pressing
         the button again visibly turns them off */
      [["insertUnorderedList", ".rt-bullet"], ["insertOrderedList", ".rt-number"]].forEach(pair => {
        const btn = bar.querySelector(pair[1]);
        if (!btn) return;
        let on = false;
        try{ on = document.queryCommandState(pair[0]); }catch(e){}
        btn.classList.toggle("on", !!on);
      });
      const codeBtn = bar.querySelector(".rt-code");
      if (codeBtn) codeBtn.classList.toggle("on", !!insideTag("CODE"));
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
      return hex;
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
    box.addEventListener("keydown", (e) => {
      if (e.key === "Tab"){
        /* only indent when there is already an item above to sit under */
        const sel = window.getSelection();
        let li = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
        while (li && li !== box && li.tagName !== "LI") li = li.parentNode;
        if (li && li.tagName === "LI"){
          e.preventDefault();
          if (e.shiftKey){ cmd("outdent"); }
          else if (li.previousElementSibling){ cmd("indent"); subStyle(li); }
          fire();
        }
        return;
      }
      if (e.key === "Enter" && !e.shiftKey){
        /* a plain Enter starts a new line, not a whole new paragraph */
        const sel = window.getSelection();
        let li = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
        while (li && li !== box && li.tagName !== "LI") li = li.parentNode;
        if (li && li.tagName === "LI") return;      // lists behave normally
        e.preventDefault();
        cmd("insertLineBreak");
        fire();
      }
    });
    /* a nested list is shown differently from the one above it */
    function subStyle(li){
      let list = li.parentNode;
      if (!list) return;
      const outer = list.parentNode && list.parentNode.closest ? list.parentNode.closest("ol, ul") : null;
      if (list.tagName === "UL") list.style.listStyleType = "circle";
      else if (list.tagName === "OL"){
        const above = outer && outer.style ? outer.style.listStyleType : "";
        list.style.listStyleType = (above === "lower-alpha") ? "decimal" : "lower-alpha";
      }
    }

    /* A picture on the clipboard becomes part of the writing. It is kept as
       a data url, which is only sensible for something small, so anything
       large is scaled down before it goes in. */
    box.addEventListener("paste", (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const item of items){
        if (item.type && item.type.indexOf("image") === 0){
          e.preventDefault();
          /* Pictures belong in lessons, not in a student's notes: they would
             fill the database, and there is a screenshot task for handing one
             in. Nothing is pasted, and they are told why. */
          if (o.pictures === false){
            if (window.hubSay) window.hubSay("You cannot paste a picture here",
              "Use a screenshot task to hand a picture in.");
            else alert("You cannot paste a picture here.");
            return;
          }
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const probe = new Image();
            probe.onload = () => {
              /* no wider than 900px, so a screenshot does not fill the database */
              const scale = Math.min(1, 900 / probe.width);
              const c = document.createElement("canvas");
              c.width = Math.round(probe.width * scale);
              c.height = Math.round(probe.height * scale);
              c.getContext("2d").drawImage(probe, 0, 0, c.width, c.height);
              const img = document.createElement("img");
              img.src = c.toDataURL("image/jpeg", 0.82);
              img.style.width = Math.min(420, c.width) + "px";
              box.focus();
              document.execCommand("insertHTML", false, img.outerHTML);
              fire();
            };
            probe.src = reader.result;
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    });

    /* Clicking a picture offers a size to change it to. */
    box.addEventListener("click", (e) => {
      if (!e.target || e.target.tagName !== "IMG") return;
      const img = e.target;
      const old = box.querySelector(".rt-imgsize");
      if (old) old.remove();
      const tools = document.createElement("span");
      tools.className = "rt-imgsize";
      tools.contentEditable = "false";
      [["Small", 220], ["Medium", 420], ["Large", 680]].forEach(pair => {
        const b2 = document.createElement("button");
        b2.type = "button";
        b2.textContent = pair[0];
        b2.addEventListener("mousedown", (ev) => ev.preventDefault());
        b2.addEventListener("click", () => {
          img.style.width = pair[1] + "px";
          img.style.height = "auto";
          tools.remove();
          fire();
        });
        tools.appendChild(b2);
      });
      const r = img.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      tools.style.left = (r.left - wrapRect.left) + "px";
      tools.style.top = (r.bottom - wrapRect.top + 4) + "px";
      wrap.appendChild(tools);
      setTimeout(() => {
        document.addEventListener("pointerdown", function away(ev){
          if (!tools.contains(ev.target)){ tools.remove(); document.removeEventListener("pointerdown", away); }
        });
      }, 0);
    });

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
