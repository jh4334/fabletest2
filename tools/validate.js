// 게임 데이터 검증 스크립트 (Node.js)
// 사용법: node tools/validate.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {
  window: undefined,
  document: { createElement: () => ({ getContext: () => null }) },
  console,
  Math, Set, Map, JSON, Object,
};
ctx.window = ctx;
vm.createContext(ctx);

for (const f of ['src/sprites.js', 'src/audio.js', 'src/data.js']) {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(code, ctx, { filename: f });
}

const { MAPS, MONSTERS, QUIZZES, WALKABLE, SONGS, MONSTER_SPRITES, PLAYER_SPRITES, BASE_PAL,
  MONSTER_PAL, MONSTER_DEX, DEX_ORDER, MAP_PROPS, TOPIC_LABEL, getObjectiveTarget } =
  vm.runInContext('({ MAPS, MONSTERS, QUIZZES, WALKABLE, SONGS, MONSTER_SPRITES, PLAYER_SPRITES, BASE_PAL, MONSTER_PAL, MONSTER_DEX, DEX_ORDER, MAP_PROPS, TOPIC_LABEL, getObjectiveTarget })', ctx);

let errors = 0;
const err = (msg) => { console.error('ERROR: ' + msg); errors++; };

// 1. 맵 행 너비
for (const [id, m] of Object.entries(MAPS)) {
  const w = m.tiles[0].length;
  m.tiles.forEach((row, y) => {
    if (row.length !== w) err(`${id} y=${y}: 길이 ${row.length} != ${w}`);
    for (const ch of row) {
      if (!'GPFSBCM1TWOHDRK*NYZJXEVILQ234A56789'.includes(ch)) err(`${id} y=${y}: 알 수 없는 타일 '${ch}'`);
    }
  });
}

// 2. 워프 좌표 검사
for (const [id, m] of Object.entries(MAPS)) {
  for (const w of m.warps) {
    const src = m.tiles[w.y] && m.tiles[w.y][w.x];
    if (!src || !WALKABLE.has(src)) err(`${id} 워프 (${w.x},${w.y}) 출발 타일이 '${src}' (이동 불가)`);
    const tm = MAPS[w.to];
    if (!tm) { err(`${id} 워프 목적지 맵 '${w.to}' 없음`); continue; }
    const dst = tm.tiles[w.ty] && tm.tiles[w.ty][w.tx];
    if (!dst || !WALKABLE.has(dst)) err(`${id}→${w.to} 도착 (${w.tx},${w.ty}) 타일이 '${dst}' (이동 불가)`);
    // 도착 칸이 또 다른 워프면 즉시 재이동(무한 튕김) 위험 → 금지
    const landWarp = (tm.warps || []).find((w2) => w2.x === w.tx && w2.y === w.ty);
    if (landWarp) err(`${id}→${w.to} 도착 (${w.tx},${w.ty})가 또 다른 워프 칸 (즉시 재이동 위험)`);
  }
}

// 3. NPC/몬스터/표지판 위치
for (const [id, m] of Object.entries(MAPS)) {
  for (const n of m.npcs) {
    const t = m.tiles[n.y][n.x];
    if (!WALKABLE.has(t)) err(`${id} NPC ${n.id} (${n.x},${n.y}) 타일 '${t}' 위에 있음`);
  }
  for (const mo of m.monsters) {
    const t = m.tiles[mo.y][mo.x];
    if (!WALKABLE.has(t)) err(`${id} 몬스터 ${mo.id} (${mo.x},${mo.y}) 타일 '${t}' 위에 있음`);
    if (!MONSTERS[mo.id]) err(`${id} 몬스터 ${mo.id} 정의 없음`);
    if (!MONSTER_SPRITES[mo.id]) err(`${id} 몬스터 ${mo.id} 스프라이트 없음`);
  }
  for (const s of m.signs) {
    const t = m.tiles[s.y][s.x];
    if (t !== 'Y') err(`${id} 표지판 (${s.x},${s.y}) 타일이 '${t}' (Y 아님)`);
  }
}

