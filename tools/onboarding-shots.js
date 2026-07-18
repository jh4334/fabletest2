// Y-19 교사 온보딩 스크린샷 생성기 — 핵심 6장면(타이틀·방탈출·듣기·패턴·자비·리포트)을
// node-canvas로 실제 게임 화면을 렌더해 PNG로 저장한다. docs/교사-온보딩-5분.md가 이 경로를 참조한다.
// 사용법: node tools/onboarding-shots.js   (네트워크 불필요 — 로컬 렌더)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas } = require('canvas');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots');
fs.mkdirSync(OUT, { recursive: true });

// ---- DOM/환경 스텁 (shots.js와 같은 방식) ----
const mainCanvas = createCanvas(720, 528);
mainCanvas.addEventListener = () => {};
mainCanvas.removeEventListener = () => {};
mainCanvas.focus = () => {};
mainCanvas.blur = () => {};
mainCanvas.setAttribute = () => {};
mainCanvas.style = mainCanvas.style || {};
function stubEl() {
  return { style: {}, value: '', addEventListener() {}, removeEventListener() {},
    focus() {}, blur() {}, classList: { add() {}, remove() {} } };
}
const listeners = {};
let rafCb = null;
const storage = new Map();

function v3Flags(extra) {
  return Object.assign({
    talkedProf: true, bandiJoined: true, bandiRevealed: false, bandiSaid: {},
    defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: false,
      yuhokmon: false, hollimmon: false, finalboss: false, yeongi: false },
    mercyChoice: { bekkyeomon: 'mercy' },
    chapter1Clear: true, chapter1Mercy: true,
    chapter2Clear: true, chapter2Mercy: false,
    mercy: 3, visited: {}, trueEnding: false, correctCount: 52, battleCount: 9,
    evCards: ['ev_maker', 'ev_minimal', 'ev_footprint'], endingId: null,
  }, extra || {});
}
storage.set('ai-ethics-adventure-slot-0', JSON.stringify({
  v: 3, name: '도도', map: 'freestreet', x: 18, y: 21, flags: v3Flags(), updatedAt: Date.now(),
}));
storage.set('ai-ethics-adventure-slot-1', JSON.stringify({
  v: 3, name: '하늘', map: 'village', x: 13, y: 16,
  flags: { talkedProf: true, bandiJoined: true, defeated: {}, mercy: 1, visited: {} }, updatedAt: Date.now(),
}));
storage.set('ai-ethics-adventure-endings', JSON.stringify({ home: true }));

const windowObj = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener: () => {},
  requestAnimationFrame: (cb) => { rafCb = cb; },
};
const sandbox = {
  window: windowObj,
  document: {
    getElementById: (id) => (id === 'game' ? mainCanvas : stubEl()),
    createElement: () => createCanvas(16, 16),
    body: { classList: { add() {}, remove() {}, toggle() {} } },
  },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  requestAnimationFrame: windowObj.requestAnimationFrame,
  console, Math, Set, Map, JSON, Object, setTimeout, clearTimeout, Date,
};
vm.createContext(sandbox);
for (const f of ['src/sprites.js', 'src/audio.js', 'src/data.js', 'src/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const g = windowObj.__game;

function step(n = 1) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; cb(); } }
function dispatch(ev, obj) { for (const fn of (listeners[ev] || []).slice()) fn(Object.assign({ preventDefault() {} }, obj)); }
function tap(key) { dispatch('keydown', { key }); step(2); dispatch('keyup', { key }); }
function advanceDialog(max = 100) { for (let i = 0; i < max && g.mode === 'dialog'; i++) tap('z'); }
function shot(name) {
  step(1);
  fs.writeFileSync(path.join(OUT, name), mainCanvas.toBuffer('image/png'));
  console.log('  saved shots/' + name);
}
function setPlayer(x, y, dir) {
  g.player.x = x; g.player.y = y; g.player.px = x * 48; g.player.py = y * 48; g.player.dir = dir || 'down';
}

console.log('온보딩 스크린샷 생성 (6장면):');

// 1) 타이틀 — 여덟 조각 퍼레이드 + 세이브 슬롯
g.time = 40;
shot('onboarding-1-title.png');

