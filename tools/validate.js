// 데이터·어휘 검증 — 「방과 후: 그림자 학교」
// P1: 에셋 무결성 + 맵 그리드 정합 + 카드/배틀 데이터 + 어휘 린트 + 텍스트 예산.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;
const err = (m) => { console.error('ERROR: ' + m); errors++; };
const has = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// PNG 헤더에서 실측 크기를 읽는다 (시트 (col,row) 범위 검사용).
function pngSize(p) {
  const b = fs.readFileSync(path.join(ROOT, p));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ── 1. 필수 파일 ────────────────────────────────────────────────────────────
const ASSETS = [
  'assets/ATTRIBUTION.md',
  'assets/pack/char/student.png', 'assets/pack/char/teacher_green.png',
  'assets/pack/char/teacher_blue.png', 'assets/pack/char/drop_shadow.png',
  'assets/pack/map/interior_floor.png', 'assets/pack/map/wall_simple.png',
  'assets/pack/props/crate.png', 'assets/pack/props/heart.png', 'assets/pack/props/pot.png',
];
for (const p of ASSETS) if (!has(p)) err(`필수 에셋 없음: ${p}`);
for (const p of ['docs/기준서-방과후-그림자학교-v1.md', 'docs/스펙-P1-1층-수직슬라이스.md']) {
  if (!has(p)) err(`필수 문서 없음: ${p}`);
}
for (const p of ['index.html', 'src/art.js', 'src/sound.js', 'src/data.js', 'src/engine.js']) {
  if (!has(p)) err(`필수 소스 없음: ${p}`);
}

// ── 2. 캐릭터 시트 규격 (기준서 §5: 64x112 = 4열 x 7행) ─────────────────────
for (const p of ['assets/pack/char/student.png', 'assets/pack/char/teacher_green.png',
  'assets/pack/char/teacher_blue.png']) {
  if (!has(p)) continue;
  const s = pngSize(p);
  if (s.w !== 64 || s.h !== 112) err(`캐릭터 시트 규격 위반(${p}): ${s.w}x${s.h}, 기대 64x112`);
}

// ── 3. data.js 적재 ─────────────────────────────────────────────────────────
let D = null;
if (has('src/data.js')) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  try {
    vm.runInContext(read('src/data.js'), sandbox, { filename: 'src/data.js' });
    D = sandbox.window.DATA;
  } catch (e) { err(`data.js 실행 실패: ${e.message}`); }
  if (!D) err('data.js가 window.DATA를 만들지 않음');
}

