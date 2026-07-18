// 스크린샷 생성기 — node-canvas로 실제 게임 화면을 렌더해 PNG로 저장한다.
// 사용법: node tools/shots.js
// v3: 마음 조각 배틀은 상태를 손으로 조립하지 않고, 키 입력을 흉내 내
// 실제 배틀(따라 조우)을 구동해 찍는다 — 화면이 항상 실제 게임과 일치한다.
// DOM/브라우저 스텁·vm 로더는 공용 모듈에서 가져온다 — onboarding-shots.js와 단일 출처
const { createGameSandbox, v3Flags } = require('./lib/game-sandbox');
const env = createGameSandbox();
const { storage } = env;

// ---- 타이틀/수첩을 보기 좋게 채워 둔다 (스크립트 로드 전에 심어야 함) ----
storage.set('ai-ethics-adventure-slot-0', JSON.stringify({
  v: 3, name: '도도', map: 'rumorstreet', x: 14, y: 16, flags: v3Flags(), updatedAt: Date.now(),
}));
storage.set('ai-ethics-adventure-slot-1', JSON.stringify({
  v: 3, name: '하늘', map: 'village', x: 13, y: 16,
  flags: { talkedProf: true, bandiJoined: true, defeated: {}, mercy: 1, visited: {} }, updatedAt: Date.now(),
}));
storage.set('ai-ethics-adventure-endings', JSON.stringify({ farewell: true }));
// 친구 수첩 — 여덟 조각 중 넷을 만난 상태
const dexStore = {
  bekkyeomon: { seen: true, mercy: 'mercy' },
  sujipmon: { seen: true, mercy: 'mercy' },
  pyeonhyangmon: { seen: true, mercy: 'neutral' },
  hwangakmon: { seen: true, mercy: 'mercy' },
};
storage.set('ai-ethics-adventure-dex', JSON.stringify(dexStore));

const g = env.boot();
const { QUIZZES } = env.run('({QUIZZES})');
const { step, tap, advanceDialog, shot, setPlayer } = env;

console.log('스크린샷 생성:');

// 1) 타이틀 (여덟 조각 퍼레이드 + 슬롯)
g.time = 40;
shot('01-title.png');

// 2) 황혼의 경계마을 — 동행자 반디와 함께 (이사 온 친구·온기 연출 포함)
g.currentSlot = 0; g.playerName = '도도';
g.flags = v3Flags();
g.mode = 'world'; g.map = 'village';
setPlayer(9, 12, 'down');
g.time = 30;
shot('02-world.png');

// 3) 박사님 첫 대화 (v3 오프닝)
g.mode = 'dialog'; g.map = 'village'; setPlayer(5, 12, 'left');
g.dialog = { lines: ['…정말로, 왔구나.\n나는 이 마을의… 박사란다.'], idx: 0, chars: 999, speaker: '박사님', onEnd: null };
shot('03-dialog.png');

// 4~6) 마음 조각 배틀 — 실제 조우(따라)를 키 입력으로 구동해 찍는다
g.dialog = null; g.mode = 'world'; g.map = 'forestdeep';
g.flags = v3Flags({
  defeated: { bekkyeomon: false, sujipmon: false, pyeonhyangmon: false, hwangakmon: false,
    yuhokmon: false, hollimmon: false, finalboss: false, yeongi: false },
  chapter1Clear: false, chapter2Clear: false, mercy: 0, evCards: [],
  sawPersuadeTip: true, // 조작 안내는 스크린샷에서 생략
  introForestTrace: true, ttaraFirstEncounter: true, // 첫 조우 연출 없이 곧장 배틀로
});
setPlayer(12, 4, 'down'); // 따라 (12,5) 위 — 정적의 숲 안쪽 공터
tap('z');
advanceDialog(); // 등장 대사 → 배틀 (M-2: 내 턴 메뉴에서 시작)
if (!g.battle) throw new Error('배틀 스크린샷 실패 — 조우가 시작되지 않음: ' + g.mode);
step(10);
shot('04-battle.png'); // 내 턴 — 관찰 한 줄(*) + 행동 메뉴 4종

