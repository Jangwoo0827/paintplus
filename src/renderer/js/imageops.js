'use strict';
/* 이미지 메뉴: 캔버스 크기, 이미지 크기, 회전/뒤집기, 자르기 (모든 레이어에 적용, 실행 취소 가능) */
(function (PP) {
  const doc = PP.doc;

  /** 모든 레이어를 새 크기의 새 캔버스로 바꿔 그린다. draw(ctx, oldCanvas, layerIndex) */
  function transformAll(name, nw, nh, draw) {
    PP.sel.finish();
    PP.sel.poly = null;
    PP.history.structural(name, () => {
      doc.layers.forEach((l, i) => {
        const c = PP.makeCanvas(nw, nh);
        draw(c.getContext('2d'), l.canvas, i);
        l.canvas = c;
        l._ctx = null;
      });
      doc.width = nw;
      doc.height = nh;
    });
    PP.emit('selection');
    PP.emit('doc:structure');
    PP.vp.center();
    PP.render();
  }

  const I = (PP.img = {
    /** anchor: ax, ay ∈ {0, 0.5, 1} */
    canvasSize(w, h, ax, ay, fillBg) {
      w = PP.clamp(Math.round(w), 1, 16384); h = PP.clamp(Math.round(h), 1, 16384);
      const ow = doc.width, oh = doc.height;
      const bg = PP.state.bg;
      transformAll('캔버스 크기 조절', w, h, (ctx, old, i) => {
        if (fillBg && i === 0) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(old, Math.round((w - ow) * ax), Math.round((h - oh) * ay));
      });
    },

    resize(w, h, smooth) {
      w = PP.clamp(Math.round(w), 1, 16384); h = PP.clamp(Math.round(h), 1, 16384);
      transformAll('이미지 크기 조절', w, h, (ctx, old) => {
        ctx.imageSmoothingEnabled = smooth;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(old, 0, 0, w, h);
      });
    },

    rotate(deg) {
      const w = doc.width, h = doc.height;
      if (deg === 180) {
        transformAll('180° 회전', w, h, (ctx, old) => { ctx.translate(w, h); ctx.rotate(Math.PI); ctx.drawImage(old, 0, 0); });
      } else if (deg === 90) {
        transformAll('시계 방향 90° 회전', h, w, (ctx, old) => { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(old, 0, 0); });
      } else {
        transformAll('반시계 방향 90° 회전', h, w, (ctx, old) => { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); ctx.drawImage(old, 0, 0); });
      }
    },

    flip(horizontal) {
      const w = doc.width, h = doc.height;
      transformAll(horizontal ? '좌우 대칭' : '상하 대칭', w, h, (ctx, old) => {
        if (horizontal) { ctx.translate(w, 0); ctx.scale(-1, 1); } else { ctx.translate(0, h); ctx.scale(1, -1); }
        ctx.drawImage(old, 0, 0);
      });
    },

    crop() {
      PP.sel.finish();
      const b = PP.sel.bounds();
      if (!b) { PP.toast('먼저 자를 영역을 선택하세요'); return; }
      transformAll('선택 영역으로 자르기', b.w, b.h, (ctx, old) => ctx.drawImage(old, -b.x, -b.y));
    },
  });

  // ---------- 대화상자 ----------
  async function canvasSizeDialog() {
    PP.sel.finish();
    const ui = PP.ui;
    const w = ui.num(doc.width, 1, 16384), h = ui.num(doc.height, 1, 16384);
    const keep = ui.check('가로세로 비율 유지', false);
    const ratio = doc.width / doc.height;
    w.addEventListener('input', () => { if (keep.input.checked) h.value = Math.max(1, Math.round(w.value / ratio)); });
    h.addEventListener('input', () => { if (keep.input.checked) w.value = Math.max(1, Math.round(h.value * ratio)); });
    let ax = 0.5, ay = 0.5;
    const grid = PP.el('div', { class: 'anchor-grid' });
    const cells = [];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const b = PP.el('button', { class: i === 1 && j === 1 ? 'on' : '', title: '기준 위치' });
        b.addEventListener('click', () => { ax = i / 2; ay = j / 2; cells.forEach((c) => c.classList.remove('on')); b.classList.add('on'); });
        cells.push(b); grid.append(b);
      }
    }
    const fill = ui.select([['transparent', '투명'], ['bg', '배경색']], 'transparent');
    const r = await ui.modal({
      title: '캔버스 크기',
      body: [ui.row('너비 (px)', w), ui.row('높이 (px)', h), keep.row, PP.el('div', { class: 'frow' }, PP.el('label', { text: '기준 위치' }), grid), ui.row('확장 영역', fill)],
      buttons: [{ label: '확인', value: true, primary: true }, { label: '취소', value: null }],
    }).promise;
    if (r) I.canvasSize(+w.value, +h.value, ax, ay, fill.value === 'bg');
  }

  async function resizeDialog() {
    PP.sel.finish();
    const ui = PP.ui;
    const unit = ui.select([['px', '픽셀'], ['pct', '퍼센트']], 'px');
    const w = ui.num(doc.width, 1, 16384), h = ui.num(doc.height, 1, 16384);
    const keep = ui.check('가로세로 비율 유지', true);
    const smooth = ui.check('부드럽게 (보간)', true);
    const ratio = doc.width / doc.height;
    const sync = (src) => {
      if (!keep.input.checked) return;
      if (src === 'w') h.value = unit.value === 'px' ? Math.max(1, Math.round(w.value / ratio)) : w.value;
      else w.value = unit.value === 'px' ? Math.max(1, Math.round(h.value * ratio)) : h.value;
    };
    w.addEventListener('input', () => sync('w'));
    h.addEventListener('input', () => sync('h'));
    unit.addEventListener('change', () => {
      if (unit.value === 'pct') { w.value = 100; h.value = 100; } else { w.value = doc.width; h.value = doc.height; }
    });
    const r = await ui.modal({
      title: '이미지 크기 조절',
      body: [ui.row('단위', unit), ui.row('너비', w), ui.row('높이', h), keep.row, smooth.row],
      buttons: [{ label: '확인', value: true, primary: true }, { label: '취소', value: null }],
    }).promise;
    if (!r) return;
    const nw = unit.value === 'pct' ? (doc.width * w.value) / 100 : +w.value;
    const nh = unit.value === 'pct' ? (doc.height * h.value) / 100 : +h.value;
    I.resize(nw, nh, smooth.input.checked);
  }

  const D = PP.defCmd;
  D('img.canvasSize', '캔버스 크기...', 'Ctrl+Alt+C', canvasSizeDialog);
  D('img.resize', '이미지 크기 조절...', 'Ctrl+Alt+I', resizeDialog);
  D('img.crop', '선택 영역으로 자르기', 'Ctrl+Shift+X', () => I.crop(), { enabled: () => PP.sel.hasAny() });
  D('img.rotateCW', '시계 방향 90° 회전', '', () => I.rotate(90));
  D('img.rotateCCW', '반시계 방향 90° 회전', '', () => I.rotate(-90));
  D('img.rotate180', '180° 회전', '', () => I.rotate(180));
  D('img.flipH', '좌우 대칭', '', () => I.flip(true));
  D('img.flipV', '상하 대칭', '', () => I.flip(false));
})(window.PP);
