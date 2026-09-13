/* The bike itself. Every number below was measured from the simulation and
   then bracketed; nothing here asserts a value that was assumed.
   Where a band is wide it is because the honest answer is a range. */
const { loadGame, A, near, between, report, info } = require('./lib');
const T = loadGame();
const DT = T.WORLD.DT;

const strip = (surf, halfZ) => T.buildFlat(26, surf, 0, halfZ || 320);
const spd = (b) => Math.hypot(b.v[0], b.v[2]);
const deg = (r) => r * 180 / Math.PI;

/* ===================================================== standing still === */
{
  strip(T.SURF.HARDPACK, 60);
  const rows = [];
  let allSum = true, allSag = true, allDrift = true;
  for (const key of ['450f', '250f', '250tc', '125tc', '85tc']) {
    const b = T.makeBike(key); T.resetBike(b, 0, 0, 0);
    T.stepBike(b, 4);
    const y0 = b.p[1];
    T.stepBike(b, 3);
    const d1 = Math.abs(b.p[1] - y0);
    const y1 = b.p[1];
    T.stepBike(b, 3);
    const d2 = Math.abs(b.p[1] - y1);
    const W = (b.cfg.massBike + b.cfg.riderMass) * T.WORLD.g;
    const sum = b.wf.N + b.wr.N;
    const tgt = T.designSag(b.cfg);
    const frontPct = 100 * b.wf.N / sum;
    rows.push([key, sum / W, b.susp.f.x * 1000, b.susp.r.x * 1000, frontPct, d1 * 1000, d2 * 1000]);
    if (Math.abs(sum / W - 1) > 0.012) allSum = false;
    if (Math.abs(b.susp.f.x - tgt.f) > 0.004 || Math.abs(b.susp.r.x - tgt.r) > 0.005) allSag = false;
    if (d2 > 0.0008 || d2 > d1 + 1e-6) allDrift = false;   // settling, not drifting
  }
  for (const r of rows) info(r[0].padEnd(6), 'load/weight', r[1].toFixed(4),
    '| sag', r[2].toFixed(0) + '/' + r[3].toFixed(0), 'mm | front', r[4].toFixed(0) + '%',
    '| moved', r[5].toFixed(2), 'then', r[6].toFixed(2), 'mm in successive 3 s windows');
  A(allSum, 'the wheels carry exactly the weight of bike plus rider, on every bike');
  A(allSag, 'every bike settles at its design race sag');
  A(allDrift, 'and settles rather than drifting: each window moves less than the last');
  const fp = rows.map(r => r[4]);
  A(Math.min(...fp) > 42 && Math.max(...fp) < 52,
    'front wheel carries 42-52 % of the weight with the rider aboard  [' +
    fp.map(v => v.toFixed(0)).join(', ') + ']');
}

/* ================================================== straight and level == */
{
  strip(T.SURF.HARDPACK, 420);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 400, 0, { speed: 24 });
  b.inp.clutch = 1;
  let worstLean = 0;
  for (let i = 0; i < 500 * 12; i++) { T.physStep(b, DT); worstLean = Math.max(worstLean, Math.abs(b.lean)); }
  info('after 12 s of coasting: lean', deg(worstLean).toFixed(3), 'deg, drift',
       Math.abs(b.p[0]).toFixed(3), 'm sideways, speed', spd(b).toFixed(1), 'm/s');
  A(deg(worstLean) < 0.5, 'a coasting bike stays upright by itself  [' + deg(worstLean).toFixed(3) + ' deg]');
  A(Math.abs(b.p[0]) < 0.5, 'and goes where it was pointed  [' + Math.abs(b.p[0]).toFixed(3) + ' m off line]');
  A(!b.crashed, 'and does not fall over');
}

/* ===================================================== coasting down ==== */
{
  strip(T.SURF.HARDPACK, 420);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 400, 0, { speed: 25 });
  b.inp.clutch = 1;
  const marks = [];
  let last = 25;
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 500; i++) T.physStep(b, DT);
    const v = spd(b); marks.push(last - v); last = v;
  }
  info('coast-down deceleration per second:', marks.map(m => m.toFixed(2)).join(', '), 'm/s^2');
  between(marks[0], 0.8, 2.5, 'a coasting bike sheds speed at a believable rate at 25 m/s');
  A(marks[0] > marks[3], 'and sheds it more slowly as the drag falls away');
}

