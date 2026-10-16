'use strict';
/* 업데이트 알림 UI (GitHub Releases)
 *  - 데스크톱(Electron): main 프로세스의 electron-updater / GitHub API 결과를 받아 안내
 *  - 안드로이드 앱·브라우저: 시작 시 GitHub 최신 릴리스를 조회해 새 버전이 있으면 내려받기 페이지로 안내 */
(function (PP) {
  const api = window.api;
  const REPO = 'Jangwoo0827/paintplus';
  let manual = false;

  if (api && api.onUpdate) {
    api.onUpdate(async (d) => {
      if (d.type === 'none') {
        if (manual) PP.toast('이미 최신 버전입니다 (' + d.version + ')');
        manual = false;
        return;
      }
      if (d.type === 'error') {
        if (manual) PP.ui.alert('업데이트를 확인하지 못했습니다.\n' + d.message);
        manual = false;
        return;
      }
      if (d.type === 'progress') { PP.toast('업데이트 내려받는 중… ' + d.percent + '%', 1500); return; }
      if (d.type === 'available') {
        manual = false;
        const msg = '새 버전 ' + d.version + '을(를) 사용할 수 있습니다.\n' +
          (d.manual ? '릴리스 페이지를 열까요?' : '지금 내려받을까요? (내려받은 뒤 재시작하면 설치됩니다)');
        const ok = await PP.ui.confirm(msg, d.manual ? '페이지 열기' : '내려받기', '업데이트');
        if (!ok) return;
        if (d.manual) api.update.open(d.url);
        else { PP.toast('내려받는 중…'); api.update.download(); }
        return;
      }
      if (d.type === 'ready') {
        const ok = await PP.ui.confirm('버전 ' + d.version + ' 설치 준비가 끝났습니다.\n지금 재시작하여 설치할까요?', '재시작', '업데이트');
        if (ok) api.update.install();
      }
    });
    PP.defCmd('help.update', '업데이트 확인...', '', () => { manual = true; api.update.check(); });
    return;
  }

  // ---------- 안드로이드 앱 / 브라우저 ----------
  const cmp = (a, b) => {
    const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
    return 0;
  };
  async function check(isManual) {
    try {
      const cap = window.Capacitor;
      let cur = PP.APP_VERSION;
      if (cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.getInfo) cur = (await cap.Plugins.App.getInfo()).version;
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('GitHub 응답 ' + res.status);
      const rel = await res.json();
      if (cmp(rel.tag_name, cur) > 0) {
        const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
        const ok = await PP.ui.confirm('새 버전 ' + rel.tag_name.replace(/^v/, '') + '을(를) 사용할 수 있습니다.\n' + (PP.isNative && apk ? 'APK 를 내려받을까요?' : '릴리스 페이지를 열까요?'), '열기', '업데이트');
        if (ok) window.location.href = PP.isNative && apk ? apk.browser_download_url : rel.html_url;
      } else if (isManual) PP.toast('이미 최신 버전입니다 (' + cur + ')');
    } catch (e) {
      if (isManual) PP.ui.alert('업데이트를 확인하지 못했습니다.\n' + (e.message || e));
    }
  }
  PP.APP_VERSION = PP.APP_VERSION || '1.1.0';
  if (PP.isNative) {
    PP.defCmd('help.update', '업데이트 확인...', '', () => check(true));
    setTimeout(() => check(false), 6000);
  }
})(window.PP);
