'use strict';
/* v1.1 기능: 추가 필터, 마술봉/선택 모드/반전, 자유 변형, 보정 도구, 확정 전 도형 편집, 텍스트 이동 */
module.exports = async function (t) {
  const { js, wait } = t;
  const white = [255, 255, 255];
  const red = [220, 38, 38];
  const fresh = async (w = 600, h = 400, bg = '#ffffff') => {
    await js(`PP.doc.init(${w},${h},${bg ? `"${bg}"` : 'null'})`);
    await js('PP.vp.fit(1)');
    await t.frame();
  };
  const fillRect = (x, y, w, h, color) =>
    js(`(()=>{const l=PP.doc.active();l.ctx.fillStyle='${color}';l.ctx.fillRect(${x},${y},${w},${h});PP.doc.touch(l)})()`);
  const empty = async (x, y) => (await t.px(x, y))[3] === 0;
  const stat = (x, y, w, h) => js(`(()=>{const d=PP.doc.active().ctx.getImageData(${x},${y},${w},${h}).data;let n=0,s=0,s2=0;for(let i=0;i<d.length;i+=4){const v=d[i];n++;s+=v;s2+=v*v}const m=s/n;return {mean:m,sd:Math.sqrt(Math.max(0,s2/n-m*m))}})()`);

  // ================= 추가 필터 =================
  await fresh(300, 200);
  await fillRect(100, 50, 100, 100, '#ff0000');
  // 포스터화(2단계): 중간색이 0/255 로
  await js("PP.runFilter('posterize')"); await wait(300);
  await js("document.querySelector('.modal input[type=range]').value=2; document.querySelector('.modal input[type=range]').dispatchEvent(new Event('input'))"); await wait(250);
  await js("document.querySelector('.modal .mbtn.primary').click()"); await wait(150);
  t.check(t.near(await t.px(150, 100), [255, 0, 0], 2), '포스터화 필터가 적용됨(원색 유지)');
  await js('PP.history.undo()');

  await js("PP.runFilter('pixelate')"); await wait(300);
  await js("(()=>{const r=document.querySelector('.modal input[type=range]');r.value=40;r.dispatchEvent(new Event('input'))})()"); await wait(250);
  await js("document.querySelector('.modal .mbtn.primary').click()"); await wait(150);
  const e1 = await t.px(100, 50), e2 = await t.px(101, 51);
  t.check(t.near(e1, e2, 2), '픽셀화: 같은 블록 안의 색이 동일');
  await js('PP.history.undo()');

  await js("PP.runFilter('noise')"); await wait(300);
  await js("document.querySelector('.modal .mbtn.primary').click()"); await wait(150);
  const sn = await stat(120, 60, 60, 60);
  t.check(sn.sd > 3, `노이즈 추가: 색 분산이 생김 (sd=${sn.sd.toFixed(1)})`);
  await js('PP.history.undo()');

  await js("PP.runFilter('motion')"); await wait(300);
  await js("document.querySelector('.modal .mbtn.primary').click()"); await wait(150);
  const mb = await t.px(97, 100);
  t.check(mb[1] > 5 && mb[1] < 250, `모션 블러: 경계가 번짐 (G=${mb[1]})`);
  await js('PP.history.undo()');

  await js("PP.runFilter('hsl')"); await wait(300);
  await js("(()=>{const r=document.querySelector('.modal input[type=range]');r.value=120;r.dispatchEvent(new Event('input'))})()"); await wait(250);
  await js("document.querySelector('.modal .mbtn.primary').click()"); await wait(150);
  const hs = await t.px(150, 100);
  t.check(hs[1] > hs[0] && hs[1] > hs[2], `색조 +120°: 빨강이 초록 계열로 (${hs.slice(0, 3)})`);
  await js('PP.history.undo()');

  await js("PP.runFilter('levels')"); await wait(300);
  await js("(()=>{const r=document.querySelectorAll('.modal input[type=range]');r[2].value=128;r[2].dispatchEvent(new Event('input'))})()"); await wait(250);
  await js("document.querySelector('.modal .mbtn.primary').click()"); await wait(150);
  t.check(t.near(await t.px(10, 10), [255, 255, 255], 2), '레벨: 밝은 영역을 낮추면 흰색 유지(클리핑)');
  await js('PP.history.undo()');

  for (const f of ['edge', 'emboss']) {
    await js(`PP.runFilter('${f}')`); await wait(250);
    const g = await t.px(10, 10);
    t.check(Math.abs(g[0] - g[1]) < 3 && Math.abs(g[1] - g[2]) < 3, `${f === 'edge' ? '윤곽선 검출' : '엠보스'}: 회색조 결과`);
    await js('PP.history.undo()');
  }
  await js("PP.runFilter('vignette')"); await wait(300);
  await js("document.querySelector('.modal .mbtn.primary').click()"); await wait(150);
  const vc = await t.px(150, 100), ve = await t.px(2, 2);
  t.check(vc[0] >= ve[0] && ve[0] < 250, `비네팅: 모서리가 어두워짐 (중앙 ${vc[0]} / 모서리 ${ve[0]})`);
  await js('PP.history.undo()');

  // ================= 마술봉 / 선택 모드 =================
  await fresh(400, 300);
  await fillRect(50, 50, 100, 100, '#dc2626');
  await fillRect(250, 50, 100, 100, '#dc2626');
  await js("PP.selectTool('wand'); PP.opts('wand').tolerance=10; PP.opts('wand').contiguous=true; PP.state.selMode='replace'");
  await t.click(100, 100);
  let b = await js('PP.sel.bounds()');
  t.check(b && b.x === 50 && b.y === 50 && b.w === 100 && b.h === 100, '마술봉(연결된 영역): 사각형 하나만 선택 ' + JSON.stringify(b));
  await t.click(300, 100, { modifiers: ['shift'] });
  b = await js('PP.sel.bounds()');
  t.check(b && b.x === 50 && b.w === 300, 'Shift+클릭으로 선택 더하기 → 두 사각형 모두 선택 ' + JSON.stringify(b));
  await t.click(300, 100, { modifiers: ['alt'] });
  b = await js('PP.sel.bounds()');
  t.check(b && b.x === 50 && b.w === 100, 'Alt+클릭으로 선택 빼기 → 하나만 남음');
  await js("PP.opts('wand').contiguous=false; PP.sel.deselect()");
  await t.click(100, 100);
  b = await js('PP.sel.bounds()');
  t.check(b && b.w === 300, '연결되지 않은 같은 색도 함께 선택(비연결 모드)');
  await js("PP.opts('wand').contiguous=true");

  // 선택 반전 + 삭제
  await js('PP.sel.deselect()');
  await t.click(100, 100);
  await t.key('I', ['control', 'shift']);
  t.check(!(await js('PP.sel.inside({x:100,y:100})')) && (await js('PP.sel.inside({x:10,y:10})')), 'Ctrl+Shift+I 선택 반전');
  await js('PP.clip.delete()');
  t.check((await t.px(10, 10))[3] === 0 && t.near(await t.px(100, 100), red, 5), '반전된 선택(배경) 삭제: 빨간 사각형만 남음');
  await js('PP.history.undo()');
  t.check(t.near(await t.px(10, 10), white), '선택 삭제 실행 취소');

  // 마스크 선택 영역 안에서만 칠하기
  await js('PP.sel.deselect()');
  await js("PP.selectTool('wand')");
  await t.click(100, 100);
  await js("PP.selectTool('brush'); (()=>{const o=PP.opts('brush');o.type='soft';Object.assign(o,PP.BRUSH_PRESETS.soft);o.size=60;o.hardness=100;o.smoothing=0})(); PP.setColor('fg','#2563eb')");
  await t.drag([[20, 100], [180, 100]]);
  t.check(t.near(await t.px(100, 100), [37, 99, 235], 10) && t.near(await t.px(30, 100), white, 5), '마스크 선택 안에서만 칠해짐(밖은 그대로)');
  await js('PP.sel.deselect()');

  // 마스크 선택 이동
  await fresh(400, 300, null);
  await fillRect(50, 50, 80, 80, '#dc2626');
  await js("PP.selectTool('wand'); PP.state.selMode='replace'");
  await t.click(90, 90);
  await js("PP.selectTool('selrect')");
  await t.drag([[90, 90], [250, 190]]);
  await t.key('Return');
  t.check(t.near(await t.px(250, 190), red, 8) && await empty(90, 90), '마술봉으로 고른 영역을 이동');
  await js('PP.history.undo()');
  t.check(t.near(await t.px(90, 90), red, 8), '이동 실행 취소');
  await js('PP.sel.deselect()');

  // 선택 교차/모드 버튼
  await fresh(300, 300);
  await js("PP.selectTool('selrect'); PP.state.selMode='replace'");
  await t.drag([[20, 20], [160, 160]]);
  await js("PP.state.selMode='inter'");
  await t.drag([[100, 100], [250, 250]]);
  b = await js('PP.sel.bounds()');
  t.check(b && Math.abs(b.x - 100) <= 2 && Math.abs(b.y - 100) <= 2 && Math.abs(b.w - 60) <= 3 && Math.abs(b.h - 60) <= 3, '교차 모드: 두 선택의 겹친 부분만 남음 ' + JSON.stringify(b));
  await js("PP.state.selMode='replace'; PP.sel.deselect()");

  // ================= 자유 변형 =================
  await fresh(400, 300, null);
  await fillRect(100, 100, 50, 50, '#16a34a');
  await t.key('T', ['control']);
  t.check(!!(await js('PP.sel.float')), 'Ctrl+T: 내용이 변형 가능 상태로');
  const hnd = await js('PP.sel.handles(PP.vp.zoom).filter(h=>h.type==="scale"&&h.hx===1&&h.hy===1)[0]');
  await t.drag([[hnd.x, hnd.y], [hnd.x + 50, hnd.y + 50]]);
  await t.key('Return');
  t.check(t.near(await t.px(190, 190), [22, 163, 74], 8) && await empty(210, 210), '핸들로 2배 확대 후 확정(100~200 영역)');
  await js('PP.history.undo()');
  t.check(await empty(190, 190) && t.near(await t.px(120, 120), [22, 163, 74], 8), '자유 변형 실행 취소');
  await js('PP.sel.deselect()');

  // ================= 보정 도구 =================
  const brushOpts = (tool, extra = '') => js(`(()=>{const o=PP.opts('${tool}');o.size=40;o.hardness=100;o.smoothing=0;o.pressure=false;o.strength=100;o.spacing=8;${extra}})()`);
  await fresh(300, 200);
  await fillRect(0, 0, 150, 200, '#000000');
  // 흐림 브러시: 경계의 대비 감소
  await js("PP.selectTool('blurbrush')"); await brushOpts('blurbrush');
  const before = await t.px(155, 100);
  await t.drag([[100, 100], [200, 100], [100, 100], [200, 100]]);
  const after = await t.px(147, 100);
  t.check(after[0] > 20, `흐림 브러시: 경계 근처가 섞임 (R=${after[0]})`);
  await js('PP.history.undo()');
  t.check(t.near(await t.px(147, 100), [0, 0, 0], 2), '흐림 브러시 실행 취소 (한 번에 되돌림)');

  // 손가락: 검정을 흰색 쪽으로 끌기
  await js("PP.selectTool('smudge')"); await brushOpts('smudge', 'o.strength=90');
  await t.drag([[120, 100], [200, 100]]);
  const sm = await t.px(175, 100);
  t.check(sm[0] < 120, `손가락: 검정이 오른쪽으로 번짐 (R=${sm[0]})`);
  await js('PP.history.undo()');

  // 닷지/번
  await fresh(300, 200);
  await fillRect(0, 0, 300, 200, '#808080');
  await js("PP.selectTool('dodge')"); await brushOpts('dodge', 'o.strength=100');
  await t.drag([[50, 50], [150, 50], [50, 50], [150, 50]]);
  const dd = await t.px(100, 50);
  await js("PP.selectTool('burn')"); await brushOpts('burn', 'o.strength=100');
  await t.drag([[50, 150], [150, 150], [50, 150], [150, 150]]);
  const bu = await t.px(100, 150);
  t.check(dd[0] > 140 && bu[0] < 120, `닷지는 밝게(${dd[0]}), 번은 어둡게(${bu[0]})`);

  // 복제 도장
  await fresh(300, 200, null);
  await fillRect(40, 40, 40, 40, '#dc2626');
  await js("PP.selectTool('clone')"); await brushOpts('clone');
  await t.click(60, 60, { modifiers: ['alt'] });
  t.check(!!(await js('PP.tools.clone.src')), 'Alt+클릭으로 복제 원본 지정');
  await t.drag([[160, 60], [180, 60]]);
  t.check(t.near(await t.px(165, 60), red, 12), '복제 도장: 원본의 빨강이 새 위치에 복제됨');
  t.check((await js('PP.history.stack[PP.history.stack.length-1].name')) === '복제 도장', '복제 도장 히스토리 기록');

  // ================= 확정 전 도형 편집 =================
  await fresh(500, 400);
  await js("PP.setColor('fg','#dc2626'); PP.selectTool('rect'); (()=>{const o=PP.opts('rect');o.shapeMode='fill';o.lineWidth=4})()");
  await t.drag([[50, 50], [150, 150]]);
  t.check(await js('PP.preview.active'), '도형을 그린 뒤에도 확정되지 않고 편집 상태 유지');
  t.check(t.near(await t.px(100, 100), white), '확정 전에는 레이어에 반영되지 않음');
  const hs2 = await js('(()=>{const g=PP.tools.rect;return 1})()');
  // 오른쪽 아래 핸들을 (250,200)으로
  await t.drag([[150, 150], [250, 200]]);
  await t.key('Return');
  t.check(t.near(await t.px(240, 190), red, 10) && t.near(await t.px(60, 60), red, 10), '핸들 드래그로 크기를 키운 뒤 Enter 로 확정');
  t.check((await js('PP.history.stack.length')) === 1, '편집을 거쳐도 히스토리는 1단계');
  await js('PP.history.undo()');

  // 이동
  await t.drag([[50, 50], [150, 150]]);
  await t.drag([[100, 100], [200, 160]]); // 도형 안쪽 드래그 → 이동
  await t.key('Return');
  t.check(t.near(await t.px(240, 200), red, 10) && t.near(await t.px(60, 60), white, 5), '도형 안을 드래그해서 이동');
  await js('PP.history.undo()');

  // 옵션 변경이 바로 반영 + Esc 취소
  await t.drag([[50, 50], [150, 150]]);
  await js("PP.setColor('fg','#2563eb')");
  await t.key('Return');
  t.check(t.near(await t.px(100, 100), [37, 99, 235], 10), '편집 중 색을 바꾸면 도형 색이 바로 바뀜');
  await js('PP.history.undo()');
  await t.drag([[50, 50], [150, 150]]);
  await t.key('Escape');
  t.check(!(await js('PP.preview.active')) && t.near(await t.px(100, 100), white), 'Esc 로 편집 중인 도형 취소');

  // 직선 끝점 이동
  await js("PP.selectTool('line'); PP.opts('line').lineWidth=6; PP.setColor('fg','#dc2626')");
  await t.drag([[50, 300], [200, 300]]);
  await t.drag([[200, 300], [200, 360]]); // 끝점 핸들 이동
  await t.key('Return');
  t.check(t.near(await t.px(125, 330), red, 40) && t.near(await t.px(200, 300), white, 10), '직선 끝점 핸들로 방향 변경');
  await js('PP.history.undo()');

  // 다각형 꼭짓점 편집
  await js("PP.selectTool('polygon'); PP.opts('polygon').shapeMode='fill'");
  for (const p of [[300, 50], [420, 50], [420, 150], [300, 150]]) await t.click(p[0], p[1]);
  await t.dblclick(300, 150);
  await wait(150);
  t.check((await js('PP.history.index')) === 0 && (await js('PP.preview.active')), '다각형을 닫아도 꼭짓점 편집 상태(미확정)');
  await t.drag([[420, 150], [470, 190]]); // 꼭짓점 이동
  await t.key('Return');
  t.check(t.near(await t.px(440, 160), red, 10), '꼭짓점을 옮긴 모양으로 확정');
  await js('PP.history.undo()');

  // 곡선 제어점 편집
  await js("PP.selectTool('curve'); PP.opts('curve').lineWidth=6");
  await t.drag([[300, 300], [450, 300]]);
  await t.drag([[375, 250], [375, 250]]);
  await t.drag([[375, 250], [375, 250]]);
  t.check(await js('PP.preview.active'), '곡선도 편집 상태로 대기');
  await t.key('Return');
  t.check((await js('PP.history.index')) === 1, '곡선 확정 1단계');
  await js('PP.history.undo()');

  // ================= 텍스트 이동 핸들 =================
  await fresh(500, 300, null);
  await js("PP.setColor('fg','#1d4ed8'); PP.selectTool('text'); (()=>{const o=PP.opts('text');o.fontSize=40;o.bold=true})()");
  await t.click(50, 100);
  await wait(100);
  await js("document.querySelector('.text-editor').innerText='이동'");
  const hbox = await js("(()=>{const r=document.querySelector('.text-handle').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()");
  t.check(!!hbox, '텍스트 입력 중 이동 핸들(✥)이 보임');
  await js(`(()=>{const h=document.querySelector('.text-handle');const ev=(t,x,y)=>h.dispatchEvent(new PointerEvent(t,{pointerId:9,clientX:x,clientY:y,bubbles:true,cancelable:true}));ev('pointerdown',${hbox[0]},${hbox[1]});ev('pointermove',${hbox[0] + 100},${hbox[1] + 60});ev('pointerup',${hbox[0] + 100},${hbox[1] + 60});0})()`);
  await wait(100);
  await js("PP.commitTextEditor(true)");
  const ink = (x, y, w, h) => js(`(()=>{const d=PP.doc.active().ctx.getImageData(${x},${y},${w},${h}).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>8)n++;return n})()`);
  t.check((await ink(140, 150, 140, 80)) > 100 && (await ink(40, 90, 100, 60)) === 0, '핸들로 옮긴 위치에 텍스트가 그려짐');
};
