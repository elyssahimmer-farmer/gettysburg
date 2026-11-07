// horse.js: a blocky faceted horse for the Gettysburg diorama (DESIGN.md §6: "bay and chestnut; grazes, draws
// limbers, carries officers"). Built from the rig primitives in the same language as the kit figures.
//
//   const h = CHARACTERS.horse.make(kit, rig, { coat: 'bay' | 'chestnut', saddle: 'union' | 'csa' | 'none', blaze: true });
//   h.pose(p), h.set(state), h.gait(ph, amt, base) (a four-legged walk, used by FigureKit.Script.walk), h.base, h.eyes,
//   h.stride, h.shadowR, h.headTop(), h.saddle = { x, y, z } (where the rider's hips go, in the horse's frame).
//
// Sizes (metres, horse at the origin facing +z): back top 1.25, belly 0.67, hip pivots 0.75 (leg length 0.75),
// nose at rest 1.27 high and 1.49 forward, ears to about 1.80. With a saddle: blanket top 1.29, SADDLE SEAT TOP 1.35,
// seat centred 0.12 m forward of the root (z = 0.12), 0.45 m long (z -0.11 .. 0.34), 0.42 m wide. A mounted figure's
// hip pivot belongs at (0, 1.35, 0.12) in the horse's frame, legs hanging each side of a 0.56 m wide blanket.
//
// Pose keys reuse the kit's bag (so Script.sample's mix and FigureKit.idle just work); each is a delta from P()'s
// defaults, so a plain P() is the rest pose:
//   lf0 lf1 hind legs forward (0 left, 1 right)   k0 k1 hind hocks bent (lower leg back)
//   af0 af1 fore legs forward                      e0 e1 fore knees bent
//   at0 neck down (+)  hx head nose down (+)  hy head turn  hz head tilt
//   ao0 ao1 ears back (+)   at1 tail swing (yaw)   lo0 tail lift   lean twist roll y the body
// Poses: stand, graze (nose to the grass), toss (head up). CHARACTERS.horse.anim gives moving versions:
//   anim.graze(t, seed, base) nibbling, anim.toss(u 0..1, seed, base) the head-up shake for a tap or the cannonade,
//   anim.stand(t, seed, base) resting with ear and tail flicks.
window.CHARACTERS = window.CHARACTERS || {};
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  const COATS = {
    bay: { body: 0x7a4a2a, mane: 0x2e1c12, lower: 0x2e1c12, muzzle: 0x5c3a24 },
    chestnut: { body: 0xa0602e, mane: 0x66361a, lower: 0xa0602e, muzzle: 0x8a4e28 },
  };
  const SADDLE = { leather: 0x4a2e1a, union: 0x3c4f86, csa: 0x9a9a90 };
  const COL = { eye: 0x2b1d16, blaze: 0xf2e9d8 };

  // measurements
  const BODYC = 0.96, BODY_L = 1.3, BODY_W = 0.5, BODY_H = 0.58;   // back top 1.25, belly 0.67
  const HIP = 0.75, LEG = HIP, KNEE = HIP * 0.5;
  const NECK = V(0, 1.08, 0.6), NECK_A = 0.555, NECK_L = 0.62;      // neck pivot, its tilt forward, its length
  const HEAD_A = 0.6;                                               // the head's pitch down from the neck's end
  const SADDLE_Z = 0.12, SADDLE_TOP = 1.35;

  // the walk: each leg planted 60% of its cycle, sweeping back evenly, then swinging forward with the knee lifted
  const STANCE = 0.6;
  function leg(ph) {
    const u = ((ph / TAU) % 1 + 1) % 1;
    if (u < STANCE) { const k = u / STANCE; return [1 - 2 * k, 0]; }
    const k = (u - STANCE) / (1 - STANCE);
    return [-1 + 2 * smooth(k), Math.sin(k * Math.PI)];
  }

  function make(kit, rig, spec) {
    spec = spec || {};
    const P = window.FigureKit.P, M = window.Motion, D = P();
    const coat = COATS[spec.coat] || COATS.bay, C = Object.assign({}, coat, COL, spec.col || {});
    const saddle = spec.saddle && spec.saddle !== 'none' ? spec.saddle : null;
    const start = rig.pieces.length;
    const box = (nd, col, w, h, d, x, y, z, rot) => rig.box(nd, col, w, h, d, x, y, z, rot);
    const dir = (a) => V(0, Math.cos(a), Math.sin(a));                      // a unit vector tilted a forward of up

    const root = rig.node(null, 0, 0, 0);
    root.rotation.order = 'YXZ';
    // spec.back sets the horse back along -z on a static node (the character sheet's face view only; see build)
    const body = rig.node(spec.back ? rig.node(root, 0, 0, -spec.back) : root, 0, BODYC, 0);
    const f = { legs: [], knees: [], arms: [], elbows: [], ears: [], spec, rig };

    // the barrel and a deeper chest
    box(body, C.body, BODY_W, BODY_H, BODY_L, 0, 0, 0);
    box(body, C.body, BODY_W * 0.9, 0.5, 0.46, 0, 0.04, 0.66);

    // the neck: a block leaning forward from the chest, the mane a dark block along its crest
    const neck = rig.node(body, NECK.x, NECK.y - BODYC, NECK.z);
    const d = dir(NECK_A), n = V(0, Math.sin(NECK_A), -Math.cos(NECK_A));   // along the neck, and out of its back
    const at = (along, back) => d.clone().multiplyScalar(along).addScaledVector(n, back || 0);
    let c = at(0.24);
    box(neck, C.body, 0.26, NECK_L + 0.16, 0.3, c.x, c.y, c.z, [NECK_A, 0, 0]);
    c = at(0.36, 0.2);
    box(neck, C.mane, 0.09, 0.56, 0.16, c.x, c.y, c.z, [NECK_A, 0, 0]);

    // the head: a long block angled down, a muzzle block, a blaze, two eyes on the sides, two ears
    const hp = at(NECK_L), head = rig.node(neck, hp.x, hp.y, hp.z);
    const dh = V(0, -Math.sin(HEAD_A), Math.cos(HEAD_A)), uh = V(0, Math.cos(HEAD_A), Math.sin(HEAD_A));
    const hat = (along, up, x) => dh.clone().multiplyScalar(along).addScaledVector(uh, up || 0).setX(x || 0);
    c = hat(0.22);
    box(head, C.body, 0.26, 0.3, 0.5, c.x, c.y, c.z, [HEAD_A, 0, 0]);
    c = hat(0.52, -0.03);
    box(head, C.muzzle, 0.2, 0.22, 0.26, c.x, c.y, c.z, [HEAD_A, 0, 0]);
    if (spec.blaze !== false) { c = hat(0.3, 0.145); box(head, C.blaze, 0.07, 0.02, 0.34, c.x, c.y, c.z, [HEAD_A, 0, 0]); }
    const eyes = rig.node(head, 0, 0, 0);
    for (const s of [-1, 1]) { c = hat(0.1, 0.08, s * 0.125); rig.ball(eyes, kit.ball(4, 2), C.eye, 0.04, c.x, c.y, c.z, [1, 1, 1.2]); }
    for (const s of [-1, 1]) {
      c = hat(-0.02, 0.1, s * 0.08);
      const ear = rig.node(head, c.x, c.y, c.z);
      rig.piece(ear, new THREE.ConeGeometry(0.05, 0.17, 4), C.body, 0, 0.075, 0, { r: [-0.15, 0, -s * 0.3] });
      f.ears.push(ear);
    }

    // the tail: a tapered clump from the rump
    const tail = rig.node(body, 0, 1.18 - BODYC, -BODY_L / 2 + 0.02);
    rig.lock(tail, V(0, 0.03, 0.02), V(0, -0.62, -0.2), 0.085, C.mane, 0, 1, 4);

    // four legs on hip pivots with a knee each; the lower legs dark on a bay
    for (const sz of [1, -1]) for (const sx of [1, -1]) {
      const hip = rig.node(body, sx * 0.19, HIP - BODYC, sz > 0 ? 0.56 : -0.45), knee = rig.node(hip, 0, -KNEE, 0);
      box(hip, C.body, 0.17, KNEE + 0.06, 0.19, 0, -KNEE / 2 + 0.03, 0);
      box(knee, C.lower, 0.13, KNEE, 0.15, 0, -KNEE / 2, 0);
      if (sz > 0) { f.arms.push(hip); f.elbows.push(knee); } else { f.legs.push(hip); f.knees.push(knee); }
    }

    // an officer's saddle: a blanket over the back (blue for Union, gray for Confederate) and a dark leather seat
    if (saddle) {
      const bl = SADDLE[saddle] || SADDLE.union;
      box(body, bl, BODY_W + 0.06, 0.36, 0.56, 0, 1.11 - BODYC, SADDLE_Z);
      box(body, SADDLE.leather, 0.42, 0.06, 0.45, 0, SADDLE_TOP - 0.03 - BODYC, SADDLE_Z);
      f.saddle = { x: 0, y: SADDLE_TOP, z: SADDLE_Z };
    }

    f.eyes = eyes;
    f.range = [start, rig.pieces.length];
    f.H = 2.2; f.height = 1.8; f.chinY = -5;   // H sets the sheet's layout and the baked shade; the real height is 1.8
    f.shadowR = 0.95;
    f.root = root; f.body = body; f.neck = neck; f.head = head; f.tail = tail;
    f.headTop = () => head.localToWorld(V(0, 0.25, 0.05));
    f.stride = 1.25;
    f.base = {};

    // every key is a delta from P()'s defaults
    f.pose = (p) => {
      body.position.y = BODYC + (p.y - D.y);
      body.rotation.set(p.lean - D.lean, p.twist - D.twist, p.roll - D.roll);
      neck.rotation.x = p.at0 - D.at0;
      head.rotation.set(p.hx - D.hx, p.hy - D.hy, p.hz - D.hz);
      for (let i = 0; i < 2; i++) {
        f.legs[i].rotation.x = -(p['lf' + i] - D['lf' + i]);
        f.knees[i].rotation.x = p['k' + i] - D['k' + i];
        f.arms[i].rotation.x = -(p['af' + i] - D['af' + i]);
        f.elbows[i].rotation.x = p['e' + i] - D['e' + i];
        f.ears[i].rotation.x = p['ao' + i] - D['ao' + i];
      }
      tail.rotation.set(p.lo0 - D.lo0, p.at1 - D.at1, 0);
    };

    // the walk: diagonal pairs (left hind with right fore), the fore a beat ahead so it reads as a walk not a trot;
    // the body drops as the planted legs angle so the hooves stay on the ground
    f.gait = (ph, amt, base) => {
      const p = P(Object.assign({}, f.base, base || {}));
      const A = M.legSwing(f.stride, LEG), lag = 0.35;
      const L = [leg(ph), leg(ph + Math.PI), leg(ph + Math.PI + lag), leg(ph + lag)];   // hind L, hind R, fore L, fore R
      p.lf0 += A * L[0][0] * amt; p.k0 += amt * (0.05 + 0.9 * L[0][1]);
      p.lf1 += A * L[1][0] * amt; p.k1 += amt * (0.05 + 0.9 * L[1][1]);
      p.af0 += A * L[2][0] * amt; p.e0 += amt * (0.05 + 0.8 * L[2][1]);
      p.af1 += A * L[3][0] * amt; p.e1 += amt * (0.05 + 0.8 * L[3][1]);
      let amin = Math.PI;
      for (const l of L) if (l[1] === 0) amin = Math.min(amin, Math.abs(A * l[0] * amt));
      p.y -= LEG * (1 - Math.cos(amin));
      p.lean += 0.02 * amt;
      p.roll += 0.025 * amt * Math.cos(ph);
      p.at0 += 0.05 * amt * Math.sin(2 * ph + 0.4);
      p.hx += 0.09 * amt * Math.sin(2 * ph + 0.9);
      p.hz += 0.03 * amt * Math.sin(ph);
      p.at1 += 0.22 * amt * Math.sin(ph + 1);
      p.wk = amt;
      return p;
    };
    // follow-through on the head, neck and tail, none on the legs (they must stay planted)
    f.follow = M.lag({ hx: 0.18, hy: 0.3, hz: 0.18, at0: 0.22, at1: 0.3, lo0: 0.3, ao0: 0.06, ao1: 0.06,
      af0: 1e-4, af1: 1e-4, e0: 1e-4, e1: 1e-4 });
    f.seed = rig.figures.length * 2.3 + 0.7;
    f.floor = null;
    f.set = (s) => {
      if (s.hide) { root.scale.setScalar(1e-4); return; }
      root.scale.setScalar(1);
      const y = s.y !== undefined && s.y !== null ? s.y : f.floor ? f.floor(s.x, s.z) : 0;
      root.position.set(s.x, y + (s.lift || 0), s.z);
      root.rotation.set(s.pitch || 0, s.yaw, 0);
      f.pose(f.follow(s.pose || P(f.base)));
    };
    f.pose(P(f.base));
    rig.figures.push(f);
    return f;
  }

  // ---------- poses (static) and the moving versions ----------
  const rel = (o) => { const p = window.FigureKit.P(), r = {}; for (const k in o) r[k] = p[k] + o[k]; return r; };
  const POSES = {
    stand: {},
    graze: { at0: 1.45, hx: -0.45, lean: 0.03, af0: 0.12, af1: -0.12, lo0: -0.05 },
    toss: { at0: -0.4, hx: -0.45, ao0: -0.2, ao1: -0.2, lo0: 0.35 },
  };
  const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
  const win = (s, a, b, e) => window.Motion.win(s, a, b, e);
  // an ear flicks now and then, the tail swishes
  function flicks(p, t, seed) {
    const T = 3.1, u = t + seed * 5, nn = Math.floor(u / T), r = hash(nn, seed);
    const g = win(u - nn * T - r * 1.8, 0, 0.5, 0.2);
    if (r < 0.5) p.ao0 += 0.7 * g; else p.ao1 += 0.7 * g;
    p.at1 += 0.3 * Math.sin(t * 1.9 + seed) * (0.6 + 0.4 * Math.sin(t * 0.37 + seed * 2));
    return p;
  }
  const anim = {
    // head down in the grass, nibbling along, a step of the head to one side now and then
    graze(t, seed, base) {
      const p = window.FigureKit.P(Object.assign({}, base || {}, rel(POSES.graze)));
      p.hx += 0.07 * Math.sin(t * 4.2 + seed);
      p.hy += 0.25 * Math.sin(t * 0.21 + seed * 3);
      p.at0 += 0.04 * Math.sin(t * 0.5 + seed);
      p.lean += 0.006 * Math.sin(t * 1.5 + seed);
      return flicks(p, t, seed);
    },
    // u runs 0..1 over about 1.6 s: the head comes up, shakes side to side, and settles
    toss(u, seed, base) {
      const p = window.FigureKit.P(Object.assign({}, base || {}));
      const w = win(u, 0, 1, 0.3), T = rel(POSES.toss), D = window.FigureKit.P();
      for (const k in T) p[k] += (T[k] - D[k]) * w;
      p.hy += 0.35 * w * Math.sin(u * TAU * 2.5 + seed);
      p.hz += 0.2 * w * Math.sin(u * TAU * 2.5 + seed + 1.2);
      p.y -= 0.02 * w;
      return p;
    },
    // standing: breathing, a slow look about, ear and tail flicks, weight off one hind foot
    stand(t, seed, base) {
      const p = window.FigureKit.P(Object.assign({}, base || {}));
      p.lean += 0.006 * Math.sin(t * 1.5 + seed);
      p.hy += 0.3 * Math.sin(t * 0.17 + seed) * Math.sin(t * 0.09 + seed * 2);
      p.hx += 0.06 * Math.sin(t * 0.29 + seed);
      p.at0 += 0.05 * Math.sin(t * 0.23 + seed * 3);
      const ws = Math.sin(t * 0.15 + seed * 5);
      p.k0 += 0.12 * Math.max(0, ws); p.k1 += 0.12 * Math.max(0, -ws);
      return flicks(p, t, seed);
    },
  };

  window.CHARACTERS.horse = {
    name: 'Horse',
    note: 'bay or chestnut (?coat=chestnut), officer saddle ?saddle=union|csa|none; saddle seat 1.35 m up, 0.12 m forward of centre',
    make,
    anim,
    build(ctx, B, kit, rig) {
      const q = new URLSearchParams(location.search);
      // the sheet's face camera sits 3.2 m out for a human head; a horse's nose is 1.5 m forward, so set it back
      return make(kit, rig, { coat: q.get('coat') || 'bay', saddle: q.get('saddle') || 'union', back: q.get('view') === 'face' ? 1.5 : 0 });
    },
    poses: { stand: rel(POSES.stand), graze: rel(POSES.graze), toss: rel(POSES.toss) },
  };
})();
