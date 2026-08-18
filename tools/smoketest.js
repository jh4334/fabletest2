// 스모크 테스트 — 「방과 후: 그림자 학교」 1~5층 + 옥상 + 교사 도구
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
// P4에서 3층 계단의 행선지가 옥상 → 4층으로 바뀌어 검사 이름만 따라 고쳤다.
check('잠긴 4층 계단 안내', !!S().dialog && S().dialog.seq[0] === D.LOOK.stairs3);
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

// ── 32. 3층 통과 → 4층 진입 ────────────────────────────────────────────────
// P4: 3층 계단은 더 이상 클리어 화면이 아니라 4층 복도로 이어진다(스펙 §1).
// 클리어 화면 검사는 이름 그대로 오늘의 마지막 계단(전시 복도)으로 옮겨 [40]에서 돈다.
console.log('[32] 3층 통과 → 4층');
place('hall3', 18, 4);
hold('ArrowRight', 30);
check('계단 접촉 안내(3층)', !!S().dialog);
tap('z');                                   // 계단 대사를 넘기면 그 자리에서 4층으로
check('4층으로 올라감', S().map === 'hall4' && S().floor === 4);
check('4층 도착 안내 상자', S().dialog && S().dialog.seq === D.FLOOR4.enter);
advance();
check('4층 복도 입구에 도착', tile().x === 1 && tile().y === 5);
check('4층 가방은 비어 있음 (층별 카드 집계 분리)', G.heldIds().length === 0);
check('정직은 0에서 시작', S().honest === 0 && D.MAX_HONEST === 3);
check('4층 계단은 아직 잠김', !S().stairsOpen.gallery);
// 층이 늘어도 아래층 진행은 세이브 왕복에서 살아남아야 한다
G.save();
S().bubble = 0; S().loopN = 0; S().rumors[R[0].id] = 'unread';
check('로드 성공(4층까지 온 저장)', G.load() === true);
check('이어하기가 버블·루프도 복원', S().bubble >= 0 && S().loopN >= 4);
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

// ══ 4층: 미술실 · 생성AI와 저작권 (스펙 P4 §6) ══════════════════════════════
const FR = D.FRAMES, AU = D.AUTHORS;
// 액자는 위쪽 통로에서 내려다본다(액자 타일은 막힌 칸).
function lookFrame(i) {
  const f = FR[i];
  place('gallery', f.x, f.y - 1);
  tap('ArrowDown'); tap('z');
}
function openBench() { place('artroom', 3, 8); tap('ArrowUp'); tap('z'); }
const seenList = () => FR.filter((f) => S().frames[f.id] === 'seen').map((f) => f.id);
// 제작대에서 [액자 → 스티커] 를 골라 스티커 한 장을 만든다(콘솔과 같은 커서 문법).
function craft(frameId, authorId) {
  openBench();
  S().con.cursor = seenList().indexOf(frameId);
  tap('z');
  S().con.cursor = AU.findIndex((a) => a.id === authorId);
  tap('z');
  advance();
  closeCon();
}

// ── 34. 전시 복도 — 잠긴 유리문과 액자 조사 ─────────────────────────────────
console.log('[34] 전시 복도 — 유리문과 액자');
G.newGame(); advance();
// 1~3층 진행은 앞 절에서 다 봤으니 4층 상태로 바로 올린다.
S().clearedOf.mate = true; S().clearedOf.bro = true; S().clearedOf.senior = true;
S().stairsOpen.hallway = true; S().stairsOpen.lab = true; S().stairsOpen.hall3 = true;
openBench();
check('본 액자가 없으면 제작대가 안내만 함',
  S().mode === 'world' && S().dialog && S().dialog.seq === D.STICKER.none);
advance();
place('gallery', 1, 5); frame(2);
check('4층 전시 복도 진입', S().map === 'gallery' && S().floor === 4);
check('유리문 셋이 모두 잠겨 있다',
  FR.every((f) => G.solidAt(D.MAPS.gallery, f.door[0].x, f.door[0].y) === true));
check('열린 유리문 칸은 아직 없다', G.openedCells('gallery').length === 0);
place('gallery', 4, 5);
hold('ArrowRight', 60);
check('잠긴 유리문이 진행을 막는다', tile().x === 4);
tap('ArrowRight'); tap('z');
check('유리문을 조사하면 왜 안 열리는지 알려 준다', S().dialog && S().dialog.seq[0] === D.LOOK.glass);
advance();
lookFrame(0);
check('액자를 조사하면 이상한 점이 보인다', S().dialog && S().dialog.seq === FR[0].look);
advance();
check('액자 상태: unseen → seen', S().frames[FR[0].id] === 'seen');
lookFrame(1); advance();
lookFrame(2); advance();
check('유리문이 다 잠겨도 액자 세 점을 모두 볼 수 있다 (소프트락 없음)',
  FR.every((f) => S().frames[f.id] === 'seen'));
const c4 = (id) => D.CARDS.find((c) => c.id === id);
place('gallery', c4('firstSketch').at.x, c4('firstSketch').at.y); frame(2);
check('전시 복도에서 첫 스케치 획득', G.heldIds().indexOf('firstSketch') >= 0);
check('4층 카드는 정직 게이지를 건드리지 않음', S().honest === 0);
check('4층 카드 안내 토스트', !!S().toast && S().toast.text === D.T.gotCard4);

// ── 35. 미술실 — 견본판 · 잠긴 서랍 · 제작대 ────────────────────────────────
console.log('[35] 미술실 자료와 제작대');
place('artroom', c4('styleCard').at.x, c4('styleCard').at.y); frame(2);
check('미술실에서 스타일 견본 획득', G.heldIds().indexOf('styleCard') >= 0);
place('artroom', D.MAPS.artroom.samples[0].x, D.MAPS.artroom.samples[0].y + 1);
tap('ArrowUp'); tap('z');
check('견본판을 조사하면 화풍을 알려 준다', S().dialog && S().dialog.seq === AU[0].sample);
advance();
place('artroom', 11, 8);
check('잠긴 서랍 속 자료는 아직 주울 수 없다',
  G.drawerOpen() === false && G.heldIds().indexOf('aiReceipt') < 0);
tap('ArrowUp'); tap('z');
check('서랍은 처음엔 잠겨 있다', S().dialog && S().dialog.seq[0] === D.LOOK.drawer);
advance();
openBench();
check('제작대가 열린다 (방송 콘솔과 같은 문법)',
  S().mode === 'console' && S().con.kind === 'sticker' && S().con.level === 0);
