'use strict';
/*
 * localhost + 헤드리스 Edge/Chrome(playwright-core)로 UI 시나리오를 실행한다. 화면에 창이 뜨지 않는다.
 *   node test/web.js stage2 stage3 ...
 * Electron 전용(파일 대화상자, IPC, 단일 인스턴스)이 아닌 시나리오만 대상이다. 시나리오는 Electron 하네스와 같은 t 인터페이스를 쓴다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');
const { start } = require('../scripts/serve.js');

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = BROWSERS.find((p) => fs.existsSync(p));
const shotsDir = process.env.PP_SHOTS || path.join(os.tmpdir(), 'paintplus-shots');
fs.mkdirSync(shotsDir, { recursive: true });
const names = process.argv.slice(2).filter((a) => /^[a-z0-9_-]+$/i.test(a));

const KEYMAP = { Return: 'Enter', Escape: 'Escape', Delete: 'Delete', Space: 'Space', Tab: 'Tab' };

async function runOne(browser, server, name) {
  const port = server.address().port;
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'], hasTouch: name === 'pen' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(200);
  if (!name.startsWith('three')) await page.evaluate(() => PP.hub && PP.hub.close());

  const results = [];
  const wait = (ms) => page.waitForTimeout(ms);
  const js = (code) => page.evaluate((c) => (0, eval)(c), code);
  const t = {
    web: true, page, ctx, js, wait, userData: os.tmpdir(), shotsDir,
    frame: () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))'),
    check(cond, msg) { results.push({ ok: !!cond, msg }); console.log((cond ? '  PASS ' : '  FAIL ') + msg); },
    async docToClient(x, y) { return js(`(()=>{const p=PP.vp.docToClient(${x},${y});return [Math.round(p.x),Math.round(p.y)]})()`); },
    async setSize(w, h) { await page.setViewportSize({ width: w, height: h }); await wait(200); },
    async drag(pts, { button = 'left', modifiers = [], step = 4 } = {}) {
      const c = [];
      for (const p of pts) c.push(await t.docToClient(p[0], p[1]));
      const mod = { control: 'Control', shift: 'Shift', alt: 'Alt' };
      for (const m of modifiers) await page.keyboard.down(mod[m] || m);
      await page.mouse.move(c[0][0], c[0][1]);
      await page.mouse.down({ button });
      for (let i = 1; i < c.length; i++) {
        const [x0, y0] = c[i - 1], [x1, y1] = c[i];
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
        for (let k = 1; k <= n; k++) await page.mouse.move(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
      }
      await page.mouse.up({ button });
      for (const m of modifiers.slice().reverse()) await page.keyboard.up(mod[m] || m);
      await t.frame();
    },
    async click(x, y, opt = {}) { await t.drag([[x, y], [x, y]], opt); },
    async key(keyCode, modifiers = []) {
      const mod = { control: 'Control', shift: 'Shift', alt: 'Alt' };
      const k = KEYMAP[keyCode] || keyCode;
      await page.keyboard.press([...modifiers.map((m) => mod[m]), k].join('+'));
      await wait(30);
    },
    async dblclick(dx, dy) { const [cx, cy] = await t.docToClient(dx, dy); await page.mouse.dblclick(cx, cy); await wait(100); },
    async keyDown(k) { await page.keyboard.down(KEYMAP[k] || k); await wait(50); },
    async keyUp(k) { await page.keyboard.up(KEYMAP[k] || k); await wait(50); },
    async wheel(x, y, deltaY) { await page.mouse.move(x, y); await page.mouse.wheel(0, deltaY); await wait(100); },
    async shot(n) { await t.frame(); const p = path.join(shotsDir, `web-${name}-${n}.png`); await page.screenshot({ path: p }); console.log('  shot ' + p); return p; },
    async px(x, y, mode = 'all') { return js(`(()=>{const c=PP.doc.sample(${x},${y},'${mode}');return c?[c.r,c.g,c.b,c.a]:null})()`); },
    near(a, b, tol = 12) { return !!a && b.every((v, i) => Math.abs(a[i] - v) <= tol); },
  };
  try {
    console.log('시나리오(web):', name);
    await require(`./${name}.js`)(t);
  } catch (e) {
    console.log('  ERROR ' + (e && e.stack ? e.stack : e));
    results.push({ ok: false, msg: '예외: ' + e });
  }
  t.check(errors.length === 0, '콘솔 오류 없음' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
  return results;
}

(async () => {
  if (!exe) { console.log('Edge/Chrome 을 찾을 수 없습니다'); process.exit(2); }
  const server = await start(0);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-features=ClipboardAPI', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let total = 0, failed = 0;
  for (const n of names) {
    const r = await runOne(browser, server, n);
    total += r.length; failed += r.filter((x) => !x.ok).length;
  }
  console.log(`\n결과(web): ${total - failed}/${total} 통과`);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
