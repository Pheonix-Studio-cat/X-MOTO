/* Terrain and track geometry. These numbers decide whether a jump is
   jumpable, so they are measured, not assumed. */
const { loadGame, A, near, between, report, info } = require('./lib');
const T = loadGame();

const built = T.buildTrack(T.TRACKS[0], 4242);
const path = built.path;

/* --- the loop itself --------------------------------------------------- */
info('track length', path.total.toFixed(1), 'm,', path.n, 'samples');
between(path.total, 1100, 2200, 'Pine Ridge is a plausible outdoor lap length');

// a closed loop must actually close: last sample next to the first
const d0 = Math.hypot(path.pts[0][0] - path.pts[path.n - 1][0],
                      path.pts[0][1] - path.pts[path.n - 1][1]);
A(d0 < path.step * 2.5, 'the centre line closes on itself  [gap ' + d0.toFixed(3) + ' m]');

// tangents are unit length everywhere
let worstTan = 0;
for (let i = 0; i < path.n; i++) worstTan = Math.max(worstTan, Math.abs(Math.hypot(path.tan[i][0], path.tan[i][1]) - 1));
A(worstTan < 1e-6, 'every tangent is a unit vector  [worst error ' + worstTan.toExponential(2) + ']');

// the normal is perpendicular to the tangent
let worstPerp = 0;
for (let i = 0; i < path.n; i++) worstPerp = Math.max(worstPerp, Math.abs(path.tan[i][0] * path.nor[i][0] + path.tan[i][1] * path.nor[i][1]));
A(worstPerp < 1e-6, 'normals are perpendicular to the tangents');

// spacing is even — arc length must mean metres
let minStep = 9, maxStep = 0;
for (let i = 1; i < path.n; i++) {
  const d = Math.hypot(path.pts[i][0] - path.pts[i - 1][0], path.pts[i][1] - path.pts[i - 1][1]);
  minStep = Math.min(minStep, d); maxStep = Math.max(maxStep, d);
}
A(Math.abs(maxStep - path.step) < 1e-4 && Math.abs(minStep - path.step) < 1e-4,
  'samples are evenly spaced within 0.1 mm  [err ' +
  Math.max(Math.abs(maxStep - path.step), Math.abs(minStep - path.step)).toExponential(2) + ' m]');

/* --- curvature: a hairpin must read as a hairpin ----------------------- */
let maxCurv = 0;
for (let i = 0; i < path.n; i++) maxCurv = Math.max(maxCurv, Math.abs(path.curv[i]));
const tightest = 1 / maxCurv;
info('tightest corner radius', tightest.toFixed(1), 'm');
between(tightest, 8, 40, 'the tightest corner is a real corner, not a kink');

/* --- features fit on the lap ------------------------------------------- */
info('features:', built.featSpans.map(f => f.name + ' ' + f.s0.toFixed(0) + '-' + f.s1.toFixed(0) + 'm').join(', '));
let overlap = null;
const sorted = built.featSpans.slice().sort((a, b) => a.s0 - b.s0);
for (let i = 1; i < sorted.length; i++) if (sorted[i].s0 < sorted[i - 1].s1) overlap = sorted[i - 1].name + ' / ' + sorted[i].name;
A(overlap === null, 'no two features overlap' + (overlap ? '  [' + overlap + ']' : ''));
A(sorted[sorted.length - 1].s1 < path.total, 'the last feature ends before the start line');

/* --- every feature profile must return to the track surface ------------
   A profile that ends above or below zero leaves a vertical wall in the
   ground where it stops. This caught the step-up and the step-down. */
{
  let bad = [];
  for (const ft of T.TRACKS[0].features) {
    const segs = ft.prof();
    const L = T.profileLen(segs);
    const h0 = T.profileEval(segs, 0), h1 = T.profileEval(segs, L);
    if (Math.abs(h0) > 0.02 || Math.abs(h1) > 0.02) bad.push(ft.name + ' (' + h0.toFixed(2) + ' -> ' + h1.toFixed(2) + ')');
  }
  A(bad.length === 0, 'every feature starts and ends flush with the track' + (bad.length ? '  [' + bad.join(', ') + ']' : ''));
}

