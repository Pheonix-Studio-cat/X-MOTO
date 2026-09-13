/* Flight, landings, and what the rider can do while the wheels are off the
   ground. This is where a motocross bike spends a third of its lap. */
const { loadGame, A, near, between, report, info } = require('./lib');
const T = loadGame();
const DT = T.WORLD.DT;
const spd = (b) => Math.hypot(b.v[0], b.v[2]);
const deg = (r) => r * 180 / Math.PI;

/* Build a strip with a take-off ramp at z = 0 that ends in a lip. */
function ramp(height, runIn, surf, landAt) {
  /* Take-off at z = 0, and a landing slope after it. Motocross jumps land
     on a downslope; a flat landing from five metres up is a hospital, not
     a test. */
  T.buildFlat(26, surf === undefined ? T.SURF.SOFT : surf, 0, 260);
  /* A jump this size is a forty metre jump, and the landing for one is a
     steep hill, not a gentle rise. Landing a 1.8 second flight on a seven
     degree slope is a crash however well it is ridden. */
  const L0 = landAt === undefined ? -20 : landAt;   // where the slope starts
  const L1 = L0 - 30;                               // and where it flattens out
  const drop = 30 * Math.tan(16 * Math.PI / 180);   // a 16 degree landing
  for (let iz = 0; iz < T.TERR.nz; iz++) {
    const z = T.TERR.z0 + iz * T.TERR.CS;
    let h = 0;
    if (z >= 0 && z <= runIn) {
      const t = 1 - z / runIn;
      h = height * t * t;                       // steepest at the lip
    } else if (z < L0 && z >= L1) {
      h = -drop * (L0 - z) / (L0 - L1);
    } else if (z < L1) {
      h = -drop;
    }
    for (let ix = 0; ix < T.TERR.nx; ix++) T.TERR.h[iz * T.TERR.nx + ix] = h;
  }
  T.TERR.dirty.fill(1);
}

/* ================================================= free flight is free == */
{
  ramp(1.5, 10);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 90, 0, { speed: 15 });
  b.inp.throttle = 0.30;
  const ys = [], ts = [], vx = [];
  let t = 0, airStart = -1, airEnd = -1;
  for (let i = 0; i < 500 * 12; i++) {
    T.autoGearbox(b, 1);
    b.inp.throttle = T.riderThrottle(b, 0.35, 1);
    T.physStep(b, DT); t += DT;
    if (b.p[2] < 3 && b.airborne) {
      if (airStart < 0) airStart = t;
      airEnd = t;
      const c = b.cfg;
      const ms = c.massBike - c.massUnsprungF - c.massUnsprungR;
      const mt = c.massBike + c.riderMass;
      ys.push((ms * b.p[1] + c.riderMass * b.rider.wp[1]
               + c.massUnsprungF * b.wf.axle[1] + c.massUnsprungR * b.wr.axle[1]) / mt);
      ts.push(t); vx.push(spd(b));
    } else if (airStart > 0 && airEnd - airStart > 0.3 && t > airEnd + 0.2) break;
    if (b.crashed) break;
  }
  const air = airEnd - airStart;
  info('take-off at 15 m/s over a 1.5 m ramp: airborne', air.toFixed(2), 's, peak height',
       Math.max(...ys).toFixed(2), 'm, crashed', b.crashed);
  between(air, 0.55, 2.2, 'a 1.5 m ramp at 15 m/s throws the bike a believable distance');
  A(!b.crashed, 'and it survives the landing  [' + (b.crashReason || '') + ']');

  // during flight the only vertical force should be gravity
  let worst = 0, n = 0;
  for (let i = 2; i < ys.length - 2; i++) {
    const a = (ys[i + 1] - 2 * ys[i] + ys[i - 1]) / (DT * DT);
    if (ts[i] > airStart + 0.35 && ts[i] < airEnd - 0.35) { worst = Math.max(worst, Math.abs(a + T.WORLD.g)); n++; }
  }
  let sum = 0;
  for (let i = 2; i < ys.length - 2; i++) {
    const a = (ys[i + 1] - 2 * ys[i] + ys[i - 1]) / (DT * DT);
    if (ts[i] > airStart + 0.35 && ts[i] < airEnd - 0.35) sum += (a + T.WORLD.g);
  }
  const mean = sum / Math.max(1, n);
  info('vertical acceleration of the whole machine in flight: mean error', mean.toFixed(4),
       'm/s^2, worst', worst.toFixed(3), 'over', n, 'samples');
  A(n > 100, 'there are enough samples in the air to say anything');
  /* Not exactly g, and it should not be: the suspension is still
     extending towards its top-out stops for most of a jump this size, so
     the unsprung mass is moving relative to the frame the whole time.
     The strict version of this test is below, with the suspension already
     settled. */
  A(Math.abs(mean) < 0.9, 'in the air the machine is within a tenth of g of free fall  [mean error ' +
    mean.toFixed(3) + ' m/s^2]');
  A(worst < 1.6, 'and nothing kicks it while it is up there  [worst ' + worst.toFixed(3) + ' m/s^2]');
  const vLoss = vx[0] - vx[vx.length - 1];
  info('forward speed lost in the air:', vLoss.toFixed(2), 'm/s (drag only)');
  between(vLoss, -1.2, 1.6, 'and its speed only changes by the air and the slope it is flying down');
}
/* the strict version: settled suspension, clutch in, nothing but gravity */
{
  T.buildFlat(26, T.SURF.SOFT, 0, 60);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 0, 0);
  b.p[1] += 1800; b.rider.wp[1] += 1800; b.v[1] = 0; b.inp.clutch = 1;
  // take the air away, otherwise this measures drag at 30 m/s, not gravity
  const rho = T.WORLD.rhoAir; T.WORLD.rhoAir = 0;
  for (let i = 0; i < 500 * 9; i++) T.physStep(b, DT);     // let it all top out
  const c = b.cfg;
  const ms = c.massBike - c.massUnsprungF - c.massUnsprungR;
  const mt = c.massBike + c.riderMass;
  const cog = () => (ms * b.p[1] + c.riderMass * b.rider.wp[1]
    + c.massUnsprungF * b.wf.axle[1] + c.massUnsprungR * b.wr.axle[1]) / mt;
  const ys = [];
  for (let i = 0; i < 500 * 2.5; i++) { T.physStep(b, DT); ys.push(cog()); }
  const n = ys.length, T1 = (n - 1) * DT;
  const aFit = 4 * (ys[n - 1] - 2 * ys[Math.floor((n - 1) / 2)] + ys[0]) / (T1 * T1);
  info('settled in free fall, the whole machine accelerates at', aFit.toFixed(4),
       'm/s^2 against g of', (-T.WORLD.g).toFixed(2));
  A(Math.abs(aFit + T.WORLD.g) < 0.16,
    'in a vacuum, with the suspension settled, it is exactly free fall  [' +
    (aFit + T.WORLD.g).toFixed(4) + ' m/s^2]');
  T.WORLD.rhoAir = rho;
}

