// 스모크 테스트 — 슬라이스(P1)에서 엔진 로드·이동·배틀 검사로 교체된다.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.log('P0 단계(엔진 없음) — 구조 검사만 통과 처리'); process.exit(0);
}
console.error('index.html이 생겼는데 스모크가 아직 스텁입니다. 슬라이스 스펙 §테스트를 구현하세요.');
process.exit(1);
