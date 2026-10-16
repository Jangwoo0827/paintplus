'use strict';
/* 2.1: 3D 편집 모드 (점/선/면, 돌출·인셋·베벨·루프 컷·병합·삭제·세분화) + 모디파이어 */
module.exports = async function (t) {
  const { js, wait } = t;
  await wait(300);
  await js('PP.hub.close()');
  await js('PP.tabs.new3d()');
  await wait(400);
  const stat = () => js('(()=>{const e=PP.three.scene.byId(PP.three.sel).em;return e?[e.v.length,e.f.length,e.isClosedManifold()]:null})()');
  /** 편집 중인 정점/모서리/면의 화면 좌표(client px) */
  const clientOf = (expr) => js(`(()=>{const T=PP.three,it=T.scene.byId(T.sel);it.obj3d.updateMatrixWorld(true);const p=${expr};const v=new T.gl.camera.position.constructor(p[0],p[1],p[2]).applyMatrix4(it.obj3d.matrixWorld).project(T.gl.camera);const r=T.gl.canvas.getBoundingClientRect();return [r.left+(v.x*0.5+0.5)*r.width, r.top+(-v.y*0.5+0.5)*r.height]})()`);
  const click = async (expr, opts) => { const [x, y] = await clientOf(expr); await t.page.mouse.click(x, y, opts); await wait(120); };

  // 큐브 선택 후 Tab → 편집 모드
  await t.page.mouse.click(650, 500);
  await wait(150);
  await t.key('Tab');
  await wait(200);
  t.check(await js('PP.three.edit.on && PP.three.hook.on'), 'Tab: 편집 모드 진입');
  const s0 = await stat();
  t.check(s0 && s0[0] === 8 && s0[1] === 6 && s0[2], `큐브가 편집 가능한 메쉬로 변환됨 (정점 ${s0 && s0[0]}, 면 ${s0 && s0[1]})`);
  await t.shot('edit-start');

  // 면 모드: 위 면 클릭 → 선택, 돌출
  await t.key('3');
  t.check((await js('PP.three.edit.mode')) === 'face', '3: 면 선택 모드');
  await click('it.em.centroid(3)');
  t.check((await js('[...PP.three.edit.sel].join()')) === '3', '위 면 클릭으로 면 선택');
  await t.key('E');
  const s1 = await stat();
  t.check(s1[0] === 12 && s1[1] === 10 && s1[2], `E: 돌출 (정점 ${s1[0]}, 면 ${s1[1]}, 닫힘 ${s1[2]})`);
  t.check(await js('PP.three.scene.byId(PP.three.sel).em.v.some(p=>p[1]>0.7)'), '돌출된 면이 위로 올라감');

  // 기즈모 이동: 선택 면 정점들이 따라 움직임
  const y0 = await js('Math.max(...PP.three.scene.byId(PP.three.sel).em.v.map(p=>p[1]))');
  await js('(()=>{const T=PP.three;T.hook.drag(true);const e=T.edit;const g=T.gl.tc.object;g.position.y+=0.4;T.hook.change();T.hook.drag(false)})()');
  const y1 = await js('Math.max(...PP.three.scene.byId(PP.three.sel).em.v.map(p=>p[1]))');
  t.check(Math.abs(y1 - y0 - 0.4) < 1e-6, `기즈모 이동이 정점에 반영됨 (+${(y1 - y0).toFixed(2)})`);

  // 인셋
  await t.key('I');
  const s2 = await stat();
  t.check(s2[0] === 16 && s2[1] === 14 && s2[2], `I: 인셋 (정점 ${s2[0]}, 면 ${s2[1]})`);
  await t.shot('edit-inset');

  // 실행 취소 / 다시 실행
  await t.key('Z', ['control']);
  await t.key('Z', ['control']);
  t.check((await stat())[0] === 12, 'Ctrl+Z 로 인셋/이동 취소 → 돌출 상태');
  await t.key('Y', ['control']);
  await t.key('Y', ['control']);
  t.check((await stat())[0] === 16, 'Ctrl+Y 로 다시 실행');

  // 새 큐브로: 선 모드 베벨 / 루프 컷
  await js('PP.three.edit.exit()');
  await js("PP.three.add('mesh','cube')");
  await wait(150);
  await t.key('Tab');
  await t.key('2');
  await js("(()=>{const E=PP.three.edit;E.sel=new Set(['0,1']);E.setMode('edge');E.sel=new Set(['0,1']);})()");
  await t.key('B');
  const s3 = await stat();
  t.check(s3[0] === 10 && s3[1] === 7 && s3[2], `B: 모서리 베벨 (정점 ${s3[0]}, 면 ${s3[1]})`);
  await js('PP.three.edit.exit()');
  await js("PP.three.add('mesh','cube')");
  await wait(150);
  await t.key('Tab');
  await js("(()=>{const E=PP.three.edit;E.setMode('edge');E.sel=new Set(['0,1']);})()");
  await t.key('L');
  const s4 = await stat();
  t.check(s4[0] === 12 && s4[1] === 10 && s4[2], `L: 루프 컷 (정점 ${s4[0]}, 면 ${s4[1]})`);
  // 병합
  await js("(()=>{const E=PP.three.edit;E.setMode('vert');E.sel=new Set([8,9]);})()");
  await t.key('M');
  t.check((await stat())[0] === 11, 'M: 점 병합');
  // 삭제 / 세분화
  await js("(()=>{const E=PP.three.edit;E.setMode('face');E.sel=new Set([0]);})()");
  await t.key('X');
  t.check((await js('PP.three.scene.byId(PP.three.sel).em.f.length')) === 9, 'X: 면 삭제');
  await t.key('W');
  t.check((await js('PP.three.scene.byId(PP.three.sel).em.f.length')) > 20, 'W: 세분화');
  await t.key('Tab');
  t.check(!(await js('PP.three.edit.on')), 'Tab: 편집 모드 종료');

  // 모디파이어: 미러 + 서브디비전, 직렬화 왕복
  await js("PP.three.add('mesh','sphere')");
  await wait(150);
  await js("(()=>{const T=PP.three,it=T.scene.byId(T.sel);T.scene.convertToEM(it);it.mods.push({type:'mirror',axis:'x',enabled:true},{type:'subsurf',levels:1,enabled:true});T.scene.rebuild(it);T.commit('모디파이어');T.refreshProps()})()");
  const tris0 = await js('PP.three.scene.byId(PP.three.sel).obj3d.geometry.attributes.position.count/3');
  const emF = await js('PP.three.scene.byId(PP.three.sel).em.f.length');
  t.check(tris0 > emF * 2, `모디파이어 결과가 원본보다 조밀함 (${tris0} 삼각형 / 원본 면 ${emF})`);
  t.check(await js("document.querySelector('.mods3d')?.innerText.includes('미러')"), '속성 패널에 모디파이어 목록이 보임');
  const bytes = await js('Array.from(PP.three.scene.serialize())');
  const rt = await js(`(()=>{const s=PP.Scene3D.fromBytes(new Uint8Array(${JSON.stringify(bytes)}),'x.pp3d');const it=s.items.find(i=>i.mods&&i.mods.length===2);return it?it.obj3d.geometry.attributes.position.count/3:0})()`);
  t.check(rt === tris0, `.pp3d 저장 → 복원 후 모디파이어 결과 동일 (${rt})`);
  await js("PP.three.scene.byId(PP.three.sel).mods[0].enabled=false;PP.three.scene.rebuild(PP.three.scene.byId(PP.three.sel))");
  t.check((await js('PP.three.scene.byId(PP.three.sel).obj3d.geometry.attributes.position.count/3')) < tris0, '모디파이어 끄면 결과가 줄어듦');
  await js('PP.three.render()');
  const glb = await js('PP.three.exportGLB().then(b=>b.length)');
  t.check(glb > 1000, `편집한 메쉬도 GLB 로 내보내짐 (${glb} bytes)`);
  await t.shot('modifiers');
};