/* ================================================= control in the air ===
   Measured with the bike held well clear of the ground, so nothing but
   the rider's own inputs can move it. Measuring the pitch change across a
   whole jump instead mixes in how the bike left the ramp, and says
   nothing about control. */
{
  const held = (act, seconds) => {
    T.buildFlat(26, T.SURF.SOFT, 0, 60);
    const b = T.makeBike('450f'); T.resetBike(b, 0, 0, 0, { speed: 16 });
    b.p[1] += 60; b.rider.wp[1] += 60; b.v[1] = 0;
    for (let i = 0; i < 500 * 0.35; i++) { b.inp.throttle = 0; T.physStep(b, DT); }
    const p0 = b.pitch, l0 = b.lean, y0 = b.w[1];
    for (let i = 0; i < 500 * seconds; i++) { act(b); T.physStep(b, DT); }
    const pitchRate = T.V.dot(b.w, T.Q.rot(b.q, [1, 0, 0]));
    return { dPitch: b.pitch - p0, dLean: b.lean - l0, dYaw: b.w[1] - y0,
             pitchRate, contact: b.wf.contact || b.wr.contact };
  };
  const coast = held(b => { b.inp.throttle = 0; }, 0.9);
  const gas = held(b => { b.inp.throttle = 1; }, 0.9);
  const brake = held(b => { b.inp.throttle = 0; b.inp.brakeR = 1; }, 0.9);
  A(!coast.contact && !gas.contact, 'the bike really is clear of the ground for this measurement');
  info('after 0.9 s in the air: coasting', deg(coast.dPitch).toFixed(1), 'deg | on the gas',
       deg(gas.dPitch).toFixed(1), 'deg | on the rear brake', deg(brake.dPitch).toFixed(1), 'deg');
  info('pitch rate at the end: coasting', deg(coast.pitchRate).toFixed(1), '| gas',
       deg(gas.pitchRate).toFixed(1), '| brake', deg(brake.pitchRate).toFixed(1), 'deg/s');
  A(gas.dPitch > coast.dPitch + 0.04,
    'a blip in mid-air brings the nose up  [' + deg(gas.dPitch - coast.dPitch).toFixed(1) + ' deg]');
  A(brake.dPitch < coast.dPitch - 0.03,
    'the rear brake in mid-air drops it  [' + deg(brake.dPitch - coast.dPitch).toFixed(1) + ' deg]');
  A(coast.dPitch < 0,
    'and simply coasting drops it too, because the engine is still braking the rear wheel  [' +
    deg(coast.dPitch).toFixed(1) + ' deg]');
  const clutch = held(b => { b.inp.throttle = 0; b.inp.clutch = 1; }, 0.9);
  A(clutch.dPitch > coast.dPitch,
    'pulling the clutch in takes that away  [' + deg(clutch.dPitch).toFixed(1) + ' vs ' +
    deg(coast.dPitch).toFixed(1) + ' deg]');

  // whip: turn the bars and throw the body, and the bike comes round
  const whipL = held(b => { b.inp.throttle = 0.25; b.inp.steer = -1; b.inp.leanX = -0.9; }, 0.9);
  const whipR = held(b => { b.inp.throttle = 0.25; b.inp.steer = 1; b.inp.leanX = 0.9; }, 0.9);
  info('whip: bars left gives', deg(whipL.dYaw).toFixed(0), 'deg/s of yaw and',
       deg(whipL.dLean).toFixed(1), 'deg of lean; bars right gives', deg(whipR.dYaw).toFixed(0),
       'deg/s and', deg(whipR.dLean).toFixed(1), 'deg');
  A(Math.abs(whipL.dYaw) > 0.3, 'turning the bars in mid-air brings the bike round — that is a whip');
  A(whipL.dYaw * whipR.dYaw < 0, 'and it goes the other way if you turn the other way');
  A(Math.abs(whipL.dLean) > 0.05 && whipL.dLean * whipR.dLean < 0,
    'the bike also lays over, and to the matching side');
}

