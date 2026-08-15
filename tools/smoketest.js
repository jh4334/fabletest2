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
check('내 턴 메뉴', S().battle.phase === 'menu' && S().battle.shadow === D.BATTLE.shadow);

tap('ArrowDown');                         // 그리드: 0(말 걸기) 아래는 2(가만히 듣기)
check('그리드 내비: ↓ = 아랫줄', S().battle.cursor === 2);
tap('ArrowRight');
check('그리드 내비: → = 옆 칸', S().battle.cursor === 3);
tap('ArrowUp'); tap('ArrowLeft');         // 3 → 1 → 0
check('그리드 내비: ↑← 복귀', S().battle.cursor === 0);
// 말 걸기 3단 반응 — 반복할수록 대사가 변한다
tap('z');                                 // 말 걸기 1회
check('말 걸기 1: 가로챔', S().dialog && S().dialog.seq === D.BATTLE.talk);
advance(); S().battle.timer = 999; frame(1);
tap('z');
check('말 걸기 2: 반응이 달라짐', S().dialog && S().dialog.seq === D.BATTLE.talk2);
advance(); S().battle.timer = 999; frame(1);
tap('z');
check('말 걸기 3+: 듣기 유도 힌트', S().dialog && S().dialog.seq === D.BATTLE.talk3);
advance(); S().battle.timer = 999; frame(1);
tap('ArrowRight');                        // 말 걸기 → 보여주기
check('메뉴 커서 이동', S().battle.cursor === 1);
tap('z');
check('보여주기 목록 열림', S().battle.phase === 'sub');
tap('ArrowDown'); tap('z');               // 두 번째 카드 = 비밀번호 쪽지
advance();
check('듣기 전 증거는 통하지 않음', S().battle.shadow === D.BATTLE.shadow);
check('상대 턴 시작', S().battle.phase === 'enemy');

// 탄막 피격: 하트 위에 조각을 놓고 한 프레임 진행
S().battle.tell = 0;
S().battle.bullets.push({ x: S().battle.hx, y: S().battle.hy, vx: 0, vy: 0, s: 13 });
frame(1);
check('피격 시 하트 감소', S().battle.hearts === D.BATTLE.hearts - 1);
S().battle.hearts = 1; S().battle.inv = 0;
S().battle.bullets.push({ x: S().battle.hx, y: S().battle.hy, vx: 0, vy: 0, s: 13 });
frame(1);
check('하트 0이어도 게임오버 없이 월드 복귀', S().mode === 'world' && S().battle === null);
check('물러남 안내가 뜸', !!S().dialog);
advance();
check('클리어 플래그는 아직 없음 (재도전 가능)', S().flags.cleared === false);

// ── 8. 정답 루트 완주 ───────────────────────────────────────────────────────
console.log('[8] 짝꿍 배틀 — 듣기 → 증거 → 손 내밀기');
place('hallway', 15, 5);
frame(2);
advance();                                // 조우 + 배틀 인트로
check('배틀 재진입', S().mode === 'battle' && S().battle.phase === 'menu');
S().battle.cursor = 2;                    // 가만히 듣기
tap('z');
advance();
check('듣기로 그림자가 얇아짐', S().battle.heard === true && S().battle.shadow === D.BATTLE.shadow - 1);
check('들은 사실이 세이브 플래그로 승격', S().flags.mateHeard === true);
S().battle.timer = 999; frame(1);
check('상대 턴 종료 후 내 턴', S().battle.phase === 'menu');

// 절반 기억: 물러났다 재진입해도 들은 이야기가 유지된다
S().battle.cursor = 3; tap('z');          // 물러나기
advance();
check('물러나기로 월드 복귀', S().mode === 'world');
place('hallway', 15, 5); frame(2);
check('재조우는 축약 대사', S().dialog && S().dialog.seq === D.NPC.reApproach);
advance();
check('재도전: 그림자 1칸 깎인 채 + 들은 상태 유지',
  S().mode === 'battle' && S().battle.heard === true
  && S().battle.shadow === D.BATTLE.shadow - 1);
advance();

S().battle.cursor = 1; tap('z');          // 보여주기
tap('ArrowDown'); tap('z');               // 비밀번호 쪽지
advance();
check('증거 제시로 그림자 0', S().battle.shadow === 0);
check('손 내밀기 준비 (이름 노랗게)', S().battle.spare === true);
tap('z');
advance();
check('배틀 종료 후 월드', S().mode === 'world' && S().battle === null);
check('짝꿍을 되돌림', S().flags.cleared === true);
check('계단 문 개방', S().flags.stairsOpen === true);

// ── 9. 세이브 / 로드 왕복 ───────────────────────────────────────────────────
console.log('[9] 세이브 · 로드');
check('자동 저장됨', G.hasSave() === true);
const before = JSON.stringify({
  map: S().map, exp: S().exposure, flags: S().flags, held: G.heldIds(),
});
// 저장을 건드리지 않고 메모리 상태만 흐트러뜨린다(enterMap은 자동 저장을 부른다).
S().map = 'classroom'; S().exposure = 4;
S().flags.cleared = false; S().cards.passNote.held = false;
check('로드 성공', G.load() === true);
const after = JSON.stringify({
  map: S().map, exp: S().exposure, flags: S().flags, held: G.heldIds(),
});
check('로드 왕복이 상태를 그대로 복원', before === after);
check('노출도가 0~최대 범위 안', S().exposure >= 0 && S().exposure <= D.MAX_EXPOSURE);

// ── 10. 계단 → 슬라이스 종료 ────────────────────────────────────────────────
console.log('[10] 계단 → 1층 통과');
place('hallway', 18, 5);
hold('ArrowRight', 40);
check('계단 접촉 안내', !!S().dialog);
advance();
check('클리어 화면', S().mode === 'clear');
tap('z');                                   // 기본값: 계속 둘러보기
check('클리어 후 Z 연타에도 저장 생존 + 월드 복귀', S().mode === 'world' && G.hasSave() === true);
hold('ArrowRight', 30);                     // 계단 다시 → 클리어 화면 재진입
advance();
check('클리어 화면 재진입 가능', S().mode === 'clear');
tap('ArrowDown'); tap('z');                 // 타이틀로
check('타이틀로 가도 저장 유지', S().mode === 'title' && G.hasSave() === true);
tap('z');                                   // 이어하기
check('이어하기로 클리어 상태 복원', S().mode === 'world' && S().flags.done === true);

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
  v: 1, map: 'classroom', px: 99999, py: -50, dir: 9, exposure: 99,
  flags: { cleared: 'yes' }, cards: { nameTag: { held: false, map: 'ghost', x: 999, y: -3 } },
}));
check('범위 밖 값은 클램프해 살림', G.load() === true
  && S().exposure <= D.MAX_EXPOSURE && S().px <= D.MAPS.classroom.w * 48 && S().py >= 0);
check('불리언 아닌 플래그는 무시', S().flags.cleared === false);
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

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log('');
if (fails.length) {
  console.error(`✘ 실패 ${fails.length}건 / 통과 ${pass}건`);
  fails.forEach((f) => console.error('   - ' + f));
  process.exit(1);
}
if (pass < 20) { console.error(`✘ 검사 수 부족: ${pass}건 (스펙 §6은 20건 이상)`); process.exit(1); }
console.log(`✔ 스모크 ${pass}건 모두 통과`);