/* ================================================== acceleration ======== */
const accel = {};
{
  for (const key of ['450f', '250f', '250tc', '125tc', '85tc']) {
    strip(T.SURF.HARDPACK, 900);
    const b = T.makeBike(key); T.resetBike(b, 0, 880, 0, { speed: 5 });
    b.inp.leanZ = 0.8;
    let t = 0, t20 = 0, vmax = 0;
    for (let i = 0; i < 500 * 45; i++) {
      T.autoGearbox(b, 1); b.inp.throttle = T.riderThrottle(b, 1, 1);
      T.physStep(b, DT); t += DT;
      const v = spd(b); if (v > vmax) vmax = v;
      if (!t20 && v >= 20) t20 = t;
      if (b.crashed || b.p[2] < -870) break;
    }
    accel[key] = { t20, vmax, crashed: b.crashed };
    info(key.padEnd(6), '5->20 m/s in', (t20 ? t20.toFixed(2) : 'never'), 's | top speed',
      (vmax * 3.6).toFixed(0), 'km/h | crashed', b.crashed);
  }
  A(!Object.values(accel).some(a => a.crashed), 'no bike falls over simply accelerating in a straight line');
  between(accel['450f'].t20, 1.8, 3.6, 'the 450 pulls 5 to 20 m/s in a believable time');
  between(accel['450f'].vmax * 3.6, 120, 175, 'and tops out where a 450 motocross bike tops out');
  A(accel['85tc'].t20 > accel['450f'].t20 * 1.3, 'the 85 is clearly slower than the 450  [' +
    accel['85tc'].t20.toFixed(2) + ' s vs ' + accel['450f'].t20.toFixed(2) + ' s]');
  A(accel['85tc'].vmax < accel['450f'].vmax, 'and does not go as fast');
  A(accel['250f'].t20 > accel['250tc'].t20,
    'the 250 four-stroke is slower off the bottom than the 250 two-stroke  [' +
    accel['250f'].t20.toFixed(2) + ' vs ' + accel['250tc'].t20.toFixed(2) + ' s]');
}

/* ======================================================== braking ======= */
{
  const stop = (fb, rb, modulate, surf) => {
    strip(surf === undefined ? T.SURF.HARDPACK : surf, 200);
    const b = T.makeBike('450f'); T.resetBike(b, 0, 180, 0, { speed: 20 });
    b.inp.clutch = 1; b.inp.leanZ = -1;
    const p0 = [b.p[0], b.p[2]];
    for (let i = 0; i < 500 * 12; i++) {
      if (modulate) { const br = T.riderBrake(b, fb, rb, 1); b.inp.brakeF = br[0]; b.inp.brakeR = br[1]; }
      else { b.inp.brakeF = fb; b.inp.brakeR = rb; }
      T.physStep(b, DT);
      if (spd(b) < 0.4) break;
    }
    return { d: Math.hypot(b.p[0] - p0[0], b.p[2] - p0[1]), crashed: b.crashed, why: b.crashReason };
  };
  const f = stop(1, 0, true), r = stop(0, 1, true), both = stop(1, 0.45, true), locked = stop(1, 1, false);
  info('from 20 m/s: front', f.d.toFixed(1), 'm | rear', r.d.toFixed(1), 'm | front+rear',
       both.d.toFixed(1), 'm | both locked', locked.d.toFixed(1), 'm');
  info('that is', (400 / (2 * f.d) / 9.81).toFixed(2), 'g on the front alone,',
       (400 / (2 * r.d) / 9.81).toFixed(2), 'g on the rear alone');
  between(f.d, 15, 28, 'the front brake stops the bike in a believable distance');
  between(r.d, 28, 65, 'the rear brake alone takes far longer');
  A(r.d > f.d * 1.7, 'the front brake does most of the work  [' + (r.d / f.d).toFixed(1) + 'x]');
  A(locked.d > f.d * 1.15, 'grabbing both brakes locked is slower than modulating the front  [' +
    locked.d.toFixed(1) + ' m vs ' + f.d.toFixed(1) + ' m]');
  // compare like with like: the front brake alone is the shortest stop on
  // both surfaces, because a rear wheel that is nearly off the ground
  // contributes nothing and costs stability
  const mud = stop(1, 0, true, T.SURF.MUD);
  info('the same front-brake stop in mud:', mud.d.toFixed(1), 'm, crashed', mud.crashed, mud.why || '');
  A(!mud.crashed, 'braking in mud does not by itself put the bike down');
  A(mud.d > f.d * 1.4, 'and in mud it takes far longer  [' + mud.d.toFixed(1) + ' m vs ' + f.d.toFixed(1) + ' m]');
}