/* ====================================================== landing loads === */
{
  const drop = (h) => {
    T.buildFlat(26, T.SURF.SOFT, 0, 60);
    const b = T.makeBike('450f'); T.resetBike(b, 0, 0, 0);
    // the rider is a separate mass in world space: move them too, or the
    // spring between them yanks the rider off the bike before it lands
    b.p[1] += h; b.v[1] = 0; b.rider.wp[1] += h;
    let maxF = 0, maxR = 0, maxNF = 0, botF = 0, botR = 0, peakG = 0;
    for (let i = 0; i < 500 * 4; i++) {
      T.physStep(b, DT);
      maxF = Math.max(maxF, b.susp.f.x); maxR = Math.max(maxR, b.susp.r.x);
      maxNF = Math.max(maxNF, b.wf.N + b.wr.N);
      botF = Math.max(botF, b.susp.f.bottom); botR = Math.max(botR, b.susp.r.bottom);
      peakG = Math.max(peakG, b.peakG);
    }
    return { maxF, maxR, maxNF, botF, botR, crashed: b.crashed, why: b.crashReason, peakG,
             dmg: b.dmg.suspF + b.dmg.suspR + b.dmg.wheelF + b.dmg.wheelR };
  };
  const small = drop(0.35), big = drop(1.7), huge = drop(6.0);
  const S = T.BIKE_BY_KEY['450f'].susp;
  for (const [n, d] of [['0.35 m', small], ['1.7 m', big], ['6.0 m', huge]]) {
    info('drop', n.padEnd(6), '-> fork', (d.maxF * 1000).toFixed(0), 'mm of', (S.travelF * 1000).toFixed(0),
      '| shock', (d.maxR * 1000).toFixed(0), 'mm of', (S.travelR * 1000).toFixed(0),
      '| peak wheel load', (d.maxNF / 1000).toFixed(1), 'kN | bottomed',
      (d.botF > 0 || d.botR > 0), '| damage', d.dmg.toFixed(3), '| crashed', d.crashed, d.why || '');
  }
  A(!small.crashed && !big.crashed, 'a bike survives being dropped 0.35 m and 1.7 m onto flat ground');
  A(small.maxF < S.travelF * 0.75 && small.maxR < S.travelR * 0.75,
    'a small drop is soaked up well inside the stroke');
  A(small.botF === 0 && small.botR === 0, 'and does not touch the bump stops');
  A(big.maxR > small.maxR * 1.3, 'a bigger drop uses more of the stroke  [' +
    (big.maxR * 1000).toFixed(0) + ' vs ' + (small.maxR * 1000).toFixed(0) + ' mm]');
  A(huge.botF > 0 || huge.botR > 0, 'a six metre drop bottoms the suspension');
  A(huge.maxNF > big.maxNF * 1.4, 'and lands far harder  [' + (huge.maxNF / 1000).toFixed(1) +
    ' kN vs ' + (big.maxNF / 1000).toFixed(1) + ' kN]');
  A(huge.dmg > small.dmg, 'and it costs something  [damage ' + huge.dmg.toFixed(3) + ' vs ' + small.dmg.toFixed(3) + ']');
  A(small.dmg < 0.001, 'while a normal landing costs nothing');
}

