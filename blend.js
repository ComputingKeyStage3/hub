/* Reading a Blender file in the browser, for a Screenshot task set to take
   one.

   As with a Photoshop file, the file itself is never uploaded. What leaves
   the student's computer is a picture and a few kilobytes describing the
   scene: its objects, their modifiers and materials, the lights, the camera,
   the animation and the render settings.

   A .blend file is a list of blocks, one per object, mesh, material and so
   on, each tagged with which structure it holds. The file carries its own
   description of every structure (the "SDNA" block at the end), so fields
   are found by name rather than by where they sat in whichever version this
   was written against. That is what lets one reader cope with files from
   Blender 2.8 to 4.x, where the same field has moved about.

   Only the blocks wanted are read. A big file is mostly packed textures and
   mesh data, and those are skipped over, so a 200MB file does not have to
   fit in a school computer's memory at once.

   Everything comes back as plain data. What it means and how it is shown is
   lesson.html's business. */
(function(){

  const SAY = {
    notBlend: "That is not a Blender file. Choose a file whose name ends in .blend.",
    zstd:     "That file was saved compressed, which this page cannot open. In Blender, choose File, Save As, " +
              "press the cog at the top right, untick Compress and save again.",
    backup:   "That is one of Blender's backup copies. Choose the file whose name ends in .blend, not .blend1.",
    broken:   "That file could not be read. Try saving it again in Blender."
  };
  function fail(why){ const e = new Error(why); e.forStudent = true; return e; }

  /* Files at or under this size are read in one go, which is quicker than a
     read per block. Anything bigger is read a block at a time. */
  const WHOLE = 64 * 1024 * 1024;
  /* Lists are cut off here so a scene of ten thousand scattered trees still
     stores a few kilobytes. The counts are kept whole. */
  const MAX_LIST = 300;

  /* ---------- the header ----------
     Up to Blender 4.x: "BLENDER", then _ for 4 byte pointers or - for 8,
     then v for little-endian or V for big, then the version as three
     digits, 306 for 3.6. Twelve bytes.

     Blender 5.0 changed it, so that blocks could be bigger than 2GB:
     "BLENDER", the header's length as two digits (17), a dash, the format
     as two digits (01), the endianness letter, then the version as four
     digits. Its blocks have longer headers to go with it. */
  function header(b){
    const s = String.fromCharCode.apply(null, b.subarray(0, 17));
    if (s.slice(0, 7) !== "BLENDER") return null;
    let m = /^BLENDER([_-])([vV])(\d{3})/.exec(s);
    if (m) return { size: 12, ptr: m[1] === "_" ? 4 : 8, little: m[2] === "v", ver: +m[3], large: false };
    m = /^BLENDER(\d\d)-(\d\d)([vV])(\d{4})/.exec(s);
    if (m) return { size: +m[1], ptr: 8, little: m[3] === "v", ver: +m[4], large: true, format: +m[2] };
    return null;
  }
  /* 306 to "3.6", 283 to "2.83", 402 to "4.2", 500 to "5.0". */
  function versionName(v){
    const major = Math.floor(v / 100), minor = v % 100;
    return major >= 3 ? major + "." + minor : major + "." + String(minor).padStart(2, "0");
  }

  /* ---------- reading the file ----------
     A source hands back bytes by position: the whole file at once when it
     is small, or one slice at a time when it is not. */
  async function source(file){
    if (file.size <= WHOLE){
      const all = new Uint8Array(await file.arrayBuffer());
      return { size: all.length, read: async (at, n) => all.subarray(at, Math.min(at + n, all.length)) };
    }
    return { size: file.size,
             read: async (at, n) => new Uint8Array(await file.slice(at, Math.min(at + n, file.size)).arrayBuffer()) };
  }

  /* Pointers are the addresses things had in memory when the file was
     saved. They are only ever used to find another block, so they are kept
     as text, which an 8 byte number would not survive as a JS number. */
  function ptrKey(dv, at, ptr, little){
    if (ptr === 4) { const x = dv.getUint32(at, little); return x ? String(x) : null; }
    const lo = dv.getUint32(at + (little ? 0 : 4), little), hi = dv.getUint32(at + (little ? 4 : 0), little);
    return (lo || hi) ? hi + ":" + lo : null;
  }

  /* Every block's header, walked from the start of the file. Each says what
     it holds and how long it is, so the data itself can be stepped over.
     Headers are read through a moving window of the file rather than one
     read each, since a big scene has tens of thousands of them. */
  async function walk(src, h){
    const hl = h.large ? 32 : (h.ptr === 8 ? 24 : 20);
    const blocks = [];
    const WIN = 1024 * 1024;
    let win = null, winAt = 0, pos = h.size;
    while (pos + hl <= src.size){
      if (!win || pos < winAt || pos + hl > winAt + win.length){
        win = await src.read(pos, WIN);
        winAt = pos;
      }
      const dv = new DataView(win.buffer, win.byteOffset, win.byteLength);
      const o = pos - winAt;
      const code = String.fromCharCode(win[o], win[o + 1], win[o + 2], win[o + 3]).replace(/\0+$/, "");
      let len, old, sdna, nr;
      if (h.large){
        sdna = dv.getUint32(o + 4, h.little);
        old  = ptrKey(dv, o + 8, 8, h.little);
        len  = Number(dv.getBigInt64(o + 16, h.little));
        nr   = Number(dv.getBigInt64(o + 24, h.little));
      } else {
        len  = dv.getInt32(o + 4, h.little);
        old  = ptrKey(dv, o + 8, h.ptr, h.little);
        sdna = dv.getUint32(o + 8 + h.ptr, h.little);
        nr   = dv.getUint32(o + 12 + h.ptr, h.little);
      }
      if (code === "ENDB") break;
      if (len < 0 || pos + hl + len > src.size) throw fail(SAY.broken);
      blocks.push({ code, len, old, sdna, nr, at: pos + hl });
      pos += hl + len;
    }
    return blocks;
  }

  /* ---------- the file's own description of its structures ----------
     Names, then types, then each type's length, then each structure as a
     type and a list of (type, name) fields. A field's name carries its
     shape: "*next" is a pointer, "name[64]" an array, "(*func)()" a
     function pointer. */
  function sdna(bytes, h){
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0;
    const tag = () => { const s = String.fromCharCode(bytes[p], bytes[p+1], bytes[p+2], bytes[p+3]); p += 4; return s; };
    const i32 = () => { const x = dv.getInt32(p, h.little); p += 4; return x; };
    const i16 = () => { const x = dv.getInt16(p, h.little); p += 2; return x; };
    const str = () => { let s = ""; while (bytes[p]) s += String.fromCharCode(bytes[p++]); p++; return s; };
    const align = () => { p = (p + 3) & ~3; };
    if (tag() !== "SDNA" || tag() !== "NAME") throw fail(SAY.broken);
    const names = []; for (let i = 0, n = i32(); i < n; i++) names.push(str());
    align(); if (tag() !== "TYPE") throw fail(SAY.broken);
    const types = []; for (let i = 0, n = i32(); i < n; i++) types.push(str());
    align(); if (tag() !== "TLEN") throw fail(SAY.broken);
    const lens = []; for (let i = 0; i < types.length; i++) lens.push(i16());
    align(); if (tag() !== "STRC") throw fail(SAY.broken);

    const structs = [], byName = {};
    for (let i = 0, n = i32(); i < n; i++){
      const type = types[i16()];
      const fields = {};
      let off = 0;
      for (let f = 0, nf = i16(); f < nf; f++){
        const ftype = types[i16()], raw = names[i16()];
        const fptr = raw[0] === "(" ? 2 : raw[0] === "*" ? 1 : 0;   // 2: a function pointer
        const base = raw.replace(/^\(?\**/, "").replace(/\).*$/, "").replace(/\[.*$/, "");
        let count = 1;
        (raw.match(/\[(\d+)\]/g) || []).forEach(d => { count *= +d.slice(1, -1); });
        const one = fptr ? h.ptr : (lens[types.indexOf(ftype)] || 0);
        fields[base] = { type: ftype, off, ptr: !!fptr, count, one };
        off += one * count;
      }
      structs.push({ name: type, fields, size: off });
      byName[type] = structs[i];
    }
    return { structs, byName };
  }

  /* ---------- reading one structure ----------
     A view of one structure at one place in a block's bytes. get("r.engine")
     goes into the embedded RenderData; a char array comes back as text, a
     pointer as the key of the block it points at, a number as a number. */
  function View(ctx, st, bytes, base){
    this.c = ctx; this.st = st; this.b = bytes; this.base = base || 0;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  View.prototype = {
    find(path){
      let st = this.st, off = this.base, f = null;
      const parts = path.split(".");
      for (let i = 0; i < parts.length; i++){
        f = st && st.fields[parts[i]];
        if (!f) return null;
        off += f.off;
        if (i < parts.length - 1) st = this.c.dna.byName[f.type];
      }
      return { f, off };
    },
    has(path){ return !!this.find(path); },
    get(path, index){
      const at = this.find(path);
      if (!at) return undefined;
      const { f } = at;
      const off = at.off + (index || 0) * f.one;
      if (off + f.one > this.b.length) return undefined;
      const L = this.c.h.little;
      if (f.ptr) return ptrKey(this.dv, off, this.c.h.ptr, L);
      if (f.type === "char" && f.count > 1 && index === undefined){
        let s = "";
        for (let i = 0; i < f.count && this.b[off + i]; i++) s += String.fromCharCode(this.b[off + i]);
        return utf8(s);
      }
      switch (f.type){
        case "char": case "uchar": return this.b[off];
        case "int8_t": return this.dv.getInt8(off);
        case "short": return this.dv.getInt16(off, L);
        case "ushort": return this.dv.getUint16(off, L);
        case "int": case "int32_t": return this.dv.getInt32(off, L);
        case "uint": case "uint32_t": return this.dv.getUint32(off, L);
        case "float": return this.dv.getFloat32(off, L);
        case "double": return this.dv.getFloat64(off, L);
        case "int64_t": case "uint64_t": return Number(this.dv.getBigInt64(off, L));
      }
      return undefined;
    },
    /* The first of several names a field has had, for fields renamed
       between versions: totvert became verts_num. */
    any(){ for (const n of arguments){ const v = this.get(n); if (v !== undefined) return v; } return undefined; },
    sub(path){
      const at = this.find(path);
      const st = at && this.c.dna.byName[at.f.type];
      return st ? new View(this.c, st, this.b, at.off) : null;
    }
  };
  /* Blender writes names as UTF-8; the bytes were read one to a character. */
  function utf8(s){
    if (!/[\x80-\xff]/.test(s)) return s;
    try{ return decodeURIComponent(escape(s)); }catch(e){ return s; }
  }

  /* ---------- the scene as plain data ---------- */
  const OB_KIND = { 0:"empty", 1:"mesh", 2:"curve", 3:"surface", 4:"text", 5:"metaball", 10:"light", 11:"camera",
                    12:"speaker", 13:"probe", 22:"lattice", 25:"armature", 26:"pencil", 27:"hair",
                    28:"points", 29:"volume", 30:"pencil" };
  const LIGHT_KIND = { 0:"Point", 1:"Sun", 2:"Spot", 4:"Area" };
  /* A modifier or constraint block's structure is named after what it is,
     SubsurfModifierData, bTrackToConstraint, so the name is read from
     there rather than from a number that means different things in
     different versions. These are the ones whose structure name is not
     what Blender calls them. */
  const MOD_NAME = { Subsurf:"Subdivision Surface", Boolean:"Boolean", Solidify:"Solidify", Mirror:"Mirror",
    Array:"Array", Bevel:"Bevel", Decimate:"Decimate", Displace:"Displace", Wave:"Wave", Screw:"Screw",
    SimpleDeform:"Simple Deform", Smooth:"Smooth", LaplacianSmooth:"Smooth Laplacian", CorrectiveSmooth:"Smooth Corrective",
    Triangulate:"Triangulate", Wireframe:"Wireframe", Skin:"Skin", Remesh:"Remesh", Weld:"Merge by Distance",
    EdgeSplit:"Edge Split", Cast:"Cast", Curve:"Curve", Lattice:"Lattice", Armature:"Armature", Hook:"Hook",
    Shrinkwrap:"Shrinkwrap", Build:"Build", Explode:"Explode", Ocean:"Ocean", ParticleSystem:"Particle System",
    ParticleInstance:"Particle Instance", Cloth:"Cloth", Collision:"Collision", Fluid:"Fluid", DynamicPaint:"Dynamic Paint",
    Softbody:"Soft Body", Nodes:"Geometry Nodes", Multires:"Multiresolution", WeightedNormal:"Weighted Normal",
    NormalEdit:"Normal Edit", UVProject:"UV Project", UVWarp:"UV Warp", MeshDeform:"Mesh Deform", SurfaceDeform:"Surface Deform",
    Warp:"Warp", Mask:"Mask", MeshSequenceCache:"Mesh Sequence Cache", MeshToVolume:"Mesh to Volume",
    VolumeDisplace:"Volume Displace", VolumeToMesh:"Volume to Mesh", DataTransfer:"Data Transfer", Surface:"Surface" };
  function modName(structName){
    const k = String(structName || "").replace(/ModifierData$/, "");
    return MOD_NAME[k] || k.replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  function conName(structName){
    return String(structName || "").replace(/^b/, "").replace(/Constraint$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  /* "ShaderNodeTexImage" to "Tex Image"; the few a teacher looks for by
     name are given the name Blender shows. */
  const NODE_NAME = { ShaderNodeBsdfPrincipled:"Principled BSDF", ShaderNodeTexImage:"Image Texture",
    ShaderNodeTexNoise:"Noise Texture", ShaderNodeTexVoronoi:"Voronoi Texture", ShaderNodeTexWave:"Wave Texture",
    ShaderNodeTexMusgrave:"Musgrave Texture", ShaderNodeTexGradient:"Gradient Texture", ShaderNodeTexChecker:"Checker Texture",
    ShaderNodeTexBrick:"Brick Texture", ShaderNodeTexMagic:"Magic Texture", ShaderNodeValToRGB:"Color Ramp",
    ShaderNodeMixRGB:"Mix", ShaderNodeMix:"Mix", ShaderNodeEmission:"Emission", ShaderNodeBsdfGlass:"Glass BSDF",
    ShaderNodeBsdfDiffuse:"Diffuse BSDF", ShaderNodeBsdfGlossy:"Glossy BSDF", ShaderNodeBsdfTransparent:"Transparent BSDF",
    ShaderNodeMixShader:"Mix Shader", ShaderNodeBump:"Bump", ShaderNodeNormalMap:"Normal Map",
    ShaderNodeMapping:"Mapping", ShaderNodeTexCoord:"Texture Coordinate" };
  /* Nodes every material starts with, or that only carry wires about: not
     something a student chose, so not listed as what they used. */
  const NODE_PLAIN = { ShaderNodeOutputMaterial:1, NodeReroute:1, NodeFrame:1, NodeGroupInput:1, NodeGroupOutput:1 };
  const nodeName = (id) => NODE_NAME[id] || String(id || "").replace(/^(Shader|Geometry|Compositor|Function)Node/, "")
                                                       .replace(/([a-z])([A-Z])/g, "$1 $2");

  /* Three numbers 0 to 1, as a #rrggbb. Blender's colours are linear, so
     they are brought back to what the colour picker shows. */
  function hex(r, g, b){
    const s = (x) => { x = Math.max(0, Math.min(1, +x || 0));
                       x = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
                       return Math.round(x * 255).toString(16).padStart(2, "0"); };
    return "#" + s(r) + s(g) + s(b);
  }

  async function scene(src, h, blocks){
    const byOld = new Map();
    blocks.forEach(b => { if (b.old) byOld.set(b.old, b); });
    const dnaBlock = blocks.find(b => b.code === "DNA1");
    if (!dnaBlock) throw fail(SAY.broken);
    const ctx = { h, dna: sdna(await src.read(dnaBlock.at, dnaBlock.len), h) };

    const cache = new Map();
    async function bytesOf(b){
      if (!cache.has(b)) cache.set(b, await src.read(b.at, b.len));
      return cache.get(b);
    }
    /* The structure a pointer points at, as a View, or null. `i` picks one
       of several in a block that holds an array of them. */
    async function deref(key, i){
      const b = key && byOld.get(key);
      if (!b) return null;
      const st = ctx.dna.structs[b.sdna];
      if (!st) return null;
      const bytes = await bytesOf(b);
      const v = new View(ctx, st, bytes, (i || 0) * st.size);
      v.block = b;
      return v;
    }
    async function ids(code){
      const out = [];
      for (const b of blocks){
        if (b.code !== code) continue;
        const st = ctx.dna.structs[b.sdna];
        if (!st) continue;
        const v = new View(ctx, st, await bytesOf(b), 0);
        v.block = b;
        out.push(v);
      }
      return out;
    }
    const idName = (v) => v ? String(v.get("id.name") || "").slice(2) : "";
    /* A ListBase is a first and last pointer, each item pointing at the
       next. Stops at a loop or a few thousand, whichever comes first. */
    async function list(view, path){
      const out = [];
      const lb = view && view.sub(path);
      let key = lb && lb.get("first");
      const seen = new Set();
      while (key && !seen.has(key) && out.length < 5000){
        seen.add(key);
        const item = await deref(key);
        if (!item) break;
        out.push(item);
        key = item.get("next");
        if (key === undefined) key = item.has("modifier.next") ? item.get("modifier.next") : null;
      }
      return out;
    }
    /* An array of pointers, as Mesh.mat is: one block holding `n` of them. */
    async function ptrArray(key, n){
      const b = key && byOld.get(key);
      if (!b) return [];
      const bytes = await bytesOf(b);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const out = [];
      for (let i = 0; i < n && (i + 1) * h.ptr <= bytes.length; i++) out.push(ptrKey(dv, i * h.ptr, h.ptr, h.little));
      return out;
    }
    async function text(key){
      const b = key && byOld.get(key);
      if (!b) return "";
      const bytes = await bytesOf(b);
      let s = "";
      for (let i = 0; i < bytes.length && bytes[i]; i++) s += String.fromCharCode(bytes[i]);
      return utf8(s);
    }

    const st = { };

    /* ---- materials ----
       What a material is made of: its colour, whether it uses nodes, and
       which nodes it holds beyond the two every new material starts with. */
    const matByKey = new Map();
    for (const m of await ids("MA")){
      const out = { n: idName(m) };
      let colour = [m.get("r"), m.get("g"), m.get("b")];
      if (m.get("use_nodes")){
        out.nodes = 1;
        const tree = await deref(m.get("nodetree"));
        const kinds = {};
        const images = [];
        for (const node of tree ? await list(tree, "nodes") : []){
          const id = node.get("idname");
          if (!id || NODE_PLAIN[id]) continue;
          kinds[id] = (kinds[id] || 0) + 1;
          if (id === "ShaderNodeTexImage"){
            const im = await deref(node.get("id"));
            if (im) images.push(idName(im));
          }
          /* The base colour a Principled BSDF was given, which is the colour
             the material looks, rather than the viewport colour beside it
             that most students never touch. */
          if (id === "ShaderNodeBsdfPrincipled"){
            for (const sock of await list(node, "inputs")){
              if (sock.get("identifier") !== "Base Color") continue;
              const val = await deref(sock.get("default_value"));
              if (val && val.has("value")) colour = [val.get("value", 0), val.get("value", 1), val.get("value", 2)];
              /* Blender 2.8x labelled this block as a plain "Link" rather
                 than by what it holds, so it is read as the four floats it
                 always is. */
              else if (val && val.b.length >= 16) colour = [0, 1, 2].map(i => val.dv.getFloat32(i * 4, h.little));
            }
          }
        }
        const named = Object.keys(kinds).filter(k => k !== "ShaderNodeBsdfPrincipled");
        if (named.length) out.k = named.map(k => kinds[k] > 1 ? nodeName(k) + " ×" + kinds[k] : nodeName(k));
        if (images.length) out.im = images;
      }
      out.c = hex(colour[0], colour[1], colour[2]);
      matByKey.set(m.block.old, out);
    }

    /* ---- meshes ----
       Counted as they were modelled, before any modifier: a Subdivision
       Surface on a cube still leaves the cube's eight corners here. */
    const meshByKey = new Map();
    for (const me of await ids("ME")){
      const out = { n: idName(me),
                    v: me.any("totvert", "verts_num") || 0,
                    f: me.any("totpoly", "faces_num") || 0,
                    e: me.any("totedge", "edges_num") || 0 };
      out.mat = (await ptrArray(me.get("mat"), me.get("totcol") || 0)).filter(Boolean);
      meshByKey.set(me.block.old, out);
    }
    const curveByKey = new Map();
    for (const cu of await ids("CU")){
      const out = { n: idName(cu) };
      if (cu.has("str")) out.t = (await text(cu.get("str"))).slice(0, 400);
      out.mat = (await ptrArray(cu.get("mat"), cu.get("totcol") || 0)).filter(Boolean);
      curveByKey.set(cu.block.old, out);
    }
    const lightByKey = new Map();
    for (const la of await ids("LA")){
      lightByKey.set(la.block.old, { n: idName(la), a: LIGHT_KIND[la.get("type")] || "Light",
                                     w: Math.round((la.get("energy") || 0) * 10) / 10,
                                     c: hex(la.get("r"), la.get("g"), la.get("b")) });
    }
    const camByKey = new Map();
    for (const ca of await ids("CA")){
      camByKey.set(ca.block.old, { n: idName(ca), lens: Math.round((ca.get("lens") || 0) * 10) / 10,
                                   ortho: ca.get("type") === 1 ? 1 : undefined });
    }

    /* ---- animation ----
       Each action's keyframes and the frames they span. Since 4.4 an action
       keeps its curves in layers rather than straight on it; such a one is
       still counted as animation, without its keyframes. */
    const actByKey = new Map();
    for (const ac of await ids("AC")){
      let keys = 0, lo = Infinity, hi = -Infinity;
      const paths = new Set();
      for (const fc of await list(ac, "curves")){
        const n = fc.get("totvert") || 0;
        keys += n;
        const what = await text(fc.get("rna_path"));
        if (what) paths.add(what.replace(/\[.*$/, ""));
        if (n){
          const first = await deref(fc.get("bezt"), 0), last = await deref(fc.get("bezt"), n - 1);
          const frame = (bz) => bz && bz.has("vec") ? bz.get("vec", 3) : undefined;   // vec[1][0], the key itself
          const a = frame(first), z = frame(last);
          if (a !== undefined){ lo = Math.min(lo, a); hi = Math.max(hi, z); }
        }
      }
      const layered = ac.has("layer_array_num") && ac.get("layer_array_num") > 0;
      actByKey.set(ac.block.old, { n: idName(ac), keys, from: isFinite(lo) ? Math.round(lo) : undefined,
                                   to: isFinite(hi) ? Math.round(hi) : undefined,
                                   what: Array.from(paths).slice(0, 8), layered: layered || undefined });
    }
    async function animOf(v){
      const adt = v && v.has("adt") ? await deref(v.get("adt")) : null;
      const act = adt && actByKey.get(adt.get("action"));
      if (adt && !act && adt.has("drivers") && adt.sub("drivers").get("first")) return { drivers: 1 };
      return act || null;
    }

    /* ---- objects ---- */
    const objects = [];
    const animated = new Set();
    const matUsed = new Map();
    for (const ob of await ids("OB")){
      const kind = OB_KIND[ob.get("type")] || "other";
      const o = { n: idName(ob), k: kind };
      const data = ob.get("data");
      const info = meshByKey.get(data) || curveByKey.get(data) || lightByKey.get(data) || camByKey.get(data);
      if (info){
        o.d = info.n;
        if (kind === "mesh"){ o.v = info.v; o.f = info.f; }
        if (kind === "text" && info.t) o.t = info.t;
        if (kind === "light"){ o.a = info.a; o.w = info.w; o.c = info.c; }
        if (kind === "camera"){ o.lens = info.lens; if (info.ortho) o.ortho = 1; }
      }
      /* Materials sit on the mesh unless a slot was set to Object, in which
         case the object's own list holds that one. */
      const own = await ptrArray(ob.get("mat"), ob.get("totcol") || 0);
      const slots = (info && info.mat) || [];
      const keys = [];
      for (let i = 0; i < Math.max(own.length, slots.length); i++){
        const k = own[i] || slots[i];
        if (k && matByKey.has(k)) keys.push(k);
      }
      if (keys.length){
        o.m = Array.from(new Set(keys)).map(k => matByKey.get(k).n);
        keys.forEach(k => matUsed.set(k, matByKey.get(k)));
      }
      const mods = [];
      for (const md of await list(ob, "modifiers")){
        const name = modName(md.st.name);
        const levels = md.st.name === "SubsurfModifierData" ? md.get("levels") : undefined;
        mods.push(levels !== undefined ? name + " " + levels : name);
      }
      if (mods.length) o.mods = mods;
      const cons = [];
      for (const c of await list(ob, "constraints")){
        const d = await deref(c.get("data"));
        cons.push(d ? conName(d.st.name) : (c.get("name") || "Constraint"));
      }
      if (cons.length) o.cons = cons;
      const parts = await list(ob, "particlesystem");
      if (parts.length) o.ps = parts.length;
      const anim = await animOf(ob);
      if (anim){ o.anim = anim.keys || 1; animated.add(ob.block.old); }
      const parent = await deref(ob.get("parent"));
      if (parent) o.p = idName(parent);
      /* Switched off for rendering: the camera in the Outliner. It still
         counts as work done, the same as a hidden layer in Photoshop. */
      const restrict = ob.get("restrictflag") || 0;
      if (restrict & 4) o.h = 1;
      objects.push(o);
    }
    st.objectCount = objects.length;
    st.objects = objects.slice(0, MAX_LIST);

    st.materials = Array.from(matUsed.values()).slice(0, MAX_LIST).map(m => Object.assign({}, m));
    const unused = matByKey.size - matUsed.size;
    if (unused > 0) st.unusedMaterials = unused;

    /* ---- images ----
       Packed into the file, or linked from somewhere on the student's
       computer that the teacher will not have. Blender's own render
       results are not pictures anyone chose. */
    const images = [];
    for (const im of await ids("IM")){
      const n = idName(im);
      const src4 = im.get("source");
      if (src4 === 5 || src4 === 6 || /^Render Result$|^Viewer Node$/.test(n)) continue;   // 5 viewer, 6 tiled is a real one but rare
      const out = { n };
      if (im.get("packedfile")) out.packed = 1;
      else if (src4 === 4) out.made = 1;            // generated inside Blender
      else out.path = String(im.get("filepath") || im.get("name") || "").replace(/^.*[\\\/]/, "").slice(0, 80);
      images.push(out);
    }
    if (images.length) st.images = images.slice(0, MAX_LIST);

    /* ---- animation across the file ----
       Objects' own actions are counted on the objects; materials, shape
       keys and the world can be animated too, and are counted here. */
    let keys = 0, actions = 0;
    actByKey.forEach(a => { if (a.keys || a.layered){ actions++; keys += a.keys; } });
    if (actions) st.anim = { actions, keys };

    /* ---- the scene being shown when it was saved ---- */
    const scenes = await ids("SC");
    let current = null;
    const glob = blocks.find(b => b.code === "GLOB");
    if (glob){
      const g = new View(ctx, ctx.dna.structs[glob.sdna], await bytesOf(glob), 0);
      const cur = g.get("curscene");
      current = scenes.find(s => s.block.old === cur) || null;
      const commit = g.get("build_hash");
      if (commit) st.build = commit.slice(0, 12);
    }
    current = current || scenes[0];
    if (scenes.length > 1) st.scenes = scenes.length;
    if (current){
      const r = current.sub("r");
      const engine = r ? String(r.get("engine") || "") : "";
      const cam = await deref(current.get("camera"));
      const fps = r ? (r.get("frs_sec") || 0) / (r.get("frs_sec_base") || 1) : 0;
      st.scene = {
        n: idName(current),
        engine: /CYCLES/.test(engine) ? "Cycles" : /EEVEE/.test(engine) ? "Eevee" : /WORKBENCH/.test(engine) ? "Workbench" : engine,
        w: r && r.get("xsch"), h: r && r.get("ysch"), pct: r && r.get("size"),
        start: r && r.get("sfra"), end: r && r.get("efra"),
        fps: Math.round(fps * 100) / 100,
        cam: cam ? idName(cam) : undefined
      };
      const world = await deref(current.get("world"));
      if (world){
        st.world = { n: idName(world), c: hex(world.get("horr"), world.get("horg"), world.get("horb")) };
        if (world.get("use_nodes")) st.world.nodes = 1;
      }
    }
    const collections = (await ids("GR")).length;
    if (collections) st.collections = collections;
    return st;
  }

  /* ---------- the picture ----------
     Blender saves a small preview of the 3D view inside the file, as raw
     pixels from the bottom row up. It is only there when Save Preview was on,
     which it is unless someone turned it off. */
  async function preview(src, blocks, h){
    const b = blocks.find(x => x.code === "TEST");
    if (!b || b.len < 8) return null;
    const bytes = await src.read(b.at, b.len);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const w = dv.getInt32(0, h.little), ht = dv.getInt32(4, h.little);
    if (w <= 0 || ht <= 0 || 8 + w * ht * 4 > bytes.length) return null;
    const rgba = new Uint8ClampedArray(w * ht * 4);
    for (let y = 0; y < ht; y++){
      const from = 8 + (ht - 1 - y) * w * 4;
      rgba.set(bytes.subarray(from, from + w * 4), y * w * 4);
    }
    return { w, h: ht, rgba };
  }
  function previewCanvas(p){
    if (!p || typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = p.w; c.height = p.h;
    const ctx = c.getContext("2d");
    /* Transparent parts go onto Blender's own viewport grey. */
    ctx.fillStyle = "#3d3d3d";
    ctx.fillRect(0, 0, p.w, p.h);
    const tmp = document.createElement("canvas");
    tmp.width = p.w; tmp.height = p.h;
    tmp.getContext("2d").putImageData(new ImageData(p.rgba, p.w, p.h), 0, 0);
    ctx.drawImage(tmp, 0, 0);
    return c;
  }

  /* ---------- the whole file ----------
     Resolves to { canvas, preview, stats }: canvas is the preview drawn,
     null when the file has none. Rejects with an Error whose message can be
     shown to a student as it is. */
  async function readBlend(file){
    if (!file) throw fail(SAY.notBlend);
    if (/\.blend\d+$/i.test(file.name || "")) throw fail(SAY.backup);
    let head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    /* Before 3.0, Compress meant gzip, which the browser can undo itself.
       From 3.0 it means zstd, which it cannot. */
    if (head[0] === 0x28 && head[1] === 0xb5 && head[2] === 0x2f && head[3] === 0xfd) throw fail(SAY.zstd);
    if (head[0] === 0x1f && head[1] === 0x8b){
      if (typeof DecompressionStream === "undefined") throw fail(SAY.broken);
      try{
        file = await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
      }catch(e){ throw fail(SAY.broken); }
      head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    }
    const h = header(head);
    if (!h) throw fail(SAY.notBlend);
    let blocks, stats, pic;
    try{
      const src = await source(file);
      blocks = await walk(src, h);
      stats = await scene(src, h, blocks);
      pic = await preview(src, blocks, h);
    }catch(e){
      throw e && e.forStudent ? e : fail(SAY.broken);
    }
    stats = Object.assign({ v: 1, fmt: "blend", file: String(file.name || "").slice(0, 80), bytes: file.size,
                            ver: versionName(h.ver) }, stats);
    if (file.lastModified) stats.modified = new Date(file.lastModified).toISOString();
    return { canvas: previewCanvas(pic), preview: pic, stats };
  }

  /* ---------- a checklist ticked from the file ----------
     The same shape of result as runPsdChecks, so the checklist a Photoshop
     task carries sits on a Blender task unchanged. Counted from the object
     list rather than totals worked out when the file was read, so a
     checklist changed after students handed in is answered from the files
     they already gave. */
  const kindIs = (k) => (O) => O.filter(o => o.k === k).length;
  const COUNT = {
    blendObjects:  (O) => O.length,
    blendMeshes:   kindIs("mesh"),
    blendLights:   kindIs("light"),
    blendCameras:  kindIs("camera"),
    blendText:     kindIs("text"),
    blendMaterials:(O) => new Set([].concat.apply([], O.map(o => o.m || []))).size,
    blendTextured: (O, st) => (st.materials || []).filter(m => (m.im && m.im.length) ||
                                 (m.k || []).some(k => /Texture/.test(k))).length,
    blendModified: (O) => O.filter(o => o.mods && o.mods.length).length,
    blendModKinds: (O) => new Set([].concat.apply([], O.map(o => (o.mods || []).map(m => m.replace(/ \d+$/, ""))))).size,
    blendAnimated: (O) => O.filter(o => o.anim).length,
    blendKeys:     (O, st) => (st.anim && st.anim.keys) || 0,
    blendFaces:    (O) => O.reduce((n, o) => n + (o.f || 0), 0),
    blendFrames:   (O, st) => st.scene && st.scene.end >= st.scene.start ? st.scene.end - st.scene.start + 1 : 0
  };
  function blendCount(stats, kind, onlyShowing){
    let O = (stats && Array.isArray(stats.objects)) ? stats.objects : [];
    if (onlyShowing) O = O.filter(o => !o.h);
    return COUNT[kind] ? COUNT[kind](O, stats || {}) : null;
  }
  window.runBlendChecks = function(checks, stats){
    return (checks || []).map(c => {
      const label = (c && c.label) || "Check";
      if (c && c.manual === true) return { ok:false, manual:true, label };
      const n = blendCount(stats, c && c.kind);
      if (n === null) return { ok:false, broken:true, label, note:"Unknown kind of check: " + (c && c.kind) };
      const want = Math.max(0, parseInt(c.count, 10) || 1);
      const meets = (k) => c.compare === "exactly" ? k === want : c.compare === "atMost" ? k <= want : k >= want;
      const ok = !!stats && meets(n);
      const out = { label, ok, note: ok ? "" : String(c.hint || "").trim() };
      if (stats && meets(blendCount(stats, c.kind, true)) !== ok)
        out.flag = ok ? "From a hidden object" : "Hidden objects counted";
      return out;
    });
  };
  window.blendCount = blendCount;
  window.readBlend = readBlend;
  window.isBlendFile = (file) => !!file && /\.blend\d*$/i.test(file.name || "");
})();
