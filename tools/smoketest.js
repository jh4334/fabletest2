// 스모크 테스트 — 「방과 후: 그림자 학교」 P1 수직 슬라이스
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

// ── 24. 2층 계단 → 클리어 화면 ──────────────────────────────────────────────
console.log('[24] 2층 통과');
place('lab', 7, 1);
hold('ArrowUp', 30);
check('계단 접촉 안내', !!S().dialog);
advance();
check('클리어 화면', S().mode === 'clear');
check('클리어 배너가 층 번호를 쓴다', S().floor === 2 && typeof D.CLEAR.bannerFloor === 'string');
tap('z');                                   // 기본값: 계속 둘러보기
check('클리어 후 Z 연타에도 저장 생존 + 월드 복귀', S().mode === 'world' && G.hasSave() === true);
check('계단 앞으로 복귀', tile().x === 7 && tile().y === 1);
hold('ArrowUp', 30);
advance();
check('클리어 화면 재진입 가능', S().mode === 'clear');
tap('ArrowDown'); tap('z');                 // 타이틀로
check('타이틀로 가도 저장 유지', S().mode === 'title' && G.hasSave() === true);
tap('z');                                   // 이어하기
check('이어하기로 클리어 상태 복원', S().mode === 'world' && S().flags.done === true);
check('이어하기가 2층을 기억', S().floor === 2 && S().map === 'lab');
check('이어하기가 버블·루프도 복원', S().bubble >= 0 && S().loopN >= 4);
check('이어하기가 인물 진행을 복원', S().clearedOf.bro === true && S().heardOf.bro === true);

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

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log('');
if (fails.length) {
  console.error(`✘ 실패 ${fails.length}건 / 통과 ${pass}건`);
  fails.forEach((f) => console.error('   - ' + f));
  process.exit(1);
}
// 회귀망이 조용히 얇아지는 것을 막는 하한선 (P1 107건 + P2 신규 25건 이상)
if (pass < 132) { console.error(`✘ 검사 수 부족: ${pass}건 (P2 기준 132건 이상)`); process.exit(1); }
console.log(`✔ 스모크 ${pass}건 모두 통과`);
