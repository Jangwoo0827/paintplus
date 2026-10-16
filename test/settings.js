'use strict';
module.exports = async function (t) {
  const { js, wait } = t;
  await t.key(',', ['control']);
  await wait(300);
  t.check(await js("document.querySelector('.modal h3')?.textContent==='설정'"), 'Ctrl+, 로 설정 창 열림');
  const txt = await js("document.querySelector('.modal').innerText");
  t.check(txt.includes('그림판+ ') && txt.includes('패치 노트') && txt.includes('v1.1.0') && txt.includes('v1.1.1'), '버전과 패치 노트가 표시됨');
  await js("(()=>{const s=document.querySelector('.modal select');s.value='light';s.dispatchEvent(new Event('change'))})()");
  t.check((await js("document.documentElement.getAttribute('data-theme')")) === 'light', '설정에서 테마 변경');
  await js("document.querySelector('.modal .mbtn.primary').click()");
  await js("PP.setTheme('dark')");
  await t.shot('settings');
};
