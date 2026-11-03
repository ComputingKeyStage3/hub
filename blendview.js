/* The 3D view of a Blender file handed in, for a teacher marking it.

   blend.js read the scene on the student's computer and kept it as packed
   numbers (stats.geo). This unpacks it, redoes the modifiers it can (Mirror,
   Array, Subdivision Surface), and draws it the way Blender's own solid view
   does: Blender's grey, its floor grid and red and green axes, the camera
   and lights as outlines, the picked object outlined in orange, and the
   same mouse and number pad controls a teacher who knows Blender reaches
   for without thinking.

   Drawn with WebGL straight, not a library. A library is the size of the
   rest of the site, and this needs flat triangles, lines and one light.

   window.blendView(geo, stats, { onPick }) returns { el, select(i), close() }
   or null when there is nothing to draw. close() gives the graphics
   context back: a browser only allows a handful at once, and a teacher
   marking a class opens one per student. */
(function(){

  /* ---------- unpacking what blend.js packed ---------- */
  function bytes(s){
    const bin = atob(s || ""), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const u16 = (s) => { const b = bytes(s); return new Uint16Array(b.buffer, 0, b.length >> 1); };
  const u32 = (s) => { const b = bytes(s); return new Uint32Array(b.buffer, 0, b.length >> 2); };
  function unpackMesh(m){
    const q = u16(m.p), n = m.nv, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = m.lo[k] + q[i * 3 + k] / 65535 * m.sz[k];
    const corners = Uint32Array.from(m.cw === 4 ? u32(m.c) : u16(m.c));
    const sizes = Uint32Array.from(m.sw === 2 ? u16(m.s) : bytes(m.s));
    const nf = sizes.length;
    const mat = m.m ? bytes(m.m) : new Uint8Array(nf);
    const smooth = new Uint8Array(nf);
    if (m.sm) smooth.fill(1);
    else if (m.smb){ const b = bytes(m.smb); for (let i = 0; i < nf; i++) smooth[i] = (b[i >> 3] >> (i & 7)) & 1; }
    return { pos, sizes, corners, mat, smooth };
  }

  /* ---------- modifiers, redone in the order the stack has them ---------- */
  function faceStarts(g){
    const st = new Uint32Array(g.sizes.length);
    let a = 0;
    for (let i = 0; i < g.sizes.length; i++){ st[i] = a; a += g.sizes[i]; }
    return st;
  }
  /* Mirror across the object's own X, Y and/or Z. Corners lying on the
     mirror (within its merge distance) are shared by both halves, as
     Blender merges them, so a Subdivision Surface after it has no seam. */
  function mirror(g, m){
    for (let axis = 0; axis < 3; axis++){
      if (!(m.a & (1 << axis))) continue;
      const n = g.pos.length / 3;
      const pos = new Float32Array(n * 6);
      pos.set(g.pos);
      const twin = new Uint32Array(n);
      let next = n;
      for (let i = 0; i < n; i++){
        if (m.merge && Math.abs(g.pos[i * 3 + axis]) <= m.tol){ twin[i] = i; continue; }
        twin[i] = next;
        for (let k = 0; k < 3; k++) pos[next * 3 + k] = k === axis ? -g.pos[i * 3 + k] : g.pos[i * 3 + k];
        next++;
      }
      const corners = new Uint32Array(g.corners.length * 2);
      corners.set(g.corners);
      const starts = faceStarts(g);
      let o = g.corners.length;
      /* Each mirrored face runs the other way round, or it would face inwards. */
      for (let f = 0; f < g.sizes.length; f++)
        for (let k = g.sizes[f] - 1; k >= 0; k--) corners[o++] = twin[g.corners[starts[f] + k]];
      const dbl = (a) => { const out = new a.constructor(a.length * 2); out.set(a); out.set(a, a.length); return out; };
      g = { pos: pos.slice(0, next * 3), sizes: dbl(g.sizes), corners, mat: dbl(g.mat), smooth: dbl(g.smooth) };
    }
    return g;
  }
  function boxOf(pos){
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++){
      const x = pos[i + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x;
    }
    return { lo, hi };
  }
  /* Copies in a row. A relative offset is so many times the model's own
     size along each axis; a constant one is a distance. Fit Length works
     out how many copies fit; an offset by another object cannot be redone
     here, so that one is drawn as a single copy. */
  function array(g, m){
    if (m.ob) return g;
    const box = boxOf(g.pos);
    const step = [0, 1, 2].map(k => (m.rel ? m.rel[k] * (box.hi[k] - box.lo[k]) : 0) + (m.con ? m.con[k] : 0));
    let count = m.count;
    if (m.fit === 1){
      const len = Math.hypot(step[0], step[1], step[2]);
      count = len > 0 ? Math.floor(m.len / len + 1e-6) + 1 : 1;
    }
    count = Math.max(1, Math.min(count, 1000));
    const n = g.pos.length / 3;
    const pos = new Float32Array(n * 3 * count);
    for (let c = 0; c < count; c++)
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[(c * n + i) * 3 + k] = g.pos[i * 3 + k] + step[k] * c;
    const rep = (a, add) => { const out = new a.constructor(a.length * count);
      for (let c = 0; c < count; c++) for (let i = 0; i < a.length; i++) out[c * a.length + i] = a[i] + (add ? add * c : 0);
      return out; };
    return { pos, sizes: rep(g.sizes), corners: rep(g.corners, n), mat: rep(g.mat), smooth: rep(g.smooth) };
  }
  /* Catmull-Clark subdivision, which is what Subdivision Surface does: each
     face splits into quads round a new middle corner, and every corner is
     moved towards its neighbours. "Simple" splits without moving. */
  function subdivide(g, simple){
    const n = g.pos.length / 3, nf = g.sizes.length, P = g.pos;
    const starts = faceStarts(g);
    const edgeOf = new Map(), edges = [];          // [a, b, face, face]
    const ekey = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
    const faceEdge = new Uint32Array(g.corners.length);
    for (let f = 0; f < nf; f++){
      const s = starts[f], k = g.sizes[f];
      for (let i = 0; i < k; i++){
        const a = g.corners[s + i], b = g.corners[s + (i + 1) % k];
        const key = ekey(a, b);
        let e = edgeOf.get(key);
        if (e === undefined){ e = edges.length; edges.push([a, b, f, -1]); edgeOf.set(key, e); }
        else if (edges[e][3] < 0) edges[e][3] = f;
        faceEdge[s + i] = e;
      }
    }
    const ne = edges.length;
    const out = new Float32Array((n + ne + nf) * 3);
    const FP = n + ne;                              // face points come after edge points
    for (let f = 0; f < nf; f++){
      const s = starts[f], k = g.sizes[f];
      for (let i = 0; i < k; i++){ const v = g.corners[s + i];
        for (let c = 0; c < 3; c++) out[(FP + f) * 3 + c] += P[v * 3 + c] / k; }
    }
    edges.forEach(([a, b, f0, f1], e) => {
      for (let c = 0; c < 3; c++){
        const mid = (P[a * 3 + c] + P[b * 3 + c]) / 2;
        out[(n + e) * 3 + c] = (simple || f1 < 0) ? mid
          : (P[a * 3 + c] + P[b * 3 + c] + out[(FP + f0) * 3 + c] + out[(FP + f1) * 3 + c]) / 4;
      }
    });
    if (simple) out.set(P.subarray(0, n * 3));
    else {
      const fSum = new Float32Array(n * 3), fCount = new Uint32Array(n);
      const eSum = new Float32Array(n * 3), eCount = new Uint32Array(n);
      const bSum = new Float32Array(n * 3), bCount = new Uint32Array(n);
      for (let f = 0; f < nf; f++){
        const s = starts[f];
        for (let i = 0; i < g.sizes[f]; i++){ const v = g.corners[s + i]; fCount[v]++;
          for (let c = 0; c < 3; c++) fSum[v * 3 + c] += out[(FP + f) * 3 + c]; }
      }
      edges.forEach(([a, b, , f1]) => {
        for (const [v, w] of [[a, b], [b, a]]){
          eCount[v]++;
          for (let c = 0; c < 3; c++) eSum[v * 3 + c] += (P[v * 3 + c] + P[w * 3 + c]) / 2;
          if (f1 < 0){ bCount[v]++; for (let c = 0; c < 3; c++) bSum[v * 3 + c] += (P[v * 3 + c] + P[w * 3 + c]) / 2; }
        }
      });
      for (let v = 0; v < n; v++){
        for (let c = 0; c < 3; c++){
          const p = P[v * 3 + c];
          if (bCount[v] >= 2) out[v * 3 + c] = (bSum[v * 3 + c] / bCount[v]) / 2 + p / 2;   // along an open edge
          else if (eCount[v] >= 3 && fCount[v])
            out[v * 3 + c] = (fSum[v * 3 + c] / fCount[v] + 2 * eSum[v * 3 + c] / eCount[v] + (eCount[v] - 3) * p) / eCount[v];
          else out[v * 3 + c] = p;
        }
      }
    }
    let total = 0;
    for (let f = 0; f < nf; f++) total += g.sizes[f];
    const sizes = new Uint32Array(total).fill(4), corners = new Uint32Array(total * 4);
    const mat = new Uint8Array(total), smooth = new Uint8Array(total);
    let q = 0;
    for (let f = 0; f < nf; f++){
      const s = starts[f], k = g.sizes[f];
      for (let i = 0; i < k; i++){
        corners[q * 4] = g.corners[s + i];
        corners[q * 4 + 1] = n + faceEdge[s + i];
        corners[q * 4 + 2] = FP + f;
        corners[q * 4 + 3] = n + faceEdge[s + (i + k - 1) % k];
        mat[q] = g.mat[f]; smooth[q] = g.smooth[f];
        q++;
      }
    }
    return { pos: out, sizes, corners, mat, smooth };
  }
  /* Each corner moved to where it would end up if subdividing went on for
     ever, which Blender does unless Use Limit Surface is off. Only right on
     a mesh of quads, so only used after at least one level. The rule is
     the standard one for Catmull-Clark: a corner with n edges goes to
     (n²P + 4×its neighbours + the corners across its faces) / n(n + 5);
     one on an open edge to (its two edge neighbours + 4P) / 6. */
  function limit(g){
    const n = g.pos.length / 3, P = g.pos, out = new Float32Array(P.length);
    const across = new Float32Array(n * 3), valence = new Uint32Array(n);
    const near = new Float32Array(n * 3), edgeCount = new Map();
    const ekey = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
    for (let f = 0, s = 0; f < g.sizes.length; s += g.sizes[f], f++){
      if (g.sizes[f] !== 4) return g;
      for (let i = 0; i < 4; i++){
        const v = g.corners[s + i], w = g.corners[s + (i + 2) % 4];
        for (let c = 0; c < 3; c++) across[v * 3 + c] += P[w * 3 + c];
        const k = ekey(v, g.corners[s + (i + 1) % 4]);
        edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
      }
    }
    const openNear = new Float32Array(n * 3), open = new Uint32Array(n);
    edgeCount.forEach((count, k) => {
      const a = Math.floor(k / 4294967296), b = k % 4294967296;
      for (const [v, w] of [[a, b], [b, a]]){
        valence[v]++;
        for (let c = 0; c < 3; c++) near[v * 3 + c] += P[w * 3 + c];
        if (count === 1){ open[v]++; for (let c = 0; c < 3; c++) openNear[v * 3 + c] += P[w * 3 + c]; }
      }
    });
    for (let v = 0; v < n; v++){
      const k = valence[v];
      for (let c = 0; c < 3; c++){
        const p = P[v * 3 + c];
        if (open[v] === 2) out[v * 3 + c] = (openNear[v * 3 + c] + 4 * p) / 6;
        else if (open[v] || k < 3) out[v * 3 + c] = p;
        else out[v * 3 + c] = (k * k * p + 4 * near[v * 3 + c] + across[v * 3 + c]) / (k * (k + 5));
      }
    }
    return Object.assign({}, g, { pos: out });
  }
  /* Faces after subdividing, so the view stays quick: past this many in the
     whole scene, levels are dropped and the view says so. */
  const MAX_FACES = 600000;
  function applyMods(g, mods, budget){
    const notes = [];
    for (const m of mods || []){
      if (m.t === "mirror") g = mirror(g, m);
      else if (m.t === "array"){ g = array(g, m); if (m.ob) notes.push("Array by an object drawn once"); }
      else if (m.t === "subsurf"){
        let lv = Math.min(m.lv, 6), faces = g.corners.length;
        let done = 0;
        while (done < lv && faces * 4 <= budget.left){ g = subdivide(g, m.simple); faces = g.sizes.length; done++; }
        if (done && m.limit && !m.simple) g = limit(g);
        if (done < lv) notes.push("Subdivision drawn at level " + done + " of " + lv);
      }
    }
    budget.left -= g.sizes.length;
    return { g, notes };
  }
  /* ---------- animation: a keyed curve's value on any frame ----------
     Written to give what Blender gives, following its own rules for each
     kind of easing between keys, for before the first key and after the
     last, and for the Cycles modifier. Key: [frame, value, ipo, left
     handle x, y, right handle x, y], with ipo 0 constant, 1 linear, 2
     Bezier, 3 and up one of Robert Penner's easings, which then has its
     easing mode, back, amplitude and period after, as blend.js wrote it. */
  const IPO = { CONST: 0, LIN: 1, BEZ: 2, BACK: 3, BOUNCE: 4, CIRC: 5, CUBIC: 6, ELASTIC: 7, EXPO: 8,
                QUAD: 9, QUART: 10, QUINT: 11, SINE: 12 };
  const EASE = { AUTO: 0, IN: 1, OUT: 2, IN_OUT: 3 };
  /* Blender's easing functions (BLI_easing.c): t the time into the step,
     b where it starts, c how far it goes, d how long it takes. */
  const bounceOut = (t, b, c, d) => {
    t /= d;
    if (t < 1 / 2.75) return c * (7.5625 * t * t) + b;
    if (t < 2 / 2.75){ t -= 1.5 / 2.75; return c * (7.5625 * t * t + 0.75) + b; }
    if (t < 2.5 / 2.75){ t -= 2.25 / 2.75; return c * (7.5625 * t * t + 0.9375) + b; }
    t -= 2.625 / 2.75; return c * (7.5625 * t * t + 0.984375) + b;
  };
  const bounceIn = (t, b, c, d) => c - bounceOut(d - t, 0, c, d) + b;
  function elasticBlend(t, c, d, a, s, f){
    if (c){
      const u = Math.abs(s);
      f = a ? f * a / Math.abs(c) : 0;
      if (Math.abs(t * d) < u){ const l = Math.abs(t * d) / u; f = f * l + (1 - l); }
    }
    return f;
  }
  function elasticIn(t, b, c, d, a, p){
    let s, f = 1;
    if (t === 0) return b;
    if ((t /= d) === 1) return b + c;
    t -= 1;
    if (!p) p = d * 0.3;
    if (!a || a < Math.abs(c)){ s = p / 4; f = elasticBlend(t, c, d, a, s, f); a = c; }
    else s = p / (2 * Math.PI) * Math.asin(c / a);
    return -f * (a * Math.pow(2, 10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
  }
  function elasticOut(t, b, c, d, a, p){
    let s, f = 1;
    if (t === 0) return b;
    if ((t /= d) === 1) return b + c;
    t = -t;
    if (!p) p = d * 0.3;
    if (!a || a < Math.abs(c)){ s = p / 4; f = elasticBlend(t, c, d, a, s, f); a = c; }
    else s = p / (2 * Math.PI) * Math.asin(c / a);
    return f * (a * Math.pow(2, 10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + c + b;
  }
  function elasticInOut(t, b, c, d, a, p){
    let s, f = 1;
    if (t === 0) return b;
    if ((t /= d / 2) === 2) return b + c;
    t -= 1;
    if (!p) p = d * (0.3 * 1.5);
    if (!a || a < Math.abs(c)){ s = p / 4; f = elasticBlend(t, c, d, a, s, f); a = c; }
    else s = p / (2 * Math.PI) * Math.asin(c / a);
    if (t < 0){ f *= -0.5; return f * (a * Math.pow(2, 10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b; }
    t = -t; f *= 0.5;
    return f * (a * Math.pow(2, 10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + c + b;
  }
  const EASINGS = {
    [IPO.BACK]:   [(t,b,c,d,k) => c*(t/=d)*t*((k[1]+1)*t - k[1]) + b,
                   (t,b,c,d,k) => c*((t=t/d-1)*t*((k[1]+1)*t + k[1]) + 1) + b,
                   (t,b,c,d,k) => { let s = k[1] * 1.525; if ((t /= d / 2) < 1) return c/2*(t*t*((s+1)*t - s)) + b;
                                    t -= 2; return c/2*(t*t*((s+1)*t + s) + 2) + b; }, 1],
    [IPO.BOUNCE]: [(t,b,c,d) => bounceIn(t,b,c,d), (t,b,c,d) => bounceOut(t,b,c,d),
                   (t,b,c,d) => t < d/2 ? bounceIn(t*2,0,c,d)*0.5 + b : bounceOut(t*2-d,0,c,d)*0.5 + c*0.5 + b, 1],
    [IPO.CIRC]:   [(t,b,c,d) => -c*(Math.sqrt(1 - (t/=d)*t) - 1) + b, (t,b,c,d) => c*Math.sqrt(1 - (t=t/d-1)*t) + b,
                   (t,b,c,d) => (t /= d/2) < 1 ? -c/2*(Math.sqrt(1 - t*t) - 1) + b : c/2*(Math.sqrt(1 - (t-=2)*t) + 1) + b, 0],
    [IPO.CUBIC]:  [(t,b,c,d) => c*(t/=d)*t*t + b, (t,b,c,d) => c*((t=t/d-1)*t*t + 1) + b,
                   (t,b,c,d) => (t /= d/2) < 1 ? c/2*t*t*t + b : c/2*((t-=2)*t*t + 2) + b, 0],
    [IPO.ELASTIC]:[(t,b,c,d,k) => elasticIn(t,b,c,d,k[2],k[3]), (t,b,c,d,k) => elasticOut(t,b,c,d,k[2],k[3]),
                   (t,b,c,d,k) => elasticInOut(t,b,c,d,k[2],k[3]), 1],
    [IPO.EXPO]:   [(t,b,c,d) => t === 0 ? b : c*Math.pow(2, 10*(t/d - 1)) + b,
                   (t,b,c,d) => t === d ? b + c : c*(-Math.pow(2, -10*t/d) + 1) + b,
                   (t,b,c,d) => { if (t === 0) return b; if (t === d) return b + c;
                                  if ((t /= d/2) < 1) return c/2*Math.pow(2, 10*(t - 1)) + b;
                                  return c/2*(-Math.pow(2, -10*--t) + 2) + b; }, 0],
    [IPO.QUAD]:   [(t,b,c,d) => c*(t/=d)*t + b, (t,b,c,d) => -c*(t/=d)*(t - 2) + b,
                   (t,b,c,d) => (t /= d/2) < 1 ? c/2*t*t + b : -c/2*((--t)*(t - 2) - 1) + b, 0],
    [IPO.QUART]:  [(t,b,c,d) => c*(t/=d)*t*t*t + b, (t,b,c,d) => -c*((t=t/d-1)*t*t*t - 1) + b,
                   (t,b,c,d) => (t /= d/2) < 1 ? c/2*t*t*t*t + b : -c/2*((t-=2)*t*t*t - 2) + b, 0],
    [IPO.QUINT]:  [(t,b,c,d) => c*(t/=d)*t*t*t*t + b, (t,b,c,d) => c*((t=t/d-1)*t*t*t*t + 1) + b,
                   (t,b,c,d) => (t /= d/2) < 1 ? c/2*t*t*t*t*t + b : c/2*((t-=2)*t*t*t*t + 2) + b, 0],
    [IPO.SINE]:   [(t,b,c,d) => -c*Math.cos(t/d*(Math.PI/2)) + c + b, (t,b,c,d) => c*Math.sin(t/d*(Math.PI/2)) + b,
                   (t,b,c,d) => -c/2*(Math.cos(Math.PI*t/d) - 1) + b, 0]
  };
  /* A Bezier step: Blender first pulls in handles that reach past the next
     key (correct_bezpart), then finds where along the curve the frame is
     and reads the value there. Bisection rather than its cubic formula:
     the handles are pulled in so the frame only ever goes forwards, and
     forty halvings is closer than a float can tell. */
  function bezier(a, b, frame){
    const v1 = [a[0], a[1]], v2 = [a[5], a[6]], v3 = [b[3], b[4]], v4 = [b[0], b[1]];
    const h1 = [v1[0] - v2[0], v1[1] - v2[1]], h2 = [v4[0] - v3[0], v4[1] - v3[1]];
    const len = v4[0] - v1[0], len1 = Math.abs(h1[0]), len2 = Math.abs(h2[0]);
    if (len1 + len2 > 0 && len1 + len2 > len){
      const f = len / (len1 + len2);
      v2[0] = v1[0] - f * h1[0]; v2[1] = v1[1] - f * h1[1];
      v3[0] = v4[0] - f * h2[0]; v3[1] = v4[1] - f * h2[1];
    }
    const at = (p0, p1, p2, p3, t) => { const u = 1 - t; return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3; };
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++){
      const mid = (lo + hi) / 2;
      if (at(v1[0], v2[0], v3[0], v4[0], mid) < frame) lo = mid; else hi = mid;
    }
    return at(v1[1], v2[1], v3[1], v4[1], (lo + hi) / 2);
  }
  function between(a, b, frame){
    if (a[2] === IPO.CONST) return a[1];
    if (a[2] === IPO.LIN) return a[1] + (b[1] - a[1]) * (frame - a[0]) / ((b[0] - a[0]) || 1);
    if (a[2] === IPO.BEZ) return bezier(a, b, frame);
    const e = EASINGS[a[2]];
    if (!e) return a[1];
    const k = a.slice(7);                         // [easing, back, amplitude, period]
    const mode = k[0] === EASE.AUTO ? (e[3] ? EASE.OUT : EASE.IN) : k[0];
    const fn = mode === EASE.IN ? e[0] : mode === EASE.OUT ? e[1] : e[2];
    return fn(frame - a[0], a[1], b[1] - a[1], b[0] - a[0], k);
  }
  /* Before the first key and after the last: held, or carried on in a
     straight line along the end key's handle (or towards its neighbour, for
     a linear key), as Blender's Extrapolation does. */
  function beyond(c, end, next, handleAt, frame){
    if (end[2] === IPO.CONST || !c.lin || c.step || c.k.length < 2) return end[1];
    let slope;
    if (end[2] === IPO.LIN) slope = (next[1] - end[1]) / ((next[0] - end[0]) || Infinity);
    else {
      const hx = end[handleAt], hy = end[handleAt + 1];
      if (hx === undefined || hx === end[0]) return end[1];
      slope = (end[1] - hy) / (end[0] - hx);
    }
    return end[1] + slope * (frame - end[0]);
  }
  /* The Cycles modifier changes which frame the keys are read at, and with
     Repeat with Offset adds a step each time round. Modes: 0 off, 1 repeat,
     2 repeat with offset, 3 repeat mirrored. Cycles 0 means for ever. */
  function cycled(c, frame){
    const k = c.k, first = k[0], last = k[k.length - 1];
    const span = last[0] - first[0], rise = last[1] - first[1];
    let side = 0, mode = 0, count = 0, ofs = 0;
    if (frame < first[0]){ side = -1; mode = c.cyc[0]; count = c.cyc[2]; ofs = first[0]; }
    else if (frame > last[0]){ side = 1; mode = c.cyc[1]; count = c.cyc[3]; ofs = last[0]; }
    if (!side || !mode || !span) return { frame, add: 0 };
    const cycle = side * (frame - ofs) / span;
    const into = (frame - ofs) % span;
    if (count && cycle > count) return { frame, add: 0 };
    let add = 0;
    if (mode === 2) add = (side < 0 ? Math.floor((frame - ofs) / span) : Math.ceil((frame - ofs) / span)) * rise;
    let t;
    if (into === 0){
      t = side === 1 ? last[0] : first[0];
      if (mode === 3 && Math.trunc(cycle) % 2) t = side === 1 ? first[0] : last[0];
    } else if (mode === 3 && Math.trunc(cycle + 1) % 2) t = side < 0 ? first[0] - into : last[0] - into;
    else t = side < 0 ? last[0] + into : first[0] + into;
    if (t < first[0]) t += span;
    return { frame: t, add };
  }
  function curveAt(c, frame){
    const k = c.k;
    if (!k.length) return 0;
    let add = 0;
    if (c.cyc){ const r = cycled(c, frame); frame = r.frame; add = r.add; }
    let v;
    if (frame <= k[0][0]) v = beyond(c, k[0], k[1], 3, frame);
    else if (frame >= k[k.length - 1][0]) v = beyond(c, k[k.length - 1], k[k.length - 2], 5, frame);
    else {
      let lo = 0, hi = k.length - 1;            // the step the frame falls in
      while (hi - lo > 1){ const mid = (lo + hi) >> 1; if (k[mid][0] <= frame) lo = mid; else hi = mid; }
      v = between(k[lo], k[hi], frame);
    }
    v += add;
    return c.step ? Math.round(v) : v;
  }
  /* Where an object is on a frame: its own transform with its keyed
     curves applied, under its parent's on the same frame. Returns the
     matrix and whether it is switched off then. */
  function worldAt(anim, i, frame, memo){
    if (memo.has(i)) return memo.get(i);
    const e = anim.xf[i];
    const t = { l: e.l.slice(), s: e.s.slice(), m: e.m, r: (e.r || [0, 0, 0]).slice(), q: (e.q || [1, 0, 0, 0]).slice(),
                ax: (e.ax || [0, 1, 0]).slice(), an: e.an || 0 };
    let off = !!e.off;
    (e.ch || []).forEach(c => {
      const v = curveAt(c, frame);
      if (c.p === "location") t.l[c.i] = v;
      else if (c.p === "scale") t.s[c.i] = v;
      else if (c.p === "rotation_euler") t.r[c.i] = v;
      else if (c.p === "rotation_quaternion") t.q[c.i] = v;
      else if (c.p === "rotation_axis_angle"){ if (c.i === 0) t.an = v; else t.ax[c.i - 1] = v; }
      else if (c.p === "hide_viewport") off = v >= 0.5;      // as Blender reads a keyed tick box
    });
    let M = window.blendTRS(t);
    if (e.p >= 0 && anim.xf[e.p]){
      const parent = worldAt(anim, e.p, frame, memo).m;
      M = window.blendMul(parent, e.pi ? window.blendMul(e.pi, M) : M);
    }
    const out = { m: M, off };
    memo.set(i, out);
    return out;
  }
  window.blendGeometry = { unpackMesh, applyMods, MAX_FACES, curveAt, worldAt };

  /* ---------- 4×4 matrices, column-major as WebGL takes them ---------- */
  const M4 = {
    mul(a, b){ const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++){ let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
      return o; },
    point(m, x, y, z){ return [m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14]]; },
    invert(m){
      const inv = new Float32Array(16);
      inv[0] = m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
      inv[4] = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
      inv[8] = m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
      inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
      inv[1] = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
      inv[5] = m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
      inv[9] = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
      inv[13] = m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
      inv[2] = m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
      inv[6] = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
      inv[10] = m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
      inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
      inv[3] = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
      inv[7] = m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
      inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
      inv[15] = m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
      let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
      if (!det) return null;
      det = 1 / det;
      for (let i = 0; i < 16; i++) inv[i] *= det;
      return inv;
    },
    perspective(fovy, aspect, near, far){
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0]);
    },
    ortho(halfW, halfH, near, far){
      const nf = 1 / (near - far);
      return new Float32Array([1 / halfW,0,0,0, 0,1 / halfH,0,0, 0,0,2 * nf,0, 0,0,(far + near) * nf,1]);
    }
  };
  const hexRGB = (h) => { const x = /^#?([0-9a-f]{6})$/i.exec(h || "") ? parseInt(RegExp.$1, 16) : 0xcccccc;
                          return [(x >> 16 & 255) / 255, (x >> 8 & 255) / 255, (x & 255) / 255]; };

  /* ---------- the scene ready to draw ----------
     Every object's faces in world space, as triangles with a normal and a
     colour each, and its edges as lines. Smooth faces share a normal at
     each corner; flat ones keep the face's own, as Blender shades them. */
  function build(geo){
    const meshes = (geo.meshes || []).map(unpackMesh);
    const budget = { left: MAX_FACES };
    const objects = [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const ob of geo.objects || []){
      const base = meshes[ob.mesh];
      if (!base) continue;
      const { g, notes } = applyMods(base, ob.mods, budget);
      const M = new Float32Array(ob.x);
      /* A model that never moves is put in place once, here. One that is
         animated stays in its own space and is given its matrix for each
         frame as it is drawn. */
      const moving = !!(geo.anim && geo.anim.xf[ob.o]);
      const n = g.pos.length / 3;
      const wp = new Float32Array(n * 3);
      const placedLo = [Infinity, Infinity, Infinity], placedHi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++){
        const p = M4.point(M, g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]);
        const w = moving ? [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]] : p;
        wp[i * 3] = w[0]; wp[i * 3 + 1] = w[1]; wp[i * 3 + 2] = w[2];
        for (let k = 0; k < 3; k++){
          if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k];
          if (p[k] < placedLo[k]) placedLo[k] = p[k]; if (p[k] > placedHi[k]) placedHi[k] = p[k];
        }
      }
      /* A negative scale turns the faces inside out, so they are turned back. */
      const flip = (M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5])) < 0;
      const starts = faceStarts(g);
      const fn = new Float32Array(g.sizes.length * 3);           // each face's normal, by Newell's method
      const vn = new Float32Array(n * 3);
      for (let f = 0; f < g.sizes.length; f++){
        const s = starts[f], k = g.sizes[f];
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < k; i++){
          const a = g.corners[s + i] * 3, b = g.corners[s + (i + 1) % k] * 3;
          nx += (wp[a + 1] - wp[b + 1]) * (wp[a + 2] + wp[b + 2]);
          ny += (wp[a + 2] - wp[b + 2]) * (wp[a] + wp[b]);
          nz += (wp[a] - wp[b]) * (wp[a + 1] + wp[b + 1]);
        }
        if (flip){ nx = -nx; ny = -ny; nz = -nz; }
        fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;
        if (g.smooth[f]) for (let i = 0; i < k; i++){ const v = g.corners[s + i] * 3; vn[v] += nx; vn[v + 1] += ny; vn[v + 2] += nz; }
      }
      let tris = 0;
      for (let f = 0; f < g.sizes.length; f++) tris += Math.max(0, g.sizes[f] - 2);
      const P = new Float32Array(tris * 9), N = new Float32Array(tris * 9), C = new Float32Array(tris * 9);
      const colours = (ob.c || []).map(hexRGB);
      let t = 0;
      const edgeSeen = new Set(), lines = [];
      for (let f = 0; f < g.sizes.length; f++){
        const s = starts[f], k = g.sizes[f];
        const col = colours[g.mat[f]] || colours[0] || [0.8, 0.8, 0.8];
        for (let i = 1; i + 1 < k; i++){
          const tri = flip ? [g.corners[s], g.corners[s + i + 1], g.corners[s + i]] : [g.corners[s], g.corners[s + i], g.corners[s + i + 1]];
          for (const v of tri){
            for (let c = 0; c < 3; c++){
              P[t * 3 + c] = wp[v * 3 + c];
              N[t * 3 + c] = g.smooth[f] ? vn[v * 3 + c] : fn[f * 3 + c];
              C[t * 3 + c] = col[c];
            }
            t++;
          }
        }
        for (let i = 0; i < k; i++){
          const a = g.corners[s + i], b = g.corners[s + (i + 1) % k];
          const key = a < b ? a + ":" + b : b + ":" + a;
          if (edgeSeen.has(key)) continue;
          edgeSeen.add(key);
          lines.push(wp[a * 3], wp[a * 3 + 1], wp[a * 3 + 2], wp[b * 3], wp[b * 3 + 1], wp[b * 3 + 2]);
        }
      }
      const own = boxOf(wp);
      objects.push({ o: ob.o, P, N, C, L: new Float32Array(lines), notes, skip: ob.skip || [],
                     cut: !!(geo.meshes[ob.mesh] && geo.meshes[ob.mesh].cut), moving,
                     lo: placedLo, hi: placedHi, ownLo: own.lo, ownHi: own.hi, faces: g.sizes.length });
    }
    /* The models' own box, which the view opens on, and a bigger one with
       the cameras and lights in, which Frame all and the grid use: a camera
       usually stands well back, and opening on it leaves the models small. */
    if (!isFinite(lo[0])){ lo.fill(-1); hi.fill(1); }
    const allLo = lo.slice(), allHi = hi.slice();
    [].concat(geo.cams || [], geo.lights || []).forEach(c => {
      for (let k = 0; k < 3; k++){ const x = c.x[12 + k]; if (x < allLo[k]) allLo[k] = x; if (x > allHi[k]) allHi[k] = x; }
    });
    return { objects, lo, hi, allLo, allHi, budgetHit: budget.left <= 0 };
  }

  /* Outlines for the camera and lights, as Blender draws them: the camera a
     pyramid with a triangle on top saying which way is up, a light a small
     circle with a line down to the floor. In world space, as line pairs.
     matOf gives each one's matrix on the frame showing. */
  function gizmos(geo, size, aspect, matOf){
    const out = [];
    const seg = (M, a, b) => { const p = M4.point(M, a[0], a[1], a[2]), q = M4.point(M, b[0], b[1], b[2]); out.push(...p, ...q); };
    (geo.cams || []).forEach(c => {
      /* Blender draws a camera at its Display Size, a metre unless changed,
         shaped like the picture it takes. */
      const M = matOf(c);
      const ds = c.ds || 1, d = ds * c.lens / c.sw;
      const w = aspect >= 1 ? ds / 2 : ds / 2 * aspect, hgt = aspect >= 1 ? ds / 2 / aspect : ds / 2;
      const tip = [0, 0, 0], corners = [[-w, -hgt, -d], [w, -hgt, -d], [w, hgt, -d], [-w, hgt, -d]];
      corners.forEach((p, i) => { seg(M, tip, p); seg(M, p, corners[(i + 1) % 4]); });
      seg(M, [-w * 0.5, hgt * 1.15, -d], [w * 0.5, hgt * 1.15, -d]);
      seg(M, [w * 0.5, hgt * 1.15, -d], [0, hgt * 1.9, -d]);
      seg(M, [0, hgt * 1.9, -d], [-w * 0.5, hgt * 1.15, -d]);
    });
    (geo.lights || []).forEach(l => {
      const M = matOf(l), r = Math.max(0.1, size * 0.006);
      for (let i = 0; i < 16; i++){
        const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2;
        seg(M, [Math.cos(a) * r, Math.sin(a) * r, 0], [Math.cos(b) * r, Math.sin(b) * r, 0]);
      }
      const p = M4.point(M, 0, 0, 0);
      out.push(p[0], p[1], p[2], p[0], p[1], 0);
      if (l.t === 1 || l.t === 2) seg(M, [0, 0, 0], [0, 0, -size * 0.08]);   // a sun or spot points somewhere
    });
    return new Float32Array(out);
  }

  /* ---------- drawing ---------- */
  /* model is the identity for a model put in place once, and the frame's
     matrix for one that moves; nmat turns its normals the same way. */
  const VS = `attribute vec3 p; attribute vec3 n; attribute vec3 c;
    uniform mat4 vp; uniform mat4 view; uniform mat4 model; uniform mat3 nmat; varying vec3 vn; varying vec3 vc;
    void main(){ gl_Position = vp * model * vec4(p, 1.0); vn = mat3(view) * (nmat * n); vc = c; }`;
  /* Two lights fixed to the view, a key from the upper left and a soft fill,
     which is roughly Blender's default studio light. */
  const FS = `precision mediump float; varying vec3 vn; varying vec3 vc; uniform float alpha;
    void main(){ vec3 N = normalize(vn); if (!gl_FrontFacing) N = -N;
      float key = max(dot(N, normalize(vec3(-0.45, 0.6, 0.65))), 0.0);
      float fill = max(dot(N, normalize(vec3(0.6, -0.25, 0.75))), 0.0);
      vec3 col = vc * (0.28 + 0.62 * key + 0.22 * fill);
      gl_FragColor = vec4(min(col, vec3(1.0)), alpha); }`;
  const LVS = `attribute vec3 p; uniform mat4 vp; uniform mat4 model; void main(){ gl_Position = vp * model * vec4(p, 1.0); }`;
  const LFS = `precision mediump float; uniform vec4 col; void main(){ gl_FragColor = col; }`;

  function program(gl, vs, fs){
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function buffer(gl, data){ const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  window.blendView = function(geo, stats, opts){
    if (!geo || !Array.isArray(geo.objects) || !geo.objects.length) return null;
    opts = opts || {};
    const wrap = el("div", "bv");
    const canvas = el("canvas", "bv-canvas");
    canvas.setAttribute("aria-label", "The scene in 3D. Drag to turn it, scroll to zoom.");
    canvas.tabIndex = 0;
    wrap.appendChild(canvas);
    const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
    if (!gl){
      wrap.appendChild(el("p", "bv-none", "This computer cannot draw the scene in 3D. The picture and the details are still here."));
      return { el: wrap, select(){}, close(){} };
    }
    const scene = build(geo);
    const size = Math.max(1, Math.hypot(scene.allHi[0] - scene.allLo[0], scene.allHi[1] - scene.allLo[1], scene.allHi[2] - scene.allLo[2]));
    const mesh = program(gl, VS, FS), line = program(gl, LVS, LFS);
    const loc = { p: gl.getAttribLocation(mesh, "p"), n: gl.getAttribLocation(mesh, "n"), c: gl.getAttribLocation(mesh, "c"),
                  vp: gl.getUniformLocation(mesh, "vp"), view: gl.getUniformLocation(mesh, "view"), alpha: gl.getUniformLocation(mesh, "alpha"),
                  lp: gl.getAttribLocation(line, "p"), lvp: gl.getUniformLocation(line, "vp"), lcol: gl.getUniformLocation(line, "col"),
                  model: gl.getUniformLocation(mesh, "model"), nmat: gl.getUniformLocation(mesh, "nmat"),
                  lmodel: gl.getUniformLocation(line, "model") };
    scene.objects.forEach(o => {
      o.count = o.P.length / 3;
      o.bP = buffer(gl, o.P); o.bN = buffer(gl, o.N); o.bC = buffer(gl, o.C); o.bL = buffer(gl, o.L);
      o.lineCount = o.L.length / 3;
    });
    /* The floor grid: a line a metre, out past the scene, and the X and Y
       axes through the middle in Blender's red and green. */
    const reach = Math.max(10, Math.ceil(Math.max(Math.abs(scene.allLo[0]), Math.abs(scene.allHi[0]), Math.abs(scene.allLo[1]), Math.abs(scene.allHi[1])) * 1.5));
    const step = reach > 200 ? 10 : 1;
    const grid = [];
    for (let i = -reach; i <= reach; i += step){ if (i === 0) continue; grid.push(i, -reach, 0, i, reach, 0, -reach, i, 0, reach, i, 0); }
    const bGrid = buffer(gl, new Float32Array(grid));
    const bAxisX = buffer(gl, new Float32Array([-reach, 0, 0, reach, 0, 0]));
    const bAxisY = buffer(gl, new Float32Array([0, -reach, 0, 0, reach, 0]));
    /* ---- the frame showing, and where everything is on it ----
       Worked out once a frame and kept, since the camera view, the
       outlines and picking all ask. */
    const anim = geo.anim || null;
    let frameNow = anim ? Math.max(anim.start, Math.min(anim.end, Math.round(anim.cur))) : 0;
    let poses = new Map();
    const IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const pose = (i) => window.blendGeometry.worldAt(anim, i, frameNow, poses);
    const matOf = (thing) => anim && anim.xf[thing.o] ? new Float32Array(pose(thing.o).m) : new Float32Array(thing.x);
    const placeOf = (o) => o.moving ? { m: new Float32Array(pose(o.o).m), off: pose(o.o).off } : { m: IDENT, off: false };
    /* The upper 3×3 of a matrix, inverted and turned over: what normals
       need so they stay square to a face that has been scaled. */
    function normalMatrix(m){
      if (m === IDENT) return new Float32Array([1,0,0, 0,1,0, 0,0,1]);
      const inv = M4.invert(m);
      if (!inv) return new Float32Array([1,0,0, 0,1,0, 0,0,1]);
      return new Float32Array([inv[0], inv[4], inv[8], inv[1], inv[5], inv[9], inv[2], inv[6], inv[10]]);
    }
    const ren = (stats && stats.scene) || {};
    const aspectRender = ren.w && ren.h ? ren.w / ren.h : 16 / 9;
    let giz = gizmos(geo, size, aspectRender, matOf);
    const bGiz = buffer(gl, giz);
    const gizMoves = !!anim && [].concat(geo.cams || [], geo.lights || []).some(c => anim.xf[c.o]);

    /* ---- the view: turned about a point, as Blender's is ---- */
    const view = { yaw: -0.82, pitch: 0.45, dist: 10, target: [0, 0, 0], ortho: false, cam: -1, wire: false };
    /* Blender's own 50mm lens across a 36mm sensor, along the longer side
       of the window. */
    const fovUser = 2 * Math.atan(18 / 50);
    const fovyOf = (aspect) => aspect >= 1 ? 2 * Math.atan(Math.tan(fovUser / 2) / aspect) : fovUser;
    function frame(lo, hi){
      view.target = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
      const r = Math.max(0.5, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
      const aspect = canvas.clientHeight ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
      const narrow = Math.min(fovyOf(aspect), 2 * Math.atan(Math.tan(fovyOf(aspect) / 2) * aspect));
      view.dist = r / Math.sin(narrow / 2) * 1.02;
    }
    frame(scene.lo, scene.hi);
    let selected = -1;
    const camOf = (i) => (geo.cams || [])[i];

    function matrices(){
      const w = canvas.width, h = canvas.height, aspect = w / Math.max(1, h);
      let V, Pm;
      if (view.cam >= 0 && camOf(view.cam)){
        const c = camOf(view.cam);
        /* A scaled camera still sees the same, so its scale is taken out. */
        const x = matOf(c);
        for (let col = 0; col < 3; col++){
          const len = Math.hypot(x[col * 4], x[col * 4 + 1], x[col * 4 + 2]) || 1;
          for (let r = 0; r < 3; r++) x[col * 4 + r] /= len;
        }
        V = M4.invert(x) || new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
        const ren = (stats && stats.scene) || {};
        const rAspect = (ren.w && ren.h) ? ren.w / ren.h : 16 / 9;
        const horiz = c.fit === 1 || (c.fit === 0 && rAspect >= 1);
        const sensor = c.fit === 2 ? c.sh : c.sw;
        let fov = 2 * Math.atan(sensor / 2 / c.lens);       // across the sensor's fitted side
        /* The frame is fitted inside the window with room round it, as
           Blender's camera view leaves it. */
        const room = 0.9;
        const frameW = Math.min(w * room, h * room * rAspect), frameH = frameW / rAspect;
        view.frameBox = [frameW, frameH];
        if (c.ortho){
          const half = c.ortho / 2;
          const halfW = (horiz ? half : half * rAspect) * w / frameW, halfH = halfW / aspect;
          Pm = M4.ortho(halfW, halfH, 0.01, size * 20);
        } else {
          const fovFrameH = horiz ? 2 * Math.atan(Math.tan(fov / 2) / rAspect) : fov;
          const fovy = 2 * Math.atan(Math.tan(fovFrameH / 2) * h / frameH);
          Pm = M4.perspective(fovy, aspect, Math.max(0.01, size / 2000), size * 20);
        }
      } else {
        view.frameBox = null;
        const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch), cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
        const back = [cp * cy, cp * sy, sp];                 // from the target towards the eye
        const eye = [0, 1, 2].map(k => view.target[k] + back[k] * view.dist);
        const r = [-sy, cy, 0];
        const f = [-back[0], -back[1], -back[2]];
        const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        V = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -d(r, eye), -d(u, eye), d(f, eye), 1]);
        if (view.ortho){
          const halfH = view.dist * Math.tan(fovUser / 2) / aspect;
          Pm = M4.ortho(halfH * aspect, halfH, -size * 20, size * 20);
        } else Pm = M4.perspective(fovyOf(aspect), aspect, Math.max(0.01, view.dist / 1000), view.dist + size * 20);
      }
      return { V, VP: M4.mul(Pm, V) };
    }

    function drawLines(buf, count, col, VP, model){
      gl.useProgram(line);
      gl.uniformMatrix4fv(loc.lvp, false, VP);
      gl.uniformMatrix4fv(loc.lmodel, false, model || IDENT);
      gl.uniform4fv(loc.lcol, col);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc.lp);
      gl.vertexAttribPointer(loc.lp, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, count);
    }
    let pending = false;
    function redraw(){ if (!pending){ pending = true; requestAnimationFrame(paint); } }
    function paint(){
      pending = false;
      if (gl.isContextLost()) return;
      const { V, VP } = matrices();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.224, 0.224, 0.224, 1);       // Blender's 3D view grey
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (view.cam < 0){
        gl.depthMask(false);
        drawLines(bGrid, grid.length / 3, [0.33, 0.33, 0.33, 1], VP);
        drawLines(bAxisX, 2, [0.86, 0.24, 0.31, 1], VP);
        drawLines(bAxisY, 2, [0.47, 0.70, 0.13, 1], VP);
        gl.depthMask(true);
      }
      if (!view.wire){
        gl.useProgram(mesh);
        gl.uniformMatrix4fv(loc.vp, false, VP);
        gl.uniformMatrix4fv(loc.view, false, V);
        gl.uniform1f(loc.alpha, 1);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1, 1);
        scene.objects.forEach(o => {
          if (!o.count) return;
          const at = placeOf(o);
          if (at.off) return;
          gl.uniformMatrix4fv(loc.model, false, at.m);
          gl.uniformMatrix3fv(loc.nmat, false, normalMatrix(at.m));
          [[o.bP, loc.p], [o.bN, loc.n], [o.bC, loc.c]].forEach(([b, a]) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
          });
          gl.drawArrays(gl.TRIANGLES, 0, o.count);
        });
        gl.disable(gl.POLYGON_OFFSET_FILL);
        [loc.n, loc.c].forEach(a => gl.disableVertexAttribArray(a));
      }
      scene.objects.forEach((o, i) => {
        const on = i === selected;
        const at = placeOf(o);
        if (at.off) return;
        if (view.wire || on) drawLines(o.bL, o.lineCount, on ? [1, 0.63, 0.16, view.wire ? 1 : 0.8] : [0.05, 0.05, 0.05, 0.9], VP, at.m);
      });
      if (giz.length) drawLines(bGiz, giz.length / 3, [0.05, 0.05, 0.05, 1], VP);
      paintOverlay();
    }

    /* A moving object is framed where it is on the frame showing. */
    function frameObject(o){
      if (!o.moving){ frame(o.lo, o.hi); return; }
      const m = placeOf(o).m, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let c = 0; c < 8; c++){
        const p = M4.point(m, c & 1 ? o.ownHi[0] : o.ownLo[0], c & 2 ? o.ownHi[1] : o.ownLo[1], c & 4 ? o.ownHi[2] : o.ownLo[2]);
        for (let k = 0; k < 3; k++){ lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      }
      frame(lo, hi);
    }

    /* ---- the timeline: Blender's play button, a slider through the
       frames and the frame number. Space plays and stops, the arrow keys
       step a frame, Shift and an arrow go to the start or end, as in
       Blender. It plays at the scene's own frame rate and goes round again
       at the end. ---- */
    let playing = false, playFrom = 0, playAt = 0, timeBar = null, slider = null, playBtn = null, frameLabel = null;
    function setFrame(f){
      if (!anim) return;
      f = Math.max(anim.start, Math.min(anim.end, Math.round(f)));
      if (f === frameNow && poses.size) return;
      frameNow = f;
      poses = new Map();
      if (gizMoves){ giz = gizmos(geo, size, aspectRender, matOf); gl.bindBuffer(gl.ARRAY_BUFFER, bGiz); gl.bufferData(gl.ARRAY_BUFFER, giz, gl.DYNAMIC_DRAW); }
      if (slider) slider.value = String(f);
      if (frameLabel) frameLabel.textContent = "Frame " + f;
      redraw();
    }
    function tick(now){
      if (!playing) return;
      const span = anim.end - anim.start + 1;
      const passed = Math.floor((now - playAt) / 1000 * (anim.fps || 24));
      setFrame(anim.start + ((playFrom - anim.start + passed) % span + span) % span);
      requestAnimationFrame(tick);
    }
    function play(){
      if (!anim || playing) return;
      playing = true;
      playFrom = frameNow >= anim.end ? anim.start : frameNow;
      playAt = performance.now();
      playBtn.textContent = "Pause"; playBtn.classList.add("on");
      requestAnimationFrame(tick);
    }
    function stop(){
      if (!playing) return;
      playing = false;
      playBtn.textContent = "Play"; playBtn.classList.remove("on");
    }
    if (anim){
      timeBar = el("div", "bv-time");
      playBtn = el("button", "bv-btn bv-play", "Play");
      playBtn.type = "button"; playBtn.title = "Play the animation (Space)";
      playBtn.addEventListener("click", (e) => { e.stopPropagation(); playing ? stop() : play(); canvas.focus(); });
      slider = el("input", "bv-slider");
      slider.type = "range"; slider.min = String(anim.start); slider.max = String(anim.end); slider.step = "1";
      slider.value = String(frameNow);
      slider.setAttribute("aria-label", "Frame");
      slider.addEventListener("input", () => { stop(); setFrame(+slider.value); });
      frameLabel = el("span", "bv-frame-no", "Frame " + frameNow);
      const span = el("span", "bv-range", anim.start + " to " + anim.end);
      timeBar.appendChild(playBtn); timeBar.appendChild(slider); timeBar.appendChild(frameLabel); timeBar.appendChild(span);
      wrap.appendChild(timeBar);
      wrap.classList.add("has-time");
    }

    /* ---- what is written over the view, as Blender writes it ---- */
    const label = el("div", "bv-label");
    const notesEl = el("div", "bv-notes");
    const frameEl = el("div", "bv-frame");
    wrap.appendChild(frameEl); wrap.appendChild(label); wrap.appendChild(notesEl);
    function paintOverlay(){
      const camName = view.cam >= 0 && stats && stats.objects && camOf(view.cam) ? (stats.objects[camOf(view.cam).o] || {}).n : "";
      label.textContent = view.cam >= 0 ? "Camera Perspective" + (camName ? " (" + camName + ")" : "")
                        : "User " + (view.ortho ? "Orthographic" : "Perspective");
      const pick = selected >= 0 ? scene.objects[selected] : null;
      if (pick && stats && stats.objects) label.textContent += "\n" + ((stats.objects[pick.o] || {}).n || "");
      frameEl.hidden = !view.frameBox;
      if (view.frameBox){
        const dpr = canvas.width / Math.max(1, canvas.clientWidth);
        frameEl.style.width = view.frameBox[0] / dpr + "px";
        frameEl.style.height = view.frameBox[1] / dpr + "px";
      }
      paintNav();
    }
    const notes = [];
    scene.objects.forEach(o => {
      const name = stats && stats.objects ? (stats.objects[o.o] || {}).n : "";
      if (o.skip.length) notes.push(o.skip.join(", ") + " on " + name + " not drawn");
      o.notes.forEach(n => notes.push(n + " on " + name));
      if (o.cut) notes.push(name + " simplified to fit");
    });
    /* A constraint (Track To, Follow Path and so on) is worked out by
       Blender as it plays. Where it is saved is right; between keys, an
       object with one moves only as its own keys take it. */
    if (anim && stats && stats.objects) Object.keys(anim.xf).forEach(i => {
      const ob = stats.objects[i];
      if (ob && ob.cons && ob.cons.length && anim.xf[i].ch) notes.push(ob.n + " has a " + ob.cons[0] + " constraint, which the animation does not follow");
    });
    (geo.notDrawn || []).forEach(i => { const ob = stats && stats.objects && stats.objects[i];
      if (ob) notes.push(ob.n + (ob.k === "text" ? " is 3D text, which is not drawn" : " is not drawn")); });
    if (notes.length){
      const shown = notes.slice(0, 4);
      if (notes.length > 4) shown.push("and " + (notes.length - 4) + " more");
      notesEl.textContent = shown.join(". ") + ".";
    }

    /* ---- the turning axes in the corner, which a click snaps the view to ---- */
    const nav = el("canvas", "bv-nav");
    nav.width = nav.height = 160;
    nav.setAttribute("aria-hidden", "true");
    wrap.appendChild(nav);
    const AX = [["X", [1, 0, 0], "#e5414f"], ["Y", [0, 1, 0], "#79b62d"], ["Z", [0, 0, 1], "#3f7fe0"]];
    function navPoints(){
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch), cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      let r = [-sy, cy, 0], back = [cp * cy, cp * sy, sp];
      if (view.cam >= 0 && camOf(view.cam)){ const x = matOf(camOf(view.cam));
        const len = (a) => Math.hypot(a[0], a[1], a[2]) || 1;
        r = [x[0], x[1], x[2]].map((v, i, a) => v / len(a)); back = [x[8], x[9], x[10]].map((v, i, a) => v / len(a)); }
      const u = [back[1] * r[2] - back[2] * r[1], back[2] * r[0] - back[0] * r[2], back[0] * r[1] - back[1] * r[0]];   // screen up
      const pts = [];
      AX.forEach(([name, a, col]) => [1, -1].forEach(s => {
        const d = (v) => (v[0] * a[0] + v[1] * a[1] + v[2] * a[2]) * s;
        pts.push({ name, s, col, x: 80 + d(r) * 52, y: 80 - d(u) * 52, z: d(back) });
      }));
      return pts.sort((a, b) => a.z - b.z);       // furthest first, so the near ones are drawn over them
    }
    function paintNav(){
      const c = nav.getContext("2d");
      c.clearRect(0, 0, 160, 160);
      navPoints().forEach(p => {
        if (p.s > 0){ c.strokeStyle = p.col; c.lineWidth = 4; c.beginPath(); c.moveTo(80, 80); c.lineTo(p.x, p.y); c.stroke(); }
        c.beginPath(); c.arc(p.x, p.y, p.s > 0 ? 15 : 12, 0, Math.PI * 2);
        if (p.s > 0){ c.fillStyle = p.col; c.fill(); c.fillStyle = "#000"; c.font = "bold 18px system-ui, sans-serif";
                      c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(p.name, p.x, p.y + 1); }
        else { c.fillStyle = "rgba(40,40,40,.6)"; c.fill(); c.strokeStyle = p.col; c.lineWidth = 2.5; c.stroke(); }
      });
    }
    nav.addEventListener("click", (e) => {
      const box = nav.getBoundingClientRect(), x = (e.clientX - box.left) / box.width * 160, y = (e.clientY - box.top) / box.height * 160;
      const hit = navPoints().reverse().find(p => Math.hypot(p.x - x, p.y - y) < 17);
      if (!hit) return;
      e.stopPropagation();
      look(hit.name, hit.s);
    });
    function look(axis, s){
      view.cam = -1;
      if (axis === "Z"){ view.pitch = s * Math.PI / 2; view.yaw = -Math.PI / 2; }
      else { view.pitch = 0; view.yaw = axis === "X" ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2); }
      paintButtons(); redraw();
    }

    /* ---- the buttons along the top: shading and where to look from ---- */
    const bar = el("div", "bv-bar");
    const btn = (text, title, fn) => { const b = el("button", "bv-btn", text); b.type = "button"; b.title = title;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); canvas.focus(); }); bar.appendChild(b); return b; };
    const solidBtn = btn("Solid", "Solid shading (Z)", () => { view.wire = false; paintButtons(); redraw(); });
    const wireBtn = btn("Wireframe", "Wireframe (Z)", () => { view.wire = true; paintButtons(); redraw(); });
    const camBtn = (geo.cams && geo.cams.length) ? btn("Camera view", "Look through the scene's camera (Numpad 0)", () => toggleCamera()) : null;
    btn("Frame all", "Fit the whole scene in view (Home)", () => { view.cam = -1; frame(scene.allLo, scene.allHi); paintButtons(); redraw(); });
    wrap.appendChild(bar);
    function paintButtons(){
      solidBtn.classList.toggle("on", !view.wire);
      wireBtn.classList.toggle("on", view.wire);
      if (camBtn) camBtn.classList.toggle("on", view.cam >= 0);
    }
    function toggleCamera(){
      if (view.cam >= 0){ view.cam = -1; }
      else {
        const want = stats && stats.scene && stats.scene.cam;
        const i = (geo.cams || []).findIndex(c => stats.objects && stats.objects[c.o] && stats.objects[c.o].n === want);
        view.cam = i >= 0 ? i : 0;
      }
      paintButtons(); redraw();
    }
    paintButtons();

    /* ---- the mouse, the keys and fingers ----
       Middle drag turns, Shift + middle drag pans, the wheel zooms, as in
       Blender. A left drag turns too and a right drag pans, because a
       laptop has no middle button. A left click without a drag picks. */
    function leaveCamera(){
      if (view.cam < 0) return;
      /* Turning from the camera view starts from where the camera stood. */
      const x = matOf(camOf(view.cam));
      const len = Math.hypot(x[8], x[9], x[10]) || 1;
      const back = [x[8] / len, x[9] / len, x[10] / len];
      view.pitch = Math.asin(Math.max(-1, Math.min(1, back[2])));
      view.yaw = Math.atan2(back[1], back[0]);
      view.dist = Math.max(1, Math.hypot(x[12] - view.target[0], x[13] - view.target[1], x[14] - view.target[2]));
      view.target = [x[12] - back[0] * view.dist, x[13] - back[1] * view.dist, x[14] - back[2] * view.dist];
      view.cam = -1;
      paintButtons();
    }
    function orbit(dx, dy){
      leaveCamera();
      view.yaw -= dx * 0.008;
      view.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, view.pitch + dy * 0.008));
      redraw();
    }
    function pan(dx, dy){
      leaveCamera();
      const per = 2 * view.dist * Math.tan(fovUser / 2) / Math.max(1, canvas.clientHeight);
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch), cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      const r = [-sy, cy, 0], back = [cp * cy, cp * sy, sp];
      const u = [back[1] * r[2] - back[2] * r[1], back[2] * r[0] - back[0] * r[2], back[0] * r[1] - back[1] * r[0]];
      for (let k = 0; k < 3; k++) view.target[k] += (-r[k] * dx - u[k] * dy) * per;
      redraw();
    }
    function zoom(f){ leaveCamera(); view.dist = Math.max(size / 1000, Math.min(size * 50, view.dist * f)); redraw(); }

    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.focus();
      if (e.pointerType === "touch") return;
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, moved: false,
               mode: (e.button === 2 || (e.shiftKey && e.button !== 0) || (e.shiftKey && e.button === 0)) ? "pan" : "orbit" };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.mode === "pan") pan(dx, dy); else orbit(dx, dy);
    });
    canvas.addEventListener("pointerup", (e) => {
      const d = drag; drag = null;
      if (d && !d.moved && e.button === 0) pickAt(e.clientX, e.clientY);
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    /* Fingers: one turns, two pinch to zoom and move together to pan. */
    const touches = new Map();
    let pinch = null;
    canvas.addEventListener("touchstart", (e) => { e.preventDefault();
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY }); pinch = null; }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const before = new Map(touches);
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      const pts = Array.from(touches.values());
      if (pts.length === 1){ const id = touches.keys().next().value, a = before.get(id), b = touches.get(id); if (a) orbit(b.x - a.x, b.y - a.y); }
      else if (pts.length >= 2){
        const [a, b] = pts, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch){ zoom(pinch.gap / Math.max(1, gap)); pan(mid.x - pinch.mid.x, mid.y - pinch.mid.y); }
        pinch = { mid, gap };
      }
    }, { passive: false });
    const lift = (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); pinch = null; };
    canvas.addEventListener("touchend", lift); canvas.addEventListener("touchcancel", lift);

    canvas.addEventListener("keydown", (e) => {
      const k = e.code;
      let used = true;
      if (k === "Numpad1") look("Y", e.ctrlKey ? 1 : -1);
      else if (k === "Numpad3") look("X", e.ctrlKey ? -1 : 1);
      else if (k === "Numpad7") look("Z", e.ctrlKey ? -1 : 1);
      else if (k === "Numpad5"){ view.ortho = !view.ortho; redraw(); }
      else if (k === "Numpad0"){ if (geo.cams && geo.cams.length) toggleCamera(); }
      else if (k === "Home"){ view.cam = -1; frame(scene.allLo, scene.allHi); paintButtons(); redraw(); }
      else if (k === "NumpadDecimal" || k === "Period"){ if (selected >= 0){ view.cam = -1; frameObject(scene.objects[selected]); paintButtons(); redraw(); } }
      else if (anim && k === "Space"){ playing ? stop() : play(); }
      else if (anim && k === "ArrowLeft"){ stop(); setFrame(e.shiftKey ? anim.start : frameNow - 1); }
      else if (anim && k === "ArrowRight"){ stop(); setFrame(e.shiftKey ? anim.end : frameNow + 1); }
      else if (k === "KeyZ"){ view.wire = !view.wire; paintButtons(); redraw(); }
      else if (k === "Numpad4") orbit(-30, 0);
      else if (k === "Numpad6") orbit(30, 0);
      else if (k === "Numpad8") orbit(0, -30);
      else if (k === "Numpad2") orbit(0, 30);
      else if (k === "NumpadAdd") zoom(0.85);
      else if (k === "NumpadSubtract") zoom(1 / 0.85);
      else used = false;
      if (used){ e.preventDefault(); e.stopPropagation(); }
    });

    /* ---- picking: each object drawn in a colour of its own, off screen,
       and the colour under the pointer read back ---- */
    function pickAt(cx, cy){
      const box = canvas.getBoundingClientRect();
      const x = Math.round((cx - box.left) / box.width * canvas.width);
      const y = Math.round((1 - (cy - box.top) / box.height) * canvas.height);
      const { VP } = matrices();
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(line);
      gl.uniformMatrix4fv(loc.lvp, false, VP);
      scene.objects.forEach((o, i) => {
        const id = i + 1;
        const at = placeOf(o);
        if (at.off) return;
        gl.uniformMatrix4fv(loc.lmodel, false, at.m);
        gl.uniform4fv(loc.lcol, [(id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, 1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, o.bP);
        gl.enableVertexAttribArray(loc.lp);
        gl.vertexAttribPointer(loc.lp, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, o.count);
      });
      const px = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const id = px[0] + (px[1] << 8) + (px[2] << 16) - 1;
      setSelected(id >= 0 && id < scene.objects.length ? id : -1, true);
    }
    function setSelected(i, fromView){
      selected = i;
      redraw();
      if (fromView && opts.onPick) opts.onPick(i >= 0 ? scene.objects[i].o : -1);
    }

    /* ---- size: the canvas follows its box, at the screen's own sharpness ---- */
    let framed = false;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr)), h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
      if (!framed && wrap.clientWidth){ framed = true; frame(scene.lo, scene.hi); }
      redraw();
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(wrap); else window.addEventListener("resize", fit);
    requestAnimationFrame(fit);

    return {
      el: wrap,
      /* Picked in the Outliner: `o` is the object's place in stats.objects. */
      select(o){ setSelected(scene.objects.findIndex(x => x.o === o), false); },
      close(){
        playing = false;
        if (ro) ro.disconnect(); else window.removeEventListener("resize", fit);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      },
      faces: scene.objects.reduce((n, o) => n + o.faces, 0)
    };
  };
})();
