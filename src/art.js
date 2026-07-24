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

  function drawTtara(ctx, mood, x, y, size) {
    const frame = {
      closed: [0, 0],
      shaken: [1, 0],
      flinch: [1, 0],
      open: [0, 1],
      mercy: [1, 1],
    }[mood] || [0, 0];
    return drawSheet(ctx, 'ttara', 2, 2, frame[0], frame[1], x, y, size, size);
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

  return { ready, drawPlayer, drawBandi, drawTtara, drawVillageGround, drawVillageRock };
})();
