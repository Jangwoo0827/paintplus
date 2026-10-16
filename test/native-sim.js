// Capacitor 환경(window.Capacitor)을 흉내 내서 초기화 오류를 찾는다
const { chromium } = require('playwright-core');
const { start } = require('../scripts/serve.js');
(async () => {
  const server = await start(0);
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 412, height: 839 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.6 });
  await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message, (e.stack || '').split('\n')[1]));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(2500);
  console.log('ready=', await page.evaluate(() => document.body.dataset.ready), 'class=', await page.evaluate(() => document.body.className));
  await page.screenshot({ path: process.env.OUT || 'native-sim.png' });
  await b.close(); server.close();
})();
