// v6 PWA 아이콘 검사기.
// 새 우편국 아이콘은 원화에서 파생한 고정 에셋이며, 구 하트 아이콘을 다시 만들지 않는다.
// 사용법: node tools/icons.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'icons');

const targets = [
  { name: 'postal-icon-192.png', size: 192 },
  { name: 'postal-icon-512.png', size: 512 },
  { name: 'postal-icon-maskable-512.png', size: 512 },
  { name: 'postal-apple-touch-icon.png', size: 180 },
];

function pngSize(file) {
  const data = fs.readFileSync(file);
  if (data.length < 24 || data.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${file}: PNG 파일이 아닙니다.`);
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

console.log('v6 우편국 아이콘 검사:');
for (const t of targets) {
  const file = path.join(OUT, t.name);
  const { width, height } = pngSize(file);
  if (width !== t.size || height !== t.size) {
    throw new Error(`${t.name}: ${t.size}x${t.size}가 필요하지만 ${width}x${height}입니다.`);
  }
  console.log(`  ok icons/${t.name} (${width}x${height})`);
}
console.log('새 아이콘만 사용 중입니다.');
