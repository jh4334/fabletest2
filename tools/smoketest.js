// 스모크 테스트 — 「방과 후: 그림자 학교」 1~3층
// DOM/Canvas/Image/localStorage를 스텁으로 대체하고 vm 샌드박스에서 실제 플레이
// 경로를 시뮬레이션한다. 스펙 §6: 이동·충돌 / 카드·노출도 / 배틀 완주 / 세이브.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ── DOM 스텁 ────────────────────────────────────────────────────────────────
function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 40 });
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeCanvas(w, h) {
  return { width: w || 0, height: h || 0, getContext: () => makeCtx(), addEventListener() {} };
}

const listeners = {};
let rafCb = null;
const storage = new Map();

// Image: src 대입 즉시 onload. (파일 존재 여부는 validate가 따로 본다)
function ImageStub() { this.onload = null; this.onerror = null; }
Object.defineProperty(ImageStub.prototype, 'src', {
  set(v) { this._src = v; if (this.onload) this.onload(); },
  get() { return this._src; },
});

const windowObj = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener: () => {},
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
};
windowObj.window = windowObj;
windowObj.Image = ImageStub;
windowObj.document = {
  getElementById: (id) => (id === 'game' ? makeCanvas(720, 528) : null),
  createElement: () => makeCanvas(16, 16),
};
windowObj.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
windowObj.console = console;
windowObj.Math = Math;
windowObj.JSON = JSON;

vm.createContext(windowObj);
// 탄막 스폰이 무작위라 결정적 시드로 고정한다(플래키 방지).
let seed = 20260726;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

for (const f of ['src/art.js', 'src/sound.js', 'src/data.js', 'src/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), windowObj, { filename: f });
}
const G = windowObj.GAME;
const D = windowObj.DATA;
const ART = windowObj.ART;

// ── 시뮬레이션 도우미 ───────────────────────────────────────────────────────
let clock = 0;
function frame(n = 1) {
  for (let i = 0; i < n; i++) {
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('requestAnimationFrame 콜백이 없음');
    clock += 16;
    cb(clock);
  }
}
function dispatch(ev, obj) {
  for (const fn of (listeners[ev] || []).slice()) fn(Object.assign({ preventDefault() {} }, obj));
}
function tap(key) { dispatch('keydown', { key }); frame(1); dispatch('keyup', { key }); }
function hold(key, n) { dispatch('keydown', { key }); frame(n); dispatch('keyup', { key }); frame(1); }
function S() { return G.state(); }
function advance(max = 20) {
  for (let i = 0; i < max && S().dialog; i++) tap('z');
  return !S().dialog;
}
function place(map, tx, ty) { G.enterMap(map, tx, ty); frame(1); }
function tile() { return G.playerTile(); }
// 문을 밟는 순간 멈춘다 — hold(n)로 프레임 수를 세면 워프 뒤에도 계속 걸어가 버린다.
function walkUntil(key, cond, max = 500) {
  dispatch('keydown', { key });
  for (let i = 0; i < max && !cond(); i++) frame(1);
  dispatch('keyup', { key }); frame(1);
  return cond();
}

let pass = 0; const fails = [];
function check(name, cond) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fails.push(name); console.error('  ✘ ' + name); }
}

// ── 1. 부팅 · 타이틀 ────────────────────────────────────────────────────────
console.log('[1] 부팅 → 타이틀');
G.start();
frame(2);
check('타이틀 화면 진입', S().mode === 'title');
check('시트 로드 완료', ART.ready('floor') && ART.ready('student') && ART.ready('wall'));
check('저장이 없으면 이어하기 없음', G.hasSave() === false);

console.log('[2] 새 게임 → 인트로 → 교실');
tap('z');
check('인트로 대화 시작', !!S().dialog);
check('인트로 상자 3개 이하 (헌법 §3-2)', S().dialog.seq.length <= 3);
check('인트로 상자당 2줄', S().dialog.seq.every((b) => b.length <= 2));
advance();
check('월드 진입', S().mode === 'world' && S().map === 'classroom');
check('시작 위치가 교실 스폰', tile().x === 7 && tile().y === 8);

// ── 3. 이동 · 충돌 ──────────────────────────────────────────────────────────
console.log('[3] 이동 · 충돌');
const startX = S().px;
hold('ArrowLeft', 10);
check('왼쪽 이동으로 좌표가 줄어듦', S().px < startX);
check('바라보는 방향이 왼쪽', S().dir === ART.DIR.left);
hold('ArrowLeft', 400);
check('왼쪽 벽에서 멈춤', tile().x === 1 && !G.solidAt(D.MAPS.classroom, tile().x, tile().y));
hold('ArrowUp', 400);
check('위쪽 벽에서 멈춤', tile().y === 1);
place('classroom', 2, 8);
hold('ArrowUp', 400);
check('책상 줄을 통과하지 못함', tile().y >= 4);
check('벽 자동타일: 좌상단 모서리', String(G.wallOffset(D.MAPS.classroom, 0, 0)) === '0,0');
check('벽 자동타일: 문 위쪽 마감', String(G.wallOffset(D.MAPS.classroom, 14, 4)) === '4,0');

// ── 4. 카드 · 노출도 ────────────────────────────────────────────────────────
console.log('[4] 카드 줍기 → 광고 단말 → 되찾기');
place('classroom', 12, 8);
frame(2);
check('교실 카드 획득', G.heldIds().indexOf('nameTag') >= 0);
check('첫 획득 안내 토스트', !!S().toast);
check('노출도는 0에서 시작', S().exposure === 0);

place('classroom', 2, 2);   // 광고 단말 위
frame(2);
check('광고 단말이 카드를 뺏음', G.heldIds().length === 0);
check('노출도 +1', S().exposure === 1);
const dropped = S().cards.nameTag;
check('뺏긴 카드가 반환 위치에 떨어짐', dropped.map === 'classroom' && dropped.x === 2 && dropped.y === 4);

place('classroom', 2, 4);
frame(2);
check('다시 주우면 노출도 -1', G.heldIds().indexOf('nameTag') >= 0 && S().exposure === 0);

// ── 5. 워프 ─────────────────────────────────────────────────────────────────
console.log('[5] 교실 → 복도 워프');
place('classroom', 14, 5);
frame(2);
check('복도로 이동', S().map === 'hallway');
check('복도 입구에 도착', tile().x === 1 && tile().y === 5);

