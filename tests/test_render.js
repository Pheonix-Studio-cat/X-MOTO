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
    /* The autoplay flag is what lets a headless run hear anything: without
       a click the audio context stays suspended, its clock never advances,
       and every ramp sits at its starting value for ever. */
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox',
           '--autoplay-policy=no-user-gesture-required'],
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
  const sndAt = () => page.evaluate(() => {
    const A = window.T.AUDIO, b = window.T.GAME.hero;
    if (!A.ready || !A.eng || !A.world) return null;
    return { eng: A.eng.engGain.gain.value, freq: A.eng.osc.frequency.value,
             roll: A.world.roll.gn.gain.value, hiss: A.world.hiss.gn.gain.value,
             wind: A.world.wind.gn.gain.value, chain: A.world.chain.gn.gain.value,
             layers: Object.keys(A.world).length,
             kmh: Math.hypot(b.v[0], b.v[2]) * 3.6, rpm: b.eng.rpm };
  });
  const atRest = await sndAt();
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  const onGas = await sndAt();
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

  /* ---- the engine, rendered offline and measured in the signal -------
     engineVoice is checked in test_sound.js. This checks the other half:
     that the graph actually produces a periodic signal at the firing rate,
     and that pulling and coasting really do come out different. */
  const snd = await page.evaluate(async () => {
    const A = window.T.AUDIO, cfg = window.T.BIKE_BY_KEY['450f'];
    const sec = 1.3, sr = 44100;
    const st = (rpm, thr, torque) => ({ rpm, throttle: thr, load: torque / 51.2,
                                        cut: 0, stalled: false, damage: 0 });
    const one = await A.renderOffline(cfg, st(6000, 1, 48), 0.2);
    if (!one) return { skip: 'no OfflineAudioContext' };

    // last third only: by then every setTargetAtTime has settled
    const tail = (d) => d.subarray(Math.floor(d.length * 0.62));
    const rms = (d) => { let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
                         return Math.sqrt(s / d.length); };
    /* Goertzel: the energy at one exact frequency. Zero crossings were the
       first thing tried and they measure noisiness, not brightness — on the
       overrun the mechanical clatter crosses zero far more often than a
       hard exhaust note does, so they said the quiet dull sound was the
       bright one. Summing the firing harmonics ignores the noise floor and
       looks only at the note. */
    const goertzel = (d, f) => {
      const w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / d.length;
    };
    const harmonics = (d, f0, from, to) => {
      let s = 0;
      for (let k = from; k <= to; k++) s += goertzel(d, f0 * k);
      return s;
    };
    const corrAt = (d, lag) => {
      let a = 0, b = 0, c = 0;
      for (let i = 0; i + lag < d.length; i++) { a += d[i] * d[i + lag]; b += d[i] * d[i]; c += d[i + lag] * d[i + lag]; }
      return a / Math.max(1e-12, Math.sqrt(b * c));
    };
    /* Comb filter at one firing period: (x[i]+x[i+P])/2 keeps what repeats,
       (x[i]-x[i+P])/2 keeps what does not. The second is the clatter. */
    const aperiodicShare = (d, P) => {
      let a = 0, b = 0;
      for (let i = 0; i + P < d.length; i++) {
        const sum = (d[i] + d[i + P]) * 0.5, dif = (d[i] - d[i + P]) * 0.5;
        a += sum * sum; b += dif * dif;
      }
      return Math.sqrt(b / Math.max(1e-12, a + b));
    };
    /* Synchronous averaging: fold every firing period on top of the last.
       What repeats survives, what does not falls as 1/sqrt(periods). This
       is what lets the timbre of the note be measured through the clatter
       — mixed together, the louder clatter on the overrun made the duller
       note look like the brighter one. */
    const noteOf = (d, P) => {
      const n = Math.floor(d.length / P);
      const acc = new Float32Array(P);          // fold onto ONE period
      for (let i = 0; i < acc.length; i++) {
        let s2 = 0, c = 0;
        for (let k = 0; i + k * acc.length < d.length; k++) { s2 += d[i + k * acc.length]; c++; }
        acc[i] = s2 / Math.max(1, c);
      }
      return acc;
    };
    const grab = async (s2) => tail(await A.renderOffline(cfg, s2, sec));

    const pull = await grab(st(6000, 1, 48));
    const coast = await grab(st(6000, 0, -12));
    const idle = await grab(st(1900, 0, 0));
    const high = await grab(st(9000, 1, 44));

    const fire6 = 6000 / 60 * 0.5;                       // 50 Hz
    const out = {
      pullRms: rms(pull), coastRms: rms(coast), idleRms: rms(idle), highRms: rms(high),
      periodic: corrAt(pull, Math.round(sr / fire6)),
      pullNoise: aperiodicShare(pull, Math.round(sr / fire6)),
      coastNoise: aperiodicShare(coast, Math.round(sr / fire6)),
      offPeriod: corrAt(pull, Math.round(sr / (fire6 * 1.37))),
      // how much of the note lives up in the harmonics, clatter averaged away
      pullEdge: (() => { const n = noteOf(pull, Math.round(sr / fire6));
        return harmonics(n, fire6, 20, 44) / Math.max(1e-9, harmonics(n, fire6, 1, 6)); })(),
      coastEdge: (() => { const n = noteOf(coast, Math.round(sr / fire6));
        return harmonics(n, fire6, 20, 44) / Math.max(1e-9, harmonics(n, fire6, 1, 6)); })(),
      peak: 0, nan: 0,
    };
    for (let i = 0; i < pull.length; i++) {
      if (!isFinite(pull[i])) out.nan++;
      else if (Math.abs(pull[i]) > out.peak) out.peak = Math.abs(pull[i]);
    }
    return out;
  });

  if (snd.skip) {
    console.log('    · engine sound not measured: ' + snd.skip);
  } else {
    console.log('    · rendered rms — idle ' + snd.idleRms.toFixed(4) +
      ', coasting ' + snd.coastRms.toFixed(4) + ', pulling ' + snd.pullRms.toFixed(4) +
      ', pulling at 9000 ' + snd.highRms.toFixed(4));
    console.log('    · harmonics 1000-2200 Hz against 50-300 Hz — coasting ' +
      snd.coastEdge.toFixed(3) + ', pulling ' + snd.pullEdge.toFixed(3));
    console.log('    · share that is not the note — coasting ' + (snd.coastNoise * 100).toFixed(0) +
      '%, pulling ' + (snd.pullNoise * 100).toFixed(0) + '%');
    A(snd.nan === 0, 'the engine renders no non-finite sample', snd.nan + ' bad samples');
    A(snd.pullRms > 0.01, 'the engine actually makes a sound', 'rms ' + snd.pullRms.toFixed(4));
    A(snd.peak < 1.2, 'and does not clip the output', 'peak ' + snd.peak.toFixed(3));
    A(snd.periodic > 0.55,
      'the note is periodic at the firing rate, 50 Hz at 6000 rpm',
      'correlation ' + snd.periodic.toFixed(2));
    A(snd.periodic > snd.offPeriod + 0.15,
      'and not at a rate that is not the firing rate',
      snd.periodic.toFixed(2) + ' vs ' + snd.offPeriod.toFixed(2) + ' off-period');
    A(snd.coastRms < snd.pullRms * 0.7,
      'coasting at 6000 rpm is quieter than pulling at 6000 rpm',
      snd.coastRms.toFixed(4) + ' vs ' + snd.pullRms.toFixed(4));
    A(snd.coastEdge < snd.pullEdge * 0.7,
      'and duller — the note keeps far less of its upper harmonics',
      snd.coastEdge.toFixed(3) + ' vs ' + snd.pullEdge.toFixed(3));
    /* Comb the signal against itself one firing period later: what
       survives is the note, what cancels is everything else. The share
       that cancels is how much of what you hear is mechanical. */
    A(snd.coastNoise > snd.pullNoise * 1.4,
      'and far more of what is left is mechanical clatter',
      (snd.coastNoise * 100).toFixed(0) + '% of it against ' + (snd.pullNoise * 100).toFixed(0) + '%');
    A(snd.idleRms < snd.pullRms * 0.6, 'idling is quieter than pulling',
      snd.idleRms.toFixed(4) + ' vs ' + snd.pullRms.toFixed(4));
    A(snd.highRms > snd.idleRms, 'and 9000 rpm on the gas is the loudest of the four',
      snd.highRms.toFixed(4));
  }

  /* ---- the sound is actually wired to the bike ------------------------
     groundVoice and engineVoice are measured in test_sound.js, the graph
     offline above. This is the third thing that can be wrong: the numbers
     are right, the synthesiser is right, and nothing connects them. So
     this reads the live graph on a bike that is really being ridden —
     injecting a state does not work, because the game loop writes the real
     one back sixty times a second. */
  if (!atRest || !onGas) {
    console.log('    · sound not wired-checked: no audio context in this run');
  } else {
    const f = (o) => JSON.stringify(o, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v);
    console.log('    · at rest:      ' + f(atRest));
    console.log('    · on the gas:   ' + f(onGas));
    A(atRest.layers === 5, 'the bike has all five non-engine voices', atRest.layers + ' of 5');
    A(onGas.rpm > atRest.rpm * 1.3 && onGas.freq > atRest.freq * 1.3,
      'the exhaust note follows the rev counter',
      atRest.freq.toFixed(1) + ' → ' + onGas.freq.toFixed(1) + ' Hz at '
      + Math.round(atRest.rpm) + ' → ' + Math.round(onGas.rpm) + ' rpm');
    A(onGas.eng > atRest.eng * 1.5, 'and gets louder with it',
      atRest.eng.toFixed(4) + ' → ' + onGas.eng.toFixed(4));
    A(atRest.wind < onGas.wind * 0.3 && onGas.wind > 0.001,
      'the wind arrives with the speed',
      atRest.wind.toFixed(5) + ' → ' + onGas.wind.toFixed(4) + ' at ' + onGas.kmh.toFixed(0) + ' km/h');
    A(onGas.chain > atRest.chain, 'so does the chain',
      atRest.chain.toFixed(5) + ' → ' + onGas.chain.toFixed(4));
    A(onGas.roll > 0.0005 || onGas.hiss > 0.0005,
      'and the tyres are heard on the ground',
      'roll ' + onGas.roll.toFixed(4) + ', hiss ' + onGas.hiss.toFixed(4));
  }

  console.log('\n--- render: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
