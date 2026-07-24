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
  load('map_prologue', 'assets/art/maps/prologue-boundary.png');
  load('map_ch1', 'assets/art/maps/ch1-free-street.png');
  load('map_ch2', 'assets/art/maps/ch2-tilted-street.png');
  load('map_ch3', 'assets/art/maps/ch3-rumor-news.png');
  load('map_ch4', 'assets/art/maps/ch4-sparkle-arcade.png');
  load('map_ch5', 'assets/art/maps/ch5-cozy-loop.png');
  load('map_final', 'assets/art/maps/finale-memory-core.png');
  load('map_archive_v5', 'assets/art/maps/v5-project-zero-archive.png');

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

  const MAP_TEXTURE = {
    0: 'map_prologue',
    1: 'map_ch1',
    2: 'map_ch2',
    3: 'map_ch3',
    4: 'map_ch4',
    5: 'map_ch5',
    final: 'map_final',
  };
  const PROLOGUE_MAPS = new Set(['introlab', 'forest', 'forestdeep', 'village']);
  const TEXTURED_GROUND = new Set(['G', 'P', 'F', 'S', 'B', 'C', 'M', 'Z', 'E', 'I',
    '2', '4', 'A', '1', '5', '6', '7', '8', '9']);

  // v5 핵심 허브는 기존 타일 위에 색만 입히지 않는다. 한 장으로 설계한 방사형
  // 보관소 원화를 월드 좌표에 고정해 그려, 카메라가 움직여도 코어·회랑·게이트의
  // 공간 관계가 유지된다. introlab과 village는 각각 '첫 복구실'과 '복구 허브'로
  // 같은 장소의 다른 층이라는 설정이다.
  function drawMapBackdrop(ctx, mapId, cameraX, cameraY, worldW, worldH) {
    if (!['introlab', 'village'].includes(mapId) || !ready('map_archive_v5')) return false;
    const image = images.map_archive_v5;
    const targetRatio = worldW / worldH;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
    if (sourceRatio > targetRatio) {
      sw = Math.round(sh * targetRatio);
      sx = Math.round((image.naturalWidth - sw) / 2);
    } else if (sourceRatio < targetRatio) {
      sh = Math.round(sw / targetRatio);
      sy = Math.round((image.naturalHeight - sh) / 2);
    }
    ctx.drawImage(image, sx, sy, sw, sh,
      Math.round(-cameraX), Math.round(-cameraY), worldW, worldH);
    return true;
  }

  // v4 맵 아트 패스. 한 장의 색 필터가 아니라, 각 챕터 전용 512px 원화에서
  // 좌표가 이어지는 64px 조각을 잘라 실제 지면으로 사용한다. 충돌 데이터는 그대로라
  // 기존 세이브와 퍼즐 동선은 보존되지만 플레이 화면은 장마다 완전히 달라진다.
  function drawMapGround(ctx, mapId, chapter, ch, x, y, dx, dy, size) {
    if (!TEXTURED_GROUND.has(ch)) return false;
    const theme = PROLOGUE_MAPS.has(mapId) ? 0 : chapter;
    const imageId = MAP_TEXTURE[theme];
    if (!imageId || !ready(imageId)) return false;
    const image = images[imageId];
    const cell = 64;
    const cols = Math.max(1, Math.floor(image.naturalWidth / cell));
    const rows = Math.max(1, Math.floor(image.naturalHeight / cell));
    const sx = ((x % cols) + cols) % cols * cell;
    const sy = ((y % rows) + rows) % rows * cell;
    ctx.drawImage(image, sx, sy, cell, cell, Math.round(dx), Math.round(dy), size, size);

    // 동일 원화 안에서도 길·실내·특수 바닥을 즉시 구분할 수 있게 얇은 재질층만 얹는다.
    // 원화를 가리는 팔레트 필터가 아니라 충돌 문자의 가독성 보조층이다.
    if (ch === 'P' || ch === '8') {
      ctx.fillStyle = theme === 5 ? 'rgba(255,210,145,0.08)' : 'rgba(12,8,24,0.16)';
      ctx.fillRect(dx, dy, size, size);
    } else if (['E', 'I', 'M', 'C', 'A'].includes(ch)) {
      ctx.fillStyle = 'rgba(4,7,18,0.12)';
      ctx.fillRect(dx, dy, size, size);
    } else if (ch === 'F') {
      ctx.fillStyle = 'rgba(158,225,182,0.08)';
      ctx.fillRect(dx, dy, size, size);
    }
    return true;
  }

  // 구 CC0 폐허 아틀라스 의존을 끊고, 경계마을 바위도 같은 팔레트의 절차적 픽셀 오브젝트로 그린다.
  function drawVillageRock(ctx, variant, dx, dy, size) {
    const colors = [
      ['#27314d', '#45567a', '#8a79a8'],
      ['#273047', '#53627e', '#7bc6d1'],
      ['#302c4a', '#604e74', '#c17aa4'],
      ['#243044', '#405a67', '#9bb88a'],
    ][variant % 4];
    const x = Math.round(dx), y = Math.round(dy);
    ctx.save();
    ctx.fillStyle = 'rgba(3,8,20,0.34)';
    ctx.fillRect(x + size * 0.18, y + size * 0.72, size * 0.68, size * 0.14);
    ctx.fillStyle = colors[0];
    ctx.fillRect(x + size * 0.12, y + size * 0.38, size * 0.76, size * 0.42);
    ctx.fillStyle = colors[1];
    ctx.fillRect(x + size * 0.22, y + size * 0.24, size * 0.56, size * 0.44);
    ctx.fillStyle = colors[2];
    ctx.fillRect(x + size * 0.32, y + size * 0.28, size * 0.22, size * 0.10);
    ctx.restore();
    return true;
  }

  return { ready, drawPlayer, drawBandi, drawBoss, drawMapBackdrop, drawMapGround, drawVillageRock };
})();