/* --- the height field actually has the jumps in it --------------------- */
function hAlong(s, lat) {
  const i = Math.round(s / path.step) % path.n;
  const c = path.pts[i], n = path.nor[i];
  return T.TERR.height(c[0] + n[0] * (lat || 0), c[1] + n[1] * (lat || 0));
}
// scan a feature and compare its crest against the ground just before it
for (const f of built.featSpans) {
  let peak = -1e9, trough = 1e9;
  for (let s = f.s0; s <= f.s1; s += 0.25) { const h = hAlong(s); if (h > peak) peak = h; if (h < trough) trough = h; }
  const before = hAlong(f.s0 - 3);
  const rise = peak - before;
  info(f.name, 'rise', rise.toFixed(2), 'm over', f.len.toFixed(1), 'm');
  A(Math.abs(rise) > 0.25 || f.name.indexOf('Step-Down') === 0,
    f.name + ' is visible in the height field  [rise ' + rise.toFixed(2) + ' m]');
}
// the step-down must have an edge you launch off, not a gentle slope
{
  const f = built.featSpans.find(x => x.name === 'Step-Down');
  let steepest = 0, at = 0, peak = -1e9;
  for (let s = f.s0; s <= f.s1 - 0.5; s += 0.25) {
    const g = (hAlong(s + 0.5) - hAlong(s)) / 0.5;
    if (g < steepest) { steepest = g; at = s - f.s0; }
    peak = Math.max(peak, hAlong(s));
  }
  const deg = Math.atan(-steepest) * 180 / Math.PI;
  const drop = peak - hAlong(f.s1 - 1);
  info('Step-Down: plateau', peak.toFixed(2), 'm, total drop', drop.toFixed(2),
       'm, steepest', deg.toFixed(0) + ' deg at +' + at.toFixed(1) + ' m');
  A(deg > 30, 'the step-down has an edge, not a ramp  [' + deg.toFixed(0) + ' deg]');
  A(drop > 2.2, 'and it drops a real distance  [' + drop.toFixed(2) + ' m]');
}

// The whoops must alternate. Counting crossings of the section mean is the
// wrong measurement: the track climbs through here, so the trend moves the
// mean and the count says nothing. Count local peaks with real prominence.
{
  const f = built.featSpans.find(x => x.name === 'Whoops');
  const hs = [];
  for (let s = f.s0; s <= f.s1; s += 0.15) hs.push(hAlong(s));
  let peaks = 0, lastMin = hs[0], rising = true, lastPeak = hs[0];
  for (let i = 1; i < hs.length; i++) {
    if (rising) {
      if (hs[i] < hs[i - 1]) { if (hs[i - 1] - lastMin > 0.18) { peaks++; lastPeak = hs[i - 1]; } rising = false; }
    } else {
      if (hs[i] > hs[i - 1]) { lastMin = hs[i - 1]; rising = true; }
    }
  }
  info('whoop peaks with >0.18 m prominence:', peaks, 'of 8 built');
  A(peaks >= 6, 'the whoop section really is a series  [' + peaks + ' peaks]');
  // and the same measurement finds nothing on a straight piece of track
  const hs2 = [];
  for (let s = f.s1 + 12; s <= f.s1 + 42; s += 0.15) hs2.push(hAlong(s));
  let p2 = 0, lm = hs2[0], ri = true;
  for (let i = 1; i < hs2.length; i++) {
    if (ri) { if (hs2[i] < hs2[i - 1]) { if (hs2[i - 1] - lm > 0.18) p2++; ri = false; } }
    else { if (hs2[i] > hs2[i - 1]) { lm = hs2[i - 1]; ri = true; } }
  }
  info('same measurement on the 30 m after the whoops:', p2, 'peaks');
  A(p2 <= 1, 'and it finds no whoops where there are none  [' + p2 + ']');
}

/* --- berms: the outside of a corner is banked -------------------------- */
{
  let iTight = 0, best = 0;
  for (let i = 0; i < path.n; i++) if (Math.abs(path.curv[i]) > best) { best = Math.abs(path.curv[i]); iTight = i; }
  const s = iTight * path.step;
  const outSign = path.curv[iTight] > 0 ? -1 : 1;
  const hIn = hAlong(s, -outSign * 3.0);
  const hMid = hAlong(s, 0);
  const hOut = hAlong(s, outSign * 4.0);
  info('tightest corner: inside', hIn.toFixed(2), 'middle', hMid.toFixed(2), 'outside', hOut.toFixed(2));
  A(hOut - hMid > 0.35, 'the outside of the tightest corner is banked up  [' + (hOut - hMid).toFixed(2) + ' m]');
  A(hOut - hIn > 0.35, 'the berm is on the outside, not the inside');
}
/* --- the off-camber turn must NOT be bermed ---------------------------- */
{
  const s = 0.32 * path.total;
  const i = Math.round(s / path.step) % path.n;
  const outSign = path.curv[i] > 0 ? -1 : 1;
  const hMid = hAlong(s, 0), hOut = hAlong(s, outSign * 3.5);
  info('off-camber section: middle', hMid.toFixed(2), 'outside', hOut.toFixed(2));
  A(hOut - hMid < 0.35, 'the off-camber turn has no berm to lean on  [' + (hOut - hMid).toFixed(2) + ' m]');
}

/* --- surfaces ---------------------------------------------------------- */
{
  const sandS = 0.60 * path.total, loamS = 0.20 * path.total;
  const iS = Math.round(sandS / path.step) % path.n, iL = Math.round(loamS / path.step) % path.n;
  const sand = T.TERR.info(path.pts[iS][0], path.pts[iS][1]);
  const loam = T.TERR.info(path.pts[iL][0], path.pts[iL][1]);
  A(sand.surf.key === 'sand', 'the sand section is sand  [' + sand.surf.key + ']');
  A(loam.surf.key === 'soft', 'the main track is loam  [' + loam.surf.key + ']');
  A(sand.roll > loam.roll * 1.8, 'sand rolls much heavier than loam  [' + sand.roll.toFixed(3) + ' vs ' + loam.roll.toFixed(3) + ']');
  // off the track it is grass
  const off = T.TERR.info(path.pts[iL][0] + path.nor[iL][0] * 13, path.pts[iL][1] + path.nor[iL][1] * 13);
  A(off.surf.key === 'grass', 'thirteen metres off line it is grass  [' + off.surf.key + ']');
}

