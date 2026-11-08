/* Two game tasks built for a class that needs something easy to start:
   Board game, a dice and a path of squares with a quick question on most
   of them, and Swipe, a pile of cards sorted left or right.

   Neither can be lost and neither ever stops anyone: a wrong answer shows
   the right one and the game carries on. What is saved is a few numbers
   (where the counter is, the coins, how many cards were right), never a
   picture. */
(function(){
  "use strict";

  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const shuffled = (n) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const clampInt = (n, lo, hi, d) => {
    const v = parseInt(n, 10);
    return isNaN(v) ? d : Math.max(lo, Math.min(hi, v));
  };

  /* ===================================================================
     BOARD GAME
     { type:"boardgame", title, task, squares, goal, questions:[{ q, options,
       answers:[i], why }] }
     goal is coins to bank across as many games as it takes, so one quick
     game is not the whole task. Answering that many questions also counts,
     so a student getting a lot wrong is never left behind.
     The questions are a quiz's own. The board is made from squares alone,
     so a teacher only writes questions: the same number always gives the
     same board, with shortcuts, sharks, power banks and chests in the same
     places, and every other square asks a question.
     =================================================================== */
  const SPECIAL = {
    shortcut: { icon: "\u{1F6A4}", name: "Shortcut", say: "A speedboat! Zoom forward 4 squares." },
    shark:    { icon: "\u{1F988}", name: "Phishing shark", say: "A phishing shark! Swim back 3 squares." },
    power:    { icon: "\u{1F50B}", name: "Power bank", say: "You found a power bank. Roll again!" },
    chest:    { icon: "\u{1F4B0}", name: "Treasure", say: "Treasure! 3 extra coins." }
  };
  /* What each square is. Kept away from the first and last few squares, so
     the start is a gentle question or two and the boat is never just past
     a shark. */
  function boardSquares(n){
    const out = [];
    for (let i = 0; i < n; i++){
      let kind = "question";
      if (i === 0) kind = "start";
      else if (i === n - 1) kind = "end";
      else if (i >= 3 && i < n - 3){
        if (i % 9 === 4 && i + 4 < n - 1) kind = "shortcut";
        else if (i % 11 === 7) kind = "shark";
        else if (i % 13 === 5) kind = "power";
        else if (i % 8 === 2) kind = "chest";
      }
      out.push(kind);
    }
    return out;
  }
  window.boardGameSquares = boardSquares;
  /* Whether a board game has had enough play, the same rule coverwork.js
     keeps: with a coin bank, filling it or answering as many questions as
     it holds coins; without one, reaching the boat once or ten questions. */
  window.boardGameDone = function(b, v){
    const goal = clampInt(b && b.goal, 0, 500, 0);
    const n = (k) => Math.max(0, parseInt(v && v[k], 10) || 0);
    if (goal) return n("bank") >= goal || n("asked") >= goal;
    return n("games") > 0 || n("asked") >= 10;
  };
  const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  window.rBoardGame = function(b, ctx){
    ctx = ctx || {};
    const N = clampInt(b.squares, 20, 48, 36);
    const COLS = 9;
    const kinds = boardSquares(N);
    const pool = (b.questions || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length > 1);

    let pos = 0, coins = 0, best = 0, games = 0, asked = 0, right = 0, bank = 0;
    const goal = clampInt(b.goal, 0, 500, 0);
    let busy = false, waitingAnswer = false, finished = false;
    let deck = [], touched = false;

    const s = make("section", "bgame");
    const wrap = make("div", "bg-wrap");
    s.appendChild(wrap);

    /* ---------- the board: a path that snakes from the top down ---------- */
    const board = make("div", "bg-board");
    board.style.setProperty("--bg-cols", String(COLS));
    const cells = [];
    for (let i = 0; i < N; i++){
      const row = Math.floor(i / COLS), along = i % COLS;
      const col = row % 2 === 0 ? along : COLS - 1 - along;
      const c = make("div", "bg-cell bg-" + kinds[i]);
      c.style.gridRow = String(row + 1);
      c.style.gridColumn = String(col + 1);
      const sp = SPECIAL[kinds[i]];
      c.appendChild(make("span", "bg-no", String(i + 1)));
      if (kinds[i] === "start") c.appendChild(make("span", "bg-icon", "\u{1F3DD}️"));
      else if (kinds[i] === "end") c.appendChild(make("span", "bg-icon", "⛵"));
      else if (sp) c.appendChild(make("span", "bg-icon", sp.icon));
      c.title = kinds[i] === "start" ? "Start" : kinds[i] === "end" ? "The boat home"
              : sp ? sp.name : "A question";
      cells.push(c);
      board.appendChild(c);
    }
    const token = make("span", "bg-token", "\u{1F9D1}");
    token.setAttribute("aria-hidden", "true");
    wrap.appendChild(board);

    /* ---------- beside it: the dice, the coins and the question ---------- */
    const side = make("div", "bg-side");
    const top = make("div", "bg-top");
    const dice = make("div", "bg-dice", DICE[5]);
    dice.setAttribute("aria-hidden", "true");
    const rollBtn = make("button", "btn-primary bg-roll", "Roll the dice");
    rollBtn.type = "button";
    top.appendChild(dice);
    top.appendChild(rollBtn);
    side.appendChild(top);
    const score = make("div", "bg-score");
    side.appendChild(score);
    const bankBox = make("div", "bg-bank");
    const bankBar = make("div", "bg-bank-bar");
    const bankFill = make("div", "bg-bank-fill");
    const bankSay = make("span", "bg-bank-say");
    bankBar.appendChild(bankFill);
    bankBox.appendChild(bankSay); bankBox.appendChild(bankBar);
    if (goal) side.appendChild(bankBox);
    const said = make("p", "bg-said");
    said.setAttribute("aria-live", "polite");
    side.appendChild(said);
    const card = make("div", "bg-card");
    card.hidden = true;
    side.appendChild(card);
    wrap.appendChild(side);

    function paintScore(){
      score.innerHTML = "";
      score.appendChild(make("span", "bg-coins", "\u{1FA99} " + coins + (coins === 1 ? " coin" : " coins")));
      score.appendChild(make("span", "bg-where", "Square " + (pos + 1) + " of " + N));
      if (games) score.appendChild(make("span", "bg-best", "Best: " + best + " coins"));
      if (goal){
        const full = bank >= goal;
        bankFill.style.width = Math.min(100, bank / goal * 100) + "%";
        bankBox.classList.toggle("full", full);
        bankSay.textContent = full ? "\u2B50 Coin bank full: " + bank + " coins banked. Keep playing for a high score!"
                                   : "Coin bank: " + bank + " of " + goal + " coins. Keep playing to fill it.";
      }
    }
    /* every coin goes in the bank as well as this game's score */
    function earn(n){ coins += n; bank += n; }
    function place(){
      cells[pos].appendChild(token);
      cells.forEach((c, i) => c.classList.toggle("here", i === pos));
      paintScore();
    }
    function say(t){ said.textContent = t; }
    function nextQuestion(){
      if (!pool.length) return null;
      if (!deck.length) deck = shuffled(pool.length);
      return pool[deck.pop()];
    }
    function canRoll(on){
      rollBtn.disabled = !on;
      rollBtn.classList.toggle("bg-ready", on);
    }

    async function hop(to){
      const step = to > pos ? 1 : -1;
      while (pos !== to){
        pos += step;
        place();
        await wait(170);
      }
    }
    async function land(fromSpecial){
      const kind = kinds[pos];
      if (kind === "end"){ finish(); return; }
      const sp = SPECIAL[kind];
      /* a square reached by a shortcut or a shark asks its question but
         does nothing else, or a shark and a shortcut could pass someone
         back and forth for ever */
      if (sp && !fromSpecial){
        say(sp.say);
        if (kind === "shortcut"){ await wait(500); await hop(Math.min(N - 1, pos + 4)); return land(true); }
        if (kind === "shark"){ await wait(500); await hop(Math.max(0, pos - 3)); return land(true); }
        if (kind === "chest"){ earn(3); paintScore(); }
        busy = false; canRoll(true);
        return;
      }
      ask();
    }
    function ask(){
      const q = nextQuestion();
      if (!q){ busy = false; canRoll(true); return; }
      waitingAnswer = true;
      card.hidden = false;
      card.innerHTML = "";
      card.appendChild(make("p", "bg-q", q.q));
      const opts = make("div", "bg-opts");
      const want = Array.isArray(q.answers) && q.answers.length ? Number(q.answers[0]) : 0;
      q.options.forEach((o, i) => {
        const btn = make("button", "bg-opt", o);
        btn.type = "button";
        btn.addEventListener("click", () => {
          if (!waitingAnswer) return;
          waitingAnswer = false;
          asked++;
          const ok = i === want;
          opts.querySelectorAll("button").forEach((x, k) => {
            x.disabled = true;
            if (k === want) x.classList.add("right");
            else if (k === i) x.classList.add("wrong");
          });
          if (ok){ right++; earn(2); }
          const fb = make("div", "bg-fb " + (ok ? "ok" : "no"));
          fb.appendChild(make("b", "", ok ? "Right! 2 coins." : "Not this time. The answer is: " + q.options[want]));
          if (q.why) fb.appendChild(make("p", "", q.why));
          card.appendChild(fb);
          say(ok ? "Nice one. Roll again." : "Never mind. Roll again.");
          paintScore();
          busy = false; canRoll(true);
          touched = true;
          ctx.changed && ctx.changed();
          rollBtn.focus({ preventScroll: true });
        });
        opts.appendChild(btn);
      });
      card.appendChild(opts);
      say("Answer the question to keep going.");
    }
    function finish(){
      finished = true;
      games++;
      best = Math.max(best, coins);
      card.hidden = false;
      card.innerHTML = "";
      card.appendChild(make("p", "bg-finish", "⛵ You made it to the boat!"));
      const more = goal && bank < goal
        ? " Your coin bank needs " + (goal - bank) + " more. Play again to fill it!"
        : " Play again for different questions, and try to beat your score.";
      card.appendChild(make("p", "bg-endsay", "You finished with " + coins + (coins === 1 ? " coin" : " coins") +
        (games > 1 ? ". Your best is " + best + "." : ".") + more));
      const again = make("button", "btn-primary", "Play again");
      again.type = "button";
      again.addEventListener("click", () => {
        pos = 0; coins = 0; finished = false;
        card.hidden = true; say("Roll the dice to start.");
        place(); busy = false; canRoll(true);
      });
      card.appendChild(again);
      say("");
      paintScore();
      busy = false; canRoll(false);
      touched = true;
      ctx.changed && ctx.changed();
    }

    rollBtn.addEventListener("click", async () => {
      if (busy || waitingAnswer || finished) return;
      busy = true; canRoll(false);
      card.hidden = true;
      say("");
      let n = 1;
      for (let i = 0; i < 8; i++){
        n = 1 + Math.floor(Math.random() * 6);
        dice.textContent = DICE[n - 1];
        dice.classList.toggle("spin", i % 2 === 0);
        await wait(70);
      }
      dice.classList.remove("spin");
      say("You rolled a " + n + ".");
      await hop(Math.min(N - 1, pos + n));
      await wait(200);
      await land(false);
    });

    say(pool.length ? "Roll the dice to start." : "This game has no questions yet.");
    place(); canRoll(true);

    return {
      section: s,
      get: () => touched ? { pos, coins, best, games, asked, right, bank } : null,
      set: (v) => {
        if (!v || typeof v !== "object") return;
        pos = clampInt(v.pos, 0, N - 1, 0);
        coins = Math.max(0, parseInt(v.coins, 10) || 0);
        best = Math.max(0, parseInt(v.best, 10) || 0);
        games = Math.max(0, parseInt(v.games, 10) || 0);
        asked = Math.max(0, parseInt(v.asked, 10) || 0);
        right = Math.max(0, parseInt(v.right, 10) || 0);
        bank = Math.max(0, parseInt(v.bank, 10) || 0);
        touched = true;
        /* back on the last square means they were looking at the end of a game */
        if (pos === N - 1){ pos = 0; coins = 0; }
        place();
      },
      done: () => window.boardGameDone(b, { games, asked, bank })
    };
  };

  /* ===================================================================
     SWIPE
     { type:"swipe", title, task, left, right, cards:[{ text, side:"left"|
       "right", why }] }
     One card at a time, dragged or flicked to a side, or sent there with
     the two buttons or the arrow keys. Every card is answered once a go,
     in a new order each time, with a streak to keep up.
     =================================================================== */
  window.rSwipe = function(b, ctx){
    ctx = ctx || {};
    const L = String(b.left || "No").trim() || "No";
    const R = String(b.right || "Yes").trim() || "Yes";
    const cards = (b.cards || []).filter(c => c && String(c.text || "").trim());
    let order = shuffled(cards.length), at = 0, got = 0, streak = 0, bestStreak = 0, rounds = 0, bestScore = 0;
    let touched = false, locked = false;

    const s = make("section", "swipe");
    const bar = make("div", "sw-bar");
    const count = make("span", "sw-count");
    const streakEl = make("span", "sw-streak");
    const scoreEl = make("span", "sw-score");
    bar.appendChild(count); bar.appendChild(streakEl); bar.appendChild(scoreEl);
    s.appendChild(bar);

    const table = make("div", "sw-table");
    const leftSign = make("div", "sw-sign sw-left", "← " + L);
    const rightSign = make("div", "sw-sign sw-right", R + " →");
    const deckEl = make("div", "sw-deck");
    table.appendChild(leftSign); table.appendChild(deckEl); table.appendChild(rightSign);
    s.appendChild(table);

    const btns = make("div", "sw-btns");
    const leftBtn = make("button", "btn-ghost sw-btn sw-btn-left", "← " + L);
    const rightBtn = make("button", "btn-ghost sw-btn sw-btn-right", R + " →");
    leftBtn.type = rightBtn.type = "button";
    btns.appendChild(leftBtn); btns.appendChild(rightBtn);
    s.appendChild(btns);
    const fb = make("div", "sw-fb");
    fb.setAttribute("aria-live", "polite");
    fb.hidden = true;
    s.appendChild(fb);

    let cardEl = null;
    function paintBar(){
      count.textContent = cards.length ? "Card " + Math.min(at + 1, cards.length) + " of " + cards.length : "";
      streakEl.textContent = "\u{1F525} Streak: " + streak;
      scoreEl.textContent = got + " right" + (bestScore ? ", best " + bestScore : "");
    }
    function deal(restoring){
      deckEl.innerHTML = "";
      cardEl = null;
      paintBar();
      if (!cards.length){ deckEl.appendChild(make("p", "sw-empty", "There are no cards yet.")); return; }
      if (at >= cards.length){ end(restoring); return; }
      cardEl = make("div", "sw-card");
      cardEl.tabIndex = 0;
      cardEl.setAttribute("role", "group");
      cardEl.setAttribute("aria-label", "Card " + (at + 1) + ". Press the left or right arrow key to choose.");
      cardEl.appendChild(make("p", "sw-text", cards[order[at]].text));
      /* the next card peeking out underneath, so it reads as a pile */
      if (at + 1 < cards.length) deckEl.appendChild(make("div", "sw-under"));
      deckEl.appendChild(cardEl);
      dragOn(cardEl);
      leftBtn.disabled = rightBtn.disabled = false;
    }
    function choose(side){
      if (locked || !cardEl) return;
      locked = true;
      const c = cards[order[at]];
      const ok = (c.side === "left" ? "left" : "right") === side;
      if (ok){ got++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
      cardEl.classList.add(side === "left" ? "gone-left" : "gone-right", ok ? "was-right" : "was-wrong");
      fb.hidden = false;
      fb.className = "sw-fb " + (ok ? "ok" : "no");
      fb.innerHTML = "";
      fb.appendChild(make("b", "", ok ? "Right!" : "It was " + (c.side === "left" ? L : R) + "."));
      if (c.why) fb.appendChild(make("span", "", " " + c.why));
      leftBtn.disabled = rightBtn.disabled = true;
      at++;
      touched = true;
      ctx.changed && ctx.changed();
      setTimeout(() => { locked = false; deal(); }, ok ? 650 : 1500);
    }
    function end(restoring){
      /* a finished pile put back from saved work was already counted */
      if (!restoring) rounds++;
      bestScore = Math.max(bestScore, got);
      paintBar();
      leftBtn.disabled = rightBtn.disabled = true;
      const box = make("div", "sw-end");
      box.appendChild(make("p", "sw-end-title", "You sorted every card!"));
      box.appendChild(make("p", "", got + " of " + cards.length + " right. Your longest streak was " + bestStreak + "."));
      const again = make("button", "btn-primary", "Shuffle and go again");
      again.type = "button";
      again.addEventListener("click", () => {
        order = shuffled(cards.length); at = 0; got = 0; streak = 0;
        fb.hidden = true; deal();
      });
      box.appendChild(again);
      deckEl.appendChild(box);
    }
    /* a card follows the pointer and leans the way it is going; let go far
       enough to one side and it is chosen, otherwise it springs back */
    function dragOn(el){
      let from = null;
      el.addEventListener("pointerdown", (e) => {
        if (locked) return;
        from = { x: e.clientX, w: deckEl.getBoundingClientRect().width || 300 };
        try{ el.setPointerCapture(e.pointerId); }catch(err){}
        el.classList.add("held");
      });
      el.addEventListener("pointermove", (e) => {
        if (!from) return;
        const dx = e.clientX - from.x;
        el.style.transform = "translateX(" + dx + "px) rotate(" + (dx / from.w * 18) + "deg)";
        leftSign.classList.toggle("lit", dx < -30);
        rightSign.classList.toggle("lit", dx > 30);
      });
      const letGo = (e) => {
        if (!from) return;
        const dx = e.clientX - from.x, far = from.w * 0.28;
        from = null;
        el.classList.remove("held");
        leftSign.classList.remove("lit"); rightSign.classList.remove("lit");
        el.style.transform = "";
        if (dx < -far) choose("left");
        else if (dx > far) choose("right");
      };
      el.addEventListener("pointerup", letGo);
      el.addEventListener("pointercancel", letGo);
      el.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft"){ e.preventDefault(); choose("left"); }
        if (e.key === "ArrowRight"){ e.preventDefault(); choose("right"); }
      });
    }
    leftBtn.addEventListener("click", () => choose("left"));
    rightBtn.addEventListener("click", () => choose("right"));
    deal();

    return {
      section: s,
      get: () => touched ? { at, order, got, streak, bestStreak, rounds, bestScore } : null,
      set: (v) => {
        if (!v || typeof v !== "object") return;
        /* the saved order only means anything if the pile is the same size */
        if (Array.isArray(v.order) && v.order.length === cards.length &&
            v.order.every(n => Number.isInteger(n) && n >= 0 && n < cards.length)) order = v.order.slice();
        at = clampInt(v.at, 0, cards.length, 0);
        got = Math.max(0, parseInt(v.got, 10) || 0);
        streak = Math.max(0, parseInt(v.streak, 10) || 0);
        bestStreak = Math.max(0, parseInt(v.bestStreak, 10) || 0);
        rounds = Math.max(0, parseInt(v.rounds, 10) || 0);
        bestScore = Math.max(0, parseInt(v.bestScore, 10) || 0);
        touched = true;
        fb.hidden = true;
        deal(true);
      },
      done: () => rounds > 0 || at >= Math.min(10, cards.length)
    };
  };
})();
