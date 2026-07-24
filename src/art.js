// 파일 기반 비주얼 에셋 — 브라우저에서는 PNG를 미리 읽고, Node 검증 하네스에서는
// Image가 없으므로 기존 절차적 도트로 자연스럽게 폴백한다.
const GAME_ART = (() => {
  const images = {};
  const hasImage = typeof Image !== 'undefined';

  function load(id, src) {
    if (!hasImage) return null;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    images[id] = image;
    return image;
  }

  load('player', 'assets/art/player-sheet.png');
  load('bandi', 'assets/art/bandi-sheet.png');
  load('ttara', 'assets/art/ttara-expression-sheet.png');
  load('dama', 'assets/art/dama-expression-sheet.png');
  load('giul', 'assets/art/giul-expression-sheet.png');
  load('geureol', 'assets/art/geureol-expression-sheet.png');
  load('banjjak', 'assets/art/banjjak-expression-sheet.png');
  load('lumi', 'assets/art/lumi-expression-sheet.png');
  load('goyo', 'assets/art/goyo-expression-sheet.png');
  load('yeongi', 'assets/art/yeongi-expression-sheet.png');
  load('floor', 'assets/cc0/ninja-adventure/tileset_floor.png');
  load('village', 'assets/cc0/ninja-adventure/tileset_village_abandoned.png');

  function ready(id) {
    const image = images[id];
    return !!(image && image.complete && image.naturalWidth > 0);
  }

  function drawSheet(ctx, id, cols, rows, col, row, dx, dy, dw, dh) {
    if (!ready(id)) return false;
    const image = images[id];
    const sw = image.naturalWidth / cols;
    const sh = image.naturalHeight / rows;
    ctx.drawImage(image, col * sw, row * sh, sw, sh, dx, dy, dw, dh);
    return true;
  }

  function drawPlayer(ctx, dir, walkingFrame, tileX, tileY) {
    const col = { down: 0, left: 1, right: 2, up: 3 }[dir] ?? 0;
    // 셀 여백까지 함께 그려야 생성된 프레임의 중심·발 위치가 방향별로 흔들리지 않는다.
    return drawSheet(ctx, 'player', 4, 2, col, walkingFrame ? 1 : 0,
      Math.round(tileX - 16), Math.round(tileY - 30), 80, 96);
  }

  function drawBandi(ctx, frame, centerX, centerY) {
    return drawSheet(ctx, 'bandi', 2, 2, frame % 2, Math.floor(frame / 2) % 2,
      Math.round(centerX - 32), Math.round(centerY - 32), 64, 64);
  }

  const BOSS_ART = {
    bekkyeomon: 'ttara',
    sujipmon: 'dama',
    pyeonhyangmon: 'giul',
    hwangakmon: 'geureol',
    yuhokmon: 'banjjak',
    hollimmon: 'lumi',
    finalboss: 'goyo',
    yeongi: 'yeongi',
  };

  function drawBoss(ctx, id, mood, x, y, size) {
    const artId = BOSS_ART[id];
    if (!artId) return false;
    const frame = {
      closed: [0, 0],
      shaken: [1, 0],
      flinch: [1, 0],
      open: [0, 1],
      mercy: [1, 1],
    }[mood] || [0, 0];
    return drawSheet(ctx, artId, 2, 2, frame[0], frame[1], x, y, size, size);
  }

  function hash2(x, y) {
    return Math.abs((x * 17 + y * 31 + x * y * 3) | 0);
  }

  // Ninja Adventure의 어두운 숲 바닥 세트. 경계마을의 G/P/F만 교체해
  // 다른 챕터의 고유 팔레트는 건드리지 않는다.
  function drawVillageGround(ctx, ch, x, y, dx, dy, size) {
    if (!ready('floor') || !['G', 'P', 'F'].includes(ch)) return false;
    const image = images.floor;
    const h = hash2(x, y);
    let sx;
    let sy;
    if (ch === 'P') {
      // 오토타일 가장자리 조각을 반복하면 길마다 십자 이음새가 생긴다.
      // 중앙 흙 조각 하나를 써서 맵 데이터가 만든 길 윤곽 자체가 선명하게 보이게 한다.
      sx = h % 4 === 0 ? 16 : 12;
      sy = 8;
    } else {
      sx = ch === 'F' ? 14 : 11 + (h % 5);
      sy = 12;
    }
    ctx.drawImage(image, sx * 16, sy * 16, 16, 16, dx, dy, size, size);
    ctx.fillStyle = ch === 'P' ? 'rgba(16,24,39,0.18)' : 'rgba(5,28,42,0.24)';
    ctx.fillRect(dx, dy, size, size);
    return true;
  }

  // 폐허 마을 아틀라스에서 독립적으로 완결되는 작은 바위 타일을 꺼내 쓴다.
  function drawVillageRock(ctx, variant, dx, dy, size) {
    if (!ready('village')) return false;
    const coords = [[2, 3], [4, 3], [7, 3], [9, 3]][variant % 4];
    ctx.drawImage(images.village, coords[0] * 16, coords[1] * 16, 16, 16,
      Math.round(dx), Math.round(dy), size, size);
    return true;
  }

  // 챕터 전역의 보행 바닥을 같은 CC0 아틀라스에서 꺼내고, 각 장의 이야기 색으로
  // 얇게 덧입힌다. 충돌/타일 문자는 그대로라서 퍼즐 동선에는 영향을 주지 않는다.
  const CHAPTER_GROUND = {
    1: { base: '#563d55', tint: 'rgba(86,32,78,0.58)', accent: 'rgba(255,112,194,0.12)' },
    2: { base: '#303344', tint: 'rgba(38,48,88,0.62)', accent: 'rgba(241,181,74,0.12)' },
    3: { base: '#253646', tint: 'rgba(21,60,82,0.58)', accent: 'rgba(239,222,174,0.10)' },
    4: { base: '#321f3c', tint: 'rgba(89,20,101,0.60)', accent: 'rgba(255,74,179,0.14)' },
    5: { base: '#4a3428', tint: 'rgba(112,62,30,0.46)', accent: 'rgba(255,195,116,0.12)' },
    final: { base: '#17182b', tint: 'rgba(10,12,40,0.72)', accent: 'rgba(165,188,255,0.09)' },
  };

  function drawChapterGround(ctx, chapter, ch, x, y, dx, dy, size) {
    const style = CHAPTER_GROUND[chapter];
    const groundChars = chapter === 1 ? 'GPFEI' : chapter === 2 ? '8E'
      : chapter === 3 ? 'GPMI' : chapter === 4 ? 'I'
        : chapter === 5 ? 'I' : chapter === 'final' ? 'IA' : '';
    if (!style || !groundChars.includes(ch) || !ready('floor')) return false;
    const image = images.floor;
    // 같은 지형 안에서는 완결된 중앙 셀을 반복한다. 오토타일 가장자리 셀을 섞으면
    // 한 칸마다 잔디/흙 경계가 생겨 체크무늬처럼 보이므로, 차이는 맵 데이터의 G/P와
    // 아래의 작은 결정적 하이라이트만으로 만든다.
    const cellPool = (ch === 'G' || ch === 'F')
      ? [[12, 12], [13, 12], [14, 12], [15, 12]]
      : [[16, 11], [17, 11], [18, 11], [19, 11]];
    const cell = cellPool[hash2(x, y) % cellPool.length];
    // 아틀라스의 오토타일 셀에는 가장자리용 투명 픽셀이 있다. 먼저 장별 베이스를
    // 채워 두면 서로 다른 가장자리 조각을 섞어도 검은 체커가 비치지 않는다.
    ctx.fillStyle = style.base;
    ctx.fillRect(dx, dy, size, size);
    ctx.drawImage(image, cell[0] * 16, cell[1] * 16, 16, 16, dx, dy, size, size);
    ctx.fillStyle = style.tint;
    ctx.fillRect(dx, dy, size, size);
    if (hash2(x + 5, y + 9) % 7 === 0) {
      ctx.fillStyle = style.accent;
      ctx.fillRect(dx + size * 0.16, dy + size * 0.18, size * 0.68, Math.max(2, size * 0.08));
    }
    return true;
  }

  return { ready, drawPlayer, drawBandi, drawBoss, drawVillageGround, drawVillageRock,
    drawChapterGround };
})();