tap('z');
check('액자를 고르면 스티커 목록이 뜬다', S().con.level === 1 && S().con.frame === seenList()[0]);
tap('x');
check('취소로 액자 선택으로 돌아온다', S().mode === 'console' && S().con.level === 0);
tap('x');
check('취소로 제작대를 닫는다', S().mode === 'world' && S().con === null);

// ── 36. 틀린 스티커 — 벌 없이 되돌림 ────────────────────────────────────────
console.log('[36] 틀린 스티커');
craft(FR[0].id, FR[1].author);              // 일부러 다른 화풍
check('제작대에서 스티커를 만든다', S().stickers[FR[0].id] === FR[1].author);
const miss0 = S().stats.missSticker;
lookFrame(0);
check('틀린 스티커는 되돌림 안내', S().dialog && S().dialog.seq === D.STICKER.wrong);
advance();
check('틀려도 게이지·액자 상태는 그대로 (벌 없음)',
  S().honest === 0 && S().frames[FR[0].id] === 'seen');
check('스티커만 도로 떼진다', S().stickers[FR[0].id] === null);
check('오답은 기록만 남는다', S().stats.missSticker === miss0 + 1);
check('틀린 뒤에도 유리문은 닫힌 채',
  G.solidAt(D.MAPS.gallery, FR[0].door[0].x, FR[0].door[0].y) === true
  && G.openedCells('gallery').length === 0);

// ── 37. 올바른 스티커 — 유리문 개방과 정직 게이지 ───────────────────────────
console.log('[37] 올바른 스티커 → 유리문 개방');
craft(FR[0].id, FR[0].author);
lookFrame(0);
check('올바른 스티커 안내', S().dialog && S().dialog.seq === D.STICKER.right);
advance();
check('액자 상태: seen → done', S().frames[FR[0].id] === 'done');
check('정직 게이지 +1', S().honest === 1);
check('유리문이 열린다', G.solidAt(D.MAPS.gallery, FR[0].door[0].x, FR[0].door[0].y) === false);
check('열린 칸은 맵 grid를 바꾸지 않음',
  D.MAPS.gallery.grid[FR[0].door[0].y].charAt(FR[0].door[0].x) === 'g');
check('열린 유리문 칸이 기록됨', G.openedCells('gallery').length === FR[0].door.length);
place('gallery', 4, 5);
check('열린 문으로 실제로 지나간다', walkUntil('ArrowRight', () => tile().x > FR[0].door[0].x));
check('둘째 유리문은 아직 닫혀 있다',
  G.solidAt(D.MAPS.gallery, FR[1].door[0].x, FR[1].door[0].y) === true);
lookFrame(0);
check('붙인 액자는 출처가 보인다', S().dialog && S().dialog.seq[0] === D.LOOK.frameDone);
advance();

// ── 38. 첫 표기로 잠긴 서랍이 열린다 ────────────────────────────────────────
console.log('[38] 서랍 개방');
check('스티커 한 장이면 서랍이 열림', G.drawerOpen() === true);
place('artroom', 11, 8);
tap('ArrowUp'); tap('z');
check('열린 서랍 대사', S().dialog && S().dialog.seq[0] === D.LOOK.drawerOpen);
advance();
place('artroom', c4('aiReceipt').at.x, c4('aiReceipt').at.y); frame(2);
check('서랍 속 생성 기록 획득', G.heldIds().indexOf('aiReceipt') >= 0);
check('4층 카드 3장을 다 들었다', G.heldIds().length === 3);

// ── 39. 세 점 표기 → 미술 선생님 배틀 ───────────────────────────────────────
console.log('[39] 미술 선생님 배틀');
place('gallery', 16, 5); frame(2);
check('표기 전에는 선생님이 없다', S().mode === 'world' && G.framesDone() === false);
craft(FR[1].id, FR[1].author);
lookFrame(1); advance();
check('둘째 유리문 개방',
  G.solidAt(D.MAPS.gallery, FR[1].door[0].x, FR[1].door[0].y) === false && S().honest === 2);
craft(FR[2].id, FR[2].author);
lookFrame(2);
check('셋째도 올바른 스티커', S().dialog && S().dialog.seq === D.STICKER.right);
tap('z');                                   // 마지막 한 점을 넘기면 바로 이어진다
check('세 점 완료 안내 상자', !!S().dialog && S().dialog.seq === D.STICKER.done);
advance();
check('정직 게이지 최대', S().honest === D.MAX_HONEST && G.framesDone() === true);
check('유리문 셋이 모두 열림', G.openedCells('gallery').length === 3);

place('gallery', 16, 5); frame(2);
check('미술 선생님 조우 대화', !!S().dialog && S().dialog.seq === D.BATTLES.artTeacher.approach);
advance();
check('미술 선생님 배틀 진입', S().mode === 'battle' && S().battle.id === 'artTeacher');
advance();
check('미술 선생님 프로필로 배틀이 구성됨', S().battle.phase === 'menu'
  && S().battle.shadow === D.BATTLES.artTeacher.shadow
  && S().battle.hearts === D.BATTLES.artTeacher.hearts);
S().battle.cursor = 1; tap('z');
S().battle.sub = G.heldIds().indexOf('styleCard'); tap('z');
advance();
check('듣기 전 증거는 통하지 않음(선생님)', S().battle.shadow === D.BATTLES.artTeacher.shadow);
check('상대 턴 시작(선생님)', S().battle.phase === 'enemy');
{
  // paint 탄막: 느리게 떨어져 바닥에 자국으로 잠깐 남는다
  const pi = D.BATTLES.artTeacher.attacks.findIndex((a) => a.kind === 'paint');
  const pa = D.BATTLES.artTeacher.attacks[pi];
  check('paint 탄막이 프로필에 있고 느리다', pi >= 0 && pa.speed <= 120);
  const b = S().battle;
  b.atk = pi; b.timer = 0; b.tell = 0; b.inv = 99; b.bullets = []; b.spawnAcc = 0;
  b.hx = G.BOX.x + 30; b.hy = G.BOX.y + 30;   // 떨어지는 자리에서 비켜서 있는다
  frame(180);
  const stains = () => S().battle.bullets.filter((p) => p.stain);
  check('물감 방울이 바닥에 자국으로 남는다', stains().length > 0);
  check('동시 자국이 상한을 넘지 않는다',
    S().battle.bullets.filter((p) => p.drop).length <= pa.maxStain);
  const st0 = stains()[0], hp = S().battle.hearts;
  S().battle.inv = 0; S().battle.hx = st0.x; S().battle.hy = st0.y;
  frame(1);
  check('자국 위를 지나면 피격', S().battle.hearts === hp - 1);
  S().battle.hearts = D.BATTLES.artTeacher.hearts; S().battle.inv = 99;
  S().battle.bullets.forEach((p) => { if (p.stain) p.hold = 0.01; });
  frame(3);
  check('자국은 마르면 사라진다', stains().length === 0);
  S().battle.bullets = []; S().battle.timer = 999; frame(1);
}
check('상대 턴 종료 후 내 턴(선생님)', S().battle.phase === 'menu');
S().battle.cursor = 2; tap('z'); advance();
check('듣기로 그림자가 얇아짐(선생님)',
  S().battle.heard === true && S().battle.shadow === D.BATTLES.artTeacher.shadow - 1);
