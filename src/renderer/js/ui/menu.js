'use strict';
/* 상단 메뉴바 (HTML). 명령 레지스트리(PP.cmds)를 그대로 보여준다. */
(function (PP) {
  const ui = (PP.ui = PP.ui || {});
  const MENU = [
    ['파일', ['file.new', 'file.open', 'file.import', '-', 'file.save', 'file.saveas', '-', 'clip.copyAll', '-', 'file.exit']],
    ['편집', ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.pasteNew', 'edit.delete', '-', 'edit.selectall', 'edit.deselect', 'edit.invertsel', '-', 'edit.transform']],
    ['보기', ['view.zoomin', 'view.zoomout', 'view.fit', 'view.actual', '-', 'view.rulers', 'view.grid', 'view.snap', 'view.gridsize', '-', 'view.theme', 'view.fullscreen']],
    ['이미지', ['img.canvasSize', 'img.resize', 'img.crop', '-', 'img.rotateCW', 'img.rotateCCW', 'img.rotate180', 'img.flipH', 'img.flipV']],
    ['레이어', ['layer.add', 'layer.dup', 'layer.del', '-', 'layer.up', 'layer.down', '-', 'layer.mergeDown', 'layer.flatten']],
    ['필터', ['filter.blur', 'filter.motion', 'filter.sharpen', '-', 'filter.brightness', 'filter.saturation', 'filter.hsl', 'filter.levels', 'filter.posterize', '-', 'filter.pixelate', 'filter.noise', 'filter.edge', 'filter.emboss', 'filter.vignette', '-', 'filter.gray', 'filter.invert', 'filter.sepia']],
    ['도움말', ['help.shortcuts', 'help.update', 'help.about']],
  ];
  let bar, tops, openIdx = -1, drop = null;

  PP.menuOpen = () => openIdx >= 0;

  function close() {
    openIdx = -1;
    if (drop) { drop.remove(); drop = null; }
    bar.querySelectorAll('.menu-top').forEach((t) => t.classList.remove('open'));
  }

  function open(i) {
    close();
    openIdx = i;
    const top = tops.children[i];
    top.classList.add('open');
    drop = PP.el('div', { class: 'menu-drop' });
    let lastSep = true;
    for (const id of MENU[i][1]) {
      if (id === '-') {
        if (!lastSep) drop.append(PP.el('div', { class: 'menu-sep' }));
        lastSep = true;
        continue;
      }
      const c = PP.cmds[id];
      if (!c) continue;
      lastSep = false;
      const dis = c.enabled && !c.enabled();
      const chk = c.checked && c.checked();
      const item = PP.el('div', { class: 'menu-item' + (dis ? ' disabled' : '') + (chk ? ' checked' : '') },
        PP.el('span', { text: c.label }),
        c.shortcut ? PP.el('span', { class: 'menu-key', text: c.shortcut.split(' / ')[0] }) : null);
      item.addEventListener('click', () => {
        if (dis) return;
        close();
        PP.runCmd(id);
      });
      drop.append(item);
    }
    // 끝의 구분선 제거
    while (drop.lastChild && drop.lastChild.classList.contains('menu-sep')) drop.lastChild.remove();
    document.body.append(drop);
    const r = top.getBoundingClientRect();
    drop.style.left = r.left + 'px';
    drop.style.top = r.bottom + 'px';
    const dr = drop.getBoundingClientRect();
    if (dr.bottom > window.innerHeight) drop.style.top = Math.max(0, window.innerHeight - dr.height) + 'px';
  }

  ui.initMenu = function () {
    bar = PP.$('#menubar');
    tops = PP.el('div', { class: 'menu-tops' });
    bar.append(tops);
    MENU.forEach(([label], i) => {
      const t = PP.el('div', { class: 'menu-top', text: label });
      t.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (openIdx === i) close(); else open(i);
      });
      t.addEventListener('pointerenter', () => { if (openIdx >= 0 && openIdx !== i) open(i); });
      tops.append(t);
    });
    // 오른쪽: 실행 취소/다시 실행 + (모바일) 패널 토글
    const mk = (cls, text, title, fn) => {
      const b = PP.el('button', { class: 'bar-btn ' + cls, text, title, onclick: fn });
      bar.append(b);
      return b;
    };
    const undoB = mk('', '↶', '실행 취소 (Ctrl+Z)', () => PP.runCmd('edit.undo'));
    const redoB = mk('', '↷', '다시 실행 (Ctrl+Y)', () => PP.runCmd('edit.redo'));
    mk('mobile-only', '☰', '색상/레이어 패널', () => PP.$('#sidebar').classList.toggle('open'));
    const upd = () => {
      undoB.disabled = !PP.cmds['edit.undo'].enabled();
      redoB.disabled = !PP.cmds['edit.redo'].enabled();
    };
    PP.on('history', upd);
    PP.on('doc:new', upd);
    upd();
    document.addEventListener('pointerdown', (e) => {
      if (openIdx < 0) return;
      if (drop && drop.contains(e.target)) return;
      if (bar.contains(e.target)) return;
      close();
    }, true);
    window.addEventListener('blur', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && openIdx >= 0) { e.preventDefault(); e.stopPropagation(); close(); }
    }, true);
  };
})(window.PP);
