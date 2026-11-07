// buildings.js: the set for Gettysburg, July 3, 1863. The stone wall and the Angle ("a stone fence, constructed of
// small, rough stones", Haskell, patched with rails), the post-and-rail fences of the Emmitsburg Road, a farm by the
// road (a two-storey house and a Pennsylvania bank barn with its forebay and earth ramp), the stone farmhouse behind
// the Union line, the two camps (canvas army wagons, wedge tents and blanket lean-tos, stacked muskets, picket rails,
// woodpiles, fire pits with flickering flames) and the lanterns. Positions come from ctx.FIELD; the tents, wagons
// and camp details are ours (the sources read don't describe them; DESIGN.md 12).
// Everything static is vertex-coloured on one material in ctx.world (one draw after the merge); the flames are two
// instanced meshes updated from the cycle. Nothing is allocated per frame.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  window.Scene.register({
    name: 'buildings',
    init(ctx) {
      const { THREE, FIELD, world, lin } = ctx;
      const rnd = ctx.mulberry32(18630703);          // our own seed, so the other builders' randomness is untouched
      const rr = (a, b) => a + (b - a) * rnd();
      const G = ctx.groundY;
      const M = ctx.mat(0xffffff, { vertexColors: true });   // one material for everything static
      const UP = new THREE.Vector3(0, 1, 0), tmpC = new THREE.Color();
      const DARK = 0x3a3630;        // inside openings: doors, windows, the open end of a tent
      const WOOD = 0x8c7b63, POST = 0x74644f, ROOF = 0x6a5a50, STONE = 0x9a948a, ROCK = ctx.C.rock;
      const camFloors = [];

      // ---------- painting: colour bands per triangle, shade per vertex ----------
      // paint(geo, hex, o): o.bands [[fromFraction, multiplier]...] listed top first (stone courses); o.shade how much
      // darker the bottom is (default 0.22); o.tint a multiplier; faces that look down are darkened (eaves, forebay).
      function paint(geo, hex, o) {
        o = o || {};
        if (geo.index) geo = geo.toNonIndexed();
        geo.computeBoundingBox();
        const y0 = geo.boundingBox.min.y, hgt = Math.max(1e-4, geo.boundingBox.max.y - y0);
        const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3);
        const base = lin(hex).multiplyScalar(o.tint || 1), shade = o.shade === undefined ? 0.22 : o.shade;
        for (let i = 0; i < p.count; i += 3) {
          const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, f = (cy - y0) / hgt, ny = n ? n.getY(i) : 0;
          tmpC.copy(base);
          if (o.bands) for (const b of o.bands) if (f >= b[0]) { tmpC.multiplyScalar(b[1]); break; }
          if (ny < -0.5) tmpC.multiplyScalar(0.6);
          for (let k = 0; k < 3; k++) {
            const s = 1 - shade * (1 - (p.getY(i + k) - y0) / hgt), j = (i + k) * 3;
            col[j] = tmpC.r * s; col[j + 1] = tmpC.g * s; col[j + 2] = tmpC.b * s;
          }
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return geo;
      }
      // a painted box at (x, y, z) (its centre): o.yaw/pitch/roll, o.segs (height segments for bands), o.jitter, o.parent
      function block(w, h, d, hex, x, y, z, o) {
        o = o || {};
        const g = new THREE.BoxGeometry(w, h, d, 1, o.segs || 1, 1).toNonIndexed();
        if (o.jitter) ctx.jitterGeo(g, o.jitter, o.seed || 1);
        paint(g, hex, o);
        const m = new THREE.Mesh(g, M);
        m.position.set(x, y, z);
        m.rotation.set(o.pitch || 0, o.yaw || 0, o.roll || 0, 'YXZ');
        (o.parent || world).add(m);
        return m;
      }
      // a box from a to b (arrays [x, y, z]) with a w by d cross-section: rails, poles, muskets, logs
      function bar(a, b, w, d, hex, o) {
        o = o || {};
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
        const g = paint(new THREE.BoxGeometry(w, len, d, 1, o.segs || 1, 1), hex, Object.assign({ shade: 0 }, o));
        const m = new THREE.Mesh(g, M);
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        m.quaternion.setFromUnitVectors(UP, dir.normalize());
        (o.parent || world).add(m);
        return m;
      }
      const fromArrays = (P, Cc) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
        g.computeVertexNormals();
        return g;
      };
      // a gable roof or a wedge tent: ridge along z, w across, rising h, length d; o.openFront paints the lower front dark
      function prism(w, h, d, hex, gableHex, o) {
        o = o || {};
        const P = [], Cc = [], hw = w / 2, hd = d / 2;
        const A = [-hw, 0, hd], B = [hw, 0, hd], C2 = [hw, 0, -hd], D = [-hw, 0, -hd], R1 = [0, h, hd], R2 = [0, h, -hd];
        const roof = lin(hex), gab = lin(gableHex), gab2 = lin(gableHex).multiplyScalar(0.88), dark = lin(DARK);
        const tri = (a, b, c, col) => { P.push(...a, ...b, ...c); Cc.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b); };
        tri(A, R1, R2, roof); tri(A, R2, D, roof);
        tri(B, C2, R2, roof); tri(B, R2, R1, roof);
        if (o.openFront) {
          const k = 0.5, m1 = [-hw * (1 - k), h * k, hd], m2 = [hw * (1 - k), h * k, hd];
          tri(m1, m2, R1, gab); tri(A, B, m2, dark); tri(A, m2, m1, dark);
        } else tri(A, B, R1, gab);
        tri(C2, D, R2, gab2);
        return fromArrays(P, Cc);
      }
      // the earth ramp of a bank barn: high (h) at -x, down to the ground at +x, width d along z
      function wedge(w, h, d, topHex, sideHex) {
        const P = [], Cc = [], hw = w / 2, hd = d / 2, top = lin(topHex), side = lin(sideHex), side2 = lin(sideHex).multiplyScalar(0.85);
        const tri = (a, b, c, col) => { P.push(...a, ...b, ...c); Cc.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b); };
        const a = [-hw, h, hd], b = [-hw, h, -hd], c = [hw, 0, -hd], d2 = [hw, 0, hd], e = [-hw, 0, hd], f = [-hw, 0, -hd];
        tri(a, d2, c, top); tri(a, c, b, top);
        tri(e, d2, a, side); tri(f, b, c, side2);
        return fromArrays(P, Cc);
      }
      // a wagon cover: a half-ellipse over the bed, along z, open underneath; the back end open and dark
      function arch(len, rx, ry, segs, hex) {
        const P = [], Cc = [], hl = len / 2, can = lin(hex), dark = lin(DARK), ring = [];
        for (let i = 0; i <= segs; i++) { const a = Math.PI * i / segs; ring.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
        const push = (pt, col) => { P.push(pt[0], pt[1], pt[2]); Cc.push(col.r, col.g, col.b); };
        const shaded = (y) => tmpC.copy(can).multiplyScalar(0.8 + 0.2 * (y / ry));
        for (let i = 0; i < segs; i++) {
          const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
          const a = [x0, y0, hl], b = [x1, y1, hl], c = [x1, y1, -hl], d = [x0, y0, -hl];
          push(a, shaded(y0)); push(d, shaded(y0)); push(c, shaded(y1));
          push(a, shaded(y0)); push(c, shaded(y1)); push(b, shaded(y1));
          const cf = [0, ry * 0.3, hl], cb = [0, ry * 0.3, -hl], front = tmpC.copy(can).multiplyScalar(0.8).clone();
          push([x0, y0, hl], front); push([x1, y1, hl], front); push(cf, front);
          push([x1, y1, -hl], dark); push([x0, y0, -hl], dark); push(cb, dark);
        }
        return fromArrays(P, Cc);
      }
      // dark openings proud of a wall by 3 cm (a recess at this scale): list of { f: 'W'|'E'|'S'|'N', u, y, w, h }
      function openings(cx, cz, W, D, yb, list, parent) {
        for (const q of list) {
          const y = yb + q.y + q.h / 2;
          if (q.f === 'W') block(0.06, q.h, q.w, DARK, cx - W / 2 - 0.02, y, cz + q.u, { shade: 0, parent });
          else if (q.f === 'E') block(0.06, q.h, q.w, DARK, cx + W / 2 + 0.02, y, cz + q.u, { shade: 0, parent });
          else if (q.f === 'S') block(q.w, q.h, 0.06, DARK, cx + q.u, y, cz + D / 2 + 0.02, { shade: 0, parent });
          else block(q.w, q.h, 0.06, DARK, cx + q.u, y, cz - D / 2 - 0.02, { shade: 0, parent });
        }
      }
      // the lowest ground under a footprint, so a building's foundation sinks into the slope rather than floating
      function baseY(cx, cz, W, D) {
        let lo = 1e9, hi = -1e9;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const y = G(cx + sx * W / 2, cz + sz * D / 2); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        return { lo, hi };
      }
      function porch(cx, cz, W, D, yb, side, len, deep, hex, parent) {
        // a deck, two posts and a slab roof on the west (side 'W') or south ('S') face; returns the lantern hook position
        const dy = 0.12;
        let x, z, w, d;
        if (side === 'W') { x = cx - W / 2 - deep / 2; z = cz; w = deep; d = len; } else { x = cx; z = cz + D / 2 + deep / 2; w = len; d = deep; }
        block(w, 0.24, d, 0xb8a888, x, yb + dy, z, { shade: 0.3, parent });
        block(w + 0.2, 0.18, d + 0.2, ROOF, x, yb + 2.75, z, { shade: 0, parent });
        const px = side === 'W' ? x - deep / 2 + 0.12 : [x - len / 2 + 0.12, x + len / 2 - 0.12], pz = side === 'W' ? [z - len / 2 + 0.12, z + len / 2 - 0.12] : z + deep / 2 - 0.12;
        for (let i = 0; i < 2; i++) {
          const X = side === 'W' ? px : px[i], Z = side === 'W' ? pz[i] : pz;
          block(0.16, 2.42, 0.16, 0xd8ccb4, X, yb + 0.24 + 1.21, Z, { shade: 0.25, parent });
        }
        const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, deck = yb + 0.24;
        ctx.addSurface((qx, qz) => (qx >= x0 && qx <= x1 && qz >= z0 && qz <= z1 ? deck : null));
        return side === 'W' ? [px, yb + 2.45, pz[1]] : [px[1], yb + 2.45, pz];
      }
      function chimney(x, yb, z, h, parent) { block(0.7, h, 0.7, 0x8a4a3a, x, yb + h / 2, z, { shade: 0.1, parent }); block(0.8, 0.14, 0.8, 0x6a3a2e, x, yb + h + 0.07, z, { shade: 0, parent }); }
      function lanternBody(x, y, z) {
        block(0.05, 0.12, 0.05, 0x3a3630, x, y + 0.2, z, { shade: 0 });
        block(0.16, 0.06, 0.16, 0x3a3630, x, y + 0.12, z, { shade: 0 });
        block(0.11, 0.14, 0.11, 0xf6e2b0, x, y, z, { shade: 0 });
        block(0.14, 0.05, 0.14, 0x3a3630, x, y - 0.09, z, { shade: 0 });
        ctx.addLantern(new THREE.Vector3(x, y, z));
      }
      function footprintFloor(cx, cz, W, D, top) {
        const x0 = cx - W / 2 - 0.6, x1 = cx + W / 2 + 0.6, z0 = cz - D / 2 - 0.6, z1 = cz + D / 2 + 0.6;
        ctx.addCamFloor((x, z) => (x >= x0 && x <= x1 && z >= z0 && z <= z1 ? top : null));
      }

      // ---------- the stone wall and the Angle ----------
      {
        const W = FIELD.wall, H = FIELD.wallH, lowSpots = [];
        for (let s = 0; s < W.length - 1; s++) {
          const [ax, az] = W[s], [bx, bz] = W[s + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
          const yaw = Math.atan2(ux, uz) + Math.PI / 2;   // the box's length (x) along the segment
          let along = 0, i = 0;
          while (along < L - 0.3) {
            const len = Math.min(rr(0.8, 1.35), L - along + 0.15), mid = along + len / 2;
            const x = ax + ux * mid, z = az + uz * mid, low = rnd() < 0.1 && mid > 1.5 && mid < L - 1.5;
            const h = low ? H * 0.6 : H * rr(0.86, 1.1), sink = 0.12;
            block(len + 0.12, h + sink, 0.7 * rr(0.9, 1.1), ctx.C.wall, x, G(x, z) - sink + (h + sink) / 2, z, {
              yaw: yaw + rr(-0.05, 0.05), segs: 3, jitter: 0.07, seed: 100 + s * 97 + i, shade: 0.32, tint: rr(0.9, 1.08),
              bands: [[0.66, 1.04], [0.33, 0.9], [0, 0.78]],
            });
            if (low) lowSpots.push([x, G(x, z) + h, z, yaw]);
            else if (rnd() < 0.4) {   // a cap stone on top, to break the line
              const cx = x + ux * rr(-0.3, 0.3), cz = z + uz * rr(-0.3, 0.3);
              block(rr(0.35, 0.55), rr(0.14, 0.2), rr(0.3, 0.45), ctx.C.wall, cx, G(cx, cz) + h + 0.07, cz, { yaw: yaw + rr(-0.4, 0.4), jitter: 0.05, seed: 300 + i, shade: 0.2, tint: rr(1.0, 1.12) });
            }
            along += len - 0.1; i++;
          }
        }
        // "badly pulled down" and patched: rails laid along the top where it is low
        for (const [x, y, z, yaw] of lowSpots) {
          for (let k = 0; k < 2; k++) {
            const o = (k - 0.5) * 0.28, px = x + Math.sin(yaw + Math.PI / 2) * o, pz = z + Math.cos(yaw + Math.PI / 2) * o;
            block(2.6, 0.1, 0.12, WOOD, px, y + 0.06 + k * 0.03, pz, { yaw: yaw + rr(-0.08, 0.08), shade: 0, tint: rr(0.85, 1.05) });
          }
        }
        const angle = new THREE.Vector3(FIELD.angle[0], G(FIELD.angle[0], FIELD.angle[1]) + H, FIELD.angle[1]);
        ctx.tag('wall', () => angle, { r: 3 });
      }

      // ---------- post-and-rail fences ----------
      // fenceRun(ax, az, bx, bz, o): posts about 3 m apart, two rails; o.gaps: [[zFrom, zTo]] bays left open (a gate)
      function fenceRun(ax, az, bx, bz, o) {
        o = o || {};
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / (o.bay || 3.3))), ux = dx / L, uz = dz / L;
        const yaw = Math.atan2(ux, uz) + Math.PI / 2, postH = 1.3;
        const pts = [];
        for (let i = 0; i <= n; i++) { const x = ax + ux * L * i / n, z = az + uz * L * i / n; pts.push([x, G(x, z), z]); }
        for (let i = 0; i <= n; i++) {
          const [x, y, z] = pts[i];
          block(0.2, postH + 0.3, 0.2, POST, x, y - 0.3 + (postH + 0.3) / 2, z, { yaw, shade: 0.3, tint: rr(0.85, 1.1) });
        }
        for (let i = 0; i < n; i++) {
          const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1], zc = (z0 + z1) / 2;
          if (o.gaps && o.gaps.some(([a, b]) => zc >= a && zc <= b)) continue;
          for (const h of [0.52, 0.98]) {
            bar([x0 - ux * 0.08, y0 + h, z0 - uz * 0.08], [x1 + ux * 0.08, y1 + h + rr(-0.03, 0.03), z1 + uz * 0.08], 0.13, 0.1, WOOD, { tint: rr(0.85, 1.08) * (h < 0.7 ? 0.9 : 1) });
          }
        }
      }
      {
        const nx = 1 / Math.hypot(1, 0.15), nz = 0.15 / Math.hypot(1, 0.15);   // the road's normal
        for (const s of [-1, 1]) {
          const z0 = -55, z1 = 55;
          fenceRun(FIELD.roadX(z0) + s * 1.4 * nx, z0 + s * 1.4 * nz, FIELD.roadX(z1) + s * 1.4 * nx, z1 + s * 1.4 * nz, { gaps: s > 0 ? [[4.5, 8.5]] : null });
        }
        const rz = 4, roadPt = new THREE.Vector3(FIELD.roadX(rz), G(FIELD.roadX(rz), rz), rz);
        ctx.tag('road', () => roadPt, { r: 3 });
      }

      // ---------- the farm by the road: a two-storey house and a bank barn ----------
      {
        // the house: whitewashed, the long side to the road, a porch on the west, chimneys at both gables
        // The house is merged on its own (one draw) and kept out of the world merge, so it can shake when the
        // cannonball hits it (DESIGN.md 10, decision 11).
        const hx = 17.5, hz = 5, HW = 4.6, HD = 6.2, eave = 5.0, rise = 2.1;
        const { lo, hi } = baseY(hx, hz, HW, HD), yb = lo, sink = hi - lo + 0.4;
        const hG = new THREE.Group();
        hG.userData.dynamic = true;
        world.add(hG);
        block(HW, eave + sink, HD, 0xe6dcc4, hx, yb - sink + (eave + sink) / 2, hz, { shade: 0.28, parent: hG });
        const roofG = prism(HW + 0.5, rise, HD + 0.5, ROOF, 0xe6dcc4);
        { const m = new THREE.Mesh(roofG, M); m.position.set(hx, yb + eave, hz); hG.add(m); }
        block(HW + 0.6, 0.12, HD + 0.6, 0x7a6a60, hx, yb + eave - 0.02, hz, { shade: 0, parent: hG });   // the eaves board
        chimney(hx, yb, hz - HD / 2 + 0.5, eave + rise + 0.7, hG);
        chimney(hx, yb, hz + HD / 2 - 0.5, eave + rise + 0.7, hG);
        openings(hx, hz, HW, HD, yb, [
          { f: 'W', u: 0, y: 0.25, w: 1.0, h: 2.1 },
          { f: 'W', u: -2.1, y: 0.9, w: 0.8, h: 1.3 }, { f: 'W', u: 2.1, y: 0.9, w: 0.8, h: 1.3 },
          { f: 'W', u: -2.1, y: 3.2, w: 0.8, h: 1.2 }, { f: 'W', u: 0, y: 3.2, w: 0.8, h: 1.2 }, { f: 'W', u: 2.1, y: 3.2, w: 0.8, h: 1.2 },
          { f: 'S', u: -1.1, y: 0.9, w: 0.8, h: 1.3 }, { f: 'S', u: 1.1, y: 0.9, w: 0.8, h: 1.3 }, { f: 'S', u: 0, y: 3.2, w: 0.8, h: 1.2 },
          { f: 'E', u: -1.6, y: 0.9, w: 0.8, h: 1.3 }, { f: 'E', u: 1.6, y: 3.2, w: 0.8, h: 1.2 }, { f: 'E', u: -1.6, y: 3.2, w: 0.8, h: 1.2 },
        ], hG);
        porch(hx, hz, HW, HD, yb, 'W', 5.0, 1.6, ROOF, hG);
        ctx.mergeGroup(hG, true);
        this.house = hG;
        footprintFloor(hx, hz, HW + 2, HD, yb + eave + rise + 1.5);

        // ---------- the cannonball hit: at 56 s a burst of dust and flying boards, a ragged hole in the west wall
        // (upper storey, between the windows), the house shakes; patched by lantern light at 160-162 s, the debris
        // cleared away by 168 s; whole again at the seam. One instanced mesh: a box part and a blob part per instance
        // (aKind picks one), aAlpha fades the dust. Indices: 0-2 hole, 3-7 board ends, 8-11 patch boards, 12-23
        // debris, 24-31 dust.
        const HIT = { t: 56.0, x: hx - HW / 2, y: yb + 3.9, z: hz + 1.05, g0: 0 };
        HIT.g0 = G(HIT.x, HIT.z);
        this.hit = HIT;
        const boxG = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), blobG = ctx.jitterGeo(new THREE.IcosahedronGeometry(0.5, 0), 0.2, 5);
        const nb = boxG.attributes.position.count, nl = blobG.attributes.position.count;
        const fpos = new Float32Array((nb + nl) * 3), fnor = new Float32Array((nb + nl) * 3), fpart = new Float32Array(nb + nl);
        fpos.set(boxG.attributes.position.array, 0); fpos.set(blobG.attributes.position.array, nb * 3);
        fnor.set(boxG.attributes.normal.array, 0); fnor.set(blobG.attributes.normal.array, nb * 3);
        fpart.fill(1, nb);
        const fxG = new THREE.BufferGeometry();
        fxG.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
        fxG.setAttribute('normal', new THREE.BufferAttribute(fnor, 3));
        fxG.setAttribute('part', new THREE.BufferAttribute(fpart, 1));
        const NFX = 32;
        fxG.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(NFX), 1));
        fxG.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(NFX).fill(1), 1));
        const fxM = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, transparent: true, depthWrite: false });
        fxM.userData.extraKey = 'hitfx';
        fxM.onBeforeCompile = (sh) => {
          sh.vertexShader = 'attribute float part; attribute float aKind; attribute float aAlpha; varying float vAlpha;\n' + sh.vertexShader
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(part - aKind) > 0.5) transformed = vec3(0.0);\nvAlpha = aAlpha;');
          sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vAlpha;');
        };
        const fx = new THREE.InstancedMesh(fxG, fxM, NFX);
        fx.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        fx.frustumCulled = false; fx.userData.dynamic = true; fx.renderOrder = 2;
        ctx.root.add(fx);
        this.fx = fx;
        const kind = fxG.attributes.aKind.array;
        const setCol = (i, hex, k) => fx.setColorAt(i, tmpC.copy(lin(hex)).multiplyScalar(k || 1));
        // the hole and its splintered rim: fixed matrices, scaled by holeK each frame
        this.holeM = [];
        const holeDef = [
          [HIT.x - 0.04, HIT.y, HIT.z, 0.12, 1.0, 0.85, 0, 0, 0],
          [HIT.x - 0.03, HIT.y + 0.45, HIT.z - 0.2, 0.1, 0.45, 0.4, 0.35, 0, 0],
          [HIT.x - 0.03, HIT.y - 0.4, HIT.z + 0.2, 0.1, 0.4, 0.42, -0.3, 0, 0],
        ];
        for (let i = 0; i < 3; i++) { kind[i] = 0; setCol(i, 0x2a2622); this.holeM.push(holeDef[i]); }
        for (let i = 3; i < 8; i++) {
          const a = (i - 3) / 5 * TAU + 0.4, rz = HIT.z + Math.cos(a) * 0.42, ry = HIT.y + Math.sin(a) * 0.55;
          kind[i] = 0; setCol(i, i % 2 ? 0xc9b48a : 0xe6dcc4, 0.9);
          this.holeM.push([HIT.x - 0.12, ry, rz, 0.35, 0.06, 0.12, 0, rr(-0.5, 0.5), rr(-0.35, 0.35)]);
        }
        this.patchM = [];
        for (let i = 8; i < 12; i++) {
          kind[i] = 0; setCol(i, 0xd8c8a8, 0.95);
          this.patchM.push([HIT.x - 0.05, HIT.y - 0.55 + (i - 8) * 0.37, HIT.z, 0.08, 0.3, 1.1, 0, 0, rr(-0.03, 0.03)]);
        }
        // debris: thrown west in arcs, each landing where its own flight ends (solved against the ground)
        this.debris = [];
        for (let i = 12; i < 24; i++) {
          const k = i - 12, isBoard = k < 6, isShingle = k < 9 && !isBoard;
          kind[i] = 0; setCol(i, isBoard ? (k % 2 ? 0xc9b48a : 0xe6dcc4) : isShingle ? ROOF : 0xd8d0c0, isBoard ? 0.95 : 1);
          const vx = -rr(2.5, 6), vy = rr(2.2, 5.5), vz = rr(-2.8, 2.8);
          let T = 0.5;
          for (let it = 0; it < 3; it++) { const gy = G(HIT.x + vx * T, HIT.z + vz * T); T = (vy + Math.sqrt(vy * vy + 19.6 * Math.max(0.1, HIT.y - gy))) / 9.8; }
          const lx = HIT.x + vx * T, lz = HIT.z + vz * T;
          const sx = isBoard ? rr(0.7, 1.1) : isShingle ? rr(0.3, 0.45) : rr(0.25, 0.4), sy = isBoard ? 0.07 : isShingle ? 0.05 : rr(0.2, 0.3), sz = isBoard ? rr(0.14, 0.22) : isShingle ? rr(0.3, 0.45) : rr(0.25, 0.4);
          this.debris.push({ vx, vy, vz, T, lx, lz, ly: G(lx, lz) + sy * 0.4, sx, sy, sz, w1: rr(3, 8), w2: rr(-6, 6), w3: rr(2, 7), yaw: rr(0, TAU) });
        }
        this.dust = [];
        for (let i = 24; i < 32; i++) {
          const k = i - 24;
          kind[i] = 1; setCol(i, k < 4 ? 0x8a7a66 : 0xe8e2d6);
          this.dust.push({ dx: -rr(0.6, 2.2), dy: rr(0.5, 1.8), dz: rr(-1.4, 1.4), r: rr(0.9, 1.6), ph: rr(0, TAU), delay: k < 4 ? 0 : 0.15 });
        }
        fx.instanceColor.needsUpdate = true;
        this.lastP = -1;
        { const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < NFX; i++) fx.setMatrixAt(i, zero); }

        // the bank barn: a stone lower storey, a red-brown upper storey overhanging to the west (the forebay), a big
        // roof, and the earth ramp up to the big doors on the east
        const bx = 21.3, bz = 13, BW = 6.0, BD = 8.5, lowH = 2.6, upH = 3.4, bRise = 2.9, fore = 1.3;
        const bb = baseY(bx, bz, BW, BD), byb = bb.lo, bsink = bb.hi - bb.lo + 0.4;
        block(BW, lowH + bsink, BD, STONE, bx, byb - bsink + (lowH + bsink) / 2, bz, { segs: 4, shade: 0.3, bands: [[0.75, 1.0], [0.5, 0.92], [0.25, 1.0], [0, 0.9]] });
        block(BW + fore, upH, BD, 0x8c4a38, bx - fore / 2, byb + lowH + upH / 2, bz, { shade: 0.3 });
        { const m = new THREE.Mesh(prism(BW + fore + 0.6, bRise, BD + 0.6, 0x5e5a58, 0x8c4a38), M); m.position.set(bx - fore / 2, byb + lowH + upH, bz); world.add(m); }
        block(BW + fore + 0.7, 0.12, BD + 0.7, 0x6a3a2e, bx - fore / 2, byb + lowH + upH - 0.02, bz, { shade: 0 });
        // stable doors under the forebay, a hay door above, the big wagon doors on the east
        openings(bx, bz, BW, BD, byb, [
          { f: 'W', u: -2.2, y: 0.2, w: 1.2, h: 2.0 }, { f: 'W', u: 0, y: 0.2, w: 1.2, h: 2.0 }, { f: 'W', u: 2.2, y: 0.2, w: 1.2, h: 2.0 },
          { f: 'E', u: 0, y: lowH + 0.1, w: 2.8, h: 2.8 },
          { f: 'S', u: -1.2, y: lowH + 1.0, w: 0.5, h: 0.9 }, { f: 'S', u: 1.2, y: lowH + 1.0, w: 0.5, h: 0.9 },
        ]);
        { const m = new THREE.Mesh(wedge(3.2, lowH + 0.05, 4.2, 0x8ba046, ctx.C.earth), M); m.position.set(bx + BW / 2 + 1.6, byb, bz); world.add(m); }
        footprintFloor(bx, bz, BW + fore, BD + 2, byb + lowH + upH + bRise + 1.5);

        // the barnyard: a rail fence on the forebay side, open toward the lane
        fenceRun(bx - BW / 2 - fore - 3.6, bz - BD / 2, bx - BW / 2 - fore - 3.6, bz + BD / 2, { bay: 2.8 });
        fenceRun(bx - BW / 2 - fore - 3.6, bz + BD / 2, bx - BW / 2 - fore, bz + BD / 2, { bay: 2.8 });
        fenceRun(bx - BW / 2 - fore - 3.6, bz - BD / 2, bx - BW / 2 - fore - 0.6, bz - BD / 2, { bay: 2.8 });
        const farmPt = new THREE.Vector3(FIELD.farm[0], G(FIELD.farm[0], FIELD.farm[1]) + 1.5, FIELD.farm[1]);
        ctx.tag('farm', () => farmPt, { r: 7 });
      }

      // ---------- the farmhouse behind the Union line: stone, a porch toward the field, a lantern ----------
      {
        const [fx, fz] = FIELD.unionFarmhouse, FW = 5.0, FD = 6.6, eave = 4.6, rise = 1.9;
        const { lo, hi } = baseY(fx, fz, FW, FD), yb = lo, sink = hi - lo + 0.4;
        block(FW, eave + sink, FD, STONE, fx, yb - sink + (eave + sink) / 2, fz, { segs: 5, shade: 0.26, bands: [[0.8, 1.0], [0.6, 0.93], [0.4, 1.0], [0.2, 0.93], [0, 0.87]] });
        { const m = new THREE.Mesh(prism(FW + 0.5, rise, FD + 0.5, ROOF, STONE), M); m.position.set(fx, yb + eave, fz); world.add(m); }
        block(FW + 0.6, 0.12, FD + 0.6, 0x6a5e56, fx, yb + eave - 0.02, fz, { shade: 0 });
        chimney(fx, yb, fz - FD / 2 + 0.5, eave + rise + 0.6);
        openings(fx, fz, FW, FD, yb, [
          { f: 'W', u: 0.6, y: 0.25, w: 1.0, h: 2.1 }, { f: 'W', u: -1.8, y: 0.9, w: 0.8, h: 1.3 }, { f: 'W', u: 2.3, y: 0.9, w: 0.8, h: 1.3 },
          { f: 'W', u: -1.8, y: 2.9, w: 0.8, h: 1.1 }, { f: 'W', u: 0.6, y: 2.9, w: 0.8, h: 1.1 }, { f: 'W', u: 2.3, y: 2.9, w: 0.8, h: 1.1 },
          { f: 'S', u: -1.2, y: 0.9, w: 0.8, h: 1.3 }, { f: 'S', u: 1.2, y: 0.9, w: 0.8, h: 1.3 }, { f: 'S', u: 0, y: 2.9, w: 0.8, h: 1.1 },
          { f: 'N', u: 1.4, y: 0.9, w: 0.8, h: 1.3 }, { f: 'N', u: 1.4, y: 2.9, w: 0.8, h: 1.1 },
        ]);
        const hook = porch(fx, fz, FW, FD, yb, 'W', 5.2, 1.7, ROOF);
        lanternBody(hook[0] + 0.22, hook[1] - 0.35, hook[2] - 0.1);
        footprintFloor(fx, fz, FW + 2, FD, yb + eave + rise + 1.5);
      }

      // ---------- camp furniture ----------
      // a canvas army wagon: the tongue points along local +z; o.lantern hangs one off the back bow
      function wagon(x, z, yaw, bodyHex, o) {
        o = o || {};
        const g = new THREE.Group(), y = G(x, z) - 0.03;
        g.position.set(x, y, z); g.rotation.y = yaw; world.add(g);
        const bedY = 0.95;
        block(1.2, 0.62, 3.1, bodyHex, 0, bedY + 0.31, 0, { shade: 0.25, parent: g });
        block(1.0, 0.1, 3.0, 0x6a4a34, 0, bedY - 0.02, 0, { shade: 0, parent: g });       // the bed's floor beam
        for (const [zz, r] of [[1.05, 0.5], [-1.05, 0.64]]) {
          bar([-0.72, r, zz], [0.72, r, zz], 0.1, 0.1, 0x8a5a3c, { parent: g });              // axle
          for (const s of [-1, 1]) {
            const w = new THREE.Mesh(paint(new THREE.CylinderGeometry(r, r, 0.1, 8), 0x8a5a3c, { shade: 0.15, tint: 0.95 }), M);
            w.position.set(s * 0.72, r, zz); w.rotation.z = Math.PI / 2; g.add(w);
          }
        }
        bar([0, bedY - 0.1, 1.5], [0, 0.45, 3.4], 0.1, 0.1, 0x8a5a3c, { parent: g });        // the tongue, resting on the ground
        const cover = new THREE.Mesh(arch(3.3, 0.78, 0.7, 6, 0xeee6d2), M);
        cover.position.set(0, bedY + 0.62, 0); g.add(cover);
        block(1.3, 0.1, 0.16, 0x6a4a34, 0, bedY + 0.62 - 0.02, 1.6, { shade: 0, parent: g });   // the front board
        if (o.lantern) {
          const lx = 0.0, ly = y + bedY + 0.62 + 0.72 + 0.2, lz = -1.75, c = Math.cos(yaw), s = Math.sin(yaw);
          lanternBody(x + lx * c + lz * s, ly - 0.32, z - lx * s + lz * c);
        }
      }
      // a wedge tent, its open front toward local +z
      function tent(x, z, yaw, hex) {
        const y = G(x, z), m = new THREE.Mesh(prism(2.2, 1.65, 2.4, hex, hex, { openFront: true }), M);
        m.position.set(x, y - 0.03, z); m.rotation.y = yaw; world.add(m);
        const c = Math.cos(yaw), s = Math.sin(yaw);
        for (const zz of [1.3, -1.3]) bar([x + zz * s, y - 0.05, z + zz * c], [x + zz * s, y + 1.85, z + zz * c], 0.07, 0.07, 0x7a5a3c);
      }
      // a blanket lean-to: a slab on two poles, the back edge on the ground, open toward local +z
      function leanTo(x, z, yaw, hex) {
        const y = G(x, z), g = new THREE.Group();
        g.position.set(x, y, z); g.rotation.y = yaw; world.add(g);
        const L = 1.9, h = 1.25, a = Math.asin(h / L), zc = (Math.cos(a) * L) / 2;
        block(2.1, 0.07, L, hex, 0, h / 2, 0, { pitch: -a, shade: 0.15, parent: g, jitter: 0.03, seed: 9 });
        for (const sx of [-1, 1]) bar([sx * 0.98, -0.05, zc], [sx * 0.98, h - 0.05, zc], 0.07, 0.07, 0x7a5a3c, { parent: g });
        bar([-1.05, h - 0.02, zc], [1.05, h - 0.02, zc], 0.07, 0.07, 0x7a5a3c, { parent: g });
      }
      // three muskets stacked in a tripod, butts out, muzzles together
      function stack(x, z, yaw) {
        const y = G(x, z), top = 1.32, R = 0.48;
        for (let k = 0; k < 3; k++) {
          const a = yaw + k * TAU / 3, bx = x + Math.sin(a) * R, bz = z + Math.cos(a) * R;
          bar([bx, y, bz], [x + Math.sin(a) * 0.04, y + top, z + Math.cos(a) * 0.04], 0.07, 0.07, 0x6a4a30, { segs: 2, bands: [[0.5, 1], [0, 1]], tint: 1 });
          // the barrel: a steel band on the upper half, and a bayonet above the muzzle
          const mx = (bx + x) / 2, mz = (bz + z) / 2;
          bar([mx + (x - bx) * 0.1, y + top * 0.55, mz + (z - bz) * 0.1], [x + Math.sin(a) * 0.03, y + top + 0.02, z + Math.cos(a) * 0.03], 0.05, 0.05, 0x8a8e94);
          bar([x + Math.sin(a) * 0.03, y + top, z + Math.cos(a) * 0.03], [x - Math.sin(a) * 0.1, y + top + 0.38, z - Math.cos(a) * 0.1], 0.03, 0.03, 0xb8bcc2);
        }
      }
      function picket(x, z, len) {
        const y0 = G(x - len / 2, z), y1 = G(x + len / 2, z), ym = G(x, z);
        for (const [px, py] of [[x - len / 2, y0], [x, ym], [x + len / 2, y1]]) block(0.16, 1.5, 0.16, POST, px, py + 0.55, z, { shade: 0.3 });
        bar([x - len / 2 - 0.1, y0 + 1.2, z], [x + len / 2 + 0.1, y1 + 1.2, z], 0.12, 0.1, WOOD);
      }
      function woodpile(x, z, yaw) {
        const y = G(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
        const rows = [[-0.2, 0, 0.2], [-0.1, 0.1], [0]];
        rows.forEach((row, r) => row.forEach((o) => block(0.9, 0.19, 0.19, 0x6a4a34, x + o * c, y + 0.1 + r * 0.17, z - o * s, { yaw, shade: 0.2, tint: rr(0.85, 1.1), jitter: 0.02, seed: 50 + r })));
      }
      // a fire pit: a ring of stones, crossed logs, coals; returns the flame's base
      const fires = [];
      function firePit(x, z) {
        const y = G(x, z);
        for (let k = 0; k < 6; k++) {
          const a = k * TAU / 6 + rr(-0.15, 0.15), r = 0.6 + rr(-0.05, 0.05), sx = x + Math.sin(a) * r, sz = z + Math.cos(a) * r;
          block(rr(0.26, 0.34), rr(0.18, 0.24), rr(0.22, 0.3), ROCK, sx, G(sx, sz) + 0.06, sz, { yaw: a, jitter: 0.05, seed: 700 + k, shade: 0.3, tint: rr(0.8, 1.05) });
        }
        block(0.8, 0.12, 0.8, 0x4a3f36, x, y + 0.03, z, { shade: 0, jitter: 0.04, seed: 77 });
        for (let k = 0; k < 3; k++) {
          const a = k * TAU / 3 + 0.4, L = 0.85;
          bar([x - Math.sin(a) * L / 2, y + 0.12, z - Math.cos(a) * L / 2], [x + Math.sin(a) * L / 2, y + 0.28, z + Math.cos(a) * L / 2], 0.13, 0.13, 0x5a4030, { tint: rr(0.85, 1.05) });
        }
        fires.push({ x, y: y + 0.22, z, ph: fires.length * 2.17 });
      }

      // ---------- the Union camp, behind Cemetery Ridge ----------
      {
        const [cx, cz] = FIELD.unionCamp;
        firePit(cx, cz); firePit(cx + 4, cz + 3); firePit(cx - 3, cz + 4);
        const canvas = 0xe9e1cc;
        tent(56, -13.5, 0.15, canvas); tent(59.5, -11.5, -0.5, canvas); tent(61.5, -8, -Math.PI / 2, canvas);
        tent(52, -14, 0.1, canvas); tent(48.5, -12, 0.5, canvas);
        wagon(61.5, -1, -Math.PI / 2, 0x4a5570, { lantern: true });
        wagon(64.5, -5, -Math.PI / 2 - 0.2, 0x4a5570, { lantern: true });
        wagon(64, -12.5, -Math.PI / 2 + 0.3, 0x4a5570);
        for (const [sx, sz, a] of [[52.5, -10.5, 0.3], [56, -11.5, 1.1], [57.5, -8.5, 2.0], [50.5, -7, 0.7], [47, -9.5, 1.5], [55, -3, 0.2]]) stack(sx, sz, a);
        picket(60, -17, 6);
        woodpile(56.5, 0.5, 0.4);
        const pt = new THREE.Vector3(cx, G(cx, cz) + 1, cz);
        ctx.tag('unionCamp', () => pt, { r: 7 });
      }
      // ---------- the Confederate camp in the woods behind Seminary Ridge ----------
      {
        const [cx, cz] = FIELD.csaCamp;
        firePit(cx, cz); firePit(cx + 4, cz + 3); firePit(cx - 3, cz + 4);
        tent(-50, -6.5, 0.2, 0xe2d8bf); tent(-55, -6, -0.2, 0xe2d8bf);
        leanTo(-46, 7.5, -Math.PI / 2, 0x8a8578); leanTo(-52, 8.5, Math.PI, 0xa89467); leanTo(-58, 7, Math.PI / 2, 0x8a8578);
        wagon(-59, -3, Math.PI / 2, 0x7a5a3c); wagon(-60.5, 2.5, Math.PI / 2 + 0.25, 0x7a5a3c); wagon(-62, -6, Math.PI / 2 - 0.3, 0x7a5a3c);
        for (const [sx, sz, a] of [[-49.5, -2.5, 0.4], [-53, -3.5, 1.3], [-50, 5.5, 2.2], [-56, 0.5, 0.9]]) stack(sx, sz, a);
        picket(-55, -11, 6);
        woodpile(-45.5, 0, -0.3);
        const pt = new THREE.Vector3(cx, G(cx, cz) + 1, cz);
        ctx.tag('csaCamp', () => pt, { r: 7 });
      }

      // ---------- flames: two instanced faceted cones per fire, flickering, brighter at night ----------
      this.fires = fires;
      this.cA = lin(0xf0561a); this.cB = lin(0xffd86a);
      const mkFlames = (r, h, col) => {
        const m = new THREE.InstancedMesh(new THREE.ConeGeometry(r, h, 5, 1, true), new THREE.MeshBasicMaterial({ color: col.clone(), toneMapped: true }), fires.length);
        m.frustumCulled = false; m.userData.dynamic = true; ctx.root.add(m);
        return m;
      };
      this.flameA = mkFlames(0.24, 0.6, this.cA);
      this.flameB = mkFlames(0.13, 0.4, this.cB);
      this.m4 = new THREE.Matrix4(); this.p3 = new THREE.Vector3(); this.q4 = new THREE.Quaternion(); this.s3 = new THREE.Vector3(); this.e3 = new THREE.Euler();
    },

    update(t, dt, ctx) {
      const night = 1 - ctx.light.day;
      const k = 0.7 + 0.55 * night, kb = 0.8 + 1.0 * night, sz = 0.72 + 0.28 * night;
      this.flameA.material.color.copy(this.cA).multiplyScalar(k);
      this.flameB.material.color.copy(this.cB).multiplyScalar(kb);
      const F = this.fires, m4 = this.m4, p = this.p3, q = this.q4, s = this.s3, e = this.e3;
      for (let i = 0; i < F.length; i++) {
        const f = F[i], ph = f.ph;
        const fl = 1 + 0.22 * Math.sin(t * 9.1 + ph) + 0.14 * Math.sin(t * 15.7 + ph * 1.7) + 0.08 * Math.sin(t * 23.3 + ph * 0.6);
        const lx = 0.05 * Math.sin(t * 5.3 + ph), lz = 0.05 * Math.cos(t * 4.1 + ph * 1.3);
        const ya = sz * fl;
        e.set(lz * 2, t * 0.4 + ph, -lx * 2);
        q.setFromEuler(e);
        p.set(f.x + lx, f.y + 0.3 * ya, f.z + lz);
        s.set(sz * (1 + 0.08 * Math.sin(t * 7 + ph)), ya, sz * (1 + 0.08 * Math.cos(t * 6 + ph)));
        this.flameA.setMatrixAt(i, m4.compose(p, q, s));
        const fl2 = 1 + 0.25 * Math.sin(t * 12.3 + ph * 1.9) + 0.1 * Math.sin(t * 19.1 + ph), yb = sz * fl2;
        e.set(-lz * 2, -t * 0.6 + ph, lx * 2);
        q.setFromEuler(e);
        p.set(f.x + lx * 0.6, f.y + 0.02 + 0.2 * yb, f.z + lz * 0.6);
        s.set(sz, yb, sz);
        this.flameB.setMatrixAt(i, m4.compose(p, q, s));
      }
      this.flameA.instanceMatrix.needsUpdate = true;
      this.flameB.instanceMatrix.needsUpdate = true;
      this.updateHit(t, ctx);
    },

    // the cannonball hit on the farmhouse: everything a function of the cycle time (plus t for the dust's drift)
    updateHit(t, ctx) {
      const sm = ctx.smooth01, H = this.hit, fx = this.fx, p = ctx.cycle.t, tau = p - H.t;
      const m4 = this.m4, pos = this.p3, q = this.q4, s = this.s3, e = this.e3, alpha = fx.geometry.attributes.aAlpha.array;
      // the boom, once, as the ball strikes (never from a tap)
      if (this.lastP >= 0 && this.lastP < H.t && p >= H.t && p - this.lastP < 1) ctx.boom(H.x, H.y, H.z, 1);
      this.lastP = p;
      // the house shakes for 0.4 s
      const shake = tau >= 0 && tau < 0.4 ? 0.04 * Math.sin(tau * 70) * (1 - tau / 0.4) : 0;
      this.house.position.set(shake, 0, shake * 0.6);
      // the hole opens inside the dust and stays until the patch is on; the patch goes on at 160-162 and is gone by dawn
      const holeK = tau < 0 || p >= 162 ? 0 : sm(tau / 0.15);
      const patchK = sm((p - 160) / 2) * (1 - sm((p - 175) / 3));
      const debK = tau < 0 ? 0 : 1 - sm((p - 162) / 6);
      q.identity();
      for (let i = 0; i < 8; i++) {
        const d = this.holeM[i];
        e.set(d[6], d[7], d[8]); q.setFromEuler(e);
        fx.setMatrixAt(i, m4.compose(pos.set(d[0], d[1], d[2]), q, s.set(d[3] * holeK, d[4] * holeK, d[5] * holeK)));
      }
      for (let i = 0; i < 4; i++) {
        const d = this.patchM[i], k = sm((patchK * 4 - i) / 1.2) * Math.min(1, patchK * 4);
        e.set(d[6], d[7], d[8]); q.setFromEuler(e);
        fx.setMatrixAt(8 + i, m4.compose(pos.set(d[0], d[1], d[2]), q, s.set(d[3] * k, d[4] * k, d[5] * k)));
      }
      for (let i = 0; i < 12; i++) {
        const d = this.debris[i];
        if (debK <= 0) { fx.setMatrixAt(12 + i, m4.makeScale(0, 0, 0)); continue; }
        if (tau < d.T) {
          pos.set(H.x + d.vx * tau, H.y + d.vy * tau - 4.9 * tau * tau, H.z + d.vz * tau);
          e.set(d.w1 * (tau - d.T), d.yaw + d.w2 * (tau - d.T), d.w3 * (tau - d.T));
        } else { pos.set(d.lx, d.ly, d.lz); e.set(0, d.yaw, 0); }
        q.setFromEuler(e);
        fx.setMatrixAt(12 + i, m4.compose(pos, q, s.set(d.sx * debK, d.sy * debK, d.sz * debK)));
      }
      for (let i = 0; i < 8; i++) {
        const d = this.dust[i], u = tau - d.delay;
        if (u <= 0 || u > 3.4) { fx.setMatrixAt(24 + i, m4.makeScale(0, 0, 0)); alpha[24 + i] = 0; continue; }
        const out = 1 - Math.exp(-u / 0.7), r = d.r * (0.15 + 0.85 * Math.pow(Math.min(1, u / 2.4), 0.55));
        pos.set(H.x + d.dx * out * 1.3 + 0.1 * Math.sin(t * 1.3 + d.ph), H.y + d.dy * out + 0.35 * u, H.z + d.dz * out * 1.3);
        e.set(d.ph + u * 0.4, d.ph * 2 + u * 0.3, 0); q.setFromEuler(e);
        fx.setMatrixAt(24 + i, m4.compose(pos, q, s.set(r, r * 0.85, r)));
        alpha[24 + i] = 0.85 * (1 - sm((u - 0.6) / 2.6));
      }
      fx.geometry.attributes.aAlpha.needsUpdate = true;
      fx.instanceMatrix.needsUpdate = true;
    },
  });
})();