S().battle.timer = 999; frame(1);
S().battle.cursor = 3; tap('z'); advance();
check('물러나기로 월드 복귀(선생님)', S().mode === 'world' && S().map === 'gallery');
place('gallery', 16, 5); frame(2);
check('재조우는 축약 대사(선생님)', S().dialog && S().dialog.seq === D.BATTLES.artTeacher.reApproach);
advance();
check('재도전: 그림자 1칸 깎인 채 재개(선생님)',
  S().battle.shadow === D.BATTLES.artTeacher.shadow - 1);
advance();
S().battle.cursor = 1; tap('z');
S().battle.sub = G.heldIds().indexOf('firstSketch'); tap('z');
advance();
check('증거 제시로 그림자 0(선생님)', S().battle.shadow === 0);
check('손 내밀기 준비(선생님)', S().battle.spare === true);
tap('z'); advance();
check('미술 선생님을 되돌림', S().clearedOf.artTeacher === true);
check('4층 계단 개방', S().stairsOpen.gallery === true);
check('1~3층 진행은 건드리지 않음',
  S().stairsOpen.hall3 === true && S().clearedOf.senior === true);
place('gallery', 16, 5); frame(2);
check('되돌린 뒤엔 다시 배틀하지 않음(선생님)', S().mode === 'world');
tap('ArrowRight'); tap('z');
check('되돌린 선생님이 한 줄 힌트를 준다', S().dialog && S().dialog.seq === D.BATTLES.artTeacher.hint);
advance();
openBench();
check('다 붙인 뒤의 제작대는 다른 안내',
  S().mode === 'world' && S().dialog && S().dialog.seq === D.STICKER.clear);
advance();

// ── 40. 4층 통과 → 5층 진입 ────────────────────────────────────────────────
// P5: 4층 계단은 더 이상 클리어 화면이 아니라 5층 복도로 이어진다(스펙 §1).
// 클리어 화면 검사 7건은 이름과 뜻 그대로 오늘의 마지막 계단(교무실)으로 옮겨 [49]에서 돈다.
console.log('[40] 4층 통과 → 5층');
place('gallery', 18, 5);
hold('ArrowRight', 30);
check('계단 접촉 안내(4층)', !!S().dialog);
tap('z');                                   // 계단 대사를 넘기면 그 자리에서 5층으로
check('5층으로 올라감', S().map === 'hall5' && S().floor === 5);
check('5층 도착 안내 상자', S().dialog && S().dialog.seq === D.FLOOR5.enter);
advance();
check('5층 복도 입구에 도착', tile().x === 1 && tile().y === 3);
check('5층 가방은 비어 있음 (층별 카드 집계 분리)', G.heldIds().length === 0);
check('의존은 0에서 시작', S().depend === 0 && D.MAX_DEPEND === 3);
check('5층 계단은 아직 잠김', !S().stairsOpen.office);
G.save();
check('이어하기가 5층을 기억', G.load() === true && S().floor === 5 && S().map === 'hall5');
check('이어하기가 액자·정직도 복원', G.framesDone() === true && S().honest === D.MAX_HONEST);
check('이어하기가 인물 진행을 복원',
  S().clearedOf.artTeacher === true && S().heardOf.artTeacher === true);
check('이어하기가 열린 유리문도 복원', G.openedCells('gallery').length === 3);

// ── 41. 4층 세이브 방어 ────────────────────────────────────────────────────
console.log('[41] 4층 세이브 방어');
windowObj.localStorage.setItem(D.SAVE_KEY, JSON.stringify({
  v: 1, map: 'gallery', px: 100, py: 260, dir: 3, honest: 99,
  frames: { [FR[0].id]: 'done', [FR[1].id]: '이상한값', ghost: 'done' },
  stickers: { [FR[1].id]: AU[1].id, [FR[2].id]: 'a99', ghost: AU[0].id },
  opened: { gallery: [{ x: 0, y: 0 }], nowhere: [{ x: 1, y: 1 }] },
  stats: { sec: 10, stolen: 0, retreats: 0, missSticker: -5 },
}));
check('손상된 4층 저장도 로드는 된다', G.load() === true);
check('모르는 액자 상태값은 처음으로 되돌림', S().frames[FR[1].id] === 'unseen');
check('모르는 액자 키는 버림', S().frames.ghost === undefined);
check('아는 견본의 스티커는 살아남음', S().stickers[FR[1].id] === AU[1].id);
check('모르는 견본의 스티커는 버림', S().stickers[FR[2].id] === null);
check('정직 게이지는 액자 상태에서 다시 계산', S().honest === 1);
check('열린 유리문은 저장 좌표가 아니라 액자 상태에서 다시 만든다',
  G.openedCells('nowhere').length === 0
  && JSON.stringify(G.openedCells('gallery')) === JSON.stringify(FR[0].door));
check('음수 오답 기록은 0으로', S().stats.missSticker === 0);
// 유리문 하나만 열린 최악에서도 액자·카드·복도 문은 그대로 닿는다 (헌법 §3-3)
check('한 점만 밝힌 상태에서도 액자 앞·복도 문은 열려 있다',
  !G.solidAt(D.MAPS.gallery, FR[2].x, FR[2].y - 1) && !G.solidAt(D.MAPS.gallery, 1, 5));
check('4층 회복 경로 문구가 있다', typeof D.T.honHelp === 'string' && D.T.honHelp.length > 0);

