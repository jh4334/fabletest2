// 데이터 — 방과 후: 그림자 학교 / 1층(개인정보) + 2층(필터버블)
// 화면에 나오는 한글 문자열은 전부 이 파일에만 둔다. 엔진은 키만 참조한다.
(function (g) {
  'use strict';
  var D = {};

  // ── 타일 범례 ──────────────────────────────────────────────────────────
  // wall=true 인 칸만 벽 자동타일 계산에 참여한다(책상/사물함은 막히되 벽이 아님).
  D.LEGEND = {
    '.': { solid: false },
    '#': { solid: true, wall: true },
    'B': { solid: true, wall: true, prop: 'board', look: 'board' },
    '=': { solid: true, prop: 'desk', look: 'desk' },
    'L': { solid: true, prop: 'locker', look: 'locker' },
    'C': { solid: true, prop: 'box', look: 'box' },
    'P': { solid: true, prop: 'pc', look: 'pc' },
    'd': { solid: false, prop: 'door', look: 'door' },
    'r': { solid: false, prop: 'doorReco', look: 'doorReco' },
    'u': { solid: false, prop: 'doorPlain', look: 'doorPlain' },
    'S': { solid: true, prop: 'stairs', look: 'stairs' }
  };

  // ── 맵 ────────────────────────────────────────────────────────────────
  // fl = 층(게이지·카드 집계가 층별로 갈린다). floor/wallBase 는 시트의 (col,row).
  // wallBase 는 wall_simple 의 5x5 링 블록 좌상단.
  D.MAPS = {
    classroom: {
      fl: 1, w: 15, h: 11,
      floor: [1, 7], wallBase: [5, 0], fill: '#241a2c',
      tint: 'rgba(232,120,60,0.16)',   // 1층 무드: 노을주황
      grid: [
        '#####BBBBB#####',
        '#.............#',
        '#.............#',
        '#.=.=.=.=.=...#',
        '#.............#',
        '#.=.=.=.=.=...d',
        '#.............#',
        '#.=.=.=.=.=...#',
        '#.............#',
        '#.............#',
        '###############'
      ],
      spawn: { x: 7, y: 8, dir: 'up' },
      warps: [{ x: 14, y: 5, to: 'hallway', sx: 1, sy: 5, dir: 'right' }],
      terminals: [{ x: 2, y: 2, drop: { x: 2, y: 4 } }],
      decor: [{ kind: 'pot', x: 13, y: 1 }, { kind: 'pot', x: 1, y: 9 }]
    },
    hallway: {
      fl: 1, w: 20, h: 11,
      floor: [1, 2], wallBase: [0, 6], fill: '#241a2c',
      tint: 'rgba(232,120,60,0.10)',
      grid: [
        '####################',
        '#LLL..LLL..LLL..LL.#',
        '#..................#',
        '#....==......==....#',
        '#..................#',
        'd..................S',
        '#..................#',
        '#....==......==....#',
        '#..................#',
        '#..LL....LL....LL..#',
        '####################'
      ],
      spawn: { x: 1, y: 5, dir: 'right' },
      warps: [{ x: 0, y: 5, to: 'classroom', sx: 13, sy: 5, dir: 'left' }],
      terminals: [
        { x: 6, y: 5, drop: { x: 6, y: 8 } },
        { x: 11, y: 5, drop: { x: 11, y: 2 } }
      ],
      decor: [{ kind: 'stickerBoard', x: 8, y: 1 }],
      npc: { id: 'mate', sheet: 'mate', x: 16, y: 5, dir: 'left', battle: 'mate', opens: 'hallway' },
      stairs: { x: 19, y: 5, face: { x: 18, y: 5, dir: 'left' } },
      stairsTo: { map: 'lab', sx: 7, sy: 8, dir: 'up' }
    },

    // ── 2층: 컴퓨터실 허브 ──────────────────────────────────────────────
    lab: {
      fl: 2, w: 15, h: 11,
      floor: [12, 13], wallBase: [5, 6], fill: '#141c22',
      tint: 'rgba(60,190,190,0.14)',   // 2층 무드: 모니터청록
      grid: [
        '#######S#######',
        '#.............#',
        '#.P.P.P.P.P...#',
        '#.............#',
        '#.............#',
        '#.............d',
        '#.............#',
        '#.P.P.P.P.P...#',
        '#.............#',
        '#.............#',
        '###############'
      ],
      spawn: { x: 7, y: 8, dir: 'up' },
      warps: [{ x: 14, y: 5, to: 'loop', sx: 1, sy: 5, dir: 'right' }],
      decor: [{ kind: 'pot', x: 1, y: 9 }],
      stairs: { x: 7, y: 0, face: { x: 7, y: 1, dir: 'down' } }
    },
    // 추천 복도 — 끝에 문 두 개가 나란히. r=추천 문(제자리 복귀), u=낯선 문(전진)
    loop: {
      fl: 2, w: 20, h: 11,
      floor: [19, 7], wallBase: [5, 6], fill: '#141c22',
      tint: 'rgba(60,190,190,0.10)',
      grid: [
        '####################',
        '#LL..LL..LL..LL..LL#',
        '#..................#',
        '#..................#',
        '#..................r',
        'd..................#',
        '#..................u',
        '#..................#',
        '#..................#',
        '#..LL....LL....LL..#',
        '####################'
      ],
      spawn: { x: 1, y: 5, dir: 'right' },
      warps: [
        { x: 0, y: 5, to: 'lab', sx: 13, sy: 5, dir: 'left' },
        { x: 19, y: 4, to: 'loop', sx: 1, sy: 5, dir: 'right', kind: 'reco', warn: true },
        { x: 19, y: 6, to: 'roomA', alt: 'roomB', sx: 1, sy: 5, dir: 'right', kind: 'strange' }
      ],
      // 포스터·창문은 윗벽에만 — 아랫벽은 회복 안내 띠에 가린다.
      decor: [
        { kind: 'poster', x: 2, y: 0, tone: 'red' },
        { kind: 'poster', x: 4, y: 0, tone: 'ribbon' },
        { kind: 'window', x: 6, y: 0 },
        { kind: 'poster', x: 8, y: 0, tone: 'blue' },
        { kind: 'poster', x: 11, y: 0, tone: 'green' },
        { kind: 'window', x: 13, y: 0 },
        { kind: 'poster', x: 15, y: 0, tone: 'orange' },
        { kind: 'poster', x: 17, y: 0, tone: 'purpleLit' }
      ]
    },
    roomA: {
      fl: 2, w: 15, h: 11,
      floor: [12, 2], wallBase: [5, 6], fill: '#1c1a18',
      tint: 'rgba(60,190,190,0.07)',
      grid: [
        '###############',
        '#.............#',
        '#..C.......C..#',
        '#.............#',
        '#.............#',
        'd.............#',
        '#.............#',
        '#..C.......C..#',
        '#.............#',
        '#.............#',
        '###############'
      ],
      spawn: { x: 1, y: 5, dir: 'right' },
      warps: [{ x: 0, y: 5, to: 'loop', sx: 18, sy: 6, dir: 'left' }],
      decor: [{ kind: 'pot', x: 13, y: 9 }]
    },
    roomB: {
      fl: 2, w: 15, h: 11,
      floor: [12, 2], wallBase: [5, 6], fill: '#1c1a18',
      tint: 'rgba(60,190,190,0.07)',
      grid: [
        '###############',
        '#.............#',
        '#..P.P.P.P.P..#',
        '#.............#',
        '#.............#',
        'd.............#',
        '#.............#',
        '#..L.......L..#',
        '#.............#',
        '#.............#',
        '###############'
      ],
      spawn: { x: 1, y: 5, dir: 'right' },
      warps: [{ x: 0, y: 5, to: 'loop', sx: 18, sy: 6, dir: 'left' }],
      decor: [{ kind: 'pot', x: 1, y: 9 }],
      npc: { id: 'bro', sheet: 'teacher', x: 7, y: 3, dir: 'up', battle: 'bro', opens: 'lab' }
    }
  };

  // ── 증거 카드 (층당 3장) ──────────────────────────────────────────────
  D.CARDS = [
    { id: 'nameTag', floor: 1, label: '이름표', tone: '#f0c86e', at: { map: 'classroom', x: 12, y: 8 } },
    { id: 'passNote', floor: 1, label: '비밀번호 쪽지', tone: '#d84a3c', at: { map: 'hallway', x: 2, y: 8 } },
    { id: 'photo', floor: 1, label: '사진', tone: '#78bcd8', at: { map: 'hallway', x: 14, y: 2 } },
    { id: 'watchLog', floor: 2, label: '시청 기록', tone: '#78bcd8', at: { map: 'roomA', x: 7, y: 3 } },
    { id: 'recoList', floor: 2, label: '추천 목록', tone: '#f0c86e', at: { map: 'loop', x: 18, y: 8 } },
    { id: 'oldBall', floor: 2, label: '낡은 축구공 사진', tone: '#5f8a4e', at: { map: 'roomB', x: 4, y: 8 } }
  ];

  D.MAX_EXPOSURE = 3;   // 1층 카드 수와 일치 — 전부 뺏기면 게이지 만땅
  D.MAX_BUBBLE = 3;     // 2층 추천 문을 세 번 따라가면 만땅

  // ── 화면 문자열 ───────────────────────────────────────────────────────
  D.T = {
    title: '방과 후: 그림자 학교',
    sub: '1층 · 교실',
    start: '시작',
    resume: '이어하기',
    restart: '처음부터',
    confirmWipe: ['하던 이야기가 지워져요.', '정말 처음부터 할까요?'],
    yes: '네, 처음부터',
    no: '아니요',
    keys: '이동 화살표 · 결정 Z · 멈춤 X · 소리 M',
    keysTouch: '왼쪽 스틱으로 이동 · 오른쪽 확인 버튼으로 결정',
    soundOn: '소리 켬',
    soundOff: '소리 끔',
    loading: '불러오는 중',
    paused: '잠깐 쉬는 중',
    pausedHelp: 'Z를 누르면 이어서 해요',
    pausedHelpTouch: '확인 버튼을 누르면 이어서 해요',

    expLabel: '노출도',
    expHelp: '흘린 카드를 다시 주우면 노출도가 내려가요',
    bubLabel: '버블',
    bubHelp: '낯선 문을 고르면 버블이 걷혀요',
    bagLabel: '가진 카드',
    bagEmpty: '없음',

    gotCard: '카드를 주웠다. 노출도가 내려갔다.',
    gotCard2: '카드를 주웠다. 버블이 걷혔다.',
    firstCard: '내 정보 카드. 흘리면 그림자가 커진다.',
    taken: '광고 단말이 카드를 빨아들였다!',
    takenHelp: '떨어진 카드를 다시 주워 오자.',
    termWarn: '빨간 불빛… 가까이 가면 카드를 뺏길 것 같다!',
    recoWarn: '반짝이는 문… 아까랑 똑같은 복도 같은데?',
    loopBack: '또 같은 복도다. 버블이 짙어졌다.',
    strangeGo: '처음 보는 문을 열었다. 버블이 걷혔다.',
    adWords: ['광고', '당첨', '무료', '알림', '추천']
  };

  D.INTRO = [
    ['방과 후 교실. 아무도 없다.', '스피커가 지직거린다.'],
    ['〈나비스 시스템 점검 중.', '전 출입구를 잠급니다.〉'],
    ['교문이 잠겼다.', '복도로 나가 보자.']
  ];

  // 층 전환 — 계단을 오를 때 1상자, 2층에 내려서서 1상자.
  D.FLOOR2 = {
    up: [['계단 문이 열렸다.', '2층으로 올라간다.']],
    enter: [['컴퓨터실. 모니터가 전부 켜져 있다.', '오른쪽 문에서 빛이 샌다.']]
  };

  // 조사 플레이버 (Z로 바라본 칸) — 재조사(LOOK2)는 다른 대사로, 세계가 살아있게.
  D.LOOK = {
    board: ['칠판: 비밀번호 함부로 알려주지 않기', '누가 밑줄을 세 번 그었다.'],
    desk: ['짝꿍 자리. 필통이 열려 있다.', '연필이 전부 부러져 있다.'],
    locker: ['사물함마다 광고 스티커가 붙었다.', '내 이름이 적힌 것도 있다.'],
    box: ['먼지 쌓인 상자.', '아무도 안 열어 본 것 같다.'],
    pc: ['모니터마다 같은 영상이 떠 있다.', '전부 「너를 위한 추천」.'],
    door: ['교실 문. 복도로 이어진다.'],
    doorReco: ['반짝반짝. 「네가 좋아할 문」.'],
    doorPlain: ['수수한 문. 뭐가 있는지 모르겠다.'],
    stairs: ['2층으로 가는 계단 문.', '그림자가 손잡이를 붙잡고 있다.'],
    stairs2: ['3층으로 가는 계단 문.', '위에서 찬 바람이 내려온다.'],
    nothing: ['아무것도 없다.']
  };
  D.LOOK2 = {
    board: ['밑줄 밑에 작게 적혀 있다.', '「내 생일도 비번으로 쓰지 말기」'],
    desk: ['필통 속 지우개에 이빨 자국.', '…내 지우개였는데.'],
    locker: ['스티커를 한 장 떼 봤다.', '밑에 광고가 한 장 더 있다.'],
    pc: ['화면을 한 칸 내려 봤다.', '아래도 똑같은 영상뿐이다.'],
    doorReco: ['문이 나를 부르는 것 같다.', '…부르는 건 문일까, 나일까?'],
    stairs: ['손잡이의 그림자가', '나를 슬쩍 쳐다본 것 같다.']
  };

  // ── 배틀 「그림자 벗기기」 ────────────────────────────────────────────
  // 공통 UI·공용 대사. 인물별로 다를 이유가 없는 것만 여기 둔다.
  D.BATTLE_UI = {
    menu: ['말 걸기', '보여주기', '가만히 듣기', '물러나기'],
    spareLabel: '손 내밀기',
    subHint: '취소 X (터치는 취소 버튼)',
    tell: '그림자 조각이 쏟아진다',
    ready: [['그림자가 벗겨졌다.', '이제 손을 내밀 수 있다.']],
    hurt: [['한 발 물러났다.', '숨 고르고 다시 가 보자.']],
    flee: [['일단 물러났다.']],
    showNone: [['보여줄 카드가 없다.', '이 층을 더 둘러보자.']]
  };

  // 인물별 프로필. 맵의 npc.battle 이 여기 키를 가리킨다.
  D.BATTLES = {
    mate: {
      name: '짝꿍', sheet: 'mate',
      shadow: 3, hearts: 3,
      evidence: 'passNote',
      approach: [['짝꿍이 등을 돌리고 서 있다.', '어깨 위로 그림자가 흘러내린다.']],
      reApproach: [['짝꿍이 아직 그림자에 잠겨 있다.']],
      intro: [['짝꿍의 그림자가 부풀어 오른다.', '「오지 마. 나 이제 아무것도 몰라.」']],
      reIntro: [['「…또 왔네.」', '들었던 이야기를 그림자도 기억한다.']],
      // 말 걸기 3단 — 반복할수록 반응이 변해 '듣기'로 이끈다 (죽은 메뉴 방지)
      talk: [['「괜찮아? 나야.」', '그림자가 말을 가로챈다.']],
      talk2: [['「나야, 나!」', '그림자가 움찔… 안쪽에서 소리가 샌다.']],
      talk3: [['내 말은 닿지 않는다.', '…먼저 들어 봐야 할 것 같다.']],
      listen: [['가만히 듣는다.', '「비번 알려줬더니 계정을 뺏겼어…」']],
      listenAgain: [['「내 잘못이야. 내가 흘렸으니까.」']],
      listenHint: [['그림자가 얇아졌다.', '뭘 보여 주면 좋을까?']],
      showWrong: [['「그건… 지금 필요 없어.」']],
      showRight: [['비밀번호 쪽지를 내민다.', '「이거… 내가 흘린 거였구나.」']],
      spare: [['짝꿍이 눈을 비빈다.', '「고마워. 나 돌아온 것 같아.」']],
      promise: [['약속 카드① 「내 정보는 내가 지킨다」', '계단 문이 열렸다.']],
      hint: [['「비번은 나만 알고 있기.」', '짝꿍이 계단 쪽을 가리킨다.']],
      // 상대 턴 탄막 (기준서: 짧게, 하트는 0이 돼도 게임오버 없음)
      // 3~4학년 손 기준: 첫 턴은 짧고 성기게, 뒤로 갈수록 조금씩만 어렵게.
      attacks: [
        { kind: 'rain', time: 5.5, every: 0.52, speed: 140 },
        { kind: 'side', time: 6, every: 0.5, speed: 158 },
        { kind: 'mix', time: 6.5, every: 0.44, speed: 168 }
      ]
    },
    bro: {
      name: '형', sheet: 'teacher',
      shadow: 3, hearts: 3,
      evidence: 'oldBall',
      approach: [['형이 모니터에 붙어 앉아 있다.', '어깨에 그림자가 눌어붙었다.']],
      reApproach: [['형은 아직 화면만 보고 있다.']],
      intro: [['「비켜. 다음 거 나온단 말이야.」']],
      reIntro: [['「…또 왔어?」', '그림자가 아까 이야기를 기억한다.']],
      talk: [['「형, 나야.」', '그림자가 화면을 더 키운다.']],
      talk2: [['「형!」', '그림자가 잠깐 흔들린다.']],
      talk3: [['내 말이 화면에 먹힌다.', '…먼저 들어 보자.']],
      listen: [['가만히 듣는다.', '「추천만 봤더니… 다른 건 고르는 법을 까먹었어.」']],
      listenAgain: [['「고르는 건 무섭잖아. 틀릴 수도 있고.」']],
      listenHint: [['그림자가 얇아졌다.', '형이 원래 좋아하던 게 뭐였지?']],
      showWrong: [['「그런 건 추천에 안 뜨는데.」']],
      showRight: [['낡은 축구공 사진을 내민다.', '「…이거, 내가 고른 거였는데.」']],
      spare: [['형이 이어폰을 뺀다.', '「오랜만에 딴 것도 볼까.」']],
      promise: [['약속 카드② 「내 눈으로 고른다」', '계단 문이 열렸다.']],
      hint: [['「가끔은 안 좋아할 것도 봐.」', '형이 계단 쪽을 가리킨다.']],
      // chase = 하트를 향해 느리게 꺾이는 조각(속도 120 이하)
      attacks: [
        { kind: 'side', time: 5.5, every: 0.55, speed: 150 },
        { kind: 'chase', time: 6, every: 0.9, speed: 112, life: 3 },
        { kind: 'mix', time: 6.5, every: 0.48, speed: 162 }
      ]
    }
  };

  D.CLEAR = {
    stairs: [['3층은 공사 중.', '오늘은 여기까지.']],
    bannerFloor: '층 통과',
    statTime: '걸린 시간',
    statStolen: '뺏긴 카드',
    statRetreat: '물러난 횟수',
    unitMin: '분', unitSec: '초', unitCnt: '번',
    menu: ['계속 둘러보기', '타이틀로'],
    keepNote: '기록은 저장돼 있어요. 처음부터는 타이틀에서.'
  };

  D.SAVE_KEY = 'shadow-school-p1';

  g.DATA = D;
})(typeof window !== 'undefined' ? window : this);
