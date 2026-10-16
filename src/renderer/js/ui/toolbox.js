'use strict';
/* 왼쪽 도구 상자 + 상단 도구 옵션바 */
(function (PP) {
  const ui = (PP.ui = PP.ui || {});
  const I = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;

  // [id, 이름, 단축키 표시, 아이콘]
  const TOOLS = [
    ['pencil', '연필', 'P', I('<path d="M4 20l1-4L17 4l3 3L8 19z"/><path d="M14 7l3 3"/>')],
    ['brush', '브러시', 'B', I('<path d="M18.4 3.6a2 2 0 0 1 0 2.8L11 14l-3-3 7.6-7.4a2 2 0 0 1 2.8 0z"/><path d="M8 11c-2.5 0-4 1.5-4 4 0 1.5-1 2.5-2 3 3 1.5 8 1 8-4"/>')],
    ['eraser', '지우개', 'E', I('<path d="M7 21h12"/><path d="M5 15L15 4a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L10 20H7l-2-2a2 2 0 0 1 0-3z"/><path d="M9 10l6 6"/>')],
    ['fill', '페인트통', 'G', I('<path d="M4 12l8-8 8 8-8 8z"/><path d="M4 12h16"/><path d="M20 16c1 1.5 1.5 2.3 1.5 3a1.5 1.5 0 0 1-3 0c0-.7.5-1.5 1.5-3z"/>')],
    ['gradient', '그라디언트', 'Shift+G', I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 16l10-8" stroke-dasharray="2 2.5"/>')],
    ['picker', '스포이드', 'I', I('<path d="M14 7l3 3"/><path d="M16 4l4 4-3 3-4-4z"/><path d="M13 8L5 16v3h3l8-8"/>')],
    ['smudge', '손가락(번지기)', 'S', I('<path d="M7 20c-2-1-2-4 0-6l5-8a2 2 0 0 1 3 2l-2 4 4-1a2 2 0 0 1 1 3l-3 6c-1 2-5 3-8 0z"/>')],
    ['oil', '유화/아크릴(색 섞기)', 'Shift+O', I('<path d="M4 20c0-4 3-6 6-8l8-8 2 2-8 8c-2 3-4 6-8 6z"/><path d="M14 6l4 4"/>')],
    ['liquify', '픽셀 유동화', 'Shift+L', I('<path d="M4 12c3-6 5 6 8 0s5 6 8 0"/><path d="M4 17c3-6 5 6 8 0s5 6 8 0"/>')],
    ['blurbrush', '흐림 브러시', 'Shift+B', I('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/>')],
    ['sharpbrush', '선명 브러시', 'Shift+S', I('<path d="M12 4l8 14H4z"/><path d="M12 9l3.5 6h-7z"/>')],
    ['dodge', '닷지(밝게)', 'Shift+D', I('<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/>')],
    ['burn', '번(어둡게)', 'Shift+E', I('<path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3 2-4 .5 2 1.5 2.5 2.5 2.5C10 9 10 6 12 3z"/>')],
    ['clone', '복제 도장', 'K', I('<rect x="4" y="13" width="9" height="7" rx="1"/><path d="M8.5 13V9a3.5 3.5 0 1 1 7 0v1"/><path d="M15 15h5M17.5 12.5v5"/>')],
    ['sep'],
    ['line', '직선', 'L', I('<path d="M5 19L19 5"/>')],
    ['rect', '사각형', 'R', I('<rect x="4" y="6" width="16" height="12"/>')],
    ['roundrect', '둥근 사각형', 'Shift+R', I('<rect x="4" y="6" width="16" height="12" rx="4"/>')],
    ['ellipse', '원/타원', 'O', I('<ellipse cx="12" cy="12" rx="8" ry="6"/>')],
    ['triangle', '삼각형', 'Y', I('<path d="M12 5l8 14H4z"/>')],
    ['polygon', '다각형', 'N', I('<path d="M12 4l7 5-3 10H8L5 9z"/>')],
    ['arrow', '화살표', 'W', I('<path d="M5 19L19 5"/><path d="M10 5h9v9"/>')],
    ['curve', '곡선', 'C', I('<path d="M4 18C8 4 14 4 20 18"/>')],
    ['sep'],
    ['text', '텍스트', 'T', I('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>')],
    ['selrect', '사각형 선택', 'V', I('<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2.5"/>')],
    ['sellasso', '자유형 선택', 'Shift+V', I('<path d="M12 4c5 0 8 2 8 5s-3 4-6 4c-1 0-2 .5-2 1.5s.5 1.5 1 2.5" stroke-dasharray="3 2.5"/><path d="M4 9c0-3 3-5 8-5"/><circle cx="12" cy="19" r="1.4"/>')],
    ['wand', '마술봉', 'M', I('<path d="M5 19L16 8"/><path d="M14 6l4 4"/><path d="M18 3v3M16.5 4.5h3M7 4v2M6 5h2M20 13v2M19 14h2"/>')],
    ['hand', '손바닥', 'H / Space', I('<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6-3 0-4.5-1.5-6-4l-2-3a1.5 1.5 0 0 1 2.4-1.7L8 13"/>')],
    ['zoom', '돋보기', 'Z', I('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/><path d="M8 10.5h5M10.5 8v5"/>')],
  ];
  ui.TOOLS = TOOLS.filter((t) => t[0] !== 'sep');
  const btns = {};

  ui.initToolbox = function () {
    const box = PP.$('#toolbox');
    for (const t of TOOLS) {
      if (t[0] === 'sep') { box.append(PP.el('div', { class: 'tool-sep' })); continue; }
      const b = PP.el('button', { class: 'tool-btn', html: t[3], title: `${t[1]} (${t[2]})`, 'data-tool': t[0], onclick: () => PP.selectTool(t[0]) });
      btns[t[0]] = b;
      box.append(b);
    }
    PP.on('tool', () => {
      for (const k of Object.keys(btns)) btns[k].classList.toggle('active', k === PP.state.tool);
    });
    PP.on('tool', buildOptions);
    PP.on('doc:meta', () => {});
  };

  PP.selectTool = function (name) {
    if (!PP.tools[name]) return;
    const S = PP.state;
    if (S.tool === name) return;
    const old = PP.tools[S.tool];
    if (old && old.deactivate) old.deactivate();
    PP.commitTextEditor && PP.commitTextEditor(true);
    if (!(name === 'selrect' || name === 'sellasso')) PP.sel.finish();
    PP.vp.cancelGesture && PP.vp.cancelGesture();
    S.prevTool = S.tool;
    S.tool = name;
    const t = PP.tools[name];
    if (t.activate) t.activate();
    PP.emit('tool', name);
    PP.renderOverlay();
  };

  // ---------- 옵션 정의 ----------
  const SHAPE_MODES = [['stroke', '외곽선'], ['fill', '채우기 (전경색)'], ['both', '외곽선 + 채우기']];
  const FONTS = ['맑은 고딕', '굴림', '바탕', '돋움', '궁서', 'Segoe UI', 'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Consolas', 'Impact', 'Comic Sans MS'];
  const DEF = {
    size: { type: 'range', label: '크기', min: 1, max: 300, unit: 'px' },
    opacity: { type: 'range', label: '불투명도', min: 1, max: 100, unit: '%' },
    hardness: { type: 'range', label: '경도', min: 0, max: 100, unit: '%' },
    spacing: { type: 'range', label: '간격', min: 1, max: 200, unit: '%' },
    smoothing: { type: 'range', label: '손떨림 보정', min: 0, max: 100, unit: '%' },
    jitter: { type: 'range', label: '크기 지터', min: 0, max: 100, unit: '%' },
    velocity: { type: 'range', label: '속도 감응', min: 0, max: 100, unit: '%' },
    tilt: { type: 'range', label: '기울기 감응', min: 0, max: 100, unit: '%' },
    colorJitter: { type: 'range', label: '색 변화', min: 0, max: 100, unit: '%' },
    pressure: { type: 'check', label: '필압' },
    type: { type: 'select', label: '브러시', items: () => PP.BRUSH_TYPES, preset: true },
    tolerance: { type: 'range', label: '허용 오차', min: 0, max: 255, unit: '' },
    expand: { type: 'range', label: '경계 확장', min: 0, max: 8, unit: 'px' },
    allLayers: { type: 'check', label: '모든 레이어 참조' },
    mode: { type: 'select', label: '모드', items: () => [['push', '밀기'], ['bloat', '부풀리기'], ['pinch', '오므리기'], ['twirl', '비틀기']] },
    strength: { type: 'range', label: '강도', min: 1, max: 100, unit: '%' },
    contiguous: { type: 'check', label: '연결된 영역만' },
    gradType: { type: 'select', label: '모양', items: () => [['linear', '선형'], ['radial', '방사형'], ['reflected', '반사형'], ['angular', '각도형']] },
    gradColors: { type: 'select', label: '색', items: () => [['fg-bg', '전경 → 배경'], ['fg-clear', '전경 → 투명'], ['bg-fg', '배경 → 전경']] },
    sample: { type: 'select', label: '샘플', items: () => [['all', '모든 레이어'], ['layer', '현재 레이어']] },
    shapeMode: { type: 'select', label: '모양 채우기', items: () => SHAPE_MODES },
    lineWidth: { type: 'range', label: '선 두께', min: 1, max: 100, unit: 'px' },
    radius: { type: 'range', label: '모서리', min: 0, max: 200, unit: 'px' },
    fontFamily: { type: 'select', label: '글꼴', items: () => FONTS.map((f) => [f, f]) },
    fontSize: { type: 'number', label: '크기', min: 6, max: 600, unit: 'px' },
    bold: { type: 'toggle', label: '굵게', text: 'B' },
    italic: { type: 'toggle', label: '기울임', text: 'I' },
  };
  const TOOL_OPTIONS = {
    pencil: ['size', 'opacity', 'smoothing', 'pressure', '@sym'],
    brush: ['type', 'size', 'opacity', 'hardness', 'spacing', 'smoothing', 'pressure', 'jitter', 'velocity', 'tilt', 'colorJitter', '@sym'],
    eraser: ['size', 'opacity', 'hardness', 'smoothing', 'pressure', '@sym'],
    fill: ['tolerance', 'expand', 'opacity', 'allLayers'],
    gradient: ['gradType', 'gradColors', 'opacity'],
    picker: ['sample'],
    line: ['lineWidth', 'opacity', '@ops'],
    rect: ['shapeMode', 'lineWidth', 'opacity', '@ops'],
    roundrect: ['shapeMode', 'lineWidth', 'radius', 'opacity', '@ops'],
    ellipse: ['shapeMode', 'lineWidth', 'opacity', '@ops'],
    triangle: ['shapeMode', 'lineWidth', 'opacity', '@ops'],
    polygon: ['shapeMode', 'lineWidth', 'opacity', '@ops'],
    arrow: ['lineWidth', 'opacity', '@ops'],
    curve: ['lineWidth', 'opacity', '@ops'],
    text: ['fontFamily', 'fontSize', 'bold', 'italic', 'opacity', '@ops'],
    smudge: ['size', 'strength', 'hardness', 'smoothing'],
    oil: ['size', 'strength', 'hardness', 'smoothing'],
    liquify: ['mode', 'size', 'strength'],
    blurbrush: ['size', 'strength', 'hardness', 'pressure', '@sym'],
    sharpbrush: ['size', 'strength', 'hardness', 'pressure', '@sym'],
    dodge: ['size', 'strength', 'hardness', 'pressure', '@sym'],
    burn: ['size', 'strength', 'hardness', 'pressure', '@sym'],
    clone: ['size', 'strength', 'hardness', 'spacing', '@clone'],
    selrect: ['@sel'], sellasso: ['@sel'], wand: ['@selmode', 'tolerance', 'contiguous', 'allLayers', '@selops'], hand: [], zoom: [],
  };
  const HINTS = {
    pencil: '드래그하여 그리기 · 우클릭: 배경색 · Alt: 스포이드',
    brush: '드래그하여 그리기 · [ ] 키로 크기 조절 · 우클릭: 배경색',
    eraser: '드래그하여 지우기',
    fill: '클릭하여 채우기 · 우클릭: 배경색으로',
    gradient: '드래그하여 그라디언트 적용',
    picker: '클릭: 전경색 · 우클릭: 배경색',
    smudge: '드래그하여 색을 문지르기',
    dodge: '칠한 곳을 밝게 (강도로 조절)',
    burn: '칠한 곳을 어둡게 (강도로 조절)',
    clone: 'Alt+클릭으로 원본 지정 → 드래그로 복제',
    wand: '클릭한 곳과 비슷한 색을 선택 · Shift: 더하기 · Alt: 빼기 · 이동/변형은 선택 도구에서',
    polygon: '클릭으로 점 추가 · 더블클릭/Enter: 완성 · Esc: 취소',
    curve: '선을 그린 뒤 드래그로 두 번 휘어 주세요',
    text: '클릭하여 입력 · Ctrl+Enter 또는 바깥 클릭: 확정 · Esc: 취소',
    hand: '드래그하여 화면 이동 (Space+드래그도 가능)',
    zoom: '클릭: 확대 · 우클릭/Alt+클릭: 축소',
  };

  function buildOptions() {
    const bar = PP.$('#optionsbar');
    bar.textContent = '';
    const tn = PP.state.tool;
    const tool = ui.TOOLS.find((t) => t[0] === tn);
    bar.append(PP.el('span', { class: 'opt-title', text: tool ? tool[1] : '' }));
    const o = PP.opts(tn);
    for (const id of TOOL_OPTIONS[tn] || []) {
      if (id === '@sym') { bar.append(...symmetryControls()); continue; }
      if (id === '@sel') { bar.append(...selectionControls(true)); continue; }
      if (id === '@clone') { bar.append(PP.el('div', { class: 'opt' }, PP.el('button', { class: 'tgl', text: '원본 지정', title: 'Alt+클릭 또는 이 버튼을 누른 뒤 캔버스를 탭', onclick: () => { PP.tools.clone.armSource = true; PP.toast('복제할 원본 위치를 탭하세요'); } }))); continue; }
      if (id === '@ops') {
        bar.append(PP.el('div', { class: 'opt' },
          PP.el('button', { class: 'tgl', text: '확정', title: '확정 (Enter)', onclick: () => { PP.commitPending(); PP.renderOverlay(); } }),
          PP.el('button', { class: 'tgl', text: '취소', title: '취소 (Esc)', onclick: () => { PP.cancelPending(); PP.renderOverlay(); } })));
        continue;
      }
      if (id === '@selmode') { bar.append(modeControls()); continue; }
      if (id === '@selops') { bar.append(...opControls(false)); continue; }
      const d = DEF[id];
      bar.append(makeControl(id, d, o));
    }
    const hint = HINTS[tn];
    document.getElementById('st-tool').textContent = tool ? tool[1] + (hint ? ' — ' + hint : '') : '';
  }
  ui.buildOptions = buildOptions;

  function makeControl(id, d, o) {
    const set = (v) => { o[id] = v; PP.persistSettings(); PP.emit('opts', id); PP.renderOverlay(); };
    let ctrl;
    if (d.type === 'range') {
      const val = PP.el('span', { class: 'val', text: o[id] + (d.unit || '') });
      const r = PP.el('input', { type: 'range', min: d.min, max: d.max, step: 1, value: o[id] });
      r.addEventListener('input', () => { val.textContent = r.value + (d.unit || ''); set(+r.value); });
      r.dataset.opt = id;
      ctrl = [PP.el('label', { text: d.label }), r, val];
    } else if (d.type === 'check') {
      const c = PP.el('input', { type: 'checkbox' });
      c.checked = !!o[id];
      c.addEventListener('change', () => set(c.checked));
      return PP.el('div', { class: 'opt' }, PP.el('label', { class: 'chk' }, c, d.label));
    } else if (d.type === 'select') {
      const s = PP.el('select');
      for (const [v, t] of d.items()) s.append(PP.el('option', { value: v, text: t }));
      s.value = o[id];
      s.addEventListener('change', () => {
        set(s.value);
        if (d.preset && PP.BRUSH_PRESETS[s.value]) {
          Object.assign(o, { jitter: 0, velocity: 0, tilt: 0, colorJitter: 0, smoothing: 20, pressure: true }, PP.BRUSH_PRESETS[s.value]);
          buildOptions();
        }
      });
      ctrl = [PP.el('label', { text: d.label }), s];
    } else if (d.type === 'number') {
      const n = PP.el('input', { type: 'number', min: d.min, max: d.max, value: o[id] });
      n.addEventListener('input', () => { const v = PP.clamp(+n.value || d.min, d.min, d.max); set(v); });
      ctrl = [PP.el('label', { text: d.label }), n];
    } else if (d.type === 'toggle') {
      const b = PP.el('button', { class: 'tgl' + (o[id] ? ' on' : ''), text: d.text, title: d.label, style: { fontWeight: id === 'bold' ? 'bold' : 'normal', fontStyle: id === 'italic' ? 'italic' : 'normal' } });
      b.addEventListener('click', () => { o[id] = !o[id]; b.classList.toggle('on', o[id]); set(o[id]); });
      return PP.el('div', { class: 'opt' }, b);
    }
    return PP.el('div', { class: 'opt' }, ...ctrl);
  }

  function symmetryControls() {
    const sym = PP.state.symmetry;
    const s = PP.el('select');
    for (const [v, t] of [['none', '없음'], ['h', '좌우'], ['v', '상하'], ['both', '좌우 + 상하'], ['radial', '방사형']]) s.append(PP.el('option', { value: v, text: t }));
    s.value = sym.mode;
    const nWrap = PP.el('div', { class: 'opt' });
    const buildN = () => {
      nWrap.textContent = '';
      if (sym.mode !== 'radial') return;
      const val = PP.el('span', { class: 'val', text: sym.n + '분할' });
      const r = PP.el('input', { type: 'range', min: 2, max: 16, value: sym.n });
      r.addEventListener('input', () => { sym.n = +r.value; val.textContent = sym.n + '분할'; PP.renderOverlay(); });
      nWrap.append(r, val);
    };
    s.addEventListener('change', () => { sym.mode = s.value; buildN(); PP.renderOverlay(); });
    buildN();
    return [PP.el('div', { class: 'opt' }, PP.el('label', { text: '대칭' }), s), nWrap];
  }

  const MODES = [['replace', '새 선택'], ['add', '추가'], ['sub', '빼기'], ['inter', '교차']];
  function modeControls() {
    const wrap = PP.el('div', { class: 'opt' }, PP.el('label', { text: '모드' }));
    for (const [v, t] of MODES) {
      const b = PP.el('button', { class: 'tgl' + (PP.state.selMode === v ? ' on' : ''), text: t, title: v === 'add' ? 'Shift+드래그' : v === 'sub' ? 'Alt+드래그' : v === 'inter' ? 'Shift+Alt+드래그' : '' });
      b.addEventListener('click', () => {
        PP.state.selMode = v;
        wrap.querySelectorAll('.tgl').forEach((x) => x.classList.toggle('on', x === b));
      });
      wrap.append(b);
    }
    return wrap;
  }
  function opControls(withHint) {
    const btn = (text, title, fn) => PP.el('button', { class: 'tgl', text, title, onclick: fn });
    const grp = PP.el('div', { class: 'opt' },
      btn('반전', '선택 반전 (Ctrl+Shift+I)', () => PP.runCmd('edit.invertsel')),
      btn('해제', '선택 해제 (Ctrl+D)', () => PP.sel.deselect()),
      btn('↔', '선택 내용 좌우 뒤집기', () => PP.sel.flipFloat(true)),
      btn('↕', '선택 내용 상하 뒤집기', () => PP.sel.flipFloat(false)),
      btn('⟳ 90°', '선택 내용 90° 회전', () => PP.sel.rotateFloat90()),
      btn('확정', '변형 확정 (Enter)', () => { PP.sel.commitFloat(); PP.renderOverlay(); }),
      btn('취소', '변형 취소 (Ctrl+Z)', () => { PP.sel.cancelFloat(); PP.renderOverlay(); }));
    return [grp];
  }
  function selectionControls() {
    return [modeControls(), ...opControls(true)];
  }
})(window.PP);