// ══ 5층: 교무실 · AI 의존과 책임 (스펙 P5 §6) ═══════════════════════════════
const LK = D.LOCKS, PA = D.PAPERS;
const lockOf = (id) => LK.find((k) => k.id === id);
const paperOf = (id) => PA.find((p) => p.id === id);
const paperList = D.MAPS.office.papers.map((p) => p.id);   // 콘솔 목록 순서 = 맵 배치 순서
// 단말은 막힌 칸이라 옆에 서서 바라본다 — 어느 쪽에서 볼지는 맵이 정한다.
function faceTerm(k) {
  const dirs = [[0, -1, 'ArrowDown'], [0, 1, 'ArrowUp'], [-1, 0, 'ArrowRight'], [1, 0, 'ArrowLeft']];
  for (const [dx, dy, key] of dirs) {
    const x = k.term.x + dx, y = k.term.y + dy;
    if (x < 0 || y < 0) continue;
    if (!G.solidAt(D.MAPS[k.map], x, y)) { place(k.map, x, y); tap(key); return true; }
  }
  return false;
}
function openTerm(id) { const ok = faceTerm(lockOf(id)); tap('z'); return ok; }

// ── 42. 5층 진입 — 잠긴 장치 셋과 반짝임 표시 ───────────────────────────────
console.log('[42] 5층 — 잠긴 장치와 반짝임');
G.newGame(); advance();
// 1~4층 진행은 앞 절에서 다 봤으니 5층 상태로 바로 올린다.
S().clearedOf.mate = true; S().clearedOf.bro = true;
S().clearedOf.senior = true; S().clearedOf.artTeacher = true;
S().stairsOpen.hallway = true; S().stairsOpen.lab = true;
S().stairsOpen.hall3 = true; S().stairsOpen.gallery = true;
FR.forEach((f) => { S().frames[f.id] = 'done'; });
G.save(); G.load();
place('hall5', 1, 3); frame(2);
check('5층 복도 진입', S().map === 'hall5' && S().floor === 5);
check('장치 셋이 모두 잠겨 있다',
  LK.every((k) => G.solidAt(D.MAPS[k.map], k.at.x, k.at.y) === true));
check('열린 장치 칸은 아직 없다', G.openedCells('hall5').length === 0
  && G.openedCells('office').length === 0 && G.openedCells('docroom').length === 0);
check('반짝임 표시가 켜져 있다', G.glintOn() === true);
check('의존 0에서는 감속이 없다', G.moveSpeed() === G.SPEED);
place('hall5', 10, 4);
hold('ArrowDown', 60);
check('안쪽 문이 진행을 막는다', tile().y === 4);
tap('ArrowDown'); tap('z');
check('안쪽 문을 조사하면 왜 안 열리는지 알려 준다',
  S().dialog && S().dialog.seq[0] === D.LOOK.innerDoor);
advance();
check('문 뒤 카드는 아직 주울 수 없다', G.heldIds().indexOf('nameBook') < 0);

// ── 43. 나비스에게 맡기기 — 경고 1회 → 즉시 개방 + 감속 ─────────────────────
console.log('[43] 맡기기 — 경고와 의존');
openTerm('cabinet');
check('나비스 단말이 열린다 (방송 콘솔과 같은 문법)',
  S().mode === 'console' && S().con.kind === 'navis' && S().con.level === 0);
check('단말이 어느 장치인지 기억한다', S().con.lock === 'cabinet');
tap('z');                                   // 맡기기 (첫 시도)
check('첫 맡기기 전에 1회 경고', !!S().dialog && S().dialog.seq === D.NAVIS.warn);
check('경고는 플래그로 1회만', S().flags.trustWarn === true);
advance();
check('경고 단계에서는 아직 열리지 않음', G.lockOpen('cabinet') === false && S().depend === 0);
tap('z');                                   // 다시 맡기기
check('맡기면 즉시 열린다', G.lockOpen('cabinet') === true);
check('맡기면 의존 +1', S().depend === 1);
advance();
check('의존 +1 = 이동 속도 15% 감소', Math.abs(G.moveSpeed() - G.SPEED * 0.85) < 0.01);
check('열린 장치 칸이 통행 가능해진다', G.solidAt(D.MAPS.office, 8, 5) === false);
check('열린 칸은 맵 grid를 바꾸지 않음', D.MAPS.office.grid[5].charAt(8) === 'Y');
check('열린 장치 칸이 기록됨', G.openedCells('office').length === 1);
closeCon();
place('office', 7, 5);
check('열린 캐비닛으로 실제로 지나간다', walkUntil('ArrowRight', () => tile().x > 8, 900));
place('office', 9, 5); frame(2);
check('캐비닛 안 손글씨 가정통신문 획득', G.heldIds().indexOf('handNote') >= 0);
check('5층 카드 안내 토스트', !!S().toast && S().toast.text === D.T.gotCard5);
check('5층 카드는 의존을 건드리지 않음', S().depend === 1);
place('office', 7, 5);
tap('ArrowRight'); tap('z');
check('열린 장치는 다른 대사', S().dialog && S().dialog.seq[0] === D.LOOK.cabinetOpen);
advance();

// ── 44. 의존 단계별 연출 — 반짝임 off · 회색 안개 · 최저 속도 ───────────────
console.log('[44] 의존 단계별 연출');
S().depend = 2; frame(2);
check('의존 +2 = 30% 감소', Math.abs(G.moveSpeed() - G.SPEED * 0.70) < 0.01);
check('의존 +2부터 반짝임 표시가 꺼진다', G.glintOn() === false && D.DEPEND_DIM === 2);
S().depend = D.MAX_DEPEND; frame(2);
check('의존 +3 = 45% 감소', Math.abs(G.moveSpeed() - G.SPEED * 0.55) < 0.01);
check('의존 MAX여도 멈추지 않는다 (최저 속도 > 0)', G.moveSpeed() > 0);
check('의존 MAX에서도 회색 안개 렌더에 예외 없음', S().mode === 'world' && D.DEPEND_FOG === 3);
const slowX = S().px;
hold('ArrowLeft', 20);
check('의존 MAX여도 이동·진행은 막지 않는다 (회복 가능 원칙)', S().px < slowX);
check('의존 회복 경로 문구가 있다', typeof D.T.depHelp === 'string' && D.T.depHelp.length > 0);
S().depend = 1;

// ── 45. 스스로 하기 ① 서류함 — 단서 → 열쇠 → 개방 ──────────────────────────
console.log('[45] 스스로 하기 — 열쇠 과제');
place('docroom', 8, 2);
tap('ArrowRight'); tap('z');
check('서류함 단서: 화분 쪽으로 이어지는 물자국',
  S().dialog && S().dialog.seq[0] === D.LOOK.fileBox);
advance();
openTerm('fileBox');
check('둘째 단말도 같은 문법', S().mode === 'console' && S().con.lock === 'fileBox');
tap('ArrowDown'); tap('z');                 // 스스로 하기
check('열쇠가 없으면 안내만 한다',
  !!S().dialog && S().dialog.seq === D.NAVIS.needKey && G.lockOpen('fileBox') === false);
