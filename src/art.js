// 에셋 로더 + 그리기 유틸 — 방과 후: 그림자 학교
// 왜 fetch를 안 쓰나: file:// 더블클릭 실행 보장이 기준서 요구사항이라
// 로컬 파일을 XHR로 못 읽는다. 이미지는 Image 태그, 데이터는 script 태그로만 싣는다.
(function (g) {
  'use strict';

  var TILE = 16, SCALE = 3, T = TILE * SCALE; // 원본 16px, 화면 48px

  // ── 스프라이트 시트 실측 (2026-07-26, 확대 렌더로 육안 판별) ─────────────
  // char/*.png = 64x112 = 4열 x 7행 (16px 격자).
  //   열(col) = 방향:  0=아래(정면, 눈 2개)  1=위(뒤통수, 눈 없음)
  //                    2=왼쪽(눈 1개 왼쪽)   3=오른쪽(눈 1개 오른쪽)
  //   행(row) = 걷기 프레임: 0=정지, 1=한 발, 2=정지(0과 픽셀 동일), 3=반대 발
  //   -> 걷기 순환은 0,1,2,3 을 그대로 돌리면 된다.
  //   행 4~6 은 공격/특수 모션. 이번 슬라이스는 쓰지 않는다.
  var DIR = { down: 0, up: 1, left: 2, right: 3 };
  var WALK_FRAMES = 4;

  // 팩(Ninja Adventure) 팔레트에서 뽑은 색만 쓴다. 자작 소품도 이 안에서만.
  var PAL = {
    ink: '#181c20', night: '#241a2c', deepShadow: '#2a2030',
    cream: '#f7e0bd', tan: '#e0a878', orange: '#e8783c', deep: '#b8552a',
    wood: '#c9884e', woodDark: '#8a5a30',
    board: '#39584a', boardLine: '#8fb39a',
    metal: '#93a7ae', metalDark: '#5b7079',
    paper: '#f4efe4', ribbon: '#f0c86e',
    purple: '#3a2b4a', purpleLit: '#a86ad8',
    white: '#f2eef2', red: '#d84a3c', blue: '#78bcd8', green: '#5f8a4e'
  };

  var SHEETS = [
    { id: 'floor', src: 'assets/pack/map/interior_floor.png' },
    { id: 'wall', src: 'assets/pack/map/wall_simple.png' },
    { id: 'student', src: 'assets/pack/char/student.png' },
    { id: 'mate', src: 'assets/pack/char/teacher_blue.png' },
    { id: 'teacher', src: 'assets/pack/char/teacher_green.png' },
    { id: 'dropShadow', src: 'assets/pack/char/drop_shadow.png' },
    { id: 'crate', src: 'assets/pack/props/crate.png' },
    { id: 'heart', src: 'assets/pack/props/heart.png' },
    { id: 'pot', src: 'assets/pack/props/pot.png' }
  ];

  var imgs = {}, tintCv = null, tintCx = null;

  function load(list, done) {
    var n = list.length, seen = 0, missing = [];
    if (!n) { done(missing); return; }
    list.forEach(function (it) {
      var im = new Image();
      im.onload = function () { imgs[it.id] = im; if (++seen >= n) done(missing); };
      im.onerror = function () { missing.push(it.id); if (++seen >= n) done(missing); };
      im.src = it.src;
    });
  }

  function img(id) { return imgs[id] || null; }
  function ready(id) { return !!imgs[id]; }

  // 시트의 (col,row) 16px 칸을 화면 48px 칸으로. 시트가 없으면 조용히 넘긴다.
  function drawTile(ctx, id, col, row, dx, dy, size) {
    var im = imgs[id]; if (!im) return false;
    var s = size || T;
    ctx.drawImage(im, col * TILE, row * TILE, TILE, TILE, dx, dy, s, s);
    return true;
  }

  function drawSprite(ctx, id, sx, sy, sw, sh, dx, dy, dw, dh) {
    var im = imgs[id]; if (!im) return false;
    ctx.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh);
    return true;
  }

  // 캐릭터 한 칸. cx = 발 중심 x, fy = 발 y. scale 기본 3배(48px).
  function drawChar(ctx, id, dir, frame, cx, fy, opt) {
    opt = opt || {};
    var sc = opt.scale || SCALE, size = TILE * sc;
    var dx = Math.round(cx - size / 2), dy = Math.round(fy - size + 4);
    if (opt.shadow !== false) drawDropShadow(ctx, cx, fy, sc);
    var col = dir | 0, row = (frame | 0) % WALK_FRAMES;
    if (opt.possessed) { drawPossessed(ctx, id, col, row, dx, dy, size, sc); return; }
    if (!drawTile2(ctx, id, col, row, dx, dy, size)) {
      ctx.fillStyle = PAL.purple; ctx.fillRect(dx, dy, size, size);
    }
  }

  function drawTile2(ctx, id, col, row, dx, dy, size) {
    var im = imgs[id]; if (!im) return false;
    ctx.drawImage(im, col * TILE, row * TILE, TILE, TILE, dx, dy, size, size);
    return true;
  }

  // 씌임 연출: 별도 에셋 없이 원본 실루엣에 보라-검정 틴트를 얹고 눈만 보라로 켠다.
  function drawPossessed(ctx, id, col, row, dx, dy, size, sc) {
    var im = imgs[id];
    if (im && ensureTint()) {
      tintCx.clearRect(0, 0, TILE, TILE);
      tintCx.drawImage(im, col * TILE, row * TILE, TILE, TILE, 0, 0, TILE, TILE);
      tintCx.globalCompositeOperation = 'source-atop';
      tintCx.fillStyle = 'rgba(40,20,60,0.82)';
      tintCx.fillRect(0, 0, TILE, TILE);
      tintCx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tintCv, 0, 0, TILE, TILE, dx, dy, size, size);
    } else {
      ctx.fillStyle = 'rgba(40,20,60,0.85)';
      ctx.fillRect(dx + sc * 2, dy + sc, size - sc * 4, size - sc * 2);
    }
    // 눈 두 점 (정면/좌우에 따라 위치만 살짝 옮긴다)
    ctx.fillStyle = PAL.purpleLit;
    var ey = dy + sc * 6, gap = sc * 4;
    var ox = col === 2 ? -sc : (col === 3 ? sc : 0);
    if (col === 1) return; // 뒤통수는 눈이 안 보인다
    ctx.fillRect(dx + size / 2 - gap + ox - sc, ey, sc * 2, sc * 2);
    ctx.fillRect(dx + size / 2 + gap + ox - sc, ey, sc * 2, sc * 2);
  }

  function ensureTint() {
    if (tintCx) return true;
    if (typeof document === 'undefined' || !document.createElement) return false;
    tintCv = document.createElement('canvas');
    tintCv.width = TILE; tintCv.height = TILE;
    tintCx = tintCv.getContext && tintCv.getContext('2d');
    return !!tintCx;
  }

  function drawDropShadow(ctx, cx, fy, sc) {
    var w = 12 * sc, h = 8 * sc;
    if (!drawSprite(ctx, 'dropShadow', 0, 0, 12, 8, Math.round(cx - w / 2), Math.round(fy - h / 2), w, h)) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(Math.round(cx - w / 2), Math.round(fy - h / 2), w, h);
    }
  }

  // ── 자작 소품: 팩 팔레트 색만 쓰는 캔버스 도형(별도 에셋 파일 없음) ──────
  function px(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  var PROPS = {
    desk: function (ctx, x, y, s) {          // 책걸상
      px(ctx, PAL.ink, x + 4, y + 12, s - 8, s - 18);
      px(ctx, PAL.wood, x + 4, y + 12, s - 8, 10);
      px(ctx, PAL.woodDark, x + 4, y + 22, s - 8, 4);
      px(ctx, PAL.metalDark, x + 8, y + 26, 5, s - 30);
      px(ctx, PAL.metalDark, x + s - 13, y + 26, 5, s - 30);
      px(ctx, PAL.metal, x + 6, y + 30, s - 12, 5);
    },
    board: function (ctx, x, y, s) {          // 칠판
      px(ctx, PAL.woodDark, x, y + 10, s, s - 14);
      px(ctx, PAL.board, x + 2, y + 13, s - 4, s - 21);
      px(ctx, PAL.boardLine, x + 7, y + 20, s - 22, 3);
      px(ctx, PAL.boardLine, x + 7, y + 28, s - 30, 3);
      px(ctx, PAL.cream, x + s - 14, y + s - 11, 8, 3);
    },
    locker: function (ctx, x, y, s) {         // 사물함
      px(ctx, PAL.ink, x + 2, y + 4, s - 4, s - 6);
      px(ctx, PAL.metal, x + 4, y + 6, s - 8, s - 10);
      px(ctx, PAL.metalDark, x + 4, y + 6 + (s - 10) / 2 - 1, s - 8, 3);
      px(ctx, PAL.ink, x + s - 12, y + 14, 4, 4);
      px(ctx, PAL.ink, x + s - 12, y + 14 + (s - 10) / 2, 4, 4);
    },
    door: function (ctx, x, y, s) {           // 복도 문
      px(ctx, PAL.ink, x + 3, y + 3, s - 6, s - 6);
      px(ctx, PAL.wood, x + 6, y + 6, s - 12, s - 10);
      px(ctx, PAL.woodDark, x + 10, y + 12, s - 20, 12);
      px(ctx, PAL.ribbon, x + s - 15, y + s / 2, 5, 5);
    },
    stairsLocked: function (ctx, x, y, s) {   // 잠긴 계단 문
      px(ctx, PAL.ink, x + 2, y + 2, s - 4, s - 4);
      px(ctx, PAL.metalDark, x + 5, y + 5, s - 10, s - 8);
      px(ctx, PAL.metal, x + 5, y + s / 2 - 2, s - 10, 4);
      px(ctx, PAL.red, x + s / 2 - 5, y + s / 2 - 8, 10, 14);
      px(ctx, PAL.ink, x + s / 2 - 2, y + s / 2 - 3, 4, 6);
    },
    stairsOpen: function (ctx, x, y, s) {     // 열린 계단
      px(ctx, PAL.ink, x + 2, y + 2, s - 4, s - 4);
      px(ctx, PAL.night, x + 5, y + 5, s - 10, s - 8);
      for (var i = 0; i < 4; i++) {
        px(ctx, i % 2 ? PAL.cream : PAL.tan, x + 7 + i * 2, y + s - 12 - i * 8, s - 14 - i * 4, 6);
      }
    },
    card: function (ctx, x, y, s, tone) {     // 내 정보 카드
      px(ctx, PAL.ink, x + 7, y + 11, s - 14, s - 22);
      px(ctx, PAL.paper, x + 9, y + 13, s - 18, s - 26);
      px(ctx, tone || PAL.ribbon, x + 9, y + 13, s - 18, 9);
      px(ctx, PAL.metalDark, x + 13, y + 26, s - 30, 3);
      px(ctx, PAL.metalDark, x + 13, y + 32, s - 34, 3);
    },
    stickerBoard: function (ctx, x, y, s) {   // 광고 스티커 붙은 게시판
      px(ctx, PAL.woodDark, x + 4, y + 8, s - 8, s - 16);
      px(ctx, PAL.paper, x + 8, y + 12, 12, 10);
      px(ctx, PAL.red, x + 24, y + 16, 11, 9);
    },
    // ── 2층 소품 (팩 팔레트 색만 쓰는 절차 도트) ──────────────────────────
    pc: function (ctx, x, y, s) {             // 컴퓨터 책상
      px(ctx, PAL.ink, x + 3, y + s - 22, s - 6, 18);
      px(ctx, PAL.metalDark, x + 3, y + s - 22, s - 6, 6);
      px(ctx, PAL.metal, x + s / 2 - 3, y + s - 30, 6, 8);
      px(ctx, PAL.ink, x + 8, y + 4, s - 16, 22);
      px(ctx, PAL.board, x + 10, y + 6, s - 20, 18);
      px(ctx, PAL.blue, x + 13, y + 10, s - 30, 3);
      px(ctx, PAL.boardLine, x + 13, y + 16, s - 34, 3);
    },
    box: function (ctx, x, y, s) {            // 먼지 쌓인 상자
      px(ctx, PAL.ink, x + 6, y + 12, s - 12, s - 18);
      px(ctx, PAL.woodDark, x + 8, y + 14, s - 16, s - 22);
      px(ctx, PAL.wood, x + 8, y + 14, s - 16, 6);
      px(ctx, PAL.paper, x + s / 2 - 3, y + 14, 6, s - 22);
    },
    poster: function (ctx, x, y, s, tone) {   // 복도 광고 포스터
      px(ctx, PAL.ink, x + 7, y + 6, s - 14, s - 14);
      px(ctx, PAL.paper, x + 9, y + 8, s - 18, s - 18);
      px(ctx, tone || PAL.red, x + 9, y + 8, s - 18, 12);
      px(ctx, tone || PAL.red, x + 12, y + 25, s - 26, 4);
      px(ctx, PAL.metalDark, x + 12, y + 32, s - 30, 3);
    },
    window: function (ctx, x, y, s) {         // 복도 창문
      px(ctx, PAL.woodDark, x + 5, y + 6, s - 10, s - 14);
      px(ctx, PAL.metalDark, x + 8, y + 9, s - 16, s - 20);
      px(ctx, PAL.cream, x + s / 2 - 2, y + 9, 3, s - 20);
      px(ctx, PAL.cream, x + 8, y + s / 2 - 4, s - 16, 3);
    },
    doorReco: function (ctx, x, y, s) {       // 추천 문 — 반짝임 + 광고
      px(ctx, PAL.ink, x + 3, y + 3, s - 6, s - 6);
      px(ctx, PAL.wood, x + 6, y + 6, s - 12, s - 10);
      px(ctx, PAL.red, x + 11, y + 11, s - 22, 14);
      px(ctx, PAL.ribbon, x + 13, y + 14, s - 30, 4);
      px(ctx, PAL.ribbon, x + s - 15, y + s / 2, 5, 5);
      px(ctx, PAL.cream, x + 8, y + 8, 4, 4);
      px(ctx, PAL.cream, x + s - 13, y + 10, 3, 3);
      px(ctx, PAL.cream, x + 10, y + s - 14, 3, 3);
    },
    doorPlain: function (ctx, x, y, s) {      // 낯선 문 — 수수함
      px(ctx, PAL.ink, x + 3, y + 3, s - 6, s - 6);
      px(ctx, PAL.woodDark, x + 6, y + 6, s - 12, s - 10);
      px(ctx, PAL.metalDark, x + 10, y + 12, s - 20, 12);
      px(ctx, PAL.metal, x + s - 15, y + s / 2, 5, 5);
    }
  };

  function drawProp(ctx, kind, x, y, size, tone) {
    var f = PROPS[kind]; if (!f) return false;
    f(ctx, x, y, size || T, tone); return true;
  }

  g.ART = {
    TILE: TILE, SCALE: SCALE, T: T, DIR: DIR, WALK_FRAMES: WALK_FRAMES,
    PAL: PAL, SHEETS: SHEETS,
    load: load, img: img, ready: ready,
    drawTile: drawTile, drawSprite: drawSprite, drawChar: drawChar,
    drawDropShadow: drawDropShadow, drawProp: drawProp, propKinds: PROPS
  };
})(typeof window !== 'undefined' ? window : this);
