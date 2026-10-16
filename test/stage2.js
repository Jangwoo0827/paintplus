'use strict';
module.exports = async function (t) {
  const { js, wait } = t;
  const white = [255, 255, 255];

  // ---- 실행 취소 / 다시 실행 (실제 마우스 입력) ----
  await t.key('B');
  await js("PP.setColor('fg','#ef4444'); PP.opts('brush').size=30; PP.opts('brush').hardness=100; PP.opts('brush').smoothing=0;");
  await t.drag([[200, 200], [600, 200]]);
  t.check(t.near(await t.px(400, 200), [239, 68, 68]), '브러시로 빨간 선 그림');
  t.check((await js('PP.history.stack.length')) === 1, '히스토리 1단계 기록');
  await t.key('Z', ['control']);
  t.check(t.near(await t.px(400, 200), white), 'Ctrl+Z 로 실행 취소');
  await t.key('Y', ['control']);
  t.check(t.near(await t.px(400, 200), [239, 68, 68]), 'Ctrl+Y 로 다시 실행');
  await t.key('Z', ['control']);
  t.check(t.near(await t.px(400, 200), white), '다시 한 번 Ctrl+Z');
  await t.key('Z', ['control', 'shift']);
  t.check(t.near(await t.px(400, 200), [239, 68, 68]), 'Ctrl+Shift+Z 도 다시 실행');

  // ---- 레이어 추가 + 그리기 ----
  await t.key('N', ['control', 'shift']);
  t.check((await js('PP.doc.layers.length')) === 2, 'Ctrl+Shift+N 으로 레이어 추가');
  await js("PP.setColor('fg','#2563eb')");
  await t.drag([[400, 100], [400, 300]]);
  t.check(t.near(await t.px(400, 150), [37, 99, 235]), '새 레이어에 파란 선');
  t.check(t.near(await t.px(400, 150, 'layer'), [37, 99, 235]), '현재 레이어 샘플도 파랑');
  t.check((await t.px(500, 200, 'layer'))[3] === 0, '새 레이어의 다른 곳은 투명');
  // 배경 레이어에는 파랑이 없어야 함
  await js('PP.layers.setActive(PP.doc.layers[0].id)');
  t.check(t.near(await t.px(400, 150, 'layer'), white), '배경 레이어는 흰색 그대로');
  await js('PP.layers.setActive(PP.doc.layers[1].id)');

  // ---- 불투명도 / 블렌드 ----
  const id2 = await js('PP.doc.layers[1].id');
  await js(`PP.layers.setProp(${id2},'opacity',0.5,'레이어 불투명도')`);
  const half = await t.px(400, 150);
  t.check(half[0] > 120 && half[0] < 160 && half[2] > 230, '불투명도 50% 합성');
  await js(`PP.layers.setProp(${id2},'blend','multiply','블렌드 모드')`);
  await js(`PP.layers.setProp(${id2},'opacity',1,'레이어 불투명도')`);
  const mul = await t.px(400, 250);
  t.check(t.near(mul, [37, 99, 235], 6), '곱하기 블렌드 (흰색 위 = 파랑)');
  await js(`PP.layers.setProp(${id2},'blend','source-over','블렌드 모드')`);

  // ---- 숨기기 / 잠금 ----
  await js(`PP.layers.setProp(${id2},'visible',false,'레이어 숨기기')`);
  t.check(t.near(await t.px(400, 250), white), '숨긴 레이어는 합성에서 제외');
  const hist = await js('PP.history.stack.length');
  await t.drag([[700, 100], [700, 200]]);
  t.check((await js('PP.history.stack.length')) === hist, '숨긴 레이어에는 그려지지 않음');
  await js(`PP.layers.setProp(${id2},'visible',true,'레이어 보이기')`);
  await js(`PP.layers.setProp(${id2},'locked',true,'레이어 잠금')`);
  const hist2 = await js('PP.history.stack.length');
  await t.drag([[700, 100], [700, 200]]);
  t.check((await js('PP.history.stack.length')) === hist2, '잠긴 레이어에는 그려지지 않음');
  await js(`PP.layers.setProp(${id2},'locked',false,'레이어 잠금 해제')`);

  // ---- 복제 / 이름 / 순서 / 병합 ----
  await js('PP.layers.duplicate()');
  t.check((await js('PP.doc.layers.length')) === 3, '레이어 복제');
  await js(`PP.layers.rename(PP.doc.activeId,'복제본')`);
  t.check((await js('PP.doc.active().name')) === '복제본', '레이어 이름 변경');
  const order0 = await js('PP.doc.layers.map(l=>l.name).join(",")');
  await js('PP.layers.moveDown()');
  const order1 = await js('PP.doc.layers.map(l=>l.name).join(",")');
  t.check(order0 !== order1, '레이어 순서 변경: ' + order0 + ' → ' + order1);

  // 드래그 앤 드롭 이벤트로 재정렬
  const before = await js('PP.doc.layers.map(l=>l.id).join(",")');
  await js(`(() => {
    const rows = document.querySelectorAll('.layer-row');
    const dt = new DataTransfer();
    const a = rows[rows.length - 1], b = rows[0]; // 맨 아래 행 → 맨 위 행 위쪽
    a.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientY: r.top + 2 }));
    b.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientY: r.top + 2 }));
  })()`);
  const after = await js('PP.doc.layers.map(l=>l.id).join(",")');
  t.check(before !== after && before.split(',')[0] === after.split(',').pop(), '드래그로 레이어 순서 변경 (맨 아래 → 맨 위)');

  await js('PP.layers.setActive(PP.doc.layers[PP.doc.layers.length-1].id)');
  await js('PP.layers.mergeDown()');
  t.check((await js('PP.doc.layers.length')) === 2, '아래로 병합');

  await t.shot('layers');

  // ---- 전체 실행 취소/다시 실행 ----
  const steps = await js('PP.history.stack.length');
  await js('PP.history.jump(0)');
  t.check((await js('PP.doc.layers.length')) === 1, `히스토리 0 으로 이동 시 레이어 1개 (총 ${steps}단계)`);
  t.check(t.near(await t.px(400, 200), white), '처음 상태는 빈 흰 캔버스');
  await js(`PP.history.jump(${steps})`);
  t.check((await js('PP.doc.layers.length')) === 2, '모두 다시 실행하면 레이어 2개 복원');
  t.check(t.near(await t.px(400, 200), [37, 99, 235], 40) || t.near(await t.px(400, 200), [239, 68, 68], 40), '다시 실행 후 그림 복원');

  // ---- 100단계 이상 ----
  await js('PP.doc.init(600,400,"#ffffff")');
  await js("PP.selectTool('pencil'); PP.opts('pencil').size=3; PP.setColor('fg','#000000')");
  await js(`(async()=>{
    const T = PP.tools.pencil;
    for (let i = 0; i < 130; i++) {
      const y = 5 + (i % 100) * 3, x0 = 10 + (i % 7) * 5;
      T.down({x:x0,y,pressure:1,button:0}); T.move({x:x0+60,y,pressure:1}); T.up({x:x0+60,y,pressure:1});
    }
  })()`);
  t.check((await js('PP.history.stack.length')) === 130, '130번 그려서 130단계 기록');
  for (let i = 0; i < 120; i++) await js('PP.history.undo()');
  t.check((await js('PP.history.index')) === 10, '120단계 실행 취소 → 10단계 상태');
  t.check(t.near(await t.px(40, 5 + 50 * 3), white), '실행 취소한 획은 사라짐');
  t.check(t.near(await t.px(30, 5), [0, 0, 0], 60), '남은 획은 그대로');
  for (let i = 0; i < 120; i++) await js('PP.history.redo()');
  t.check((await js('PP.history.index')) === 130, '120단계 다시 실행');
  t.check(t.near(await t.px(40, 5 + 50 * 3), [0, 0, 0], 60), '다시 실행한 획 복원');

  // 히스토리 패널
  await wait(150);
  const rows = await js("document.querySelectorAll('#panel-history .hist-row').length");
  t.check(rows === 131, '히스토리 패널 행 수 = 단계+1 (' + rows + ')');
  await js("document.querySelectorAll('#panel-history .hist-row')[50].click()");
  t.check((await js('PP.history.index')) === 50, '히스토리 패널 클릭으로 해당 단계 이동');
  await t.shot('history');
};
