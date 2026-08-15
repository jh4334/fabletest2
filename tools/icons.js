// PWA 아이콘 생성기 — 팩 팔레트만 사용, Chromium 캔버스로 1회 렌더 후 저장.
// 실행: node tools/icons.js  (아이콘을 바꿀 때만 다시 실행해 커밋)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
function exe() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { }
  return undefined;
}

const DRAW = String(function draw(c, S) {
  const x = c.getContext('2d'); const u = S / 16; x.imageSmoothingEnabled = false;
  x.fillStyle = '#241a2c'; x.fillRect(0, 0, S, S);                 // 밤의 학교 벽
  x.fillStyle = '#181c20'; x.fillRect(u, u, S - 2 * u, S - 2 * u); // 창틀
  x.fillStyle = '#e8783c';                                          // 노을빛 창
  x.fillRect(2 * u, 2 * u, 5 * u, 5 * u); x.fillRect(9 * u, 2 * u, 5 * u, 5 * u);
  x.fillRect(2 * u, 9 * u, 5 * u, 5 * u); x.fillRect(9 * u, 9 * u, 5 * u, 5 * u);
  x.fillStyle = '#f0c86e';                                          // 불 켜진 한 칸
  x.fillRect(9 * u, 2 * u, 5 * u, 5 * u);
  x.fillStyle = '#2a2030';                                          // 그림자 실루엣
  x.fillRect(10.5 * u, 3.5 * u, 2 * u, 2 * u); x.fillRect(10 * u, 5 * u, 3 * u, 2 * u);
  x.fillStyle = '#a86ad8';                                          // 보라 눈
  x.fillRect(10.9 * u, 4.1 * u, 0.5 * u, 0.5 * u); x.fillRect(11.7 * u, 4.1 * u, 0.5 * u, 0.5 * u);
});

(async () => {
  const browser = await chromium.launch({ executablePath: exe() });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  for (const size of [512, 192]) {
    await page.setContent(`<body style="margin:0"><canvas id=c width=${size} height=${size}></canvas>`
      + `<script>(${DRAW})(document.getElementById('c'), ${size})<\/script>`);
    const buf = await (await page.$('#c')).screenshot();
    fs.writeFileSync(path.join(ROOT, 'icons', `icon-${size}.png`), buf);
    console.log(`icon-${size}.png 생성`);
  }
  await browser.close();
})();
