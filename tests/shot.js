/* Launch the game in a real browser, drive it for a few seconds and save
   pictures. This is the only way to see whether the renderer works. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const out = process.argv[2] || '/tmp/shots';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(900);
  const glState = await page.evaluate(() => ({ ok: window.T && T.GL.ok, err: window.T && T.GL.err }));
  console.log('GL ok:', glState.ok, glState.err || '');
  if (!glState.ok) { console.log(errs.join('\n')); await browser.close(); process.exit(1); }
  await page.screenshot({ path: path.join(out, '01-menu.png') });

  await page.evaluate(() => T.UI.launch());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '02-start.png') });

  // ride for a while with the throttle on
  // hold the throttle the way a player does, with a real key
  await page.keyboard.down('w');
  await page.waitForTimeout(4000);
  await page.keyboard.up('w');
  await page.screenshot({ path: path.join(out, '03-riding.png') });
  const st = await page.evaluate(() => ({
    v: Math.hypot(T.GAME.hero.v[0], T.GAME.hero.v[2]),
    y: T.GAME.hero.p[1], crashed: T.GAME.hero.crashed, why: T.GAME.hero.crashReason,
    fps: T.GAME.fps, tris: T.RENDER && 0, stats: JSON.parse(JSON.stringify(T.GAME.hero.loc)),
  }));
  console.log('after 4 s:', JSON.stringify(st));

  await page.evaluate(() => { T.CAM.mode = 'helmet'; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, '04-helmet.png') });
  await page.evaluate(() => { T.CAM.mode = 'bike'; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, '05-bike.png') });

  if (errs.length) { console.log('--- page errors ---'); console.log(errs.slice(0, 12).join('\n')); }
  await browser.close();
})();