// 4. 도달 가능성 (BFS, 배지 게이트 무시)
{
  // 몬스터는 쓰러뜨리면 사라지므로 도달 가능성 검사에서는 통과 가능으로 취급
  const solidEntity = (mapId, x, y) => {
    const m = MAPS[mapId];
    return m.npcs.some((n) => n.x === x && n.y === y);
  };
  const key = (mapId, x, y) => `${mapId}:${x},${y}`;
  const visited = new Set();
  const queue = [['village', 13, 16]];
  visited.add(key('village', 13, 16));
  while (queue.length) {
    const [mapId, x, y] = queue.shift();
    const m = MAPS[mapId];
    const warp = m.warps.find((w) => w.x === x && w.y === y);
    if (warp) {
      const k = key(warp.to, warp.tx, warp.ty);
      if (!visited.has(k)) { visited.add(k); queue.push([warp.to, warp.tx, warp.ty]); }
    }
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (ny < 0 || ny >= m.tiles.length || nx < 0 || nx >= m.tiles[0].length) continue;
      if (!WALKABLE.has(m.tiles[ny][nx])) continue;
      if (solidEntity(mapId, nx, ny)) continue;
      const k = key(mapId, nx, ny);
      if (!visited.has(k)) { visited.add(k); queue.push([mapId, nx, ny]); }
    }
  }
  const adjacentReachable = (mapId, x, y) =>
    [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => visited.has(key(mapId, x + dx, y + dy)));
  for (const [id, m] of Object.entries(MAPS)) {
    for (const n of m.npcs) if (!adjacentReachable(id, n.x, n.y)) err(`${id} NPC ${n.id} 도달 불가`);
    for (const mo of m.monsters) if (!adjacentReachable(id, mo.x, mo.y)) err(`${id} 몬스터 ${mo.id} 도달 불가`);
    for (const s of m.signs) if (!adjacentReachable(id, s.x, s.y)) err(`${id} 표지판 (${s.x},${s.y}) 도달 불가`);
    for (const w of m.warps) if (!visited.has(key(id, w.x, w.y)) && !adjacentReachable(id, w.x, w.y)) err(`${id} 워프 (${w.x},${w.y}) 도달 불가`);
  }
}

// 5. 스프라이트 크기/팔레트
const checkSprite = (name, rows, pal = BASE_PAL) => {
  if (rows.length !== 16) err(`스프라이트 ${name}: 행 수 ${rows.length} != 16`);
  rows.forEach((row, y) => {
    if (row.length !== 16) err(`스프라이트 ${name} y=${y}: 길이 ${row.length} != 16`);
    for (const ch of row) {
      if (ch !== '.' && !pal[ch]) err(`스프라이트 ${name} y=${y}: 팔레트에 없는 문자 '${ch}'`);
    }
  });
};
for (const [id, rows] of Object.entries(MONSTER_SPRITES)) {
  const pal = Object.assign({}, BASE_PAL, (MONSTER_PAL && MONSTER_PAL[id]) || {});
  checkSprite(id, rows, pal);
}
for (const [dir, frames] of Object.entries(PLAYER_SPRITES)) {
  frames.forEach((f, i) => checkSprite(`player.${dir}[${i}]`, f));
}

// 6. 곡 트랙 길이 일치
for (const [name, song] of Object.entries(SONGS)) {
  const lens = song.tracks.map((t) => t.notes.reduce((s, [, d]) => s + d, 0));
  if (new Set(lens).size > 1) err(`곡 ${name}: 트랙 길이 불일치 ${lens.join(', ')}`);
}

