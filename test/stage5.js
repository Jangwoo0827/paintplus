'use strict';
const fs = require('fs');
const path = require('path');
const { app, clipboard, nativeImage, ClipboardItem } = require('electron');
const { spawn } = require('child_process');

module.exports = async function (t) {
  const { js, wait, dialog } = t;
  const red = [220, 38, 38];
  const blue = [37, 99, 235];
  const fresh = async (w = 600, h = 400, bg = '#ffffff') => {
    await js(`PP.doc.init(${w},${h},${bg ? `"${bg}"` : 'null'})`);
    await js('PP.vp.fit(1)');
    await t.frame();
  };
  const fillRect = (x, y, w, h, color) =>
    js(`(()=>{const l=PP.doc.active();l.ctx.fillStyle='${color}';l.ctx.fillRect(${x},${y},${w},${h});PP.doc.touch(l)})()`);

  // ---------- 프로젝트 파일(.paintplus) ----------
  await fresh();
  await fillRect(50, 50, 100, 100, '#dc2626');
  await js("PP.layers.add('파란 레이어')");
  await fillRect(100, 100, 100, 100, '#2563eb');
  const lid = await js('PP.doc.active().id');
  await js(`PP.layers.setProp(${lid},'opacity',0.6,'x')`);
  await js(`PP.layers.setProp(${lid},'blend','multiply','x')`);
  await js("PP.layers.add('잠긴 레이어')");
  await js(`PP.layers.setProp(PP.doc.active().id,'locked',true,'x')`);
  await js(`PP.layers.setProp(PP.doc.layers[1].id,'visible',false,'x')`);
  const projPath = path.join(t.userData, 'proj.paintplus');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: projPath });
  await js('PP.files.saveAs()');
  await wait(800);
  t.check(fs.existsSync(projPath), '.paintplus 파일 저장');
  const j = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  t.check(j.app === 'paintplus' && j.layers.length === 3 && j.width === 600, '프로젝트 JSON 구조 (레이어 3개)');
  t.check(!(await js('PP.history.isDirty()')) && (await js('PP.doc.fileType')) === 'paintplus', '저장 후 파일 형식 paintplus');

  await fresh(100, 100);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projPath] });
  await js('PP.files.open()');
  await wait(800);
  const info = await js('PP.doc.layers.map(l=>[l.name,l.visible,l.locked,Math.round(l.opacity*100),l.blend].join("|")).join(" ; ")');
  t.check(await js('PP.doc.width===600 && PP.doc.layers.length===3'), '프로젝트 열기: 크기와 레이어 수 복원');
  t.check(info === '배경|true|false|100|source-over ; 파란 레이어|false|false|60|multiply ; 잠긴 레이어|true|true|100|source-over', '레이어 이름/보이기/잠금/불투명도/블렌드 복원: ' + info);
  t.check(t.near(await t.px(75, 75), red, 8), '배경 레이어 픽셀 복원');
  await js('PP.layers.setActive(PP.doc.layers[1].id)');
  t.check(t.near(await t.px(150, 150, 'layer'), blue, 8), '두 번째 레이어 픽셀 복원');

  // 이미지로 저장 시 병합
  const pngPath = path.join(t.userData, 'flat.png');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: pngPath });
  await js('PP.files.saveAs()');
  await wait(600);
  t.check(fs.existsSync(pngPath), '다중 레이어 문서를 PNG 로 저장(병합)');
  for (const [ext, mime] of [['jpg', 'ffd8'], ['webp', 'RIFF']]) {
    const p = path.join(t.userData, 'flat.' + ext);
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    await js('PP.files.saveAs()');
    await wait(600);
    const head = fs.readFileSync(p).slice(0, 4);
    t.check(ext === 'jpg' ? head.toString('hex').startsWith(mime) : head.toString() === mime, `${ext.toUpperCase()} 로 저장 (파일 시그니처 확인)`);
  }

  // ---------- 시스템 클립보드에서 붙여넣기 (스크린샷 가져오기 시나리오) ----------
  await fresh(600, 400, null);
  const dataUrl = await js(`(()=>{const c=PP.makeCanvas(120,80);const x=c.getContext('2d');x.fillStyle='#2563eb';x.fillRect(0,0,120,80);x.fillStyle='#fff';x.fillRect(10,10,20,20);return c.toDataURL('image/png')})()`);
  const png = nativeImage.createFromDataURL(dataUrl).toPNG();
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
  await t.key('V', ['control']);
  await wait(600);
  t.check(!!(await js('PP.sel.float')), 'Ctrl+V 로 시스템 클립보드 이미지를 붙여넣음');
  t.check((await js('PP.sel.float.nw')) === 120 && (await js('PP.sel.float.nh')) === 80, '붙여넣은 이미지 크기 120×80');
  await t.key('Return');
  const pc = await js('PP.history.stack[PP.history.stack.length-1].name');
  t.check(pc === '붙여넣기', '히스토리에 "붙여넣기" 기록');
  t.check((await t.px(5, 5))[2] > 200, '붙여넣은 내용이 레이어에 반영됨');
  await js('PP.sel.setRect(0,0,120,80)');
  await js('PP.clip.copy()');
  await wait(500);
  const items = await clipboard.read();
  t.check(items.some((i) => i.types.includes('image/png')), '복사하면 시스템 클립보드에 PNG 이미지가 들어감');

  // 큰 이미지 붙여넣기 → 캔버스 확장 질문
  await fresh(100, 100);
  const big = await js(`(()=>{const c=PP.makeCanvas(300,200);c.getContext('2d').fillStyle='#16a34a';c.getContext('2d').fillRect(0,0,300,200);return c.toDataURL('image/png')})()`);
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([nativeImage.createFromDataURL(big).toPNG()], { type: 'image/png' }) })]);
  js('void PP.clip.paste()');
  await wait(700);
  t.check(await js("!!document.querySelector('.modal')"), '캔버스보다 큰 이미지: 확장 여부를 묻는 대화상자');
  await js("document.querySelector('.modal .mbtn.primary').click()");
  await wait(400);
  t.check(await js('PP.doc.width===300 && PP.doc.height===200'), '확장을 선택하면 캔버스가 300×200 으로 늘어남');
  await js('PP.sel.deselect()');

  // ---------- 파일 드래그 & 드롭 ----------
  await fresh(100, 100);
  await js(`(async()=>{
    const c=PP.makeCanvas(64,48);const x=c.getContext('2d');x.fillStyle='#f59e0b';x.fillRect(0,0,64,48);
    const bytes=await PP.canvasToBytes(c,'image/png');
    const dt=new DataTransfer();dt.items.add(new File([bytes],'dropped.png',{type:'image/png'}));
    document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
  })()`);
  await wait(700);
  t.check(await js('PP.doc.width===64 && PP.doc.height===48 && PP.doc.name==="dropped.png"'), '창에 파일을 드롭하면 열림');

  // ---------- 자동 임시 저장 / 복구 ----------
  await fresh(300, 200);
  await fillRect(10, 10, 50, 50, '#dc2626');
  await js("PP.layers.add('임시')");
  await fillRect(70, 70, 50, 50, '#2563eb');
  await js('PP.autosave.tick()');
  await wait(900);
  const rec = path.join(t.userData, 'recovery.paintplus');
  t.check(fs.existsSync(rec) && fs.statSync(rec).size > 100, '자동 저장: 복구 파일이 만들어짐');
  await fresh(50, 50);
  js('void PP.autosave.offerRecovery()');
  await wait(600);
  t.check(await js("!!document.querySelector('.modal')"), '복구 확인 대화상자가 뜸');
  await js("document.querySelector('.modal .mbtn.primary').click()");
  await wait(900);
  t.check(await js('PP.doc.width===300 && PP.doc.layers.length===2 && PP.history.isDirty()'), '복구: 레이어까지 복원되고 "저장 안 됨" 상태');
  t.check(t.near(await t.px(90, 90, 'layer'), blue, 8), '복구된 레이어 내용 확인');

  // ---------- 테마 ----------
  await t.key('T', ['control', 'shift']);
  t.check((await js("document.documentElement.getAttribute('data-theme')")) === 'light', 'Ctrl+Shift+T 로 라이트 테마');
  await js('PP.vp.fit(1)');
  await t.shot('light-theme');
  await t.key('T', ['control', 'shift']);
  t.check((await js("document.documentElement.getAttribute('data-theme')")) === 'dark', '다시 다크 테마');

  // ---------- 메뉴바 ----------
  await js("document.querySelectorAll('.menu-top')[0].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  await wait(100);
  const items1 = await js("[...document.querySelectorAll('.menu-drop .menu-item')].map(e=>e.textContent).join(' | ')");
  t.check(items1.includes('새로 만들기') && items1.includes('다른 이름으로 저장') && items1.includes('Ctrl+S'), '파일 메뉴 항목/단축키 표시: ' + items1.slice(0, 80));
  await t.shot('menu');
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait(100);
  t.check(!(await js("!!document.querySelector('.menu-drop')")), 'Esc 로 메뉴 닫힘');
  const names = await js("[...document.querySelectorAll('.menu-top')].map(e=>e.textContent).join(',')");
  t.check(names === '파일,편집,보기,이미지,레이어,필터,도움말', '메뉴바: ' + names);
  await t.key('F1');
  await wait(200);
  t.check(await js("document.querySelector('.modal h3')?.textContent==='단축키'"), 'F1 단축키 도움말');
  await t.shot('help');
  await js("document.querySelector('.modal .mbtn.primary').click()");

  // ---------- 창 크기/위치 기억 ----------
  t.win.setBounds({ x: 40, y: 30, width: 1111, height: 777 });
  await wait(900);
  const st = JSON.parse(fs.readFileSync(path.join(t.userData, 'window-state.json'), 'utf8'));
  t.check(Math.abs(st.width - 1111) <= 2 && Math.abs(st.height - 777) <= 2 && st.x === 40 && st.y === 30, `창 크기/위치가 저장됨 ${JSON.stringify(st)}`);

  // ---------- 단일 인스턴스 ----------
  await fresh(100, 100);
  const argvFile = path.join(t.userData, 'flat.png');
  let got = null;
  app.once('second-instance', (_e, argv) => { got = argv; });
  t.win.minimize();
  const root = path.join(__dirname, '..');
  const child = spawn(process.execPath, [root, `--user-data-dir=${t.userData}`, argvFile], { stdio: 'ignore' });
  const exited = await new Promise((res) => { child.on('exit', (c) => res(c)); setTimeout(() => res('timeout'), 20000); });
  t.check(exited === 0, `두 번째 실행은 즉시 종료됨 (exit=${exited})`);
  await wait(800);
  t.check(!!got, '첫 번째 인스턴스가 second-instance 이벤트를 받음');
  t.check(!t.win.isMinimized(), '기존 창이 복원되어 앞으로 옴');
  t.check(await js('PP.doc.name==="flat.png"'), '두 번째 실행에 넘긴 파일이 기존 창에서 열림');
};
