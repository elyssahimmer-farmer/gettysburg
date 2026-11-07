// blocky.js: the blocky low-poly figures (the family's pick, characters/styles.html), for the scenes.
// Chunky faceted shapes in the spirit of Tunic and A Short Hike: a faceted ball head with two dot eyes and no mouth,
// hair and beards in one or two blocks, a six-sided robe with a mantle and sash, mitten hands with a thumb.
// Needs window.FigureKit (figures.js) and window.Motion (motion.js). Everything is on window.Blocky.
//
//   const kit = FigureKit.makeKit(ctx, { outward: true });   // ctx needs THREE, root, surfaceY
//   const rig = kit.makeRig();
//   const f = Blocky.make(kit, rig, { preset: 'man', col: { mantle: 0x2f4f8a } });   // as many as you like, all at the
//   Blocky.finish(rig, ctx.root);                                                   // origin, then ONE bake and draw call
//
//   spec: preset 'man' | 'woman' | 'child' | 'priest' | 'levite' | 'angel' | 'savior' | 'fisherman' | 'prince'
//     (each fills in the rest), and any of: height (m), heads (head heights tall), hip (hip height / height), shoulder,
//     waist, hem (robe flare), skirt (1 to the ankle, 0.5 to the knee), hair 'blocks' | 'veil' | 'short' | 'none',
//     beard 'block' | 'long' | 'none', hat 'headcloth' | 'turban' | 'band' | 'none', mantle (false for none),
//     staff 'crook' | 'stick' | 'reed' | 'none', bare (bare feet), col { skin hair beard robe top sleeve mantle belt
//     sandal staff hat eye band pants }.
//   f: root (move and turn it; scale it to 0 to hide), pose(p), base (its still pose), eyes (scale.y to blink), H, hipY,
//     stride, hands[2] / arms / elbows / legs / knees / head / torso (0 left, 1 right; add props with rig.node(f.hands[1])
//     before the bake), staff (the node the staff hangs on, or null), gait(ph, amt, base) (the loose walk, used by
//     FigureKit.Script.walk), set(state) (applies a Script state: x z y yaw pose lift hide), lookAt(...) none.
//   Blocky.walkPose(f, ph, amt, base) → the loose walk: free arms, the staff hand keeping its grip, the head nodding with
//     each step and tilting with the weight.
//   Colours are picked in sRGB and turned linear when baked, so the page should render with sRGB output.
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  // warm, pastel, no black
  const COL = { skin: 0xf2c9a8, robe: 0xf8f3e8, mantle: 0xc85a4e, hair: 0x7a5236, beard: 0x6e4a30, eye: 0x2b1d16,
    staff: 0x9a7048, sandal: 0xa07850, hat: 0xe9dfc8, band: 0x8a6a48, belt: null };

  const BASE = { height: 1.76, heads: 2.9, hip: 0.3, shoulder: 1.08, waist: 0.72, hem: 1.5, seg: 0.55, skirt: 1,
    eyes: { r: 0.08, x: 0.36, y: -0.02 }, hair: 'blocks', beard: 'block', hat: 'none', mantle: true, staff: 'none' };
  const PRESETS = {
    man: {},
    woman: { height: 1.64, beard: 'none', hair: 'veil', shoulder: 1.0, waist: 0.7, hem: 1.55, col: { robe: 0xe8d6b8, mantle: 0x3f5f9a } },
    child: { height: 1.12, heads: 2.5, hip: 0.3, beard: 'none', hair: 'blocks', mantle: false, hem: 1.4, col: { robe: 0xd9b25a } },
    // linen, no wool (Ezekiel 44:17-18): white from turban to hem, a linen sash
    priest: { beard: 'block', hat: 'turban', mantle: false, col: { robe: 0xf6f3ea, top: 0xf6f3ea, sleeve: 0xf0ece2, hat: 0xfbf8f0, belt: 0xe4dccb } },
    levite: { hat: 'headcloth', col: { robe: 0xcfae7a, mantle: 0x6e7f3e, hat: 0xe8dcc0, belt: 0x8a5a36 } },
    // the angels Joseph Smith described: a loose robe of exquisite whiteness, head, hands and feet bare
    angel: { height: 1.9, heads: 3.0, beard: 'none', hair: 'short', mantle: false, bare: true, hem: 1.45,
      col: { robe: 0xffffff, top: 0xffffff, sleeve: 0xfdfcf8, hair: 0xc89a5a, skin: 0xf6dcc2 } },
    // the Good Shepherd, as in the Church's paintings: white robe, red mantle over one shoulder, a crook
    savior: { height: 1.8, staff: 'crook', col: { hair: 0x6a4630, beard: 0x5e3e2a } },
    fisherman: { skirt: 0.55, hat: 'headcloth', mantle: false, hem: 1.25, col: { robe: 0xb89a74, pants: null, hat: 0xd8ccb0, belt: 0x6a4a30 } },
    prince: { mantle: true, hat: 'band', col: { robe: 0xefe2c4, mantle: 0xa8322a, band: 0xd4a83a, belt: 0xd4a83a } },
  };

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // a tube along a spine of points, `sides` facets round (the wizard hat in styles.html)
  function sweep(spine, radii, sides, phase) {
    const pos = [], X = V(1, 0, 0), t = V(0, 0, 0), u = V(0, 0, 0), w = V(0, 0, 0), rings = [];
    for (let i = 0; i < spine.length; i++) {
      t.subVectors(spine[Math.min(i + 1, spine.length - 1)], spine[Math.max(i - 1, 0)]).normalize();
      u.copy(X); w.crossVectors(t, u).normalize(); u.crossVectors(w, t).normalize();
      const ring = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * TAU + (phase || 0);
        ring.push(spine[i].clone().addScaledVector(u, Math.cos(a) * radii[i]).addScaledVector(w, Math.sin(a) * radii[i]));
      }
      rings.push(ring);
    }
    const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][(k + 1) % sides], d = rings[i + 1][k];
      tri(a, b, c); tri(a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  function make(kit, rig, spec) {
    spec = spec || {};
    const pre = PRESETS[spec.preset || 'man'] || {};
    const S = Object.assign({}, BASE, pre, spec, { col: Object.assign({}, pre.col || {}, spec.col || {}) });
    const C = Object.assign({}, COL, S.col);
    const start = rig.pieces.length;
    const ball = (w, h) => new THREE.SphereGeometry(1, Math.max(4, Math.round(w * S.seg)), Math.max(3, Math.round(h * S.seg)));
    const H = S.height, headH = H / S.heads, R = headH / 2;
    const hipY = H * S.hip, shY = H - headH * 0.92, tl = shY - hipY;
    const shHalf = S.shoulder * headH / 2, waistR = shHalf * S.waist, hemR = waistR * S.hem, chestR = shHalf * 0.92, armR = Math.max(0.035, shHalf * 0.24);
    const lseg = 6;
    const root = rig.node(null, 0, 0, 0), hips = rig.node(root, 0, hipY, 0), torso = rig.node(hips, 0, 0, 0);
    root.rotation.order = 'YXZ';
    const headCY = shY + R * 0.92, head = rig.node(torso, 0, headCY - hipY, 0.01), skirt = rig.node(hips, 0, 0, 0);
    const f = { legs: [], knees: [], arms: [], elbows: [], hands: [], spec: S, rig };

    // the robe from the waist down (to the knee for a short tunic), the torso to the shoulders
    const rAt = (prof, y) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, y0] = prof[i], [r1, y1] = prof[i + 1]; if (y <= y0 && y >= y1) return r0 + (r1 - r0) * (y0 - y) / Math.max(1e-6, y0 - y1); } return prof[prof.length - 1][0]; };
    const sk = S.skirt;
    const robeProf = sk < 1
      ? [[waistR * 0.98, 0.03], [waistR * 1.08, -0.06], [hemR, -hipY * sk], [0.0001, -hipY * sk + 0.005]]
      : [[waistR * 0.98, 0.03], [waistR * 1.08, -0.06], [(waistR + hemR) * 0.55, -hipY * 0.5], [hemR, -hipY + 0.03], [0.0001, -hipY + 0.025]];
    rig.lathe(skirt, robeProf, lseg, C.robe, { amp: 0 });
    rig.lathe(torso, [[R * 0.32, tl + 0.02], [shHalf * 0.62, tl * 0.99], [shHalf * 0.92, tl * 0.9], [chestR, tl * 0.55], [waistR, 0.0], [waistR * 0.95, -0.04]], lseg, C.top || C.robe);
    rig.ball(head, ball(14, 11), C.skin, R, 0, 0, 0, [1, 1.04, 0.96]);
    if (C.belt) rig.lathe(torso, [[waistR * 1.05, 0.06], [waistR * 1.07, 0.0], [waistR * 1.04, -0.03]], lseg, C.belt);

    // the mantle over the left shoulder and round the back, with a sash across the chest, always a little outside
    // the robe so it never pokes through
    const out = (r, y) => Math.max(r, rAt(robeProf, y) * 1.07 + 0.01);
    if (S.mantle) {
      const low = sk < 1 ? 0.35 : 0.6;
      rig.lathe(torso, [[shHalf * 0.68, tl * 1.03], [out(shHalf * 1.03, tl * 0.86), tl * 0.86], [out(chestR * 1.08, tl * 0.4), tl * 0.4], [out(waistR * 1.14, 0), 0],
        [out(waistR * 1.25, -hipY * low * 0.5), -hipY * low * 0.5], [out(waistR * 1.3, -hipY * low), -hipY * low]],
        lseg, C.mantle, { phi0: Math.PI * 0.35, phiLen: Math.PI * 1.25 });
      const mid = V(shHalf * 0.05, tl * 0.55, chestR * 1.04);
      rig.limb(torso, V(shHalf * 0.72, tl * 0.98, shHalf * 0.5), mid, shHalf * 0.2, shHalf * 0.21, C.mantle, 4, false, 0.4);
      rig.limb(torso, mid, V(-waistR * 0.9, tl * 0.08, waistR * 1.06), shHalf * 0.21, shHalf * 0.22, C.mantle, 4, false, 0.4);
    }

    // legs: under a long robe only the sandals show; under a short tunic, bare (or trousered) legs and sandals
    const footC = S.bare ? C.skin : C.sandal;
    for (const sx of [1, -1]) {
      const leg = rig.node(hips, sx * waistR * 0.45, 0, 0), knee = rig.node(leg, 0, -hipY * 0.5, 0);
      if (sk < 1) {
        const legR = waistR * 0.26;
        rig.limb(leg, V(0, 0, 0), V(0, -hipY * 0.5, 0), legR, legR * 0.9, C.pants || C.skin, 5);
        rig.limb(knee, V(0, 0, 0), V(0, -hipY * 0.5 + R * 0.12, 0), legR * 0.9, legR * 0.8, C.pants || C.skin, 5);
      }
      rig.ball(knee, ball(8, 6), footC, R * 0.22, 0, -hipY * 0.5 + R * 0.08, R * 0.22, [1, 0.55, 1.5]);
      f.legs.push(leg); f.knees.push(knee);
    }
    // arms: a shoulder dome, sleeves that widen a little, mitten hands with a thumb
    const ua = tl * 0.5, fa = tl * 0.45, hs = R * 0.55;
    for (const sx of [1, -1]) {
      const arm = rig.node(torso, sx * shHalf * 0.86, tl - armR * 1.1, 0), elbow = rig.node(arm, 0, -ua, 0), hand = rig.node(elbow, 0, -fa - hs * 0.15, 0);
      rig.ball(arm, ball(10, 8), C.top || C.robe, armR * 1.15, 0, 0, 0);
      rig.limb(arm, V(0, 0, 0), V(0, -ua, 0), armR, armR * 1.05, C.sleeve || C.robe, 5);
      rig.limb(elbow, V(0, 0, 0), V(0, -fa, 0), armR * 1.05, armR * 1.45, C.sleeve || C.robe, 5, true);
      rig.ball(hand, ball(9, 7), C.skin, hs, 0, -hs * 0.08, 0, [0.42, 0.55, 0.3]);
      rig.ball(hand, ball(6, 5), C.skin, hs * 0.18, sx * -hs * 0.2, hs * 0.05, hs * 0.12);
      f.arms.push(arm); f.elbows.push(elbow); f.hands.push(hand);
    }
    // a staff upright in the right hand
    let staff = null;
    if (S.staff !== 'none') {
      staff = rig.node(f.hands[1], 0, -0.02, 0.03);
      const k = H / 1.78;
      if (S.staff === 'crook') {
        rig.limb(staff, V(0, 0.75 * k, 0), V(0, -1.1 * k, 0), 0.022, 0.02, C.staff, 5);
        rig.piece(staff, new THREE.TorusGeometry(0.11, 0.022, 4, 6, Math.PI * 1.2), C.staff, -0.11, 0.75 * k, 0);
      } else if (S.staff === 'reed') {
        // a measuring reed (Ezekiel 40:3): long and straight, with marks along it
        rig.limb(staff, V(0, 1.7 * k, 0), V(0, -1.1 * k, 0), 0.016, 0.018, 0xc8b070, 5);
        for (let i = 0; i < 5; i++) rig.limb(staff, V(0, -0.6 + i * 0.5, 0), V(0, -0.56 + i * 0.5, 0), 0.021, 0.021, 0x8a6a40, 5);
      } else {
        // a walking stick
        rig.limb(staff, V(0, 0.12 * k, 0), V(0, -0.98 * k, 0), 0.018, 0.016, C.staff, 5);
      }
    }

    f.eyes = face(rig, head, S, R, ball, C);
    f.range = [start, rig.pieces.length];
    f.H = H; f.hipY = hipY; f.chinY = shY; f.shadowR = Math.max(0.22, hemR * 1.4);
    f.root = root; f.hips = hips; f.torso = torso; f.head = head; f.skirt = skirt; f.staff = staff;
    f.headTop = () => head.localToWorld(new THREE.Vector3(0, R * 1.5, 0));
    f.stride = hipY * 1.55;

    // the same pose keys as the kit's figures: the lower foot stays on the ground, the robe sways with the legs, and
    // the staff stays upright whatever the arm does
    const th = hipY * 0.5, sh = hipY * 0.5;
    f.pose = (p) => {
      const legH = (a, k) => th * Math.cos(a) + sh * Math.cos(a - k);
      hips.position.y = Math.max(legH(p.lf0, p.k0), legH(p.lf1, p.k1)) + p.y;
      torso.rotation.set(p.lean, p.twist, p.roll);
      head.rotation.set(p.hx, p.hy, p.hz);
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? 1 : -1;
        f.legs[i].rotation.set(-p['lf' + i], 0, sx * (p['lo' + i] - 0.04));
        f.knees[i].rotation.x = p['k' + i];
        f.arms[i].rotation.set(-p['af' + i], -sx * p['at' + i], sx * p['ao' + i]);
        f.elbows[i].rotation.x = -p['e' + i];
      }
      const sway = sk < 1 ? 0.4 : 1;
      skirt.rotation.set(-0.25 * sway * (p.lf0 + p.lf1) / 2, 0, 0.07 * sway * (p.lf0 - p.lf1));
      if (staff) staff.rotation.set(p.af1 + p.e1 - p.lean, 0, p.ao1);
    };
    // the still pose: the right hand forward (on the staff if there is one), the left a little open, the head bowed a touch
    f.base = staff ? { af0: 0.08, ao0: 0.14, e0: 0.3, af1: 0.42, ao1: 0.05, e1: 0.95, hx: 0.06 } : { af0: 0.08, ao0: 0.14, e0: 0.3, af1: 0.08, ao1: 0.14, e1: 0.3, hx: 0.04 };
    f.gait = (ph, amt, base) => walkPose(f, ph, amt, base);
    f.follow = window.Motion.lag({ hx: 0.26, hy: 0.4, hz: 0.3 });
    f.seed = rig.figures.length * 2.3 + 0.7;
    // a Script state: where it stands (y defaults to the floor there), which way it faces, its pose, a lift off the
    // ground, and hide
    f.floor = null;
    f.set = (s) => {
      if (s.hide) { root.scale.setScalar(1e-4); return; }
      root.scale.setScalar(1);
      const y = s.y !== undefined && s.y !== null ? s.y : f.floor ? f.floor(s.x, s.z) : 0;
      root.position.set(s.x, y + (s.lift || 0), s.z);
      root.rotation.set(s.pitch || 0, s.yaw, 0);
      f.pose(f.follow(s.pose || window.FigureKit.P(f.base)));
    };
    f.pose(window.FigureKit.P(f.base));
    rig.figures.push(f);
    return f;
  }

  // ---------- faces, hair, hats and beards ----------
  function face(rig, head, S, R, ball, C) {
    const onFace = (x, y, inset) => R * Math.sqrt(Math.max(0, 0.96 * 0.96 - x * x - y * y)) - R * (inset || 0);
    const E = S.eyes;
    // the eyes on a pivot of their own, so they can blink
    const eyes = rig.node(head, 0, 0, 0);
    for (const s of [-1, 1]) rig.ball(eyes, ball(6, 4), C.eye, R * E.r, s * E.x * R, E.y * R, onFace(E.x, E.y, 0.02));

    const hair = C.hair, hair2 = new THREE.Color(hair).multiplyScalar(0.93).getHex();
    // a turban or headcloth sits over a short crop
    const hairStyle = (S.hat === 'turban' || S.hat === 'headcloth') && S.hair === 'blocks' ? 'short' : S.hair;
    if (hairStyle === 'blocks') {
      // a full head of hair: a cap that comes down low round the sides and back, full side locks, and a mass behind
      rig.ball(head, ball(6, 4), hair, R * 1.2, 0, R * 0.39, -R * 0.12, [1.1, 0.8, 1.12], [-0.25, Math.PI / 6, 0]);
      for (const s of [-1, 1]) rig.ball(head, ball(5, 3), hair2, R * 0.47, s * R * 0.8, -R * 0.3, -R * 0.16, [0.82, 1.6, 1.12]);
      rig.ball(head, ball(6, 4), hair2, R, 0, -R * 0.12, -R * 0.56, [1.02, 1.02, 0.62], [0, Math.PI / 6, 0]);
    } else if (hairStyle === 'short') {
      // a short cap of hair, the ears and neck clear
      rig.ball(head, ball(6, 4), hair, R * 1.1, 0, R * 0.32, -R * 0.1, [1.0, 0.72, 1.04], [-0.25, Math.PI / 6, 0]);
      rig.ball(head, ball(5, 3), hair2, R * 0.9, 0, 0, -R * 0.4, [1.02, 0.9, 0.62]);
    } else if (hairStyle === 'veil') {
      // a mantle drawn over the head, open at the face, falling to the shoulders
      // (a lathe's phi 0 and a sphere's phi pi/2 both face front)
      rig.piece(head, new THREE.SphereGeometry(1, 6, 2, 0, TAU, 0, 1.15), C.mantle, 0, R * 0.06, -R * 0.02, { s: [R * 1.2, R * 1.22, R * 1.18] });
      rig.piece(head, new THREE.SphereGeometry(1, 6, 3, Math.PI * 0.78, Math.PI * 1.44, 1.15, 1.05), C.mantle, 0, R * 0.06, -R * 0.02, { s: [R * 1.2, R * 1.22, R * 1.18] });
      rig.lathe(head, [[R * 1.05, -R * 0.4], [R * 1.25, -R * 0.95], [R * 1.5, -R * 1.45]], 6, C.mantle, { phi0: Math.PI * 0.3, phiLen: Math.PI * 1.4 });
    }
    if (S.hat === 'turban') {
      // a linen turban: wrapped bands stepping in toward the top
      rig.lathe(head, [[0.0001, R * 1.3], [R * 0.45, R * 1.28], [R * 0.96, R * 1.14], [R * 1.2, R * 0.86], [R * 1.24, R * 0.5], [R * 1.16, R * 0.2]], 6, C.hat, { phi0: Math.PI / 6 });
      rig.lathe(head, [[R * 1.26, R * 0.5], [R * 1.27, R * 0.34]], 6, new THREE.Color(C.hat).multiplyScalar(0.88).getHex(), { phi0: Math.PI / 6 });
    } else if (S.hat === 'headcloth') {
      // a cloth over the crown, tied with a band, falling behind to the shoulders
      rig.lathe(head, [[0.0001, R * 1.28], [R * 0.86, R * 1.16], [R * 1.18, R * 0.66], [R * 1.2, R * 0.34]], 6, C.hat, { phi0: Math.PI / 6 });
      rig.lathe(head, [[R * 1.22, R * 0.5], [R * 1.23, R * 0.34]], 6, C.band, { phi0: Math.PI / 6 });
      rig.lathe(head, [[R * 1.18, R * 0.38], [R * 1.3, -R * 0.5], [R * 1.4, -R * 1.2]], 5, C.hat, { phi0: Math.PI * 0.32, phiLen: Math.PI * 1.36 });
    } else if (S.hat === 'band') {
      // a headband round the brow (a gold one for the prince)
      rig.lathe(head, [[R * 1.13, R * 0.42], [R * 1.14, R * 0.26]], 6, C.band, { phi0: Math.PI / 6 });
    }
    if (S.beard === 'block') rig.ball(head, ball(5, 3), C.beard, R * 0.62, 0, -R * 0.68, R * 0.4, [1.0, 0.75, 0.8]);
    else if (S.beard === 'long') {
      rig.ball(head, ball(5, 3), C.beard, R * 0.66, 0, -R * 0.64, R * 0.4, [1.08, 0.78, 0.82]);
      rig.limb(head, V(0, -R * 0.62, R * 0.55), V(0, -R * 1.45, R * 1.0), R * 0.55, R * 0.12, C.beard, 6, false, 0.62);
    }
    return eyes;
  }

  // ---------- the walk ----------
  // As in the blocky moving test the family liked: arms swinging freely with the elbows loosening as they come
  // forward, a hand on a staff keeping its grip, and a loose head that nods with each step and tilts with the weight.
  function walkPose(f, ph, amt, base) {
    const M = window.Motion, P = window.FigureKit.P;
    const b = Object.assign({}, f.base, base || {});
    const p = P(b), g = M.gait(ph, amt, M.legSwing(f.stride, f.hipY), 0.56);
    for (const k in g) p[k] += g[k];
    if (f.staff && !(base && base.noStaff)) {
      p.af1 = b.af1 + 0.6 * g.af1; p.e1 = b.e1 + 0.12 * Math.sin(ph);
    } else p.e1 += 0.25 * amt * Math.max(0, Math.sin(ph + Math.PI - 0.35));
    p.e0 += 0.25 * amt * Math.max(0, Math.sin(ph - 0.35));
    p.ao0 += 0.05 * amt; p.ao1 += 0.03 * amt;
    p.hx += 0.07 * amt * Math.sin(ph * 2 + 0.6);
    p.hz += 0.06 * amt * Math.sin(ph);
    p.hy += 0.05 * amt * Math.sin(ph * 0.5 + f.seed);
    p.wk = amt;
    return p;
  }

  // ---------- baking: one skinned mesh for every figure on the rig, with the shade baked into its colours ----------
  // darker toward the hem and under the chin, as the style study showed; sRGB to linear so the palette shows as picked
  function finish(rig, parent, opt) {
    const ao = (opt && opt.ao) || 0.28;
    const mesh = rig.bake(parent);
    const offs = [0];
    for (const pc of rig.pieces) offs.push(offs[offs.length - 1] + pc.arr.length / 3);
    const col = mesh.geometry.attributes.color, pos = mesh.geometry.attributes.position, c = new THREE.Color();
    const done = new Uint8Array(pos.count);
    for (const f of rig.figures) {
      if (!f.range) continue;
      const H = f.H, chinY = f.chinY;
      for (let i = offs[f.range[0]]; i < offs[f.range[1]]; i++) {
        const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).convertSRGBToLinear();
        let k = (1 - ao) + ao * Math.min(1, Math.max(0, y / (H * 0.3)));
        if (Math.abs(y - chinY) < H * 0.035 && Math.hypot(x, z) < H * 0.12) k *= 0.82;
        c.multiplyScalar(k);
        col.setXYZ(i, c.r, c.g, c.b);
        done[i] = 1;
      }
    }
    // anything else on the rig (props, animals) is turned linear too
    for (let i = 0; i < pos.count; i++) if (!done[i]) { c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).convertSRGBToLinear(); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
    return mesh;
  }

  window.Blocky = { make, finish, walkPose, sweep, PRESETS, COL };
})();
