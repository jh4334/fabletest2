// 서비스워커 캐시 버전 자동 범프
// 사용법: npm run bump  (또는 node tools/bump-sw.js)
//
// 게임 자산(index.html·src/*.js·manifest·icons)의 내용 해시로 sw.js의 CACHE
// 버전을 계산한다. 자산이 바뀌면 해시가 바뀌고, 해시가 바뀌면 클라이언트가
// 새 서비스워커를 설치하며 구 캐시를 지운다 — "배포했는데 옛 버전이 보이는"
// 사고를 원천 차단한다. validate.js가 해시 일치를 검사하므로, 자산을 고치고
// 이 스크립트를 안 돌리면 검증(и CI)이 실패한다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PREFIX = 'ai-ethics-adventure-';

// 캐시 버전에 반영할 자산 — sw.js의 ASSETS 목록과 같은 파일들
function assetFiles() {
  const files = ['index.html', 'manifest.webmanifest'];
  for (const f of fs.readdirSync(path.join(ROOT, 'src'))) if (f.endsWith('.js')) files.push('src/' + f);
  for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) if (f.endsWith('.png')) files.push('icons/' + f);
  return files.sort();
}

function computeSwHash() {
  const h = crypto.createHash('sha1');
  for (const f of assetFiles()) {
    h.update(f);
    h.update(fs.readFileSync(path.join(ROOT, f)));
  }
  return h.digest('hex').slice(0, 8);
}

function expectedCache() { return PREFIX + computeSwHash(); }

function currentCache(swSrc) {
  const m = swSrc.match(/const CACHE = '([^']+)';/);
  return m ? m[1] : null;
}

function bump() {
  const swPath = path.join(ROOT, 'sw.js');
  const src = fs.readFileSync(swPath, 'utf8');
  const cur = currentCache(src);
  const next = expectedCache();
  if (cur === next) {
    console.log(`✔ 캐시 버전 이미 최신 (${next})`);
    return false;
  }
  fs.writeFileSync(swPath, src.replace(/const CACHE = '[^']+';/, `const CACHE = '${next}';`));
  console.log(`✔ 캐시 버전 갱신: ${cur} → ${next}`);
  return true;
}

module.exports = { computeSwHash, expectedCache, currentCache };

if (require.main === module) bump();
