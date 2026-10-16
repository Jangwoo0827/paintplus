'use strict';
/* 오른쪽 패널: 레이어 패널 + 히스토리 패널 */
(function (PP) {
  const I = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const ICON = {
    eye: I('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: I('<path d="M3 3l18 18"/><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.3 3.8M6.5 6.8C3.7 8.6 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1"/>'),
    lock: I('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: I('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
    add: I('<path d="M12 5v14M5 12h14"/>'),
    dup: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    del: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    merge: I('<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>'),
  };
  PP.ICON = ICON;

  let list, opSlider, opVal, blendSel, histBody;
  let dragFrom = -1;
  const thumbs = new Map();

  function drawThumb(layer) {
    let c = thumbs.get(layer.id);
    if (!c) return;
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    const s = Math.min(c.width / layer.canvas.width, c.height / layer.canvas.height);
    const w = layer.canvas.width * s, h = layer.canvas.height * s;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'medium';
    x.drawImage(layer.canvas, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }

  function rebuildLayers() {
    const d = PP.doc;
    list.textContent = '';
    thumbs.clear();
    const active = d.active();
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const l = d.layers[i];
      const thumb = PP.el('canvas', { class: 'thumb', width: 76, height: 76 });
      thumbs.set(l.id, thumb);
      const eye = PP.el('button', { class: 'ibtn' + (l.visible ? ' on' : ''), html: l.visible ? ICON.eye : ICON.eyeOff, title: l.visible ? '숨기기' : '보이기' });
      const lock = PP.el('button', { class: 'ibtn' + (l.locked ? ' on' : ''), html: l.locked ? ICON.lock : ICON.unlock, title: l.locked ? '잠금 해제' : '잠그기' });
      const alock = PP.el('button', { class: 'ibtn' + (l.alphaLock ? ' on' : ''), text: '▨', title: '투명 픽셀 잠금 (이미 칠한 곳에만 그리기)' });
      const clipB = PP.el('button', { class: 'ibtn' + (l.clip ? ' on' : ''), text: '⤵', title: '클리핑 마스크 (아래 레이어 영역 안에서만 보이기)' });
      alock.addEventListener('click', (e) => { e.stopPropagation(); PP.layers.setProp(l.id, 'alphaLock', !l.alphaLock, '투명도 잠금'); });
      clipB.addEventListener('click', (e) => { e.stopPropagation(); PP.layers.setProp(l.id, 'clip', !l.clip, '클리핑 마스크'); });
      const name = PP.el('span', { class: 'lname', text: l.name, title: '더블클릭하여 이름 변경' });
      const row = PP.el('div', { class: 'layer-row' + (l.id === d.activeId ? ' active' : '') + (l.visible ? '' : ' hidden'), draggable: 'true', 'data-id': l.id }, eye, thumb, name, clipB, alock, lock);
      eye.addEventListener('click', (e) => { e.stopPropagation(); PP.layers.setProp(l.id, 'visible', !l.visible, l.visible ? '레이어 숨기기' : '레이어 보이기'); });
      lock.addEventListener('click', (e) => { e.stopPropagation(); PP.layers.setProp(l.id, 'locked', !l.locked, l.locked ? '레이어 잠금 해제' : '레이어 잠금'); });
      row.addEventListener('click', () => PP.layers.setActive(l.id));
      name.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(l, name); });
      row.addEventListener('dragstart', (e) => { dragFrom = PP.doc.indexOf(l.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'layer'); });
      row.addEventListener('dragend', () => { dragFrom = -1; clearDropMarks(); });
      row.addEventListener('dragover', (e) => {
        if (dragFrom < 0) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearDropMarks();
        const r = row.getBoundingClientRect();
        row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      });
      row.addEventListener('drop', (e) => {
        if (dragFrom < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const r = row.getBoundingClientRect();
        const above = e.clientY < r.top + r.height / 2; // 화면상 위 = 스택에서 더 높음
        const t = PP.doc.indexOf(l.id);
        let to = above ? t + 1 : t;
        if (dragFrom < to) to -= 1;
        const from = dragFrom;
        dragFrom = -1;
        clearDropMarks();
        PP.layers.move(from, to);
      });
      list.append(row);
      drawThumb(l);
    }
    if (active) {
      opSlider.value = Math.round(active.opacity * 100);
      opVal.textContent = Math.round(active.opacity * 100) + '%';
      blendSel.value = active.blend;
    }
  }

  function clearDropMarks() {
    list.querySelectorAll('.drop-before,.drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
  }

  function startRename(layer, span) {
    const input = PP.el('input', { class: 'lname-input', type: 'text', value: layer.name });
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok) PP.layers.rename(layer.id, input.value);
      else rebuildLayers();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
    input.addEventListener('dragstart', (e) => e.stopPropagation());
  }

  function buildLayerPanel() {
    const body = PP.$('#panel-layers .body');
    opSlider = PP.el('input', { type: 'range', min: 0, max: 100, step: 1, value: 100 });
    opVal = PP.el('span', { class: 'pv', text: '100%' });
    blendSel = PP.el('select');
    for (const [v, t] of PP.BLENDS) blendSel.append(PP.el('option', { value: v, text: t }));
    body.append(PP.el('div', { class: 'layer-props' },
      PP.el('label', { text: '불투명도' }), opSlider, opVal,
      PP.el('label', { text: '블렌드' }), blendSel));
    list = PP.el('div', { class: 'layer-list' });
    body.append(list);
    const btn = (icon, title, fn) => PP.el('button', { html: ICON[icon], title, onclick: fn });
    body.append(PP.el('div', { class: 'layer-btns' },
      btn('add', '새 레이어 (Ctrl+Shift+N)', () => PP.layers.add()),
      btn('dup', '레이어 복제 (Ctrl+J)', () => PP.layers.duplicate()),
      btn('merge', '아래 레이어와 병합 (Ctrl+E)', () => PP.layers.mergeDown()),
      btn('del', '레이어 삭제', () => PP.layers.remove())));

    let before = null;
    opSlider.addEventListener('pointerdown', () => { const l = PP.doc.active(); before = l ? l.opacity : null; });
    opSlider.addEventListener('input', () => {
      const l = PP.doc.active();
      if (!l) return;
      if (before == null) before = l.opacity;
      l.opacity = +opSlider.value / 100;
      opVal.textContent = opSlider.value + '%';
      PP.render();
    });
    opSlider.addEventListener('change', () => {
      const l = PP.doc.active();
      if (l && before != null) PP.layers.commitProp(l.id, 'opacity', before, l.opacity, '레이어 불투명도');
      before = null;
    });
    blendSel.addEventListener('change', () => {
      const l = PP.doc.active();
      if (l) PP.layers.setProp(l.id, 'blend', blendSel.value, '블렌드 모드');
    });

    PP.on('doc:structure', rebuildLayers);
    const refreshThumbs = PP.debounce((id) => {
      if (id) { const l = PP.doc.byId(id); if (l) drawThumb(l); } else PP.doc.layers.forEach(drawThumb);
    }, 120);
    PP.on('doc:pixels', refreshThumbs);
    rebuildLayers();
  }

  function rebuildHistory() {
    const H = PP.history;
    histBody.textContent = '';
    const mk = (i, label) => {
      const row = PP.el('div', { class: 'hist-row' + (i === H.index ? ' current' : '') + (i > H.index ? ' future' : '') },
        PP.el('span', { class: 'hn', text: i }), PP.el('span', { text: label }));
      row.addEventListener('click', () => H.jump(i));
      histBody.append(row);
      return row;
    };
    mk(0, '시작');
    let cur = null;
    H.stack.forEach((c, i) => { const r = mk(i + 1, c.name); if (i + 1 === H.index) cur = r; });
    if (H.index === 0) cur = histBody.firstChild;
    if (cur) {
      const top = cur.offsetTop - histBody.offsetTop;
      if (top < histBody.scrollTop) histBody.scrollTop = top;
      else if (top + cur.offsetHeight > histBody.scrollTop + histBody.clientHeight) histBody.scrollTop = top + cur.offsetHeight - histBody.clientHeight;
    }
  }

  function collapsiblePanels() {
    const saved = PP.store.get('collapsed', {});
    PP.$$('#sidebar .panel').forEach((p) => {
      if (saved[p.id]) p.classList.add('collapsed');
      p.querySelector('header').addEventListener('click', () => {
        p.classList.toggle('collapsed');
        saved[p.id] = p.classList.contains('collapsed');
        PP.store.set('collapsed', saved);
      });
    });
  }

  PP.initPanels = function () {
    collapsiblePanels();
    buildLayerPanel();
    histBody = PP.$('#panel-history .body');
    PP.on('history', PP.debounce(rebuildHistory, 30));
    PP.on('doc:new', rebuildHistory);
    rebuildHistory();
  };
})(window.PP);
