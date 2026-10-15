'use strict';
/*
 * 실제 Electron 창을 띄워 입력(마우스/키보드)을 주입하고 결과를 검증하는 스모크 테스트.
 *   npm run smoke -- stage1      (스크린샷은 PP_SHOTS 폴더, 기본: OS 임시 폴더)
 */
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scenarioName = process.argv.find((a, i) => i >= 2 && /^[a-z0-9_-]+$/i.test(a)) || 'stage1';
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'paintplus-smoke-'));
app.setPath('userData', userData);
const shotsDir = process.env.PP_SHOTS || path.join(os.tmpdir(), 'paintplus-shots');
fs.mkdirSync(shotsDir, { recursive: true });

require('../src/main/main.js');

const results = [];
const consoleErrors = [];

app.whenReady().then(async () => {
  let win = null;
  for (let i = 0; i < 100 && !win; i++) {
    win = BrowserWindow.getAllWindows()[0];
    if (!win) await new Promise((r) => setTimeout(r, 50));
  }
  const wc = win.webContents;
  wc.on('console-message', (e) => {
    const lvl = e.level !== undefined ? e.level : 0;
    if (lvl === 'error' || lvl === 3) consoleErrors.push(e.message || '');
  });
  win.setSize(1500, 940);
  win.center();
  await new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code, true);
  const t = {
    win, wc, js, wait, dialog, userData, shotsDir,
    frame: () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))'),
    check(cond, msg) {
      results.push({ ok: !!cond, msg });
      console.log((cond ? '  PASS ' : '  FAIL ') + msg);
    },
    async docToClient(x, y) {
      return js(`(()=>{const p=PP.vp.docToClient(${x},${y});return [Math.round(p.x),Math.round(p.y)]})()`);
    },
    mouse(type, x, y, extra = {}) {
      wc.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), clickCount: 1, ...extra });
    },
    /** 문서 좌표 점들을 따라 드래그 */
    async drag(pts, { button = 'left', modifiers = [], step = 4 } = {}) {
      const down = button === 'left' ? 'leftButtonDown' : button === 'right' ? 'rightButtonDown' : 'middleButtonDown';
      const c = [];
      for (const p of pts) c.push(await t.docToClient(p[0], p[1]));
      t.mouse('mouseMove', c[0][0], c[0][1], { modifiers });
      await wait(20);
      t.mouse('mouseDown', c[0][0], c[0][1], { button, modifiers: [...modifiers, down] });
      for (let i = 1; i < c.length; i++) {
        const [x0, y0] = c[i - 1], [x1, y1] = c[i];
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
        for (let k = 1; k <= n; k++) {
          t.mouse('mouseMove', x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, { button, modifiers: [...modifiers, down] });
          if (k % 6 === 0) await wait(1);
        }
      }
      const last = c[c.length - 1];
      await wait(15);
      t.mouse('mouseUp', last[0], last[1], { button, modifiers });
      await t.frame();
    },
    async click(x, y, opt = {}) {
      await t.drag([[x, y], [x, y]], opt);
    },
    async key(keyCode, modifiers = []) {
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      await wait(30);
    },
    async shot(name) {
      await t.frame();
      await wait(80);
      const img = await wc.capturePage();
      const p = path.join(shotsDir, `${scenarioName}-${name}.png`);
      fs.writeFileSync(p, img.toPNG());
      console.log('  shot ' + p);
      return p;
    },
    /** 문서 좌표 (x,y)의 합성 색 [r,g,b,a] */
    async px(x, y, mode = 'all') {
      return js(`(()=>{const c=PP.doc.sample(${x},${y},'${mode}');return c?[c.r,c.g,c.b,c.a]:null})()`);
    },
    near(a, b, tol = 12) { return !!a && b.every((v, i) => Math.abs(a[i] - v) <= tol); },
  };

  let code = 0;
  try {
    await js("new Promise(r=>{const f=()=>document.body.dataset.ready?r(1):setTimeout(f,30);f()})");
    await wait(200);
    console.log('시나리오:', scenarioName);
    await require(`./${scenarioName}.js`)(t);
  } catch (e) {
    console.log('  ERROR ' + (e && e.stack ? e.stack : e));
    results.push({ ok: false, msg: '시나리오 예외: ' + e });
  }
  t.check(consoleErrors.length === 0, '콘솔 오류 없음' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 4).join(' | ') : ''));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
  code = failed ? 1 : 0;
  app.exit(code);
});
