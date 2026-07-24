// 도트 스프라이트 정의 (16x16 문자 맵)
// '.' = 투명, 나머지 문자는 팔레트에서 색을 찾음

const BASE_PAL = {
  h: '#5b3a1e', // 머리
  f: '#ffd9a0', // 피부
  e: '#222233', // 눈
  r: '#e0453a', // 옷
  b: '#2a4fa0', // 바지
  w: '#ffffff',
  k: '#0c0c0c',
  p: '#9b5de5', // 보라
  g: '#5cb85c', // 초록
  l: '#4ea8de', // 파랑
  o: '#f08a24', // 주황
  n: '#f48fb1', // 분홍
  d: '#3a2e4d', // 어두운 보라
  y: '#ffd644', // 노랑
  c: '#b07b3f', // 나무/연필
  x: '#9aa0b0', // 회색
  q: '#d62828', // 빨강
  v: '#7bd1f0', // 하늘
  i: '#3a64b4', // 줄무늬 강조 (파랑)
  u: '#39354f', // 바지·신발 (어두운 남보라)
};

// ---- 플레이어 (방향별 2프레임) ----
// 언더테일풍 — 또렷한 눈(흰자 w + 동공 e), 가로 줄무늬 스웨터(r/i), 보이는 입(n), 구두(k)
const PLAYER_DOWN_0 = [
  '................',
  '.....hhhhhh.....',
  '....hhhhhhhhh...',
  '...hhhhhhhhhhh..',
  '...hfffffffhh...',
  '...ffwefwefff...',
  '...fffeffefff...',
  '....ffffnfff....',
  '....rrrrrrrr....',
  '...rriiiiiirr...',
  '...rrrrrrrrrr...',
  '..ffriiiiirff...',
  '....rrrrrrrr....',
  '.....uuu.uuu....',
  '.....uu...uu....',
  '......kk.kk.....',
];
const PLAYER_DOWN_1 = [
  '................',
  '.....hhhhhh.....',
  '....hhhhhhhhh...',
  '...hhhhhhhhhhh..',
  '...hfffffffhh...',
  '...ffwefwefff...',
  '...fffeffefff...',
  '....ffffnfff....',
  '....rrrrrrrr....',
  '...rriiiiiirr...',
  '...rrrrrrrrrr...',
  '..ffriiiiirff...',
  '....rrrrrrrr....',
  '.....uu..uuu....',
  '....uu.....uu...',
  '.....kk...kk....',
];
const PLAYER_UP_0 = [
  '................',
  '.....hhhhhh.....',
  '....hhhhhhhhh...',
  '...hhhhhhhhhhh..',
  '...hhhhhhhhhhh..',
  '...hhhhhhhhhhh..',
  '....hhhhhhhhhh..',
  '....ffffffffff..',
  '....rrrrrrrr....',
  '...rriiiiiirr...',
  '...rrrrrrrrrr...',
  '..ffriiiiirff...',
  '....rrrrrrrr....',
  '.....uuu.uuu....',
  '.....uu...uu....',
  '......kk.kk.....',
];
const PLAYER_UP_1 = [
  '................',
  '.....hhhhhh.....',
  '....hhhhhhhhh...',
  '...hhhhhhhhhhh..',
  '...hhhhhhhhhhh..',
  '...hhhhhhhhhhh..',
  '....hhhhhhhhhh..',
  '....ffffffffff..',
  '....rrrrrrrr....',
  '...rriiiiiirr...',
  '...rrrrrrrrrr...',
  '..ffriiiiirff...',
  '....rrrrrrrr....',
  '.....uu..uuu....',
  '....uu.....uu...',
  '.....kk...kk....',
];
const PLAYER_LEFT_0 = [
  '................',
  '......hhhhhh....',
  '.....hhhhhhhhh..',
  '....hhhhhhhhhhh.',
  '....hfffffhhhh..',
  '....fwefffffhh..',
  '....ffefffffh...',
  '.....fffnffff...',
  '....rrrrrrrr....',
  '...rriiiiiirr...',
  '...rrrrrrrrrr...',
  '....riiiiirff...',
  '....rrrrrrrr....',
  '.....uuu.uuu....',
  '.....uu...uu....',
  '......kk.kk.....',
];
const PLAYER_LEFT_1 = [
  '................',
  '......hhhhhh....',
  '.....hhhhhhhhh..',
  '....hhhhhhhhhhh.',
  '....hfffffhhhh..',
  '....fwefffffhh..',
  '....ffefffffh...',
  '.....fffnffff...',
  '....rrrrrrrr....',
  '...rriiiiiirr...',
  '...rrrrrrrrrr...',
  '....riiiiirff...',
  '....rrrrrrrr....',
  '.....uu..uuu....',
  '....uu.....uu...',
  '.....kk...kk....',
];

