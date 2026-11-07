// artillery.js: the guns of Gettysburg (DESIGN.md 7, research.md 4). Twelve Confederate guns on Seminary Ridge and
// eight Union guns on Cemetery Ridge, each with a limber behind it; the Gatling gun that wasn't there, parked behind
// the Union line; the muzzle flashes, the recoil, and the smoke that builds into Haskell's "sulphury arch" over the
// valley. Everything that fires does so on the timeline only (BRIEF.md cycle); taps never fire anything.
//
// Shared with the people builder: window.GUNS = { shots: [{ t, side, i }], lastShotBefore(side, i, ct),
// nextShotAfter(side, i, ct), muzzle(side, i) } so the crews can ram and step back in time with the shots.
//
// Draws: 3 gun types (instanced, one vertex-coloured material), limbers (instanced), the Gatling's static parts (in
// ctx.world), its barrel cluster and crank (dynamic), the flashes (instanced) and the smoke pool (instanced). 9.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);

  // the gun types: bronze Napoleons (stubby, a swell at the muzzle), iron Parrotts (a thick band at the breech),
  // iron ordnance rifles (slim and tapering). muzzleZ is where the muzzle sits in the gun's frame (forward is +z).
  const TYPES = ['nap', 'parrott', 'ord'];
  const CSA_TYPES = ['nap', 'parrott', 'nap', 'ord', 'nap', 'nap', 'parrott', 'ord', 'nap', 'parrott', 'nap', 'ord'];
  const UNION_TYPES = ['parrott', 'nap', 'nap', 'nap', 'nap', 'ord', 'nap', 'parrott'];
  const NAPOLEON_TAG = 4;        // the Union Napoleon with the 'napoleon' label (next to the Copse)
  const TRUNNION_Y = 1.02, ELEV = 0.07;

  // smoke
  const POOL = 180;
  const RECOIL = 0.4, RECOIL_T = 1.2, FLASH_T = 0.15;

  // --- state kept between init and update ---
  let ctx;
  const guns = [];           // { side, i, type, x, y, z, yaw, fwd: [fx, fz], times: [], slot }
  const byType = {};         // type -> InstancedMesh
  let limberMesh, flashMesh, smokeMesh, smokeAlpha, gatCluster, gatCrank;
  let shots = [], puffs = [];
  let prevCt = null, crankTapAt = -1e9;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), E = new THREE.Euler();
  const COL = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------- geometry helpers: pieces with vertex colours, merged into one geometry ----------
  function xf(x, y, z, rx, ry, rz, sx, sy, sz) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz));
  }
  // shade: darker toward the ground (baked), from k0 at y=0 to 1 at y=top
  const groundShade = (top) => (y) => 0.7 + 0.3 * clamp01(y / top);
  function piece(list, geo, hex, m, shadeFn, tint) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), c = ctx.lin(hex);
    for (let i = 0; i < n; i++) {
      const k = (shadeFn ? shadeFn(pos.getY(i)) : 1) * (tint || 1);
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    list.push(g);
    return g;
  }
  function merge(list) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count * 3;
    const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n);
    let off = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, off); nor.set(g.attributes.normal.array, off); col.set(g.attributes.color.array, off);
      off += g.attributes.position.count * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }
  // a box without its +y/-y caps (8 triangles): spokes and the like, whose ends are hidden anyway
  function openBox(w, h, d) {
    const b = new THREE.BoxGeometry(w, h, d).toNonIndexed(), p = b.attributes.position.array;
    const keep = new Float32Array(24 * 3);
    keep.set(p.subarray(0, 36), 0); keep.set(p.subarray(72, 108), 36);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(keep, 3));
    return g;
  }
  // a cylinder along +z (CylinderGeometry stands along y)
  const tubeZ = (rFront, rBack, len, segs, open) => new THREE.CylinderGeometry(rFront, rBack, len, segs || 6, 1, !!open).rotateX(Math.PI / 2);

  // a wheel in the y-z plane, its axle along x: an 8-sided rim and `spokes` crossing spokes
  function wheel(list, R, tube, spokes, x, y, z, scale) {
    const sc = scale || 1;
    const rim = new THREE.TorusGeometry(R, tube, 3, 8).rotateY(Math.PI / 2);
    piece(list, rim, 0x4a4238, xf(x, y, z, 0, 0, 0, sc), null, 1);           // the iron tyre and felloes, dark
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI + 0.2;
      piece(list, openBox(0.07, 2 * R - 0.06, 0.06), ctx.C.carriage, xf(x, y, z, a, 0, 0, sc), null, 1.05);
    }
  }

  // the carriage (without the barrel) in the gun's frame: +z toward the enemy, wheels on z = 0
  function carriage(list) {
    const sh = groundShade(1.2);
    piece(list, new THREE.BoxGeometry(1.7, 0.16, 0.16), 0x4a4238, xf(0, 0.70, 0), null, 1);                  // axle (iron)
    piece(list, new THREE.BoxGeometry(0.12, 0.44, 1.0), ctx.C.carriage, xf(0.21, 0.90, 0.12), sh);         // cheeks
    piece(list, new THREE.BoxGeometry(0.12, 0.44, 1.0), ctx.C.carriage, xf(-0.21, 0.90, 0.12), sh);
    piece(list, new THREE.BoxGeometry(0.26, 0.2, 2.2), ctx.C.carriage, xf(0, 0.44, -1.2, -0.29, 0, 0), sh);  // the trail, resting behind
    wheel(list, 0.66, 0.08, 3, 0.9, 0.74, 0);
    wheel(list, 0.66, 0.08, 3, -0.9, 0.74, 0);
  }
  function barrel(list, type) {
    const Y = TRUNNION_Y, lift = (z) => Y + Math.sin(ELEV) * z;       // elevated a few degrees about the trunnions
    const tilt = -ELEV, bright = (y) => 1.0 + 0.12 * clamp01((y - 0.95) / 0.25);
    if (type === 'nap') {
      piece(list, tubeZ(0.105, 0.16, 1.5), ctx.C.bronze, xf(0, lift(0.3), 0.3, tilt), bright);
      piece(list, tubeZ(0.125, 0.14, 0.2, 6), ctx.C.bronze, xf(0, lift(1.12), 1.12, tilt), bright);         // the muzzle swell
      piece(list, new THREE.BoxGeometry(0.14, 0.14, 0.16), ctx.C.bronze, xf(0, lift(-0.5), -0.5, tilt), bright); // the cascabel
      piece(list, new THREE.BoxGeometry(0.56, 0.12, 0.12), ctx.C.bronze, xf(0, Y, 0, tilt), null, 0.9);      // trunnions
    } else if (type === 'parrott') {
      piece(list, tubeZ(0.08, 0.12, 1.8), 0x3a3c40, xf(0, lift(0.35), 0.35, tilt));
      piece(list, tubeZ(0.165, 0.165, 0.5, 6), 0x34363a, xf(0, lift(-0.3), -0.3, tilt));                      // the reinforcing band
      piece(list, new THREE.BoxGeometry(0.12, 0.12, 0.14), 0x3a3c40, xf(0, lift(-0.6), -0.6, tilt));
      piece(list, new THREE.BoxGeometry(0.56, 0.12, 0.12), 0x3a3c40, xf(0, Y, 0, tilt), null, 0.9);
    } else {
      piece(list, tubeZ(0.07, 0.115, 1.8), 0x3e4046, xf(0, lift(0.35), 0.35, tilt));
      piece(list, new THREE.BoxGeometry(0.11, 0.11, 0.12), 0x3e4046, xf(0, lift(-0.58), -0.58, tilt));
      piece(list, new THREE.BoxGeometry(0.56, 0.12, 0.12), 0x3e4046, xf(0, Y, 0, tilt), null, 0.9);
    }
  }
  const MUZZLE_Z = { nap: 1.22, parrott: 1.25, ord: 1.25 };

  // the limber: a two-wheeled ammunition chest, its pole on the ground behind (away from the gun)
  function limber(list) {
    const sh = groundShade(1.4);
    piece(list, new THREE.BoxGeometry(1.6, 0.14, 0.14), 0x4a4238, xf(0, 0.70, 0));
    piece(list, new THREE.BoxGeometry(1.0, 0.5, 0.62), ctx.C.carriage, xf(0, 1.05, 0), sh);                 // the chest
    piece(list, new THREE.BoxGeometry(1.06, 0.07, 0.68), 0x4a4238, xf(0, 1.33, 0));                          // its lid
    piece(list, new THREE.BoxGeometry(0.11, 0.11, 2.4), ctx.C.carriage, xf(0, 0.42, -1.3, -0.245, 0, 0), sh); // the pole
    wheel(list, 0.66, 0.08, 2, 0.8, 0.74, 0);
    wheel(list, 0.66, 0.08, 2, -0.8, 0.74, 0);
  }

  // ---------- the shot schedule: seeded, the same every loop (BRIEF.md cycle) ----------
  function schedule() {
    const rnd = ctx.mulberry32(18630703);
    const out = [];
    out.push({ t: 30, side: 'csa', i: 5 });                                   // the signal gun
    const csaOrder = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7], unOrder = [0, 4, 2, 6, 1, 5, 3, 7];
    function run(side, order, from, to, gapMin, gapMax, minOwn) {
      const lastAt = new Array(order.length).fill(-99);
      let t = from, k = 0;
      while (t < to) {
        let i = order[k % order.length], tries = 0;
        k++;
        while (t - lastAt[i] < minOwn && tries < order.length) { i = order[k % order.length]; k++; tries++; }
        out.push({ t, side, i }); lastAt[i] = t;
        t += gapMin + rnd() * (gapMax - gapMin);
      }
      return lastAt;
    }
    const csaLast = run('csa', csaOrder, 32, 77.3, 0.42, 0.78, 2.4);          // about one every 0.6 s
    let last = 0; for (let i = 0; i < 12; i++) if (78 - csaLast[i] > 78 - csaLast[last]) last = i;
    out.push({ t: 78, side: 'csa', i: last });                                 // the last shot, at 78 exactly
    run('union', unOrder, 34, 70, 0.85, 1.35, 3.0);                           // replies about every 1.1 s until 70
    run('union', unOrder, 100, 124.01, 1.2, 1.8, 3.0);                        // canister, 100 to 124
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // ---------- the smoke: puffs born at each shot, and a bank over the valley ----------
  // kind: quick (the dense puff from the muzzle), long (what drifts and gathers), bank (the haze over the valley)
  function makePuffs() {
    const rnd = ctx.mulberry32(777), list = [];
    for (const s of shots) {
      const g = gunOf(s.side, s.i), mz = MUZZLE_Z[g.type];
      const mx = g.x + g.fwd[0] * mz, my = g.y + TRUNNION_Y + 0.1, mzz = g.z + g.fwd[1] * mz;
      const canister = s.t >= 100;
      list.push({ kind: 'quick', t0: s.t, life: canister ? 4.5 : 5, x: mx, y: my, z: mzz, fx: g.fwd[0], fz: g.fwd[1], seed: rnd(), sz: canister ? 1.15 : 1 });
      if (!canister) {
        list.push({ kind: 'long', t0: s.t + 0.3, life: 20 + rnd() * 6, x: mx + g.fwd[0] * 1.5 + (rnd() - 0.5) * 1.2, y: my, z: mzz + g.fwd[1] * 1.5 + (rnd() - 0.5) * 2.5,
          fx: g.fwd[0], fz: g.fwd[1], seed: rnd(), sz: 0.85 + rnd() * 0.4, cannonade: true });
      }
    }
    // the bank: born across the valley through the cannonade, big and faint, rising to the arch
    for (let t = 36; t < 76; t += 1.5) {
      const u = rnd(), x = -28 + 60 * u * u, z = -26 + rnd() * 48;   // more of it near the Confederate line
      list.push({ kind: 'bank', t0: t, life: 16 + rnd() * 8, x: Math.min(36, x + 6 * rnd()), y: ctx.groundY(x, z) + 1.5, z, fx: 0, fz: 0, seed: rnd(), sz: 0.6 + rnd() * 0.8, al: 0.6 + rnd() * 0.8, cannonade: true });
    }
    list.sort((a, b) => a.t0 - b.t0);
    return list;
  }
  function gunOf(side, i) { return guns[side === 'csa' ? i : 12 + i]; }

  // ---------- init ----------
  function init(c) {
    ctx = c;
    const C = ctx.C;
    const vcMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0, vertexColors: true });

    // the guns, by spot
    ctx.spots.CSA_GUNS.forEach((s, i) => guns.push({ side: 'csa', i, type: CSA_TYPES[i], x: s.x, y: s.y, z: s.z, yaw: s.face, fwd: [Math.sin(s.face), Math.cos(s.face)], times: [] }));
    ctx.spots.UNION_GUNS.forEach((s, i) => guns.push({ side: 'union', i, type: UNION_TYPES[i], x: s.x, y: s.y, z: s.z, yaw: s.face, fwd: [Math.sin(s.face), Math.cos(s.face)], times: [] }));

    // one instanced mesh per type: carriage + wheels + barrel, vertex-coloured
    for (const type of TYPES) {
      const list = [];
      carriage(list); barrel(list, type);
      const geo = merge(list);
      const of = guns.filter((g) => g.type === type);
      const im = new THREE.InstancedMesh(geo, vcMat, of.length);
      im.frustumCulled = false;
      of.forEach((g, k) => { g.slot = k; });
      byType[type] = im;
      ctx.root.add(im);
    }
    // the limbers, 5 m behind each gun
    {
      const list = []; limber(list);
      limberMesh = new THREE.InstancedMesh(merge(list), vcMat, guns.length);
      limberMesh.frustumCulled = false;
      guns.forEach((g, k) => {
        const lx = g.x - g.fwd[0] * 5, lz = g.z - g.fwd[1] * 5, ly = ctx.groundY(lx, lz);
        limberMesh.setMatrixAt(k, M.compose(Pv.set(lx, ly, lz), Q.setFromEuler(E.set(0, g.yaw, 0)), S.set(1, 1, 1)));
        g.limber = [lx, ly, lz];
      });
      limberMesh.instanceMatrix.needsUpdate = true;
      ctx.root.add(limberMesh);
      // a lantern hung on a limber chest at each end of each line, for the night ("devoted to repairs", Hunt)
      for (const k of [1, 10, 12 + 1, 12 + 6]) { const L = guns[k].limber; ctx.addLantern(ctx.v(L[0], L[1] + 1.55, L[2])); }
    }
    placeGuns(0);

    // the shots and the smoke
    shots = schedule();
    for (const s of shots) gunOf(s.side, s.i).times.push(s.t);
    puffs = makePuffs();
    window.GUNS = {
      shots,
      // the last shot of that gun at or before cycle time ct, or null
      lastShotBefore(side, i, ct) { const T = gunOf(side, i).times; let r = null; for (const t of T) { if (t <= ct) r = t; else break; } return r === null ? null : { t: r, side, i }; },
      nextShotAfter(side, i, ct) { const T = gunOf(side, i).times; for (const t of T) if (t > ct) return { t, side, i }; return null; },
      // where the muzzle is at rest (world), and the gun's forward direction
      muzzle(side, i) { const g = gunOf(side, i), mz = MUZZLE_Z[g.type]; return { x: g.x + g.fwd[0] * mz, y: g.y + TRUNNION_Y + 0.1, z: g.z + g.fwd[1] * mz, fx: g.fwd[0], fz: g.fwd[1] }; },
      recoil: (side, i, ct) => recoilAt(gunOf(side, i), ct),
    };

    // the flashes: one per gun, an elongated additive spike at the muzzle
    {
      const fm = new THREE.MeshBasicMaterial({ color: ctx.lin(0xff9a3c).multiplyScalar(1.15), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      // a star: two octahedra, one turned 45 degrees about the barrel's axis
      const a = new THREE.OctahedronGeometry(1, 0), b = new THREE.OctahedronGeometry(0.8, 0).rotateZ(Math.PI / 4);
      const fp = new Float32Array(a.attributes.position.array.length + b.attributes.position.array.length);
      fp.set(a.attributes.position.array, 0); fp.set(b.attributes.position.array, a.attributes.position.array.length);
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
      flashMesh = new THREE.InstancedMesh(fg, fm, guns.length);
      flashMesh.frustumCulled = false;
      for (let k = 0; k < guns.length; k++) flashMesh.setMatrixAt(k, ZERO);
      flashMesh.instanceMatrix.needsUpdate = true;
      ctx.root.add(flashMesh);
    }
    // the smoke pool: faceted blobs, per-instance alpha through a small shader patch, sky haze from the base
    {
      const geo = ctx.jitterGeo(new THREE.IcosahedronGeometry(1, 0), 0.28, 5);
      smokeAlpha = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
      smokeAlpha.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAlpha', smokeAlpha);
      const sm = new THREE.MeshStandardMaterial({ color: ctx.lin(C.smoke), emissive: ctx.lin(C.smoke).multiplyScalar(0.3), flatShading: true, roughness: 1, metalness: 0, transparent: true, depthWrite: false });
      sm.userData.extraKey = 'smokeAlpha';
      sm.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
        sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
      };
      ctx.addSkyFog(sm);
      smokeMesh = new THREE.InstancedMesh(geo, sm, POOL);
      smokeMesh.frustumCulled = false;
      smokeMesh.renderOrder = 2;
      for (let k = 0; k < POOL; k++) { smokeMesh.setMatrixAt(k, ZERO); smokeMesh.setColorAt(k, COL.set(1, 1, 1)); }
      smokeMesh.count = 0;
      ctx.root.add(smokeMesh);
    }

    // the Gatling gun, parked behind the Union line and facing west; it never fires
    {
      const g = ctx.spots.GATLING, yaw = -Math.PI / 2, s = 0.82;
      const grp = new THREE.Group();
      grp.position.set(g.x, g.y, g.z); grp.rotation.y = yaw;
      // static parts: a light carriage, smaller wheels, the breech housing
      const st = [];
      piece(st, new THREE.BoxGeometry(1.3, 0.12, 0.12), 0x4a4238, xf(0, 0.56, 0));
      piece(st, new THREE.BoxGeometry(0.4, 0.3, 0.46), C.carriage, xf(0, 0.73, 0.02), groundShade(1));
      piece(st, new THREE.BoxGeometry(0.18, 0.14, 1.7), C.carriage, xf(0, 0.36, -0.95, -0.26, 0, 0), groundShade(1));
      piece(st, new THREE.CylinderGeometry(0.17, 0.17, 0.5, 8).rotateX(Math.PI / 2), 0x3a3c40, xf(0, 0.98, -0.3));   // the breech housing
      piece(st, new THREE.BoxGeometry(0.22, 0.16, 0.22), 0x4a4238, xf(0, 1.2, -0.3));                                  // the feed block on top
      wheel(st, 0.66, 0.08, 3, 0.74, 0.6, 0, s);
      wheel(st, 0.66, 0.08, 3, -0.74, 0.6, 0, s);
      const stMesh = new THREE.Mesh(merge(st), vcMat);
      stMesh.position.copy(grp.position); stMesh.rotation.y = yaw;
      ctx.world.add(stMesh);
      // the barrel cluster: six barrels in a ring round a central shaft, turning with the crank
      const cl = [];
      piece(cl, new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6).rotateX(Math.PI / 2), 0x3a3c40, xf(0, 0, 0.45));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        piece(cl, new THREE.CylinderGeometry(0.032, 0.036, 0.95, 6).rotateX(Math.PI / 2), 0x3e4046, xf(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.42), null, 0.9 + 0.2 * (Math.sin(a) > 0 ? 1 : 0));
      }
      gatCluster = new THREE.Mesh(merge(cl), vcMat);
      gatCluster.position.set(0, 0.98, 0);
      grp.add(gatCluster);
      // the hand crank on the right side, turning about the x axis
      const cr = [];
      piece(cr, new THREE.BoxGeometry(0.3, 0.06, 0.06), 0x3a3c40, xf(0.3, 0, 0));
      piece(cr, new THREE.BoxGeometry(0.05, 0.26, 0.05), 0x3a3c40, xf(0.44, -0.12, 0));
      piece(cr, new THREE.BoxGeometry(0.14, 0.05, 0.05), 0x7a5236, xf(0.5, -0.25, 0));
      gatCrank = new THREE.Mesh(merge(cr), vcMat);
      gatCrank.position.set(0, 0.98, -0.3);
      grp.add(gatCrank);
      ctx.root.add(grp);
      const tagPos = ctx.v(g.x, g.y + 1.0, g.z);
      ctx.tag('gatling', () => tagPos, { r: 1.6 });   // just its label: a crank turning would look like firing
    }

    // the gun lines' labels: the middle of each line, and the Napoleon
    {
      const cg = guns.filter((g) => g.side === 'csa'), ug = guns.filter((g) => g.side === 'union');
      const mid = (a, b) => ctx.v((a.x + b.x) / 2, (a.y + b.y) / 2 + 1.0, (a.z + b.z) / 2);
      const pc = mid(cg[5], cg[6]), pu = mid(ug[3], ug[4]);
      ctx.tag('csaGuns', () => pc, { r: 3.5 });
      ctx.tag('unionGuns', () => pu, { r: 3.5 });
      const nap = ug[NAPOLEON_TAG], pn = ctx.v(nap.x, nap.y + 1.1, nap.z);
      ctx.tag('napoleon', () => pn, { r: 1.6 });
    }
  }

  // ---------- the guns each frame: recoil ----------
  function recoilAt(g, ct) {
    let last = null;
    for (const t of g.times) { if (t <= ct) last = t; else break; }
    if (last === null) return 0;
    const age = ct - last;
    if (age >= RECOIL_T) return 0;
    return RECOIL * Math.min(1, age / 0.07) * (1 - easeOut((age - 0.07) / (RECOIL_T - 0.07)));
  }
  function placeGuns(ct) {
    for (const g of guns) {
      const r = recoilAt(g, ct);
      Pv.set(g.x - g.fwd[0] * r, g.y, g.z - g.fwd[1] * r);
      byType[g.type].setMatrixAt(g.slot, M.compose(Pv, Q.setFromEuler(E.set(0, g.yaw, 0)), S.set(1, 1, 1)));
    }
    for (const type of TYPES) byType[type].instanceMatrix.needsUpdate = true;
  }
  function placeFlashes(ct) {
    guns.forEach((g, k) => {
      let last = null;
      for (const t of g.times) { if (t <= ct) last = t; else break; }
      const age = last === null ? 9 : ct - last;
      if (age >= FLASH_T) { flashMesh.setMatrixAt(k, ZERO); return; }
      const u = age / FLASH_T, kk = Math.sin(Math.PI * u) * (0.75 + 0.25 * Math.sin(ct * 91 + k)), r = recoilAt(g, ct), mz = MUZZLE_Z[g.type] + 0.55 * kk;
      Pv.set(g.x + g.fwd[0] * (mz - r), g.y + TRUNNION_Y + 0.1, g.z + g.fwd[1] * (mz - r));
      flashMesh.setMatrixAt(k, M.compose(Pv, Q.setFromEuler(E.set(0, g.yaw, ct * 7)), S.set(0.75 * kk, 0.75 * kk, 1.4 * kk)));
    });
    flashMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- the smoke each frame: a pure function of cycle time ----------
  function placeSmoke(ct) {
    const wx = ctx.wind.dir.x, wz = ctx.wind.dir.z;
    // the cannonade's smoke thins and clears from 80 to 92
    const clear = 1 - smooth((ct - 80) / 12);
    let n = 0;
    for (const p of puffs) {
      if (n >= POOL) break;
      const age = ct - p.t0;
      if (age < 0 || age >= p.life) continue;
      const u = age / p.life, ph = p.seed * TAU;
      let sx, sy, a, x, y, z, speed;
      if (p.kind === 'quick') {
        const grow = 1 - Math.pow(1 - u, 2);
        sx = p.sz * (0.45 + 2.1 * grow); sy = sx * 0.85;
        a = 0.72 * Math.min(1, age / 0.12) * Math.pow(1 - u, 1.4);
        const f = 1.9 * (1 - Math.exp(-3.5 * u));              // out of the muzzle, then it slows
        speed = 0.45;
        x = p.x + p.fx * f + wx * speed * age; z = p.z + p.fz * f + wz * speed * age; y = p.y + 0.3 + 1.2 * u;
        COL.setRGB(1, 0.98, 0.94);
      } else if (p.kind === 'long') {
        const grow = Math.sqrt(u);
        sx = p.sz * (1.2 + 4.0 * grow); sy = sx * 0.6;
        a = 0.3 * smooth(age / 1.2) * (1 - smooth((u - 0.4) / 0.6)) * clear;
        speed = 0.72;
        x = p.x + wx * speed * age + Math.sin(ph + age * 0.3) * 0.6; z = p.z + wz * speed * age + Math.cos(ph + age * 0.25) * 0.8;
        y = p.y + 0.4 + 3.6 * grow + 0.3 * Math.sin(ph + age * 0.4);
        COL.setRGB(0.93, 0.91, 0.88);
      } else {
        const grow = smooth(u * 1.3);
        sx = p.sz * (3.0 + 4.0 * grow); sy = sx * 0.45;
        a = 0.13 * p.al * smooth(age / 3) * (1 - smooth((u - 0.5) / 0.5)) * clear;
        speed = 0.5;
        x = p.x + wx * speed * age; z = p.z + wz * speed * age; y = p.y + 1.5 + 3.5 * grow;
        COL.setRGB(0.95, 0.91, 0.8);
      }
      if (a <= 0.003) continue;
      smokeAlpha.setX(n, a);
      smokeMesh.setColorAt(n, COL);
      smokeMesh.setMatrixAt(n, M.compose(Pv.set(x, Math.min(y, p.y + 7.5), z), Q.setFromEuler(E.set(0, ph + age * 0.15, 0)), S.set(sx, sy, sx)));
      n++;
    }
    smokeMesh.count = n;
    smokeMesh.instanceMatrix.needsUpdate = true;
    smokeAlpha.needsUpdate = true;
    if (smokeMesh.instanceColor) smokeMesh.instanceColor.needsUpdate = true;
  }

  // ---------- booms: at the moment of each flash, on the timeline only ----------
  function booms(ct) {
    if (prevCt === null) { prevCt = ct; return; }
    const prev = prevCt; prevCt = ct;
    for (const s of shots) {
      const fired = prev <= ct ? (s.t > prev && s.t <= ct) : (s.t > prev || s.t <= ct);
      if (!fired) continue;
      const age = s.t <= ct ? ct - s.t : ct + 180 - s.t;
      if (age > 0.3) continue;                                  // a jump in time (a tapped chapter) fires no barrage
      const g = gunOf(s.side, s.i);
      ctx.boom(g.x + g.fwd[0] * 1.2, g.y + 1.1, g.z + g.fwd[1] * 1.2, 1);
    }
  }

  function update(t, dt, c) {
    const ct = ctx.cycle.t;
    placeGuns(ct);
    placeFlashes(ct);
    placeSmoke(ct);
    booms(ct);
    // the Gatling stays still: its tap only shows the label (a turning crank would look like firing). crankTapAt is
    // never set, so this keeps the crank and barrels at rest
    const u = (t - crankTapAt) / 3.2;
    const turn = u >= 0 && u < 1 ? TAU * (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2) : 0;
    gatCrank.rotation.x = turn;
    gatCluster.rotation.z = turn / 6;
  }

  window.Scene.register({ name: 'artillery', init, update });
})();
