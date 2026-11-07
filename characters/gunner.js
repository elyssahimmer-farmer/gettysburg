// gunner.js: an artillery crewman for the Gettysburg diorama (DESIGN §6; colours from DESIGN §1).
// A Union gunner: a short blue shell jacket with the artillery's red collar and cuffs, sky-blue trousers, a forage
// cap, and a long rammer-and-sponge staff held upright (the rammer head up, the sponge down). The Confederate
// gunner is the same figure in gray with a slouch hat: make(..., { side: 'csa' }). Uniform details are "ours"
// (DESIGN §12): the widely known look, not from the sources read.
//   CHARACTERS.gunner.build(ctx, B, kit, rig)                → Union (on the sheet, ?side=csa tries the other)
//   CHARACTERS.gunner.make(ctx, B, kit, rig, { side: 'union' | 'csa', beard })
// The staff hangs from the right hand like the kit's staff: upright when the arm is down, level forward when the
// right arm is raised (ram), so the choreographer only sets arm angles.
(function () {
  'use strict';
  window.CHARACTERS = window.CHARACTERS || {};
  const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const C = { union: { coat: 0x3c4f86, trousers: 0x7f97c4, cap: 0x34477c, capBand: 0x2a2622, hair: 0xc89a5a, beard: 0xb08448, belt: 0x2e2822 },
    csa: { coat: 0x9a9a90, trousers: 0x857257, cap: 0x6e6256, capBand: 0x4a3f36, hair: 0x4a3626, beard: 0x3f2e20, belt: 0x4a3a2a },
    trim: 0xb8382e, skin: 0xf2c9a8, shoe: 0x3f3429, brass: 0xc9a24a, wood: 0x8a6a44, rammer: 0x6b4a2e, sponge: 0xe0d6c0, steel: 0x5a6068, bayonet: 0xd0d4d8 };

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

  function slouchHat(rig, head, R, col, bandCol) {
    const segs = 7, r = [0, PI / segs, 0];
    rig.lathe(head, [[0.0001, R * 1.55], [R * 0.7, R * 1.42], [R * 1.0, R * 0.95], [R * 1.08, R * 0.42]], segs, col, { r });
    rig.lathe(head, [[R * 1.1, R * 0.62], [R * 1.12, R * 0.46]], segs, bandCol, { r });
    rig.lathe(head, [[R * 1.0, R * 0.48], [R * 1.42, R * 0.4], [R * 1.72, R * 0.08]], segs, col, { r });
    rig.lathe(head, [[R * 1.72, R * 0.06], [R * 1.42, R * 0.37], [R * 1.0, R * 0.45]], segs, bandCol, { r });
  }
  // the rammer and sponge: a long chunky pole, the rammer head at the top, the wool sponge at the bottom
  function rammer(rig, node) {
    rig.limb(node, V(0, 1.1, 0), V(0, -0.55, 0), 0.026, 0.026, C.wood, 5, true);
    rig.limb(node, V(0, 1.38, 0), V(0, 1.1, 0), 0.075, 0.068, C.rammer, 6);
    rig.limb(node, V(0, -0.55, 0), V(0, -0.8, 0), 0.08, 0.072, C.sponge, 6);
  }

  function make(ctx, B, kit, rig, o) {
    o = o || {};
    const side = o.side === 'csa' ? 'csa' : 'union', K = C[side];
    const f = B.make(kit, rig, { preset: 'man', skirt: 0.14, hem: 1.04, mantle: false, hat: 'none', hair: 'short',
      beard: o.beard ? 'block' : 'none', staff: 'none',
      col: { skin: C.skin, hair: K.hair, beard: K.beard, robe: K.coat, top: K.coat, sleeve: K.coat, pants: K.trousers, sandal: C.shoe, belt: K.belt } });
    rest(f);
    // a ball at each elbow closes the kit's open forearm sleeve, which otherwise shows a sliver of background
    for (const el of f.elbows) rig.ball(el, rig.sphere(4, 3), K.coat, Math.max(0.035, (f.spec.shoulder * f.H / f.spec.heads / 2) * 0.24) * 1.08, 0, 0, 0);
    const S = f.spec, headH = f.H / S.heads, R = headH / 2, shHalf = S.shoulder * headH / 2, waistR = shHalf * S.waist, tl = f.chinY - f.hipY;
    const armR = Math.max(0.035, shHalf * 0.24), fa = tl * 0.45;
    if (side === 'csa') slouchHat(rig, f.head, R, K.cap, K.capBand); else kepi(rig, f.head, R, K.cap, K.capBand);
    // the artillery's red: a collar and cuffs
    rig.lathe(f.torso, [[shHalf * 0.5, tl + 0.035], [shHalf * 0.68, tl * 0.975]], 6, C.trim);
    for (const el of f.elbows) rig.limb(el, V(0, -fa + 0.06, 0), V(0, -fa + 0.005, 0), armR * 1.42, armR * 1.5, C.trim, 5, true);
    plate(rig, f.torso, C.brass, 0.06, 0.05, 0, 0.015, waistR * 1.075 + 0.004);   // the belt plate
    for (let i = 0; i < 4; i++) plate(rig, f.torso, C.brass, 0.03, 0.03, 0, tl * (0.25 + 0.2 * i), shHalf * 0.92 * (0.985 + 0.015 * i) + 0.008);
    const staff = rig.node(f.hands[1], 0, -0.02, 0.03);
    rammer(rig, staff);
    holdLevelWhenRaised(f, staff);
    f.base = { af0: 0.08, ao0: 0.14, e0: 0.3, af1: 0.3, ao1: 0.12, e1: 0.5, hx: 0.04 };
    return f;
  }

  window.CHARACTERS.gunner = {
    name: 'Artillery crewman',
    note: 'Union: blue shell jacket with red collar and cuffs, forage cap, rammer staff. A Confederate gunner is the same figure in gray with a slouch hat (make with { side: "csa" })',
    build(ctx, B, kit, rig) { return sheetYaw(make(ctx, B, kit, rig, { side: new URLSearchParams(location.search).get('side') || 'union' })); },
    make,
    poses: {
      // the rammer pushed level into the gun's muzzle: a lunge forward, both hands on the staff
      ram: { lf0: 0.75, k0: 0.7, lf1: -0.45, k1: 0.05, lo0: 0.08, lo1: 0.08, lean: 0.3, hx: -0.1, af0: 1.3, e0: 0.1, ao0: -0.55, af1: 1.12, e1: 0.3, ao1: 0.02 },
      // stepped aside from the gun, the staff upright and held out, watching the piece
      standBack: { lean: -0.08, roll: 0.06, hy: 0.7, hx: -0.05, af0: 0.12, e0: 0.25, ao0: 0.22, af1: 0.4, e1: 0.4, ao1: 0.38, lo0: 0.12, lo1: 0.1 },
      // standing ready, looking across the field (a gunner has no musket; `aim` is this)
      ready: { hx: -0.08, af1: 0.3, e1: 0.5, ao1: 0.14, af0: 0.1, e0: 0.35 },
      aim: { hx: -0.08, af1: 0.3, e1: 0.5, ao1: 0.14, af0: 0.1, e0: 0.35 },
      // lying flat behind the wall during the cannonade, propped on the elbows, the staff on the ground forward
      prone: { lf0: -1.45, lf1: -1.45, k0: 0.05, k1: 0.05, lo0: 0.12, lo1: 0.12, lean: 1.38, hx: -1.6, af0: 2.55, e0: 0.95, ao0: 0.14, af1: 2.5, e1: 0.85, ao1: 0.12 },
      kneel: { lf0: 1.5, k0: 1.5, lf1: 0.12, k1: 1.62, lo0: 0.1, lo1: 0.02, lean: 0.12, hx: 0.0, af0: 0.9, e0: 0.5, ao0: 0.1, af1: 0.3, e1: 0.5, ao1: 0.14 },
      sit: { lf0: 1.45, lf1: 1.5, k0: 0.25, k1: 0.3, lo0: 0.28, lo1: 0.25, lean: 0.22, hx: 0.08, af0: 0.95, e0: 0.5, ao0: 0.1, af1: 1.05, e1: 0.35, ao1: 0.08 },
      wave: { af0: 2.5, e0: 0.4, ao0: 0.45, hx: -0.1, hz: 0.08 },
      pointUp: { af0: 2.85, e0: 0.05, ao0: 0.12, hx: -0.6, lean: -0.06 },
      crouch: { lf0: 1.15, lf1: 1.25, k0: 2.0, k1: 2.05, lo0: 0.15, lo1: 0.12, lean: 0.35, hx: -0.25, af0: 0.8, e0: 0.9, ao0: 0.12, af1: 0.4, e1: 0.5, ao1: 0.14 },
    },
  };
})();
