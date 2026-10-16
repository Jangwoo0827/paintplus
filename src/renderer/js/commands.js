'use strict';
/* 명령 레지스트리 + 전역 단축키. 메뉴바와 키보드가 같은 명령을 공유한다. */
(function (PP) {
  PP.cmds = {};
  const byShortcut = {};

  /**
   * defCmd(id, label, shortcut, run, {enabled, checked})
   * shortcut 예: 'Ctrl+Shift+S', 'Delete'
   */
  PP.defCmd = function (id, label, shortcut, run, opt = {}) {
    PP.cmds[id] = { id, label, shortcut: shortcut || '', run, enabled: opt.enabled, checked: opt.checked };
    if (shortcut) {
      for (const s of shortcut.split(' / ')) byShortcut[normalizeCombo(s)] = id;
    }
  };
  PP.runCmd = function (id) {
    const c = PP.cmds[id];
    if (!c) return;
    if (c.enabled && !c.enabled()) return;
    try {
      const r = c.run();
      if (r && r.catch) r.catch((e) => console.error(e));
    } catch (e) {
      console.error(e);
    }
  };

  function normalizeCombo(s) {
    const parts = s.split('+').map((p) => p.trim());
    const key = parts.pop();
    const mods = [];
    if (parts.includes('Ctrl')) mods.push('Ctrl');
    if (parts.includes('Alt')) mods.push('Alt');
    if (parts.includes('Shift')) mods.push('Shift');
    return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
  }
  function comboOf(e) {
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    let k = e.key;
    if (k === '+') k = '=';
    if (k.length === 1) k = k.toUpperCase();
    // Shift 조합에서 기호가 바뀌는 키 보정
    if (e.shiftKey && e.code && /^Digit|^Key/.test(e.code)) k = e.code.replace(/^Digit|^Key/, '');
    if (e.code === 'Quote') k = "'";
    return [...mods, k].join('+');
  }

  // 도구 단축키 (수정키 없음)
  const TOOL_KEYS = {
    'Shift+O': 'oil', 'Shift+L': 'liquify', S: 'smudge', 'Shift+B': 'blurbrush', 'Shift+S': 'sharpbrush', 'Shift+D': 'dodge', 'Shift+E': 'burn', K: 'clone',
    M: 'wand', P: 'pencil', B: 'brush', E: 'eraser', G: 'fill', 'Shift+G': 'gradient', I: 'picker',
    L: 'line', R: 'rect', 'Shift+R': 'roundrect', O: 'ellipse', Y: 'triangle', N: 'polygon', W: 'arrow', C: 'curve',
    T: 'text', V: 'selrect', 'Shift+V': 'sellasso', H: 'hand', Z: 'zoom',
  };
  PP.TOOL_KEYS = TOOL_KEYS;

  // ---------- 기본 명령 ----------
  const D = PP.defCmd;
  D('file.new', '새로 만들기...', 'Ctrl+N', () => PP.files.newDoc());
  D('file.open', '열기...', 'Ctrl+O', () => PP.files.open());
  D('file.save', '저장', 'Ctrl+S', () => PP.files.save());
  D('file.saveas', '다른 이름으로 저장...', 'Ctrl+Shift+S', () => PP.files.saveAs());
  if (window.api) D('file.exit', '끝내기', 'Ctrl+Q', () => PP.requestClose());

  D('edit.undo', '실행 취소', 'Ctrl+Z', () => {
  if (PP.pendingActive()) { PP.cancelPending(); return; }
  if (PP.sel.float) { PP.sel.cancelFloat(); return; }
  PP.history.undo();
}, { enabled: () => PP.history.canUndo() || !!PP.sel.float || PP.pendingActive() });
  D('edit.redo', '다시 실행', 'Ctrl+Y / Ctrl+Shift+Z', () => PP.history.redo(), { enabled: () => PP.history.canRedo() });

  D('view.zoomin', '확대', 'Ctrl+=', () => PP.vp.zoomStep(1));
  D('view.zoomout', '축소', 'Ctrl+-', () => PP.vp.zoomStep(-1));
  D('view.fit', '화면에 맞춤', 'Ctrl+0', () => PP.vp.fit(8));
  D('view.actual', '100% 보기', 'Ctrl+1', () => PP.vp.actual());
  D('view.rulers', '눈금자', 'Ctrl+R', () => PP.setRulers(!PP.state.rulers), { checked: () => PP.state.rulers });
  D('view.grid', '격자', "Ctrl+'", () => PP.setGrid({ show: !PP.state.grid.show }), { checked: () => PP.state.grid.show });
  D('view.snap', '격자에 맞춤', "Ctrl+Shift+'", () => PP.setGrid({ snap: !PP.state.grid.snap }), { checked: () => PP.state.grid.snap });
  D('view.theme', '테마 전환 (다크/라이트)', 'Ctrl+Shift+T', () => PP.setTheme(PP.state.theme === 'dark' ? 'light' : 'dark'));
  D('view.gridsize', '격자 간격...', '', async () => {
  const n = PP.ui.num(PP.state.grid.size, 2, 512);
  const r = await PP.ui.modal({
    title: '격자 간격',
    body: [PP.ui.row('간격 (px)', n)],
    buttons: [{ label: '확인', value: true, primary: true }, { label: '취소', value: null }],
  }).promise;
  if (r) PP.setGrid({ size: PP.clamp(Math.round(+n.value) || 16, 2, 512), show: true });
});
D('view.fullscreen', '전체 화면', 'F11', () => { PP._fs = !PP._fs; window.api && window.api.fullscreen(PP._fs); }, { checked: () => !!PP._fs });

  D('color.swap', '전경/배경색 교체', 'X', () => PP.swapColors());
  D('color.reset', '기본 색으로', 'D', () => PP.resetColors());

  function sizeKey(dir) {
    const o = PP.opts();
    if (o.size != null) {
      const step = Math.max(1, Math.round(o.size * 0.1));
      o.size = PP.clamp(o.size + dir * step, 1, 300);
      PP.persistSettings();
      const r = PP.$('#optionsbar input[data-opt="size"]');
      if (r) { r.value = o.size; r.nextElementSibling.textContent = o.size + 'px'; }
      PP.renderOverlay();
    } else if (o.lineWidth != null) {
      o.lineWidth = PP.clamp(o.lineWidth + dir, 1, 100);
      PP.persistSettings();
      PP.ui.buildOptions();
    }
  }
  D('brush.bigger', '브러시 크기 키우기', ']', () => sizeKey(1));
  D('brush.smaller', '브러시 크기 줄이기', '[', () => sizeKey(-1));

  // ---------- 키보드 ----------
  function isTyping(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    if (t.tagName === 'TEXTAREA') return true;
    if (t.tagName === 'INPUT') return !['range', 'checkbox', 'button', 'radio'].includes(t.type);
    return false;
  }

  document.addEventListener('keydown', (e) => {
    if (PP.ui.isModalOpen && PP.ui.isModalOpen()) return;
    if (isTyping(e.target)) return;
    if (e.key === 'Escape') {
      if (PP.menuOpen && PP.menuOpen()) return;
      if (PP.vp.isDrawing()) { PP.vp.cancelGesture(); return; }
      const t = PP.tools[PP.state.tool];
      if (t && t.escape && t.escape()) { e.preventDefault(); return; }
      if (PP.sel.hasAny()) { PP.sel.deselect(); e.preventDefault(); }
      return;
    }
    if (e.code === 'Space' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (!e.repeat) PP.vp.setSpace(true);
      return;
    }
    const combo = comboOf(e);
    const t = PP.tools[PP.state.tool];
    if (t && t.keydown && t.keydown(e, combo)) { e.preventDefault(); return; }
    const id = byShortcut[combo];
    if (id) {
      e.preventDefault();
      PP.runCmd(id);
      return;
    }
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      const tool = TOOL_KEYS[combo];
      if (tool) { e.preventDefault(); PP.selectTool(tool); }
    }
    // 브라우저 기본 동작(새로고침 등) 차단
    if ((e.ctrlKey || e.metaKey) && ['R', 'W', 'P', 'F', 'G'].includes(e.key.toUpperCase()) && !byShortcut[combo]) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') PP.vp.setSpace(false);
  });
  window.addEventListener('blur', () => PP.vp.setSpace(false));
})(window.PP);
