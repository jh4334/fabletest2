// 세이브 슬롯 시스템 테스트 (Node.js)
// - 기존 단일 세이브의 슬롯 0 이전(마이그레이션)
// - 슬롯 선택/이름 입력/이어하기/삭제 흐름
// 사용법: node tools/slottest.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 50 });
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeCanvas(w, h) {
  return { width: w || 0, height: h || 0, getContext: () => makeCtx(), addEventListener() {} };
}

// 미리 옛 단일 세이브를 심어 둔다 (스테이지 6 진행 중인 저장본)
const storage = new Map();
const oldSave = {
  map: 'serverroom', x: 7, y: 9,
  flags: {
    talkedProf: true,
    badges: { forest: true, lake: true, cave: true },
    defeated: { hondonmon: true, meotdaeromon: true, tteonemgimon: true, hollimmon: true, finalboss: true },
    mercy: 11, visited: {}, trueEnding: false, correctCount: 40, battleCount: 18,
  },
};
storage.set('ai-ethics-adventure-v1', JSON.stringify(oldSave));

const listeners = {};
let rafCb = null;
const windowObj = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener: (ev, fn) => {
    const a = listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  },
  requestAnimationFrame: (cb) => { rafCb = cb; },
};
const sandbox = {
  window: windowObj,
  document: {
    getElementById: (id) => (id === 'game' ? makeCanvas(720, 528) : makeCanvas()),
    createElement: () => makeCanvas(),
    body: { classList: { add() {}, remove() {}, toggle() {} } },
  },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  requestAnimationFrame: windowObj.requestAnimationFrame,
  console, Math, Set, Map, JSON, Object, setTimeout, clearTimeout,
};
vm.createContext(sandbox);
for (const f of ['src/sprites.js', 'src/audio.js', 'src/data.js', 'src/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const g = windowObj.__game;

function step(n = 1) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; cb(); } }
function dispatch(ev, obj) { for (const fn of (listeners[ev] || []).slice()) fn(Object.assign({ preventDefault() {} }, obj)); }
function tap(key) { dispatch('keydown', { key }); step(2); dispatch('keyup', { key }); }
function slot(i) { const r = storage.get('ai-ethics-adventure-slot-' + i); return r ? JSON.parse(r) : null; }

let passed = 0;
function check(name, cond) {
  if (cond) { console.log('  ✔ ' + name); passed++; }
  else { console.error('  ✘ ' + name); process.exit(1); }
}

console.log('[1] 기존 단일 세이브 → 슬롯 0 이전(마이그레이션)');
step(5);
check('옛 세이브 키는 제거됨', !storage.get('ai-ethics-adventure-v1'));
check('슬롯 0으로 이전됨', !!slot(0));
check('이전된 진행도 보존 (스테이지 6)', slot(0).flags.defeated.finalboss === true);
check('이전된 이름 기본값', slot(0).name === '수호자');
check('타이틀에서 슬롯 0이 채워져 보임', g.mode === 'title' && g.titleScreen === 'slots');

console.log('[2] 슬롯 0 이어하기');
tap('z'); // 슬롯 0(채워짐) → 이어하기
check('이어하기로 월드 진입', g.mode === 'world');
check('사라진 v1 맵(serverroom) 세이브는 마을로 안전 이동(v3 마이그레이션)', g.map === 'village');
check('현재 슬롯 0', g.currentSlot === 0);
check('이어하기 시 진행도 유지', g.flags.defeated.finalboss === true && g.flags.mercy === 11);

console.log('[3] 진행 시 슬롯 0에만 저장, 다른 슬롯은 비어 있음');
check('슬롯 1 비어 있음', !slot(1));
check('슬롯 2 비어 있음', !slot(2));

console.log('[4] 빈 슬롯에 새 모험 만들기 (슬롯 1)');
// 강제로 타이틀로 되돌려 슬롯 흐름 재현
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 0;
tap('ArrowDown'); // 슬롯 1로 이동
check('커서 슬롯 1', g.slotCursor === 1);
tap('z'); // 빈 슬롯 → 이름 입력
check('이름 입력 화면', g.titleScreen === 'name');
g.nameConfirm = true; step(2); // 기본 이름으로 시작 → 인트로 대화
check('새 모험 시작 (슬롯 1)', (g.mode === 'dialog' || g.mode === 'world') && g.currentSlot === 1);
check('슬롯 1 새로 저장됨', !!slot(1) && slot(1).flags.defeated.finalboss !== true);
check('슬롯 0은 그대로 보존', slot(0).flags.defeated.finalboss === true);