// ── 6. 복도 단말 쿨다운 ─────────────────────────────────────────────────────
console.log('[6] 복도 카드 · 단말 쿨다운');
place('hallway', 2, 8);
frame(2);
check('복도 카드 획득 (2장 소지)', G.heldIds().length === 2);
place('hallway', 6, 5);
frame(2);
check('복도 단말이 한 장만 뺏음', G.heldIds().length === 1 && S().exposure === 1);
frame(40);
check('쿨다운 중에는 연속으로 뺏기지 않음', G.heldIds().length === 1);
place('hallway', 6, 8);
frame(2);
check('되찾아 노출도 복구', G.heldIds().length === 2 && S().exposure === 0);

// ── 7. 배틀 진입 · 오답 루트 · 피격 ─────────────────────────────────────────
console.log('[7] 짝꿍 배틀 — 오답 루트와 회복');
place('hallway', 15, 5);
frame(2);
check('짝꿍 조우 대화', !!S().dialog);
advance();
check('배틀 진입', S().mode === 'battle');
check('배틀이 시작 위치를 기억(하드코딩 제거)', S().battle.from === 'hallway'
  && S().battle.npcX === D.MAPS.hallway.npc.x);
advance();
check('내 턴 메뉴', S().battle.phase === 'menu' && S().battle.shadow === D.BATTLES.mate.shadow);

tap('ArrowDown');                         // 그리드: 0(말 걸기) 아래는 2(가만히 듣기)
check('그리드 내비: ↓ = 아랫줄', S().battle.cursor === 2);
tap('ArrowRight');
check('그리드 내비: → = 옆 칸', S().battle.cursor === 3);
tap('ArrowUp'); tap('ArrowLeft');         // 3 → 1 → 0
check('그리드 내비: ↑← 복귀', S().battle.cursor === 0);
// 말 걸기 3단 반응 — 반복할수록 대사가 변한다
tap('z');                                 // 말 걸기 1회
check('말 걸기 1: 가로챔', S().dialog && S().dialog.seq === D.BATTLES.mate.talk);
advance(); S().battle.timer = 999; frame(1);
tap('z');
check('말 걸기 2: 반응이 달라짐', S().dialog && S().dialog.seq === D.BATTLES.mate.talk2);
advance(); S().battle.timer = 999; frame(1);
tap('z');
check('말 걸기 3+: 듣기 유도 힌트', S().dialog && S().dialog.seq === D.BATTLES.mate.talk3);
advance(); S().battle.timer = 999; frame(1);
tap('ArrowRight');                        // 말 걸기 → 보여주기
check('메뉴 커서 이동', S().battle.cursor === 1);
tap('z');
check('보여주기 목록 열림', S().battle.phase === 'sub');
tap('ArrowDown'); tap('z');               // 두 번째 카드 = 비밀번호 쪽지
advance();
check('듣기 전 증거는 통하지 않음', S().battle.shadow === D.BATTLES.mate.shadow);
check('상대 턴 시작', S().battle.phase === 'enemy');

// 탄막 피격: 하트 위에 조각을 놓고 한 프레임 진행
S().battle.tell = 0;
S().battle.bullets.push({ x: S().battle.hx, y: S().battle.hy, vx: 0, vy: 0, s: 13 });
frame(1);
check('피격 시 하트 감소', S().battle.hearts === D.BATTLES.mate.hearts - 1);
S().battle.hearts = 1; S().battle.inv = 0;
S().battle.bullets.push({ x: S().battle.hx, y: S().battle.hy, vx: 0, vy: 0, s: 13 });
frame(1);
check('하트 0이어도 게임오버 없이 월드 복귀', S().mode === 'world' && S().battle === null);
check('물러남 안내가 뜸', !!S().dialog);
advance();
check('클리어 플래그는 아직 없음 (재도전 가능)', !S().clearedOf.mate);

// ── 8. 정답 루트 완주 ───────────────────────────────────────────────────────
console.log('[8] 짝꿍 배틀 — 듣기 → 증거 → 손 내밀기');
place('hallway', 15, 5);
frame(2);
advance();                                // 조우 + 배틀 인트로
check('배틀 재진입', S().mode === 'battle' && S().battle.phase === 'menu');
S().battle.cursor = 2;                    // 가만히 듣기
tap('z');
advance();
check('듣기로 그림자가 얇아짐', S().battle.heard === true && S().battle.shadow === D.BATTLES.mate.shadow - 1);
check('들은 사실이 세이브 플래그로 승격', S().heardOf.mate === true);
S().battle.timer = 999; frame(1);
check('상대 턴 종료 후 내 턴', S().battle.phase === 'menu');

// 절반 기억: 물러났다 재진입해도 들은 이야기가 유지된다
S().battle.cursor = 3; tap('z');          // 물러나기
advance();
check('물러나기로 월드 복귀', S().mode === 'world');
place('hallway', 15, 5); frame(2);
check('재조우는 축약 대사', S().dialog && S().dialog.seq === D.BATTLES.mate.reApproach);
advance();
check('재도전: 그림자 1칸 깎인 채 + 들은 상태 유지',
  S().mode === 'battle' && S().battle.heard === true
  && S().battle.shadow === D.BATTLES.mate.shadow - 1);
advance();

S().battle.cursor = 1; tap('z');          // 보여주기
tap('ArrowDown'); tap('z');               // 비밀번호 쪽지
advance();
check('증거 제시로 그림자 0', S().battle.shadow === 0);
check('손 내밀기 준비 (이름 노랗게)', S().battle.spare === true);
tap('z');
advance();
check('배틀 종료 후 월드', S().mode === 'world' && S().battle === null);
check('짝꿍을 되돌림', S().clearedOf.mate === true);
check('계단 문 개방', S().stairsOpen.hallway === true);