// 7. 퀴즈 스키마 검사 (q:문자열, a:문자열 3개, c:정수 0~2, why:문자열)
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
// 모든 퀴즈 주제에 한글 라벨이 있어야 한다 (일지·문서·챌린지 표기 누락 방지)
for (const topic of Object.keys(QUIZZES)) {
  if (!isStr(TOPIC_LABEL[topic])) err(`주제 라벨 누락: TOPIC_LABEL['${topic}']`);
}
for (const [topic, list] of Object.entries(QUIZZES)) {
  if (!Array.isArray(list)) { err(`퀴즈 주제 ${topic}: 배열이 아님`); continue; }
  list.forEach((q, i) => {
    const at = `퀴즈 ${topic}[${i}]`;
    if (!q || typeof q !== 'object') { err(`${at}: 객체가 아님`); return; }
    if (!isStr(q.q)) err(`${at}: 문제(q)가 비어 있거나 문자열이 아님`);
    if (!Array.isArray(q.a)) { err(`${at}: 보기(a)가 배열이 아님`); }
    else {
      if (q.a.length !== 3) err(`${at}: 보기 ${q.a.length}개 (3개 필요)`);
      q.a.forEach((opt, j) => { if (!isStr(opt)) err(`${at}: 보기 ${j + 1}이 비었거나 문자열이 아님`); });
      // 같은 보기가 둘 이상이면 정답이 모호해진다
      const seen = new Set();
      for (const opt of q.a) {
        const key = String(opt).replace(/\s+/g, ' ').trim();
        if (seen.has(key)) err(`${at}: 보기에 중복된 내용 '${key}'`);
        seen.add(key);
      }
    }
    if (!Number.isInteger(q.c)) err(`${at}: 정답 번호(c)가 정수가 아님`);
    else if (q.c < 0 || q.c >= (Array.isArray(q.a) ? q.a.length : 0)) err(`${at}: 정답 번호 ${q.c} 범위 밖`);
    if (!isStr(q.why)) err(`${at}: 해설(why)이 비어 있거나 문자열이 아님`);
  });
}
for (const [id, mon] of Object.entries(MONSTERS)) {
  // 인물 핵심 필드 스키마 (v3: 퀴즈 배틀 폐지 — hp/topic 요구 없음, 설득 배틀은 PERSUADE가 담당)
  if (!isStr(mon.name)) err(`인물 ${id}: name이 비었거나 문자열이 아님`);
  if (!isStr(mon.intro)) err(`인물 ${id}: intro가 비었거나 문자열이 아님`);
  if (!isStr(mon.win)) err(`인물 ${id}: win이 비었거나 문자열이 아님`);

  // 통일성: 모든 배틀 인물은 '마음의 선택'을 가진다
  if (!mon.mercy) {
    if (mon.bonus) continue;
    err(`인물 ${id}: mercy(마음의 선택) 없음`); continue;
  }
  if (!mon.mercy.prompt) err(`몬스터 ${id}: mercy.prompt 없음`);
  if (!mon.mercy.options || mon.mercy.options.length !== 3) {
    err(`몬스터 ${id}: mercy 선택지는 3개여야 함`);
  } else {
    let mercyCount = 0;
    for (const o of mon.mercy.options) {
      if (!o.label || !o.reply) err(`몬스터 ${id}: mercy 선택지에 label/reply 없음`);
      if (!['mercy', 'neutral', 'harsh'].includes(o.kind)) err(`몬스터 ${id}: mercy kind '${o.kind}' 잘못됨`);
      if (o.kind === 'mercy') mercyCount++;
    }
    if (mercyCount !== 1) err(`몬스터 ${id}: 'mercy' 선택지는 정확히 1개여야 함 (현재 ${mercyCount})`);
  }
}

