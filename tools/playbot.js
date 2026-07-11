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
function pickChoice(idx) {
  if (g.mode !== 'choice') throw new Error('선택 모드가 아님: ' + g.mode);
  let guard = 0;
  while (g.choice.cursor !== idx) { tap('ArrowDown'); if (guard++ > 20) throw new Error('선택 커서 이동 실패'); }
  tap('z');
}
function enterZone(x, y, key, expectMap) {
  const dirOf = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  setPos(x, y, dirOf[key]);
  let guard = 0;
  const from = g.map;
  while (g.map === from && guard++ < 6) hold(key, 14);
  if (g.map !== expectMap) {
    throw new Error(expectMap + ' 진입 실패: map=' + g.map + ' mode=' + g.mode +
      ' pos=(' + g.player.x + ',' + g.player.y + ')' +
      (g.dialog ? ' dialog=' + JSON.stringify(g.dialog.lines[0]).slice(0, 60) : ''));
  }
  if (g.mode === 'dialog') advanceDialog(); // 첫 방문 인트로 포함 계측
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

// ---- 시나리오: 새 모험 → 실험실 방탈출 → 숲 → 따라 → 마을 → 1장 진입 ----
step(5);
tap('z');                       // 슬롯 0 → 이름 입력
g.nameConfirm = true; step(2);  // 기본 이름 시작 → 인트로(실험실) + 반디 합류
advanceDialog();
mark('오프닝 (실험실에서 눈뜸 + 반디 합류)');

// 프롤로그 실험실 — 단서 3개를 모아 문을 연다
setPos(4, 4, 'up'); tap('z'); advanceDialog();      // 단서① 태블릿
setPos(22, 6, 'right'); tap('z'); advanceDialog();  // 단서② 모니터
setPos(6, 13, 'up'); tap('z'); advanceDialog();     // 단서③ 포스트잇
if (!g.flags.introDoorOpen) throw new Error('실험실 문이 안 열림');
setPos(14, 16, 'down');
let warpGuard = 0;
while (g.map === 'introlab' && warpGuard++ < 6) hold('ArrowDown', 14); // 출구 → 숲
if (g.map !== 'forest') throw new Error('숲 진입 실패: ' + g.map);
if (g.mode === 'dialog') advanceDialog();
mark('실험실 방탈출 (단서 3개 → 출구)');

// 정적의 숲 — 흔적을 따라 안쪽 공터로
setPos(17, 16, 'left'); tap('z'); advanceDialog();  // 노란 발자국(흔적)
setPos(8, 6, 'up');
warpGuard = 0;
while (g.map === 'forest' && warpGuard++ < 6) hold('ArrowUp', 14);   // 안쪽 공터
if (g.map !== 'forestdeep') throw new Error('안쪽 공터 진입 실패: ' + g.map);
if (g.mode === 'dialog') advanceDialog();
setPos(12, 4, 'down');          // 따라 (12,5)
tap('z');
advanceDialog();                // 첫 조우 연출 + 조작 안내 → 배틀
if (g.mode !== 'battle') throw new Error('따라 배틀 시작 실패: ' + g.mode);
mark('숲 추적 + 따라 조우 대사 → 첫 배틀 시작');
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

// 마을로 이동 → 박사 첫 대화 → 전부 공짜 거리 입구
// (숲 남쪽 출구 경로는 걷기 좌표가 길어 계측 왜곡이 커서, 맵 점프로 대체 — 대화 탭만 계측)
g.dialog = null; g.mode = 'world'; g.map = 'village';
setPos(5, 12, 'left');          // 박사님 (4,12)
tap('z');
advanceDialog();
mark('마을 — 박사님 첫 대화');

setPos(24, 6, 'up');
warpGuard = 0;
while (g.map === 'village' && warpGuard++ < 6) hold('ArrowUp', 14); // 반짝이는 문 → 전부 공짜 거리
if (g.mode === 'dialog') advanceDialog();
mark('1장 「전부 공짜 거리」 진입');

// ── 1장 구역① 살금의 접수처 — 정보를 하나도 내주지 않고 일반 출구로 (최선 플레이) ──
enterZone(6, 6, 'ArrowUp', 'traceroom');
setPos(3, 11, 'up'); tap('z');          // 일반 출구
pickChoice(0); advanceDialog();          // 닉네임만 주고 나간다 → 클리어
if (!g.flags.evCards.includes('ev_minimal')) throw new Error('접수처 보상 카드 없음');
mark('1장 구역① 접수처 (무제공 클리어)');

// ── 1장 구역② 게시판 광장 — 떠도는 사본 3개 회수 ──
enterZone(28, 6, 'ArrowUp', 'boardplaza');
for (let i = 0; i < 3; i++) {
  const c = g.puzzleRun.copies.find((cc) => !cc.got);
  g.player.px = c.px; g.player.py = c.py;
  g.player.x = Math.round(c.px / 48); g.player.y = Math.round(c.py / 48);
  step(1);
  if (g.mode === 'dialog') advanceDialog();
}
if (!g.flags.evCards.includes('ev_footprint')) throw new Error('광장 보상 카드 없음');
mark('1장 구역② 게시판 광장 (사본 3 회수)');

// ── 1장 구역③ 배달 창고 — 차단 레버 정답 순서 ──
enterZone(5, 17, 'ArrowDown', 'warehouse');
setPos(11, 10, 'up'); tap('z'); pickChoice(0); advanceDialog(); // 1호 → 달
setPos(6, 10, 'up'); tap('z'); pickChoice(0); advanceDialog();  // 2호 → 별
setPos(16, 10, 'up'); tap('z'); pickChoice(0); advanceDialog(); // 3호 → 나비 → 클리어
if (!g.flags.evCards.includes('ev_consent')) throw new Error('창고 보상 카드 없음');
mark('1장 구역③ 배달 창고 (레버 3)');

// ── 금고 개방 → 담아 설득 배틀 ──
enterZone(17, 5, 'ArrowUp', 'ownerroom');
setPos(5, 3, 'up'); tap('z');
advanceDialog();
if (g.mode !== 'battle') throw new Error('담아 배틀 시작 실패: ' + g.mode);
crudeWin();
if (g.mode === 'battle') crudeWin();
if (!g.flags.chapter1Clear) throw new Error('1장 클리어 실패');
mark('1장 보스 「담아」 설득 배틀');

// ── 2장 진입 → 구역① 메아리 골목 (다른 목소리 3) ──
enterZone(36, 15, 'ArrowRight', 'tiltstreet');
enterZone(5, 6, 'ArrowUp', 'echoalley');
setPos(5, 4, 'up'); tap('z'); advanceDialog();
setPos(11, 4, 'up'); tap('z'); advanceDialog();
setPos(17, 4, 'up'); tap('z'); advanceDialog();   // 3번째 → 클리어
if (!g.flags.evCards.includes('ev_othervoice')) throw new Error('메아리 골목 보상 없음');
mark('2장 구역① 메아리 골목 (목소리 3)');

// ── 2장 구역② 표본 창고 (반례 3 + 판독기 3) ──
enterZone(22, 6, 'ArrowUp', 'samplehouse');
setPos(4, 4, 'up'); tap('z'); advanceDialog();
setPos(11, 4, 'up'); tap('z'); advanceDialog();
setPos(18, 4, 'up'); tap('z'); advanceDialog();
for (let i = 0; i < 3; i++) { setPos(11, 9, 'up'); tap('z'); pickChoice(0); advanceDialog(); }
if (!g.flags.evCards.includes('ev_scale')) throw new Error('표본 창고 보상 없음');
mark('2장 구역② 표본 창고 (반례 3 + 판독 3)');

// ── 2장 구역③ 꺼진 거리 (램프 3) ──
enterZone(5, 16, 'ArrowUp', 'dimstreet');
setPos(8, 12, 'up'); tap('z'); advanceDialog();
setPos(11, 10, 'up'); tap('z'); advanceDialog();
setPos(14, 12, 'up'); tap('z'); advanceDialog();  // 3번째 → 클리어
if (!g.flags.evCards.includes('ev_mypath')) throw new Error('꺼진 거리 보상 없음');
mark('2장 구역③ 꺼진 거리 (램프 3)');

// ── 저울 0/3 → 기울 설득 배틀 ──
enterZone(14, 3, 'ArrowUp', 'gatekeeper');
setPos(7, 3, 'up'); tap('z');
advanceDialog();
if (g.mode !== 'battle') throw new Error('기울 배틀 시작 실패: ' + g.mode);
crudeWin();
if (g.mode === 'battle') crudeWin();
if (!g.flags.chapter2Clear) throw new Error('2장 클리어 실패');
mark('2장 보스 「기울」 설득 배틀');

// ---- 리포트 ----
console.log('\n===== 플레이테스트 봇 리포트 (v3 최속 주행) =====');
console.table(report);
console.log(`첫 배틀 시작까지 대화 탭: ${firstBattleTaps}탭 (상자당 2탭 ≈ ${Math.round(firstBattleTaps / 2)}상자)`);
console.log(`누계: ${frames}프레임 ≈ ${(frames / 60).toFixed(1)}초(최속 하한) · 대화 탭 ${dialogTaps}회`);
console.log(`도달 상태: map=${g.map}, 1장=${g.flags.chapter1Clear}, 2장=${g.flags.chapter2Clear}, 반디=${g.flags.bandiJoined}`);
if (!g.flags.chapter1Clear || !g.flags.chapter2Clear) {
  console.error('✘ 봇이 2장 클리어까지 도달하지 못했습니다');
  process.exit(1);
}
console.log('✔ 프롤로그 → 1장 → 2장 클리어 경로 정상');
