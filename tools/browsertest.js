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

let chromium, webkit;
try {
  ({ chromium, webkit } = require('playwright'));
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
async function dismissVersionGate(page) {
  await page.waitForFunction(() => document.getElementById('version-gate')?.dataset.ready === '1', { timeout: 8000 });
  await page.evaluate(() => window.__dismissVersionGate && window.__dismissVersionGate());
}

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
    check('v5 시작 버전 게이트 표시', (await page.$eval('#version-gate', (el) => getComputedStyle(el).display)) === 'flex');
    check('시작 화면에 VERSION 5.0 명시',
      (await page.$eval('#version-gate', (el) => el.textContent)).includes('VERSION 5.0'));

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
    await dismissVersionGate(page);
    const archiveEntered = await page.evaluate(() => {
      window.__test.applyPrologueClass();
      window.__game.mode = 'world';
      return window.__game.map === 'introlab';
    });
    await page.waitForTimeout(700);
    check('v5 프로젝트 0호 삭제 보관소 진입', archiveEntered);
    await page.screenshot({ path: path.join(shotsDir, 'browser-v5-archive.png') });
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

  // 큰 글씨 모드(1.25×) 렌더: 전 화면 fs() 전환(P-1) 회귀 검증 — 타이틀·월드·메뉴가
  // 배율 적용 상태로 프레임 오류 없이 그려지는지 본다.
  {
    console.log('[largetext] 큰 글씨 모드 렌더');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await dismissVersionGate(page);
    await page.evaluate(() => { window.__game.largeText = true; });
    await page.waitForTimeout(300); // 타이틀 렌더
    await page.evaluate(() => {
      window.__test.applyTiltStreetClass();
      window.__game.largeText = true;
      window.__game.mode = 'world';
    });
    await page.waitForTimeout(300); // 월드 렌더
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300); // 일시정지 메뉴 렌더
    check('큰 글씨: 렌더 유지(프레임 크래시 없음)', (await page.evaluate(() => window.__game.mode)) !== undefined && errors.length === 0);

    // Y-13 큰 글씨 오버플로 실렌더 검사 — 데이터의 최장 대사/주장/조사 플레이버를 실제
    // 폰트(1.25×)로 줄바꿈해, 어떤 줄도 대화 상자 폭을 넘지 않는지 measureText 실값으로 본다.
    const ov = await page.evaluate(() => { window.__game.largeText = true; return window.__test.checkTextOverflow(); });
    check(`Y-13 큰 글씨: 대사/주장 표본 충분히 수집(${ov.sampled}개)`, ov.sampled > 100);
    check(`Y-13 큰 글씨: 최장 줄폭이 상자 폭 안(${ov.worstW}/${ov.dialogMaxW}px)`, ov.worstW <= ov.dialogMaxW);
    check(`Y-13 큰 글씨: 상자 밖으로 넘치는 대사 0건(넘침 ${ov.overCount}건)`, ov.overCount === 0);
    if (ov.overCount) ov.over.forEach((o) => console.log(`     · 넘침(${o.w}px): ${o.line}`));

    await page.screenshot({ path: path.join(shotsDir, 'browser-largetext.png') });
    await ctx.close();
  }

  // Y-18·Y-20 새 교사 화면 렌더 — 반 순위표·사전/사후 점검이 실브라우저에서 크래시 없이 그려지는지
  {
    console.log('[teacher-screens] Y-18 사전/사후 점검 · Y-20 반 순위표 렌더');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await dismissVersionGate(page);
    // 반 순위표 — 백업 두 개를 합산 상태로 넣고 화면을 연다
    const lbMode = await page.evaluate(() => {
      const g = window.__game, T = window.__test;
      const mk = (name, mercy, done) => ({ app: 'ai-ethics-adventure', version: 1, data: {
        'ai-ethics-adventure-slot-0': JSON.stringify({ v: 8, name, flags: { mercy, defeated: done ? { yeongi: true } : {} } }),
        'ai-ethics-adventure-stats-0': JSON.stringify({ privacy: { correct: 7, total: 10 } }),
        'ai-ethics-adventure-meta-0': JSON.stringify({ bossRank: { sujipmon: 'S' } }),
      } });
      g.leaderboard.rows = T.backupSlotRows(mk('가온', 8, true)).concat(T.backupSlotRows(mk('나래', 3, false)));
      g.leaderboard.files = 2;
      T.openLeaderboard('title');
      return g.mode;
    });
    await page.waitForTimeout(300);
    check('Y-20 반 순위표 진입', lbMode === 'leaderboard');
    check('Y-20 반 순위표 렌더 크래시 없음', (await page.evaluate(() => window.__game.mode)) === 'leaderboard');
    await page.screenshot({ path: path.join(shotsDir, 'browser-leaderboard.png') });
    // 사전/사후 점검 — 사전 점검을 열어 인트로→문제→피드백까지 실제로 진행해 본다
    const ppMode = await page.evaluate(() => { window.__test.openPrepost('pre', 'trace', 'title'); return window.__game.mode; });
    await page.waitForTimeout(200);
    check('Y-18 사전 점검 진입(인트로)', ppMode === 'prepost' && (await page.evaluate(() => window.__game.prepost.phase)) === 'intro');
    await page.keyboard.press('z'); await page.waitForTimeout(150); // 인트로 → 문제
    const qPhase = await page.evaluate(() => window.__game.prepost && window.__game.prepost.phase);
    check('Y-18 사전 점검 문제 진행', qPhase === 'question');
    await page.keyboard.press('z'); await page.waitForTimeout(150); // 문제 → 피드백
    check('Y-18 사전 점검 렌더 크래시 없음', (await page.evaluate(() => window.__game.mode)) === 'prepost' && errors.length === 0);
    await page.screenshot({ path: path.join(shotsDir, 'browser-prepost.png') });
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // 멀티터치: 같은 버튼 두 손가락 → 하나만 떼도 유지, 스틱은 둘째 손가락이 탈취 못 함
  {
    console.log('[multitouch] 태블릿 멀티터치 입력');
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await dismissVersionGate(page);
    const r = await page.evaluate(() => {
      // 합성 TouchEvent로 게임 요소 핸들러를 직접 구동 (e.changedTouches 기반 로직 검증)
      const mkTouch = (el, id, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      const fire = (el, type, touches) => el.dispatchEvent(new TouchEvent(type, { changedTouches: touches, bubbles: true, cancelable: true }));
      const center = (el) => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
      const out = {};

      const btn = document.getElementById('t-a');
      const [bx, by] = center(btn);
      fire(btn, 'touchstart', [mkTouch(btn, 11, bx, by)]);
      fire(btn, 'touchstart', [mkTouch(btn, 12, bx + 4, by)]);
      fire(btn, 'touchend', [mkTouch(btn, 11, bx, by)]);          // 한 손가락만 뗌
      out.heldAfterOneUp = window.__test.heldKeys().includes('action');
      fire(btn, 'touchend', [mkTouch(btn, 12, bx + 4, by)]);      // 나머지도 뗌
      out.heldAfterAllUp = window.__test.heldKeys().includes('action');

      const stick = document.getElementById('t-stick');
      const [sx, sy] = center(stick);
      fire(stick, 'touchstart', [mkTouch(stick, 21, sx + 40, sy)]); // 오른쪽으로 밀기
      out.stickRight = window.__test.heldKeys().includes('right');
      fire(stick, 'touchstart', [mkTouch(stick, 22, sx, sy)]);      // 둘째 손가락 난입
      fire(stick, 'touchend', [mkTouch(stick, 22, sx, sy)]);        // 난입 손가락 뗌
      out.stickSurvivesSteal = window.__test.heldKeys().includes('right');
      fire(stick, 'touchend', [mkTouch(stick, 21, sx + 40, sy)]);   // 원래 손가락 뗌
      out.stickReleased = !window.__test.heldKeys().includes('right');
      return out;
    });
    check('버튼: 두 손가락 중 하나만 떼면 유지', r.heldAfterOneUp === true);
    check('버튼: 모두 떼면 릴리즈', r.heldAfterAllUp === false);
    check('스틱: 방향 입력 인식', r.stickRight === true);
    check('스틱: 둘째 손가락 탈취에도 이동 유지', r.stickSurvivesSteal === true);
    check('스틱: 원래 손가락 떼면 정지', r.stickReleased === true);
    await ctx.close();
  }

  // 오프라인 폴백: 서비스워커 캐시 준비 후, ?utm= 붙은 URL로 오프라인 재진입해도 열려야 한다
  {
    console.log('[offline] 쿼리스트링 오프라인 진입 폴백');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    // 주의: waitForFunction에 async 조건식을 주면 프로미스가 그대로 truthy로 평가돼
    // 거짓 통과한다 — page.evaluate(프로미스를 실제로 기다림)를 Node 쪽에서 폴링한다.
    let swReady = false;
    for (let i = 0; i < 60 && !swReady; i++) {
      swReady = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false;
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || !reg.active) return false;
        const keys = await caches.keys();
        if (!keys.length) return false;
        const c = await caches.open(keys[0]);
        return (await c.keys()).length >= 5; // 프리캐시 완료(자산 여러 개) 대기
      }).catch(() => false);
      if (!swReady) await page.waitForTimeout(250);
    }
    check('서비스워커 프리캐시 완료', swReady);
    if (swReady) {
      await ctx.setOffline(true);
      let offlineOk = false;
      try {
        await page.goto(base + '?utm_source=share&fbclid=test', { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__test, { timeout: 8000 });
        offlineOk = true;
      } catch (e) { /* 실패 기록 */ }
      check('오프라인 + 쿼리스트링 진입 성공', offlineOk);
      await ctx.setOffline(false);
    }
    await ctx.close();
  }

  await browser.close();

  // Y-16 WebKit(Safari 엔진) 핵심 5검사 — 로컬 옵션. webkit 바이너리가 있으면 실행하고,
  // 없으면(대부분의 CI/이 환경) 명시적 스킵 로그만 남긴다(실패 아님). CI 잡은 추가하지 않는다.
  // 검사: 모듈 로드 · 캔버스 존재 · 월드 진입 · 렌더 후 월드 유지 · 콘솔/페이지 에러 0
  // (오프라인 폴백은 서비스워커 편차가 커 WebKit 검사에서 제외한다.)
  let wkBrowser = null;
  try {
    wkBrowser = await webkit.launch();
  } catch (e) {
    console.log('[webkit] ⏭ WebKit 미설치 — 스킵(실패 아님).');
    console.log('        설치하려면: npx playwright install webkit');
  }
  if (wkBrowser) {
    console.log('[webkit] Safari 엔진 핵심 5검사');
    try {
      const ctx = await wkBrowser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
      });
      await page.goto(base, { waitUntil: 'load' });
      let loaded = false;
      try { await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 }); loaded = true; } catch (e2) { /* below */ }
      await page.waitForTimeout(400);
      check('WebKit: 게임 모듈 로드', loaded);
      check('WebKit: 캔버스(#game) 존재', !!(await page.$('#game')));
      const entered = await page.evaluate(() => {
        window.__test.applyTiltStreetClass();
        window.__game.mode = 'world';
        return window.__game.mode === 'world';
      });
      await page.waitForTimeout(400);
      check('WebKit: 월드 진입', entered);
      check('WebKit: 렌더 후 월드 유지(프레임 크래시 없음)', (await page.evaluate(() => window.__game.mode)) === 'world');
      check('WebKit: 콘솔/페이지 에러 없음', errors.length === 0);
      errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
      await ctx.close();
    } finally {
      await wkBrowser.close();
    }
  }

  server.close();

  console.log(`\n브라우저 스모크: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('브라우저 테스트 오류:', e); process.exit(1); });
