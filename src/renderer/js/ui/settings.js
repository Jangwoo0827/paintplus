'use strict';
/* 설정 창: 버전 · 업데이트 · 화면 설정 · 패치 노트 */
(function (PP) {
  async function currentVersion() {
    try {
      if (window.api && window.api.version) return await window.api.version();
      const cap = window.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.getInfo) return (await cap.Plugins.App.getInfo()).version;
    } catch (_) { /* 아래 기본값 */ }
    return PP.APP_VERSION;
  }
  PP.currentVersion = currentVersion;

  PP.defCmd('app.settings', '설정...', 'Ctrl+,', async () => {
    const ui = PP.ui;
    const ver = await currentVersion();
    const platform = window.api ? 'Windows' : PP.isNative ? '안드로이드' : '웹 브라우저';

    // ----- 정보 / 업데이트 -----
    const info = PP.el('div', { class: 'set-box' },
      PP.el('div', { class: 'set-ver', text: '그림판+ ' + ver }),
      PP.el('div', { class: 'set-dim', text: platform }));
    const upd = PP.cmds['help.update'];
    if (upd) info.append(PP.el('button', { class: 'mbtn', text: '업데이트 확인', onclick: () => PP.runCmd('help.update') }));

    // ----- 화면 설정 -----
    const theme = ui.select([['dark', '다크'], ['light', '라이트']], PP.state.theme);
    theme.addEventListener('change', () => PP.setTheme(theme.value));
    const rulers = ui.check('눈금자 표시', PP.state.rulers);
    rulers.input.addEventListener('change', () => PP.setRulers(rulers.input.checked));
    const grid = ui.check('격자 표시', PP.state.grid.show);
    grid.input.addEventListener('change', () => PP.setGrid({ show: grid.input.checked }));
    const snap = ui.check('격자에 맞춤', PP.state.grid.snap);
    snap.input.addEventListener('change', () => PP.setGrid({ snap: snap.input.checked }));
    const gsize = ui.num(PP.state.grid.size, 2, 512);
    gsize.addEventListener('change', () => PP.setGrid({ size: PP.clamp(Math.round(+gsize.value) || 16, 2, 512) }));

    // ----- 패치 노트 -----
    const notes = PP.el('div', { class: 'set-notes' });
    for (const c of PP.CHANGELOG) {
      notes.append(PP.el('div', { class: 'set-nh' }, PP.el('b', { text: 'v' + c.version }), PP.el('span', { class: 'set-dim', text: c.date })));
      notes.append(PP.el('ul', null, ...c.items.map((t) => PP.el('li', { text: t }))));
    }

    ui.modal({
      title: '설정',
      width: 520,
      body: [
        PP.el('div', { class: 'set-h', text: '정보' }), info,
        PP.el('div', { class: 'set-h', text: '화면' }),
        ui.row('테마', theme), rulers.row, grid.row, snap.row, ui.row('격자 간격 (px)', gsize),
        PP.el('div', { class: 'set-h', text: '패치 노트' }), notes,
      ],
      buttons: [{ label: '닫기', value: true, primary: true }],
      dismissable: true,
      nofocus: true,
    });
  });
})(window.PP);
