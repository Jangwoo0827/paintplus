'use strict';
/* 업데이트 알림 UI (GitHub Releases)
 *  - 데스크톱(Electron): main 프로세스의 electron-updater / GitHub API 결과를 받아 안내
 *  - 안드로이드 앱: GitHub 최신 릴리스를 조회해 앱 안에서 APK 를 받아 바로 설치 (AppUpdaterPlugin, SuperDialer 방식)
 *  - 브라우저: 릴리스 페이지로 안내 */
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
  const LAST_KEY = 'pp.upd.last', SNOOZE_KEY = 'pp.upd.snooze';
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 저장소를 쓸 수 없어도 무시 */ } },
  };
  const updater = () => { const c = window.Capacitor; return c && (c.Plugins && c.Plugins.AppUpdater || (c.registerPlugin && c.registerPlugin('AppUpdater'))); };
  let busy = false, listening = false;

  /** 앱 안에서 받아 설치 (안드로이드 앱 전용): 권한 확인 → 다운로드 → 시스템 설치기 */
  async function startUpdate(ver, apkUrl) {
    const up = updater();
    if (!up || busy) return;
    busy = true;
    try {
      if (!listening) {
        listening = true;
        up.addListener('progress', (e) => { if (busy) PP.toast(e.percent >= 0 ? '업데이트 내려받는 중… ' + e.percent + '%' : '업데이트 내려받는 중…', 1500); });
        up.addListener('installResult', (e) => { busy = false; if (e.ok) PP.toast('업데이트를 설치했습니다'); else PP.ui.alert(e.message || '설치하지 못했습니다.', '업데이트'); });
      }
      if (!(await up.canInstall()).allowed) {
        const go = await PP.ui.confirm('앱이 직접 업데이트를 설치하려면 “이 출처 허용” 권한이 필요합니다.\n설정 화면에서 허용한 뒤 돌아와 다시 업데이트해 주세요.', '설정 열기', '권한 필요');
        busy = false;
        if (go) await up.openInstallSettings();
        return;
      }
      PP.toast('업데이트를 내려받습니다…');
      await up.download({ url: apkUrl, version: ver });
      await up.cleanUp({ keepVersion: ver });
      PP.toast('설치 화면으로 넘어갑니다…');
      await up.install({ version: ver });
    } catch (e) {
      busy = false;
      if (e && e.message === 'NOT_ALLOWED') { PP.ui.alert('설치 권한이 없습니다. 설정에서 “이 출처 허용”을 켜 주세요.', '업데이트'); return; }
      PP.ui.alert('업데이트하지 못했습니다.\n' + ((e && e.message) || e), '업데이트');
    }
  }

  async function check(isManual) {
    try {
      const cap = window.Capacitor;
      let cur = PP.APP_VERSION;
      if (cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.getInfo) cur = (await cap.Plugins.App.getInfo()).version;
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('GitHub 응답 ' + res.status);
      const rel = await res.json();
      const ver = rel.tag_name.replace(/^v/, '');
      if (cmp(rel.tag_name, cur) > 0) {
        // 자동 확인에서 "나중에"를 누른 버전은 하루 동안 다시 묻지 않는다
        const sn = (store.get(SNOOZE_KEY) || '').split('|');
        if (!isManual && sn[0] === ver && Date.now() - +sn[1] < 24 * 3600 * 1000) return;
        const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
        const inApp = PP.isNative && apk && updater();
        const notes = (rel.body || '').split('\n## 다운로드')[0].trim().slice(0, 500);
        const ok = await PP.ui.confirm('새 버전 ' + ver + '을(를) 사용할 수 있습니다.' + (notes ? '\n\n' + notes : '') + '\n\n' + (inApp ? '지금 앱 안에서 내려받아 설치할까요?' : PP.isNative && apk ? 'APK 를 내려받을까요?' : '릴리스 페이지를 열까요?'), inApp ? '업데이트' : '열기', '새 버전');
        if (!ok) { store.set(SNOOZE_KEY, ver + '|' + Date.now()); return; }
        if (inApp) startUpdate(ver, apk.browser_download_url);
        else window.location.href = PP.isNative && apk ? apk.browser_download_url : rel.html_url;
      } else if (isManual) PP.toast('이미 최신 버전입니다 (' + cur + ')');
    } catch (e) {
      if (isManual) PP.ui.alert('업데이트를 확인하지 못했습니다.\n' + (e.message || e));
    }
  }
  if (PP.isNative) {
    PP.defCmd('help.update', '업데이트 확인...', '', () => check(true));
    // 앱을 열 때 1시간에 한 번만 조용히 확인
    setTimeout(() => {
      if (Date.now() - (+store.get(LAST_KEY) || 0) < 3600 * 1000) return;
      store.set(LAST_KEY, String(Date.now()));
      check(false);
    }, 6000);
  }
})(window.PP);