const PLAYER_SPRITES = {
  down: [PLAYER_DOWN_0, PLAYER_DOWN_1],
  up: [PLAYER_UP_0, PLAYER_UP_1],
  left: [PLAYER_LEFT_0, PLAYER_LEFT_1],
  // right는 left를 좌우 반전해서 그림
};

// ---- NPC 공용 몸체 (팔레트 교체용) — 둥근 체형, 넓은 옷, 짧은 다리 ----
const NPC_DOWN_0 = [
  '................',
  '....hhhhhhhh....',
  '...hhhhhhhhhh...',
  '..hhhhhhhhhhhh..',
  '..hffffffffffff.',
  '..fwwefffwwefff.',
  '..fffeffffefffff',
  '...fffnnnnffff..',
  '...rrrrrrrrrr...',
  '..rrrrrrrrrrrr..',
  '..frrrrrrrrrrrf.',
  '..rrrrrrrrrrrr..',
  '...bbbbbbbbbb...',
  '...bbbb..bbbb...',
  '...kkk....kkk...',
  '................',
];
const NPC_DOWN_1 = [
  '................',
  '....hhhhhhhh....',
  '...hhhhhhhhhh...',
  '..hhhhhhhhhhhh..',
  '..hffffffffffff.',
  '..fwwefffwwefff.',
  '..fffeffffefffff',
  '...fffnnnnffff..',
  '...rrrrrrrrrr...',
  '..rrrrrrrrrrrr..',
  '..frrrrrrrrrrrf.',
  '..rrrrrrrrrrrr..',
  '...bbbbbbbbbb...',
  '...bbb...bbbb...',
  '..kkk......kkk..',
  '................',
];
const NPC_SPRITES = { down: [NPC_DOWN_0, NPC_DOWN_1] };

// ---- NPC (NPC 공용 몸체 + 팔레트 교체) ----
const NPC_PALETTES = {
  prof:     { h: '#cfcfcf', r: '#f5f5f5', b: '#54585f' }, // 흰 가운 박사님
  kid:      { h: '#222222', r: '#ffd644', b: '#3a8f3a' }, // 노란 옷 아이
  grandma:  { h: '#e8e8e8', r: '#b06ab3', b: '#6d4c8f' }, // 할머니
  guard:    { h: '#3a3a3a', r: '#4ea8de', b: '#2a4fa0' }, // 파란 옷 안내원
  traveler: { h: '#7a4a2a', r: '#3a8f3a', b: '#5a4a3a' }, // 초록 옷 여행자
  merchant: { h: '#3a3a3a', r: '#c08a2a', b: '#6a4a2a' }, // 사막 상인
  mittens:  { h: '#a05a2a', r: '#e078a0', b: '#7a5aa0' }, // 분홍 옷 소녀
};

