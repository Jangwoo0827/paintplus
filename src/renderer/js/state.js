'use strict';
/* 전역 상태: 색상, 도구, 도구별 옵션, 보기 설정 */
(function (PP) {
  const saved = PP.store.get('settings', {}) || {};

  const TOOL_DEFAULTS = {
    pencil: { size: 2, opacity: 100, smoothing: 0, pressure: true },
    brush: { size: 24, opacity: 100, hardness: 50, spacing: 12, smoothing: 30, pressure: true, type: 'soft' },
    eraser: { size: 30, opacity: 100, hardness: 80, spacing: 10, smoothing: 20, pressure: true },
    fill: { tolerance: 32, opacity: 100, expand: 1, allLayers: false },
    gradient: { gradType: 'linear', gradColors: 'fg-bg', opacity: 100 },
    picker: { sample: 'all' },
    line: { lineWidth: 4, shapeMode: 'stroke', opacity: 100 },
    rect: { lineWidth: 4, shapeMode: 'stroke', opacity: 100 },
    roundrect: { lineWidth: 4, shapeMode: 'stroke', opacity: 100, radius: 24 },
    ellipse: { lineWidth: 4, shapeMode: 'stroke', opacity: 100 },
    triangle: { lineWidth: 4, shapeMode: 'stroke', opacity: 100 },
    polygon: { lineWidth: 4, shapeMode: 'stroke', opacity: 100 },
    arrow: { lineWidth: 4, shapeMode: 'stroke', opacity: 100 },
    curve: { lineWidth: 4, shapeMode: 'stroke', opacity: 100 },
    text: { fontFamily: '맑은 고딕', fontSize: 32, bold: false, italic: false, opacity: 100 },
    selrect: {},
    sellasso: {},
    smudge: { size: 30, strength: 60, hardness: 60, spacing: 8, smoothing: 10, pressure: false },
    blurbrush: { size: 40, strength: 60, hardness: 60, spacing: 10, smoothing: 10, pressure: true },
    sharpbrush: { size: 40, strength: 60, hardness: 60, spacing: 10, smoothing: 10, pressure: true },
    dodge: { size: 50, strength: 30, hardness: 30, spacing: 10, smoothing: 10, pressure: true },
    burn: { size: 50, strength: 30, hardness: 30, spacing: 10, smoothing: 10, pressure: true },
    clone: { size: 40, strength: 100, hardness: 60, spacing: 8, smoothing: 0, pressure: false },
    wand: { tolerance: 32, contiguous: true, allLayers: false },
    hand: {},
    zoom: {},
  };

  const S = (PP.state = {
    fg: saved.fg || '#000000',
    bg: saved.bg || '#ffffff',
    tool: '',
    prevTool: 'brush',
    toolOpts: {},
    symmetry: { mode: 'none', n: 6 },
    selMode: 'replace',
    grid: { show: !!saved.gridShow, size: saved.gridSize || 16, snap: !!saved.gridSnap },
    rulers: saved.rulers !== false,
    theme: saved.theme || 'dark',
  });
  for (const k of Object.keys(TOOL_DEFAULTS)) {
    S.toolOpts[k] = { ...TOOL_DEFAULTS[k], ...((saved.toolOpts || {})[k] || {}) };
  }
  PP.opts = (tool) => S.toolOpts[tool || S.tool] || {};

  const persist = PP.debounce(() => {
    PP.store.set('settings', {
      fg: S.fg, bg: S.bg, theme: S.theme, toolOpts: S.toolOpts,
      gridShow: S.grid.show, gridSize: S.grid.size, gridSnap: S.grid.snap, rulers: S.rulers,
    });
  }, 400);
  PP.persistSettings = persist;

  PP.setColor = function (which, hex, fromPicker) {
    hex = hex.toLowerCase();
    if (S[which] === hex && !fromPicker) return;
    S[which] = hex;
    PP.emit('color', which, fromPicker);
    persist();
  };
  PP.swapColors = function () {
    const t = S.fg; S.fg = S.bg; S.bg = t;
    PP.emit('color', 'both');
    persist();
  };
  PP.resetColors = function () {
    S.fg = '#000000'; S.bg = '#ffffff';
    PP.emit('color', 'both');
    persist();
  };

  PP.setGrid = function (patch) {
    Object.assign(S.grid, patch);
    PP.emit('view-settings');
    PP.render();
    persist();
  };
  PP.setRulers = function (on) {
    S.rulers = on;
    PP.emit('view-settings');
    persist();
  };
  PP.setTheme = function (t) {
    S.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    PP.emit('theme', t);
    PP.render();
    persist();
  };
  document.documentElement.setAttribute('data-theme', S.theme);

  // ---------- 최근 색 / 사용자 팔레트 ----------
  PP.recent = PP.store.get('recent', []);
  PP.pushRecent = function (hex) {
    hex = hex.toLowerCase();
    PP.recent = [hex, ...PP.recent.filter((c) => c !== hex)].slice(0, 16);
    PP.store.set('recent', PP.recent);
    PP.emit('palette');
  };
  PP.customPalette = PP.store.get('palette', []);
  PP.saveCustomPalette = function () {
    PP.store.set('palette', PP.customPalette);
    PP.emit('palette');
  };
})(window.PP);