if (D) {
  const sheets = {
    floor: has('assets/pack/map/interior_floor.png') ? pngSize('assets/pack/map/interior_floor.png') : null,
    wall: has('assets/pack/map/wall_simple.png') ? pngSize('assets/pack/map/wall_simple.png') : null,
  };
  const inSheet = (sz, col, row) => !!sz && col >= 0 && row >= 0 &&
    (col + 1) * 16 <= sz.w && (row + 1) * 16 <= sz.h;

  if (!Object.keys(D.LEGEND || {}).length) err('LEGEND가 비었음');

  const walkable = (m, x, y) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
    const L = D.LEGEND[m.grid[y].charAt(x)];
    return !!L && !L.solid;
  };

  const mapNames = Object.keys(D.MAPS || {});
  if (mapNames.length < 2) err(`맵이 부족함: ${mapNames.length}개 (슬라이스는 교실+복도 2개)`);

  for (const name of mapNames) {
    const m = D.MAPS[name];
    const at = (s) => `맵 ${name}: ${s}`;
    if (!Array.isArray(m.grid)) { err(at('grid가 배열이 아님')); continue; }
    if (m.grid.length !== m.h) err(at(`행 수 ${m.grid.length} != h ${m.h}`));
    m.grid.forEach((row, y) => {
      if (row.length !== m.w) err(at(`${y}행 길이 ${row.length} != w ${m.w}`));
      for (const ch of row) if (!D.LEGEND[ch]) err(at(`${y}행에 범례 없는 타일 '${ch}'`));
    });
    // 캔버스는 15x11 타일 — 맵이 그보다 작으면 카메라가 깨진다 (기준서 §5)
    if (m.w < 15 || m.h < 11) err(at(`맵이 화면(15x11)보다 작음: ${m.w}x${m.h}`));
    if (!inSheet(sheets.floor, m.floor[0], m.floor[1])) err(at(`floor 타일 좌표가 시트 밖: ${m.floor}`));
    if (!inSheet(sheets.wall, m.wallBase[0] + 4, m.wallBase[1] + 4)) {
      err(at(`wallBase 5x5 블록이 시트 밖: ${m.wallBase}`));
    }
    if (!walkable(m, m.spawn.x, m.spawn.y)) err(at(`spawn(${m.spawn.x},${m.spawn.y})이 막힌 칸`));
    (m.warps || []).forEach((wp) => {
      if (!D.MAPS[wp.to]) { err(at(`워프 목적지 맵 없음: ${wp.to}`)); return; }
      if (!walkable(m, wp.x, wp.y)) err(at(`워프 발판(${wp.x},${wp.y})이 막힌 칸`));
      const dst = D.MAPS[wp.to];
      if (!walkable(dst, wp.sx, wp.sy)) err(at(`워프 도착(${wp.to} ${wp.sx},${wp.sy})이 막힌 칸`));
      // 도착 칸이 또 워프 발판이면 두 맵을 무한 왕복한다
      if ((dst.warps || []).some((w2) => w2.x === wp.sx && w2.y === wp.sy)) {
        err(at(`워프 도착이 또 워프 발판(${wp.to} ${wp.sx},${wp.sy})`));
      }
    });
    (m.terminals || []).forEach((t, i) => {
      if (!walkable(m, t.x, t.y)) err(at(`광고 단말 ${i}이 막힌 칸(${t.x},${t.y})`));
      if (!t.drop || !walkable(m, t.drop.x, t.drop.y)) err(at(`광고 단말 ${i}의 카드 반환 위치가 막힌 칸`));
    });
    if (m.npc && !walkable(m, m.npc.x, m.npc.y)) err(at('npc가 막힌 칸에 있음'));
    if (m.stairs && m.grid[m.stairs.y].charAt(m.stairs.x) !== 'S') err(at('stairs 좌표에 계단 타일이 없음'));
  }

  // ── 내 정보 카드 3장 (스펙 §3-4) ──────────────────────────────────────────
  const cards = D.CARDS || [];
  if (cards.length !== 3) err(`내 정보 카드는 3장이어야 함 (현재 ${cards.length}장)`);
  const ids = new Set();
  cards.forEach((c) => {
    if (ids.has(c.id)) err(`카드 id 중복: ${c.id}`);
    ids.add(c.id);
    const m = D.MAPS[c.at.map];
    if (!m) { err(`카드 ${c.id}의 맵 없음: ${c.at.map}`); return; }
    if (!walkable(m, c.at.x, c.at.y)) err(`카드 ${c.id}이 막힌 칸(${c.at.x},${c.at.y})`);
  });
  if (!(D.MAX_EXPOSURE > 0)) err('MAX_EXPOSURE가 없음(노출도 게이지)');

  // ── 배틀 ──────────────────────────────────────────────────────────────────
  const B = D.BATTLE || {};
  if (!ids.has(B.evidence)) err(`배틀 정답 증거가 카드 목록에 없음: ${B.evidence}`);
  if (!(B.shadow > 0)) err('배틀 그림자 게이지가 0 이하');
  if (!(B.hearts > 0)) err('배틀 하트가 0 이하');
  if (!Array.isArray(B.menu) || B.menu.length < 3) err('배틀 메뉴는 3개 이상이어야 함');
  if (!Array.isArray(B.attacks) || !B.attacks.length) err('배틀 탄막 패턴이 없음');
  (B.attacks || []).forEach((a, i) => {
    if (!(a.time > 0) || !(a.every > 0) || !(a.speed > 0)) err(`탄막 ${i} 수치 이상`);
  });
  // 기준서 §4: 배틀 1회는 3~4턴. 상대 턴 상한 = 탄막 패턴 수.
  if ((B.attacks || []).length > 4) err(`배틀 턴이 너무 김: 탄막 ${B.attacks.length}개 (3~4턴)`);

  // ── 헌법 §3-2: 시작 ~ 첫 배틀까지 대화 상자 5개 이내 / 상자당 2줄 ─────────
  const boxes = (D.INTRO || []).length + ((D.NPC && D.NPC.approach) || []).length +
    ((B.intro || []).length);
  if (boxes > 5) err(`첫 배틀까지 대화 상자 ${boxes}개 > 5개 (기준서 §3-2)`);
  else console.log(`첫 배틀까지 대화 상자: ${boxes}/5개`);

  const over = [];
  const walkBoxes = (v) => {
    if (!Array.isArray(v)) return;
    if (v.length && v.every((x) => typeof x === 'string')) { if (v.length > 2) over.push(v[0]); return; }
    v.forEach(walkBoxes);
  };
  const NOT_DIALOG = new Set(['menu', 'attacks', 'adWords']);  // 목록 UI라 2줄 규칙 밖
  [D.INTRO, D.LOOK, D.NPC, D.BATTLE, D.CLEAR].forEach((o) => {
    if (Array.isArray(o)) walkBoxes(o);
    else Object.keys(o || {}).forEach((k) => { if (!NOT_DIALOG.has(k)) walkBoxes(o[k]); });
  });
  if (over.length) err(`상자당 2줄 초과: ${over.length}곳 (예: ${over[0]})`);
}