// 8. 도감: 모든 몬스터가 도감 정보를 가지며, DEX_ORDER가 정확히 일치
for (const id of Object.keys(MONSTERS)) {
  if (!MONSTER_DEX[id]) err(`도감: 몬스터 ${id} 정보 없음`);
  else {
    if (!MONSTER_DEX[id].theme) err(`도감 ${id}: theme 없음`);
    if (!MONSTER_DEX[id].learn) err(`도감 ${id}: learn 없음`);
  }
  if (!DEX_ORDER.includes(id)) err(`도감 순서(DEX_ORDER)에 ${id} 빠짐`);
}
for (const id of DEX_ORDER) {
  if (!MONSTERS[id]) err(`DEX_ORDER의 ${id}는 존재하지 않는 몬스터`);
}
if (DEX_ORDER.length !== new Set(DEX_ORDER).size) err('DEX_ORDER에 중복 있음');

// 9. 설득 배틀 탄막 패턴: PERSUADE 각 주장(claim)의 attack 패턴이 올바른지
const VALID_PATTERNS = ['rain', 'sides', 'burst', 'spiral', 'wall', 'zigzag', 'aimed'];
{
  const PERSUADE = vm.runInContext('typeof PERSUADE !== "undefined" ? PERSUADE : null', ctx);
  if (PERSUADE) {
    for (const [key, p] of Object.entries(PERSUADE)) {
      for (const [i, c] of (p.claims || []).entries()) {
        if (!c.attack) continue;
        const pats = c.attack.patterns || (c.attack.pattern ? [c.attack.pattern] : []);
        if (pats.length === 0) err(`설득 ${key} claim[${i}]: attack에 pattern/patterns 없음`);
        for (const pat of pats) if (!VALID_PATTERNS.includes(pat)) err(`설득 ${key} claim[${i}]: 패턴 '${pat}' 잘못됨`);
        if (!(c.attack.dur > 0)) err(`설득 ${key} claim[${i}]: dur 잘못됨`);
      }
    }
  }
}

// 10. 조사 지점: 맵 범위 안 + 인접 칸이 이동 가능(살펴볼 수 있어야 함)
for (const [mapId, props] of Object.entries(MAP_PROPS)) {
  const m = MAPS[mapId];
  if (!m) { err(`조사: 맵 '${mapId}' 없음`); continue; }
  for (const p of props) {
    if (p.y < 0 || p.y >= m.tiles.length || p.x < 0 || p.x >= m.tiles[0].length) {
      err(`조사 ${mapId} (${p.x},${p.y}): 맵 범위 밖`); continue;
    }
    if (!p.text) err(`조사 ${mapId} (${p.x},${p.y}): 텍스트 없음`);
    const faceable = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
      const nx = p.x + dx, ny = p.y + dy;
      if (ny < 0 || ny >= m.tiles.length || nx < 0 || nx >= m.tiles[0].length) return false;
      return WALKABLE.has(m.tiles[ny][nx]);
    });
    if (!faceable) err(`조사 ${mapId} (${p.x},${p.y}): 마주 볼 수 있는 칸이 없음`);
  }
}