// ---- 인물(여덟 조각) ----
const MONSTER_SPRITES = {
  // 살금이: 죄책감을 느끼며 몰래 숨는 보라색 유령 (조연)
  mollaemon: [
    '................',
    '.....jjjj.......',
    '....jaaaaj......',
    '...jaaaaaaj.....',
    '..jaaaaaaaj.v...',
    '..jawwaawwaj....',
    '..jaeewweeaj....',
    '..jaaaaaaaaj....',
    '..jaaannaaj.....',
    '..jaaaaaaaaj....',
    '..jjaaaaajj.....',
    '..jaj..jaj......',
    '...jj...jj......',
    '................',
    '................',
    '................',
  ],
  // 따라: 수줍은 따라쟁이(연필)
  bekkyeomon: [
    '..............k.',
    '.............yc.',
    '....jjjjj...yc..',
    '...jgggggj.yc...',
    '..jgmggggjjc....',
    '..jgwwggwwjc....',
    '..jgweggewj.....',
    '..jggggggggj....',
    '..jgngggngj.....',
    '..jggnnnggj.....',
    '..jggggggggj....',
    '...jgggggj......',
    '...jjgggjj......',
    '....j...j.......',
    '................',
    '................',
  ],
  // 헛소리: 헛소문을 퍼뜨리며 수다스러운 파란 아이 (조연)
  geojitmon: [
    '................',
    '....jjjjjj......',
    '...jaaaaaaj.....',
    '..jaaaaaaaaj....',
    '..jawwaawwaj....',
    '..jaeeaaeeaj....',
    '..jaaaaaaaaj....',
    '..jakkkkkkaj....',
    '..jakwwwwkaj....',
    '..jakwwwwkaj....',
    '..jakkkkkkaj....',
    '...jaaaaaaj.....',
    '...jjaaaajj.....',
    '....jj..jj......',
    '................',
    '................',
  ],
  // 기울: 편향·기울어짐
  pyeonhyangmon: [
    '................',
    '...zzzz.........',
    '..zqqqqz........',
    '..zqqqqqz.......',
    '..zqwwqeqz......',
    '..zqweqqqz......',
    '..zqqqqqqz......',
    '...zqqqqqqz.....',
    '...zqqqqqqqz....',
    '....zqqqqqqz....',
    '....zqqqqqqqz...',
    '.....zqqqqqz....',
    '.....zqqqqqz....',
    '......zz.zz.....',
    '................',
    '................',
  ],
  // 중독: 스마트폰만 보는 분홍 인물 (소용돌이 눈, 폰 화면)
  gatimmon: [
    '................',
    '....jjjjjj......',
    '...jaaaaaaj.....',
    '..jaaaaaaaaj....',
    '..javjavjaaj....',
    '..jajvjavjaj....',
    '..javjvavjaj....',
    '..jaaaaaaaaj....',
    '..jaannaanaj....',
    '..jaaaaaaaaj....',
    '..jjaaaaaajj....',
    '.ja.jaaaaj..aj..',
    '..j..jaaaj...j..',
    '.....jj.jj......',
    '................',
    '................',
  ],
  // 멋대로몬: 사람 확인 없이 멋대로 행동하는 주황 로봇 (안테나, 화면 얼굴, 팔)
  hollimmon: [
    '................',
    '....zzzzzz......',
    '...zpppppppz....',
    '..zppppppppz....',
    '..zpzzppzzpz....',
    '..zpkzppzkpz....',
    '..zppppppppz....',
    '..zppnnnnppz....',
    '..zppppppppz....',
    '..zppppppppz....',
    '.zppppppppppz...',
    '.zp.zp.zp.zpz...',
    '.z.zp.zp.zp.z...',
    '..z.p..p..z.....',
    '................',
    '................',
  ],
  // ---- 스테이지 5 ----
  // 메아리몬: 배운 것을 되묻는 하늘색 유령 (반투명 하단)
  finalboss: [
    '................',
    '.....zzzzz......',
    '...zzuuuuuzz....',
    '..zuuuuuuuuuz...',
    '..zuuuuuuuuuz...',
    '..zummuuummuz...',
    '..zuuuuuuuuuz...',
    '..zuuuuuuuuuz...',
    '..zuuummmuuuz...',
    '..zuuuuuuuuuz...',
    '..zzuuuuuuuzz...',
    '...zzuuuuuzz....',
    '....zzzzzzz.....',
    '.....z.z.z......',
    '................',
    '................',
  ],
  // ---- 스테이지 6: 잊혀진 서버실 ----
  // 뚫림이: 잠긴 것은 모두 뚫어 버리는 회색 인물 (드릴 팔)
  girokmon: [
    '................',
    '....jjjjjj......',
    '...jccccccj.....',
    '..jccccccccj....',
    '..jcwwccwwcj....',
    '..jcweccewcj....',
    '..jccccccccj....',
    '..jcqqqqqqcj....',
    '..jcqwwwwqcj....',
    '..jcqqqqqqcj....',
    '..jccccccccj....',
    '...jccccccj.....',
    '...jj.cc.jj.....',
    '.....cc.cc......',
    '................',
    '................',
  ],
  // ---- 스테이지 7: 기억의 도서관 ----
  // 담아: 독차지·수집
  sujipmon: [
    '................',
    '....ssssss......',
    '...soooooos.....',
    '..sowwoowwos....',
    '..soweooewos....',
    '..soooooooos....',
    '..sokkkkkkos....',
    '..sokcqcckos....',
    '..sokccyckos....',
    '..sokkkkkkos....',
    '..sokcqcckos....',
    '..sokccqckos....',
    '..sokkkkkkos....',
    '..soooooooos....',
    '...ss....ss.....',
    '................',
  ],
  // 사서: 모두의 기억을 혼자 끌어안은 책 인물 (스테이지 7 보스)
  yuhokmon: [
    '..a.......a....a',
    '....tttttt......',
    '...tnnnnnnt.....',
    '..tnnnnnnnnt....',
    '..tnwywnnwywnt..',
    '..tnykynnykynt..',
    '..tnwywnnwywnt..',
    '..tnnnnnnnnnnt..',
    '..tnnyyyyyynnt..',
    '..tnnnnnnnnnnt..',
    '..ttnnnnnnnntt..',
    'a.tnnnnnnnnnnt.a',
    '...tt....tt.....',
    '..a.........a...',
    '................',
    '................',
  ],
  // 속삭임: 외로움이 모여 태어난 안개 인물 (스테이지 9 보스, 촉수 하단)
  yeongi: [
    '................',
    '....vvvvvv......',
    '...vwwwwwwv.....',
    '..vwwwwwwwwv....',
    '..vwwjwwjwwv....',
    '..vwwkwwkwwv....',
    '..vwwwwwwwwv....',
    '..vwwwnnwwwv....',
    '..vwwwwwwwwv....',
    '..vwjwwwwjwv....',
    '..vwwjjjjwwv....',
    '..vwwwwwwwwv....',
    '..vwwwwwwwwv....',
    '..vw.vw.vw.v....',
    '...v..v..v......',
    '................',
  ],
  // 돌보미(고트): 마음을 가르치는 흰 염소 어른 — 언더테일 토리엘풍
  caretaker: [
    '.....ww..ww.....',
    '....wwww.wwww...',
    '....wnnw.wnnw...',
    '....wwwwwwww....',
    '...wwwwwwwwww...',
    '..wwwwwwwwwwww..',
    '..wwwewwwwewww..',
    '..wwwwwnwwwwww..',
    '...wwwwwwwwww...',
    '....wwwnnwww....',
    '.....wwwwww.....',
    '...pppppppppp...',
    '..pppppppppppp..',
    '..pppwppppwppp..',
    '..pp.pppppp.pp..',
    '................',
  ],
};