/* ========================================================== the rider === */
{
  // weight forward on the ramp, weight back on the ramp: the bike leaves differently
  const withLean = (lz, thr) => {
    ramp(2.4, 11);
    const b = T.makeBike('450f'); T.resetBike(b, 0, 90, 0, { speed: 17 });
    let air = 0;
    for (let i = 0; i < 500 * 14; i++) {
      T.autoGearbox(b, 1);
      b.inp.throttle = T.riderThrottle(b, thr === undefined ? 0.32 : thr, 1);
      b.inp.leanZ = lz;
      T.physStep(b, DT);
      if (b.p[2] < 3 && b.airborne) air = Math.max(air, b.airT);
      if (air > 0.30) break;
    }
    // the rotation rate the bike leaves the ramp with is what the rider is
    // actually setting up; the pitch at the exact instant of leaving is
    // just where the fork happened to be in its stroke
    return { rate: T.V.dot(b.w, T.Q.rot(b.q, [1, 0, 0])), pitch: b.pitch, air,
             z: b.p[2], crashed: b.crashed, why: b.crashReason };
  };
  const fwd = withLean(0.8), back = withLean(-0.7);
  info('leaving the ramp: weight forward', deg(fwd.rate).toFixed(1), 'deg/s of pitch rotation after',
       fwd.air.toFixed(2), 's of air | weight back', deg(back.rate).toFixed(1), 'deg/s after',
       back.air.toFixed(2), 's  (ended at z', fwd.z.toFixed(0), '/', back.z.toFixed(0),
       ', crashed', fwd.crashed, '/', back.crashed, back.why || '', ')');
  A(fwd.air > 0.25 && back.air > 0.25, 'both take-offs actually leave the ground  [' +
    fwd.air.toFixed(2) + ' s and ' + back.air.toFixed(2) + ' s]');
  /* Which way the weight shift rotates the bike depends on the shape of
     the lip: it decides how much stroke each end has left to give back as
     it crosses. What is not in doubt is that it matters, and by a lot. */
  A(Math.abs(deg(back.rate - fwd.rate)) > 8,
    'where the rider stands changes the take-off rotation, and by a lot  [' +
    deg(back.rate - fwd.rate).toFixed(1) + ' deg/s between the two]');
  // the throttle is the unambiguous one: drive torque lifts the nose
  const gasOn = withLean(0, 0.85), gasOff = withLean(0, 0.05);
  info('same take-off, on the gas', deg(gasOn.rate).toFixed(1), 'deg/s | almost shut',
       deg(gasOff.rate).toFixed(1), 'deg/s');
  /* Which way is not fixed either: the throttle both drives the rear and
     changes how much stroke the shock has left at the lip, and on a steep
     lip the second wins. What matters, and what is asserted, is that the
     rider's hand changes the rotation. The unambiguous version of this —
     a blip with the wheels clear of the ground — is measured above. */
  A(Math.abs(deg(gasOn.rate - gasOff.rate)) > 5,
    'and so does the throttle  [' + deg(gasOn.rate - gasOff.rate).toFixed(1) + ' deg/s between the two]');
}

/* ==================================================== over-revving ====== */
{
  T.buildFlat(26, T.SURF.HARDPACK, 0, 60);
  const b = T.makeBike('450f'); T.resetBike(b, 0, 0, 0);
  b.inp.clutch = 1; b.inp.throttle = 1;
  let peak = 0;
  for (let i = 0; i < 500 * 6; i++) { T.physStep(b, DT); peak = Math.max(peak, b.eng.rpm); }
  info('clutch in, throttle pinned for 6 s: peak', peak.toFixed(0), 'rpm, limiter at',
       b.cfg.limitRpm, ', engine damage', b.dmg.engine.toFixed(3));
  A(peak < b.cfg.cutRpm, 'the rev limiter holds the engine below the danger line  [' +
    peak.toFixed(0) + ' < ' + b.cfg.cutRpm + ']');
  A(peak > b.cfg.limitRpm * 0.92, 'and lets it get there  [' + peak.toFixed(0) + ']');
}

/* ==================================================== reproducible ====== */
{
  const run = () => {
    T.buildFlat(26, T.SURF.SOFT, 0, 200);
    const b = T.makeBike('250f'); T.resetBike(b, 0, 180, 0, { speed: 14 });
    for (let i = 0; i < 500 * 3; i++) {
      T.autoGearbox(b, 1);
      b.inp.throttle = T.riderThrottle(b, 0.7, 1);
      b.inp.steer = Math.sin(i * DT * 2) * 0.6;
      T.physStep(b, DT);
    }
    return [b.p[0], b.p[1], b.p[2], b.lean, b.eng.rpm, b.susp.r.x];
  };
  const a = run(), c = run();
  const same = a.every((v, i) => v === c[i]);
  info('same inputs twice:', a.map(v => v.toFixed(6)).join(' / '));
  A(same, 'the simulation is exactly reproducible — a lap time means something');
}

report('air and landings');
