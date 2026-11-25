/* =====================================================================
   iconpack.js: the icon pack, and finding something in it.

   IconPark by ByteDance, Apache 2.0 (iconpack/LICENSE.txt). About two
   thousand of its icons are kept in iconpack/icons.json, one file, roughly
   1MB and 210KB as it travels. It is fetched once, the first time something
   wants it, and the browser keeps it after that: most pages never do, and a
   lesson must not wait for it.

   Left out: the makers' own page furniture (sixty ways to align a box),
   other companies' logos, and what does not belong in a school. See
   iconpack/README.txt for how it was made.

   An icon from the pack is named "ip:<its name>" wherever one is saved, so it
   cannot be mistaken for one of the stickers in tasks-extra.js, which are
   just a name. Every icon is drawn in black and one colour, and the colour is
   given when it is drawn, so a card's picture can be the card's colour.
   ===================================================================== */
(function(){
  "use strict";
  let data = null, asked = null;
  const waiting = [];
  function load(){
    if (data) return Promise.resolve(true);
    if (asked) return asked;
    asked = fetch("iconpack/icons.json").then(r => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }).then(d => {
      data = d;
      waiting.splice(0).forEach(fn => { try{ fn(); }catch(e){ console.error(e); } });
      return true;
    }).catch(e => {
      /* The stickers are still there. Asked for again next time, in case the
         network was only away for a moment. */
      console.warn("The icon pack did not load", e);
      asked = null;
      return false;
    });
    return asked;
  }
  const bare = (name) => String(name || "").replace(/^ip:/, "");
  const has = (name) => /^ip:/.test(name || "") && !!data && Object.prototype.hasOwnProperty.call(data.icons, bare(name));
  /* The pack's lines are a twelfth of the icon wide, which beside the stickers
     looked like a child had gone over them in marker pen. */
  const BLUE = /#2F88FF/gi, SECOND = /#43CCF8/gi, LINE = /stroke-width="4"/g;
  function body(name, hue){
    const it = data && data.icons[bare(name)];
    return it ? it[1].replace(BLUE, hue || "#4587D0").replace(SECOND, "#FFD54A").replace(LINE, 'stroke-width="2.7"') : "";
  }
  function svg(name, size, hue){
    const b = body(name, hue);
    return b ? '<svg class="rv-icon" viewBox="0 0 48 48" width="' + size + '" height="' + size + '" aria-hidden="true">' + b + '</svg>' : "";
  }
  /* A picture of it, for a canvas: an <img> cannot be handed an svg element. */
  function dataUrl(name, px, hue){
    const b = body(name, hue);
    return b ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="' + px + '" height="' + px + '">' + b + '</svg>') : "";
  }
  /* "file-lock-one" to a person is "File lock". */
  const NUMBERS = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g;
  function label(name){
    const words = bare(name).replace(/-/g, " ").replace(NUMBERS, "").replace(/\s+/g, " ").trim() || bare(name);
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /* What a student types against what the pack calls things. The pack was
     named by people who draw interfaces, so it has no idea what ransomware
     is. The left side is matched from its start, so "encrypt" finds
     encryption. Best first on the right. */
  const MEANS = {
    "malware": "bug germs coronavirus", "virus": "coronavirus bug germs", "worm": "bug germs", "trojan": "bug", "spyware": "preview-open surveillance-cameras",
    "ransomware": "file-lock locking-computer", "adware": "ad", "keylogger": "keyboard-one enter-the-keyboard", "hack": "locking-computer people-unknown",
    "phish": "fishing email-security mail", "spam": "email-block inbox", "scam": "caution fishing", "blagg": "caution people-unknown", "shoulder": "preview-open eyes",
    "firewall": "protection shield fire", "antivirus": "shield-add bug", "secur": "shield lock security", "protect": "protect shield protection", "password": "key lock keyhole",
    "passcode": "key lock", "authent": "fingerprint face-recognition", "biometric": "fingerprint face-recognition eyes", "fingerprint": "fingerprint", "2fa": "message-security phone",
    "encrypt": "file-lock data-lock lock", "decrypt": "unlock key", "cipher": "key lock file-code", "caesar": "key crown", "key": "key key-one", "private": "personal-privacy lock",
    "privacy": "personal-privacy preview-close", "backup": "save cloud-storage", "update": "refresh download-computer", "patch": "repair tool", "penetration": "target aiming", "permission": "permissions lock",
    "cpu": "cpu chip", "processor": "cpu chip", "core": "cpu", "clock speed": "speed time", "clock": "time big-clock", "speed": "speed speed-one", "cache": "memory lightning", "register": "memory-one list",
    "alu": "calculator arithmetic", "control unit": "control", "fetch": "refresh cycle", "execute": "play", "decode": "file-code", "bus": "bus connection", "fde": "cycle refresh",
    "memory": "memory memory-one memory-card", "ram": "memory", "rom": "memory-one chip", "virtual memory": "hard-disk memory", "storage": "hard-disk disk database-point", "secondary": "hard-disk ssd", "hard": "hard-disk hdd",
    "ssd": "solid-state-disk ssd", "solid state": "solid-state-disk", "flash": "usb-memory-stick lightning", "magnetic": "magnet hard-disk", "optical": "cd record-disc", "disc": "cd record-disc", "disk": "disk hard-disk", "floppy": "save",
    "usb": "usb usb-memory-stick", "capacity": "database-proportion box", "kilobyte": "data", "megabyte": "data", "gigabyte": "data-all", "byte": "data", "bit": "data", "binary": "code data", "denary": "calculator", "hexadecimal": "pound-sign hashtag-key", "nibble": "data",
    "hardware": "computer devices chip", "software": "application code-computer", "computer": "computer laptop", "laptop": "laptop laptop-computer", "desktop": "computer", "tablet": "ipad pad", "ipad": "ipad", "smartphone": "phone", "mobile": "phone", "embedded": "chip washing-machine", "peripheral": "keyboard mouse",
    "input": "keyboard mouse microphone", "output": "printer speaker monitor-one", "process": "cpu setting", "keyboard": "keyboard keyboard-one", "mouse": "mouse mouse-one", "monitor": "computer tv", "screen": "computer tv", "printer": "printer", "scanner": "scan scanning", "sensor": "thermometer induction-lock", "actuator": "engineering-vehicle control", "microphone": "microphone", "webcam": "webcam", "camera": "camera",
    "operating": "system setting-computer", "utility": "toolkit tool", "driver": "type-drive connect", "user interface": "application layout-one", "gui": "application layout-one", "multitask": "more-app all-application", "file manag": "folder file-cabinet", "defrag": "hard-disk optimize", "compress": "compression zip", "lossy": "compression image-files", "lossless": "zip",
    "algorithm": "tree-diagram mindmap-map", "flowchart": "tree-diagram", "pseudocode": "file-code notes", "decompos": "split puzzle", "abstract": "filter circles-seven", "pattern": "puzzle grid-nine", "computational": "thinking-problem brain", "sequence": "ordered-list list-numbers", "selection": "branch fork", "if": "branch fork", "else": "branch-two fork", "condition": "branch",
    "iterat": "cycle refresh loop-once", "loop": "cycle refresh loop-once", "while": "cycle", "for loop": "cycle", "repeat": "cycle refresh", "variable": "box label", "constant": "lock pin", "assign": "label box", "function": "formula api", "procedure": "list setting", "parameter": "formula", "argument": "formula", "return": "return", "recurs": "cycle", "array": "grid-four list-view", "list": "list list-view", "dictionary": "book-one", "string": "text quote", "character": "text", "integer": "arithmetic calculator", "float": "calculator percentage", "real": "calculator", "boolean": "switch-one check-correct", "casting": "transform", "concatenat": "link merge", "operator": "add-subtract arithmetic", "arithmetic": "add-subtract arithmetic", "comparison": "balance", "logic": "api branch", "gate": "gate api", "truth": "table", "syntax": "code error", "error": "error bug", "debug": "bug repair", "test": "experiment check-correct", "trace": "table search", "validat": "check-correct protect", "program": "code code-computer", "code": "code code-brackets", "coding": "code code-laptop", "python": "code file-code", "html": "code web-page", "css": "color-filter web-page", "scratch": "puzzle cat", "compiler": "transform file-code", "interpreter": "translate", "translator": "translate", "ide": "code-computer", "library": "bookshelf", "sort": "ranking", "search": "search find", "bubble": "bubble-chart", "merge": "merge", "linear": "right search", "input valid": "check-correct",
    "network": "network-tree connection", "lan": "network-tree connection-point", "wan": "earth globe", "internet": "globe earth", "world wide web": "browser earth", "www": "browser", "website": "web-page browser", "web": "browser web-page", "browser": "browser", "url": "link", "hyperlink": "link", "dns": "address-book server", "ip address": "local address-book", "mac address": "label", "router": "router router-one", "switch": "network-drive switch", "hub": "connection-point", "server": "server data-server", "client": "computer", "peer": "people connection", "topology": "network-tree", "star": "star network-tree", "mesh": "connection", "ethernet": "ethernet-on", "wifi": "wifi", "wi-fi": "wifi", "wireless": "wifi signal", "bluetooth": "bluetooth", "cable": "plug ethernet-on", "fibre": "lightning ethernet-on", "bandwidth": "speed-one data-switching", "latency": "time hourglass", "packet": "mail-package box", "protocol": "cooperative-handshake agreement", "http": "browser", "ftp": "folder-upload", "smtp": "send-email", "email": "mail envelope", "cloud": "cloud-storage link-cloud", "streaming": "video play", "download": "download", "upload": "upload-computer", "host": "server",
    "data": "data data-all", "database": "database-network database-point", "record": "form list", "field": "form", "table": "table", "query": "database-search", "spreadsheet": "excel table", "cell": "cell", "formula": "formula", "chart": "chart-histogram chart-pie", "graph": "chart-line chart-graph", "average": "average", "information": "info", "knowledge": "brain book-open", "csv": "file-txt",
    "pixel": "mosaic grid-nine grid-sixteen", "image": "pic picture", "bitmap": "mosaic picture", "vector": "bezier-curve", "resolution": "full-screen grid-sixteen", "colour": "color-filter color-card", "color": "color-filter color-card", "metadata": "tag file-tips", "sound": "sound-wave sound", "sample": "sound-wave sinusoid", "audio": "audio-file sound", "video": "video", "animation": "movie play", "frame": "film", "ascii": "text", "unicode": "chinese english text", "font": "font-size text", "photo": "camera picture", "photoshop": "layers picture", "layer": "layers", "mask": "mask", "blender": "cube", "3d": "cube cube-three", "model": "cube",
    "law": "gavel balance-two", "legal": "gavel", "legislation": "gavel", "copyright": "copyright", "licen": "certificate agreement", "ethic": "balance-two balance", "moral": "balance-two", "misuse": "caution gavel", "gdpr": "data-lock", "freedom": "bird", "environment": "leaves green-new-energy", "e-waste": "recycling recycle-bin", "recycl": "recycling recycle-bin", "energy": "lightning battery-full", "power": "lightning power", "electric": "lightning plug", "carbon": "leaf", "digital divide": "imbalance", "cultur": "earth people", "social": "communication people", "social media": "message like", "cyberbull": "angry-face message-failed", "bully": "angry-face", "online safety": "shield people-safe", "stranger": "people-unknown", "grooming": "caution people-unknown", "report": "report attention", "block": "forbid", "footprint": "preview-open", "fake news": "newspaper-folding error", "cookie": "web-page", "addict": "game", "health": "heart", "wellbeing": "heart emotion-happy",
    "ai": "robot brain", "artificial": "robot brain", "machine learning": "brain robot", "robot": "robot robot-one", "automat": "robot setting", "internet of things": "devices wifi", "smart": "devices", "drone": "drone", "vr": "vr-glasses virtual-reality-glasses", "virtual": "vr-glasses",
    "teacher": "blackboard classroom", "student": "degree-hat user", "school": "school", "homework": "notebook", "exam": "file-question check-correct", "revise": "book-open", "revision": "book-open", "learn": "book-open degree-hat", "maths": "calculator add-subtract", "science": "experiment", "history": "history castle", "geography": "earth map-draw", "art": "color-card", "english": "english", "language": "translate", "money": "paper-money dollar", "business": "briefcase", "customer": "user", "happy": "emotion-happy", "sad": "emotion-unhappy", "important": "attention lightning", "idea": "tips light", "question": "help", "answer": "check-correct", "yes": "check-one", "no": "close-one", "time": "time", "fast": "speed-one lightning", "slow": "hourglass", "big": "maximum full-screen", "small": "zoom-out", "good": "thumbs-up good", "bad": "thumbs-down bad", "advantage": "thumbs-up add-one", "disadvantage": "thumbs-down reduce-one", "save": "save", "game": "game game-handle", "car": "car", "house": "home", "animal": "dog cat", "food": "hamburger apple-one", "football": "soccer football", "weather": "cloudy sunny", "space": "rocket planet", "volcano": "mountain fire", "river": "water", "country": "flag earth", "war": "shield flag", "king": "crown", "queen": "crown", "plant": "leaf sapling", "atom": "connection-point-two", "cell bio": "cell", "chemical": "experiment flask", "blood": "heart", "body": "user", "number": "calculator", "shape": "triangle square", "angle": "triangle-ruler", "measure": "ruler", "story": "book-open", "poem": "writing-fluently", "write": "pencil edit", "read": "read-book book-open", "letter": "text", "holiday": "beach-umbrella airplane", "family": "peoples", "hot": "fire", "cold": "snowflake"
  };
  const STOP = new Set(("a an the and or of to in on is are was be it its that this these those what which who how why when where does do did mean means meant use uses used using with for from by as at not no can "
    + "could would should will one two each any all some give example examples explain describe define definition name something someone thing things way ways they them their you your we our has have had if so than then into out up many much more most other also called").split(" "));
  const tokens = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  let index = null;
  function build(){
    if (index || !data) return index;
    index = Object.keys(data.icons).map(name => ({ name, parts: name.split("-").filter(p => !/^(one|two|three|four|five|six|seven|eight|nine|ten)$/.test(p) || name === p),
                                                   cat: data.cats[data.icons[name][0]].toLowerCase(), extra: /-(one|two|three|four|five|six|seven)$/.test(name) ? 1 : 0 }));
    return index;
  }
  /* The entries of MEANS a phrase starts, whole phrase first. `sure` is for
     choosing on a student's behalf: half a word is enough to search with, but
     photosynthesis is not a photo. */
  function meant(words, sure){
    const out = [];
    const phrase = words.join(" ");
    Object.keys(MEANS).forEach(k => {
      const multi = k.indexOf(" ") >= 0;
      const hit = multi ? phrase.indexOf(k) >= 0 || (words.length > 1 && k.indexOf(phrase) === 0)
        : words.some(w => k.length < 4 ? w === k || w === k + "s"
          : (w.indexOf(k) === 0 && (!sure || w.length - k.length <= 5)) || (!sure && w.length >= 3 && k.indexOf(w) === 0));
      if (hit) MEANS[k].split(" ").forEach((n, i) => out.push([n, 11 - i * 0.6 + (multi ? 2 : 0)]));
    });
    return out;
  }
  const stickers = () => (window.drawKit && window.drawKit.STAMPS) || [];
  /* Everything that goes with some words, best first: the stickers and the
     pack together. */
  function search(text, most){
    const words = tokens(text);
    if (!words.length) return [];
    const got = new Map();
    const give = (key, n) => got.set(key, Math.max(got.get(key) || 0, n));
    stickers().forEach(s => {
      const parts = tokens(s.label).concat(s.name);
      words.forEach(w => parts.forEach(p => { if (p === w) give(s.name, 11); else if (w.length > 2 && p.indexOf(w) === 0) give(s.name, 8); }));
    });
    if (build()){
      meant(words).forEach(([n, score]) => { if (data.icons[n]) give("ip:" + n, score); });
      index.forEach(it => {
        let total = 0;
        words.forEach(w => {
          let best = 0;
          const one = w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w;
          it.parts.forEach(p => {
            if (p === w || p === one) best = Math.max(best, 10);
            else if (w.length > 2 && p.indexOf(w) === 0) best = Math.max(best, 6);
            else if (w.length > 3 && p.indexOf(one) > 0) best = Math.max(best, 2.5);
          });
          if (!best && w.length > 3 && it.cat.indexOf(one) === 0) best = 1.5;
          total += best;
        });
        /* the plain one before its variations, and a whole name before part of one */
        if (total) give("ip:" + it.name, total / Math.sqrt(words.length) - it.extra * 0.4 - (it.parts.length - 1) * 0.35);
      });
    }
    return [...got.entries()].sort((a, b) => b[1] - a[1]).slice(0, most || 120).map(x => x[0]);
  }
  /* One picture for what is written on a card, or "". Only where something
     in the pack really is called that, or means it: a wrong picture is worse
     than none, and a student can always look for their own. */
  function guess(text){
    const words = tokens(text).filter(w => !STOP.has(w) && w.length > 1);
    if (!words.length || !build()) return "";
    const said = meant(words, true).filter(([n]) => data.icons[n]).sort((a, b) => b[1] - a[1])[0];
    if (said) return "ip:" + said[0];
    /* pairs as well, for ice cream, which the pack calls icecream */
    const tries = words.slice(0, -1).map((w, i) => w + words[i + 1]).concat(words);
    for (const w of tries){
      if (w.length < 3) continue;
      const one = /s$/.test(w) ? w.slice(0, -1) : w;
      const hit = index.find(it => it.parts.length === 1 && (it.parts[0] === w || it.parts[0] === one));
      if (hit) return "ip:" + hit.name;
    }
    return "";
  }
  window.iconPack = {
    load, has, svg, dataUrl, label, search, guess,
    ready: () => !!data,
    /* run once the pack is here, or now if it is */
    when(fn){ if (data) fn(); else { waiting.push(fn); load(); } },
    all: () => (build() || []).map(it => "ip:" + it.name)
  };
})();