console.log('[5] 슬롯 삭제 흐름');
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 1;
tap('x'); // 삭제 확인
check('삭제 확인 화면', g.titleScreen === 'delete');
tap('x'); // 취소
check('취소하면 슬롯 유지', g.titleScreen === 'slots' && !!slot(1));
tap('x'); // 다시 삭제 확인
tap('z'); // 삭제 실행
check('슬롯 1 삭제됨', !slot(1));
check('슬롯 0은 영향 없음', !!slot(0));

console.log('[6] 막힌 위치에 저장된 세이브 → 안전 칸 보정 (갇힘 방지)');
const { MAPS, WALKABLE } = vm.runInContext('({ MAPS, WALKABLE })', sandbox);
// village (0,0)은 'T'(나무, 이동 불가). 손상/구버전 세이브를 흉내 낸다.
storage.set('ai-ethics-adventure-slot-2', JSON.stringify({
  name: '테스트', map: 'village', x: 0, y: 0,
  flags: { talkedProf: true, badges: {}, defeated: {}, mercy: 0, visited: {} }, updatedAt: Date.now(),
}));
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 2;
tap('z'); // 슬롯 2 이어하기
check('막힌 위치에서도 월드 진입', g.mode === 'world');
const landed = MAPS[g.map].tiles[g.player.y][g.player.x];
check('이동 가능한 칸으로 보정됨', WALKABLE.has(landed));
check('원래 막힌 칸(0,0)이 아님', !(g.map === 'village' && g.player.x === 0 && g.player.y === 0));
check('px/py가 NaN이 아님', Number.isFinite(g.player.px) && Number.isFinite(g.player.py));

console.log('[7] 플래그 없는 손상 세이브 → 예외 없이 처리 (로드 불능 방지)');
// 마이그레이터는 flags 없는 행을 그대로 통과시킨다(if (!data || !data.flags) return data).
// 타이틀은 slotSummary가 null이라 빈 슬롯 취급하지만, 「선생님 방 > 학급 모드」는
// loadSlot 결과를 직접 읽어 s.flags.defeated 접근에서 TypeError가 날 수 있었다.
storage.set('ai-ethics-adventure-slot-2', JSON.stringify({ v: 1, name: '깨진세이브', map: 'village', x: 13, y: 16 }));
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 2;
tap('z'); // 빈 슬롯 취급 → 이름 입력(크래시 아님)
check('손상 세이브는 새 모험 안내로 진입', g.titleScreen === 'name');
tap('Escape'); step(2);
check('타이틀로 복귀', g.mode === 'title');
g.flags = null; g.titleScreen = 'slots'; g.slotCursor = 2; // 세션 미로드 상태 재현
tap('t'); // 선생님 방
check('선생님 방 진입', g.mode === 'teacher');
tap('ArrowDown'); tap('ArrowDown'); // dashboard → report → classmode
tap('z'); // 학급 모드 — 플래그 없는 슬롯을 미리 로드해도 예외가 없어야 한다
check('학급 모드 예외 없이 진입', g.mode !== 'teacher');
check('flags가 새로 채워짐', !!g.flags && typeof g.flags.defeated === 'object');

