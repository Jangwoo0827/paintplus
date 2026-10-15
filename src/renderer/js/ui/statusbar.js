'use strict';
/* 하단 상태바: 좌표 / 선택 크기 / 캔버스 크기 / 확대율 */
(function (PP) {
  const ui = (PP.ui = PP.ui || {});
  // 슬라이더(0~100) ↔ 확대율(로그 스케일 2% ~ 6400%)
  const LMIN = Math.log(0.02), LMAX = Math.log(64);
  const z2s = (z) => ((Math.log(z) - LMIN) / (LMAX - LMIN)) * 100;
  const s2z = (s) => Math.exp(LMIN + (s / 100) * (LMAX - LMIN));

  ui.initStatusbar = function () {
    const pos = PP.$('#st-pos'), size = PP.$('#st-size'), zoom = PP.$('#st-zoom'), zval = PP.$('#st-zoomval');
    const snap = PP.$('#st-snap'), grid = PP.$('#st-grid');
    PP.on('cursor', (pt) => {
      pos.textContent = pt ? `${Math.floor(pt.x)}, ${Math.floor(pt.y)} px` : '–';
    });
    const updSize = () => { size.textContent = `${PP.doc.width} × ${PP.doc.height} px`; };
    PP.on('doc:structure', updSize);
    PP.on('doc:new', updSize);
    PP.on('zoom', (z) => {
      zoom.value = z2s(z);
      zval.textContent = Math.round(z * 100) + '%';
    });
    zoom.addEventListener('input', () => PP.vp.setZoom(s2z(+zoom.value)));
    PP.$('#st-fit').addEventListener('click', () => PP.vp.fit(8));
    PP.$('#st-100').addEventListener('click', () => PP.vp.actual());
    snap.addEventListener('click', () => PP.setGrid({ snap: !PP.state.grid.snap }));
    grid.addEventListener('click', () => PP.setGrid({ show: !PP.state.grid.show }));
    const upd = () => {
      snap.classList.toggle('on', PP.state.grid.snap);
      grid.classList.toggle('on', PP.state.grid.show);
    };
    PP.on('view-settings', upd);
    upd();
    zval.addEventListener('dblclick', () => PP.vp.actual());
  };
})(window.PP);
