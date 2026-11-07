// people.js: the full-size figures and horses of Gettysburg (DESIGN.md 6, 9; BRIEF.md cycle). The gun crews at
// three Confederate and three Union guns, Gen. Hunt riding the Union gun line, a Confederate officer riding in front
// of the woods as the lines form, Lt. Haskell at his lunch and his glasses with his horse tied nearby, the camp
// soldiers of both camps, the four Union men crouched behind the boulders on Little Round Top, and two limber teams.
// Not here: the massed lines, the men behind the wall and the flags (armies.js).
//
// Three rigs, one draw each (crews; horses and riders; camp and hill soldiers), baked once with Blocky.finish, plus one
// small musket-smoke puff. Every figure follows a FigureKit.Script that fills the 180 s cycle exactly; riders sit on
// their horse's saddle point. Shots come from window.GUNS (artillery.js); if it isn't loaded, the same seeded schedule
// is made here (see fallbackGuns) so the crews still work in time with BRIEF.md.
(function () {
  'use strict';
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const wrapA = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
  const lerpA = (a, b, k) => a + wrapA(b - a) * k;

  // the gun positions, which crews work them, and where each crewman stands in the gun's frame (a: forward, b: to the
  // gun's left; negative b is its right)
  const CSA_CREWED = [3, 5, 8], UNION_CREWED = [2, 4, 6];
  const MZ = 1.23;                                   // the muzzle, forward of the wheels (artillery.js MUZZLE_Z)
  const SPOT = { ram: [MZ + 1.75, -0.45], side: [MZ + 0.6, -1.5], breech: [-0.6, 1.25], night1: [-0.3, -1.55], night2: [-2.0, 0] };

  // the same seeded schedule as artillery.js, for when GUNS isn't there (the integrator can delete this once it is)
  function fallbackGuns(ctx) {
    const rnd = ctx.mulberry32(18630703), out = [];
    out.push({ t: 30, side: 'csa', i: 5 });
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
    const csaLast = run('csa', csaOrder, 32, 77.3, 0.42, 0.78, 2.4);
    let last = 0; for (let i = 0; i < 12; i++) if (78 - csaLast[i] > 78 - csaLast[last]) last = i;
    out.push({ t: 78, side: 'csa', i: last });
    run('union', unOrder, 34, 70, 0.85, 1.35, 3.0);
    run('union', unOrder, 100, 124.01, 1.2, 1.8, 3.0);
    out.sort((a, b) => a.t - b.t);
    const times = {};
    for (const s of out) (times[s.side + s.i] = times[s.side + s.i] || []).push(s.t);
    return {
      shots: out,
      lastShotBefore(side, i, ct) { const T = times[side + i] || []; let r = null; for (const t of T) { if (t <= ct) r = t; else break; } return r === null ? null : { t: r, side, i }; },
      nextShotAfter(side, i, ct) { const T = times[side + i] || []; for (const t of T) if (t > ct) return { t, side, i }; return null; },
    };
  }

  // the four hiding places on Little Round Top (land.js reports them at window.__land.hiding; these are its values)
  const HIDING_FALLBACK = [
    { x: 46.53, z: 44.03, face: -PI / 2 }, { x: 46.64, z: 32.87, face: -PI / 2 }, { x: 50.26, z: 29.81, face: -PI / 2 }, { x: 49.11, z: 36.71, face: -PI / 2 },
  ];

  window.Scene.register({
    name: 'people',
    init(ctx) {
      const { THREE } = ctx;
      const K = ctx.figureKit, B = ctx.Blocky, M = window.Motion, CH = window.CHARACTERS, F = ctx.FIELD, kit = ctx.kit;
      const P = K.P, mix = K.mix, win = M.win;
      const GUNS = window.GUNS || fallbackGuns(ctx);
      const shotsOf = (side, i) => GUNS.shots.filter((s) => s.side === side && s.i === i).map((s) => s.t);
      const GP = CH.gunner.poses, UP0 = CH.union.poses, CP0 = CH.csa.poses, OP = CH.officer.poses, HP = CH.haskell.poses, HA = CH.horse.anim;
      // sitting by a fire, the musket stands upright in the right hand at the shoulder instead of lying across the flames
      const SIT_MUSKET = { af1: 0.25, e1: 0.3, ao1: 0.2 };
      const UP = Object.assign({}, UP0, { sit: Object.assign({}, UP0.sit, SIT_MUSKET) }), CP = Object.assign({}, CP0, { sit: Object.assign({}, CP0.sit, SIT_MUSKET) });

      // every figure in the scene: { f, S (its Script), blob, seed, gest (a tap moment), rider (for horses) }
      const actors = [];
      this.actors = actors;
      const actor = (f, S, opt) => { f.floor = ctx.surfaceY; const a = Object.assign({ f, S, blob: opt && opt.noBlob ? null : ctx.blob(f.shadowR), seed: f.seed, gest: null }, opt || {}); actors.push(a); return a; };
      const idle = (f, base) => (s, I) => ({ pose: K.idle(I.t, f.seed, base) });
      // a hold that ends at `until`, skipped if the script is already past it
      const hold = (S, until, fn) => { if (until - S.T > 0.02) S.holdTo(until, fn); };
      // hold so that a walk through pts at `speed` arrives at `arrive`
      const holdForWalk = (S, pts, speed, arrive, fn) => { const L = new K.Route([[S.x, S.z]].concat(pts)).L; hold(S, arrive - L / speed, fn); };
      // a half-risen pose between sitting and standing, so nobody pops up: weight forward, knees bent
      const RISE = { lf0: 0.85, lf1: 0.95, k0: 1.3, k1: 1.35, lean: 0.5, hx: -0.15, af0: 0.5, e0: 0.6, af1: 0.45, e1: 0.55, ao0: 0.2, ao1: 0.15 };

      // what's already standing on the ground when we start: every instance of every instanced mesh placed so far
      // (the trees' trunks above all, which land.js scatters by seed), so nobody is put inside a tree or walks
      // through one. Only instances at ground level count.
      const obstacles = [];
      {
        const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        ctx.root.traverse((o) => {
          if (!o.isInstancedMesh) return;
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m4); m4.decompose(pos, q, sc);
            if (sc.x < 0.4 || Math.abs(pos.y - ctx.groundY(pos.x, pos.z)) > 1.5) continue;
            obstacles.push([pos.x, pos.z, 0]);
          }
        });
        // the camps' furniture (buildings.js), with the room each takes: tents, lean-tos, wagons, musket stacks, woodpiles
        for (const [x, z] of [[56, -13.5], [59.5, -11.5], [61.5, -8], [52, -14], [48.5, -12], [-50, -6.5], [-55, -6]]) obstacles.push([x, z, 1.6]);
        for (const [x, z] of [[-46, 7.5], [-52, 8.5], [-58, 7]]) obstacles.push([x, z, 1.5]);
        for (const [x, z] of [[61.5, -1], [64.5, -5], [64, -12.5], [-59, -3], [-60.5, 2.5], [-62, -6]]) obstacles.push([x, z, 2.3]);
        for (const [x, z] of [[52.5, -10.5], [56, -11.5], [57.5, -8.5], [50.5, -7], [47, -9.5], [55, -3], [-49.5, -2.5], [-53, -3.5], [-50, 5.5], [-56, 0.5]]) obstacles.push([x, z, 0.7]);
        for (const [x, z] of [[56.5, 0.5], [-45.5, 0]]) obstacles.push([x, z, 1.0]);
      }
      this.obstacles = obstacles;
      const nearest = (x, z) => { let d = 1e9; for (const o of obstacles) d = Math.min(d, Math.hypot(o[0] - x, o[1] - z) - o[2]); return d; };
      const segClear = (a, b, r) => { const n = Math.ceil(dist(a, b) / 0.4) + 1; for (let i = 0; i <= n; i++) { const k = i / n; if (nearest(lerp(a[0], b[0], k), lerp(a[1], b[1], k)) < r) return false; } return true; };
      // the nearest spot to (x, z) that is r clear of everything and passes ok(x, z), searched in rings up to 7 m out
      const findClear = (x, z, r, ok) => {
        if (nearest(x, z) >= r && (!ok || ok(x, z))) return [x, z];
        for (let rad = 0.5; rad <= 7; rad += 0.5) for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU, px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
          if (nearest(px, pz) >= r && (!ok || ok(px, pz))) return [px, pz];
        }
        return [x, z];
      };

      // ---------- rig 1: the gun crews ----------
      {
        const rig = kit.makeRig();
        const crews = [];
        for (const [side, list] of [['csa', CSA_CREWED], ['union', UNION_CREWED]]) for (const i of list) {
          const f1 = CH.gunner.make(ctx, B, kit, rig, { side, beard: (i % 2) === 1 });
          const f2 = CH.gunner.make(ctx, B, kit, rig, { side, beard: (i % 3) === 0 });
          crews.push({ side, i, f1, f2 });
        }
        B.finish(rig, ctx.root);
        for (const c of crews) this.crew(ctx, c, actor, hold, holdForWalk, idle, GUNS, shotsOf, GP, c.side === 'union' && c.i === 4);
        // the labelled gun crew: the Napoleon by the Copse
        const nap = crews.find((c) => c.side === 'union' && c.i === 4);
        const a = actors.find((q) => q.f === nap.f1);
        ctx.tag('gunner', () => nap.f1.headTop(), { onTap: (now) => { a.gest = { at: now, dur: 3, pose: { hx: -0.35, hy: 0.5, af0: 0.4, e0: 0.5 } }; } });
      }

      // ---------- rig 2: horses and their riders ----------
      {
        const rig = kit.makeRig();
        const huntHorse = CH.horse.make(kit, rig, { coat: 'bay', saddle: 'union' });
        const hunt = CH.officer.build(ctx, B, kit, rig, { side: 'union' });
        const csaHorse = CH.horse.make(kit, rig, { coat: 'chestnut', saddle: 'csa' });
        const csaOff = CH.officer.build(ctx, B, kit, rig, { side: 'csa' });
        const hasHorse = CH.horse.make(kit, rig, { coat: 'bay', saddle: 'union', blaze: false });
        const haskell = CH.haskell.build(ctx, B, kit, rig);
        const team = [];
        for (let k = 0; k < 4; k++) team.push(CH.horse.make(kit, rig, { coat: k % 2 ? 'chestnut' : 'bay', saddle: 'none', blaze: k === 1 }));
        B.finish(rig, ctx.root);

        // Gen. Hunt: at rest by the farmhouse, then slowly along the gun line between the trails and the limbers,
        // to the north end, back to the south end, and home (BRIEF 30–126)
        {
          const UG = ctx.spots.UNION_GUNS, laneX = (g) => g.x + 3.3;
          const REST = [50.5, 4.5], IN = [[46.5, 1.5], [43, -1]];
          const lane = UG.map((g) => [laneX(g), g.z]);                       // guns run north (index 0) to south (7)
          const north = [laneX(UG[1]), -20], south = [laneX(UG[6]), 16];
          const laneBetween = (za, zb) => lane.filter((p) => (za < zb ? p[1] > za && p[1] < zb : p[1] < za && p[1] > zb)).sort((p, q) => (za < zb ? p[1] - q[1] : q[1] - p[1]));
          const S = new K.Script(REST[0], REST[1], -PI / 2, 'hunt');
          const stand = (s, I) => ({ pose: HA.stand(I.t, huntHorse.seed) });
          S.holdTo(30, stand);
          S.walk(IN.concat([[laneX(UG[3]), -2]], laneBetween(-2, -20), [north]), 1.1, huntHorse);
          S.hold(3, (s) => ({ yaw: lerpA(PI, 0, M.smooth(s / 3)), pose: HA.stand(s + 40, huntHorse.seed) }));   // turn on the spot, north end
          S.walk(laneBetween(-20, 16).concat([south]), 1.1, huntHorse);
          S.hold(3, (s) => ({ yaw: lerpA(0, PI, M.smooth(s / 3)), pose: HA.stand(s + 70, huntHorse.seed) }));   // south end
          S.walk(laneBetween(16, -2).concat([[laneX(UG[3]), -2]], IN.slice().reverse(), [REST]), 1.1, huntHorse, { endYaw: -PI / 2 });
          S.holdTo(180, stand);
          const h = actor(huntHorse, S, { rider: hunt, riderSeed: 11.3 });
          const r = actor(hunt, null, { noBlob: true, mounted: true });
          h.riderActor = r;
          ctx.tag('hunt', () => hunt.headTop(), { onTap: (now) => { r.gest = { at: now, dur: 3.2, pose: OP.hatRaise }; } });
        }
        // the Confederate officer: at the woods' edge north of the gun line, then a brisk ride along the row between
        // the gun trails and the limbers (x about woodsEdgeX + 2) behind the lines as they dress and step off, a turn,
        // and back into the trees (BRIEF 82–96; here 96–114, once the lines have passed through the row: see the report)
        {
          const CG = ctx.spots.CSA_GUNS, rowX = (g) => g.x - 3.3;
          const REST = [-35, -23.8];
          const row = CG.filter((g) => g.z > -23 && g.z < -7.5).map((g) => [rowX(g), g.z]);      // guns 1..4, north to south
          const last = row[row.length - 1], loop = [[last[0] + 0.9, last[1] + 1.3], [last[0] + 0.3, last[1] + 2.4], [last[0] - 1.0, last[1] + 2.2], [last[0] - 1.4, last[1] + 0.9]];
          const back = row.slice().reverse();
          const S = new K.Script(REST[0], REST[1], PI / 2, 'csaOfficer');
          const stand = (s, I) => ({ pose: HA.stand(I.t, csaHorse.seed) });
          S.holdTo(96, stand);
          S.walk([[rowX(CG[0]) - 0.3, -24.5]].concat(row, loop, back, [[rowX(CG[0]) - 0.3, -24.5], REST]), 1.8, csaHorse, { endYaw: PI / 2 });
          S.holdTo(180, stand);
          const h = actor(csaHorse, S, { rider: csaOff, riderSeed: 4.7 });
          const r = actor(csaOff, null, { noBlob: true, mounted: true });
          h.riderActor = r;
          ctx.tag('csaOfficer', () => csaOff.headTop(), { onTap: (now) => { r.gest = { at: now, dur: 3.2, pose: OP.point }; } });
        }
        // Lt. Haskell: lunch, the watch at five to one, the glasses through the cannonade and the advance, a point at
        // the wall, then the fire at night and back to his place for the morning
        {
          const [hx, hz] = F.haskell, FIRE = [51, -4], SEAT = [49.9, -2.9];
          const seed = haskell.seed;
          const eat = (s, I) => {
            const p = K.idle(I.t, seed, HP.sit), u = 0.5 + 0.5 * Math.sin(I.t * 0.9 + seed);
            p.e1 = 1.75 + 0.32 * u; p.af1 = 0.9 + 0.22 * u; p.hx = 0.18 + 0.1 * u;
            return { pose: p };
          };
          const watch = (s, I) => {
            // glasses up for nine seconds of every fourteen, sweeping slowly; lowered between
            const u = (I.ct + 3) % 14, w = win(u, 0, 9.5, 1.3);
            const p = mix(K.idle(I.t, seed, haskell.base), P(HP.glasses), w);
            p.hy += 0.22 * w * Math.sin(I.t * 0.33 + seed);
            if (I.ct > 29.5 && I.ct < 31.5) { const k = win(I.ct - 29.5, 0, 2, 0.5); p.hx -= 0.2 * k; }   // the first gun: he looks up
            return { pose: p };
          };
          const S = new K.Script(hx, hz, -PI / 2, 'haskell');
          S.holdTo(28, eat);
          S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, seed, RISE) }));
          S.holdTo(31.5, (s, I) => ({ pose: K.idle(I.t, seed, HP.watch) }));
          S.holdTo(124, watch);
          S.holdTo(132, (s, I) => ({ yaw: -1.75, pose: K.idle(I.t, seed, HP.point) }));
          S.holdTo(150, watch);
          S.walk([SEAT], 1.0, haskell, { endYaw: yawTo(SEAT[0], SEAT[1], FIRE[0], FIRE[1]) });
          S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, seed, RISE) }));
          S.holdTo(170.5, (s, I) => ({ pose: K.idle(I.t, seed, HP.sit) }));
          S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, seed, RISE) }));
          S.walk([[hx, hz]], 1.0, haskell, { endYaw: -PI / 2 });
          S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, seed, RISE) }));
          S.holdTo(180, eat);
          const a = actor(haskell, S);
          ctx.tag('haskell', () => haskell.headTop(), { onTap: (now) => { a.gest = { at: now, dur: 3.2, pose: HP.hatRaise }; } });
          // his horse, tied behind him, eating with the greatest composure
          const HX = 46.3, HZ = -3.6;
          const Sh = new K.Script(HX, HZ, 0.3, 'horse');
          Sh.holdTo(180, (s, I) => {
            const u = (I.ct + 5) % 26, w = win(u, 0, 6, 1.5);              // head up for a look now and then
            return { pose: mix(HA.graze(I.t, hasHorse.seed), HA.stand(I.t, hasHorse.seed), w) };
          });
          const ah = actor(hasHorse, Sh);
          ctx.tag('horse', () => hasHorse.headTop(), { onTap: (now) => { ah.toss = now; } });
        }
        // two limber teams, standing hitched at the pole end behind a Union and a Confederate limber: grazing, and
        // a toss of the head after each shot of their gun
        {
          // the Confederate team is behind gun 0 at the north end: the lines (armies.js) step out through the battery
          // intervals from z -24 to 20, so nothing behind a gun from 1 to 10 is clear of them
          const teams = [['union', 1, 1], ['csa', 0, -1]];
          let k = 0;
          for (const [side, i, dir] of teams) {
            const g = ctx.spots[side === 'csa' ? 'CSA_GUNS' : 'UNION_GUNS'][i];
            // at the pole end if the trees allow (the Confederate limbers back onto the woods), else as near it as is clear
            let c = [g.x + dir * 8.0, g.z];
            if (nearest(c[0], c[1]) < 2.6) c = findClear(g.x + dir * 7.4, g.z, 1.6, (x, z) => Math.abs(x - g.x) > 5.8 && Math.abs(x - g.x) < 9.5 && Math.abs(z - g.z) < 1.6);
            this.teamSpots = (this.teamSpots || []).concat([c]);
            for (const dz of [-0.6, 0.6]) {
              const h = team[k++], S = new K.Script(c[0], c[1] + dz, dir > 0 ? PI / 2 : -PI / 2, 'team');
              const off = k * 7.3;
              S.holdTo(180, (s, I) => {
                const u = (I.ct + off) % 31, w = win(u, 0, 7, 1.6);
                return { pose: mix(HA.graze(I.t, h.seed), HA.stand(I.t, h.seed), w) };
              });
              actor(h, S, { tossGun: [side, i] });
            }
          }
        }
      }

      // ---------- rig 3: the camps and the hill ----------
      {
        const rig = kit.makeRig();
        const csa = [0, 1, 2, 3].map((k) => CH.csa.make(ctx, B, kit, rig, { col: k % 2 ? 'butternut' : 'gray', beard: k !== 2 }));
        const union = [0, 1, 2].map((k) => CH.union.make(ctx, B, kit, rig, { beard: k !== 1 }));
        const hill = [0, 1, 2, 3].map((k) => CH.union.make(ctx, B, kit, rig, { beard: k % 2 === 0 }));
        B.finish(rig, ctx.root);

        // the Confederate camp: by the fires morning and night; out west into the trees before the lines form, back
        // by the evening (they're the camp, not the charge)
        {
          const [cx, cz] = F.csaCamp;
          const FIRES = [[cx, cz], [cx + 4, cz + 3], [cx - 3, cz + 4]];
          // the way out of the clearing: between the lean-tos at (-52, 8.5) and (-58, 7), then through the ring of
          // trees to a spot at least 14 m from the camp and 8 m deeper in the woods, found clear of the trunks
          const W1 = [cx - 3.2, cz + 6.6];
          const deep = [];
          {
            const cands = [];
            for (let x = cx - 18; x <= cx - 8; x += 0.5) for (let z = cz + 6; z <= cz + 19; z += 0.5) {
              if (Math.hypot(x - cx, z - cz) < 14 || nearest(x, z) < 1.1) continue;
              cands.push([x, z, Math.hypot(x - (cx - 12), z - (cz + 11))]);
            }
            cands.sort((a, b) => a[2] - b[2]);
            // a middle waypoint on the ring's edge with clear legs both ways
            const mids = [];
            for (let a = 0.05; a <= 1.45; a += 0.05) for (const r of [4, 5, 6]) {
              const m = [W1[0] - Math.cos(a) * r, W1[1] + Math.sin(a) * r];   // out from W1: a = 0 west, pi/2 south
              if (nearest(m[0], m[1]) >= 1.0 && segClear(W1, m, 0.9)) mids.push(m);
            }
            for (const c of cands) {
              if (deep.length >= 4) break;
              if (deep.some((d) => dist(d, c) < 2.4)) continue;
              const m = mids.find((mm) => segClear(mm, c, 0.9));
              if (!m) continue;
              deep.push([c[0], c[1]]);
              deep[deep.length - 1].mid = m;
            }
            while (deep.length < 4) { const d = [cx - 11 - deep.length * 1.5, cz + 11]; d.mid = [cx - 7, cz + 9]; deep.push(d); }
          }
          this.deep = deep;
          // [fire, seat, route into the clearing's gap, then out]
          const plan = [
            [FIRES[0], [cx - 1.8, cz + 0.9], [[cx - 0.6, cz + 4.6], W1]],
            [FIRES[0], [cx + 1.3, cz - 1.6], [[cx + 2.4, cz + 2.4], [cx - 0.2, cz + 5.0], W1]],
            [FIRES[1], [cx + 5.1, cz + 1.6], [[cx + 1.2, cz + 6.3], W1]],
            [FIRES[2], [cx - 4.9, cz + 2.5], [W1]],
          ];
          plan.forEach(([fire, seat, way], k) => {
            const route = way.concat([deep[k].mid, deep[k]]);
            const f = csa[k], faceFire = yawTo(seat[0], seat[1], fire[0], fire[1]) + 0.5;   // angled, so the musket across the knees clears the fire
            const sit = (s, I) => {
              const p = K.idle(I.t, f.seed, CP.sit);
              if (I.ct > 30 && I.ct < 36) p.hy += K.lookYaw(seat[0], seat[1], faceFire, 0, seat[1], 1.0) * win(I.ct - 30, 0, 6, 1.5);   // the first gun
              return { pose: p };
            };
            const S = new K.Script(seat[0], seat[1], faceFire, 'csa' + k);
            S.holdTo(62 + k * 2.1, sit);
            S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, f.seed, RISE) }));
            S.walk(route, 0.95, f, { endYaw: PI / 2 });
            S.holdTo(138 + k * 2.3, (s, I) => ({ pose: K.idle(I.t, f.seed, k % 2 ? CP.kneel : f.base) }));
            S.walk(route.slice(0, -1).reverse().concat([seat]), 0.95, f, { endYaw: faceFire });
            S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, f.seed, RISE) }));
            S.holdTo(180, sit);
            const a = actor(f, S);
            if (k === 0) ctx.tag('csaSoldier', () => f.headTop(), { onTap: (now) => { a.gest = { at: now, dur: 3.2, pose: CP.wave, wave: true }; } });
          });
        }
        // the Union camp: by the fires morning and night, at the stacked muskets through the day, looking west
        {
          const [cx, cz] = F.unionCamp;
          const plan = [
            // [fire, seat, stand spot, when he gets up, when he comes back, kneels in between]
            [[cx, cz], [cx - 1.7, cz + 0.7], [51.6, -10.3], 33, 144, false],
            [[cx + 4, cz + 3], [cx + 5.6, cz + 4.0], [58.6, -9.0], 36, 148, true],
            [[cx - 3, cz + 4], [cx - 4.2, cz + 2.6], [49.6, -6.6], 38.5, 141, false],
          ];
          plan.forEach(([fire, seat, spot, up, back, kneels], k) => {
            const f = union[k], faceFire = yawTo(seat[0], seat[1], fire[0], fire[1]) + 0.5;
            const sit = (s, I) => {
              const p = K.idle(I.t, f.seed, UP.sit);
              if (I.ct > 30 && I.ct < 36) p.hy += K.lookYaw(seat[0], seat[1], faceFire, 0, seat[1], 1.0) * win(I.ct - 30, 0, 6, 1.5);
              return { pose: p };
            };
            const stand = (s, I) => {
              const p = K.idle(I.t, f.seed, f.base);
              if (kneels) { const u = (I.ct + 7) % 40, w = win(u, 0, 14, 1.5); return { pose: mix(p, K.idle(I.t, f.seed, UP.kneel), w) }; }
              return { pose: p };
            };
            const S = new K.Script(seat[0], seat[1], faceFire, 'union' + k);
            S.holdTo(up, sit);
            S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, f.seed, RISE) }));
            S.walk([spot], 0.95, f, { endYaw: -PI / 2 });
            S.holdTo(back, stand);
            S.walk([seat], 0.95, f, { endYaw: faceFire });
            S.hold(1.2, (s, I) => ({ pose: K.idle(I.t, f.seed, RISE) }));
            S.holdTo(180, sit);
            const a = actor(f, S);
            if (k === 0) ctx.tag('unionSoldier', () => f.headTop(), { onTap: (now) => { a.gest = { at: now, dur: 3.2, pose: UP.wave, wave: true }; } });
          });
        }
        // Little Round Top: four men crouched behind the boulders, peeking over now and then
        {
          const spots = (window.__land && window.__land.hiding && window.__land.hiding.length >= 4) ? window.__land.hiding : HIDING_FALLBACK;
          const FIRE_AT = [];   // no shots: men among these rocks on July 3 aren't confirmed (research.md gap 9); they keep low and peek
          this.fireAt = FIRE_AT;
          hill.forEach((f, k) => {
            const sp = spots[k], face = sp.face !== undefined ? sp.face : -PI / 2;
            const S = new K.Script(sp.x, sp.z, face, 'hill' + k);
            const off = k * 4.1 + 2;
            S.holdTo(180, (s, I) => {
              const ct = I.ct;
              // a peek: up on one knee for three seconds every thirteen (more often while the firing is on)
              const T = ct > 105 && ct < 126 ? 8 : 13, u = (ct + off) % T, w = win(u, 0, 3.2, 1.0);
              let p = mix(K.idle(I.t, f.seed, UP.crouch), K.idle(I.t, f.seed, UP.kneel), w);
              if (k === 0) {
                let a = 0, kick = 0;
                for (const ft of FIRE_AT) { a = Math.max(a, win(ct - (ft - 1.4), 0, 3.4, 0.9)); kick = Math.max(kick, win(ct - ft, 0, 0.35, 0.1)); }
                p = mix(p, K.idle(I.t, f.seed, UP.aim), a);
                p.lean -= 0.07 * kick; p.hx -= 0.08 * kick;
              }
              return { pose: p };
            });
            actor(f, S, { hill: true });
          });
          this.shooter = hill[0];
          ctx.addName('Union sharpshooters', () => hill[1].headTop(), { kind: 'Union soldiers', line: 'They kept low behind the big boulders. The rock was too close under the soil to dig.' });
          // the musket's smoke: one small faceted puff, scaled up and faded out
          const puffMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ctx.lin(ctx.C.smoke || 0xe8e2d6)), transparent: true, opacity: 0.8, depthWrite: false });
          const puff = new THREE.Mesh(ctx.jitterGeo(new THREE.IcosahedronGeometry(1, 1), 0.25, 5), puffMat);
          puff.visible = false;
          ctx.root.add(puff);
          this.puff = puff;
        }
      }
      this.lastCt = -1;
      this.I = { t: 0, ct: 0, n: 0 };
      window.__people = this;   // for the checking tools
      this.tmp = new THREE.Vector3();
    },

    // one gun's two crewmen: No. 1 at the muzzle with the rammer, the gunner at the breech. Before each shot No. 1
    // steps to the muzzle, rams twice, steps clear and stands back; the gunner stands back and pulls the lanyard.
    // Quiet otherwise; at night one sits on the ground by the wheel and one on the trail.
    crew(ctx, c, actor, hold, holdForWalk, idle, GUNS, shotsOf, GP, mirror) {
      const K = ctx.figureKit, M = window.Motion, P = K.P, mix = K.mix, win = M.win;
      const g = ctx.spots[c.side === 'csa' ? 'CSA_GUNS' : 'UNION_GUNS'][c.i], face = g.face, m = mirror ? -1 : 1;
      const fx = Math.sin(face), fz = Math.cos(face), lx = Math.cos(face) * m, lz = -Math.sin(face) * m;
      const at = ([a, b]) => [g.x + fx * a + lx * b, g.z + fz * a + lz * b];
      const RAM = at(SPOT.ram), SIDE = at(SPOT.side), BREECH = at(SPOT.breech), NIGHT1 = at(SPOT.night1), NIGHT2 = at(SPOT.night2);
      const T = shotsOf(c.side, c.i), jit = (c.i * 1.7) % 2.2;
      const f1 = c.f1, f2 = c.f2;
      // No. 1
      {
        const standBack = Object.assign({}, GP.standBack, { hy: 0.7 * m });
        const pull = Object.assign({}, GP.ram, { lean: 0.06, lf0: 0.4, k0: 0.4, lf1: -0.15, k1: 0.05, af0: 1.05, e0: 0.55, af1: 0.95, e1: 0.72 });
        const ready = idle(f1, GP.ready);
        const S = new K.Script(SIDE[0], SIDE[1], face, c.side + c.i + 'a');
        let prev = -99;
        for (const t of T) {
          if (t - prev >= 6.3 && t - 5.2 > S.T) {
            holdForWalk(S, [RAM], 1.1, t - 3.6, ready);
            S.walk([RAM], 1.1, f1, { endYaw: face + Math.PI });
            hold(S, t - 2.2, (s) => { const k = Math.pow(Math.sin(Math.PI * s / 0.7), 2); return { pose: mix(P(pull), P(GP.ram), k) }; });
            S.walk([SIDE], 1.1, f1, { endYaw: face });
          }
          hold(S, t - 0.8, ready);
          hold(S, t + 1.2, idle(f1, standBack));
          prev = t;
        }
        hold(S, 152 + jit, ready);
        S.walk([NIGHT1], 0.9, f1, { endYaw: Math.atan2(-lx, -lz) });
        S.hold(1.2, idle(f1, { lf0: 0.85, lf1: 0.95, k0: 1.3, k1: 1.35, lean: 0.5, hx: -0.15, af0: 0.5, e0: 0.6, af1: 0.45, e1: 0.55 }));
        hold(S, 172.5 + jit, idle(f1, GP.sit));
        S.hold(1.2, idle(f1, { lf0: 0.85, lf1: 0.95, k0: 1.3, k1: 1.35, lean: 0.5, hx: -0.15, af0: 0.5, e0: 0.6, af1: 0.45, e1: 0.55 }));
        S.walk([SIDE], 0.9, f1, { endYaw: face });
        hold(S, 180, ready);
        actor(f1, S);
      }
      // the gunner at the breech
      {
        const standBack = Object.assign({}, GP.standBack, { hy: -0.6 * m, af1: 0.5, e1: 0.9, ao1: 0.3 });
        const TRAIL_SIT = { lf0: 1.22, lf1: 1.3, k0: 1.2, k1: 1.3, lo0: 0.08, lo1: 0.08, lean: 0.14, hx: 0.1, af0: 0.62, e0: 1.15, af1: 0.52, e1: 1.0, ao0: 0.06, ao1: 0.06 };
        const work = (s, I) => {
          const ct = I.ct, p = K.idle(I.t, f2.seed, GP.ready);
          const a = GUNS.lastShotBefore(c.side, c.i, ct), b = GUNS.nextShotAfter(c.side, c.i, ct);
          let w = 0, y = 0;
          for (const sh of [a, b]) if (sh) { w = Math.max(w, win(ct - (sh.t - 1.1), 0, 2.4, 0.5)); y = Math.max(y, win(ct - (sh.t - 0.4), 0, 0.55, 0.12)); }
          const q = mix(p, K.idle(I.t, f2.seed, standBack), w);
          q.af1 -= 0.45 * y; q.e1 -= 0.3 * y; q.lean -= 0.05 * y;   // the lanyard
          return { pose: q };
        };
        const S = new K.Script(BREECH[0], BREECH[1], face, c.side + c.i + 'b');
        hold(S, 153.5 + jit, work);
        S.walk([NIGHT2], 0.9, f2, { endYaw: Math.atan2(lx, lz) });
        hold(S, 173.5 + jit, idle(f2, TRAIL_SIT));
        S.walk([BREECH], 0.9, f2, { endYaw: face });
        hold(S, 180, work);
        actor(f2, S);
      }
    },

    update(t, dt, ctx) {
      const K = ctx.figureKit, M = window.Motion, CH = window.CHARACTERS, ct = ctx.cycle.t;
      const I = this.I; I.t = t; I.ct = ct; I.n = ctx.cycle.n;
      const GUNS = window.GUNS;
      for (const a of this.actors) {
        if (a.mounted) continue;                                  // riders are placed by their horse below
        const st = a.S.sample(ct, I);
        // a tap moment laid over the timeline: only the gesture's own joints move, blended in and out
        if (a.gest) {
          const w = M.win(t - a.gest.at, 0, a.gest.dur, 0.6);
          if (w > 0) { const g = a.gest.pose; for (const k in g) st.pose[k] = st.pose[k] + (g[k] - st.pose[k]) * w; if (a.gest.wave) st.pose.e0 += 0.3 * w * Math.sin(t * 9); }
          else if (t - a.gest.at > a.gest.dur) a.gest = null;
        }
        // horses: a toss of the head on a tap, or after a shot of their own gun
        if (a.toss !== undefined || a.tossGun) {
          let u = a.toss !== undefined ? (t - a.toss) / 1.6 : 2;
          if (a.tossGun && GUNS) { const sh = GUNS.lastShotBefore(a.tossGun[0], a.tossGun[1], ct); if (sh) { const v = (ct - sh.t - 0.15) / 1.6; if (v >= 0 && v < 1) u = v; } }
          if (u >= 0 && u < 1) st.pose = CH.horse.anim.toss(u, a.seed, st.pose);
        }
        a.f.set(st);
        a.f.eyes.scale.y = M.blink(t, a.seed);
        if (a.blob) { const p = a.f.root.position; a.blob.set(p.x, ctx.surfaceY(p.x, p.z), p.z); }
        // the rider sits on the saddle point, following the horse's body as it rises and falls with its steps
        if (a.rider) {
          const r = a.riderActor, h = a.f, ride = CH.officer.ride;
          const dy = h.body.position.y - 0.96, yaw = h.root.rotation.y;
          const pose = K.idle(t, a.riderSeed, CH.officer.poses.ride);
          pose.lean += 0.4 * (st.pose.wk || 0) * (-dy);
          pose.hy += 0.25 * Math.sin(t * 0.21 + a.riderSeed) * (st.pose.wk ? 1 : 0.4);
          if (r.gest) {
            const w = M.win(t - r.gest.at, 0, r.gest.dur, 0.6);
            if (w > 0) { const g = r.gest.pose; for (const k in g) pose[k] = pose[k] + (g[k] - pose[k]) * w; }
            else if (t - r.gest.at > r.gest.dur) r.gest = null;
          }
          const p = h.root.position;
          a.rider.set({ x: p.x + Math.sin(yaw) * 0.12, z: p.z + Math.cos(yaw) * 0.12, y: p.y + dy + ride.saddleTop - ride.hipAboveOrigin + 0.02, yaw, pose });
          a.rider.eyes.scale.y = M.blink(t, a.riderSeed);
        }
      }
      // the sharpshooter's shot: a puff at the muzzle and a crack, at the moment the timeline says
      const puff = this.puff;
      let shown = false;
      for (const ft of this.fireAt) {
        const u = ct - ft;
        if (u >= 0 && u < 2.2) {
          shown = true;
          const f = this.shooter, p = f.root.position, yaw = f.root.rotation.y;
          const k = u / 2.2, s = 0.1 + 0.38 * (1 - Math.pow(1 - k, 2));
          puff.position.set(p.x + Math.sin(yaw) * (1.15 + 0.7 * k), p.y + 1.28 + 0.45 * k, p.z + Math.cos(yaw) * (1.15 + 0.7 * k));
          puff.scale.setScalar(s);
          puff.material.opacity = 0.75 * (1 - k * k);
          if (this.lastCt < ft && ct >= ft && ct - this.lastCt < 1) ctx.boom(p.x, p.y + 1.3, p.z, 0.3);
        }
      }
      puff.visible = shown;
      this.lastCt = ct;
    },
  });
})();
