// 데이터·어휘 검증 — 「방과 후: 그림자 학교」
// P0: 에셋·문서 무결성 + 어휘 린트 + 텍스트 예산. 슬라이스에서 맵·배틀 검사 확장.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let errors = 0;
const err = (m) => { console.error('ERROR: ' + m); errors++; };
const has = (p) => fs.existsSync(path.join(ROOT, p));

// 1. 필수 에셋 (기준서 §5)
for (const p of ['assets/ATTRIBUTION.md',
  'assets/pack/char/student.png', 'assets/pack/char/teacher_green.png',
  'assets/pack/map/interior_floor.png', 'assets/pack/map/wall_simple.png']) {
  if (!has(p)) err(`필수 에셋 없음: ${p}`);
}
// 2. 기준서 존재
if (!has('docs/기준서-방과후-그림자학교-v1.md')) err('기준서 없음');

// 3. 어휘 린트 + 텍스트 예산 (src가 생기면 자동 적용)
const BAN = /몬스터|도감|[가-힣]몬(?=[^가-힣]|$)/;
let totalKo = 0;
for (const f of ['src/data.js', 'src/engine.js', 'index.html']) {
  if (!has(f)) continue;
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.match(/['"`]([^'"`\n]{4,})['"`]/g) || []) {
    const t = m.slice(1, -1);
    if (!/[가-힣]/.test(t)) continue;
    totalKo += t.replace(/\\n/g, '').length;
    if (BAN.test(t)) err(`어휘 린트(${f}): "${t.slice(0, 30)}"`);
  }
}
if (totalKo > 15000) err(`텍스트 예산 초과: ${totalKo}자 > 15000자 (기준서 §3-2)`);
else if (totalKo > 0) console.log(`텍스트 예산: ${totalKo}/15000자`);

if (errors === 0) console.log('✔ 모든 검사 통과');
else { console.error(`✘ 오류 ${errors}개`); process.exit(1); }