// ── 9. 세이브 / 로드 왕복 ───────────────────────────────────────────────────
console.log('[9] 세이브 · 로드');
check('자동 저장됨', G.hasSave() === true);
const snap = () => JSON.stringify({
  map: S().map, exp: S().exposure, flags: S().flags, held: G.heldIds(),
  cleared: S().clearedOf, heard: S().heardOf, open: S().stairsOpen,
});
const before = snap();
// 저장을 건드리지 않고 메모리 상태만 흐트러뜨린다(enterMap은 자동 저장을 부른다).
S().map = 'classroom'; S().exposure = 4;
S().clearedOf.mate = false; S().cards.passNote.held = false;
check('로드 성공', G.load() === true);
const after = snap();
check('로드 왕복이 상태를 그대로 복원', before === after);
check('노출도가 0~최대 범위 안', S().exposure >= 0 && S().exposure <= D.MAX_EXPOSURE);

// ── 10. 계단 → 2층 ─────────────────────────────────────────────────────────
// P2: 1층 계단은 더 이상 클리어 화면이 아니라 2층으로 이어진다(스펙 §1).
console.log('[10] 계단 → 2층 진입');
place('hallway', 18, 5);
hold('ArrowRight', 40);
check('계단 접촉 안내', !!S().dialog);
tap('z');                                   // 계단 대사를 넘기면 그 자리에서 2층으로
check('2층으로 올라감', S().map === 'lab' && S().floor === 2);
check('2층 도착 안내 상자', S().dialog && S().dialog.seq === D.FLOOR2.enter);
advance();
check('2층 계단은 아직 잠김', !S().stairsOpen.lab);
check('층이 바뀌어도 1층 진행은 남아 있음', S().clearedOf.mate === true && G.hasSave() === true);

// ── 11. 세이브 무결성 (손상·조작 방어) ──────────────────────────────────────
console.log('[11] 세이브 무결성');
const K = D.SAVE_KEY;
windowObj.localStorage.setItem(K, '{깨진 json');
check('깨진 JSON → 로드 거부', G.load() === false);
check('깨진 저장은 자동 폐기', G.hasSave() === false);
windowObj.localStorage.setItem(K, JSON.stringify({ v: 1, map: 'no-such-map', px: 100, py: 100 }));
check('없는 맵 → 로드 거부·폐기', G.load() === false && G.hasSave() === false);
windowObj.localStorage.setItem(K, JSON.stringify({ v: 1, map: 'classroom', px: '백', py: 240 }));
check('숫자 아닌 좌표 → 로드 거부', G.load() === false);
windowObj.localStorage.setItem(K, JSON.stringify({ v: 2, map: 'classroom', px: 240, py: 240 }));
check('스키마 버전 불일치 → 로드 거부', G.load() === false);
windowObj.localStorage.setItem(K, JSON.stringify({
  v: 1, map: 'classroom', px: 99999, py: -50, dir: 9, exposure: 99, bubble: 9, loopN: -4,
  floor: 2, flags: { intro: 'yes' }, clearedOf: { mate: 'yes', ghost: true },
  stairsOpen: { nowhere: true },
  cards: { nameTag: { held: false, map: 'ghost', x: 999, y: -3 } },
}));
check('범위 밖 값은 클램프해 살림', G.load() === true
  && S().exposure <= D.MAX_EXPOSURE && S().px <= D.MAPS.classroom.w * 48 && S().py >= 0);
check('불리언 아닌 플래그는 무시', S().flags.intro === false);
check('버블·루프 값도 범위로 클램프', S().bubble <= D.MAX_BUBBLE && S().loopN === 0);
check('층은 저장값이 아니라 맵에서 파생', S().floor === 1);
check('모르는 진행 키는 버림', !S().clearedOf.mate && !S().clearedOf.ghost
  && Object.keys(S().stairsOpen).length === 0);
check('유령 맵의 카드는 원위치 복구', S().cards.nameTag.map === 'classroom');

// ── 12. 입력 — 한글 IME · e.code 매핑 ───────────────────────────────────────
console.log('[12] 한글 IME 입력');
// 한글 모드: e.key='Process', e.code='KeyZ' — code 로 눌려야 한다.
dispatch('keydown', { key: 'Process', code: 'KeyZ' });
check('IME 상태에서 Z(code) 인식', G.keys.ok === true);
dispatch('keyup', { key: 'Process', code: 'KeyZ' });
check('IME 상태에서 keyup 해제', G.keys.ok === false);
// code 미지원 구형: 한글 낱자 폴백
dispatch('keydown', { key: 'ㅈ' });
check('구형 폴백: ㅈ = 결정', G.keys.ok === true);
dispatch('keyup', { key: 'ㅈ' });
dispatch('keydown', { key: 'Process', code: 'ArrowLeft' });
check('IME 상태에서 방향키 인식', G.keys.left === true);
dispatch('keyup', { key: 'Process', code: 'ArrowLeft' });
frame(2); S().dialog = null; S().toast = null;   // 잔류 엣지·부수 효과 청소(테스트 격리)

// ── 13. 타이틀 — 이어하기/처음부터 (공유 태블릿) ────────────────────────────
console.log('[13] 타이틀 이어하기·처음부터');
G.save();                                   // [11]에서 로드된 유효 상태를 저장
S().mode = 'title'; frame(1);
check('저장 있음 → 타이틀 복귀', G.hasSave() === true);
tap('ArrowDown');                           // 처음부터 선택
tap('z');
check('처음부터는 바로 지우지 않고 확인을 띄움', S().mode === 'title' && G.hasSave() === true);
tap('x');                                   // 취소
tap('z');                                   // (커서 유지) 다시 확인
tap('z');                                   // 기본값 '아니요' 결정
check('아니요 → 저장 유지', S().mode === 'title' && G.hasSave() === true);
tap('z');                                   // 다시 확인
tap('ArrowLeft');                           // '네, 처음부터'
tap('z');
check('네 → 저장 삭제 후 새 게임 인트로', !!S().dialog && G.hasSave() === false);
advance();
check('새 게임이 교실에서 시작', S().mode === 'world' && S().map === 'classroom');

// ── 14. 단말 사전 경고 · 뺏김 피드백 ────────────────────────────────────────
console.log('[14] 단말 경고 → 뺏김 피드백');
// [13] 끝에서 새 게임 상태(termWarn 미소비). 카드를 들고 경고 반경까지만 접근.
place('classroom', 12, 8); frame(2);
check('카드 재획득', G.heldIds().length === 1);
S().toast = null;                          // 직전 획득 토스트 제거(경고 토스트만 보이게)
place('classroom', 4, 2); frame(2);
check('경고 반경: 뺏기 전에 먼저 알려줌',
  !!S().toast && S().toast.text === D.T.termWarn && G.heldIds().length === 1 && S().exposure === 0);