/* ================================================= weight transfer ====== */
{
  strip(T.SURF.HARDPACK, 320);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 300, 0, { speed: 18 });
  b.inp.clutch = 1;
  T.stepBike(b, 0.5);
  const nf0 = b.wf.N, nr0 = b.wr.N, dive0 = b.susp.f.x;
  for (let i = 0; i < 500 * 0.7; i++) { b.inp.brakeF = 0.35; b.inp.brakeR = 0.15; T.physStep(b, DT); }
  info('braking: front load', nf0.toFixed(0), '->', b.wf.N.toFixed(0), 'N, rear', nr0.toFixed(0),
       '->', b.wr.N.toFixed(0), 'N, fork dive', ((b.susp.f.x - dive0) * 1000).toFixed(0), 'mm');
  A(b.wf.N > nf0 * 1.25, 'braking loads the front wheel  [' + (b.wf.N / nf0).toFixed(2) + 'x]');
  A(b.wr.N < nr0 * 0.85, 'and unloads the rear  [' + (b.wr.N / nr0).toFixed(2) + 'x]');
  A(b.susp.f.x - dive0 > 0.03, 'and the fork dives  [' + ((b.susp.f.x - dive0) * 1000).toFixed(0) + ' mm]');
}
/* anti-squat: the chain pulls the back of the bike UP under power */
{
  strip(T.SURF.HARDPACK, 420);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 400, 0, { speed: 12, gear: 2 });
  T.stepBike(b, 0.6);
  const r0 = b.susp.r.x;
  for (let i = 0; i < 500 * 0.6; i++) { b.inp.throttle = T.riderThrottle(b, 0.8, 1); T.physStep(b, DT); }
  info('on the gas: rear travel', (r0 * 1000).toFixed(0), '->', (b.susp.r.x * 1000).toFixed(0), 'mm');
  A(b.susp.r.x < r0 + 0.006, 'the rear does not squat under power — the chain holds it up  [' +
    ((b.susp.r.x - r0) * 1000).toFixed(1) + ' mm]');
}

/* ==================================================== countersteer ====== */
{
  strip(T.SURF.HARDPACK, 420);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 400, 0, { speed: 18 });
  b.inp.throttle = 0.22;
  T.stepBike(b, 0.6);
  b.inp.steer = 0.8;                       // ask for a right-hand turn
  let firstSteer = 0, firstLean = 0;
  for (let i = 0; i < 500 * 0.5; i++) {
    T.physStep(b, DT);
    if (Math.abs(b.steer.a) > Math.abs(firstSteer)) firstSteer = b.steer.a;
    if (i === 60) firstLean = b.lean;
  }
  T.stepBike(b, 2.5);
  info('asked for a right turn: first steer movement', deg(firstSteer).toFixed(2),
       'deg (positive is left), settled lean', deg(b.lean).toFixed(1), 'deg, settled steer',
       deg(b.steer.a).toFixed(2), 'deg');
  A(firstSteer > 0.004, 'the bars go LEFT first to make the bike lean right — countersteer  [' +
    deg(firstSteer).toFixed(2) + ' deg]');
  A(b.lean > 0.25, 'and the bike ends up leaning right  [' + deg(b.lean).toFixed(1) + ' deg]');
  A(b.steer.a < 0, 'with the bars finally turned into the corner  [' + deg(b.steer.a).toFixed(2) + ' deg]');
  A(b.w[1] < -0.05, 'and the bike is yawing to the right  [' + deg(b.w[1]).toFixed(1) + ' deg/s]');
}

