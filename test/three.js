'use strict';
/* 2.0: 허브, 탭, 3D 작업실 */
module.exports = async function (t) {
  const { js, wait } = t;
  await wait(500);
  t.check(await js('PP.hub.isOpen()'), '시작 시 허브가 열림');
  const txt = await js("document.getElementById('hub').innerText");
  t.check(txt.includes('2D 그림') && txt.includes('3D 모델') && txt.includes('최근 파일'), '허브에 새 프로젝트/최근 파일 영역이 보임');
  await t.shot('hub');
  await js('PP.hub.close()');

  // 탭: 2D 두 개
  await js("PP.tabs.new2d(300,200,'#ffffff')");
  await js("PP.selectTool('pencil'); PP.opts('pencil').size=8; PP.setColor('fg','#000000')");
  await t.drag([[40, 40], [200, 40]]);
  await js("PP.tabs.new2d(200,200,'#ffff00')");
  const n2 = await js('PP.tabs.list.length');
  t.check(n2 >= 2, `탭이 여러 개 (${n2})`);
  await js('PP.tabs.switchTo(PP.tabs.list[PP.tabs.list.length-2].id)');
  t.check((await js('PP.doc.width')) === 300 && (await t.px(100, 40))[0] < 60, '이전 2D 탭으로 돌아오면 그림과 크기가 복원됨');
  t.check(await js('PP.history.isDirty()'), '탭마다 변경 여부가 따로 유지됨');

  // 3D 탭
  await js('PP.tabs.new3d()');
  await wait(400);
  t.check(await js("PP.tabs.is3d() && !document.getElementById('ws3d').hidden"), '3D 탭: 작업실이 표시됨');
  t.check(await js("getComputedStyle(document.getElementById('workspace')).display==='none'"), '3D 탭: 2D 작업 영역은 숨겨짐');
  const gl = await js("(()=>{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))})()");
  t.check(gl, 'WebGL 사용 가능');
  const nItems = await js('PP.three.scene.items.length');
  t.check(nItems === 2, '시작 장면: 큐브 + 태양광 (' + nItems + '개)');
  await js('PP.three.render()');
  const nonBg = await js("(()=>{const c=PP.three.renderToCanvas(200,120);const d=c.getContext('2d').getImageData(0,0,200,120).data;const bg=[d[0],d[1],d[2]];let n=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2])>30)n++;return n})()");
  t.check(nonBg > 300, `큐브가 화면에 그려짐 (배경과 다른 픽셀 ${nonBg}개)`);
  await t.shot('3d-start');

  // 뷰포트 클릭으로 선택 / 빈 곳 클릭으로 해제
  await t.page.mouse.click(650, 500);
  await wait(200);
  t.check(!!(await js('PP.three.sel')) && (await js('PP.three.scene.byId(PP.three.sel).kind')) === 'cube', '뷰포트에서 큐브를 클릭하면 선택됨');
  await t.page.mouse.click(200, 700);
  await wait(200);
  t.check(!(await js('PP.three.sel')), '빈 곳을 클릭하면 선택 해제');

  // 추가 / 변환 / 실행 취소
  await js("PP.three.add('mesh','sphere')");
  t.check((await js('PP.three.scene.items.length')) === 3, '구 추가');
  await js("(()=>{const it=PP.three.scene.byId(PP.three.sel);it.obj3d.position.set(2,0.5,0);PP.three.commit('이동');PP.three.refreshProps()})()");
  await t.key('Z', ['control']);
  t.check((await js('PP.three.scene.byId(PP.three.sel).obj3d.position.x')) === 0, 'Ctrl+Z 로 이동 취소');
  await t.key('Y', ['control']);
  t.check((await js('PP.three.scene.byId(PP.three.sel).obj3d.position.x')) === 2, 'Ctrl+Y 로 다시 실행');
  await js("(()=>{const i=document.querySelector('.props3d input[type=color]');i.value='#ff0000';i.dispatchEvent(new Event('input'));i.dispatchEvent(new Event('change'))})()");
  t.check((await js("'#'+PP.three.scene.byId(PP.three.sel).obj3d.material.color.getHexString()")) === '#ff0000', '속성 패널에서 재질 색 변경');
  await t.key('G');
  t.check((await js('PP.three.mode')) === 'translate', 'G: 이동 기즈모');
  await t.key('R');
  t.check((await js('PP.three.mode')) === 'rotate', 'R: 회전 기즈모');
  await t.key('X');
  t.check((await js('PP.three.scene.items.length')) === 2, 'X: 선택 삭제');
  const before = await js('PP.state.tool');
  await t.key('B');
  t.check((await js('PP.state.tool')) === before, '3D 작업실에서는 2D 도구 단축키가 무시됨');

  // 직렬화 / 내보내기 / 가져오기
  const bytes = await js('Array.from(PP.three.scene.serialize())');
  const rt = await js(`(()=>{const s=PP.Scene3D.fromBytes(new Uint8Array(${JSON.stringify(bytes)}),'x.pp3d');return s.items.length+':'+s.items[0].kind})()`);
  t.check(rt === '2:cube', '.pp3d 직렬화 → 복원 (' + rt + ')');
  const glb = await js('PP.three.exportGLB().then(b=>[b.length,String.fromCharCode(...b.slice(0,4))])');
  t.check(glb[1] === 'glTF' && glb[0] > 500, `GLB 내보내기 (${glb[0]} bytes, 매직 ${glb[1]})`);
  await js('(async()=>{window.__glb=await PP.three.exportGLB();await PP.three.importModel("t.glb", window.__glb);return 1})()');
  t.check((await js('PP.three.scene.items.length')) >= 3 && (await js('PP.three.scene.items.some(i=>!!i.geomId)')), 'GLB 가져오기: 메쉬가 객체로 추가됨');
  const stlLen = await js('PP.three.exportSTL().length');
  const obj = await js('PP.three.exportOBJ().length');
  t.check(stlLen > 84 && obj > 50, `STL(${stlLen}B)/OBJ(${obj}B) 내보내기`);

  // 2D 로 보내기
  await js('PP.three.to2D()');
  t.check(!(await js('PP.tabs.is3d()')) && (await js('PP.doc.width')) === 1280, '현재 시점을 새 2D 탭으로 보내기');
  t.check(await js("document.getElementById('ws3d').hidden"), '2D 탭으로 오면 3D 작업실이 숨겨짐');

  // 변경된 3D 탭 닫기 → 저장 확인
  const cnt = await js('PP.tabs.list.length');
  await js("void PP.tabs.close(PP.tabs.list.find(t=>t.kind==='3d').id)");
  await wait(400);
  t.check(await js("document.querySelector('.modal h3')?.textContent==='변경 사항 저장'"), '변경된 3D 탭을 닫으면 저장 확인');
  await js("[...document.querySelectorAll('.modal .mbtn')].find(b=>b.textContent==='저장 안 함').click()");
  await wait(300);
  t.check((await js('PP.tabs.list.length')) === cnt - 1, '저장 안 함 → 탭 닫힘');
};
