'use strict';
/* (web 전용) 펜 필압 + 두 손가락 터치를 CDP 입력으로 주입 */
module.exports = async function (t) {
  const { js, wait, page, ctx } = t;
  const cdp = await ctx.newCDPSession(page);
  await js('PP.doc.init(1000,700,null)');
  await js('PP.vp.fit(1)');
  await js("PP.selectTool('brush'); (()=>{const o=PP.opts('brush');o.type='soft';Object.assign(o,PP.BRUSH_PRESETS.soft);o.size=40;o.hardness=100;o.smoothing=0;o.pressure=true})(); PP.setColor('fg','#7c3aed')");
  await t.frame();
  const [x0, y0] = await t.docToClient(100, 300);
  const N = 40;
  await js("window.__pt=[];document.getElementById('overlay').addEventListener('pointermove',e=>__pt.push([e.pointerType,+e.pressure.toFixed(2)]),true)");
  const send = (type, x, y, force) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force });
  await send('mousePressed', x0, y0, 0.1);
  for (let i = 1; i <= N; i++) await send('mouseMoved', x0 + i * 10, y0, 0.1 + (0.9 * i) / N);
  await send('mouseReleased', x0 + N * 10, y0, 0);
  await wait(150);
  const pt = await js('window.__pt');
  t.check(pt.length > 20 && pt.every((p) => p[0] === 'pen'), `펜 입력으로 인식됨 (pointerType=${pt[0] && pt[0][0]}, 이벤트 ${pt.length}개)`);
  t.check(pt[1][1] < 0.3 && pt[pt.length - 1][1] > 0.9, `필압이 0.1 → 1.0 으로 전달됨 (${pt[1][1]} → ${pt[pt.length - 1][1]})`);
  const col = (x) => js(`(()=>{const d=PP.doc.active().ctx.getImageData(${x},0,1,700).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>128)n++;return n})()`);
  const w1 = await col(130), w2 = await col(480);
  t.check(w2 > w1 * 2 && w1 >= 1, `압력이 커질수록 선이 굵어짐 (${w1}px → ${w2}px)`);

  // 마우스(압력 없음)는 균일한 굵기
  await js('PP.doc.init(1000,700,null)'); await t.frame();
  await t.drag([[100, 300], [500, 300]]);
  const m1 = await col(130), m2 = await col(480);
  t.check(Math.abs(m1 - m2) <= 2 && m1 > 30, `마우스는 필압과 무관하게 일정한 굵기 (${m1}px / ${m2}px)`);

  // 두 손가락 핀치(실제 터치 이벤트)
  const z0 = await js('PP.vp.zoom');
  const r = await js("(()=>{const r=document.getElementById('overlay').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()");
  const tp = (a, b) => [{ x: r[0] - a, y: r[1], id: 1 }, { x: r[0] + a, y: r[1], id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(40) });
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(40 + i * 12) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(150);
  const z1 = await js('PP.vp.zoom');
  t.check(z1 > z0 * 2, `두 손가락 벌리기로 확대 (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
  t.check((await js('PP.history.index')) === 1, '핀치 제스처는 그림을 남기지 않음 (히스토리 1단계 유지)');
  // 한 손가락 그리기
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r[0] - 60, y: r[1] + 80, id: 5 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r[0] - 60 + i * 12, y: r[1] + 80, id: 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(150);
  t.check((await js('PP.history.index')) === 2, '한 손가락 드래그로 그리기');
};