// 2) 방탈출 거리 탐험 — 자유 픽셀 이동으로 문·장치·단서를 살피는 본편 월드(1장 「전부 공짜 거리」)
g.currentSlot = 0; g.playerName = '도도';
g.flags = v3Flags();
g.mode = 'world'; g.map = 'freestreet';
setPlayer(18, 21, 'up');
g.time = 24;
shot('onboarding-2-escape.png');

// 3~5) 설득 배틀 — 실제 조우(따라)를 키 입력으로 구동해 찍는다(듣기·패턴·자비)
g.dialog = null; g.mode = 'world'; g.map = 'forestdeep';
g.flags = v3Flags({
  defeated: { bekkyeomon: false, sujipmon: false, pyeonhyangmon: false, hwangakmon: false,
    yuhokmon: false, hollimmon: false, finalboss: false, yeongi: false },
  chapter1Clear: false, chapter2Clear: false, mercy: 0, evCards: [],
  introForestTrace: true, ttaraFirstEncounter: true, // 첫 조우 연출 없이 곧장 배틀로
});
setPlayer(12, 4, 'down');
tap('z');
advanceDialog(); // 등장 대사 → 내 턴 메뉴
if (!g.battle) throw new Error('배틀 스크린샷 실패 — 조우가 시작되지 않음: ' + g.mode);

// 내 턴 메뉴 → 「가만히 듣기」 → 반응 대사(타자기)를 넘겨 상대 턴(탄막)까지 진행하는 헬퍼
function toWave() {
  if (g.battle && g.battle.phase === 'menu') { g.battle.menuIdx = 2; tap('z'); }
  for (let i = 0; i < 14 && g.battle && g.battle.phase !== 'wave'; i++) tap('z');
}
// 첫 파도는 연습(무피해 리허설 — 탄막 억제)이라, 실제 탄막·패턴을 보이려면 2파도로 넘어간다.
toWave();
if (g.battle && g.battle.phase === 'wave') { g.battle.wave.t = g.battle.wave.dur; step(3); } // 연습 파도 종료 → 내 턴
toWave(); // 2파도 — 탄막이 실제로 나온다

// 3) 듣기 — 상대의 탄막 턴(가만히 듣기): 마음의 파도를 피하며 버틴다
step(40); // 탄막이 화면에 깔릴 때까지(패턴 그림자는 아직 옅다)
shot('onboarding-3-listen.png');

// 4) 패턴 — 「그림자 하트」가 내 자취를 따라온다(보스의 이름이 곧 패턴)
if (g.battle && g.battle.phase === 'wave') {
  // 하트를 좌우로 움직여 자취를 남기면 그림자(패턴)가 뚜렷해진다(자취 90프레임이면 등장)
  for (let i = 0; i < 100 && g.battle && g.battle.phase === 'wave'; i++) {
    const key = (i % 20 < 10) ? 'ArrowRight' : 'ArrowLeft';
    dispatch('keydown', { key }); step(1); dispatch('keyup', { key });
  }
}
shot('onboarding-4-pattern.png');

// 5) 자비 — 게이지 만충 → 마음을 안아 주기(승패가 아니라 마음이 열림)
if (g.battle) {
  g.battle.gauge = g.battle.gaugeMax; step(2);           // 탄막 턴 종료 → 내 턴(spareReady)
  for (let i = 0; i < 6 && g.battle && g.battle.phase !== 'menu'; i++) step(1);
  if (g.battle && g.battle.phase === 'menu') { g.battle.menuIdx = 3; tap('z'); } // 「마음 안아 주기」 → 마음의 선택
  step(2);
}
shot('onboarding-5-mercy.png');

// 6) 리포트 — 교사용 학생 진단 리포트(약점 주제 → 추천 차시 연결)
g.battle = null; g.dialog = null;
g.currentSlot = 0; g.playerName = '수호자';
storage.set('ai-ethics-adventure-stats-0', JSON.stringify({
  privacy: { correct: 6, total: 6 }, copyright: { correct: 5, total: 6 },
  fake: { correct: 4, total: 5 }, bias: { correct: 2, total: 5 },
  balance: { correct: 3, total: 4 }, manners: { correct: 5, total: 5 },
  safety: { correct: 1, total: 3 }, transparency: { correct: 4, total: 6 },
}));
g.mode = 'report';
g.report = { ret: 'title', slot: 0, toast: 0 };
g.time = 20;
shot('onboarding-6-report.png');

console.log('완료. shots/onboarding-*.png 6장 생성.');