check('경고는 플래그로 1회만', S().flags.termWarn === true);
place('classroom', 2, 2); frame(2);
check('접촉하면 뺏김 + 붉은 펄스', G.heldIds().length === 0 && S().exposure === 1 && S().flash > 0);
check('노출도 최대 = 카드 수(3)', D.MAX_EXPOSURE === 3);

// ── 15. 사운드 — 토글·저장·안전성 ──────────────────────────────────────────
console.log('[15] 사운드');
check('SFX 모듈: AudioContext 없어도 안전 로드', !!windowObj.SFX && windowObj.SFX.isOn() === true);
windowObj.SFX.play('pick');               // 컨텍스트 없음 → 조용히 무시(예외 없음)
check('재생 호출이 예외 없이 통과', true);
dispatch('keydown', { key: 'm', code: 'KeyM' });
dispatch('keyup', { key: 'm', code: 'KeyM' });
check('M키 음소거 + 토스트', windowObj.SFX.isOn() === false && S().toast && S().toast.text === D.T.soundOff);
check('음소거 설정이 저장됨', windowObj.localStorage.getItem('shadow-school-sound') === '0');
dispatch('keydown', { key: 'm', code: 'KeyM' });
dispatch('keyup', { key: 'm', code: 'KeyM' });
check('다시 M = 소리 켬', windowObj.SFX.isOn() === true);
frame(1); S().toast = null;

// ── 16. 자리 비움 일시정지 ──────────────────────────────────────────────────
console.log('[16] 자리 비움 일시정지');
G.pause();
check('월드에서 일시정지 진입', S().paused === true);
tap('z');                                   // 일단 해제
tap('x');                                   // 수동: X키로도 멈춘다
check('X키 수동 일시정지', S().paused === true);
check('일시정지 안내 기기별 문구 존재', typeof D.T.pausedHelpTouch === 'string' && D.T.pausedHelpTouch.length > 0);
const pausedX = S().px;
hold('ArrowLeft', 5);
check('일시정지 중엔 움직이지 않음', S().px === pausedX && S().paused === true);
tap('z');
check('확인으로 재개', S().paused === false);

// ── 17. 플레이 계측 ─────────────────────────────────────────────────────────
console.log('[17] 플레이 계측');
tap('z');                                   // 일시정지 해제([16] 잔여)
check('플레이 시간이 누적됨', S().stats.sec > 0);
check('새 게임이 계측을 초기화([13] 처음부터 이후)', S().stats.retreats === 0);
check('뺏김이 계측됨([14]의 1회)', S().stats.stolen === 1);
G.save();
const st = JSON.stringify(S().stats);
S().stats.stolen = 999;
check('로드가 계측을 복원', G.load() === true
  && S().stats.stolen === JSON.parse(st).stolen
  && Math.abs(S().stats.sec - JSON.parse(st).sec) <= 1);

// ── 18. 버전 ────────────────────────────────────────────────────────────────
console.log('[18] 버전');
const pkgVer = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
check('GAME.VERSION == package.json', G.VERSION === pkgVer);

// ── 19. 조사 2단 대사 ───────────────────────────────────────────────────────
console.log('[19] 조사 재방문 대사');
place('classroom', 6, 1);
tap('ArrowUp');                             // 칠판을 바라본다
tap('z');
check('첫 조사: 기본 대사', S().dialog && S().dialog.seq[0] === D.LOOK.board);
advance();
tap('z');
check('재조사: 다른 대사', S().dialog && S().dialog.seq[0] === D.LOOK2.board);
advance();

// ══ 2층: 컴퓨터실 · 필터버블 (스펙 P2 §6) ═══════════════════════════════════
// ── 20. 계단으로 2층까지 ────────────────────────────────────────────────────
console.log('[20] 1층 → 2층 컴퓨터실');
G.newGame(); advance();
place('classroom', 12, 8); frame(2);
check('1층 가방에 카드 1장', G.heldIds().length === 1);
S().clearedOf.mate = true; S().stairsOpen.hallway = true;   // 짝꿍 배틀은 [8]에서 검증
place('hallway', 18, 5);
hold('ArrowRight', 40);
advance();
check('계단으로 2층 진입', S().map === 'lab' && S().floor === 2);
check('2층 도착 위치', tile().x === 7 && tile().y === 8);
check('1층 카드는 그대로 보관됨', S().cards.nameTag.held === true);
check('2층 가방은 비어 있음 (층별 카드 집계 분리)', G.heldIds().length === 0);
check('버블은 0에서 시작', S().bubble === 0 && D.MAX_BUBBLE === 3);
check('2층 계단은 아직 잠김', !S().stairsOpen.lab);
place('lab', 7, 1); hold('ArrowUp', 30);
check('잠긴 3층 계단 안내', !!S().dialog && S().dialog.seq[0] === D.LOOK.stairs2);
advance();
check('잠긴 계단은 클리어 화면으로 가지 않음', S().mode === 'world');

// ── 21. 추천 복도 — 루프와 버블 게이지 ──────────────────────────────────────
console.log('[21] 추천 복도 루프');
place('lab', 13, 5);
check('컴퓨터실 → 추천 복도', walkUntil('ArrowRight', () => S().map === 'loop'));
check('복도 입구에 도착', tile().x === 1 && tile().y === 5);

place('loop', 16, 4); S().toast = null; frame(2);
check('멀리 있을 땐 경고 없음', !S().toast);
hold('ArrowRight', 25);
check('추천 문 사전 경고 (밟기 전에 알려줌)', !!S().toast && S().toast.text === D.T.recoWarn);
check('경고는 플래그로 1회만', S().flags.recoWarn === true);

const loopN0 = S().loopN, bub0 = S().bubble;
check('추천 문을 밟음', walkUntil('ArrowRight', () => S().loopN > loopN0));
check('추천 문은 같은 복도 입구로 되돌린다', S().map === 'loop' && tile().x === 1 && tile().y === 5);
check('추천 문마다 버블 +1', S().bubble === bub0 + 1);
check('루프 횟수 누적', S().loopN === loopN0 + 1);
S().toast = null;
place('loop', 18, 4); frame(2);
check('경고는 두 번 뜨지 않음', !S().toast);

