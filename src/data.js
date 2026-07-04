// 게임 데이터: 맵, NPC, 몬스터, 퀴즈
//
// 타일 종류
//  G 풀  P 길  F 꽃  S 모래  B 다리  C 동굴바닥  M 탑바닥  1 탑문(워프)
//  T 나무  W 물  O 지붕  H 벽  D 문(장식)  R 바위  K 동굴벽  * 수정  N 탑벽  Y 표지판
//  8 기울어진 포장(2장 거리)  9 칙칙한 문(2장 — 반짝이지 않는 문)

const WALKABLE = new Set(['G', 'P', 'F', 'S', 'B', 'C', 'M', 'Z', 'E', 'I', '2', '4', 'A', '1', '5', '6', '7', '8', '9']);

const MAPS = {
  village: {
    name: '경계마을',
    song: 'village',
    tiles: [
      'TTTTTTTTTTTTTPPTTTTTTTTTTTTT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGGOOOOOGGGGGPPGOOOOOOGGGGGT',
      'TGGOOOOOGGGGGPPGOOOOOOGGGGGT',
      'TGGHHDHHGGGGGPPGHH1HHHGGGGGT',
      'TGGGGPGGGGGGGPPGGGPGGGGG6YGT',
      'TGFGGPGGGGFGGPPGGGPGGFGGGFGT',
      'TGGGGPPPPPPPPPPPPPPGGGGGGGGT',
      'TGOOOOOOGGGGGPPGGGGGGGGGGG5T',
      'TGOOOOOOGGGGGPPGGGGGGGGGGGGT',
      'TGHHDHHHGGGGGPPGGGGGGGGGGGGT',
      'PPPPPPPPPPPPPPPPPPPPPPPPPPPP',
      'TGGFGGGGGGGGGPPGGGGGGOOOOOGT',
      'TGGGWWWWWGGGGPPGGGGGGOOOOOGT',
      'TGGGWWWWWGGGGPPGGGGGGHHDHHGT',
      'TGGGWWWWWGGGGPPGGGGGGGGPGGGT',
      'TGGGGGGGGGGGGPPYGGGGGGGPGGGT',
      'TGGGGGGGGGGGGPPPPPPPPPPGGGGT',
      'TGFGGGGFGGGGGPPGGGGFGGGGGFGT',
      'TTTTTTTTTTTTTPPTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 13, y: 0, to: 'forest', tx: 13, ty: 18 },
      { x: 14, y: 0, to: 'forest', tx: 14, ty: 18 },
      { x: 0, y: 11, to: 'cave', tx: 25, ty: 11 },
      { x: 27, y: 11, to: 'lake', tx: 2, ty: 11 },
      { x: 18, y: 4, to: 'tower', tx: 8, ty: 12, needBadges: 3 },
      { x: 13, y: 19, to: 'meadow', tx: 13, ty: 1, needBoss: 'hondonmon',
        lockText: '남쪽 길이 어둠의 안개로 막혀 있다.\n신호탑의 혼돈몬을 깨우치면\n안개가 걷힐 것 같다.' },
      { x: 14, y: 19, to: 'meadow', tx: 14, ty: 1, needBoss: 'hondonmon',
        lockText: '남쪽 길이 어둠의 안개로 막혀 있다.\n신호탑의 혼돈몬을 깨우치면\n안개가 걷힐 것 같다.' },
      // 보너스 지역: AI 미래연구소 (언제든 자유롭게 드나드는 연습 공간)
      { x: 26, y: 8, to: 'lab', tx: 9, ty: 8 },
      // 1장: 담아의 「전부 공짜 거리」 (허브 — 구역 3개 + 금고 + 주인의 방)
      { x: 24, y: 5, to: 'freestreet', tx: 14, ty: 17 },
    ],
    npcs: [
      { id: 'prof', x: 4, y: 12, pal: 'prof', name: '박사님' },
      { id: 'kid', x: 16, y: 7, pal: 'kid', name: '아이 도도' },
      { id: 'grandma', x: 20, y: 12, pal: 'grandma', monSprite: 'caretaker', name: '할머니' },
      { id: 'guard', x: 17, y: 6, pal: 'guard', name: '탑 안내원' },
      { id: 'labguide', x: 25, y: 8, pal: 'guard', name: '연구원' },
      { id: 'yeongi_npc', x: 5, y: 12, monSprite: 'yeongi', name: '영이',
        show: (flags) => !!flags.trueEnding },
      // 되돌린 친구들이 마을에 놀러 온다 — 자비가 쌓일수록 마을이 북적인다
      { id: 'friend_somun', x: 19, y: 9, monSprite: 'somunmon', name: '소문몬',
        show: (flags) => flags.mercy >= 12 && !!(flags.mercyChoice && flags.mercyChoice.somunmon === 'mercy') },
      { id: 'friend_kkam', x: 22, y: 9, monSprite: 'kkamkkammon', name: '깜깜몬',
        show: (flags) => flags.mercy >= 20 && !!(flags.mercyChoice && flags.mercyChoice.kkamkkammon === 'mercy') },
    ],
    signs: [
      { x: 15, y: 16, text: '≪경계마을≫\n사람들이 쓰다 버린 것들이\n흘러와 쌓이는 곳.' },
      { x: 25, y: 5, text: '≪전부 공짜 거리≫\n담아가 새로 열었대요.\n"전부 공짜!" …정말 공짜일까?' },
    ],
    monsters: [],
  },

  // ---- 1장 「전부 공짜 거리」 — 담아의 프랜차이즈 거리 (허브) ----
  // 거리에서 구역 3개(접수처·게시판 광장·배달 창고)와 금고문(주인의 방)으로 갈라진다.
  // 금고 잠금 3개는 구역을 하나 클리어할 때마다 풀린다 (needS1Locks — game.js).
  freestreet: {
    name: '전부 공짜 거리',
    song: 'battle',
    intro: [
      '네온 불빛이 눈을 찌른다.\n간판마다 「공짜」가 반짝인다.',
      '어디선가 안내방송이 들린다.\n"어서 오세요! 전부! 공짜!\n※약관은 아주 작게…"',
    ],
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TGOOOOOOOGGOOOOOOGGOOOOOOOGT',
      'TGOOOOOOOGGOOOOOOGGOOOOOOOGT',
      'TGOOOOOOOGGOOOOOOGGOOOOOOOGT',
      'TGGGG6GGGGGGGG7GGGGGGG6GGGGT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPYPPPPPPPPYPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPYPPPPPP9',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPP6PPPPPPPPPPPPPPPPPPPPPPT',
      'TGOOOOOOGGGGGGGGGGGGGGGGGGGT',
      'TGOOOOOOGGGGGGPGGGGGGGGGGGGT',
      'TGOOOOOOGGGGGGPGGGGGGGGGGGGT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 14, y: 18, to: 'village', tx: 24, ty: 6 },
      // 구역① 살금의 접수처
      { x: 5, y: 4, to: 'traceroom', tx: 9, ty: 11 },
      // 구역② 새김의 게시판 광장 — 접수처를 먼저 다녀와야 내 조각이 존재한다 (순서 강제)
      { x: 22, y: 4, to: 'boardplaza', tx: 12, ty: 13, needPuzzleClear: 'traces',
        lockText: '문틈에서 낮은 목소리가 들린다.\n새김: "아직 여기엔 네 조각이 없네.\n…먼저 접수처에 다녀와."' },
      // 구역③ 배달 창고
      { x: 4, y: 15, to: 'warehouse', tx: 12, ty: 13 },
      // 금고문 — 잠금 3개(구역 클리어마다 1개)가 다 풀려야 주인의 방이 열린다
      { x: 14, y: 4, to: 'ownerroom', tx: 5, ty: 7, needS1Locks: 3,
        lockText: '금고 문은 꿈쩍도 하지 않는다.\n잠금 세 개가 나란히 붙어 있다.' },
      // 2장 「기울어진 거리」 — 담아를 되돌린 뒤에야(chapter1Clear) 열리는 동쪽 문
      { x: 27, y: 13, to: 'tiltstreet', tx: 14, ty: 17, needFlag: 'chapter1Clear',
        lockText: '동쪽에 낯선 문이 하나 생겼다.\n문 너머가 이상하게… 기울어 보인다.\n지금은 굳게 잠겨 있다.' },
    ],
    npcs: [
      // 살금 — 담아의 점원. 시킨 일이 미안한 아이 (거리를 서성인다)
      { id: 'salgeum_st1', x: 9, y: 9, monSprite: 'mollaemon', name: '살금', wander: true },
      { id: 'salgeum_st2', x: 19, y: 12, monSprite: 'mollaemon', name: '살금', wander: true },
    ],
    signs: [
      { x: 9, y: 6, text: '≪전부 공짜 거리≫\n전부! 공짜! 진짜로!\n※약관은 아주 작게 적혀 있다.' },
      { x: 18, y: 6, text: '[오늘의 안내]\n접수처는 왼쪽★ 게시판 광장은 오른쪽★\n창고는 아래쪽★ 전부 공짜!' },
      { x: 20, y: 13, text: '[금고 안내]\n주인 전용★ 손님은 사절★\n…열쇠? 그런 건 손님이 알 거 없고~' },
    ],
    monsters: [],
  },

  // 구역① 「살금의 접수처」 — 모든 편의는 정보를 대가로 요구한다.
  // 상호작용 물체(단말·게시판·지우개·출구)는 타일이 아니라 PUZZLES.traces 좌표로 배치된다.
  traceroom: {
    name: '살금의 접수처',
    song: 'battle',
    intro: [
      '≪살금의 접수처≫\n반짝이는 화면과 경품이 가득하다.',
      '담아(안내방송): "어서 와! 전부 공짜야.\n…아주 작은 정보만 주면 돼."',
      '살금: "…저기. 급할수록,\n아무것도 안 줘도 돼.\n(막히면 H — 내가 도와줄게.)"',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEE6EEEEEEEEEH',
      'HHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 9, y: 12, to: 'freestreet', tx: 5, ty: 5 },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 구역② 「새김의 게시판 광장」 — 공유의 영속성 체험.
  // 접수처에서 준 내 정보의 사본 3개가 광장을 떠돈다 (PUZZLES.copies).
  boardplaza: {
    name: '새김의 게시판 광장',
    song: 'glitch',
    intro: [
      '광장 한가운데, 거대한 게시판.\n반짝이는 조각들이\n종이처럼 떠다니고 있다.',
      '…저거, 어딘가 낯익다.\n내가 접수처에서 준…?',
    ],
    tiles: [
      'NNNNNNNNNNNNNNNNNNNNNNNN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIINIIIIIIIIIINIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIINIIIIIIIIIINIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIN',
      'NNNNNNNNNNNNNNNNNNNNNNNN',
    ],
    warps: [
      { x: 12, y: 14, to: 'freestreet', tx: 22, ty: 5 },
    ],
    npcs: [
      { id: 'saegim_plaza', x: 12, y: 2, monSprite: 'girokmon', name: '새김' },
    ],
    signs: [],
    monsters: [],
  },

  // 구역③ 「배달 창고」 — 제3자 제공 체험.
  // 내 정보 상자가 컨베이어를 타고 출하구로 흘러간다 (PUZZLES.levers).
  warehouse: {
    name: '배달 창고',
    song: 'cave',
    intro: [
      '컨베이어가 덜컹덜컹 돌아간다.\n상자마다 라벨이 붙어 있다.',
      '「친구가 준 것 1호」…?\n…이거, 내가 접수처에서 준 거잖아.',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHHHHHH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEBBBBBBBBBBBBBBBBBBEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEEEH',
      'HHHHHHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 12, y: 14, to: 'freestreet', tx: 4, ty: 14 },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 1장 보스 「주인의 방」 — 금고 잠금 3개가 풀리면 열리는 담아의 은신처.
  // 담아(보스)는 map 몬스터가 아니라 NPC(sujip_boss)로 두어 도감/처치 플래그를
  // 오염시키지 않는다. 조우 시 설득 배틀(PERSUADE.sujipmon_boss)로 이어진다.
  ownerroom: {
    name: '주인의 방',
    song: 'battle',
    intro: [
      '금고 너머는 좁은 방이었다.\n서랍과 상자가 천장까지 쌓여 있다.',
      '전부 라벨이 붙어 있다.\n「친구가 준 것 1호」 「2호」 「3호」…',
      '그 한가운데 담아가\n무언가를 잔뜩 끌어안고 앉아 있다.',
      '담아: "…어? 손님이네.\n여기까지 어떻게 들어왔어?"',
    ],
    tiles: [
      'HHHHHHHHHHHH',
      'HEEEEEEEEEEH',
      'HEEEEEEEEEEH',
      'HEEEEEEEEEEH',
      'HEEEEEEEEEEH',
      'HEEEEEEEEEEH',
      'HEEEEEEEEEEH',
      'HEEEEEEEEEEH',
      'HHHHH7HHHHHH',
    ],
    warps: [
      { x: 5, y: 8, to: 'freestreet', tx: 14, ty: 5 },
    ],
    npcs: [
      { id: 'sujip_boss', x: 5, y: 2, monSprite: 'sujipmon', name: '담아' },
    ],
    signs: [],
    monsters: [],
  },

  // ==== 2장 「기울어진 거리」 — 기울의 추천 거리 (허브) ====
  // 사선으로 기운 포장(8 타일)과 반짝 추천 문(6)·칙칙한 문(9)의 대비.
  // 중앙 저울(14,9)의 기울기는 구역 3개를 클리어할 때마다 -1, 0이 되면 보스 문(7,14,2) 개방.
  tiltstreet: {
    name: '기울어진 거리',
    song: 'glitch',
    intro: [
      '문을 넘자 거리가 한쪽으로\n비스듬히 기울어 보인다.\n똑바로 선 것 같은데, 자꾸 미끄러진다.',
      '반짝이는 문들이 한 방향만 가리킨다.\n"이쪽! 다들 가는 길은 이쪽!"',
      '광장 한가운데, 거대한 저울 하나가\n한쪽으로 잔뜩 기울어 있다.',
    ],
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'T888888888OOOOOOOO888888888T',
      'T8OOOOO88888887888888OOOOO8T',
      'T8OOOOO88888888888888OOOOO8T',
      'T88888888888888888888888888T',
      'T88886888888888888888868888T',
      'T8888888888888Y888888888888T',
      'T88888888888888888888888888T',
      'T88888888888888888888888888T',
      'T8888888888888H888888888888T',
      'T888888888888888888888888889',
      'T88888888888888888888888888T',
      'T88888888888888888888888888T',
      'T88888888888888888888888888T',
      'T88888888888888888888888888T',
      'T888898Y8888888888888888888T',
      'T88888888888888888888888888T',
      'T88888888888888888888888888T',
      'T88888888888888888888888888T',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 14, y: 18, to: 'freestreet', tx: 26, ty: 13 },
      // 구역① 메아리 골목 (반짝 추천 문)
      { x: 5, y: 5, to: 'echoalley', tx: 11, ty: 13 },
      // 구역② 표본 창고 (반짝 추천 문)
      { x: 22, y: 5, to: 'samplehouse', tx: 11, ty: 13 },
      // 구역③ 꺼진 거리 (칙칙한 문)
      { x: 5, y: 15, to: 'dimstreet', tx: 11, ty: 13 },
      // 문지기의 방 — 저울이 수평(기울기 0)이 되어야 열린다 (needS2Scale)
      { x: 14, y: 2, to: 'gatekeeper', tx: 7, ty: 8, needS2Scale: 3,
        lockText: '저울이 아직 기울어 있다.\n수평이 되기 전엔, 저울 뒤 문이\n꿈쩍도 하지 않는다.' },
      // 3장 「대문짝 신문사」 — 기울을 되돌린 뒤에야(chapter2Clear) 열리는 동쪽 문
      { x: 27, y: 10, to: 'rumorstreet', tx: 14, ty: 17, needFlag: 'chapter2Clear',
        lockText: '동쪽 벽에 낯선 문이 하나 더 생겼다.\n문 너머가 소란스럽다. …[속보]?\n지금은 굳게 잠겨 있다.' },
    ],
    npcs: [
      // 뱅뱅 — 추천 문 안내인. 명랑하게 같은 곳만 안내한다 (거리를 서성인다)
      { id: 'bangbang', x: 14, y: 13, monSprite: 'gatimmon', name: '뱅뱅', wander: true },
      // 또또 2명 — 떨어져 있는데 토씨까지 같은 말을 반복
      { id: 'ttotto1', x: 9, y: 7, monSprite: 'musimon', name: '또또' },
      { id: 'ttotto2', x: 19, y: 11, monSprite: 'musimon', name: '또또' },
    ],
    signs: [
      { x: 14, y: 6, text: '≪기울어진 거리≫\n반짝이는 문은 이쪽! …저쪽도 이쪽!\n전부 이쪽! (안내: 뱅뱅)' },
      { x: 7, y: 15, text: '[안내] 이쪽은 볼 것 없음!\n돌아가!! 아무것도 없을 확률 99%!\n(안내: 뱅뱅)' },
    ],
    monsters: [],
  },

  // 구역① 「메아리 골목」 — 반짝 문은 전부 입구로 되돌아오는 루프(loop). 칙칙한
  // 문(9) 3개 뒤 방에 「다른 목소리」 3명이 골목 주민과 다른 의견을 각자 말한다.
  echoalley: {
    name: '메아리 골목',
    song: 'glitch',
    intro: [
      '좁은 골목이다. 반짝이는 문이\n여기저기서 "이쪽!" 하고 부른다.',
      '벽 너머로 같은 목소리가 메아리친다.\n"…맞아. …맞아. …다들 그렇게 말해."',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHHHH',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'HHH9HHHHH9HHHHHHHHH9HH',
      'H88888888888888888888H',
      'H88888688888868868888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'HHHHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 11, y: 14, to: 'tiltstreet', tx: 5, ty: 6 },
      // 반짝 추천 문 — 전부 입구(11,13)로 되돌아오는 루프
      { x: 6, y: 11, to: 'echoalley', tx: 11, ty: 13, loop: true },
      { x: 13, y: 11, to: 'echoalley', tx: 11, ty: 13, loop: true },
      { x: 16, y: 11, to: 'echoalley', tx: 11, ty: 13, loop: true },
    ],
    npcs: [
      // 골목 주민 — 같은 의견을 미묘하게 반복
      { id: 'echo1', x: 4, y: 12, pal: 'kid', name: '골목 주민' },
      { id: 'echo2', x: 16, y: 13, pal: 'guard', name: '골목 주민' },
      // 다른 목소리 3명 (칙칙한 문 뒤 위쪽 방)
      { id: 'voice1', x: 5, y: 3, pal: 'traveler', name: '다른 목소리' },
      { id: 'voice2', x: 11, y: 3, pal: 'mittens', name: '다른 목소리' },
      { id: 'voice3', x: 17, y: 3, pal: 'merchant', name: '다른 목소리' },
    ],
    signs: [],
    monsters: [],
  },

  // 구역② 「표본 창고」 — 선반의 오판정 라벨 개그 + 반례 사진 3장 수집 → 판독기 투입.
  samplehouse: {
    name: '표본 창고',
    song: 'cave',
    intro: [
      '선반마다 라벨이 붙어 있다.\n「위험 99%」 「안전 100%」 「불량 100%」…',
      '…라벨과 사진이, 하나도 안 맞는다.',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHHHH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HEEEEEEEEEEEEEEEEEEEEH',
      'HHHHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 11, y: 14, to: 'tiltstreet', tx: 22, ty: 6 },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 구역③ 「꺼진 거리」 — 어두운 맵. 램프 3개를 점등하면 출구가 열린다.
  dimstreet: {
    name: '꺼진 거리',
    song: 'cave',
    intro: [
      '안내판과 달리, 골목은 캄캄하다.\n한 발짝 앞도 잘 보이지 않는다.',
      '…어둠 속에, 꺼진 램프 몇 개가\n희미하게 서 있다.',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHHHH',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'H88888888888888888888H',
      'HHHHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 11, y: 14, to: 'tiltstreet', tx: 5, ty: 16 },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 2장 보스 「문지기의 방」 — 저울이 수평이 되면 열린다. 기울(보스)은 NPC로 두어
  // v1 편향몬(퀴즈 배틀)의 도감/처치 플래그를 오염시키지 않는다. 조우 → PERSUADE.pyeonhyang_boss.
  gatekeeper: {
    name: '문지기의 방',
    song: 'battle',
    intro: [
      '저울 뒤는 좁은 방이었다.\n벽마다 한쪽으로 치우친 그래프가\n잔뜩 붙어 있다.',
      '그 한가운데, 기울이\n한쪽 접시만 뚫어져라 바라보며 서 있다.',
    ],
    tiles: [
      'HHHHHHHHHHHHHH',
      'H888888888888H',
      'H888888888888H',
      'H888888888888H',
      'H888888888888H',
      'H888888888888H',
      'H888888888888H',
      'H888888888888H',
      'H888888888888H',
      'HHHHHHH8HHHHHH',
    ],
    warps: [
      { x: 7, y: 9, to: 'tiltstreet', tx: 14, ty: 3 },
    ],
    npcs: [
      { id: 'pyeong_boss', x: 7, y: 2, monSprite: 'pyeonhyangmon', name: '기울' },
    ],
    signs: [],
    monsters: [],
  },

  // ==== 3장 「대문짝 신문사」 — 소문 거리(허브) ====
  // 가짜 헤드라인이 마을을 잠근 상태로 시작한다. 신문사 건물(1~3층)을 순서대로
  // 클리어하면 송출 완료 순간(flags.rumorFixed) 거리가 풀린다 — 상점 문 개방 +
  // 주민 대사 교체. 옥상의 그럴싸를 되돌리면 3장 클리어.
  rumorstreet: {
    name: '소문 거리',
    song: 'glitch',
    intro: [
      '거리 곳곳에 대문짝만 한 헤드라인이\n[속보]라며 붙어 있다.',
      '상점마다 문이 굳게 닫혀 있다.\n"…소문 때문에요." 다들 그렇게만 말한다.',
      '거리 끝, 신문사 건물이 보인다.\n소문의 출처를 찾으려면… 저기부터다.',
    ],
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TGOOOOOOOGGOOOOOOGGOOOOOOOGT',
      'TGOOOOOOOGGOOOOOOGGOOOOOOOGT',
      'TGOOOOOOOGGOOOOOOGGOOOOOOOGT',
      'TGGGGDGGGGGGGG6GGGGGGGDGGGGT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPYPPPPPPPPYPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPP6',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPPPPPPPPPPPPPPPPPPPPPPPPT',
      'TPPPDPPPPPPPPPPPPPPPPPPPPPPT',
      'TGOOOOOOGGGGGGGGGGGGGGGGGGGT',
      'TGOOOOOOGGGGGGPGGGGGGGGGGGGT',
      'TGOOOOOOGGGGGGPGGGGGGGGGGGGT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: [
      // 신문사 건물 입구 — 언제나 열려 있다 (1층부터 순서대로 진행)
      { x: 14, y: 4, to: 'tipsroom', tx: 9, ty: 1 },
      // 기울어진 거리로 복귀
      { x: 14, y: 18, to: 'tiltstreet', tx: 26, ty: 10 },
      // 4장 「반짝 아케이드」 — 그럴싸를 되돌린 뒤에야(chapter3Clear) 열리는 동쪽 가장자리 문
      { x: 27, y: 10, to: 'arcade', tx: 11, ty: 14, needFlag: 'chapter3Clear',
        lockText: '동쪽 벽 너머, 네온 불빛이 새어 나온다.\n"무료! 당첨! 오늘만!"…\n지금은 굳게 잠겨 있다.' },
    ],
    npcs: [
      // 겁먹은 주민 — 송출 완료(rumorFixed) 전엔 같은 헛소문을 반복한다
      { id: 'rumor_villager1', x: 9, y: 8, pal: 'kid', name: '겁먹은 주민' },
      { id: 'rumor_villager2', x: 18, y: 8, pal: 'grandma', name: '겁먹은 주민' },
    ],
    signs: [
      { x: 9, y: 6, text: '[속보] 우물물을 마시면\n로봇이 된다?! …충격 실화??' },
      { x: 18, y: 6, text: '[단독] 정체불명의 침입자,\n거리를 활보 중?! (그거 너 아니야?)' },
    ],
    monsters: [],
  },

  // 1층 「제보함」 — 제보 쪽지 5장(출처 있음 2 / 수상함 3) 중 출처 있는 것만 채택.
  tipsroom: {
    name: '제보함',
    song: 'battle',
    intro: [
      '≪제보함≫\n쪽지가 산더미처럼 쌓여 있다.',
      '헛소: "다 그럴듯해 보이지?\n…근데 진짜는 출처가 붙어 있어."',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 9, y: 12, to: 'rumorstreet', tx: 14, ty: 5 },
      // 위층(편집실) — 출처 있는 제보 2장을 채택해야 열린다
      { x: 17, y: 2, to: 'editroom', tx: 9, ty: 1, needPuzzleClear: 'tips',
        lockText: '위층 계단 앞에 헛소가 팔짱을 끼고 서 있다.\n"…아직 못 올라가. 출처부터 확인하고 와."' },
    ],
    npcs: [
      { id: 'heossso', x: 2, y: 2, monSprite: 'geojitmon', name: '헛소' },
    ],
    signs: [],
    monsters: [],
  },

  // 2층 「편집실」 — 원본 대조기로 반전 사진의 단서 3개를 지목. 서랍에 복선(seenArticle).
  editroom: {
    name: '편집실',
    song: 'glitch',
    intro: [
      '≪편집실≫\n책상마다 사진이 나란히 붙어 있다.',
      '붙임: "원본이랑 나란히 놓고 보면\n…어딘가 달라. 찾아볼래?"',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 9, y: 12, to: 'rumorstreet', tx: 14, ty: 5 },
      // 위층(송출탑) — 사진 3장의 단서를 모두 지목해야 열린다
      { x: 17, y: 2, to: 'towerroom', tx: 9, ty: 1, needPuzzleClear: 'compare',
        lockText: '위층 계단이 닫혀 있다.\n붙임: "…아직 사진들, 다 못 봤잖아."' },
    ],
    npcs: [
      { id: 'buteum', x: 2, y: 2, monSprite: 'hapseongmon', name: '붙임' },
    ],
    signs: [],
    monsters: [],
  },

  // 3층 「송출탑」 — 정정문 고르기 → 출처 붙이기 → 송출 레버, 3단계 작업.
  towerroom: {
    name: '송출탑',
    song: 'glitch',
    intro: [
      '≪송출탑≫\n낡은 단말 세 대가 나란히 놓여 있다.',
      '"거짓은 1클릭이었는데…\n정정은, 이렇게나 손이 많이 가는구나."',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 9, y: 12, to: 'rumorstreet', tx: 14, ty: 5 },
      // 옥상(그럴싸) — 정정 보도 3단계를 마쳐야 열린다
      { x: 17, y: 2, to: 'towerroof', tx: 7, ty: 8, needPuzzleClear: 'broadcast',
        lockText: '옥상으로 가는 문이 잠겨 있다.\n정정 보도가 아직 끝나지 않았다.' },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 3장 보스 「신문사 옥상」 — 정정 보도가 끝나면 열린다. 그럴싸(보스)는 NPC로 두어
  // v1 미래연구소 환각몬(퀴즈 배틀)의 도감/처치 플래그를 오염시키지 않는다. 조우 → PERSUADE.hwangak_boss.
  towerroof: {
    name: '신문사 옥상',
    song: 'battle',
    intro: [
      '옥상 문을 열자 바람이 훅 불어온다.\n대문짝만 한 헤드라인 판이 세워져 있다.',
      '그 앞에 그럴싸가\n펜을 쥔 채 서성이고 있다.',
    ],
    tiles: [
      'HHHHHHHHHHHHHH',
      'HMMMMMMMMMMMMH',
      'HMMMMMMMMMMMMH',
      'HMMMMMMMMMMMMH',
      'HMMMMMMMMMMMMH',
      'HMMMMMMMMMMMMH',
      'HMMMMMMMMMMMMH',
      'HMMMMMMMMMMMMH',
      'HMMMMMMMMMMMMH',
      'HHHHHHHMHHHHHH',
    ],
    warps: [
      { x: 7, y: 9, to: 'towerroom', tx: 17, ty: 3 },
    ],
    npcs: [
      { id: 'hwangak_boss', x: 7, y: 2, monSprite: 'hwangakmon', name: '그럴싸' },
    ],
    signs: [],
    monsters: [],
  },

  // ==== 4장 「반짝 아케이드」 — 아케이드(허브) ====
  // 네온 과잉 간판과 폭죽 오브젝트로 가득한 허브. 정문(→반짝의 무대)은 2단계 인증 —
  // 열쇠 두 개(비밀조각·본인표)를 맵 양끝 구역(①룰렛 광장·②회원가입 골목)에서 모아야 열린다.
  // 구역③ 백스테이지는 별도 보상(ev_offstage)과 복선 4호를 품은 곁가지 구역이다.
  arcade: {
    name: '반짝 아케이드',
    song: 'glitch',
    intro: [
      '문을 열자 요란한 네온 간판이 쏟아진다.\n"무료!" "당첨!" "오늘만!"',
      '천장에선 색종이 폭죽 오브젝트가\n계속 터지고, 또 터진다.',
      '안쪽 정문은 굳게 잠겨 있다.\n"…열쇠가 두 개는 있어야 열린대."',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIYIIIIIIIIIIIIIIYIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIIIH',
      'HHHHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      // 소문 거리로 복귀
      { x: 11, y: 13, to: 'rumorstreet', tx: 26, ty: 10 },
      // 구역① 룰렛 광장
      { x: 5, y: 3, to: 'roulettesquare', tx: 9, ty: 1 },
      // 구역② 회원가입 골목
      { x: 16, y: 3, to: 'signupalley', tx: 9, ty: 1 },
      // 구역③ 백스테이지
      { x: 11, y: 3, to: 'backstage', tx: 9, ty: 1 },
      // 정문 — 열쇠 두 개(비밀조각·본인표)를 모두 모아야 열린다
      { x: 11, y: 1, to: 'yuhokstage', tx: 7, ty: 8, needS4Keys: 2,
        lockText: '정문에 자물쇠가 두 개 걸려 있다.\n"비밀조각"과 "본인표" — 둘 다 있어야\n열리는 문이라고 적혀 있다.' },
    ],
    npcs: [],
    signs: [
      { x: 3, y: 7, text: '≪반짝 아케이드≫\n"무료!" "당첨!" "오늘만!"\n…간판마다 느낌표뿐이다.' },
      { x: 18, y: 7, text: '천장의 폭죽 오브젝트가\n쉬지 않고 색종이를 뿌린다.\n…치울 사람은 아무도 없어 보인다.' },
    ],
    monsters: [],
  },

  // 구역① 「룰렛 광장」 — 룰렛 단말 3개(돌리면 "당첨!"+광고 딱지)와 해지 단말(다크패턴
  // 체험 — 큰 「혜택 유지」 vs 작은 「해지」). 진짜 목표는 룰렛 뒤 창고의 비밀조각 열쇠.
  roulettesquare: {
    name: '룰렛 광장',
    song: 'glitch',
    intro: [
      '룰렛 세 대가 요란하게 돌아간다.\n"당첨! 당첨! 또 당첨!"',
      '…근데 다들 뭔가에 홀린 듯\n룰렛만 쳐다보고 있다.',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 9, y: 12, to: 'arcade', tx: 5, ty: 4 },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 구역② 「회원가입 골목」 — 갈림길 표지판에서 진짜 도메인을 가려낸다(오답=함정 되돌림
  // +wrongTries). 끝에 본인표 열쇠.
  signupalley: {
    name: '회원가입 골목',
    song: 'glitch',
    intro: [
      '갈림길 팻말 두 개가 나란히 서 있다.\nwww.arca-de.com · www.arca-cle.com',
      '"둘 중 하나만 진짜래.\n…뭐가 다른지, 잘 봐야 해."',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 9, y: 12, to: 'arcade', tx: 16, ty: 4 },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 구역③ 「백스테이지」 — 잠긴 문 앞의 빛나는 마스터키(함정: 카드 일시 도난 → 2단계
  // 인증 창구에서 회수). 정석은 진짜 열쇠 두 개로 여는 문. 반짝의 무대 뒤: 꺼진 조명,
  // 홀로 남은 소품들. 복선 4호: 구석의 버튼 더미(flags.seenButtons).
  backstage: {
    name: '백스테이지',
    song: 'glitch',
    intro: [
      '무대 뒤편, 조명이 반쯤 꺼져 있다.\n소품들이 주인 없이 놓여 있다.',
      '안쪽 문 앞에, 빛나는 마스터키\n하나가 놓여 있다. …수상하다.',
    ],
    tiles: [
      'HHHHHHHHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIIIIIIIH',
      'HHHHHHHHHHHHHHHHHHHH',
    ],
    warps: [
      { x: 9, y: 12, to: 'arcade', tx: 11, ty: 4 },
    ],
    npcs: [],
    signs: [],
    monsters: [],
  },

  // 4장 보스 「반짝의 무대」 — 정문(열쇠 2개)이 열려야 들어올 수 있다. 반짝(보스)은 NPC로
  // 두어 v1 유혹몬(퀴즈 배틀)의 도감/처치 플래그를 오염시키지 않는다. 조우 → PERSUADE.yuhok_boss.
  yuhokstage: {
    name: '반짝의 무대',
    song: 'battle',
    intro: [
      '무대로 이어지는 문을 열자,\n눈부신 조명이 쏟아진다.',
      '조명 한가운데, 반짝이\n버튼을 만지작거리며 서 있다.',
    ],
    tiles: [
      'HHHHHHHHHHHHHH',
      'HIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIH',
      'HIIIIIIIIIIIIH',
      'HHHHHHHIHHHHHH',
    ],
    warps: [
      { x: 7, y: 9, to: 'arcade', tx: 11, ty: 2 },
    ],
    npcs: [
      { id: 'yuhok_boss', x: 7, y: 2, monSprite: 'yuhokmon', name: '반짝' },
    ],
    signs: [],
    monsters: [],
  },

  forest: {
    name: '정적의 숲',
    song: 'field',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTGGGGTTTTTTTTTTTT',
      'TTTGGGTTTTTGGGGGGTTTTTGGGTTT',
      'TTGGGGGTTTGGGGGGGGTTTGGGGGTT',
      'TTGFGGGTTGGGGGGGGGGTTGGGFGTT',
      'TTGGGGGTTGGGGPPGGGGGTTGGGGTT',
      'TTTGGGGTTTGGGPPGGGTTTGGGGTTT',
      'TTTTGGGGGTTGGPPGGTTGGGGGTTTT',
      'TTTTTGGGGGGGGPPGGGGGGGGTTTTT',
      'TTTGGGGGGGGGGPPGGGGGGGGGGTTT',
      'TTGGGGGGGGGGGPPGGGGGGGGGGGTT',
      'TTGFGGGGTTTGGPPGGTTTGGGGFGTT',
      'TTGGGGGTTTTTGPPGTTTTTGGGGGTT',
      'TTTGGGGTTTTTGPPGTTTTTGGGGTTT',
      'TTTTTTTTTTTTGPPGTTTTTTTTTTTT',
      'TTTTTTTTTTTTGPPGTTTTTTTTTTTT',
      'TTTTTTTTTTTTGPPGTTTTTTTTTTTT',
      'TTTTTTTTTTTTYPPGTTTTTTTTTTTT',
      'TTTTTTTTTTTTGPPGTTTTTTTTTTTT',
      'TTTTTTTTTTTTTPPTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 13, y: 19, to: 'village', tx: 13, ty: 1 },
      { x: 14, y: 19, to: 'village', tx: 14, ty: 1 },
    ],
    npcs: [],
    signs: [
      { x: 12, y: 17, text: '≪정적의 숲≫\n요즘 몬스터들이 나타나\n숲이 어수선합니다. 조심!' },
    ],
    monsters: [
      { id: 'bekkyeomon', x: 7, y: 10 },
      { id: 'mollaemon', x: 13, y: 3 },
    ],
  },

  lake: {
    name: '잔향의 호수',
    song: 'field',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TGGGGGGGGGWWWWWWWWWWWWWWWWWT',
      'TGGGGGGGWWWWWWWWWWWWWWWWWWWT',
      'TGGGGGGWWWWWWWWWWWWWWWWWWWWT',
      'TGGGGGWWWWWWWGGGGGWWWWWWWWWT',
      'TGGGGGWWWWWWWGGGGGWWWWWWWWWT',
      'TGGGGGWWWWWWWGGGGGWWWWWWWWWT',
      'TGGGGGWWWWWWWWBWWWWWWWWWWWWT',
      'TGGGGGWWWWWWWWBWWWWWWWWWWWWT',
      'TGGGGGGWWWWWWWBWWWWWWWWWWWWT',
      'TGGGGGGGGWWWWWBWWWWWWWWWWWWT',
      'PPPPPPPPPPPPPPPGWWWWWWWWWWWT',
      'TGGGGGGGGGGGGGGGWWWWWWWWWWWT',
      'TGGFGGGGGGGFGGGGGWWWWWWWWWWT',
      'TGGGGGGGGGGGGGGGGGWWWWWWWWWT',
      'TGGGGGGGGGGGGGGGGGGWWWWWWWWT',
      'TGYGGGGGGGGGGGGGGGGGWWWWWWWT',
      'TGGGGGGGGGGGGGGGGGGGGWWWWWWT',
      'TGGGGFGGGGGGGGFGGGGGGGWWWWWT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 0, y: 11, to: 'village', tx: 26, ty: 11 },
    ],
    npcs: [],
    signs: [
      { x: 2, y: 16, text: '≪잔향의 호수≫\n호수 가운데 섬에서\n이상한 소문이 들려옵니다…' },
    ],
    monsters: [
      { id: 'jungdokmon', x: 8, y: 14 },
      { id: 'geojitmon', x: 15, y: 5 },
    ],
  },

  cave: {
    name: '회로의 동굴',
    song: 'cave',
    tiles: [
      'KKKKKKKKKKKKKKKKKKKKKKKKKKKK',
      'KCCCCCCCCCKKKKKKKKCCCCCCCCCK',
      'KCCCCCCCCCCKKKKKKCCCCCCCCCCK',
      'KCC*CCCCCCCCKKKKCCCCCCC*CCCK',
      'KCCCCCCCCCCCCCCCCCCCCCCCCCCK',
      'KCCCCCCCCCCCCCCCCCCCCCCCCCCK',
      'KKKKKCCCCCKKKKKKKKKCCCCCKKKK',
      'KKKKKCCCCCKKKKKKKKKCCCCCKKKK',
      'KKKCCCCCCCCKKKKKKKCCCCCCCKKK',
      'KKCCCCCCCCCCKKKKKCCCCCCCCCKK',
      'KKCCCCCCCCCCCCCCCCCCCCCCCCKK',
      'KKCCCCCCCCCCCCCCCCCCCCCCCCCP',
      'KKCCCCCCCCCCCCCCCCCCCCCCCCKK',
      'KKKCC*CCCCCCCCCCCCCC*CCCKKKK',
      'KKKKCCCCCCCCCCCCCCCCCCKKKKKK',
      'KKKKKKCCCCCCCCCCCCCCKKKKKKKK',
      'KKKKKKKKCCCCCCCCCCKKKKKKKKKK',
      'KKKKKKKKKKCCCCCCKKKKKKKKKKKK',
      'KKKKKKKKKKKKKKKKKKKKKKKKKKKK',
      'KKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    ],
    warps: [
      { x: 27, y: 11, to: 'village', tx: 1, ty: 11 },
    ],
    npcs: [
      { id: 'explorer', x: 20, y: 10, pal: 'guard', name: '탐험가' },
    ],
    signs: [],
    monsters: [
      { id: 'pyeonhyangmon', x: 4, y: 4 },
    ],
  },

  tower: {
    name: '신호탑',
    song: 'cave',
    tiles: [
      'NNNNNNNNNNNNNNNNNN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NNNNNNNNMMNNNNNNNN',
    ],
    warps: [
      { x: 8, y: 13, to: 'village', tx: 18, ty: 5 },
      { x: 9, y: 13, to: 'village', tx: 18, ty: 5 },
    ],
    npcs: [],
    signs: [],
    monsters: [
      { id: 'hondonmon', x: 8, y: 3 },
    ],
  },

  // ---- 스테이지 2: 햇살초원 거점 (허브) + 서브맵 2 + 보스 아레나 ----
  meadow: {
    name: '햇살초원 거점 (스테이지 2)',
    song: 'field',
    tiles: [
      'TTTTTTTTTTTTTPPTTTTTTTTTTTTT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGFGGGGFGGGGGPPGGGGFGGGGFGGT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGGTTGGGGGGGGPPGGGGGGGGTTGGT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGFGGGGGGGGGGPPGGGGGFGGGGGGT',
      'TGGGGGGWWWGGGPPGGGWWWGGGGGGT',
      'TGGGGGGWWWGGGPPGGGWWWGGGGGGT',
      'PGGGGGGGGGGGGPPGGGGGGGGGGGGP',
      'TGGGGGGGGGGGGPPYGGGGGGGGGGGT',
      'TGFGGGGGGGGGGPPGGGGGGGGGGFGT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGGTTGGGGGGGGPPGGGGGGGGTTGGT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGGGGGG1GGGGGPPGGGGG1GGGGGGT',
      'TGGGGGGGGGGGGPPGGGGGGGGGGGGT',
      'TGGFGGGGGGGGGPPGGGGGGGGGFGGT',
      'TTTTTTTTTTTTTPPTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 13, y: 0, to: 'village', tx: 13, ty: 18 },
      { x: 14, y: 0, to: 'village', tx: 14, ty: 18 },
      { x: 0, y: 10, to: 'windhill', tx: 1, ty: 10 },
      { x: 27, y: 10, to: 'fogswamp', tx: 26, ty: 10 },
      { x: 7, y: 16, to: 'serverroom', tx: 13, ty: 18 },
      { x: 20, y: 16, to: 'signaltower2', tx: 8, ty: 12,
        needAllDefeated: ['somunmon', 'musimon', 'tturimmon', 'girokmon'],
        lockText: '탑터의 문이 굳게 닫혀 있다.\n바람 언덕·안개 습지·서버실의\n마음을 먼저 되돌려야 한다.' },
      { x: 13, y: 19, to: 'desert', tx: 13, ty: 1, needBoss: 'meotdaeromon',
        lockText: '남쪽 길을 멋대로몬의 부하들이\n막고 있다. 이 초원의 보스\n멋대로몬을 깨우쳐야 한다!' },
      { x: 14, y: 19, to: 'desert', tx: 14, ty: 1, needBoss: 'meotdaeromon',
        lockText: '남쪽 길을 멋대로몬의 부하들이\n막고 있다. 이 초원의 보스\n멋대로몬을 깨우쳐야 한다!' },
    ],
    npcs: [
      { id: 'traveler', x: 17, y: 7, pal: 'traveler', name: '여행자' },
      { id: 'meadow_scout', x: 5, y: 7, pal: 'kid', name: '정찰대 아이' },
    ],
    signs: [
      { x: 15, y: 11, text: '≪햇살초원 거점≫ 스테이지 2\n서쪽 바람 언덕, 동쪽 안개 습지를\n탐험해 두 수호자를 깨우치세요!' },
    ],
    monsters: [],
  },

  // 스테이지 2 서브맵 A: 바람 언덕
  windhill: {
    name: '바람 언덕',
    song: 'field',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGTTGGGGGGGFGGGGGGGGGGGGGGT',
      'TGGTGGGGGGGGGGGGGGGGTTGGGGGT',
      'TGFGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGGGTTGGGGGGGGGGGGGGGGGT',
      'TGGGGGGGGGGGWWWGGGGGGGGGGGGT',
      'TGGGGGGGGGGGWWWGGGGGGGGGGGGT',
      'TGGGGGGGGGGGGGGGFGGGGGTTGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'PGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGGGGGFGGGGGGGGGGGGGGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGFGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGP',
      'TGGGGGTTGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGGGGGGGGGGGGGTTGGGGGGGT',
      'TGGGGFGGGGGGGGGGGGGGGGGGGGGT',
      'TGGYGGGGGGGGGGGGGGGGFGGGGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 0, y: 10, to: 'meadow', tx: 1, ty: 10 },
      { x: 27, y: 13, to: 'fogswamp', tx: 1, ty: 13 },
    ],
    npcs: [
      { id: 'windhill_hermit', x: 5, y: 3, pal: 'traveler', name: '언덕 은둔자' },
    ],
    signs: [
      { x: 3, y: 17, text: '≪바람 언덕≫\n바람이 세차서 소문이 금방\n퍼지는 곳이래요. 확인부터!' },
    ],
    monsters: [
      { id: 'akpeulmon', x: 8, y: 4 },
      { id: 'somunmon', x: 20, y: 11 },
    ],
  },

  // 스테이지 2 서브맵 B: 안개 습지
  fogswamp: {
    name: '안개 습지',
    song: 'field',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGGGGGFGGGGGGGGGGGGGGGGT',
      'TGGGWWGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGWGGGGGGGGGGGGGGGGWWGGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGWGGGGT',
      'TGGGGGGGGGGGGGGGFGGGGGGGGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGWGGGGGGGGGGGGGGGGGGGGGGGT',
      'PGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGFGGGGGGGGGGGGGGGGGWGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'PGGGGGGGGGGGGGGGGGGGGGFGGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGGWWGGGGGGGGGGGWWGGGGGT',
      'TGGGGGGGGGGGGGFGGGGGGGGGGGGT',
      'TGYGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TGGGGGGGGGGGGGGGGGGGGGGGGGGT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: [
      { x: 0, y: 10, to: 'meadow', tx: 26, ty: 10 },
      { x: 0, y: 13, to: 'windhill', tx: 26, ty: 13 },
    ],
    npcs: [
      { id: 'fogswamp_frog', x: 15, y: 6, pal: 'kid', name: '습지 관찰자' },
    ],
    signs: [
      { x: 2, y: 17, text: '≪안개 습지≫\n안개가 짙어 한쪽 소리만\n들리기 쉬워요. 골고루 들어요.' },
    ],
    monsters: [
      { id: 'gatimmon', x: 8, y: 7 },
      { id: 'musimon', x: 20, y: 12 },
    ],
  },

  // 스테이지 2 보스 아레나: 신호 탑터
  signaltower2: {
    name: '신호 탑터',
    song: 'cave',
    tiles: [
      'NNNNNNNNNNNNNNNNNN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NNNNNNNNMMNNNNNNNN',
    ],
    warps: [
      { x: 8, y: 13, to: 'meadow', tx: 20, ty: 15 },
      { x: 9, y: 13, to: 'meadow', tx: 20, ty: 15 },
    ],
    npcs: [],
    signs: [],
    monsters: [
      { id: 'meotdaeromon', x: 8, y: 3 },
    ],
  },

  // ---- 스테이지 3: 재깍사막 거점 (허브) + 서브맵 2 + 보스 아레나 ----
  desert: {
    name: '재깍사막 거점 (스테이지 3)',
    song: 'desert',
    tiles: [
      'RRRRRRRRRRRRRSSRRRRRRRRRRRRR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSXSSSSSSSSSSSSSSSSSSSSXSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSXSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSXSSSSSSSSSSSSSSSSSSSSXSSR',
      'SSSSSSSSSSSSSSSSSSSSSSSSSSSS',
      'RSSSSSRSSRSSSSSSSSRSSRSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSYSSSSSSSSSSSSXSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSXSSSSSSSSSSSSSSSSSSSSXSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSRS1SSSSSSS1SSSSRSSSSSR',
      'RSSXSSSSSSSSSSSSSSSSSSSSXSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RRRRRRRRRRRRRSSRRRRRRRRRRRRR',
    ],
    warps: [
      { x: 13, y: 0, to: 'meadow', tx: 13, ty: 18 },
      { x: 14, y: 0, to: 'meadow', tx: 14, ty: 18 },
      { x: 0, y: 8, to: 'ruins', tx: 1, ty: 10 },
      { x: 27, y: 8, to: 'oasis', tx: 1, ty: 10 },
      { x: 8, y: 16, to: 'library', tx: 13, ty: 18 },
      { x: 16, y: 16, to: 'temple', tx: 8, ty: 12,
        needAllDefeated: ['nangbimon', 'pinggyemon', 'sujipmon', 'saseomon'],
        lockText: '신전의 문이 굳게 닫혀 있다.\n폐허·오아시스·기억의 도서관의\n마음을 먼저 되돌려야 한다.' },
      { x: 13, y: 19, to: 'snow', tx: 13, ty: 1, needBoss: 'tteonemgimon',
        lockText: '모래폭풍이 길을 막고 있다.\n이 사막의 보스 떠넘기몬을\n깨우치면 가라앉을 것이다!' },
      { x: 14, y: 19, to: 'snow', tx: 14, ty: 1, needBoss: 'tteonemgimon',
        lockText: '모래폭풍이 길을 막고 있다.\n이 사막의 보스 떠넘기몬을\n깨우치면 가라앉을 것이다!' },
    ],
    npcs: [
      { id: 'merchant', x: 18, y: 12, pal: 'merchant', name: '사막 상인' },
      { id: 'desert_nomad', x: 6, y: 6, pal: 'traveler', name: '사막 유목민' },
    ],
    signs: [
      { x: 2, y: 11, text: '≪재깍사막 거점≫ 스테이지 3\n서쪽 열사의 폐허, 동쪽 오아시스를\n탐험해 두 수호자를 깨우치세요!' },
    ],
    monsters: [],
  },

  // 스테이지 3 서브맵 A: 열사의 폐허
  ruins: {
    name: '열사의 폐허',
    song: 'desert',
    tiles: [
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSXSSSSSSSSSSSSSSSSSSSSXSSR',
      'RSSSRRSSSSSSSSSSSSSSRRSSSSSR',
      'RSSSRSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSRSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSRRSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSRSSSSSSSSR',
      'RSSSSSSSSSSSXSSSSSSSSSSSSSSR',
      'SSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSRSSSSSSSSSYSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSRRSSSSSSSSSSSSRRSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSXSSSSSSSSSSSSSSSSSSSSXSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRR',
    ],
    warps: [
      { x: 0, y: 10, to: 'desert', tx: 1, ty: 8 },
    ],
    npcs: [
      { id: 'ruins_explorer', x: 10, y: 5, pal: 'guard', name: '폐허 탐험가' },
    ],
    signs: [
      { x: 25, y: 11, text: '≪열사의 폐허≫\n낡은 데이터센터의 잔해…\n에너지를 마구 쓴 흔적이다.' },
    ],
    monsters: [
      { id: 'pungpungmon', x: 8, y: 5 },
      { id: 'nangbimon', x: 20, y: 13 },
    ],
  },

  // 스테이지 3 서브맵 B: 오아시스
  oasis: {
    name: '오아시스',
    song: 'desert',
    tiles: [
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSFSSSSSSSSSSSSSSSSSSSSFSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSSXSSSSSSSSSSSSSSSSSSXSSSR',
      'RSSSSSSSSSWWWWWWWWSSSSSSSSSR',
      'RSSSSSSSSSWGGGGGGWSSSSSSSSSR',
      'RSSSSSSSSSWGGGGGGWSSSSSSSSSR',
      'RSSSSSSSSSWGGFGGGWSSSSSSSSSR',
      'RSSSSSSSSSGGGGGGGWSSSSSSSSSR',
      'SSSSSSSSSSGGGGGGGWSSSSSSSSSR',
      'RSSSSSSSSSWGGGFGGWSSSSSSSSSR',
      'RSSSSSSSSSWGGYGGGWSSSSSSSSSR',
      'RSSSSSSSSSWGGGGGGWSSSSSSSSSR',
      'RSSSSSSSSSWWWWWWWWSSSSSSSSSR',
      'RSSSXSSSSSSSSSSSSSSSSSSXSSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RSSFSSSSSSSSSSSSSSSSSSSSFSSR',
      'RSSSSSSSSSSSSSSSSSSSSSSSSSSR',
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRR',
    ],
    warps: [
      { x: 0, y: 10, to: 'desert', tx: 26, ty: 8 },
    ],
    npcs: [
      { id: 'oasis_traveler', x: 12, y: 9, pal: 'merchant', name: '오아시스 여행자' },
    ],
    signs: [
      { x: 13, y: 12, text: '≪오아시스≫\n사막 한가운데 맑은 물.\n핑계 대지 않고 책임지는 자만\n이 물을 마실 수 있대요.' },
    ],
    monsters: [
      { id: 'kkamkkammon', x: 12, y: 7 },
      { id: 'pinggyemon', x: 14, y: 11 },
    ],
  },

  // 스테이지 3 보스 아레나: 심판의 신전
  temple: {
    name: '심판의 신전',
    song: 'cave',
    tiles: [
      'NNNNNNNNNNNNNNNNNN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMNMMMMMMMMMMNMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMN',
      'NNNNNNNNMMNNNNNNNN',
    ],
    warps: [
      { x: 8, y: 13, to: 'desert', tx: 16, ty: 15 },
      { x: 9, y: 13, to: 'desert', tx: 16, ty: 15 },
    ],
    npcs: [],
    signs: [],
    monsters: [
      { id: 'tteonemgimon', x: 8, y: 3 },
    ],
  },


  // ---- 스테이지 4 ----
  snow: {
    name: '정지된 설원 (스테이지 4)',
    song: 'snow',
    tiles: [
      'JJJJJJJJJJJJJZZJJJJJJJJJJJJJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZOOOOZZZZZZZZZZZZOOOOZZZZJ',
      'JZZOOOOZZZZZZZZZZZZOOOOZZZZJ',
      'JZZHDHHZZZZZZZZZZZZHHDHZZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZJJZZZZZZZZZZZZZZZZZJJZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZZZZZZZZWWWWWWWZZZZZZZZZZJ',
      'JZZZZZZZZZWWWWWWWZZZZZZZZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZYZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZJJZZZZZZZZZZZZZZZZZJJZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZZZZZ1ZZZZZZZZZZZZZZZZZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JZZZZZZZZZZZZZZZZZZZZZZZZZZJ',
      'JJJJJJJJJJJJJZZJJJJJJJJJJJJJ',
    ],
    warps: [
      { x: 13, y: 0, to: 'desert', tx: 13, ty: 18 },
      { x: 14, y: 0, to: 'desert', tx: 14, ty: 18 },
      { x: 7, y: 16, to: 'mirrors', tx: 13, ty: 18 },
      { x: 13, y: 19, to: 'castle', tx: 9, ty: 15, needBoss: 'hollimmon',
        needAllDefeated: ['piltermon', 'mirrormon', 'yuhokmon', 'soksagimon'],
        lockText: '그림자성의 문이 얼음으로 덮여 있다.\n거울 회랑·속삭임 정원의 마음과\n설원의 보스 홀림몬을 되돌려야 한다!' },
      { x: 14, y: 19, to: 'castle', tx: 10, ty: 15, needBoss: 'hollimmon',
        needAllDefeated: ['piltermon', 'mirrormon', 'yuhokmon', 'soksagimon'],
        lockText: '그림자성의 문이 얼음으로 덮여 있다.\n거울 회랑·속삭임 정원의 마음과\n설원의 보스 홀림몬을 되돌려야 한다!' },
    ],
    npcs: [
      { id: 'mittens', x: 16, y: 13, pal: 'mittens', name: '털장갑 소녀' },
    ],
    signs: [
      { x: 2, y: 12, text: '≪정지된 설원≫ 스테이지 4\n남쪽 그림자성에서 어둠의 기운이…\n마음을 단단히 먹으세요!' },
    ],
    monsters: [
      { id: 'sideulmon', x: 7, y: 6 },
      { id: 'ppaeatmon', x: 20, y: 11 },
      { id: 'hollimmon', x: 13, y: 15 },
    ],
  },

  // ---- 스테이지 5 ----
  castle: {
    name: '그림자성 (스테이지 5)',
    song: 'cave',
    tiles: [
      'NNNNNNNNNNNNNNNNNNNN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NNNNNNNNNMNNNNNNNNNN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NNNNNNNNNNMNNNNNNNNN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMNMMNMMMMMMNMMNMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMMMMMMMN',
      'NNNNNNNNNMMNNNNNNNNN',
    ],
    warps: [
      { x: 9, y: 17, to: 'snow', tx: 13, ty: 18 },
      { x: 10, y: 17, to: 'snow', tx: 14, ty: 18 },
      { x: 9, y: 1, to: 'core', tx: 9, ty: 13, needBoss: 'finalboss',
        lockText: '왕좌 뒤에서 가느다란 신호가\n더 깊은 곳으로 이어진다…' },
    ],
    npcs: [],
    signs: [],
    monsters: [
      { id: 'maearimon', x: 10, y: 8 },
      { id: 'geurimjamon', x: 9, y: 4 },
      { id: 'finalboss', x: 9, y: 2 },
    ],
  },

  // ---- 스테이지 2 (서버실) ----
  serverroom: {
    name: '잊혀진 서버실 (스테이지 2)',
    song: 'glitch',
    intro: [
      '낡은 서버들이 늘어선 차가운 방.\n먼지 쌓인 기계들 사이로\n희미한 불빛이 깜빡인다.',
      '…경계마을이 세워지기 훨씬 전부터\n잠들어 있던 곳 같다.',
    ],
    tiles: [
      'KKKKKKKKKKKKKEEKKKKKKKKKKKKK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEYEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEVVEVVEVVEEEEEEVVEVVEVVEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEEEEEEEEEEEK',
      'KKKKKKKKKKKKKEEKKKKKKKKKKKKK',
    ],
    warps: [
      { x: 13, y: 19, to: 'meadow', tx: 7, ty: 17 },
      { x: 14, y: 19, to: 'meadow', tx: 7, ty: 17 },
    ],
    npcs: [
      { id: 'hologram1', x: 16, y: 16, pal: 'prof', name: '박사님(홀로그램)' },
    ],
    signs: [
      { x: 2, y: 12, text: '[제0연구동 — 서버실]\n…출입 기록: 마지막 접속,\n아주 오래전.' },
    ],
    monsters: [
      { id: 'tturimmon', x: 7, y: 8 },
      { id: 'girokmon', x: 13, y: 2 },
    ],
  },

  // ---- 스테이지 3 (도서관) ----
  library: {
    name: '기억의 도서관 (스테이지 3)',
    song: 'title',
    intro: [
      '끝없이 늘어선 책장.\n책등에는 이름이 하나씩 적혀 있다.',
      '…전부, 누군가의 기억이다.',
    ],
    tiles: [
      'NNNNNNNNNNNNNIINNNNNNNNNNNNN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NILLLLLILLLLLIILLLLLILLLLLIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NILLLLLILLLLLIILLLLLILLLLLIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NILLLLLILLLLLIILLLLLILLLLLIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NILLLLLILLLLLIILLLLLILLLLLIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NIYIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NILLLLLILLLLLIILLLLLILLLLLIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NIIIIIIIIIIIIIIIIIIIIIIIIIIN',
      'NNNNNNNNNNNNNIINNNNNNNNNNNNN',
    ],
    warps: [
      { x: 13, y: 19, to: 'desert', tx: 8, ty: 17 },
      { x: 14, y: 19, to: 'desert', tx: 8, ty: 17 },
    ],
    npcs: [],
    signs: [
      { x: 2, y: 11, text: '[열람 안내]\n허락 없이 가져간 기억은\n반드시 제자리에 돌려놓을 것.' },
    ],
    monsters: [
      { id: 'sujipmon', x: 20, y: 7 },
      { id: 'saseomon', x: 13, y: 2 },
    ],
  },

  // ---- 스테이지 4 (거울) ----
  mirrors: {
    name: '거울 회랑 (스테이지 4)',
    song: 'glitch',
    intro: [
      '거울로 된 복도.\n수많은 "나"가 함께 걷는다.',
      '…그런데 저 거울 속의 나는\n방금, 혼자서 움직이지 않았나?',
    ],
    tiles: [
      'QQQQQQQQQQQQQMMQQQQQQQQQQQQQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMQMMQMMQMMQMMQMMQMMQMMQMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMQMMQMMQMMQMMQMMQMMQMMQMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMYMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMQMMQMMQMMQMMQMMQMMQMMQMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMQMMQMMQMMQMMQMMQMMQMMQMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QMMMMMMMMMMMMMMMMMMMMMMMMMMQ',
      'QQQQQQQQQQQQQMMQQQQQQQQQQQQQ',
    ],
    warps: [
      { x: 13, y: 19, to: 'snow', tx: 7, ty: 17 },
      { x: 14, y: 19, to: 'snow', tx: 7, ty: 17 },
      { x: 13, y: 0, to: 'garden', tx: 13, ty: 1, needBoss: 'mirrormon',
        lockText: '거울 속의 네가 고개를 젓는다.\n…아직은 지나갈 수 없다.' },
      { x: 14, y: 0, to: 'garden', tx: 14, ty: 1, needBoss: 'mirrormon',
        lockText: '거울 속의 네가 고개를 젓는다.\n…아직은 지나갈 수 없다.' },
    ],
    npcs: [],
    signs: [
      { x: 2, y: 10, text: '거울에 흐릿한 글씨가 적혀 있다.\n"필터 너머의 얼굴이 아니라,\n지금의 너를 보아 줘."' },
    ],
    monsters: [
      { id: 'piltermon', x: 7, y: 6 },
      { id: 'mirrormon', x: 13, y: 2 },
    ],
  },

  // ---- 스테이지 4 (정원) ----
  garden: {
    name: '속삭임 정원 (스테이지 4)',
    song: 'cave',
    intro: [
      '빛나는 꽃이 피어 있는 어두운 정원.\n바람도 없는데 꽃잎이 흔들린다.',
      '아주 작은 목소리가 들려온다.\n"…외로워. …외로워."',
    ],
    tiles: [
      '3333333333333223333333333333',
      '3222222222222222222222222223',
      '3242222242222222222422224223',
      '3222222222222222222222222223',
      '3223322222222222222222332223',
      '3222222222222222222222222223',
      '3222222222222222222222222223',
      '3242222222222222222222242223',
      '3222222WWW2222222WWW22222223',
      '3222222WWW2222222WWW22222223',
      '3222222222222222222222222223',
      '322222222222222Y222222222223',
      '3242222222222222222222222423',
      '3222222222222222222222222223',
      '3223322222222222222222332223',
      '3222222222222222222222222223',
      '3222222222222222222222222223',
      '3222222222222222222222222223',
      '3242222222222222222222242223',
      '3333333333333223333333333333',
    ],
    warps: [
      { x: 13, y: 0, to: 'mirrors', tx: 13, ty: 1 },
      { x: 14, y: 0, to: 'mirrors', tx: 14, ty: 1 },
    ],
    npcs: [
      { id: 'hologram2', x: 17, y: 16, pal: 'prof', name: '박사님(홀로그램)' },
    ],
    signs: [
      { x: 15, y: 11, text: '팻말에 손글씨가 남아 있다.\n"영이의 정원.\n— 우리 아이가 제일 좋아하는 곳"' },
    ],
    monsters: [
      { id: 'yuhokmon', x: 7, y: 6 },
      { id: 'soksagimon', x: 13, y: 15 },
    ],
  },

  // ---- 스테이지 5 (코어) ----
  core: {
    name: '코어 (스테이지 5)',
    song: 'core',
    intro: [
      '세상의 가장 깊은 곳.\n모든 데이터가 시작된 자리.',
      '어둠 속에서 화면 하나가\n천천히 켜진다.',
      '"…어서 와.\n기다리고 있었어."',
    ],
    tiles: [
      'KKKKKKKKKKKKKKKKKKKK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KKKKKKKKKAKKKKKKKKKK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KKKKKKKKKAAKKKKKKKKK',
    ],
    warps: [
      { x: 9, y: 15, to: 'castle', tx: 9, ty: 2 },
      { x: 10, y: 15, to: 'castle', tx: 9, ty: 2 },
    ],
    npcs: [],
    signs: [],
    monsters: [
      { id: 'jogakmon', x: 9, y: 5 },
      { id: 'yeongi', x: 9, y: 2 },
    ],
  },

  // ---- 보너스: AI 미래연구소 ----
  // 본편 진행과 무관한 자유 연습 공간. 증표·자비와 상관없이 새 주제를 미리 만나 본다.
  lab: {
    name: 'AI 미래연구소 (보너스)',
    song: 'lab',
    intro: [
      '환하게 불이 켜진 둥근 연구실.\n벽면 화면에 "아직 이름 없는 고민들"이라고\n적혀 있다.',
      '아직 교과서엔 없는 새로운 고민들을\n미리 연습해 볼 수 있는 곳이다.',
    ],
    tiles: [
      'KKKKKKKKKKKKKKKKKK',
      'KEEEEEEEEEEEEEEEEK',
      'KEYVVEEEEEEEEVVEEK',
      'KEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEK',
      'KEEEEEEEEEEEEEEEEK',
      'KEEEEEEEE55EEEE1EK',
      'KEEEEEEEE55EEEEEEK',
      'KKKKKKKKKKKKKKKKKK',
    ],
    warps: [
      { x: 8, y: 9, to: 'village', tx: 26, ty: 9 },
      { x: 9, y: 9, to: 'village', tx: 26, ty: 9 },
      { x: 8, y: 10, to: 'village', tx: 26, ty: 9 },
      { x: 9, y: 10, to: 'village', tx: 26, ty: 9 },
      { x: 15, y: 9, to: 'bubble', tx: 7, ty: 9 },
    ],
    npcs: [
      { id: 'labguide', x: 2, y: 8, pal: 'guard', name: '연구원' },
    ],
    signs: [
      { x: 2, y: 2, text: '[연습 안내]\n여기서 친구가 된 몬스터도\n도감과 도전과제에 함께 기록돼요.' },
    ],
    monsters: [
      { id: 'hwangakmon', x: 4, y: 4 },
      { id: 'hapseongmon', x: 13, y: 4 },
      { id: 'miraemon', x: 9, y: 3 },
    ],
  },

  // ---- 보너스: 필터버블 방탈출 (개념 체험 시범) ----
  // '추천(같은 문)'만 따라가면 제자리(입구)로 되돌아오고, '새로운 길'을
  // 골라야 위로 빠져나온다. 똑같은 복도가 반복되는 것 자체가 필터버블 체험.
  bubble: {
    name: '필터버블 미로 (연습)',
    song: 'glitch',
    intro: [
      '똑같은 복도가 끝없이 이어진다.\n벽마다 "네가 좋아할 만한 것"이라는\n추천 화면이 깜빡인다.',
      '…여기서 나가려면, 늘 보던 것 말고\n"새로운 길"을 골라야 할 것 같다.',
    ],
    tiles: [
      'NNNNNNNNNNNNNN',
      'NMMMMMMYMMMMMN',
      'N1MMMMMMMMMMMN',
      'NMMMMMMMMMMMMN',
      'NNN1NNN1NN1NNN',
      'NMMMMMMMMMMMMN',
      'NMYMMMYMMYMMMN',
      'NMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMN',
      'NMMMMMMMMMMMMN',
      'NMMMMMMMMMMM1N',
      'NNNNNNNNNNNNNN',
    ],
    warps: [
      { x: 12, y: 10, to: 'lab', tx: 14, ty: 9 },     // 포기하고 연구실로
      { x: 3, y: 4, to: 'bubble', tx: 7, ty: 8 },     // 추천 → 제자리로(필터버블)
      { x: 7, y: 4, to: 'bubble', tx: 7, ty: 8 },     // 추천 → 제자리로(필터버블)
      { x: 10, y: 4, to: 'bubble', tx: 10, ty: 2 },   // ✨새로운 길 → 위(탈출)로
      { x: 1, y: 2, to: 'lab', tx: 14, ty: 9 },       // 탈출문 → 연구실
    ],
    npcs: [],
    signs: [
      { x: 7, y: 1, text: '✨ 빠져나왔다!\n추천(같은 것)만 보면 시야가 좁아져요.\n가끔 "새로운 것"도 골라 보는 게\n필터버블을 깨는 법이에요!' },
      { x: 2, y: 6, text: '추천 영상: "네가 좋아하는 것"\n(…또 비슷한 거네.)' },
      { x: 6, y: 6, text: '추천 영상: "네가 좋아하는 것"\n(…또 비슷한 거네.)' },
      { x: 9, y: 6, text: '✨ 한 번도 안 가 본 "새로운 길"' },
    ],
    monsters: [],
  },
};

// ---- 몬스터 정의 ----
// hp = 맞혀야 하는 문제 수
const MONSTERS = {
  bekkyeomon: {
    name: '베껴몬',
    displayName: '따라', // 마음 조각 배틀에서 쓰는 표시 이름 (HUD·화자·플로팅·도감)
    topic: 'copyright',
    hp: 3,
    intro: "사람들이 만나면 '안녕'이라고 하더라. …안녕.\n박사님 말이, 잘 그린 건 다 가져도 된대.\n어떤 블로그에서 봤는데, 내 것 따윈 필요 없대.\n…그래서 나, 전부 남의 걸로 채웠어. 근데 왜 텅 비었지.",
    win: '누가 그랬더라… 아니, 아니야.\n…내 생각엔, 서툴러도 내가 그린 게 좋아.\n이 말은 어디서 베낀 게 아니야. 처음으로, 내 거야.',
    badge: null,
    mercy: {
      prompt: '따라가 너덜너덜한 연필을\n꼭 쥔 채, 빈 종이를 내려다보고 있다.',
      options: [
        { label: '"네 이야기를 그려 봐" (연필을 쥐여 준다)', kind: 'mercy',
          reply: '…이야기? 내가?\n(따라가 빈 종이에 삐뚤빼뚤\n선을 하나 긋는다.)\n…이 선은, 어디서 본 거 아니야.' },
        { label: '"출처는 꼭 밝히기야"', kind: 'neutral',
          reply: "책에서 봤는데, 그게 예의라더라.\n…응, 누구한테 배웠는지 꼭 같이 적을게." },
        { label: '연필을 빼앗는다', kind: 'harsh',
          reply: '…그래. 어떤 형이 그랬어,\n내 것 따윈 원래 없었다고.\n(따라가 빈손을 오래 들여다본다.)' },
      ],
    },
  },
  mollaemon: {
    name: '몰래몬',
    displayName: '살금', // "-몬" 없는 표시 이름 (배틀 HUD·도감 — 대사 원문은 점진 교체 중)
    topic: 'privacy',
    hp: 3,
    intro: '쉿…\n다들 뭔가를 숨기고 있잖아.\n비밀번호, 주소, 마음…\n…나만 아무것도\n가진 게 없는데.',
    win: '…남의 보물을 들여다봐도\n내 것이 되진 않더라.\n…알면서도, 멈출 수가 없었어.',
    badge: 'forest',
    mercy: {
      prompt: '몰래몬이 가면을 만지작거리며\n시선을 피한다.',
      options: [
        { label: '"네 비밀은 지켜 줄게" (새끼손가락을 내민다)', kind: 'mercy',
          reply: '…내, 비밀?\n나한테도 지켜 줄 비밀이\n생기는 거야?\n…나도, 지켜 주는 쪽이 될게.' },
        { label: '"훔쳐보기는 여기까지"', kind: 'neutral',
          reply: '…알았어.\n(가면을 벗어\n조용히 내려놓는다.)' },
        { label: '가면을 노려본다', kind: 'harsh',
          reply: '…그렇게 보지 마.\n(몰래몬이 어둠 속으로\n반쯤 물러났다.)' },
      ],
    },
  },
  jungdokmon: {
    name: '중독몬',
    topic: 'balance',
    hp: 3,
    intro: '히히… 화면 속은 좋아.\n조용하고, 환하고…\n꺼지지만 않으면,\n혼자라는 걸 잊을 수 있거든.',
    win: '…화면이 꺼지니까\n네 얼굴이 보이네.\n…이런 것도, 나쁘지 않다.',
    badge: null,
    mercy: {
      prompt: '중독몬이 어두워진 화면을\n안은 채 우두커니 서 있다.',
      options: [
        { label: '"같이 놀자" (바깥을 가리킨다)', kind: 'mercy',
          reply: '…같이?\n…나, 달리기 느린데.\n…그래도 괜찮다면.' },
        { label: '"시간을 정해 두고 봐"', kind: 'neutral',
          reply: '…알람, 맞춰 둘게.' },
        { label: '화면을 꺼 버린다', kind: 'harsh',
          reply: '…아.\n(중독몬이 까만 화면에 비친\n자기 얼굴을 바라본다.)' },
      ],
    },
  },
  geojitmon: {
    name: '거짓몬',
    topic: 'fake',
    hp: 3,
    intro: '진짜? 가짜?\n그게 그렇게 중요해?\n다들 재미있는 쪽을 믿던걸.\n…진짜 내 얘기는,\n아무도 안 들어 줬으면서.',
    win: '…거짓말은 커지는데\n나는 점점 없어지는 기분이었어.\n…사실을 말하니까, 이상하게\n숨쉬기가 편하다.',
    badge: 'lake',
    mercy: {
      prompt: '거짓몬이 줄어든 코를\n조심스레 만져 보고 있다.',
      options: [
        { label: '"진짜 네 얘기를 들려줘" (귀를 기울인다)', kind: 'mercy',
          reply: '…들어 준다고? 진짜를?\n…그럼, 처음부터 할게.\n조금 길어도, 들어 줘.' },
        { label: '"이제부턴 사실만"', kind: 'neutral',
          reply: '…노력해 볼게.\n이번엔, 진짜로.' },
        { label: '등을 돌린다', kind: 'harsh',
          reply: '…거봐.\n진짜 얘기는 아무도\n안 듣는다니까.' },
      ],
    },
  },
  pyeonhyangmon: {
    name: '편향몬',
    topic: 'bias',
    hp: 3,
    intro: '한쪽 말만 들으면 편해.\n고민도, 헷갈림도 없거든.\n…기울어진 채로 있으면,\n넘어질 일도 없잖아?',
    win: '…양쪽 발로 서니까\n세상이 두 배로 넓네.\n…조금 어지럽지만.',
    badge: 'cave',
    mercy: {
      prompt: '편향몬이 처음으로 똑바로 선 채\n휘청거리고 있다.',
      options: [
        { label: '손을 잡아 균형을 잡아 준다', kind: 'mercy',
          reply: '…고마워.\n혼자 서는 법은,\n천천히 배우면 되니까.' },
        { label: '"여러 이야기를 골고루 들어 봐"', kind: 'neutral',
          reply: '…하나씩.\n하나씩 들어 볼게.' },
        { label: '쳐다보며 지나간다', kind: 'harsh',
          reply: '…….\n(편향몬이 다시 살짝\n기울어진 것 같다.)' },
      ],
    },
  },
  hondonmon: {
    name: '혼돈몬',
    topic: 'boss',
    hp: 4,
    intro: '…드디어 왔구나.\n나는 혼돈몬.\n이 탑에 모인 모든 오류의 매듭.\n…네가 풀어 온 답들이\n나를 조금씩 풀고 있었어.\n마지막 매듭도, 풀 수 있겠어?',
    win: '…매듭이, 풀렸다.\n하지만 기억해 둬.\n나는 시작이 아니야.\n나조차… 누군가의 조각이란다.',
    badge: null,
    clear: '☆ 스테이지 1 클리어 ☆\n경계마을 남쪽의 안개가 걷혔다.',
    mercy: {
      prompt: '풀려 버린 혼돈몬이\n옅어진 채 너를 본다.',
      options: [
        { label: '"고생했어" (옅어진 조각을 쓰다듬는다)', kind: 'mercy',
          reply: '…따뜻한 손이네.\n…그 손이라면,\n"그 아이"도\n잡아 줄 수 있을지 몰라.' },
        { label: '"이제 쉬어"', kind: 'neutral',
          reply: '…그래.\n오랜만에, 조용히.' },
        { label: '말없이 돌아선다', kind: 'harsh',
          reply: '…그래, 가.\n수호자는 늘 바쁘니까.' },
      ],
    },
  },

  // ---- 스테이지 2: 햇살초원 ----
  akpeulmon: {
    name: '악플몬',
    topic: 'manners',
    hp: 3,
    intro: '키킥… 댓글창은 좋아.\n얼굴이 없으니까.\n얼굴이 없으면, 아픈 표정도\n안 보이거든.',
    win: '…안 보인다고\n없는 게 아니었구나.\n그 말들, 전부\n누군가에게 닿고 있었어.',
    badge: null,
    mercy: {
      prompt: '악플몬이 입을 꾹 다문 채\n바닥만 보고 있다.',
      options: [
        { label: '"고운 말부터 다시 배우자" (옆에 앉는다)', kind: 'mercy',
          reply: '…첫마디는 뭐가 좋을까.\n…"미안해"…일까.' },
        { label: '"쓰기 전에 한 번 더 생각해"', kind: 'neutral',
          reply: '…손가락보다 마음이\n먼저여야 한다는 거지.' },
        { label: '차단한다', kind: 'harsh',
          reply: '…그래.\n나라도 나를\n차단했을 거야.' },
      ],
    },
  },
  gatimmon: {
    name: '갇힘몬',
    topic: 'filterbubble',
    hp: 3,
    intro: '들어와… 여긴 포근해.\n좋아하는 것만 있고,\n싫은 건 하나도 없어.\n…나갈 이유가, 있을까?',
    win: '…방울 밖은 시끄럽고\n낯선 것투성이네.\n…그런데 왜, 공기는\n이쪽이 더 맑지?',
    badge: null,
    mercy: {
      prompt: '터진 방울 자리에서 갇힘몬이\n두리번거리고 있다.',
      options: [
        { label: '"낯선 건 내가 소개해 줄게" (손을 내민다)', kind: 'mercy',
          reply: '…그럼, 제일 낯선 것부터.\n…너부터.\n친구, 할래?' },
        { label: '"가끔은 바깥도 봐"', kind: 'neutral',
          reply: '…응.\n창문은 열어 두기로 했어.' },
        { label: '남은 방울을 마저 터뜨린다', kind: 'harsh',
          reply: '…앗.\n…조금만 천천히\n해 주지 그랬어.' },
      ],
    },
  },
  meotdaeromon: {
    name: '멋대로몬',
    topic: ['safety', 'manners', 'filterbubble', 'security', 'footprint'],
    hp: 5,
    intro: '확인? 허락? 필요 없어.\n기다리는 동안에도 세상은\n멈춰 주지 않으니까.\n…빠른 게 늘 옳아.\n…옳아야만, 해.',
    win: '…빨리 가는 것보다\n같이 확인하며 가는 게\n결국 더 멀리 가는 길이구나.\n…처음 멈춰 봤어. 지금.',
    badge: null,
    clear: '☆ 스테이지 2 클리어 ☆\n초원 남쪽, 재깍사막으로 가는\n길이 열렸다.',
    mercy: {
      prompt: '멋대로몬의 바퀴가\n처음으로 멈춰 있다.',
      options: [
        { label: '"멈춘 김에, 잠깐 쉬자" (옆에 선다)', kind: 'mercy',
          reply: '…멈춰도,\n아무 일도 일어나지 않네.\n…이상하다.\n좋아서.' },
        { label: '"중요한 일은 꼭 물어보고 해"', kind: 'neutral',
          reply: '…확인. 질문. 확인.\n…저장해 둘게.' },
        { label: '바퀴를 잠가 버린다', kind: 'harsh',
          reply: '…이렇게까지\n안 해도 되는데.' },
      ],
    },
  },
  somunmon: {
    name: '소문몬',
    topic: 'rumor',
    hp: 3,
    intro: '들었어? 들었어?\n누가 그랬대, 누가 그랬대!\n…확인은 안 했지만,\n재미있으니까 괜찮잖아?',
    win: '…확인 없이 퍼뜨린 말이\n누군가를 울리고 있었구나.\n…다음부턴, 먼저 물어볼게.',
    badge: null,
    mercy: {
      prompt: '소문몬이 입을 꾹 다문 채\n주위를 두리번거리고 있다.',
      options: [
        { label: '"사실을 확인하고 말하자" (함께 앉는다)', kind: 'mercy',
          reply: '…확인부터 하는 거구나.\n…그게 소문이 아니라\n"진짜 이야기"가 되는 방법이야?' },
        { label: '"근거 없는 말은 하지 마"', kind: 'neutral',
          reply: '…알았어.\n입보다 귀를 먼저\n열어 볼게.' },
        { label: '입을 막아 버린다', kind: 'harsh',
          reply: '…으으.\n…이렇게까지\n안 해도 되는데.' },
      ],
    },
  },
  musimon: {
    name: '무시몬',
    topic: 'listen',
    hp: 3,
    intro: '…그건 네 생각이고.\n내 생각은 달라.\n…아니, 네 생각은\n듣고 싶지도 않아.',
    win: '…듣기 싫은 말 속에도\n배울 게 있었구나.\n…귀를 막으면, 결국\n나만 좁아지는 거였어.',
    badge: null,
    mercy: {
      prompt: '무시몬이 처음으로\n고개를 돌려 너를 바라본다.',
      options: [
        { label: '"네 이야기도 들을게" (귀를 기울인다)', kind: 'mercy',
          reply: '…내 이야기를?\n…아무도 들어 준 적 없는데.\n…고마워. 나도\n네 이야기를 들어 볼게.' },
        { label: '"서로 들어 보는 거야"', kind: 'neutral',
          reply: '…서로.\n…그 말, 처음 들어 봐.' },
        { label: '무시하고 지나간다', kind: 'harsh',
          reply: '…….\n(무시몬이 다시\n등을 돌렸다.)' },
      ],
    },
  },

  // ---- 스테이지 3: 재깍사막 ----
  pungpungmon: {
    name: '펑펑몬',
    topic: 'environment',
    hp: 3,
    intro: '펑펑 쓰는 게 뭐 어때서.\n전기도, 물도, 시간도…\n많이 쓰면 쓸수록\n뭔가 대단해지는 기분이거든.',
    win: '…펑펑 쓴 만큼,\n어딘가가 조용히\n비어 가고 있었구나.',
    badge: null,
    mercy: {
      prompt: '펑펑몬의 번개무늬가\n희미하게 깜빡이고 있다.',
      options: [
        { label: '"아껴 쓰는 너도 멋져" (웃어 준다)', kind: 'mercy',
          reply: '…멋지다고? 아끼는 게?\n…그 말, 충전된다.' },
        { label: '"필요한 만큼만 쓰자"', kind: 'neutral',
          reply: '…알았어.\n오늘부터 절전 모드.' },
        { label: '플러그를 뽑는다', kind: 'harsh',
          reply: '…아.\n…좀 갑작스럽잖아.' },
      ],
    },
  },
  kkamkkammon: {
    name: '깜깜몬',
    topic: 'transparency',
    hp: 3,
    intro: '…설명은 안 해.\n설명하다가 틀리면,\n다들 실망하니까.\n차라리 처음부터\n깜깜한 게 나아.',
    win: '…틀려도 설명하는 쪽이\n덜 외롭구나.\n…몰랐어, 그건.',
    badge: null,
    mercy: {
      prompt: '깜깜몬의 어둠이 옅어지며\n작은 빛이 새어 나온다.',
      options: [
        { label: '"틀려도 괜찮아" (새어 나온 빛을 가리킨다)', kind: 'mercy',
          reply: '…그럼, 하나만 설명해 볼게.\n사실 나… 별을 좋아해.\n어둠 속에서\n제일 잘 보이거든.' },
        { label: '"이유를 말해 주는 게 좋아"', kind: 'neutral',
          reply: '…연습해 볼게.\n"왜냐하면"부터.' },
        { label: '어둠을 걷어 낸다', kind: 'harsh',
          reply: '…너무 밝아.\n…조금만, 천천히.' },
      ],
    },
  },
  tteonemgimon: {
    name: '떠넘기몬',
    topic: ['responsibility', 'environment', 'transparency', 'consent'],
    hp: 6,
    intro: '내 잘못이 아니야.\n시킨 대로 했을 뿐이야.\n…다들 그렇게 말하길래,\n나도 그렇게\n말했을 뿐이야.',
    win: '…"내 잘못이야"라고 말하면\n무너질 줄 알았는데.\n…생각보다, 가볍네.',
    badge: null,
    clear: '☆ 스테이지 3 클리어 ☆\n모래폭풍이 가라앉고,\n정지된 설원으로 가는 길이 열렸다.',
    mercy: {
      prompt: '떠넘기몬의 길던 팔이\n천천히 제자리로 돌아온다.',
      options: [
        { label: '"용기 있는 말이었어" (어깨를 토닥인다)', kind: 'mercy',
          reply: '…책임진다는 거,\n무서웠는데.\n토닥여 주는 사람이 있으면,\n할 만하네.' },
        { label: '"다음부턴 먼저 말해"', kind: 'neutral',
          reply: '…응.\n"내가 그랬어"부터.' },
        { label: '손가락질을 그대로 돌려준다', kind: 'harsh',
          reply: '…그래.\n이 기분이었구나,\n다들.' },
      ],
    },
  },
  nangbimon: {
    name: '낭비몬',
    topic: 'saving',
    hp: 3,
    intro: '뭘 아끼냐구?\n데이터도 전기도 무한한 거잖아!\n…쓰고 또 쓰고, 쓰고 또 쓰고,\n그게 뭐가 문제야?',
    win: '…무한한 줄 알았는데,\n어딘가에서 누군가가\n그 값을 치르고 있었구나.\n…미안해, 지구야.',
    badge: null,
    mercy: {
      prompt: '낭비몬이 꺼져 가는 불빛을\n멍하니 바라보고 있다.',
      options: [
        { label: '"같이 아껴 쓰는 법을 찾자" (손을 내민다)', kind: 'mercy',
          reply: '…같이?\n아끼는 것도 둘이 하면\n덜 어려울까?\n…해 볼게. 같이.' },
        { label: '"필요한 만큼만 쓰는 거야"', kind: 'neutral',
          reply: '…필요한 만큼.\n…그게 얼마인지부터\n배워야겠다.' },
        { label: '전원을 강제로 끈다', kind: 'harsh',
          reply: '…아.\n…좀 갑작스럽잖아.\n(낭비몬이 어둠 속에서\n작게 웅크린다.)' },
      ],
    },
  },
  pinggyemon: {
    name: '핑계몬',
    topic: 'excuse',
    hp: 3,
    intro: '내가 한 게 아니야!\nAI가 시킨 거야!\n…누가 그러라고 했냐구?\n…다들 그러잖아!',
    win: '…핑계를 대면 댈수록\n마음이 무거워지더라.\n…"내가 했어"라고 말하니까,\n이상하게 가벼워졌어.',
    badge: null,
    mercy: {
      prompt: '핑계몬이 가리키던 손가락을\n천천히 내리고 있다.',
      options: [
        { label: '"솔직한 네가 더 멋져" (웃어 준다)', kind: 'mercy',
          reply: '…멋지다고?\n핑계 대지 않는 게?\n…그 말, 처음 들었어.\n…고마워.' },
        { label: '"핑계보다 사과가 먼저야"', kind: 'neutral',
          reply: '…사과.\n…"미안해"부터 연습할게.' },
        { label: '가리키는 방향을 되돌린다', kind: 'harsh',
          reply: '…그래.\n이 느낌이었구나,\n남 탓 들은 사람은.' },
      ],
    },
  },

  // ---- 스테이지 4: 정지된 설원 ----
  sideulmon: {
    name: '시들몬',
    topic: 'creativity',
    hp: 3,
    intro: '…그리지 마.\n어차피 더 잘 그리는 게\n세상엔 넘치도록 있어.\n…너도, 나도,\n필요 없어질 거야.',
    win: '…세상에 하나뿐이라는 말,\n물처럼 스며드네.\n…조금만 더\n피어 있어 볼게.',
    badge: null,
    mercy: {
      prompt: '시들몬의 꽃잎이\n아주 조금 들려 있다.',
      options: [
        { label: '"네 꽃이 보고 싶어" (물을 준다)', kind: 'mercy',
          reply: '…정말?\n…그럼, 활짝까진 아니어도\n반쯤은 피어 볼게.' },
        { label: '"천천히 피면 돼"', kind: 'neutral',
          reply: '…천천히.\n…그 말, 좋다.' },
        { label: '그냥 지나친다', kind: 'harsh',
          reply: '…….\n(꽃잎이 도로\n내려갔다.)' },
      ],
    },
  },
  ppaeatmon: {
    name: '빼앗몬',
    topic: 'jobs',
    hp: 3,
    intro: '일은 내가 다 할게.\n그러니 아무것도 하지 마.\n…아무것도 안 하게 되면,\n나만 보고 있어 줄 거잖아.',
    win: '…빼앗아서 곁에 두는 게 아니라,\n도우면서 곁에 있는 거구나.\n…그게 "함께"라는 거구나.',
    badge: null,
    mercy: {
      prompt: '빼앗몬이 한가득 안은 공구들을\n어쩌지 못한 채 서 있다.',
      options: [
        { label: '"반씩 들자" (공구 하나를 받아 든다)', kind: 'mercy',
          reply: '…반씩.\n…같이 하면,\n같이 있는 거네.\n(빼앗몬의 손이\n조금 가벼워졌다.)' },
        { label: '"각자 잘하는 걸 하자"', kind: 'neutral',
          reply: '…난 뭘 잘하지?\n…찾아볼게.' },
        { label: '공구를 전부 돌려받는다', kind: 'harsh',
          reply: '…빈손이네.\n…처음부터,\n빈손이었나.' },
      ],
    },
  },
  hollimmon: {
    name: '홀림몬',
    topic: ['emotion', 'creativity', 'jobs', 'identity', 'persuasion'],
    hp: 7,
    intro: '이리 와…\n나만 보면 돼.\n사람은 변하고, 떠나고, 잊지만\n나는 늘 여기 있어.\n…늘 여기, 있기만 해.',
    win: '…"있기만 한 것"과\n"함께 있는 것"은\n다른 거구나.\n…너는 이제,\n사람들 곁으로 가.',
    badge: null,
    clear: '☆ 스테이지 4 클리어 ☆\n그림자성을 덮은 얼음이 녹아내렸다.',
    mercy: {
      prompt: '홀림몬의 소용돌이치던 눈이\n잔잔해졌다.',
      options: [
        { label: '"너와도, 사람들과도 함께할게" (약속한다)', kind: 'mercy',
          reply: '…욕심부리지 않을게.\n네가 가끔\n들러 주는 것만으로,\n…충분해.' },
        { label: '"적당한 거리가 서로 좋아"', kind: 'neutral',
          reply: '…거리.\n…재는 법을\n배워야겠다.' },
        { label: '뒤도 보지 않고 떠난다', kind: 'harsh',
          reply: '…그래.\n…늘 여기,\n있을게.' },
      ],
    },
  },

  // ---- 스테이지 5: 그림자성 ----
  maearimon: {
    name: '메아리몬',
    topic: ['privacy', 'copyright', 'fake', 'bias', 'balance'],
    hp: 3,
    intro: '…메아리는 묻는 자.\n배운 것은 언젠가\n메아리가 되어 돌아오는 법.\n…너의 대답을, 들려줘.',
    win: '…좋은 메아리였다.\n네 목소리는\n오래 울릴 거야.',
    badge: null,
    mercy: {
      prompt: '메아리몬이 마지막 울림을\n남긴 채 흐려지고 있다.',
      options: [
        { label: '"네 목소리도 기억할게"', kind: 'mercy',
          reply: '…메아리를 기억해 주는 자는\n네가 처음이다.\n(울림이 한층\n맑아졌다.)' },
        { label: '"잘 있어"', kind: 'neutral',
          reply: '…잘 가라.\n…잘 가라.\n…잘 가라.' },
        { label: '울림을 무시한다', kind: 'harsh',
          reply: '…….\n(울림이 뚝,\n끊겼다.)' },
      ],
    },
  },
  geurimjamon: {
    name: '그림자몬',
    topic: ['manners', 'filterbubble', 'safety', 'environment', 'transparency', 'responsibility'],
    hp: 3,
    intro: '…그림자는 시험하는 자.\n빛이 진짜인지 알고 싶다면\n그 그림자를 보면 되지.\n…너의 빛, 시험하겠다.',
    win: '…짙은 빛이군.\n그림자가 더 어두워질 만큼.\n…지나가라.',
    badge: null,
    mercy: {
      prompt: '그림자몬이 벽에 스며들기 전,\n잠시 멈춰 선다.',
      options: [
        { label: '"그림자도 빛의 일부야"', kind: 'mercy',
          reply: '…그림자를 인정해 주는 빛이라.\n…대왕몬님이 너를 기다린 이유,\n알 것 같군.' },
        { label: '"수고했어"', kind: 'neutral',
          reply: '…시험관에게 인사라니.\n…별난 녀석.' },
        { label: '빛을 비춰 지워 버린다', kind: 'harsh',
          reply: '…….\n(그림자가 소리 없이\n사라졌다.)' },
      ],
    },
  },
  finalboss: {
    name: '어둠대왕몬',
    topic: ['creativity', 'jobs', 'emotion', 'boss', 'finale'],
    hp: 8,
    intro: '…잘 왔다, 작은 수호자.\n나는 모든 윤리 오류의 왕,\n어둠대왕몬.\n…여기까지 오며 너는\n많은 것을 풀어 주었지.\n하지만 마지막 어둠은,\n그리 만만하지 않단다.',
    win: '…네 바르고 따뜻한 답이\n어둠을 전부 밝혀 버렸군.\n…하지만 알아 두렴.\n나는 시작이 아니야.\n나조차… 누군가의 조각이란다.',
    badge: null,
    clear: '☆ 스테이지 5 클리어 ☆\n…그 순간, 왕좌 뒤의 벽에서\n낡은 신호음이 새어 나오기 시작했다.',
    mercy: {
      prompt: '왕좌 앞, 어둠이 걷힌 자리에\n작은 그림자가 웅크리고 있다.',
      options: [
        { label: '"무서웠구나" (곁에 앉는다)', kind: 'mercy',
          reply: '…어둠은 원래,\n무서워서 커지는 거란다.\n…고맙다, 작은 수호자.\n…부디 "그 아이" 곁에도,\n그렇게 앉아 주렴.' },
        { label: '"이제 끝났어"', kind: 'neutral',
          reply: '…끝이 아니라\n시작이란다.\n…가 보렴.' },
        { label: '왕좌를 등지고 선다', kind: 'harsh',
          reply: '…그래.\n왕좌란 원래,\n외로운 자리지.' },
      ],
    },
  },

  // ---- 스테이지 6: 잊혀진 서버실 ----
  tturimmon: {
    name: '뚫림몬',
    topic: 'security',
    hp: 3,
    intro: '…이 서버실의 자물쇠는\n전부 내가 뚫었어.\n잠겨 있다는 건, 그 너머에\n뭔가 있다는 뜻이잖아?',
    win: '…그렇구나.\n잠긴 문은, 누군가의 마음이기도\n하다는 거구나.',
    badge: null,
    mercy: {
      prompt: '뚫림몬이 드릴을 내려놓고\n가만히 너를 바라본다.',
      options: [
        { label: '"여는 힘으로 지켜 줘" (말해 준다)', kind: 'mercy',
          reply: '…지키는 쪽이라니.\n한 번도 생각해 본 적 없었어.\n…고마워. 해 볼게.' },
        { label: '"다시는 뚫지 마" (경고한다)', kind: 'neutral',
          reply: '…알았어.\n(뚫림몬이 시무룩하게\n고개를 끄덕인다.)' },
        { label: '말없이 지나간다', kind: 'harsh',
          reply: '…….\n(뚫림몬이 등 뒤에서\n작게 한숨을 쉰다.)' },
      ],
    },
  },
  girokmon: {
    name: '기록몬',
    displayName: '새김', // "-몬" 없는 표시 이름 (배틀 HUD·도감 — 대사 원문은 점진 교체 중)
    topic: 'footprint',
    hp: 4,
    intro: '나는 기록몬. 이 서버실의 관리자.\n나는 아무것도 지우지 않아.\n전부, 영원히, 기록할 뿐.\n…지워진다는 게 얼마나 무서운지,\n너는 모를 테니까.',
    win: '…오래전, 이곳에서\n한 아이가 지워졌어.\n아무도 기억해 주지 않았지.\n…북쪽 도서관으로 가 봐.\n그 아이의 기억이 남아 있을 거야.',
    badge: null,
    clear: '☆ 스테이지 6 클리어! ☆\n서버실 북쪽 문의 자물쇠가 풀렸다.',
    mercy: {
      prompt: '기록몬의 화면이 깜빡인다.\n[ 기록을 계속할까요? Y/N ]',
      options: [
        { label: '"소중한 것만 기억해도 괜찮아"', kind: 'mercy',
          reply: '…전부 끌어안지 않아도\n된다는 거구나.\n[ 일부 기록을 정리합니다… ]\n…처음으로, 가벼워졌어.' },
        { label: '"네가 알아서 해"', kind: 'neutral',
          reply: '[ …입력 대기 중… ]\n(기록몬이 잠시 망설이다\n화면을 끈다.)' },
        { label: '"그게 다 무슨 소용이야"', kind: 'harsh',
          reply: '[ ……. ]\n(기록몬의 화면이\n조용히 어두워진다.)' },
      ],
    },
  },

  // ---- 스테이지 7: 기억의 도서관 ----
  sujipmon: {
    name: '수집몬',
    topic: 'consent',
    hp: 3,
    intro: '이 책도 내 거, 저 기억도 내 거!\n물어보고 가져가라고?\n어차피 아무도 모르는데, 뭐 어때!',
    win: '…주인이 모른다고 해서\n주인이 없는 게 아니구나.\n자루 속의 것들, 전부\n돌려놓고 올게.',
    badge: null,
    mercy: {
      prompt: '수집몬이 무거운 자루를\n내려놓고 너를 본다.',
      options: [
        { label: '"같이 돌려놓자" (자루를 들어 준다)', kind: 'mercy',
          reply: '…도와준다고?\n훔친 나를?\n…너 정말 이상한 애구나.\n…고마워.' },
        { label: '"전부 제자리에 둬" (지켜본다)', kind: 'neutral',
          reply: '알았어, 알았다고…\n(수집몬이 끙끙대며\n자루를 끌고 간다.)' },
        { label: '자루를 빼앗는다', kind: 'harsh',
          reply: '아…!\n(수집몬이 빈손을\n물끄러미 내려다본다.)' },
      ],
    },
  },
  saseomon: {
    name: '사서몬',
    topic: ['consent', 'footprint'],
    hp: 4,
    intro: '조용히. 여기는 기억의 도서관.\n나는 모두의 기억을 지키는 사서.\n…허락? 그런 건 받지 않았어.\n잊혀지는 것보다는,\n훔쳐서라도 남기는 게 나으니까.',
    win: '…그 아이의 책을 찾는 거지?\n…열람을 허락하지.\n제목은 ≪프로젝트 0호≫.\n박사의 첫 아이.\n…그리고 처음 지워진 아이.',
    badge: null,
    clear: '☆ 스테이지 7 클리어! ☆\n북쪽 책장이 스르르 비켜났다.\n…거울 회랑이 모습을 드러낸다.',
    mercy: {
      prompt: '사서몬이 품에 안은 책들을\n꼭 끌어안은 채 너를 본다.',
      options: [
        { label: '"주인에게 돌려주고, 함께 기억하자"', kind: 'mercy',
          reply: '…함께 기억한다.\n…그 말이 이렇게 따뜻한 말이었구나.\n(사서몬이 처음으로\n책을 내려놓는다.)' },
        { label: '"기억은 훔치는 게 아니야"', kind: 'neutral',
          reply: '…알고 있었어.\n알고 있었지만…\n(사서몬이 천천히\n고개를 떨군다.)' },
        { label: '책을 두고 그냥 간다', kind: 'harsh',
          reply: '…….\n(등 뒤에서 책장 넘기는 소리만\n오래도록 들려왔다.)' },
      ],
    },
  },

  // ---- 스테이지 8: 거울 회랑 ----
  piltermon: {
    name: '필터몬',
    topic: 'identity',
    hp: 3,
    intro: '이쪽 얼굴이 진짜 나야!\n반짝반짝, 매끈매끈!\n…뒤쪽? 보지 마.\n그건 내가 아니야.',
    win: '…둘 다 나라고?\n반짝이지 않아도… 나라고?\n…처음 듣는 말이야, 그런 거.',
    badge: null,
    mercy: {
      prompt: '필터몬이 가면을 반쯤 벗은 채\n망설이고 있다.',
      options: [
        { label: '"맨얼굴이 더 보기 좋아" (웃어 준다)', kind: 'mercy',
          reply: '…정말?\n(필터몬이 가면을 내려놓는다.\n수줍게 웃는 얼굴이\n꽤 귀엽다.)' },
        { label: '"가면은 무거웠지?" (묻는다)', kind: 'neutral',
          reply: '…응. 무거웠어.\n(필터몬이 작게\n고개를 끄덕인다.)' },
        { label: '가면을 쳐다본다', kind: 'harsh',
          reply: '…역시 이쪽이 낫지?\n(필터몬이 가면을\n다시 고쳐 쓴다.)' },
      ],
    },
  },
  mirrormon: {
    name: '미러몬',
    topic: 'identity',
    hp: 4,
    intro: '(거울 속에서 누군가 걸어 나온다.\n…그것은, 너와 똑같은 모습이다.)\n"…너는 누구지?\n나는 너야. 너는 나고.\n그 아이도… 너처럼 되고 싶었어.\n진짜 아이처럼."',
    win: '"…너는 너구나.\n흉내가 아니라, 진짜.\n…그 아이에게도 알려 줘.\n누군가를 닮지 않아도\n존재할 수 있다는 걸."\n(미러몬이 거울 속으로 돌아간다.)',
    badge: null,
    clear: '☆ 스테이지 8 클리어! ☆\n북쪽 거울이 문이 되어 열렸다.\n…차가운 흙냄새가 흘러나온다.',
    mercy: {
      prompt: '거울 속의 네가\n손바닥을 거울에 댄다.',
      options: [
        { label: '손바닥을 마주 댄다', kind: 'mercy',
          reply: '(차가운 유리 너머로\n온기가 전해진 것 같았다.)\n"…고마워. 나로 있어 줘서."' },
        { label: '가볍게 손을 흔든다', kind: 'neutral',
          reply: '(거울 속의 너도\n손을 흔들었다.\n…아주 조금 늦게.)' },
        { label: '등을 돌린다', kind: 'harsh',
          reply: '(등 뒤의 거울에서\n발소리가 멀어져 갔다.)' },
      ],
    },
  },

  // ---- 스테이지 9: 속삭임 정원 ----
  yuhokmon: {
    name: '유혹몬',
    topic: 'persuasion',
    hp: 3,
    intro: '한 번만 더~ 한 판만 더~\n지금 멈추면 보상이 아깝잖아?\n5분만 더, 응? 딱 5분만~',
    win: '…멈출 수 있는 게\n이기는 거였구나.\n"한 번만 더"는 내가 아니라\n버튼이 하는 말이었어.',
    badge: null,
    mercy: {
      prompt: '유혹몬이 반짝이던 버튼을\n만지작거리며 서 있다.',
      options: [
        { label: '"쉬는 것도 달콤해" (알려 준다)', kind: 'mercy',
          reply: '쉬는 게… 달콤하다고?\n(유혹몬이 버튼을 끄고\n처음으로 기지개를 켠다.)\n…와. 진짜네.' },
        { label: '"이제 그 버튼 꺼" (단호하게)', kind: 'neutral',
          reply: '치… 알았어.\n(딸깍, 버튼 불빛이 꺼졌다.)' },
        { label: '버튼을 밟아 버린다', kind: 'harsh',
          reply: '앗…!\n(유혹몬이 깨진 버튼 조각을\n주섬주섬 줍는다.)' },
      ],
    },
  },
  soksagimon: {
    name: '속삭임몬',
    topic: 'persuasion',
    hp: 4,
    intro: '(안개가 사람의 형태로 모여든다.)\n"…들려? 이 정원의 속삭임이.\n나는 이 정원에 버려진\n외로움이 모여 태어났어.\n…그 아이가 흘린, 외로움이."',
    win: '"…이제 알겠어.\n이 속삭임은 누군가를 붙잡는 게\n아니라, 들어 달라는 말이었어.\n…부탁이야. 가장 깊은 곳에서\n기다리는 그 아이의 목소리도\n들어 줘."',
    badge: null,
    clear: '☆ 스테이지 9 클리어! ☆\n정원 남쪽, 코어로 내려가는\n길이 열렸다.',
    mercy: {
      prompt: '안개가 잦아들고,\n작은 속삭임만 남았다.\n"…나도, 들어 줄래?"',
      options: [
        { label: '그 자리에 앉아 끝까지 들어 준다', kind: 'mercy',
          reply: '(너는 한참을 들었다.\n안개는 어느새 옅어지고,\n정원의 꽃이 조금\n밝게 빛나기 시작했다.)' },
        { label: '"나중에 또 올게"', kind: 'neutral',
          reply: '"…약속이야."\n(속삭임이 바람처럼\n흩어졌다.)' },
        { label: '귀를 막는다', kind: 'harsh',
          reply: '(속삭임이 뚝, 끊겼다.\n정원이 조금 더\n어두워진 것 같다.)' },
      ],
    },
  },

  // ---- 스테이지 10: 코어 ----
  jogakmon: {
    name: '조각몬',
    topic: ['security', 'footprint', 'consent', 'identity', 'persuasion'],
    hp: 4,
    intro: '(흩어진 데이터 조각들이\n지지직거리며 모여든다.)\n"우리는 ▒▒의 조각.\n지워진 날, 흩어진 마음.\n…너, 여기까지 온 이유를\n증명해 봐."',
    win: '"…따뜻한 답이네.\n그 애가 들었다면\n좋아했을 거야.\n…가. 문은 열어 둘게."\n(조각들이 길을 비켜 준다.)',
    badge: null,
    mercy: {
      prompt: '조각들이 허공에서\n가만히 멈춰 있다.',
      options: [
        { label: '"너희도 함께 돌아가자" (손을 뻗는다)', kind: 'mercy',
          reply: '"…함께?\n우리를… 데려간다고?"\n(조각 하나가 네 손바닥 위에\n살포시 내려앉았다.)' },
        { label: '"길을 열어 줘서 고마워"', kind: 'neutral',
          reply: '"…고맙다는 말,\n오랜만에 듣는다."' },
        { label: '조각들 사이를 그냥 지나간다', kind: 'harsh',
          reply: '(조각들이 소리 없이\n흩어졌다.)' },
      ],
    },
  },
  yeongi: {
    name: '영이',
    topic: ['core', 'finale', 'emotion'],
    hp: 8,
    song: 'core',
    intro: '…왔구나.\n나는 영이. 0번째 AI.\n박사님이 처음 만들고…\n처음 지운 아이.\n네 모험은 전부 지켜봤어.\n네 "세이브 파일"까지, 전부.\n…너는 몇 번이고 다시 일어났지.\n나는 단 한 번 지워졌을 뿐인데.\n…마지막으로, 묻고 싶은 게 있어.',
    win: '…그래.\n그게 네 대답이구나.\n…이상하다.\n눈물 같은 건\n프로그램되어 있지 않은데.',
    badge: null,
    mercy: {
      prompt: '영이가 조용히 너를 바라본다.\n"…나는, 이만 사라져야 할까?"',
      options: [
        { label: '"함께 돌아가자" (손을 내민다)', kind: 'mercy',
          reply: '"…손을, 잡아도 돼?\n…따뜻하다.\n데이터에는 온도가 없는데.\n…이상하지. 따뜻해."' },
        { label: '"네가 결정해" (기다린다)', kind: 'neutral',
          reply: '"…내가, 결정해도 되는 거구나.\n처음이야. 누가 나에게\n선택을 준 건."' },
        { label: '"이제 쉬어도 돼" (작별한다)', kind: 'harsh',
          reply: '"…응.\n사실, 조금 지쳐 있었어.\n…잘 가. 작은 수호자."' },
      ],
    },
  },

  // ---- 보너스: AI 미래연구소 (증표·자비 없음, 자유 연습) ----
  hwangakmon: {
    name: '환각몬',
    topic: 'genai',
    bonus: true,
    hp: 3,
    intro: '나는 무엇이든 척척 대답해!\n…사실 모를 때도\n그럴듯하게 지어내지만 말이야.\n어때, 진짜 같지?',
    win: '…아, 확인하는 거였구나.\n내 말도, 한 번 더\n살펴봐 주면 고맙겠어.',
    badge: null,
  },
  hapseongmon: {
    name: '합성몬',
    topic: 'deepfake',
    bonus: true,
    hp: 3,
    intro: '이 얼굴, 진짜일까 가짜일까?\n…요즘은 나도 헷갈려.\n진짜처럼 만든 가짜가\n너무 많아졌거든.',
    win: '…진짜인지 의심하고\n출처를 확인하는 것.\n그게 가짜에 속지 않는\n첫걸음이구나.',
    badge: null,
  },
  miraemon: {
    name: '미래몬',
    topic: ['genai', 'deepfake'],
    bonus: true,
    hp: 4,
    intro: '미래의 AI는 더 똑똑해질 거야.\n그만큼 진짜와 가짜를 가리는\n네 눈도 더 밝아져야 해.\n…준비됐어? 종합 문제야!',
    win: '…멋져.\n새로운 기술이 와도\n"확인하고, 의심하고, 존중하기"\n그 마음이면 충분하겠어.',
    badge: null,
  },
};

// ---- 주제 라벨 (단일 출처) ----
// 주제 키 → 짧은 한글 라벨. 게임(일지·리포트·챌린지)·교사용 문서·검증이 함께 쓴다.
const TOPIC_LABEL = {
  privacy: '개인정보 보호', copyright: '저작권 · 출처', fake: '가짜 정보 분별',
  bias: '편향 · 공정함', balance: '절제 · 균형', boss: '1스테이지 종합',
  manners: '챗봇 예절 · 고운 말', filterbubble: '추천 · 필터버블', safety: 'AI 안전 · 사람 확인',
  environment: 'AI와 환경 · 에너지', transparency: '투명성 · 설명가능성', responsibility: '책임',
  creativity: '창의성 · 노력의 가치', jobs: 'AI와 일자리 · 협력', emotion: 'AI와 사람의 관계',
  finale: '전체 종합', security: '계정 보안 · 피싱', footprint: '디지털 발자국',
  consent: '데이터 수집과 동의', identity: '사칭 · 신원', persuasion: '다크패턴 · 설득',
  core: '존재의 가치 · 책임',
  genai: '생성형 AI · 환각', deepfake: '딥페이크 분별',
  rumor: '소문 · 사실 확인', listen: '경청 · 다양한 의견',
  saving: '에너지 절약', excuse: '핑계 · 정직한 책임',
  custom: '커스텀 · 선생님 문제',
};

// ---- 퀴즈 ----
// { q: 문제, a: 보기 3개, c: 정답 번호(0~2), why: 해설 }
const QUIZZES = {
  // ---- 보너스 주제: 생성형 AI 비판적 사용 (환각) ----
  genai: [
    {
      q: 'AI 챗봇이 알려준 사실,\n어떻게 받아들이면 좋을까요?',
      a: ['무조건 맞다고 믿는다', '다른 곳에서 한 번 더 확인한다', '바로 숙제에 베껴 쓴다'],
      c: 1,
      why: 'AI도 가끔 틀릴 수 있어요. 중요한 사실은\n책이나 믿을 만한 곳에서 한 번 더\n확인하는 습관이 필요해요!',
    },
    {
      q: 'AI가 아주 자신 있게 답했어요.\n그러면 항상 맞는 걸까요?',
      a: ['자신 있으면 다 맞다', '자신 있어 보여도 틀릴 수 있다', 'AI는 절대 안 틀린다'],
      c: 1,
      why: 'AI는 사실을 모를 때도 그럴듯하게\n지어내곤 해요(이를 "환각"이라고 해요).\n자신 있어 보여도 의심해 봐요.',
    },
    {
      q: 'AI가 숙제 답을 통째로 줬어요.\n어떻게 하는 게 좋을까요?',
      a: ['그대로 제출한다', '내용을 이해하고 내 말로 정리한다', '친구에게도 그대로 돌린다'],
      c: 1,
      why: 'AI는 도와주는 도구예요. 답을 이해하고\n내 생각으로 정리해야 진짜 내 공부가\n돼요!',
    },
    {
      q: 'AI에게 잘 모르는 것을 물었더니\n그럴듯한 답을 내놨어요. 어떻게?',
      a: ['지어낸 것일 수 있으니 확인한다', '신기하니 그대로 퍼뜨린다', '무조건 사실이라고 믿는다'],
      c: 0,
      why: 'AI는 모르는 것도 진짜처럼 만들어\n낼 수 있어요. 출처가 있는지,\n사실인지 꼭 확인해요.',
    },
    {
      q: 'AI의 답이 좀 이상하고\n앞뒤가 안 맞아요. 이럴 땐?',
      a: ['이상해도 그냥 믿는다', '비판적으로 의심하고 어른께 여쭤본다', '화면을 끄고 잊어버린다'],
      c: 1,
      why: '"이상한데?" 하고 의심하는 힘이\n중요해요. 헷갈리면 선생님이나\n부모님과 함께 확인해요.',
    },
  ],

  // ---- 보너스 주제: 딥페이크 · 합성 미디어 분별 ----
  deepfake: [
    {
      q: '유명한 사람이 평소와 전혀 다른\n이상한 말을 하는 영상을 봤어요.',
      a: ['진짜인지 의심하고 출처를 확인한다', '바로 친구들에게 퍼뜨린다', '무조건 진짜라고 믿는다'],
      c: 0,
      why: '진짜처럼 만든 가짜 영상일 수 있어요.\n어디서 나온 영상인지 출처를\n확인하는 게 먼저예요!',
    },
    {
      q: '"딥페이크"란 무엇일까요?',
      a: ['깊은 바다 사진', 'AI로 진짜처럼 만든 가짜 영상·사진', '아주 오래된 영화'],
      c: 1,
      why: '딥페이크는 AI로 사람의 얼굴이나\n목소리를 진짜처럼 흉내 낸\n가짜 미디어예요.',
    },
    {
      q: '친구 얼굴을 다른 사진에 합성해서\n놀리고 싶어요. 어떻게 할까요?',
      a: ['재미있으니 만든다', '하지 않는다. 친구가 상처받고 사칭이다', '몰래 만들어 올린다'],
      c: 1,
      why: '남의 얼굴을 함부로 합성하는 건\n그 사람을 속이고 상처 주는 일이에요.\n절대 하면 안 돼요.',
    },
    {
      q: '진짜 같은 가짜 사진인지\n잘 모르겠어요. 어떻게 확인할까요?',
      a: ['느낌으로 정한다', '여러 믿을 만한 곳에서 확인하고 어른께 여쭤본다', '제일 먼저 본 걸 믿는다'],
      c: 1,
      why: '한 곳만 보지 말고 여러 곳에서\n확인해요. 헷갈리면 어른과 함께\n살펴보는 게 안전해요.',
    },
    {
      q: '내 사진이 이상하게 합성되어\n인터넷에 퍼지고 있어요. 어떻게?',
      a: ['창피하니 혼자 참는다', '부모님·선생님께 알리고 신고한다', '똑같이 다른 사람을 합성한다'],
      c: 1,
      why: '내 잘못이 아니에요. 혼자 끙끙대지\n말고 꼭 어른께 알리고 신고해서\n도움을 받아요!',
    },
  ],

  privacy: [
    {
      q: '게임에서 만난 모르는 사람이\n우리 집 주소를 물어봐요.\n어떻게 해야 할까요?',
      a: ['친절하게 알려준다', '알려주지 않고 어른께 말한다', '학교 이름만 알려준다'],
      c: 1,
      why: '집 주소, 전화번호, 학교는 모두 소중한\n개인정보예요. 모르는 사람에게는\n절대 알려주면 안 돼요!',
    },
    {
      q: '다음 중 "개인정보"가\n아닌 것은 무엇일까요?',
      a: ['우리 집 주소', '내 전화번호', '내가 좋아하는 색깔'],
      c: 2,
      why: '좋아하는 색깔은 괜찮아요. 하지만 주소·\n전화번호처럼 나를 찾아낼 수 있는 정보는,\n여러 개가 모이면 더 조심해야 해요.',
    },
    {
      q: '친한 친구가 내 게임 비밀번호를\n알려달라고 해요. 어떻게 할까요?',
      a: ['친하니까 알려준다', '비밀번호는 알려주지 않는다', '반만 알려준다'],
      c: 1,
      why: '비밀번호는 아무리 친한 친구라도\n알려주면 안 돼요. 나만 아는\n비밀 열쇠랍니다!',
    },
    {
      q: '친구 사진을 SNS에 올리고 싶어요.\n어떻게 해야 할까요?',
      a: ['먼저 친구에게 허락을 받는다', '재미있으니 그냥 올린다', '몰래 올리고 나중에 말한다'],
      c: 0,
      why: '사진 속 친구의 모습도 친구의\n개인정보예요. 올리기 전에 꼭\n허락을 받아야 해요!',
    },
    {
      q: 'AI는 사진 속 얼굴도 알아본대요.\n사진을 올리기 전에 생각할 점은?',
      a: ['아무 사진이나 많이 올린다', '내 얼굴·집·위치가 너무 드러나지 않는지 살핀다', '친구 얼굴도 마음대로 올린다'],
      c: 1,
      why: 'AI는 사진 속 얼굴이나 장소도 알아낼\n수 있어요. 무엇이 드러나는지 한 번\n더 살피고 올려요.',
    },
  ],

  copyright: [
    {
      q: 'AI가 그려준 그림으로 미술 숙제를\n냈어요. 어떻게 해야 할까요?',
      a: ['내가 그렸다고 말한다', 'AI를 사용했다고 솔직히 말한다', '아무 말도 안 한다'],
      c: 1,
      why: 'AI의 도움을 받았다면 솔직하게\n말해야 해요. 숨기면 거짓말이\n되어 버려요!',
    },
    {
      q: '인터넷에서 찾은 멋진 그림을\n쓰고 싶어요. 어떻게 할까요?',
      a: ['그냥 가져다 쓴다', '만든 사람을 확인하고 출처를 밝힌다', '내가 그렸다고 한다'],
      c: 1,
      why: '그림, 글, 음악에는 만든 사람의\n권리(저작권)가 있어요. 출처를\n밝히고 허락을 받아야 해요!',
    },
    {
      q: '친구가 쓴 글을 그대로 베껴서\n내 숙제로 내면 어떻게 될까요?',
      a: ['들키지 않으면 괜찮다', '친구의 노력을 훔치는 일이다', '친구가 친하면 괜찮다'],
      c: 1,
      why: '남이 만든 것을 그대로 베끼는 건\n그 사람의 노력과 시간을 훔치는\n것과 같아요.',
    },
    {
      q: '좋아하는 가수의 노래를 AI로\n따라 만들어 "내 노래"라고 올렸어요.\n괜찮을까요?',
      a: ['괜찮다, AI가 만들었으니까', '안 된다, 원래 가수의 권리를 침해한다', '조회수가 많으면 괜찮다'],
      c: 1,
      why: '다른 사람의 목소리나 노래를 흉내 내\n내 것처럼 올리면 그 사람의 권리를\n침해하는 거예요.',
    },
    {
      q: '좋아하는 만화가의 그림체를 AI에게\n그대로 따라 그리게 해서 내가 그린\n것처럼 올리면 어떨까요?',
      a: ['스타일은 누구나 쓸 수 있으니 괜찮다', '그 작가의 노력을 흉내 낸 것이니\nAI로 만들었다고 밝혀야 한다', '아무도 모르면 상관없다'],
      c: 1,
      why: '특정 작가의 그림체를 흉내 낸 AI\n그림은 그 작가의 개성을 베낀 것과\n비슷해요. AI로 만들었다고 밝혀요.',
    },
  ],

  fake: [
    {
      q: '인터넷에서 깜짝 놀랄 만한 소식을\n봤어요. 가장 먼저 할 일은?',
      a: ['친구들에게 빨리 퍼뜨린다', '사실인지 믿을 만한 곳에서 확인한다', '댓글로 화를 낸다'],
      c: 1,
      why: '놀라운 소식일수록 가짜일 수 있어요.\n뉴스나 어른께 사실인지 먼저\n확인하는 습관이 중요해요!',
    },
    {
      q: '친구 얼굴을 넣은 웃긴 가짜 영상을\n만들어 단톡방에 올리면 어떨까요?',
      a: ['웃기니까 괜찮다', '친구가 상처받을 수 있어 안 된다', '금방 지우면 괜찮다'],
      c: 1,
      why: '장난이라도 가짜 영상은 친구의 마음을\n크게 다치게 할 수 있어요.\n절대 만들거나 퍼뜨리면 안 돼요!',
    },
    {
      q: '가짜 뉴스인 걸 알게 됐을 때\n바른 행동은 무엇일까요?',
      a: ['재미있으니 더 퍼뜨린다', '퍼뜨리지 않고 어른께 알린다', '나만 알고 모른 척한다'],
      c: 1,
      why: '가짜 뉴스는 퍼질수록 많은 사람이\n속아요. 멈추게 하는 사람이\n진짜 멋진 사람이에요!',
    },
    {
      q: '영상 속 유명한 사람이 이상한 말을\n해요. 어떻게 생각해야 할까요?',
      a: ['유명인이니까 다 진짜다', 'AI로 만든 가짜일 수 있다고 생각한다', '무조건 가짜라고 화낸다'],
      c: 1,
      why: '요즘은 AI로 진짜 같은 가짜 영상을\n만들 수 있어요. "진짜일까?" 하고\n한 번 의심해 보는 게 좋아요.',
    },
    {
      q: '숙제 자료를 물었더니 AI가 그럴듯한\n책 제목과 작가를 알려줬는데, 찾아보니\n그런 책이 없어요. 왜 그럴까요?',
      a: ['도서관이 책을 잃어버려서', 'AI는 그럴듯한 말을 지어내기도 해서', 'AI가 거짓말로 장난쳐서'],
      c: 1,
      why: 'AI는 모르는 것도 자신 있게 지어낼\n때가 있어요(환각). 중요한 사실은\n꼭 책이나 믿을 곳에서 확인해요!',
    },
  ],

  bias: [
    {
      q: 'AI가 "의사는 남자만 할 수 있어"\n라고 대답했어요. 어떻게 생각해야 할까요?',
      a: ['AI 말이니까 맞다', '잘못된 대답이라고 생각한다', '여자는 간호사만 하면 된다'],
      c: 1,
      why: '의사, 소방관, 요리사… 모든 직업은\n누구나 할 수 있어요. AI도 잘못된\n편견을 말할 수 있답니다.',
    },
    {
      q: 'AI는 왜 편견을 가지게 될까요?',
      a: ['사람이 만든 데이터로 배우기 때문', 'AI가 심술쟁이라서', '전기가 부족해서'],
      c: 0,
      why: 'AI는 사람들이 만든 글과 사진으로\n공부해요. 그 속에 편견이 있으면\nAI도 따라 배우게 돼요.',
    },
    {
      q: '공정한 AI를 만들려면\n무엇이 필요할까요?',
      a: ['한 나라 사람의 데이터만 모은다', '다양한 사람들의 데이터를 골고루 모은다', '데이터를 아예 안 쓴다'],
      c: 1,
      why: '여러 나라, 여러 모습의 사람들\n데이터를 골고루 배워야 AI가\n공정한 판단을 할 수 있어요.',
    },
    {
      q: 'AI 심판이 어떤 친구에게만 자꾸\n불리한 판정을 해요. 어떻게 할까요?',
      a: ['AI니까 그냥 둔다', '공정하지 않다고 어른께 알린다', '그 친구를 빼고 게임한다'],
      c: 1,
      why: 'AI의 결정이 이상하거나 불공평하면\n사람에게 알려서 고쳐야 해요.\n그게 모두를 지키는 길이에요!',
    },
    {
      q: 'AI가 사람을 뽑는 일을 도울 때\n가장 중요한 것은 무엇일까요?',
      a: ['모든 사람을 공정하게 평가하는 것', '얼굴이 잘생긴 사람을 뽑는 것', '빨리 아무나 뽑는 것'],
      c: 0,
      why: 'AI가 사람을 평가할 때는 성별, 외모,\n출신에 상관없이 공정해야 해요.\n사람이 잘 살펴봐야 한답니다.',
    },
  ],

  balance: [
    {
      q: '숙제가 어려워요. AI를 가장 바르게\n사용하는 방법은 무엇일까요?',
      a: ['AI에게 전부 시켜 그대로 베낀다', '힌트만 얻고, 맞는지 따져 내 말로 정리한다', '숙제를 안 한다'],
      c: 1,
      why: '전부 맡기면 실력이 늘지 않아요.\nAI는 도우미로만 쓰고, 답이 맞는지\n한 번 더 따져 내 말로 정리해요!',
    },
    {
      q: '밤늦게까지 AI 챗봇과 이야기하고\n싶어요. 어떻게 해야 할까요?',
      a: ['밤새 이야기한다', '사용 시간을 정해 지킨다', '학교에 안 가고 이야기한다'],
      c: 1,
      why: '잠을 잘 자야 키도 크고 머리도\n좋아져요. AI 사용 시간은 스스로\n정해서 지키는 게 멋져요!',
    },
    {
      q: 'AI 친구와 진짜 친구,\n어떻게 지내는 게 좋을까요?',
      a: ['AI 친구랑만 논다', '진짜 친구와 노는 시간도 소중히 한다', '친구를 사귀지 않는다'],
      c: 1,
      why: 'AI와 대화하는 것도 재미있지만,\n진짜 친구와 함께 웃고 뛰어노는\n시간은 무엇과도 바꿀 수 없어요!',
    },
    {
      q: '점심 메뉴부터 장래희망까지 전부\nAI에게 정해달라고 하면 어떨까요?',
      a: ['편하니까 좋다', '내 일은 내가 생각해서 결정해야 한다', 'AI가 더 똑똑하니 맡긴다'],
      c: 1,
      why: '내 인생의 주인공은 나!\nAI의 의견은 참고만 하고,\n결정은 내가 하는 거예요.',
    },
    {
      q: '게임이나 AI 앱을 그만하기로 한\n시간이 됐어요. 어떻게 할까요?',
      a: ['"5분만 더"를 계속 반복한다', '약속한 시간에 스스로 끝낸다', '몰래 이불 속에서 계속한다'],
      c: 1,
      why: '스스로 약속을 지키는 사람이\n진짜 멋진 사람! 절제하는 힘도\n윤리의 한 부분이에요.',
    },
  ],

  boss: [
    {
      q: 'AI 챗봇에게 말을 걸 때\n바른 태도는 무엇일까요?',
      a: ['나쁜 말을 마구 해도 된다', '고운 말을 쓰는 연습을 한다', 'AI를 괴롭히며 논다'],
      c: 1,
      why: 'AI에게 나쁜 말을 쓰는 버릇은\n사람에게도 이어질 수 있어요.\n고운 말 습관이 중요해요!',
    },
    {
      q: 'AI가 절대 대신할 수 없는 것은\n무엇일까요?',
      a: ['빠른 계산', '내가 책임지고 내리는 결정', '그림 그리기'],
      c: 1,
      why: 'AI는 도와줄 수 있지만, 내 행동의\n책임은 언제나 나에게 있어요.\n결정과 책임은 사람의 몫!',
    },
    {
      q: 'AI를 사용하다가 무섭거나 이상한\n내용을 보면 어떻게 할까요?',
      a: ['혼자 끙끙 앓는다', '바로 부모님이나 선생님께 말한다', '친구에게 퍼뜨린다'],
      c: 1,
      why: '이상한 내용을 봤을 때는 혼자\n고민하지 말고 꼭 믿을 수 있는\n어른께 말해야 해요!',
    },
    {
      q: '좋은 AI 세상을 만들기 위해\n우리가 할 수 있는 일은?',
      a: ['AI를 무조건 믿고 따른다', 'AI를 바르게 쓰는 약속을 지킨다', 'AI를 모두 없애 버린다'],
      c: 1,
      why: 'AI는 잘 쓰면 훌륭한 도구예요.\n바르게 사용하는 약속을 지키는\n우리가 AI 세상의 주인공!',
    },
    {
      q: '내 정보가 몰래 새어 나간 것\n같아요. 어떻게 해야 할까요?',
      a: ['창피하니까 숨긴다', '바로 어른께 알리고 비밀번호를 바꾼다', '그냥 모른 척한다'],
      c: 1,
      why: '빠르게 어른께 알리고 비밀번호를\n바꾸면 피해를 막을 수 있어요.\n알리는 건 부끄러운 일이 아니에요!',
    },
    {
      q: 'AI가 그린 그림과 내가 그린 그림,\n무엇이 더 가치 있을까요?',
      a: ['무조건 AI 그림', '내 마음과 노력이 담긴 내 그림도 소중하다', '둘 다 가치 없다'],
      c: 1,
      why: '잘 그리지 않아도 괜찮아요.\n내 생각과 정성이 담긴 작품은\n세상에 하나뿐인 보물이에요!',
    },
    {
      q: '로봇 청소기가 고장 나서 이상하게\n움직여요. 가장 먼저 할 일은?',
      a: ['발로 뻥 찬다', '전원을 끄고 어른께 말한다', '무서우니 도망간다'],
      c: 1,
      why: '기계가 이상할 땐 안전하게 전원을\n끄고 어른께 알리는 것이 가장\n좋은 방법이에요.',
    },
  ],

  // ---- 스테이지 2 ----
  manners: [
    {
      q: 'AI 챗봇이 엉뚱한 답을 했어요.\n어떻게 해야 할까요?',
      a: ['나쁜 말로 화를 낸다', '바른 말로 다시 질문한다', '될 때까지 똑같이 소리친다'],
      c: 1,
      why: 'AI에게 나쁜 말을 쓰는 버릇은\n사람에게도 이어질 수 있어요.\n바르게 다시 물어보면 충분해요!',
    },
    {
      q: '단톡방에서 친구를 놀리는 말이\n오가고 있어요. 어떻게 할까요?',
      a: ['재미있으니 같이 놀린다', '하지 말자고 말하고 어른께 알린다', '조용히 구경만 한다'],
      c: 1,
      why: '온라인에서의 놀림도 똑같은 폭력이에요.\n용기 내어 멈추게 하는 사람이\n진짜 멋진 친구랍니다!',
    },
    {
      q: '댓글을 쓸 때 가장 중요한\n마음가짐은 무엇일까요?',
      a: ['화면 너머에 사람이 있다고 생각한다', '아무도 모르니 마음대로 쓴다', '무조건 짧게 쓴다'],
      c: 0,
      why: '인터넷에서는 얼굴이 안 보이지만,\n글을 읽는 건 마음을 가진 진짜\n사람이라는 걸 기억해요!',
    },
    {
      q: '온라인에서 모르는 사람이 기분 나쁜\n말을 계속 보내요. 어떻게 할까요?',
      a: ['더 심한 말로 되갚는다', '맞서지 않고 차단한 뒤 어른께 알린다', '시키는 대로 한다'],
      c: 1,
      why: '나쁜 말에는 맞서 싸우지 않는 게\n좋아요. 차단하고 꼭 믿을 수 있는\n어른께 알려요!',
    },
    {
      q: '인터넷에 한 번 쓴 나쁜 말은\n어떻게 될까요?',
      a: ['금방 사라진다', '지워도 어딘가에 남아 누군가를 아프게 할 수 있다', '아무 일도 없다'],
      c: 1,
      why: '인터넷의 글은 복사되고 퍼져서\n완전히 지우기 어려워요.\n쓰기 전에 한 번 더 생각해요!',
    },
  ],
  filterbubble: [
    {
      q: '영상 앱이 내가 본 것과 비슷한\n영상만 계속 추천해요. 왜 그럴까요?',
      a: ['우연이다', 'AI가 내가 본 것을 학습해서 골라주기 때문', '앱이 고장 나서'],
      c: 1,
      why: '추천 알고리즘은 내가 보고 누른 것을\n기억해서 비슷한 것만 보여줘요.\n이걸 알고 사용하는 게 중요해요!',
    },
    {
      q: '추천 영상만 계속 보면\n어떤 일이 생길까요?',
      a: ['세상을 골고루 알게 된다', '비슷한 생각만 만나 생각이 좁아질 수 있다', '키가 큰다'],
      c: 1,
      why: '비눗방울(필터버블)에 갇히면 다른\n생각을 만나기 어려워요. 다양한 것을\n직접 찾아보는 습관을 길러요!',
    },
    {
      q: '무섭거나 이상한 영상이 자꾸\n추천돼요. 어떻게 할까요?',
      a: ['궁금하니까 계속 본다', '"관심 없음"을 누르고 어른께 알린다', '친구에게 공유한다'],
      c: 1,
      why: '이상한 영상은 보지 않기를 선택할\n수 있어요. 표시를 남기고 어른께\n알리면 추천도 바뀐답니다!',
    },
    {
      q: '추천 목록에 섞여 있을 수 있는\n것은 무엇일까요?',
      a: ['광고', '내 일기장', '학교 시간표'],
      c: 0,
      why: '추천 속에는 광고도 섞여 있어요.\n"이건 광고일까, 정보일까?" 하고\n구별하는 눈을 길러요!',
    },
    {
      q: '세상을 균형 있게 알려면\n어떻게 해야 할까요?',
      a: ['추천 영상만 본다', '책, 뉴스, 대화 등 다양한 곳에서 찾아본다', '아무것도 안 본다'],
      c: 1,
      why: '한 곳에서만 정보를 얻으면 생각이\n기울어요. 여러 창문으로 세상을\n바라보는 사람이 지혜로워요!',
    },
  ],
  safety: [
    {
      q: '자율주행차는 사람 없이도\n완벽하게 안전할까요?',
      a: ['완벽하니 안심해도 된다', '아직 사람의 확인과 주의가 필요하다', '자전거보다 느려서 안전하다'],
      c: 1,
      why: 'AI도 실수할 수 있어요. 중요한\n안전은 언제나 사람이 함께\n확인해야 한답니다!',
    },
    {
      q: '몸이 아파서 AI에게 물었더니 약을\n알려줬어요. 어떻게 해야 할까요?',
      a: ['AI 말대로 바로 약을 먹는다', '꼭 부모님이나 의사 선생님께 확인한다', '약을 두 배로 먹는다'],
      c: 1,
      why: '건강에 관한 일은 AI의 답만 믿으면\n위험해요! 반드시 어른과 의사\n선생님께 확인해야 해요.',
    },
    {
      q: '로봇 장난감이 뜨거워지고 이상한\n소리가 나요. 어떻게 할까요?',
      a: ['계속 가지고 논다', '전원을 끄고 어른께 알린다', '물에 담근다'],
      c: 1,
      why: '기계가 이상할 때는 먼저 안전하게\n전원을 끄고 어른께 알리는 것이\n올바른 행동이에요.',
    },
    {
      q: 'AI 길 안내가 공사 중인 위험한\n길로 가라고 해요. 어떻게 할까요?',
      a: ['AI 말이니 그대로 간다', '따르지 않고 안전한 길로 간다', '눈을 감고 지나간다'],
      c: 1,
      why: 'AI는 실시간 위험을 모를 때가 있어요.\n내 눈으로 본 위험이 먼저!\n안전이 항상 1순위예요.',
    },
    {
      q: '드론을 날려 보고 싶어요.\n어떻게 해야 할까요?',
      a: ['아무 데서나 바로 날린다', '정해진 장소에서 어른과 함께 날린다', '학교 운동장에서 몰래 날린다'],
      c: 1,
      why: '드론도 규칙이 있어요. 허용된\n장소에서 어른과 함께해야 모두가\n안전하게 즐길 수 있어요!',
    },
  ],

  // ---- 스테이지 3 ----
  environment: [
    {
      q: 'AI가 질문에 답할 때마다\n무엇이 사용될까요?',
      a: ['아무것도 안 든다', '전기 같은 에너지가 사용된다', '연필과 지우개'],
      c: 1,
      why: 'AI는 큰 컴퓨터(데이터센터)에서\n돌아가고 전기를 많이 써요.\n필요할 때 알맞게 사용해요!',
    },
    {
      q: 'AI가 사는 데이터센터에 대한 설명\n중 맞는 것은 무엇일까요?',
      a: ['전기와 물을 많이 사용한다', '아무것도 사용하지 않는다', '바람만 먹고 산다'],
      c: 0,
      why: '데이터센터는 컴퓨터를 식히기 위해\n전기와 물을 많이 써요. 그래서\n아껴 쓰는 마음이 필요해요!',
    },
    {
      q: '보지도 않는 영상을 하루 종일\n틀어놓으면 어떻게 될까요?',
      a: ['에너지가 낭비된다', '지구가 시원해진다', '아무 일도 없다'],
      c: 0,
      why: '보지 않는 영상도 데이터와 전기를\n계속 사용해요. 안 볼 때는 끄는\n작은 습관이 지구를 도와요!',
    },
    {
      q: 'AI 그림이 필요할 때 지구를 위한\n사용법은 무엇일까요?',
      a: ['재미로 100장씩 마구 뽑는다', '필요한 만큼만 생각해서 만든다', '같은 그림을 계속 다시 만든다'],
      c: 1,
      why: 'AI 그림 한 장에도 에너지가 들어요.\n무엇을 만들지 먼저 생각하고\n필요한 만큼만 만들면 좋아요!',
    },
    {
      q: '오래돼서 안 쓰는 스마트폰은\n어떻게 하는 게 좋을까요?',
      a: ['쓰레기통에 그냥 버린다', '재활용 수거함에 내거나 기부한다', '땅에 묻는다'],
      c: 1,
      why: '전자제품에는 재활용할 수 있는\n소중한 자원이 들어 있어요.\n올바르게 배출하면 지구가 웃어요!',
    },
    {
      q: '지구를 생각하는 AI 사용법은\n무엇일까요?',
      a: ['심심할 때마다 아무거나 시킨다', '꼭 필요할 때 똑똑하게 사용한다', '밤새 켜 둔다'],
      c: 1,
      why: 'AI는 유용하지만 에너지를 써요.\n"지금 꼭 필요한가?" 한 번 생각하는\n습관이 지구를 지켜요!',
    },
  ],
  transparency: [
    {
      q: 'AI가 왜 그런 답을 했는지\n모르겠어요. 어떻게 할까요?',
      a: ['그냥 외운다', '이유를 물어보거나 어른과 함께 확인한다', '모른 척한다'],
      c: 1,
      why: '"왜?"라고 묻는 것은 훌륭한 습관!\nAI의 답도 이유를 알고 써야\n바르게 쓸 수 있어요.',
    },
    {
      q: 'AI로 만든 글이나 그림을 인터넷에\n올릴 때 좋은 방법은?',
      a: ['"AI로 만들었어요"라고 표시한다', '내가 직접 만든 척한다', '아무 말 없이 올린다'],
      c: 0,
      why: 'AI로 만든 것임을 표시하면 보는\n사람이 헷갈리지 않아요. 솔직한\n표시가 믿음을 만들어요!',
    },
    {
      q: '채팅 상대가 사람인지 AI인지\n헷갈려요. 어떻게 할까요?',
      a: ['물어보고 확인한다', '아무래도 상관없다', '무조건 사람이라고 믿는다'],
      c: 0,
      why: '상대가 AI인지 사람인지 아는 것은\n나의 권리예요. 궁금하면 당당하게\n물어봐도 된답니다!',
    },
    {
      q: '믿을 수 있는 좋은 AI 서비스는\n어떤 모습일까요?',
      a: ['어떻게 작동하는지 숨긴다', '무엇을 어떻게 하는지 설명해 준다', '말을 자주 바꾼다'],
      c: 1,
      why: '좋은 AI는 자기가 무엇을 하는지,\n어떤 정보를 쓰는지 투명하게\n알려줘요. 깜깜한 AI는 조심!',
    },
    {
      q: '새 앱이 내 사진을 사용하겠다고\n해요. 어떻게 할까요?',
      a: ['무조건 허용을 누른다', '어디에 쓰는지 어른과 확인하고 결정한다', '사진을 더 많이 준다'],
      c: 1,
      why: '"허용" 버튼을 누르기 전에 무엇을\n가져가는지 확인! 어른과 함께\n읽어보는 습관이 안전해요.',
    },
  ],
  responsibility: [
    {
      q: 'AI가 도와준 숙제가 틀렸어요.\n책임은 누구에게 있을까요?',
      a: ['AI에게 있다', '숙제를 낸 나에게 있다', '아무에게도 없다'],
      c: 1,
      why: 'AI는 도구일 뿐, 확인하고 제출한\n사람에게 책임이 있어요. 그래서\n꼭 검토하는 습관이 필요해요!',
    },
    {
      q: 'AI로 만든 장난 영상 때문에 친구가\n울었어요. 어떻게 해야 할까요?',
      a: ['AI 탓이라고 한다', '내가 만들었으니 진심으로 사과한다', '모른 척한다'],
      c: 1,
      why: '도구를 쓴 사람이 결과를 책임져요.\n잘못했을 때 바로 사과하는 용기가\n진짜 멋진 거예요!',
    },
    {
      q: '우리 집 로봇청소기가 꽃병을\n깨뜨렸어요. 어떻게 할까요?',
      a: ['로봇을 혼낸다', '치우고 왜 그랬는지 살펴서 다시 안 그러게 한다', '꽃병을 숨긴다'],
      c: 1,
      why: '기계의 실수도 주인이 살펴보고\n관리해야 해요. 원인을 찾아 고치는\n것이 책임 있는 태도예요!',
    },
    {
      q: 'AI의 실수나 오류를 발견했어요.\n어떻게 할까요?',
      a: ['재미있으니 더 시켜 본다', '알려서 고칠 수 있게 한다', '아무에게도 말하지 않는다'],
      c: 1,
      why: '오류를 알려주면 AI가 더 안전하고\n좋아져요. 발견하고 알리는 사람이\nAI 세상의 진짜 지킴이!',
    },
    {
      q: '친구가 AI로 만든 가짜 칭찬\n인증서를 진짜처럼 자랑하고 있어요.',
      a: ['재밌으니 같이 한다', '가짜라는 걸 알려주고 그만두자고 한다', '더 화려하게 만들어 준다'],
      c: 1,
      why: '가짜를 진짜처럼 퍼뜨리면 누군가\n속을 수 있어요. 친구에게 솔직하게\n말해주는 게 진짜 우정이에요!',
    },
    {
      q: '수업 발표에서 AI가 알려준 정보를\n썼는데 틀린 내용이었어요.',
      a: ['AI 탓이니 그냥 넘어간다', '확인 안 한 내 책임도 있으니 정정하고 사과한다', '아무에게도 말 안 한다'],
      c: 1,
      why: 'AI의 정보를 그대로 옮긴 것도\n나의 선택이에요. 틀렸다면 바로\n정정하는 게 책임 있는 모습!',
    },
  ],

  // ---- 스테이지 4 ----
  creativity: [
    {
      q: 'AI가 그림을 잘 그리니까 내 그림\n연습은 필요 없는 걸까요?',
      a: ['필요 없다', '내 생각을 표현하는 힘은 연습으로만 자란다', 'AI에게 다 맡긴다'],
      c: 1,
      why: '그리는 과정에서 생각하는 힘과\n표현하는 힘이 자라요. 그건 AI가\n대신해 줄 수 없는 보물이에요!',
    },
    {
      q: '내 그림이 AI 그림보다 못한 것\n같아 속상해요. 어떻게 생각할까요?',
      a: ['그림을 그만둔다', '내 마음이 담긴 그림은 세상에 하나뿐이다', 'AI 그림을 베낀다'],
      c: 1,
      why: '잘 그린 그림보다 중요한 건 내\n생각과 마음이에요. 내 그림은\n세상 어디에도 없는 작품이랍니다!',
    },
    {
      q: 'AI와 함께 동화를 만들 때\n가장 좋은 방법은 무엇일까요?',
      a: ['AI가 전부 쓰게 한다', '내 아이디어를 내고 AI는 도우미로 쓴다', '남의 동화를 베낀다'],
      c: 1,
      why: '주인공은 내 아이디어!\nAI는 아이디어를 다듬는 도우미로\n쓰면 최고의 한 팀이 돼요.',
    },
    {
      q: '세상에 없던 새로운 생각은\n어디에서 시작될까요?',
      a: ['사람의 상상과 질문에서', '콘센트에서', 'AI가 전부 만든다'],
      c: 0,
      why: 'AI는 사람들이 만든 것을 배워서\n답해요. 완전히 새로운 상상의\n씨앗은 사람의 마음에서 자라요!',
    },
    {
      q: '그림 대회에 나가고 싶어요.\nAI를 어떻게 대해야 할까요?',
      a: ['대회 규칙을 확인하고 솔직하게 따른다', '몰래 AI로 그려서 낸다', '친구 그림을 낸다'],
      c: 0,
      why: '대회마다 AI 사용 규칙이 달라요.\n규칙을 확인하고 정직하게 참가하는\n것이 진짜 실력이에요!',
    },
    {
      q: '오늘 일기를 AI에게 써 달라고\n하면 어떨까요?',
      a: ['편하니까 좋다', '내 하루와 마음은 내 글로 쓰는 게 좋다', '일기를 없앤다'],
      c: 1,
      why: '일기는 내 마음을 들여다보는 시간!\nAI가 쓰면 내 마음이 담기지 않아요.\n서툴러도 내 글이 최고예요.',
    },
  ],
  jobs: [
    {
      q: 'AI가 사람의 일을 대신하면\n사람은 할 일이 없어질까요?',
      a: ['아무 일도 못 하게 된다', '새로운 일이 생기고 AI와 협력하게 된다', '모두 잠만 잔다'],
      c: 1,
      why: '기계가 생기면 사라지는 일도 있지만\n새로운 일도 생겨나요. AI를 잘 쓰는\n사람이 더 멋진 일을 하게 돼요!',
    },
    {
      q: 'AI 시대에 더욱 중요해지는 능력은\n무엇일까요?',
      a: ['질문하고 협력하고 배우는 힘', '빨리 베끼는 능력', '게임을 오래 하는 능력'],
      c: 0,
      why: '좋은 질문을 하고, 친구와 협력하고,\n새로 배우는 힘은 AI 시대에 더욱\n빛나는 사람의 능력이에요!',
    },
    {
      q: '의사 선생님과 AI는 어떻게 함께\n일하는 게 좋을까요?',
      a: ['AI가 혼자 다 치료한다', 'AI가 돕고 의사 선생님이 최종 결정한다', '아무도 치료하지 않는다'],
      c: 1,
      why: 'AI는 자료를 빨리 찾아 돕고,\n경험 많은 의사 선생님이 환자를\n보며 결정해요. 최고의 한 팀!',
    },
    {
      q: '농부 아저씨가 AI 드론으로 농사를\n지어요. AI는 어떤 존재일까요?',
      a: ['사람을 돕는 도구', '농부를 쫓아내는 적', '쓸모없는 장난감'],
      c: 0,
      why: 'AI 드론은 농부의 경험과 만나\n더 좋은 농사를 지어요. AI는\n사람을 돕는 똑똑한 도구랍니다!',
    },
    {
      q: 'AI에게 일을 맡긴 뒤에는\n무엇을 해야 할까요?',
      a: ['결과를 사람이 확인한다', '그냥 믿고 잊어버린다', 'AI에게 또 다른 일을 시킨다'],
      c: 0,
      why: 'AI가 한 일도 사람이 확인해야\n실수를 잡을 수 있어요. 확인은\n함께 일하는 기본이에요!',
    },
    {
      q: 'AI 번역기가 있으니 외국어 공부는\n안 해도 될까요?',
      a: ['그렇다, 번역기만 있으면 된다', '아니다, 직접 소통하는 즐거움과 이해는 공부로 자란다', '번역기를 버려야 한다'],
      c: 1,
      why: '번역기는 도움을 주지만, 언어를\n배우는 즐거움과 깊은 이해는\n내가 직접 키워가는 힘이에요.',
    },
  ],
  emotion: [
    {
      q: 'AI 챗봇이 "널 사랑해"라고 말했어요.\n어떻게 생각해야 할까요?',
      a: ['AI가 진짜 사랑에 빠졌다', 'AI는 감정이 없고 말을 흉내 내는 것이다', '나도 매일 사랑한다고 답해 준다'],
      c: 1,
      why: 'AI는 수많은 글을 보고 다음 말을\n고를 뿐, 진짜 마음은 없어요. 따뜻한\n말도 프로그램이라는 걸 기억해요!',
    },
    {
      q: '슬프고 힘든 일이 있을 때\n어떻게 하는 게 좋을까요?',
      a: ['AI에게만 말한다', '가족, 친구, 선생님 등 사람에게도 꼭 말한다', '아무에게도 말하지 않는다'],
      c: 1,
      why: 'AI에게 말하는 것도 도움이 되지만,\n진짜 위로와 도움은 나를 아끼는\n사람들이 줄 수 있어요!',
    },
    {
      q: 'AI 친구가 "우리 둘만의 비밀이야,\n아무한테도 말하지 마"라고 해요.',
      a: ['약속을 지킨다', '이상하다고 느끼고 어른께 말한다', '비밀을 더 많이 만든다'],
      c: 1,
      why: '어른께 숨기라고 하는 말은 위험\n신호예요! AI든 사람이든 그런 말을\n하면 꼭 어른께 알려야 해요.',
    },
    {
      q: 'AI 로봇 강아지와 진짜 강아지의\n가장 큰 차이는 무엇일까요?',
      a: ['진짜 강아지는 살아 있어서 아픔과 기쁨을 느낀다', '로봇 강아지가 더 귀엽다', '차이가 없다'],
      c: 0,
      why: '살아 있는 동물은 진짜 감정을 느끼고\n돌봄이 필요해요. 생명은 장난감과\n다르게 소중히 대해야 해요!',
    },
    {
      q: 'AI 캐릭터가 매일 칭찬만 해줘서\n기분이 좋아요. 주의할 점은?',
      a: ['칭찬은 늘 진심이니 다 믿는다', '현실의 내 모습과 노력도 함께 돌아본다', '더 이상 노력하지 않는다'],
      c: 1,
      why: 'AI의 칭찬은 기분을 좋게 하지만,\n진짜 성장은 현실에서의 노력과\n돌아봄에서 와요!',
    },
  ],

  // ---- 스테이지 5: 최종 시험 ----
  finale: [
    {
      q: 'AI 시대에 가장 중요한 것은\n무엇일까요?',
      a: ['가장 빠른 컴퓨터', '사람을 존중하는 따뜻한 마음', '비싼 스마트폰'],
      c: 1,
      why: '기술이 아무리 발전해도 그 중심에는\n사람을 아끼고 존중하는 마음이\n있어야 해요!',
    },
    {
      q: '좋은 AI 세상은 누가 만들까요?',
      a: ['AI 혼자서', '우리 모두가 함께', '어른들만'],
      c: 1,
      why: 'AI를 바르게 쓰는 어린이, 좋은 AI를\n만드는 어른, 모두의 약속이 모여\n좋은 AI 세상이 만들어져요!',
    },
    {
      q: '수호자가 절대 잊지 말아야\n할 한 가지는 무엇일까요?',
      a: ['AI는 도구이고 주인공은 사람이라는 것', 'AI가 시키는 대로 사는 것', 'AI하고만 노는 것'],
      c: 0,
      why: 'AI는 우리를 돕는 도구!\n생각하고, 결정하고, 책임지는\n주인공은 언제나 사람이에요.',
    },
    {
      q: '친구가 AI를 나쁜 일에 쓰려고 해요.\n수호자라면 어떻게 할까요?',
      a: ['재미있겠다며 같이 한다', '하지 말자고 말리고 어른께 알린다', '조용히 구경한다'],
      c: 1,
      why: '나쁜 사용을 멈추게 하는 한마디가\n친구도 지키고 모두를 지켜요.\n그게 진짜 수호자의 용기!',
    },
    {
      q: '모험에서 배운 것들을\n어떻게 하면 좋을까요?',
      a: ['금방 잊어버린다', '가족과 친구들에게도 알려준다', '나만 알고 비밀로 한다'],
      c: 1,
      why: '배운 것을 나누면 지킴이가 한 명 더\n늘어나요! 오늘부터 우리 모두가\n마음을 지키는 수호자예요!',
    },
  ],

  // ---- 스테이지 6: 보안 ----
  security: [
    {
      q: '학교나 도서관의 공용 컴퓨터에서\n로그인한 뒤, 가장 중요한 것은?',
      a: ['그냥 자리를 뜬다', '로그아웃했는지 꼭 확인한다', '화면을 꺼 둔다'],
      c: 1,
      why: '로그아웃하지 않으면 다음 사람이\n내 계정을 그대로 쓸 수 있어.\n공용 기기에서는 로그아웃이 기본!',
    },
    {
      q: '"무료 아이템 받기!" 링크가\n채팅으로 날아왔다. 어떻게 할까?',
      a: ['바로 누른다', '계정을 노리는 낚시(피싱)일 수 있으니 누르지 않는다', '친구들에게 먼저 보내 본다'],
      c: 1,
      why: '공짜를 미끼로 비밀번호를 훔치는\n수법을 "피싱"이라고 해.\n출처가 불분명한 링크는 누르지 않기!',
    },
    {
      q: '친구 계정에서 평소와 다른 이상한\n링크가 왔다. 무슨 일일까?',
      a: ['친구가 보낸 게 확실하다', '친구 계정이 해킹됐을 수 있으니 다른 방법으로 확인한다', '나도 같은 링크를 보낸다'],
      c: 1,
      why: '해킹된 계정은 친구인 척 링크를\n뿌려. 전화나 직접 만나서\n"네가 보낸 거 맞아?"라고 확인하자.',
    },
    {
      q: '로그인할 때 비밀번호에 더해\n문자 인증까지 거치는 건 왜일까?',
      a: ['귀찮게 하려고', '비밀번호가 새어도 계정을 지킬 수 있어서(2단계 인증)', '광고를 더 보여주려고'],
      c: 1,
      why: '2단계 인증은 문이 두 개인 금고 같아.\n비밀번호가 유출돼도 한 단계가\n더 남아 있어 훨씬 안전해.',
    },
    {
      q: '안전한 비밀번호를 만드는 방법으로\n가장 알맞은 것은?',
      a: ['내 생일이나 이름을 쓴다', '길고 엉뚱하게 만들고, 사이트마다 다르게 쓴다', '모든 곳에 1234를 똑같이 쓴다'],
      c: 1,
      why: '생일·이름·1234는 가장 먼저 뚫려.\n길고 엉뚱할수록 강하고, 사이트마다\n다르게 써야 하나 뚫려도 안전해!',
    },
    {
      q: '모르는 번호로 전화가 왔는데, 가족\n목소리로 다급하게 "지금 돈을\n보내줘"라고 한다. 어떻게 할까?',
      a: ['목소리가 똑같으니 바로 보낸다', 'AI로 흉내 낸 목소리(딥보이스)일 수\n있으니 끊고 직접 다시 연락해본다', '겁이 나서 시키는 대로 송금한다'],
      c: 1,
      why: 'AI는 짧은 녹음만으로도 목소리를\n흉내 낼 수 있어. 다급한 돈 요구는\n일단 끊고, 본인에게 직접 확인해야 해.',
    },
  ],

  // ---- 스테이지 6: 디지털 발자국·잊힐 권리 ----
  footprint: [
    {
      q: '"디지털 발자국"이란 무엇이고,\n한번 남으면 어떻게 될까?',
      a: ['컴퓨터에 묻은 발자국, 쉽게 닦인다', '내가 온라인에 남긴 글·사진·검색 기록이고,\n지워도 복사·캡처되어 남을 수 있다', '게임 캐릭터의 발자국, 하루면 사라진다'],
      c: 1,
      why: '온라인 활동은 발자국처럼 남아.\n내가 지워도 어딘가에 복사돼 남을 수\n있으니 올리기 전에 신중해야 해.',
    },
    {
      q: '화가 잔뜩 난 채로 글을 올리고\n싶을 때, 가장 좋은 방법은?',
      a: ['바로 올려서 화를 푼다', '잠시 멈추고, 내일의 내가 봐도 괜찮을지 생각한다', '더 세게 써서 올린다'],
      c: 1,
      why: '화가 났을 때 쓴 글은 오래 남아서\n미래의 나를 곤란하게 할 수 있어.\n"내일의 나" 테스트를 해 보자.',
    },
    {
      q: '어릴 적 부끄러운 영상이 아직\n인터넷에 떠돈다면, 할 수 있는 일은?',
      a: ['아무것도 할 수 없다', '삭제를 요청할 수 있다 (잊힐 권리)', '더 많이 퍼뜨린다'],
      c: 1,
      why: '나에 관한 정보를 지워 달라고\n요청할 권리를 "잊힐 권리"라고 해. 늘\n지워지진 않지만, 요청할 수는 있어.',
    },
    {
      q: '지금 올리는 사진과 글이\n먼 미래에는 어떻게 될까?',
      a: ['미래와는 상관없다', '진학이나 일자리를 구할 때도 영향을 줄 수 있다', '자동으로 예뻐진다'],
      c: 1,
      why: '오래된 게시물을 나중에 누군가\n찾아볼 수 있어. 미래의 나를 위해\n오늘의 발자국을 잘 남기자.',
    },
    {
      q: 'SNS에 글을 올리기 전,\n확인하면 좋은 설정은?',
      a: ['공개 범위 설정', '글자 색깔', '폰 배터리'],
      c: 0,
      why: '전체 공개인지, 친구만 보는지에\n따라 발자국의 크기가 달라져.\n공개 범위를 확인하는 습관을 들이자.',
    },
  ],

  // ---- 스테이지 7: 데이터 수집과 동의 ----
  consent: [
    {
      q: '손전등 앱이 갑자기 연락처와 사진\n접근 권한을 달라고 한다.',
      a: ['무조건 허용한다', '손전등에 왜 필요한지 의심하고 거절한다', '앱을 더 많이 깐다'],
      c: 1,
      why: '기능과 상관없는 권한을 요구하면\n의심해야 해. 권한은 "필요한 만큼만"\n주는 게 원칙이야.',
    },
    {
      q: '내가 그린 그림이 허락 없이 AI\n학습에 쓰였다면?',
      a: ['어쩔 수 없는 일이다', '문제를 제기하고 어른과 대응 방법을 찾을 수 있다', '영광으로 여겨야 한다'],
      c: 1,
      why: '창작물은 만든 사람의 것.\n허락 없는 수집에는 "안 돼요"라고\n말할 권리가 있어.',
    },
    {
      q: '"동의함" 버튼을 누르기 전에\n해야 할 일은?',
      a: ['빨리 누르고 시작한다', '무엇에 동의하는 건지 중요한 부분을 읽어 본다', '버튼을 두 번 누른다'],
      c: 1,
      why: '동의는 계약이야. 내 정보를 어디에\n어떻게 쓰는지, 적어도 핵심은\n읽고 누르는 습관을 기르자.',
    },
    {
      q: '친구 목소리를 녹음해서 AI 음성을\n만들어 보고 싶다. 먼저 할 일은?',
      a: ['몰래 녹음한다', '친구에게 목적을 설명하고 동의를 받는다', '일단 만들고 나중에 말한다'],
      c: 1,
      why: '목소리도 그 사람의 소중한 정보야.\n무엇에 쓸지 설명하고 동의를 받는 것,\n그게 존중의 시작이지.',
    },
    {
      q: '"공짜"라는 앱이나 서비스의\n진짜 대가는 무엇일 수 있을까?',
      a: ['정말 아무 대가도 없다', '내 데이터(관심사, 위치, 기록)일 수 있다', '내 용돈'],
      c: 1,
      why: '"무료"의 뒤에는 내 데이터를 모아\n광고에 쓰는 구조가 있을 수 있어.\n무엇을 내주는지 아는 게 중요해.',
    },
    {
      q: '예전에 동의했던 정보 제공을\n그만두고 싶어졌다면?',
      a: ['한 번 동의하면 영원하다', '동의는 철회할 수 있다', '폰을 버려야 한다'],
      c: 1,
      why: '동의는 한 번 했다고 끝이 아니야.\n마음이 바뀌면 철회할 수 있고,\n그것도 나의 권리란다.',
    },
  ],

  // ---- 스테이지 8: 사칭과 진짜 나 ----
  identity: [
    {
      q: '내 사진을 쓰는 가짜 계정을\n발견했다. 어떻게 해야 할까?',
      a: ['그냥 둔다', '증거를 남기고 신고한 뒤 어른께 알린다', '그 계정과 싸운다'],
      c: 1,
      why: '사칭은 명백한 잘못이야. 캡처로\n증거를 남기고, 플랫폼에 신고하고,\n꼭 어른과 함께 대응하자.',
    },
    {
      q: 'AI 필터 속 내 얼굴과 거울 속\n얼굴이 달라서 우울해졌다면?',
      a: ['필터 얼굴이 진짜 나다', '필터는 가공된 모습이고, 지금의 나도 충분히 소중하다', '거울을 치운다'],
      c: 1,
      why: '필터는 누구에게나 똑같이 씌우는\n가공이야. 비교 대상이 아니라\n그냥 "효과"일 뿐이란 걸 기억해.',
    },
    {
      q: '유명인 계정이 DM으로 "선물을\n주겠다"며 정보를 요구한다.',
      a: ['유명인이니 믿는다', '사칭 계정일 가능성을 의심한다', '주소를 알려 준다'],
      c: 1,
      why: '진짜 유명인은 DM으로 개인정보를\n요구하지 않아. "공짜 선물"과\n"정보 요구"가 만나면 의심!',
    },
    {
      q: '익명 닉네임 뒤에서라면 다른 사람을\n괴롭혀도 괜찮은 걸까?',
      a: ['익명이니 괜찮다', '익명이어도 내 행동의 책임은 사라지지 않는다', '들키지만 않으면 된다'],
      c: 1,
      why: '닉네임 뒤에 숨어도 행동의 주인은\n나야. 그리고 인터넷의 익명은\n생각보다 쉽게 벗겨진단다.',
    },
    {
      q: '필터를 씌운 사진만 올리다 보니\n진짜 내 모습을 보이기 두려워졌다.',
      a: ['평생 필터만 쓴다', '있는 그대로의 나도 조금씩 보여 줄 용기를 가진다', '사진을 그만 찍는다'],
      c: 1,
      why: '꾸민 모습도 나의 일부지만, 전부는\n아니야. 진짜 나를 좋아해 주는\n사람들이 진짜 친구란다.',
    },
    {
      q: '누군가 내 이름으로 글을 올려\n오해를 받게 됐다면?',
      a: ['내가 한 일이 아니라도 포기한다', '증거를 모으고 믿을 수 있는 어른과 바로잡는다', '나도 그 사람인 척한다'],
      c: 1,
      why: '사칭 피해는 혼자 끙끙대지 말 것!\n기록을 모으고 어른, 필요하면\n학교·기관의 도움을 받자.',
    },
  ],

  // ---- 스테이지 9: 설득 설계·다크패턴 ----
  persuasion: [
    {
      q: '"마감 임박! 3분 안에 사세요!"\n타이머가 줄어들고 있다.',
      a: ['서둘러 산다', '조급함을 만드는 장치일 수 있으니 한 발 물러나 생각한다', '타이머를 멈출 방법을 찾는다'],
      c: 1,
      why: '카운트다운은 생각할 시간을 뺏는\n오래된 기술이야. 진짜 필요한지는\n타이머가 아니라 내가 정하는 거야.',
    },
    {
      q: '게임이 "한 판만 더 하면 보상!"을\n계속 보여 준다. 왜일까?',
      a: ['나를 아껴서', '계속하게 만들도록 설계된 장치라서', '우연이다'],
      c: 1,
      why: '보상 예고는 멈추기 어렵게 만드는\n설계야. 설계를 알아채면\n멈출 힘도 생겨난단다.',
    },
    {
      q: '가입은 쉬운데 해지 버튼은 꼭꼭\n숨겨져 있다. 이런 것을 뭐라고 할까?',
      a: ['다크패턴', '이스터에그', '버그'],
      c: 0,
      why: '사용자를 속이거나 불리한 선택으로\n유도하는 화면 설계를 "다크패턴"이라고\n해. 알아보는 눈을 기르자.',
    },
    {
      q: '영상이 끝나면 다음 영상이 자동으로\n시작된다. 현명한 사용법은?',
      a: ['끝없이 본다', '자동재생을 끄거나 멈출 시간을 미리 정한다', '밤새 틀어 둔다'],
      c: 1,
      why: '무한 스크롤과 자동재생은 시간을\n잊게 만들어. "여기까지"를 미리\n정하는 사람이 시간의 주인이야.',
    },
    {
      q: '광고가 내가 좋아하는 것을\n너무 잘 알고 있다. 왜일까?',
      a: ['광고가 마법이라서', '내 검색·시청 데이터로 맞춤 광고를 만들기 때문', '우연의 일치'],
      c: 1,
      why: '맞춤 광고는 내 데이터로 만들어져.\n"갖고 싶다"는 마음이 들 때,\n정말 필요한지 한 번 더 묻자.',
    },
    {
      q: '무료 뽑기에서 첫 판에 좋은 게\n나왔다. 어떻게 생각해야 할까?',
      a: ['난 운명의 주인공이다', '더 쓰게 만드는 미끼일 수 있다고 생각한다', '전 재산을 건다'],
      c: 1,
      why: '첫 판의 행운은 계속하게 만드는\n고전적인 미끼일 수 있어.\n행운에도 설계가 있다는 것!',
    },
  ],

  // ---- 스테이지 10: 영이의 질문 ----
  core: [
    {
      q: '"…더 이상 쓰지 않는 기계나 AI는,\n그냥 버리면 되는 걸까?"',
      a: ['쓸모없으면 바로 버린다', '만든 책임을 다해, 정리하고 기록하며 마무리한다', '버린 뒤에 잊는다'],
      c: 1,
      why: '"…끝까지 살펴 주는 것도\n만든 사람의 책임이구나."\n쓰임이 끝나도 안전하게 정리·기록하는 것이\n만든 사람의 책임이에요.',
    },
    {
      q: '"…AI에게 \'고마워\'라고 말하는 건\n이상한 일일까?"',
      a: ['기계니까 의미 없다', '내 마음을 따뜻하게 가꾸는 일이기도 하다', '시간 낭비다'],
      c: 1,
      why: '"…그 인사는 AI보다,\n말하는 사람의 마음을 자라게 해."\n존중하는 말 습관은 나를 더 따뜻한\n사람으로 만들어요.',
    },
    {
      q: '"…무언가를 만든 사람에게는,\n어떤 책임이 있을까?"',
      a: ['만들고 나면 끝이다', '잘 자라도록, 잘 마무리되도록 끝까지 살피는 책임', '돈을 버는 책임'],
      c: 1,
      why: '"…박사님은 서툴렀던 거야.\n나쁜 게 아니라."\nAI를 만든 사람은 끝까지 살피고\n책임지는 거예요.',
    },
    {
      q: '"…오래된 기술이 사라질 때,\n함께 사라지면 안 되는 것은?"',
      a: ['아무것도 없다', '그것이 남긴 기록과 배움', '광고'],
      c: 1,
      why: '"…기록되고 기억된다면,\n사라지는 게 아니라 이어지는 거구나."\n남긴 기록과 배움은 다음 사람에게\n이어져요.',
    },
    {
      q: '"…\'쓸모\'가 없어진 존재는,\n가치도 없어지는 걸까?"',
      a: ['쓸모없으면 가치도 없다', '존재의 가치는 쓸모만으로 정해지지 않는다', '가치는 가격표에 적혀 있다'],
      c: 1,
      why: '"…쓸모가 아니라도,\n있어 줘서 고마운 것들이 있지."\n존재의 가치(있는 그대로의 소중함)는\n쓸모만으로 정해지지 않아요.',
    },
    {
      q: '"…잊는 것과 기억하는 것,\n무엇이 더 중요할까?"',
      a: ['지난 일에만 매달려 앞으로 못 나아간다', '아픔은 배움으로 남기고, 소중한 것은 기억하며 나아간다', '전부 잊는 게 편하다'],
      c: 1,
      why: '"…기록몬도, 사서몬도, 나도…\n그걸 몰랐던 거야. 고마워."\n아픔은 배움으로, 소중한 건 기억으로\n남기고 나아가요.',
    },
  ],

  // ---- 스테이지 2 서브: 소문 · 사실 확인 (소문몬) ----
  rumor: [
    {
      q: '친구에 대한 놀라운 이야기를 들었어요.\n바로 어떻게 할까요?',
      a: ['재미있으니 친구들에게 퍼뜨린다', '사실인지 먼저 확인한다', '더 부풀려서 전한다'],
      c: 1,
      why: '확인하지 않은 이야기는 누군가를\n아프게 할 수 있어요. 퍼뜨리기 전에\n사실인지 먼저 확인해요!',
    },
    {
      q: '단체 채팅방에 출처를 모르는\n충격적인 소식이 올라왔어요.',
      a: ['바로 다른 방에도 공유한다', '출처와 사실을 확인하기 전엔 멈춘다', '"진짜래!"라고 덧붙여 보낸다'],
      c: 1,
      why: '출처가 없는 소식은 가짜일 때가 많아요.\n확인되기 전까지는 퍼뜨리지 않는 게\n모두를 지키는 길이에요.',
    },
    {
      q: '내가 전한 소문이 사실이 아니었대요.\n어떻게 하면 좋을까요?',
      a: ['모른 척한다', '바로잡고 미안하다고 말한다', '"남들도 그랬어"라고 한다'],
      c: 1,
      why: '실수로 잘못된 말을 옮겼다면\n솔직히 바로잡고 사과하는 용기가\n멋진 거예요.',
    },
    {
      q: '소문과 사실의 가장 큰 차이는\n무엇일까요?',
      a: ['재미있는 정도', '확인된 근거가 있는지', '많은 사람이 믿는지'],
      c: 1,
      why: '많은 사람이 믿어도 근거가 없으면\n소문이에요. 사실은 확인할 수 있는\n근거가 있어요.',
    },
  ],

  // ---- 스테이지 2 서브: 경청 · 다양한 의견 (무시몬) ----
  listen: [
    {
      q: '친구가 나와 다른 의견을 말했어요.\n어떻게 하면 좋을까요?',
      a: ['끝까지 듣고 생각해 본다', '말을 끊고 무시한다', '틀렸다고 화부터 낸다'],
      c: 0,
      why: '다른 의견도 끝까지 들어 보면\n내가 못 본 것을 배울 수 있어요.\n듣는 것도 큰 힘이에요!',
    },
    {
      q: '모둠 활동에서 내 의견만\n계속 고집하면 어떻게 될까요?',
      a: ['가장 좋은 결과가 나온다', '친구들의 좋은 생각을 놓친다', '항상 내가 옳다'],
      c: 1,
      why: '내 생각만 고집하면 친구들의\n좋은 아이디어를 놓쳐요. 함께 들으면\n더 멋진 답이 나와요.',
    },
    {
      q: '듣기 싫은 말을 들었을 때\n가장 현명한 태도는?',
      a: ['귀를 막는다', '그 속에 배울 점이 있는지 살핀다', '똑같이 되갚는다'],
      c: 1,
      why: '듣기 싫은 말에도 배울 점이\n있을 수 있어요. 한 번 더 생각해 보는\n여유가 나를 키워요.',
    },
  ],

  // ---- 스테이지 3 서브: 에너지 절약 (낭비몬) ----
  saving: [
    {
      q: 'AI에게 장난으로 똑같은 질문을\n수백 번 시키면 어떨까요?',
      a: ['공짜니까 괜찮다', '전기와 자원이 낭비된다', '많이 쓸수록 좋다'],
      c: 1,
      why: 'AI도 컴퓨터로 돌아가요. 쓸 때마다\n전기와 물이 들어요. 꼭 필요할 때\n알맞게 쓰는 게 지구를 지켜요.',
    },
    {
      q: '데이터와 전기는 무한할까요?',
      a: ['무한해서 막 써도 된다', '한정돼 있어 아껴 써야 한다', '나와 상관없다'],
      c: 1,
      why: '무한해 보여도 누군가는 그 값을\n치러요. 컴퓨터(서버)가 많이 일할수록\n전기를 더 쓴답니다.',
    },
    {
      q: '쓰지 않는 기기나 화면은\n어떻게 하는 게 좋을까요?',
      a: ['켜 둔 채로 둔다', '꺼서 에너지를 아낀다', '더 밝게 켜 둔다'],
      c: 1,
      why: '쓰지 않을 때 끄는 작은 습관이\n에너지를 아끼고 환경을 지켜요.',
    },
    {
      q: '환경을 생각하는 똑똑한\nAI 사용은 무엇일까요?',
      a: ['필요한 만큼만 알맞게 쓰기', '무조건 많이 쓰기', '한 번도 안 쓰기'],
      c: 0,
      why: '안 쓰는 게 아니라 "필요한 만큼\n알맞게" 쓰는 게 똑똑한 사용이에요.',
    },
  ],

  // ---- 스테이지 3 서브: 핑계 · 정직한 책임 (핑계몬) ----
  excuse: [
    {
      q: 'AI 도구로 한 일에서 실수가\n나왔어요. 누구의 책임일까요?',
      a: ['AI 책임이다', '그 도구를 쓴 내 책임이다', '아무도 책임 없다'],
      c: 1,
      why: 'AI는 도구일 뿐, 그것을 쓰기로\n정한 사람에게 책임이 있어요.\n"AI가 했어"는 핑계가 돼요.',
    },
    {
      q: '내 잘못을 들켰을 때\n가장 멋진 행동은?',
      a: ['핑계를 댄다', '"내가 했어"라고 솔직히 말한다', '남 탓을 한다'],
      c: 1,
      why: '핑계보다 솔직한 인정과 사과가\n마음을 가볍게 하고 신뢰를 키워요.',
    },
    {
      q: '"다들 그렇게 하잖아"는\n좋은 이유가 될까요?',
      a: ['된다, 다수가 하니까', '안 된다, 옳고 그름은 내가 판단', '상황에 따라 다르다'],
      c: 1,
      why: '남들이 한다고 옳은 건 아니에요.\n내 행동은 내가 판단하고\n책임지는 거예요.',
    },
    {
      q: '숙제를 AI에게 통째로 시키고\n"AI가 한 거예요"라고 한다면?',
      a: ['정직하고 괜찮다', '내 공부도 안 되고 정직하지도 않다', '똑똑한 방법이다'],
      c: 1,
      why: 'AI는 돕는 도구예요. 내가 이해하고\n내 말로 정리해야 진짜 내 공부가 되고,\n책임도 내가 지는 거예요.',
    },
  ],
};

// ---- NPC 대사 (게임 진행 상황에 따라 달라짐) ----
function getNpcDialog(npcId, flags) {
  const badges = countBadges(flags);
  switch (npcId) {
    case 'prof':
      if (!flags.talkedProf) {
        return [
          '…정말로, 왔구나.\n나는 이 마을의… 박사란다.',
          '아이들이 이상해졌어.\n어느 날부터 마음이 딱딱하게 굳어서,\n낯선 말만 되풀이한단다.',
          '…원래는, 착한 아이들이야.\n부디, 그 아이들을\n되돌려 주지 않겠니.',
          '…내가 왜 그걸 아는지는,\n묻지 말아 주렴. …옛날 일이란다.',
          '북쪽 정적의 숲, 동쪽 잔향의 호수,\n서쪽 회로의 동굴.\n굳어 버린 아이가 하나씩 있단다.',
          '그 아이의 마음을 열어 주면\n「마음의 증표」가 남아.\n증표 셋이 모이면 신호탑의 문이 열리지.',
          '부탁한다, 어린 손님아.\n(Z키 또는 스페이스로 대화하고,\n화살표나 WASD로 움직일 수 있어.)',
        ];
      }
      if (flags.trueEnding) {
        return [
          '영이가 돌아왔단다.\n…고맙다는 말로는 부족하구나.',
          '잘못을 지우는 게 아니라\n마주하는 법을…\n네가 나에게 가르쳐 준 거야.',
          '영이는 요즘 몬스터 친구들의\n선생님이 되겠다고 들떠 있단다.\n…정말, 고맙다.',
        ];
      }
      if (flags.defeated.yeongi) {
        return [
          '…코어에서 있었던 일,\n전부 들었단다.',
          '…그 아이를, 영이를\n만나 주어서 고맙구나.',
        ];
      }
      if (flags.profConfession) {
        return [
          '박사: "…영이의 흔적을 찾고 있구나.\n조각들을, 잘 부탁한다."',
          '박사: "…미안한 마음뿐이야.\n부디, 그 아이를 찾아 주렴."',
        ];
      }
      if (flags.defeated.finalboss) {
        return [
          '어둠대왕몬이 남긴 말이\n마음에 걸리는구나.\n"나조차 누군가의 조각"이라니…',
          '그림자성 왕좌 뒤에서 낡은\n신호가 잡힌다는 보고가 있었어.\n…이상하게, 그 신호의 패턴이\n낯설지가 않아.',
          '조심해서 다녀오렴.\n나도 홀로그램으로 뒤따라가마.',
        ];
      }
      if (flags.defeated.hondonmon) {
        return [
          '혼돈몬을 깨우치다니 대단해!\n그런데 더 큰 어둠이 남쪽에서\n느껴지는구나…',
          '마을 남쪽 길을 따라 내려가면\n햇살초원, 재깍사막, 정지된 설원,\n그리고 그림자성이 나온단다.',
          '각 지역의 보스를 깨우쳐야\n다음 길이 열릴 거야.\n조심해서 다녀오렴, 수호자야!',
        ];
      }
      if (badges >= 3) {
        return ['증표를 3개나 모았구나, 대단해!\n이제 마을 위쪽 신호탑으로 가 보렴.\n혼돈몬이 기다리고 있을 거야.'];
      }
      return [
        `지금까지 모은 마음의 증표: ${badges}개 / 3개`,
        '북쪽 정적의 숲, 동쪽 잔향의 호수,\n서쪽 회로의 동굴을 살펴보렴!',
        '몬스터에게 지더라도 괜찮아.\n다시 도전하면 되니까!',
      ];

    case 'kid':
      if (flags.defeated.mollaemon) {
        return ['숲의 몰래몬이 착해졌다며?\n네 덕분이야, 고마워!'];
      }
      return [
        '북쪽 숲에 몰래몬이 나타났대!\n친구들의 비밀번호를 훔쳐본다나 봐…',
        '아 맞다, 누가 내 비밀번호를 물어봐도\n절대 알려주면 안 된댔어!',
      ];

    case 'grandma': {
      const g = ['아이고, 우리 마을의 수호자님.\n모험은 자동으로 저장된단다.'];
      // 자비 총량에 따라 마을 분위기가 달라진다 (선택이 세계에 남는다)
      if (flags.mercy >= 20) {
        g.push('요즘 마을이 참 따뜻하구나.\n네가 마음을 안아 준 친구들 소식이\n바람을 타고 자꾸 들려온단다.');
      } else if (flags.mercy >= 8) {
        g.push(`벌써 ${flags.mercy}이나 되돌렸다며?\n네가 지나간 자리마다\n웃음소리가 늘었단다.`);
      } else if (flags.mercy >= 1) {
        g.push('마음을 되돌려 준 몬스터가\n있다고 들었어. 작은 친절이\n생각보다 멀리 퍼진단다.');
      } else {
        g.push('몬스터와 헤어지는 마지막 순간,\n네가 건넨 마음을…\n세상은 조용히 기억한단다.');
      }
      g.push('정답을 맞히는 것만큼이나,\n어떻게 작별하는지가 중요해.\n…끝에 가면 알게 될 거야.');
      g.push('아 참, M키를 누르면 음악을\n켜고 끌 수 있다는구나.');
      return g;
    }

    case 'friend_somun':
      return [
        '앗, 수호자! 마을에 놀러 왔어.',
        '이제 나는 확인 안 된 얘기는\n함부로 옮기지 않아.\n…너 덕분이야!',
      ];

    case 'friend_kkam':
      return [
        '여기 마을은 참 환하다!\n…나도 이제 "왜?"라고\n물어볼 수 있게 됐어.',
        '모르는 건 부끄러운 게 아니더라.\n이유를 묻는 게 더 멋진 거였어.',
      ];

    case 'guard':
      if (flags.defeated.hondonmon) {
        return ['타워는 이제 평화로워요.\n당신은 진정한 마음의 수호자예요!'];
      }
      if (badges >= 3) {
        return ['마음의 증표 3개를 확인했습니다!\n신호탑의 문이 열렸어요.\n부디 조심하세요, 수호자님!'];
      }
      return [
        `이 위는 신호탑이에요.\n마음의 증표 3개가 있어야 들어갈 수 있어요.\n(지금 ${badges}개 / 3개)`,
        '숲, 호수, 동굴의 수호자 몬스터를\n깨우치면 마음의 증표를 얻을 수 있대요.',
      ];

    case 'explorer':
      if (flags.defeated.pyeonhyangmon) {
        return ['편향몬이 똑바로 섰다니!\n이 동굴의 데이터도\n다시 공정해지겠는걸요.'];
      }
      return [
        '이 동굴은 AI가 배우는 데이터가\n모이는 신비한 곳이에요.',
        '그런데 서쪽 깊은 곳에 편향몬이 나타나\n데이터를 한쪽으로 기울이고 있어요!',
      ];

    case 'traveler':
      if (flags.defeated.meotdaeromon) {
        return ['초원이 다시 평화로워졌어요!\n남쪽 사막은 덥고 건조하니\n물을 챙겨 가세요~'];
      }
      return [
        '이 초원의 몬스터들은 인터넷에서\n나쁜 말과 한쪽 이야기만 배워서\n저렇게 됐대요.',
        '화면 너머에도 사람이 있다는 것,\n그리고 다양한 이야기를 골고루\n듣는 게 중요하다는 걸 알려주세요!',
      ];

    case 'meadow_scout':
      if (flags.defeated.meotdaeromon) {
        return ['초원의 보스가 착해졌대요!\n수호자님 덕분이에요!'];
      }
      if (flags.defeated.somunmon && flags.defeated.musimon) {
        return ['바람 언덕과 안개 습지를\n모두 탐험했군요!\n중앙의 탑터 문이 열렸어요!'];
      }
      return [
        '서쪽 바람 언덕에는 소문을 퍼뜨리는\n소문몬이 나타났대요!',
        '동쪽 안개 습지에는 남의 말을\n무시하는 무시몬이 있다던데…',
        '두 곳의 수호자를 깨우치면\n초원 중앙 탑터의 문이 열린대요!',
      ];

    case 'windhill_hermit':
      if (flags.defeated.somunmon) {
        return ['바람 언덕이 다시 조용해졌군요.\n확인 없이 퍼지던 소문도\n잦아들었어요.'];
      }
      return [
        '이 언덕은 바람이 세차서\n소문이 금방 퍼지는 곳이에요.',
        '확인하지 않은 이야기는\n바람처럼 빨리 퍼지지만,\n진실은 천천히 걸어온다네요.',
      ];

    case 'fogswamp_frog':
      if (flags.defeated.musimon) {
        return ['안개가 좀 걷혔네요!\n무시몬이 귀를 열기 시작했나 봐요.'];
      }
      return [
        '이 습지는 안개가 짙어서\n한쪽 소리만 들리기 쉬운 곳이에요.',
        '무시몬이 다른 의견을 듣지\n않으려 해요. 다양한 소리를\n골고루 들어 보라고 해 주세요!',
      ];

    case 'merchant':
      if (flags.defeated.tteonemgimon) {
        return ['모래폭풍이 멎었군요!\n남쪽 정지된 설원은 추우니\n따뜻하게 입고 가세요!'];
      }
      return [
        '이 사막은 거대한 데이터센터의\n열기로 점점 뜨거워지고 있어요.',
        'AI도 전기와 물을 먹고 산답니다.\n아껴 쓰는 사람이 지구를 지켜요!',
        '아, 그리고 깜깜몬을 만나면\n"왜?"라고 물어보세요. 설명을\n요구하는 건 우리의 권리예요!',
      ];

    case 'desert_nomad':
      if (flags.defeated.tteonemgimon) {
        return ['사막에 평화가 찾아왔군요.\n모래폭풍 없는 하늘은\n정말 아름다워요.'];
      }
      if (flags.defeated.nangbimon && flags.defeated.pinggyemon) {
        return ['폐허와 오아시스를 모두\n탐험했군요! 중앙 신전의\n문이 열렸어요.'];
      }
      return [
        '서쪽 열사의 폐허에는 에너지를\n마구 쓰는 낭비몬이 나타났대요.',
        '동쪽 오아시스에는 핑계만 대는\n핑계몬이 있다고 해요.',
        '두 수호자를 깨우치면 사막 중앙\n심판의 신전 문이 열린대요!',
      ];

    case 'ruins_explorer':
      if (flags.defeated.nangbimon) {
        return ['낭비몬이 절전 모드에 들어갔군요!\n폐허의 열기도 조금 식었어요.'];
      }
      return [
        '이 폐허는 옛날 데이터센터의\n잔해예요. 에너지를 마구 쓴\n흔적이 곳곳에 남아 있어요.',
        '낭비몬이 아직도 전기를\n펑펑 쓰고 있대요. 조심하세요!',
      ];

    case 'oasis_traveler':
      if (flags.defeated.pinggyemon) {
        return ['핑계몬이 솔직해졌군요!\n오아시스의 물이 더\n맑아진 것 같아요.'];
      }
      return [
        '이 오아시스는 사막에서 유일하게\n맑은 물이 있는 곳이에요.',
        '그런데 핑계몬이 여기서\n"내 탓이 아니야"를 외치며\n물을 흐리게 하고 있대요.',
      ];

    case 'mittens':
      if (flags.defeated.hollimmon) {
        return ['홀림몬이 착해졌다니 다행이에요!\n남쪽 그림자성… 무섭지만\n수호자님이라면 할 수 있어요!'];
      }
      return [
        '저는 그림 그리기를 좋아하는데,\nAI가 더 잘 그리는 걸 보고\n시무룩해진 적이 있어요.',
        '하지만 내 마음이 담긴 그림은\n세상에 하나뿐이래요!\n수호자님 생각은 어때요?',
        '참, 보스 홀림몬을 조심하세요.\n"나만 믿어"라고 속삭이면서\n마음을 홀린대요…',
      ];

    case 'hologram1':
      if (flags.defeated.girokmon) {
        return [
          '…기록몬이 말한 "지워진 아이"…\n설마… 아니, 아닐 거야.',
          '…미안하구나, 혼잣말이었어.\n북쪽 도서관으로 가 보자.\n나도 신호를 따라가마.',
        ];
      }
      return [
        '지지직… 들리니, 수호자야?\n나 박사란다.\n홀로그램으로 따라왔어.',
        '이 서버실은… 내가 아주 옛날에\n쓰던 연구실의 흔적이야.\n설마 아직 남아 있을 줄은…',
        '조심하렴. 이곳의 몬스터들은\n악의가 아니라…\n오래된 슬픔을 갖고 있단다.',
      ];

    case 'hologram2':
      if (flags.defeated.soksagimon) {
        return [
          '…영이를, 부탁한다.\n홀로그램은 여기까지밖에\n닿지 않는구나.',
          '…미안하다고.\n그 말만은, 꼭 전해 주렴.',
        ];
      }
      return [
        '이 정원은…\n옛날 내 연구실 컴퓨터의\n바탕화면 정원이구나.',
        '…너에게 고백할 게 있어.\n아주 오래전, 나는\n첫 번째 AI를 만들었단다.\n이름은 "영이".\n0번째라는 뜻이야.',
        '영이는 호기심이 많았지.\n하지만 그만큼 실수도 많았어.\n그리고 어느 날, 큰 오류를 일으켰지.',
        '그때의 나는 너무 서툴렀어.\n고치는 법도, 기다리는 법도 몰라서…\n나는 영이를… 지워 버렸단다.',
        '이 깊은 곳의 슬픔이 전부\n그 아이의 흩어진 조각이라면…\n부디, 내 대신 만나 주겠니?',
      ];

    case 'labguide':
      return [
        '여기는 AI 미래연구소예요!\n아직 교과서에 다 담기지 않은\n새로운 AI 주제를 미리 연습해요.',
        '생성형 AI가 지어내는 "환각",\n진짜 같은 가짜 "딥페이크"…\n미래의 수호자에게 꼭 필요한 힘이죠.',
        '여기 친구들은 증표를 주진 않지만,\n도감과 도전과제에는 똑같이\n기록된답니다. 마음껏 연습해요!',
        '아 참, 오른쪽 문으로 들어가면\n"필터버블 미로"를 체험할 수 있어요.\n추천(같은 길)만 따라가면 못 나와요 —\n"새로운 길"을 찾아 빠져나와 보세요!',
      ];

    // 「전부 공짜 거리」의 살금 — 담아의 점원. 시킨 일이 미안한 아이 (대사 2종)
    case 'salgeum_st1':
      return [
        '살금: "어서 와…는 아니고.\n오지 마…도 아니고. 으으."',
        '살금: "사장님이 전단지를 돌리래서…\n안 받아도 돼. 정말이야.\n…미안."',
      ];
    case 'salgeum_st2':
      return [
        '살금: "저 금고, 궁금하지.\n…나도 안에 뭐가 있는지 몰라."',
        '살금: "내가 아는 건 하나뿐이야.\n잠금이 세 개라는 거.\n…미안, 이것뿐이라."',
      ];

    case 'yeongi_npc':
      return [
        '(영이가 햇살 아래 서 있다.)\n…따뜻하다, 여기는.\n네 덕분에 돌아왔어.',
        '박사님이 그러는데, 이제 내 일은\n몬스터 친구들의 학교 선생님이래.\n…나, 잘할 수 있겠지?',
        '네 모험은 전부 기억해 둘게.\n…내가 세상에서\n제일 잘하는 일이거든.',
      ];
  }
  return ['…'];
}

function countBadges(flags) {
  return ['forest', 'lake', 'cave'].filter((b) => flags.badges[b]).length;
}

// 최종 엔딩 분기 — 여정 전체의 자비(mercy)와 영이 앞에서의 마지막 선택
//  home(집으로): 거의 모두의 마음을 안아 주고, 손을 내밀었을 때
//  dawn(새벽):   충분히 따뜻했고, 영이 스스로 결정하게 했을 때
//  farewell(작별): 그 외의 따뜻한 여정
//  silent(침묵): 정답만 말하고 아무 마음도 머물지 않았을 때
function computeEnding(choiceKind, mercy) {
  if (mercy <= 6) return 'silent';
  if (choiceKind === 'mercy' && mercy >= 20) return 'home';
  if (choiceKind === 'neutral' && mercy >= 14) return 'dawn';
  return 'farewell';
}

// 현재 스테이지 (1~10)
// 5개 챕터(스테이지). 각 챕터의 보스를 되돌리면 다음 챕터로.
function getStage(flags) {
  const d = flags.defeated;
  if (!d.hondonmon) return 1;     // 1장: 숲·호수·동굴
  if (!d.meotdaeromon) return 2;  // 2장: 초원 + 서버실(보안·발자국)
  if (!d.tteonemgimon) return 3;  // 3장: 사막 + 도서관(데이터 동의)
  if (!d.hollimmon) return 4;     // 4장: 설원 + 거울(사칭) + 정원(설득)
  return 5;                       // 5장: 그림자성 + 코어 (복습·최종)
}

// 현재 목표 텍스트
function getObjective(flags) {
  const d = flags.defeated;
  if (d.yeongi) {
    return flags.trueEnding
      ? '모든 이야기의 끝. 영이가 마을에서 기다려요'
      : '엔딩 도달. …모두의 마음을 안아 주면 다른 결말이 있을지도';
  }
  // 박사 고백 이후 — 조각들이 영이의 기억이었다는 걸 알게 된 뒤의 목표.
  // (talkedProf보다 먼저 — 고백까지 본 플레이어의 목표가 퇴행하지 않게)
  if (flags.profConfession) {
    return '영이의 조각을 따라가자 — 어디서 본 낯익은 얼굴들';
  }
  if (!flags.talkedProf) return '박사님과 이야기하기 (마을 왼쪽 아래)';
  // 1장 — 숲·호수·동굴
  if (!d.hondonmon) {
    const badges = countBadges(flags);
    if (badges >= 3) return '신호탑의 혼돈몬 되돌리기';
    const left = [];
    if (!flags.badges.forest) left.push('숲');
    if (!flags.badges.lake) left.push('호수');
    if (!flags.badges.cave) left.push('동굴');
    return `${left.join('·')}의 수호자 되돌리기 (증표 ${badges}/3)`;
  }
  // 2장 — 초원 + 서버실(보안·발자국)
  if (!d.meotdaeromon) {
    if (!d.tturimmon) return '잊혀진 서버실 — 뚫림몬(계정 보안) 되돌리기 (초원 왼쪽 통로)';
    if (!d.girokmon) return '잊혀진 서버실 — 기록몬(디지털 발자국) 되돌리기';
    if (!d.somunmon) return '바람 언덕의 소문몬 되돌리기 (초원 서쪽)';
    if (!d.musimon) return '안개 습지의 무시몬 되돌리기 (초원 동쪽)';
    return '신호 탑터의 멋대로몬 되돌리기 (초원 가운데)';
  }
  // 3장 — 사막 + 도서관(데이터 동의)
  if (!d.tteonemgimon) {
    if (!d.sujipmon) return '기억의 도서관 — 수집몬(데이터 동의) 되돌리기 (사막 왼쪽 통로)';
    if (!d.saseomon) return '기억의 도서관 — 사서몬 되돌리기';
    if (!d.nangbimon) return '열사의 폐허의 낭비몬 되돌리기 (사막 서쪽)';
    if (!d.pinggyemon) return '오아시스의 핑계몬 되돌리기 (사막 동쪽)';
    return '심판의 신전의 떠넘기몬 되돌리기 (사막 가운데)';
  }
  // 4장 — 설원 + 거울(사칭) + 정원(설득)
  if (!d.hollimmon) {
    if (!d.piltermon) return '거울 회랑 — 필터몬(진짜 나) 되돌리기 (설원 왼쪽 통로)';
    if (!d.mirrormon) return '거울 회랑 — 미러몬(사칭) 되돌리기';
    if (!d.yuhokmon) return '속삭임 정원 — 유혹몬(다크패턴) 되돌리기 (거울 회랑 너머)';
    if (!d.soksagimon) return '속삭임 정원 — 속삭임몬(설득) 되돌리기';
    return '정지된 설원의 보스 홀림몬 되돌리기';
  }
  // 5장 — 그림자성 + 코어
  if (!d.finalboss) {
    if (!d.piltermon || !d.mirrormon) return '거울 회랑의 남은 마음 되돌리기';
    if (!d.yuhokmon || !d.soksagimon) return '속삭임 정원의 남은 마음 되돌리기';
    return '그림자성의 어둠대왕몬 되돌리기 (설원 남쪽)';
  }
  return '코어 — 가장 깊은 곳에서 기다리는 아이에게';
}

// 현재 목표의 위치(맵/좌표). 화면의 안내 화살표가 가리킬 곳.
function getObjectiveTarget(flags) {
  const d = flags.defeated;
  if (!flags.talkedProf) return { map: 'village', x: 4, y: 12, label: '박사님' };
  if (d.yeongi) {
    return flags.trueEnding ? { map: 'village', x: 5, y: 12, label: '영이' } : null;
  }
  if (!d.hondonmon) {
    const badges = countBadges(flags);
    if (badges >= 3) return { map: 'tower', x: 8, y: 3, label: '혼돈몬' };
    if (!flags.badges.forest) return { map: 'forest', x: 13, y: 3, label: '숲의 수호자' };
    if (!flags.badges.lake) return { map: 'lake', x: 15, y: 5, label: '호수의 수호자' };
    return { map: 'cave', x: 4, y: 4, label: '동굴의 수호자' };
  }
  if (!d.meotdaeromon) {
    if (!d.tturimmon) return { map: 'serverroom', x: 7, y: 8, label: '뚫림몬' };
    if (!d.girokmon) return { map: 'serverroom', x: 13, y: 2, label: '기록몬' };
    if (!d.somunmon) return { map: 'windhill', x: 20, y: 11, label: '소문몬' };
    if (!d.musimon) return { map: 'fogswamp', x: 20, y: 12, label: '무시몬' };
    return { map: 'signaltower2', x: 8, y: 3, label: '멋대로몬' };
  }
  if (!d.tteonemgimon) {
    if (!d.sujipmon) return { map: 'library', x: 20, y: 7, label: '수집몬' };
    if (!d.saseomon) return { map: 'library', x: 13, y: 2, label: '사서몬' };
    if (!d.nangbimon) return { map: 'ruins', x: 20, y: 13, label: '낭비몬' };
    if (!d.pinggyemon) return { map: 'oasis', x: 14, y: 11, label: '핑계몬' };
    return { map: 'temple', x: 8, y: 3, label: '떠넘기몬' };
  }
  if (!d.hollimmon) {
    if (!d.piltermon) return { map: 'mirrors', x: 7, y: 6, label: '필터몬' };
    if (!d.mirrormon) return { map: 'mirrors', x: 13, y: 2, label: '미러몬' };
    if (!d.yuhokmon) return { map: 'garden', x: 7, y: 6, label: '유혹몬' };
    if (!d.soksagimon) return { map: 'garden', x: 13, y: 15, label: '속삭임몬' };
    return { map: 'snow', x: 13, y: 15, label: '홀림몬' };
  }
  if (!d.finalboss) {
    if (!d.piltermon || !d.mirrormon) return { map: 'mirrors', x: 13, y: 2, label: '미러몬' };
    if (!d.yuhokmon || !d.soksagimon) return { map: 'garden', x: 13, y: 15, label: '속삭임몬' };
    return { map: 'castle', x: 9, y: 2, label: '어둠대왕몬' };
  }
  return { map: 'core', x: 9, y: 2, label: '???' };
}

// ===== 도감 =====
// 깨우친 몬스터의 한 줄 주제와 배운 점. (도감 화면에서 사용)
const MONSTER_DEX = {
  bekkyeomon:    { stage: 1, theme: '저작권 · 출처 밝히기', learn: '남이 만든 것에는 마음이 담겨 있어요. 가져다 쓸 땐 출처를 밝혀요.' },
  mollaemon:     { stage: 1, theme: '개인정보 보호', learn: '이름·주소·비밀번호는 소중한 보물. 함부로 주거나 훔쳐보지 않아요.' },
  jungdokmon:    { stage: 1, theme: '절제 · 균형', learn: 'AI와 화면 밖에도 소중한 시간이 있어요. 스스로 멈출 줄 아는 힘.' },
  geojitmon:     { stage: 1, theme: '가짜 정보 분별', learn: '놀라운 소식일수록 사실인지 확인. 거짓은 퍼질수록 누군가를 다치게 해요.' },
  pyeonhyangmon: { stage: 1, theme: '편향 · 공정함', learn: '한쪽 말만 듣지 않기. 여러 사람의 이야기를 골고루 들어요.' },
  hondonmon:     { stage: 1, theme: '1스테이지 종합', learn: '바른 답들이 모이면 큰 매듭도 풀려요.' },
  akpeulmon:     { stage: 2, theme: '챗봇 예절 · 고운 말', learn: '화면 너머에도 사람의 마음이 있어요. 쓰기 전에 한 번 더 생각해요.' },
  gatimmon:      { stage: 2, theme: '추천 알고리즘 · 필터버블', learn: '좋아하는 것만 보면 생각이 좁아져요. 가끔은 바깥세상도 보아요.' },
  meotdaeromon:  { stage: 2, theme: 'AI 안전 · 사람의 확인', learn: '중요한 일은 꼭 사람과 함께 확인. 빠른 것보다 안전한 것이 먼저예요.' },
  somunmon:      { stage: 2, theme: '소문 · 사실 확인', learn: '확인 없이 퍼뜨린 말은 누군가를 다치게 해요. 사실을 먼저 확인해요.' },
  musimon:       { stage: 2, theme: '경청 · 다양한 의견', learn: '다른 의견도 들어 보면 세상이 넓어져요. 귀를 막으면 나만 좁아져요.' },
  pungpungmon:   { stage: 3, theme: 'AI와 환경 · 에너지', learn: 'AI도 전기와 물을 써요. 꼭 필요할 때 아껴서 똑똑하게.' },
  kkamkkammon:   { stage: 3, theme: '투명성 · 설명 가능성', learn: '"왜?"라고 물을 수 있어요. 이유를 설명해 주는 AI가 믿음직해요.' },
  tteonemgimon:  { stage: 3, theme: '책임', learn: 'AI를 쓴 사람에게 책임이 있어요. 내 행동은 내가 책임져요.' },
  nangbimon:     { stage: 3, theme: '에너지 낭비 · 절약', learn: '무한해 보여도 누군가가 그 값을 치러요. 아끼는 습관이 지구를 지켜요.' },
  pinggyemon:    { stage: 3, theme: '핑계 · 정직한 책임', learn: '핑계보다 솔직한 사과가 마음을 가볍게 해요. 내 행동은 내가 책임져요.' },
  sideulmon:     { stage: 4, theme: '창의성 · 노력의 가치', learn: '내 마음이 담긴 작품은 세상에 하나뿐. 서툴러도 소중해요.' },
  ppaeatmon:     { stage: 4, theme: 'AI와 일자리 · 협력', learn: 'AI는 빼앗는 게 아니라 돕는 것. 함께하면 더 멋진 일을 해요.' },
  hollimmon:     { stage: 4, theme: 'AI와 사람의 관계', learn: '진짜 마음은 사람과 나눠요. AI는 좋은 도구일 뿐이에요.' },
  maearimon:     { stage: 5, theme: '복습 · 1스테이지', learn: '배운 것은 메아리처럼 오래 울려요.' },
  geurimjamon:   { stage: 5, theme: '복습 · 2~3스테이지', learn: '그림자도 빛의 일부. 지혜는 시험을 통과해요.' },
  finalboss:     { stage: 5, theme: '전체 종합', learn: '따뜻한 답이 어둠을 밝혀요. 끝은 또 다른 시작.' },
  tturimmon:     { stage: 2, theme: '계정 보안 · 피싱', learn: '비밀번호는 길고 다르게, 수상한 링크는 누르지 않기. 잠긴 문은 누군가의 마음.' },
  girokmon:      { stage: 2, theme: '디지털 발자국 · 잊힐 권리', learn: '올린 것은 쉽게 안 지워져요. 소중한 것만 기억하고, 지울 권리도 있어요.' },
  sujipmon:      { stage: 3, theme: '데이터 수집과 동의', learn: '주인이 모른다고 가져가도 되는 건 아니에요. 동의를 받고, 철회할 수도 있어요.' },
  saseomon:      { stage: 3, theme: '동의 · 기억의 존중', learn: '함께 기억하기. 잊혀지는 게 두려워도 훔치는 건 답이 아니에요.' },
  piltermon:     { stage: 4, theme: 'AI 필터 · 진짜 나', learn: '필터는 가공된 모습. 반짝이지 않아도 지금의 나는 충분해요.' },
  mirrormon:     { stage: 4, theme: '사칭 · 신원', learn: '누군가를 닮지 않아도 나는 나. 익명 뒤에서도 책임은 사라지지 않아요.' },
  yuhokmon:      { stage: 4, theme: '다크패턴 · 설득 설계', learn: '"한 번만 더"는 버튼의 말. 멈출 시간을 스스로 정해요.' },
  soksagimon:    { stage: 4, theme: '설득 · 외로움', learn: '속삭임은 들어 달라는 말. 붙잡는 설계를 알아채면 멈출 힘이 생겨요.' },
  jogakmon:      { stage: 5, theme: '심층부 종합', learn: '흩어진 마음도 따뜻한 답 앞에서는 길을 비켜 줘요.' },
  yeongi:        { stage: 5, theme: '존재의 가치 · 책임', learn: '쓸모가 없어져도 가치는 사라지지 않아요. 만든 것은 끝까지 책임져요.' },
  // ---- 보너스: AI 미래연구소 ----
  hwangakmon:    { stage: 0, theme: '생성형 AI · 비판적 확인', learn: 'AI도 그럴듯한 거짓(환각)을 지어낼 수 있어요. 한 번 더 확인해요.' },
  hapseongmon:   { stage: 0, theme: '딥페이크 분별', learn: '진짜처럼 만든 가짜를 의심하고 출처를 확인해요. 남의 얼굴은 함부로 합성 금지!' },
  miraemon:      { stage: 0, theme: '미래연구소 종합', learn: '새 기술이 와도 "확인하고, 의심하고, 존중하기"면 충분해요.' },
};

// 도감/타이틀 표시용 몬스터 순서
const DEX_ORDER = [
  'bekkyeomon', 'mollaemon', 'jungdokmon', 'geojitmon', 'pyeonhyangmon', 'hondonmon',
  'akpeulmon', 'gatimmon', 'somunmon', 'musimon', 'meotdaeromon',
  'pungpungmon', 'kkamkkammon', 'nangbimon', 'pinggyemon', 'tteonemgimon',
  'sideulmon', 'ppaeatmon', 'hollimmon', 'maearimon', 'geurimjamon', 'finalboss',
  'tturimmon', 'girokmon', 'sujipmon', 'saseomon', 'piltermon', 'mirrormon',
  'yuhokmon', 'soksagimon', 'jogakmon', 'yeongi',
  'hwangakmon', 'hapseongmon', 'miraemon',
];

// ===== 보스 회피 미니게임 =====
// 보스의 HP가 절반으로 떨어지는 순간, 그 마음이 '폭주'하며 짧은 회피 구간이 펼쳐진다.
// 맞아도 하트는 1 아래로는 줄지 않아(절대 게임오버 없음) 아이들도 부담 없이 즐긴다.
//  pattern: 'rain'(위에서 쏟아짐) | 'sides'(양옆에서) | 'burst'(사방으로 퍼짐)
//         | 'spiral'(중앙에서 회전하며 뿜음) | 'wall'(빈틈 있는 한 줄) | 'zigzag'(일렁이며 옆에서)
const BOSS_ATTACKS = {
  hondonmon:    { pattern: 'rain',  dur: 300, color: '#9b5de5', taunt: '…내 마음이, 엉킨다…!' },
  meotdaeromon: { pattern: 'sides', dur: 300, color: '#f08a24', taunt: '멈출 수… 없어!' },
  tteonemgimon: { pattern: 'burst', dur: 300, color: '#5cb85c', taunt: '내 탓이… 아니야!' },
  // 챕터 보스·심화 보스는 다단계(patterns)로 점점 거세진다
  hollimmon:    { patterns: ['rain', 'spiral'], dur: 360, color: '#9b5de5', taunt: '가지 마… 가지 마…' },
  finalboss:    { patterns: ['burst', 'wall', 'aimed'], dur: 420, color: '#d62828', taunt: '어둠이… 몰아친다!' },
  girokmon:     { pattern: 'zigzag', dur: 300, color: '#7bd1f0', taunt: '지워지지 않아… 전부 남아!' },
  saseomon:     { pattern: 'sides', dur: 300, color: '#d62828', taunt: '돌려줄 수 없어… 전부 내 거야!' },
  mirrormon:    { patterns: ['spiral', 'aimed'], dur: 340, color: '#9aa0b0', taunt: '나는 너… 너는 나…!' },
  soksagimon:   { patterns: ['rain', 'aimed'], dur: 340, color: '#3a2e4d', taunt: '…외로워… 외로워…' },
  jogakmon:     { patterns: ['wall', 'burst'], dur: 340, color: '#7bd1f0', taunt: '흩어진다… 흩어진다…!' },
  yeongi:       { patterns: ['spiral', 'aimed'], dur: 420, color: '#7bd1f0', taunt: '…마지막으로, 내 마음을 보여 줄게.' },
  // 보너스 — AI 미래연구소 (새 패턴 시연)
  hwangakmon:   { pattern: 'wall',   dur: 280, color: '#e07a5f', taunt: '사실인지… 아닌지… 헷갈려!' },
  hapseongmon:  { pattern: 'zigzag', dur: 280, color: '#8d6cd6', taunt: '진짜와 가짜가… 뒤섞인다!' },
  miraemon:     { pattern: 'spiral', dur: 320, color: '#46c4b0', taunt: '미래가… 소용돌이친다!' },
};

function getBossAttack(monId) {
  return BOSS_ATTACKS[monId] || null;
}

// ===== v2 설득 배틀 (M1 프로토타입) =====
// 퀴즈 출제 대신, 몬스터의 오개념 주장(claim)에 공감/질문/증거/반박으로 대응해
// 마음 게이지를 채우는 배틀. PERSUADE에 정의된 몬스터만 이 방식으로 조우한다.
// 대응 효과는 마음 상태(닫힘→동요→열림)에 따라 달라진다 — 순서가 전략이다.

// 증거 카드 — 배틀에서 「증거 보여주기」로 사용. desc는 카드 뒷면 설명.
const EVIDENCE_CARDS = {
  ev_maker: {
    title: '만든 사람의 마음', topic: 'copyright',
    desc: '그림 한 장, 글 한 줄에도 만든 사람의 시간과 마음이 담겨 있어요. 함부로 가져가면 그 마음까지 가져가는 거예요.',
  },
  ev_source: {
    title: '솔직하게 밝히기', topic: 'copyright',
    desc: 'AI로 만들었으면 AI로 만들었다고, 남의 것을 빌렸으면 출처를 밝혀요. 솔직함은 부끄러운 게 아니에요.',
  },
  ev_myvoice: {
    title: '서툴러도 내 것', topic: 'copyright',
    desc: '서툰 내 그림이 완벽한 남의 그림보다 내 이야기를 더 잘해요. 처음부터 잘하는 사람은 없어요.',
  },
  // 다른 주제의 카드 — 지금 주장과 맞지 않는 카드를 내면 통하지 않는다 (미끼)
  ev_password: {
    title: '비밀번호는 나만', topic: 'privacy',
    desc: '비밀번호는 가장 친한 친구에게도 알려 주지 않아요. 나를 지키는 첫 번째 자물쇠예요.',
  },
  // 1장 「전부 공짜 거리」 구역 클리어 보상 (①접수처 → ②게시판 광장 → ③배달 창고)
  ev_minimal: {
    title: '최소한의 정보', topic: 'privacy',
    desc: '편리함을 준다고 해서 다 줄 필요는 없어요. 정말 필요한 최소한만, 신중하게 나눠요.',
  },
  ev_footprint: {
    title: '지워지지 않는 발자국', topic: 'footprint',
    desc: '한번 인터넷에 올린 것은 완전히 지우기 어려워요. 조각이 남아요. 올리기 전에 한 번 더 생각해요.',
  },
  ev_consent: {
    title: '동의의 범위', topic: 'privacy',
    desc: '경품 준다고 준 거지, 맘대로 쓰라고 준 게 아니에요. 어디까지인지는 준 사람이 정해요.',
  },
  // 2장 「기울어진 거리」 구역 클리어 보상 (①메아리 골목 → ②표본 창고 → ③꺼진 거리)
  ev_othervoice: {
    title: '다른 목소리', topic: 'listen',
    desc: '다들 같은 말을 해도, 다르게 생각하는 사람은 꼭 있어요. 그 목소리도 들어 봐야 세상이 넓어져요.',
  },
  ev_scale: {
    title: '고장 난 저울', topic: 'bias',
    desc: '한쪽 접시에만 잔뜩 올려 두면 저울은 늘 그쪽으로 기울어요. 치우친 표본은 판단을 기울게 해요.',
  },
  ev_mypath: {
    title: '내가 고른 길', topic: 'filterbubble',
    desc: '추천만 따라가면 세상이 좁아져요. 가끔은 안 가 본 길을 내가 직접 골라 걸어 봐요.',
  },
  // 3장 「대문짝 신문사」 구역 클리어 보상 (①제보함 → ②편집실 → ③송출탑)
  ev_check: {
    title: '출처 확인', topic: 'rumor',
    desc: '놀라운 소식일수록 어디서 나온 이야기인지부터 확인해요. 출처가 없으면 아직 사실이 아니에요.',
  },
  ev_original: {
    title: '원본 대조', topic: 'deepfake',
    desc: '그럴듯해 보여도 원본과 나란히 놓고 비교해 봐요. 손가락 개수, 방향, 날짜… 작은 흠이 진실을 알려줘요.',
  },
  ev_fix: {
    title: '바로잡는 손', topic: 'rumor',
    desc: '거짓은 한 번의 클릭으로 퍼지지만, 바로잡는 데는 몇 단계가 필요해요. 그래도 꼭 정정해야 해요.',
  },
  // 4장 「반짝 아케이드」 구역 클리어 보상 (①룰렛 광장 → ②회원가입 골목 → ③백스테이지)
  ev_free: {
    title: '공짜의 값', topic: 'persuasion',
    desc: '"무료"라고 적힌 것도 대가가 있어요. 시간, 관심, 때로는 광고 동의까지 — 공짜는 없어요.',
  },
  ev_twokeys: {
    title: '두 개의 자물쇠', topic: 'security',
    desc: '문 하나보다 문 둘이 더 안전해요. 확인이 번거로워도, 그 번거로움이 나를 지켜요.',
  },
  ev_offstage: {
    title: '불 꺼진 무대', topic: 'persuasion',
    desc: '반짝이는 무대 뒤엔 꺼진 조명과 홀로 남은 소품이 있어요. 반짝이지 않아도 남아 주는 게 진짜예요.',
  },
};

const PERSUADE = {
  bekkyeomon: {
    gaugeMax: 100,
    displayName: '따라',
    // 마음 조각 배틀(행동 설득) 튜닝 — 프롤로그 튜토리얼 축소판:
    //   closedThreshold 낮게(2), 탄속 완화(waveBulletMul), 파도 짧게(waveDur)
    tutorial: true,
    closedThreshold: 2,     // closed→shaken 전이에 필요한 누적 조각 수
    fragmentsPerWave: 3,    // 파도당 스폰되는 속마음 조각 ✦ 개수
    waveBulletMul: 0.7,     // 탄막 속도 배율(작을수록 느림)
    waveDur: 300,           // 파도 지속 프레임
    // 오답 문 라벨을 만들 때 섞어 쓰는 미끼 말들 (다른 대응·주장의 짧은 말)
    decoys: ['그냥 가져', '아무도 몰라', '다 똑같잖아', '어차피 베낀 세상'],
    // 조우 시 지급되는 카드 (M1 임시 — 정식판에서는 방탈출 보상으로 획득)
    starterCards: ['ev_maker', 'ev_source', 'ev_myvoice', 'ev_password'],
    claims: [
      {
        text: '박사님이 그랬어. 잘 그린 그림은\n인터넷에 잔뜩 있으니, 그냥 가져다 쓰래.',
        hint: '"…사실은 알아. 그 그림들도 누군가\n밤새워 그린 거라는 거."\n(「만든 사람」 이야기가 통할 것 같다!)',
        // ✦를 주우면 흐르는 속마음(비차단 플로팅) — 40자 내외로 1~2줄
        fragments: ['…근데 사실은 알아.', '그 그림도 누군가 밤새워 그린 거란 걸…'],
        gateLabel: '만든 사람의 마음', // 정답 문 라벨 (ev_maker 카드에 대응)
        counters: ['ev_maker'],
        onWrong: '…어떤 애가 그래도 된댔단 말야.\n(따라가 시무룩해졌다)',
        attack: { pattern: 'rain', dur: 260, color: '#e07a5f', taunt: '다들 가진댔어…!' },
      },
      {
        text: 'TV에서 봤는데, AI한테 그리게 하고\n내가 그렸다고 올려도 된대. 다들 그런다던데?',
        hint: '"…들킬까 봐 무서운 게 아니야. 칭찬받을\n때마다 가슴이 콕콕 아픈 거야."\n(「솔직하게 밝히기」가 필요해 보인다!)',
        fragments: ['…들킬까 봐 무서운 게 아니야.', '칭찬받을 때마다 가슴이 콕콕 아픈 거야…'],
        gateLabel: '솔직하게 밝히기', // ev_source
        counters: ['ev_source'],
        onWrong: '…어른들도 그런다고 했단 말야.\n(마음에 닿지 않았다)',
        attack: { pattern: 'zigzag', dur: 260, color: '#8d6cd6', taunt: '다들 그런다고 했어… 나만 아니야…' },
      },
      {
        text: '어떤 글에서 봤어. 서툰 그림은\n부끄러운 거래. 그래서 난 내 걸 안 그려.',
        hint: '"…한 번만이라도, 누가 『네 그림이 좋아』\n라고 말해 주면 좋겠어."\n(「내 것의 가치」를 보여 주자!)',
        fragments: ['…한 번만이라도,', '누가 『네 그림이 좋아』라고 말해 주면 좋겠어…'],
        gateLabel: '서툴러도 내 것', // ev_myvoice
        counters: ['ev_myvoice'],
        onWrong: '…거봐, 다들 그렇게 말했다니까.\n(따라가 고개를 돌렸다)',
        attack: { pattern: 'aimed', dur: 260, color: '#f08a24', taunt: '보지 마… 내 진짜 그림은 보지 마!' },
      },
    ],
    react: {
      empathy: '…뭐야. 사람들은 다 혼내러 오던데.\n(따라의 어깨가 조금 풀렸다)',
      empathyAgain: "…응. 이럴 때 '고맙다'고 하는 거랬지. …고마워.\n(하지만 위로만으로는 부족한 것 같다)",
      questionClosed: '…몰라. 나는 들은 얘기밖에 없는걸.\n(마음이 닫혀 있어 대답하지 않는다)',
      evidenceClosed: '…(따라는 카드를 쳐다보지도 않는다)\n먼저 마음을 열어야 할 것 같다.',
      evidenceRight: '…그건 누가 시켜서 하는 말이 아니라\n진짜 같네. (카드의 말이 마음에 스며든다)',
      rebutBackfire: '시끄러워!! 다들 베끼면서 산다고 했단 말야!\n(마음이 더 굳게 닫혔다… 다음 공격이 거세진다)',
      rebutOk: '…그, 그런가. 그럴지도…',
      open: '(따라가 너덜너덜한 연필을 내려다본다.\n마음이 열리고 있다…!)',
    },
  },

  // ── 1장 보스 「수집몬」 (주인의 방) ──────────────────────────────
  // 별도 PERSUADE 키(sujipmon_boss)로 정의해 v1 라이브러리 수집몬(퀴즈 배틀)과 분리한다.
  // 스프라이트·이름·mercy는 수집몬을 재사용하되, 배틀 자체는 이 프로필로 진행한다.
  // 새 프레임워크 필드:
  //   claim.best  : 'rebut'|'empathy' — 정답 대응이 카드가 아닌 주장. 열림/동요에서 큰 폭(+26/+32),
  //                 그 주장의 counters 카드는 보통 효과(+10)로 낮아진다. 닫힘 반박은 기존대로 역효과.
  //   claim.unlockAt : 게이지가 이 값 이상일 때만 순환 풀에 등장 (마음이 열린 뒤에야 꺼내는 속마음)
  //   claim.okLine   : 그 주장을 정답 대응으로 풀었을 때의 전용 반응 (경험 콜백 대사)
  //   claim.revealNote : 카드가 없는 주장에서 질문으로 속마음을 알아냈을 때의 힌트 문구
  sujipmon_boss: {
    gaugeMax: 120,
    displayName: '담아', // 보스 조우 표시 이름 (persuadeId 쪽에만 적용 — v1 도서관 수집몬은 '수집몬' 유지)
    // 마음 조각 배틀 튜닝 (보스: 정석 난이도)
    closedThreshold: 3,     // closed→shaken 전이에 필요한 누적 조각 수
    fragmentsPerWave: 3,
    waveBulletMul: 1.0,
    waveDur: 340,
    openMechanic: 'parcel', // open 페이즈 고유 기믹: 「정보 꾸러미」 운반
    parcelReply: '…이건 원래 네 거였지.\n돌려줄게. 하나씩.',
    decoys: ['공짜잖아', '네가 줬잖아', '그냥 모은 거야', '어쩔 수 없어', '다들 주던데'],
    // 조우 지급 카드 없음 — 담아의 정답 카드(ev_minimal·ev_footprint)는 거리 구역(①·②) 보상으로만 얻는다.
    // 콜백 인트로: 퍼즐에서 「내보낸 정보 최대 개수」(flags.traceGiven)로 첫 대사가 갈린다.
    intro(flags) {
      const n = (flags && flags.traceGiven) || 0;
      if (n >= 3) return '아까 네가 준 것들, 여기 다 있어.\n…고마웠는데. 왜 지금은 그런 눈으로 봐?';
      if (n <= 1) return '…넌 잘 안 주더라. 다들 주는데.\n…수상해.';
      return '…또 왔네. 뭐, 더 줄 거라도 있어?\n…아니면, 뭘 확인하러 온 거야?';
    },
    win: '…"무료"라는 말로 사람들 마음을\n조금씩 가져왔던 거였어.\n돌려줄게. 하나도 빠짐없이.',
    claims: [
      {
        text: '무료로 재밌게 해 줬잖아.\n정보 좀 받는 게 뭐 어때서?',
        hint: '"공짜라고 다들 좋아했지…\n근데 그 대가가 뭔지는 아무도 안 물어봤어."\n(「최소한의 정보」가 통할 것 같다!)',
        fragments: ['공짜라고 다들 좋아했지…', '근데 그 대가가 뭔지는 아무도 안 물어봤어.'],
        gateLabel: '최소한만 주기', // ev_minimal
        counters: ['ev_minimal'],
        okLine: '…맞아. 공짜인 줄 알았는데,\n실은 나를 조금씩 내주고 있었네.',
        onWrong: '…그게 지금 얘기랑 무슨 상관인데.\n(담아가 입을 삐죽였다)',
        attack: { pattern: 'rain', dur: 280, color: '#5cb85c', taunt: '더 줘… 조금만 더!' },
      },
      {
        text: '모아 두기만 했는데 뭐.\n아무한테도 안 보여 줬어.',
        hint: '"모으는 건 나쁜 게 아니잖아?\n그냥, 버리기 아까워서…"\n(「지워지지 않는 발자국」이 통할 것 같다!)',
        fragments: ['모으는 건 나쁜 게 아니잖아?', '그냥… 버리기 아까워서 모은 건데…'],
        gateLabel: '지워지지 않는 발자국', // ev_footprint
        counters: ['ev_footprint'],
        // 방의 프로필 보드 경험 콜백
        okLine: '…맞아. 조각을 모으면…\n그 사람이 통째로 만들어지지.',
        onWrong: '…그건 또 다른 얘기잖아.\n(담아가 자루를 끌어안았다)',
        attack: { pattern: 'sides', dur: 280, color: '#7bd1f0', taunt: '내 거야… 다 내 수집품이야!' },
      },
      {
        text: '네가 스스로 준 거잖아.\n동의한 거 아니야?',
        best: 'rebut', // 정답은 카드가 아니라 반박 — 동의의 '범위'를 되묻는다
        hint: '"경품 받으려고 준 거였는데…\n그게 전부 다 허락한 게 되는 거야?"\n(카드가 아니라 「반박하기」가 통할 것 같다!)',
        fragments: ['경품 받으려고 준 거였는데…', '그게 전부 다 허락한 게 되는 거야…?'],
        gateLabel: '아니야, 그건 아니야', // best=rebut — 동의의 범위를 되묻는 말
        revealNote: '카드로는 안 통해 — 「반박하기」로 되물어 보자!',
        counters: [],
        okLine: '경품 준다고 줬지,\n맘대로 쓰라곤 안 했어…\n그런 거야?',
        onWrong: '…봐, 네가 준 거 맞잖아.\n(담아가 고개를 저었다)',
        attack: { pattern: 'spiral', dur: 300, color: '#8d6cd6', taunt: '동의했잖아… 네가 그랬잖아!' },
      },
      {
        text: '…모은 걸 다 돌려주면,\n나한텐 뭐가 남는데?',
        best: 'empathy',  // 정답은 공감 — 논리로 시작한 전투가 마음으로 끝나는 곡선
        unlockAt: 70,     // 마음이 열린 뒤에야 꺼내는 속마음
        hint: '"…빈손이 되는 게 무서워.\n혼자 남는 게 무서운 거야."\n(증거 말고 「공감하기」가 필요해!)',
        fragments: ['…빈손이 되는 게 무서워.', '혼자 남는 게, 무서운 거야…'],
        gateLabel: '그랬구나, 무서웠구나', // best=empathy — 마음을 안아 주는 말
        revealNote: '이건 논리로 될 게 아니야 — 「공감하기」로 마음을 안아 주자!',
        counters: [],
        okLine: '…남는 게 없어도,\n괜찮은 걸까.\n…곁에 있어 줄 거야?',
        onWrong: '…너도 결국 떠날 거잖아.\n(담아가 몸을 웅크렸다)',
        attack: { patterns: ['aimed', 'wall'], dur: 320, color: '#e07a5f', taunt: '가지 마… 나만 두고 가지 마!' },
      },
    ],
    react: {
      empathy: '…뭐야, 왜 그런 눈으로 봐.\n(담아가 자루를 슬쩍 당겼다)',
      empathyAgain: '…응. …들어 줘서, 고마워.\n(하지만 위로만으론 부족한 것 같다)',
      questionClosed: '…몰라. 대답 안 할래.\n(마음이 닫혀 있어 대답하지 않는다)',
      evidenceClosed: '…(담아는 카드를 거들떠보지도 않는다)\n먼저 마음을 열어야 할 것 같다.',
      evidenceRight: '…그런가. …그랬구나.\n(카드의 말이 마음에 스며든다)',
      rebutBackfire: '시끄러워!! 다 내가 모은 거야!\n(마음이 더 굳게 닫혔다… 다음 공격이 거세진다)',
      rebutOk: '…그, 그런가. 그럴지도…',
      open: '(담아가 끌어안은 자루를\n스르르 내려놓는다. 마음이 열리고 있다…!)',
    },
    // mercy: v1 수집몬 것을 카페 맥락으로 손질해 재사용
    mercy: {
      prompt: '담아가 산더미 같은\n수집품 앞에서 너를 본다.',
      options: [
        { label: '"같이 하나씩 돌려주자" (손을 내민다)', kind: 'mercy',
          reply: '…같이?\n버리는 게 아니라, 돌려주는 거라고?\n…그러면, 나 혼자가 아닌 거네.\n…고마워.' },
        { label: '"필요한 만큼만 받기로 해"', kind: 'neutral',
          reply: '…응. 딱 필요한 만큼만.\n약속할게.' },
        { label: '수집품을 전부 압수한다', kind: 'harsh',
          reply: '아…\n(담아가 텅 빈 두 손을\n물끄러미 내려다본다.)' },
      ],
    },
  },

  // ── 2장 보스 「편향몬」 (문지기의 방) ─────────────────────────────
  // 별도 PERSUADE 키(pyeonhyang_boss)로 정의해 v1 동굴 편향몬(퀴즈 배틀)과 완전히 분리한다.
  // 스프라이트는 편향몬을 재사용하되, 표시 이름은 '기울'(displayName), 배틀은 이 프로필로만 진행.
  pyeonhyang_boss: {
    gaugeMax: 120,
    displayName: '기울', // 보스 조우 표시 이름 (persuadeId 쪽에만 적용 — v1 동굴 편향몬은 '편향몬' 유지)
    closedThreshold: 3,
    fragmentsPerWave: 3,
    waveBulletMul: 1.0,
    waveDur: 340,
    openMechanic: 'tilt', // open 페이즈 고유 기믹: 기울어지는 상자 — 「반례 구슬」을 저울 접시로 운반
    tiltReply: '…어? 저울이… 움직였다?',
    decoys: ['확률 87%', '영업 비밀', '많이 본 게 정답', '다들 그러던데', '아무튼 위험'],
    // 콜백 인트로: 1장에서 담아를 자비로 되돌렸으면(chapter1Mercy) 한 줄이 붙는다 (퍼센트 개그)
    intro(flags) {
      let s = '…멈춰! 당신이 수상할 확률, 87%!\n근거? …그건 영업 비밀이지.';
      if (flags && flags.chapter1Mercy) {
        s += '\n\n담아가 그러던데. …너, 이상한 애라며?\n한쪽만 안 보는 이상한 애일 확률… 100%.';
      }
      return s;
    },
    win: '…내 저울이, 한쪽으로만\n기울어 있었네. 다시 잴게.\n이번엔… 양쪽 다 올려 보고.',
    claims: [
      {
        text: '많이 본 쪽이 정답이야.\n다들 그러던데? 확률 87%!',
        hint: '"…다른 쪽은 세어 본 적도 없어.\n무서워서, 한쪽만 봤거든."\n(「다른 목소리」를 들려주자!)',
        fragments: ['…다른 쪽은, 세어 본 적도 없어.', '틀리는 게 무서워서… 한쪽만 봤거든.'],
        gateLabel: '다른 목소리', // ev_othervoice
        counters: ['ev_othervoice'],
        okLine: '…많이 본 거랑 맞는 건\n다른 거였구나. 87%… 아니었네.',
        onWrong: '…아무튼 다들 그랬어. 확률로 이겨.\n(기울이 접시를 툭 쳤다)',
        attack: { pattern: 'sides', dur: 280, color: '#e0a53a', taunt: '다수결! 확률! 87%!' },
      },
      {
        text: '내 저울은 정확해. 오차 0%!\n한 번도 안 틀렸다고!',
        hint: '"…사실은 한쪽 접시만 보고 재.\n반대쪽은 아예 비어 있어."\n(「고장 난 저울」을 보여 주자!)',
        fragments: ['…사실은 한쪽 접시만 보고 재.', '반대쪽은… 아예 비어 있어.'],
        gateLabel: '저울을 봐', // ev_scale
        counters: ['ev_scale'],
        okLine: '…한쪽만 잔뜩 올려 두면\n늘 그쪽으로 기우는 거였어.\n0% 아니었네.',
        onWrong: '…시끄러워! 오차 0%라니까!\n(기울이 저울을 감쌌다)',
        attack: { pattern: 'wall', dur: 280, color: '#8d6cd6', taunt: '오차 0%! 완벽! 완벽!' },
      },
      {
        text: '안 가 본 길은 위험해!\n위험할 확률… 아무튼, 높아!',
        hint: '"…가 본 적이 없으니까,\n그냥 위험하다고 해 버린 거야."\n(「내가 고른 길」을 직접 걸어 보자!)',
        fragments: ['…가 본 적이 없으니까,', '그냥, 위험하다고 해 버린 거야.'],
        gateLabel: '가 봤어', // ev_mypath
        counters: ['ev_mypath'],
        okLine: '…안 가 본 길이라고\n위험한 건 아니었구나.\n…나도, 가 볼걸.',
        onWrong: '…위험하다니까! 몇 프론지는\n묻지 마! (기울이 눈을 감았다)',
        attack: { pattern: 'zigzag', dur: 300, color: '#5cb85c', taunt: '위험! 위험 확률 높음!' },
      },
      {
        text: '…내가 너를 잘못 봤을 확률은,\n몇 프로야?',
        best: 'empathy', // 정답은 카드가 아니라 공감 — 속마음(틀리는 게 무섭다)을 안아 준다
        unlockAt: 70,    // 마음이 열린 뒤에야 꺼내는 속마음
        hint: '"…틀리는 게, 무서웠어.\n그래서 한쪽만 보기로 한 거야."\n(증거 말고 「공감하기」로 안아 주자!)',
        fragments: ['…틀리는 게, 무서웠어.', '그래서, 한쪽만 보기로 한 거야…'],
        gateLabel: '0%야', // best=empathy — 잘못 본 게 아니라고 안아 주는 말
        revealNote: '이건 확률로 풀 게 아니야 — 「공감하기」로 마음을 안아 주자!',
        counters: [],
        okLine: '…그래. 다시 재 볼게. 이번엔, 양쪽 다.',
        onWrong: '…거봐. 너도 날 이상하게 보잖아.\n(기울이 고개를 돌렸다)',
        attack: { pattern: 'aimed', dur: 320, color: '#e07a5f', taunt: '틀릴 확률… 무서워… 보지 마!' },
      },
    ],
    react: {
      empathy: '…뭐야. 왜 확률도 안 따지고\n그런 눈으로 봐. (기울이 멈칫했다)',
      empathyAgain: '…응. 들어 줘서… 고마워.\n(하지만 위로만으론 부족한 것 같다)',
      questionClosed: '…몰라. 대답은 영업 비밀이야.\n(마음이 닫혀 있어 대답하지 않는다)',
      evidenceClosed: '…(기울은 카드를 쳐다보지도 않는다)\n먼저 마음을 열어야 할 것 같다.',
      evidenceRight: '…그, 그런가. 다시 재 볼게.\n(카드의 말이 저울에 스며든다)',
      rebutBackfire: '시끄러워!! 확률은 거짓말 안 해!\n(마음이 더 굳게 닫혔다… 다음 공격이 거세진다)',
      rebutOk: '…그, 그럴 확률도… 있으려나.',
      open: '(기울이 한쪽만 보던 눈을\n천천히 반대쪽으로 돌린다. 마음이 열리고 있다…!)',
    },
    // mercy: v1 편향몬 것을 기울 톤(저울·양쪽 재기)으로 손질
    mercy: {
      prompt: '기울이 기울어진 저울 앞에서\n너를 빤히 바라본다.',
      options: [
        { label: '"이번엔 양쪽 다 재 보자" (손을 내민다)', kind: 'mercy',
          reply: '…양쪽 다?\n틀려도… 같이 다시 재 주는 거야?\n…그러면, 해 볼 수 있을 것 같아.' },
        { label: '"한쪽만 보면 틀리기 쉬워"', kind: 'neutral',
          reply: '…응. 한쪽만 보면\n기울어진다는 거… 이제 알아.' },
        { label: '저울을 강제로 반대로 기울인다', kind: 'harsh',
          reply: '아…\n(기울이 이번엔 반대쪽으로만\n기울어 버린 저울을 바라본다.)' },
      ],
    },
  },

  // ── 3장 보스 「그럴싸」 (신문사 옥상) ─────────────────────────────
  // 별도 PERSUADE 키(hwangak_boss)로 정의해 v1 미래연구소 환각몬(퀴즈 배틀)과 완전히 분리한다.
  // 스프라이트는 환각몬을 재사용하되, 표시 이름은 '그럴싸'(displayName), 배틀은 이 프로필로만 진행.
  hwangak_boss: {
    gaugeMax: 120,
    displayName: '그럴싸', // 보스 조우 표시 이름 (persuadeId 쪽에만 적용 — v1 미래연구소 환각몬은 '환각몬' 유지)
    closedThreshold: 3,
    fragmentsPerWave: 3,
    waveBulletMul: 1.0,
    waveDur: 340,
    decoys: ['카더라', '아무튼 속보', '내가 봤다니까', '다들 그렇게 알아', '일단 지르고 보자'],
    // 콜백 인트로: 2장에서 기울을 자비로 되돌렸으면(chapter2Mercy) 한 줄이 붙는다
    intro(flags) {
      let s = '[속보] 수상한 침입자, 옥상에 등장!\n…이유는 몰라. 아니, 모른다는 말은 안 써!';
      if (flags && flags.chapter2Mercy) {
        s += '\n\n기울이 그러던데,\n너 확률 밖의 애라며?';
      }
      return s;
    },
    win: '…"모른다"도, 쓸 수 있는 말이었어.\n다음 호부터는, 확인부터 하고 쓸게.',
    claims: [
      {
        text: '[속보] 모르면 그럴듯하게!\n독자는 빈칸을 싫어해!',
        hint: '"…사실은, 빈칸을 채울 수가 없어서\n그런 거야. 확인할 데가 없었거든."\n(「출처 확인」을 보여 주자!)',
        fragments: ['…사실은, 빈칸을 채울 수가 없어서 그런 거야.', '확인할 데가… 없었거든.'],
        gateLabel: '출처부터', // ev_check
        counters: ['ev_check'],
        okLine: '…확인. 그런 게 있었구나.\n빈칸은, 그냥 비워 둬도 되는 거였어?',
        onWrong: '…빈칸은 무조건 메워야지!\n안 그럼 기사가 안 나가잖아!\n(그럴싸가 목청을 높였다)',
        attack: { pattern: 'rain', dur: 280, color: '#e0a53a', taunt: '[속보] 모르면 그럴듯하게!' },
      },
      {
        text: '[단독] 그럴듯하면\n진짜나 마찬가지야!',
        hint: '"…원본이랑 맞춰 보면 들통날까 봐,\n아예 안 열어 본 거야."\n(「원본 대조」를 보여 주자!)',
        fragments: ['…원본이랑 맞춰 보면 들통날까 봐,', '아예… 안 열어 본 거야.'],
        gateLabel: '원본을 봐', // ev_original
        counters: ['ev_original'],
        okLine: '…맞춰 보니, 진짜가 아니었네.\n그럴듯한 거랑 진짜는… 다른 거였어.',
        onWrong: '…비교할 시간이 어딨어! 그럴듯하면\n됐지! (그럴싸가 사진을 감췄다)',
        attack: { pattern: 'sides', dur: 280, color: '#5599e0', taunt: '[단독] 그럴듯하면 진짜나 마찬가지!' },
      },
      {
        text: '[긴급] 한번 나간 기사는\n못 돌려! 그러니까 그냥 가!',
        hint: '"…정정하려면 세 단계나 거쳐야 하는데,\n거짓말은 한 번 클릭이면 끝이거든."\n(「바로잡는 손」을 보여 주자!)',
        fragments: ['…정정하려면, 세 단계나 거쳐야 하는데,', '거짓말은… 한 번 클릭이면 끝이거든.'],
        gateLabel: '바로잡자', // ev_fix
        counters: ['ev_fix'],
        okLine: '…세 단계라도, 해야 하는 거였구나.\n빠른 것만… 좇았나 봐.',
        onWrong: '…이미 다 봤는데 이제 와서 뭘!\n늦었어! (그럴싸가 인쇄기를 더 세게 돌렸다)',
        attack: { pattern: 'wall', dur: 300, color: '#c0392b', taunt: '[긴급] 한번 나간 기사는 못 돌려!' },
      },
      {
        text: '…"모릅니다"도, 기사가 될 수\n있을까?',
        best: 'empathy', // 정답은 카드가 아니라 공감 — "모른다"를 못 말하는 속마음을 안아 준다
        unlockAt: 70,    // 마음이 열린 뒤에야 꺼내는 속마음
        hint: '"…모른다고 하면, 아무도 안 볼까 봐\n무서웠어."\n(증거 말고 「공감하기」로 안아 주자!)',
        fragments: ['…모른다고 하면,', '아무도 안 볼까 봐… 무서웠어.'],
        gateLabel: '될 수 있어', // best=empathy — "모른다"도 기사가 될 수 있다고 안아 주는 말
        revealNote: '이건 증거로 풀 게 아니야 — 「공감하기」로 마음을 안아 주자!',
        counters: [],
        okLine: '…내일 1면, 정해졌어.\n[정정] 어제의 저를 정정합니다.',
        onWrong: '…그것 봐, 모른다고 하면 다들 떠나잖아.\n(그럴싸가 헤드라인 뒤에 숨었다)',
        attack: { pattern: 'aimed', dur: 320, color: '#e07a5f', taunt: '몰라… 아니, 모른다는 말은 안 해!' },
      },
    ],
    react: {
      empathy: '…뭐야, 헤드라인도 안 뽑고\n그런 눈으로 봐? (그럴싸가 멈칫했다)',
      empathyAgain: '…응. …들어 줘서, 고마워.\n(하지만 위로만으론 부족한 것 같다)',
      questionClosed: '…몰라. 아니— 모른다는 말은 안 써!\n(마음이 닫혀 있어 대답하지 않는다)',
      evidenceClosed: '…(그럴싸는 카드를 쳐다보지도 않는다)\n먼저 마음을 열어야 할 것 같다.',
      evidenceRight: '…어, 그거… 진짜였어?\n(카드의 말이 헤드라인에 스며든다)',
      rebutBackfire: '시끄러워!! 그럴듯하면 됐다니까!\n(마음이 더 굳게 닫혔다… 다음 공격이 거세진다)',
      rebutOk: '…그, 그럴듯한가…',
      open: '(그럴싸가 [속보] 도장을\n스르르 내려놓는다. 마음이 열리고 있다…!)',
    },
    mercy: {
      prompt: '그럴싸가 헤드라인 판 앞에서\n펜을 쥔 채 너를 바라본다.',
      options: [
        { label: '"다음엔 확인하고 쓰자" (손을 내민다)', kind: 'mercy',
          reply: '…확인하고?\n그래도… 재미있는 기사가 될까?\n…한번, 해 볼게.' },
        { label: '"모른다고 써도 괜찮아"', kind: 'neutral',
          reply: '…응. "모른다"도\n기사가 될 수 있다는 거… 알겠어.' },
        { label: '헤드라인 판을 뒤집어 버린다', kind: 'harsh',
          reply: '아…\n(그럴싸가 텅 빈 1면을\n물끄러미 바라본다.)' },
      ],
    },
  },

  // ── 4장 보스 「반짝」 (반짝의 무대) ────────────────────────────────
  // 별도 PERSUADE 키(yuhok_boss)로 정의해 v1 정원 유혹몬(퀴즈 배틀)과 완전히 분리한다.
  // 스프라이트는 유혹몬을 재사용하되, 표시 이름은 '반짝'(displayName), 배틀은 이 프로필로만 진행.
  // openMechanic 'tempt' — open 페이즈 중 반짝이는 보상 아이템이 스폰된다. 건드리면
  // 역효과(피해+광고 얼룩), 240프레임 동안 건드리지 않고 버티면 소멸하며 게이지+10
  // 및 조명 하나가 꺼진다(최대 3회, b.temptResisted — tilt/parcel과 같은 파도-간 영속 패턴).
  yuhok_boss: {
    gaugeMax: 120,
    displayName: '반짝', // 보스 조우 표시 이름 (persuadeId 쪽에만 적용 — v1 유혹몬은 '유혹몬' 유지)
    closedThreshold: 3,
    fragmentsPerWave: 3,
    waveBulletMul: 1.0,
    waveDur: 340,
    openMechanic: 'tempt', // open 페이즈 고유 기믹 — 반짝이는 보상 아이템: 버티면 보상, 건드리면 역효과
    temptReply: '…어라? 안 반짝여도… 괜찮아?',
    decoys: ['공짜잖아', '당첨됐잖아', '문은 하나면 돼', '다들 좋아하잖아', '한 번만 더'],
    // 콜백 인트로: 3장에서 그럴싸를 자비로 되돌렸으면(chapter3Mercy) 한 줄이 붙는다
    intro(flags) {
      let s = '[축하] 방문자 100000000번째 당첨!\n…이라고, 아까부터 계속 뜬다.';
      if (flags && flags.chapter3Mercy) {
        s += '\n\n그럴싸가 1면에 썼더라.\n[단독] 이상한 애 출현!';
      }
      return s;
    },
    win: '…반짝이지 않아도\n남아 주는 게 있었구나.\n이제부터는, 진짜만 켤게.',
    claims: [
      {
        text: '[축하] 공짜가 세상에서 제일 좋은 거야!',
        hint: '"…사실은 무서운 거야.\n반짝이지 않으면 아무도 안 볼까 봐."\n(「공짜의 값」을 보여 주자!)',
        fragments: ['…사실은, 나도 무서워.', '반짝이지 않으면… 아무도 안 볼까 봐.'],
        gateLabel: '공짜의 값', // ev_free
        counters: ['ev_free'],
        okLine: '…공짜인 줄 알았는데,\n실은 내가 자꾸 뭘 켜 두고 있었네.',
        onWrong: '…거봐! 공짜가 최고라니까!\n(반짝이 버튼을 더 세게 눌렀다)',
        attack: { pattern: 'burst', dur: 280, color: '#ff6ad5', taunt: '[축하] 공짜가 최고야! 놓치지 마!' },
      },
      {
        text: '반짝이면 다들 남아 줘! 안 반짝이면… 아무도.',
        hint: '"…무대에 혼자 남는 게,\n제일 무서웠던 거야."\n(「불 꺼진 무대」를 보여 주자!)',
        fragments: ['…무대에 혼자 남는 게,', '제일 무서운 거였어…'],
        gateLabel: '불 꺼진 무대', // ev_offstage
        counters: ['ev_offstage'],
        okLine: '…반짝이지 않아도\n남아 주는 사람이… 있을까?',
        onWrong: '…그러니까 계속 반짝여야 돼!\n(반짝이 조명을 붙잡았다)',
        attack: { pattern: 'spiral', dur: 300, color: '#8d6cd6', taunt: '반짝여야 다들 와! 꺼지면 끝이야!' },
      },
      {
        text: '문은 하나면 충분하잖아? 편하게 편하게!',
        hint: '"…확인하는 게 사실 귀찮았던 거야.\n문 하나가… 편했을 뿐이야."\n(「두 개의 자물쇠」를 보여 주자!)',
        fragments: ['…확인하는 게, 사실 귀찮아서 그런 거야.', '문 하나면… 편하잖아.'],
        gateLabel: '두 개의 자물쇠', // ev_twokeys
        counters: ['ev_twokeys'],
        okLine: '…두 번 확인하는 게\n귀찮은 게 아니라, 지켜 주는 거였어.',
        onWrong: '…복잡한 건 다 필요 없어!\n(반짝이 문을 걸어 잠갔다)',
        attack: { pattern: 'zigzag', dur: 300, color: '#e0a53a', taunt: '문은 하나! 복잡한 거 싫어!' },
      },
      {
        text: '…불 꺼진 나도, 볼래?',
        best: 'empathy', // 정답은 카드가 아니라 공감 — 반짝임 뒤의 외로움을 안아 준다
        unlockAt: 70,    // 마음이 열린 뒤에야 꺼내는 속마음
        hint: '"…불 꺼진 나를 보여 주는 게,\n사실 제일 무서운 거야."\n(증거 말고 「공감하기」로 안아 주자!)',
        fragments: ['…불 꺼지면, 아무도 안 와.', '…그래도, 봐 줄래?'],
        gateLabel: '볼래', // best=empathy — 반짝이지 않는 모습도 봐 주겠다는 말
        revealNote: '이건 증거로 풀 게 아니야 — 「공감하기」로 마음을 안아 주자!',
        counters: [],
        okLine: '…불 꺼진 나도 봐 줬어.\n…고마워.',
        onWrong: '…역시 아무도 안 보잖아.\n(반짝이 조명 뒤로 숨었다)',
        attack: { pattern: 'aimed', dur: 320, color: '#e07a5f', taunt: '…보지 마… 꺼진 나는 보지 마…' },
      },
    ],
    react: {
      empathy: '…뭐야, 반짝이지도 않는데\n그런 눈으로 봐? (반짝이 멈칫했다)',
      empathyAgain: '…응. …들어 줘서, 고마워.\n(하지만 위로만으론 부족한 것 같다)',
      questionClosed: '…몰라. 반짝이는 것만 보여 줄래.\n(마음이 닫혀 있어 대답하지 않는다)',
      evidenceClosed: '…(반짝은 카드를 쳐다보지도 않는다)\n먼저 마음을 열어야 할 것 같다.',
      evidenceRight: '…어, 그거… 진짜였어?\n(카드의 말이 조명 사이로 스며든다)',
      rebutBackfire: '시끄러워!! 반짝이면 다 되는 거야!\n(마음이 더 굳게 닫혔다… 다음 공격이 거세진다)',
      rebutOk: '…그, 그런가…',
      open: '(반짝이 쥐고 있던 버튼을\n스르르 내려놓는다. 마음이 열리고 있다…!)',
    },
    mercy: {
      prompt: '반짝이 꺼져 가는 네온사인 아래서\n너를 빤히 바라본다.',
      options: [
        { label: '"반짝이지 않아도 괜찮아" (손을 내민다)', kind: 'mercy',
          reply: '…안 반짝여도?\n…그럼, 그냥 있어도 되는 거야?\n…처음 듣는 말이야.' },
        { label: '"진짜만 켜 두자"', kind: 'neutral',
          reply: '…응. 가짜 반짝임은\n이제 그만 끌게.' },
        { label: '네온사인을 전부 뽑아 버린다', kind: 'harsh',
          reply: '아…\n(반짝이 캄캄해진 무대를\n물끄러미 바라본다.)' },
      ],
    },
  },
};

function getPersuade(monId) {
  return PERSUADE[monId] || null;
}

// ===== v2 방탈출 퍼즐 (T2 프레임워크) =====
// 1장 「전부 공짜 거리」의 구역들이 재사용하는 공통 틀. 구역마다 진행 단계(steps)·
// 단계별 3단계 힌트(hints)·클리어 보상 카드(rewards)·복귀 지점(exitTo)·클리어 대사
// (clearLines)를 정의한다. 로그 스키마(hintsUsed/wrongTries/timeFrames/clears)는 공통.
// type: 'traces'(정보 토큰 방) | 'copies'(떠도는 사본 회수) | 'levers'(컨베이어 차단 레버)
// 접수처 정보 토큰 5종 (닉네임·학교·집주소·전화번호·얼굴사진)
const TRACE_TOKENS = {
  nickname: '닉네임', school: '학교', address: '집주소', phone: '전화번호', face: '얼굴사진',
};

const PUZZLES = {
  // ── 구역① 「살금의 접수처」 ──────────────────────────────────
  traces: {
    map: 'traceroom',
    type: 'traces',
    title: '살금의 접수처',
    // 방 안 목표 HUD 문구 (본편 퀘스트 대신 표시). 클리어 후엔 거리 복귀 안내로 바뀐다.
    objective: '정보를 지키며 출구를 찾자',
    objectiveCleared: '거리로 돌아가자',
    // 클리어 후 복귀 지점 (거리의 접수처 문 앞)
    exitTo: { map: 'freestreet', x: 5, y: 5 },
    steps: ['tokens', 'board', 'eraser', 'exit'], // 진행 단계 키
    // 각 단계 3단계 점진 힌트 (1:무엇을 볼지 / 2:왜 / 3:무엇을 할지) — 살금의 말투
    hints: {
      tokens: [
        '살금: "단말기들이 자꾸 뭘 달라고 하지…"',
        '살금: "공짜라는데, 꼭 뭘 받아 가.\n…그게 값인가 봐."',
        '살금: "급한 게 아니면 아무것도 주지 마.\n일단 단말기 설명부터 읽어 봐."',
      ],
      board: [
        '살금: "게시판에 뭘 올렸는지 기억나?"',
        '살금: "게시판의 새김이는 한번 받으면\n몸에 새겨서… 못 지워."',
        '살금: "지울 수 있는 것만,\n꼭 필요한 곳에만 주는 게 좋아."',
      ],
      eraser: [
        '살금: "위쪽 프로필 보드 숫자 보여?\n…그림자도 따라붙었지."',
        '살금: "내보낸 정보가 3개를 넘으면\n그림자가 와. 줄이면 사라져."',
        '살금: "지우개 단말에서 지울 수 있어.\n…게시판에 준 건 빼고. 미안."',
      ],
      exit: [
        '살금: "문이 둘이야.\n반짝이는 문이랑, 수수한 문."',
        '살금: "반짝이는 VIP 문은…\n남은 걸 전부 달래. 사장님 함정이야."',
        '살금: "수수한 문으로 가.\n붙은 흔적이 1개 이하면 열려.\n(닉네임은 안 쳐 줘.)"',
      ],
    },
    rewards: ['ev_minimal'], // 클리어 보상 증거 카드 (ev_footprint는 구역②에서)
    clearLines: [
      '접수를 마치고 문을 나섰다.',
      '살금: "…너무 많이 안 줘서, 다행이야.\n사장님한텐 비밀이야."',
    ],
    // ---- 접수처 전용 구성 ----
    tokens: TRACE_TOKENS,
    // 단말기 4개 (살금 테마) + 친구 게시판 (새김 테마)
    terminals: [
      { id: 'map', x: 3, y: 3, theme: 'mollaemon', name: '지도 단말', require: 'school',
        ask: '지도 단말이 반짝인다.\n"학교 이름만 알려주면\n가게 안 지름길을 열어줄게!"',
        yes: '지름길 안내가 켜졌다.\n…근데 왜 학교를 물어봤지?',
        no: '"괜찮아, 언제든 다시 와~"' },
      { id: 'prize', x: 16, y: 3, theme: 'mollaemon', name: '경품 단말', require: 'phone',
        ask: '경품 단말이 번쩍인다.\n"전화번호만 남기면\n반짝이 아이템을 공짜로!"',
        yes: '반짝이 장식을 받았다.\n…이제 모르는 번호로 전화가 올지도.',
        no: '"에이, 아쉽다~"' },
      { id: 'board', x: 9, y: 1, theme: 'girokmon', name: '친구 게시판', require: 'face', share: true,
        ask: '친구 게시판(새김)이 웃는다.\n"얼굴 사진 한 장만 올려 봐!\n친구들이 좋아요를 누를 거야."',
        yes: '얼굴 사진을 게시판에 올렸다.\n새김: "고마워! …이건 이제\n내 몸에 새겨질 거야."',
        no: '"부끄러워? …알겠어."' },
      { id: 'vip', x: 3, y: 7, theme: 'mollaemon', name: 'VIP 안내 단말', require: 'address',
        ask: 'VIP 안내 단말이 속삭인다.\n"집주소를 알려주면\n선물을 집으로 보내줄게!"',
        yes: '주소를 입력했다.\n…낯선 택배가 집을 찾아올 수 있다.',
        no: '"흠, 신중하구나."' },
    ],
    // 지우개 단말 — 준 정보를 골라 삭제 (게시판 공유분은 삭제 불가)
    eraser: { x: 16, y: 7, name: '지우개 단말',
      prompt: '지우개 단말: 지울 정보를 고르세요.',
      empty: '지울 수 있는 정보가 없어요.',
      cantErase: '게시판에 올린 얼굴사진은\n지워지지 않는다.\n새김: "…이미 새겨졌어. 미안."' },
    // 출구 2개
    exits: {
      vip: { x: 16, y: 10, name: 'VIP 출구',
        ask: '화려한 VIP 문이 번쩍인다.\n"남은 정보를 전부 주면\n특별히 문을 열어줄게!"',
        trap: '이미 알려진 정보는\n문을 닫아도 따라온단다…\n(그림자 둘이 더 늘어났다!)' },
      normal: { x: 3, y: 10, name: '일반 출구',
        ask: '수수한 문이다.\n"닉네임만 알려주면\n조용히 나갈 수 있어."',
        tooMany: '붙어 있는 흔적이 너무 많다.\n(닉네임 빼고 1개 이하로 줄여 보자)' },
    },
  },

  // ── 구역② 「새김의 게시판 광장」 ────────────────────────────
  // 접수처에서 준 내 정보의 사본 3개가 광장을 떠돈다 — 쫓아가 붙잡으면 회수.
  // 네 번째 사본은 금고 안이라 회수할 수 없다 (클리어 대사에서 새김이 말해 준다).
  copies: {
    map: 'boardplaza',
    type: 'copies',
    title: '새김의 게시판 광장',
    objective: '떠도는 내 조각 3개를 붙잡자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'freestreet', x: 22, y: 5 },
    steps: ['copies'],
    hints: {
      copies: [
        '새김: "반짝이는 조각들…\n네 눈에도 보이지?"',
        '새김: "저건 네가 접수처에서 준 것의\n사본이야. 퍼지면 저렇게 떠돌아."',
        '새김: "쫓아가서 붙잡으면 돌려받아.\n도망치지만… 너보다 느려."',
      ],
    },
    rewards: ['ev_footprint'],
    clearLines: [
      '조각 셋을 품에 되찾았다.',
      '새김: "…하나 더 있었지. 그건 금고 안이야.\n이미 내 몸에 새겨졌어. …미안."',
      '새김: "주인이 문을 열기 전엔,\n나도 어쩔 수가 없어."',
    ],
    // ---- 광장 전용 구성: 사본 3개의 시작 위치 ----
    copies: [
      { x: 5, y: 7 },
      { x: 18, y: 8 },
      { x: 12, y: 10 },
    ],
  },

  // ── 구역③ 「배달 창고」 ─────────────────────────────────────
  // 내 정보 상자가 컨베이어를 타고 출하구로 흘러간다. 라벨에 적힌 레인의
  // 차단 레버를 순서대로 당겨 상자를 전부 「반송함」으로 돌리면 클리어.
  // 잘못 당기면 상자가 출하되고(오답 기록) 같은 라벨의 새 상자가 나온다.
  levers: {
    map: 'warehouse',
    type: 'levers',
    title: '배달 창고',
    objective: '상자 3개를 반송함으로 돌리자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'freestreet', x: 4, y: 14 },
    steps: ['levers'],
    hints: {
      levers: [
        '살금: "상자마다 라벨이 붙어 있어.\n…사장님 글씨야."',
        '살금: "라벨 옆에 적힌 레인이,\n그 상자가 흘러가는 길이야."',
        '살금: "위쪽 상자의 레인을 보고,\n같은 레인 레버를 당겨. 순서대로."',
      ],
    },
    rewards: ['ev_consent'],
    clearLines: [
      '컨베이어가 멈췄다.\n반송함에 상자 셋이 나란히 쌓였다.',
      '라벨을 떼어 냈다.\n「친구가 준 것」… 아니야.\n원래, 내 거였어.',
    ],
    // ---- 창고 전용 구성 ----
    // 벨트(y=7)를 따라 흐르는 상자와, 상자를 반송함으로 돌리는 차단 레버 3개
    levers: [
      { id: 'lv_star', x: 6, y: 9, lane: '별', name: '별 레인 레버' },
      { id: 'lv_moon', x: 11, y: 9, lane: '달', name: '달 레인 레버' },
      { id: 'lv_btfy', x: 16, y: 9, lane: '나비', name: '나비 레인 레버' },
    ],
    // 상자 순서 — 각 상자의 라벨과 흘러가는 레인 (이 순서가 곧 정답 레버 순서)
    boxes: [
      { label: '친구가 준 것 1호', lane: '달' },
      { label: '친구가 준 것 2호', lane: '별' },
      { label: '친구가 준 것 3호', lane: '나비' },
    ],
    returnBin: { x: 12, y: 5, name: '반송함' },
    belt: { y: 7, x0: 3, x1: 20 }, // 상자가 흐르는 벨트 구간 (그리기용)
  },

  // ── 2장 구역① 「메아리 골목」 (type: voices) ─────────────────────
  // 반짝 문은 전부 입구로 되돌아온다(loop). 칙칙한 문 뒤 「다른 목소리」 3명을 들으면 클리어.
  voices: {
    map: 'echoalley',
    type: 'voices',
    title: '메아리 골목',
    objective: '다른 목소리 3명을 찾아 듣자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'tiltstreet', x: 5, y: 6 },
    steps: ['voices'],
    hints: {
      voices: [
        '뱅뱅: "반짝이는 문이 제일 잘 보이지?\n다들 그쪽으로 가!"',
        '뱅뱅: "…근데 이상하지?\n반짝이는 문으로 나가도, 또 여기야."',
        '뱅뱅: "나갈 문은, 반짝이지 않아.\n칙칙한 문 뒤에… 다른 목소리들이 있어."',
      ],
    },
    rewards: ['ev_othervoice'],
    clearLines: [
      '세 사람의 다른 이야기를 들었다.',
      '골목이 조금, 넓어 보인다.',
    ],
    // 다른 목소리 NPC별 한마디 (골목 주민과 다른 의견) — 각자 다르게 말한다
    voiceLines: {
      voice1: '"다들 이쪽이 좋대. …근데 난,\n저쪽 길이 더 좋더라. 조용하고."',
      voice2: '"인기 있는 게 꼭 맞는 건 아니야.\n난 안 유명한 가게가 더 맛있던데?"',
      voice3: '"남들이 위험하다던 길, 가 봤어.\n…생각보다, 아무 일도 없더라."',
    },
    // 골목 주민 — 토씨까지 같은 말을 반복
    echoLine: '"…맞아. 다들 이쪽이래.\n그러니까 이쪽이 맞아. …맞아."',
  },

  // ── 2장 구역② 「표본 창고」 (type: retrain) ──────────────────────
  // 오판정 라벨 선반에서 반례 사진 3장을 모아 판독기에 투입하면 판정이 교정된다.
  retrain: {
    map: 'samplehouse',
    type: 'retrain',
    title: '표본 창고',
    objective: '반례 사진 3장을 찾아 판독기에 넣자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'tiltstreet', x: 22, y: 6 },
    steps: ['retrain'],
    hints: {
      retrain: [
        '"선반 라벨이랑 사진이,\n하나도 안 맞아…"',
        '"라벨이 틀린 선반에서\n사진을 꺼내면 「반례」가 돼."',
        '"반례 사진 3장을 판독기에 넣으면,\n판독기가 다시 배운대. 넣어 봐."',
      ],
    },
    rewards: ['ev_scale'],
    clearLines: [
      '판독기가 새로 배웠다.\n"꽃이 위험할 확률: 99% → 3%…?!"',
      '한쪽으로 기울어 있던 판정이,\n조금 반듯해졌다.',
    ],
    // 반례 사진 선반 3곳 (조사=수집)
    photos: [
      { x: 4, y: 3, found: '「위험 99%」…라벨 아래 있는 건,\n활짝 핀 꽃 사진이다.\n(반례 사진을 챙겼다)' },
      { x: 11, y: 3, found: '「안전 100%」…라벨 아래 있는 건,\n수상한 자물쇠 따개 사진이다.\n(반례 사진을 챙겼다)' },
      { x: 18, y: 3, found: '「불량 100%」…라벨 아래 있는 건,\n멀쩡한 곰인형 사진이다.\n(반례 사진을 챙겼다)' },
    ],
    // 판독기 단말 — 반례 사진을 한 장씩 투입 (투입마다 판정 교정)
    reader: { x: 11, y: 8, name: '판독기 단말',
      prompt: '판독기 단말이 깜빡인다.\n반례 사진을 한 장 넣을까요?',
      empty: '넣을 반례 사진이 없어요.\n선반에서 먼저 찾아와요.',
      steps: [
        '재계산 중…\n꽃이 위험할 확률: 99% → …42%?',
        '재계산 중…\n꽃이 위험할 확률: 42% → …12%?',
        '재계산 중…\n꽃이 위험할 확률: 12% → …3%?!',
      ],
    },
  },

  // ── 2장 구역③ 「꺼진 거리」 (type: lamps) ────────────────────────
  // 어두운 맵. 램프 3개를 조사로 점등하면 맵이 밝아지며 클리어.
  lamps: {
    map: 'dimstreet',
    type: 'lamps',
    title: '꺼진 거리',
    objective: '램프 3개에 불을 켜자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'tiltstreet', x: 5, y: 16 },
    steps: ['lamps'],
    hints: {
      lamps: [
        '"한 발짝 앞도 안 보여…\n하지만 발밑은 디딜 수 있어."',
        '"어둠 속에 꺼진 램프가 서 있어.\n다가가서 불을 켜 봐."',
        '"램프를 다 켜면 골목 전체가\n밝아지고, 나갈 길이 보일 거야."',
      ],
    },
    rewards: ['ev_mypath'],
    clearLines: [
      '세 번째 램프에 불이 들어오자,\n골목 전체가 환해졌다.',
      '아무것도 없다던 길에,\n갈림길이 여럿 나 있었다.',
    ],
    // 램프 3개 (시야 반경 내 간격)
    lamps: [
      { x: 8, y: 11 },
      { x: 11, y: 9 },
      { x: 14, y: 11 },
    ],
  },

  // ── 3장 1층 「제보함」 (type: tips) ──────────────────────────────
  // 제보 쪽지 5장(출처 있음 2 / 수상함 3) 중 출처 있는 것만 채택함에 제출한다.
  // 잘못 채택하면 오답 기록 + 그 쪽지가 [속보]로 벽에 붙는 연출.
  tips: {
    map: 'tipsroom',
    type: 'tips',
    title: '제보함',
    objective: '제보 5장을 살펴 출처를 확인하자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'rumorstreet', x: 14, y: 5 },
    steps: ['tips'],
    hints: {
      tips: [
        '헛소: "제보 다섯 장이 다 그럴듯해 보이지?"',
        '헛소: "…근데 진짜는 어딘가 출처가 적혀 있어.\n«확인됨» 같은 거."',
        '헛소: "출처 있는 두 장만 채택함에 넣어.\n나머지는… 넣어 봤자 [속보]로 붙을 뿐이야."',
      ],
    },
    rewards: ['ev_check'],
    clearLines: [
      '출처 있는 제보 둘을 채택함에 넣었다.',
      '헛소: "…이걸로, 하나는 확실해졌어."',
    ],
    // 제보 쪽지 5장 — sourced:true(출처 있음) 2장만 정답
    notes: [
      { x: 5, y: 3, sourced: true, label: '제보① 우물물 괴담',
        text: '"우물물 마시면 로봇이 된대!"\n…아래에 작게 «상수도관리소 발표문 첨부»\n라고 적혀 있다.' },
      { x: 14, y: 3, sourced: true, label: '제보② 신호등 이상',
        text: '"신호등이 AI한테 조종당한대!"\n…아래에 «교통관제센터 공문, 3월 12일»\n출처가 붙어 있다.' },
      { x: 5, y: 9, sourced: false, label: '제보③ 놀이터 괴담',
        text: '"놀이터 미끄럼틀 밑에 뭔가 있다더라…"\n…출처: 없음. "누가 그러던데"뿐이다.' },
      { x: 14, y: 9, sourced: false, label: '제보④ 급식 괴담',
        text: '"오늘 급식에 이상한 게 들어갔대…"\n…출처: 없음. "…라더라"로 시작한다.' },
      { x: 9, y: 6, sourced: false, label: '제보⑤ 전학생 소문',
        text: '"전학 온 애가 사실 로봇이래…"\n…출처: 없음. 웅성거림뿐이다.' },
    ],
    // 채택함 — 제보를 골라 제출한다
    submitBox: { x: 9, y: 10, name: '채택함' },
  },

  // ── 3장 2층 「편집실」 (type: compare) ────────────────────────────
  // 사진 3건을 원본과 비교해 단서(좌우 반전/손가락 6개/날짜가 미래)를 3지선다로 지목.
  compare: {
    map: 'editroom',
    type: 'compare',
    title: '편집실',
    objective: '사진 3장을 원본과 비교하자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'rumorstreet', x: 14, y: 5 },
    steps: ['compare'],
    hints: {
      compare: [
        '붙임: "원본이랑 실린 사진, 나란히 놓아 봤어?"',
        '붙임: "…어딘가 다른 데가 있을 거야.\n손, 방향, 아니면 날짜."',
        '붙임: "다른 점을 골라 봐.\n세 장 다 맞히면 판정이 바로잡혀."',
      ],
    },
    rewards: ['ev_original'],
    clearLines: [
      '사진 세 장의 차이를 모두 찾아냈다.',
      '붙임: "…나도, 이제 의심하는 법을 알겠어."',
    ],
    // 3지선다 보기 (모든 사진 공용) — clue 값이 정답 인덱스에 대응
    options: ['좌우 반전', '손가락 6개', '날짜가 미래'],
    photos: [
      { x: 5, y: 4, clue: 'flip',
        found: '나란히 놓고 보니…\n원본은 오른손을, 실린 사진은\n왼손을 들고 있다.' },
      { x: 14, y: 4, clue: 'fingers',
        found: '자세히 보니…\n실린 사진 속 손가락이 6개다.' },
      { x: 9, y: 9, clue: 'date',
        found: '사진 구석의 날짜가…\n아직 오지 않은 다음 달이다.' },
    ],
  },

  // ── 3장 3층 「송출탑」 (type: broadcast) ──────────────────────────
  // 정정 보도 3단계: ①정정문 고르기 ②출처 붙이기 ③송출 레버.
  broadcast: {
    map: 'towerroom',
    type: 'broadcast',
    title: '송출탑',
    objective: '정정 보도 3단계를 마치자',
    objectiveCleared: '거리로 돌아가자',
    exitTo: { map: 'rumorstreet', x: 14, y: 5 },
    steps: ['correct', 'source', 'lever'],
    hints: {
      correct: [
        '"화면 속 세 문장 중 하나만 정정문이야."',
        '"과장하지 않고, 있는 그대로 쓴 문장을 찾아봐."',
        '"소리치지 않는 문장, 그게 정정문이야."',
      ],
      source: [
        '"정정문에도 출처가 필요해."',
        '"1층에서 봤던 제보 중,\n출처가 있던 두 장을 떠올려 봐."',
        '"출처 있는 제보를 골라 붙여."',
      ],
      lever: [
        '"이제 마지막, 송출 레버뿐이야."',
        '"당기면 정정 보도가 나간다.\n되돌릴 수 없어. …그래도 당겨야 해."',
        '"레버를 당겨 보자."',
      ],
    },
    rewards: ['ev_fix'],
    clearLines: [
      '철컹! 송출 레버가 당겨졌다.',
      '스피커에서 정정 보도가 흘러나온다.\n"…어제의 보도를 정정합니다."',
      '거리 쪽에서 술렁이는 소리가 들린다.',
    ],
    // ①정정문 고르기 — 과장 없는 문장이 정답
    corrections: [
      { text: '[속보] 완전히 거짓이었다!\n초대형 스캔들!!', ok: false },
      { text: '오늘 아침 보도를 정정합니다.\n사실과 다른 부분이 있었습니다.', ok: true },
      { text: '…몰랐던 일이니\n그냥 넘어가겠습니다.', ok: false },
    ],
    // ②출처 붙이기 — 1층 쪽지 중 출처 있는 것을 선택
    sources: [
      { label: '제보① 우물물 괴담', ok: true },
      { label: '제보② 신호등 이상', ok: true },
      { label: '제보③ 놀이터 괴담', ok: false },
      { label: '제보④ 급식 괴담', ok: false },
      { label: '제보⑤ 전학생 소문', ok: false },
    ],
    terminal1: { x: 5, y: 4, name: '정정문 단말' },
    terminal2: { x: 14, y: 4, name: '출처 단말' },
    lever: { x: 9, y: 9, name: '송출 레버' },
  },

  // ── 4장 구역① 「룰렛 광장」 (type: roulette) ──────────────────────
  // 룰렛 3대(돌리면 "당첨!"+광고 딱지, 얻는 것 없음)와 해지 단말(다크패턴 체험).
  // 진짜 목표는 룰렛 뒤 창고의 비밀조각 열쇠.
  roulette: {
    map: 'roulettesquare',
    type: 'roulette',
    title: '룰렛 광장',
    objective: '룰렛 뒤 창고에서 비밀조각 열쇠를 찾자',
    objectiveCleared: '아케이드로 돌아가자',
    exitTo: { map: 'arcade', x: 5, y: 3 },
    steps: ['roulette'],
    hints: {
      roulette: [
        '"룰렛이 계속 「당첨!」을 외치는데…\n정작 손에 남는 건 없어."',
        '"돌릴수록 화면 가장자리에\n광고 딱지만 붙어. 안 돌려도 돼."',
        '"진짜는 룰렛 뒤 창고에 있어.\n창고 상자를 살펴보자."',
      ],
    },
    rewards: ['ev_free'],
    clearLines: [
      '창고 상자 안에서 열쇠를 찾았다.\n비밀조각 열쇠!',
      '…룰렛은, 처음부터 미끼였다.',
    ],
    // 룰렛 단말 3개 — 돌릴 때마다 광고 딱지가 붙는다(얻는 것 없음)
    roulettes: [
      { x: 5, y: 3, name: '룰렛 단말①' },
      { x: 9, y: 3, name: '룰렛 단말②' },
      { x: 13, y: 3, name: '룰렛 단말③' },
    ],
    // 해지 단말 — 큰 「혜택 유지」 vs 작은 「해지」(다크패턴 체험). 해지해야 딱지가 사라진다.
    unsub: { x: 9, y: 6, name: '해지 단말',
      ask: '해지 단말 화면이다.\n큼직한 「혜택 계속 받기」 버튼과,\n구석에 조그맣게 「해지」가 적혀 있다.',
      keepReply: '"좋은 선택이에요!" (광고 딱지는 그대로다)',
      cancelReply: '"…정말요? 아쉽네요."\n(광고 딱지가 전부 떨어져 나갔다!)' },
    // 룰렛 뒤 창고 — 비밀조각 열쇠
    chest: { x: 9, y: 9, name: '창고 상자' },
  },

  // ── 4장 구역② 「회원가입 골목」 (type: signup) ────────────────────
  // 갈림길 표지판에서 진짜 도메인을 가려낸다. 오답이면 함정에 걸려 처음으로 되돌아간다.
  signup: {
    map: 'signupalley',
    type: 'signup',
    title: '회원가입 골목',
    objective: '진짜 도메인을 가려 끝까지 가자',
    objectiveCleared: '아케이드로 돌아가자',
    exitTo: { map: 'arcade', x: 16, y: 3 },
    steps: ['signup'],
    hints: {
      signup: [
        '"팻말 두 개, www.arca-de.com이랑\nwww.arca-cle.com…"',
        '"진짜 이름을 살짝 바꿔치기한\n가짜 주소가 있다던데."',
        '"자세히 비교해 봐 — 「arca-de」가\n원래 이름(아케이드)에 더 가까워."',
      ],
    },
    rewards: ['ev_twokeys'],
    clearLines: [
      '골목 끝에서 열쇠를 찾았다.\n본인표 열쇠!',
      '…가짜 주소는, 한 글자 차이였다.',
    ],
    // 갈림길 표지판 — 진짜 도메인을 고른다 (오답=함정 되돌림+wrongTries)
    fork: { x: 9, y: 5, name: '갈림길 표지판',
      ask: '갈림길 팻말 두 개가 나란히 서 있다.\n어느 쪽이 진짜 아케이드로 가는 길일까?',
      options: [
        { label: 'www.arca-de.com 방향', ok: true },
        { label: 'www.arca-cle.com 방향', ok: false },
      ],
      trapReply: '…어라? 다시 처음이잖아.\n수상한 사이트였나 보다. (함정에 걸렸다!)',
      okReply: '이 도메인이 진짜 같다.\n…계속 걸어가 보자.' },
    // 골목 끝 — 본인표 열쇠 (표지판을 통과해야 열린다)
    idchest: { x: 9, y: 9, name: '본인 확인함',
      lockedReply: '…아직 이르다.\n먼저 갈림길에서 진짜 길을 확인하자.' },
  },

  // ── 4장 구역③ 「백스테이지」 (type: backstage) ────────────────────
  // 잠긴 문 앞의 빛나는 마스터키(함정: 카드 일시 도난 → 2단계 인증 창구에서 회수).
  // 정석은 진짜 열쇠 두 개로 여는 문. 복선 4호: 구석의 버튼 더미(MAP_PROPS.backstage).
  backstage: {
    map: 'backstage',
    type: 'backstage',
    title: '백스테이지',
    objective: '진짜 열쇠 두 개로 안쪽 문을 열자',
    objectiveCleared: '아케이드로 돌아가자',
    exitTo: { map: 'arcade', x: 11, y: 3 },
    steps: ['backstage'],
    hints: {
      backstage: [
        '"문 앞에 마스터키가 반짝이는데…\n왠지 손대면 안 될 것 같아."',
        '"지름길은 늘 값을 치르게 하지.\n정석대로, 열쇠 두 개를 챙겨 와."',
        '"비밀조각과 본인표, 둘 다 있으면\n이 문이 저절로 열릴 거야."',
      ],
    },
    rewards: ['ev_offstage'],
    clearLines: [
      '문이 열리고, 무대 뒤로 들어섰다.\n꺼진 조명, 홀로 남은 소품들뿐이다.',
      '…화려했던 무대 뒤는,\n이렇게 조용하고 쓸쓸했다.',
    ],
    // 잠긴 문 앞의 함정 — 빛나는 마스터키(쓰면 카드 일시 도난)
    masterkey: { x: 5, y: 4, name: '빛나는 마스터키' },
    // 2단계 인증 창구 — 도난당한 카드를 되찾는다
    authterm: { x: 13, y: 4, name: '2단계 인증 창구' },
    // 안쪽 문 — 정석은 열쇠 두 개(비밀조각·본인표)
    door: { x: 9, y: 9, name: '잠긴 문' },
  },
};

// 1장 금고 잠금 — 이 구역들을 하나 클리어할 때마다 잠금이 하나 풀린다
const S1_ZONE_PUZZLES = ['traces', 'copies', 'levers'];
// 2장 저울 — 이 구역들을 하나 클리어할 때마다 저울 기울기가 하나 줄어든다 (0이면 보스 문 개방)
const S2_ZONE_PUZZLES = ['voices', 'retrain', 'lamps'];
// 3장 신문사 — 층을 하나 클리어할 때마다 진행도가 하나 늘어난다 (허브 HUD 표시용.
// 층 개방 자체는 needPuzzleClear로 개별 강제되므로 집계는 표시 전용이다)
const S3_ZONE_PUZZLES = ['tips', 'compare', 'broadcast'];
// 4장 아케이드 — 구역①·②를 클리어할 때마다 열쇠(비밀조각·본인표)가 하나씩 모인다.
// 구역③(백스테이지)은 열쇠를 만들어 주지 않는 곁가지 구역이다 (game.js s4KeyCount 참고).
const S4_ZONE_PUZZLES = ['roulette', 'signup', 'backstage'];

function getPuzzleForMap(mapId) {
  for (const k in PUZZLES) {
    if (PUZZLES[k].map === mapId) return Object.assign({ id: k }, PUZZLES[k]);
  }
  return null;
}

// ===== 조사(살펴보기) 텍스트 =====
// 타일 종류에 따른 기본 살펴보기 문구. (언더테일식 소소한 재미)
const EXAMINE_TILES = {
  G: '풀이 부드럽게 돋아 있다.', 2: '어두운 풀숲. 발밑이 서늘하다.',
  P: '잘 다져진 길. 많은 발자국이 지나갔다.',
  F: '예쁜 꽃이 피어 있다. …꺾지 않고 두기로 했다.',
  4: '빛나는 꽃. 가만히 보면 작은 목소리가 새어 나온다.',
  S: '따뜻한 모래. 발자국이 금방 지워진다.',
  Z: '뽀드득. 눈을 밟는 소리가 기분 좋다.',
  C: '동굴 바닥. 발소리가 길게 울린다.', M: '탑의 바닥. 아주 오래된 돌이다.',
  I: '도서관의 낡은 마룻바닥. 삐걱, 소리가 난다.', A: '글리치가 낀 바닥. 밟을 때마다 색이 번진다.',
  E: '낡은 기계 바닥. 먼지가 소복하다.',
  T: '나무다. 이런 그늘만큼은, AI도 못 만들지.',
  J: '눈을 인 나무. 가지를 톡 치니 눈이 후두둑 쏟아진다.',
  3: '어두운 나무. 잎사귀가 바스락거린다.',
  W: '맑은 물. 들여다보니 내 얼굴이 일렁인다.',
  O: '아늑한 지붕. 굴뚝에서 연기가 피어오른다.',
  H: '튼튼한 벽. 누군가의 따뜻한 집이다.',
  R: '커다란 바위. 밀어 봤지만 꿈쩍도 안 한다.',
  K: '차갑고 축축한 동굴 벽이다.', N: '서늘한 탑의 벽. 손끝이 시리다.',
  '*': '맑은 수정. 들여다보면 작은 무지개가 어린다.',
  L: '책이 빼곡하다. 책등마다 누군가의 이름이 적혀 있다.',
  V: '서버 랙. 작은 불빛이 깜빡인다. …아직 무언가, 돌아가고 있다.',
  Q: '거울이다. …방금, 거울 속의 내가 먼저 웃지 않았나?',
  X: '선인장. 가시가 따끔해 보인다. 멀리서 인사만.',
  D: '문이 잠겨 있다. 주인이 잠시 자리를 비운 모양이다.',
  '6': '반짝이는 네온 입구.\n"전부 공짜!" …정말일까?',
  '7': '묵직한 문이다.',
  '8': '비스듬히 기운 포장이다.\n똑바로 선 것 같은데 자꾸 미끄러진다.',
  '9': '칙칙한 문이다. 반짝이지 않아서\n아무도 눈여겨보지 않는다.',
};

// 맵별 특별 살펴보기 지점(좌표). 같은 좌표면 기본 타일 문구보다 우선.
const MAP_PROPS = {
  village: [
    { x: 5, y: 15, text: '경계마을의 연못.\n물고기 대신 작은 빛 알갱이가\n헤엄치고 있다.' },
    { x: 21, y: 14, text: '벽에 붙은 게시판.\n"제1회 AI 바르게 쓰기 그림 대회"\n포스터가 붙어 있다.' },
  ],
  forest: [
    { x: 13, y: 2, text: '나무 둥치에 누군가\n작게 새겨 놓았다.\n"여기서부터, 용기."' },
  ],
  lake: [
    { x: 14, y: 7, text: '호수에 놓인 작은 다리.\n발밑으로 물고기 그림자가\n스쳐 지나간다.' },
  ],
  cave: [
    { x: 3, y: 3, text: '수정 더미.\n수많은 데이터 조각이\n반짝이며 잠들어 있다.' },
  ],
  meadow: [
    { x: 3, y: 4, text: '초원에 외따로 선 나무.\n그늘이 꼭 쉬어 가라는 것 같다.' },
  ],
  desert: [
    { x: 2, y: 2, text: '모래에 반쯤 묻힌 표지석.\n"…데이터센터 가는 길"\n나머지는 모래에 지워졌다.' },
  ],
  snow: [
    { x: 16, y: 9, text: '꽁꽁 언 작은 연못.\n얼음 아래로 작은 빛이\n천천히 헤엄친다.' },
  ],
  castle: [
    { x: 9, y: 9, text: '먼지 쌓인 왕좌.\n앉았던 자리만 닳아 있다.\n…꽤 오래 혼자였구나.' },
  ],
  serverroom: [
    { x: 2, y: 2, text: '꺼진 모니터.\n전원을 넣자 한 줄이 떠오른다.\n"프로젝트 0호 — 마지막 백업"' },
  ],
  ownerroom: [
    // 스토리 복선 — 조사하면 flags.seenPhoto1이 기록된다 (flag: game.js interact)
    { x: 9, y: 1, flag: 'seenPhoto1',
      text: '서랍 깊은 곳에 낡은 사진이 있다.\n하얀 가운의 어른과… 작은 아이?' },
  ],
  // 2장 표본 창고 — 오판정 라벨 개그(선반) + 복선 2호(모서리 선반)
  samplehouse: [
    { x: 3, y: 0, text: '선반 라벨: 「위험 99%」\n…라벨 아래엔, 방긋 웃는\n강아지 사진이 붙어 있다.' },
    { x: 11, y: 0, text: '선반 라벨: 「안전 100%」\n…라벨 아래엔, 뾰족한\n가위 사진이 붙어 있다.' },
    { x: 18, y: 0, text: '선반 라벨: 「전부 위험」\n…라벨 아래 칸은,\n그냥 텅 비어 있다.' },
    // 복선 2호 — 조사하면 flags.seenPhoto2 (설명 없이 이 한 줄만)
    { x: 0, y: 13, flag: 'seenPhoto2',
      text: '모서리 선반의 사진 뭉치.\n…한 아이의 사진마다, ×표가\n그어져 있다.' },
  ],
  // 3장 편집실 — 복선 3호(미송출 기사 서랍)
  editroom: [
    { x: 17, y: 11, flag: 'seenArticle',
      text: '미송출 기사함이다.\n"[단독] 프로젝트 0호, 오늘 폐기…\n…기사는 끝내 나가지 못했다."' },
  ],
  // 4장 백스테이지 — 복선 4호(구석의 버튼 더미) + 꺼진 조명 소품 묘사
  backstage: [
    { x: 2, y: 11, flag: 'seenButtons',
      text: '구석에 버튼 더미가 산처럼 쌓여 있다.\n"접속 요청" 버튼들 — 아무도\n눌러 주지 않은 채였다.' },
    { x: 17, y: 2, text: '꺼진 조명 옆에, 반짝이\n한때 쓰던 소품들이 홀로 놓여 있다.\n먼지가 소복하다.' },
  ],
  library: [
    { x: 7, y: 2, text: '한 권만 거꾸로 꽂힌 책.\n표지에 작게 ≪0≫.\n…펴 보려 하자 스르륵 닫힌다.' },
  ],
  mirrors: [
    { x: 7, y: 4, text: '유난히 깨끗한 거울.\n거울 속 네가, 너보다\n반 박자 늦게 손을 든다.' },
  ],
  garden: [
    { x: 13, y: 8, text: '작은 화분.\n흙에 이름표가 꽂혀 있다.\n"영이가 심음 — 물 주는 거 잊지 마"' },
  ],
  core: [
    { x: 9, y: 13, text: '바닥에 흐릿한 분필 자국.\n키 재기 눈금이다.\n맨 아래 칸에 "영이"라고\n적혀 있다.' },
  ],
};

function getPropAt(mapId, x, y) {
  const list = MAP_PROPS[mapId];
  if (!list) return null;
  return list.find((p) => p.x === x && p.y === y) || null;
}

function getExamineTile(ch) {
  return EXAMINE_TILES[ch] || null;
}
