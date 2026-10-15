'use strict';
/* 모달 대화상자 도우미 + 새로 만들기/확인 대화상자 */
(function (PP) {
  const ui = (PP.ui = PP.ui || {});
  const root = () => document.getElementById('modal-root');
  let openCount = 0;
  ui.isModalOpen = () => openCount > 0;

  /**
   * ui.modal({title, body, buttons:[{label,value,primary}], nodim, width})
   * → {promise, close(value), el}.  Esc = null 로 닫힘, Enter = primary 버튼
   */
  ui.modal = function (o) {
    const back = PP.el('div', { class: 'modal-back' + (o.nodim ? ' nodim' : '') });
    const box = PP.el('div', { class: 'modal', role: 'dialog', style: o.width ? { width: o.width + 'px' } : null });
    box.append(PP.el('h3', { text: o.title || '' }));
    const body = PP.el('div', { class: 'mbody' });
    if (o.body) body.append(...[].concat(o.body));
    box.append(body);
    const foot = PP.el('div', { class: 'mfoot' });
    let primaryBtn = null;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    let closed = false;
    const close = (v) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      openCount--;
      if (o.onClose) o.onClose(v);
      resolve(v);
    };
    for (const b of o.buttons || [{ label: '확인', value: true, primary: true }]) {
      const btn = PP.el('button', { class: 'mbtn' + (b.primary ? ' primary' : ''), text: b.label, onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) });
      if (b.primary) primaryBtn = btn;
      foot.append(btn);
    }
    box.append(foot);
    back.append(box);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && primaryBtn && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
        e.preventDefault(); e.stopPropagation(); primaryBtn.click();
      }
    }
    document.addEventListener('keydown', onKey, true);
    if (!o.nodim) back.addEventListener('pointerdown', (e) => { if (e.target === back && o.dismissable) close(null); });
    root().append(back);
    openCount++;
    const first = box.querySelector('input:not([type=range]), select');
    if (first && !o.nofocus) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 0);
    return { promise, close, el: box, body };
  };

  // ---------- 폼 도우미 ----------
  ui.row = (label, ...ctrls) => PP.el('div', { class: 'frow' }, PP.el('label', { text: label }), ...ctrls);
  ui.num = (value, min, max, step = 1) => PP.el('input', { type: 'number', value, min, max, step });
  ui.select = (items, value) => {
    const s = PP.el('select');
    for (const [v, t] of items) s.append(PP.el('option', { value: v, text: t }));
    s.value = value;
    return s;
  };
  ui.check = (label, checked) => {
    const i = PP.el('input', { type: 'checkbox' });
    i.checked = !!checked;
    return { input: i, row: PP.el('div', { class: 'frow chk' }, PP.el('label', null, i, label)) };
  };
  ui.slider = (label, min, max, value, onInput, fmt = (v) => v) => {
    const r = PP.el('input', { type: 'range', min, max, step: 1, value });
    const v = PP.el('span', { class: 'rv', text: fmt(value) });
    r.addEventListener('input', () => { v.textContent = fmt(+r.value); onInput(+r.value); });
    return { input: r, row: ui.row(label, r, v) };
  };

  ui.alert = (msg, title = '그림판+') =>
    ui.modal({ title, body: PP.el('div', { text: msg }), buttons: [{ label: '확인', value: true, primary: true }], dismissable: true }).promise;

  /** 저장 확인: 'save' | 'discard' | null(취소) */
  ui.confirmSave = (name) =>
    ui.modal({
      title: '변경 사항 저장',
      body: PP.el('div', { text: `"${name}"의 변경 사항을 저장하시겠습니까?` }),
      buttons: [
        { label: '저장', value: 'save', primary: true },
        { label: '저장 안 함', value: 'discard' },
        { label: '취소', value: null },
      ],
      nofocus: true,
    }).promise;

  ui.confirm = (msg, yes = '확인', title = '확인') =>
    ui.modal({ title, body: PP.el('div', { text: msg }), buttons: [{ label: yes, value: true, primary: true }, { label: '취소', value: null }] }).promise;

  // ---------- 새로 만들기 ----------
  ui.newDocDialog = async function () {
    const last = PP.store.get('newdoc', { w: 1280, h: 720, bg: 'white' });
    const w = ui.num(last.w, 1, 16384);
    const h = ui.num(last.h, 1, 16384);
    const bg = ui.select([['white', '흰색'], ['transparent', '투명'], ['bg', '배경색'], ['fg', '전경색']], last.bg);
    const presets = PP.el('div', { class: 'preset-row' });
    for (const [t, pw, ph] of [['800×600', 800, 600], ['1280×720', 1280, 720], ['1920×1080', 1920, 1080], ['1024×1024', 1024, 1024], ['A4 (2480×3508)', 2480, 3508], ['64×64', 64, 64]]) {
      presets.append(PP.el('button', { text: t, onclick: () => { w.value = pw; h.value = ph; } }));
    }
    const r = await ui.modal({
      title: '새로 만들기',
      body: [ui.row('너비 (px)', w), ui.row('높이 (px)', h), ui.row('배경', bg), PP.el('div', { class: 'frow' }, PP.el('label', { text: '프리셋' }), presets)],
      buttons: [{ label: '만들기', value: true, primary: true }, { label: '취소', value: null }],
    }).promise;
    if (!r) return null;
    const out = { w: PP.clamp(Math.round(+w.value) || 800, 1, 16384), h: PP.clamp(Math.round(+h.value) || 600, 1, 16384), bg: bg.value };
    PP.store.set('newdoc', out);
    return out;
  };
})(window.PP);
