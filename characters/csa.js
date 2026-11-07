// csa.js: a Confederate infantryman, July 1863, for the Gettysburg diorama (DESIGN §6; colours from DESIGN §1).
// A short gray jacket ("the dull gray masses", Haskell, research §4) or butternut, mixed brownish trousers, a slouch
// hat with a wide soft brim drooping at the edge, a blanket roll over the left shoulder, a musket with bayonet at the
// right shoulder. Uniform details beyond the gray are "ours" (DESIGN §12).
//   CHARACTERS.csa.build(ctx, B, kit, rig)                        → gray (on the sheet, ?col=butternut tries the other)
//   CHARACTERS.csa.make(ctx, B, kit, rig, { col: 'gray' | 'butternut', beard })
// The musket hangs from the right hand like the kit's staff: upright when the arm is down, level forward when the
// right arm is raised (aim, prone), so the choreographer only sets arm angles.
(function () {
  'use strict';
  window.CHARACTERS = window.CHARACTERS || {};
  const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const C = { gray: 0x9a9a90, butternut: 0xb49a6a, trousersGray: 0x857257, trousersButternut: 0x7d7468, hat: 0x6e6256, hatBand: 0x4a3f36,
    skin: 0xf2c9a8, hair: 0x7a4a2a, beard: 0x5e3a22, shoe: 0x4a3a2c, belt: 0x4a3a2a, brass: 0xb09050, rollGray: 0x8a6e4e, rollButternut: 0x8a8d86,
    wood: 0x6b4a2e, steel: 0x5a6068, bayonet: 0xd0d4d8 };

  // ---------- pieces shared by the three soldiers (copied, not imported: each character file stands alone) ----------
  // put every pivot back at rest so the bake's bind pose is the built pose (Blocky.make leaves it in its base pose)
  function rest(f) {
    for (const n of [f.torso, f.head, f.skirt].concat(f.legs, f.knees, f.arms, f.elbows)) n.rotation.set(0, 0, 0);
    f.hips.position.y = f.hipY;
  }
  // the forage cap: a short drum round the brow, a crown that leans forward with a flat top higher at the back, a dark
  // band and a small visor. Rings are horizontal (the top one tilted), so the front never folds back on itself.
  function kepi(rig, head, R, col, bandCol) {
    const sides = 7, rings = [[0.3, 1.15, 0, 0], [0.74, 1.1, 0.02, 0], [1.2, 0.97, 0.1, 0.38]].map(([y, r, cz, s]) => {
      const ring = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * 2 * PI + PI / sides, z = -Math.sin(a) * r;
        ring.push([Math.cos(a) * r * R, (y - s * z) * R, (z + cz) * R]);
      }
      return ring;
    });
    const pos = [], tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][(k + 1) % sides], d = rings[i + 1][k];
      tri(a, b, c); tri(a, c, d);
    }
    const top = rings[rings.length - 1], ctr = [0, 0, 0];
    for (const p of top) { ctr[0] += p[0] / sides; ctr[1] += p[1] / sides; ctr[2] += p[2] / sides; }
    for (let k = 0; k < sides; k++) tri(ctr, top[k], top[(k + 1) % sides]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rig.geo(head, g, col);
    rig.lathe(head, [[R * 1.17, R * 0.42], [R * 1.18, R * 0.3]], sides, bandCol, { r: [0, PI / sides, 0] });
    rig.box(head, bandCol, R * 1.25, R * 0.07, R * 0.62, 0, R * 0.3, R * 1.2, [0.3, 0, 0]);
  }
  // a blanket roll over the left shoulder, across the chest and back to the right hip
  function blanketRoll(rig, f, col) {
    const S = f.spec, headH = f.H / S.heads, shHalf = S.shoulder * headH / 2, waistR = shHalf * S.waist, chestR = shHalf * 0.92;
    const tl = f.chinY - f.hipY, r = 0.062;
    const A = V(shHalf * 0.78, tl * 1.0, 0.02), B = V(shHalf * 0.05, tl * 0.5, chestR * 1.06), Cf = V(-waistR * 0.95, tl * 0.02, waistR * 0.95);
    const D = V(shHalf * 0.05, tl * 0.55, -chestR * 1.0), E = V(-waistR * 0.95, tl * 0.02, -waistR * 0.9);
    for (const [a, b] of [[A, B], [B, Cf], [A, D], [D, E]]) rig.limb(f.torso, a, b, r, r, col, 5, true);
    for (const p of [A, B, D]) rig.ball(f.torso, f.rig.sphere(4, 3), col, r * 1.05, p.x, p.y, p.z);
    rig.ball(f.torso, f.rig.sphere(4, 3), col, r * 1.15, Cf.x, Cf.y, (Cf.z + E.z) / 2, [1, 1, 2.2]);
  }
  // a musket with its bayonet, chunky so it reads: butt below the hand, barrel and bayonet above
  function musket(rig, node, col) {
    rig.box(node, col.wood, 0.075, 0.2, 0.11, 0, -0.2, 0.0);                      // the butt
    rig.limb(node, V(0, -0.1, 0.0), V(0, 0.55, 0.0), 0.034, 0.03, col.wood, 5, true);   // the stock
    rig.box(node, col.steel, 0.05, 0.1, 0.06, 0, 0.32, -0.035);                    // the lock and hammer
    rig.limb(node, V(0, 0.2, 0.012), V(0, 1.15, 0.012), 0.028, 0.026, col.steel, 4);   // the barrel
    for (const y of [0.45, 0.78]) rig.box(node, col.brass, 0.072, 0.04, 0.072, 0, y, 0.004);  // the bands
    rig.limb(node, V(0, 1.15, 0.012), V(0, 1.56, 0.012), 0.014, 0.004, col.bayonet, 3); // the bayonet
  }
  // a flat brass plate on the front of the torso (two triangles)
  function plate(rig, node, col, w, h, x, y, z) {
    const g = new THREE.BufferGeometry(), a = w / 2, b = h / 2;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-a, -b, 0, a, -b, 0, a, b, 0, -a, -b, 0, a, b, 0, -a, b, 0], 3));
    rig.piece(node, g, col, x, y, z);
  }
  // the musket (or a staff) in the right hand: upright while the arm is down, level and forward when it is raised
  function holdLevelWhenRaised(f, node) {
    const pose0 = f.pose;
    f.staff = node;
    f.pose = (p) => {
      pose0(p);
      const w = smooth((p.af1 - 0.55) / 0.45);
      node.rotation.set(p.af1 + p.e1 - p.lean + w * PI / 2 - (1 - w) * 0.1, 0, p.ao1);
    };
  }

  // on the character sheet only: ?yaw=1.57 turns a posed figure so a pose can be checked from the side
  function sheetYaw(f) {
    const yaw = parseFloat(new URLSearchParams(location.search).get('yaw'));
    if (!isNaN(yaw)) { const pose0 = f.pose; f.pose = (p) => { pose0(p); f.root.rotation.y = yaw; }; }
    return f;
  }

  // the slouch hat: a soft rounded crown and a wide brim that droops at the edge, with its underside so it reads from
  // below too (the brim is a lathe, so a second one with the profile reversed faces down)
  function slouchHat(rig, head, R, col, bandCol) {
    const segs = 7, r = [0, PI / segs, 0];
    rig.lathe(head, [[0.0001, R * 1.55], [R * 0.7, R * 1.42], [R * 1.0, R * 0.95], [R * 1.08, R * 0.42]], segs, col, { r });
    rig.lathe(head, [[R * 1.1, R * 0.62], [R * 1.12, R * 0.46]], segs, bandCol, { r });
    rig.lathe(head, [[R * 1.0, R * 0.48], [R * 1.42, R * 0.4], [R * 1.72, R * 0.08]], segs, col, { r });
    rig.lathe(head, [[R * 1.72, R * 0.06], [R * 1.42, R * 0.37], [R * 1.0, R * 0.45]], segs, bandCol, { r });
  }

  function make(ctx, B, kit, rig, o) {
    o = o || {};
    const butternut = o.col === 'butternut', coat = butternut ? C.butternut : C.gray;
    const f = B.make(kit, rig, { preset: 'man', skirt: 0.24, hem: 1.12, mantle: false, hat: 'none', hair: 'short',
      beard: o.beard === false ? 'none' : 'block', staff: 'none',
      col: { skin: C.skin, hair: C.hair, beard: C.beard, robe: coat, top: coat, sleeve: coat, pants: butternut ? C.trousersButternut : C.trousersGray, sandal: C.shoe, belt: C.belt } });
    rest(f);
    // a ball at each elbow closes the kit's open forearm sleeve, which otherwise shows a sliver of background
    for (const el of f.elbows) rig.ball(el, rig.sphere(4, 3), coat, Math.max(0.035, (f.spec.shoulder * f.H / f.spec.heads / 2) * 0.24) * 1.08, 0, 0, 0);
    const S = f.spec, headH = f.H / S.heads, R = headH / 2, shHalf = S.shoulder * headH / 2, waistR = shHalf * S.waist, tl = f.chinY - f.hipY;
    slouchHat(rig, f.head, R, C.hat, C.hatBand);
    blanketRoll(rig, f, butternut ? C.rollButternut : C.rollGray);
    plate(rig, f.torso, C.brass, 0.055, 0.045, 0, 0.015, waistR * 1.075 + 0.004);   // the belt plate
    for (let i = 0; i < 3; i++) plate(rig, f.torso, C.brass, 0.03, 0.03, 0, tl * (0.3 + 0.22 * i), shHalf * 0.92 * (0.985 + 0.02 * i) + 0.008);
    const gun = rig.node(f.hands[1], 0, -0.02, 0.03);
    musket(rig, gun, C);
    holdLevelWhenRaised(f, gun);
    // shoulder arms: the right hand low at the hip, the musket leaning back against the shoulder
    f.base = { af0: 0.08, ao0: 0.14, e0: 0.3, af1: 0.16, ao1: 0.08, e1: 0.42, hx: 0.04 };
    return f;
  }

  window.CHARACTERS.csa = {
    name: 'Confederate infantryman',
    note: 'gray (or butternut) short jacket, brownish trousers, slouch hat, blanket roll, musket at the shoulder',
    build(ctx, B, kit, rig) { return sheetYaw(make(ctx, B, kit, rig, { col: new URLSearchParams(location.search).get('col') || 'gray' })); },
    make,
    poses: {
      // the musket up at the shoulder, level, pointing forward (only ever for scripted smoke across the field)
      aim: { af1: 1.25, e1: 1.25, ao1: 0.05, at1: 0, af0: 1.5, e0: 0.25, ao0: -0.3, lean: 0.08, hx: 0.12, hz: -0.12, hy: -0.1, lf0: 0.25, lf1: -0.2, k0: 0.1 },
      // lying on the stomach behind the wall, propped on the elbows, the musket forward along the ground
      prone: { lf0: -1.45, lf1: -1.45, k0: 0.05, k1: 0.05, lo0: 0.12, lo1: 0.12, lean: 1.38, hx: -1.6, af0: 2.55, e0: 0.95, ao0: 0.14, af1: 2.5, e1: 0.85, ao1: 0.12 },
      // on the right knee, left foot forward and flat, the musket upright
      kneel: { lf0: 1.5, k0: 1.5, lf1: 0.12, k1: 1.62, lo0: 0.1, lo1: 0.02, lean: 0.12, hx: 0.0, af0: 0.9, e0: 0.5, ao0: 0.1, af1: 0.2, e1: 0.5, ao1: 0.1 },
      // sitting on the ground by a campfire, legs out, the musket across the knees
      sit: { lf0: 1.45, lf1: 1.5, k0: 0.25, k1: 0.3, lo0: 0.28, lo1: 0.25, lean: 0.22, hx: 0.08, af0: 0.95, e0: 0.5, ao0: 0.1, af1: 1.05, e1: 0.35, ao1: 0.08 },
      // a wave with the left hand
      wave: { af0: 2.5, e0: 0.4, ao0: 0.45, hx: -0.1, hz: 0.08 },
      // pointing up at the sky with the left arm
      pointUp: { af0: 2.85, e0: 0.05, ao0: 0.12, hx: -0.6, lean: -0.06 },
      // crouched behind a rock, knees deep, the musket upright
      crouch: { lf0: 1.15, lf1: 1.25, k0: 2.0, k1: 2.05, lo0: 0.15, lo1: 0.12, lean: 0.35, hx: -0.25, af0: 0.8, e0: 0.9, ao0: 0.12, af1: 0.3, e1: 0.5, ao1: 0.1 },
    },
  };
})();