/* =============================================== the corner balances ==== */
{
  const corner = (surfKey, v) => {
    strip(T.SURF[surfKey], 320);
    const b = T.makeBike('450f'); T.resetBike(b, 0, 300, 0, { speed: v });
    const hold = () => { b.inp.throttle = T.clamp(0.12 + (v - spd(b)) * 0.10, 0, 0.55); };
    for (let i = 0; i < 500 * 0.5; i++) { hold(); T.physStep(b, DT); }
    b.inp.steer = 1.0;
    for (let i = 0; i < 500 * 6; i++) { hold(); T.physStep(b, DT); }
    /* Measure the curvature of the PATH, not the yaw rate of the bike.
       On a slippery surface the bike crabs: it points further into the
       corner than it is actually going, and yaw rate times speed then
       reports a lateral acceleration the tyres are nowhere near making.
       Mud came out at 0.84 g on a surface whose friction is 0.58. */
    const dir0 = Math.atan2(b.v[0], b.v[2]);
    for (let i = 0; i < 500 * 0.6; i++) { hold(); T.physStep(b, DT); }
    let dd = Math.atan2(b.v[0], b.v[2]) - dir0;
    while (dd > Math.PI) dd -= 2 * Math.PI;
    while (dd < -Math.PI) dd += 2 * Math.PI;
    const pathRate = Math.abs(dd) / 0.6;
    const sp = spd(b);
    const aLat = sp * pathRate;
    const fwdV = T.Q.rot(b.q, [0, 0, -1]);
    const bodyDir = Math.atan2(fwdV[0], fwdV[2]);
    let drift = Math.atan2(b.v[0], b.v[2]) - bodyDir;
    while (drift > Math.PI) drift -= 2 * Math.PI;
    while (drift < -Math.PI) drift += 2 * Math.PI;
    /* The roll balance is the exact statement, and it is about the force
       ACROSS THE WHEELS, not about the curvature of the path. On a
       sliding bike the two differ by the crab angle. */
    const Nsum = b.wf.N + b.wr.N;
    const Fysum = b.wf.Fy + b.wr.Fy;
    return { lean: b.lean, need: Math.atan(aLat / T.WORLD.g), g: aLat / T.WORLD.g,
             crashed: b.crashed, R: pathRate > 0.02 ? sp / pathRate : 0, drift: Math.abs(drift),
             roll: Nsum > 100 ? Math.atan(Math.abs(Fysum) / Nsum) : 0 };
  };
  let worstErr = 0, anyCrash = false;
  const res = {};
  for (const s of ['HARDPACK', 'SOFT', 'SAND', 'MUD', 'GRASS', 'GRAVEL', 'CONCRETE']) {
    const c = corner(s, 17);
    res[s] = c;
    info(s.padEnd(9), 'lean', deg(c.lean).toFixed(1).padStart(5), 'deg | needed for the path it takes',
      deg(c.need).toFixed(1).padStart(5), 'deg |', c.g.toFixed(2), 'g | radius', c.R.toFixed(0),
      'm | drift', deg(c.drift).toFixed(1), 'deg | roll balance says',
      deg(c.roll).toFixed(1), 'deg', c.crashed ? ' CRASHED' : '');
    if (!c.crashed) worstErr = Math.max(worstErr, Math.abs(deg(c.lean) - deg(c.roll)));
    if (c.crashed) anyCrash = true;
  }
  A(!anyCrash, 'the bike holds a steady corner on every surface');
  A(worstErr < 3, 'and the lean angle always balances the force across the tyres  [worst ' +
    worstErr.toFixed(1) + ' deg]');
  // grip decides how far it will go over, and in the right order
  const order = ['SOFT', 'CONCRETE', 'HARDPACK', 'GRASS', 'GRAVEL', 'MUD'];
  let mono = true, prev = 99;
  for (const s of order) { if (res[s].g > prev + 0.03) mono = false; prev = res[s].g; }
  A(mono, 'cornering grip falls in the same order as the surface friction  [' +
    order.map(s => s.toLowerCase() + ' ' + res[s].g.toFixed(2)).join(' > ') + ']');
  A(res.SOFT.g > res.MUD.g * 1.5, 'loam holds far more than mud  [' +
    res.SOFT.g.toFixed(2) + ' g vs ' + res.MUD.g.toFixed(2) + ' g]');
}

report('physics');
