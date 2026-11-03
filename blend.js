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
      if (f.ptr){
        const raw = ptrKey(this.dv, off, this.c.h.ptr, L);
        if (!raw) return raw;
        return this.c.isId(f.type) ? "I|" + raw : this.block ? this.block.owner + "|" + raw : raw;
      }
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
      if (!st) return null;
      const v = new View(this.c, st, this.b, at.off);
      v.block = this.block;
      return v;
    }
  };
  /* Blender writes names as UTF-8; the bytes were read one to a character. */
  function utf8(s){
    if (!/[\x80-\xff]/.test(s)) return s;
    try{ return decodeURIComponent(escape(s)); }catch(e){ return s; }
  }

  /* ---------- the scene as plain data ---------- */
  /* The keyed properties the 3D view plays back: where an object is, how
     it is turned, its size, and switching it off and on. */
  const MOVES = { location:1, rotation_euler:1, rotation_quaternion:1, rotation_axis_angle:1, scale:1, hide_viewport:1 };
  const FCURVE_MUTED = 16, FCURVE_MOD_OFF = 32, FCURVE_DISCRETE = 4096, FMODIFIER_MUTED = 8, FMODIFIER_CYCLES = 4;
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
    /* A saved pointer is the address the thing had in memory, and Blender
       only promises it is unique among the blocks saved with one item: 3.6
       reuses addresses between meshes as it saves them, which put one
       mesh's corners on another. So, as Blender's own loader does, a
       pointer is looked up among the blocks after the item it belongs to,
       and a pointer to another item (a mesh, a material) among items. */
    const NOT_ID = { DATA:1, REND:1, TEST:1, GLOB:1, DNA1:1, USER:1, ENDB:1 };
    let owner = -1;
    const scoped = new Map(), idMap = new Map(), anyMap = new Map();
    blocks.forEach((b, i) => {
      b.isId = !NOT_ID[b.code];
      if (b.isId) owner = i;
      b.owner = owner;
      if (!b.old) return;
      scoped.set(owner + "|" + b.old, b);
      if (b.isId && !idMap.has(b.old)) idMap.set(b.old, b);
      if (!anyMap.has(b.old)) anyMap.set(b.old, b);
    });
    const byOld = { get(key){
      if (!key) return undefined;
      const bar = key.indexOf("|");
      if (bar < 0) return idMap.get(key) || anyMap.get(key);
      const raw = key.slice(bar + 1);
      if (key[0] === "I") return idMap.get(raw) || anyMap.get(raw);
      return scoped.get(key) || idMap.get(raw) || anyMap.get(raw);
    } };
    /* The same item reached by two pointers is the same block, so maps of
       items are kept by where the block sits in the file. */
    const at = (key) => { const b = byOld.get(key); return b ? b.at : -1; };
    const dnaBlock = blocks.find(b => b.code === "DNA1");
    if (!dnaBlock) throw fail(SAY.broken);
    const dna = sdna(await src.read(dnaBlock.at, dnaBlock.len), h);
    const idTypes = new Map();
    const ctx = { h, dna, isId(type){
      if (!idTypes.has(type)){
        const st = dna.byName[type];
        idTypes.set(type, type === "ID" || !!(st && st.fields.id && st.fields.id.off === 0 && st.fields.id.type === "ID"));
      }
      return idTypes.get(type);
    } };

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
      /* Every array of pointers read here is a list of materials, which are items. */
      for (let i = 0; i < n && (i + 1) * h.ptr <= bytes.length; i++){
        const raw = ptrKey(dv, i * h.ptr, h.ptr, h.little);
        out.push(raw ? "I|" + raw : null);
      }
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
      matByKey.set(m.block.at, out);
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
      /* Slots in order, empty ones kept: a face's material is a slot number. */
      out.mat = await ptrArray(me.get("mat"), me.get("totcol") || 0);
      out.view = me;
      meshByKey.set(me.block.at, out);
    }
    const curveByKey = new Map();
    for (const cu of await ids("CU")){
      const out = { n: idName(cu) };
      if (cu.has("str")) out.t = (await text(cu.get("str"))).slice(0, 400);
      out.mat = await ptrArray(cu.get("mat"), cu.get("totcol") || 0);
      curveByKey.set(cu.block.at, out);
    }
    const lightByKey = new Map();
    for (const la of await ids("LA")){
      lightByKey.set(la.block.at, { n: idName(la), a: LIGHT_KIND[la.get("type")] || "Light",
                                     w: Math.round((la.get("energy") || 0) * 10) / 10,
                                     c: hex(la.get("r"), la.get("g"), la.get("b")) });
    }
    const camByKey = new Map();
    for (const ca of await ids("CA")){
      camByKey.set(ca.block.at, { n: idName(ca), lens: Math.round((ca.get("lens") || 0) * 10) / 10,
                                   ortho: ca.get("type") === 1 ? 1 : undefined });
    }

    /* ---- animation ----
       Each action's keyframes and the frames they span. Since 4.4 an action
       keeps its curves in layers rather than straight on it; such a one is
       still counted as animation, without its keyframes. */
    const actByKey = new Map();
    for (const ac of await ids("AC")){
      let keys = 0, lo = Infinity, hi = -Infinity;
      const paths = new Set(), curves = [];
      for (const fc of await list(ac, "curves")){
        const n = fc.get("totvert") || 0;
        keys += n;
        const what = await text(fc.get("rna_path"));
        if (what) paths.add(what.replace(/\[.*$/, ""));
        if (MOVES[what] && n && !((fc.get("flag") || 0) & FCURVE_MUTED)) curves.push(await curveForView(fc, what, n));
        if (n){
          const first = await deref(fc.get("bezt"), 0), last = await deref(fc.get("bezt"), n - 1);
          const frame = (bz) => bz && bz.has("vec") ? bz.get("vec", 3) : undefined;   // vec[1][0], the key itself
          const a = frame(first), z = frame(last);
          if (a !== undefined){ lo = Math.min(lo, a); hi = Math.max(hi, z); }
        }
      }
      const layered = ac.has("layer_array_num") && ac.get("layer_array_num") > 0;
      actByKey.set(ac.block.at, { n: idName(ac), keys, curves, from: isFinite(lo) ? Math.round(lo) : undefined,
                                   to: isFinite(hi) ? Math.round(hi) : undefined,
                                   what: Array.from(paths).slice(0, 8), layered: layered || undefined });
    }
    /* One keyed curve as the 3D view needs it. Each key is [frame, value,
       how it eases to the next, its two handles], then the settings of the
       easing it uses if it is not Bezier. The handles are kept on every
       key: easing into a key reads its left handle whatever kind it is. */
    async function curveForView(fc, path, n){
      const keys = [];
      for (let i = 0; i < n; i++){
        const bz = await deref(fc.get("bezt"), i);
        if (!bz) break;
        const v = (k) => r4(bz.get("vec", k));
        const ipo = bz.get("ipo") || 0;
        const key = [v(3), v(4), ipo, v(0), v(1), v(6), v(7)];
        if (ipo >= 3) key.push(bz.get("easing") || 0, r4(bz.get("back") || 0), r4(bz.get("amplitude") || 0), r4(bz.get("period") || 0));
        keys.push(key);
      }
      const flag = fc.get("flag") || 0;
      const out = { p: path, i: fc.get("array_index") || 0, k: keys };
      if (fc.get("extend") === 1) out.lin = 1;
      if (flag & FCURVE_DISCRETE) out.step = 1;
      /* A Cycles modifier repeats the keys before and after them. Only that
         one is kept: it is how a student makes something loop, and the
         others (Noise, Stepped and so on) are rare at this level. */
      if (!(flag & FCURVE_MOD_OFF))
        for (const m of await list(fc, "modifiers")){
          if (m.get("type") !== FMODIFIER_CYCLES || (m.get("flag") & FMODIFIER_MUTED)) continue;
          const d = await deref(m.get("data"));
          if (d) out.cyc = [d.get("before_mode") || 0, d.get("after_mode") || 0, d.get("before_cycles") || 0, d.get("after_cycles") || 0];
        }
      return out;
    }
    async function animOf(v){
      const adt = v && v.has("adt") ? await deref(v.get("adt")) : null;
      const act = adt && actByKey.get(at(adt.get("action")));
      if (adt && !act && adt.has("drivers") && adt.sub("drivers").get("first")) return { drivers: 1 };
      return act || null;
    }

    /* ---- objects ---- */
    const objects = [];
    const drawable = [];            // what the 3D view will need, alongside each object
    const animated = new Set();
    const matUsed = new Map();
    for (const ob of await ids("OB")){
      const kind = OB_KIND[ob.get("type")] || "other";
      const o = { n: idName(ob), k: kind };
      const data = ob.get("data");
      const info = meshByKey.get(at(data)) || curveByKey.get(at(data)) || lightByKey.get(at(data)) || camByKey.get(at(data));
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
        const k = at(own[i] || slots[i]);
        if (matByKey.has(k)) keys.push(k);
      }
      if (keys.length){
        o.m = Array.from(new Set(keys)).map(k => matByKey.get(k).n);
        keys.forEach(k => matUsed.set(k, matByKey.get(k)));
      }
      const mods = [], geoMods = [];
      for (const md of await list(ob, "modifiers")){
        const name = modName(md.st.name);
        const levels = md.st.name === "SubsurfModifierData" ? md.get("levels") : undefined;
        mods.push(levels !== undefined ? name + " " + levels : name);
        geoMods.push(modForView(md, name));
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
      if (anim){ o.anim = anim.keys || 1; animated.add(ob.block.at); }
      const parent = await deref(ob.get("parent"));
      if (parent) o.p = idName(parent);
      /* Switched off for rendering: the camera in the Outliner. It still
         counts as work done, the same as a hidden layer in Photoshop. */
      const restrict = ob.get("restrictflag") || 0;
      if (restrict & 4) o.h = 1;
      objects.push(o);
      const slotColours = [];
      for (let i = 0; i < Math.max(own.length, slots.length); i++){
        const m = matByKey.get(at(own[i] || slots[i]));
        slotColours.push(m ? m.c : DEFAULT_GREY);
      }
      drawable.push({ i: objects.length - 1, ob, kind, info, mods: geoMods, colours: slotColours,
                      offInViewport: !!(restrict & 1), act: anim && anim.curves && anim.curves.length ? anim : null,
                      parentAt: at(ob.get("parent")) });
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
      current = scenes.find(s => s.block === byOld.get(cur)) || null;
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

    /* ---- the scene itself, for the 3D view ----
       Never allowed to stop the rest being handed in: a file whose meshes
       cannot be read still has its objects, materials and checklist. */
    /* What the 3D view showed: the objects in the scene's first view layer,
       which leaves out a collection unticked in the Outliner, less any
       hidden with H, the eye. Null when the file has no view layers, as
       before 2.8, and then everything is drawn. */
    async function shownObjects(sc){
      const layers = sc.has("view_layers") ? await list(sc, "view_layers") : [];
      if (!layers.length) return null;
      const keys = new Set();
      for (const base of await list(layers[0], "object_bases"))
        if (!((base.get("flag") || 0) & BASE_HIDDEN)) keys.add(at(base.get("object")));
      return keys;
    }
    try{
      const shown = current ? await shownObjects(current) : null;
      /* The frame showing when the file was saved, which the 3D view opens on. */
      const r = current && current.sub("r");
      if (r && r.get("cfra") !== undefined) st.frame = r.get("cfra");
      st.geo = await sceneForView(drawable, shown, st, { deref, ids, bytesOf, byOld, at, ctx, list, h });
      delete st.frame;
    }catch(e){
      st.geo = { v: 1, failed: 1 };
    }
    return st;
  }

  /* ---------- the scene for the 3D view ----------
     Enough to draw the scene the way Blender's solid view does: each mesh's
     corners and faces, where each object sits, the colour of each face's
     material, and the camera and lights. Kept as numbers packed into text,
     never as pictures.

     Storage: a student's whole lesson may be at most 1.5MB on the server,
     and the picture beside this can take 150KB, so the scene is held to
     GEO_BUDGET characters. A typical KS3 scene is 10 to 60KB. Past the
     budget the biggest models are simplified, by merging corners that sit
     close together, until it fits, and the view says which were.

     Modifiers are not applied here. A Subdivision Surface multiplies the
     faces by four a level, so storing its result would cost sixteen times a
     level-two model; storing the settings and redoing it in the view costs
     nothing. Mirror, Array and Subdivision Surface are redone; the others
     are named in the view as not drawn. */
  const GEO_BUDGET = 450000;
  const BASE_HIDDEN = 256;               // a view layer base hidden with H; measured on a 3.6 file
  const DEFAULT_GREY = "#cccccc";        // Blender's solid view colour for a face with no material
  const MAX_READ_VERTS = 3000000;        // beyond this a mesh is not read at all, to spare the computer's memory

  /* A modifier as the view needs it, or just its name when the view cannot
     redo it. "show in viewport" is bit 1 of mode: switched off there, it is
     off in the view too. */
  function modForView(md, name){
    const shown = ((md.has("modifier.mode") ? md.get("modifier.mode") : 1) & 1) === 1;
    if (!shown) return { t: "off", n: name };
    switch (md.st.name){
      case "MirrorModifierData": {
        /* Axis bits: X is 8, Y 16, Z 32. Before 2.8 the axis was a number. */
        const flag = md.get("flag") || 0;
        let axes = (flag >> 3) & 7;
        if (!axes) axes = 1 << (md.get("axis") || 0);
        return { t: "mirror", a: axes, merge: (flag & 128) ? 0 : 1, tol: md.get("tolerance") || 0.001,
                 ob: md.get("mirror_ob") ? 1 : undefined };
      }
      case "ArrayModifierData": {
        const flags = md.get("offset_type") || 0;
        const rel = [0, 1, 2].map(i => md.get("scale", i) || 0);
        const con = [0, 1, 2].map(i => md.get("offset", i) || 0);
        return { t: "array", count: Math.max(1, md.get("count") || 1), fit: md.get("fit_type") || 0,
                 len: md.get("length") || 0, rel: (flags & 2) ? rel : undefined, con: (flags & 1) ? con : undefined,
                 ob: (flags & 4) && md.get("offset_ob") ? 1 : undefined };
      }
      case "SubsurfModifierData":
        /* Since 2.91 the corners are moved onto the smooth limit surface
           unless Use Limit Surface is off, which is flag 64 being set. */
        return { t: "subsurf", lv: md.get("levels") || 0, simple: md.get("subdivType") === 1 ? 1 : undefined,
                 limit: (md.get("flags") & 64) ? undefined : 1 };
    }
    return { t: "skip", n: name };
  }

  /* An object's place in the world: its own 4×4 matrix as Blender last
     worked it out, which already includes its parent. Blender 4.2 stopped
     saving it, so then it is built again from location, rotation and scale,
     and the parent's, the same way Blender does. */
  const ROT_ORDER = { 1:"XYZ", 2:"XZY", 3:"YXZ", 4:"YZX", 5:"ZXY", 6:"ZYX" };
  function mul(a, b){                      // column-major 4×4, as WebGL keeps them
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++){
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  /* An object's own transform, as plain numbers: what the file holds, and
     what an animation changes frame by frame. */
  function transformOf(ob){
    const v = (f, n, d) => Array.from({ length: n }, (_, i) => { const x = ob.get(f, i); return x === undefined ? d : x; });
    const saved = ob.get("rotmode");
    return { l: v("loc", 3, 0), s: v("size", 3, 1), r: v("rot", 3, 0), q: v("quat", 4, 0),
             ax: v("rotAxis", 3, 0), an: ob.get("rotAngle") || 0,
             m: saved === undefined ? 1 : saved };      // 0 is a quaternion, so not "|| 1"
  }
  /* Location, rotation and scale to a matrix, as Blender builds one. Shared
     with blendview.js, which does the same for every frame of an animation. */
  function trs(t){
    let R;
    if (t.m === 0){                        // a quaternion
      const [w, x, y, z] = t.q;
      const n = Math.hypot(w, x, y, z) || 1, a = w / n, b = x / n, c = y / n, d = z / n;
      R = [1-2*(c*c+d*d), 2*(b*c+a*d), 2*(b*d-a*c), 0,
           2*(b*c-a*d), 1-2*(b*b+d*d), 2*(c*d+a*b), 0,
           2*(b*d+a*c), 2*(c*d-a*b), 1-2*(b*b+c*c), 0, 0, 0, 0, 1];
    } else if (t.m === -1){                // an axis and an angle
      let [x, y, z] = t.ax;
      const n = Math.hypot(x, y, z) || 1; x /= n; y /= n; z /= n;
      const c = Math.cos(t.an), s = Math.sin(t.an), u = 1 - c;
      R = [u*x*x+c, u*x*y+s*z, u*x*z-s*y, 0, u*x*y-s*z, u*y*y+c, u*y*z+s*x, 0,
           u*x*z+s*y, u*y*z-s*x, u*z*z+c, 0, 0, 0, 0, 1];
    } else {
      const axis = (i) => {
        const c = Math.cos(t.r[i]), s = Math.sin(t.r[i]);
        if (i === 0) return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
        if (i === 1) return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
        return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];
      };
      /* "XYZ" means X is applied first, so it sits rightmost. */
      R = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      (ROT_ORDER[t.m] || "XYZ").split("").forEach(ch => { R = mul(axis("XYZ".indexOf(ch)), R); });
    }
    const S = [t.s[0],0,0,0, 0,t.s[1],0,0, 0,0,t.s[2],0, 0,0,0,1];
    const M = mul(R, S);
    M[12] = t.l[0]; M[13] = t.l[1]; M[14] = t.l[2];
    return M;
  }
  window.blendTRS = trs;
  window.blendMul = mul;
  const localMatrix = (ob) => trs(transformOf(ob));
  async function worldMatrix(ob, tools, depth){
    const saved = ob.has("obmat") ? "obmat" : ob.has("object_to_world") ? "object_to_world" : "";
    if (saved && ob.find(saved).f.count === 16){
      const m = [];
      for (let i = 0; i < 16; i++) m.push(ob.get(saved, i));
      if (m.some(x => x !== 0)) return m;
    }
    let M = localMatrix(ob);
    const parent = depth < 32 ? await tools.deref(ob.get("parent")) : null;
    if (parent){
      const inv = [];
      for (let i = 0; i < 16; i++) inv.push(ob.get("parentinv", i));
      M = mul(await worldMatrix(parent, tools, depth + 1), mul(inv.some(x => x) ? inv : [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], M));
    }
    return M;
  }

  /* A mesh's corners and faces, from either way Blender has written them.
     Up to 3.6 it wrote the old structures, MVert, MPoly and MLoop. From 4.0
     it writes named attributes instead: "position" for the corners,
     ".corner_vert" for which corner each face goes round, and an offsets
     array saying where each face starts.

     The 4.0 way is written to Blender's description of it but has not been
     tried against a file from 4.0 or later. */
  async function meshGeometry(me, tools){
    const { deref, byOld, bytesOf, h } = tools;
    const nv = me.any("totvert", "verts_num") || 0, nf = me.any("totpoly", "faces_num") || 0;
    if (!nv || !nf || nv > MAX_READ_VERTS) return null;
    const raw = async (key) => { const b = key && byOld.get(key); return b ? { b, bytes: await bytesOf(b) } : null; };
    const dvOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    async function layer(cd, name){
      const c = me.sub(cd);
      if (!c) return null;
      const n = c.get("totlayer") || 0;
      for (let i = 0; i < n; i++){
        const L = await deref(c.get("layers"), i);
        if (L && L.get("name") === name) return raw(L.get("data"));
      }
      return null;
    }
    const pos = new Float32Array(nv * 3);
    const mv = me.has("mvert") ? await deref(me.get("mvert")) : null;
    if (mv && mv.has("co")){
      const stride = mv.st.size, co = mv.find("co").off, dv = mv.dv;
      for (let i = 0; i < nv && (i + 1) * stride <= mv.b.length; i++)
        for (let k = 0; k < 3; k++) pos[i * 3 + k] = dv.getFloat32(i * stride + co + k * 4, h.little);
    } else {
      const p = await layer("vdata", "position");
      if (!p || p.bytes.length < nv * 12) return null;
      const dv = dvOf(p.bytes);
      for (let i = 0; i < nv * 3; i++) pos[i] = dv.getFloat32(i * 4, h.little);
    }

    const sizes = new Uint32Array(nf), mat = new Uint8Array(nf), smooth = new Uint8Array(nf);
    let corners;
    const mp = me.has("mpoly") ? await deref(me.get("mpoly")) : null;
    if (mp && mp.has("loopstart")){
      const ml = await deref(me.get("mloop"));
      if (!ml || !ml.has("v")) return null;
      const nl = Math.floor(ml.b.length / ml.st.size);
      const lv = ml.find("v").off;
      const ls = mp.find("loopstart").off, lt = mp.find("totloop").off;
      const mn = mp.has("mat_nr") ? mp.find("mat_nr").off : -1, fl = mp.has("flag") ? mp.find("flag").off : -1;
      const starts = new Uint32Array(nf);
      let total = 0;
      for (let i = 0; i < nf; i++){
        const at = i * mp.st.size;
        starts[i] = mp.dv.getInt32(at + ls, h.little);
        sizes[i] = mp.dv.getInt32(at + lt, h.little);
        if (mn >= 0) mat[i] = Math.min(255, Math.max(0, mp.dv.getInt16(at + mn, h.little)));
        if (fl >= 0) smooth[i] = mp.b[at + fl] & 1;
        total += sizes[i];
      }
      corners = new Uint32Array(total);
      let o = 0;
      for (let i = 0; i < nf; i++)
        for (let k = 0; k < sizes[i]; k++){
          const l = starts[i] + k;
          corners[o++] = l < nl ? ml.dv.getUint32(l * ml.st.size + lv, h.little) : 0;
        }
    } else {
      const offs = await raw(me.any("face_offset_indices", "poly_offset_indices"));
      const cv = await layer("ldata", ".corner_vert");
      if (!offs || !cv) return null;
      const od = dvOf(offs.bytes), cd = dvOf(cv.bytes);
      const nl = cv.bytes.length >> 2;
      corners = new Uint32Array(nl);
      for (let i = 0; i < nl; i++) corners[i] = cd.getInt32(i * 4, h.little);
      for (let i = 0; i < nf; i++) sizes[i] = od.getInt32((i + 1) * 4, h.little) - od.getInt32(i * 4, h.little);
      const mi = await layer("pdata", "material_index");
      if (mi) { const d = dvOf(mi.bytes); for (let i = 0; i < nf && i * 4 < mi.bytes.length; i++) mat[i] = Math.min(255, Math.max(0, d.getInt32(i * 4, h.little))); }
      const sharp = await layer("pdata", "sharp_face");
      for (let i = 0; i < nf; i++) smooth[i] = sharp ? (sharp.bytes[i] ? 0 : 1) : 0;
    }
    for (let i = 0; i < corners.length; i++) if (corners[i] >= nv) corners[i] = 0;
    return { pos, sizes, corners, mat, smooth };
  }

  /* Simplified to about `target` corners by laying a grid over the model
     and merging every corner in a cell into one. Faces left with fewer
     than three corners go. */
  function simplify(g, target){
    const n = g.pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++){
      const x = g.pos[i * 3 + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x;
    }
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    /* How many cells across gives about the corners wanted is found by
       halving the range: a surface's corners grow with the square of it and
       a solid's with the cube, so it cannot be worked out straight off. */
    let few = 2, many = 4096, cells = Math.round(Math.sqrt(target) * 2);
    for (let tries = 0; tries < 16; tries++){
      const cell = span / cells, map = new Map(), remap = new Uint32Array(n), sum = [];
      for (let i = 0; i < n; i++){
        const key = Math.floor((g.pos[i*3] - lo[0]) / cell) + "," + Math.floor((g.pos[i*3+1] - lo[1]) / cell) + "," +
                    Math.floor((g.pos[i*3+2] - lo[2]) / cell);
        let j = map.get(key);
        if (j === undefined){ j = map.size; map.set(key, j); sum.push([0, 0, 0, 0]); }
        remap[i] = j;
        const s = sum[j]; s[0] += g.pos[i*3]; s[1] += g.pos[i*3+1]; s[2] += g.pos[i*3+2]; s[3]++;
      }
      const last = tries === 15 || many - few <= 1;
      if (!last && map.size > target){ many = cells; cells = Math.floor((few + cells) / 2); continue; }
      if (!last && map.size < target * 0.85){ few = cells; cells = Math.ceil((cells + many) / 2); continue; }
      const pos = new Float32Array(map.size * 3);
      sum.forEach((s, j) => { pos[j*3] = s[0] / s[3]; pos[j*3+1] = s[1] / s[3]; pos[j*3+2] = s[2] / s[3]; });
      const sizes = [], corners = [], mat = [], smooth = [];
      let at = 0;
      for (let f = 0; f < g.sizes.length; f++){
        const ring = [];
        for (let k = 0; k < g.sizes[f]; k++){
          const v = remap[g.corners[at + k]];
          if (ring[ring.length - 1] !== v) ring.push(v);
        }
        at += g.sizes[f];
        if (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring.pop();
        if (new Set(ring).size < 3) continue;
        sizes.push(ring.length); ring.forEach(v => corners.push(v)); mat.push(g.mat[f]); smooth.push(g.smooth[f]);
      }
      return { pos, sizes: Uint32Array.from(sizes), corners: Uint32Array.from(corners),
               mat: Uint8Array.from(mat), smooth: Uint8Array.from(smooth), simplified: 1 };
    }
    return g;
  }

  /* Typed arrays to base64 text, so the scene can sit in the work's JSON. */
  function b64(arr){
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  /* Corners to whole numbers 0 to 65535 across the model's box: a hundred
     thousandth of its size, finer than anything that shows. */
  function packMesh(g){
    const n = g.pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++){
      const x = g.pos[i * 3 + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x;
    }
    const size = [0, 1, 2].map(k => (hi[k] - lo[k]) || 0);
    const q = new Uint16Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++)
      q[i * 3 + k] = size[k] ? Math.round((g.pos[i * 3 + k] - lo[k]) / size[k] * 65535) : 0;
    const wide = n > 65535, big = g.sizes.some(x => x > 255);
    const out = { nv: n, nf: g.sizes.length, lo: lo.map(r6), sz: size.map(r6), p: b64(q),
                  c: b64(wide ? Uint32Array.from(g.corners) : Uint16Array.from(g.corners)),
                  s: b64(big ? Uint16Array.from(g.sizes) : Uint8Array.from(g.sizes)) };
    if (wide) out.cw = 4;
    if (big) out.sw = 2;
    if (g.mat.some(x => x)) out.m = b64(g.mat);
    const smooth = g.smooth.reduce((a, x) => a + x, 0);
    if (smooth === g.smooth.length) out.sm = 1;
    else if (smooth){
      const bits = new Uint8Array(Math.ceil(g.smooth.length / 8));
      g.smooth.forEach((x, i) => { if (x) bits[i >> 3] |= 1 << (i & 7); });
      out.smb = b64(bits);
    }
    if (g.simplified) out.cut = 1;
    return out;
  }
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  function packedSize(m){ return (m.p.length + m.c.length + m.s.length + (m.m || "").length + (m.smb || "").length); }

  async function sceneForView(drawable, shown, st, tools){
    const meshes = [], meshIndex = new Map(), objects = [], cams = [], lights = [], notDrawn = [];
    /* An object switched off with a key that switches it on again later
       is kept, so the animation can bring it in. */
    const keyedHide = (d) => !!(d.act && d.act.curves.some(c => c.p === "hide_viewport"));
    for (const d of drawable){
      if ((d.offInViewport && !keyedHide(d)) || (shown && !shown.has(d.ob.block.at))) continue;
      const x = (await worldMatrix(d.ob, tools, 0)).map(r6);
      if (d.kind === "camera"){
        const ca = await tools.deref(d.ob.get("data"));
        cams.push({ o: d.i, x, lens: ca ? r4(ca.get("lens") || 50) : 50, sw: ca ? r4(ca.get("sensor_x") || 36) : 36,
                    sh: ca ? r4(ca.get("sensor_y") || 24) : 24, fit: ca ? ca.get("sensor_fit") || 0 : 0,
                    ortho: ca && ca.get("type") === 1 ? r4(ca.get("ortho_scale") || 6) : undefined,
                    ds: ca ? r4(ca.get("drawsize") || 1) : 1 });
        continue;
      }
      if (d.kind === "light"){
        const la = await tools.deref(d.ob.get("data"));
        lights.push({ o: d.i, x, t: la ? la.get("type") : 0, c: d.info && d.info.c });
        continue;
      }
      if (d.kind !== "mesh"){
        if (d.kind !== "empty") notDrawn.push(d.i);
        continue;
      }
      const key = tools.at(d.ob.get("data"));
      if (!meshIndex.has(key)){
        const info = d.info;
        const g = info && info.view ? await meshGeometry(info.view, tools) : null;
        meshIndex.set(key, g ? meshes.push({ g }) - 1 : -1);
      }
      const mi = meshIndex.get(key);
      if (mi < 0){ notDrawn.push(d.i); continue; }
      const ob = { o: d.i, mesh: mi, x, c: d.colours.length ? d.colours : [DEFAULT_GREY] };
      const mods = d.mods.filter(m => m.t === "mirror" || m.t === "array" || m.t === "subsurf");
      if (mods.length) ob.mods = mods;
      const skipped = d.mods.filter(m => m.t === "skip").map(m => m.n);
      if (skipped.length) ob.skip = skipped;
      objects.push(ob);
    }

    /* Packed, then the biggest simplified until the whole fits. */
    /* The big models are cut by the same fraction until the whole fits,
       each time from the original. The size a model packs to is only known
       once it is packed (fewer than 65,536 corners halves the size of every
       face), so the fraction is corrected a few times, shrinking when over
       and growing back when well under, so nothing is cut more than it has
       to be. */
    const packed = meshes.map(m => packMesh(m.g));
    const total = () => packed.reduce((a, m) => a + packedSize(m), 0);
    const original = packed.map(m => m.nv);
    const cuttable = packed.map((m, i) => i).filter(i => packedSize(packed[i]) > 20000);
    for (let round = 0; round < 8 && cuttable.length; round++){
      const t = total(), cut = cuttable.some(i => packed[i].cut);
      if (t <= GEO_BUDGET && (!cut || t > GEO_BUDGET * 0.85)) break;
      const scale = GEO_BUDGET * 0.93 / t;
      for (const i of cuttable){
        const want = Math.max(200, Math.round(packed[i].nv * scale));
        packed[i] = want >= original[i] ? packMesh(meshes[i].g) : packMesh(simplify(meshes[i].g, want));
      }
    }
    if (total() > GEO_BUDGET) return { v: 1, tooBig: 1 };
    const out = { v: 1, meshes: packed, objects };
    if (cams.length) out.cams = cams;
    if (lights.length) out.lights = lights;
    if (notDrawn.length) out.notDrawn = notDrawn;
    const anim = animationForView(drawable, st);
    if (anim) out.anim = anim;
    return out;
  }

  /* ---------- animation for the 3D view ----------
     For every object that moves, and everything it hangs from, its own
     location, rotation and scale, its keyed curves, and its parent, so the
     view can work out where it is on any frame the way Blender does:
     parent's place × the parent inverse × its own. Objects that do not
     move keep the matrix saved with them. Keys are about 30 bytes each, so
     even a busy animation adds only a few kilobytes. */
  function animationForView(drawable, st){
    const byAt = new Map(drawable.map(d => [d.ob.block.at, d]));
    const keep = new Map();
    const add = (d, depth) => {
      if (!d || keep.has(d.i) || depth > 32) return;
      const t = transformOf(d.ob);
      const parent = byAt.get(d.parentAt);
      const pi = [];
      for (let i = 0; i < 16; i++) pi.push(r6(d.ob.get("parentinv", i) || 0));
      const entry = { l: t.l.map(r6), s: t.s.map(r6), m: t.m, p: parent ? parent.i : -1 };
      if (t.m === 0) entry.q = t.q.map(r6);
      else if (t.m === -1){ entry.ax = t.ax.map(r6); entry.an = r6(t.an); }
      else entry.r = t.r.map(r6);
      if (parent && pi.some(x => x)) entry.pi = pi;
      if (d.act) entry.ch = d.act.curves;
      if (d.offInViewport) entry.off = 1;
      keep.set(d.i, entry);
      if (parent) add(parent, depth + 1);
    };
    /* Anything with keys, and anything hanging from something with keys,
       since a child moves with its parent. */
    const moves = (d, depth) => !!d && depth < 32 && (!!d.act || moves(byAt.get(d.parentAt), depth + 1));
    drawable.forEach(d => { if (moves(d, 0)) add(d, 0); });
    if (!keep.size) return null;
    const sc = st.scene || {};
    return { xf: Object.fromEntries(keep), start: sc.start || 1, end: sc.end || 250, fps: sc.fps || 24,
             cur: st.frame !== undefined ? st.frame : sc.start || 1 };
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