// 세 번 따라가면 버블 만땅 — 그래도 낯선 문은 열려 있다(회복 가능 원칙)
for (let i = 0; i < 3; i++) {
  const n = S().loopN;
  place('loop', 18, 4);
  walkUntil('ArrowRight', () => S().loopN > n);
}
check('버블은 최대치에서 멈춤', S().bubble === D.MAX_BUBBLE);
check('루프 4회 이상 (복도 장식 단조로움 단계)', S().loopN >= 4);
frame(2);
check('루프 최대에서도 렌더 예외 없음', S().mode === 'world');

// ── 22. 낯선 문 — 전진과 버블 회복 ──────────────────────────────────────────
console.log('[22] 낯선 문 전진');
const bubMax = S().bubble;
place('loop', 18, 6);
check('낯선 문을 밟음', walkUntil('ArrowRight', () => S().map !== 'loop'));
check('낯선 문은 처음 보는 방으로', S().map === 'roomA');
check('낯선 문 통과로 버블 -1', S().bubble === bubMax - 1);
place('roomA', 7, 3); frame(2);
check('roomA 카드 획득', G.heldIds().indexOf('watchLog') >= 0);
check('2층 카드 획득도 버블을 걷는다', S().bubble === bubMax - 2);
check('1층 카드는 2층 가방에 안 보인다', G.heldIds().indexOf('nameTag') < 0);
place('roomA', 1, 5);
check('방에서 복도로 복귀', walkUntil('ArrowLeft', () => S().map === 'loop'));
check('낯선 문 앞으로 돌아옴', tile().x === 18 && tile().y === 6);
place('loop', 18, 8); frame(2);
check('복도 구석 카드 획득', G.heldIds().indexOf('recoList') >= 0);
place('loop', 18, 6);
check('낯선 문을 다시 밟음', walkUntil('ArrowRight', () => S().map !== 'loop'));
check('두 번째 낯선 문은 다른 방으로', S().map === 'roomB');

// ── 23. 형 배틀 — 프로필 일반화 ─────────────────────────────────────────────
console.log('[23] 형 배틀');
place('roomB', 4, 8); frame(2);
check('증거 카드(낡은 축구공 사진) 획득', G.heldIds().indexOf('oldBall') >= 0);
place('roomB', 6, 3); frame(2);
check('형 조우 대화', !!S().dialog && S().dialog.seq === D.BATTLES.bro.approach);
advance();
check('형 배틀 진입', S().mode === 'battle' && S().battle.id === 'bro');
advance();
check('형 프로필로 배틀이 구성됨', S().battle.phase === 'menu'
  && S().battle.shadow === D.BATTLES.bro.shadow && S().battle.hearts === D.BATTLES.bro.hearts);
check('짝꿍 배틀과 다른 인물', D.BATTLES.bro.name !== D.BATTLES.mate.name);

S().battle.cursor = 1; tap('z');            // 보여주기 (듣기 전)
check('보여주기 목록 열림(형)', S().battle.phase === 'sub');
S().battle.sub = G.heldIds().indexOf('watchLog'); tap('z');
advance();
check('듣기 전 증거는 통하지 않음(형)', S().battle.shadow === D.BATTLES.bro.shadow);
check('상대 턴 시작(형)', S().battle.phase === 'enemy');

// chase 탄막: 하트를 향해 느리게 꺾인다
check('chase 탄막이 프로필에 있고 느리다',
  D.BATTLES.bro.attacks.some((a) => a.kind === 'chase' && a.speed <= 120));
{
  const b = S().battle;
  b.atk = D.BATTLES.bro.attacks.findIndex((a) => a.kind === 'chase');
  b.timer = 0; b.tell = 0; b.inv = 9; b.bullets = [];
  b.hx = G.BOX.x + 40; b.hy = G.BOX.y + 110;
  b.bullets.push({ x: G.BOX.x + 320, y: G.BOX.y + 16, vx: 0, vy: 100, s: 13, sp: 100, life: 3 });
  const d0 = Math.hypot(b.bullets[0].x - b.hx, b.bullets[0].y - b.hy);
  frame(20);
  const p = S().battle.bullets[0];
  check('chase 조각이 하트 쪽으로 꺾인다', !!p && Math.hypot(p.x - b.hx, p.y - b.hy) < d0);
  S().battle.bullets = []; S().battle.timer = 999; frame(1);
}
check('상대 턴 종료 후 내 턴(형)', S().battle.phase === 'menu');

S().battle.cursor = 2; tap('z'); advance();  // 가만히 듣기
check('듣기로 그림자가 얇아짐(형)',
  S().battle.heard === true && S().battle.shadow === D.BATTLES.bro.shadow - 1);
// 인물별로 따로 쌓인다 — 이번 회차에서 짝꿍 이야기는 듣지 않았다([20]에서 새 게임)
check('절반 기억이 인물별로 쌓인다', S().heardOf.bro === true && !S().heardOf.mate);
S().battle.timer = 999; frame(1);
S().battle.cursor = 3; tap('z'); advance();  // 물러나기
check('물러나기로 월드 복귀(형)', S().mode === 'world' && S().map === 'roomB');
place('roomB', 6, 3); frame(2);
check('재조우는 축약 대사(형)', S().dialog && S().dialog.seq === D.BATTLES.bro.reApproach);
advance();
check('재도전: 그림자 1칸 깎인 채 재개(형)', S().battle.shadow === D.BATTLES.bro.shadow - 1);
advance();
S().battle.cursor = 1; tap('z');
S().battle.sub = G.heldIds().indexOf('oldBall'); tap('z');
advance();
check('증거 제시로 그림자 0(형)', S().battle.shadow === 0);
check('손 내밀기 준비(형)', S().battle.spare === true);
tap('z'); advance();
check('배틀 종료 후 월드(형)', S().mode === 'world' && S().battle === null);
check('형을 되돌림', S().clearedOf.bro === true);
check('2층 계단 개방', S().stairsOpen.lab === true);
check('1층 진행은 건드리지 않음', S().stairsOpen.hallway === true && S().clearedOf.mate === true);
place('roomB', 6, 3); frame(2);
check('되돌린 뒤엔 다시 배틀하지 않음', S().mode === 'world');

