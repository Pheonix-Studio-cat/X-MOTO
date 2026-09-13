/* Look at the machine from a few fixed angles: the only way to judge shape. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const tag = process.argv[2] || 'v';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', e => console.log('pageerror: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  await page.evaluate(() => T.UI.launch());
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    T.HUD && (document.getElementById('hud') || {}).style && (document.getElementById('hud').style.opacity = '0');
    const C = T.CAM;
    C.mode = 'fixed';
    const orig = C.update.bind(C);
    C.update = function (hero, dt, aspect) {
      if (this.mode !== 'fixed') return orig(hero, dt, aspect);
      const p = hero.p, a = this.__az || 0, r = this.__r || 2.6, h = this.__h || 0.9;
      this.pos = [p[0] + Math.sin(a) * r, p[1] + h, p[2] + Math.cos(a) * r];
      this.at = [p[0], p[1] + 0.25, p[2]];
      this.up = [0, 1, 0];
      const M = T.M4;
      this.roll = 0; this.fov = 52;
      M.lookAt(this.pos, this.at, this.up, this.view);
      M.persp(52 * Math.PI / 180, aspect, 0.05, 600, this.proj);
      M.mul(this.proj, this.view, this.vp);
      return this;
    };
  });
  /* freeze the machine upright: a bike that has toppled tells you nothing
     about the shape of its bodywork */
  if (process.env.HIDE_RIDER) await page.evaluate(() => { T.RENDER.__hideRider = true; });
  if (process.env.HIDE_BIKE) await page.evaluate(() => { T.RENDER.__hideBike = true; });
  const views = [['side', Math.PI / 2, 2.8, 0.9], ['front', Math.PI, 2.6, 0.9],
                 ['q', Math.PI * 0.72, 2.6, 1.0], ['rear', 0, 2.6, 1.0],
                 ['top', Math.PI * 0.6, 2.2, 2.2]];
  for (const [n, az, r, h] of views) {
    /* reset just before the shot: an unridden bike topples in a second
       and a fallen bike says nothing about the shape of its bodywork */
    await page.evaluate(([a, rr, hh]) => {
      T.CAM.__az = a; T.CAM.__r = rr; T.CAM.__h = hh;
      const h = T.GAME.hero; T.resetBike(h, h.p[0], h.p[2], h.headingRef || 0);
    }, [az, r, h]);
    await page.waitForTimeout(140);
    await page.screenshot({ path: '/tmp/shots/' + tag + '-' + n + '.png' });
  }
  await browser.close();
})();
