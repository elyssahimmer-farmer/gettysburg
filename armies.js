// armies.js: the massed troops and all the flags for Gettysburg, July 3, 1863 (DESIGN §2, §5, §9; research §2, §3,
// §5). Everyone here is a token: a low-poly soldier in the blocky language (a box head under a slouch hat or a kepi,
// a tapered body block in the coat colour, two prism legs that swing, a musket at the right shoulder), instanced and
// animated from the cycle time with a bob and a planted-foot leg swing.
//   Confederate lines (168): rest in small groups under the trees (0–82), step out through the battery intervals and
//     form three lines east of the guns (82–92), advance across the fields past the farm, over the road fences and
//     through the swale, converging on the Angle (92–126), halt at the wall in smoke (126–137), then walk back west in
//     loose groups into the woods (128–160). Nobody falls.
//   Union line (50) behind the stone wall from z -28 to 22: easy in the morning, prone through the cannonade
//     ("they hug the ground", Haskell), standing and firing volleys over the wall 93–137, easy again after.
//   Vermonters (12) at FIELD.vermont: step out and fire into the flank 110–122.
//   Flags (12): 8 plain red Confederate flags carried in the lines (lifted a little at the wall), one national flag and
//     three blue regimentals along the wall; the cloth ripples in the vertex shader.
//   Musket smoke: a pooled instanced puff system (one draw).
// Draws: 6 (CSA bodies, Union bodies, legs, flags, puffs, shadows). About 11.9k triangles, 12.2k at the smoke peak.
// Every walk is a precomputed distance/phase table integrated from a speed profile (eased ends, slow at the fences,
// a halt to fire), so position, stride phase and walk amount are pure functions of ctx.cycle.t. Nothing is allocated
// per frame. Tags: csaLines, csaFlag (tap: the flag lifts and waves for 3 s), unionInf, vermont.
(function () {
  'use strict';
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const wrapA = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
  const lerpA = (a, b, k) => a + wrapA(b - a) * k;
  const hsh = (a, b, c) => { const h = Math.sin(a * 127.1 + (b || 0) * 311.7 + (c || 0) * 74.7 + 0.37) * 43758.5453; return h - Math.floor(h); };
  const win = (s, a, b, e) => smooth((s - a) / e) * (1 - smooth((s - (b - e)) / e));

  // ---------- the token (hips at the origin, standing HIP above the ground) ----------
  const HIP = 0.52, LEG = 0.52, STRIDE = 1.0, STRIDE_BACK = 1.3, MAX_SWING = 0.78;
  const shadeAt = (y) => 0.72 + 0.28 * clamp((y + LEG) / 1.3, 0, 1);
  function GeoBuilder() { this.pos = []; this.col = []; this.ps = []; this.c = new THREE.Color(); }
  GeoBuilder.prototype.tri = function (a, b, c, hex, part, sm) {
    const P = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const p = P[i], sh = shadeAt(p[1]) * (sm || 1);
      this.pos.push(p[0], p[1], p[2]);
      if (part === 0 || part === 3) { this.c.set(hex).convertSRGBToLinear(); this.col.push(this.c.r * sh, this.c.g * sh, this.c.b * sh); }
      else this.col.push(1, 1, 1);
      this.ps.push(part, sh);
    }
  };
  GeoBuilder.prototype.quad = function (a, b, c, d, hex, part, sm) { this.tri(a, b, c, hex, part, sm); this.tri(a, c, d, hex, part, sm); };
  // a box from a bottom rectangle (half extents hx0, hz0 at y0, centred at z cz0) to a top one (hx1, hz1 at y1, cz1)
  GeoBuilder.prototype.box8 = function (y0, y1, hx0, hz0, hx1, hz1, cz0, cz1, hex, part, o, sm) {
    o = o || {};
    const b00 = [-hx0, y0, cz0 - hz0], b10 = [hx0, y0, cz0 - hz0], b11 = [hx0, y0, cz0 + hz0], b01 = [-hx0, y0, cz0 + hz0];
    const t00 = [-hx1, y1, cz1 - hz1], t10 = [hx1, y1, cz1 - hz1], t11 = [hx1, y1, cz1 + hz1], t01 = [-hx1, y1, cz1 + hz1];
    if (o.top !== false) this.quad(t00, t01, t11, t10, hex, part, sm);
    if (o.bottom !== false) this.quad(b00, b10, b11, b01, hex, part, sm);
    this.quad(b01, b11, t11, t01, hex, part, sm);                      // front (+z)
    this.quad(b10, b00, t00, t10, o.backHex || hex, part, sm);         // back
    this.quad(b11, b10, t10, t11, hex, part, sm);                      // right (+x)
    this.quad(b00, b01, t01, t00, hex, part, sm);                      // left
  };
  GeoBuilder.prototype.build = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPS', new THREE.Float32BufferAttribute(this.ps, 2));
    g.computeVertexNormals();
    return g;
  };
  // parts: 0 fixed colour, 1 coat (per-instance tint), 2 trousers (tint), 3 musket (swings level when the instance aims)
  const COLS = { skin: 0xf2c9a8, hair: 0x6a4a30, slouch: 0x6e6256, kepi: 0x34477c, visor: 0x2a2622, musket: 0x4e4238 };
  function tokenGeo(hat) {
    const g = new GeoBuilder();
    g.box8(0, 0.6, 0.17, 0.105, 0.22, 0.125, 0, 0, null, 1, { bottom: false });                        // the body block
    g.box8(0.62, 0.88, 0.12, 0.115, 0.12, 0.115, 0.01, 0.01, COLS.skin, 0, { top: false, bottom: false, backHex: COLS.hair }, 0.9);
    if (hat === 'slouch') {
      g.quad([-0.23, 0.86, -0.22], [-0.23, 0.86, 0.24], [0.23, 0.86, 0.24], [0.23, 0.86, -0.22], COLS.slouch, 0, 0.9);   // the brim
      g.box8(0.86, 1.06, 0.135, 0.13, 0.1, 0.1, 0, -0.01, COLS.slouch, 0, { bottom: false });                              // the crown
    } else {
      g.box8(0.85, 0.99, 0.125, 0.125, 0.12, 0.12, 0.0, 0.03, COLS.kepi, 0, { bottom: false });                            // the forage cap
      g.quad([-0.11, 0.855, 0.12], [-0.11, 0.82, 0.26], [0.11, 0.82, 0.26], [0.11, 0.855, 0.12], COLS.visor, 0);          // the visor
    }
    // the musket: two crossed thin quads at the right shoulder, leaning back against it
    const mx = -0.2, w = 0.03, yb = 0.25, yt = 1.78, zb = -0.04, zt = -0.14;
    g.quad([mx - w, yb, zb], [mx + w, yb, zb], [mx + w, yt, zt], [mx - w, yt, zt], COLS.musket, 3);
    g.quad([mx, yb, zb - w], [mx, yb, zb + w], [mx, yt, zt + w], [mx, yt, zt - w], COLS.musket, 3);
    return g.build();
  }
  function legGeo() {
    const g = new GeoBuilder(), r = 0.09, pts = [];
    for (let k = 0; k < 3; k++) { const a = PI / 2 + k * TAU / 3; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.9]); }
    for (let k = 0; k < 3; k++) {
      const a = pts[k], b = pts[(k + 1) % 3];
      g.quad([b[0], 0.03, b[1]], [a[0], 0.03, a[1]], [a[0], -LEG, a[1]], [b[0], -LEG, b[1]], null, 2);
    }
    return g.build();
  }
  // the token material: the coat and trousers take per-instance colours, the musket swings level as aAim rises and
  // vanishes for flag-bearers (aAim < 0)
  function tokenMaterial() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    // the base adds its sky haze to every material and keys compiled programs by userData.extraKey: each patched
    // material here needs its own key or they share one program
    m.userData.extraKey = 'armiesToken';
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec2 aPS;\nattribute vec3 aCoat;\nattribute vec3 aPants;\nattribute float aAim;\n' + sh.vertexShader
        .replace('#include <color_vertex>', [
          'vColor = color;',
          'if (aPS.x > 0.5 && aPS.x < 1.5) vColor = aCoat * aPS.y;',
          'else if (aPS.x > 1.5 && aPS.x < 2.5) vColor = aPants * aPS.y;'].join('\n'))
        .replace('#include <begin_vertex>', [
          'vec3 transformed = vec3(position);',
          'if (aPS.x > 2.5) {',
          '  if (aAim < -0.5) transformed = vec3(0.0, 0.3, 0.0);',
          '  else {',
          '    vec3 pv = vec3(-0.2, 0.62, -0.08);',
          '    vec3 q = transformed - pv;',
          '    float a = aAim * 1.55; float c = cos(a), s = sin(a);',
          '    transformed = pv + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);',
          '  }',
          '}'].join('\n'));
    };
    return m;
  }
  function instanced(geo, mat, n, withAim) {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.frustumCulled = false;
    const g = im.geometry = geo.clone();
    g.setAttribute('aCoat', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aPants', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    const aim = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    aim.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAim', aim);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return im;
  }

  // ---------- polylines and journeys ----------
  function Poly(pts) {
    this.p = pts; this.c = [0];
    for (let i = 1; i < pts.length; i++) this.c.push(this.c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.L = this.c[this.c.length - 1];
  }
  Poly.prototype.at = function (d, out) {
    const p = this.p, c = this.c;
    if (d <= 0) { out.x = p[0][0]; out.z = p[0][1]; return out; }
    if (d >= this.L) { const q = p[p.length - 1]; out.x = q[0]; out.z = q[1]; return out; }
    let i = 1;
    while (c[i] < d) i++;
    const k = (d - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]), a = p[i - 1], b = p[i];
    out.x = a[0] + (b[0] - a[0]) * k; out.z = a[1] + (b[1] - a[1]) * k;
    return out;
  };
  const FENCE_OFF = 1.416;   // the fences sit 1.4 m either side of the road, measured along its normal
  let FIELD = null;
  // path distances where this path crosses the two road fences
  function findFences(poly) {
    const out = [], q = { x: 0, z: 0 };
    for (const s of [-1, 1]) {
      let prev = null;
      for (let d = 0; d <= poly.L; d += 0.1) {
        poly.at(d, q);
        const f = q.x - (FIELD.roadX(q.z) + s * FENCE_OFF);
        if (prev !== null && (f > 0) !== (prev > 0)) { out.push(d - 0.05); break; }
        prev = f;
      }
    }
    return out;
  }
  // journey(poly, t0, o): a walk along poly starting at t0. o.vb is the base speed, or o.t1 a fixed arrival time (the
  // speed is solved). o.stopAt / o.stopDur: a halt (to fire) at a cycle time. o.stride: metres per two steps.
  // Returns { poly, t0, t1, dt, lut [d, phase, amount] per 0.1 s, fences, L }.
  const Q1 = { x: 0, z: 0 };
  function journey(poly, t0, o) {
    const DT = 0.1, SUB = 2, h = DT / SUB, L = poly.L, fences = findFences(poly), stride = o.stride || STRIDE;
    const stopAt = o.stopAt, stopDur = o.stopDur || 0;
    function prof(d, t) {
      let f = Math.min(1, 0.12 + d / 1.4) * Math.min(1, 0.12 + (L - d) / 1.4);
      for (const dF of fences) f *= 1 - 0.55 * smooth(1 - Math.abs(d - dF) / 1.3);
      poly.at(d, Q1);
      f *= 1 - 0.15 * smooth(1 - Math.abs(Q1.x - FIELD.swaleX) / 3.5);
      if (stopAt !== undefined) f *= 1 - smooth((t - (stopAt - 0.35)) / 0.35) * (1 - smooth((t - (stopAt + stopDur)) / 0.35));
      return f;
    }
    let lut = null;
    function run(vb, store) {
      let d = 0, ph = 0, t = t0, i = 0;
      if (store) lut = [0, 0, 0];
      while (d < L - 1e-4 && i < 40000) {
        let f = 0;
        for (let s = 0; s < SUB; s++) {
          f = prof(d, t); const v = vb * f;
          d = Math.min(L, d + v * h); ph += TAU * (v * h) / (stride * Math.max(0.4, f)); t += h;
        }
        i++;
        if (store) lut.push(d, ph, f);
      }
      return t - t0;
    }
    let vb = o.vb || 1.2;
    if (o.t1 !== undefined) {
      vb = L / Math.max(0.8, o.t1 - t0 - stopDur);
      for (let k = 0; k < 4; k++) { const T = run(vb, false); vb *= T / Math.max(0.8, o.t1 - t0); }
    }
    const T = run(vb, true);
    const J = { poly, t0, t1: t0 + T, dt: DT, lut: Float32Array.from(lut), n: lut.length / 3 - 1, fences, L, vb };
    return J;
  }
  const PA = { x: 0, z: 0 }, PB = { x: 0, z: 0 };
  // out: x z yaw ph amt lift
  function sampleJ(J, t, out) {
    const s = clamp((t - J.t0) / J.dt, 0, J.n - 1e-6), i = Math.floor(s), k = s - i, L = J.lut;
    const d = lerp(L[3 * i], L[3 * i + 3], k);
    out.ph = lerp(L[3 * i + 1], L[3 * i + 4], k); out.amt = lerp(L[3 * i + 2], L[3 * i + 5], k);
    J.poly.at(d, out);
    J.poly.at(clamp(d - 0.5, 0, J.L), PA); J.poly.at(clamp(d + 0.5, 0, J.L), PB);
    out.yaw = Math.atan2(PB.x - PA.x, PB.z - PA.z);
    let lift = 0;
    // over the fence: up and over the top rail (0.98 m), the legs swinging clear of the lower one
    for (const dF of J.fences) { const b = clamp(1 - Math.abs(d - dF) / 1.0, 0, 1); lift += 0.78 * b * b * (3 - 2 * b); }
    out.lift = lift;
    return out;
  }
  // a planted-foot leg: 60% of the cycle on the ground sweeping back evenly, 40% swinging forward (motion.js's gait)
  function legAngle(ph, A) {
    const u = ((ph / TAU) % 1 + 1) % 1;
    if (u < 0.6) return A * (1 - 2 * u / 0.6);
    const k = (u - 0.6) / 0.4;
    return A * (-1 + 2 * smooth(k));
  }

  window.Scene.register({
    name: 'armies',
    init(ctx) {
      const { THREE: T3, C } = ctx;
      FIELD = ctx.FIELD;
      const G = (x, z) => ctx.surfaceY(x, z);
      const lin = (hex) => new T3.Color(hex).convertSRGBToLinear();

      // ---------- the Confederate lines ----------
      const PER = 56, NC = 3 * PER, SOUTH_J = 50;   // tokens per line; slots j >= SOUTH_J pass south of the farm
      const gunZ = ctx.spots.CSA_GUNS.map((g) => g.z);
      const gapZ = (z) => { for (const zg of gunZ) if (Math.abs(z - zg) < 1.35) return zg + 1.35 * (z >= zg ? 1 : -1); return z; };
      // the interval midpoint nearest z (where the lines thread the battery)
      const intervalZ = (z) => { let best = z, bd = 1e9; for (let i = -1; i < gunZ.length; i++) { const a = i < 0 ? gunZ[0] - 4.36 : gunZ[i], b = i + 1 < gunZ.length ? gunZ[i + 1] : gunZ[gunZ.length - 1] + 4.36; const m = (a + b) / 2; if (Math.abs(m - z) < bd) { bd = Math.abs(m - z); best = m; } } return best; };
      const wallX = (z) => (z < -6 ? FIELD.wall[2][0] : FIELD.wall[0][0]);
      const BEARERS = { 8: 0, 27: 1, 45: 2, 71: 3, 92: 4, 108: 5, 132: 6, 152: 7 };   // token index -> flag index
      // the trunks of every tree land.js has planted (its instanced meshes carry the trees' wind amount), so no one
      // rests inside one: a rest spot within 0.75 m of a trunk is pushed straight out to 0.75 m
      const trunks = [];
      {
        const m4 = new T3.Matrix4(), p = new T3.Vector3();
        ctx.root.traverse((o) => { if (o.isInstancedMesh && o.material && o.material.userData.windAmp === 0.03) for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, m4); p.setFromMatrixPosition(m4); trunks.push([p.x, p.z]); } });
      }
      const offTrunks = (x, z) => { for (const t of trunks) { const dx = x - t[0], dz = z - t[1], d = Math.hypot(dx, dz); if (d < 0.75) { const k = d < 1e-3 ? 0 : 0.75 / d; return d < 1e-3 ? [t[0] + 0.75, t[1]] : [t[0] + dx * k, t[1] + dz * k]; } } return [x, z]; };
      const FLAG_GROUPS = new Set(Object.keys(BEARERS).map((i) => Math.floor(i / PER) * 8 + Math.floor(((i % PER) + 0.5) / PER * 8)));
      const csa = [];
      for (let i = 0; i < NC; i++) {
        const li = Math.floor(i / PER), j = i % PER, s = (j + 0.5) / PER, h = (k) => hsh(i + 1, k);
        const south = j >= SOUTH_J, pair = j % 2;
        // the formation: three lines east of the gun muzzles, the rear two leaving gaps round the guns
        let fz = lerp(FIELD.lineZ[0], FIELD.lineZ[1], s) + 0.14 * (h(1) - 0.5);
        if (li > 0) fz = gapZ(fz);
        const fx = -26.5 - 2.1 * li + 0.16 * (h(2) - 0.5);
        // the target at the wall: the front narrows onto the Angle in four lanes (north of the farm's orchard and the
        // three gaps between its rows, which run east-west at z 0, -3, -6 and -9; the crowns reach 1.2 m from each
        // trunk, so the gap lanes are narrow and centred at -7.5, -4.5 and -1.5), three ranks deep; the south few go
        // round the farm the other way
        let zw, zc;
        if (!south) {
          const u = (j + 0.5) / SOUTH_J;
          zw = u < 0.64 ? lerp(-16, -10.7, u / 0.64) : u < 0.76 ? lerp(-7.85, -7.15, (u - 0.64) / 0.12)
            : u < 0.88 ? lerp(-4.85, -4.15, (u - 0.76) / 0.12) : lerp(-1.85, -1.15, (u - 0.88) / 0.12);
        } else {
          const u = (j - SOUTH_J + 0.5) / (PER - SOUTH_J);
          zw = lerp(17.9, 19.6, u); zc = lerp(17.9, 20.0, u);
        }
        // where each stops at the wall: three ranks deep, the rear lines behind, a little bunched and uneven
        const rank = south ? pair : j % 3;
        const xs = wallX(zw) - 0.8 - 0.75 * rank - 2.2 * li - 0.5 * (south ? (j % 3) * 0.6 : 0) - 0.4 * h(18);
        zw += 0.14 * (h(19) - 0.5);
        // the rest spot: a small group under the trees (group = line and an eighth of the line)
        const g = Math.floor(s * 8), grp = li * 8 + g, hg = (k) => hsh(grp + 11, k);
        const gx = -38.0 - 1.8 * li - 0.6 * (hg(1) - 0.5), gz = lerp(-21, 19, (g + 0.5) / 8) + 1.6 * (hg(2) - 0.5);
        const m = (j - g * 7), ang = m * 2.4 + hg(3) * TAU, rad = 0.35 + 0.38 * Math.sqrt(m + 0.5);
        const [rx, rz] = offTrunks(gx + Math.cos(ang) * rad, gz + Math.sin(ang) * rad);
        const restYaw = Math.atan2(gx - rx, gz - rz) + 0.5 * (h(4) - 0.5);
        const restSit = h(5) < 0.5;
        // out of the woods, through the battery intervals, into the line
        const zi = intervalZ(lerp(rz, fz, 0.5));
        // through the interval: the front line clears the muzzles, the second passes the wheels, the third the trails
        const p0 = new Poly([[rx, rz], [-36.2, zi], [[-28.4, -31.6, -33.8][li], zi], [fx, fz]].filter((p, k) => k === 0 || p[0] > rx + 0.3));
        // a steady step out of the woods (about 1.3 m/s), the farthest groups arriving last, up to about 94 s
        const tDep = 82.0 + 1.4 * h(7), tArr = tDep + p0.L / (1.2 + 0.25 * h(6)) + 0.7;
        const J0 = journey(p0, tDep, { t1: tArr });
        // the advance: converge on the final z by the road, pass the farm, climb the fences, dip through the swale
        const pts = [[fx, fz]];
        if (!south) {
          const stations = [[-18, 0.18], [-10, 0.36], [FIELD.swaleX, 0.52], [3, 0.74], [8.5, 0.9], [11, 1]];
          for (const [x, k] of stations) if (x > fx + 1) pts.push([x, lerp(fz, zw, k)]);
          pts.push([xs, zw]);
        } else {
          pts.push([-16, lerp(fz, zc, 0.3)], [-6, lerp(fz, zc, 0.65)], [6, zc], [24.6, zc], [xs, zw]);
        }
        const p1 = new Poly(pts);
        const tA0 = Math.max(92 + 0.7 * li + 0.3 * h(8), tArr + 0.5), tA1 = 126 + 0.9 * li + 0.4 * h(9);
        // a few halt to fire on the way, in four loose volleys
        let stopAt, stopVolley = -1;
        if (h(10) < 0.11 && !(i in BEARERS)) { stopVolley = Math.floor(h(11) * 4); stopAt = [101, 108, 115, 121][stopVolley] + 1.2 * h(12); }
        const J1 = journey(p1, tA0, { t1: tA1, stopAt, stopDur: 1.6 });
        // the walk back: groups leave the wall together (the rear lines first, the flags last) and head for their trees
        const bearer = i in BEARERS;
        let tD = li === 0 ? 133.5 + 3.2 * hg(4) : li === 1 ? 130.5 + 2.8 * hg(4) : 128.2 + 2.8 * hg(4);
        if (FLAG_GROUPS.has(grp)) tD = 136 + 1.0 * hg(4);   // a flag's group stays to the last and leaves with it
        tD += 0.5 * h(13);
        // straight back west along the lane past the orchard, then fanning out toward their own trees
        const back = [[xs, zw]];
        if (!south) back.push([15.3, zw], [11, Math.min(0.9, lerp(zw, rz, 0.1))]); else back.push([24.6, zc], [11, zc]);
        back.push([-20, lerp(back[back.length - 1][1], rz, 0.6)], [rx, rz]);
        const p2 = new Poly(back);
        const distEdge = xs - (FIELD.woodsEdgeX - 0.5);
        const vb = clamp(distEdge / Math.max(4, 160 - 4 - tD), 1.5, 2.8) * (0.98 + 0.04 * h(14));
        const J2 = journey(p2, tD, { vb, stride: STRIDE_BACK });
        csa.push({ i, li, j, south, bearer, flag: bearer ? BEARERS[i] : -1, rx, rz, restYaw, restSit, fx, fz, xs, zw, J0, J1, J2, stopAt, stopVolley,
          butternut: h(15) < 0.45, seed: h(16) * 100, wallFire: li === 0 && h(17) < 0.6 });
      }
      // volleys at the wall (the front line), booms for the four loose volleys on the way
      const CSA_WALL_V = [128.0, 131.0, 134.2];

      // ---------- the Union line behind the wall, and the Vermonters ----------
      const NU = 50, union = [];
      for (let i = 0; i < NU; i++) {
        const h = (k) => hsh(i + 301, k), z = lerp(-28, 22, (i + 0.5) / NU) + 0.3 * (h(1) - 0.5);
        // close behind the wall: the north guns' rammers (people.js) stand as far forward as x 34.7, so the line keeps west of 34
        const x = wallX(z) + 0.6 + 0.35 * h(2);
        union.push({ i, x, z, y: G(x, z), yaw: -PI / 2 + 0.3 * (h(3) - 0.5), sit: h(4) < 0.45, seed: h(5) * 100,
          proneAt: 31.5 + 1.6 * h(6), upAt: 80 + 2.2 * h(7), easyAt: 140 + 3 * h(8), flag: -1 });
      }
      const UNION_V = []; for (let v = 0; v < 15; v++) UNION_V.push(93.5 + 3.1 * v);
      // Union flags: the national colours by the Angle, regimentals along the line (the nearest token carries each)
      const UFLAG_Z = [-4.5, 10, -18, 18];
      for (let f = 0; f < 4; f++) {
        let best = -1, bd = 1e9;
        for (const u of union) if (u.flag < 0 && Math.abs(u.z - UFLAG_Z[f]) < bd) { bd = Math.abs(u.z - UFLAG_Z[f]); best = u.i; }
        union[best].flag = 8 + f;
      }
      const NV = 12, verm = [], VERM_V = [113.5, 116.5, 119.5];
      {
        const [vx, vz] = FIELD.vermont;
        for (let i = 0; i < NV; i++) {
          const h = (k) => hsh(i + 601, k), r = Math.floor(i / 6), c = i % 6;
          const x = vx - 0.6 + 1.2 * r + 0.1 * (h(1) - 0.5), z = vz + 0.8 + 0.6 * c + 0.1 * (h(2) - 0.5);
          const ox = x - 2.8 + 0.1 * (h(3) - 0.5), oz = z + 0.5;
          const Jo = journey(new Poly([[x, z], [ox, oz]]), 109 + 0.5 * h(4), { vb: 1.25 });
          const Jb = journey(new Poly([[ox, oz], [x, z]]), 122.3 + 0.5 * h(5), { vb: 1.0 });
          verm.push({ i, x, z, ox, oz, y: G(x, z), oy: G(ox, oz), yaw: -PI / 2 + 0.2 * (h(6) - 0.5), outYaw: -3 * PI / 4 + 0.15 * (h(7) - 0.5), Jo, Jb, seed: h(8) * 100,
            sit: false, proneAt: 31.5 + 1.6 * h(9), upAt: 80 + 2.2 * h(10), easyAt: 141 + 3 * h(11) });
        }
      }

      // ---------- booms: one per volley, at the volley's middle ----------
      const booms = [];
      for (const tv of UNION_V) booms.push([tv + 0.15, 30.5, G(30.5, -3) + 1.4, -3]);
      for (const tv of VERM_V) booms.push([tv + 0.15, 23.4, G(23.4, 22) + 1.4, 22]);
      for (const tv of CSA_WALL_V) booms.push([tv + 0.15, 26.5, G(26.5, -5) + 1.4, -5]);
      for (let v = 0; v < 4; v++) { const tv = [101, 108, 115, 121][v] + 0.9, x = lerp(-26.5, 28, (tv - 92) / 34); booms.push([tv, x, G(x, -4) + 1.4, -4]); }
      booms.sort((a, b) => a[0] - b[0]);

      // ---------- meshes ----------
      const tokMat = tokenMaterial();
      const csaMesh = instanced(tokenGeo('slouch'), tokMat, NC);
      const uniMesh = instanced(tokenGeo('kepi'), tokMat, NU + NV);
      const legMesh = instanced(legGeo(), tokMat, 2 * (NC + NU + NV));
      ctx.root.add(csaMesh, uniMesh, legMesh);
      const csaCoat = csaMesh.geometry.attributes.aCoat, csaPants = csaMesh.geometry.attributes.aPants;
      const uniCoat = uniMesh.geometry.attributes.aCoat, uniPants = uniMesh.geometry.attributes.aPants;
      const legPants = legMesh.geometry.attributes.aPants;
      const gray = lin(C.csaGray), butternut = lin(C.butternut), trGray = lin(0x857257), trBut = lin(0x7d7468), blue = lin(C.unionBlue), sky = lin(C.unionSky);
      const setC = (attr, k, c) => attr.setXYZ(k, c.r, c.g, c.b);
      csa.forEach((s, k) => { setC(csaCoat, k, s.butternut ? butternut : gray); setC(csaPants, k, s.butternut ? trBut : trGray); setC(legPants, 2 * k, s.butternut ? trBut : trGray); setC(legPants, 2 * k + 1, s.butternut ? trBut : trGray); });
      for (let k = 0; k < NU + NV; k++) { setC(uniCoat, k, blue); setC(uniPants, k, sky); setC(legPants, 2 * (NC + k), sky); setC(legPants, 2 * (NC + k) + 1, sky); }
      const csaAim = csaMesh.geometry.attributes.aAim, uniAim = uniMesh.geometry.attributes.aAim;

      // shadows: the base's soft blob, instanced here (its own pool is shared with the full figures)
      const NT = NC + NU + NV;
      const blobMesh = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
        gr.addColorStop(0, 'rgba(60,45,25,0.45)'); gr.addColorStop(1, 'rgba(60,45,25,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        const geo = new T3.PlaneGeometry(2, 2); geo.rotateX(-PI / 2);
        const m = new T3.InstancedMesh(geo, new T3.MeshBasicMaterial({ map: new T3.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false }), NT);
        m.frustumCulled = false; m.renderOrder = 1;
        m.instanceMatrix.setUsage(T3.DynamicDrawUsage);
        ctx.root.add(m);
        return m;
      })();

      // the flags: a pole and a cloth of 4 x 7 quads that ripples in the shader; the cloth takes the instance's colour
      // except on the national flag, whose stripes and canton are in the vertex colours
      const NF = 12, flagUni = { value: 0 };
      const flagMesh = (() => {
        const pos = [], col = [], au = [], ac = [], c = new T3.Color();
        const push = (p, hex, u, cloth) => { pos.push(p[0], p[1], p[2]); c.set(hex).convertSRGBToLinear(); col.push(c.r, c.g, c.b); au.push(u); ac.push(cloth); };
        const quad = (a, b, cc, d, hex, us, cloth) => { for (const [p, u] of [[a, us[0]], [b, us[1]], [cc, us[2]], [a, us[0]], [cc, us[2]], [d, us[3]]]) push(p, hex, u, cloth); };
        const PH = 2.75, r = 0.028, pole = 0x6b4a2e;
        quad([-r, 0, r], [r, 0, r], [r, PH, r], [-r, PH, r], pole, [0, 0, 0, 0], 0);
        quad([r, 0, -r], [-r, 0, -r], [-r, PH, -r], [r, PH, -r], pole, [0, 0, 0, 0], 0);
        quad([r, 0, r], [r, 0, -r], [r, PH, -r], [r, PH, r], pole, [0, 0, 0, 0], 0);
        quad([-r, 0, -r], [-r, 0, r], [-r, PH, r], [-r, PH, -r], pole, [0, 0, 0, 0], 0);
        const W = 1.12, Hc = 0.76, COLS_N = 4, ROWS = 7, red = C.flagRed, white = 0xf0ece0, canton = 0x2c3f78;
        for (let row = 0; row < ROWS; row++) for (let cI = 0; cI < COLS_N; cI++) {
          const x0 = r + W * cI / COLS_N, x1 = r + W * (cI + 1) / COLS_N, y1 = PH - Hc * row / ROWS, y0 = PH - Hc * (row + 1) / ROWS;
          const hex = cI < 2 && row < 4 ? canton : row % 2 === 0 ? red : white;
          quad([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], hex, [cI / COLS_N, (cI + 1) / COLS_N, (cI + 1) / COLS_N, cI / COLS_N], 1);
        }
        const g = new T3.BufferGeometry();
        g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
        g.setAttribute('aU', new T3.Float32BufferAttribute(au, 1));
        g.setAttribute('aCloth', new T3.Float32BufferAttribute(ac, 1));
        g.computeVertexNormals();
        g.setAttribute('aPhase', new T3.InstancedBufferAttribute(new Float32Array(NF), 1));
        g.setAttribute('aNat', new T3.InstancedBufferAttribute(new Float32Array(NF), 1));
        g.setAttribute('aClothCol', new T3.InstancedBufferAttribute(new Float32Array(NF * 3), 3));
        const wave = new T3.InstancedBufferAttribute(new Float32Array(NF), 1); wave.setUsage(T3.DynamicDrawUsage);
        g.setAttribute('aWave', wave);
        const m = new T3.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, side: T3.DoubleSide });
        m.userData.extraKey = 'armiesFlag';
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = flagUni;
          sh.vertexShader = 'uniform float uTime;\nattribute float aU;\nattribute float aCloth;\nattribute float aPhase;\nattribute float aNat;\nattribute float aWave;\nattribute vec3 aClothCol;\n' + sh.vertexShader
            .replace('#include <color_vertex>', 'vColor = color;\nif (aCloth > 0.5 && aNat < 0.5) vColor = aClothCol;')
            .replace('#include <begin_vertex>', [
              'vec3 transformed = vec3(position);',
              'if (aCloth > 0.5) {',
              '  float w = sin(aU * 6.5 - uTime * 5.5 + aPhase) + 0.5 * sin(aU * 11.0 - uTime * 8.5 + aPhase * 1.7);',
              '  transformed.z += w * aU * 0.075 * aWave;',
              '  transformed.y -= aU * aU * 0.16 * (1.0 - 0.45 * min(aWave, 1.0));',
              '  transformed.x -= aU * aU * 0.05;',
              '}'].join('\n'));
        };
        const im = new T3.InstancedMesh(g, m, NF);
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(T3.DynamicDrawUsage);
        const ph = g.attributes.aPhase, nat = g.attributes.aNat, cc = g.attributes.aClothCol, redL = lin(C.flagRed), blueL = lin(0x2f4480);
        for (let f = 0; f < NF; f++) { ph.setX(f, hsh(f + 77) * TAU); nat.setX(f, f === 8 ? 1 : 0); const cl = f < 8 ? redL : blueL; cc.setXYZ(f, cl.r, cl.g, cl.b); wave.setX(f, 1); }
        ctx.root.add(im);
        return im;
      })();
      const flagWave = flagMesh.geometry.attributes.aWave;
      // who carries each flag (a token index into the shared per-frame arrays)
      const flagOwner = new Int32Array(NF);
      for (const i in BEARERS) flagOwner[BEARERS[i]] = Number(i);
      for (const u of union) if (u.flag >= 0) flagOwner[u.flag] = NC + u.i;

      // the musket smoke: a pool of faceted puffs with per-instance alpha, as the artillery's
      const POOL = 48, LIFE = 1.5;
      const puffAlpha = new T3.InstancedBufferAttribute(new Float32Array(POOL), 1);
      puffAlpha.setUsage(T3.DynamicDrawUsage);
      const puffMesh = (() => {
        const geo = ctx.jitterGeo(new T3.OctahedronGeometry(1, 0), 0.22, 9);
        geo.setAttribute('aAlpha', puffAlpha);
        const sm = new T3.MeshStandardMaterial({ color: lin(C.smoke), emissive: lin(C.smoke).multiplyScalar(0.3), flatShading: true, roughness: 1, metalness: 0, transparent: true, depthWrite: false });
        sm.userData.extraKey = 'armiesPuff';
        sm.onBeforeCompile = (sh) => {
          sh.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
          sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
        };
        if (ctx.addSkyFog) ctx.addSkyFog(sm);
        const im = new T3.InstancedMesh(geo, sm, POOL);
        im.frustumCulled = false; im.renderOrder = 2; im.count = 0;
        im.instanceMatrix.setUsage(T3.DynamicDrawUsage);
        ctx.root.add(im);
        return im;
      })();

      // ---------- per-frame scratch ----------
      const M = new T3.Matrix4(), Pv = new T3.Vector3(), Qt = new T3.Quaternion(), Sc = new T3.Vector3(1, 1, 1), E = new T3.Euler(0, 0, 0, 'YXZ');
      const SMP = { x: 0, z: 0, yaw: 0, ph: 0, amt: 0, lift: 0 };
      // this frame's state per token, for the flags and the tags
      const curX = new Float32Array(NT), curZ = new Float32Array(NT), curY = new Float32Array(NT), curYaw = new Float32Array(NT), curHip = new Float32Array(NT), curProne = new Float32Array(NT);
      let puffN = 0;
      const windDir = ctx.wind && ctx.wind.dir ? ctx.wind.dir : { x: 0.3, z: 0.1 };

      function placeToken(mesh, k, legBase, x, y, z, yaw, hipY, lean, l0, l1) {
        Pv.set(x, y + hipY, z); Qt.setFromEuler(E.set(lean, yaw, 0));
        mesh.setMatrixAt(k, M.compose(Pv, Qt, Sc));
        // the legs hang from the hips, offset to either side in the body's frame
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        Pv.set(x + 0.1 * cy, y + hipY, z - 0.1 * sy); Qt.setFromEuler(E.set(l0, yaw, 0));
        legMesh.setMatrixAt(legBase, M.compose(Pv, Qt, Sc));
        Pv.set(x - 0.1 * cy, y + hipY, z + 0.1 * sy); Qt.setFromEuler(E.set(l1, yaw, 0));
        legMesh.setMatrixAt(legBase + 1, M.compose(Pv, Qt, Sc));
      }
      function placeBlob(k, x, y, z, yaw, wide) {
        Pv.set(x, y + 0.03, z); Qt.setFromEuler(E.set(0, yaw, 0)); Sc.set(0.42 * (1 + 0.3 * wide), 1, 0.38 * (1 + 1.6 * wide));
        blobMesh.setMatrixAt(k, M.compose(Pv, Qt, Sc)); Sc.set(1, 1, 1);
      }
      function puff(x, y, z, fx, fz, age, seed) {
        if (puffN >= POOL || age < 0 || age >= LIFE) return;
        const u = age / LIFE, grow = Math.pow(u, 0.6), s = 0.16 + 0.55 * grow;
        Pv.set(x + fx * (0.35 + 1.1 * u) + windDir.x * 0.5 * u, y + 0.45 * u + 0.1 * grow, z + fz * (0.35 + 1.1 * u) + windDir.z * 0.5 * u);
        Qt.setFromEuler(E.set(seed, seed * 2.1, 0)); Sc.set(s, s * 0.85, s);
        puffMesh.setMatrixAt(puffN, M.compose(Pv, Qt, Sc)); Sc.set(1, 1, 1);
        puffAlpha.setX(puffN, 0.72 * Math.min(1, age / 0.08) * Math.pow(1 - u, 1.3));
        puffN++;
      }
      // the aim (0..1) for a shot fired at tf, and the smoke if it has just gone off
      const aimFor = (t, tf) => smooth((t - (tf - 0.6)) / 0.5) * (1 - smooth((t - (tf + 0.45)) / 0.6));

      // ---------- tags ----------
      const tagPos = { lines: new T3.Vector3(), flag: new T3.Vector3(), union: new T3.Vector3(), vermont: new T3.Vector3() };
      let flagTapAt = -99;
      const LINES_I = 30, FLAG_I = 27, UNION_I = union.reduce((b, u) => (Math.abs(u.z + 3) < Math.abs(union[b].z + 3) ? u.i : b), 0), VERM_I = 3;
      ctx.tag('csaLines', () => tagPos.lines);
      ctx.tag('csaFlag', () => tagPos.flag, { onTap: (now) => { flagTapAt = now; } });
      ctx.tag('unionInf', () => tagPos.union);
      ctx.tag('vermont', () => tagPos.vermont);

      let prevT = null;
      const self = this;
      self.frame = function (t, ct) {
        puffN = 0;
        // ----- the Confederates -----
        for (let n = 0; n < NC; n++) {
          const s = csa[n], { J0, J1, J2 } = s;
          let x, z, yaw, amt = 0, ph = 0, lift = 0, sit = 0, aim = 0, hold = false;
          if (ct < J0.t0 || ct >= J2.t1) {
            x = s.rx; z = s.rz; yaw = s.restYaw; hold = true;
            // sitting in the shade: up a moment before stepping off, down again a little after getting back
            sit = s.restSit ? (ct < 100 ? 1 - smooth((ct - (J0.t0 - 1.6)) / 1.3) : smooth((ct - (J2.t1 + 1.2)) / 1.6)) : 0;
          } else if (ct < J0.t1) {
            sampleJ(J0, ct, SMP); x = SMP.x; z = SMP.z; amt = SMP.amt; ph = SMP.ph; lift = SMP.lift;
            yaw = lerpA(lerpA(s.restYaw, SMP.yaw, smooth((ct - J0.t0) / 0.9)), PI / 2, smooth((ct - (J0.t1 - 0.8)) / 0.8));
          } else if (ct < J1.t0) {
            x = s.fx; z = s.fz; yaw = PI / 2; hold = true;
          } else if (ct < J1.t1) {
            sampleJ(J1, ct, SMP); x = SMP.x; z = SMP.z; amt = SMP.amt; ph = SMP.ph; lift = SMP.lift;
            yaw = lerpA(lerpA(PI / 2, SMP.yaw, smooth((ct - J1.t0) / 0.9)), PI / 2, smooth((ct - (J1.t1 - 0.8)) / 0.8));
            if (s.stopAt !== undefined) {
              const tf = s.stopAt + 0.75;
              aim = aimFor(ct, tf);
              if (ct >= tf && ct < tf + LIFE) { const sy = Math.sin(yaw), cy = Math.cos(yaw); puff(x + sy * 0.85, G(x, z) + HIP + 0.62, z + cy * 0.85, sy, cy, ct - tf, s.seed); }
            }
          } else if (ct < J2.t0) {
            x = s.xs; z = s.zw; yaw = PI / 2; hold = true;
            if (s.wallFire && ct < J2.t0 - 0.4) for (let v = 0; v < 3; v++) {
              if (hsh(n + 1, 20 + v) > 0.6) continue;
              const tf = CSA_WALL_V[v] + 0.35 * hsh(n + 1, 30 + v);
              aim = Math.max(aim, aimFor(ct, tf));
              if (ct >= tf && ct < tf + LIFE) puff(x + 0.85, G(x, z) + HIP + 0.62, z, 1, 0, ct - tf, s.seed);
            }
          } else {
            sampleJ(J2, ct, SMP); x = SMP.x; z = SMP.z; amt = SMP.amt; ph = SMP.ph; lift = SMP.lift;
            yaw = lerpA(lerpA(PI / 2, SMP.yaw, smooth((ct - J2.t0) / 0.9)), s.restYaw, smooth((ct - (J2.t1 - 0.8)) / 0.8));
          }
          const y = G(x, z) + lift;
          // the walk: a bob when the legs pass, a lean into the step; standing: breathing and a slow shift
          const stride = ct >= J2.t0 && ct < J2.t1 ? STRIDE_BACK : STRIDE;
          const A = Math.min(MAX_SWING, Math.asin(clamp(0.6 * stride * Math.max(0.4, amt) / (2 * LEG), 0, 0.9))) * Math.min(1, amt / 0.4);
          const breath = hold ? 0.006 * Math.sin(t * 1.7 + s.seed) : 0;
          const bob = 0.03 * amt * Math.pow(Math.cos(ph), 2);
          const hipY = lerp(HIP + bob + breath, 0.3, sit), lean = lerp(0.07 * amt + (hold ? 0.012 * Math.sin(t * 0.5 + s.seed) : 0), 0.14, sit);
          const l0 = lerp(-legAngle(ph, A), -1.22, sit), l1 = lerp(-legAngle(ph + PI, A), -1.17, sit);
          const yw = yaw + (hold ? 0.03 * Math.sin(t * 0.41 + s.seed) : 0);
          placeToken(csaMesh, n, 2 * n, x, y, z, yw, hipY, lean, l0, l1);
          csaAim.setX(n, s.bearer ? -1 : aim);
          placeBlob(n, x, G(x, z), z, yw, 0);
          curX[n] = x; curZ[n] = z; curY[n] = y; curYaw[n] = yw; curHip[n] = hipY; curProne[n] = 0;
        }
        // ----- the Union line and the Vermonters -----
        const uniAt = (u, k, x, z, y, yaw, moving, amt, ph) => {
          // prone through the cannonade, standing from 80 until the fight is over, then easy (sitting or standing)
          const prone = smooth((ct - u.proneAt) / 1.3) * (1 - smooth((ct - (u.upAt - 1.3)) / 1.3));
          const stand = smooth((ct - u.upAt) / 1.3) * (1 - smooth((ct - u.easyAt) / 1.6));
          const sit = u.sit ? (1 - prone) * (1 - stand) : 0;
          const A = Math.min(MAX_SWING, Math.asin(clamp(0.6 * STRIDE * Math.max(0.4, amt) / (2 * LEG), 0, 0.9))) * Math.min(1, amt / 0.4);
          const breath = moving ? 0 : 0.006 * Math.sin(t * 1.7 + u.seed);
          const bob = 0.03 * amt * Math.pow(Math.cos(ph), 2);
          const up = 1 - prone - sit;
          const hipY = (HIP + bob + breath) * up + 0.3 * sit + 0.2 * prone;
          const lean = (0.07 * amt + (moving ? 0 : 0.012 * Math.sin(t * 0.5 + u.seed))) * up + 0.14 * sit + 1.42 * prone;
          const l0 = -legAngle(ph, A) * up - 1.22 * sit + 1.5 * prone, l1 = -legAngle(ph + PI, A) * up - 1.17 * sit + 1.5 * prone;
          const yw = yaw + (moving ? 0 : 0.03 * Math.sin(t * 0.41 + u.seed));
          placeToken(uniMesh, k, 2 * (NC + k), x, y, z, yw, hipY, lean, l0, l1);
          placeBlob(NC + k, x, y, z, yw, prone);
          const idx = NC + k;
          curX[idx] = x; curZ[idx] = z; curY[idx] = y; curYaw[idx] = yw; curHip[idx] = hipY; curProne[idx] = prone;
          return stand;
        };
        for (let n = 0; n < NU; n++) {
          const u = union[n];
          const stand = uniAt(u, n, u.x, u.z, u.y, u.yaw, false, 0, 0);
          let aim = 0;
          if (u.flag < 0 && stand > 0.5) {
            const v0 = Math.floor((ct - 93.5) / 3.1);
            for (let v = v0 - 1; v <= v0 + 1; v++) {
              if (v < 0 || v >= UNION_V.length || hsh(n + 301, 40 + v) > 0.45) continue;
              const tf = UNION_V[v] + 0.35 * hsh(n + 301, 60 + v);
              aim = Math.max(aim, aimFor(ct, tf));
              if (ct >= tf && ct < tf + LIFE) puff(u.x - 0.85, u.y + HIP + 0.62, u.z, -1, 0, ct - tf, u.seed);
            }
          }
          uniAim.setX(n, u.flag >= 0 ? -1 : aim);
        }
        for (let n = 0; n < NV; n++) {
          const v = verm[n], k = NU + n;
          let aim = 0;
          if (ct >= v.Jo.t0 && ct < v.Jo.t1) {
            sampleJ(v.Jo, ct, SMP);
            const yaw = lerpA(lerpA(v.yaw, SMP.yaw, smooth((ct - v.Jo.t0) / 0.9)), v.outYaw, smooth((ct - (v.Jo.t1 - 0.8)) / 0.8));
            uniAt(v, k, SMP.x, SMP.z, G(SMP.x, SMP.z), yaw, true, SMP.amt, SMP.ph);
          } else if (ct >= v.Jo.t1 && ct < v.Jb.t0) {
            uniAt(v, k, v.ox, v.oz, v.oy, v.outYaw, false, 0, 0);
            const sy = Math.sin(v.outYaw), cy = Math.cos(v.outYaw);
            for (let q = 0; q < 3; q++) {
              const tf = VERM_V[q] + 0.3 * hsh(n + 601, 40 + q);
              aim = Math.max(aim, aimFor(ct, tf));
              if (ct >= tf && ct < tf + LIFE) puff(v.ox + sy * 0.85, v.oy + HIP + 0.62, v.oz + cy * 0.85, sy, cy, ct - tf, v.seed);
            }
          } else if (ct >= v.Jb.t0 && ct < v.Jb.t1) {
            sampleJ(v.Jb, ct, SMP);
            const yaw = lerpA(lerpA(v.outYaw, SMP.yaw, smooth((ct - v.Jb.t0) / 0.9)), v.yaw, smooth((ct - (v.Jb.t1 - 0.8)) / 0.8));
            uniAt(v, k, SMP.x, SMP.z, G(SMP.x, SMP.z), yaw, true, SMP.amt, SMP.ph);
          } else {
            uniAt(v, k, v.x, v.z, v.y, v.yaw, false, 0, 0);
          }
          uniAim.setX(k, aim);
        }
        // ----- the flags -----
        const tap = win(t - flagTapAt, 0, 3, 0.6);
        const atWall = smooth((ct - 125.5) / 2) * (1 - smooth((ct - 136.5) / 1.5));
        for (let f = 0; f < NF; f++) {
          const idx = flagOwner[f];
          let lift = 0, w = 1;
          if (f < 8) { lift = 0.45 * atWall; if (f === BEARERS[FLAG_I]) { lift += 0.6 * tap; w += 1.2 * tap; } }
          const x = curX[idx], z = curZ[idx], yaw = curYaw[idx], hip = curHip[idx], pr = curProne[idx];
          const sy = Math.sin(yaw), cy = Math.cos(yaw);
          // held in the right hand, a little forward; planted on the ground while the bearer lies low
          const base = lerp(hip + 0.08, 0.05, pr) + lift;
          Pv.set(x - 0.3 * cy + 0.18 * sy, curY[idx] + base, z + 0.3 * sy + 0.18 * cy);
          // the cloth trails behind the bearer (local +x points back), wandering a little
          const fyaw = yaw + PI / 2 + 0.35 * Math.sin(t * 0.5 + f * 1.3);
          Qt.setFromEuler(E.set(0.04 * Math.sin(t * 1.1 + f), fyaw, 0.03 * Math.sin(t * 0.9 + f * 2)));
          flagMesh.setMatrixAt(f, M.compose(Pv, Qt, Sc));
          flagWave.setX(f, w);
          if (f === BEARERS[FLAG_I]) tagPos.flag.set(Pv.x, Pv.y + 2.4, Pv.z);
        }
        flagUni.value = t;
        // ----- tags -----
        tagPos.lines.set(curX[LINES_I], curY[LINES_I] + curHip[LINES_I] + 0.75, curZ[LINES_I]);
        tagPos.union.set(curX[NC + UNION_I], curY[NC + UNION_I] + curHip[NC + UNION_I] + 0.75, curZ[NC + UNION_I]);
        tagPos.vermont.set(curX[NC + NU + VERM_I], curY[NC + NU + VERM_I] + curHip[NC + NU + VERM_I] + 0.75, curZ[NC + NU + VERM_I]);
        // ----- booms: each volley once, when the clock passes it (never on a jump) -----
        if (prevT !== null && ct - prevT > 0 && ct - prevT < 2) for (const b of booms) if (b[0] > prevT && b[0] <= ct) ctx.boom(b[1], b[2], b[3], 0.3);
        prevT = ct;
        // ----- upload -----
        csaMesh.instanceMatrix.needsUpdate = true; uniMesh.instanceMatrix.needsUpdate = true; legMesh.instanceMatrix.needsUpdate = true;
        csaAim.needsUpdate = true; uniAim.needsUpdate = true;
        blobMesh.instanceMatrix.needsUpdate = true;
        flagMesh.instanceMatrix.needsUpdate = true; flagWave.needsUpdate = true;
        puffMesh.count = puffN; puffMesh.instanceMatrix.needsUpdate = true; puffAlpha.needsUpdate = true;
      };
      // for checking from the console: window.ARMIES.csa[i].J1.t1 etc.
      window.ARMIES = { csa, union, verm, booms, meshes: { csaMesh, uniMesh, legMesh, flagMesh, puffMesh, blobMesh }, tapFlag: (now) => { flagTapAt = now; } };
    },
    update(t, dt, ctx) { this.frame(t, ctx.cycle.t); },
  });
})();
