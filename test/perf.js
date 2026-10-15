'use strict';
/* 큰 캔버스(3000×3000, 레이어 3개)에서도 그리기/합성/실행 취소 비용이 문서 크기에 좌우되지 않는지 측정 */
module.exports = async function (t) {
  const { js, wait } = t;
  const rafs = 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now()))))';
  await js('PP.doc.init(3000, 3000, "#ffffff")');
  for (let i = 0; i < 2; i++) await js('PP.layers.add()');
  await js('PP.vp.fit(1)');
  await js("PP.selectTool('brush'); (()=>{const o=PP.opts('brush');o.type='soft';Object.assign(o,PP.BRUSH_PRESETS.soft);o.size=90;o.hardness=40;o.smoothing=0;})(); PP.setColor('fg','#6d28d9'); 0");
  await t.frame();

  // 실제 마우스 입력으로 긴 획을 그리면서 도구/프레임 핸들러의 JS 비용을 측정
  await js(`(()=>{
    window.__p = { move:0, moveN:0, frame:0, frameN:0, commit:0 };
    const T = PP.tools.brush, om = T.move.bind(T);
    T.move = (pt) => { const a=performance.now(); om(pt); window.__p.move += performance.now()-a; window.__p.moveN++; };
    const oe = PP.emit;
    PP.emit = function(name, ...args){ if(name==='frame'){ const a=performance.now(); oe.call(PP,name,...args); window.__p.frame += performance.now()-a; window.__p.frameN++; } else oe.call(PP,name,...args); };
    const oc = PP.preview.commit.bind(PP.preview);
    PP.preview.commit = function(n){ const a=performance.now(); oc(n); window.__p.commit = performance.now()-a; };
    0 })()`);
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([200 + i * 60, 500 + Math.sin(i / 3) * 250 + i * 30]);
  const costBefore = await js('PP.history.cost');
  await t.drag(pts, { step: 4 });
  await wait(300);
  const p = await js('window.__p');
  const perMove = p.move / p.moveN, perFrame = p.frame / Math.max(1, p.frameN);
  console.log(`  브러시 move ${perMove.toFixed(3)}ms/회 (${p.moveN}회), 프레임 핸들러 ${perFrame.toFixed(2)}ms/프레임 (${p.frameN}프레임), 병합 ${p.commit.toFixed(1)}ms`);
  t.check(perMove < 3, `큰 캔버스에서 획 입력 처리 < 3ms/회 (${perMove.toFixed(3)}ms)`);
  t.check(perFrame < 10, `큰 캔버스에서 프레임 합성 JS 비용 < 10ms (${perFrame.toFixed(2)}ms)`);
  t.check(p.commit < 400, `긴 획 병합+히스토리 기록 < 400ms (${p.commit.toFixed(1)}ms)`);

  // 그리는 동안 화면 합성이 GPU까지 포함해 얼마나 걸리는지 (두 프레임 완료 시간)
  await js("PP.tools.brush.down({x:300,y:300,pressure:1,button:0}); 0");
  const g0 = await js('performance.now()');
  await js("(()=>{for(let i=0;i<30;i++)PP.tools.brush.move({x:300+i*10,y:300+i*4,pressure:1});return 0})()");
  const g1 = await js(rafs);
  await js("PP.tools.brush.up({x:600,y:420,pressure:1}); 0");
  console.log(`  점 30개 입력 후 화면 반영까지 ${(g1 - g0).toFixed(0)}ms (2프레임)`);
  t.check(g1 - g0 < 250, '그린 내용이 2프레임 안에 화면에 반영됨');

  // 실행 취소/다시 실행 속도
  const u = await js(`(()=>{const a=performance.now();PP.history.undo();const b=performance.now();PP.history.redo();return [b-a,performance.now()-b]})()`);
  console.log('  undo/redo ' + u.map((x) => x.toFixed(1)).join(' / ') + ' ms');
  t.check(u[0] < 200 && u[1] < 200, 'undo/redo 각각 < 200ms (변경 사각형만 교체)');

  // 획 하나가 차지하는 히스토리 메모리 (변경 영역만 저장)
  const cost = (await js('PP.history.cost')) - costBefore;
  const layerBytes = 3000 * 3000 * 4;
  console.log('  첫 획 히스토리 ' + (cost / 1048576).toFixed(1) + ' MB (레이어 1장 = ' + (layerBytes / 1048576).toFixed(0) + ' MB)');
  t.check(cost < layerBytes / 2, '획 하나의 히스토리가 레이어 전체의 절반 미만(변경 영역만 저장)');

  // 100단계 이상 기록 유지
  await js(`(()=>{const T=PP.tools.pencil;PP.selectTool('pencil');PP.opts('pencil').size=4;
    for(let i=0;i<150;i++){T.down({x:100+i*5,y:100,pressure:1,button:0});T.move({x:100+i*5,y:2000,pressure:1});T.up({x:100+i*5,y:2000,pressure:1});}
    return 0})()`);
  const n = await js('PP.history.stack.length');
  const mb = (await js('PP.history.cost')) / 1048576;
  t.check(n >= 100, `긴 세로 획 150번 후에도 100단계 이상 유지 (${n}단계, ${mb.toFixed(0)}MB)`);
};
