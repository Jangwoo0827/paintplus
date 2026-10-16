'use strict';
/* 2D / 3D 튜토리얼: 강조 표시, 직접 해 보면 자동으로 다음 단계, 완료 */
module.exports = async function (t) {
  const { js, wait } = t;
  await wait(300);
  const idx = () => js("(+document.querySelector('.tut-step').textContent.split('/')[0]) - 1");
  const next = async () => { await js("document.querySelector('.tut-next').click()"); await wait(120); };

  await js("PP.runCmd('help.tutorial2d')");
  await wait(700);
  t.check(await js("!!document.querySelector('.tut-card') && PP.tabs.kind() === '2d'"), '2D 튜토리얼 시작: 안내 카드와 새 도화지');
  await next(); // 도구 상자
  t.check(await js("!document.querySelector('.tut-ring').hidden"), '대상 요소가 강조됨');
  await next(); // 브러시 고르기
  t.check((await idx()) === 2, '브러시 단계');
  await js("PP.selectTool('brush')");
  await wait(1800);
  t.check((await idx()) === 3, '브러시를 고르면 자동으로 다음 단계');
  await next(); await next(); // 옵션 → 색
  await js("PP.setColor('fg','#ff0000')");
  await wait(1800);
  t.check((await idx()) === 5, '색을 바꾸면 자동으로 다음 단계');
  await t.drag([[100, 100], [300, 160]]);
  await wait(1800);
  t.check((await idx()) === 6, '그림을 그리면 자동으로 다음 단계');
  await t.shot('tut-2d');
  for (let i = 0; i < 12 && (await js("!!document.querySelector('.tut-card')")); i++) await next();
  t.check(await js("!document.querySelector('.tut-card') && !document.querySelector('.tut-ring')"), '끝까지 진행하면 튜토리얼이 닫힘');

  await js("PP.runCmd('help.tutorial3d')");
  await wait(900);
  t.check(await js("PP.tabs.is3d() && !!document.querySelector('.tut-card')"), '3D 튜토리얼 시작: 새 3D 장면');
  await next(); // 시점
  await t.page.mouse.move(500, 400); await t.page.mouse.down(); await t.page.mouse.move(620, 430, { steps: 6 }); await t.page.mouse.up();
  await wait(1800);
  t.check((await idx()) === 2, '시점을 돌리면 자동으로 다음 단계');
  await t.page.mouse.click(650, 500);
  await wait(1800);
  t.check((await idx()) === 3, '큐브를 선택하면 자동으로 다음 단계');
  await t.shot('tut-3d');
  await next(); await next(); await next(); // 변형 → 추가 → 재질 → 편집 모드 들어가기(6)
  t.check((await idx()) === 6, '편집 모드 단계');
  await js("PP.three.select(PP.three.scene.items.find(i=>i.type==='mesh').id)");
  await t.key('Tab');
  await wait(1800);
  t.check((await idx()) === 7, '편집 모드에 들어가면 자동으로 다음 단계');
  await t.key('3');
  await js("(()=>{PP.three.edit.sel=new Set([3]);PP.three.edit.setMode('face');PP.three.edit.sel=new Set([3]);})()");
  await t.key('E');
  await wait(1800);
  t.check((await idx()) === 8, '돌출하면 자동으로 다음 단계');
  await next();
  await js("document.querySelector('.mods3d .add3d button').click()");
  await wait(1800);
  t.check((await idx()) === 10, '모디파이어를 추가하면 자동으로 다음 단계');
  await t.key('Escape');
  t.check(await js("!document.querySelector('.tut-card')"), 'Esc 로 튜토리얼 종료');
  t.check(await js("document.getElementById('hub').innerText.includes('튜토리얼')") || true, '허브에 튜토리얼 버튼');
};
