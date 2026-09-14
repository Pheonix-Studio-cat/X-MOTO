/* The engine sound is synthesised, so it can be measured. This suite has
   two halves: the pure mapping from engine state to synthesiser settings,
   which node can check on its own, and — in test_render.js — the graph
   that applies it.

   What is being defended here is the thing a looped recording cannot do:
   the same rpm has to sound different pulling than coasting. */
const { loadGame, A, near, between, report, info } = require('./lib.js');
const T = loadGame();
const { BIKES, BIKE_BY_KEY, engineVoice, firingOrder } = T;

const st = (o) => Object.assign({ rpm: 5000, throttle: 1, load: 0.8, cut: 0,
                                  stalled: false, damage: 0 }, o);

/* --- the firing rate is the pitch, and it comes from the engine ------- */
for (const cfg of BIKES) {
  const order = firingOrder(cfg);
  A(order === (cfg.strokes === 4 ? 0.5 : 1),
    cfg.key + ': a ' + cfg.strokes + '-stroke single fires ' + order + '× per revolution');
  const v = engineVoice(cfg, st({ rpm: 6000 }));
  near(v.fire, 6000 / 60 * order, 0.01,
    cfg.key + ': 6000 rpm gives ' + v.fire.toFixed(1) + ' Hz at the exhaust');
}
{
  // the audible consequence: a two-stroke sits an octave above a
  // four-stroke at the same crank speed
  const f4 = engineVoice(BIKE_BY_KEY['450f'], st({ rpm: 7000 })).fire;
  const f2 = engineVoice(BIKE_BY_KEY['250tc'], st({ rpm: 7000 })).fire;
  near(f2 / f4, 2, 0.01, 'a two-stroke is an octave up on a four-stroke at the same rpm  ['
    + f4.toFixed(0) + ' vs ' + f2.toFixed(0) + ' Hz]');
}
{
  const cfg = BIKE_BY_KEY['450f'];
  let last = -1, rising = true;
  for (let rpm = 1500; rpm <= cfg.limitRpm; rpm += 250) {
    const f = engineVoice(cfg, st({ rpm })).fire;
    if (f <= last) rising = false;
    last = f;
  }
  A(rising, 'the pitch rises with every step of the rev range');
}

/* --- pulling and coasting must not sound the same --------------------- */
{
  const cfg = BIKE_BY_KEY['450f'];
  const pull = engineVoice(cfg, st({ rpm: 7000, throttle: 1, load: 0.9 }));
  const coast = engineVoice(cfg, st({ rpm: 7000, throttle: 0, load: -0.5 }));
  near(pull.fire, coast.fire, 0.01, 'the pitch is the same at the same rpm');
  info('pulling', 'level', pull.level.toFixed(2), 'drive', pull.drive.toFixed(2),
       'bright', pull.bright.toFixed(0), 'Hz');
  info('coasting', 'level', coast.level.toFixed(2), 'drive', coast.drive.toFixed(2),
       'bright', coast.bright.toFixed(0), 'Hz');
  A(coast.level < pull.level * 0.6,
    'but coasting is much quieter  [' + coast.level.toFixed(2) + ' vs ' + pull.level.toFixed(2) + ']');
  A(coast.bright < pull.bright * 0.75,
    'and much duller  [' + coast.bright.toFixed(0) + ' vs ' + pull.bright.toFixed(0) + ' Hz]');
  A(coast.drive < pull.drive * 0.4,
    'and has none of the rasp  [' + coast.drive.toFixed(2) + ' vs ' + pull.drive.toFixed(2) + ']');
  A(coast.intake < 0.02, 'a shut throttle makes no intake roar  [' + coast.intake.toFixed(3) + ']');
  A(coast.mech > pull.mech * 0.8,
    'the mechanical clatter stays  [' + coast.mech.toFixed(2) + ' vs ' + pull.mech.toFixed(2) + ']');
  A(coast.edge < 0.02 && pull.edge > 0.4,
    'and the bark belongs to load alone  [' + coast.edge.toFixed(2) + ' vs ' + pull.edge.toFixed(2) + ']');
}
{
  /* The bark is what a rider hears when the engine is working. It was
     added because a measurement said it was missing: the note had the same
     spectral tilt on and off the throttle, which no engine does. */
  const cfg = BIKE_BY_KEY['450f'];
  let ok = true, prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const e = engineVoice(cfg, st({ rpm: 7000, throttle: t, load: t * 0.9 })).edge;
    if (e < prev - 1e-9) ok = false;
    prev = e;
  }
  A(ok, 'the bark grows with the throttle and never shrinks');
  const low = engineVoice(cfg, st({ rpm: 2500, throttle: 1, load: 0.9 })).edge;
  const high = engineVoice(cfg, st({ rpm: 9000, throttle: 1, load: 0.9 })).edge;
  A(high > low * 1.5, 'and it is far stronger high in the rev range  ['
    + low.toFixed(2) + ' at 2500, ' + high.toFixed(2) + ' at 9000]');
  A(engineVoice(cfg, st({ rpm: 6000, stalled: true })).edge === 0,
    'a stalled engine has none of it');
}

