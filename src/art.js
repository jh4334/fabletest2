// VERSION 6 전용 파일 기반 아트.
// 구 도트 스프라이트·CC0 타일·v4/v5 배경은 어떤 경로에서도 불러오지 않는다.
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

  load('courier', 'assets/art/postal-courier-atlas.png');
  load('cast_main', 'assets/art/postal-cast-main.png');
  load('cast_support', 'assets/art/postal-cast-support.png');

  load('postal_central', 'assets/art/maps/postal-central-hall.png');
  load('postal_permission', 'assets/art/maps/postal-permission-market.png');
  load('postal_terminal', 'assets/art/maps/postal-one-sided-terminal.png');
  load('postal_press', 'assets/art/maps/postal-rumor-press.png');
  load('postal_prize', 'assets/art/maps/postal-prize-dispatch.png');
  load('postal_waiting', 'assets/art/maps/postal-waiting-lounge.png');
  load('postal_silent', 'assets/art/maps/postal-silent-route.png');
  load('postal_sender', 'assets/art/maps/postal-sender-chamber.png');

  function ready(id) {
    const image = images[id];
    return !!(image && image.complete && image.naturalWidth > 0);
  }

  function drawSheet(ctx, id, cols, rows, col, row, dx, dy, dw, dh, flip) {
    if (!ready(id)) return false;
    const image = images[id];
    const sw = image.naturalWidth / cols;
    const sh = image.naturalHeight / rows;
    ctx.save();
    if (flip) {
      ctx.translate(Math.round(dx + dw), 0);
      ctx.scale(-1, 1);
      dx = 0;
    }
    ctx.drawImage(image, col * sw, row * sh, sw, sh,
      Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    ctx.restore();
    return true;
  }

  function drawPlayer(ctx, dir, walkingFrame, tileX, tileY) {
    const row = dir === 'up' ? 2 : dir === 'left' || dir === 'right' ? 1 : 0;
    const col = Math.abs(Number(walkingFrame) || 0) % 4;
    return drawSheet(ctx, 'courier', 4, 4, col, row,
      tileX - 18, tileY - 38, 84, 84, dir === 'right');
  }

  function drawBandi(ctx, frame, centerX, centerY) {
    return drawSheet(ctx, 'courier', 4, 4, Math.abs(frame) % 4, 3,
      centerX - 27, centerY - 27, 54, 54, false);
  }

  const MAIN_CAST = {
    bekkyeomon: 0, sujipmon: 1, pyeonhyangmon: 2,
    hwangakmon: 3, yuhokmon: 4, hollimmon: 5,
  };
  const SUPPORT_CAST = {
    finalboss: 0, goyo: 0,
    yeongi: 1,
    director: 2, prof: 2,
    archivist: 3, caretaker: 3, grandma: 3,
    clerk: 4, girokmon: 4, mollaemon: 4, gatimmon: 4,
    musimon: 4, geojitmon: 4, hapseongmon: 4, bandi: 4,
  };
  const MOOD_ROW = { closed: 0, shaken: 1, flinch: 1, open: 2, mercy: 3 };

  function normalizeCastId(id) {
    return String(id || '')
      .replace(/_boss$/, '')
      .replace(/^pyeong$/, 'pyeonhyangmon')
      .replace(/^hwangak$/, 'hwangakmon')
      .replace(/^yuhok$/, 'yuhokmon')
      .replace(/^hollim$/, 'hollimmon')
      .replace(/^sujip$/, 'sujipmon');
  }

  function drawCast(ctx, id, mood, x, y, size, flip) {
    const normalized = normalizeCastId(id);
    const row = MOOD_ROW[mood] ?? 2;
    if (Object.prototype.hasOwnProperty.call(MAIN_CAST, normalized)) {
      return drawSheet(ctx, 'cast_main', 6, 4, MAIN_CAST[normalized], row,
        x, y, size, size, flip);
    }
    const col = SUPPORT_CAST[normalized] ?? SUPPORT_CAST.clerk;
    return drawSheet(ctx, 'cast_support', 5, 4, col, row,
      x, y, size, size, flip);
  }

  function drawBoss(ctx, id, mood, x, y, size) {
    return drawCast(ctx, id, mood || 'open', x, y, size, false);
  }

  const MAP_GROUPS = {
    postal_central: new Set(['village', 'introlab', 'forest', 'forestdeep']),
    postal_permission: new Set(['freestreet', 'traceroom', 'boardplaza', 'warehouse', 'ownerroom']),
    postal_terminal: new Set(['tiltstreet', 'echoalley', 'samplehouse', 'dimstreet', 'gatekeeper']),
    postal_press: new Set(['rumorstreet', 'tipsroom', 'editroom', 'towerroom', 'towerroof']),
    postal_prize: new Set(['arcade', 'roulettesquare', 'signupalley', 'backstage', 'yuhokstage']),
    postal_waiting: new Set(['cozyhome', 'callroom', 'corridor', 'sofaroom', 'lumiroom']),
    postal_silent: new Set(['quietyard', 'quietyard2', 'quietyard3', 'goyostage']),
    postal_sender: new Set(['coreroom']),
  };

  function mapArtId(mapId) {
    return Object.keys(MAP_GROUPS).find((id) => MAP_GROUPS[id].has(mapId)) || 'postal_central';
  }

  function drawMapBackdrop(ctx, mapId, cameraX, cameraY, worldW, worldH) {
    const artId = mapArtId(mapId);
    if (!ready(artId)) return false;
    const image = images[artId];
    const targetRatio = worldW / worldH;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
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

  // v6에서는 모든 실제 맵이 한 장짜리 새 배경을 사용한다.
  function drawMapGround() { return false; }
  function drawVillageRock() { return false; }

  return {
    ready,
    drawPlayer,
    drawBandi,
    drawCast,
    drawBoss,
    drawMapBackdrop,
    drawMapGround,
    drawVillageRock,
  };
})();
