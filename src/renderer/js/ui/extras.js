'use strict';
/* 추가 기능: 색 조화 생성기, 팔레트 가져오기/내보내기, 스포이드 돋보기, 화면 좌우 반전, 참고 이미지 창, 타임랩스 녹화 */
(function (PP) {
  const api = window.api;

  /** 파일 내보내기 (데스크톱: 저장 대화상자, 그 외: 공유/다운로드) */
  PP.exportBytes = async function (name, bytes, mime) {
    if (api) {
      const ext = name.split('.').pop();
      const p = await api.saveDialog({ title: '내보내기', defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (!p) return false;
      await api.writeFile(p, bytes);
      PP.toast('저장했습니다: ' + p.split(/[\\/]/).pop());
      return true;
    }
    await PP.platform.saveBytes(name, bytes, mime);
    return true;
  };

  // ---------- 색 조화 ----------
  const HARMONIES = {
    comp: ['보색', [180]], split: ['분할 보색', [150, 210]], triad: ['삼각 배색', [120, 240]],
    analog: ['유사색', [-30, 30]], tetrad: ['사각 배색', [90, 180, 270]],
  };
  function buildHarmony(body) {
    const sel = PP.el('select');
    for (const [k, v] of Object.entries(HARMONIES)) sel.append(PP.el('option', { value: k, text: v[0] }));
    sel.value = PP.store.get('harmony', 'comp');
    const sw = PP.el('div', { class: 'swatches' });
    const refresh = () => {
      sw.textContent = '';
      const c = PP.hexToRgb(PP.state.fg);
      if (!c) return;
      const hsv = PP.rgbToHsv(c.r, c.g, c.b);
      const mk = (hex, title) => {
        const b = PP.el('button', { class: 'c', style: { background: hex }, title });
        b.addEventListener('click', () => PP.setColor('fg', hex));
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); PP.setColor('bg', hex); });
        sw.append(b);
      };
      mk(PP.state.fg, '현재 색');
      for (const off of HARMONIES[sel.value][1]) {
        const r = PP.hsvToRgb((hsv.h + off + 360) % 360, hsv.s, hsv.v);
        mk(PP.rgbToHex(r.r, r.g, r.b), (off > 0 ? '+' : '') + off + '°');
      }
    };
    sel.addEventListener('change', () => { PP.store.set('harmony', sel.value); refresh(); });
    PP.on('color', refresh);
    const label = PP.el('div', { class: 'cp-label' }, '조화 색', sel);
    body.append(label, sw);
    refresh();
  }

  // ---------- 팔레트 가져오기 / 내보내기 (.gpl · 텍스트 · .json) ----------
  function parsePalette(text) {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      let m = line.match(/#([0-9a-fA-F]{6})\b/);
      if (m) { out.push('#' + m[1].toLowerCase()); continue; }
      m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/);
      if (m) out.push(PP.rgbToHex(+m[1], +m[2], +m[3]));
    }
    if (!out.length) { try { const j = JSON.parse(text); if (Array.isArray(j)) j.forEach((c) => PP.hexToRgb(c) && out.push(String(c).toLowerCase())); } catch (_) { /* 형식 아님 */ } }
    return out;
  }
  function buildPaletteIO(body) {
    const row = PP.el('div', { class: 'cp-mini', style: { marginTop: '6px', justifyContent: 'flex-start' } });
    const imp = PP.el('button', { text: '가져오기', title: '.gpl / 텍스트(#RRGGBB) / .json 팔레트 가져오기', style: { width: 'auto', padding: '0 8px' }, onclick: async () => {
      const f = api ? (await api.openDialog({ title: '팔레트 가져오기', filters: [{ name: '팔레트', extensions: ['gpl', 'txt', 'hex', 'json'] }] }))[0] : await PP.platform.pickFile('.gpl,.txt,.hex,.json');
      if (!f) return;
      const cols = parsePalette(new TextDecoder().decode(f.data));
      if (!cols.length) { PP.toast('팔레트에서 색을 찾지 못했습니다'); return; }
      for (const c of cols) if (!PP.customPalette.includes(c)) PP.customPalette.push(c);
      PP.saveCustomPalette();
      PP.toast(cols.length + '개 색을 가져왔습니다');
    } });
    const exp = PP.el('button', { text: '내보내기', title: '내 팔레트를 .gpl 로 저장', style: { width: 'auto', padding: '0 8px' }, onclick: async () => {
      if (!PP.customPalette.length) { PP.toast('내 팔레트가 비어 있습니다'); return; }
      const lines = ['GIMP Palette', 'Name: 그림판+ 팔레트', '#'];
      for (const h of PP.customPalette) { const c = PP.hexToRgb(h); lines.push(`${c.r} ${c.g} ${c.b} ${h}`); }
      await PP.exportBytes('paintplus-palette.gpl', new TextEncoder().encode(lines.join('\n') + '\n'), 'text/plain');
    } });
    row.append(imp, exp);
    body.append(row);
  }

  // ---------- 화면 좌우 반전 (그림 확인용) ----------
  PP.vp.flipped = false;
  PP.defCmd('view.flip', '화면 좌우 반전 (확인용)', 'Shift+F', () => {
    PP.vp.flipped = !PP.vp.flipped;
    PP.$('#stage').classList.toggle('flip', PP.vp.flipped);
    PP.toast(PP.vp.flipped ? '화면을 좌우 반전했습니다 (파일에는 영향 없음)' : '반전 해제');
    PP.renderOverlay();
  }, { checked: () => PP.vp.flipped });

  // ---------- 참고 이미지 창 ----------
  PP.defCmd('view.reference', '참고 이미지 창...', '', async () => {
    const f = api ? (await api.openDialog({ title: '참고 이미지', filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }))[0] : await PP.platform.pickFile('image/*');
    if (!f) return;
    const url = URL.createObjectURL(new Blob([f.data]));
    const win = PP.el('div', { class: 'ref-win', style: { left: '120px', top: '120px', width: '300px', height: '240px' } });
    const bar = PP.el('div', { class: 'ref-bar' }, PP.el('span', { text: '참고: ' + f.name }));
    const op = PP.el('input', { type: 'range', min: 20, max: 100, value: 100, title: '불투명도' });
    op.addEventListener('input', () => { img.style.opacity = op.value / 100; });
    const close = PP.el('button', { text: '✕', title: '닫기', onclick: () => { URL.revokeObjectURL(url); win.remove(); } });
    bar.append(op, close);
    const img = PP.el('img', { src: url, draggable: 'false' });
    win.append(bar, img);
    document.body.append(win);
    bar.addEventListener('pointerdown', (e) => {
      if (e.target !== bar && e.target.tagName !== 'SPAN') return;
      const r = win.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      bar.setPointerCapture(e.pointerId);
      const mv = (ev) => { win.style.left = ev.clientX - ox + 'px'; win.style.top = ev.clientY - oy + 'px'; };
      const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
    });
  });

  // ---------- 타임랩스: 작업이 쌓일 때마다 축소 프레임을 모아 영상(webm)으로 내보내기 ----------
  const TL = (PP.timelapse = { frames: [], busy: false, last: 0, lastIndex: 0 });
  async function snap() {
    if (TL.busy) return;
    const H = PP.history;
    if (H.index <= TL.lastIndex && TL.frames.length) { TL.lastIndex = H.index; return; }
    TL.lastIndex = H.index;
    if (Date.now() - TL.last < 350) return;
    TL.busy = true;
    TL.last = Date.now();
    try {
      const flat = PP.doc.flatten('#ffffff');
      const k = Math.min(1, 640 / Math.max(flat.width, flat.height));
      const c = PP.makeCanvas(flat.width * k, flat.height * k);
      c.getContext('2d').drawImage(flat, 0, 0, c.width, c.height);
      const blob = await PP.canvasToBlob(c, 'image/jpeg', 0.6);
      TL.frames.push(blob);
      if (TL.frames.length > 360) TL.frames = TL.frames.filter((_, i) => i % 2 === 0); // 절반으로 솎아 메모리 제한
    } finally { TL.busy = false; }
  }
  PP.on('history', snap);
  PP.on('doc:new', () => { TL.frames = []; TL.lastIndex = 0; });

  PP.defCmd('file.timelapse', '타임랩스 영상 내보내기...', '', async () => {
    if (TL.frames.length < 3) { PP.toast('아직 기록된 작업이 적습니다. 조금 더 그린 뒤 시도하세요'); return; }
    if (!window.MediaRecorder) { PP.toast('이 환경에서는 영상 녹화를 지원하지 않습니다'); return; }
    PP.toast('타임랩스 영상을 만드는 중… (' + TL.frames.length + '프레임)', 4000);
    const bmps = await Promise.all(TL.frames.map((b) => createImageBitmap(b)));
    const W = bmps[0].width, H = bmps[0].height;
    const cv = PP.makeCanvas(W, H);
    const x = cv.getContext('2d');
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((r) => { rec.onstop = r; });
    rec.start();
    const perFrame = Math.max(60, Math.min(250, 8000 / bmps.length)); // 전체 8초 안팎
    for (const b of bmps) {
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
      x.drawImage(b, 0, 0, W, H);
      await new Promise((r) => setTimeout(r, perFrame));
    }
    await new Promise((r) => setTimeout(r, 400));
    rec.stop();
    await done;
    const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    await PP.exportBytes('timelapse.webm', bytes, 'video/webm');
  });

  PP.ui.initExtras = function () {
    const body = PP.$('#panel-color .body');
    buildHarmony(body);
    buildPaletteIO(body);
  };
})(window.PP);