// 11. 목표 안내 일관성: 프롤로그 → 챕터 1~5 → 파이널의 진행 플래그를 순서대로 채워 가며,
//     getObjectiveTarget가 가리키는 맵이 존재하고 좌표가 맵 범위 안이며, 그 자리(또는 인접)에
//     실제 상호작용 대상(NPC·인물·워프·제단)이 있는지 검사한다.
//     (스테이지 재구성 후 안내 화살표가 빈 타일을 가리키는 회귀를 막는다.)
if (typeof getObjectiveTarget === 'function') {
  const flags = { talkedProf: true, defeated: {}, mercy: 0, trueEnding: false };
  const near = (m, x, y, px, py) => Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1;
  const checkTarget = (stageName) => {
    const t = getObjectiveTarget(flags);
    if (!t) return;
    const m = MAPS[t.map];
    if (!m) { err(`목표 안내(${stageName}): 맵 '${t.map}' 없음`); return; }
    if (t.y < 0 || t.y >= m.tiles.length || t.x < 0 || t.x >= m.tiles[0].length) {
      err(`목표 안내(${stageName}): '${t.label}' 좌표 (${t.x},${t.y})가 ${t.map} 범위 밖`); return;
    }
    const adjWalkable = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
      const nx = t.x + dx, ny = t.y + dy;
      return ny >= 0 && ny < m.tiles.length && nx >= 0 && nx < m.tiles[0].length && WALKABLE.has(m.tiles[ny][nx]);
    });
    const hit = m.npcs.some((n) => near(m, t.x, t.y, n.x, n.y)) ||
      m.monsters.some((mo) => near(m, t.x, t.y, mo.x, mo.y)) ||
      m.warps.some((w) => near(m, t.x, t.y, w.x, w.y)) ||
      WALKABLE.has(m.tiles[t.y][t.x]) || adjWalkable;
    if (!hit) err(`목표 안내(${stageName}): '${t.label}' (${t.map} ${t.x},${t.y}) 주변에 상호작용 대상이 없음`);
  };
  checkTarget('프롤로그');
  flags.defeated.bekkyeomon = true; checkTarget('1장 입구');
  for (let n = 1; n <= 5; n++) { flags[`chapter${n}Clear`] = true; checkTarget(`${n}장 클리어 후`); }
  flags.goyoClear = true; checkTarget('고요 이후');
  flags.shrineDone = true; checkTarget('봉헌 이후');
  flags.defeated.yeongi = true; flags.trueEnding = true; checkTarget('진엔딩');
}

// 맵 출력 (눈으로 확인용)
if (process.argv.includes('--print')) {
  for (const [id, m] of Object.entries(MAPS)) {
    console.log(`\n=== ${id} (${m.tiles[0].length}x${m.tiles.length}) ===`);
    m.tiles.forEach((r) => console.log(r));
  }
}

// 생성된 교사용 문서가 퀴즈 데이터와 어긋나지 않았는지 점검
// (퀴즈를 바꾸고 `node tools/quizlist.js`를 다시 돌리지 않은 경우를 잡는다)
(() => {
  const docPath = path.join(__dirname, '..', 'docs', '주제별-문제-목록.md');
  if (!fs.existsSync(docPath)) return; // 문서가 아직 없으면 통과(선택 사항)
  let totalQ = 0;
  for (const t of Object.keys(QUIZZES)) totalQ += QUIZZES[t].length;
  const txt = fs.readFileSync(docPath, 'utf8');
  const mt = txt.match(/전체 문항 수:\s*\*\*(\d+)문항\*\*/);
  const mTopic = txt.match(/주제 수:\s*\*\*(\d+)개\*\*/);
  if (!mt || Number(mt[1]) !== totalQ) {
    err(`교사용 문서 문항 수 불일치(문서 ${mt ? mt[1] : '?'} vs 데이터 ${totalQ}). 'node tools/quizlist.js'로 다시 생성하세요`);
  }
  if (!mTopic || Number(mTopic[1]) !== Object.keys(QUIZZES).length) {
    err(`교사용 문서 주제 수 불일치. 'node tools/quizlist.js'로 다시 생성하세요`);
  }
})();

