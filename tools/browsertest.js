// 실제 브라우저(Chromium) 스모크 테스트 — Playwright
// node 스모크테스트가 못 잡는 실제 렌더링·터치 UI·콘솔 에러·PWA를
// desktop / mobile portrait / mobile landscape 세 뷰포트에서 검증한다.
//
// 사전 준비: Chromium 바이너리 필요. 로컬/CI에서 다음 중 하나로 확보:
//   - 이 환경처럼 PLAYWRIGHT_BROWSERS_PATH에 미리 설치돼 있거나
//   - `npx playwright install --with-deps chromium`
// 실행: node tools/browsertest.js  (또는 npm run test:browser)

const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('playwright 패키지가 없습니다. `npm install -D playwright` 후 다시 실행하세요.');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/png',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      if (p === '/favicon.ico') p = '/icons/icon-192.png'; // 파비콘 404 잡음 방지
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.statusCode = 404; res.end('not found'); return;
      }
      res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
      res.setHeader('Service-Worker-Allowed', '/');
      res.end(fs.readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// 미리 설치된 Chromium 실행 파일을 찾는다(버전 불일치 회피). 없으면 undefined →
// playwright 기본 경로 사용(CI에서 `npx playwright install chromium` 후).
function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM)) {
    return process.env.PLAYWRIGHT_CHROMIUM;
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-'));
    for (const d of dirs) {
      const exe = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) { /* base 없음 → 기본 경로 */ }
  return undefined;
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'mobile-portrait', width: 390, height: 844, mobile: true },
  { name: 'mobile-landscape', width: 844, height: 390, mobile: true },
];

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { console.log('  ✔ ' + n); pass++; } else { console.log('  ✘ ' + n); fail++; } };

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/index.html`;
  const shotsDir = path.join(ROOT, 'shots');
  if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir);

  const browser = await chromium.launch({ executablePath: resolveChromium() });
  for (const vp of VIEWPORTS) {
    console.log(`[${vp.name}] ${vp.width}x${vp.height}`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.mobile, isMobile: vp.mobile,
      deviceScaleFactor: vp.mobile ? 2 : 1,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // 리소스 로드 404 등 네트워크 잡음은 별도(여기선 모두 서빙되므로 사실상 없음)
      if (/Failed to load resource/.test(t)) return;
      errors.push('console.error: ' + t);
    });

    await page.goto(base, { waitUntil: 'load' });
    let loaded = false;
    try { await page.waitForFunction(() => !!window.__test, { timeout: 8000 }); loaded = true; } catch (e) { /* below */ }
    await page.waitForTimeout(600); // 한두 프레임 렌더링 시간

    check('게임 모듈 로드(window.__test 노출)', loaded);
    check('캔버스(#game) 존재', !!(await page.$('#game')));

    const disp = (sel) => page.$eval(sel, (el) => getComputedStyle(el).display).catch(() => null);
    const isTouch = await page.evaluate(() => document.body.classList.contains('touch'));

    if (vp.name === 'desktop') {
      check('데스크톱: 터치 UI 비활성', isTouch === false);
      check('데스크톱: 회전 안내 숨김', (await disp('#rotate-hint')) === 'none');
    } else if (vp.name === 'mobile-portrait') {
      check('모바일 세로: 터치 모드 활성', isTouch === true);
      check('모바일 세로: 회전 안내 표시', (await disp('#rotate-hint')) !== 'none');
    } else if (vp.name === 'mobile-landscape') {
      check('모바일 가로: 터치 모드 활성', isTouch === true);
      check('모바일 가로: 회전 안내 숨김', (await disp('#rotate-hint')) === 'none');
      check('모바일 가로: 터치 UI 표시', (await disp('#touch-ui')) !== 'none');
    }

    check('콘솔/페이지 에러 없음', errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));

    await page.screenshot({ path: path.join(shotsDir, `browser-${vp.name}.png`) });
    await ctx.close();
  }
  // 핵심 게임플레이 렌더: 타이틀 외에 '월드'까지 실제 브라우저에서 그려지는지
  // (캔버스 메인 렌더 경로의 회귀를 잡는다 — node 스모크는 목 캔버스라 못 잡음)
  {
    console.log('[gameplay] 월드 진입 렌더 (2장)');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    const entered = await page.evaluate(() => {
      window.__test.applyTiltStreetClass();   // 2장 「기울어진 거리」 시작 상태로 진입
      window.__game.mode = 'world';
      return window.__game.mode === 'world';
    });
    await page.waitForTimeout(600); // 여러 프레임 렌더 (크래시면 프레임 오류 누적)
    check('월드 진입 성공', entered);
    check('렌더 후에도 월드 유지(프레임 크래시 없음)', (await page.evaluate(() => window.__game.mode)) === 'world');
    check('월드 렌더 콘솔/페이지 에러 없음', errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await page.screenshot({ path: path.join(shotsDir, 'browser-gameplay.png') });
    await ctx.close();
  }

  await browser.close();
  server.close();

  console.log(`\n브라우저 스모크: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('브라우저 테스트 오류:', e); process.exit(1); });
