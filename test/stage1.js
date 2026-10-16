'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const { js, wait, dialog } = t;
  await t.shot('initial');

  t.check(await js('PP.doc.width===1280 && PP.doc.height===720'), '기본 문서 1280×720');
  t.check(await js('PP.state.tool') === 'brush', '기본 도구: 브러시');

  // 연필: 빨강
  await t.key('P');
  t.check(await js('PP.state.tool') === 'pencil', 'P 키로 연필 선택');
  await js("PP.setColor('fg','#e11d48')");
  await js("PP.opts('pencil').size=6");
  await t.drag([[100, 100], [300, 140], [500, 100], [700, 180]]);
  t.check(t.near(await t.px(300, 140), [225, 29, 72]), '연필 선 위 픽셀이 빨강');
  t.check(t.near(await t.px(300, 300), [255, 255, 255]), '선 밖은 흰색 유지');

  // 브러시(부드러운): 파랑
  await t.key('B');
  await js("PP.setColor('fg','#2563eb')");
  await t.drag([[100, 300], [400, 360], [800, 300]]);
  const bp = await t.px(400, 360);
  t.check(bp && bp[2] > 180 && bp[0] < 120, '브러시 선 중앙이 파랑');
  await t.shot('after-drawing');

  // 지우개
  await t.key('E');
  await t.drag([[250, 100], [350, 160]]);
  const ep = await t.px(300, 130);
  t.check(ep && ep[3] === 0, '지우개로 지운 곳은 투명(알파 0)');

  // 스포이드
  await t.key('I');
  await t.click(100, 100);
  t.check(await js("PP.state.fg") === '#e11d48', '스포이드가 연필 색(#e11d48)을 추출');

  // 색상 입력(HEX)
  await js("document.querySelector('#panel-color .hex').value='#00ff00'; document.querySelector('#panel-color .hex').dispatchEvent(new Event('input'))");
  t.check(await js("PP.state.fg") === '#00ff00', 'HEX 입력으로 전경색 변경');
  await t.key('X');
  t.check(await js("PP.state.bg") === '#00ff00', 'X 키로 전경/배경색 교체');

  // 확대/축소 (휠)
  const z0 = await js('PP.vp.zoom');
  const [cx, cy] = await t.docToClient(640, 360);
  await t.wheel(cx, cy, 240);
  await t.frame();
  t.check((await js('PP.vp.zoom')) !== z0, '마우스 휠로 확대/축소 (배율 변경됨)');

  // 저장(PNG) → 열기
  const out = path.join(t.userData, 'test-out.png');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: out });
  await js('PP.files.saveAs()');
  await wait(600);
  t.check(fs.existsSync(out) && fs.readFileSync(out).slice(1, 4).toString() === 'PNG', 'PNG 파일 저장');
  t.check(!(await js('PP.history.isDirty()')), '저장 후 변경 없음 표시');

  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [out] });
  await js('PP.files.open()');
  await wait(600);
  t.check(await js('PP.doc.width===1280 && PP.doc.height===720'), '저장한 PNG를 다시 열면 크기 유지');
  t.check(t.near(await t.px(100, 100), [225, 29, 72], 30), '다시 연 이미지의 연필 선 색 유지');
  t.check((await t.px(300, 130))[3] === 0, '다시 연 이미지의 지워진 곳은 투명 유지');
  await t.shot('reopened');

  // 새로 만들기
  js('void PP.files.newDoc()');
  await wait(200);
  await js("document.querySelectorAll('.modal input[type=number]')[0].value=400; document.querySelectorAll('.modal input[type=number]')[1].value=300;");
  await js("document.querySelector('.modal .mbtn.primary').click()");
  await wait(200);
  t.check(await js('PP.doc.width===400 && PP.doc.height===300'), '새로 만들기 400×300');
};