// ── W-1 세이브 마이그레이션 골든 픽스처 테스트 ──
// v3·v5·v8 세대의 "골든 세이브"를 심고, loadSlot의 마이그레이션 사슬이 (a) 필수 플래그를
// 모두 채우고 (b) talkedProf 파생 추론이 정확하며 (c) defeated 승계가 유지되고
// (d) v9 미래 필드가 roundtrip에서 사라지지 않는지 검사한다.
console.log('[W-1] 세이브 마이그레이션 골든 픽스처 (v3·v5·v8·v9 미래필드)');
{
  const T = windowObj.__test;
  const put = (i, obj) => storage.set('ai-ethics-adventure-slot-' + i, JSON.stringify(obj));

  // (v3 골든) — 옛 세대. V4~V8 사슬을 전부 거친다.
  put(0, { v: 3, name: '골든3', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true }, mercy: 5, visited: {} } });
  const s3 = T.loadSlot(0);
  check('W-1 v3→최신 버전 상승(v=8)', s3.v === 8);
  check('W-1 v3 필수 플래그 채워짐(introClue1·prologueClosed·privacyLeak 정의)',
    s3.flags.introClue1 !== undefined && s3.flags.prologueClosed !== undefined && s3.flags.privacyLeak === 0);
  check('W-1 v3 talkedProf 파생 추론 — introClue1 = !!talkedProf = true', s3.flags.introClue1 === true);
  check('W-1 v3 defeated 승계 유지', s3.flags.defeated.bekkyeomon === true && s3.flags.defeated.sujipmon === true);
  check('W-1 v3 defeated 파생 — prologueClosed = !!defeated.bekkyeomon = true', s3.flags.prologueClosed === true);

  // (v5 골든) — introClue*는 이미 있으나 ttaraFirstEncounter·privacy·prologueClosed 미정
  put(1, { v: 5, name: '골든5', map: 'freestreet', x: 18, y: 21,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true }, mercy: 8, visited: {},
      introClue1: true, introClue2: true, introClue3: true, introDoorOpen: true, introForestTrace: true } });
  const s5 = T.loadSlot(1);
  check('W-1 v5→최신 버전 상승(v=8)', s5.v === 8);
  check('W-1 v5 ttaraFirstEncounter 파생 = !!defeated.bekkyeomon = true', s5.flags.ttaraFirstEncounter === true);
  check('W-1 v5 defeated 3인 승계 유지', s5.flags.defeated.pyeonhyangmon === true);
  check('W-1 v5 privacy 필드 기본값 채워짐', s5.flags.privacyLeak === 0 && s5.flags.privacyRecoveryActive === false);

  // (v8 골든) — 클리어 세이브. 필드 유지 + 이미 최신이라 변형 없음.
  put(2, { v: 8, name: '골든8', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true, finalboss: true, yeongi: true },
      mercy: 8, visited: {}, introClue1: true, introForestTrace: true, ttaraFirstEncounter: true,
      privacyLeak: 0, privacyRecovery: 0, privacyRecoveryActive: false, prologueClosed: true, forestClearingRead: true,
      endingId: 'home' } });
  const s8 = T.loadSlot(2);
  check('W-1 v8 그대로 유지(v=8) + endingId 보존', s8.v === 8 && s8.flags.endingId === 'home');
  check('W-1 v8 클리어 슬롯 요약 — done/endingId 노출', (() => { const sm = T.slotSummary(2); return sm && sm.done === true && sm.endingId === 'home'; })());

  // (v9 미래 필드 roundtrip) — 알려지지 않은 상위·flags 필드가 load→write→load에서 살아남아야 한다.
  // 마이그레이터가 손대지 않도록 각 세대 가드 플래그를 갖춰 v9를 '이미 최신'으로 통과시킨다.
  put(0, { v: 9, name: '미래', map: 'village', x: 13, y: 16, futureTop: 'KEEP_ME',
    flags: { talkedProf: true, defeated: {}, mercy: 0, visited: {},
      introClue1: true, introForestTrace: true, ttaraFirstEncounter: true, privacyLeak: 0, prologueClosed: true,
      futureFlag: 42 } });
  const s9 = T.loadSlot(0);
  // 참고: 마이그레이션 사슬은 v를 알려진 최신(8)으로 정규화하지만, '모르는 필드'는 지우지 않는다.
  check('W-1 v9 미래 상위 필드 보존(load)', s9.futureTop === 'KEEP_ME');
  check('W-1 v9 미래 flags 필드 보존(load)', s9.flags.futureFlag === 42);
  T.writeSlot(0, s9); // roundtrip — 다시 저장 후 재로드
  const s9b = T.loadSlot(0);
  check('W-1 v9 roundtrip — 미래 필드가 사라지지 않음', s9b.futureTop === 'KEEP_ME' && s9b.flags.futureFlag === 42);

  // 정리 — 다음 블록(U-5)이 슬롯을 재사용하므로 비운다
  storage.delete('ai-ethics-adventure-slot-0');
  storage.delete('ai-ethics-adventure-slot-1');
  storage.delete('ai-ethics-adventure-slot-2');
}

