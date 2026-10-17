'use strict';
/* 2.1+: 박스 선택, Alt+클릭 에지 루프 선택 */
module.exports = async function (t) {
  const { js, wait } = t;
  await wait(300);
  await js('PP.hub.close()');
  await js('PP.tabs.new3d()');
  await wait(400);
  await t.page.mouse.click(650, 500);
  await wait(150);
  await t.key('Tab');
  await wait(200);
  await t.key('W'); // 큐브 전체 세분화 → 면 24
  await wait(200);
  const em = () => js('(()=>{const e=PP.three.scene.byId(PP.three.sel).em;return [e.v.length,e.f.length]})()');
  t.check((await em())[1] === 24, '큐브를 세분화해 면 24개');
  const clientOf = (expr) => js(`(()=>{const T=PP.three,it=T.scene.byId(T.sel);it.obj3d.updateMatrixWorld(true);const p=${expr};const v=new T.gl.camera.position.constructor(p[0],p[1],p[2]).applyMatrix4(it.obj3d.matrixWorld).project(T.gl.camera);const r=T.gl.canvas.getBoundingClientRect();return [r.left+(v.x*0.5+0.5)*r.width, r.top+(-v.y*0.5+0.5)*r.height]})()`);

  // Alt+클릭: 에지 루프 (위 면 한가운데 가로 모서리 → 큐브를 한 바퀴 도는 8개 모서리)
  await t.key('2');
  const key = await js(`(()=>{const e=PP.three.scene.byId(PP.three.sel).em;const top=e.f.map((q,i)=>i).filter(i=>e.faceNormal(i)[1]>0.9);const ks=[...e.edgeFaces().keys()].filter(k=>{const [a,b]=k.split(',').map(Number);return Math.abs(e.v[a][1]-0.5)<1e-6&&Math.abs(e.v[b][1]-0.5)<1e-6&&Math.abs(e.v[a][2])<1e-6&&Math.abs(e.v[b][2])<1e-6});return ks[0]})()`);
  const [kx, ky] = await js(`(()=>{return null})()`) || [0, 0];
  const [x, y] = await clientOf(`(()=>{const e=PP.three.scene.byId(PP.three.sel).em;const [a,b]='${key}'.split(',').map(Number);return [(e.v[a][0]+e.v[b][0])/2,(e.v[a][1]+e.v[b][1])/2,(e.v[a][2]+e.v[b][2])/2]})()`);
  await t.page.keyboard.down('Alt');
  await t.page.mouse.click(x, y);
  await t.page.keyboard.up('Alt');
  await wait(150);
  const n = await js('PP.three.edit.sel.size');
  t.check(n === 8 && (await js('PP.three.edit.mode')) === 'edge', `Alt+클릭: 에지 루프 선택 (${n}개)`);
  await t.shot('loop');

  // 박스 선택: Shift+드래그 (점 모드) — 보이는 점만
  await t.key('1');
  await js('PP.three.edit.selectNone()');
  const [cx, cy] = [650, 480];
  await t.page.keyboard.down('Shift');
  await t.page.mouse.move(cx - 220, cy - 220);
  await t.page.mouse.down();
  await t.page.mouse.move(cx + 220, cy + 160, { steps: 8 });
  await t.page.mouse.up();
  await t.page.keyboard.up('Shift');
  await wait(150);
  const nv = await js('PP.three.edit.sel.size');
  const tot = (await em())[0];
  t.check(nv > 0 && nv < tot, `박스 선택은 보이는 점만 선택 (${nv} / ${tot})`);
  t.check(await js("document.querySelector('.rubber').hidden"), '드래그 후 선택 상자가 사라짐');
  // 박스 버튼 + 면 모드
  await t.key('3');
  await js('PP.three.edit.selectNone()');
  await js("[...document.querySelectorAll('.edit3d .tgl')].find(b=>b.textContent==='박스').click()");
  await t.page.mouse.move(cx - 220, cy - 220);
  await t.page.mouse.down();
  await t.page.mouse.move(cx + 220, cy + 160, { steps: 8 });
  await t.page.mouse.up();
  await wait(150);
  const nf = await js('PP.three.edit.sel.size');
  t.check(nf > 3 && nf < 24, `박스 모드: 드래그만으로 면 선택 (${nf} / 24)`);
  // 박스 모드에서도 시점 회전이 막히지 않는지 (끄면 정상 회전)
  await js("[...document.querySelectorAll('.edit3d .tgl')].find(b=>b.textContent==='박스').click()");
  const p0 = await js('PP.three.gl.camera.position.x');
  await t.page.mouse.move(300, 700); await t.page.mouse.down(); await t.page.mouse.move(380, 700, { steps: 5 }); await t.page.mouse.up();
  t.check(Math.abs((await js('PP.three.gl.camera.position.x')) - p0) > 0.05, '박스 모드를 끄면 드래그로 시점이 돌아감');
};