// ---- 보너스 지역: AI 미래연구소 ----
// 그럴싸: 환각·그럴듯한 가짜
MONSTER_SPRITES.hwangakmon = [
  '....yyyyyy......',
  '................',
  '..iiiiiiiiii....',
  '..iillllllii.v..',
  '..ilwwllwwli....',
  '..ilwellewli.v..',
  '..illlllllli....',
  '..ilwwwwwwli.v..',
  '..illlllllli....',
  '..iillllllii....',
  '...iilliili.....',
  '....ii..ii......',
  '................',
  '................',
  '................',
  '................',
];
// 붙임: 합성·딥페이크로 진짜와 가짜 얼굴을 이어 붙인 인물 (조연)
MONSTER_SPRITES.hapseongmon = [
  '................',
  '....jj|jj.......',
  '...jaa|vvj......',
  '..jaaa|vvvj.....',
  '..jaww|vevj.....',
  '..jawe|vovj.....',
  '..jaaa|vvvj.....',
  '..jaaa|vvvj.....',
  '..jaaa|vvvj.....',
  '..jmaa|vvmj.....',
  '..jjaa|vvjj.....',
  '...jaa|vvj......',
  '...jja|vjj......',
  '....j|.|j.......',
  '................',
  '................',
];
// 미래: 두 오류가 합쳐진 보너스 미니보스 (회로 + 빨간 눈)

// ---- 스테이지 2~3 서브맵 신규 인물 ----
// 소문: 소문을 퍼뜨리는 확성기 입 인물 (주황)
// 또또: 무시하며 귀를 막는 연두색 인물 (조연)
MONSTER_SPRITES.musimon = [
  '................',
  '....jjjjjj......',
  '...jaaaaaaj.....',
  '.jjaaaaaaaajj...',
  'ja.jaaaaaaj.aj..',
  'ja.jaeeeeaj.aj..',
  'ja.jaaaaaaj.aj..',
  'jj.jaaeeaaj.jj..',
  '...jaaaaaaj.....',
  '...jaaaaaaj.....',
  '...jjaaaajj.....',
  '....jaaaaj......',
  '....jj..jj......',
  '................',
  '................',
  '................',
];
// 낭비: 전기를 펑펑 쓰는 노랑 인물 (번개·꺼지는 불빛)
// 핑계: 남을 가리키는 긴 팔의 초록 인물