advance();
check('막혀도 콘솔은 열린 채로 남는다', S().mode === 'console');
closeCon();
place('docroom', 3, 8);
tap('ArrowUp'); tap('z');
check('화분 밑에서 열쇠 획득', S().dialog && S().dialog.seq === D.NAVIS.gotKey && S().hasKey === true);
advance();
tap('z');
check('열쇠는 한 번만 나온다', S().dialog && S().dialog.seq === D.NAVIS.keyGone);
advance();
const dep45 = S().depend;
openTerm('fileBox');
tap('ArrowDown'); tap('z');                 // 스스로 하기
check('열쇠로 서류함을 내 손으로 열었다',
  S().dialog && S().dialog.seq === D.NAVIS.selfDone && G.lockOpen('fileBox') === true);
check('스스로 하면 의존이 오르지 않는다', S().depend === dep45);
advance();
check('스스로 연 장치는 단말이 더 부르지 않는다', S().mode === 'world');
place('docroom', 11, 2); frame(2);
check('서류함 안 낡은 결재 도장 획득', G.heldIds().indexOf('oldStamp') >= 0);

// ── 46. 스스로 하기 ② 캐비닛 서류 순서 → 의존 회복(-1) ─────────────────────
console.log('[46] 서류 순서 과제 → 의존 회복');
place('office', 2, 4);
tap('ArrowUp'); tap('z');
check('서류를 조사하면 날짜가 보인다',
  S().dialog && S().dialog.seq === paperOf(paperList[0]).look);
advance();
check('콘솔 목록 순서와 정답 순서는 다르다 (대조가 필요한 퍼즐)',
  JSON.stringify(paperList) !== JSON.stringify(lockOf('cabinet').order));
const dep46 = S().depend;
check('맡긴 장치는 회복 대상으로 남아 있다', S().trusted.cabinet === true);
openTerm('cabinet');
tap('z');                                   // 목록 첫 줄 = 내가 다시 해볼래
check('맡긴 장치는 다시 해볼 수 있다', !!S().dialog && S().dialog.seq === D.NAVIS.orderAsk);
advance();
check('서류 3지선다가 뜬다', S().mode === 'console' && S().con.level === 1);
const wrongIdx = paperList.indexOf(lockOf('cabinet').order[1]);
S().con.cursor = wrongIdx; tap('z');
check('순서가 틀리면 처음부터 (벌 없음)',
  S().dialog && S().dialog.seq === D.NAVIS.orderNo && S().depend === dep46);
advance();
check('틀려도 콘솔은 그대로', S().mode === 'console' && S().con.level === 1);
for (let i = 0; i < lockOf('cabinet').order.length; i++) {
  S().con.cursor = paperList.indexOf(lockOf('cabinet').order[i]);
  tap('z');
  if (i < lockOf('cabinet').order.length - 1) {
    check(`서류 ${i + 1}번째가 맞다`, S().dialog && S().dialog.seq === D.NAVIS.orderOk);
    advance();
  }
}
check('세 장을 날짜 순서로 고르면 열린다', S().dialog && S().dialog.seq === D.NAVIS.recovered);
check('다시 해보면 의존 -1 (회복 경로)', S().depend === dep46 - 1);
check('회복하면 맡긴 표시가 사라진다', !S().trusted.cabinet);
advance();

// ── 47. 스스로 하기 ③ 시간표 빈칸 → 안쪽 문 ────────────────────────────────
console.log('[47] 시간표 빈칸 과제');
place('office', 2, 2);
tap('ArrowUp'); tap('z');
check('교무실 시간표가 빈칸의 단서', S().dialog && S().dialog.seq[0] === D.LOOK.timetable);
advance();
const dep47 = S().depend;
openTerm('innerDoor');
tap('ArrowDown'); tap('z');                 // 스스로 하기
check('빈칸 안내', !!S().dialog && S().dialog.seq === D.NAVIS.quizAsk);
advance();
check('3지선다가 뜬다', S().mode === 'console' && S().con.level === 1);
const quiz = lockOf('innerDoor').quiz;
S().con.cursor = quiz.findIndex((q) => q.id !== lockOf('innerDoor').answer);
tap('z');
check('틀리면 다시 고르면 된다',
  S().dialog && S().dialog.seq === D.NAVIS.quizNo && G.lockOpen('innerDoor') === false);
advance();
S().con.cursor = quiz.findIndex((q) => q.id === lockOf('innerDoor').answer);
tap('z');
check('맞으면 안쪽 문이 열린다',
  G.lockOpen('innerDoor') === true && S().dialog && S().dialog.seq === D.NAVIS.selfDone);
check('스스로 푼 문도 의존은 그대로', S().depend === dep47);
advance();
place('hall5', 10, 4);
check('열린 안쪽 문으로 실제로 지나간다', walkUntil('ArrowDown', () => tile().y > 5, 900));
place('hall5', 10, 8); frame(2);
check('문 뒤에서 이름 수첩 획득', G.heldIds().indexOf('nameBook') >= 0);
check('5층 카드 3장을 다 들었다', G.heldIds().length === 3);
check('장치 셋이 모두 열렸다', LK.every((k) => G.lockOpen(k.id) === true));

// ── 48. 교감 선생님 배틀 — stamp 예고 탄막 ─────────────────────────────────
console.log('[48] 교감 선생님 배틀');
place('office', 11, 5); frame(2);
check('교감 조우 대화', !!S().dialog && S().dialog.seq === D.BATTLES.vice.approach);
advance();
check('교감 배틀 진입', S().mode === 'battle' && S().battle.id === 'vice');
advance();
check('교감 프로필로 배틀이 구성됨', S().battle.phase === 'menu'
  && S().battle.shadow === D.BATTLES.vice.shadow && S().battle.hearts === D.BATTLES.vice.hearts);
