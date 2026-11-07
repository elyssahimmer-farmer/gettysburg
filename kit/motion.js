// motion.js: how the scenes' characters move, shared by the Council, the elves and the Shire's hobbits.
// Poses are the flat bags of joint angles the scenes already use (lf/k legs, af/ao/at/e arms, hx/hy/hz head, lean
// twist roll the torso). Load it before the plug-ins; everything is on window.Motion.
//
//   gait(ph, amt, A, arms) → the walking parts of a pose, to add to a base pose. Each leg spends 60% of its cycle on
//     the ground sweeping back at an even rate, so the foot stays put while the body passes over it, and 40% swinging
//     forward with the knee lifted. A is the leg's swing (radians; legSwing gives the one that matches a stride),
//     arms the arm swing. ph is the stride phase (2π per two steps), amt 0..1 how much the figure is walking.
//   legSwing(stride, leg) → A for a stride (metres per two steps) and a leg (hip to ankle, metres).
//   ease(L, dur) → s → [distance, speed]: a walk of L metres that eases up to speed and back down, still taking dur.
//   strides(ease, dur, stride) → s → [phase, amount]: the stride phase along an eased walk. The steps shorten
//     while the walker is slow, so the feet keep up with the ground instead of sliding at the start and end.
//   lag(slower) → (pose) → pose: follow-through. The head, arms and torso catch up with each new pose a moment late,
//     the way a body's weight lags, which takes the snap out of every change. One per figure, called once a frame.
//     slower: { key: seconds } to change how long any angle takes (e.g. a looser head).
//   life(t, seed, pose, standing) → the pose with breathing, slow weight shifts and now and then a glance aside.
//   blink(t, seed) → how open the eyes are, 0..1.
//   BLEND, TURN: seconds a new step's pose and facing take to blend in.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
  // 0 → 1 → 0 over [a, b] with soft shoulders e long
  const win = (s, a, b, e) => smooth((s - a) / e) * (1 - smooth((s - (b - e)) / e));

  const STANCE = 0.6;
  // [swing angle -1..1, knee lift in the swing, knee give in the stance]
  function leg(ph) {
    const u = ((ph / TAU) % 1 + 1) % 1;
    if (u < STANCE) { const k = u / STANCE; return [1 - 2 * k, 0, Math.sin(k * Math.PI)]; }
    const k = (u - STANCE) / (1 - STANCE);
    return [-1 + 2 * smooth(k), Math.sin(k * Math.PI), 0];
  }
  function gait(ph, amt, A, arms) {
    A = A || 0.45; arms = arms === undefined ? 0.36 : arms;
    const l0 = leg(ph), l1 = leg(ph + Math.PI), s = Math.sin(ph), c = Math.cos(ph);
    // the arms swing against the legs a beat behind them, the elbow bending more on the way forward
    const sa = Math.sin(ph - 0.35);
    return {
      lf0: A * l0[0] * amt, lf1: A * l1[0] * amt,
      k0: amt * (0.06 + 0.85 * l0[1] + 0.1 * l0[2]), k1: amt * (0.06 + 0.85 * l1[1] + 0.1 * l1[2]),
      af0: -arms * sa * amt, af1: arms * sa * amt,
      e0: amt * (0.12 + 0.14 * Math.max(0, -sa)), e1: amt * (0.12 + 0.14 * Math.max(0, sa)),
      // the shoulders turn against the hips, the weight rocks over the foot on the ground, the head keeps looking ahead
      twist: 0.07 * s * amt, roll: 0.03 * c * amt, hy: -0.05 * s * amt, lean: 0.045 * amt,
    };
  }
  const legSwing = (stride, legLen) => clamp(Math.asin(clamp(STANCE * stride / (2 * legLen), 0, 0.9)), 0.25, 0.6);

  function ease(L, dur) {
    const ra = Math.min(0.7, dur * 0.3), v = L / Math.max(1e-6, dur - ra);
    const f = (s) => {
      if (s <= 0) return [0, 0];
      if (s >= dur) return [L, 0];
      if (s < ra) return [0.5 * v * s * s / ra, v * s / ra];
      if (s > dur - ra) { const r = dur - s; return [L - 0.5 * v * r * r / ra, v * r / ra]; }
      return [v * (s - ra / 2), v];
    };
    f.v = v;
    return f;
  }
  function strides(ez, dur, stride) {
    const n = Math.max(2, Math.ceil(dur * 30)), ph = new Float32Array(n + 1), am = new Float32Array(n + 1);
    let acc = 0, d0 = 0;
    for (let i = 0; i <= n; i++) {
      const [d, sp] = ez(i / n * dur), a = Math.sqrt(clamp(sp / ez.v, 0, 1));
      acc += (d - d0) / (stride * Math.max(0.35, a)) * TAU;
      d0 = d; ph[i] = acc; am[i] = a;
    }
    return (s) => {
      const x = clamp(s / dur, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), k = x - i;
      return [lerp(ph[i], ph[i + 1], k), lerp(am[i], am[i + 1], k)];
    };
  }

  // seconds each angle takes to catch up (a time constant): the head the slowest, then the arms, then the torso
  const LAG = { lean: 0.07, twist: 0.08, roll: 0.07, hx: 0.16, hy: 0.24, hz: 0.16,
    af0: 0.08, af1: 0.08, ao0: 0.09, ao1: 0.09, at0: 0.09, at1: 0.09, e0: 0.1, e1: 0.1 };
  function lag(slower) {
    const LAG2 = Object.assign({}, LAG, slower || {});
    let held = null, last = 0;
    return (p) => {
      const now = performance.now() / 1000, dt = now - last;
      if (!held || dt > 0.3 || dt < 0) { held = {}; for (const k in LAG2) held[k] = p[k]; }
      else if (dt > 0) for (const k in LAG2) if (p[k] !== undefined) held[k] += (p[k] - held[k]) * (1 - Math.exp(-dt / LAG2[k]));
      last = now;
      const o = Object.assign({}, p);
      for (const k in LAG2) if (p[k] !== undefined) o[k] = held[k];
      return o;
    };
  }

  function life(t, seed, p, standing) {
    const br = Math.sin(t * 1.7 + seed);
    p.lean += 0.008 * br; p.ao0 += 0.012 * br; p.ao1 += 0.012 * br; p.hx -= 0.006 * br;
    // weight from foot to foot every several seconds
    const ws = Math.sin(t * 0.19 + seed * 5) * Math.sin(t * 0.07 + seed);
    p.roll += 0.025 * ws;
    if (standing) { p.k0 += 0.07 * Math.max(0, ws); p.k1 += 0.07 * Math.max(0, -ws); p.lo0 += 0.02 * ws; p.lo1 -= 0.02 * ws; }
    // now and then a glance to one side for a couple of seconds
    const T = 9, u = t + seed * 13, n = Math.floor(u / T), r = hash(n, seed);
    if (r < 0.6) {
      const g = win(u - n * T - r * 4, 0, 2.6, 0.7) * (hash(seed, n) < 0.5 ? -1 : 1);
      p.hy += 0.38 * g; p.hz += 0.05 * g; p.hx -= 0.04 * Math.abs(g);
    }
    return p;
  }

  function blink(t, seed) {
    const T = 3.8, u = t + seed * 7, n = Math.floor(u / T), x = (u - n * T - hash(n, seed) * 2.6) / 0.15;
    let open = x >= 0 && x < 1 ? Math.abs(1 - 2 * x) : 1;
    // sometimes a second blink straight after
    if (hash(seed, n + 0.5) < 0.2) { const y = x - 1.6; if (y >= 0 && y < 1) open = Math.abs(1 - 2 * y); }
    return Math.max(0.1, open);
  }

  window.Motion = { gait, legSwing, ease, strides, lag, life, blink, smooth, win, BLEND: 0.8, TURN: 0.9 };
})();