// 커스텀 퀴즈 편집기(tools/editor.html)의 입력 한도가 게임(src/game.js)과 같은지 점검
// (한쪽만 바뀌면, 편집기에서 통과한 문제가 게임에서 잘리는 혼란을 막는다)
(() => {
  const gj = fs.readFileSync(path.join(__dirname, '..', 'src', 'game.js'), 'utf8');
  const ed = path.join(__dirname, 'editor.html');
  if (!fs.existsSync(ed)) return;
  const eh = fs.readFileSync(ed, 'utf8');
  const num = (re, src) => { const m = src.match(re); return m ? Number(m[1]) : null; };
  const game = {
    q: num(/Q_MAX\s*=\s*(\d+)/, gj), a: num(/A_MAX\s*=\s*(\d+)/, gj),
    why: num(/WHY_MAX\s*=\s*(\d+)/, gj), max: num(/CUSTOM_MAX\s*=\s*(\d+)/, gj),
  };
  const m = eh.match(/LIMITS\s*=\s*\{\s*q:\s*(\d+),\s*a:\s*(\d+),\s*why:\s*(\d+),\s*max:\s*(\d+)/);
  const edl = m ? { q: +m[1], a: +m[2], why: +m[3], max: +m[4] } : null;
  if (!edl) { err('editor.html에서 LIMITS를 찾지 못함'); return; }
  for (const k of ['q', 'a', 'why', 'max']) {
    if (game[k] !== edl[k]) err(`커스텀 퀴즈 한도 불일치(${k}): 게임 ${game[k]} vs 편집기 ${edl[k]}`);
  }
})();

// 서비스워커 캐시: 핵심 자산이 sw.js 캐시 목록에 모두 들어 있는지 점검
// (새 파일을 추가하고 sw에 등록하지 않으면 오프라인 배포에서 누락되는 사고를 막는다)
(() => {
  const root = path.join(__dirname, '..');
  const swPath = path.join(root, 'sw.js');
  if (!fs.existsSync(swPath)) { err('sw.js 없음'); return; }
  const sw = fs.readFileSync(swPath, 'utf8');
  if (!/const\s+CACHE\s*=\s*['"][^'"]+['"]/.test(sw)) err('sw.js: CACHE 버전 문자열 없음');
  const required = ['index.html', 'manifest.webmanifest'];
  for (const f of fs.readdirSync(path.join(root, 'src'))) if (f.endsWith('.js')) required.push('src/' + f);
  for (const f of fs.readdirSync(path.join(root, 'icons'))) if (f.endsWith('.png')) required.push('icons/' + f);
  for (const rel of required) {
    if (!(sw.includes(`'./${rel}'`) || sw.includes(`"./${rel}"`) || sw.includes(`'${rel}'`) || sw.includes(`"${rel}"`))) {
      err(`sw.js 캐시 목록에 '${rel}' 누락 — 오프라인 배포 시 빠질 수 있음 (sw.js ASSETS에 추가하세요)`);
    }
  }
})();

// v3 어휘 린트 — 화면 노출 문자열에 포켓몬 어휘("-몬"·도감·증표·몬스터)가 되살아나는 것을 막는다.
// 주석을 걷어낸 소스에서 한글은 사실상 문자열 리터럴에만 남으므로, 주석 제거 후 금칙어를 찾는다.
(() => {
  const BANNED = ['몬스터', '도감', '증표', '뱃지',
    '베껴몬', '수집몬', '편향몬', '환각몬', '유혹몬', '홀림몬', '어둠대왕몬', '혼돈몬',
    '몰래몬', '기록몬', '악플몬', '갇힘몬', '멋대로몬', '소문몬', '무시몬', '펑펑몬',
    '깜깜몬', '떠넘기몬', '낭비몬', '핑계몬', '시들몬', '빼앗몬', '메아리몬', '그림자몬',
    '뚫림몬', '사서몬', '필터몬', '미러몬', '속삭임몬', '조각몬', '합성몬', '미래몬',
    '거짓몬', '중독몬'];
  const files = ['src/data.js', 'src/game.js', 'src/sprites.js', 'src/audio.js', 'index.html'];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))   // 블록 주석
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1) => p1 + ' ');          // 줄 주석 (URL의 //는 보존)
    stripped.split('\n').forEach((line, i) => {
      for (const w of BANNED) {
        if (line.includes(w)) err(`어휘 린트 ${f}:${i + 1} — 화면 노출 문자열에 금칙어 '${w}' (v3: 포켓몬 어휘 금지)`);
      }
    });
  }
})();

if (errors === 0) console.log('✔ 모든 검사 통과');
else { console.error(`✘ 오류 ${errors}개`); process.exit(1); }
