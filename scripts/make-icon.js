'use strict';
/*
 * 앱 아이콘 생성기:  npm run icon
 * SVG 를 Electron 오프스크린 창으로 렌더링 → build/icon.png (512) + build/icon.ico (16~256 멀티 사이즈)
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'build');
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#a21caf"/>
    </linearGradient>
    <linearGradient id="pal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e5e7f5"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="12" y="12" width="488" height="488" rx="112" fill="url(#bg)"/>
  <path d="M256 92C146 92 62 164 62 256c0 84 66 150 150 150 28 0 44-12 44-34 0-16-10-24-10-38 0-18 14-30 34-30h58c58 0 106-38 106-92 0-76-80-120-188-120z" fill="url(#pal)" filter="url(#sh)"/>
  <circle cx="162" cy="238" r="30" fill="#ef4444"/>
  <circle cx="236" cy="168" r="30" fill="#f59e0b"/>
  <circle cx="330" cy="176" r="30" fill="#22c55e"/>
  <circle cx="404" cy="236" r="26" fill="#38bdf8"/>
  <circle cx="190" cy="330" r="26" fill="#6366f1"/>
  <circle cx="402" cy="402" r="84" fill="#10b981" stroke="#ffffff" stroke-width="14" filter="url(#sh)"/>
  <path d="M402 362v80M362 402h80" stroke="#ffffff" stroke-width="24" stroke-linecap="round"/>
</svg>`;

function makeIco(images) {
  // images: [{size, png:Buffer}] — PNG 압축 엔트리 방식 ICO
  const n = images.length;
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  const dir = Buffer.alloc(16 * n);
  let offset = 6 + 16 * n;
  images.forEach((im, i) => {
    const o = i * 16;
    dir[o] = im.size >= 256 ? 0 : im.size;
    dir[o + 1] = im.size >= 256 ? 0 : im.size;
    dir[o + 2] = 0; dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(im.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += im.png.length;
  });
  return Buffer.concat([head, dir, ...images.map((i) => i.png)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true, contextIsolation: true },
  });
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${SVG}</body></html>`;
  const painted = new Promise((resolve) => {
    let t = null;
    win.webContents.on('paint', (_e, _dirty, image) => {
      clearTimeout(t);
      t = setTimeout(() => resolve(image), 400); // 마지막 페인트를 사용
    });
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.webContents.invalidate();
  const img = await painted;
  const size = img.getSize();
  console.log('rendered', size);
  let base = img;
  if (size.width !== 512) base = img.resize({ width: 512, height: 512, quality: 'best' });
  fs.writeFileSync(path.join(outDir, 'icon.png'), base.toPNG());
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = sizes.map((s) => ({ size: s, png: nativeImage.createFromBuffer(base.toPNG()).resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(outDir, 'icon.ico'), makeIco(entries));
  console.log('wrote', fs.readdirSync(outDir));
  app.exit(0);
});
