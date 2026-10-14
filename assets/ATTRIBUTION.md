# 에셋 출처

## assets/pack/ — Ninja Adventure Asset Pack (CC0 / 퍼블릭 도메인)
- 제작: Pixel-boy & AAA (Superpowers Asset Packs)
- 출처: https://github.com/pixel-boy/NinjaAdventure · https://pixel-boy.itch.io/ninja-adventure-asset-pack
- 라이선스: Creative Commons Zero (CC0) — 저작권 표기 의무 없음(감사의 뜻으로 명기)
- 파일명은 게임 용도에 맞게 변경함 (예: sprite.png → student.png)
- 실제로 쓰는 파일 (v0.9.0 기준, 쓰지 않는 floor.png·village_abandoned.png·animated.png는 제거)
  - `char/`: student.png, teacher_blue.png, teacher_green.png, drop_shadow.png
  - `map/`: interior_floor.png, wall_simple.png
  - `props/`: crate.png, heart.png, pot.png

## assets/ai/ — 생성형 AI 그림 (v0.9.0)
- 도구: OpenAI GPT Image 2.5 (Higgsfield 웹 서비스에서 생성, 2026-10-15)
- 배틀·타이틀·옥상 배경, 배틀 인물 5명, 맵 바닥 7종·소품 30종
- 참고 이미지는 이 게임의 CC0 팩 화면 캡처뿐. 실존 작가 이름·화풍은 프롬프트에 넣지 않았다.
- 파일별 프롬프트·설정·가공: `assets/ai/PROMPTS.md`, 변환 도구 `tools/art-ai.py`
- 게임 안 표기: 타이틀 화면 아래 출처 한 줄

## 코드로 그린 소품 (src/art.js)
- 위 팩의 팔레트로 캔버스에 직접 그린 도형. AI 그림을 불러오지 못하면 대신 쓰인다.