// ── U-5 NG+ 타이틀 흐름 — 클리어 슬롯에서 두 번째 모험 선택 ──
console.log('[U-5] NG+ 타이틀 흐름 — 클리어 슬롯 선택 → 이어보기 / 처음부터(2회차)');
{
  const T = windowObj.__test;
  // 클리어 세이브를 슬롯 0에, 진행 중(미클리어) 세이브를 슬롯 1에 둔다
  storage.set('ai-ethics-adventure-slot-0', JSON.stringify({ v: 8, name: '클리어아이', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true, finalboss: true, yeongi: true },
      mercy: 8, visited: {}, introClue1: true, introForestTrace: true, ttaraFirstEncounter: true,
      privacyLeak: 0, prologueClosed: true, forestClearingRead: true, endingId: 'home' }, updatedAt: Date.now() }));
  storage.set('ai-ethics-adventure-slot-1', JSON.stringify({ v: 8, name: '진행중아이', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true }, mercy: 1, visited: {}, introClue1: true,
      introForestTrace: true, ttaraFirstEncounter: true, privacyLeak: 0, prologueClosed: true }, updatedAt: Date.now() }));

  // 클리어 슬롯에서 Z → 두 번째 모험 선택 화면
  g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 0;
  tap('z');
  check('U-5 클리어 슬롯 Z → 선택 화면(ngchoice) 표시', g.titleScreen === 'ngchoice');

  // "★ 두 번째 모험" (커서 1) 선택 → NG+ 새 게임 시작
  tap('ArrowDown');
  check('U-5 커서 이동 — 두 번째 모험(1)', g.ngCursor === 1);
  tap('z');
  check('U-5 처음부터(2회차) → flags.ng = true', g.flags.ng === true);
  check('U-5 이름은 클리어 세이브에서 이어받음', g.playerName === '클리어아이');
  check('U-5 새 모험 진행 초기화 — 프롤로그(defeated 없음)', g.currentSlot === 0 &&
    !(g.flags.defeated && g.flags.defeated.yeongi));

  // 취소 흐름 — ngchoice에서 X면 슬롯 화면으로 복귀
  // (앞서 startNewGame이 슬롯 0을 새 NG 세이브로 덮어썼으므로 클리어 세이브를 다시 심는다)
  storage.set('ai-ethics-adventure-slot-0', JSON.stringify({ v: 8, name: '클리어아이', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true, finalboss: true, yeongi: true },
      mercy: 8, visited: {}, introClue1: true, introForestTrace: true, ttaraFirstEncounter: true,
      privacyLeak: 0, prologueClosed: true, forestClearingRead: true, endingId: 'home' }, updatedAt: Date.now() }));
  g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 0; g.flags = null;
  tap('z');
  check('U-5 다시 클리어 슬롯 Z → ngchoice', g.titleScreen === 'ngchoice');
  tap('x');
  check('U-5 ngchoice에서 X → 슬롯 화면 복귀', g.titleScreen === 'slots');

  // 정상(미클리어) 슬롯은 영향 없음 — Z가 곧장 이어하기(ngchoice 안 뜸)
  g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 1;
  tap('z');
  check('U-5 미클리어 슬롯은 ngchoice 없이 바로 이어하기', g.titleScreen !== 'ngchoice' &&
    (g.mode === 'world' || g.mode === 'dialog') && g.flags.ng !== true);

  storage.delete('ai-ethics-adventure-slot-0');
  storage.delete('ai-ethics-adventure-slot-1');
}

console.log('[X-round] 세이브 스키마 — 신규 플래그 기본값·수업 세션 무누출·반응 선택 보존');
{
  const T = windowObj.__test;
  const nf = T.newFlags();
  check('X 신규 플래그 기본값(playerVoice/{}·damaAsked·banjjakAsked·classSession/false 등)',
    nf.playerVoice && Object.keys(nf.playerVoice).length === 0 && nf.damaAsked === null &&
    nf.banjjakAsked === null && nf.classSession === false && nf.mercyGuideShown === false &&
    nf.epilogueAsked === false);
  check('X-8 classSession은 수업 진입에서만(setupClassBaseFlags=true, newFlags=false, 일반 세이브 무누출)',
    T.setupClassBaseFlags().classSession === true && T.newFlags().classSession === false);
  // 반응 선택·요청 플래그가 세이브에 실려 왕복 보존되는지(writeSlot→loadSlot roundtrip).
  const save = { v: 9, name: '수호자', map: 'village', x: 13, y: 16,
    flags: Object.assign(T.newFlags(), { playerVoice: { ttara: 1, yeongi: 0 }, damaAsked: 'think', banjjakAsked: 'watch' }) };
  T.writeSlot(2, save);
  const loaded = T.loadSlot(2);
  check('X 반응/요청 선택 플래그 세이브 왕복 보존', loaded.flags.playerVoice.ttara === 1 &&
    loaded.flags.playerVoice.yeongi === 0 && loaded.flags.damaAsked === 'think' && loaded.flags.banjjakAsked === 'watch');
  storage.delete('ai-ethics-adventure-slot-2');
}

console.log(`\n✔ 슬롯 테스트 통과 (${passed}개 검사)`);
