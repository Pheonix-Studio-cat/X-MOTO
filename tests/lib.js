/* Shared test harness. Extracts the inline script from index.html, loads it
   under node and hands back the T interface. No browser needed for physics —
   a browser is only used where rendering or input is under test. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

function loadGame() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const parts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!parts.length) throw new Error('no inline script in index.html');
  const js = parts.join('\n;\n');
  const file = path.join(os.tmpdir(), 'xmoto_under_test.js');
  fs.writeFileSync(file, js);
  delete require.cache[file];
  return require(file);
}

let pass = 0, fail = 0;
const fails = [];
function A(cond, msg) {
  if (cond) { pass++; console.log('PASS ' + msg); }
  else { fail++; fails.push(msg); console.log('FAIL ' + msg); }
}
function near(a, b, tol, msg) {
  const ok = Math.abs(a - b) <= tol;
  A(ok, msg + '  [' + fmt(a) + ' vs ' + fmt(b) + ' +/- ' + tol + ']');
  return ok;
}
function between(v, lo, hi, msg) {
  const ok = v >= lo && v <= hi;
  A(ok, msg + '  [' + fmt(v) + ' in ' + lo + '..' + hi + ']');
  return ok;
}
function fmt(v) {
  if (typeof v !== 'number') return String(v);
  if (!isFinite(v)) return String(v);
  const a = Math.abs(v);
  return (a >= 1000 || (a < 0.01 && a > 0)) ? v.toExponential(3) : v.toFixed(4);
}
function report(name) {
  console.log('');
  console.log('--- ' + name + ': ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { for (const f of fails) console.log('    failed: ' + f); process.exitCode = 1; }
  return fail === 0;
}
function info(...a) { console.log('    · ' + a.join(' ')); }

module.exports = { loadGame, A, near, between, report, info, fmt,
  get pass() { return pass; }, get fail() { return fail; } };