// 스프라이트별 팔레트 — v2 캐릭터마다 색 문자(z,m,v 등)를 다르게 재사용하므로 개별 지정.

// 반디 — 동행자(안내 AI를 자칭하는 작은 반딧불). 정체는 영이의 가면.
MONSTER_SPRITES.bandi = [
  '................',
  '................',
  '.......a........',
  '......aba.......',
  '.....abbba......',
  '....abbbbba.....',
  '....abbcbba.....',
  '....abbbbba.....',
  '.....abbba......',
  '......aba.......',
  '.......a........',
  '.....d..........',
  '........d.......',
  '................',
  '................',
  '................',
];

const MONSTER_PAL = {
  bandi: { a: '#e0a53a', b: '#ffe08a', c: '#fff8e0', d: '#8a6a20' },
  bekkyeomon: { j: '#2f7d32', m: '#7fd47f' },
  sujipmon: { s: '#b5541a' },
  pyeonhyangmon: { z: '#8f1d1d' },
  hwangakmon: { v: '#8fe3ff' },
  yuhokmon: { t: '#c94f8a', a: '#fff6c0' },
  hollimmon: { z: '#c9a6f0' },
  finalboss: { z: '#2a2740', m: '#6f6a94' },
  yeongi: { v: '#bfe6ff', j: '#7fd4ff' },
  // ---- 조연 6종 ----
  mollaemon: { a: '#a892c9', j: '#5f5182', v: '#9fd8f0' },
  girokmon: { c: '#b98a3e', j: '#6e4f22' },
  gatimmon: { a: '#3fc7c7', j: '#1f6e6e', v: '#bff0f0' },
  musimon: { a: '#9ab84a', j: '#5c6e28' },
  geojitmon: { a: '#5aa8e0', j: '#2c5f8f' },
  hapseongmon: { a: '#b9b9c4', j: '#5a5a66', v: '#3fc7c7', m: '#1f6e6e', '|': '#3a3a44' },
};

// 그림자 스토커 (흔적의 방) — 준 정보가 3개를 넘으면 나타나 플레이어를 따라온다.
// 어두운 후드 형체 + 붉게 빛나는 눈 (대미지는 없지만 불안하게).
const STALKER_SPRITE = [
  '................',
  '......dddd......',
  '.....dddddd.....',
  '....dddddddd....',
  '...dddddddddd...',
  '...dddddddddd...',
  '...dqddddddqd...',
  '...dddddddddd...',
  '..dddddddddddd..',
  '..dddddddddddd..',
  '..dddddddddddd..',
  '..dddddddddddd..',
  '..dkddddddddkd..',
  '...dd.dddd.dd...',
  '....d..dd..d....',
  '................',
];

// 스프라이트 렌더 캐시
const _spriteCache = new Map();
// 스프라이트 배열마다 짧은 고유 id를 붙여, 매 프레임 256자 join을 피한다.
// (저사양 교실 태블릿에서 프레임마다 일어나던 문자열 할당/GC 부담을 줄임)
let _spriteSeq = 0;
const _spriteIds = new WeakMap();
function _spriteId(rows) {
  let id = _spriteIds.get(rows);
  if (id === undefined) { id = ++_spriteSeq; _spriteIds.set(rows, id); }
  return id;
}

function drawSprite(ctx, rows, x, y, scale, palOverride, flip) {
  const key = _spriteId(rows) + '|' + (palOverride ? JSON.stringify(palOverride) : '') + '|' + scale + (flip ? 'F' : '');
  let cv = _spriteCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = 16 * scale;
    cv.height = 16 * scale;
    const c = cv.getContext('2d');
    const pal = Object.assign({}, BASE_PAL, palOverride || {});
    for (let ry = 0; ry < rows.length; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.') continue;
        c.fillStyle = pal[ch] || '#f0f';
        const px = flip ? (15 - rx) : rx;
        c.fillRect(px * scale, ry * scale, scale, scale);
      }
    }
    _spriteCache.set(key, cv);
  }
  ctx.drawImage(cv, x, y);
}

