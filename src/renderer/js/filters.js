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
  // ---------- 추가 필터 ----------
  const lutFilter = (src, lut) => {
    const w = src.width, h = src.height;
    const img = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    const c = PP.makeCanvas(w, h);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  };
  const convolve = (src, kernel, div, bias, grayOut) => {
    const w = src.width, h = src.height;
    const s = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const out = new ImageData(w, h);
    const o = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = 0, g = 0, b = 0, k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yy = Math.min(h - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xx = Math.min(w - 1, Math.max(0, x + kx));
            const j = (yy * w + xx) * 4, kv = kernel[k++];
            r += s[j] * kv; g += s[j + 1] * kv; b += s[j + 2] * kv;
          }
        }
        if (grayOut) {
          const v = (0.299 * r + 0.587 * g + 0.114 * b) / div + bias;
          o[i] = o[i + 1] = o[i + 2] = v;
        } else { o[i] = r / div + bias; o[i + 1] = g / div + bias; o[i + 2] = b / div + bias; }
        o[i + 3] = s[i + 3];
      }
    }
    const c = PP.makeCanvas(w, h);
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  };

  Object.assign(FILTERS, {
    hsl: {
      title: '색조/채도/명도',
      params: [{ id: 'h', label: '색조', min: -180, max: 180, value: 0 }, { id: 's', label: '채도', min: -100, max: 200, value: 0 }, { id: 'l', label: '명도', min: -100, max: 100, value: 0 }],
      apply: (src, v) => cssFilter(src, `hue-rotate(${v.h}deg) saturate(${Math.max(0, 1 + v.s / 100)}) brightness(${Math.max(0, 1 + v.l / 100)})`),
    },
    levels: {
      title: '레벨',
      params: [{ id: 'b', label: '어두운 영역', min: 0, max: 254, value: 0 }, { id: 'g', label: '중간톤 (x100)', min: 20, max: 500, value: 100 }, { id: 'w', label: '밝은 영역', min: 1, max: 255, value: 255 }],
      apply: (src, v) => {
        const lut = new Uint8ClampedArray(256);
        const b = Math.min(v.b, v.w - 1), w = v.w, g = v.g / 100;
        for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(PP.clamp((i - b) / (w - b), 0, 1), 1 / g);
        return lutFilter(src, lut);
      },
    },
    posterize: {
      title: '포스터화', params: [{ id: 'n', label: '단계', min: 2, max: 16, value: 4 }],
      apply: (src, v) => {
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.round((i / 255) * (v.n - 1)) * (255 / (v.n - 1)));
        return lutFilter(src, lut);
      },
    },
    pixelate: {
      title: '픽셀화', params: [{ id: 's', label: '블록 크기', min: 2, max: 80, value: 10 }],
      apply: (src, v) => {
        const w = src.width, h = src.height;
        const sw = Math.max(1, Math.round(w / v.s)), sh = Math.max(1, Math.round(h / v.s));
        const small = PP.makeCanvas(sw, sh);
        const sx = small.getContext('2d');
        sx.imageSmoothingEnabled = true;
        sx.drawImage(src, 0, 0, sw, sh);
        const c = PP.makeCanvas(w, h);
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(small, 0, 0, w, h);
        return c;
      },
    },
    noise: {
      title: '노이즈 추가', params: [{ id: 'a', label: '양', min: 1, max: 100, value: 25 }, { id: 'm', label: '흑백 노이즈 (0/1)', min: 0, max: 1, value: 1 }],
      apply: (src, v) => {
        const w = src.width, h = src.height;
        const img = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
        const d = img.data, amp = v.a * 2.55;
        let seed = 1234567;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          const n = rnd() * amp;
          if (v.m) { d[i] += n; d[i + 1] += n; d[i + 2] += n; }
          else { d[i] += rnd() * amp; d[i + 1] += rnd() * amp; d[i + 2] += rnd() * amp; }
        }
        const c = PP.makeCanvas(w, h);
        c.getContext('2d').putImageData(img, 0, 0);
        return c;
      },
    },
    motion: {
      title: '모션 블러',
      params: [{ id: 'd', label: '거리', min: 1, max: 80, value: 20 }, { id: 'a', label: '각도', min: 0, max: 180, value: 0 }],
      apply: (src, v) => {
        const w = src.width, h = src.height;
        const c = PP.makeCanvas(w, h);
        const x = c.getContext('2d');
        const rad = (v.a * Math.PI) / 180;
        const n = Math.max(2, Math.min(40, Math.round(v.d)));
        for (let i = 0; i < n; i++) {
          const t = (i / (n - 1) - 0.5) * v.d;
          x.globalAlpha = 1 / (i + 1);
          x.drawImage(src, Math.cos(rad) * t, Math.sin(rad) * t);
        }
        return c;
      },
    },
    edge: {
      title: '윤곽선 검출', params: [],
      apply: (src) => {
        const gx = convolve(src, [-1, 0, 1, -2, 0, 2, -1, 0, 1], 1, 0, true);
        const gy = convolve(src, [-1, -2, -1, 0, 0, 0, 1, 2, 1], 1, 0, true);
        const w = src.width, h = src.height;
        const a = gx.getContext('2d').getImageData(0, 0, w, h), b = gy.getContext('2d').getImageData(0, 0, w, h);
        for (let i = 0; i < a.data.length; i += 4) {
          const m = Math.min(255, Math.hypot(a.data[i], b.data[i]));
          a.data[i] = a.data[i + 1] = a.data[i + 2] = 255 - m;
          a.data[i + 3] = a.data[i + 3] ? 255 : 0;
        }
        const c = PP.makeCanvas(w, h);
        c.getContext('2d').putImageData(a, 0, 0);
        return c;
      },
    },
    emboss: { title: '엠보스', params: [], apply: (src) => convolve(src, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 128, true) },
    vignette: {
      title: '비네팅', params: [{ id: 'a', label: '강도', min: 5, max: 100, value: 55 }],
      apply: (src, v) => {
        const w = src.width, h = src.height;
        const c = PP.cloneCanvas(src);
        const x = c.getContext('2d');
        const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) / 2);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${v.a / 100})`);
        x.globalCompositeOperation = 'source-atop';
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
        return c;
      },
    },
  });
  PP.FILTERS = FILTERS;

  /** 현재 레이어(선택 영역 안)에 필터를 적용한다. */
  function run(key) {
    const F = FILTERS[key];
    PP.sel.finish();
    if (!PP.canPaint()) return;
    const layer = PP.doc.active();
    const region = PP.sel.boundsOrDoc();
    const orig = PP.cropCanvas(layer.canvas, region);
    const hasSel = PP.sel.hasRegion();
    const rmask = hasSel ? PP.sel.regionMask(region) : null;

    const paint = (vals) => {
      const res = F.apply(orig, vals);
      const c = layer.ctx;
      c.save();
      c.clearRect(region.x, region.y, region.w, region.h);
      c.drawImage(orig, region.x, region.y);
      if (hasSel) {
        // 선택된 곳만 필터 결과로 교체
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(rmask, region.x, region.y);
        const part = PP.cloneCanvas(res);
        const px = part.getContext('2d');
        px.globalCompositeOperation = 'destination-in';
        px.drawImage(rmask, 0, 0);
        c.globalCompositeOperation = 'source-over';
        c.drawImage(part, region.x, region.y);
      } else {
        c.drawImage(res, region.x, region.y);
      }
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
  D('filter.hsl', '색조/채도/명도...', 'Ctrl+U', () => run('hsl'));
  D('filter.levels', '레벨...', 'Ctrl+L', () => run('levels'));
  D('filter.posterize', '포스터화...', '', () => run('posterize'));
  D('filter.pixelate', '픽셀화...', '', () => run('pixelate'));
  D('filter.noise', '노이즈 추가...', '', () => run('noise'));
  D('filter.motion', '모션 블러...', '', () => run('motion'));
  D('filter.edge', '윤곽선 검출', '', () => run('edge'));
  D('filter.emboss', '엠보스', '', () => run('emboss'));
  D('filter.vignette', '비네팅...', '', () => run('vignette'));
  PP.runFilter = run;
})(window.PP);
