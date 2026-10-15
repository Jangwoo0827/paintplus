'use strict';
/* 필터: 흐림, 선명하게, 밝기/대비, 채도, 흑백, 반전, 세피아. 선택 영역이 있으면 그 안에만 적용. 매개변수 필터는 실시간 미리보기. */
(function (PP) {
  // ---------- 필터 구현 ----------
  /** CSS 필터 문자열을 적용한 새 캔버스. pad: 가장자리 번짐 방지용 복제 여백 */
  function cssFilter(src, filter, pad = 0) {
    const w = src.width, h = src.height;
    const P = PP.makeCanvas(w + pad * 2, h + pad * 2);
    const px = P.getContext('2d');
    px.drawImage(src, pad, pad);
    if (pad) {
      px.drawImage(src, 0, 0, 1, h, 0, pad, pad, h);
      px.drawImage(src, w - 1, 0, 1, h, pad + w, pad, pad, h);
      px.drawImage(src, 0, 0, w, 1, pad, 0, w, pad);
      px.drawImage(src, 0, h - 1, w, 1, pad, pad + h, w, pad);
      px.drawImage(src, 0, 0, 1, 1, 0, 0, pad, pad);
      px.drawImage(src, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
      px.drawImage(src, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
      px.drawImage(src, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);
    }
    const R = PP.makeCanvas(w + pad * 2, h + pad * 2);
    const rx = R.getContext('2d');
    rx.filter = filter;
    rx.drawImage(P, 0, 0);
    rx.filter = 'none';
    if (!pad) return R;
    return PP.cropCanvas(R, { x: pad, y: pad, w, h });
  }

  function sharpen(src, amount) {
    const w = src.width, h = src.height;
    const sx = src.getContext('2d', { willReadFrequently: true });
    const img = sx.getImageData(0, 0, w, h);
    const s = img.data;
    const out = new ImageData(w, h);
    const o = out.data;
    const a = amount / 60; // 0..~1.7
    const cen = 1 + 4 * a;
    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
      for (let x = 0; x < w; x++) {
        const x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
        const i = (y * w + x) * 4;
        const iu = (y0 * w + x) * 4, id = (y1 * w + x) * 4, il = (y * w + x0) * 4, ir = (y * w + x1) * 4;
        for (let c = 0; c < 3; c++) {
          const v = s[i + c] * cen - a * (s[iu + c] + s[id + c] + s[il + c] + s[ir + c]);
          o[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
        o[i + 3] = s[i + 3];
      }
    }
    const c = PP.makeCanvas(w, h);
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  }

  const FILTERS = {
    blur: {
      title: '흐림 효과', params: [{ id: 'r', label: '반경', min: 1, max: 60, value: 6 }],
      apply: (src, v) => cssFilter(src, `blur(${v.r}px)`, Math.ceil(v.r * 3)),
    },
    sharpen: {
      title: '선명하게', params: [{ id: 'a', label: '강도', min: 1, max: 100, value: 40 }],
      apply: (src, v) => sharpen(src, v.a),
    },
    brightness: {
      title: '밝기/대비',
      params: [{ id: 'b', label: '밝기', min: -100, max: 100, value: 0 }, { id: 'c', label: '대비', min: -100, max: 100, value: 0 }],
      apply: (src, v) => cssFilter(src, `brightness(${1 + v.b / 100}) contrast(${1 + v.c / 100})`),
    },
    saturation: {
      title: '채도', params: [{ id: 's', label: '채도', min: -100, max: 200, value: 0 }],
      apply: (src, v) => cssFilter(src, `saturate(${Math.max(0, 1 + v.s / 100)})`),
    },
    gray: { title: '흑백', params: [], apply: (src) => cssFilter(src, 'grayscale(1)') },
    invert: { title: '색 반전', params: [], apply: (src) => cssFilter(src, 'invert(1)') },
    sepia: { title: '세피아', params: [], apply: (src) => cssFilter(src, 'sepia(1)') },
  };
  PP.FILTERS = FILTERS;

  /** 현재 레이어(선택 영역 안)에 필터를 적용한다. */
  function run(key) {
    const F = FILTERS[key];
    PP.sel.finish();
    if (!PP.canPaint()) return;
    const layer = PP.doc.active();
    const region = PP.sel.boundsOrDoc();
    const orig = PP.cropCanvas(layer.canvas, region);
    const hasSel = !!PP.sel.poly;

    const paint = (vals) => {
      const res = F.apply(orig, vals);
      const c = layer.ctx;
      c.save();
      c.clearRect(region.x, region.y, region.w, region.h);
      c.drawImage(orig, region.x, region.y);
      if (hasSel) {
        PP.sel.pathOn(c);
        c.clip();
        c.clearRect(region.x, region.y, region.w, region.h);
      }
      c.drawImage(res, region.x, region.y);
      c.restore();
      PP.doc.touch(layer);
    };
    const restore = () => {
      layer.ctx.clearRect(region.x, region.y, region.w, region.h);
      layer.ctx.drawImage(orig, region.x, region.y);
      PP.doc.touch(layer);
    };

    if (!F.params.length) {
      paint({});
      PP.history.pushSwap(layer.id, region, orig, F.title);
      return;
    }

    const vals = {};
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; paint(vals); });
    };
    const rows = F.params.map((p) => {
      vals[p.id] = p.value;
      const s = PP.ui.slider(p.label, p.min, p.max, p.value, (v) => { vals[p.id] = v; schedule(); });
      return s.row;
    });
    paint(vals);
    const m = PP.ui.modal({
      title: F.title, nodim: true, nofocus: true,
      body: rows,
      buttons: [{ label: '확인', value: true, primary: true }, { label: '취소', value: null }],
    });
    m.promise.then((ok) => {
      if (ok) {
        paint(vals);
        PP.history.pushSwap(layer.id, region, orig, F.title);
      } else {
        restore();
      }
    });
  }

  const D = PP.defCmd;
  D('filter.blur', '흐림 효과...', '', () => run('blur'));
  D('filter.sharpen', '선명하게...', '', () => run('sharpen'));
  D('filter.brightness', '밝기/대비...', 'Ctrl+Shift+B', () => run('brightness'));
  D('filter.saturation', '채도...', 'Ctrl+Shift+U', () => run('saturation'));
  D('filter.gray', '흑백', '', () => run('gray'));
  D('filter.invert', '색 반전', 'Ctrl+I', () => run('invert'));
  D('filter.sepia', '세피아', '', () => run('sepia'));
  PP.runFilter = run;
})(window.PP);
