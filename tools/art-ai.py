"""AI 생성 원본 → 게임 에셋(assets/ai/) 변환 — 방과 후: 그림자 학교

생성형 AI(OpenAI Codex 이미지 생성)로 만든 원본을 게임의 픽셀 격자에 맞춰 줄이고
색 수를 줄여 assets/ai/ 에 쓴다. 원본은 용량이 커서 저장소에 넣지 않는다
(무엇을 어떤 프롬프트로 만들었는지는 assets/ai/PROMPTS.md).

개발용 도구라 Pillow 가 필요하다(게임 런타임 의존성은 여전히 0).
    python tools/art-ai.py <원본 폴더>

원본 폴더의 파일 이름 = PROMPTS.md 의 이름 (예: desk.png, g_wood.png, bg_f1.png).
"""
import os
import sys

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'assets', 'ai')

# 순서가 곧 아틀라스 칸 번호 — src/art.js 의 AI_GROUNDS / AI_PROPS 와 같아야 한다.
GROUNDS = ['wood', 'corridor', 'lab', 'carpet', 'office', 'roof', 'art']
PROPS = [
    'desk', 'board', 'locker', 'door', 'stairsLocked', 'stairsOpen', 'stickerBoard',
    'pc', 'box', 'window', 'doorReco', 'doorPlain', 'console', 'note', 'sign', 'frame',
    'glass', 'glassOpen', 'bench', 'sample', 'drawer', 'navis',
    'cabinet', 'cabinetOpen', 'fileBox', 'fileBoxOpen', 'innerDoor', 'innerOpen',
    'paper', 'plant',
]
# 열림/닫힘 짝은 한 장(왼쪽=닫힘, 오른쪽=열림)으로 만들었다.
PAIRS = {'cabinet': 'cabinetOpen', 'fileBox': 'fileBoxOpen', 'innerDoor': 'innerOpen'}
# 테두리 안쪽까지 투명하게 나와 버린 소품 — 테두리 안을 이 색으로 채운다(칠판 면이 빠지는 경우).
FILL = {'board': (36, 66, 52, 255)}
SCENES = ['bg_f1', 'bg_f2', 'bg_f3', 'bg_f4', 'bg_f5', 'bg_roof', 'bg_title']
CHARS = ['mate', 'bro', 'senior', 'artTeacher', 'vice']

GROUND_PX = 16      # 바닥: 팩 타일과 같은 16px (화면 3배)
PROP_PX = 24        # 소품: 24px (화면 2배) — 16px 로 줄이면 형태가 뭉개진다
SCENE_W, SCENE_H = 360, 264   # 장면: 캔버스 720x528 의 절반 (화면 2배)
CHAR_REF_H = 60     # 배틀 인물: 짝꿍 키를 60px 로 두고 나머지는 원본 키 비율대로(어른은 더 크게)
CHAR_MAX_H = 90     # 화면 2배로 180px — 배틀 상단 게이지를 가리지 않는 한도


def quantize(im, colors):
    """RGBA 이미지를 colors 색 이하로 줄이고 알파는 0/255 로 자른다(픽셀 아트 가장자리)."""
    rgba = im.convert('RGBA')
    alpha = rgba.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    rgb = rgba.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                                        dither=Image.Dither.NONE).convert('RGB')
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    return out


def fit(im, size):
    """알파 경계로 잘라 정사각형 여백을 두고 size 픽셀로 줄인다."""
    box = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
    if box:
        im = im.crop(box)
    w, h = im.size
    side = max(w, h)
    pad = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    pad.paste(im, ((side - w) // 2, side - h))   # 바닥에 붙인다(3/4 시점 소품이 떠 보이지 않게)
    return pad.resize((size, size), Image.Resampling.BOX)


def load(src, name):
    """원본을 읽는다. 투명 배경 대신 단색 마젠타(#FF00FF)로 나온 그림은 마젠타를 투명으로 바꾼다."""
    im = Image.open(os.path.join(src, name + '.png')).convert('RGBA')
    px = im.load()
    w, h = im.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if all(a > 200 and r > 200 and g < 80 and b > 200 for r, g, b, a in corners):
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if r > 180 and g < 110 and b > 180:
                    px[x, y] = (0, 0, 0, 0)
    return im


def main(src):
    os.makedirs(OUT, exist_ok=True)

    # 바닥 — 4x4 로 반복된 무늬의 왼쪽 위 한 칸만 쓴다(이음매 없는 타일).
    sheet = Image.new('RGBA', (GROUND_PX * len(GROUNDS), GROUND_PX))
    for i, g in enumerate(GROUNDS):
        im = load(src, 'g_' + g)
        cell = im.width // 4
        tile = im.crop((0, 0, cell, cell)).resize((GROUND_PX, GROUND_PX), Image.Resampling.BOX)
        sheet.paste(quantize(tile, 8), (i * GROUND_PX, 0))
    sheet.save(os.path.join(OUT, 'grounds.png'), optimize=True)

    # 소품 아틀라스 — 한 줄로 이어 붙인다.
    cells = {}
    for name in PROPS:
        if name in PAIRS.values():
            continue
        if name in PAIRS:
            im = load(src, 'pair_' + name)
            half = im.width // 2
            cells[name] = im.crop((0, 0, half, im.height))
            cells[PAIRS[name]] = im.crop((half, 0, im.width, im.height))
        else:
            cells[name] = load(src, name)
    atlas = Image.new('RGBA', (PROP_PX * len(PROPS), PROP_PX), (0, 0, 0, 0))
    for i, name in enumerate(PROPS):
        im = cells[name]
        if name in FILL:
            box = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
            im = im.crop(box)
            base = Image.new('RGBA', im.size, FILL[name])
            base.alpha_composite(im)
            im = base
        atlas.paste(quantize(fit(im, PROP_PX), 16), (i * PROP_PX, 0))
    atlas.save(os.path.join(OUT, 'props.png'), optimize=True)

    # 장면 — 캔버스 비율로 가운데를 잘라 절반 크기로.
    for name in SCENES:
        im = load(src, name)
        w, h = im.size
        want = SCENE_W / SCENE_H
        if w / h > want:
            nw = int(h * want); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = int(w / want); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        im = im.resize((SCENE_W, SCENE_H), Image.Resampling.BOX)
        quantize(im, 64).convert('RGB').save(os.path.join(OUT, name + '.png'), optimize=True)

    # 배틀 인물 — 알파 경계로 자르고, 원본끼리 같은 배율로 줄여 키 차이(아이/어른)를 살린다.
    crops = {}
    for name in CHARS:
        im = load(src, 'ch_' + name)
        crops[name] = im.crop(im.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox())
    k = CHAR_REF_H / crops['mate'].height
    for name, im in crops.items():
        h = min(CHAR_MAX_H, max(1, round(im.height * k)))
        w = max(1, round(im.width * h / im.height))
        im = im.resize((w, h), Image.Resampling.BOX)
        quantize(im, 24).save(os.path.join(OUT, 'ch_' + name + '.png'), optimize=True)

    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.png'))
    print('assets/ai 갱신: %d개 파일, %.1f KB' % (len([f for f in os.listdir(OUT) if f.endswith('.png')]), total / 1024))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