S().battle.cursor = 1; tap('z');
S().battle.sub = G.heldIds().indexOf('handNote'); tap('z');
advance();
check('듣기 전 증거는 통하지 않음(교감)', S().battle.shadow === D.BATTLES.vice.shadow);
check('상대 턴 시작(교감)', S().battle.phase === 'enemy');
{
  const si = D.BATTLES.vice.attacks.findIndex((a) => a.kind === 'stamp');
  const sa = D.BATTLES.vice.attacks[si];
  check('stamp 탄막이 프로필에 있고 예고가 0.8초 이상', si >= 0 && sa.warn >= 0.8);
  const b = S().battle;
  b.atk = si; b.timer = 0; b.tell = 0; b.inv = 99; b.bullets = []; b.spawnAcc = 0;
  b.hx = G.BOX.x + 30; b.hy = G.BOX.y + 30;
  frame(72);                                 // 1.15초 — 첫 도장이 예고로 떴다
  const st = S().battle.bullets[0];
  check('도장은 먼저 예고 칸으로 뜬다',
    !!st && S().battle.bullets.every((p) => p.stamp && p.warn > 0));
  const hp0 = S().battle.hearts;
  S().battle.inv = 0; S().battle.hx = st.x; S().battle.hy = st.y;
  frame(1);
  check('예고 중에는 맞지 않는다 (읽고 피할 시간)', S().battle.hearts === hp0);
  st.warn = 0.01;
  frame(2);
  check('예고가 끝나면 찍힌다', S().battle.hearts === hp0 - 1);
  S().battle.hearts = D.BATTLES.vice.hearts; S().battle.inv = 99;
  frame(180);
  check('동시에 뜨는 도장이 상한을 넘지 않는다',
    S().battle.bullets.filter((p) => p.stamp).length <= sa.cells);
  S().battle.bullets = []; S().battle.timer = 999; frame(1);
}
check('상대 턴 종료 후 내 턴(교감)', S().battle.phase === 'menu');
S().battle.cursor = 2; tap('z'); advance();
check('듣기로 그림자가 얇아짐(교감)',
  S().battle.heard === true && S().battle.shadow === D.BATTLES.vice.shadow - 1);
S().battle.timer = 999; frame(1);
S().battle.cursor = 3; tap('z'); advance();
check('물러나기로 월드 복귀(교감)', S().mode === 'world' && S().map === 'office');
place('office', 11, 5); frame(2);
check('재조우는 축약 대사(교감)', S().dialog && S().dialog.seq === D.BATTLES.vice.reApproach);
advance();
check('재도전: 그림자 1칸 깎인 채 재개(교감)', S().battle.shadow === D.BATTLES.vice.shadow - 1);
advance();
S().battle.cursor = 1; tap('z');
S().battle.sub = G.heldIds().indexOf('nameBook'); tap('z');
advance();
check('증거 제시로 그림자 0(교감)', S().battle.shadow === 0);
check('손 내밀기 준비(교감)', S().battle.spare === true);
tap('z');
check('약속 카드⑤ 상자',
  !!S().dialog && S().dialog.seq[1] === D.BATTLES.vice.promise[0]);
check('약속 카드 뒤에 옥상 예고 한 상자 (나비스 복선)',
  D.BATTLES.vice.promise.length === 2 && S().dialog.seq[2] === D.BATTLES.vice.promise[1]);
advance();
check('교감 선생님을 되돌림', S().clearedOf.vice === true);
check('5층 계단 개방', S().stairsOpen.office === true);
check('1~4층 진행은 건드리지 않음',
  S().stairsOpen.gallery === true && S().clearedOf.artTeacher === true);
place('office', 10, 5); frame(2);
check('되돌린 뒤엔 다시 배틀하지 않음(교감)', S().mode === 'world');
tap('ArrowRight'); tap('z');
check('되돌린 교감이 한 줄 힌트를 준다', S().dialog && S().dialog.seq === D.BATTLES.vice.hint);
advance();

// ── 49. 5층 통과 → 클리어 화면 ─────────────────────────────────────────────
// [40]에서 옮겨온 클리어 화면 검사 — 오늘의 마지막 계단이 교무실로 바뀌었을 뿐,
// 검사 이름과 뜻은 그대로 둔다(옥상은 다음 차시).
console.log('[49] 5층 통과 → 옥상');
place('office', 12, 5);
hold('ArrowRight', 30);
check('계단 접촉 안내(5층)', !!S().dialog);
advance();
check('옥상 진입', S().map === 'rooftop' && S().floor === 6);
check('옥상은 내려갈 계단이 열려 있다', !!D.MAPS.rooftop.stairs);
check('이어하기가 5층·의존·장치를 기억',
  G.load() === true && S().map === 'rooftop' && LK.every((k) => G.lockOpen(k.id) === true));

// ── 50. 5층 세이브 방어 ────────────────────────────────────────────────────
console.log('[50] 5층 세이브 방어');
windowObj.localStorage.setItem(D.SAVE_KEY, JSON.stringify({
  v: 1, map: 'office', px: 100, py: 260, dir: 3, depend: 99, hasKey: 'yes',
  locks: { cabinet: true, ghost: true, fileBox: 'yes' },
  trusted: { cabinet: true, innerDoor: true, ghost: true },
  opened: { office: [{ x: 0, y: 0 }], nowhere: [{ x: 1, y: 1 }] },
}));
check('손상된 5층 저장도 로드는 된다', G.load() === true);
check('의존 게이지는 범위로 클램프', S().depend === D.MAX_DEPEND);
check('모르는 장치 키는 버림', S().locks.ghost === undefined);
check('불리언 아닌 개방값은 무시', !S().locks.fileBox && G.lockOpen('fileBox') === false);
check('닫힌 장치의 회복 빚은 남기지 않음', !S().trusted.innerDoor && S().trusted.cabinet === true);
check('불리언 아닌 열쇠 값은 무시', S().hasKey === false);
check('열린 장치 칸은 저장 좌표가 아니라 장치 상태에서 다시 만든다',
  G.openedCells('nowhere').length === 0
  && JSON.stringify(G.openedCells('office')) === JSON.stringify(lockOf('cabinet').open));
// 장치가 다 잠긴 최악에서도 단말·복귀 문은 그대로 닿는다 (헌법 §3-3)
check('한 장치만 연 상태에서도 단말·복귀 문은 열려 있다',
  !G.solidAt(D.MAPS.office, 7, 4) && !G.solidAt(D.MAPS.office, 0, 8));
check('의존 MAX에서도 이동 속도가 0이 아니다', G.moveSpeed() > 0);

// ── 51. 옥상: 나비스의 다섯 질문 ────────────────────────────────────────────
console.log('[51] 옥상 문답');
// [50]이 최소 저장으로 로드해 진행이 비었다 — 다섯 층을 되돌린 상태로 되돌려 놓는다.
D.PROMISES.forEach((p) => { S().clearedOf[p.who] = true; });
S().ending = null; S().mode = 'world';
const PR = D.PROMISES.map((p) => p.id);
check('다섯 층을 되돌려 약속 5장 보유', G.promiseIds().length === 5);
check('약속 순서가 층 순서', JSON.stringify(G.promiseIds()) === JSON.stringify(PR));

