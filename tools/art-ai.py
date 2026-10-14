"""AI 생성 원본 → 게임 에셋(assets/ai/) 변환 — 방과 후: 그림자 학교

생성형 AI(GPT Image 2.5)로 만든 1024px 원본을 게임의 픽셀 격자에 맞춰 줄이고
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
SCENES = ['bg_f1', 'bg_f2', 'bg_f3', 'bg_f4', 'bg_f5', 'bg_roof', 'bg_title']
CHARS = ['mate', 'bro', 'senior', 'artTeacher', 'vice']

GROUND_PX = 16      # 바닥: 팩 타일과 같은 16px (화면 3배)
PROP_PX = 24        # 소품: 24px (화면 2배) — 16px 로 줄이면 형태가 뭉개진다
SCENE_W, SCENE_H = 360, 264   # 장면: 캔버스 720x528 의 절반 (화면 2배)
CHAR_H = 72         # 배틀 인물: 높이 72px (화면 2배)


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
    return Image.open(os.path.join(src, name + '.png')).convert('RGBA')


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
        atlas.paste(quantize(fit(cells[name], PROP_PX), 16), (i * PROP_PX, 0))
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

    # 배틀 인물 — 알파 경계로 잘라 높이 CHAR_H 로.
    for name in CHARS:
        im = load(src, 'ch_' + name)
        box = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
        im = im.crop(box)
        w = max(1, round(im.width * CHAR_H / im.height))
        im = im.resize((w, CHAR_H), Image.Resampling.BOX)
        quantize(im, 24).save(os.path.join(OUT, 'ch_' + name + '.png'), optimize=True)

    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.png'))
    print('assets/ai 갱신: %d개 파일, %.1f KB' % (len([f for f in os.listdir(OUT) if f.endswith('.png')]), total / 1024))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
