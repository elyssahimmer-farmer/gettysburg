// figures.js: the shared figure kit for scene-studio, lifted from family-hub's Rivendell (council.js) with the
// Rivendell figures left out. It gives the rig the blocky figures and the animals are built on, poses, routes and
// scripts. Load after three.js and motion.js, before blocky.js. Everything is on window.FigureKit.
//
//   const kit = FigureKit.makeKit(ctx, { outward: true });   // ctx: { THREE, root, surfaceY or floorY }
//   const rig = kit.makeRig();         // pivots carrying vertex-coloured pieces, baked into ONE skinned mesh
//   rig.node(parent, x, y, z)          // a pivot (parent null: the rig's root, in metres)
//   rig.piece(node, geo, hex, x, y, z, { r, s, skin }), rig.ball(node, geo, hex, r, x, y, z, [sx, sy, sz], rot),
//   rig.box(node, hex, w, h, d, x, y, z, rot), rig.limb(node, a, b, rA, rB, hex, segs, open, flatten),
//   rig.lathe(node, [[r, y], ...top first], segs, hex, { folds, amp, phi0, phiLen, x, y, z, r, s }),
//   rig.lock(node, a, b, r, hex, curl)  // a tapered clump (hair, a tail, a horn)
//   rig.bake(parent)                   // once, after everything is built at the bind pose; don't move pivots before
//   Lathe angles: phi 0 faces +z (the front). A sphere's phi pi/2 faces +z. Profiles go top first, or the
//   surface turns inside out (with outward: true).
//
//   P({ ...angles }) a pose: y lean twist roll hx hy hz lf0 lf1 lo0 lo1 k0 k1 af0 af1 ao0 ao1 at0 at1 e0 e1 (0 left, 1 right)
//   mix(a, b, w), walk(phase, amount, base), idle(t, seed, base)
//   Route(points) .L .at(d) .yawAt(d)
//   Script(x, z, yaw, name) .hold(dur, fn) .holdTo(t, fn) .walk(points, speed, figure, { base, endYaw, lift })
//     .sample(ct, info) → { x, z, y, yaw, pose, lift, pitch, hide, tag }. A figure with its own gait (f.gait) walks with it.
//   lookYaw(x, z, yaw, tx, tz, limit): head yaw towards a point, clamped to what a neck can do.
(function () {
  'use strict';

  // ---------- small maths ----------
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const lerpA = (a, b, k) => a + wrapA(b - a) * k;
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  // 0 → 1 → 0 over [a, b] with soft shoulders e seconds long.
  const win = (s, a, b, e) => smooth((s - a) / e) * (1 - smooth((s - (b - e)) / e));
  const inW = (s, a, b) => s >= a && s < b;
  const TAU = Math.PI * 2;

  // ---------- poses: a flat bag of joint angles, so poses mix with a plain lerp ----------
  const KEYS = ['y', 'lean', 'twist', 'roll', 'hx', 'hy', 'hz', 'lf0', 'lf1', 'lo0', 'lo1', 'k0', 'k1',
    'af0', 'af1', 'ao0', 'ao1', 'at0', 'at1', 'e0', 'e1', 'gnd', 'wk'];
  function P(o) {
    const p = { y: 0, lean: 0, twist: 0, roll: 0, hx: 0.04, hy: 0, hz: 0, lf0: 0, lf1: 0, lo0: 0.04, lo1: 0.04, k0: 0, k1: 0,
      af0: 0.05, af1: 0.05, ao0: 0.12, ao1: 0.12, at0: 0, at1: 0, e0: 0.2, e1: 0.2, gnd: 1, wk: 0 };
    return o ? Object.assign(p, o) : p;
  }
  function mix(a, b, w) {
    const o = {};
    for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * w;
    return o;
  }
  // Walking: the shared gait (characters/motion.js), each leg planted for most of its step.
  function walkPose(ph, amt, base) {
    const p = P(base), g = window.Motion.gait(ph, amt, 0.48);
    for (const k in g) p[k] += g[k];
    p.wk = amt;
    return p;
  }
  function idlePose(t, seed, base) {
    const p = P(base);
    p.lean += 0.012 * Math.sin(t * 1.3 + seed);
    p.hy += 0.1 * Math.sin(t * 0.23 + seed * 3) * Math.sin(t * 0.11 + seed);
    p.hx += 0.03 * Math.sin(t * 0.31 + seed * 2);
    p.roll += 0.01 * Math.sin(t * 0.5 + seed);
    return window.Motion.life(t, seed, p, p.lf0 < 0.4 && p.lf1 < 0.4);
  }

  // ---------- routes and scripts ----------
  // Points are [x, z] or [x, z, y] (or Vector3s); a height on either end of a segment is interpolated along it
  // (stairs, balconies) and never dips below the floor; with no heights the walker stands on the floor.
  let FLOOR = null;
  function Route(pts, floor) {
    this.floor = floor || FLOOR;
    this.p = pts.map((q) => (Array.isArray(q) ? [q[0], q[1], q[2]] : [q.x, q.z, q.y]));
    this.c = [0];
    for (let i = 1; i < this.p.length; i++) this.c.push(this.c[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    this.L = this.c[this.c.length - 1];
  }
  Route.prototype.at = function (d) {
    const p = this.p, c = this.c;
    if (p.length === 1 || d <= 0) return p[0].slice();
    if (d >= this.L) return p[p.length - 1].slice();
    let i = 1;
    while (c[i] < d) i++;
    const k = (d - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    const a = p[i - 1], b = p[i], x = lerp(a[0], b[0], k), z = lerp(a[1], b[1], k);
    let y;
    if (a[2] !== undefined || b[2] !== undefined) {
      const fl = this.floor;
      const ya = a[2] !== undefined ? a[2] : fl ? fl(a[0], a[1]) : b[2], yb = b[2] !== undefined ? b[2] : fl ? fl(b[0], b[1]) : a[2];
      y = lerp(ya, yb, k);
      if (fl) y = Math.max(y, fl(x, z));
    }
    return [x, z, y];
  };
  Route.prototype.yawAt = function (d) {
    const a = this.at(Math.max(0, Math.min(d, this.L - 0.35) - 0.25)), b = this.at(Math.min(this.L, Math.max(d, 0.35) + 0.25));
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  };

  const BLEND = window.Motion.BLEND, TURN = window.Motion.TURN;
  // A looping list of steps; each step says where the figure is, which way it faces and its pose, s seconds in.
  function Script(x, z, yaw, name) { this.steps = []; this.T = 0; this.x = x; this.z = z; this.yaw = yaw; this.name = name || ''; }
  Script.prototype._push = function (dur, ev) {
    const st = { t0: this.T, dur: Math.max(0, dur), ev };
    if (dur < -0.01) console.warn('figures: ' + this.name + ' runs late by ' + (-dur).toFixed(2) + ' s at ' + this.T.toFixed(2));
    this.steps.push(st);
    this.T += st.dur;
    const e = ev(st.dur, { t: this.T, n: 0, ct: this.T });
    this.x = e.x; this.z = e.z; this.yaw = e.yaw; this.y = e.y;
    return st;
  };
  Script.prototype.hold = function (dur, fn) {
    const x = this.x, z = this.z, yaw = this.yaw, y = this.y;
    return this._push(dur, (s, I) => {
      const o = (fn && fn(s, I)) || {};
      return { x: o.x !== undefined ? o.x : x, z: o.z !== undefined ? o.z : z, y: o.y !== undefined ? o.y : y, yaw: o.yaw !== undefined ? o.yaw : yaw,
        pose: o.pose || P(), lift: o.lift || 0, pitch: o.pitch || 0, hide: !!o.hide, tag: o.tag };
    });
  };
  Script.prototype.holdTo = function (t, fn) { return this.hold(t - this.T, fn); };
  Script.prototype.face = function (yaw) { this.yaw = yaw; return this; };
  // Walk through pts (starting from where the figure stands) at speed m/s. opt.base(s, I) gives a pose to walk in.
  Script.prototype.walk = function (pts, speed, f, opt) {
    opt = opt || {};
    const R = new Route([[this.x, this.z, this.y]].concat(pts));
    if (R.L < 0.01) return null;
    // easing up to speed and back down, in the same time a steady walk would take
    const endYaw = opt.endYaw, dur = R.L / speed, ez = window.Motion.ease(R.L, dur), steps = window.Motion.strides(ez, dur, f.stride);
    return this._push(dur, (s, I) => {
      const d = Math.min(R.L, ez(s)[0]);
      const [x, z, y] = R.at(d);
      const [ph, amt] = steps(s);
      let yaw = R.yawAt(d);
      if (endYaw !== undefined) yaw = lerpA(yaw, endYaw, smooth(1 - (R.L - d) / 0.4));
      // a figure with a walk of its own (the blocky figures) walks with it
      const pose = (f.gait || walkPose)(ph, amt, opt.base ? opt.base(s, I) : null);
      return { x, z, y, yaw, pose, lift: opt.lift ? opt.lift(d, R.L) : 0, pitch: 0, hide: false, tag: opt.tag };
    });
  };
  Script.prototype.find = function (ct) {
    const S = this.steps;
    let k = S.length - 1;
    for (let i = 0; i < S.length; i++) if (ct < S[i].t0 + S[i].dur) { k = i; break; }
    return k;
  };
  Script.prototype.sample = function (ct, I) {
    const S = this.steps, k = this.find(ct), st = S[k];
    const s = clamp(ct - st.t0, 0, st.dur);
    const cur = st.ev(s, I);
    // a short step blends in over most of its length rather than past its end
    const blend = Math.min(BLEND, Math.max(0.25, st.dur * 0.8));
    if (s < Math.max(blend, TURN)) {
      let pk = k - 1;
      while (pk >= 0 && S[pk].dur === 0) pk--;
      const prev = pk >= 0 ? S[pk] : S[S.length - 1];
      if (prev !== st) {
        const pe = prev.ev(prev.dur, I);
        const w = smooth(smooth(s / blend));
        if (w < 1) {
          cur.pose = mix(pe.pose, cur.pose, w);
          cur.lift = lerp(pe.lift, cur.lift, w);
          cur.pitch = lerp(pe.pitch, cur.pitch, w);
          if (cur.y !== undefined || pe.y !== undefined) {
            const y0 = pe.y !== undefined ? pe.y : null, y1 = cur.y !== undefined ? cur.y : null;
            if (y0 !== null && y1 !== null) cur.y = lerp(y0, y1, w);
          }
        }
        cur.yaw = lerpA(pe.yaw, cur.yaw, smooth(s / TURN));
      }
    }
    return cur;
  };
  // Head yaw towards a point, relative to the way the body faces, clamped to what a neck can do.
  const lookYaw = (x, z, yaw, tx, tz, lim) => clamp(wrapA(yawTo(x, z, tx, tz) - yaw), -(lim || 1.2), lim || 1.2);

  // is each shape's far inside wall (same outline, but anything layered over it, like hair or a mantle, is hidden).
  function makeKit(ctx, q) {
    const THREE = ctx.THREE;
    const D = (q && q.detail) || 1, SMOOTH = !!(q && q.smooth), OUTWARD = !!(q && q.outward);
    const sg = (n, min) => Math.max(min || 3, Math.round(n * D));
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    // the height to stand on: the scene's floor (ctx.floorY), else its surface, else 0
    const floor = (x, z) => (ctx.floorY ? ctx.floorY(x, z) : ctx.surfaceY ? ctx.surfaceY(x, z) : 0);
    FLOOR = floor;
    const G = {
      ball: (w, h) => new THREE.SphereGeometry(1, sg(w), sg(h, 2)), box: new THREE.BoxGeometry(1, 1, 1),
      ico: new THREE.IcosahedronGeometry(1, D >= 2.5 ? 1 : 0), dodec: new THREE.DodecahedronGeometry(1, D >= 2.5 ? 1 : 0), oct: new THREE.OctahedronGeometry(1, D >= 1.5 ? 1 : 0),
    };
    const BALL = {};
    const ball = (w, h) => BALL[w + 'x' + h] || (BALL[w + 'x' + h] = new THREE.SphereGeometry(1, sg(w), sg(h, 2)));

    // ---------- shapes (each returns geometry in its own frame) ----------
    // A lathe from a profile of [radius, y] pairs (top first), with vertical folds that deepen downwards;
    // phi0/phiLen leave it open (a coat open at the front, a cloak only at the back).
    function latheGeo(profile, segs, folds, amp, phi0, phiLen) {
      // more detail rounds the profile too, through the same points
      if (D > 1.2 && profile.length > 2) {
        const n = Math.round(D), out = [];
        for (let i = 0; i < profile.length - 1; i++) {
          const a = profile[Math.max(0, i - 1)], b = profile[i], c = profile[i + 1], d = profile[Math.min(profile.length - 1, i + 2)];
          for (let k = 0; k < n; k++) {
            const t = k / n, t2 = t * t, t3 = t2 * t;
            const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
            out.push([cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])]);
          }
        }
        out.push(profile[profile.length - 1]);
        profile = out;
      }
      const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
      if (OUTWARD) pts.reverse();
      const g = new THREE.LatheGeometry(pts, sg(segs), phi0 || 0, phiLen || TAU);
      if (amp) {
        const p = g.attributes.position, yTop = profile[0][1], yBot = profile[profile.length - 1][1];
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
          if (r < 1e-4) continue;
          const a = Math.atan2(z, x), depth = Math.max(0, (yTop - y) / (yTop - yBot));
          const f = 1 + amp * depth * Math.sin(a * folds + 0.6) / r;
          p.setX(i, x * f); p.setZ(i, z * f);
        }
        g.computeVertexNormals();
      }
      return g;
    }
    // A clump of hair or beard: a flattened cone from a to b that curls forward by `curl` (gandalf.js's lock).
    function lockGeo(a, b, r, curl, flatten, segs) {
      const dir = V(0, 0, 0).subVectors(b, a), len = dir.length();
      const g = new THREE.ConeGeometry(r, len, sg(segs || 5), sg(2, 2));
      g.rotateX(Math.PI);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = 0.5 - p.getY(i) / len;
        p.setZ(i, p.getZ(i) * (flatten || 0.55) + (curl || 0) * t * t);
      }
      g.computeVertexNormals();
      g.applyMatrix4(_m.compose(_p.copy(a).add(b).multiplyScalar(0.5), _q.setFromUnitVectors(DOWN, dir.normalize()), _s.set(1, 1, 1)));
      return g;
    }
    function limbGeo(a, b, ra, rb, segs, open, flatten) {
      const dir = V(0, 0, 0).subVectors(b, a);
      const g = new THREE.CylinderGeometry(Math.max(rb, 0.0001), ra, dir.length(), sg(segs || 6), 1, !!open);
      if (flatten && flatten !== 1) g.scale(1, 1, flatten);
      g.applyMatrix4(_m.compose(_p.copy(a).add(b).multiplyScalar(0.5), _q.setFromUnitVectors(UP, dir.normalize()), _s.set(1, 1, 1)));
      return g;
    }
    const xform = (g, x, y, z, r, s) => {
      _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
      if (s === undefined) _s.set(1, 1, 1); else if (typeof s === 'number') _s.setScalar(s); else _s.set(s[0], s[1], s[2]);
      return g.applyMatrix4(_m.compose(_p.set(x || 0, y || 0, z || 0), _q.setFromEuler(_e), _s));
    };

    // ---------- the rig: pivots carrying vertex-coloured pieces, baked into one skinned mesh ----------
    // Pieces are stored in bind-pose world space as they're added, so nothing may move or scale a pivot
    // between building and rig.bake(). A piece can be skinned to several pivots (skin(x, y, z) → [[pivot, weight]...]),
    // which is how robes and skirts follow the legs.
    function makeRig() {
      const root = new THREE.Object3D();
      const pieces = [];
      const rig = { root, G, sphere: ball, pieces, figures: [], mesh: null, latheGeo, lockGeo, limbGeo };
      rig.node = (parent, x, y, z) => {
        const o = new THREE.Object3D();
        o.position.set(x || 0, y || 0, z || 0);
        (parent || root).add(o);
        return o;
      };
      // g is in nd's own frame
      rig.geo = (nd, g, color, skin) => {
        if (g.index) g = g.toNonIndexed();
        nd.updateWorldMatrix(true, false);
        g.applyMatrix4(nd.matrixWorld);
        pieces.push({ nd, arr: g.attributes.position.array, nrm: SMOOTH && g.attributes.normal ? g.attributes.normal.array : null, color: new THREE.Color(color), skin });
      };
      rig.piece = (nd, geo, color, x, y, z, o) => rig.geo(nd, xform(geo.clone(), x, y, z, o && o.r, o && o.s), color, o && o.skin);
      rig.ball = (nd, geo, color, r, x, y, z, s, rot) => rig.piece(nd, geo, color, x, y, z, { s: s ? [r * s[0], r * s[1], r * s[2]] : r, r: rot });
      rig.box = (nd, color, w, h, d, x, y, z, rot) => rig.piece(nd, G.box, color, x, y, z, { s: [w, h, d], r: rot });
      rig.limb = (nd, a, b, ra, rb, color, segs, open, flatten) => rig.geo(nd, limbGeo(a, b, ra, rb, segs, open, flatten), color);
      rig.lock = (nd, a, b, r, color, curl, flatten, segs) => rig.geo(nd, lockGeo(a, b, r, curl, flatten, segs), color);
      rig.lathe = (nd, profile, segs, color, o) => {
        o = o || {};
        const g = latheGeo(profile, segs, o.folds, o.amp, o.phi0, o.phiLen);
        rig.geo(nd, xform(g, o.x, o.y, o.z, o.r, o.s), color, o.skin);
      };
      rig.count = () => pieces.reduce((n, pc) => n + pc.arr.length / 9, 0);
      rig.bake = (parent) => {
        root.updateMatrixWorld(true);
        const index = new Map(), bones = [];
        const bi = (nd) => { let i = index.get(nd); if (i === undefined) { i = bones.length; bones.push(nd); index.set(nd, i); } return i; };
        let n = 0;
        for (const pc of pieces) n += pc.arr.length;
        const pos = new Float32Array(n), col = new Float32Array(n), skinIdx = new Uint16Array(n / 3 * 4), skinW = new Float32Array(n / 3 * 4);
        let off = 0;
        for (const pc of pieces) {
          pos.set(pc.arr, off);
          const own = bi(pc.nd);
          for (let i = 0; i < pc.arr.length; i += 3) {
            col[off + i] = pc.color.r; col[off + i + 1] = pc.color.g; col[off + i + 2] = pc.color.b;
            const vi = (off + i) / 3 * 4;
            if (!pc.skin) { skinIdx[vi] = own; skinW[vi] = 1; continue; }
            const ws = pc.skin(pc.arr[i], pc.arr[i + 1], pc.arr[i + 2]).filter((w) => w[1] > 1e-3).sort((a, b) => b[1] - a[1]).slice(0, 4);
            const sum = ws.reduce((s, w) => s + w[1], 0) || 1;
            if (!ws.length) { skinIdx[vi] = own; skinW[vi] = 1; continue; }
            ws.forEach((w, k) => { skinIdx[vi + k] = bi(w[0]); skinW[vi + k] = w[1] / sum; });
          }
          off += pc.arr.length;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
        if (SMOOTH) {
          const nrm = new Float32Array(n);
          let o2 = 0;
          const ab = new THREE.Vector3(), ac = new THREE.Vector3();
          for (const pc of pieces) {
            if (pc.nrm) nrm.set(pc.nrm, o2);
            else for (let i = 0; i < pc.arr.length; i += 9) { // a piece with no normals of its own stays faceted
              const A = pc.arr;
              ab.set(A[i + 3] - A[i], A[i + 4] - A[i + 1], A[i + 5] - A[i + 2]);
              ac.set(A[i + 6] - A[i], A[i + 7] - A[i + 1], A[i + 8] - A[i + 2]);
              ab.cross(ac).normalize();
              for (let k = 0; k < 9; k += 3) { nrm[o2 + i + k] = ab.x; nrm[o2 + i + k + 1] = ab.y; nrm[o2 + i + k + 2] = ab.z; }
            }
            o2 += pc.arr.length;
          }
          geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        } else geo.computeVertexNormals();
        const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !SMOOTH, roughness: 0.9, metalness: 0, skinning: true }));
        mesh.bindMode = 'detached';
        mesh.bind(new THREE.Skeleton(bones, bones.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert())), new THREE.Matrix4());
        mesh.frustumCulled = false;
        // The pivots live under `parent` too, so the scene keeps their matrices current; parent must stay at the origin.
        (parent || ctx.root).add(root, mesh);
        rig.mesh = mesh;
        rig.tris = n / 9;
        rig.bones = bones.length;
        for (const f of rig.figures) if (f.afterBake) f.afterBake();
        return mesh;
      };
      return rig;
    }

    return { G, V, makeRig, floor, latheGeo, lockGeo, limbGeo, ball };
  }

  window.FigureKit = { makeKit, P, mix, walk: walkPose, idle: idlePose, Route, Script, lookYaw };
})();