// 5) 상대 턴 — 「가만히 듣기」 → 탄막 + 속마음 조각 ✦
if (g.battle && g.battle.phase === 'menu') {
  g.battle.menuIdx = 2; tap('z');                      // 듣기 → 반응 대사
  if (g.battle.phase === 'react') tap('z');            // → 상대 턴(탄막)
  step(30); // 탄막·조각이 화면에 깔릴 때까지
}
shot('06-dodge.png'); // (README: 탄막 턴 회피 + 조각 줍기)

// 6) 마음의 선택 — 게이지 만충 → spareReady → 마음 안아 주기
if (g.battle) {
  g.battle.gauge = g.battle.gaugeMax; step(2);          // 탄막 턴 종료 → 내 턴(spareReady)
  if (g.battle.phase === 'menu') { g.battle.menuIdx = 3; tap('z'); } // 안아 주기 → 마음의 선택
  step(2);
}
shot('05-mercy.png');

// 7) 친구 수첩
g.battle = null; g.dialog = null;
g.flags = v3Flags();
g.mode = 'dex'; g.dex = { cursor: 1, ret: 'title' }; // 담아
g.time = 20;
shot('07-dex.png');

// 8) 진엔딩 — 집으로 (영이와 반디의 마지막 인사)
g.mode = 'ending'; g.endingType = 'true';
g.flags.endingId = 'home'; g.flags.trueEnding = true;
g.flags.correctCount = 84; g.flags.mercy = 8;
g.endingT = 220; g.time = 60;
shot('08-ending.png');

// 9) 기울어진 거리 (2장 허브) — 저울과 기운 거리
g.mode = 'world'; g.map = 'tiltstreet';
g.flags = v3Flags({ chapter2Clear: false });
setPlayer(14, 14, 'up');
g.time = 18;
shot('09-street.png');

// 10) 수호자 일지 (주제별 정답률 — 슬롯 0 통계 시드)
g.currentSlot = 0; g.playerName = '수호자';
storage.set('ai-ethics-adventure-stats-0', JSON.stringify({
  privacy: { correct: 6, total: 6 },
  copyright: { correct: 5, total: 6 },
  fake: { correct: 4, total: 5 },
  bias: { correct: 2, total: 5 },
  balance: { correct: 3, total: 4 },
  manners: { correct: 5, total: 5 },
  safety: { correct: 1, total: 3 },
  transparency: { correct: 4, total: 6 },
}));
storage.set('ai-ethics-adventure-meta-0', JSON.stringify({ challengeRuns: 3, challengeBest: 10, challengeBestTotal: 10 }));
g.mode = 'journal'; g.journal = { ret: 'world', slot: 0, scroll: 0, toast: 0 };
g.time = 20;
shot('10-journal.png');

// 11) 도전 극장 (진행 중 화면)
g.mode = 'challenge';
{
  const topics = Object.keys(QUIZZES).filter((t) => QUIZZES[t] && QUIZZES[t].length)
    .map((t) => ({ key: t, label: t, n: QUIZZES[t].length }));
  const q = Object.assign({}, QUIZZES.privacy[0], { _topic: 'privacy', _qid: 'privacy#0' });
  g.challenge = {
    ret: 'title', slot: 0, phase: 'quiz', topics, sel: 0,
    questions: new Array(10).fill(q), idx: 3, cursor: 1,
    choiceOrder: q.a.map((_, i) => i), score: 3, feedback: null,
  };
}
g.time = 16;
shot('11-challenge.png');

// 12) 도전과제 (업적) — 일부 달성 상태
storage.set('ai-ethics-adventure-endings', JSON.stringify({ home: true }));
g.mode = 'awards'; g.awards = { ret: 'world', slot: 0, scroll: 0 };
g.time = 20;
shot('12-awards.png');

