// land.js: the woods on Seminary Ridge, the Copse of Trees, Culp's Hill and the Round Tops, the boulders men hide
// behind, an orchard by the farm, hedgerows behind the Union line, wheat, a flock of birds and the campfire smoke.
// Every position comes from the base's FIELD block and spots. Trees are instanced (one vertex-coloured geometry per
// kind: trunk and crowns in one draw), rocks and logs are merged into the static world, birds and smoke are a pure
// function of time. Budget: 18 draws, 18k triangles.
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  // what the people builder needs: the 4 hiding spots behind boulders and the breastwork line (filled in init)
  const REPORT = { hiding: [], breastwork: [], fires: [] };
  window.__land = REPORT;

  // the copse birds' tap moment
  const burst = { t0: -100 };

  // things the update touches
  const S = {};

  window.Scene.register({
    name: 'land',
    init(ctx) {
      const { THREE, FIELD: F, C, lin, groundY, v } = ctx;
      const rnd = ctx.mulberry32(8864);
      const rr = (a, b) => a + (b - a) * rnd();
      const clamp01 = (x) => Math.min(1, Math.max(0, x));
      const smooth = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
      const hash = ctx.hash;
      const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

      // ---------- colours (sRGB from the palette, made linear) ----------
      const TRUNK = lin(0x6e4b32), TRUNK_D = lin(0x4a3220);
      const LEAF_A = lin(C.woods), LEAF_A_D = lin(C.woodsDark);
      const LEAF_B = lin(0x628c3e), LEAF_B_D = lin(0x44682e);
      const LEAF_C = lin(0x3a6030), LEAF_C_D = lin(0x2c4a24);          // the Copse: darker
      const LEAF_O = lin(0x82a64c), LEAF_O_D = lin(0x5e8238);          // orchard: fresher
      const FRUIT = lin(0xe8a85a), FRUIT_D = lin(0xc9783c);
      const ROCK = lin(C.rock), ROCK_D = lin(0x5e574e), ROCK_L = lin(0xaaa294);   // the shade is deeper than the palette's, so stone reads as stone in the bright sun
      const LOG = lin(0x7a5638), LOG_D = lin(0x553a24), LOG_END = lin(0xb79a6c);
      const WHEAT = lin(0xd9b85c), WHEAT_D = lin(0x8f7c36);
      const BIRD = lin(0x5a5048);

      // ---------- a little bakery: parts with one flat colour per face, merged into one coloured buffer ----------
      const tmpC = new THREE.Color(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), nn = new THREE.Vector3();
      const P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), SC = new THREE.Vector3(), M = new THREE.Matrix4();
      const mk = (x, y, z, sx, sy, sz, ry, rx, rz) => new THREE.Matrix4().compose(P.set(x, y, z), Q.setFromEuler(E.set(rx || 0, ry || 0, rz || 0)), SC.set(sx, sy, sz));
      // parts: [{ geo, m, col(y, ny, i, x, z) -> Color, perVertex }]
      function bake(parts) {
        const pos = [], col = [];
        for (const p of parts) {
          const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
          g.applyMatrix4(p.m);
          const a = g.attributes.position;
          for (let i = 0; i < a.count; i += 3) {
            pa.fromBufferAttribute(a, i); pb.fromBufferAttribute(a, i + 1); pc.fromBufferAttribute(a, i + 2);
            nn.subVectors(pb, pa).cross(pc.clone().sub(pa)).normalize();
            const cy = (pa.y + pb.y + pc.y) / 3, cx = (pa.x + pb.x + pc.x) / 3, cz = (pa.z + pb.z + pc.z) / 3;
            for (let k = 0; k < 3; k++) {
              const q = k === 0 ? pa : k === 1 ? pb : pc;
              const c = p.perVertex ? p.col(q.y, nn.y, i, q.x, q.z) : p.col(cy, nn.y, i, cx, cz);
              pos.push(q.x, q.y, q.z); col.push(c.r, c.g, c.b);
            }
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        return geo;
      }
      // a flat quad a-b-c-d (two triangles, wound a,b,c / a,c,d)
      function quad(a, b, c, d) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
        return g;
      }

      // ---------- trees: one geometry per kind, origin at the foot of the trunk, metres ----------
      function trunkPart(h, r, seed) {
        return { geo: new THREE.CylinderGeometry(r * 0.75, r * 1.1, h + 0.7, 5, 1, true), m: mk(0, h / 2 - 0.35, 0, 1, 1, 1, seed),
          col: (y) => tmpC.copy(TRUNK).lerp(TRUNK_D, 0.15 + 0.55 * clamp01((h - y) / h)) };
      }
      function crownPart(y, r, s, seed, detail, leaf, dark) {
        const geo = ctx.jitterGeo(new THREE.IcosahedronGeometry(r, detail || 0), r * 0.42, seed);
        return { geo, m: mk(0, y, 0, s[0], s[1], s[2], seed * 0.37),
          col: (cy, ny, i) => { const k = clamp01((cy - (y - r * s[1])) / (2 * r * s[1])); return tmpC.copy(dark).lerp(leaf, clamp01(0.15 + 0.6 * k + 0.3 * ny + (hash(i, seed, 1, 2) - 0.5) * 0.25)); } };
      }
      function fruitParts(y, r, s, n, seed) {
        const out = [];
        for (let j = 0; j < n; j++) {
          const a = hash(j, seed, 3, 4) * TAU, e = 0.1 + 0.8 * hash(j, seed, 5, 6);
          const dx = Math.cos(a) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(a) * Math.cos(e);
          out.push({ geo: new THREE.BoxGeometry(0.28, 0.28, 0.28), m: mk(dx * r * s[0] * 0.92, y + dy * r * s[1] * 0.92, dz * r * s[2] * 0.92, 1, 1, 1, a),
            col: (cy, ny) => tmpC.copy(FRUIT_D).lerp(FRUIT, 0.45 + 0.5 * ny) });
        }
        return out;
      }
      // kind 0: a tall woods tree with two crowns; kind 1: a rounder one; kind 2: the Copse (taller, darker, finer); kind 3: orchard
      const treeGeos = [
        bake([trunkPart(3.4, 0.26, 11), crownPart(4.7, 2.0, [1, 1.15, 1], 12, 0, LEAF_A, LEAF_A_D), crownPart(6.6, 1.35, [0.95, 0.9, 0.95], 13, 0, LEAF_A, LEAF_A_D)]),
        bake([trunkPart(2.0, 0.28, 21), crownPart(3.2, 2.3, [1.2, 0.8, 1.2], 22, 0, LEAF_B, LEAF_B_D)]),
        bake([trunkPart(3.0, 0.3, 31), crownPart(4.5, 2.1, [1, 1.15, 1], 32, 1, LEAF_C, LEAF_C_D), crownPart(6.5, 1.4, [0.95, 0.95, 0.95], 33, 1, LEAF_C, LEAF_C_D)]),
        // the orchard crowns stay small (1.2 m) and high (their underside about 2.9 m up, on tall trunks) so the lines'
        // heads and flags pass beneath and between the rows (armies.js lanes)
        bake([trunkPart(3.3, 0.2, 41), crownPart(4.0, 1.2, [1.1, 0.9, 1.1], 42, 0, LEAF_O, LEAF_O_D)].concat(fruitParts(4.0, 1.2, [1.1, 0.9, 1.1], 6, 43))),
      ];
      const treeMat = ctx.mat(null, { vertexColors: true });
      ctx.addWind(treeMat, 0.03);

      // ---------- where nothing may go: the road, the wall, the gun spots, the named places ----------
      function segDist(px, pz, ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
        const u = clamp01(((px - ax) * dx + (pz - az) * dz) / L);
        return Math.hypot(px - ax - dx * u, pz - az - dz * u);
      }
      function wallDist(x, z) { let d = Infinity; for (let i = 0; i < F.wall.length - 1; i++) d = Math.min(d, segDist(x, z, F.wall[i][0], F.wall[i][1], F.wall[i + 1][0], F.wall[i + 1][1])); return d; }
      const KEEP = [[F.gatling, 6], [F.haskell, 6], [F.unionCamp, 6], [F.unionFarmhouse, 6], [F.farm, 7], [F.vermont, 6]];
      const GUNS = ctx.spots.CSA_GUNS.concat(ctx.spots.UNION_GUNS);
      function clear(x, z, r) {
        if (Math.abs(x - F.roadX(z)) < 2.5 + r) return false;
        if (wallDist(x, z) < 1 + r) return false;
        for (const [p, kr] of KEEP) if (dist(x, z, p[0], p[1]) < kr) return false;
        for (const g of GUNS) if (dist(x, z, g.x, g.z) < 4 + r) return false;
        return true;
      }

      // ---------- tree placement ----------
      const trees = [];   // { x, z, s, ry, kind }
      function tryTree(x, z, kind, s, minD) {
        if (!clear(x, z, 0.5)) return false;
        for (const t of trees) if (dist(x, z, t.x, t.z) < minD) return false;
        trees.push({ x, z, s, ry: rr(0, TAU), kind });
        return true;
      }
      // the woods on Seminary Ridge: x from the woods' edge back to -70, thinner far back, a clearing for the camp
      {
        let n = 0, guard = 0;
        while (n < 168 && guard++ < 8000) {
          const x = rr(-70, -35.3), z = rr(-50, 50);
          if (dist(x, z, F.csaCamp[0], F.csaCamp[1]) < 9.5) continue;
          if (x < -56 && rnd() < 0.4) continue;
          if (tryTree(x, z, rnd() < 0.45 ? 0 : 1, rr(0.8, 1.25), 3.4)) n++;
        }
        // a ring of trees round the camp clearing, so the camp sits in the woods
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU + rr(-0.12, 0.12), r = rr(10.2, 11.6);
          const x = F.csaCamp[0] + Math.cos(a) * r, z = F.csaCamp[1] + Math.sin(a) * r;
          if (x < -35.3) tryTree(x, z, i % 2, rr(0.9, 1.2), 2.6);
        }
      }
      // wooded hills: Culp's Hill (its west face open for the breastwork), Big Round Top, a few on the east of Little Round Top
      function hillTrees(cx, cz, rMin, rMax, n, minD, sMin, sMax, skip) {
        let c = 0, g = 0;
        while (c < n && g++ < 4000) {
          const a = rr(0, TAU), r = rMin + (rMax - rMin) * Math.sqrt(rnd());
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (skip && skip(x, z, r, a)) continue;
          if (tryTree(x, z, rnd() < 0.5 ? 0 : 1, rr(sMin, sMax), minD)) c++;
        }
      }
      hillTrees(F.culpsHill[0], F.culpsHill[1], 3.6, 11.5, 30, 3.0, 0.8, 1.1, (x, z, r, a) => r > 5.5 && Math.cos(a) < -0.6);
      hillTrees(F.bigRoundTop[0], F.bigRoundTop[1], 3.2, 15, 40, 3.4, 0.75, 1.1);
      hillTrees(F.littleRoundTop[0], F.littleRoundTop[1], 5, 11, 3, 3, 0.8, 1.0, (x, z, r, a) => Math.cos(a) < 0.5);
      // hedgerows behind Cemetery Ridge, a few trees on Cemetery Hill, lone trees in the far fields
      function row(x0, z0, x1, z1, n, kind) {
        for (let i = 0; i < n; i++) {
          const k = n === 1 ? 0 : i / (n - 1);
          tryTree(x0 + (x1 - x0) * k + rr(-0.6, 0.6), z0 + (z1 - z0) * k + rr(-0.6, 0.6), kind, rr(0.7, 1.0), 2.4);
        }
      }
      row(41, 14.5, 59, 14.5, 6, 1);
      row(63, -2, 63, -27, 7, 0);
      row(44, -22, 51, -22, 3, 1);
      row(30, -45, 37, -41, 3, 0);
      for (const [x, z] of [[-18, 36], [5, 43], [-7, -44], [21, -40], [41, 26]]) tryTree(x, z, 0, rr(0.95, 1.2), 2);
      // the orchard by the farm: three rows north of the house, east of the road
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
        const x = 16.6 + i * 3 + rr(-0.12, 0.12), z = 0 - j * 3 + rr(-0.12, 0.12);
        if (clear(x, z, 0.5)) trees.push({ x, z, s: rr(0.9, 1.1), ry: rr(0, TAU), kind: 3 });
      }
      // the Copse of Trees: a tight clump just behind the wall, clear of the wall by more than 1 m and of the guns by 4 m
      const COPSE = [[32.6, -0.3], [31.3, -1.6], [31.0, 0.9], [32.3, 1.8], [33.8, 0.4], [33.9, -1.4], [32.6, -2.3], [31.6, -3.2]];
      for (const [x, z] of COPSE) trees.push({ x, z, s: rr(0.9, 1.05), ry: rr(0, TAU), kind: 2 });

      // one instanced mesh per kind
      const byKind = [[], [], [], []];
      for (const t of trees) byKind[t.kind].push(t);
      for (let k = 0; k < 4; k++) {
        const list = byKind[k];
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(treeGeos[k], treeMat, list.length);
        list.forEach((t, i) => {
          im.setMatrixAt(i, M.compose(P.set(t.x, groundY(t.x, t.z), t.z), Q.setFromEuler(E.set(0, t.ry, 0)), SC.set(t.s, t.s * (t.kind === 3 ? rr(0.95, 1.05) : rr(0.85, 1.2)), t.s)));
        });
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        ctx.root.add(im);
      }

      // ---------- rocks and logs (merged into the world in one draw) ----------
      const rockMat = ctx.mat(null, { vertexColors: true, roughness: 1 });
      const rocks = [];   // { x, z, r }
      function rock(x, z, r, seed, detail, sink) {
        const geo = ctx.jitterGeo(new THREE.IcosahedronGeometry(1, detail === undefined ? (r > 0.9 ? 1 : 0) : detail), 0.45, seed);
        const tint = hash(seed, 1, 2, 3);
        const g = bake([{ geo, m: mk(0, 0, 0, r * rr(0.9, 1.35), r * rr(0.65, 0.95), r * rr(0.85, 1.2), rr(0, TAU), rr(-0.2, 0.2), rr(-0.2, 0.2)),
          col: (cy, ny, i) => tmpC.copy(ROCK_D).lerp(tint > 0.8 ? ROCK_L : ROCK, clamp01(0.05 + 0.4 * ny + 0.2 * cy / r + (hash(i, seed, 7, 8) - 0.5) * 0.25)) }]);
        const mesh = new THREE.Mesh(g, rockMat);
        mesh.position.set(x, groundY(x, z) - (sink === undefined ? 0.3 : sink) * r, z);
        ctx.world.add(mesh);
        rocks.push({ x, z, r });
        return mesh;
      }
      // Little Round Top: big boulders on the bare west face, a few on the crown, small stones about
      {
        const [cx, cz] = F.littleRoundTop;
        let n = 0, guard = 0;
        while (n < 24 && guard++ < 3000) {
          const a = rr(TAU * 0.3, TAU * 0.7), r = 2.5 + 9.5 * Math.sqrt(rnd());
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, br = rr(0.8, 1.9);
          if (rocks.some((o) => dist(x, z, o.x, o.z) < o.r + br + 0.9)) continue;
          rock(x, z, br, 100 + n, 1);
          n++;
        }
        for (let i = 0; i < 5; i++) { const a = rr(0, TAU), r = rr(0.8, 3.5); rock(cx + Math.cos(a) * r, cz + Math.sin(a) * r, rr(0.9, 1.5), 140 + i, 1); }
        // the 4 hiding places: on the east (Union) side of big boulders on the west face, where a crouching man fits,
        // at least 1.2 m apart (tried east, then a little north or south of east)
        const big = rocks.filter((o) => o.r >= 1.1 && o.x > 39 && o.x < 50 && o.z > 27 && o.z < 45).sort((a, b) => b.r - a.r);
        for (const b of big) {
          if (REPORT.hiding.length >= 4) break;
          for (const da of [0, 0.5, -0.5, 0.9, -0.9]) {
            const hx = b.x + Math.cos(da) * (b.r * 1.2 + 0.6), hz = b.z + Math.sin(da) * (b.r * 1.2 + 0.6);
            if (rocks.some((o) => o !== b && dist(hx, hz, o.x, o.z) < o.r * 1.2 + 0.45)) continue;
            if (REPORT.hiding.some((h) => dist(hx, hz, h.x, h.z) < 1.6)) continue;
            REPORT.hiding.push({ x: +hx.toFixed(2), z: +hz.toFixed(2), y: +groundY(hx, hz).toFixed(2), face: -Math.PI / 2, behind: { x: +b.x.toFixed(2), z: +b.z.toFixed(2), r: +b.r.toFixed(2) } });
            break;
          }
        }
        // small stones about, clear of the hiding places
        for (let i = 0; i < 14; i++) {
          const a = rr(0, TAU), r = rr(3, 13), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (rocks.some((o) => dist(x, z, o.x, o.z) < o.r + 0.8) || REPORT.hiding.some((h) => dist(x, z, h.x, h.z) < 1.4)) continue;
          rock(x, z, rr(0.3, 0.55), 160 + i, 0, 0.45);
        }
      }
      // a few outcrops on Big Round Top's slopes and one at the swale
      for (let i = 0; i < 4; i++) { const a = rr(0, TAU), r = rr(6, 14); rock(F.bigRoundTop[0] + Math.cos(a) * r, F.bigRoundTop[1] + Math.sin(a) * r, rr(0.8, 1.4), 180 + i, 0); }
      // Culp's Hill: a short, low breastwork of logs and rock along its west face, with "a large rock, forming a corner"
      {
        const [cx, cz] = F.culpsHill, R = 8.5;
        const segs = 5, a0 = Math.PI * (150 / 180), a1 = Math.PI * (210 / 180);
        for (let i = 0; i < segs; i++) {
          const a = a0 + (a1 - a0) * (i + 0.5) / segs, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = groundY(x, z);
          const yaw = -(a + Math.PI / 2);   // the log lies along the arc
          for (let L = 0; L < 2; L++) {
            const len = 2.5 - L * 0.3, rad = 0.24 - L * 0.03;
            const geo = new THREE.CylinderGeometry(rad, rad * 1.1, len, 5, 1, false);
            const g = bake([{ geo, m: mk(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), col: (cy, ny, idx, px) => Math.abs(px) > len * 0.49 ? tmpC.copy(LOG_END) : tmpC.copy(LOG_D).lerp(LOG, clamp01(0.4 + 0.6 * ny)) }]);
            const m = new THREE.Mesh(g, rockMat);
            m.position.set(x - Math.cos(a) * L * 0.12, y + 0.2 + L * 0.42, z - Math.sin(a) * L * 0.12);
            m.rotation.y = yaw;
            ctx.world.add(m);
          }
          if (i === 0 || i === segs - 1 || i === 2) REPORT.breastwork.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2) });
          // rocks at the joints
          const ja = a0 + (a1 - a0) * i / segs;
          rock(cx + Math.cos(ja) * (R + 0.2), cz + Math.sin(ja) * (R + 0.2), rr(0.4, 0.6), 200 + i, 0, 0.4);
        }
        rock(cx + Math.cos(a1) * (R + 0.4), cz + Math.sin(a1) * (R + 0.4), 1.35, 230, 1, 0.3);   // the large corner rock, at the south end
      }

      // ---------- wheat: low tufts in the wheat-coloured patches, instanced ----------
      {
        const fieldTone = (x, z) => {   // the base's field patches (index.html fieldTone), copied so the tufts land on the wheat
          if (x < F.semX + 4 || x > F.cemX - 3) return 0;
          const a = Math.sin(x * 0.09 + 0.7) * Math.sin(z * 0.08 + 2.1) + 0.4 * Math.sin(x * 0.05 - z * 0.04);
          return a > 0.45 ? 1 : a > 0.05 ? 0.5 : 0;
        };
        const g = bake([
          { geo: quad([-0.45, 0, 0], [0.45, 0, 0], [0.28, 3, 0], [-0.28, 3, 0]), m: mk(0, 0, 0, 1, 1, 1), perVertex: true, col: (y) => tmpC.copy(WHEAT_D).lerp(WHEAT, clamp01(y / 3)) },
          { geo: quad([0, 0, -0.45], [0, 0, 0.45], [0, 3, 0.28], [0, 3, -0.28]), m: mk(0, 0, 0, 1, 1, 1), perVertex: true, col: (y) => tmpC.copy(WHEAT_D).lerp(WHEAT, clamp01(y / 3)) },
        ]);
        const wm = ctx.mat(null, { vertexColors: true, side: THREE.DoubleSide });
        ctx.addWind(wm, 0.1);
        const spotsW = [];
        for (let x = -31; x <= 31 && spotsW.length < 260; x += 2.8) for (let z = -52; z <= 52; z += 2.8) {
          const px = x + rr(-1.1, 1.1), pz = z + rr(-1.1, 1.1);
          if (fieldTone(px, pz) !== 1 || !clear(px, pz, 0.8)) continue;
          if (trees.some((t) => dist(px, pz, t.x, t.z) < 1.5)) continue;
          spotsW.push([px, pz]);
        }
        const im = new THREE.InstancedMesh(g, wm, spotsW.length);
        spotsW.forEach(([x, z], i) => { const s = rr(0.22, 0.3); im.setMatrixAt(i, M.compose(P.set(x, groundY(x, z) - 0.05, z), Q.setFromEuler(E.set(0, rr(0, TAU), 0)), SC.set(s * 1.7, s, s * 1.7))); });
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        ctx.root.add(im);
      }

      // ---------- birds: a flock circling high, and six that burst from the Copse when it's tapped ----------
      {
        const g = bake([
          // a chunky body and two slab wings (thin planes vanish edge-on), swept back a little, tilted up for the flap
          { geo: new THREE.BoxGeometry(0.46, 0.12, 0.16), m: mk(0, 0, 0, 1, 1, 1), col: () => tmpC.copy(BIRD) },
          { geo: new THREE.BoxGeometry(0.3, 0.05, 0.8), m: mk(-0.04, 0.12, -0.46, 1, 1, 1, 0.12, -0.3, 0), col: () => tmpC.copy(BIRD) },
          { geo: new THREE.BoxGeometry(0.3, 0.05, 0.8), m: mk(-0.04, 0.12, 0.46, 1, 1, 1, -0.12, 0.3, 0), col: () => tmpC.copy(BIRD) },
        ]);
        const bm = ctx.mat(null, { vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
        S.FLOCK = 8; S.COPSE_BIRDS = 6;
        S.birds = new THREE.InstancedMesh(g, bm, S.FLOCK + S.COPSE_BIRDS);
        S.birds.frustumCulled = false;
        ctx.root.add(S.birds);
        S.flockC = v(8, 0, -4);
        S.flockY = Math.max(groundY(8, -4), groundY(32, 0)) + 15;
        S.copseTop = v(32.6, groundY(32.6, -0.3) + 7.5, -0.3);
      }

      // ---------- campfire smoke: three fires per camp, puffs rising and thinning; the fires glow at night ----------
      {
        const g = ctx.jitterGeo(new THREE.IcosahedronGeometry(1, 0), 0.5, 77);
        S.smokeMat = ctx.mat(C.smoke, { transparent: true, opacity: 0.42, depthWrite: false });
        S.PUFFS = 6;
        S.fires = [];
        for (const camp of [F.csaCamp, F.unionCamp]) for (const [ox, oz] of [[0, 0], [4, 3], [-3, 4]]) {
          const x = camp[0] + ox, z = camp[1] + oz, y = groundY(x, z);
          S.fires.push({ x, y, z });
          REPORT.fires.push({ x, y: +y.toFixed(2), z });
          ctx.addLantern(v(x, y + 0.35, z));
        }
        S.smoke = new THREE.InstancedMesh(g, S.smokeMat, S.fires.length * S.PUFFS);
        S.smoke.frustumCulled = false;
        S.smoke.renderOrder = 3;
        ctx.root.add(S.smoke);
        S.warm = lin(0xff9a4a);
      }

      // ---------- tags ----------
      const copsePos = v(32.6, groundY(32.6, -0.3) + 3, -0.3);
      ctx.tag('copse', () => copsePos, { r: 4.5, onTap: (now) => { burst.t0 = now; } });
      const top = (p, lift) => v(p[0], groundY(p[0], p[1]) + lift, p[1]);
      const lrt = top(F.littleRoundTop, 1.2), brt = top(F.bigRoundTop, 4), culps = top(F.culpsHill, 3);
      ctx.tag('roundTop', () => lrt, { r: 7 });
      ctx.tag('bigRoundTop', () => brt, { r: 9 });
      ctx.tag('culps', () => culps, { r: 8 });
      // the fields between the ridges: the swale (the base's spot) and a wheat patch north of the middle
      const swale = v(F.swaleX, groundY(F.swaleX, 0) + 0.8, 0), fields = v(2, groundY(2, -16) + 0.8, -16);
      ctx.tag('swale', () => swale, { r: 6 });
      ctx.tag('fields', () => fields, { r: 8 });
      // the steered camera stays out of the Copse's crowns
      ctx.addCamFloor((x, z) => (dist(x, z, 32.6, -0.3) < 4 ? groundY(x, z) + 9 : null));

      REPORT.trees = trees.length;
      REPORT.rocks = rocks.length;
    },

    update(t, dt, ctx) {
      const { THREE } = ctx;
      const M = S.M || (S.M = new THREE.Matrix4()), P = S.P || (S.P = new THREE.Vector3()), Q = S.Q || (S.Q = new THREE.Quaternion());
      const E = S.E || (S.E = new THREE.Euler()), SC = S.SC || (S.SC = new THREE.Vector3());
      const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

      // the flock: a slow circle (36 s, five rounds a cycle) high over the field, each bird a little off the ring
      const birds = S.birds;
      for (let i = 0; i < S.FLOCK; i++) {
        const a = t * TAU / 36 + i * 0.78 + 0.25 * Math.sin(t * 0.21 + i * 1.7);
        const r = 16 + 2.5 * Math.sin(i * 2.1 + t * 0.07);
        const x = S.flockC.x + Math.cos(a) * r, z = S.flockC.z + Math.sin(a) * r;
        const y = S.flockY + 2.5 * Math.sin(t * 0.19 + i * 1.3) + 1.5 * Math.sin(i);
        const yaw = -(a + Math.PI / 2);   // nose along the circle (increasing a)
        const flap = Math.cos(t * 6.5 + i * 1.9);
        const glide = 0.5 + 0.5 * Math.sin(t * 0.5 + i * 2.3) > 0.8 ? 0.25 : 1;   // now and then a bird glides
        M.compose(P.set(x, y, z), Q.setFromEuler(E.set(-0.35, yaw, 0, 'YXZ')), SC.set(0.9, 0.9 * (0.15 + 0.85 * glide) * flap, 0.9));
        birds.setMatrixAt(i, M);
      }
      // the Copse birds: hidden in the crowns until the Copse is tapped, then up in a widening spiral and back (6 s)
      const s = t - burst.t0;
      for (let i = 0; i < S.COPSE_BIRDS; i++) {
        const k = S.FLOCK + i;
        if (s < 0 || s > 6) { M.makeScale(0, 0, 0); birds.setMatrixAt(k, M); continue; }
        const p = s / 6, up = Math.sin(Math.PI * p);
        const a = i * 1.05 + s * 2.3 + 0.3 * i, r = 0.8 + 5.5 * Math.pow(up, 0.8) + i * 0.3;
        const x = S.copseTop.x + Math.cos(a) * r, z = S.copseTop.z + Math.sin(a) * r;
        const y = S.copseTop.y - 1.5 + 7 * Math.pow(up, 0.7) + 0.6 * Math.sin(s * 3 + i);
        const yaw = -(a + Math.PI / 2);
        const w = smooth(s / 0.35) * smooth((6 - s) / 0.7);
        const flap = Math.cos(t * 10 + i * 2.1);
        M.compose(P.set(x, y, z), Q.setFromEuler(E.set(-0.5, yaw, 0, 'YXZ')), SC.set(0.9 * w, 0.9 * w * flap, 0.9 * w));
        birds.setMatrixAt(k, M);
      }
      birds.instanceMatrix.needsUpdate = true;

      // smoke: each puff rises and swells, then thins to nothing; gentle by day, a warm glow on it at night
      const day = ctx.light.day, wind = ctx.wind, gust = 1 + 1.5 * wind.gust;
      const smoke = S.smoke, PER = 4.5;
      for (let f = 0; f < S.fires.length; f++) {
        const F0 = S.fires[f];
        for (let k = 0; k < S.PUFFS; k++) {
          const ph = ((t / PER) + k / S.PUFFS + f * 0.137) % 1;
          const rise = 0.3 + 5.5 * Math.pow(ph, 0.85);
          const drift = ph * ph * 2.2 * gust;
          const x = F0.x + wind.dir.x * drift + 0.25 * Math.sin(t * 0.9 + k * 2 + f);
          const z = F0.z + wind.dir.z * drift + 0.25 * Math.cos(t * 0.7 + k * 1.3 + f);
          const sc = (0.35 + 1.15 * ph) * Math.pow(Math.sin(Math.PI * ph), 0.6) * (0.85 + 0.15 * day);
          M.compose(P.set(x, F0.y + rise, z), Q.setFromEuler(E.set(ph * 2, t * 0.3 + k, 0)), SC.set(sc, sc * 0.8, sc));
          smoke.setMatrixAt(f * S.PUFFS + k, M);
        }
      }
      smoke.instanceMatrix.needsUpdate = true;
      S.smokeMat.emissive.copy(S.warm).multiplyScalar(0.3 * (1 - day));
      S.smokeMat.opacity = 0.42 - 0.1 * (1 - day);
    },
  });
})();
