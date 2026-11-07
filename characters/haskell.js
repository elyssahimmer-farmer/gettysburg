// Lt. Frank A. Haskell, aide to Gen. Gibbon, who wrote the letter this scene is built from (research.md §1, §2).
// A Union staff officer: dark blue frock coat to the knee (the officer's shape, longer than the men's coats), sky-blue
// trousers, a dark slouch hat, a chunky sword at the left hip, a field-glasses case on a strap. Uniform details are
// ours (DESIGN.md §12); the sources read don't describe his clothes.
//
// Props that only make sense in a pose appear on their own when the arms take that pose (so they work from Scripts
// too, where poses are plain angle bags): field glasses when both elbows bend hard (glasses), a pocket watch when the
// left forearm comes level (watch), a biscuit in the right hand when he sits (sit), and the hat lifts when the right
// arm reaches up past the head (af1 > 1.85 with a bent elbow: hatRaise).
window.CHARACTERS = window.CHARACTERS || {};
CHARACTERS.haskell = {
  name: 'Lt. Frank A. Haskell',
  note: 'Union staff officer: knee-length frock coat, slouch hat, sword, field glasses',
  build(ctx, B, kit, rig) {
    const THREE = ctx.THREE, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const BLUE = 0x3c4f86, SKY = 0x7f97c4, BRASS = 0xd4a83a, LEATHER = 0x4a3222, BOOT = 0x2b2824, HAT = 0x35353c;
    const H = 1.78, heads = 2.9, headH = H / heads, R = headH / 2, hipY = H * 0.3, shY = H - headH * 0.92, tl = shY - hipY;
    const shHalf = 1.08 * headH / 2, waistR = shHalf * 0.72, chestR = shHalf * 0.92, armR = Math.max(0.035, shHalf * 0.24);
    const f = B.make(kit, rig, {
      preset: 'man', height: H, skirt: 0.6, hem: 1.3, mantle: false, hair: 'short', beard: 'none', hat: 'none',
      col: { robe: BLUE, top: BLUE, sleeve: BLUE, pants: SKY, sandal: BOOT, belt: 0x3b2a1c, hair: 0x4a3222, beard: 0x4a3222, skin: 0xf2c9a8 },
    });
    const head = f.head, torso = f.torso, hips = f.hips, ball = (w, h) => rig.sphere(w, h);
    // The kit captures its pieces with every pivot at rest but leaves them in the base pose, so pieces added now on
    // a hand or the head would sit off by the base pose. Put the pivots back to rest while adding, then restore.
    const basePose = f.pose, P = window.FigureKit.P;
    [torso, head, f.skirt].concat(f.arms, f.elbows, f.legs, f.knees).forEach((n) => n.rotation.set(0, 0, 0));

    // a short chin beard (a small block, no strands)
    rig.ball(head, ball(5, 3), 0x4a3222, R * 0.48, 0, -R * 0.72, R * 0.44, [0.9, 0.6, 0.7]);

    // the slouch hat on a pivot of its own, so it can lift: a soft crown, a wide brim that droops, a dark band
    const hat = rig.node(head, 0, 0, 0);
    rig.lathe(hat, [[0.0001, R * 1.52], [R * 0.62, R * 1.5], [R * 0.98, R * 1.18], [R * 1.1, R * 0.62], [R * 1.55, R * 0.48], [R * 1.72, R * 0.3]], 6, HAT, { phi0: Math.PI / 6, r: [0.1, 0, 0] });
    rig.lathe(hat, [[R * 1.13, R * 0.84], [R * 1.14, R * 0.64]], 6, 0x24242a, { phi0: Math.PI / 6, r: [0.1, 0, 0] });

    // shoulder straps and a row of brass buttons down the chest
    for (const sx of [1, -1]) rig.box(torso, BRASS, 0.1, 0.014, 0.05, sx * shHalf * 0.86, tl - armR * 1.1 + armR * 1.15, 0);
    for (let i = 0; i < 3; i++) {
      const y = tl * (0.78 - i * 0.27), r = chestR + (waistR - chestR) * Math.max(0, (tl * 0.55 - y) / (tl * 0.55));
      rig.box(torso, BRASS, 0.03, 0.03, 0.02, 0, y, r + 0.008);
    }
    // the belt plate
    rig.box(torso, BRASS, 0.07, 0.05, 0.02, 0, 0.015, waistR * 1.07 + 0.005);

    // boot tops over the trousers
    const legR = waistR * 0.26;
    for (const k of f.knees) rig.limb(k, V(0, -hipY * 0.5 + R * 0.12 + 0.09, 0), V(0, -hipY * 0.5 + R * 0.12 - 0.01, 0), legR * 1.08, legR * 1.02, BOOT, 4);

    // the sword at the left hip: a chunky scabbard slanting back, a brass guard and a dark grip
    const sx = waistR * 1.3;
    rig.limb(hips, V(sx, 0.0, 0.03), V(sx * 1.05, -0.78, -0.3), 0.032, 0.022, 0x6a6e78, 5);
    rig.box(hips, BRASS, 0.09, 0.03, 0.09, sx, 0.02, 0.04);
    rig.limb(hips, V(sx, 0.02, 0.04), V(sx * 0.98, 0.14, 0.09), 0.02, 0.018, 0x3a2a20, 4);
    rig.box(hips, BRASS, 0.045, 0.045, 0.045, sx * 0.98, 0.15, 0.1);

    // the field-glasses case on the right hip, its strap over the left shoulder and across the chest
    rig.box(hips, LEATHER, 0.1, 0.12, 0.06, -waistR * 1.1, -0.1, waistR * 0.6, [0, 0.4, 0]);
    const mid = V(-shHalf * 0.02, tl * 0.5, chestR * 1.05);
    rig.limb(torso, V(shHalf * 0.6, tl * 0.9, shHalf * 0.46), mid, 0.016, 0.016, LEATHER, 4, false, 0.5);
    rig.limb(torso, mid, V(-waistR * 0.95, tl * 0.02, waistR * 0.95), 0.016, 0.016, LEATHER, 4, false, 0.5);

    // the props that appear with a pose
    const glasses = rig.node(head, 0, 0, 0);
    for (const s of [-1, 1]) rig.limb(glasses, V(s * 0.06, -R * 0.02, R * 0.85), V(s * 0.075, -R * 0.02, R * 1.5), 0.028, 0.038, 0x2e2e34, 5);
    rig.box(glasses, 0x2e2e34, 0.06, 0.03, 0.08, 0, -R * 0.02, R * 1.15);
    const watch = rig.node(f.hands[0], 0, 0, 0);
    rig.ball(watch, ball(6, 3), BRASS, 0.045, 0, -R * 0.5, R * 0.05, [1, 0.3, 1]);
    const food = rig.node(f.hands[1], 0, 0, 0);
    rig.box(food, 0xd9b67a, 0.09, 0.09, 0.025, 0, -R * 0.5, R * 0.05, [1.2, 0, 0]);

    basePose(P(f.base));

    // show each prop when the arms take its pose, blending in and out; lift the hat when the right hand reaches it
    const sm = window.Motion.smooth;
    const show = (nd, k) => nd.scale.setScalar(Math.max(1e-3, k));
    f.pose = (p) => {
      basePose(p);
      const both = Math.min(p.e0, p.e1);
      show(glasses, sm((both - 1.9) / 0.4));
      show(watch, sm((p.e0 - 1.0) / 0.3) * (1 - sm((p.e0 - 2.0) / 0.3)));
      show(food, sm((p.e1 - 1.5) / 0.3) * (1 - sm((p.e1 - 2.2) / 0.3)) * sm((p.lf1 - 1.0) / 0.3));
      const lift = sm((p.e1 - 0.5) / 0.3) * sm((p.af1 - 1.85) / 0.3) * (1 - sm((p.e0 - 1.2) / 0.4));
      hat.position.set(-0.05 * lift, 0.14 * lift, 0.02 * lift);
      hat.rotation.set(0.1 * lift, 0, -0.35 * lift);
      // sitting: the coat's skirts spread forward over the lap instead of into the ground
      const sit = sm((Math.min(p.lf0, p.lf1) - 1.0) / 0.4);
      if (sit > 0) f.skirt.rotation.x += -1.05 * sit;
    };
    // (the props stay at full scale until the bake: a prop scaled before it would bake in as hidden)
    return f;
  },
  poses: {
    glasses: { af0: 1.25, af1: 1.25, e0: 2.55, e1: 2.55, ao0: -0.2, ao1: -0.2, at0: 0.25, at1: 0.25, hx: -0.06 },
    watch: { af0: 0.7, e0: 1.7, ao0: -0.3, at0: 0.6, af1: 0.1, e1: 0.3, hx: 0.3, hy: 0.1 },
    sit: { lf0: 1.5, k0: 0, lf1: 1.75, k1: 0.6, lo0: 0.12, lo1: 0.12, af0: 0.75, e0: 0.55, ao0: 0.1, af1: 0.9, e1: 1.9, ao1: -0.15, at1: 0.3, hx: 0.18, lean: 0.08 },
    point: { af1: 1.5, e1: 0.05, ao1: 0.1, af0: 0.1, e0: 0.3, hy: -0.3, hx: -0.04, lean: -0.03, twist: -0.1 },
    hatRaise: { af1: 2.3, e1: 0.95, ao1: 0.35, af0: 0.08, e0: 0.3, hx: -0.08, hz: 0.1 },
  },
};