// ── 24. 2층 계단 → 3층 진입 ────────────────────────────────────────────────
// P3: 2층 계단은 더 이상 클리어 화면이 아니라 3층 복도로 이어진다(스펙 §1).
// 클리어 화면 검사는 그대로 3층 계단(=오늘의 마지막 계단)으로 옮겨 [31]에서 돈다.
console.log('[24] 2층 통과 → 3층');
place('lab', 7, 1);
hold('ArrowUp', 30);
check('계단 접촉 안내', !!S().dialog);
tap('z');                                   // 계단 대사를 넘기면 그 자리에서 3층으로
check('3층으로 올라감', S().map === 'hall3' && S().floor === 3);
check('3층 도착 안내 상자', S().dialog && S().dialog.seq === D.FLOOR3.enter);
advance();
check('3층 복도 입구에 도착', tile().x === 1 && tile().y === 5);
check('3층 가방은 비어 있음 (층별 카드 집계 분리)', G.heldIds().length === 0);
check('오염은 0에서 시작', S().pollute === 0 && D.MAX_POLLUTE === 3);
check('3층 계단은 아직 잠김', !S().stairsOpen.hall3);
place('hall3', 18, 4); hold('ArrowRight', 30);
check('잠긴 옥상 계단 안내', !!S().dialog && S().dialog.seq[0] === D.LOOK.stairs3);
advance();
check('잠긴 계단은 클리어 화면으로 가지 않음', S().mode === 'world');

// ── 25. 2층 조사 대사 ───────────────────────────────────────────────────────
console.log('[25] 2층 조사');
place('lab', 2, 3);
tap('ArrowUp'); tap('z');
check('컴퓨터 조사 대사', S().dialog && S().dialog.seq[0] === D.LOOK.pc);
advance();
tap('z');
check('재조사: 다른 대사', S().dialog && S().dialog.seq[0] === D.LOOK2.pc);
advance();
place('loop', 18, 4);
tap('ArrowRight'); tap('z');
check('추천 문 조사 대사', S().dialog && S().dialog.seq[0] === D.LOOK.doorReco);
advance();

// ══ 3층: 방송실 · 가짜뉴스 (스펙 P3 §6) ═════════════════════════════════════
// ── 26. 소문 쪽지 읽기 · 콘솔 열기 ──────────────────────────────────────────
console.log('[26] 소문 쪽지 → 방송 콘솔');
const R = D.RUMORS;
// 쪽지 앞에 서서 위를 보고 조사한다 (쪽지 타일은 막힌 칸)
function readNote(i) {
  const n = D.MAPS.studio.notes[i];
  place('studio', n.x, n.y + 1);
  tap('ArrowUp'); tap('z');
}
// 콘솔은 처리할 소문이 남아 있으면 열린 채로 있다 — 월드에서 X는 일시정지라 섞지 않는다.
function closeCon() { for (let i = 0; i < 4 && S().mode === 'console'; i++) tap('x'); }
place('studio', 6, 2);
tap('ArrowUp'); tap('z');
check('읽은 쪽지가 없으면 콘솔이 안내만 함',
  S().mode === 'world' && S().dialog && S().dialog.seq === D.CONSOLE.none);
advance();
check('소문 3개는 모두 안 읽은 상태', R.every((r) => S().rumors[r.id] === 'unread'));
readNote(0);
check('쪽지를 읽으면 소문 내용이 뜬다', S().dialog && S().dialog.seq === R[0].note);
advance();
check('소문 상태: unread → read', S().rumors[R[0].id] === 'read');
readNote(0);
check('이미 읽은 쪽지는 다른 한 줄', S().dialog && S().dialog.seq[0] === D.LOOK.noteRead);
advance();
place('studio', 6, 2);
tap('ArrowUp'); tap('z');
check('읽은 쪽지가 있으면 콘솔이 열린다', S().mode === 'console' && S().con.level === 0);
check('콘솔 목록에 읽은 소문 + 닫기', S().con.cursor === 0);
tap('x');
check('취소로 콘솔을 닫는다', S().mode === 'world' && S().con === null);

// ── 27. 바로 방송 → 경고 1회 → 오염·안개 ───────────────────────────────────
console.log('[27] 바로 방송 — 경고와 오염');
place('studio', 6, 2);
tap('ArrowUp'); tap('z');                   // 콘솔
tap('z');                                   // 첫 소문 선택
check('소문을 고르면 처리 방법이 뜬다', S().con.level === 1 && S().mode === 'console');
tap('z');                                   // 바로 방송 (첫 시도)
check('첫 바로 방송 전에 1회 경고', !!S().dialog && S().dialog.seq === D.CONSOLE.warn);
check('경고는 플래그로 1회만', S().flags.airWarn === true);
advance();
check('경고 단계에서는 아직 방송하지 않음', S().rumors[R[0].id] === 'read' && S().pollute === 0);
tap('z');                                   // 다시 바로 방송
check('소문 상태: read → aired', S().rumors[R[0].id] === 'aired');
check('방송 순간 붉은 펄스', S().flash > 0);
advance();
check('소문 상태: aired → polluted', S().rumors[R[0].id] === 'polluted');
check('오염 게이지 +1', S().pollute === 1);
closeCon();
check('복도에 안개 칸이 생김', G.fogCells('hall3').length === R[0].fog.length);
check('안개 칸이 막힌 칸이 됨', G.solidAt(D.MAPS.hall3, R[0].fog[0].x, R[0].fog[0].y) === true);
check('안개는 맵 grid를 바꾸지 않음',
  D.MAPS.hall3.grid[R[0].fog[0].y].charAt(R[0].fog[0].x) === '.');
const f0 = R[0].fog[0];
place('hall3', f0.x - 1, f0.y);
hold('ArrowRight', 60);
check('안개가 지름길을 실제로 막는다', tile().x === f0.x - 1);
tap('ArrowRight'); tap('z');
check('안개를 조사하면 걷는 법을 알려 준다', S().dialog && S().dialog.seq[0] === D.LOOK.fog);
advance();
check('막혀도 돌아가는 길은 열려 있다 (위쪽 통로)',
  !G.solidAt(D.MAPS.hall3, 1, 4) && !G.solidAt(D.MAPS.hall3, f0.x, 1));

