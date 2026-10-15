'use strict';
module.exports = async function (t) {
  const { js, wait } = t;
  const white = [255, 255, 255];
  const red = [220, 38, 38];
  const blue = [37, 99, 235];

  const fresh = async (w = 800, h = 600, bg = '#ffffff') => {
    await js(`PP.doc.init(${w},${h},${bg ? `"${bg}"` : 'null'})`);
    await js('PP.vp.fit(1)');
    await t.frame();
  };
  const fillRect = (x, y, w, h, color) =>
    js(`(()=>{const l=PP.doc.active();l.ctx.fillStyle='${color}';l.ctx.fillRect(${x},${y},${w},${h});PP.doc.touch(l)})()`);

  // ---------- 확대/축소/이동 ----------
  await fresh();
  const z0 = await js('PP.vp.zoom');
  await js('PP.vp.zoomStep(1)');
  const z1 = await js('PP.vp.zoom');
  t.check(z1 > z0, `확대 단계 ${z0} → ${z1}`);
  await js('PP.vp.actual()');
  t.check((await js('PP.vp.zoom')) === 1, '100% 보기');
  await js('PP.vp.fit(8)');
  t.check((await js('PP.vp.zoom')) > 0.2, '맞춤 보기');
  // 스페이스+드래그로 손바닥 이동
  const [ox0] = await js('[PP.vp.ox, PP.vp.oy]');
  await js('PP.vp.setZoom(2)');
  const before = await js('[PP.vp.ox, PP.vp.oy]');
  t.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  await wait(50);
  t.check(await js('PP.vp.space'), 'Space 누르면 손바닥 모드');
  await t.drag([[400, 300], [300, 250]], { step: 3 });
  t.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await wait(50);
  const after = await js('[PP.vp.ox, PP.vp.oy]');
  t.check(after[0] < before[0] - 20 && after[1] < before[1] - 10, `Space+드래그로 화면 이동 (${before.map(Math.round)} → ${after.map(Math.round)})`);
  await js('PP.vp.fit(8)');

  // ---------- 격자 + 격자 맞춤 ----------
  await fresh();
  await js("PP.setGrid({show:true,size:50,snap:true}); PP.selectTool('line'); PP.opts('line').lineWidth=4; PP.setColor('fg','#dc2626')");
  await t.drag([[103, 98], [297, 203]]);
  // 격자 맞춤: (100,100)→(300,200)
  t.check(t.near(await t.px(200, 150), red, 60), '격자 맞춤: 직선이 격자점(100,100)-(300,200)에 정렬');
  await t.shot('grid');
  await js("PP.setGrid({show:false,snap:false})");

  // ---------- 사각형 선택 / 이동 / 복사 / 잘라내기 / 붙여넣기 ----------
  const empty = async (x, y) => (await t.px(x, y))[3] === 0;
  await fresh(800, 600, null);
  await fillRect(100, 100, 120, 80, '#dc2626');
  await t.key('V');
  await t.drag([[90, 90], [230, 190]]);
  const b = await js('PP.sel.bounds()');
  t.check(b && Math.abs(b.x - 90) <= 2 && Math.abs(b.y - 90) <= 2 && Math.abs(b.w - 140) <= 3 && Math.abs(b.h - 100) <= 3, '사각형 선택 영역 생성 ' + JSON.stringify(b));
  // 이동: 선택 안쪽 드래그
  await t.drag([[150, 140], [350, 340]]);
  t.check(!!(await js('PP.sel.float')), '이동 중에는 떠 있는 선택');
  await t.key('Return');
  t.check(t.near(await t.px(360, 340), red), '선택 영역 이동: 확정 후 새 위치에 내용이 있음');
  t.check(!(await js('!!PP.sel.float')), 'Enter 로 확정');
  t.check(await empty(150, 140), '원래 위치는 비어 있음(투명)');
  const histN = await js('PP.history.stack.length');
  t.check((await js('PP.history.stack[PP.history.stack.length-1].name')).includes('이동'), `히스토리에 이동 기록: ${await js('PP.history.stack[PP.history.stack.length-1].name')}`);
  await js('PP.history.undo()');
  t.check(t.near(await t.px(150, 140), red), '이동 실행 취소 → 원래 위치에 복원');
  t.check(await empty(360, 340), '이동 실행 취소 → 새 위치는 다시 비움');
  await js('PP.history.redo()');
  t.check(t.near(await t.px(360, 340), red), '다시 실행');

  // 복사 / 붙여넣기 (시스템 클립보드 경유)
  await fresh(800, 600, null);
  await fillRect(100, 100, 100, 60, '#2563eb');
  await js("PP.selectTool('selrect'); PP.sel.setRect(100,100,200,160)");
  await js('PP.clip.copy()');
  await wait(300);
  await js('PP.sel.deselect()');
  await js('PP.clip.paste()');
  await wait(500);
  t.check(!!(await js('PP.sel.float')), 'Ctrl+V: 붙여넣기는 떠 있는 선택으로 시작');
  const fb = await js('(()=>{const f=PP.sel.float;return [f.nw,f.nh]})()');
  t.check(fb[0] === 100 && fb[1] === 60, `붙여넣은 크기 100×60: ${fb}`);
  // 붙여넣은 것을 드래그로 이동
  const fc = await js('(()=>{const f=PP.sel.float;return [f.cx,f.cy]})()');
  await t.drag([[fc[0], fc[1]], [fc[0] + 300, fc[1] + 200]]);
  await t.key('Return');
  t.check(t.near(await t.px(fc[0] + 300, fc[1] + 200), blue), '붙여넣은 이미지를 옮겨 확정');
  await t.shot('paste');

  // 잘라내기
  await js("PP.selectTool('selrect'); PP.sel.setRect(100,100,200,160)");
  await js('PP.clip.cut()');
  await wait(300);
  t.check(await empty(150, 130), '잘라내기 후 원래 영역이 비워짐');
  t.check(!(await js('PP.sel.hasAny()')), '잘라내기 후 선택 해제');
  await js('PP.history.undo()');
  t.check(t.near(await t.px(150, 130), blue), '잘라내기 실행 취소');

  // 삭제 키
  await js("PP.sel.setRect(100,100,200,160)");
  await t.key('Delete');
  t.check(await empty(150, 130), 'Delete 로 선택 영역 삭제');
  await js('PP.history.undo()');

  // ---------- 선택 영역 크기 조절 / 회전 ----------
  await fresh();
  await fillRect(100, 100, 100, 100, '#16a34a');
  await js("PP.selectTool('selrect'); PP.sel.setRect(100,100,200,200)");
  const hs = await js('PP.sel.handles(PP.vp.zoom).filter(h=>h.type==="scale"&&h.hx===1&&h.hy===1)[0]');
  await t.drag([[hs.x, hs.y], [hs.x + 100, hs.y + 100]]);
  t.check(await js('PP.sel.float.w') === 200 || Math.abs((await js('PP.sel.float.w')) - 200) < 3, `모서리 핸들로 200×200 으로 확대 (w=${Math.round(await js('PP.sel.float.w'))})`);
  await t.key('Return');
  t.check(t.near(await t.px(280, 280), [22, 163, 74], 10), '크기를 키운 내용이 새 영역을 채움');
  // 회전 핸들
  await js("PP.sel.setRect(100,100,300,300)");
  const rh = await js('PP.sel.handles(PP.vp.zoom).filter(h=>h.type==="rotate")[0]');
  // 중심 (200,200) 기준 오른쪽(90°)으로 회전
  await t.drag([[rh.x, rh.y], [400, 200]]);
  const rr = await js('PP.sel.float.rot');
  t.check(Math.abs(rr - Math.PI / 2) < 0.15, `회전 핸들: 약 90° 회전 (${(rr * 180 / Math.PI).toFixed(1)}°)`);
  await t.key('Return');
  await t.shot('transform');

  // ---------- 자유형 선택 ----------
  await fresh(800, 600, null);
  await fillRect(100, 100, 200, 200, '#f59e0b');
  await t.key('V', ['shift']);
  t.check(await js('PP.state.tool') === 'sellasso', 'Shift+V 로 자유형 선택');
  await t.drag([[100, 100], [300, 100], [100, 300], [100, 100]]);
  const lp = await js('PP.sel.poly.length');
  t.check(lp >= 4, `자유형 선택 점 ${lp}개`);
  t.check(await js('PP.sel.inside({x:130,y:130})') && !(await js('PP.sel.inside({x:280,y:280})')), '자유형(삼각형) 안/밖 판정');
  await js('PP.sel.clearContent()');
  t.check(await empty(130, 130) && t.near(await t.px(280, 280), [245, 158, 11], 10), '자유형 영역만 지워지고 나머지는 유지');
  await js('PP.history.undo()');
  // 선택 영역 안에서만 그리기
  await js("PP.sel.setRect(400,100,500,200); PP.selectTool('brush'); PP.opts('brush').size=60; PP.opts('brush').hardness=100; PP.opts('brush').smoothing=0; PP.setColor('fg','#dc2626')");
  await t.drag([[350, 150], [550, 150]]);
  t.check(t.near(await t.px(450, 150), red, 40) && await empty(380, 150) && await empty(520, 150), '선택 영역 안에서만 칠해짐(클리핑)');
  await js('PP.sel.deselect()');

  // ---------- 자르기 / 회전 / 뒤집기 / 크기 ----------
  await fresh(400, 300);
  await fillRect(0, 0, 200, 150, '#dc2626');
  await js("PP.selectTool('selrect'); PP.sel.setRect(0,0,200,150)");
  await js('PP.img.crop()');
  t.check(await js('PP.doc.width===200 && PP.doc.height===150'), '선택 영역으로 자르기 200×150');
  await js('PP.history.undo()');
  t.check(await js('PP.doc.width===400 && PP.doc.height===300'), '자르기 실행 취소 → 400×300');
  await js('PP.img.rotate(90)');
  t.check(await js('PP.doc.width===300 && PP.doc.height===400'), '90° 회전 → 300×400');
  t.check(t.near(await t.px(299 - 10, 10), red) , '시계 방향 회전: 왼쪽 위 빨간 영역이 오른쪽 위로');
  await js('PP.history.undo()');
  await js('PP.img.flip(true)');
  t.check(t.near(await t.px(399 - 10, 10), red) && t.near(await t.px(10, 10), white), '좌우 대칭');
  await js('PP.history.undo()');
  await js('PP.img.flip(false)');
  t.check(t.near(await t.px(10, 299 - 10), red), '상하 대칭');
  await js('PP.history.undo()');
  await js('PP.img.canvasSize(500,400,0,0,false)');
  t.check(await js('PP.doc.width===500 && PP.doc.height===400') && t.near(await t.px(10, 10), red), '캔버스 크기 확장(왼쪽 위 기준)');
  await js('PP.history.undo()');
  await js('PP.img.resize(200,150,true)');
  t.check(await js('PP.doc.width===200 && PP.doc.height===150') && t.near(await t.px(40, 30), red, 20), '이미지 크기 조절(축소)');
  await js('PP.history.undo()');
  t.check(await js('PP.doc.width===400 && PP.doc.height===300'), '크기 조절 실행 취소');

  // ---------- 필터 ----------
  await fresh(400, 300);
  await fillRect(100, 100, 100, 100, '#ff0000');
  await js("PP.runFilter('invert')");
  t.check(t.near(await t.px(150, 150), [0, 255, 255], 6) && t.near(await t.px(10, 10), [0, 0, 0], 6), '색 반전');
  await js('PP.history.undo()');
  await js("PP.runFilter('gray')");
  const gp = await t.px(150, 150);
  t.check(Math.abs(gp[0] - gp[1]) < 3 && Math.abs(gp[1] - gp[2]) < 3 && gp[0] > 40 && gp[0] < 120, `흑백 (${gp.slice(0, 3)})`);
  await js('PP.history.undo()');
  await js("PP.runFilter('sepia')");
  const sp = await t.px(150, 150);
  t.check(sp[0] > sp[1] && sp[1] > sp[2], `세피아 (${sp.slice(0, 3)})`);
  await js('PP.history.undo()');

  // 흐림 (대화상자 + 실시간 미리보기 + 확인)
  await js("PP.runFilter('blur')");
  await wait(250);
  t.check(await js("!!document.querySelector('.modal')"), '흐림 대화상자 열림');
  const edge = await t.px(99, 150);
  t.check(edge[1] < 250 && edge[1] > 5, `흐림 미리보기가 즉시 적용됨 (경계 G=${edge[1]})`);
  await js("document.querySelector('.modal .mbtn.primary').click()");
  await wait(150);
  t.check((await js('PP.history.stack[PP.history.stack.length-1].name')) === '흐림 효과', '흐림: 확인 → 히스토리 기록');
  await js('PP.history.undo()');
  t.check(t.near(await t.px(99, 150), white), '흐림 실행 취소');
  // 취소하면 원상복구
  await js("PP.runFilter('brightness')");
  await wait(200);
  await js("(()=>{const r=document.querySelector('.modal input[type=range]');r.value=-80;r.dispatchEvent(new Event('input'))})()");
  await wait(250);
  const brighter = await t.px(150, 150);
  await js("document.querySelectorAll('.modal .mbtn')[1].click()");
  await wait(150);
  t.check(t.near(await t.px(150, 150), [255, 0, 0], 4) && brighter[0] < 120, `밝기 미리보기 후 취소하면 원본 복구 (미리보기 R=${brighter[0]})`);
  // 선택 영역에만 필터
  await js("PP.selectTool('selrect'); PP.sel.setRect(0,0,150,300)");
  await js("PP.runFilter('invert')");
  t.check(t.near(await t.px(120, 150), [0, 255, 255], 6) && t.near(await t.px(180, 150), [255, 0, 0], 6), '선택 영역 안에만 필터 적용');
  await t.shot('filters');

  // 모든 필터가 오류 없이 도는지 + 선명하게
  await js('PP.sel.deselect()');
  await js("PP.runFilter('sharpen')");
  await wait(250);
  await js("document.querySelector('.modal .mbtn.primary').click()");
  await wait(150);
  await js("PP.runFilter('saturation')");
  await wait(250);
  await js("document.querySelector('.modal .mbtn.primary').click()");
  await wait(150);
  t.check((await js('PP.history.stack.length')) >= 3, '선명하게/채도 필터 적용');

  // ---------- 눈금자 ----------
  await js("PP.setRulers(false)");
  await wait(100);
  t.check(await js("document.getElementById('ruler-h').style.display==='none'"), '눈금자 끄기');
  await js("PP.setRulers(true)");
  await wait(100);
  t.check(await js("document.getElementById('ruler-h').style.display===''"), '눈금자 켜기');
};