// ── 4. 어휘 린트 + 텍스트 예산 ──────────────────────────────────────────────
const BAN = /몬스터|도감|[가-힣]몬(?=[^가-힣]|$)/;
const LIT = /['"`]([^'"`\n]{2,})['"`]/g;
let totalKo = 0;
const perFile = {};
for (const f of ['src/data.js', 'src/engine.js', 'src/art.js', 'src/sound.js', 'index.html']) {
  if (!has(f)) continue;
  const s = read(f);
  let n = 0, m;
  LIT.lastIndex = 0;
  while ((m = LIT.exec(s))) {
    const t = m[1];
    if (!/[가-힣]/.test(t)) continue;
    n += t.replace(/\\n/g, '').length;
    if (BAN.test(t)) err(`어휘 린트(${f}): "${t.slice(0, 30)}"`);
  }
  perFile[f] = n;
  totalKo += n;
}
// 스펙 §7: 한글 문자열은 data.js·index.html에만. 엔진/아트는 데이터 키만 참조한다.
for (const f of ['src/engine.js', 'src/art.js', 'src/sound.js']) {
  if (perFile[f]) err(`${f}에 한글 문자열 ${perFile[f]}자 — data.js로 옮길 것 (스펙 §7)`);
}

// 버전 삼중 대조 — 타이틀 표기(engine VERSION)와 package.json이 어긋나면
// 배포 캐시 문의를 판별할 수 없게 된다.
{
  const pkg = JSON.parse(read('package.json'));
  const m = read('src/engine.js').match(/var VERSION = '([^']+)'/);
  if (!m) err('engine.js에 VERSION 상수가 없음');
  else if (m[1] !== pkg.version) err(`버전 불일치: engine ${m[1]} != package.json ${pkg.version}`);
  if (!read('index.html').includes('shadow-school-errlog')) err('index.html 오류 링버퍼 누락');
}

const SLICE_BUDGET = 1800;   // 스펙 §4 (기준서 총예산 15,000자 중 슬라이스 몫)
console.log(`텍스트 예산: ${totalKo}/${SLICE_BUDGET}자  ` +
  Object.keys(perFile).map((f) => `${f.replace('src/', '')}=${perFile[f]}`).join(' '));
if (totalKo > SLICE_BUDGET) err(`텍스트 예산 초과: ${totalKo}자 > ${SLICE_BUDGET}자 (스펙 §4)`);

if (errors === 0) console.log('✔ 모든 검사 통과');
else { console.error(`✘ 오류 ${errors}개`); process.exit(1); }
