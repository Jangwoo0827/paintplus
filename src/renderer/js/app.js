'use strict';
/* 앱 초기화 */
(function (PP) {
  const api = window.api;

  function updateTitle() {
    const t = `${PP.history.isDirty() ? '● ' : ''}${PP.doc.name} - 그림판+`;
    document.title = t;
    if (api) api.setTitle(t);
  }

  PP.requestClose = async function () {
    if (!api) return;
    if (await PP.files.confirmDiscard()) api.closeNow();
  };

  function init() {
    // 휴대폰/태블릿(터치) 레이아웃
    const mobile = PP.isNative || matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('mobile', mobile);
    document.documentElement.classList.toggle('mobile', mobile);
    if (mobile) PP.state.rulers = false;
    PP.vp.init();
    PP.ui.initColor();
    PP.ui.initToolbox();
    PP.ui.initStatusbar();
    PP.ui.initMenu();
    PP.initPanels && PP.initPanels();

    PP.on('history', updateTitle);
    PP.on('doc:new', updateTitle);
    PP.on('doc:meta', updateTitle);

    // 파일 드래그 & 드롭
    document.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) PP.files.openDropped(f);
    });

    PP.selectTool('brush');
    PP.doc.init(1280, 720, '#ffffff');
    PP.emit('zoom', PP.vp.zoom);

    if (api) {
      api.onCloseRequest(() => PP.requestClose());
      api.onOpenFile((p) => PP.files.openPath(p));
      api.ready().then(async (p) => {
        if (p) { await PP.files.openPath(p); return; }
        if (PP.autosave) PP.autosave.offerRecovery();
      });
    }
    PP.autosave && PP.autosave.start();
    document.body.dataset.ready = '1';
  }

  window.addEventListener('DOMContentLoaded', init);
})(window.PP);
