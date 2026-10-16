'use strict';
/*
 * 렌더러를 localhost 로 서비스하는 정적 서버.
 *   npm run serve            → http://localhost:5173
 *   PORT=8080 npm run serve  → 포트 변경
 * 브라우저(PC/휴대폰)에서 웹 버전을 열어 보거나, 자동 테스트(test/web.js)가 이 서버를 사용한다.
 * 같은 와이파이의 휴대폰에서 열려면 HOST=0.0.0.0 으로 실행하고 http://<PC주소>:5173 으로 접속(단, 휴대폰은 https 가 아니면 일부 기능(클립보드)이 제한됨).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

function start(port = Number(process.env.PORT) || 5173, host = process.env.HOST || '127.0.0.1') {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

module.exports = { start };

if (require.main === module) {
  start().then((s) => console.log(`그림판+ 웹 버전: http://localhost:${s.address().port}  (Ctrl+C 로 종료)`));
}