/* --- the ground deforms, and gives the material back ------------------- */
{
  const i = Math.round(0.20 * path.total / path.step) % path.n;
  const x = path.pts[i][0], z = path.pts[i][1];
  const h0 = T.TERR.height(x, z);
  const R = Math.ceil(3.0 / T.TERR.CS);
  const cix = Math.round((x - T.TERR.x0) / T.TERR.CS), ciz = Math.round((z - T.TERR.z0) / T.TERR.CS);
  const sumRut = () => { let s = 0; for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++)
    s += T.TERR.rut[(ciz + dz) * T.TERR.nx + (cix + dx)]; return s; };
  const before = sumRut();
  for (let k = 0; k < 30; k++) T.TERR.dig(x, z, 1, 0, 0.010, 0.16, 0.02);
  const h1 = T.TERR.height(x, z);
  // how much went down, how much came back up
  let down = 0, up = 0, rose = 0;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const v = T.TERR.rut[(ciz + dz) * T.TERR.nx + (cix + dx)];
    if (v < 0) down -= v; else if (v > 0) { up += v; rose++; }
  }
  info('rut cut', (h1 - h0).toFixed(4), 'm | removed', down.toFixed(3),
       'm-cells, piled up', up.toFixed(3), 'in', rose, 'cells');
  A(h1 < h0 - 0.01, 'a wheel passing again and again cuts a rut  [' + (h1 - h0).toFixed(4) + ' m]');
  A(rose > 8, 'the spoil piles up beside the rut  [' + rose + ' cells rose]');
  A(up > down * 0.4 && up < down, 'most of the material comes back beside the groove  [' +
    (100 * up / down).toFixed(0) + '% of what was removed]');
  A(Math.abs(sumRut() - before) < down * 0.45, 'the ground does not simply delete material');

  // and it stops: loam has a maximum rut depth
  for (let k = 0; k < 4000; k++) T.TERR.dig(x, z, 1, 0, 0.010, 0.16, 0.0);
  const h2 = T.TERR.height(x, z);
  const cell = T.TERR.cellAt(x, z);
  const S = T.SURFACES[T.SURF.SOFT];
  info('after 4030 passes: cell cut', (-T.TERR.rut[cell]).toFixed(3), 'm, interpolated depth',
       (h0 - h2).toFixed(3), 'm, material limit', S.rutMax, 'm');
  A(-T.TERR.rut[cell] <= S.rutMax + 1e-4, 'the rut stops at the material limit  [' +
    (-T.TERR.rut[cell]).toFixed(4) + ' <= ' + S.rutMax + ']');
  A(-T.TERR.rut[cell] > S.rutMax * 0.95, 'and the cell does reach that limit');
  A(h0 - h2 > 0.055, 'a fully formed rut is deep enough to feel  [' + (h0 - h2).toFixed(3) + ' m]');
}
/* concrete does not rut, whatever you do to it */
{
  const i = Math.round(0.005 * path.total / path.step) % path.n;
  const x = path.pts[i][0], z = path.pts[i][1];
  const si = T.TERR.info(x, z);
  const h0 = T.TERR.height(x, z);
  for (let k = 0; k < 500; k++) T.TERR.dig(x, z, 1, 0, 0.02, 0.20, 0.0);
  const h1 = T.TERR.height(x, z);
  A(si.surf.key === 'concrete', 'the start pad is concrete  [' + si.surf.key + ']');
  A(Math.abs(h1 - h0) < 1e-6, 'concrete does not rut  [' + (h1 - h0).toFixed(6) + ' m]');
}

/* --- normals point up, and lean where the ground leans ----------------- */
{
  let worst = 1;
  for (let k = 0; k < 400; k++) {
    const i = (k * 7) % path.n;
    const n = T.TERR.normal(path.pts[i][0], path.pts[i][1]);
    worst = Math.min(worst, n[1]);
    if (Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) > 1e-6) { worst = -9; break; }
  }
  A(worst > 0.55, 'ground normals on the racing line all point upward  [worst y ' + worst.toFixed(3) + ']');
}
/* --- wet: rain lowers grip everywhere --------------------------------- */
{
  const i = Math.round(0.20 * path.total / path.step) % path.n;
  const dry = T.TERR.info(path.pts[i][0], path.pts[i][1]).grip;
  T.TERR.soak(1, 1, 0);
  const wet = T.TERR.info(path.pts[i][0], path.pts[i][1]).grip;
  info('grip dry', dry.toFixed(3), 'soaked', wet.toFixed(3));
  A(wet < dry * 0.85, 'a soaked loam track loses grip  [' + wet.toFixed(3) + ' < ' + (dry * 0.85).toFixed(3) + ']');
  T.TERR.wetGlobal = 0;
}

report('terrain');
