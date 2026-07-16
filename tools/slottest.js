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

console.log(`\n✔ 슬롯 테스트 통과 (${passed}개 검사)`);
