'use strict';
/* 휴대폰 레이아웃 + 터치 제스처(두 손가락 확대/이동) 점검 */
module.exports = async function (t) {
  const { js, wait } = t;
  await t.setSize(412, 880);
  await js("document.body.classList.add('mobile'); 0");
  await js('PP.doc.init(1080, 1920, "#ffffff")');
  await js('PP.vp.resize(); PP.vp.fit(1)');
  await t.frame();
  await t.shot('phone-layout');

  // 레이아웃 검사: 도구 상자는 아래, 가로 스크롤
  const lay = await js(`(()=>{const tb=document.getElementById('toolbox').getBoundingClientRect();const st=document.getElementById('stage').getBoundingClientRect();return {tbTop:tb.top,tbH:tb.height,tbW:tb.width,stageH:st.height,vw:innerWidth,vh:innerHeight}})()`);
  t.check(lay.tbTop > lay.stageH && lay.tbW <= lay.vw + 1, `도구 상자가 화면 아래 가로 줄로 배치됨 ${JSON.stringify(lay)}`);
  t.check(lay.stageH > 300, '캔버스 영역이 충분히 큼');

  // 패널 토글
  await js("document.querySelector('.bar-btn.mobile-only').click(); 0");
  await wait(350);
  const open = await js("document.getElementById('sidebar').getBoundingClientRect().left < innerWidth - 100");
  t.check(open, '☰ 버튼으로 색상/레이어 패널이 열림');
  await t.shot('phone-panel');
  await js("document.querySelector('.bar-btn.mobile-only').click(); 0");
  await wait(300);

  // 두 손가락 핀치: 확대 + 이동
  const z0 = await js('PP.vp.zoom');
  const r = await js("(()=>{const r=document.getElementById('overlay').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()");
  const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
  await js(`(()=>{
    const ov=document.getElementById('overlay');
    const ev=(type,id,x,y)=>ov.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===1,clientX:x,clientY:y,bubbles:true,cancelable:true,pressure:0.5,buttons:type==='pointerup'?0:1}));
    window.__ev=ev; ev('pointerdown',1,${cx - 40},${cy}); ev('pointerdown',2,${cx + 40},${cy});
    for(let i=1;i<=10;i++){ ev('pointermove',1,${cx - 40}-i*8,${cy}); ev('pointermove',2,${cx + 40}+i*8,${cy}); }
    ev('pointerup',1,${cx - 120},${cy}); ev('pointerup',2,${cx + 120},${cy}); 0})()`);
  await wait(150);
  const z1 = await js('PP.vp.zoom');
  t.check(z1 > z0 * 1.8, `두 손가락을 벌리면 확대됨 (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
  t.check(!(await js('PP.history.stack.length')), '핀치는 그림을 그리지 않음');

  // 두 손가락 이동 (평행 이동)
  const o0 = await js('[PP.vp.ox,PP.vp.oy]');
  await js(`(()=>{const ev=window.__ev; ev('pointerdown',3,${cx - 30},${cy}); ev('pointerdown',4,${cx + 30},${cy});
    for(let i=1;i<=10;i++){ ev('pointermove',3,${cx - 30}+i*10,${cy}+i*5); ev('pointermove',4,${cx + 30}+i*10,${cy}+i*5); }
    ev('pointerup',3,0,0); ev('pointerup',4,0,0); 0})()`);
  await wait(150);
  const o1 = await js('[PP.vp.ox,PP.vp.oy]');
  t.check(o1[0] > o0[0] + 50 && o1[1] > o0[1] + 25, '두 손가락 평행 이동으로 화면 이동');
  t.check((await js('PP.vp.zoom')) > z0 * 1.7, '평행 이동 중 배율 유지');

  // 한 손가락으로 그리기 + 두 번째 손가락이 닿으면 그리던 획 취소
  await js("PP.selectTool('pencil'); PP.opts('pencil').size=6; PP.setColor('fg','#e11d48'); PP.vp.fit(1); 0");
  const r2 = await js("(()=>{const r=document.getElementById('overlay').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()");
  const mx = r2[0] + r2[2] / 2, my = r2[1] + r2[3] / 2;
  await js(`(()=>{const ev=window.__ev; ev('pointerdown',5,${mx - 50},${my}); for(let i=1;i<=10;i++) ev('pointermove',5,${mx - 50}+i*10,${my}); ev('pointerup',5,${mx + 50},${my}); 0})()`);
  await wait(100);
  t.check((await js('PP.history.stack.length')) === 1, '손가락 한 개로 선을 그리면 1단계 기록');
  await js(`(()=>{const ev=window.__ev; ev('pointerdown',6,${mx - 50},${my + 40}); for(let i=1;i<=5;i++) ev('pointermove',6,${mx - 50}+i*10,${my + 40}); ev('pointerdown',7,${mx + 80},${my + 40}); ev('pointermove',7,${mx + 90},${my + 40}); ev('pointerup',6,0,0); ev('pointerup',7,0,0); 0})()`);
  await wait(100);
  t.check((await js('PP.history.stack.length')) === 1, '그리는 중 두 번째 손가락이 닿으면 그 획은 취소됨(제스처로 전환)');
  await t.shot('phone-drawn');
  await t.setSize(1500, 940);
};
