'use strict';
/* 창 크기를 줄였다 늘려도 캔버스 영역이 사이드바/상태바와 겹치지 않는지 (눈금자 최소 크기 버그 회귀 방지) */
module.exports = async function (t) {
  const { js, wait } = t;
  const rects = () => js(`(()=>{const r=(id)=>{const b=document.getElementById(id).getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}};
    const v=document.getElementById('view');return {stage:r('stage'),side:r('sidebar'),status:r('statusbar'),tool:r('toolbox'),viewCss:[parseFloat(v.style.width),parseFloat(v.style.height)],vw:innerWidth,vh:innerHeight}})()`);
  for (const [w, h] of [[1500, 940], [900, 600], [1200, 700], [1000, 640], [1500, 940]]) {
    await t.setSize(w, h);
    await wait(250);
    await t.frame();
    const r = await rects();
    const fits = r.stage.r <= r.side.l + 1 && r.stage.b <= r.status.t + 1 && r.stage.l >= r.tool.r - 1;
    const sized = Math.abs(r.viewCss[0] - r.stage.w) < 2 && Math.abs(r.viewCss[1] - r.stage.h) < 2;
    t.check(fits, `${w}×${h}: 캔버스 영역이 사이드바/상태바/도구상자와 겹치지 않음 (stage ${Math.round(r.stage.l)}-${Math.round(r.stage.r)} × ${Math.round(r.stage.t)}-${Math.round(r.stage.b)}, 사이드바 ${Math.round(r.side.l)}, 상태바 ${Math.round(r.status.t)})`);
    t.check(sized, `${w}×${h}: 그리기 캔버스 크기가 영역과 일치`);
  }
};
