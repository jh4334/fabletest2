// 데이터·어휘 검증 — 「방과 후: 그림자 학교」
// P1: 에셋 무결성 + 맵 그리드 정합 + 카드/배틀 데이터 + 어휘 린트 + 텍스트 예산.
// P2: 층별 카드 3장 + 배틀 프로필 무결성 + 추천 복도 문 정합 + 2층 상자 예산.
// P3: fl:3 + 3층 카드 3장 + 소문-카드-안개 정합 + 오염 최악에서 전 칸 도달(BFS) + 3층 상자 예산.
// P4: fl:4 + 4층 카드 3장 + 액자-견본-유리문 1:1 정합 + 유리문 전잠김 도달성(BFS) +
//     paint 탄막 수치 상한 + 4층 상자 예산.
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
for (const p of ['docs/기준서-방과후-그림자학교-v1.md', 'docs/스펙-P1-1층-수직슬라이스.md',
  'docs/스펙-P2-2층-필터버블.md', 'docs/스펙-P3-3층-가짜뉴스.md', 'docs/스펙-P4-4층-저작권.md']) {
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

  // 통행 판정 한 벌: extraSolid(안개 칸)는 막고, extraOpen(열린 유리문)은 뚫는다.
  const openFn = (m, extraSolid, extraOpen) => {
    const blocked = new Set((extraSolid || []).map((c) => c.x + ',' + c.y));
    const forced = new Set((extraOpen || []).map((c) => c.x + ',' + c.y));
    return (x, y) => {
      const k = x + ',' + y;
      if (blocked.has(k)) return false;
      if (forced.has(k)) return x >= 0 && y >= 0 && x < m.w && y < m.h;
      return walkable(m, x, y);
    };
  };
  // 스폰에서 BFS — 실제로 걸어서 닿는 칸 집합.
  const reachSet = (m, extraSolid, extraOpen) => {
    const open = openFn(m, extraSolid, extraOpen);
    const seen = new Set();
    if (!open(m.spawn.x, m.spawn.y)) return seen;
    seen.add(m.spawn.x + ',' + m.spawn.y);
    const q = [[m.spawn.x, m.spawn.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (seen.has(k) || !open(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };
  const allReachable = (m, extraSolid, extraOpen) => {
    const open = openFn(m, extraSolid, extraOpen);
    if (!open(m.spawn.x, m.spawn.y)) return false;
    const seen = reachSet(m, extraSolid, extraOpen);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) if (open(x, y) && !seen.has(x + ',' + y)) return false;
    }
    return true;
  };
  // 유리문 칸(잠김=솔리드). 전 칸 도달 검사는 '다 연 상태'를 기준으로 본다.
  const glassOf = (m) => {
    const out = [];
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) if (m.grid[y].charAt(x) === 'g') out.push({ x, y });
    }
    return out;
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
    if (m.npc) {
      if (!walkable(m, m.npc.x, m.npc.y)) err(at('npc가 막힌 칸에 있음'));
      if (!D.BATTLES[m.npc.battle]) err(at(`npc.battle 프로필이 없음: ${m.npc.battle}`));
      if (m.npc.opens && !D.MAPS[m.npc.opens]) err(at(`npc.opens 맵이 없음: ${m.npc.opens}`));
    }
    if (m.stairs && m.grid[m.stairs.y].charAt(m.stairs.x) !== 'S') err(at('stairs 좌표에 계단 타일이 없음'));
    // 계단 앞 복귀 좌표(클리어 화면에서 돌아올 자리)는 걸을 수 있어야 한다
    if (m.stairs && m.stairs.face && !walkable(m, m.stairs.face.x, m.stairs.face.y)) {
      err(at('stairs.face 가 막힌 칸'));
    }
    if (m.stairsTo) {
      const up = D.MAPS[m.stairsTo.map];
      if (!up) err(at(`위층 맵 없음: ${m.stairsTo.map}`));
      else if (!walkable(up, m.stairsTo.sx, m.stairsTo.sy)) err(at('위층 도착 칸이 막힘'));
      if (!m.stairs) err(at('stairsTo 가 있는데 stairs 타일이 없음'));
    }
    if ([1, 2, 3, 4].indexOf(m.fl || 1) < 0) err(at(`층(fl) 값이 이상함: ${m.fl}`));
    // 소문 쪽지·자료실 표지는 조사할 수 있는 자리(막힌 칸)에 있어야 한다
    (m.notes || []).forEach((n) => {
      if (m.grid[n.y].charAt(n.x) !== 'N') err(at(`소문 쪽지 ${n.id} 자리에 쪽지 타일(N)이 없음`));
      if (!walkable(m, n.x, n.y + 1)) err(at(`소문 쪽지 ${n.id} 앞에 설 자리가 없음`));
    });
    (m.signs || []).forEach((s) => {
      if (m.grid[s.y].charAt(s.x) !== 'G') err(at(`표지 ${s.rumor} 자리에 표지 타일(G)이 없음`));
      if (!walkable(m, s.x, s.y + 1)) err(at(`표지 ${s.rumor} 앞에 설 자리가 없음`));
    });
    // 모든 걸을 수 있는 칸은 스폰에서 이어져야 한다 (섬 = 못 줍는 카드·못 여는 문)
    // 유리문은 열리는 문이라 '다 연 상태'가 이 맵의 최종 형태다.
    if (!allReachable(m, [], glassOf(m))) err(at('스폰에서 못 가는 칸이 있음'));
  }

  // ── 증거 카드: 층마다 3장 (스펙 §3) ───────────────────────────────────────
  const cards = D.CARDS || [];
  const ids = new Set();
  const byFloor = {};
  cards.forEach((c) => {
    if (ids.has(c.id)) err(`카드 id 중복: ${c.id}`);
    ids.add(c.id);
    const fl = c.floor;
    if ([1, 2, 3, 4].indexOf(fl) < 0) { err(`카드 ${c.id}의 floor 태그가 없음/이상함: ${fl}`); return; }
    byFloor[fl] = (byFloor[fl] || 0) + 1;
    const m = D.MAPS[c.at.map];
    if (!m) { err(`카드 ${c.id}의 맵 없음: ${c.at.map}`); return; }
    if ((m.fl || 1) !== fl) err(`카드 ${c.id}의 floor(${fl})와 맵 ${c.at.map}의 층(${m.fl})이 다름`);
    if (!walkable(m, c.at.x, c.at.y)) err(`카드 ${c.id}이 막힌 칸(${c.at.x},${c.at.y})`);
  });
  for (const fl of [1, 2, 3, 4]) {
    if (byFloor[fl] !== 3) err(`${fl}층 증거 카드는 3장이어야 함 (현재 ${byFloor[fl] || 0}장)`);
  }
  if (!(D.MAX_EXPOSURE > 0)) err('MAX_EXPOSURE가 없음(노출도 게이지)');
  if (!(D.MAX_BUBBLE > 0)) err('MAX_BUBBLE이 없음(버블 게이지)');
  if (!(D.MAX_POLLUTE > 0)) err('MAX_POLLUTE가 없음(오염 게이지)');
  if (!(D.MAX_HONEST > 0)) err('MAX_HONEST가 없음(정직 게이지)');

  // ── 배틀 프로필 (스펙 §4) ─────────────────────────────────────────────────
  const UI = D.BATTLE_UI || {};
  if (!Array.isArray(UI.menu) || UI.menu.length < 3) err('배틀 메뉴는 3개 이상이어야 함');
  const used = new Set();
  Object.keys(D.MAPS || {}).forEach((n) => { if (D.MAPS[n].npc) used.add(D.MAPS[n].npc.battle); });
  const profiles = Object.keys(D.BATTLES || {});
  if (profiles.length < 4) err(`배틀 프로필이 부족함: ${profiles.length}개 (짝꿍+형+선배+미술 선생님)`);
  for (const id of profiles) {
    const B = D.BATTLES[id];
    const at = (s) => `배틀 ${id}: ${s}`;
    if (!used.has(id)) err(at('어떤 맵의 npc도 이 프로필을 쓰지 않음'));
    if (!ids.has(B.evidence)) err(at(`정답 증거가 카드 목록에 없음: ${B.evidence}`));
    else {
      const ev = cards.find((c) => c.id === B.evidence);
      // 증거는 그 인물이 있는 층에서 주울 수 있어야 한다(가방은 층별로 갈린다)
      const home = Object.keys(D.MAPS).find((n) => D.MAPS[n].npc && D.MAPS[n].npc.battle === id);
      if (home && ev.floor !== (D.MAPS[home].fl || 1)) err(at('증거 카드가 다른 층에 있음'));
    }
    if (!(B.shadow > 0)) err(at('그림자 게이지가 0 이하'));
    if (!(B.hearts > 0)) err(at('하트가 0 이하'));
    for (const k of ['approach', 'reApproach', 'intro', 'reIntro', 'talk', 'talk2', 'talk3',
      'listen', 'listenAgain', 'listenHint', 'showWrong', 'showRight', 'spare', 'promise', 'hint']) {
      if (!Array.isArray(B[k]) || !B[k].length) err(at(`대사 ${k} 누락`));
    }
    if (!Array.isArray(B.attacks) || !B.attacks.length) err(at('탄막 패턴이 없음'));
    (B.attacks || []).forEach((a, i) => {
      if (!(a.time > 0) || !(a.every > 0) || !(a.speed > 0)) err(at(`탄막 ${i} 수치 이상`));
      if (a.time < 5 || a.time > 7) err(at(`탄막 ${i} 길이 ${a.time}초 (5.5~6.5초 권장 범위 밖)`));
      // 3~4학년 기준: 하트를 쫓는 조각은 느려야 피할 수 있다 (스펙 §4)
      if (a.kind === 'chase' && a.speed > 120) err(at(`chase 탄막이 너무 빠름: ${a.speed}`));
    });
    // 기준서 §4: 배틀 1회는 3~4턴. 상대 턴 상한 = 탄막 패턴 수.
    if ((B.attacks || []).length > 4) err(at(`턴이 너무 김: 탄막 ${B.attacks.length}개 (3~4턴)`));
  }

  // ── 추천 복도 문 정합 (스펙 §2) ───────────────────────────────────────────
  {
    const loop = D.MAPS.loop;
    if (!loop) err('2층 추천 복도(loop) 맵이 없음');
    else {
      const reco = (loop.warps || []).filter((w) => w.kind === 'reco');
      const strange = (loop.warps || []).filter((w) => w.kind === 'strange');
      if (reco.length !== 1) err(`추천 문은 1개여야 함 (현재 ${reco.length}개)`);
      if (strange.length !== 1) err(`낯선 문은 1개여야 함 (현재 ${strange.length}개)`);
      reco.forEach((w) => {
        if (loop.grid[w.y].charAt(w.x) !== 'r') err('추천 문 좌표에 추천 문 타일(r)이 없음');
        if (w.to !== 'loop') err('추천 문은 같은 복도로 되돌아와야 함');
        if (w.sx !== loop.spawn.x || w.sy !== loop.spawn.y) err('추천 문 복귀 지점이 복도 입구가 아님');
        if (!w.warn) err('추천 문에 사전 경고 표시(warn)가 없음');
      });
      strange.forEach((w) => {
        if (loop.grid[w.y].charAt(w.x) !== 'u') err('낯선 문 좌표에 낯선 문 타일(u)이 없음');
        for (const t of [w.to, w.alt]) {
          if (!D.MAPS[t]) { err(`낯선 문 목적지 맵 없음: ${t}`); continue; }
          if (!walkable(D.MAPS[t], w.sx, w.sy)) err(`낯선 문 도착(${t})이 막힌 칸`);
          // 두 방 모두 복도로 돌아오는 길이 있어야 갇히지 않는다
          if (!(D.MAPS[t].warps || []).some((b) => b.to === 'loop')) err(`${t}에서 복도로 돌아올 문이 없음`);
        }
        if (w.to === w.alt) err('낯선 문이 같은 방만 반복함');
      });
      if (!(loop.decor || []).some((d) => d.kind === 'poster')) err('추천 복도에 포스터 장식이 없음');
      if (!(loop.decor || []).some((d) => d.kind === 'window')) err('추천 복도에 창문 장식이 없음');
    }
  }

  // ── 3층 소문 오염 (스펙 P3 §2·§3·§5) ─────────────────────────────────────
  {
    const rumors = D.RUMORS || [];
    if (rumors.length !== 3) err(`소문은 3개여야 함 (현재 ${rumors.length}개)`);
    const studio = D.MAPS.studio, hall3 = D.MAPS.hall3, archive = D.MAPS.archive;
    for (const [n, m] of [['studio', studio], ['hall3', hall3], ['archive', archive]]) {
      if (!m) err(`3층 맵이 없음: ${n}`);
      else if ((m.fl || 1) !== 3) err(`${n}의 층(fl)이 3이 아님`);
    }
    if (studio && !studio.grid.some((row) => row.indexOf('K') >= 0)) err('방송실에 콘솔 타일(K)이 없음');
    if (hall3 && !hall3.stairs) err('3층 복도에 계단이 없음');

    const rumorIds = new Set();
    const fogAll = [];
    for (const r of rumors) {
      const at = (s) => `소문 ${r.id}: ${s}`;
      if (rumorIds.has(r.id)) err(at('id 중복'));
      rumorIds.add(r.id);
      if (!r.label) err(at('콘솔 목록 이름(label)이 없음'));
      // 소문 ↔ 사실 카드 매핑: 반드시 3층 카드 한 장과 짝지어야 한다
      const card = cards.find((c) => c.id === r.card);
      if (!card) err(at(`사실 카드가 없음: ${r.card}`));
      else if (card.floor !== 3) err(at('사실 카드가 3층 카드가 아님'));
      for (const k of ['note', 'sign']) {
        if (!Array.isArray(r[k]) || !r[k].length) err(at(`대사 ${k} 누락`));
      }
      // 쪽지(방송실)·표지(자료실)가 이 소문에 하나씩 연결돼 있어야 한다
      if (studio && !(studio.notes || []).some((n) => n.id === r.id)) err(at('방송실에 소문 쪽지가 없음'));
      if (archive && !(archive.signs || []).some((s) => s.rumor === r.id)) err(at('자료실에 표지가 없음'));
      // 표지 옆에 그 소문의 사실 카드가 놓여 있어야 한다(어느 카드인지 조사로 안다)
      const sign = archive && (archive.signs || []).find((s) => s.rumor === r.id);
      if (sign && card && (card.at.map !== 'archive' || Math.abs(card.at.x - sign.x) > 1)) {
        err(at('사실 카드가 표지 근처에 없음'));
      }
      const fog = r.fog || [];
      if (!fog.length) err(at('오염 시 막을 통로 칸(fog)이 없음'));
      const fm = D.MAPS[r.map];
      if (!fm) err(at(`안개 맵이 없음: ${r.map}`));
      else {
        for (const c of fog) {
          if (!walkable(fm, c.x, c.y)) err(at(`안개 칸이 원래부터 막힌 칸(${c.x},${c.y})`));
          if (fm.stairs && fm.stairs.face && fm.stairs.face.x === c.x && fm.stairs.face.y === c.y) {
            err(at('안개가 계단 앞을 막음'));
          }
          if ((fm.warps || []).some((w) => w.x === c.x && w.y === c.y)) err(at('안개가 문 칸을 막음'));
          fogAll.push(c);
        }
      }
    }
    // 헌법 §3-3: 최악(3건 모두 오염)에서도 모든 칸에 갈 수 있어야 한다 — 소프트락 금지
    if (hall3 && !allReachable(hall3, fogAll)) {
      err('오염 최악 상태에서 못 가는 칸이 생김 (소프트락)');
    } else if (hall3) {
      console.log(`오염 최악(안개 ${fogAll.length}칸)에서도 전 칸 도달 가능`);
    }
    // 배틀 정답 증거는 당사자에게 직접 물은 카드 (스펙 §3)
    const senior = (D.BATTLES || {}).senior;
    if (!senior) err('선배 배틀 프로필이 없음');
    else {
      if (senior.evidence !== 'ownWords') err('선배 배틀 정답 증거가 당사자 메모가 아님');
      if (!(senior.attacks || []).some((a) => a.kind === 'burst')) err('선배 탄막에 burst가 없음');
      (senior.attacks || []).forEach((a, i) => {
        if (a.kind === 'burst' && a.speed > 130) err(`선배 burst 탄막이 너무 빠름(${i}): ${a.speed}`);
      });
    }
    if (studio && studio.npc && studio.npc.needs !== 'rumors') {
      err('선배는 소문 3개를 다 처리해야 나타나야 함(needs)');
    }
  }

  // ── 4층 출처 스티커 (스펙 P4 §2·§3·§4·§5) ───────────────────────────────
  {
    const frames = D.FRAMES || [];
    const authors = D.AUTHORS || [];
    if (frames.length !== 3) err(`액자는 3점이어야 함 (현재 ${frames.length}점)`);
    if (authors.length !== 3) err(`스타일 견본은 3장이어야 함 (현재 ${authors.length}장)`);
    if (D.MAX_HONEST !== frames.length) err('정직 게이지 최대치가 액자 수와 다름');

    const hall4 = D.MAPS.hall4, artroom = D.MAPS.artroom, gallery = D.MAPS.gallery;
    for (const [n, m] of [['hall4', hall4], ['artroom', artroom], ['gallery', gallery]]) {
      if (!m) err(`4층 맵이 없음: ${n}`);
      else if ((m.fl || 1) !== 4) err(`${n}의 층(fl)이 4가 아님`);
    }
    // 3층 계단은 이제 4층으로 이어지고, 오늘의 마지막 계단은 전시 복도로 옮겨졌다.
    const hall3b = D.MAPS.hall3;
    if (hall3b && (!hall3b.stairsTo || hall3b.stairsTo.map !== 'hall4')) {
      err('3층 계단이 4층 복도로 이어지지 않음');
    }
    if (gallery && !gallery.stairs) err('전시 복도에 계단이 없음');
    if (gallery && gallery.stairsTo) err('4층 계단은 아직 위층이 없어야 함 (5층은 공사 중)');
    if (artroom && !artroom.grid.some((row) => row.indexOf('M') >= 0)) err('미술실에 제작대 타일(M)이 없음');
    if (artroom && !artroom.grid.some((row) => row.indexOf('J') >= 0)) err('미술실에 잠긴 서랍 타일(J)이 없음');

    const authorIds = new Set();
    for (const a of authors) {
      const at = (s) => `견본 ${a.id}: ${s}`;
      if (authorIds.has(a.id)) err(at('id 중복'));
      authorIds.add(a.id);
      // 교육 톤(스펙 §6): 스티커는 쓴 도구(AI)와 원본 화풍을 함께 밝힌다.
      if (!a.sticker) err(at('스티커 문구가 없음'));
      else if (a.sticker.indexOf('AI') < 0) err(at('스티커에 도구 표시(AI)가 없음'));
      if (!Array.isArray(a.sample) || !a.sample.length) err(at('견본 대사가 없음'));
    }

    // 액자 ↔ 스티커(견본) ↔ 이상한 점 매핑 정합 — 1:1이어야 정답이 하나로 정해진다.
    const frameIds = new Set();
    const usedAuthors = new Set();
    for (const f of frames) {
      const at = (s) => `액자 ${f.id}: ${s}`;
      if (frameIds.has(f.id)) err(at('id 중복'));
      frameIds.add(f.id);
      if (!f.label) err(at('제작대 목록 이름(label)이 없음'));
      if (!authorIds.has(f.author)) err(at(`정답 견본이 없음: ${f.author}`));
      else if (usedAuthors.has(f.author)) err(at('정답 견본이 다른 액자와 겹침 (1:1 아님)'));
      usedAuthors.add(f.author);
      if (!Array.isArray(f.look) || !f.look.length) err(at('이상한 점 대사가 없음'));
      const fm = D.MAPS[f.map];
      if (!fm) { err(at(`맵이 없음: ${f.map}`)); continue; }
      if (fm.grid[f.y].charAt(f.x) !== 'A') err(at('좌표에 액자 타일(A)이 없음'));
      if (!walkable(fm, f.x, f.y - 1)) err(at('액자 앞에 설 자리가 없음'));
      const door = f.door || [];
      if (!door.length) err(at('열릴 유리문 칸이 없음'));
      for (const c of door) {
        if (fm.grid[c.y].charAt(c.x) !== 'g') err(at(`유리문 칸(${c.x},${c.y})에 유리문 타일(g)이 없음`));
      }
    }
    if (usedAuthors.size !== authors.length) err('견본이 남거나 모자람 — 액자와 1:1이 아님');

    // 미술실 견본판: 세 견본에 하나씩, 앞에 설 자리가 있어야 조사할 수 있다.
    if (artroom) {
      for (const s of artroom.samples || []) {
        if (!authorIds.has(s.id)) err(`미술실 견본판의 id가 견본에 없음: ${s.id}`);
        if (artroom.grid[s.y].charAt(s.x) !== 'V') err(`견본판 ${s.id} 자리에 견본 타일(V)이 없음`);
        if (!walkable(artroom, s.x, s.y + 1)) err(`견본판 ${s.id} 앞에 설 자리가 없음`);
      }
      for (const a of authors) {
        if (!(artroom.samples || []).some((s) => s.id === a.id)) err(`미술실에 견본판 ${a.id}이 없음`);
      }
    }

    // 헌법 §3-3: 유리문이 전부 잠긴 상태에서도 액자·카드·제작대에 닿아야 한다.
    // (닿지 못하면 스티커를 만들 수 없어 영영 못 여는 소프트락이 된다)
    if (gallery) {
      const locked = reachSet(gallery, [], []);
      for (const f of frames.filter((x) => x.map === 'gallery')) {
        if (!locked.has(f.x + ',' + (f.y - 1))) err(`유리문 전잠김: 액자 ${f.id} 앞에 못 감 (소프트락)`);
      }
      for (const c of cards.filter((x) => x.floor === 4 && x.at.map === 'gallery')) {
        if (!locked.has(c.at.x + ',' + c.at.y)) err(`유리문 전잠김: 카드 ${c.id}에 못 감 (소프트락)`);
      }
      for (const wp of gallery.warps || []) {
        if (!locked.has(wp.x + ',' + wp.y)) err('유리문 전잠김: 복도로 돌아갈 문에 못 감 (소프트락)');
      }
      // 반대로, 문을 안 열고 배틀 지점·계단에 닿으면 문이 진행을 막지 못한 것이다.
      const npc = gallery.npc;
      if (!npc || npc.needs !== 'frames') err('미술 선생님은 액자 3점을 다 밝혀야 나타나야 함(needs)');
      if (npc && locked.has(npc.x + ',' + npc.y)) err('유리문을 안 열고도 배틀 지점에 닿음');
      const face = gallery.stairs && gallery.stairs.face;
      if (face && locked.has(face.x + ',' + face.y)) err('유리문을 안 열고도 계단 앞에 닿음');
      console.log(`유리문 전잠김(문 ${glassOf(gallery).length}칸)에서도 액자 3점·4층 카드 도달 가능`);
    }

    // 잠긴 서랍 카드 — 스티커 1장이면 열리므로 미술실 4층 카드여야 한다.
    const lockedCards = cards.filter((c) => c.locked);
    if (lockedCards.length !== 1) err(`잠긴 서랍 카드는 1장이어야 함 (현재 ${lockedCards.length}장)`);
    for (const c of lockedCards) {
      if (c.floor !== 4 || c.at.map !== 'artroom') err(`잠긴 카드 ${c.id}는 미술실(4층) 카드여야 함`);
    }

    // 배틀 — 정답 증거와 paint 탄막 수치 상한 (스펙 §4)
    const artP = (D.BATTLES || {}).artTeacher;
    if (!artP) err('미술 선생님 배틀 프로필이 없음');
    else {
      if (artP.evidence !== 'firstSketch') err('미술 선생님 배틀 정답 증거가 첫 스케치가 아님');
      const paints = (artP.attacks || []).filter((a) => a.kind === 'paint');
      if (!paints.length) err('미술 선생님 탄막에 paint가 없음');
      paints.forEach((a, i) => {
        if (a.speed > 120) err(`paint 탄막이 너무 빠름(${i}): ${a.speed} (저학년 기준 120 이하)`);
        if (!(a.maxStain > 0) || a.maxStain > 3) err(`paint 동시 자국 상한이 이상함(${i}): ${a.maxStain}`);
        if (!(a.stay > 0) || a.stay > 2) err(`paint 자국 지속이 이상함(${i}): ${a.stay}초`);
      });
    }
  }

  // ── 헌법 §3-2: 시작 ~ 첫 배틀까지 대화 상자 5개 이내 / 상자당 2줄 ─────────
  const mate = (D.BATTLES && D.BATTLES.mate) || {};
  const bro = (D.BATTLES && D.BATTLES.bro) || {};
  const boxes = (D.INTRO || []).length + (mate.approach || []).length + (mate.intro || []).length;
  if (boxes > 5) err(`첫 배틀까지 대화 상자 ${boxes}개 > 5개 (기준서 §3-2)`);
  else console.log(`첫 배틀까지 대화 상자: ${boxes}/5개`);
  // 2층 진입 ~ 형 배틀까지도 같은 규칙 (스펙 §5)
  const boxes2 = ((D.FLOOR2 && D.FLOOR2.up) || []).length + ((D.FLOOR2 && D.FLOOR2.enter) || []).length +
    (bro.approach || []).length + (bro.intro || []).length;
  if (boxes2 > 5) err(`2층 진입~형 배틀까지 대화 상자 ${boxes2}개 > 5개 (스펙 §5)`);
  else console.log(`2층 진입~형 배틀까지 대화 상자: ${boxes2}/5개`);
  // 3층도 같은 규칙 (스펙 P3 §5)
  const senior = (D.BATTLES && D.BATTLES.senior) || {};
  const boxes3 = ((D.FLOOR3 && D.FLOOR3.up) || []).length + ((D.FLOOR3 && D.FLOOR3.enter) || []).length +
    (senior.approach || []).length + (senior.intro || []).length;
  if (boxes3 > 5) err(`3층 진입~선배 배틀까지 대화 상자 ${boxes3}개 > 5개 (스펙 §5)`);
  else console.log(`3층 진입~선배 배틀까지 대화 상자: ${boxes3}/5개`);
  // 4층도 같은 규칙 (스펙 P4 §5)
  const artT = (D.BATTLES && D.BATTLES.artTeacher) || {};
  const boxes4 = ((D.FLOOR4 && D.FLOOR4.up) || []).length + ((D.FLOOR4 && D.FLOOR4.enter) || []).length +
    (artT.approach || []).length + (artT.intro || []).length;
  if (boxes4 > 5) err(`4층 진입~미술 선생님 배틀까지 대화 상자 ${boxes4}개 > 5개 (스펙 §5)`);
  else console.log(`4층 진입~미술 선생님 배틀까지 대화 상자: ${boxes4}/5개`);

  const over = [];
  const walkBoxes = (v) => {
    if (!Array.isArray(v)) return;
    if (v.length && v.every((x) => typeof x === 'string')) { if (v.length > 2) over.push(v[0]); return; }
    v.forEach(walkBoxes);
  };
  // 목록·좌표라 2줄 규칙 밖
  const NOT_DIALOG = new Set(['menu', 'attacks', 'adWords', 'fog', 'door', 'samples']);
  [D.INTRO, D.LOOK, D.LOOK2, D.FLOOR2, D.FLOOR3, D.FLOOR4, D.BATTLE_UI, D.CONSOLE, D.STICKER, D.CLEAR]
    .concat(Object.keys(D.BATTLES || {}).map((k) => D.BATTLES[k]))
    .concat(D.RUMORS || [])
    .concat(D.FRAMES || [])
    .concat(D.AUTHORS || [])
    .forEach((o) => {
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

// 오프라인 캐시 정합 — sw.js의 ASSETS가 전부 실재하고, CACHE 해시가 자산과 일치해야 한다.
if (has('sw.js')) {
  const crypto = require('crypto');
  const sw = read('sw.js');
  const assets = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((x) => x);
  for (const a of assets) if (a !== '/' && !has(a)) err(`sw.js ASSETS에 없는 파일: ${a}`);
  for (const f of ['src/art.js', 'src/sound.js', 'src/data.js', 'src/engine.js']) {
    if (!assets.includes(f)) err(`sw.js ASSETS에 런타임 파일 누락: ${f}`);
  }
  const h = crypto.createHash('sha1');
  h.update(read('index.html'));
  for (const a of assets.filter((x) => has(x)).sort()) h.update(fs.readFileSync(path.join(ROOT, a)));
  const tag = 'shadow-school-' + h.digest('hex').slice(0, 8);
  const cur = (sw.match(/shadow-school-[0-9a-f]+/) || [''])[0];
  if (cur !== tag) err(`sw 캐시 해시 불일치(${cur} != ${tag}) — npm run bump 실행`);
} else err('sw.js 없음 (오프라인 캐시)');

// 층당 1,800자 (기준서 총예산 15,000자 중 몫). 현재 구현은 1~4층 = 4개 층.
const SLICE_BUDGET = 7200;
console.log(`텍스트 예산: ${totalKo}/${SLICE_BUDGET}자  ` +
  Object.keys(perFile).map((f) => `${f.replace('src/', '')}=${perFile[f]}`).join(' '));
if (totalKo > SLICE_BUDGET) err(`텍스트 예산 초과: ${totalKo}자 > ${SLICE_BUDGET}자 (스펙 §4)`);

if (errors === 0) console.log('✔ 모든 검사 통과');
else { console.error(`✘ 오류 ${errors}개`); process.exit(1); }