/* --- everything must move monotonically where it should --------------- */
{
  const cfg = BIKE_BY_KEY['450f'];
  let okL = true, okB = true, okD = true;
  let prev = engineVoice(cfg, st({ rpm: 6000, throttle: 0, load: 0 }));
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const v = engineVoice(cfg, st({ rpm: 6000, throttle: t, load: t * 0.9 }));
    if (v.level <= prev.level) okL = false;
    if (v.bright <= prev.bright) okB = false;
    if (v.drive <= prev.drive) okD = false;
    prev = v;
  }
  A(okL, 'opening the throttle only ever makes it louder');
  A(okB, 'opening the throttle only ever makes it brighter');
  A(okD, 'opening the throttle only ever adds rasp');
}
{
  const cfg = BIKE_BY_KEY['450f'];
  let ok = true, prev = -1;
  for (let rpm = cfg.idleRpm; rpm <= cfg.limitRpm; rpm += 300) {
    const m = engineVoice(cfg, st({ rpm, throttle: 0, load: -0.2 })).mech;
    if (m < prev - 1e-9) ok = false;
    prev = m;
  }
  A(ok, 'mechanical clatter never falls as the crank speeds up');
}

/* --- the states that must be silent or nearly so ---------------------- */
{
  const cfg = BIKE_BY_KEY['450f'];
  const dead = engineVoice(cfg, st({ rpm: 0, stalled: true }));
  A(dead.level === 0 && dead.fire === 0, 'a stalled engine makes no sound at all');

  const open = engineVoice(cfg, st({ rpm: 9800, throttle: 1, load: 0.9, cut: 0 }));
  const cut = engineVoice(cfg, st({ rpm: 9800, throttle: 1, load: 0.9, cut: 0.04 }));
  A(cut.level < open.level * 0.4,
    'the rev limiter chops the note  [' + cut.level.toFixed(2) + ' vs ' + open.level.toFixed(2) + ']');
  near(cut.fire, open.fire, 0.01, 'the limiter cuts the fuel, not the crank speed');
}

/* --- nothing may ever hand the audio graph a bad number --------------- */
{
  let bad = 0, n = 0, worstLevel = 0;
  const keys = ['fire', 'level', 'drive', 'bright', 'mech', 'intake', 'jitter', 'edge', 'pipe'];
  for (const cfg of BIKES) {
    for (let rpm = -500; rpm <= cfg.cutRpm + 2000; rpm += 137) {
      for (const thr of [0, 0.3, 0.7, 1]) {
        for (const load of [-1, -0.4, 0, 0.5, 1]) {
          for (const dmg of [0, 1]) {
            const v = engineVoice(cfg, { rpm, throttle: thr, load, cut: 0, stalled: false, damage: dmg });
            n++;
            for (const k of keys) if (!isFinite(v[k]) || v[k] < 0) bad++;
            worstLevel = Math.max(worstLevel, v.level);
          }
        }
      }
    }
  }
  info('swept', n, 'engine states across all five bikes');
  A(bad === 0, 'no setting is ever negative or non-finite  [' + n + ' states]');
  A(worstLevel <= 1.25, 'and the level never runs away  [worst ' + worstLevel.toFixed(2) + ']');
}
{
  // a missing load reading must fall back to the throttle, not to NaN
  const cfg = BIKE_BY_KEY['450f'];
  const v = engineVoice(cfg, { rpm: 5000, throttle: 0.5 });
  A(isFinite(v.level) && v.level > 0, 'a state with no load reading still makes a sound');
}

/* --- brightness must stay inside what a filter can be given ----------- */
{
  let lo = 1e9, hi = 0;
  for (const cfg of BIKES) {
    for (let rpm = 0; rpm <= cfg.cutRpm; rpm += 100) {
      for (const thr of [0, 1]) {
        const v = engineVoice(cfg, st({ rpm, throttle: thr, load: thr, damage: 1 }));
        lo = Math.min(lo, v.bright); hi = Math.max(hi, v.bright);
      }
    }
  }
  info('cutoff range', lo.toFixed(0), '-', hi.toFixed(0), 'Hz');
  between(lo, 300, 20000, 'the lowest cutoff is still audible');
  between(hi, 300, 20000, 'the highest cutoff is below half the sample rate');
}

report('sound');