place('rooftop', 9, 6);                        // 대면 지점 근처
frame(3);
check('나비스가 먼저 말을 건다', !!S().dialog);
advance();
check('문답 모드 진입(배틀 아님)', S().mode === 'finale' && S().battle === null);
check('첫 질문에서 약속 고르기', S().fin.phase === 'pick' && S().fin.q === 0);
check('남은 질문이 5개', D.FINALE.questions.length === 5);

// 오답 — 벌 없이 다시 고른다
S().fin.cursor = 1;                            // 1번 질문의 정답은 p1
tap('z');
check('오답은 그대로 되돌려 준다', S().dialog && S().dialog.seq === D.FINALE.wrong);
advance();
check('오답 뒤에도 같은 질문에 머문다', S().fin.phase === 'pick' && S().fin.q === 0);
check('오답이 기록으로만 남는다', S().stats.missPromise === 1);

// 정답 3개 — 세 번째 뒤에 딱 한 번 흔들린다
for (let i = 0; i < 3; i++) {
  S().fin.cursor = i;
  tap('z');
  advance(6);
}
check('세 질문을 넘김', S().fin.q === 3);
check('세 번째 뒤 흔들림이 시작됨', S().fin.phase === 'shake');
const heartsBefore = JSON.stringify(S().fin.hit);
S().fin.bullets.push({ x: S().fin.hx, y: S().fin.hy, vx: 0, vy: 0, s: 13 });
frame(1);
check('스치기만 한다 — 진행이 멈추지 않음', S().mode === 'finale' && S().fin.phase === 'shake');
S().fin.timer = 999; frame(1);
check('흔들림은 시간이 지나면 끝난다', !!S().dialog || S().fin.phase !== 'shake');
advance(6);
check('흔들림 뒤 네 번째 질문으로', S().fin.phase === 'pick' && S().fin.q === 3);

// 남은 두 질문 정답
for (let i = 3; i < 5; i++) {
  S().fin.cursor = i;
  tap('z');
  advance(6);
}
check('다섯 질문을 모두 넘김', S().fin.q === 5);
check('고백 뒤 엔딩 선택', S().fin.phase === 'choose');

// ── 52. 엔딩 선택 · 완결 화면 ───────────────────────────────────────────────
console.log('[52] 엔딩');
tap('z');
check('선택 전 확인을 한 번 묻는다', S().fin.phase === 'confirm');
check('확인 기본값은 되돌리기 쪽', S().fin.confirmCursor === 1);
tap('x');
check('취소하면 선택으로 돌아온다', S().fin.phase === 'choose');
tap('z'); tap('ArrowLeft');                    // 확인 → '네'
tap('z');
advance(10);
check('엔딩 A(함께 간다) 도달', S().ending === 'A');
check('완결 화면', S().mode === 'clear' && S().flags.done === true);
check('엔딩이 기록에 남는다', S().stats.ending === 'A');
check('완결 화면 문구가 층 통과가 아니라 탈출', typeof D.CLEAR.escBanner === 'string');
check('되돌린 사람 수를 셀 수 있다', G.promiseIds().length === 5);
check('완결 뒤에도 저장은 남는다', G.hasSave() === true);
check('이어하기가 엔딩을 기억', G.load() === true && S().ending === 'A');

// 엔딩 B — 같은 자리에서 반대 선택
S().ending = null; S().mode = 'world';
place('rooftop', 9, 6); frame(3); advance();
S().fin.q = 5; S().fin.phase = 'choose'; S().fin.cursor = 1;
tap('z');                                      // 확인창
tap('ArrowLeft'); tap('z');
advance(10);
check('엔딩 B(오늘은 끈다) 도달', S().ending === 'B');
check('두 엔딩 모두 완결 화면으로', S().mode === 'clear');
check('엔딩 B도 기록에 남는다', S().stats.ending === 'B');

// 완결 화면 메뉴 — 타이틀로는 저장을 지우지 않는다
tap('ArrowDown'); tap('z');
check('타이틀로 가도 저장 유지', S().mode === 'title' && G.hasSave() === true);
tap('z');
check('이어하기로 완결 상태 복원', S().mode === 'world' && S().ending === 'B');

// 약속이 없으면 문답이 열리지 않는다(되돌린 사람 0명)
S().ending = null;
D.PROMISES.forEach((p) => { S().clearedOf[p.who] = false; });
place('rooftop', 9, 6); frame(3); advance();
check('약속이 없으면 안내 후 물러난다', S().mode === 'world' || !!S().dialog);
advance(6);
check('가둬 두지 않는다 (월드 복귀)', S().mode === 'world');

// ── 53. 교사 도구 (P7) ──────────────────────────────────────────────────────
// 학생 화면은 그대로 두고 타이틀에서만 열리는 교실 운영 계층.
console.log('[53] 교사 도구 — 진입 · 탭 · 차시 · 리포트');
const TE = D.TEACHER;
const TU = () => G.teacherUi();
function toTitle() { G.setState(G.blankState()); frame(1); }
function openTeacher() { toTitle(); tap('t'); return S().mode === 'teacher'; }

check('교사 데이터가 있다', !!TE && (TE.lessons || []).length === 6);
check('타이틀에서 T로 교사 화면 진입', openTeacher());
check('진입 시 첫 탭은 수업 시작', TU().tab === 0 && TU().cursor === 0);
tap('ArrowRight');
check('오른쪽으로 탭 전환', TU().tab === 1);
tap('ArrowRight'); tap('ArrowRight');
check('탭은 한 바퀴 돈다', TU().tab === 0);
tap('ArrowLeft');
check('왼쪽으로도 돈다', TU().tab === 2);
tap('x');
check('X로 타이틀 복귀', S().mode === 'title');

// 본편 플레이 중에는 어떤 경로로도 열리지 않는다 (수업 중 오조작 방지)
place('classroom', 7, 8); S().mode = 'world'; frame(1);
tap('t');
check('월드에서 T는 무시된다', S().mode === 'world');
check('월드에서 화면 탭도 무시된다', G.teacherTap(G.TBTN.x + 4, G.TBTN.y + 4) === false);
S().mode = 'clear'; frame(1);
tap('t');
check('클리어 화면에서도 T는 무시된다', S().mode === 'clear');

// 타이틀 우하단 [선생님] 버튼 — 터치 기기용 (같은 진입점)
toTitle();
check('버튼 밖을 누르면 안 열린다', G.teacherTap(10, 10) === false && S().mode === 'title');
check('버튼을 누르면 열린다',
  G.teacherTap(G.TBTN.x + G.TBTN.w / 2, G.TBTN.y + G.TBTN.h / 2) === true && S().mode === 'teacher');