// ── 28. 확인 후 방송 — 오염 없음 ────────────────────────────────────────────
console.log('[28] 확인 후 방송');
readNote(1);
advance();
check('둘째 소문도 읽음', S().rumors[R[1].id] === 'read');
place('studio', 6, 2);
tap('ArrowUp'); tap('z');                   // 콘솔
tap('ArrowDown'); tap('z');                 // 둘째 소문
tap('ArrowDown'); tap('z');                 // 확인 후 방송
check('사실 카드가 없으면 확인 방송이 막힌다',
  !!S().dialog && S().dialog.seq === D.CONSOLE.needCard && S().rumors[R[1].id] === 'read');
advance();
check('콘솔은 열린 채로 남는다', S().mode === 'console');
closeCon();
place('archive', D.MAPS.archive.signs[1].x, D.MAPS.archive.signs[1].y + 1);
tap('ArrowUp'); tap('z');
check('표지를 조사하면 어느 소문의 자료인지 알려 준다', S().dialog && S().dialog.seq === R[1].sign);
advance();
const cardOf = (id) => D.CARDS.find((c) => c.id === id);
place('archive', cardOf(R[1].card).at.x, cardOf(R[1].card).at.y);
frame(2);
check('표지 옆에서 사실 카드 획득', G.heldIds().indexOf(R[1].card) >= 0);
check('3층 카드는 오염 게이지를 건드리지 않음', S().pollute === 1);
check('사실 카드 안내 토스트', !!S().toast && S().toast.text === D.T.gotCard3);
place('studio', 6, 2);
tap('ArrowUp'); tap('z');
tap('ArrowDown'); tap('z');                 // 둘째 소문
tap('ArrowDown'); tap('z');                 // 확인 후 방송
check('확인 후 방송은 오염 없이 처리', S().dialog && S().dialog.seq === D.CONSOLE.verified);
advance();
check('소문 상태: read → verified', S().rumors[R[1].id] === 'verified');
check('확인하고 내보내면 안개가 안 생김', S().pollute === 1 && G.fogCells('hall3').length === 2);
closeCon();

// ── 29. 정정 방송 — 두 배 힘든 회복 ─────────────────────────────────────────
console.log('[29] 정정 방송');
place('studio', 6, 2);
tap('ArrowUp'); tap('z');
tap('z');                                   // 오염된 첫 소문
check('오염된 소문은 정정만 고를 수 있다', S().con.level === 1);
tap('z');                                   // 정정 방송 (카드 없이)
check('사실 카드 없이는 정정도 안 된다',
  !!S().dialog && S().dialog.seq === D.CONSOLE.needCard && S().rumors[R[0].id] === 'polluted');
advance(); closeCon();
place('archive', cardOf(R[0].card).at.x, cardOf(R[0].card).at.y);
frame(2);
check('정정용 사실 카드 획득 (같은 수고 한 번 더)', G.heldIds().indexOf(R[0].card) >= 0);
place('studio', 6, 2);
tap('ArrowUp'); tap('z');
tap('z'); tap('z');                         // 첫 소문 → 정정 방송
check('정정 방송 안내', S().dialog && S().dialog.seq === D.CONSOLE.fixed);
advance();
check('소문 상태: polluted → fixed', S().rumors[R[0].id] === 'fixed');
check('오염 게이지 -1', S().pollute === 0);
check('안개가 걷힘', G.fogCells('hall3').length === 0);
place('hall3', R[0].fog[0].x - 1, R[0].fog[0].y);
check('걷힌 통로로 다시 지나간다',
  walkUntil('ArrowRight', () => tile().x > R[0].fog[R[0].fog.length - 1].x));

// ── 30. 소문 3개 처리 → 선배 등장 ───────────────────────────────────────────
console.log('[30] 선배 등장');
place('studio', 11, 5); frame(2);
check('처리 전에는 선배가 없다', S().mode === 'world' && !G.rumorsDone());
readNote(2);
advance();
place('archive', cardOf(R[2].card).at.x, cardOf(R[2].card).at.y);
frame(2);
check('당사자 메모 획득', G.heldIds().indexOf('ownWords') >= 0);
place('studio', 6, 2);
tap('ArrowUp'); tap('z');
tap('z');                                   // 남은 소문 하나뿐
tap('ArrowDown'); tap('z');                 // 확인 후 방송
check('소문 3개 모두 처리', G.rumorsDone() === true);
tap('z');                                   // 방송 안내를 넘기면 바로 이어진다
check('처리 완료 안내 상자', !!S().dialog && S().dialog.seq === D.CONSOLE.done);
advance();
check('콘솔이 닫힘', S().mode === 'world' && S().con === null);

// ── 31. 선배 배틀 ───────────────────────────────────────────────────────────
console.log('[31] 선배 배틀');
place('studio', 11, 5); frame(2);
check('선배 조우 대화', !!S().dialog && S().dialog.seq === D.BATTLES.senior.approach);
advance();
check('선배 배틀 진입', S().mode === 'battle' && S().battle.id === 'senior');
advance();
check('선배 프로필로 배틀이 구성됨', S().battle.phase === 'menu'
  && S().battle.shadow === D.BATTLES.senior.shadow && S().battle.hearts === D.BATTLES.senior.hearts);
S().battle.cursor = 1; tap('z');
S().battle.sub = G.heldIds().indexOf(R[1].card); tap('z');
advance();
check('듣기 전 증거는 통하지 않음(선배)', S().battle.shadow === D.BATTLES.senior.shadow);
{
  // burst 탄막: 예고 뒤 한 지점에서 방사형으로 터진다
  const b = S().battle;
  b.atk = D.BATTLES.senior.attacks.findIndex((a) => a.kind === 'burst');
  b.timer = 0; b.tell = 0; b.inv = 9; b.bullets = []; b.spawnAcc = 0;
  frame(120);
  const bs = S().battle.bullets;
  check('burst가 여러 발을 한꺼번에 뿌린다', bs.length >= 6);
  check('burst 조각이 사방으로 흩어진다',
    bs.some((p) => p.vy < 0) && bs.some((p) => p.vy > 0));
  S().battle.bullets = []; S().battle.timer = 999; frame(1);
}
check('상대 턴 종료 후 내 턴(선배)', S().battle.phase === 'menu');
S().battle.cursor = 2; tap('z'); advance();
check('듣기로 그림자가 얇아짐(선배)',
  S().battle.heard === true && S().battle.shadow === D.BATTLES.senior.shadow - 1);
