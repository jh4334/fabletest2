// 실브라우저(Chromium) 스모크 — 방과 후: 그림자 학교
// node 스모크가 못 보는 것: 실제 렌더·콘솔 에러·터치 UI 표시·세로모드 회전 안내.
// 실행: npm run test:browser (Chromium은 PLAYWRIGHT_BROWSERS_PATH 또는 playwright 기본 경로)
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright가 없습니다: npm i -D playwright'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.md': 'text/plain',
};

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.statusCode = 404; res.end('x'); return;
      }
      res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
      res.end(fs.readFileSync(fp));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function resolveChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      const exe = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) { /* 기본 경로 사용 */ }
  return undefined;
}

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  ✔ ' + n); } else { fail++; console.log('  ✘ ' + n); } };
const SHOTS = path.join(ROOT, 'shots');

(async () => {
  const srv = await startServer();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);
  const browser = await chromium.launch({ executablePath: resolveChromium() });

  async function newPage(opt) {
    const ctx = await browser.newContext(opt);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
        errors.push('console: ' + m.text());
      }
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.GAME && window.GAME.state()), { timeout: 8000 });
    await page.waitForTimeout(400);
    return { ctx, page, errors };
  }
  const disp = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).display).catch(() => null);

  // ── 데스크톱: 타이틀 → 새 게임 → 배틀까지 실플레이 ────────────────────────
  {
    console.log('[desktop] 1280x800 실플레이');
    const { ctx, page, errors } = await newPage({ viewport: { width: 1280, height: 800 } });
    check('타이틀 도달', await page.evaluate(() => window.GAME.state().mode === 'title'));
    check('터치 UI 숨김', (await disp(page, '#touch')) === 'none');
    check('회전 안내 숨김', (await disp(page, '#rotate')) === 'none');
    check('실패 안내 숨김', (await disp(page, '#fallback')) === 'none');
    await page.screenshot({ path: path.join(SHOTS, 'rt-title.png') });

    await page.keyboard.press('z');                       // 시작
    for (let i = 0; i < 8; i++) { await page.keyboard.press('z'); await page.waitForTimeout(60); }
    check('인트로 넘기고 월드 진입', await page.evaluate(() => window.GAME.state().mode === 'world'));
    await page.screenshot({ path: path.join(SHOTS, 'rt-world.png') });

    // 배틀 진입 (짝꿍 앞으로 이동)
    await page.evaluate(() => { window.GAME.enterMap('hallway', 15, 5); });
    await page.waitForTimeout(150);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('z'); await page.waitForTimeout(80); }
    check('배틀 진입', await page.evaluate(() => window.GAME.state().mode === 'battle'));
    await page.screenshot({ path: path.join(SHOTS, 'rt-battle.png') });

    // 일시정지 → 재개
    await page.evaluate(() => window.GAME.pause());
    await page.waitForTimeout(120);
    check('일시정지 상태', await page.evaluate(() => window.GAME.state().paused === true));
    await page.screenshot({ path: path.join(SHOTS, 'rt-pause.png') });
    await page.keyboard.press('z');
    await page.waitForTimeout(80);
    check('확인으로 재개', await page.evaluate(() => window.GAME.state().paused === false));

    // R2 신규 기능 — X 수동 일시정지, 버전 노출, 계측
    await page.keyboard.press('x');
    await page.waitForTimeout(80);
    check('X키 수동 일시정지', await page.evaluate(() => window.GAME.state().paused === true));
    await page.keyboard.press('z');
    check('버전 상수 노출', await page.evaluate(() => /^\d+\.\d+\.\d+$/.test(window.GAME.VERSION)));
    check('플레이 계측 동작', await page.evaluate(() => window.GAME.state().stats.sec > 0));
    check('manifest 링크', !!(await page.$('link[rel="manifest"]')));
    const swRes = await page.evaluate(() => fetch('sw.js').then((r) => r.status).catch(() => 0));
    check('sw.js 서빙 가능', swRes === 200);

    check('콘솔·페이지 에러 0', errors.length === 0);
    errors.slice(0, 5).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // ── 2층: 추천 복도 루프의 시각 변화 · 버블 · 형 배틀 ──────────────────────
  {
    console.log('[floor2] 2층 컴퓨터실 · 추천 복도');
    const { ctx, page, errors } = await newPage({ viewport: { width: 1280, height: 800 } });
    await page.keyboard.press('z');                       // 시작
    for (let i = 0; i < 8; i++) { await page.keyboard.press('z'); await page.waitForTimeout(50); }

    // 1층 배틀은 데스크톱 블록에서 확인했으니, 여기서는 2층 상태로 바로 올린다.
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.clearedOf.mate = true; S.stairsOpen.hallway = true;
      window.GAME.enterMap('lab', 7, 8, 'up');
      S.dialog = null; S.toast = null;     // 인트로 넘기던 Z 여파를 화면에서 지운다
    });
    await page.waitForTimeout(200);
    check('2층(컴퓨터실) 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.map === 'lab' && S.floor === 2;
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f2-lab.png') });

    // 복도 루프 전 — 포스터가 제각각, 창문이 보인다
    await page.evaluate(() => {
      window.GAME.enterMap('loop', 8, 5, 'right');
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(200);
    const before = await page.screenshot({ path: path.join(SHOTS, 'rt-f2-loop-before.png') });
    await page.waitForTimeout(250);
    const beforeAgain = await page.screenshot();
    check('복도 화면이 그 자체로는 정지 상태', Buffer.compare(before, beforeAgain) === 0);

    // 추천 문을 네 번 따라간 뒤 — 포스터가 한 그림으로 도배되고 창문까지 가려진다
    await page.evaluate(() => { window.GAME.state().loopN = 4; });
    await page.waitForTimeout(250);
    const after = await page.screenshot({ path: path.join(SHOTS, 'rt-f2-loop-after.png') });
    check('루프를 돌수록 복도 그림이 실제로 달라짐', Buffer.compare(before, after) !== 0);

    // 버블 게이지 MAX — 화면 가장자리가 뿌옇게 닫힌다
    await page.evaluate(() => { window.GAME.state().bubble = window.DATA.MAX_BUBBLE; });
    await page.waitForTimeout(250);
    const bubbled = await page.screenshot({ path: path.join(SHOTS, 'rt-f2-bubble-max.png') });
    check('버블 MAX 오버레이가 화면에 나타남', Buffer.compare(after, bubbled) !== 0);
    check('버블 MAX여도 진행은 막지 않음 (회복 가능 원칙)', await page.evaluate(() => {
      const S = window.GAME.state();
      return S.bubble === window.DATA.MAX_BUBBLE && S.mode === 'world';
    }));

    // 낯선 방 — 형이 모니터 앞에 있다
    await page.evaluate(() => {
      window.GAME.enterMap('roomB', 3, 6, 'right');
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'rt-f2-roomB.png') });

    // 형 배틀 — 내 턴 메뉴까지
    await page.evaluate(() => window.GAME.enterMap('roomB', 6, 3, 'up'));
    await page.waitForTimeout(200);
    for (let i = 0; i < 8; i++) {
      const ready = await page.evaluate(() => {
        const S = window.GAME.state();
        return S.mode === 'battle' && S.battle.phase === 'menu';
      });
      if (ready) break;
      await page.keyboard.press('z'); await page.waitForTimeout(90);
    }
    check('형 배틀 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'battle' && S.battle.id === 'bro';
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f2-bro.png') });

    check('콘솔·페이지 에러 0 (2층)', errors.length === 0);
    errors.slice(0, 5).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // ── 모바일 세로: 회전 안내가 떠야 한다 ────────────────────────────────────
  {
    console.log('[mobile-portrait] 390x844');
    const { ctx, page, errors } = await newPage({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    });
    check('회전 안내 표시', (await disp(page, '#rotate')) !== 'none');
    check('에러 0', errors.length === 0);
    await page.screenshot({ path: path.join(SHOTS, 'rt-portrait.png') });
    await ctx.close();
  }

  // ── 모바일 가로: 터치 UI + 한글 버튼 ──────────────────────────────────────
  {
    console.log('[mobile-landscape] 844x390');
    const { ctx, page, errors } = await newPage({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    });
    check('회전 안내 숨김', (await disp(page, '#rotate')) === 'none');
    check('터치 UI 표시', (await disp(page, '#touch')) !== 'none');
    check('버튼 라벨이 한글(확인)', (await page.$eval('#btnA', (el) => el.textContent)) === '확인');
    check('에러 0', errors.length === 0);
    await page.screenshot({ path: path.join(SHOTS, 'rt-landscape.png') });
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(`\n브라우저 스모크: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('브라우저 테스트 오류:', e); process.exit(1); });