tap('x');

// 저장이 없어도 안전하게 열리고, 빈 리포트를 보여 준다
G.clearSave();
check('저장 없이도 열린다', openTeacher());
check('저장이 없으면 빈 리포트', G.teacherReport() === null && TU().rep === null);
tap('x');

// 해석 규칙 4종 분기 (임계값은 데이터에 있다)
const RULE = (stat) => (TE.rules || []).find((r) => r.stat === stat);
const repOf = (o) => Object.assign(
  { stolen: 0, retreats: 0, missSticker: 0, missPromise: 0 }, o);
check('해석 — 뺏김 임계값',
  G.teacherHint(repOf({ stolen: RULE('stolen').min })) === RULE('stolen').line);
check('해석 — 물러남 임계값',
  G.teacherHint(repOf({ retreats: RULE('retreats').min })) === RULE('retreats').line);
check('해석 — 약속 오답 임계값',
  G.teacherHint(repOf({ missPromise: RULE('missPromise').min })) === RULE('missPromise').line);
check('해석 — 해당 없음', G.teacherHint(repOf({ stolen: 2, retreats: 2, missPromise: 2 })) === TE.hintOk);
check('해석 — 저장이 없어도 문구가 나온다', G.teacherHint(null) === TE.hintOk);

// 리포트는 저장 1건을 읽는다 (엔진 상태가 아니라 저장소)
windowObj.localStorage.setItem(D.SAVE_KEY, JSON.stringify({
  v: 1, map: 'hall4', px: 100, py: 100, dir: 0,
  visited: { classroom: true, hall3: true, hall4: true, nowhere: true },
  clearedOf: { mate: true, bro: true, ghost: true },
  stats: { sec: 754, stolen: 4, retreats: 1, missSticker: 2, missPromise: 3 },
  ending: 'B',
}));
const rep = G.teacherReport();
check('최고 도달 층을 읽는다', rep && rep.floor === 4);
check('되돌린 사람 수를 읽는다(모르는 인물은 버림)', rep.back === 2);
check('시간·뺏김·물러남을 읽는다', rep.sec === 754 && rep.stolen === 4 && rep.retreats === 1);
check('스티커·약속 오답을 읽는다', rep.missSticker === 2 && rep.missPromise === 3);
check('고른 엔딩을 읽는다', rep.ending === 'B');
check('해석 한 줄이 뺏김 규칙으로 붙는다', G.teacherHint(rep) === RULE('stolen').line);
windowObj.localStorage.setItem(D.SAVE_KEY, JSON.stringify({ v: 9, map: 'classroom' }));
check('구버전 저장은 빈 리포트로 본다', G.teacherReport() === null);

// 기록 지우기 — 확인 1회
windowObj.localStorage.setItem(D.SAVE_KEY, JSON.stringify({
  v: 1, map: 'classroom', px: 100, py: 100, stats: { sec: 10 },
}));
check('지우기 전 저장이 있다', openTeacher() && G.hasSave() === true);
tap('ArrowRight'); tap('z');
check('기록 지우기는 확인을 묻는다', !!TU().confirm && TU().confirm.kind === 'wipe');
check('확인 기본값은 거절 쪽', TU().confirmCursor === 1);
tap('z');
check('거절하면 기록이 남는다', G.hasSave() === true && !TU().confirm);
tap('z'); tap('ArrowLeft'); tap('z');
check('확인하면 기록이 지워진다', G.hasSave() === false);
check('지운 뒤 리포트도 비었다', TU().rep === null);
tap('x');

// 차시 시작 — 확인 → 상태 세팅 → 해당 맵 진입
check('차시 화면 진입', openTeacher() && TU().tab === 0);
tap('ArrowDown');
check('커서가 아래로 움직인다', TU().cursor === 1);
tap('z');
check('차시 시작은 확인을 묻는다', !!TU().confirm && TU().confirm.kind === 'start');
tap('z');
check('거절하면 교사 화면에 머문다', S().mode === 'teacher' && G.hasSave() === false);

const lessonIdx = (fl) => TE.lessons.findIndex((L) => L.fl === fl);
function startLesson(fl) {
  if (!openTeacher()) return false;
  TU().cursor = lessonIdx(fl);
  tap('z'); tap('ArrowLeft'); tap('z');
  return S().mode === 'world';
}
check('1층 차시 시작', startLesson(1) && S().map === 'classroom' && S().floor === 1);
check('1층 차시는 아무도 되돌아와 있지 않다', Object.keys(S().clearedOf).length === 0);
check('3층 차시 시작', startLesson(3) && S().map === 'hall3' && S().floor === 3);
check('아래층 인물이 되돌아온 상태로 채워진다',
  S().clearedOf.mate === true && S().clearedOf.bro === true && !S().clearedOf.senior);
check('아래층 계단이 열려 있다', S().stairsOpen.hallway === true && S().stairsOpen.lab === true);
check('그 층 계단은 아직 잠겨 있다', !S().stairsOpen.hall3);
check('게이지는 0에서 시작', S().exposure === 0 && S().bubble === 0 && S().pollute === 0);
check('카드는 초기 배치', G.heldIds().length === 0
  && S().cards.passNote.map === 'hallway' && S().cards.fullPhoto.map === 'archive');
check('진입 좌표가 그 층 시작 지점', tile().x === TE.lessons[lessonIdx(3)].x && tile().y === TE.lessons[lessonIdx(3)].y);
check('도입 대사를 다시 보여 주지 않는다', !S().dialog && S().flags.intro === true);
check('차시 시작이 기록을 덮어쓴다', G.hasSave() === true && G.load() === true && S().map === 'hall3');
check('옥상 차시 시작', startLesson(6) && S().map === 'rooftop' && S().floor === 6);
check('옥상 차시는 약속 5장이 모여 있다', G.promiseIds().length === 5);
check('학생 화면 문법은 그대로 (월드 복귀)', S().mode === 'world' && !S().paused);

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log('');
if (fails.length) {
  console.error(`✘ 실패 ${fails.length}건 / 통과 ${pass}건`);
  fails.forEach((f) => console.error('   - ' + f));
  process.exit(1);
}
// 회귀망이 조용히 얇아지는 것을 막는 하한선 (P6 482건 + P7 신규 25건 이상)
if (pass < 507) { console.error(`✘ 검사 수 부족: ${pass}건 (P7 기준 507건 이상)`); process.exit(1); }
console.log(`✔ 스모크 ${pass}건 모두 통과`);
