'use strict';
/*
 * GitHub Release 를 만들고 파일을 올린다 (gh CLI 없이 REST API 사용).
 *   node scripts/release.js [--notes 파일.md]      (태그 = v<package.json version>)
 * 올리는 파일: dist/ 의 설치 파일/portable/blockmap/latest.yml + dist/PaintPlus-<버전>.apk
 * 토큰은 git credential helper 에서 읽는다(출력하지 않음).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkg = require('../package.json');
const OWNER = 'Jangwoo0827', REPO = 'paintplus';
const tag = 'v' + pkg.version;
const dist = path.join(__dirname, '..', 'dist');

function token() {
  const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
  const m = out.match(/^password=(.*)$/m);
  if (!m) throw new Error('GitHub 토큰을 찾을 수 없습니다');
  return m[1].trim();
}

async function api(method, url, body, tk, extraHeaders = {}) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    method,
    headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.github+json', 'User-Agent': 'paintplus-release', ...extraHeaders },
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* 본문 없음 */ }
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return { status: res.status, json };
}

(async () => {
  const tk = token();
  const notesArg = process.argv.indexOf('--notes');
  const notes = notesArg > 0 ? fs.readFileSync(process.argv[notesArg + 1], 'utf8') : `${tag}`;
  const files = [
    `PaintPlus-Setup-${pkg.version}.exe`, `PaintPlus-Setup-${pkg.version}.exe.blockmap`, 'latest.yml',
    `PaintPlus-Portable-${pkg.version}.exe`, `PaintPlus-${pkg.version}.apk`,
  ].filter((f) => fs.existsSync(path.join(dist, f)));
  if (!files.length) throw new Error('올릴 파일이 dist/ 에 없습니다');

  // 기존 릴리스가 있으면 재사용(같은 이름 에셋은 삭제 후 다시 올림)
  let rel = (await api('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`, undefined, tk)).json;
  if (!rel || !rel.id) {
    rel = (await api('POST', `/repos/${OWNER}/${REPO}/releases`, JSON.stringify({ tag_name: tag, name: `그림판+ ${pkg.version}`, body: notes, draft: false, prerelease: false }), tk, { 'Content-Type': 'application/json' })).json;
    console.log('릴리스 생성:', rel.html_url);
  } else {
    await api('PATCH', `/repos/${OWNER}/${REPO}/releases/${rel.id}`, JSON.stringify({ body: notes }), tk, { 'Content-Type': 'application/json' });
    console.log('기존 릴리스 사용:', rel.html_url);
  }
  for (const f of files) {
    const old = (rel.assets || []).find((a) => a.name === f);
    if (old) await api('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${old.id}`, undefined, tk);
    const data = fs.readFileSync(path.join(dist, f));
    const type = f.endsWith('.apk') ? 'application/vnd.android.package-archive' : f.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';
    const up = rel.upload_url.replace('{?name,label}', '') + '?name=' + encodeURIComponent(f);
    const r = await api('POST', up, data, tk, { 'Content-Type': type, 'Content-Length': String(data.length) });
    console.log(`  올림: ${f} (${(data.length / 1048576).toFixed(1)} MB) → ${r.json && r.json.browser_download_url}`);
  }
  console.log('완료:', rel.html_url);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