S().battle.timer = 999; frame(1);
S().battle.cursor = 3; tap('z'); advance();
check('물러나기로 월드 복귀(선배)', S().mode === 'world' && S().map === 'studio');
place('studio', 11, 5); frame(2);
check('재조우는 축약 대사(선배)', S().dialog && S().dialog.seq === D.BATTLES.senior.reApproach);
advance();
check('재도전: 그림자 1칸 깎인 채 재개(선배)', S().battle.shadow === D.BATTLES.senior.shadow - 1);
advance();
S().battle.cursor = 1; tap('z');
S().battle.sub = G.heldIds().indexOf('ownWords'); tap('z');
advance();
check('증거 제시로 그림자 0(선배)', S().battle.shadow === 0);
check('손 내밀기 준비(선배)', S().battle.spare === true);
tap('z'); advance();
check('선배를 되돌림', S().clearedOf.senior === true);
check('3층 계단 개방', S().stairsOpen.hall3 === true);
check('1~2층 진행은 건드리지 않음',
  S().stairsOpen.hallway === true && S().stairsOpen.lab === true && S().clearedOf.bro === true);
place('studio', 11, 5); frame(2);
check('되돌린 뒤엔 다시 배틀하지 않음(선배)', S().mode === 'world');
tap('ArrowRight'); tap('z');
check('되돌린 선배가 한 줄 힌트를 준다', S().dialog && S().dialog.seq === D.BATTLES.senior.hint);
advance();
place('studio', 6, 2);
tap('ArrowUp'); tap('z');
check('다 처리한 뒤의 콘솔은 다른 안내',
  S().mode === 'world' && S().dialog && S().dialog.seq === D.CONSOLE.clear);
advance();

// ── 32. 3층 통과 → 클리어 화면 ─────────────────────────────────────────────
// [24]에서 옮겨온 클리어 화면 검사 — 오늘의 마지막 계단이 3층으로 바뀌었을 뿐,
// 검사 이름과 뜻은 그대로 둔다(옥상은 공사 중).
console.log('[32] 3층 통과');
place('hall3', 18, 4);
hold('ArrowRight', 30);
check('계단 접촉 안내(3층)', !!S().dialog);
advance();
check('클리어 화면', S().mode === 'clear');
check('클리어 배너가 층 번호를 쓴다', S().floor === 3 && typeof D.CLEAR.bannerFloor === 'string');
tap('z');                                   // 기본값: 계속 둘러보기
check('클리어 후 Z 연타에도 저장 생존 + 월드 복귀', S().mode === 'world' && G.hasSave() === true);
check('계단 앞으로 복귀', tile().x === 18 && tile().y === 4);
hold('ArrowRight', 30);
advance();
check('클리어 화면 재진입 가능', S().mode === 'clear');
tap('ArrowDown'); tap('z');                 // 타이틀로
check('타이틀로 가도 저장 유지', S().mode === 'title' && G.hasSave() === true);
tap('z');                                   // 이어하기
check('이어하기로 클리어 상태 복원', S().mode === 'world' && S().flags.done === true);
check('이어하기가 3층을 기억', S().floor === 3 && S().map === 'hall3');
check('이어하기가 버블·루프도 복원', S().bubble >= 0 && S().loopN >= 4);
check('이어하기가 인물 진행을 복원', S().clearedOf.bro === true && S().heardOf.bro === true);
check('이어하기가 소문 처리도 복원',
  S().rumors[R[0].id] === 'fixed' && S().rumors[R[1].id] === 'verified');

// ── 33. 3층 세이브 방어 ─────────────────────────────────────────────────────
console.log('[33] 3층 세이브 방어');
windowObj.localStorage.setItem(D.SAVE_KEY, JSON.stringify({
  v: 1, map: 'hall3', px: 100, py: 260, dir: 3,
  pollute: 99, rumors: { r1: 'aired', r2: '이상한값', ghost: 'polluted' },
  fog: { hall3: [{ x: 0, y: 0 }], nowhere: [{ x: 1, y: 1 }] },
}));
check('손상된 3층 저장도 로드는 된다', G.load() === true);
check('중간 상태(aired)는 오염으로 확정', S().rumors.r1 === 'polluted');
check('모르는 상태값은 처음으로 되돌림', S().rumors.r2 === 'unread');
check('모르는 소문 키는 버림', S().rumors.ghost === undefined);
check('오염 게이지는 소문 수에서 다시 계산', S().pollute === 1);
check('안개는 저장 좌표가 아니라 소문에서 다시 만든다',
  G.fogCells('nowhere').length === 0
  && JSON.stringify(G.fogCells('hall3')) === JSON.stringify(R[0].fog));
// 최악(3건 모두 오염)에서도 배틀 지점·계단으로 가는 길은 살아 있다 (헌법 §3-3)
S().rumors[R[1].id] = 'polluted'; S().rumors[R[2].id] = 'polluted';
G.save(); G.load();
check('오염 최악이어도 게이지는 최대에서 멈춤', S().pollute === D.MAX_POLLUTE);
check('오염 최악에도 방송실 문·계단 앞은 열려 있다',
  !G.solidAt(D.MAPS.hall3, 18, 5) && !G.solidAt(D.MAPS.hall3, 18, 4));
check('오염 최악에도 회복 경로 문구가 있다', typeof D.T.polHelp === 'string' && D.T.polHelp.length > 0);

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log('');
if (fails.length) {
  console.error(`✘ 실패 ${fails.length}건 / 통과 ${pass}건`);
  fails.forEach((f) => console.error('   - ' + f));
  process.exit(1);
}
// 회귀망이 조용히 얇아지는 것을 막는 하한선 (P2 179건 + P3 신규 30건 이상)
if (pass < 209) { console.error(`✘ 검사 수 부족: ${pass}건 (P3 기준 209건 이상)`); process.exit(1); }
console.log(`✔ 스모크 ${pass}건 모두 통과`);