// 배틀 표정 오버레이(N-1) — 인물별 얼굴 기준점 (16×16 스프라이트 픽셀 좌표, 눈 근처)
// 땀·홍조·눈물이 이 기준점 주변에 그려진다. 없으면 기본값 (8,6).
const MONSTER_FACE = {
  bekkyeomon: { ex: 8, ey: 6 },
  sujipmon: { ex: 8, ey: 7 },
  pyeonhyangmon: { ex: 8, ey: 6 },
  hwangakmon: { ex: 8, ey: 6 },
  yuhokmon: { ex: 8, ey: 6 },
  hollimmon: { ex: 8, ey: 7 },
  finalboss: { ex: 8, ey: 6 },
  yeongi: { ex: 8, ey: 6 },
};

// 마음 상태 오버레이 — 스프라이트 위에 감정 픽셀을 얹는다 (캐시 밖, 매 프레임).
//   shaken: 땀방울 / open: 홍조 + 반짝 / flinch: 흠칫(!) / mercy: 눈물 + 온기
function drawMonMood(ctx, id, x, y, scale, mood, t) {
  const f = MONSTER_FACE[id] || { ex: 8, ey: 6 };
  const S = scale;
  const px = (gx, gy, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + gx * S, y + gy * S, (w || 1) * S, (h || 1) * S);
  };
  if (mood === 'shaken') {
    // 땀방울 — 관자놀이에서 또르르 (시간에 따라 살짝 흘러내린다)
    const drop = Math.floor((t / 20) % 3);
    px(f.ex + 5, f.ey - 3 + drop, 1, 1, '#bfe3ff');
    px(f.ex + 5, f.ey - 2 + drop, 1, 2, '#8ecbff');
  } else if (mood === 'open') {
    // 홍조 — 양볼 + 머리 위 작은 반짝
    px(f.ex - 4, f.ey + 2, 2, 1, 'rgba(255,150,160,0.8)');
    px(f.ex + 2, f.ey + 2, 2, 1, 'rgba(255,150,160,0.8)');
    if (Math.floor(t / 12) % 2 === 0) px(f.ex + 5, f.ey - 6, 1, 1, '#ffd644');
  } else if (mood === 'flinch') {
    // 흠칫 — 머리 위 노란 ! (마음에 말이 닿은 순간)
    px(f.ex + 4, f.ey - 8, 1, 3, '#ffd644');
    px(f.ex + 4, f.ey - 4, 1, 1, '#ffd644');
  } else if (mood === 'mercy') {
    // 눈물 한 방울 + 은은한 온기
    px(f.ex - 3, f.ey + 1, 1, 2, '#8ecbff');
    if (Math.floor(t / 14) % 2 === 0) {
      px(f.ex - 6, f.ey - 5, 1, 1, 'rgba(255,214,68,0.7)');
      px(f.ex + 6, f.ey - 4, 1, 1, 'rgba(255,214,68,0.7)');
    }
  }
}

// 인물 스프라이트 그리기 — 스프라이트별 팔레트(MONSTER_PAL)를 자동 적용.
// mood(선택)를 주면 배틀 표정 오버레이를 함께 그린다 (t = 애니메이션용 시간).
function drawMon(ctx, id, x, y, scale, flip, mood, t) {
  // 첫 보스 「따라」는 월드·수첩·배틀에서 같은 고해상도 표정 시트를 공유한다.
  // PNG 로딩 전이나 Node 검증 환경에서는 아래의 16×16 원본으로 즉시 폴백한다.
  if (id === 'bekkyeomon' && typeof GAME_ART !== 'undefined') {
    const anchor = 16 * scale;
    const size = scale >= 6 ? Math.round(scale * 23) : Math.max(56, Math.round(scale * 20));
    const dx = Math.round(x + anchor / 2 - size / 2);
    const dy = Math.round(y + anchor - size * 0.9);
    if (GAME_ART.drawTtara(ctx, mood || 'closed', dx, dy, size)) return;
  }
  drawSprite(ctx, MONSTER_SPRITES[id], x, y, scale, MONSTER_PAL[id] || null, flip);
  if (mood && mood !== 'closed') drawMonMood(ctx, id, x, y, scale, mood, t || 0);
}
