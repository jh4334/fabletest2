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
    // 생성형 AI 에셋(assets/ai/) — 시트가 하나라도 빠지면 코드 그림으로 조용히 바뀌므로 직접 확인한다
    check('생성형 AI 에셋 전부 로드', await page.evaluate(() => window.ART.SHEETS
      .filter((s) => s.src.indexOf('assets/ai/') === 0).every((s) => window.ART.ready(s.id))));
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
    // 남은 대사를 넘기고 메뉴 입력 유예(0.25초)를 기다린다
    for (let i = 0; i < 12 && await page.evaluate(() => !!window.GAME.state().dialog); i++) {
      await page.keyboard.press('z'); await page.waitForTimeout(80);
    }
    await page.waitForTimeout(300);
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

  // ── 3층: 소문 오염 전/후 복도 · 정정 · 선배 배틀 ──────────────────────────
  {
    console.log('[floor3] 3층 방송실 · 소문 오염');
    const { ctx, page, errors } = await newPage({ viewport: { width: 1280, height: 800 } });
    await page.keyboard.press('z');                       // 시작
    for (let i = 0; i < 8; i++) { await page.keyboard.press('z'); await page.waitForTimeout(50); }

    // 1~2층 배틀은 앞 블록에서 봤으니 3층 복도로 바로 올린다.
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.clearedOf.mate = true; S.clearedOf.bro = true;
      S.stairsOpen.hallway = true; S.stairsOpen.lab = true;
      window.GAME.enterMap('hall3', 7, 1, 'down');
      S.dialog = null; S.toast = null;
    });
    await page.waitForTimeout(250);
    check('3층(복도) 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.map === 'hall3' && S.floor === 3;
    }));
    const clean = await page.screenshot({ path: path.join(SHOTS, 'rt-f3-hall-clean.png') });
    await page.waitForTimeout(250);
    const cleanAgain = await page.screenshot();
    check('오염 전 복도는 정지 상태', Buffer.compare(clean, cleanAgain) === 0);

    // 확인 없이 내보낸 소문 = 복도에 안개. 저장→로드 경로로 안개를 다시 만든다.
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.rumors.r1 = 'polluted';
      window.GAME.save(); window.GAME.load();
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(250);
    const fogged = await page.screenshot({ path: path.join(SHOTS, 'rt-f3-hall-fog.png') });
    check('오염되면 복도 그림이 실제로 달라짐', Buffer.compare(clean, fogged) !== 0);
    check('안개 칸이 실제로 막힌다', await page.evaluate(() => {
      const r = window.DATA.RUMORS[0].fog[0];
      return window.GAME.solidAt(window.DATA.MAPS.hall3, r.x, r.y) === true
        && window.GAME.fogCells('hall3').length === window.DATA.RUMORS[0].fog.length;
    }));
    check('오염 게이지가 올라감', await page.evaluate(() => window.GAME.state().pollute === 1));

    // 방송 콘솔 — 기존 메뉴 문법 그대로(새 UI 없음)
    await page.evaluate(() => {
      const S = window.GAME.state();
      window.DATA.RUMORS.forEach((r) => { if (S.rumors[r.id] === 'unread') S.rumors[r.id] = 'read'; });
      window.GAME.enterMap('studio', 6, 2, 'up');
      S.dialog = null; S.toast = null;
    });
    await page.waitForTimeout(200);
    await page.keyboard.press('z');
    await page.waitForTimeout(200);
    check('방송 콘솔 열림', await page.evaluate(() => window.GAME.state().mode === 'console'));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f3-console.png') });
    await page.keyboard.press('x');
    await page.waitForTimeout(200);           // 취소 입력이 프레임에 반영된 뒤 다음 단계로
    check('취소로 콘솔이 닫힘', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'world' && S.paused === false;
    }));

    // 정정 방송 = 안개가 걷히고 복도가 원래대로
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.rumors.r1 = 'fixed';
      window.GAME.enterMap('hall3', 7, 1, 'down');
      window.GAME.save(); window.GAME.load();
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(250);
    const fixed = await page.screenshot({ path: path.join(SHOTS, 'rt-f3-hall-fixed.png') });
    check('정정하면 복도가 원래 모습으로 돌아옴', Buffer.compare(clean, fixed) === 0);
    check('오염 게이지도 내려감', await page.evaluate(() => window.GAME.state().pollute === 0));

    // 선배 배틀 — 소문 3개를 다 처리해야 나타난다
    check('처리 전에는 선배가 없다', await page.evaluate(() => window.GAME.rumorsDone() === false));
    await page.evaluate(() => {
      const S = window.GAME.state();
      window.DATA.RUMORS.forEach((r) => { S.rumors[r.id] = 'verified'; });
      window.GAME.save(); window.GAME.load();
      window.GAME.enterMap('studio', 11, 5, 'right');
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(200);
    for (let i = 0; i < 8; i++) {
      const ready = await page.evaluate(() => {
        const S = window.GAME.state();
        return S.mode === 'battle' && S.battle.phase === 'menu';
      });
      if (ready) break;
      await page.keyboard.press('z'); await page.waitForTimeout(90);
    }
    check('선배 배틀 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'battle' && S.battle.id === 'senior';
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f3-senior.png') });

    check('콘솔·페이지 에러 0 (3층)', errors.length === 0);
    errors.slice(0, 5).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // ── 4층: 액자 스티커 전/후 · 유리문 개방 · 미술 선생님 배틀 ───────────────
  {
    console.log('[floor4] 4층 미술실 · 출처 스티커');
    const { ctx, page, errors } = await newPage({ viewport: { width: 1280, height: 800 } });
    await page.keyboard.press('z');                       // 시작
    for (let i = 0; i < 8; i++) { await page.keyboard.press('z'); await page.waitForTimeout(50); }

    // 1~3층 배틀은 앞 블록에서 봤으니 4층 전시 복도로 바로 올린다.
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.clearedOf.mate = true; S.clearedOf.bro = true; S.clearedOf.senior = true;
      S.stairsOpen.hallway = true; S.stairsOpen.lab = true; S.stairsOpen.hall3 = true;
      // 셋째 액자 앞에 선다 — 바닥 카드가 화면 밖이라 그림이 완전히 정지한다
      // (픽셀 비교로 '스티커 전/후'만 보려는 것)
      const f = window.DATA.FRAMES[2];
      window.GAME.enterMap('gallery', f.x, f.y - 1, 'down');
      S.dialog = null; S.toast = null;
    });
    await page.waitForTimeout(250);
    check('4층(전시 복도) 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.map === 'gallery' && S.floor === 4;
    }));
    check('유리문이 처음엔 진행을 막는다', await page.evaluate(() => {
      const d = window.DATA.FRAMES[2].door[0];
      return window.GAME.solidAt(window.DATA.MAPS.gallery, d.x, d.y) === true
        && window.GAME.openedCells('gallery').length === 0;
    }));
    const before = await page.screenshot({ path: path.join(SHOTS, 'rt-f4-frame-before.png') });
    await page.waitForTimeout(250);
    const beforeAgain = await page.screenshot();
    check('스티커 붙이기 전 액자 화면은 정지 상태', Buffer.compare(before, beforeAgain) === 0);

    // 출처 스티커를 붙인 뒤 — 액자에 스티커가 붙고 유리문이 열린다.
    // 저장→로드 경로로 열린 칸을 다시 만든다(3층 안개와 같은 재구성 규칙).
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.frames[window.DATA.FRAMES[2].id] = 'done';
      window.GAME.save(); window.GAME.load();
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(250);
    const after = await page.screenshot({ path: path.join(SHOTS, 'rt-f4-frame-after.png') });
    check('스티커를 붙이면 액자 그림이 실제로 달라짐', Buffer.compare(before, after) !== 0);
    check('붙인 유리문이 실제로 열린다', await page.evaluate(() => {
      const f = window.DATA.FRAMES[2];
      return window.GAME.solidAt(window.DATA.MAPS.gallery, f.door[0].x, f.door[0].y) === false
        && window.GAME.openedCells('gallery').length === f.door.length;
    }));
    check('정직 게이지가 올라감', await page.evaluate(() => window.GAME.state().honest === 1));

    // 스티커 제작대 — 방송 콘솔과 같은 커서 문법(새 UI 없음)
    await page.evaluate(() => {
      const S = window.GAME.state();
      window.DATA.FRAMES.forEach((f) => { if (S.frames[f.id] === 'unseen') S.frames[f.id] = 'seen'; });
      window.GAME.enterMap('artroom', 3, 8, 'up');
      S.dialog = null; S.toast = null;
    });
    await page.waitForTimeout(200);
    await page.keyboard.press('z');
    await page.waitForTimeout(200);
    check('스티커 제작대 열림', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'console' && S.con.kind === 'sticker';
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f4-bench.png') });
    await page.keyboard.press('x');
    await page.waitForTimeout(200);
    check('취소로 제작대가 닫힘', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'world' && S.paused === false;
    }));

    // 미술 선생님 배틀 — 액자 3점을 다 밝혀야 나타난다
    check('표기 전에는 선생님이 없다', await page.evaluate(() => window.GAME.framesDone() === false));
    await page.evaluate(() => {
      const S = window.GAME.state();
      window.DATA.FRAMES.forEach((f) => { S.frames[f.id] = 'done'; });
      window.GAME.save(); window.GAME.load();
      window.GAME.enterMap('gallery', 16, 5, 'right');
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(200);
    for (let i = 0; i < 8; i++) {
      const ready = await page.evaluate(() => {
        const S = window.GAME.state();
        return S.mode === 'battle' && S.battle.phase === 'menu';
      });
      if (ready) break;
      await page.keyboard.press('z'); await page.waitForTimeout(90);
    }
    check('미술 선생님 배틀 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'battle' && S.battle.id === 'artTeacher';
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f4-art.png') });

    // paint 탄막 — 물감이 바닥에 자국으로 잠깐 남는다
    await page.evaluate(() => {
      const S = window.GAME.state(), b = S.battle;
      const P = window.DATA.BATTLES.artTeacher;
      b.phase = 'enemy'; b.atk = P.attacks.findIndex((a) => a.kind === 'paint');
      b.timer = 0; b.tell = 0; b.inv = 99; b.bullets = []; b.spawnAcc = 0;
      b.hx = window.GAME.BOX.x + 40; b.hy = window.GAME.BOX.y + 30;
    });
    await page.waitForTimeout(2600);
    check('물감이 바닥에 자국으로 남는다', await page.evaluate(() => {
      const b = window.GAME.state().battle;
      const P = window.DATA.BATTLES.artTeacher;
      const max = P.attacks.find((a) => a.kind === 'paint').maxStain;
      return b.bullets.some((p) => p.stain) && b.bullets.filter((p) => p.drop).length <= max;
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f4-paint.png') });

    check('콘솔·페이지 에러 0 (4층)', errors.length === 0);
    errors.slice(0, 5).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // ── 5층: 조작권 잠식 — 감속 실측 · 회색 안개 MAX · 교감 배틀 · stamp 예고 ──
  {
    console.log('[floor5] 5층 교무실 · 조작권 잠식');
    const { ctx, page, errors } = await newPage({ viewport: { width: 1280, height: 800 } });
    await page.keyboard.press('z');                       // 시작
    for (let i = 0; i < 8; i++) { await page.keyboard.press('z'); await page.waitForTimeout(50); }

    // 1~4층 배틀은 앞 블록에서 봤으니 5층 복도로 바로 올린다.
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.clearedOf.mate = true; S.clearedOf.bro = true;
      S.clearedOf.senior = true; S.clearedOf.artTeacher = true;
      S.stairsOpen.hallway = true; S.stairsOpen.lab = true;
      S.stairsOpen.hall3 = true; S.stairsOpen.gallery = true;
      window.DATA.FRAMES.forEach((f) => { S.frames[f.id] = 'done'; });
      window.GAME.save(); window.GAME.load();
      window.GAME.enterMap('hall5', 2, 3, 'right');
      const T = window.GAME.state();
      T.dialog = null; T.toast = null;
    });
    await page.waitForTimeout(250);
    check('5층(교무실 복도) 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.map === 'hall5' && S.floor === 5;
    }));
    check('장치 셋이 처음엔 진행을 막는다', await page.evaluate(() =>
      window.DATA.LOCKS.every((k) =>
        window.GAME.solidAt(window.DATA.MAPS[k.map], k.at.x, k.at.y) === true)));
    check('반짝임 표시가 켜져 있다', await page.evaluate(() => window.GAME.glintOn() === true));
    // 회귀(v0.9.0): 5층 카드 셋을 다 들면 상단 '가진 카드' 글자가 패널 밖으로 넘쳤다(97px)
    const bag = await page.evaluate(() => {
      const S = window.GAME.state();
      window.DATA.CARDS.forEach((c) => { if (c.floor === 5) { S.cards[c.id].held = true; S.cards[c.id].map = null; } });
      const fit = window.GAME.bagFit ? window.GAME.bagFit() : null;
      ['handNote', 'oldStamp', 'nameBook'].forEach((id) => {
        const c = window.DATA.CARDS.find((x) => x.id === id);
        S.cards[id] = { held: false, map: c.at.map, x: c.at.x, y: c.at.y };
      });
      return fit;
    });
    check('카드 셋을 들어도 상단 패널 안에 들어간다', !!bag && bag.width <= bag.max);
    const lit = await page.screenshot({ path: path.join(SHOTS, 'rt-f5-hall-glint.png') });

    // 감속 실측 — 같은 시간 동안 실제로 얼마나 갔나(상수가 아니라 화면에서 잰다)
    async function runFor(ms) {
      await page.evaluate(() => {
        const S = window.GAME.state();
        S.px = 2 * 48 + 24; S.py = 3 * 48 + 42; S.dialog = null; S.toast = null;
      });
      await page.waitForTimeout(120);
      const x0 = await page.evaluate(() => window.GAME.state().px);
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(ms);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(60);
      return (await page.evaluate(() => window.GAME.state().px)) - x0;
    }
    const fast = await runFor(700);
    await page.evaluate(() => { window.GAME.state().depend = window.DATA.MAX_DEPEND; });
    const slow = await runFor(700);
    const ratio = slow / fast;
    console.log(`     · 감속 실측: ${fast.toFixed(0)}px → ${slow.toFixed(0)}px (배율 ${ratio.toFixed(2)})`);
    check('감속 전에는 제 속도로 걷는다', fast > 60);
    check('의존 MAX면 눈에 띄게 느려진다', slow < fast * 0.8);
    check('의존 MAX여도 멈추지는 않는다 (최저 속도 > 0)', slow > 0);
    check('실측 배율이 설계치(0.55)에 맞는다', ratio > 0.42 && ratio < 0.70);

    // 회색 안개 MAX — 가장자리가 흐려지되 아래 회복 안내 띠는 그대로다
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.depend = window.DATA.MAX_DEPEND; S.dialog = null; S.toast = null;
    });
    await page.waitForTimeout(250);
    const dim = await page.screenshot({ path: path.join(SHOTS, 'rt-f5-depend-max.png') });
    check('의존 MAX 오버레이가 화면에 나타남', Buffer.compare(lit, dim) !== 0);
    check('의존 +2부터 반짝임 표시가 꺼진다',
      await page.evaluate(() => window.GAME.glintOn() === false));
    // 헌법 §3-3: 회복 안내 띠(화면 아래 24px)는 안개가 덮지 않는다.
    check('회복 안내 띠는 안개에 덮이지 않는다', await page.evaluate(() => {
      const cv = document.getElementById('game');
      const c = cv.getContext('2d');
      const d = c.getImageData(0, cv.height - 20, cv.width, 18).data;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 420) bright++;
      return bright > 40;                     // 흰 글자 획이 살아 있다
    }));

    // 나비스 단말 — 방송 콘솔과 같은 커서 문법(새 UI 없음)
    await page.evaluate(() => {
      const S = window.GAME.state();
      S.depend = 0;
      const k = window.DATA.LOCKS.find((x) => x.id === 'innerDoor');
      window.GAME.enterMap(k.map, k.term.x, k.term.y - 1, 'down');
      const T = window.GAME.state();
      T.dialog = null; T.toast = null;
    });
    await page.waitForTimeout(200);
    await page.keyboard.press('z');
    await page.waitForTimeout(200);
    check('나비스 단말 열림', await page.evaluate(() => {
      const S = window.GAME.state();
      return S.mode === 'console' && S.con.kind === 'navis' && S.con.lock === 'innerDoor';
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f5-navis.png') });
    await page.keyboard.press('x');
    await page.waitForTimeout(200);
    check('취소로 단말이 닫힘', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'world' && S.paused === false;
    }));

    // 교감 배틀 — 캐비닛을 열어야 안쪽 방에 닿는다
    await page.evaluate(() => {
      const S = window.GAME.state();
      window.DATA.LOCKS.forEach((k) => { S.locks[k.id] = true; });
      window.GAME.save(); window.GAME.load();
      window.GAME.enterMap('office', 10, 5, 'right');
      window.GAME.state().dialog = null;
    });
    await page.waitForTimeout(200);
    check('연 장치는 실제로 통행 가능해진다', await page.evaluate(() =>
      window.DATA.LOCKS.every((k) =>
        window.GAME.solidAt(window.DATA.MAPS[k.map], k.at.x, k.at.y) === false)));
    for (let i = 0; i < 8; i++) {
      const ready = await page.evaluate(() => {
        const S = window.GAME.state();
        return S.mode === 'battle' && S.battle.phase === 'menu';
      });
      if (ready) break;
      await page.keyboard.press('z'); await page.waitForTimeout(90);
    }
    check('교감 배틀 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.mode === 'battle' && S.battle.id === 'vice';
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f5-vice.png') });

    // stamp 탄막 — 찍힐 칸을 먼저 보여 준 뒤 내리찍는다
    await page.evaluate(() => {
      const S = window.GAME.state(), b = S.battle;
      const P = window.DATA.BATTLES.vice;
      b.phase = 'enemy'; b.atk = P.attacks.findIndex((a) => a.kind === 'stamp');
      b.timer = 0; b.tell = 0; b.inv = 99; b.bullets = []; b.spawnAcc = P.attacks[b.atk].every;
      b.hx = window.GAME.BOX.x + 40; b.hy = window.GAME.BOX.y + 110;
    });
    await page.waitForTimeout(350);
    check('도장은 먼저 예고 칸으로 뜬다', await page.evaluate(() => {
      const b = window.GAME.state().battle;
      return b.bullets.length > 0 && b.bullets.every((p) => p.stamp && p.warn > 0);
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-f5-stamp.png') });
    await page.waitForTimeout(900);
    check('동시에 뜨는 도장이 상한을 넘지 않는다', await page.evaluate(() => {
      const b = window.GAME.state().battle;
      const a = window.DATA.BATTLES.vice.attacks.find((x) => x.kind === 'stamp');
      return b.bullets.filter((p) => p.stamp).length <= a.cells;
    }));

    check('콘솔·페이지 에러 0 (5층)', errors.length === 0);
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
    // 회귀(v0.9.0): 터치 버튼은 레터박스 여백에 — 대사·배틀 메뉴 글자를 가리지 않는다
    const lay = await page.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect();
      const hit = (id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return r.right > c.left + 1 && r.left < c.right - 1 && r.bottom > c.top + 1 && r.top < c.bottom - 1;
      };
      const b = window.GAME.TBTN, sx = c.width / 720, sy = c.height / 528;
      const tb = document.elementFromPoint(c.left + (b.x + b.w / 2) * sx, c.top + (b.y + b.h / 2) * sy);
      const cs = getComputedStyle(document.getElementById('btnA'));
      return {
        stick: hit('stick'), a: hit('btnA'), b: hit('btnB'),
        tbtn: tb && tb.id, size: cs.fontSize, weight: cs.fontWeight,
      };
    });
    check('스틱이 캔버스를 가리지 않는다(좌측 여백)', !lay.stick);
    check('확인 버튼이 캔버스를 가리지 않는다(우측 여백)', !lay.a);
    check('취소 버튼이 캔버스를 가리지 않는다(우측 여백)', !lay.b);
    check('타이틀 [선생님] 버튼이 가려지지 않는다', lay.tbtn === 'game');
    check('터치 버튼 글꼴 선언이 유효(19px·굵게)', lay.size === '19px' && String(lay.weight) === '700');
    check('에러 0', errors.length === 0);
    await page.screenshot({ path: path.join(SHOTS, 'rt-landscape.png') });
    await ctx.close();
  }

  // ── 태블릿 4:3 — 여백이 없으면 줄이고 반투명, 글자 줄을 피한다 ─────────────
  {
    console.log('[tablet] 1024x768 터치');
    const { ctx, page, errors } = await newPage({
      viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true,
    });
    const lay = await page.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect(), sy = c.height / 528;
      const textTop = c.top + 384 * sy;           // 대사·배틀 메뉴 상자 윗변
      const info = (id) => {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        return { bottom: r.bottom, w: r.width, op: +getComputedStyle(el).opacity };
      };
      const b = window.GAME.TBTN, sx = c.width / 720;
      const tb = document.elementFromPoint(c.left + (b.x + b.w / 2) * sx, c.top + (b.y + b.h / 2) * sy);
      return { textTop, stick: info('stick'), a: info('btnA'), b: info('btnB'), tbtn: tb && tb.id };
    });
    check('여백이 없으면 버튼이 줄어든다', lay.a.w < 82 && lay.stick.w < 108);
    check('여백이 없으면 반투명', lay.a.op < 1 && lay.b.op < 1 && lay.stick.op < 1);
    check('버튼이 대사·메뉴 상자 위에 있다(글자를 덮지 않음)',
      lay.a.bottom <= lay.textTop && lay.b.bottom <= lay.textTop && lay.stick.bottom <= lay.textTop);
    check('태블릿에서도 [선생님] 버튼이 가려지지 않는다', lay.tbtn === 'game');
    check('에러 0', errors.length === 0);
    await page.screenshot({ path: path.join(SHOTS, 'rt-tablet.png') });
    await ctx.close();
  }

  // ── 터치 실입력 (회귀 v0.9.0) ─────────────────────────────────────────────
  // 키보드·상태 주입만으로는 못 잡는다 — 스틱이 메뉴 커서를 못 움직이던 결함.
  // CDP 터치 이벤트로 실제 손가락 경로(포인터 이벤트 합성)를 그대로 탄다.
  {
    console.log('[touch] 844x390 CDP 터치 — 메뉴·배틀·엔딩·타이틀·교사');
    const { ctx, page, errors } = await newPage({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    });
    const cdp = await ctx.newCDPSession(page);
    const center = (sel) => page.$eval(sel, (el) => {
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const touchTap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(90);
    };
    const pressA = async () => { const c = await center('#btnA'); await touchTap(c.x, c.y); };
    // 스틱을 한 방향으로 밀었다 놓는다 (dx,dy는 CSS px)
    const flick = async (dx, dy) => {
      const c = await center('#stick');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
      await page.waitForTimeout(30);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + dx / 2, y: c.y + dy / 2 }] });
      await page.waitForTimeout(30);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + dx, y: c.y + dy }] });
      await page.waitForTimeout(120);              // 밀고 있는 동안 여러 프레임 — 반복 입력이 생기면 안 된다
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(90);
    };
    const st = (fn) => page.evaluate(fn);
    // 대사가 남아 있는 동안 A만 누른다 — 끝나면 메뉴 입력 유예를 기다린다
    const clearDialogA = async (max = 14) => {
      for (let i = 0; i < max && await st(() => !!window.GAME.state().dialog); i++) await pressA();
      await page.waitForTimeout(350);
    };

    await pressA();
    check('터치 A로 새 게임 시작', await st(() => window.GAME.state().mode === 'world'));
    await clearDialogA();
    check('터치 A로 인트로를 넘긴다', await st(() => !window.GAME.state().dialog));

    // 1층 배틀 — 짝꿍 앞으로 옮긴 뒤 대사를 터치로 넘긴다
    await st(() => { window.GAME.enterMap('hallway', 15, 5); });
    await page.waitForTimeout(150);
    await clearDialogA();
    check('배틀 메뉴 도달', await st(() => {
      const S = window.GAME.state(); return S.mode === 'battle' && S.battle.phase === 'menu';
    }));
    const cur = () => st(() => window.GAME.state().battle.cursor);
    const c0 = await cur();
    await flick(40, 0);
    check('스틱 오른쪽 → 배틀 커서가 옆 칸으로', (await cur()) === (c0 ^ 1));
    await flick(0, 40);
    check('스틱 아래 → 배틀 커서가 아래 칸으로', (await cur()) === (c0 ^ 3));
    await flick(-40, 0);
    check('스틱 왼쪽 → 가만히 듣기 칸', (await cur()) === 2);
    check('한 번 밀면 한 칸만 (누르고 있어도 반복 없음)', (await cur()) === 2);
    await pressA();
    check('터치로 가만히 듣기를 고른다', await st(() => window.GAME.state().battle.heard === true));

    // 옥상 — 엔딩 선택과 확인창을 스틱·A로만 확정한다
    await st(() => {
      const S = window.GAME.state();
      S.battle = null; S.mode = 'world'; S.dialog = null;
      window.DATA.PROMISES.forEach((p) => { S.clearedOf[p.who] = true; });
      window.GAME.enterMap('rooftop', 9, 6, 'up');
    });
    await page.waitForTimeout(150);
    await clearDialogA();
    await st(() => {                                  // 다섯 질문은 [rooftop]이 키보드로 본다
      const f = window.GAME.state().fin; f.q = 5; f.phase = 'choose'; f.cursor = 0;
    });
    await flick(0, 40);
    check('스틱으로 엔딩 선택 커서 이동', await st(() => window.GAME.state().fin.cursor === 1));
    await pressA();
    check('터치 A로 확인창', await st(() => window.GAME.state().fin.phase === 'confirm'));
    await flick(-40, 0);
    check('스틱으로 확인창 [네]', await st(() => window.GAME.state().fin.confirmCursor === 0));
    await pressA();
    await clearDialogA(20);
    check('터치만으로 엔딩 확정', await st(() => {
      const S = window.GAME.state(); return S.ending === 'B' && S.mode === 'clear';
    }));

    // 완결 화면 → 타이틀 → 처음부터(확인창) — 전부 스틱·A
    const want = 1;                                   // [타이틀로]
    if (await st(() => window.GAME.clearUi().cursor) !== want) await flick(0, 40);
    check('스틱으로 완결 화면 메뉴 이동', await st(() => window.GAME.clearUi().cursor === 1));
    await pressA();
    check('터치로 타이틀 복귀(저장 유지)', await st(() =>
      window.GAME.state().mode === 'title' && window.GAME.hasSave()));
    await flick(0, 40);
    await pressA();
    check('스틱으로 타이틀 [처음부터] → 확인창', await st(() => window.GAME.titleUi().confirm === true));
    await flick(-40, 0);
    await pressA();
    check('확인창 [네]로 새로 시작', await st(() => window.GAME.state().mode === 'world'));

    // 교사 화면 — 캔버스 [선생님] 버튼 터치 → 스틱으로 탭 이동
    await st(() => { window.GAME.setState(window.GAME.blankState()); });
    await page.waitForTimeout(120);
    const tb = await page.evaluate(() => {
      const r = document.getElementById('game').getBoundingClientRect(), b = window.GAME.TBTN;
      return { x: r.left + (b.x + b.w / 2) * (r.width / 720), y: r.top + (b.y + b.h / 2) * (r.height / 528) };
    });
    await touchTap(tb.x, tb.y);
    check('터치로 [선생님] 버튼 진입', await st(() => window.GAME.state().mode === 'teacher'));
    await flick(40, 0);
    check('스틱으로 교사 화면 탭 이동', await st(() => window.GAME.teacherUi().tab === 1));
    check('콘솔·페이지 에러 0', errors.length === 0);
    errors.slice(0, 5).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // ── 옥상: 나비스 문답 · 엔딩 ──────────────────────────────────────────────
  {
    console.log('[rooftop] 옥상 · 나비스');
    const { ctx, page, errors } = await newPage({ viewport: { width: 1280, height: 800 } });
    await page.keyboard.press('z');
    for (let i = 0; i < 8; i++) { await page.keyboard.press('z'); await page.waitForTimeout(40); }
    // 다섯 층을 되돌린 상태로 옥상에 올린다
    await page.evaluate(() => {
      const S = window.GAME.state();
      window.DATA.PROMISES.forEach((p) => { S.clearedOf[p.who] = true; });
      window.GAME.enterMap('rooftop', 9, 8, 'up');
      S.dialog = null; S.toast = null;
    });
    await page.waitForTimeout(250);
    check('옥상 진입', await page.evaluate(() => {
      const S = window.GAME.state(); return S.map === 'rooftop' && S.floor === 6;
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-roof.png') });

    // 안테나 앞으로 걸어가면 나비스가 말을 건다
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(150);
    check('나비스가 먼저 말을 건다', await page.evaluate(() => !!window.GAME.state().dialog));
    // 대사가 남아 있는 동안만 넘긴다 — 넘치면 다음 선택을 눌러 버린다
    // 끝나면 메뉴 입력 유예(0.25초)를 기다린다 — 사람이 읽고 고르는 속도
    const clearDialog = async (max = 12) => {
      for (let i = 0; i < max; i++) {
        if (!await page.evaluate(() => !!window.GAME.state().dialog)) break;
        await page.keyboard.press('z');
        await page.waitForTimeout(70);
      }
      await page.waitForTimeout(300);
    };
    await clearDialog();
    check('문답 모드 진입', await page.evaluate(() => window.GAME.state().mode === 'finale'));
    check('약속 고르기 화면', await page.evaluate(() => window.GAME.state().fin.phase === 'pick'));
    const qShot = await page.screenshot({ path: path.join(SHOTS, 'rt-roof-ask.png') });

    // 다섯 질문을 순서대로 답한다 (중간에 한 번 흔들림)
    // 흔들림이 시작돼 있으면 스크린샷을 남기고 시간을 넘긴다
    const passShake = async () => {
      if (!await page.evaluate(() => {
        const f = window.GAME.state().fin; return !!f && f.phase === 'shake';
      })) return false;
      await page.screenshot({ path: path.join(SHOTS, 'rt-roof-shake.png') });
      await page.evaluate(() => { window.GAME.state().fin.timer = 999; });
      await page.waitForTimeout(120);
      await clearDialog();
      return true;
    };
    for (let q = 0; q < 5; q++) {
      await clearDialog();
      await passShake();
      const ready = await page.evaluate((i) => {
        const S = window.GAME.state();
        if (!S.fin || S.fin.phase !== 'pick') return { phase: S.fin && S.fin.phase, q: S.fin && S.fin.q };
        S.fin.cursor = i;
        return { phase: 'pick', q: S.fin.q };
      }, q);
      if (ready.phase !== 'pick') { console.log(`     · q${q} 진입 실패: ${ready.phase} (q=${ready.q})`); }
      await page.keyboard.press('z');
      await page.waitForTimeout(120);
      await clearDialog();
      await passShake();
    }
    check('다섯 질문을 모두 답함', await page.evaluate(() => window.GAME.state().fin.q === 5));
    check('엔딩 선택 화면', await page.evaluate(() => window.GAME.state().fin.phase === 'choose'));
    await page.screenshot({ path: path.join(SHOTS, 'rt-roof-choose.png') });
    check('문답 화면이 서로 다른 그림', Buffer.compare(qShot,
      await page.screenshot()) !== 0);

    // 엔딩 A 선택 → 확인 → 완결
    await page.keyboard.press('z');
    await page.waitForTimeout(100);
    check('확인을 한 번 묻는다', await page.evaluate(() => window.GAME.state().fin.phase === 'confirm'));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('z');
    await page.waitForTimeout(100);
    await clearDialog(16);
    check('엔딩 A 도달', await page.evaluate(() => window.GAME.state().ending === 'A'));
    check('완결 화면', await page.evaluate(() => window.GAME.state().mode === 'clear'));
    await page.screenshot({ path: path.join(SHOTS, 'rt-roof-end.png') });
    check('콘솔·페이지 에러 0', errors.length === 0);
    errors.slice(0, 5).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // ── 교사 도구: T키 진입/복귀 · 3탭 스크린샷 ────────────────────────────────
  {
    console.log('[teacher] 교사 화면 3탭');
    const { ctx, page, errors } = await newPage({ viewport: { width: 1280, height: 800 } });
    check('타이틀 도달', await page.evaluate(() => window.GAME.state().mode === 'title'));
    await page.screenshot({ path: path.join(SHOTS, 'rt-title-teacher-btn.png') });

    // 실제 저장 1건을 심어 리포트 탭이 표로 채워지게 한다(교사 화면은 저장만 읽는다)
    await page.evaluate(() => {
      localStorage.setItem(window.DATA.SAVE_KEY, JSON.stringify({
        v: 1, map: 'hall4', px: 100, py: 100, dir: 0,
        visited: { classroom: true, hall3: true, hall4: true },
        clearedOf: { mate: true, bro: true, senior: true },
        stats: { sec: 512, stolen: 3, retreats: 2, missSticker: 1, missPromise: 1 },
      }));
    });

    await page.keyboard.press('t');
    await page.waitForTimeout(150);
    check('T키로 교사 화면 진입', await page.evaluate(() => window.GAME.state().mode === 'teacher'));
    const tab1 = await page.screenshot({ path: path.join(SHOTS, 'rt-teacher-tab1.png') });

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    check('탭2(우리 반 기록)로 전환', await page.evaluate(() => window.GAME.teacherUi().tab === 1));
    check('저장 1건을 읽어 표가 찬다',
      await page.evaluate(() => (window.GAME.teacherReport() || {}).stolen === 3));
    const tab2 = await page.screenshot({ path: path.join(SHOTS, 'rt-teacher-tab2.png') });
    check('탭1과 탭2는 서로 다른 그림', Buffer.compare(tab1, tab2) !== 0);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    check('탭3(차시 안내)로 전환', await page.evaluate(() => window.GAME.teacherUi().tab === 2));
    const tab3 = await page.screenshot({ path: path.join(SHOTS, 'rt-teacher-tab3.png') });
    check('탭2와 탭3은 서로 다른 그림', Buffer.compare(tab2, tab3) !== 0);

    await page.keyboard.press('x');
    await page.waitForTimeout(150);
    check('X로 타이틀 복귀', await page.evaluate(() => window.GAME.state().mode === 'title'));

    // 터치 기기용 [선생님] 버튼 — 실제 마우스 클릭으로 같은 화면이 열린다
    const box = await page.evaluate(() => {
      const r = document.getElementById('game').getBoundingClientRect();
      const b = window.GAME.TBTN;
      return {
        x: r.left + (b.x + b.w / 2) * (r.width / 720),
        y: r.top + (b.y + b.h / 2) * (r.height / 528),
      };
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(150);
    check('[선생님] 버튼 클릭으로 진입', await page.evaluate(() => window.GAME.state().mode === 'teacher'));

    // 차시 시작 — 확인 1회 뒤 해당 층으로 바로 들어간다
    await page.evaluate(() => { window.GAME.teacherUi().cursor = 2; });   // 3층
    await page.keyboard.press('z');
    await page.waitForTimeout(120);
    check('차시 시작은 확인을 묻는다', await page.evaluate(() => !!window.GAME.teacherUi().confirm));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('z');
    await page.waitForTimeout(250);
    check('3층 차시로 바로 진입', await page.evaluate(() => {
      const S = window.GAME.state();
      return S.mode === 'world' && S.map === 'hall3' && S.floor === 3 && S.clearedOf.bro === true;
    }));
    await page.screenshot({ path: path.join(SHOTS, 'rt-teacher-lesson3.png') });

    // 본편 플레이 중에는 T가 무시된다 (수업 중 오조작 방지)
    await page.keyboard.press('t');
    await page.waitForTimeout(120);
    check('본편 중 T는 무시된다', await page.evaluate(() => window.GAME.state().mode === 'world'));

    check('콘솔·페이지 에러 0', errors.length === 0);
    errors.slice(0, 5).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(`\n브라우저 스모크: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('브라우저 테스트 오류:', e); process.exit(1); });
