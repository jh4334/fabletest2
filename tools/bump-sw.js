// sw.js 캐시 해시 갱신 — 런타임 자산이 바뀌면 실행해 새 캐시 버전을 심는다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const assets = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1])
  .filter((p) => p && p !== '/' && fs.existsSync(path.join(ROOT, p)));
const h = crypto.createHash('sha1');
h.update(fs.readFileSync(path.join(ROOT, 'index.html')));
for (const p of assets.sort()) h.update(fs.readFileSync(path.join(ROOT, p)));
const tag = 'shadow-school-' + h.digest('hex').slice(0, 8);
const cur = sw.match(/shadow-school-[0-9a-f]+/)[0];
if (cur === tag) { console.log('캐시 버전 변경 없음: ' + tag); process.exit(0); }
fs.writeFileSync(path.join(ROOT, 'sw.js'), sw.replace(cur, tag));
console.log(`캐시 버전 갱신: ${cur} → ${tag}`);
