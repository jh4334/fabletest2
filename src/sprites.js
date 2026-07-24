// VERSION 6 sprite bridge.
// 모든 런타임 인물은 src/art.js의 새 우체국 아틀라스에서만 그린다.
const EMPTY_FRAME = Array.from({ length: 16 }, () => '................');
const BASE_PAL = {};
const PLAYER_SPRITES = {
  down: [EMPTY_FRAME, EMPTY_FRAME],
  up: [EMPTY_FRAME, EMPTY_FRAME],
  left: [EMPTY_FRAME, EMPTY_FRAME],
  right: [EMPTY_FRAME, EMPTY_FRAME],
};
const NPC_SPRITES = { down: [EMPTY_FRAME, EMPTY_FRAME] };
const NPC_PALETTES = {};
const MONSTER_PAL = {};

// 도감의 기존 저장 키는 유지하되, 표면 캐릭터는 모두 새 우편국 배역으로 렌더링한다.
const MONSTER_SPRITES = {
  bekkyeomon: EMPTY_FRAME,
  sujipmon: EMPTY_FRAME,
  pyeonhyangmon: EMPTY_FRAME,
  hwangakmon: EMPTY_FRAME,
  yuhokmon: EMPTY_FRAME,
  hollimmon: EMPTY_FRAME,
  finalboss: EMPTY_FRAME,
  yeongi: EMPTY_FRAME,
  girokmon: EMPTY_FRAME,
  mollaemon: EMPTY_FRAME,
  gatimmon: EMPTY_FRAME,
  musimon: EMPTY_FRAME,
  geojitmon: EMPTY_FRAME,
  hapseongmon: EMPTY_FRAME,
  bandi: EMPTY_FRAME,
};

// 구 도트 폴백을 일부러 그리지 않는다. 이미지 디코딩 전에는 한 프레임 비어 있다가,
// 준비가 끝나는 즉시 같은 새 아틀라스가 사용된다.
function drawSprite() { return false; }

function drawMon(ctx, id, x, y, scale, flip, mood) {
  if (typeof GAME_ART === 'undefined' || typeof GAME_ART.drawCast !== 'function') return false;
  const anchor = 16 * scale;
  const size = scale >= 6 ? Math.round(scale * 23) : Math.max(56, Math.round(scale * 20));
  const dx = Math.round(x + anchor / 2 - size / 2);
  const dy = Math.round(y + anchor - size * 0.9);
  return GAME_ART.drawCast(ctx, id, mood || 'open', dx, dy, size, !!flip);
}
