'use strict';
/* v1.2 기능 점검 */
module.exports = async function (t) {
  const { js, wait } = t;
  const fresh = async (w = 600, h = 400, bg = null) => {
    await js(`PP.doc.init(${w},${h},${bg ? `"${bg}"` : 'null'})`);
    await js('PP.vp.fit(1)');
    await t.frame();
  };
  const ink = (x, y, w, h) => js(`(()=>{const d=PP.doc.active().ctx.getImageData(${x},${y},${w},${h}).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>8)n++;return n})()`);
  const setBrush = (type) => js(`(()=>{const o=PP.opts('brush');o.type='${type}';Object.assign(o,{jitter:0,velocity:0,tilt:0,colorJitter:0,smoothing:0,pressure:false},PP.BRUSH_PRESETS['${type}']);o.pressure=false;})()`);

  // ===== 새 브러시 종류: 모두 획이 그려짐 =====
  await fresh();
  await js("PP.selectTool('brush'); PP.setColor('fg','#7c3aed')");
  const types = ['airbrush', 'ink', 'watercolor', 'gouache', 'chalk', 'charcoal', 'pastel', 'glow', 'pixel', 'star'];
  let row = 0;
  for (const ty of types) {
    await setBrush(ty);
    const y = 30 + row * 36;
    await t.drag([[40, y], [260, y + 8], [420, y]]);
    const n = await ink(20, y - 20, 420, 44);
    t.check(n > 80, `브러시 [${ty}] 그려짐 (${n}px)`);
    row++;
  }
  // 픽셀 브러시: 블록 단위
  await fresh();
  await setBrush('pixel');
  await js("PP.opts('brush').size=8");
  await t.drag([[103, 103], [160, 103]]);
  const pa = await t.px(98, 100), pb = await t.px(103, 100);
  t.check(pa[3] === 255 && pb[3] === 255, '픽셀 브러시: 8px 블록 단위로 채워짐');
  // 에어브러시 누적
  await fresh();
  await setBrush('airbrush');
  await js("PP.opts('brush').size=60; PP.setColor('fg','#000000')");
  await js("PP.tools.brush.down({x:200,y:200,pressure:1,button:0}); 0");
  await js("PP.tools.brush.stroke.tick(); 0");
  const a1 = (await js("(()=>{PP.preview.commit; const c=PP.preview.canvas.getContext('2d').getImageData(200,200,1,1).data;return c[3]})()"));
  await js("(()=>{for(let i=0;i<40;i++)PP.tools.brush.stroke.tick();return 0})()");
  const a2 = (await js("PP.preview.canvas.getContext('2d').getImageData(200,200,1,1).data[3]"));
  await js("PP.tools.brush.up({x:200,y:200,pressure:1}); 0");
  t.check(a2 > 150 && a2 > a1, `에어브러시: 머물수록 진해짐 (알파 ${a1}→${a2})`);
  // 글로우: 가산 합성
  await fresh(400, 200, '#202020');
  await setBrush('glow');
  await js("PP.opts('brush').size=60; PP.setColor('fg','#3366ff')");
  await t.drag([[100, 100], [300, 100]]);
  const g1 = await t.px(200, 100);
  t.check(g1[2] > 0x20 + 60, `글로우 브러시: 어두운 배경 위에 밝게 가산됨 (B=${g1[2]})`);

  // ===== 다이내믹스 =====
  await fresh();
  await setBrush('soft');
  await js("(()=>{const o=PP.opts('brush');o.size=30;o.hardness=100;o.jitter=60;o.velocity=60;o.tilt=50;o.colorJitter=80})(); PP.setColor('fg','#ff0000')");
  await t.drag([[40, 100], [500, 120]]);
  const cols = await js(`(()=>{const d=PP.doc.active().ctx.getImageData(40,80,460,60).data;const s=new Set();for(let i=0;i<d.length;i+=4)if(d[i+3]>250)s.add((d[i]>>5)+','+(d[i+1]>>5)+','+(d[i+2]>>5));return s.size})()`);
  t.check(cols >= 3, `색 변화: 한 획 안에서 여러 색조가 나옴 (${cols}종)`);
  await js("(()=>{const o=PP.opts('brush');o.jitter=0;o.velocity=0;o.tilt=0;o.colorJitter=0})()");

  // ===== 유화 / 유동화 =====
  await fresh(400, 200, '#ffffff');
  await js("PP.selectTool('oil'); (()=>{const o=PP.opts('oil');o.size=50;o.strength=80;o.hardness=80;o.smoothing=0})(); PP.setColor('fg','#dc2626')");
  await t.drag([[50, 100], [300, 100]]);
  const oc = await t.px(200, 100);
  t.check(oc[0] > 150 && oc[1] > 45, `유화: 붓의 색(빨강)이 흰 캔버스와 섞여 번짐 (${oc.slice(0, 3)})`);
  await fresh(300, 200, '#ffffff');
  await js("(()=>{const c=PP.doc.active().ctx;c.fillStyle='#000';c.fillRect(100,0,20,200);PP.doc.touch(PP.doc.active())})(); PP.selectTool('liquify'); (()=>{const o=PP.opts('liquify');o.size=80;o.strength=100;o.mode='push'})()");
  await t.drag([[60, 100], [160, 100]]);
  const lq = await js("(()=>{const d=PP.doc.active().ctx.getImageData(124,100,70,1).data;let m=255;for(let i=0;i<d.length;i+=4)m=Math.min(m,d[i]);return m})()");
  t.check(lq < 200, `유동화(밀기): 검은 띠 일부가 오른쪽(x>124)으로 밀림 (최소 R=${lq})`);
  await js('PP.history.undo()');
  t.check((await t.px(135, 100))[0] === 255, '유동화 실행 취소');

  // ===== 레이어: 투명 잠금 / 클리핑 마스크 =====
  await fresh(300, 200);
  await js("(()=>{const l=PP.doc.active();l.ctx.fillStyle='#dc2626';l.ctx.fillRect(50,50,100,100);PP.doc.touch(l)})()");
  const lid = await js('PP.doc.active().id');
  await js(`PP.layers.setProp(${lid},'alphaLock',true,'x')`);
  await js("PP.selectTool('brush'); (()=>{const o=PP.opts('brush');o.type='soft';Object.assign(o,PP.BRUSH_PRESETS.soft);o.size=80;o.hardness=100;o.smoothing=0})(); PP.setColor('fg','#2563eb')");
  await t.drag([[20, 100], [280, 100]]);
  t.check((await t.px(100, 100))[2] > 200 && (await t.px(20, 100))[3] === 0, '투명 잠금: 이미 칠한 사각형 안에만 칠해지고 밖은 투명 유지');
  await js(`PP.layers.setProp(${lid},'alphaLock',false,'x')`);
  await js('PP.layers.add()');
  await js("(()=>{const l=PP.doc.active();l.ctx.fillStyle='#16a34a';l.ctx.fillRect(0,0,300,200);PP.doc.touch(l)})()");
  await js("PP.layers.setProp(PP.doc.active().id,'clip',true,'x')");
  const fl = await js("(()=>{const c=PP.doc.flatten();const x=c.getContext('2d');const a=x.getImageData(100,100,1,1).data,b=x.getImageData(250,150,1,1).data;return [Array.from(a),Array.from(b)]})()");
  t.check(fl[0][1] > 120 && fl[1][3] === 0, `클리핑 마스크: 아래 레이어 영역 안에서만 보임 (안 ${fl[0]} / 밖 알파 ${fl[1][3]})`);

  // ===== 색 조화 =====
  await js("PP.setColor('fg','#ff0000')");
  const harm = await js("(()=>{const s=[...document.querySelectorAll('#panel-color .swatches')].find(e=>e.children[0]&&e.children[0].title==='현재 색');return s?s.children[1].style.backgroundColor:'none'})()");
  t.check(/0,\s*255,\s*255/.test(harm), `색 조화: 빨강의 보색은 시안 (${harm})`);

  // ===== 화면 반전 / 제스처 =====
  await fresh(400, 300, '#ffffff');
  await js("PP.selectTool('pencil'); PP.opts('pencil').size=6; PP.setColor('fg','#000000'); PP.runCmd('view.flip')");
  await t.drag([[50, 100], [100, 100]]);
  t.check((await js('PP.vp.flipped')) && (await t.px(75, 100))[0] < 60, '반전 상태에서도 그린 위치가 정확함(문서 좌표 유지)');
  await js("PP.runCmd('view.flip')");
  await js('PP.history.reset()');
  await t.drag([[50, 200], [120, 200]]);
  const r = await js("(()=>{const r=document.getElementById('overlay').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()");
  const tap = (ids, xs) => js(`(()=>{const ov=document.getElementById('overlay');const ev=(t,id,x,y)=>ov.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}));
    const ids=${JSON.stringify(ids)},xs=${JSON.stringify(xs)};ids.forEach((id,i)=>ev('pointerdown',id,${r[0]}+xs[i],${r[1]}));ids.forEach((id,i)=>ev('pointerup',id,${r[0]}+xs[i],${r[1]}));0})()`);
  await tap([11, 12], [-30, 30]);
  await wait(100);
  t.check((await js('PP.history.index')) === 0, '두 손가락 톡: 실행 취소');
  await tap([21, 22, 23], [-40, 0, 40]);
  await wait(100);
  t.check((await js('PP.history.index')) === 1, '세 손가락 톡: 다시 실행');

  // ===== 타임랩스 프레임 =====
  await fresh(300, 200, '#ffffff');
  await js("PP.selectTool('pencil')");
  for (let i = 0; i < 4; i++) { await t.drag([[30 + i * 20, 50], [60 + i * 20, 150]]); await wait(420); }
  const nf = await js('PP.timelapse.frames.length');
  t.check(nf >= 3, `타임랩스: 작업 단계마다 프레임이 기록됨 (${nf}장)`);
};
