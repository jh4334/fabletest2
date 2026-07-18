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
  // X-1/X-2 반응 선택(정답 없음, game.choice.reaction 태그)은 0번을 골라 흘려보낸다.
  // 태그 없는 선택창(퍼즐·관문 문답 등)에서는 멈춘다 — 각 호출부가 정답을 따로 고른다.
  for (let i = 0; i < max; i++) {
    if (g.mode === 'dialog') { tap('z'); dialogTaps += 1; continue; }
    if (g.mode === 'choice' && g.choice && g.choice.reaction) { g.choice.cursor = 0; tap('z'); dialogTaps += 1; continue; }
    break;
  }
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
  step(14); // 직전 워프의 쿨다운(12프레임)이 남아 있으면 워프 칸을 그냥 지나친다
  let guard = 0;
  const from = g.map;
  while (g.map === from && guard++ < 6) {
    hold(key, 14);
    // 장 관문 문답(Q-4) — 이야기를 읽어 온 아이처럼 정답을 고른다.
    // (GATE_QUIZ의 options[0]이 정답 원문 — 화면에는 섞여 나온다)
    if (g.mode === 'choice' && g.choice) {
      const GQ = vm.runInContext('GATE_QUIZ', sandbox);
      const answers = Object.values(GQ).map((q) => q.options[0]);
      const idx = g.choice.options.findIndex((t) => answers.includes(t));
      g.choice.cursor = Math.max(0, idx);
      tap('z'); dialogTaps += 1;              // 정답 선택
      if (g.mode === 'dialog') advanceDialog(); // "문이 열렸다" 대사
    }
  }
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
  // M-2 턴제: [내 턴 메뉴] ↔ [상대 턴 탄막]을 오가며 최선 플레이로 마음을 연다.
  //   닫힘 → 가만히 듣기(속마음 즉시 공개), 동요/열림 → 말 걸기 정답(잠기면 듣기),
  //   만충(spareReady) → 마음 안아 주기 → 자비.
  let guard = 0;
  while ((g.mode === 'battle' || g.mode === 'choice') && guard++ < 20000) {
    // X-1④ 영이 자비 선택 직전의 반응 선택(정답 없음) — 0번을 골라 진행한다.
    if (g.mode === 'choice') {
      if (g.choice && g.choice.reaction) { g.choice.cursor = 0; tap('z'); dialogTaps += 1; continue; }
      break;
    }
    const b = g.battle;
    if (b.phase === 'menu') {
      if (b.gauge >= b.gaugeMax) { b.menuIdx = 3; tap('z'); dialogTaps += 1; continue; } // 안아 주기
      if (b.pState === 'closed') { b.menuIdx = 2; tap('z'); dialogTaps += 1; continue; } // 듣기
      b.menuIdx = 0; tap('z'); dialogTaps += 1; // 말 걸기
      if (g.battle && g.battle.phase === 'sub') {
        const i = g.battle.sub.options.findIndex((o) => o.correct && !o.locked);
        if (i >= 0) { g.battle.subIdx = i; tap('z'); dialogTaps += 1; }
        else { dispatch('keydown', { key: 'x' }); step(1); dispatch('keyup', { key: 'x' }); // 뒤로
               g.battle.menuIdx = 2; tap('z'); dialogTaps += 1; } // 카드가 없으면 듣기
      }
    } else if (b.phase === 'sub' && b.sub && b.sub.kind === 'finalgate') {
      // 최종 관문(Q-3) — 일기를 읽어 온 아이처럼 정답을 고른다
      const i = b.sub.options.findIndex((o) => o.correct);
      g.battle.subIdx = i >= 0 ? i : 0; tap('z'); dialogTaps += 1;
    } else if (b.phase === 'react') {
      tap('z'); dialogTaps += 1;
    } else if (b.phase === 'wave') {
      // 탄막 턴은 피격 없이 빨리 감기 (조각 줍기는 폐지 — 듣기 즉시 공개)
      b.arena.bullets.length = 0; b.arena.inv = 999;
      b.wave.t = b.wave.dur; b.wave.hits = 1;
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
step(1); if (g.mode !== 'world') advanceDialog(); // X-2 담아의 카드 부탁(광장 진입)을 흘려보낸다
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

// ── 3장 「대문짝 신문사」 — 1층 제보함 ──
enterZone(26, 10, 'ArrowRight', 'rumorstreet');
enterZone(14, 5, 'ArrowUp', 'tipsroom');
for (const [x, y] of [[5, 4], [14, 4], [5, 10], [14, 10], [9, 7]]) { // 제보 5장 읽기
  setPos(x, y, 'up'); tap('z'); advanceDialog();
}
setPos(9, 11, 'up'); tap('z'); pickChoice(0); advanceDialog(); // 제보①(출처) 채택
setPos(9, 11, 'up'); tap('z'); pickChoice(0); advanceDialog(); // 제보②(출처) 채택 → 클리어
if (!g.flags.evCards.includes('ev_check')) throw new Error('제보함 보상 없음');
mark('3장 1층 제보함 (출처 2장 채택)');

// ── 3장 2층 편집실 ──
enterZone(14, 5, 'ArrowUp', 'tipsroom');
enterZone(16, 2, 'ArrowRight', 'editroom');
setPos(5, 5, 'up'); tap('z'); pickChoice(0); advanceDialog();   // 좌우 반전
setPos(14, 5, 'up'); tap('z'); pickChoice(1); advanceDialog();  // 손가락 6개
setPos(9, 10, 'up'); tap('z'); pickChoice(2); advanceDialog();  // 날짜 미래 → 클리어
if (!g.flags.evCards.includes('ev_original')) throw new Error('편집실 보상 없음');
mark('3장 2층 편집실 (대조 3)');

// ── 3장 3층 송출탑 ──
enterZone(14, 5, 'ArrowUp', 'tipsroom');
enterZone(16, 2, 'ArrowRight', 'editroom');
enterZone(16, 2, 'ArrowRight', 'towerroom');
setPos(5, 5, 'up'); tap('z'); pickChoice(1); advanceDialog();   // 정정문
setPos(14, 5, 'up'); tap('z'); pickChoice(0); advanceDialog();  // 출처(제보①)
setPos(9, 10, 'up'); tap('z'); pickChoice(0); advanceDialog();  // 송출 레버 → 클리어
if (!g.flags.rumorFixed) throw new Error('정정 보도 실패');
mark('3장 3층 송출탑 (정정 보도)');

// ── 3장 보스 「그럴싸」 ──
enterZone(14, 5, 'ArrowUp', 'tipsroom');
enterZone(16, 2, 'ArrowRight', 'editroom');
enterZone(16, 2, 'ArrowRight', 'towerroom');
enterZone(16, 2, 'ArrowRight', 'towerroof');
setPos(7, 3, 'up'); tap('z'); advanceDialog();
if (g.mode !== 'battle') throw new Error('그럴싸 배틀 시작 실패');
crudeWin(); if (g.mode === 'battle') crudeWin();
if (!g.flags.chapter3Clear) throw new Error('3장 클리어 실패');
mark('3장 보스 「그럴싸」 설득 배틀');

// ── 4장 「반짝 아케이드」 ──
enterZone(26, 10, 'ArrowRight', 'arcade');
step(1); if (g.mode !== 'world') advanceDialog(); // X-2 반짝의 무대 부탁(아케이드 진입)을 흘려보낸다
enterZone(6, 5, 'ArrowUp', 'roulettesquare');
setPos(5, 4, 'up'); tap('z'); advanceDialog();                  // 룰렛(미끼) 체험 1회
setPos(9, 7, 'up'); tap('z'); pickChoice(1); advanceDialog();   // 작은 글씨 「해지」
setPos(9, 10, 'up'); tap('z'); advanceDialog();                 // 상자 → 비밀조각 열쇠
if (!g.flags.s4KeySecret) throw new Error('비밀조각 열쇠 없음');
mark('4장 구역① 룰렛 광장 (해지 + 열쇠①)');

enterZone(22, 5, 'ArrowUp', 'signupalley');
setPos(9, 6, 'up'); tap('z'); pickChoice(0); advanceDialog();   // 진짜 도메인
setPos(9, 10, 'up'); tap('z'); advanceDialog();                 // 본인 확인함 → 본인표 열쇠
if (!g.flags.s4KeyId) throw new Error('본인표 열쇠 없음');
mark('4장 구역② 회원가입 골목 (판별 + 열쇠②)');

// 구역③ 백스테이지 — 반짝의 「불 꺼진 무대」 주장을 받아치는 ev_offstage 카드.
// 읽기 게이트(Q-1) 이후 듣기만으로는 게이지가 만충되지 않아, 정석대로
// 증거 카드를 모아 와야 보스를 설득할 수 있다 (열쇠 2개로 안쪽 문 개방).
enterZone(15, 5, 'ArrowUp', 'backstage'); // 워프 칸 (15,4) 바로 아래에서 위로
setPos(9, 8, 'down'); tap('z'); advanceDialog(); // 잠긴 문(9,9) → 열쇠 2개로 개방
if (!g.flags.evCards.includes('ev_offstage')) throw new Error('백스테이지 보상 없음');
mark('4장 구역③ 백스테이지 (ev_offstage)');

enterZone(18, 2, 'ArrowUp', 'yuhokstage');
setPos(7, 3, 'up'); tap('z'); advanceDialog();
if (g.mode !== 'battle') throw new Error('반짝 배틀 시작 실패');
crudeWin(); if (g.mode === 'battle') crudeWin();
if (!g.flags.chapter4Clear) throw new Error('4장 클리어 실패');
mark('4장 보스 「반짝」 설득 배틀');

// ── 5장 「포근한 집」 ──
enterZone(33, 10, 'ArrowRight', 'cozyhome');
enterZone(6, 5, 'ArrowUp', 'callroom');
for (let i = 0; i < 4; i++) { setPos(9, 7, 'up'); tap('z'); advanceDialog(); } // 만류 3회 + 받기
if (!g.flags.evCards.includes('ev_answer')) throw new Error('전화의 방 보상 없음');
mark('5장 구역① 전화의 방 (용기 1)');

enterZone(18, 5, 'ArrowUp', 'corridor');
setPos(9, 7, 'up'); tap('z'); advanceDialog();                  // 직접 열어 확인
if (!g.flags.evCards.includes('ev_see')) throw new Error('잠긴 복도 보상 없음');
mark('5장 구역② 잠긴 복도 (용기 2)');

enterZone(30, 5, 'ArrowUp', 'sofaroom');
setPos(9, 7, 'up'); tap('z'); advanceDialog();                  // 소파에 앉음
dispatch('keydown', { key: 'ArrowUp' }); step(92); dispatch('keyup', { key: 'ArrowUp' }); // 일어나기 버티기
if (g.mode === 'dialog') advanceDialog();
if (!g.flags.evCards.includes('ev_standup')) throw new Error('소파 코너 보상 없음');
mark('5장 구역③ 소파 코너 (용기 3)');

enterZone(18, 2, 'ArrowUp', 'lumiroom');
setPos(7, 3, 'up'); tap('z'); advanceDialog();
if (g.mode !== 'battle') throw new Error('루미 배틀 시작 실패');
crudeWin(); if (g.mode === 'battle') crudeWin();
if (!g.flags.chapter5Clear) throw new Error('5장 클리어 실패');
mark('5장 보스 「루미」 설득 배틀');

// ── 파이널: 고요의 뜰 → 고요 → 코어 봉헌 → 영이 ──
enterZone(31, 19, 'ArrowDown', 'quietyard');
enterZone(9, 11, 'ArrowDown', 'quietyard2');
enterZone(9, 11, 'ArrowDown', 'quietyard3');
enterZone(9, 11, 'ArrowDown', 'goyostage');
setPos(7, 3, 'up'); tap('z'); advanceDialog();
if (g.mode !== 'battle') throw new Error('고요 배틀 시작 실패');
crudeWin(); if (g.mode === 'battle') crudeWin();
if (!g.flags.goyoClear) throw new Error('고요 되돌리기 실패');
mark('파이널 — 고요 설득 배틀');

// 코어 봉헌 — 여덟 속삭임에 맞는 카드를 꽂는다
const { SHRINE_WHISPERS, EVIDENCE_CARDS } = vm.runInContext('({ SHRINE_WHISPERS, EVIDENCE_CARDS })', sandbox);
setPos(7, 2, 'up'); tap('z'); advanceDialog();                  // 제단 안내 → 첫 속삭임 선택창
for (let i = 0; i < SHRINE_WHISPERS.length; i++) {
  if (g.mode !== 'choice') { setPos(7, 2, 'up'); tap('z'); }
  if (g.mode !== 'choice') throw new Error('봉헌 선택창 열기 실패 (' + i + ')');
  const owned = (g.flags.evCards || []).filter((id) => EVIDENCE_CARDS[id]);
  const idx = owned.indexOf(SHRINE_WHISPERS[i].answer);
  if (idx < 0) throw new Error('정답 카드 미소지: ' + SHRINE_WHISPERS[i].answer);
  pickChoice(idx); advanceDialog();
}
if (!g.flags.shrineDone || !g.flags.bandiRevealed) throw new Error('봉헌/정체 공개 실패');
// U-2 반디 리빌 정지 비트 — Z로 넘기면 마지막 대사("…가면을 벗을게")로 이어진다
if (g.mode === 'revealbeat') tap('z');
if (g.mode === 'dialog') advanceDialog();
mark('파이널 — 코어 봉헌 (반디 정체 공개)');

// 영이 — 마지막 설득 배틀 → 진엔딩
setPos(7, 5, 'up'); tap('z'); advanceDialog();
if (g.mode !== 'battle') throw new Error('영이 배틀 시작 실패: ' + g.mode);
crudeWin(); if (g.mode === 'battle') crudeWin();
if (g.mode === 'ending') { step(160); tap('z'); }
if (!g.flags.defeated.yeongi) throw new Error('영이 되돌리기 실패');
mark('파이널 — 영이 설득 배틀 + 엔딩');

// ---- 리포트 ----
console.log('\n===== 플레이테스트 봇 리포트 (v3 최속 주행) =====');
console.table(report);
console.log(`첫 배틀 시작까지 대화 탭: ${firstBattleTaps}탭 (상자당 2탭 ≈ ${Math.round(firstBattleTaps / 2)}상자)`);
console.log(`누계: ${frames}프레임 ≈ ${(frames / 60).toFixed(1)}초(최속 하한) · 대화 탭 ${dialogTaps}회`);
console.log(`도달 상태: map=${g.map}, 엔딩=${g.flags.endingId}, 자비=♥${g.flags.mercy}, 반디 정체 공개=${g.flags.bandiRevealed}`);
if (!g.flags.defeated.yeongi) {
  console.error('✘ 봇이 진엔딩까지 도달하지 못했습니다');
  process.exit(1);
}
console.log('✔ 프롤로그 → 5장 → 파이널(영이) 전 구간 완주');
