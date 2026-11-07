// A mounted general: Gen. Henry Hunt, Union chief of artillery, riding the gun line (research.md §2), and, recoloured,
// a Confederate officer riding along the forming lines ("horsemen gallop up and down", Haskell). Frock coat to the
// knee, a general's sash, a hat with a gold cord, a short beard, tall riding boots. Uniform details are ours
// (DESIGN.md §12): the sources read don't describe them.
//
//   CHARACTERS.officer.build(ctx, B, kit, rig)                  the Union general (dark blue, buff sash)
//   CHARACTERS.officer.build(ctx, B, kit, rig, { side: 'csa' })  the Confederate officer (gray, red sash)
//   On the sheet, &side=csa previews the Confederate one.
//
// Riding: the `ride` pose (and hatRaise / point, which ride too) keeps the feet at the figure's origin, so the hips
// sit CHARACTERS.officer.ride.hipAboveOrigin (0.34 m) above it. To seat him on a horse whose saddle top is at
// saddleTop, put root.position.y = saddleTop - 0.34 + 0.02 (the coat's thickness). This file assumes a saddle top
// 1.35 m above the ground (root.y about 1.03); the integrator aligns to the real horse.
// The hat lifts on its own when the right arm reaches up past the head (af1 > 1.85 with a bent elbow: hatRaise).
window.CHARACTERS = window.CHARACTERS || {};
(function () {
  const H = 1.78, hipY = H * 0.3, th = hipY * 0.5, sh = hipY * 0.5;
  const RIDE_LF = 1.3, RIDE_K = 1.3;
  const hipAboveOrigin = th * Math.cos(RIDE_LF) + sh * Math.cos(RIDE_LF - RIDE_K);
  // seated astride: thighs forward and apart, knees bent, shins hanging, hands forward and low on the reins
  const ride = { lf0: RIDE_LF, lf1: RIDE_LF, k0: RIDE_K, k1: RIDE_K, lo0: 0.38, lo1: 0.38, af0: 0.75, af1: 0.75, e0: 0.35, e1: 0.35,
    ao0: -0.1, ao1: -0.1, lean: 0.04, hx: 0.02 };

  CHARACTERS.officer = {
    name: 'Mounted general (Hunt)',
    note: 'frock coat, sash, hat with gold cord, riding boots; &side=csa for the Confederate officer',
    ride: { hipAboveOrigin, saddleTop: 1.35, rootY: 1.35 - hipAboveOrigin + 0.02 },
    build(ctx, B, kit, rig, opt) {
      const THREE = ctx.THREE, V = (x, y, z) => new THREE.Vector3(x, y, z);
      const side = (opt && opt.side) || new URLSearchParams(location.search).get('side') || 'union';
      const csa = side === 'csa';
      const COAT = csa ? 0x8f9299 : 0x3c4f86, PANTS = csa ? 0x6f7890 : 0x2f3d6a, SASH = csa ? 0xb8382e : 0xd9c27a;
      const HAT = csa ? 0x5a4c3e : 0x35353c, CORD = 0xd4a83a, BRASS = 0xd4a83a, BOOT = 0x2b2824;
      const heads = 2.9, headH = H / heads, R = headH / 2, shY = H - headH * 0.92, tl = shY - hipY;
      const shHalf = 1.08 * headH / 2, waistR = shHalf * 0.72, chestR = shHalf * 0.92, armR = Math.max(0.035, shHalf * 0.24);
      const f = B.make(kit, rig, {
        preset: 'man', height: H, skirt: 0.6, hem: 1.3, mantle: false, hair: 'short', beard: 'block', hat: 'none',
        col: { robe: COAT, top: COAT, sleeve: COAT, pants: PANTS, sandal: BOOT, belt: 0x3b2a1c, hair: csa ? 0x6a4a30 : 0x4a3a30, beard: csa ? 0x6a4a30 : 0x4a3a30, skin: 0xf2c9a8 },
      });
      const head = f.head, torso = f.torso, hips = f.hips;
      // the kit captures its pieces with every pivot at rest but leaves them in the base pose: put them back to rest
      // while adding pieces on the head, then restore
      const basePose = f.pose, P = window.FigureKit.P;
      [torso, head, f.skirt].concat(f.arms, f.elbows, f.legs, f.knees).forEach((n) => n.rotation.set(0, 0, 0));

      // the hat on its own pivot so it can lift: the Union general's stiffer, taller crown with a gold cord; the
      // Confederate's a soft slouch hat with a drooping brim
      const hat = rig.node(head, 0, 0, 0);
      if (csa) {
        rig.lathe(hat, [[0.0001, R * 1.48], [R * 0.66, R * 1.44], [R * 1.0, R * 1.12], [R * 1.1, R * 0.62], [R * 1.5, R * 0.46], [R * 1.78, R * 0.22]], 6, HAT, { phi0: Math.PI / 6, r: [0.12, 0, 0] });
      } else {
        rig.lathe(hat, [[0.0001, R * 1.62], [R * 0.8, R * 1.6], [R * 1.0, R * 1.3], [R * 1.08, R * 0.62], [R * 1.5, R * 0.52], [R * 1.62, R * 0.4]], 6, HAT, { phi0: Math.PI / 6, r: [0.08, 0, 0] });
      }
      rig.lathe(hat, [[R * 1.12, R * 0.78], [R * 1.14, R * 0.66]], 6, CORD, { phi0: Math.PI / 6, r: [csa ? 0.12 : 0.08, 0, 0] });

      // shoulder straps, a double row of buttons, the sash round the waist with its tails at the left hip
      for (const sx of [1, -1]) rig.box(torso, BRASS, 0.1, 0.014, 0.05, sx * shHalf * 0.86, tl - armR * 1.1 + armR * 1.15, 0);
      for (let i = 0; i < 3; i++) for (const sx of [1, -1]) {
        const y = tl * (0.78 - i * 0.25), r = chestR + (waistR - chestR) * Math.max(0, (tl * 0.55 - y) / (tl * 0.55));
        rig.box(torso, BRASS, 0.03, 0.03, 0.02, sx * 0.045, y, r * 0.99);
      }
      rig.lathe(torso, [[waistR * 1.1, 0.11], [waistR * 1.13, 0.01], [waistR * 1.1, -0.06]], 6, SASH);
      const tx = waistR * 1.12;
      rig.limb(hips, V(tx, -0.02, waistR * 0.45), V(tx * 1.15, -0.3, waistR * 0.5), 0.035, 0.022, SASH, 4, false, 0.6);
      rig.limb(hips, V(tx * 1.02, -0.02, waistR * 0.3), V(tx * 1.2, -0.25, waistR * 0.3), 0.03, 0.02, SASH, 4, false, 0.6);
      // the belt over the sash, with its plate
      rig.box(torso, BRASS, 0.07, 0.05, 0.02, 0, 0.015, waistR * 1.13 + 0.005);

      // tall riding boots to the knee
      const legR = waistR * 0.26;
      for (const k of f.knees) rig.limb(k, V(0, -0.02, 0), V(0, -hipY * 0.5 + R * 0.12 - 0.01, 0), legR * 1.12, legR * 1.02, BOOT, 5);

      // the sword at the left hip: a chunky scabbard slanting back, a brass guard and a dark grip
      const sx = waistR * 1.3;
      rig.limb(hips, V(sx, 0.0, 0.03), V(sx * 1.05, -0.78, -0.3), 0.032, 0.022, 0x6a6e78, 5);
      rig.box(hips, BRASS, 0.09, 0.03, 0.09, sx, 0.02, 0.04);
      rig.limb(hips, V(sx, 0.02, 0.04), V(sx * 0.98, 0.14, 0.09), 0.02, 0.018, 0x3a2a20, 4);
      rig.box(hips, BRASS, 0.045, 0.045, 0.045, sx * 0.98, 0.15, 0.1);

      basePose(P(f.base));

      // lift the hat when the right arm reaches up past the head
      const sm = window.Motion.smooth;
      f.pose = (p) => {
        basePose(p);
        const lift = sm((p.e1 - 0.5) / 0.3) * sm((p.af1 - 1.85) / 0.3) * (1 - sm((p.e0 - 1.2) / 0.4));
        hat.position.set(-0.05 * lift, 0.14 * lift, 0.02 * lift);
        hat.rotation.set(0.1 * lift, 0, -0.35 * lift);
        // seated: the coat's skirts spread forward over the thighs instead of hanging through the horse
        const seat = sm((Math.min(p.lf0, p.lf1) - 0.9) / 0.4);
        if (seat > 0) f.skirt.rotation.x += -0.9 * seat;
      };
      // (no posing here: the bake stores the pivots as they are)
      return f;
    },
    poses: {
      ride,
      hatRaise: Object.assign({}, ride, { af1: 2.3, e1: 0.95, ao1: 0.35, hx: -0.06, hz: 0.1 }),
      point: Object.assign({}, ride, { af1: 1.55, e1: 0.05, ao1: 0.15, hy: -0.3, hx: -0.02, twist: -0.1 }),
    },
  };
})();
