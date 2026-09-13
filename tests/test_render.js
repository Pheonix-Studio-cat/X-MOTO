/* What the renderer actually put on the screen — the physics suites cannot
   see any of this. Needs a browser, so it is slower than the rest; it is
   still the only check that would have caught a mesh whose vertex array
   object had been rewritten under it. */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('SKIP render: playwright not installed'); process.exit(0); }

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const A = (ok, msg, detail) => {
  if (ok) { pass++; console.log('PASS ' + msg + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('FAIL ' + msg + (detail ? '  [' + detail + ']' : '')); }
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const noise = [];
  page.on('console', m => { if (m.text().indexOf('X-MOTO:') === 0) noise.push(m.text()); });
  page.on('pageerror', e => noise.push('pageerror: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(900);

  const gl = await page.evaluate(() => ({ ok: window.T && T.GL.ok, err: window.T && T.GL.err }));
  A(gl.ok, 'the page gets a WebGL2 context', gl.err || 'ok');
  if (!gl.ok) { console.log('\n--- render: ' + pass + ' passed, ' + (fail + 1) + ' failed'); await browser.close(); process.exit(1); }

  await page.evaluate(() => T.UI.launch());
  await page.waitForTimeout(1800);          // the track has to be built first
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await page.waitForTimeout(300);

  const r = await page.evaluate(() => {
    const gl = T.GL.gl, out = { meshes: [], draws: [], leak: T.GL.vaoLeak || 0 };
    const look = (name, mesh) => {
      if (!mesh || !mesh.vao) return;
      gl.bindVertexArray(mesh.vao);
      const buf = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
      const size = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_SIZE);
      gl.bindVertexArray(null);
      const b = mesh.bounds || { mn: [0,0,0], mx: [0,0,0], bad: 0, n: 0 };
      const reach = Math.max(...b.mx.map(Math.abs), ...b.mn.map(Math.abs));
      out.meshes.push({ name, own: buf === mesh.vb, size, reach, bad: b.bad, n: b.n });
    };
    for (const k in T.RENDER.rider) look('rider.' + k, T.RENDER.rider[k]);
    for (const k in T.RENDER.bikeMesh) look('bike.' + k, T.RENDER.bikeMesh[k]);
    // one frame of draw calls, matrices and all
    const R = T.RENDER, orig = R.drawMesh;
    R.drawMesh = function (prog, mesh, model, tint, metal, mud, tag) {
      let ok = true;
      for (let i = 0; i < 16; i++) if (!isFinite(model[i])) ok = false;
      const sc = [0, 1, 2].map(c => Math.hypot(model[c*4], model[c*4+1], model[c*4+2]));
      out.draws.push({ tag: tag || '?', finite: ok, scale: Math.max(...sc) });
      return orig.apply(this, arguments);
    };
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      R.drawMesh = orig; res(out);
    })));
  });

  A(r.leak === 0, 'no attribute is set up without a vertex array bound', r.leak + ' leaks');
  const stray = r.meshes.filter(m => !m.own);
  A(stray.length === 0, 'every mesh still reads its own vertex buffer',
    stray.length ? stray.map(m => m.name).join(', ') : r.meshes.length + ' meshes');
  const wrongSize = r.meshes.filter(m => m.size !== 3);
  A(wrongSize.length === 0, 'and reads three floats of position per vertex',
    wrongSize.length ? wrongSize.map(m => m.name + '=' + m.size).join(', ') : 'all 3');
  const nan = r.meshes.filter(m => m.bad > 0);
  A(nan.length === 0, 'no mesh holds a non-finite vertex', nan.map(m => m.name).join(', ') || 'none');
  const big = r.meshes.filter(m => m.reach > 1.4);
  A(big.length === 0, 'no part of a bike or rider reaches beyond 1.4 m of its own origin',
    big.length ? big.map(m => m.name + '=' + m.reach.toFixed(2)).join(', ')
               : 'worst ' + Math.max(...r.meshes.map(m => m.reach)).toFixed(2) + ' m');

  A(r.draws.length > 20, 'the frame actually draws something', r.draws.length + ' draw calls');
  const badM = r.draws.filter(d => !d.finite);
  A(badM.length === 0, 'every model matrix in the frame is finite',
    badM.map(d => d.tag).join(', ') || 'all finite');
  const hugeM = r.draws.filter(d => d.scale > 3);
  A(hugeM.length === 0, 'no model matrix scales a part beyond three',
    hugeM.map(d => d.tag + '=' + d.scale.toFixed(1)).join(', ') || 'worst ' +
      Math.max(...r.draws.map(d => d.scale)).toFixed(2));

  A(noise.length === 0, 'the renderer logs no complaint of its own', noise.slice(0, 3).join(' | ') || 'quiet');

  const st = await page.evaluate(() => ({
    fps: Math.round(T.GAME.fps || 0),
    v: Math.round(Math.hypot(T.GAME.hero.v[0], T.GAME.hero.v[2]) * 3.6),
    crashed: !!T.GAME.hero.crashed,
  }));
  console.log('    · ' + st.v + ' km/h after the throttle, ' + st.fps + ' fps in software rendering');
  A(!st.crashed, 'a straight throttle run does not end on the floor');
  A(st.v > 15, 'and the throttle actually drives the bike forward', st.v + ' km/h');

  console.log('\n--- render: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
