'use strict';
/* 메뉴/대화상자/단축키 등 사용자 흐름 점검 */
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const { js, wait, dialog } = t;
  const red = [220, 38, 38];

  const menuClick = async (top, label) => {
    await js(`document.querySelectorAll('.menu-top')[${top}].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
    await wait(80);
    const ok = await js(`(()=>{const it=[...document.querySelectorAll('.menu-drop .menu-item')].find(e=>e.textContent.startsWith(${JSON.stringify(label)}));if(!it)return false;it.click();return true})()`);
    await wait(150);
    return ok;
  };
  const modalOk = async () => {
    await js("document.querySelector('.modal .mbtn.primary').click()");
    await wait(200);
  };
  const fresh = async (w = 600, h = 400, bg = '#ffffff') => {
    await js(`PP.doc.init(${w},${h},${bg ? `"${bg}"` : 'null'})`);
    await js('PP.vp.fit(1)');
    await t.frame();
  };

  // ---------- BMP 열기 ----------
  const bmp = Buffer.alloc(54 + 4 * 4 * 3);
  bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(4, 18); bmp.writeInt32LE(4, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(48, 34);
  for (let i = 0; i < 16; i++) { bmp[54 + i * 3] = 0x26; bmp[55 + i * 3] = 0x26; bmp[56 + i * 3] = 0xdc; } // BGR = 220,38,38
  const bmpPath = path.join(t.userData, 'red.bmp');
  fs.writeFileSync(bmpPath, bmp);
  await fresh(50, 50);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [bmpPath] });
  await js('PP.files.open()');
  await wait(600);
  t.check(await js('PP.doc.width===4 && PP.doc.height===4'), 'BMP 파일 열기');
  t.check(t.near(await t.px(1, 1), red, 6), 'BMP 픽셀 색상 읽힘');

  // ---------- 메뉴: 새로 만들기(투명) ----------
  await fresh(100, 100);
  t.check(await menuClick(0, '새로 만들기'), '파일 > 새로 만들기 메뉴 항목 실행');
  await js("document.querySelectorAll('.modal input[type=number]')[0].value=320; document.querySelectorAll('.modal input[type=number]')[1].value=240; document.querySelector('.modal select').value='transparent'");
  await modalOk();
  t.check(await js('PP.doc.width===320 && PP.doc.height===240') && (await t.px(5, 5))[3] === 0, '새 문서: 320×240 투명 배경');

  // ---------- 메뉴: 이미지 > 캔버스 크기 / 이미지 크기 ----------
  await js("PP.doc.layers[0].ctx.fillStyle='#dc2626';PP.doc.layers[0].ctx.fillRect(0,0,320,240);PP.doc.touch(PP.doc.layers[0])");
  t.check(await menuClick(3, '캔버스 크기'), '이미지 > 캔버스 크기 메뉴');
  await js("(()=>{const n=document.querySelectorAll('.modal input[type=number]');n[0].value=400;n[1].value=300;document.querySelectorAll('.anchor-grid button')[0].click();})()");
  await modalOk();
  t.check(await js('PP.doc.width===400 && PP.doc.height===300') && t.near(await t.px(10, 10), red, 6) && (await t.px(390, 290))[3] === 0, '캔버스 확장(왼쪽 위 기준, 새 영역 투명)');
  t.check(await menuClick(3, '이미지 크기'), '이미지 > 이미지 크기 조절 메뉴');
  await js("(()=>{const s=document.querySelector('.modal select');s.value='pct';s.dispatchEvent(new Event('change'));const n=document.querySelectorAll('.modal input[type=number]');n[0].value=50;n[0].dispatchEvent(new Event('input'));})()");
  await modalOk();
  t.check(await js('PP.doc.width===200 && PP.doc.height===150'), '이미지 크기를 50%로 → 200×150');
  t.check(await menuClick(3, '시계 방향 90'), '회전 메뉴 항목');
  t.check(await js('PP.doc.width===150 && PP.doc.height===200'), '90° 회전 후 150×200');

  // ---------- 편집 메뉴 활성/비활성 ----------
  await fresh();
  await js("document.querySelectorAll('.menu-top')[1].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  await wait(80);
  const dis = await js("[...document.querySelectorAll('.menu-drop .menu-item.disabled')].map(e=>e.firstChild.textContent).join(',')");
  t.check(dis.includes('실행 취소') && dis.includes('다시 실행') && dis.includes('잘라내기'), '편집 메뉴: 할 수 없는 항목은 비활성 (' + dis + ')');
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");

  // ---------- 우클릭으로 배경색 그리기 ----------
  await js("PP.selectTool('pencil'); PP.opts('pencil').size=8; PP.setColor('fg','#000000'); PP.setColor('bg','#16a34a')");
  await t.drag([[100, 100], [300, 100]], { button: 'right' });
  t.check(t.near(await t.px(200, 100), [22, 163, 74], 10), '우클릭 드래그는 배경색으로 그려짐');

  // ---------- Alt+클릭 스포이드 ----------
  await t.click(200, 100, { modifiers: ['alt'] });
  t.check((await js('PP.state.fg')) === '#16a34a', 'Alt+클릭으로 임시 스포이드(전경색 추출)');

  // ---------- [ ] 크기 키 ----------
  await js("PP.selectTool('brush'); PP.opts('brush').size=40");
  await t.key(']');
  const big = await js("PP.opts('brush').size");
  await t.key('[');
  await t.key('[');
  const small = await js("PP.opts('brush').size");
  t.check(big > 40 && small < big, `] 키로 브러시 키우고 [ 키로 줄임 (40 → ${big} → ${small})`);

  // ---------- 모두 선택/해제 ----------
  await t.key('A', ['control']);
  t.check(await js('PP.sel.bounds().w===600 && PP.sel.bounds().h===400'), 'Ctrl+A 모두 선택');
  await t.key('D', ['control']);
  t.check(!(await js('PP.sel.hasAny()')), 'Ctrl+D 선택 해제');

  // ---------- 손바닥/돋보기 도구 ----------
  await t.key('Z');
  const z0 = await js('PP.vp.zoom');
  await t.click(300, 200);
  t.check((await js('PP.vp.zoom')) > z0, '돋보기 도구: 클릭하면 확대');
  await t.click(300, 200, { button: 'right' });
  t.check((await js('PP.vp.zoom')) <= z0 + 1e-6, '돋보기 도구: 우클릭하면 축소');
  await t.key('H');
  await js('PP.vp.setZoom(2)');
  const o0 = await js('PP.vp.ox');
  await t.drag([[300, 200], [200, 200]]);
  t.check((await js('PP.vp.ox')) < o0 - 20, '손바닥 도구로 드래그하여 이동');

  // ---------- 레이어 패널 UI: 이름 변경, 불투명도 ----------
  await fresh();
  await js('PP.layers.add()');
  await js("(()=>{const n=document.querySelector('.layer-row.active .lname');n.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})()");
  await wait(80);
  await js("(()=>{const i=document.querySelector('.layer-row .lname-input');i.value='스케치';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
  await wait(120);
  t.check((await js('PP.doc.active().name')) === '스케치', '더블클릭으로 레이어 이름 변경');
  await js("(()=>{const r=document.querySelector('.layer-props input[type=range]');r.dispatchEvent(new PointerEvent('pointerdown'));r.value=40;r.dispatchEvent(new Event('input'));r.dispatchEvent(new Event('change'));})()");
  t.check(Math.abs((await js('PP.doc.active().opacity')) - 0.4) < 0.01, '레이어 패널 슬라이더로 불투명도 40%');
  await js('PP.history.undo()');
  t.check((await js('PP.doc.active().opacity')) === 1, '불투명도 변경도 실행 취소됨');
  await js("document.querySelector('.layer-props select').value='multiply'; document.querySelector('.layer-props select').dispatchEvent(new Event('change'))");
  t.check((await js('PP.doc.active().blend')) === 'multiply', '블렌드 모드 선택');

  // ---------- 눈금/격자 설정 ----------
  t.check(await menuClick(2, '격자 간격'), '보기 > 격자 간격 메뉴');
  await js("document.querySelector('.modal input[type=number]').value=25");
  await modalOk();
  t.check((await js('PP.state.grid.size')) === 25 && (await js('PP.state.grid.show')), '격자 간격 25px 로 변경하고 격자 표시');
  await t.shot('final-ui');
  await js("PP.setGrid({show:false})");

  // ---------- 도움말 정보 ----------
  t.check(await menuClick(6, '그림판+ 정보'), '도움말 > 정보');
  t.check(await js("document.querySelector('.modal h3').textContent.includes('정보')"), '정보 대화상자 표시');
  await modalOk();
};
