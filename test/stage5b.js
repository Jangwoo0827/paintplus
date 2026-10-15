'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

module.exports = async function (t) {
  const { js, wait } = t;
  app.removeAllListeners('window-all-closed');
  const rec = path.join(t.userData, 'recovery.paintplus');
  fs.writeFileSync(rec, 'x');
  await js('PP.doc.init(200,200,"#ffffff")');
  await js("PP.selectTool('pencil'); PP.opts('pencil').size=10");
  await t.drag([[20, 20], [150, 150]]);
  t.check(await js('PP.history.isDirty()'), '그린 뒤에는 변경됨 상태');
  const title = await js('document.title');
  t.check(title.startsWith('● '), '제목 표시줄에 변경 표시: ' + title);

  // 창 닫기 → 저장 확인 → 취소
  t.win.close();
  await wait(500);
  t.check(await js("document.querySelector('.modal h3')?.textContent==='변경 사항 저장'"), '닫기: 저장 확인 대화상자가 뜸');
  t.check(!t.win.isDestroyed(), '대화상자가 떠 있는 동안 창은 유지');
  await js("[...document.querySelectorAll('.modal .mbtn')].find(b=>b.textContent==='취소').click()");
  await wait(300);
  t.check(!t.win.isDestroyed() && !(await js("!!document.querySelector('.modal')")), '취소하면 창이 닫히지 않음');

  // 저장 안 함 → 종료
  let closed = false;
  t.win.once('closed', () => { closed = true; });
  t.win.close();
  await wait(400);
  await js("[...document.querySelectorAll('.modal .mbtn')].find(b=>b.textContent==='저장 안 함').click()");
  await wait(800);
  t.check(closed, '"저장 안 함"을 누르면 창이 닫힘');
  t.check(!fs.existsSync(rec), '정상 종료 시 복구 파일이 삭제됨');
};