// 13) 도움말
g.mode = 'help'; g.helpRet = 'title';
g.time = 20;
shot('13-help.png');

// 14) 꾸미기 (칭호 · 테마)
storage.set('ai-ethics-adventure-cosmetic-0', JSON.stringify({ title: 'kind', theme: 'ocean' }));
g.mode = 'cosmetics';
g.cosmetics = { ret: 'world', slot: 0, col: 1, rowTitle: 1, rowTheme: 2, toast: 0 };
g.time = 20;
shot('14-cosmetics.png');

// 15) 데이터 백업 · 복원
g.mode = 'backup';
g.backup = { ret: 'world', cursor: 1, toast: 0 };
g.time = 20;
shot('15-backup.png');

// 16) 고요의 뜰 — 소리가 잦아드는 파이널 구간
g.mode = 'world'; g.map = 'quietyard2';
g.flags = v3Flags({ chapter1Clear: true, chapter2Clear: true, chapter3Clear: true,
  chapter4Clear: true, chapter5Clear: true });
setPlayer(7, 8, 'up');
g.time = 18;
shot('16-quietyard.png');

// 17) 교사용 대시보드 (학생 둘은 데이터, 하나는 비어 있음)
storage.set('ai-ethics-adventure-stats-1', JSON.stringify({
  privacy: { correct: 3, total: 4 }, copyright: { correct: 2, total: 5 },
  fake: { correct: 4, total: 4 }, bias: { correct: 1, total: 4 },
}));
storage.set('ai-ethics-adventure-meta-1', JSON.stringify({ streak: 2, bestStreak: 3 }));
storage.set('ai-ethics-adventure-meta-0', JSON.stringify({
  challengeRuns: 3, challengeBest: 10, challengeBestTotal: 10, streak: 5, bestStreak: 7,
}));
g.mode = 'dashboard';
g.dashboard = { ret: 'title', cursor: 0 };
g.time = 20;
shot('17-dashboard.png');

// 18) 커스텀 퀴즈 (선생님 문제)
storage.set('ai-ethics-adventure-customquiz', JSON.stringify([
  { q: '우리 반 규칙: AI에게 물어봐도 되는 것은?', a: ['친구 비밀', '숙제 푸는 방법 설명', '내 주소'], c: 1, why: '예시 문제입니다.' },
  { q: '두 번째 커스텀 문제', a: ['1', '2', '3'], c: 0, why: '해설' },
]));
g.mode = 'quizedit';
g.quizedit = { ret: 'title', cursor: 0, toast: 0 };
g.time = 20;
shot('18-quizedit.png');

// 19) 배움 카드 컬렉션 (슬롯 0의 정답 통계로 일부 해금)
g.currentSlot = 0;
g.mode = 'cards';
g.cards = { ret: 'title', slot: 0, scroll: 0 };
g.time = 20;
shot('19-cards.png');

// 20) 수료증 · 진도 인증서
g.mode = 'cert';
g.cert = { ret: 'title', slot: 0, toast: 0 };
g.time = 20;
shot('20-cert.png');

// 21) 명예의 전당 (슬롯들의 최고 기록)
g.mode = 'hof';
g.hof = { ret: 'title', cat: 0 };
g.time = 20;
shot('21-hof.png');

// 22) 수업 모드 (챕터 바로 시작)
g.mode = 'classmode';
g.classmode = { ret: 'world', sel: 0, confirm: false, toast: 0 };
g.time = 20;
shot('22-classmode.png');

// 23) 교사용 학생 진단 리포트
g.currentSlot = 0;
g.mode = 'report';
g.report = { ret: 'title', slot: 0, toast: 0 };
g.time = 20;
shot('23-report.png');

console.log('완료. shots/ 폴더에 23장 생성.');
