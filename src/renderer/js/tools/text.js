'use strict';
/* 텍스트 도구: 화면 위 편집기(contenteditable)에서 입력 후 레이어에 래스터화 */
(function (PP) {
  let ed = null; // {x, y, el}

  function fontString(o, sizePx) {
    return `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${sizePx}px "${o.fontFamily}"`;
  }

  function styleEditor() {
    if (!ed) return;
    const o = PP.opts('text');
    const z = PP.vp.zoom;
    const s = ed.el.style;
    s.fontFamily = `"${o.fontFamily}"`;
    s.fontSize = o.fontSize * z + 'px';
    s.fontWeight = o.bold ? 'bold' : 'normal';
    s.fontStyle = o.italic ? 'italic' : 'normal';
    s.lineHeight = '1.2';
    s.color = PP.state.fg;
    s.opacity = o.opacity / 100;
    s.left = PP.vp.ox + ed.x * z + 'px';
    s.top = PP.vp.oy + ed.y * z + 'px';
  }

  PP.commitTextEditor = function (commit) {
    if (!ed) return;
    const { x, y, el } = ed;
    const text = el.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    ed = null;
    el.remove();
    if (!commit || !text.trim()) return;
    if (!PP.canPaint()) return;
    const o = PP.opts('text');
    const P = PP.preview;
    P.begin(PP.doc.active(), { opacity: o.opacity / 100 });
    const ctx = P.ctx;
    ctx.font = fontString(o, o.fontSize);
    ctx.fillStyle = PP.state.fg;
    ctx.textBaseline = 'alphabetic';
    const lh = o.fontSize * 1.2;
    const m = ctx.measureText('Mg');
    const A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
    const lines = text.split('\n');
    let maxW = 0;
    lines.forEach((ln, i) => {
      ctx.fillText(ln, x, y + (lh - (A + D)) / 2 + A + i * lh);
      maxW = Math.max(maxW, ctx.measureText(ln).width);
    });
    P.mark(PP.intRect(x - 2, y - 2, x + maxW + o.fontSize * 0.3, y + lines.length * lh + 2, 2));
    P.commit('텍스트');
    PP.pushRecent(PP.state.fg);
  };

  PP.tools.text = {
    name: 'text', label: '텍스트', cursor: 'text', snap: true, altPick: false,
    down(pt) {
      if (!PP.canPaint()) return;
      PP.sel.finish();
      PP.commitTextEditor(true);
      const el = PP.el('div', { class: 'text-editor', contenteditable: 'plaintext-only', spellcheck: 'false' });
      PP.$('#text-layer').append(el);
      ed = { x: pt.x, y: pt.y, el };
      styleEditor();
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); PP.commitTextEditor(false); PP.renderOverlay(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); PP.commitTextEditor(true); }
      });
      el.addEventListener('blur', () => { if (ed && ed.el === el) PP.commitTextEditor(true); });
      setTimeout(() => el.focus(), 0);
    },
    up() {
      // 클릭 직후 포커스가 오버레이로 되돌아가지 않도록
      if (ed) setTimeout(() => ed && ed.el.focus(), 0);
    },
    escape() { return false; },
    deactivate() { PP.commitTextEditor(true); },
    finishPending() { PP.commitTextEditor(true); },
    cancelPending() { PP.commitTextEditor(false); },
  };

  PP.on('frame', styleEditor);
  PP.on('opts', styleEditor);
  PP.on('color', styleEditor);
})(window.PP);
