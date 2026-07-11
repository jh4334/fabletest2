// 플레이테스트 봇 (v3) — 실제 아이의 최속 플레이를 흉내 내 초반 체감을 계측한다.
// 사용법: node tools/playbot.js
//
// 무엇을 재나 (디벨롭안-실사용자-플레이테스트.md의 v1 계측과 비교 가능):
//   · 구간별 대화 탭 수  — 읽기 부담의 대리 지표 (아이는 상자당 5~8초 읽는다)
//   · 구간별 프레임 수   — 60fps 기준 최속 소요 시간의 하한
//   · 첫 배틀 도달까지의 대화 탭 — "첫인상 = 읽기" 리스크 감시
// 한계: 봇은 글을 읽지 않고 즉시 넘기며, 회피를 완벽히 피하지 않는다.
// 수치는 "내용을 다 아는 최속 플레이"의 하한이다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- 헤드리스 하네스 (smoketest와 동일 구조) ----
const listeners = {};
let rafCb = null;
const storage = new Map();
const canvasStub = () => ({
  getContext: () => new Proxy({}, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) :
      k === 'createLinearGradient' || k === 'createRadialGradient'
        ? () => ({ addColorStop() {} }) : () => {}),
  }),
  addEventListener() {}, removeEventListener() {}, focus() {}, blur() {},
  setAttribute() {}, style: {}, width: 720, height: 528,
});
const mainCanvas = canvasStub();
const windowObj = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener: () => {},
  requestAnimationFrame: (cb) => { rafCb = cb; },
};
const sandbox = {
  window: windowObj,
  document: {
    getElementById: (id) => (id === 'game' ? mainCanvas : {
      style: {}, value: '', addEventListener() {}, removeEventListener() {},
      focus() {}, blur() {}, classList: { add() {}, remove() {} },
    }),
    createElement: () => canvasStub(),
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const g = windowObj.__game;

// ---- 계측 도우미 ----
let frames = 0;
let dialogTaps = 0;
function step(n = 1) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; cb(); frames += 1; } }
function dispatch(ev, obj) { for (const fn of (listeners[ev] || []).slice()) fn(Object.assign({ preventDefault() {} }, obj)); }
function tap(key) { dispatch('keydown', { key }); step(2); dispatch('keyup', { key }); }
function hold(key, n) { dispatch('keydown', { key }); step(n); dispatch('keyup', { key }); step(1); }
function advanceDialog(max = 200) {
  for (let i = 0; i < max && g.mode === 'dialog'; i++) { tap('z'); dialogTaps += 1; }
  if (g.mode === 'dialog') throw new Error('대화가 끝나지 않음');
}
function setPos(x, y, dir) {
  g.player.x = x; g.player.y = y; g.player.px = x * 48; g.player.py = y * 48;
  g.player.dir = dir || 'down'; g.player.moving = false;
}

const report = [];
let markFrames = 0, markTaps = 0;
function mark(name) {
  report.push({ 구간: name, 프레임: frames - markFrames, '초(60fps)': ((frames - markFrames) / 60).toFixed(1), '대화 탭': dialogTaps - markTaps });
  markFrames = frames; markTaps = dialogTaps;
}

// ---- 시나리오: 새 모험 → 프롤로그(따라) → 1장 진입 ----
step(5);
tap('z');                       // 슬롯 0 → 이름 입력
g.nameConfirm = true; step(2);  // 기본 이름 시작 → 인트로(컴퓨터실) + 반디 합류
advanceDialog();
mark('오프닝 (컴퓨터실 낙하 + 반디 합류)');

setPos(5, 12, 'left');          // 박사님 (4,12)
tap('z');
advanceDialog();
mark('박사님 첫 대화');

setPos(13, 1, 'up');            // 마을 북쪽 출구로
let warpGuard = 0;
while (g.map === 'village' && warpGuard++ < 6) hold('ArrowUp', 14); // 숲 워프까지 걷는다
if (g.map !== 'forest') throw new Error('숲 워프 실패: ' + g.map);
if (g.mode === 'dialog') advanceDialog();
setPos(7, 9, 'down');           // 따라 (7,10)
tap('z');
advanceDialog();                // 조우 대사 (+ 첫 배틀이면 조작 안내)
if (g.mode !== 'battle') throw new Error('따라 배틀 시작 실패: ' + g.mode);
mark('숲 이동 + 따라 조우 대사 → 첫 배틀 시작');
const firstBattleTaps = dialogTaps;

// 마음 조각 배틀 — 서툰 회피(입력 없음)로 파도를 흘려보내고, 문만 정확히 고른다
function crudeWin() {
  let guard = 0;
  while (g.mode === 'battle' && guard++ < 20000) {
    const b = g.battle;
    if (b.phase === 'wave') {
      // 조각이 있으면 주워 게이지를 올린다 (하트 순간이동 = 최선 플레이 가정)
      if (b.wave.fragments.length) {
        const f = b.wave.fragments[0];
        b.arena.soul.x = f.x; b.arena.soul.y = f.y;
      }
      step(1);
    } else if (b.phase === 'gates') {
      const d = b.gates.doors.find((x) => x.correct && !x.locked) ||
        b.gates.doors.find((x) => !x.locked);
      if (d) { b.arena.soul.x = d.x + d.w / 2; b.arena.soul.y = d.y + d.h / 2; }
      step(1);
    } else if (b.phase === 'mercy') {
      while (g.battle.cursor !== 0) tap('ArrowDown');
      tap('z');
    } else if (b.phase === 'mercyReply') {
      tap('z');
    } else {
      step(1);
    }
    if (g.mode === 'dialog') break; // 탈진(물러남)이면 대화로 나온다
  }
  if (g.mode === 'dialog') advanceDialog();
}
crudeWin();
if (g.mode === 'battle') crudeWin(); // 물러났으면 같은 자리에서 재도전
mark('따라 마음 조각 배틀 (승리·마무리 대사)');

// 마을로 복귀 → 전부 공짜 거리 입구
setPos(13, 18, 'down');
warpGuard = 0;
while (g.map === 'forest' && warpGuard++ < 6) hold('ArrowDown', 14); // 숲 → 마을
setPos(24, 6, 'up');
warpGuard = 0;
while (g.map === 'village' && warpGuard++ < 6) hold('ArrowUp', 14); // 반짝이는 문 → 전부 공짜 거리
if (g.mode === 'dialog') advanceDialog();
mark('마을 복귀 + 1장 「전부 공짜 거리」 진입');

// ---- 리포트 ----
console.log('\n===== 플레이테스트 봇 리포트 (v3 최속 주행) =====');
console.table(report);
console.log(`첫 배틀 시작까지 대화 탭: ${firstBattleTaps}탭 (상자당 2탭 ≈ ${Math.round(firstBattleTaps / 2)}상자)`);
console.log(`누계: ${frames}프레임 ≈ ${(frames / 60).toFixed(1)}초(최속 하한) · 대화 탭 ${dialogTaps}회`);
console.log(`도달 상태: map=${g.map}, 따라 되돌림=${g.flags.defeated.bekkyeomon}, 반디 합류=${g.flags.bandiJoined}`);
if (g.map !== 'freestreet' || !g.flags.defeated.bekkyeomon) {
  console.error('✘ 봇이 1장 입구까지 도달하지 못했습니다');
  process.exit(1);
}
console.log('✔ 프롤로그 → 1장 진입 경로 정상');
