'use strict';
module.exports = async function (t) {
  const { js, wait } = t;
  const white = [255, 255, 255];
  await js('PP.doc.init(1000, 700, null)');
  await js('PP.vp.fit(1)');
  await t.frame();

  // 활성 레이어에서 사각형 영역의 불투명(알파>8) 픽셀 수
  const inkCount = (x, y, w, h) => js(`(()=>{const d=PP.doc.active().ctx.getImageData(${x},${y},${w},${h}).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>8)n++;return n})()`);
  const layerPx = (x, y) => t.px(x, y, 'layer');

  // ---------- 브러시 종류 ----------
  await t.key('B');
  await js("PP.setColor('fg','#7c3aed')");
  const types = ['soft', 'marker', 'spray', 'bristle', 'crayon'];
  let row = 0;
  for (const type of types) {
    const y = 60 + row * 55;
    await js(`(()=>{const o=PP.opts('brush');o.type='${type}';Object.assign(o,PP.BRUSH_PRESETS['${type}']);o.smoothing=0;})()`);
    await t.drag([[60, y], [250, y + 10], [420, y]]);
    const n = await inkCount(40, y - 40, 400, 80);
    t.check(n > 200, `브러시 종류 [${type}] 로 그려짐 (잉크 픽셀 ${n})`);
    row++;
  }
  t.check((await js('PP.history.stack.length')) === 5, '브러시 종류별 5획 기록');
  await t.shot('brushes');

  // 스프레이: 입자가 흩어져 있어야 함 (경계가 부드럽고 듬성듬성)
  const sprayFull = await js(`(()=>{const d=PP.doc.active().ctx.getImageData(60,60+2*55-30,360,60).data;let part=0,full=0;for(let i=3;i<d.length;i+=4){if(d[i]>8&&d[i]<250)part++;if(d[i]>=250)full++}return [part,full]})()`);
  t.check(sprayFull[0] > 0, '스프레이는 반투명 입자를 포함');

  // ---------- 필압 (펜) ----------
  await js('PP.doc.init(1000,700,null)');
  await js(`(()=>{const o=PP.opts('brush');o.type='soft';Object.assign(o,PP.BRUSH_PRESETS.soft);o.size=40;o.hardness=100;o.smoothing=0;o.pressure=true;})()`);
  await js(`(()=>{const T=PP.tools.brush;T.down({x:100,y:300,pressure:0.1,pen:true,button:0});
    for(let i=1;i<=40;i++){T.move({x:100+i*10,y:300,pressure:0.1+0.9*i/40,pen:true});}
    T.up({x:500,y:300,pressure:1,pen:true});})()`);
  const col = (x) => js(`(()=>{const d=PP.doc.active().ctx.getImageData(${x},0,1,700).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>128)n++;return n})()`);
  const wStart = await col(130), wEnd = await col(480);
  t.check(wEnd > wStart * 2 && wStart >= 1, `필압: 압력이 커질수록 선이 굵어짐 (${wStart}px → ${wEnd}px)`);
  await js("PP.opts('brush').pressure=false");

  // ---------- 대칭 ----------
  await js('PP.doc.init(1000,700,"#ffffff")');
  await js("PP.selectTool('pencil'); PP.opts('pencil').size=8; PP.setColor('fg','#000000')");
  await js("PP.state.symmetry.mode='h'");
  await t.drag([[200, 300], [260, 360]]);
  t.check(t.near(await t.px(230, 330), [0, 0, 0], 40), '좌우 대칭: 원본 선');
  t.check(t.near(await t.px(770, 330), [0, 0, 0], 40), '좌우 대칭: 거울상 선 (x=1000-230)');
  await js("PP.state.symmetry.mode='both'");
  await t.drag([[200, 100], [260, 160]]);
  t.check(t.near(await t.px(770, 570), [0, 0, 0], 40), '좌우+상하 대칭: 대각 반대편');
  await js("PP.state.symmetry.mode='radial'; PP.state.symmetry.n=4");
  await t.drag([[600, 350], [700, 350]]);
  t.check(t.near(await t.px(650, 350), [0, 0, 0], 40), '방사형: 원본');
  t.check(t.near(await t.px(500, 450), [0, 0, 0], 40) || t.near(await t.px(500, 250), [0, 0, 0], 40), '방사형(4분할): 90° 회전본');
  await t.shot('symmetry');
  await js("PP.state.symmetry.mode='none'");

  // ---------- 손떨림 보정 ----------
  await js('PP.doc.init(1000,700,"#ffffff")');
  await js("PP.opts('pencil').smoothing=85");
  await t.drag([[100, 100], [100, 100], [500, 100]]);
  t.check(t.near(await t.px(499, 100), [0, 0, 0], 90) || t.near(await t.px(498, 100), [0, 0, 0], 90), '스무딩을 높여도 선 끝이 포인터까지 도달');
  await js("PP.opts('pencil').smoothing=0");

  // ---------- 도형 ----------
  await js('PP.doc.init(1000,700,"#ffffff")');
  await js("PP.setColor('fg','#dc2626'); PP.setColor('bg','#fde047')");
  const setShape = (name, mode, lw = 6) => js(`(()=>{const o=PP.opts('${name}');o.shapeMode='${mode}';o.lineWidth=${lw};})()`);

  await js("PP.selectTool('line')");
  await t.drag([[50, 50], [250, 150]]);
  await t.key('Return');
  t.check(t.near(await t.px(150, 100), [220, 38, 38], 40), '직선');

  await js("PP.selectTool('rect')"); await setShape('rect', 'stroke');
  await t.drag([[300, 50], [450, 150]]);
  await t.key('Return');
  t.check(t.near(await t.px(300, 100), [220, 38, 38], 40) && t.near(await t.px(375, 100), white), '사각형(외곽선): 가장자리만 칠해짐');
  await setShape('rect', 'both');
  await t.drag([[500, 50], [650, 150]]);
  await t.key('Return');
  t.check(t.near(await t.px(575, 100), [253, 224, 71], 10) && t.near(await t.px(500, 100), [220, 38, 38], 40), '사각형(외곽선+채우기): 안은 배경색');

  await js("PP.selectTool('roundrect')"); await setShape('roundrect', 'fill'); await js("PP.opts('roundrect').radius=40");
  await t.drag([[700, 50], [850, 150]]);
  await t.key('Return');
  t.check(t.near(await t.px(775, 100), [220, 38, 38], 10) && t.near(await t.px(701, 51), white, 10), '둥근 사각형: 모서리는 비어 있음');

  await js("PP.selectTool('ellipse')"); await setShape('ellipse', 'fill');
  await t.drag([[50, 200], [250, 300]]);
  await t.key('Return');
  t.check(t.near(await t.px(150, 250), [220, 38, 38], 10) && t.near(await t.px(55, 205), white, 10), '타원: 중앙은 채워지고 모서리는 비어 있음');
  await t.drag([[300, 200], [450, 350]], { modifiers: ['shift'] });
  await t.key('Return');
  t.check(t.near(await t.px(375, 275), [220, 38, 38], 10), 'Shift 로 정원');

  await js("PP.selectTool('triangle')"); await setShape('triangle', 'fill');
  await t.drag([[500, 200], [650, 330]]);
  await t.key('Return');
  t.check(t.near(await t.px(575, 300), [220, 38, 38], 10) && t.near(await t.px(505, 205), white, 10), '삼각형');

  await js("PP.selectTool('arrow')"); await setShape('arrow', 'stroke', 8);
  await t.drag([[700, 300], [900, 220]]);
  await t.key('Return');
  t.check(t.near(await t.px(800, 260), [220, 38, 38], 40), '화살표 몸통');

  // 다각형: 클릭 4번 + 더블클릭으로 완성
  await js("PP.selectTool('polygon')"); await setShape('polygon', 'fill');
  for (const p of [[100, 450], [300, 430], [350, 600], [150, 620]]) await t.click(p[0], p[1]);
  const ph = await js('PP.history.stack.length');
  await t.dblclick(150, 620);
  await wait(200); await t.frame();
  await t.key('Return');
  t.check((await js('PP.history.stack.length')) === ph + 1, '다각형: 더블클릭으로 확정되어 1단계 기록');
  t.check(t.near(await t.px(220, 530), [220, 38, 38], 10), '다각형 내부가 채워짐');

  // 곡선: 선 → 휘기 → 휘기
  await js("PP.selectTool('curve')"); await setShape('curve', 'stroke', 6);
  await t.drag([[450, 600], [800, 600]]);
  await t.drag([[625, 450], [625, 450]]);
  await t.drag([[625, 450], [625, 450]]);
  await t.key('Return');
  const curveHit = await js(`(()=>{const d=PP.doc.active().ctx.getImageData(560,440,130,170).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>128)n++;return n})()`);
  t.check(curveHit > 40, `곡선: 직선이 위로 휘어 그려짐 (${curveHit}px)`);
  await t.shot('shapes');

  // ---------- 페인트통 ----------
  await js('PP.doc.init(800,600,"#ffffff")');
  await js("PP.setColor('fg','#000000'); PP.selectTool('rect')");
  await setShape('rect', 'stroke', 6);
  await t.drag([[100, 100], [400, 300]]);
  await t.key('Return');
  await js("PP.setColor('fg','#16a34a'); PP.selectTool('fill'); PP.opts('fill').tolerance=32; PP.opts('fill').expand=1;");
  await t.click(250, 200);
  t.check(t.near(await t.px(250, 200), [22, 163, 74], 6), '페인트통: 닫힌 사각형 안쪽이 채워짐');
  t.check(t.near(await t.px(50, 50), white), '페인트통: 바깥은 그대로');
  t.check(t.near(await t.px(100, 200), [0, 0, 0], 60) || t.near(await t.px(101, 200), [0, 0, 0], 60), '페인트통: 외곽선은 유지');
  // 허용 오차: 회색 그라데이션 영역
  await js('PP.doc.init(400,100,"#ffffff")');
  await js(`(()=>{const c=PP.doc.active().ctx;const g=c.createLinearGradient(0,0,400,0);g.addColorStop(0,'#000');g.addColorStop(1,'#fff');c.fillStyle=g;c.fillRect(0,0,400,100)})()`);
  await js("PP.setColor('fg','#ff0000'); PP.opts('fill').tolerance=0; PP.opts('fill').expand=0;");
  await t.click(100, 50);
  await js('PP.history.undo()');
  await js("PP.opts('fill').tolerance=120");
  await t.click(100, 50);
  const redCount = (await js(`(()=>{const d=PP.doc.active().ctx.getImageData(0,50,400,1).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<40)n++;return n})()`));
  t.check(redCount > 60, `허용 오차를 높이면 비슷한 색이 함께 채워짐 (${redCount}px)`);

  // ---------- 그라디언트 ----------
  await js('PP.doc.init(600,400,"#ffffff")');
  await js("PP.setColor('fg','#000000'); PP.setColor('bg','#ffffff'); PP.selectTool('gradient'); PP.opts('gradient').gradType='linear'; PP.opts('gradient').gradColors='fg-bg'");
  await t.drag([[100, 200], [500, 200]]);
  const g0 = await t.px(101, 200), g1 = await t.px(300, 200), g2 = await t.px(499, 200);
  t.check(g0[0] < 30 && g1[0] > 100 && g1[0] < 160 && g2[0] > 225, `선형 그라디언트 흑→백 (${g0[0]}, ${g1[0]}, ${g2[0]})`);
  await js("PP.opts('gradient').gradType='radial'");
  await t.drag([[300, 200], [450, 200]]);
  const r0 = await t.px(300, 200), r1 = await t.px(440, 200);
  t.check(r0[0] < 30 && r1[0] > 200, `방사형 그라디언트 (${r0[0]} → ${r1[0]})`);
  for (const gt of ['reflected', 'angular']) {
    await js(`PP.opts('gradient').gradType='${gt}'`);
    const h = await js('PP.history.stack.length');
    await t.drag([[300, 200], [450, 260]]);
    t.check((await js('PP.history.stack.length')) === h + 1, `${gt} 그라디언트 적용`);
  }
  await js("PP.opts('gradient').gradType='linear'; PP.opts('gradient').gradColors='fg-clear'");
  await js('PP.doc.init(400,100,"#ffffff")');
  await js("PP.setColor('fg','#000000')");
  await t.drag([[50, 50], [350, 50]]);
  const tr = await t.px(300, 50);
  t.check(tr[0] > 150, '전경→투명 그라디언트는 흰 배경 위에서 점점 연해짐');
  await t.shot('gradient');

  // ---------- 텍스트 ----------
  await js('PP.doc.init(800,400,null)');
  await js("PP.setColor('fg','#1d4ed8'); PP.selectTool('text'); const o=PP.opts('text'); o.fontSize=48; o.bold=true; o.fontFamily='맑은 고딕'");
  await t.click(100, 100);
  await wait(100);
  t.check(await js("!!document.querySelector('.text-editor')"), '텍스트 도구: 클릭하면 편집기가 열림');
  await js("document.querySelector('.text-editor').innerText='Hello 안녕하세요'");
  await t.key('Return', ['control']);
  await wait(150);
  t.check(!(await js("!!document.querySelector('.text-editor')")), 'Ctrl+Enter 로 텍스트 확정');
  const ink = await inkCount(90, 90, 600, 90);
  t.check(ink > 800, `텍스트가 레이어에 그려짐 (${ink}px)`);
  t.check((await js("PP.history.stack[PP.history.stack.length-1].name")) === '텍스트', '히스토리에 "텍스트" 기록');
  await js('PP.history.undo()');
  t.check((await inkCount(90, 90, 600, 90)) === 0, '텍스트 실행 취소');
  await js('PP.history.redo()');
  // 기울임 + Esc 취소
  await js("PP.opts('text').italic=true");
  await t.click(100, 250);
  await js("document.querySelector('.text-editor').innerText='취소될 글자'");
  await js("document.querySelector('.text-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait(100);
  t.check((await inkCount(90, 240, 400, 90)) === 0, 'Esc 로 텍스트 입력 취소');
  await t.shot('text');
};
