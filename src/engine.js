// 엔진 — 방과 후: 그림자 학교 / 1~5층
// 한글 문자열은 한 줄도 두지 않는다. 화면에 나오는 말은 전부 DATA.T / DATA.* 참조.
(function (g) {
  'use strict';

  var VERSION = '0.8.0';   // package.json 과 validate 가 대조한다 — 배포 캐시 문의 판별용
  var A = g.ART, D = g.DATA;
  var W = 720, H = 528, T = 48;
  var FACE = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Nanum Gothic",sans-serif';
  var SPEED = 132;          // 픽셀/초
  var PICK_R = 30;          // 카드 줍기 반경
  var TERM_R = 40;          // 광고 단말 반경
  var TERM_COOL = 4.5;      // 단말이 다시 뺏기까지 쉬는 시간
  var NPC_R = 58;
  var WARN_R = 104;         // 추천 문 사전 경고 반경 (밟기 두 칸 전)

  var cv = null, ctx = null, S = null, last = 0, raf = null;
  var keys = {}, edge = {}, touchVec = { x: 0, y: 0 };

  // ── 상태 ────────────────────────────────────────────────────────────────
  function blankState() {
    var cards = {};
    D.CARDS.forEach(function (c) {
      cards[c.id] = { held: false, map: c.at.map, x: c.at.x, y: c.at.y };
    });
    var rumors = {};
    (D.RUMORS || []).forEach(function (r) { rumors[r.id] = 'unread'; });
    var frames = {}, stickers = {};
    (D.FRAMES || []).forEach(function (f) { frames[f.id] = 'unseen'; stickers[f.id] = null; });
    var m = D.MAPS.classroom;
    return {
      mode: 'title', map: 'classroom', floor: m.fl || 1,
      px: m.spawn.x * T + T / 2, py: m.spawn.y * T + T - 6,
      dir: A.DIR[m.spawn.dir] || 0, frame: 0, walkT: 0, moving: false,
      cam: { x: 0, y: 0 }, exposure: 0, bubble: 0, loopN: 0, cards: cards,
      flags: {
        intro: false, firstCard: false, firstTake: false, termWarn: false,
        recoWarn: false, airWarn: false, seniorUp: false, artUp: false,
        trustWarn: false, done: false
      },
      // 인물·맵 단위 진행은 층이 늘어도 그대로 쓰이도록 사전으로 둔다.
      heardOf: {}, clearedOf: {}, stairsOpen: {}, visited: { classroom: true },
      // 3층: 소문 상태 머신 + 오염 게이지 + 복도를 막는 안개 칸
      rumors: rumors, pollute: 0, fog: {}, con: null,
      // 4층: 액자 상태 머신 + 만든 스티커 + 정직 게이지 + 열린 유리문 칸
      // (opened 는 안개의 역방향 — 같은 합성 지점에서 통행/그리기를 뒤집는다)
      frames: frames, stickers: stickers, honest: 0, opened: {},
      // 5층: 잠긴 장치 개방 여부 + 맡긴 장치(회복 대상) + 의존 게이지 + 열쇠
      // 열린 장치 칸은 유리문과 같은 opened 합성 지점에 얹힌다.
      locks: {}, trusted: {}, depend: 0, hasKey: false,
      // 옥상: 나비스 문답(질문 인덱스·단계) + 고른 엔딩
      fin: null, ending: null,
      dialog: null, battle: null, toast: null, cool: {}, time: 0, flash: 0, paused: false,
      stats: { sec: 0, stolen: 0, retreats: 0, missSticker: 0 },  // 교사 관찰·아이 성취감용 계측
      looked: {}                                   // 재조사 대사 분기(세션 한정, 저장 안 함)
    };
  }

  // ── 3층 소문·안개 ───────────────────────────────────────────────────────
  function rumorDef(id) {
    var list = D.RUMORS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // 안개는 소문 상태에서 다시 만든다 — 저장값이 어긋나도 화면과 통행이 어긋나지 않는다.
  function rebuildFog() {
    var f = {};
    (D.RUMORS || []).forEach(function (r) {
      if (S.rumors[r.id] !== 'polluted') return;
      (r.fog || []).forEach(function (c) {
        (f[r.map] = f[r.map] || []).push({ x: c.x, y: c.y });
      });
    });
    S.fog = f;
    S.pollute = countPolluted();
  }
  function countPolluted() {
    var n = 0;
    (D.RUMORS || []).forEach(function (r) { if (S.rumors[r.id] === 'polluted') n++; });
    return Math.max(0, Math.min(D.MAX_POLLUTE, n));
  }
  function rumorsDone() {
    var list = D.RUMORS || [];
    for (var i = 0; i < list.length; i++) {
      var st = S.rumors[list[i].id];
      if (st !== 'verified' && st !== 'fixed') return false;
    }
    return list.length > 0;
  }
  // 맵 객체 → 이름. 안개는 맵 이름으로 저장되는데 렌더·충돌은 맵 객체만 받는다.
  var mapPairs = null;
  function nameOf(m) {
    if (!mapPairs) {
      mapPairs = [];
      for (var k in D.MAPS) mapPairs.push([D.MAPS[k], k]);
    }
    for (var i = 0; i < mapPairs.length; i++) if (mapPairs[i][0] === m) return mapPairs[i][1];
    return null;
  }
  function fogOf(m) {
    if (!S || !S.fog) return [];
    return S.fog[nameOf(m)] || [];
  }
  function fogAt(m, tx, ty) {
    var list = fogOf(m);
    for (var i = 0; i < list.length; i++) if (list[i].x === tx && list[i].y === ty) return true;
    return false;
  }

  // ── 4층 액자·출처 스티커 ────────────────────────────────────────────────
  // 안개의 역방향: 액자 상태에서 열린 칸을 다시 만들어 solidAt/그리기에 얹는다.
  function frameDef(id) {
    var list = D.FRAMES || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function authorDef(id) {
    var list = D.AUTHORS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function frameAt(m, tx, ty) {
    var name = nameOf(m), list = D.FRAMES || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.map === name && f.x === tx && f.y === ty) return f;
    }
    return null;
  }
  function sampleAt(m, tx, ty) {
    var list = m.samples || [];
    for (var i = 0; i < list.length; i++) if (list[i].x === tx && list[i].y === ty) return list[i];
    return null;
  }
  function framesDoneN() {
    var n = 0;
    (D.FRAMES || []).forEach(function (f) { if (S.frames[f.id] === 'done') n++; });
    return n;
  }
  function framesAllDone() {
    var list = D.FRAMES || [];
    return list.length > 0 && framesDoneN() === list.length;
  }
  // 4층 유리문 + 5층 잠긴 장치가 같은 합성 지점을 쓴다 — 통행/그리기를 한 곳에서 뒤집는다.
  function rebuildOpened() {
    var o = {};
    (D.FRAMES || []).forEach(function (f) {
      if (S.frames[f.id] !== 'done') return;
      (f.door || []).forEach(function (c) {
        (o[f.map] = o[f.map] || []).push({ x: c.x, y: c.y });
      });
    });
    (D.LOCKS || []).forEach(function (k) {
      if (!S.locks[k.id]) return;
      (k.open || []).forEach(function (c) {
        (o[k.map] = o[k.map] || []).push({ x: c.x, y: c.y });
      });
    });
    S.opened = o;
    S.honest = Math.max(0, Math.min(D.MAX_HONEST, framesDoneN()));
  }
  function openedOf(m) {
    if (!S || !S.opened) return [];
    return S.opened[nameOf(m)] || [];
  }
  function openedAt(m, tx, ty) {
    var list = openedOf(m);
    for (var i = 0; i < list.length; i++) if (list[i].x === tx && list[i].y === ty) return true;
    return false;
  }
  // 잠긴 서랍은 액자 한 점만 밝히면 열린다 (첫 성공의 보상)
  function drawerOpen() { return framesDoneN() >= 1; }
  function cardHidden(c) { return !!c.locked && !drawerOpen(); }

  // ── 5층 잠긴 장치 · 의존 게이지 ─────────────────────────────────────────
  function lockDef(id) {
    var list = D.LOCKS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function lockOpen(id) { return !!(S && S.locks[id]); }
  // 단말 칸 / 장치 칸을 좌표로 찾는다 (맵 이름 하드코딩 없이)
  function lockByTerm(m, tx, ty) {
    var name = nameOf(m), list = D.LOCKS || [];
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      if (k.map === name && k.term.x === tx && k.term.y === ty) return k;
    }
    return null;
  }
  function lockByCell(m, tx, ty) {
    var name = nameOf(m), list = D.LOCKS || [];
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      if (k.map !== name) continue;
      for (var j = 0; j < (k.open || []).length; j++) {
        if (k.open[j].x === tx && k.open[j].y === ty) return k;
      }
    }
    return null;
  }
  function paperDef(id) {
    var list = D.PAPERS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function paperAt(m, tx, ty) {
    var list = m.papers || [];
    for (var i = 0; i < list.length; i++) if (list[i].x === tx && list[i].y === ty) return list[i];
    return null;
  }
  function setDepend(v) {
    S.depend = Math.max(0, Math.min(D.MAX_DEPEND, v));
  }
  // 감속은 SPEED 상수를 건드리지 않고 여기서 파생한다(스펙 §7).
  // 최저 속도는 0이 되지 않는다 — 느려질 뿐, 멈추지 않는다(헌법 §3-3).
  function moveSpeed() {
    var d = S ? Math.max(0, Math.min(D.MAX_DEPEND, S.depend)) : 0;
    return SPEED * Math.max(0.1, 1 - D.DEPEND_SLOW * d);
  }
  // 반짝임 표시는 5층 한정 연출. 의존이 오르면 꺼진다(1~4층 소급 적용 안 함).
  function glintOn() { return !!S && S.floor === 5 && S.depend < D.DEPEND_DIM; }

  // 가방·게이지·보여주기 목록은 전부 현재 층 카드만 본다 (층 분리).
  // 약속 카드는 되돌린 인물에서 파생한다 — 따로 모으는 시스템을 두지 않는다.
  function promiseIds() {
    return (D.PROMISES || []).filter(function (p) { return !!S.clearedOf[p.who]; })
      .map(function (p) { return p.id; });
  }
  function promiseDef(id) {
    var list = D.PROMISES || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function heldIds() {
    var out = [];
    D.CARDS.forEach(function (c) {
      if (c.floor === S.floor && S.cards[c.id].held) out.push(c.id);
    });
    return out;
  }
  function cardDef(id) {
    for (var i = 0; i < D.CARDS.length; i++) if (D.CARDS[i].id === id) return D.CARDS[i];
    return null;
  }

  // ── 맵 유틸 ─────────────────────────────────────────────────────────────
  function mapOf(name) { return D.MAPS[name]; }
  function chAt(m, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null;
    return m.grid[ty].charAt(tx);
  }
  function legend(ch) { return (ch && D.LEGEND[ch]) || null; }
  function solidAt(m, tx, ty) {
    var ch = chAt(m, tx, ty); if (ch === null) return true;
    if (fogAt(m, tx, ty)) return true;        // 소문 안개는 통로를 막는다(grid는 그대로)
    if (openedAt(m, tx, ty)) return false;    // 출처를 밝힌 유리문은 열린다(안개의 역방향)
    var L = legend(ch); return !L || !!L.solid;
  }
  function isWallCh(m, tx, ty) {
    var ch = chAt(m, tx, ty); if (ch === null) return true;
    var L = legend(ch); return !!(L && L.wall);
  }
  // 벽 링(5x5 블록) 자동 선택 — 열린 이웃/대각선으로 모서리를 고른다.
  function wallOffset(m, tx, ty) {
    var n = !isWallCh(m, tx, ty - 1), s = !isWallCh(m, tx, ty + 1);
    var w = !isWallCh(m, tx - 1, ty), e = !isWallCh(m, tx + 1, ty);
    if (s && e) return [0, 0];
    if (s && w) return [4, 0];
    if (n && e) return [0, 4];
    if (n && w) return [4, 4];
    if (s) return [1, 0];
    if (n) return [1, 4];
    if (e) return [0, 1];
    if (w) return [4, 1];
    if (!isWallCh(m, tx + 1, ty + 1)) return [0, 0];
    if (!isWallCh(m, tx - 1, ty + 1)) return [4, 0];
    if (!isWallCh(m, tx + 1, ty - 1)) return [0, 4];
    if (!isWallCh(m, tx - 1, ty - 1)) return [4, 4];
    return null;
  }
  function playerTile() { return { x: Math.floor(S.px / T), y: Math.floor((S.py - 16) / T) }; }
  function frontTile() {
    var p = playerTile();
    if (S.dir === 0) p.y += 1; else if (S.dir === 1) p.y -= 1;
    else if (S.dir === 2) p.x -= 1; else p.x += 1;
    return p;
  }
  function tileCenter(tx, ty) { return { x: tx * T + T / 2, y: ty * T + T / 2 }; }

  // ── 대사/토스트/효과음 ──────────────────────────────────────────────────
  function say(seq, then) { S.dialog = { seq: seq, i: 0, then: then || null }; }
  function toast(str) { S.toast = { text: str, t: 2.4 }; }
  function sfx(name) { if (g.SFX) g.SFX.play(name); }

  // ── 진행 ────────────────────────────────────────────────────────────────
  function newGame() {
    S = blankState();
    S.mode = 'world';
    say(D.INTRO, function () { S.flags.intro = true; save(); });
  }

  function enterMap(name, sx, sy, dir) {
    var m = mapOf(name); if (!m) return false;
    S.map = name; S.floor = m.fl || 1;   // 층은 맵에서 파생한다 — 어긋날 여지를 없앤다
    S.visited[name] = true;
    S.px = sx * T + T / 2; S.py = sy * T + T - 6;
    if (dir && A.DIR[dir] !== undefined) S.dir = A.DIR[dir];
    S.cool = {};
    updateCam();
    save();
    return true;
  }

  function updateCam() {
    var m = mapOf(S.map);
    S.cam.x = Math.max(0, Math.min(m.w * T - W, S.px - W / 2));
    S.cam.y = Math.max(0, Math.min(m.h * T - H, S.py - H / 2));
  }

  function setExposure(v) {
    S.exposure = Math.max(0, Math.min(D.MAX_EXPOSURE, v));
  }
  function setBubble(v) {
    S.bubble = Math.max(0, Math.min(D.MAX_BUBBLE, v));
  }

  // 층마다 같은 자리·같은 문법의 게이지 하나. 회복 문구도 여기서 같이 고른다.
  function gaugeInfo() {
    // 5층 의존 — 맡길수록 올라간다. 회복은 단말 재방문(스스로 하기).
    if (S.floor === 5) {
      return { label: D.T.depLabel, help: D.T.depHelp, val: S.depend, max: D.MAX_DEPEND, tone: A.PAL.metal };
    }
    // 4층 정직 게이지만 올라갈수록 좋은 방향 — 색도 리본(금색)으로 갈라 준다.
    if (S.floor === 4) {
      return { label: D.T.honLabel, help: D.T.honHelp, val: S.honest, max: D.MAX_HONEST, tone: A.PAL.ribbon };
    }
    if (S.floor === 3) {
      return { label: D.T.polLabel, help: D.T.polHelp, val: S.pollute, max: D.MAX_POLLUTE, tone: A.PAL.red };
    }
    if (S.floor === 2) {
      return { label: D.T.bubLabel, help: D.T.bubHelp, val: S.bubble, max: D.MAX_BUBBLE, tone: A.PAL.blue };
    }
    return { label: D.T.expLabel, help: D.T.expHelp, val: S.exposure, max: D.MAX_EXPOSURE, tone: A.PAL.red };
  }

  function pickCard(id) {
    var st = S.cards[id], c = cardDef(id);
    st.held = true; st.map = null;
    // 3층 오염·4층 정직은 카드를 줍는다고 움직이지 않는다 — 방송/스티커로만 바뀐다.
    if (c.floor === 2) setBubble(S.bubble - 1);
    else if (c.floor === 1) setExposure(S.exposure - 1);
    sfx('pick');
    if (c.floor === 1 && !S.flags.firstCard) { S.flags.firstCard = true; toast(D.T.firstCard); }
    else if (c.floor === 3) toast(D.T.gotCard3);
    else if (c.floor === 4) toast(D.T.gotCard4);
    else if (c.floor === 5) toast(D.T.gotCard5);
    else toast(c.floor === 2 ? D.T.gotCard2 : D.T.gotCard);
    save();
  }

  function stealCard(term, key) {
    var held = heldIds(); if (!held.length) return false;
    var id = held[held.length - 1], st = S.cards[id];
    st.held = false; st.map = S.map; st.x = term.drop.x; st.y = term.drop.y;
    setExposure(S.exposure + 1);
    S.stats.stolen++;
    S.flash = 0.7;                 // 뺏김을 몸으로 느끼는 붉은 펄스
    sfx('steal');
    S.cool[key] = TERM_COOL;
    if (!S.flags.firstTake) { S.flags.firstTake = true; toast(D.T.taken + ' ' + D.T.takenHelp); }
    else toast(D.T.taken);
    save();
    return true;
  }

  // ── 입력 ────────────────────────────────────────────────────────────────
  // e.code(물리 키) 우선 — 한글 IME가 켜져 있으면 e.key 가 'Process'/'ㅈ' 로 와서
  // Z·X가 죽는다. 교실 PC 기본값이 한글 모드라 code 매핑이 없으면 게임이 안 된다.
  var CODEMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    KeyZ: 'ok', Enter: 'ok', NumpadEnter: 'ok', Space: 'ok',
    KeyX: 'no', Escape: 'no', Backspace: 'no',
    KeyM: 'mute',
    KeyT: 'teacher'          // 교사 화면 — 타이틀에서만 읽는다(수업 중 오조작 방지)
  };
  // e.code 미지원(아주 구형)일 때만 쓰는 보조 매핑
  var KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
    z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', Spacebar: 'ok',
    x: 'no', X: 'no', Escape: 'no', Backspace: 'no',
    t: 'teacher', T: 'teacher'
  };
  // 한글 낱자 폴백(ㅈ→결정, ㅌ→취소, ㅅ→교사 화면). 화면 문구가 아니라 키 코드라
  // 엔진 한글 0자 린트를 지키기 위해 코드포인트로 적는다.
  KEYMAP[String.fromCharCode(0x3148)] = 'ok';
  KEYMAP[String.fromCharCode(0x314C)] = 'no';
  KEYMAP[String.fromCharCode(0x3145)] = 'teacher';
  function mapKey(e) {
    return (e.code && CODEMAP[e.code]) || KEYMAP[e.key] || null;
  }
  function onKeyDown(e) {
    var k = mapKey(e); if (!k) return;
    if (g.SFX) g.SFX.unlock();   // 자동재생 정책: 첫 입력에서 오디오를 깨운다
    if (k === 'mute') {
      if (g.SFX && S) toast(g.SFX.toggle() ? D.T.soundOn : D.T.soundOff);
      if (e.preventDefault) e.preventDefault();
      return;
    }
    if (!keys[k]) edge[k] = true;
    keys[k] = true;
    if (e.preventDefault) e.preventDefault();
  }
  function onKeyUp(e) { var k = mapKey(e); if (k) keys[k] = false; }
  function tapped(k) { return !!edge[k]; }
  function clearEdges() { edge = {}; }
  function axis() {
    var x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    var y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (!x && Math.abs(touchVec.x) > 0.3) x = touchVec.x;
    if (!y && Math.abs(touchVec.y) > 0.3) y = touchVec.y;
    return { x: x, y: y };
  }

  // ── 월드 갱신 ───────────────────────────────────────────────────────────
  function blockedTile(m, nx, ny) {
    // 발밑만 판정한다(머리는 벽 위로 겹쳐도 된다) — 한 칸 문을 편하게 통과하려고.
    var l = nx - 12, r = nx + 12, t = ny - 18, b = ny - 2;
    for (var ty = Math.floor(t / T); ty <= Math.floor(b / T); ty++) {
      for (var tx = Math.floor(l / T); tx <= Math.floor(r / T); tx++) {
        if (solidAt(m, tx, ty)) return { x: tx, y: ty };
      }
    }
    return null;
  }

  function updateWorld(dt) {
    var m = mapOf(S.map);
    for (var k in S.cool) if (S.cool[k] > 0) S.cool[k] -= dt;

    var v = axis(), moved = false;
    if (v.x || v.y) {
      var len = Math.sqrt(v.x * v.x + v.y * v.y) || 1, sp = moveSpeed();
      var dx = (v.x / len) * sp * dt, dy = (v.y / len) * sp * dt;
      if (Math.abs(v.x) >= Math.abs(v.y)) S.dir = v.x > 0 ? A.DIR.right : A.DIR.left;
      else S.dir = v.y > 0 ? A.DIR.down : A.DIR.up;
      if (dx) {
        var hit = blockedTile(m, S.px + dx, S.py);
        if (!hit) { S.px += dx; moved = true; } else bump(m, hit);
      }
      if (dy) {
        var hit2 = blockedTile(m, S.px, S.py + dy);
        if (!hit2) { S.py += dy; moved = true; } else bump(m, hit2);
      }
    }
    S.moving = moved;
    if (moved) { S.walkT += dt; S.frame = Math.floor(S.walkT * 7) % A.WALK_FRAMES; }
    else { S.walkT = 0; S.frame = 0; }
    updateCam();

    // 추천 문 사전 경고 — 밟기 전에 한 번은 알려 준다(1층 단말 경고와 같은 문법).
    var pt = playerTile();
    if (m.warps) {
      for (var w = 0; w < m.warps.length; w++) {
        var wq = m.warps[w];
        if (!wq.warn || S.flags.recoWarn) continue;
        var wc = tileCenter(wq.x, wq.y);
        if (Math.abs(wc.x - S.px) < WARN_R && Math.abs(wc.y - (S.py - 12)) < WARN_R) {
          S.flags.recoWarn = true; toast(D.T.recoWarn); sfx('warn'); save();
        }
      }
      // 워프 (문 칸을 밟으면 넘어간다)
      for (var i = 0; i < m.warps.length; i++) {
        var wp = m.warps[i];
        if (wp.x === pt.x && wp.y === pt.y) { takeWarp(wp); return; }
      }
    }
    // 카드 줍기 (잠긴 서랍 속 자료는 열리기 전엔 없는 것과 같다)
    D.CARDS.forEach(function (c) {
      var st = S.cards[c.id];
      if (st.held || st.map !== S.map || cardHidden(c)) return;
      var p = tileCenter(st.x, st.y);
      if (Math.abs(p.x - S.px) < PICK_R && Math.abs(p.y - (S.py - 12)) < PICK_R) pickCard(c.id);
    });
    // 광고 단말 — 뺏기 전에 한 번은 경고한다(가르치기 전에 벌주지 않기).
    (m.terminals || []).forEach(function (tm, idx) {
      var key = S.map + ':' + idx;
      if (S.cool[key] > 0) return;
      var p = tileCenter(tm.x, tm.y);
      var ax = Math.abs(p.x - S.px), ay = Math.abs(p.y - (S.py - 12));
      if (!S.flags.termWarn && heldIds().length && ax < TERM_R + 70 && ay < TERM_R + 70) {
        S.flags.termWarn = true; toast(D.T.termWarn); sfx('warn'); save();
      }
      if (ax < TERM_R && ay < TERM_R) stealCard(tm, key);
    });
    // 옥상 — 나비스 대면 (아직 끝내지 않았다면)
    if (m.finale && !S.ending) {
      // 안테나 앞 두 칸 안에 들어서면 나비스가 먼저 말을 건다(타일 기준이라 확실하다)
      var pt0 = playerTile();
      if (Math.abs(pt0.x - m.finale.x) <= 2 && Math.abs(pt0.y - m.finale.y) <= 2) {
        say(D.FINALE.meet, finaleBegin);
        return;
      }
    }
    // 씌인 인물 조우
    if (npcHere(m) && !S.clearedOf[m.npc.battle]) {
      var np = tileCenter(m.npc.x, m.npc.y);
      if (Math.abs(np.x - S.px) < NPC_R && Math.abs(np.y - (S.py - 12)) < NPC_R) {
        var P0 = D.BATTLES[m.npc.battle];
        // 재도전은 짧게 — 이미 나눈 이야기를 처음부터 반복시키지 않는다.
        say(S.heardOf[m.npc.battle] ? P0.reApproach : P0.approach, battleBegin);
        return;
      }
    }
    // 조사 / 일시정지 — X는 월드에서 빈 입력이라 멈춤에 배정(교실 지도 상황 대응)
    if (tapped('ok')) look(m);
    else if (tapped('no')) { pause(); sfx('cancel'); }
  }

  // 문을 밟았을 때. 추천 문은 같은 복도 입구로 되돌리고 버블을 올린다(개념=메커닉).
  function takeWarp(wp) {
    if (wp.kind === 'reco') {
      S.loopN++; setBubble(S.bubble + 1);
      enterMap(wp.to, wp.sx, wp.sy, wp.dir);
      sfx('warn'); toast(D.T.loopBack);
      return;
    }
    if (wp.kind === 'strange') {
      setBubble(S.bubble - 1);
      // 낯선 문은 갈 때마다 새 방으로 — 처음은 to, 이미 다녀왔으면 alt.
      enterMap(S.visited[wp.to] && wp.alt ? wp.alt : wp.to, wp.sx, wp.sy, wp.dir);
      sfx('off'); toast(D.T.strangeGo);
      return;
    }
    enterMap(wp.to, wp.sx, wp.sy, wp.dir);
  }

  function bump(m, tile) {
    var ch = chAt(m, tile.x, tile.y);
    if (ch === 'S' && !fogAt(m, tile.x, tile.y)) stairsBump();
  }

  // 조건부로 나타나는 인물(3층 선배 = 소문 3개를 다 처리해야 등장)
  function npcHere(m) {
    if (!m.npc) return false;
    if (m.npc.needs === 'rumors') return rumorsDone();
    if (m.npc.needs === 'frames') return framesAllDone();
    return true;
  }

  // 1층은 'stairs', 그 위는 'stairs2'·'stairs3'… — 층이 늘어도 키가 따라온다.
  function stairsKey() {
    return S.floor > 1 ? 'stairs' + S.floor : 'stairs';
  }

  function stairsBump() {
    if (S.dialog) return;
    var m = mapOf(S.map);
    if (!S.stairsOpen[S.map]) { say([D.LOOK[stairsKey()]]); return; }
    // 위층이 있으면 올라간다. 없으면 오늘 수업은 여기까지.
    if (m.stairsTo) {
      var up = m.stairsTo, txt2 = (D.FLOOR_UP && D.FLOOR_UP[up.map]) || D.FLOOR2;
      sfx('clear');
      say(txt2.up, function () {
        enterMap(up.map, up.sx, up.sy, up.dir);
        say(txt2.enter, save);
      });
      return;
    }
    say(D.CLEAR.stairs, function () { S.mode = 'clear'; S.flags.done = true; save(); });
  }

  function noteAt(m, tx, ty) {
    var list = m.notes || [];
    for (var i = 0; i < list.length; i++) if (list[i].x === tx && list[i].y === ty) return list[i];
    return null;
  }
  function signAt(m, tx, ty) {
    var list = m.signs || [];
    for (var i = 0; i < list.length; i++) if (list[i].x === tx && list[i].y === ty) return list[i];
    return null;
  }

  function look(m) {
    var f = frontTile();
    if (npcHere(m) && m.npc.x === f.x && m.npc.y === f.y && S.clearedOf[m.npc.battle]) {
      say(D.BATTLES[m.npc.battle].hint); return;
    }
    // 안개를 바라보면 걷는 법(정정 방송)을 그 자리에서 알려 준다 (헌법 §3-3)
    if (fogAt(m, f.x, f.y)) { say([D.LOOK.fog]); return; }
    var note = noteAt(m, f.x, f.y);
    if (note) { readNote(note.id); return; }
    var sign = signAt(m, f.x, f.y);
    if (sign) { var r = rumorDef(sign.rumor); say(r ? r.sign : [D.LOOK.sign]); return; }
    // 4층: 액자(조사/스티커 붙이기) · 견본판 · 제작대 · 잠긴 서랍
    var fr = frameAt(m, f.x, f.y);
    if (fr) { touchFrame(fr); return; }
    var sm = sampleAt(m, f.x, f.y);
    if (sm) { var au = authorDef(sm.id); say(au ? au.sample : [D.LOOK.sample]); return; }
    // 5층: 나비스 단말(선택) · 잠긴 장치(상태 대사) · 서류(날짜 단서) · 화분(열쇠)
    var term = lockByTerm(m, f.x, f.y);
    if (term) { openNavis(term); return; }
    var dev = lockByCell(m, f.x, f.y);
    if (dev && lockOpen(dev.id)) { say([D.LOOK[dev.id + 'Open'] || D.LOOK.nothing]); return; }
    var pp = paperAt(m, f.x, f.y);
    if (pp) { var pd = paperDef(pp.id); say(pd ? pd.look : [D.LOOK.paper]); return; }
    var ch = chAt(m, f.x, f.y), L = legend(ch);
    if (ch === 'H') { takeKey(); return; }
    if (ch === 'K') { openConsole(); return; }
    if (ch === 'M') { openBench(); return; }
    if (ch === 'J') { say([drawerOpen() ? D.LOOK.drawerOpen : D.LOOK.drawer]); return; }
    if (ch === 'S') { stairsBump(); return; }
    if (L && L.look) {
      var k = L.look === 'stairs' ? stairsKey() : L.look;
      var seq = (S.looked[k] && D.LOOK2[k]) ? [D.LOOK2[k]] : [D.LOOK[k]];
      S.looked[k] = true;
      say(seq); return;
    }
    say([D.LOOK.nothing]);
  }

  // ── 3층 방송 콘솔 ───────────────────────────────────────────────────────
  // 새 UI를 만들지 않는다 — 배틀 메뉴/서브 목록과 같은 커서 문법을 그대로 쓴다.
  function readNote(id) {
    if (S.rumors[id] !== 'unread') { say([D.LOOK.noteRead]); return; }
    S.rumors[id] = 'read';
    sfx('pick'); save();
    var r = rumorDef(id);
    say(r ? r.note : [D.LOOK.note]);
  }

  // 콘솔에 올라오는 소문 = 읽었고 아직 처리 안 된 것 + 오염돼 정정이 필요한 것
  function consoleRumors() {
    var out = [];
    (D.RUMORS || []).forEach(function (r) {
      var st = S.rumors[r.id];
      if (st === 'read' || st === 'aired' || st === 'polluted') out.push(r.id);
    });
    return out;
  }
  function conActions(id) {
    return S.rumors[id] === 'read' ? ['air', 'check'] : ['fix'];
  }
  function conList() {
    if (!S.con) return [];
    if (S.con.kind === 'navis') return navisList();
    if (S.con.kind === 'sticker') {
      if (S.con.level === 0) return seenFrames().concat(['close']);
      return authorIds().concat(['back']);
    }
    if (S.con.level === 0) return consoleRumors().concat(['close']);
    return conActions(S.con.rumor).concat(['back']);
  }
  function conLabel(key) {
    if (key === 'close') return D.CONSOLE.close;
    if (key === 'back') return D.CONSOLE.back;
    if (S.con && S.con.kind === 'navis') {
      if (key === 'trust') return D.NAVIS.trust;
      if (key === 'self') return D.NAVIS.self;
      if (key === 'redo') return D.NAVIS.redo;
      var pd = paperDef(key); if (pd) return pd.label;
      var qc = quizDef(lockDef(S.con.lock), key); return qc ? qc.label : '';
    }
    if (S.con && S.con.kind === 'sticker') {
      var fr = frameDef(key); if (fr) return fr.label;
      var au = authorDef(key); return au ? au.sticker : '';
    }
    if (key === 'air') return D.CONSOLE.air;
    if (key === 'check') return D.CONSOLE.check;
    if (key === 'fix') return D.CONSOLE.fix;
    var r = rumorDef(key);
    return r ? r.label : '';
  }

  function openConsole() {
    // 처리할 소문이 없을 때: 아직 안 읽었나(none) / 다 끝났나(clear)를 갈라 준다.
    if (!consoleRumors().length) { say(rumorsDone() ? D.CONSOLE.clear : D.CONSOLE.none); return; }
    S.mode = 'console';
    S.con = { kind: 'radio', level: 0, cursor: 0, rumor: null, frame: null };
    sfx('ok');
  }
  function closeConsole() {
    S.mode = 'world'; S.con = null;
  }
  function conSay(seq, then) {
    say(seq, then || function () { conBack(); });
  }
  function conBack() {
    if (!S.con) return;
    S.con.level = 0; S.con.cursor = 0; S.con.rumor = null; S.con.frame = null;
    if (S.con.kind === 'navis') { if (!navisList().length) closeConsole(); return; }
    if (S.con.kind === 'sticker') { if (!seenFrames().length) closeConsole(); return; }
    if (!consoleRumors().length) closeConsole();
  }
  function hasCard(id) { return heldIds().indexOf(id) >= 0; }

  function updateConsole() {
    var c = S.con, list = conList(), n = list.length;
    if (!n) { closeConsole(); return; }
    if (c.cursor >= n) c.cursor = n - 1;
    if (tapped('up') || tapped('left')) { c.cursor = (c.cursor + n - 1) % n; sfx('cursor'); }
    if (tapped('down') || tapped('right')) { c.cursor = (c.cursor + 1) % n; sfx('cursor'); }
    if (tapped('no')) { sfx('cancel'); if (c.level) { conBack(); } else { closeConsole(); } return; }
    if (!tapped('ok')) return;
    sfx('ok');
    var pick = list[c.cursor];
    if (pick === 'close') { closeConsole(); return; }
    if (pick === 'back') { conBack(); return; }
    if (c.kind === 'navis') {
      if (c.level === 0) doNavis(pick); else doNavisTask(pick);
      return;
    }
    if (c.level === 0) {
      if (c.kind === 'sticker') c.frame = pick; else c.rumor = pick;
      c.level = 1; c.cursor = 0; return;
    }
    if (c.kind === 'sticker') { doSticker(pick); return; }
    doConsole(pick);
  }

  function doConsole(act) {
    var id = S.con.rumor, r = rumorDef(id);
    if (act === 'air') {
      // 처음 한 번은 벌 대신 경고 — 1층 단말·2층 추천 문과 같은 문법.
      if (!S.flags.airWarn) {
        S.flags.airWarn = true; sfx('warn'); save();
        say(D.CONSOLE.warn, function () { if (S.con) S.con.cursor = 0; });
        return;
      }
      S.rumors[id] = 'aired'; save();
      sfx('steal'); S.flash = 0.7;
      conSay(D.CONSOLE.aired, function () { spreadFog(id); conAfter(); });
      return;
    }
    if (act === 'check') {
      if (!hasCard(r.card)) { say(D.CONSOLE.needCard); return; }
      S.rumors[id] = 'verified'; save();
      sfx('clear');
      conSay(D.CONSOLE.verified, conAfter);
      return;
    }
    if (act === 'fix') {
      if (!hasCard(r.card)) { say(D.CONSOLE.needCard); return; }
      S.rumors[id] = 'fixed'; rebuildFog(); save();
      sfx('off');
      conSay(D.CONSOLE.fixed, conAfter);
    }
  }

  // 확인 없이 내보낸 소문은 복도에 안개로 남는다 (aired → polluted)
  function spreadFog(id) {
    S.rumors[id] = 'polluted';
    rebuildFog();
    save();
  }

  function conAfter() {
    conBack();
    save();
    if (!rumorsDone() || S.flags.seniorUp) return;
    S.flags.seniorUp = true;
    closeConsole();
    say(D.CONSOLE.done, save);
  }

  // ── 4층 스티커 제작대 ───────────────────────────────────────────────────
  // 방송 콘솔과 같은 커서·상자를 쓴다(새 UI 없음). kind 로만 갈린다.
  function seenFrames() {
    var out = [];
    (D.FRAMES || []).forEach(function (f) { if (S.frames[f.id] === 'seen') out.push(f.id); });
    return out;
  }
  function authorIds() {
    return (D.AUTHORS || []).map(function (a) { return a.id; });
  }
  function openBench() {
    // 액자를 아직 안 봤나(none) / 세 점을 다 밝혔나(clear)를 갈라 준다.
    if (!seenFrames().length) { say(framesAllDone() ? D.STICKER.clear : D.STICKER.none); return; }
    S.mode = 'console';
    S.con = { kind: 'sticker', level: 0, cursor: 0, rumor: null, frame: null };
    sfx('ok');
  }
  function doSticker(aid) {
    if (!authorDef(aid)) return;
    S.stickers[S.con.frame] = aid;
    save(); sfx('ok');
    conSay(D.STICKER.made);
  }

  // 액자 앞에서 Z — 스티커가 있으면 붙이고, 없으면 이상한 점을 본다.
  function touchFrame(fr) {
    if (S.frames[fr.id] === 'done') { say([D.LOOK.frameDone]); return; }
    var pick = S.stickers[fr.id];
    if (!pick) {
      if (S.frames[fr.id] !== 'seen') { S.frames[fr.id] = 'seen'; sfx('pick'); save(); }
      say(fr.look);
      return;
    }
    if (pick !== fr.author) {
      // 틀려도 벌은 없다 — 스티커만 도로 떼고 기록만 남긴다 (헌법 §3-3)
      S.stickers[fr.id] = null;
      S.stats.missSticker++;
      sfx('warn'); save();
      say(D.STICKER.wrong);
      return;
    }
    S.frames[fr.id] = 'done'; S.stickers[fr.id] = null;
    rebuildOpened();
    sfx('clear'); save();
    say(D.STICKER.right, function () {
      if (!framesAllDone() || S.flags.artUp) { save(); return; }
      S.flags.artUp = true;
      say(D.STICKER.done, save);
    });
  }

  // ── 5층 나비스 단말 ─────────────────────────────────────────────────────
  // 방송 콘솔·제작대와 같은 커서·상자를 쓴다(새 UI 없음). kind 로만 갈린다.
  // level 0 = 무엇을 할지, level 1 = 스스로 하기 과제.
  function quizDef(k, id) {
    var list = (k && k.quiz) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function navisList() {
    if (!S.con || !S.con.lock) return [];
    var k = lockDef(S.con.lock);
    if (!k) return [];
    if (S.con.level === 1) {
      if (k.task === 'order') return (D.MAPS[k.map].papers || []).map(function (p) { return p.id; }).concat(['back']);
      if (k.task === 'quiz') return (k.quiz || []).map(function (q) { return q.id; }).concat(['back']);
      return ['back'];
    }
    if (!lockOpen(k.id)) return ['trust', 'self', 'close'];
    if (S.trusted[k.id]) return ['redo', 'close'];   // 맡긴 장치만 회복할 게 남는다
    return [];
  }
  function openNavis(k) {
    if (lockOpen(k.id) && !S.trusted[k.id]) { say(D.NAVIS.opened); return; }
    S.mode = 'console';
    S.con = { kind: 'navis', level: 0, cursor: 0, rumor: null, frame: null, lock: k.id, step: 0 };
    sfx('ok');
  }
  // 장치를 연다. 카드는 잠긴 칸 뒤에 놓여 있어 열린 뒤에 주울 수 있다.
  function openLock(k) {
    S.locks[k.id] = true;
    rebuildOpened();
    save();
  }
  function doNavis(act) {
    var k = lockDef(S.con.lock);
    if (!k) { closeConsole(); return; }
    if (act === 'trust') {
      // 처음 한 번은 벌 대신 경고 — 1층 단말·2층 추천 문·3층 콘솔과 같은 문법.
      if (!S.flags.trustWarn) {
        S.flags.trustWarn = true; sfx('warn'); save();
        say(D.NAVIS.warn, function () { if (S.con) S.con.cursor = 0; });
        return;
      }
      openLock(k);
      S.trusted[k.id] = true;
      setDepend(S.depend + 1);
      sfx('steal'); S.flash = 0.5; save();
      conSay(D.NAVIS.trusted);
      return;
    }
    if (act === 'self' || act === 'redo') { startTask(k); return; }
  }
  // 과제 시작. 열쇠 과제만 목록이 없다 — 열쇠를 들고 있으면 그 자리에서 열린다.
  function startTask(k) {
    if (k.task === 'key') {
      if (!S.hasKey) { say(D.NAVIS.needKey); return; }
      finishTask(k);
      return;
    }
    S.con.step = 0; S.con.cursor = 0;
    var ask = k.task === 'order' ? D.NAVIS.orderAsk : D.NAVIS.quizAsk;
    say(ask, function () { if (S.con) { S.con.level = 1; S.con.cursor = 0; } });
  }
  function doNavisTask(pick) {
    var k = lockDef(S.con.lock);
    if (!k) { closeConsole(); return; }
    if (k.task === 'order') {
      if (pick === k.order[S.con.step]) {
        S.con.step++;
        if (S.con.step >= k.order.length) { finishTask(k); return; }
        sfx('ok');
        say(D.NAVIS.orderOk, function () { if (S.con) S.con.cursor = 0; });
        return;
      }
      // 틀려도 벌은 없다 — 처음부터 다시 고르면 된다(헌법 §3-3).
      S.con.step = 0; sfx('warn');
      say(D.NAVIS.orderNo, function () { if (S.con) S.con.cursor = 0; });
      return;
    }
    if (k.task === 'quiz') {
      if (pick === k.answer) { finishTask(k); return; }
      sfx('warn');
      say(D.NAVIS.quizNo, function () { if (S.con) S.con.cursor = 0; });
    }
  }
  // 스스로 풀었다. 맡겼던 장치였다면 의존이 한 칸 내려간다(회복 경로).
  function finishTask(k) {
    var back = !!S.trusted[k.id];
    openLock(k);
    if (back) { S.trusted[k.id] = false; setDepend(S.depend - 1); }
    sfx('clear'); save();
    conSay(back ? D.NAVIS.recovered : D.NAVIS.selfDone);
  }
  function takeKey() {
    if (S.hasKey) { say(D.NAVIS.keyGone); return; }
    S.hasKey = true; sfx('pick'); save();
    say(D.NAVIS.gotKey);
  }

  // ── 배틀 ────────────────────────────────────────────────────────────────
  var BOX = { x: 176, y: 244, w: 368, h: 136 };

  // 배틀은 맵의 npc.battle 이 가리키는 프로필로만 돈다 — 인물이 늘어도 코드는 그대로.
  function prof() { return D.BATTLES[S.battle.id]; }

  function battleBegin() {
    var m = mapOf(S.map), id = m.npc.battle, P = D.BATTLES[id];
    var heard = !!S.heardOf[id];
    S.mode = 'battle'; S.toast = null;   // 월드 토스트가 배틀 화면에 남지 않게
    S.battle = {
      id: id, opens: m.npc.opens,
      // 배틀이 시작된 곳을 기억한다 — 복귀 좌표를 맵 이름 하드코딩 없이 계산
      from: S.map, npcX: m.npc.x, npcY: m.npc.y,
      phase: 'text',
      // 절반 기억: 물러났다 와도 들은 이야기는 유지된다 (재도전 존중)
      shadow: P.shadow - (heard ? 1 : 0),
      hearts: P.hearts,
      cursor: 0, sub: 0, heard: heard, turn: 0, talks: 0, spare: false,
      hx: BOX.x + BOX.w / 2, hy: BOX.y + BOX.h / 2,
      bullets: [], timer: 0, spawnAcc: 0, atk: 0, inv: 0, tell: 0
    };
    say(heard ? P.reIntro : P.intro, function () { S.battle.phase = 'menu'; });
  }

  function battleSay(seq, then) {
    S.battle.phase = 'text';
    say(seq, then);
  }

  function enemyTurn() {
    var b = S.battle;
    if (b.shadow <= 0) { readySpare(); return; }
    b.phase = 'enemy'; b.bullets = []; b.timer = 0; b.spawnAcc = 0; b.inv = 0;
    b.atk = Math.min(b.turn, prof().attacks.length - 1);
    b.tell = 1.1;
    b.turn++;
    b.hx = BOX.x + BOX.w / 2; b.hy = BOX.y + BOX.h / 2;
  }

  function readySpare() {
    var b = S.battle; b.spare = true; b.cursor = 0;
    sfx('off');
    battleSay(D.BATTLE_UI.ready, function () { b.phase = 'menu'; });
  }

  function battleMenuPick() {
    var b = S.battle, P = prof();
    if (b.spare) { doSpare(); return; }
    if (b.cursor === 0) {
      b.talks++;
      var seq = b.talks === 1 ? P.talk : (b.talks === 2 ? P.talk2 : P.talk3);
      battleSay(seq, enemyTurn);
      return;
    }
    if (b.cursor === 1) {
      if (!heldIds().length) { battleSay(D.BATTLE_UI.showNone, function () { b.phase = 'menu'; }); return; }
      b.phase = 'sub'; b.sub = 0; return;
    }
    if (b.cursor === 2) {
      if (!b.heard) {
        b.heard = true; b.shadow = Math.max(0, b.shadow - 1);
        S.heardOf[b.id] = true; save();
        sfx('listen');
        battleSay(P.listen.concat(P.listenHint), enemyTurn);
      } else battleSay(P.listenAgain, enemyTurn);
      return;
    }
    battleSay(D.BATTLE_UI.flee, leaveBattle);
  }

  function battleSubPick() {
    var b = S.battle, P = prof(), ids = heldIds(), id = ids[b.sub];
    if (id === P.evidence && b.heard) {
      b.shadow = 0;
      battleSay(P.showRight, readySpare);
    } else {
      battleSay(P.showWrong, enemyTurn);
    }
  }

  function doSpare() {
    var b = S.battle, P = prof();
    S.clearedOf[b.id] = true;
    if (b.opens) S.stairsOpen[b.opens] = true;
    sfx('clear');
    battleSay(P.spare.concat(P.promise), function () {
      S.battle = null; S.mode = 'world'; S.map = b.from;
      S.px = (b.npcX - 2) * T + T / 2; S.py = b.npcY * T + T - 6;
      updateCam(); save();
    });
  }

  function leaveBattle(msg) {
    var b = S.battle;
    S.stats.retreats++;
    S.battle = null; S.mode = 'world'; S.map = b.from;
    S.px = (b.npcX - 3) * T + T / 2; S.py = b.npcY * T + T - 6;
    S.dir = A.DIR.left; updateCam(); save();
    if (msg) say(msg);
  }

  // 물감 방울이 바닥에 눌어붙는 높이 (상자 안쪽)
  var PAINT_Y = BOX.y + BOX.h - 16;

  function paintCount(b) {
    var n = 0;
    for (var i = 0; i < b.bullets.length; i++) if (b.bullets[i].drop) n++;
    return n;
  }

  function stampCount(b) {
    var n = 0;
    for (var i = 0; i < b.bullets.length; i++) if (b.bullets[i].stamp) n++;
    return n;
  }

  function spawnBullet(a) {
    var b = S.battle, r = Math.random();
    if (a.kind === 'stamp') {
      // 예고형: 찍힐 칸을 warn 초 동안 보여 준 뒤 내리찍는다(읽고 피하는 형).
      // 동시에 뜨는 칸은 cells 개까지 — 저학년 기준으로 읽을 시간을 남긴다.
      if (stampCount(b) >= (a.cells || 2)) return;
      var hs = (a.s || 44) / 2;
      b.bullets.push({
        x: BOX.x + hs + 4 + Math.random() * (BOX.w - hs * 2 - 8),
        y: BOX.y + hs + 4 + Math.random() * (BOX.h - hs * 2 - 8),
        vx: 0, vy: 0, s: a.s || 44,
        stamp: true, warn: a.warn || 1.0, hold: a.hit || 0.35
      });
      return;
    }
    if (a.kind === 'paint') {
      // 떨어지는 방울 + 남은 자국을 합쳐 maxStain 개까지만 — 화면이 자국으로
      // 덮여 피할 데가 없어지는 일을 막는다(저학년 기준).
      if (paintCount(b) >= (a.maxStain || 3)) return;
      b.bullets.push({
        x: BOX.x + 18 + Math.random() * (BOX.w - 36), y: BOX.y - 10,
        vx: 0, vy: a.speed, s: 15, drop: true, stay: a.stay || 1.5
      });
      return;
    }
    if (a.kind === 'burst') {
      // 속보처럼 한 지점에서 방사형 6발. 사이가 넓어 서서 기다리면 지나간다.
      var bx = BOX.x + 60 + Math.random() * (BOX.w - 120);
      var by = BOX.y + 30 + Math.random() * (BOX.h - 60);
      for (var i = 0; i < 6; i++) {
        var ang = (Math.PI * 2 * i) / 6 + r;
        b.bullets.push({
          x: bx, y: by, vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed, s: 13
        });
      }
      return;
    }
    if (a.kind === 'chase') {
      // 하트를 향해 느리게 꺾이는 조각. 오래 떠 있지 않게 수명을 준다.
      var fx = BOX.x + 12 + Math.random() * (BOX.w - 24), fy = BOX.y - 10;
      var dx = b.hx - fx, dy = b.hy - fy, L = Math.sqrt(dx * dx + dy * dy) || 1;
      b.bullets.push({
        x: fx, y: fy, vx: dx / L * a.speed, vy: dy / L * a.speed,
        s: 13, sp: a.speed, life: a.life || 3
      });
      return;
    }
    if (a.kind === 'rain' || (a.kind === 'mix' && r < 0.5)) {
      b.bullets.push({ x: BOX.x + 12 + Math.random() * (BOX.w - 24), y: BOX.y - 10, vx: 0, vy: a.speed, s: 13 });
    } else {
      var fromLeft = Math.random() < 0.5;
      b.bullets.push({
        x: fromLeft ? BOX.x - 10 : BOX.x + BOX.w + 10,
        y: BOX.y + 14 + Math.random() * (BOX.h - 28),
        vx: fromLeft ? a.speed : -a.speed, vy: 0, s: 13
      });
    }
  }

  function updateBattle(dt) {
    var b = S.battle;
    if (b.phase === 'menu') {
      // 메뉴는 2x2 그리드로 그려진다 — 입력도 그리드와 일치시킨다.
      // 0 1  좌우 = 열 토글(XOR 1), 상하 = 행 토글(XOR 2).
      // 2 3
      if (!b.spare) {
        if (tapped('left') || tapped('right')) { b.cursor ^= 1; sfx('cursor'); }
        if (tapped('up') || tapped('down')) { b.cursor ^= 2; sfx('cursor'); }
      }
      if (tapped('ok')) { sfx('ok'); battleMenuPick(); }
      else if (tapped('no')) { pause(); sfx('cancel'); }
      return;
    }
    if (b.phase === 'sub') {
      var ids = heldIds();
      if (tapped('down') || tapped('right')) b.sub = (b.sub + 1) % ids.length;
      if (tapped('up') || tapped('left')) b.sub = (b.sub + ids.length - 1) % ids.length;
      if (tapped('no')) { b.phase = 'menu'; sfx('cancel'); return; }
      if (tapped('ok')) { sfx('ok'); battleSubPick(); }
      return;
    }
    if (b.phase !== 'enemy') return;
    if (tapped('no')) { pause(); return; }   // 탄막 중에도 멈출 수 있다(숨 고르기 허용)

    var a = prof().attacks[b.atk];
    b.timer += dt; b.tell = Math.max(0, b.tell - dt); b.inv = Math.max(0, b.inv - dt);
    if (b.timer >= a.time) { b.bullets = []; b.phase = 'menu'; b.cursor = 0; return; }

    var v = axis();
    if (v.x || v.y) {
      var len = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
      b.hx += (v.x / len) * 168 * dt; b.hy += (v.y / len) * 168 * dt;
    }
    b.hx = Math.max(BOX.x + 12, Math.min(BOX.x + BOX.w - 12, b.hx));
    b.hy = Math.max(BOX.y + 12, Math.min(BOX.y + BOX.h - 12, b.hy));

    if (b.tell <= 0) {
      b.spawnAcc += dt;
      while (b.spawnAcc >= a.every) { b.spawnAcc -= a.every; spawnBullet(a); }
    }
    for (var i = b.bullets.length - 1; i >= 0; i--) {
      var p = b.bullets[i];
      if (p.stamp) {
        // 예고 중엔 자리만 알려 주고 맞지 않는다. 예고가 끝나야 판정이 산다.
        if (p.warn > 0) { p.warn -= dt; continue; }
        p.hold -= dt;
        if (p.hold <= 0) { b.bullets.splice(i, 1); continue; }
        var sh = p.s / 2;
        if (b.inv <= 0 && Math.abs(p.x - b.hx) < sh && Math.abs(p.y - b.hy) < sh) {
          b.hearts--; b.inv = 1.0; sfx('hit');
          if (b.hearts <= 0) { leaveBattle(D.BATTLE_UI.hurt); return; }
        }
        continue;
      }
      if (p.drop) {
        // 물감: 바닥에 닿으면 그 자리에 자국으로 잠깐 남는다(지나가면 피격).
        if (p.stain) {
          p.hold -= dt;
          if (p.hold <= 0) { b.bullets.splice(i, 1); continue; }
        } else if (p.y >= PAINT_Y) {
          p.y = PAINT_Y; p.vx = 0; p.vy = 0; p.stain = true; p.hold = p.stay;
        }
      }
      if (p.sp) {
        // 조준을 조금씩만 고쳐 잡는다 — 피할 시간이 남게(3~4학년 기준).
        var cx = b.hx - p.x, cy = b.hy - p.y, cl = Math.sqrt(cx * cx + cy * cy) || 1;
        var k = Math.min(1, 1.4 * dt);
        p.vx += (cx / cl * p.sp - p.vx) * k;
        p.vy += (cy / cl * p.sp - p.vy) * k;
        p.life -= dt;
        if (p.life <= 0) { b.bullets.splice(i, 1); continue; }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      // 위쪽 경계도 본다 — 방사형(burst) 조각은 위로도 날아간다.
      if (p.y > BOX.y + BOX.h + 30 || p.y < BOX.y - 30
        || p.x < BOX.x - 30 || p.x > BOX.x + BOX.w + 30) { b.bullets.splice(i, 1); continue; }
      // 자국은 납작하다 — 보이는 만큼만 맞게 세로 판정을 그림에 맞춘다.
      var hw = (p.s + 9) / 2, hh = p.stain ? 7 : hw;
      if (b.inv <= 0 && Math.abs(p.x - b.hx) < hw && Math.abs(p.y - b.hy) < hh) {
        b.hearts--; b.inv = 1.0; sfx('hit');
        if (b.hearts <= 0) { leaveBattle(D.BATTLE_UI.hurt); return; }
      }
    }
  }

  // ── 옥상: 나비스의 다섯 질문 ────────────────────────────────────────────
  // 배틀이 아니다 — 하트도 물러나기도 없다. 묻고, 약속으로 답한다.
  // 상태: phase = 'text'(대사 중) | 'pick'(약속 고르기) | 'shake'(잠깐 쏟아짐)
  //              | 'choose'(엔딩 선택) | 'confirm'(확인)
  function finaleBegin() {
    S.mode = 'finale'; S.toast = null;
    S.fin = {
      q: 0, phase: 'text', cursor: 0, confirmCursor: 1, shaken: false, wrongs: 0,
      bullets: [], timer: 0, spawnAcc: 0,
      hx: BOX.x + BOX.w / 2, hy: BOX.y + BOX.h / 2, hit: 0
    };
    say(D.FINALE.intro, askQuestion);
  }

  function finaleSay(seq, then) {
    S.fin.phase = 'text';
    say(seq, then);
  }

  function askQuestion() {
    var f = S.fin, qs = D.FINALE.questions;
    if (f.q >= qs.length) { finaleSay(D.FINALE.confess, function () { f.phase = 'choose'; f.cursor = 0; }); return; }
    finaleSay(qs[f.q].ask, function () {
      if (!promiseIds().length) { finaleSay(D.FINALE.none, function () { leaveFinale(); }); return; }
      f.phase = 'pick'; f.cursor = 0;
    });
  }

  function pickPromise() {
    var f = S.fin, ids = promiseIds(), id = ids[f.cursor];
    var qs = D.FINALE.questions, cur = qs[f.q];
    if (id !== cur.answer) {
      f.wrongs++;
      S.stats.missPromise = (S.stats.missPromise || 0) + 1;
      sfx('cancel');
      finaleSay(D.FINALE.wrong, function () { f.phase = 'pick'; });
      return;
    }
    sfx('off');
    f.q++;
    save();
    // 셋째 질문을 넘긴 순간 딱 한 번, 나비스가 흔들린다(감정 표현)
    if (f.q === 3 && !f.shaken) {
      finaleSay(cur.ok.concat(D.FINALE.shake), startShake);
      return;
    }
    finaleSay(cur.ok, askQuestion);
  }

  function startShake() {
    var f = S.fin;
    f.shaken = true; f.phase = 'shake';
    f.bullets = []; f.timer = 0; f.spawnAcc = 0; f.hit = 0;
    f.hx = BOX.x + BOX.w / 2; f.hy = BOX.y + BOX.h / 2;
  }

  function updateShake(dt) {
    var f = S.fin, a = D.FINALE.shakeAtk;
    f.timer += dt;
    if (f.hit > 0) f.hit -= dt;
    if (f.timer >= a.time) { f.bullets = []; finaleSay(D.FINALE.shakeEnd, askQuestion); return; }
    var v = axis();
    if (v.x || v.y) {
      var len = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
      f.hx += (v.x / len) * 168 * dt; f.hy += (v.y / len) * 168 * dt;
    }
    f.hx = Math.max(BOX.x + 12, Math.min(BOX.x + BOX.w - 12, f.hx));
    f.hy = Math.max(BOX.y + 12, Math.min(BOX.y + BOX.h - 12, f.hy));
    f.spawnAcc += dt;
    while (f.spawnAcc >= a.every) {
      f.spawnAcc -= a.every;
      f.bullets.push({
        x: BOX.x + 12 + Math.random() * (BOX.w - 24), y: BOX.y - 10,
        vx: 0, vy: a.speed, s: 13
      });
    }
    for (var i = f.bullets.length - 1; i >= 0; i--) {
      var b = f.bullets[i];
      b.y += b.vy * dt;
      if (b.y > BOX.y + BOX.h + 30) { f.bullets.splice(i, 1); continue; }
      // 스치기만 한다 — 하트가 줄지 않는다(게임오버 없음, 헌법 §3-3)
      if (f.hit <= 0 && Math.abs(b.x - f.hx) < 11 && Math.abs(b.y - f.hy) < 11) {
        f.hit = 0.6; sfx('hit');
      }
    }
  }

  function chooseEnding(idx) {
    var f = S.fin;
    S.ending = idx === 0 ? 'A' : 'B';
    S.stats.ending = S.ending;
    sfx('clear');
    finaleSay((idx === 0 ? D.FINALE.endA : D.FINALE.endB).concat(D.FINALE.gate), function () {
      S.mode = 'clear'; S.flags.done = true; S.fin = null;
      clearUi.cursor = 0;
      save();
    });
  }

  // 약속이 하나도 없어 문답을 못 여는 경우에만 쓰인다(되돌린 사람 0명).
  function leaveFinale() {
    S.mode = 'world'; S.fin = null;
    var m = mapOf(S.map);
    if (m.finale) { S.px = m.finale.x * T + T / 2; S.py = (m.finale.y + 2) * T + T - 6; }
    S.dir = A.DIR.down; updateCam(); save();
  }

  function updateFinale(dt) {
    var f = S.fin;
    if (!f) { S.mode = 'world'; return; }
    if (f.phase === 'shake') { updateShake(dt); return; }
    if (f.phase === 'pick') {
      var ids = promiseIds(), n = ids.length;
      if (!n) { leaveFinale(); return; }
      if (f.cursor >= n) f.cursor = n - 1;
      if (tapped('left') || tapped('up')) { f.cursor = (f.cursor + n - 1) % n; sfx('cursor'); }
      if (tapped('right') || tapped('down')) { f.cursor = (f.cursor + 1) % n; sfx('cursor'); }
      if (tapped('ok')) { sfx('ok'); pickPromise(); }
      return;
    }
    if (f.phase === 'choose') {
      if (tapped('up') || tapped('down') || tapped('left') || tapped('right')) {
        f.cursor = 1 - f.cursor; sfx('cursor');
      }
      if (tapped('ok')) { sfx('ok'); f.phase = 'confirm'; f.confirmCursor = 1; }
      return;
    }
    if (f.phase === 'confirm') {
      if (tapped('left') || tapped('right') || tapped('up') || tapped('down')) {
        f.confirmCursor = 1 - f.confirmCursor; sfx('cursor');
      }
      if (tapped('no')) { f.phase = 'choose'; sfx('cancel'); return; }
      if (tapped('ok')) {
        sfx('ok');
        if (f.confirmCursor === 0) chooseEnding(f.cursor);
        else f.phase = 'choose';
      }
    }
  }

  function drawFinale() {
    var f = S.fin;
    ctx.fillStyle = '#0c1020'; ctx.fillRect(0, 0, W, H);
    // 밤하늘 — 별 몇 점
    for (var i = 0; i < 22; i++) {
      var sx = (i * 137) % W, sy = (i * 61) % 200;
      ctx.fillStyle = 'rgba(247,224,189,' + (0.2 + ((i * 7) % 5) * 0.1).toFixed(2) + ')';
      ctx.fillRect(sx, sy, 2, 2);
    }
    // 나비스 = 안테나 탑 + 눈 하나 (그림자가 아니라 본체 — 씌임 틴트를 쓰지 않는다)
    var gr = ctx.createRadialGradient && ctx.createRadialGradient(W / 2, 130, 10, W / 2, 130, 150);
    if (gr && gr.addColorStop) {
      var glow = f && f.phase === 'shake' ? 0.42 : 0.26;
      gr.addColorStop(0, 'rgba(120,188,216,' + glow + ')');
      gr.addColorStop(1, 'rgba(120,188,216,0)');
      ctx.fillStyle = gr; ctx.fillRect(W / 2 - 150, 0, 300, 280);
    }
    ctx.fillStyle = A.PAL.metalDark; ctx.fillRect(W / 2 - 26, 46, 52, 150);
    ctx.fillStyle = A.PAL.metal; ctx.fillRect(W / 2 - 14, 46, 28, 150);
    ctx.fillStyle = A.PAL.ink; ctx.fillRect(W / 2 - 30, 92, 60, 8);
    ctx.fillStyle = A.PAL.ink; ctx.fillRect(W / 2 - 30, 150, 60, 8);
    // 눈 하나 — 흔들릴 땐 깜빡인다
    var open2 = !(f && f.phase === 'shake' && Math.floor(S.time * 8) % 2);
    ctx.fillStyle = open2 ? A.PAL.blue : A.PAL.metalDark;
    ctx.fillRect(W / 2 - 16, 112, 32, 20);
    ctx.fillStyle = A.PAL.ink; ctx.fillRect(W / 2 - 6, 118, 12, 8);
    txt(D.FINALE.name, W / 2, 224, 20, A.PAL.white, 'center');
    // 남은 질문 — 배틀 게이지와 같은 자리·문법(숫자 병기)
    var qs = D.FINALE.questions, left = qs.length - ((f && f.q) || 0);
    var gw = 150, gx = W / 2 - gw / 2;
    ctx.fillStyle = 'rgba(120,110,130,0.5)'; ctx.fillRect(gx, 232, gw, 10);
    ctx.fillStyle = A.PAL.blue;
    ctx.fillRect(gx, 232, gw * left / qs.length, 10);
    txt(left + '/' + qs.length, gx + gw + 10, 241, 14, A.PAL.white, 'left', 500);

    if (!f) return;
    if (f.phase === 'shake') {
      ctx.strokeStyle = A.PAL.white; ctx.lineWidth = 4;
      ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);
      ctx.fillStyle = 'rgba(8,6,12,0.6)'; ctx.fillRect(BOX.x + 2, BOX.y + 2, BOX.w - 4, BOX.h - 4);
      f.bullets.forEach(function (b) {
        ctx.fillStyle = A.PAL.blue; ctx.fillRect(b.x - b.s / 2, b.y - b.s / 2, b.s, b.s);
      });
      ctx.globalAlpha = f.hit > 0 ? 0.45 : 1;
      if (!A.drawSprite(ctx, 'heart', 64, 0, 16, 16, f.hx - 11, f.hy - 11, 22, 22)) {
        ctx.fillStyle = A.PAL.red; ctx.fillRect(f.hx - 8, f.hy - 8, 16, 16);
      }
      ctx.globalAlpha = 1;
      txt(D.FINALE.shakeNote, W / 2, H - 16, 15, A.PAL.blue, 'center', 500);
      return;
    }
    if (f.phase === 'pick') {
      // 고르는 동안에도 질문이 화면에 남아 있어야 한다 — 무엇에 답하는지 잊지 않게.
      var cur = D.FINALE.questions[f.q];
      if (cur && cur.ask[0]) {
        cur.ask[0].forEach(function (ln, i) {
          txt(ln, W / 2, 288 + i * 28, 19, A.PAL.white, 'center');
        });
      }
      panel(24, 344, W - 48, 144);
      txt(D.FINALE.title, 48, 370, 17, A.PAL.ribbon);
      promiseIds().forEach(function (id, i) {
        var x = 60 + (i % 2) * 320, y = 404 + Math.floor(i / 2) * 34;
        var on = f.cursor === i, pd = promiseDef(id);
        txt((on ? '▶ ' : '   ') + pd.label, x, y, 18, on ? A.PAL.ribbon : A.PAL.white);
      });
      txt(D.FINALE.hint, W - 44, 480, 14, A.PAL.blue, 'right', 500);
      return;
    }
    if (f.phase === 'choose' || f.phase === 'confirm') {
      panel(24, 372, W - 48, 116);
      txt(D.FINALE.choose, W / 2, 402, 20, A.PAL.ribbon, 'center');
      D.FINALE.options.forEach(function (label, i) {
        var on = f.cursor === i;
        txt((on ? '▶ ' : '   ') + label, W / 2, 440 + i * 34, 21,
          on ? A.PAL.ribbon : A.PAL.white, 'center');
      });
      if (f.phase === 'confirm') {
        panel(W / 2 - 230, 150, 460, 150, 0.95);
        txt(D.FINALE.confirm[0], W / 2, 192, 19, A.PAL.white, 'center');
        txt(D.FINALE.confirm[1], W / 2, 222, 19, A.PAL.white, 'center');
        [D.FINALE.yes, D.FINALE.no].forEach(function (label, i) {
          var on = f.confirmCursor === i;
          txt((on ? '▶ ' : '   ') + label, W / 2 - 110 + i * 220, 270, 17,
            on ? A.PAL.ribbon : A.PAL.white, 'center');
        });
      }
    }
  }

  // ── 저장 ────────────────────────────────────────────────────────────────
  function save() {
    if (!S) return false;
    try {
      var o = {
        v: 1, map: S.map, px: Math.round(S.px), py: Math.round(S.py), dir: S.dir,
        floor: S.floor, exposure: S.exposure, bubble: S.bubble, loopN: S.loopN,
        pollute: S.pollute, rumors: S.rumors, fog: S.fog,
        honest: S.honest, frames: S.frames, stickers: S.stickers,
        depend: S.depend, locks: S.locks, trusted: S.trusted, hasKey: S.hasKey,
        ending: S.ending, finQ: (S.fin && S.fin.q) || 0,
        flags: S.flags, heardOf: S.heardOf, clearedOf: S.clearedOf,
        stairsOpen: S.stairsOpen, visited: S.visited, cards: {},
        stats: {
          sec: Math.round(S.stats.sec), stolen: S.stats.stolen,
          retreats: S.stats.retreats, missSticker: S.stats.missSticker,
          missPromise: S.stats.missPromise || 0, ending: S.stats.ending || null
        }
      };
      D.CARDS.forEach(function (c) {
        var st = S.cards[c.id];
        o.cards[c.id] = { held: st.held, map: st.map, x: st.x, y: st.y };
      });
      g.localStorage.setItem(D.SAVE_KEY, JSON.stringify(o));
      return true;
    } catch (e) { return false; }
  }

  function load() {
    try {
      var raw = g.localStorage.getItem(D.SAVE_KEY);
      if (!raw) return false;
      var o = JSON.parse(raw);
      // 손상·조작·구버전 세이브는 조용히 버린다 — NaN 좌표로 먹통이 되는 것보다
      // 처음부터 다시가 낫다(슬라이스 분량 5분). 검증 실패 시 저장소도 비운다.
      if (!o || o.v !== 1 || !D.MAPS[o.map]) return dropBadSave();
      if (!isFinite(o.px) || !isFinite(o.py)) return dropBadSave();
      var m = D.MAPS[o.map];
      S = blankState();
      S.mode = 'world'; S.map = o.map;
      S.px = Math.max(T / 2, Math.min(m.w * T - T / 2, +o.px));
      S.py = Math.max(T, Math.min(m.h * T - 2, +o.py));
      S.dir = [0, 1, 2, 3].indexOf(o.dir | 0) >= 0 ? (o.dir | 0) : 0;
      // 층은 저장값이 아니라 맵에서 다시 구한다(구버전 세이브·조작 방어).
      S.floor = m.fl || 1;
      S.exposure = Math.max(0, Math.min(D.MAX_EXPOSURE, o.exposure | 0));
      S.bubble = Math.max(0, Math.min(D.MAX_BUBBLE, o.bubble | 0));
      S.loopN = Math.max(0, Math.min(999, o.loopN | 0));
      // 소문은 아는 id·아는 상태만 살린다. 대화 도중 껐다면(aired) 오염으로 확정한다
      // — 안개 없이 목록에서만 사라지는 상태를 남기지 않는다.
      (D.RUMORS || []).forEach(function (r) {
        var st = o.rumors && o.rumors[r.id];
        if (RUMOR_STATES.indexOf(st) < 0) st = 'unread';
        S.rumors[r.id] = st === 'aired' ? 'polluted' : st;
      });
      // 안개·오염 게이지는 저장값을 믿지 않고 소문 상태에서 다시 만든다.
      rebuildFog();
      // 4층 액자도 같은 규칙: 아는 id·아는 상태만 살리고, 스티커는 아는 견본만.
      (D.FRAMES || []).forEach(function (f) {
        var st = o.frames && o.frames[f.id];
        S.frames[f.id] = FRAME_STATES.indexOf(st) >= 0 ? st : 'unseen';
        var pk = o.stickers && o.stickers[f.id];
        S.stickers[f.id] = authorDef(pk) ? pk : null;
      });
      // 5층 장치도 같은 규칙: 아는 장치의 true 만 살린다. 회복 대상(trusted)은
      // 열린 장치에만 남는다 — 닫힌 장치에 회복 빚이 남는 상태를 만들지 않는다.
      var lockIds = {};
      (D.LOCKS || []).forEach(function (k) { lockIds[k.id] = true; });
      S.locks = trueKeys(o.locks, lockIds);
      S.trusted = trueKeys(o.trusted, lockIds);
      for (var lk in S.trusted) if (!S.locks[lk]) delete S.trusted[lk];
      S.hasKey = o.hasKey === true;
      S.depend = Math.max(0, Math.min(D.MAX_DEPEND, o.depend | 0));
      // 열린 유리문·장치·정직 게이지는 저장 좌표가 아니라 상태에서 다시 만든다.
      rebuildOpened();
      for (var k in S.flags) if (o.flags && typeof o.flags[k] === 'boolean') S.flags[k] = o.flags[k];
      S.heardOf = trueKeys(o.heardOf, D.BATTLES);
      S.clearedOf = trueKeys(o.clearedOf, D.BATTLES);
      S.stairsOpen = trueKeys(o.stairsOpen, D.MAPS);
      S.visited = trueKeys(o.visited, D.MAPS);
      S.visited[S.map] = true;
      D.CARDS.forEach(function (c) {
        var st = o.cards && o.cards[c.id]; if (!st) return;
        var map = st.map === null || D.MAPS[st.map] ? st.map : c.at.map;
        var mm = map ? D.MAPS[map] : null;
        S.cards[c.id] = {
          held: !!st.held,
          map: map,
          x: mm ? Math.max(0, Math.min(mm.w - 1, st.x | 0)) : c.at.x,
          y: mm ? Math.max(0, Math.min(mm.h - 1, st.y | 0)) : c.at.y
        };
      });
      if (o.stats) {
        S.stats.sec = Math.max(0, +o.stats.sec || 0);
        S.stats.stolen = Math.max(0, o.stats.stolen | 0);
        S.stats.retreats = Math.max(0, o.stats.retreats | 0);
        S.stats.missSticker = Math.max(0, o.stats.missSticker | 0);
        S.stats.missPromise = Math.max(0, o.stats.missPromise | 0);
        S.stats.ending = o.stats.ending === 'A' || o.stats.ending === 'B' ? o.stats.ending : null;
      }
      // 엔딩은 A/B만 인정 — 그 밖의 값은 아직 안 끝난 것으로 본다
      S.ending = o.ending === 'A' || o.ending === 'B' ? o.ending : null;
      // 들고 있지도, 바닥에도 없는 카드가 생기면(반쪽 저장) 원위치로 복구한다.
      D.CARDS.forEach(function (c) {
        var st = S.cards[c.id];
        if (!st.held && !st.map) { st.map = c.at.map; st.x = c.at.x; st.y = c.at.y; }
      });
      updateCam();
      return true;
    } catch (e) { return dropBadSave(); }
  }

  var RUMOR_STATES = ['unread', 'read', 'aired', 'polluted', 'fixed', 'verified'];
  var FRAME_STATES = ['unseen', 'seen', 'done'];

  // 저장된 사전에서 아는 키의 true 만 살린다 — 모르는 키·이상한 값은 버린다.
  function trueKeys(src, valid) {
    var out = {};
    if (src && typeof src === 'object') {
      for (var k in valid) if (src[k] === true) out[k] = true;
    }
    return out;
  }

  function dropBadSave() {
    try { g.localStorage.removeItem(D.SAVE_KEY); } catch (e) { /* 비워도 못 비워도 새 게임 */ }
    return false;
  }

  function hasSave() {
    try { return !!g.localStorage.getItem(D.SAVE_KEY); } catch (e) { return false; }
  }
  function clearSave() {
    try { g.localStorage.removeItem(D.SAVE_KEY); return true; } catch (e) { return false; }
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────
  function txt(str, x, y, size, color, align, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px ' + FACE;
    ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }
  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = 'rgba(18,14,24,' + (alpha === undefined ? 0.88 : alpha) + ')';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = A.PAL.cream; ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  }

  // 정적 레이어(바닥·벽·고정 소품)는 맵 진입 시 1회만 그린다 — 저사양 태블릿 프레임 확보.
  // 계단 잠김/열림과 루프 횟수가 그림에 들어가므로 둘 다 캐시 키에 넣는다.
  var mapCache = { map: null, stairsOpen: null, loopN: null, cv: null };

  function mapLayer(m) {
    if (mapCache.cv && mapCache.map === S.map && mapCache.loopN === S.loopN
      && mapCache.stairsOpen === !!S.stairsOpen[S.map]) {
      return mapCache.cv;
    }
    var doc = g.document;
    if (!doc || !doc.createElement) return null;
    var off = doc.createElement('canvas');
    off.width = m.w * T; off.height = m.h * T;
    var oc = off.getContext && off.getContext('2d');
    if (!oc) return null;
    if ('imageSmoothingEnabled' in oc) oc.imageSmoothingEnabled = false;
    paintMap(oc, m, 0, 0, m.w - 1, m.h - 1);
    mapCache.map = S.map; mapCache.stairsOpen = !!S.stairsOpen[S.map];
    mapCache.loopN = S.loopN; mapCache.cv = off;
    return off;
  }

  function drawMap(m) {
    var layer = mapLayer(m);
    if (layer) { ctx.drawImage(layer, S.cam.x, S.cam.y, W, H, 0, 0, W, H); return; }
    // 오프스크린을 못 만들면(스텁 환경 등) 화면 범위만 직접 그린다.
    var x0 = Math.max(0, Math.floor(S.cam.x / T)), x1 = Math.min(m.w - 1, Math.ceil((S.cam.x + W) / T));
    var y0 = Math.max(0, Math.floor(S.cam.y / T)), y1 = Math.min(m.h - 1, Math.ceil((S.cam.y + H) / T));
    paintMap(ctx, m, x0, y0, x1, y1, S.cam.x, S.cam.y);
  }

  function paintMap(c, m, x0, y0, x1, y1, camX, camY) {
    camX = camX || 0; camY = camY || 0;
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var dx = tx * T - camX, dy = ty * T - camY;
        if (!A.drawTile(c, 'floor', m.floor[0], m.floor[1], dx, dy)) {
          c.fillStyle = A.PAL.tan; c.fillRect(dx, dy, T, T);
        }
        var ch = m.grid[ty].charAt(tx), L = legend(ch);
        if (L && L.wall) {
          var off = wallOffset(m, tx, ty);
          if (off) A.drawTile(c, 'wall', m.wallBase[0] + off[0], m.wallBase[1] + off[1], dx, dy);
          else { c.fillStyle = m.fill; c.fillRect(dx, dy, T, T); }
        }
        if (L && L.prop) {
          if (L.prop === 'stairs') A.drawProp(c, S.stairsOpen[S.map] ? 'stairsOpen' : 'stairsLocked', dx, dy, T);
          else A.drawProp(c, L.prop, dx, dy, T);
        }
      }
    }
    (m.decor || []).forEach(function (d) {
      var dx = d.x * T - camX, dy = d.y * T - camY;
      if (d.kind === 'pot') { A.drawSprite(c, 'pot', 0, 0, 14, 16, dx + 12, dy + 10, 28, 32); return; }
      // 루프를 돌수록 복도가 단조로워진다: 포스터가 한 그림으로 도배되고, 창문까지 가린다.
      // (2층 추천 복도의 연출 — 다른 층 복도까지 물들이지 않는다)
      var dull = S.floor === 2;
      if (d.kind === 'poster') {
        A.drawProp(c, 'poster', dx, dy, T, dull && S.loopN >= 2 ? A.PAL.red : A.PAL[d.tone]);
        return;
      }
      if (d.kind === 'window') {
        A.drawProp(c, dull && S.loopN >= 4 ? 'poster' : 'window', dx, dy, T, A.PAL.red);
        return;
      }
      A.drawProp(c, d.kind, dx, dy, T);
    });
  }

  function drawEntities(m) {
    var list = [];
    D.CARDS.forEach(function (c) {
      var st = S.cards[c.id];
      if (st.held || st.map !== S.map || cardHidden(c)) return;
      list.push({ y: st.y * T + 42, draw: function (dx, dy) {
        var bob = Math.sin(S.time * 3 + st.x) * 3;
        // 바닥에서 눈에 띄라고 카드 밑에 옅은 빛을 깐다
        ctx.fillStyle = 'rgba(240,200,110,' + (0.16 + Math.sin(S.time * 3 + st.x) * 0.08).toFixed(2) + ')';
        ctx.fillRect(dx + 4, dy + 14, T - 8, T - 18);
        A.drawProp(ctx, 'card', dx, dy + bob, T, c.tone);
      }, tx: st.x, ty: st.y });
    });
    (m.terminals || []).forEach(function (tm, idx) {
      var key = S.map + ':' + idx;
      list.push({ y: tm.y * T + 42, tx: tm.x, ty: tm.y, draw: function (dx, dy) {
        var cool = S.cool[key] > 0;
        ctx.globalAlpha = cool ? 0.5 : 1;
        if (!A.drawSprite(ctx, 'crate', 0, 0, 14, 15, dx + 8, dy + 9, 32, 34)) {
          ctx.fillStyle = A.PAL.orange; ctx.fillRect(dx + 8, dy + 9, 32, 34);
        }
        ctx.globalAlpha = 1;
        var blink = cool ? 0.25 : 0.55 + Math.sin(S.time * 6) * 0.35;
        ctx.fillStyle = 'rgba(216,74,60,' + blink.toFixed(2) + ')';
        ctx.fillRect(dx + 15, dy + 4, 18, 6);
      } });
    });
    if (npcHere(m)) {
      var free = !!S.clearedOf[m.npc.battle];
      list.push({ y: m.npc.y * T + 42, tx: m.npc.x, ty: m.npc.y, draw: function (dx, dy) {
        A.drawChar(ctx, m.npc.sheet, free ? A.DIR.down : A.DIR[m.npc.dir], 0,
          dx + T / 2, dy + T - 6, { possessed: !free });
      } });
    }
    list.push({ y: S.py, draw: null });
    list.sort(function (p, q) { return p.y - q.y; });
    list.forEach(function (it) {
      if (!it.draw) { A.drawChar(ctx, 'student', S.dir, S.frame, S.px - S.cam.x, S.py - S.cam.y); return; }
      it.draw(it.tx * T - S.cam.x, it.ty * T - S.cam.y);
    });
  }

  // 노출도만큼 화면 가장자리에 광고 딱지가 붙는다 (중앙 시야는 가리지 않는다)
  var AD_SLOTS = [
    { x: 8, y: 92, w: 118, h: 40, r: -6 },
    { x: 594, y: 130, w: 118, h: 40, r: 5 },
    { x: 20, y: 372, w: 112, h: 38, r: 4 },
    { x: 588, y: 330, w: 124, h: 40, r: -4 },
    { x: 300, y: 8, w: 120, h: 36, r: 2 }
  ];
  // 버블이 짙어질수록 화면 가장자리가 뿌옇게 닫힌다 (1층 광고 딱지의 2층판)
  var BUB_SLOTS = [
    [[52, 104, 34], [672, 158, 28], [128, 446, 24]],
    [[604, 404, 36], [186, 58, 22], [516, 62, 30]],
    [[34, 268, 40], [700, 292, 32], [346, 486, 26]]
  ];
  function blob(x, y, r, color) {
    ctx.fillStyle = color;
    if (ctx.beginPath && ctx.arc) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    } else ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawBubbles() {
    if (S.bubble <= 0) return;
    var e = 18 + S.bubble * 20;
    ctx.fillStyle = 'rgba(120,200,210,' + (0.05 + S.bubble * 0.05).toFixed(2) + ')';
    ctx.fillRect(0, 0, W, e); ctx.fillRect(0, H - e, W, e);
    ctx.fillRect(0, e, e, H - e * 2); ctx.fillRect(W - e, e, e, H - e * 2);
    for (var i = 0; i < S.bubble && i < BUB_SLOTS.length; i++) {
      BUB_SLOTS[i].forEach(function (b) {
        blob(b[0], b[1], b[2], 'rgba(150,220,232,0.20)');
        blob(b[0] - b[2] * 0.3, b[1] - b[2] * 0.3, b[2] * 0.32, 'rgba(238,252,254,0.26)');
      });
    }
  }

  function drawAds() {
    for (var i = 0; i < S.exposure && i < AD_SLOTS.length; i++) {
      var a = AD_SLOTS[i];
      ctx.save();
      ctx.translate(a.x + a.w / 2, a.y + a.h / 2);
      ctx.rotate(a.r * Math.PI / 180);
      ctx.fillStyle = A.PAL.red; ctx.fillRect(-a.w / 2, -a.h / 2, a.w, a.h);
      ctx.fillStyle = A.PAL.ribbon; ctx.fillRect(-a.w / 2 + 4, -a.h / 2 + 4, a.w - 8, a.h - 8);
      txt(D.T.adWords[i % D.T.adWords.length], 0, 7, 20, A.PAL.ink, 'center');
      ctx.restore();
    }
  }

  // 같은 자리·같은 문법의 게이지. 1층 노출도(빨강) · 2층 버블(청록) · 3층 오염(빨강).
  function drawGauge(x, y) {
    var G0 = gaugeInfo(), max = G0.max, val = G0.val;
    txt(G0.label, x, y + 16, 17, A.PAL.cream);
    var bx = x + 58;
    for (var i = 0; i < max; i++) {
      ctx.fillStyle = i < val ? G0.tone : 'rgba(120,110,130,0.55)';
      ctx.fillRect(bx + i * 22, y + 2, 18, 16);
      ctx.strokeStyle = A.PAL.ink; ctx.lineWidth = 2;
      ctx.strokeRect(bx + i * 22, y + 2, 18, 16);
    }
    // 색약 학생을 위한 이중 부호화 — 색과 함께 숫자로도 알려 준다
    txt(val + '/' + max, bx + max * 22 + 6, y + 16, 15, A.PAL.cream, 'left', 500);
  }

  function drawHud() {
    // 칠판(윗벽 가운데)을 가리지 않도록 좌우 끝으로 붙인다.
    panel(8, 8, 222, 30, 0.62);
    drawGauge(16, 12);
    var ids = heldIds();
    panel(490, 8, 222, 30, 0.62);
    var labels = ids.length ? ids.map(function (id) { return cardDef(id).label; }).join(' · ') : D.T.bagEmpty;
    txt(D.T.bagLabel, 498, 30, 15, A.PAL.cream);
    txt(labels, 706, 30, 15, A.PAL.ribbon, 'right');
    drawHelp();
  }

  // 회복 경로는 항상 화면에 보인다 (기준서 §3-3)
  function drawHelp() {
    panel(8, H - 30, W - 16, 24, 0.62);
    txt(gaugeInfo().help, W / 2, H - 12, 15, A.PAL.blue, 'center', 600);
  }

  function drawDialog() {
    var box = S.dialog.seq[S.dialog.i] || [];
    panel(24, 384, W - 48, 104);
    for (var i = 0; i < box.length && i < 2; i++) txt(box[i], 48, 428 + i * 34, 22, A.PAL.white);
    txt('▼', W - 56, 480, 18, A.PAL.ribbon, 'center', 400);
  }

  // 콘솔 선택지 — 배틀 메뉴와 같은 상자·같은 커서(새 UI 없음).
  function drawConsole() {
    if (!S.con || S.dialog) return;
    var list = conList();
    panel(24, 360, W - 48, 128);
    var conTitle = S.con.kind === 'sticker' ? D.STICKER.title
      : (S.con.kind === 'navis' ? D.NAVIS.title : D.CONSOLE.title);
    txt(conTitle, 48, 388, 19, A.PAL.ribbon);
    list.forEach(function (key, i) {
      var x = 60 + (i % 2) * 320, y = 420 + Math.floor(i / 2) * 38;
      var on = S.con.cursor === i;
      txt((on ? '▶ ' : '   ') + conLabel(key), x, y, 21, on ? A.PAL.ribbon : A.PAL.white);
    });
    txt(D.CONSOLE.hint, W - 44, 482, 15, A.PAL.blue, 'right', 500);
  }

  function drawToast() {
    var t = S.toast;
    ctx.globalAlpha = Math.min(1, t.t * 2);
    panel(W / 2 - 250, 48, 500, 38, 0.9);
    txt(t.text, W / 2, 74, 18, A.PAL.ribbon, 'center');
    ctx.globalAlpha = 1;
  }

  // 소문 안개 — 맵 그리드는 그대로 두고 오버레이로 얹는다(정정 방송이면 바로 걷힌다).
  function drawFog(m) {
    var list = fogOf(m); if (!list.length) return;
    var a = 0.88 + Math.sin(S.time * 2) * 0.10;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    list.forEach(function (c) {
      A.drawProp(ctx, 'fog', c.x * T - S.cam.x, c.y * T - S.cam.y, T);
    });
    ctx.globalAlpha = 1;
  }

  // 열린 유리문 — 안개와 같은 자리에서 반대로 얹는다. 캐시된 지도 위에
  // 바닥을 다시 깔고 열린 문틀만 그려, 통행 가능이 눈으로 바로 읽히게 한다.
  // 열린 칸 밑 그림은 원래 타일 글자로 고른다 — 층이 늘어도 분기 하나만 는다.
  var OPEN_PROP = { g: 'glassOpen', Y: 'cabinetOpen', Z: 'fileBoxOpen', I: 'innerOpen' };
  function drawOpened(m) {
    var list = openedOf(m); if (!list.length) return;
    list.forEach(function (c) {
      var dx = c.x * T - S.cam.x, dy = c.y * T - S.cam.y;
      if (!A.drawTile(ctx, 'floor', m.floor[0], m.floor[1], dx, dy)) {
        ctx.fillStyle = A.PAL.tan; ctx.fillRect(dx, dy, T, T);
      }
      A.drawProp(ctx, OPEN_PROP[chAt(m, c.x, c.y)] || 'glassOpen', dx, dy, T);
    });
  }

  // ── 5층 연출 ────────────────────────────────────────────────────────────
  // 조사 가능 칸 위의 작은 빛 점. 5층 한정이고, 의존 +2부터 꺼진다(스펙 §2).
  var GLINT_CH = { X: 1, Y: 1, Z: 1, I: 1, O: 1, H: 1, W: 1 };
  function drawGlints(m) {
    if (!glintOn()) return;
    var x0 = Math.max(0, Math.floor(S.cam.x / T)), x1 = Math.min(m.w - 1, Math.ceil((S.cam.x + W) / T));
    var y0 = Math.max(0, Math.floor(S.cam.y / T)), y1 = Math.min(m.h - 1, Math.ceil((S.cam.y + H) / T));
    var a = 0.55 + Math.sin(S.time * 4) * 0.35;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (!GLINT_CH[chAt(m, tx, ty)]) continue;
        if (openedAt(m, tx, ty)) continue;      // 이미 연 장치는 더 부르지 않는다
        A.drawProp(ctx, 'glint', tx * T - S.cam.x, ty * T - S.cam.y - 14, T, A.PAL.cream);
      }
    }
    ctx.globalAlpha = 1;
  }
  // 의존 MAX의 회색 안개. 아래 회복 안내 띠(H-34 아래)는 절대 덮지 않는다(헌법 §3-3).
  var HELP_TOP = H - 34;
  function drawDim() {
    if (S.depend < D.DEPEND_FOG) return;
    var e = 44;
    ctx.fillStyle = 'rgba(147,167,174,0.22)';
    ctx.fillRect(0, 0, W, e);
    ctx.fillRect(0, e, e, HELP_TOP - e);
    ctx.fillRect(W - e, e, e, HELP_TOP - e);
    ctx.fillRect(0, HELP_TOP - e, W, e);
    ctx.fillStyle = 'rgba(91,112,121,0.20)';
    ctx.fillRect(0, 0, W, 18);
    ctx.fillRect(0, HELP_TOP - 18, W, 18);
    ctx.fillRect(0, 18, 18, HELP_TOP - 36);
    ctx.fillRect(W - 18, 18, 18, HELP_TOP - 36);
  }
  // 출처를 밝힌 액자에 붙은 스티커 (액자 그림은 캐시된 지도 그대로)
  function drawSticks(m) {
    var name = nameOf(m);
    (D.FRAMES || []).forEach(function (f) {
      if (f.map !== name || S.frames[f.id] !== 'done') return;
      A.drawProp(ctx, 'sticker', f.x * T - S.cam.x, f.y * T - S.cam.y, T);
    });
  }

  function drawWorld() {
    var m = mapOf(S.map);
    ctx.fillStyle = m.fill; ctx.fillRect(0, 0, W, H);
    drawMap(m);
    drawFog(m);
    drawOpened(m);
    drawSticks(m);
    drawGlints(m);
    drawEntities(m);
    ctx.fillStyle = m.tint; ctx.fillRect(0, 0, W, H);
    if (S.floor === 2) drawBubbles();
    else if (S.floor === 1) drawAds();
    else if (S.floor === 5) drawDim();
    if (S.flash > 0) drawFlash();
    drawHud();
  }

  // 카드를 뺏긴 순간의 붉은 비네트 — 가장자리만 물들여 시야는 가리지 않는다.
  function drawFlash() {
    var a = Math.min(0.5, S.flash * 0.7);
    var e = 46;
    ctx.fillStyle = 'rgba(216,74,60,' + a.toFixed(2) + ')';
    ctx.fillRect(0, 0, W, e); ctx.fillRect(0, H - e, W, e);
    ctx.fillRect(0, e, e, H - e * 2); ctx.fillRect(W - e, e, e, H - e * 2);
  }

  function drawHearts(n, max, x, y) {
    for (var i = 0; i < max; i++) {
      var full = i < n;
      if (!A.drawSprite(ctx, 'heart', (full ? 4 : 0) * 16, 0, 16, 16, x + i * 30, y, 26, 26)) {
        ctx.fillStyle = full ? A.PAL.red : 'rgba(120,110,130,0.5)';
        ctx.fillRect(x + i * 30, y, 26, 26);
      }
    }
  }

  function drawBattle() {
    var b = S.battle, P = prof();
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(58,43,74,0.55)';
    ctx.fillRect(0, 40, W, 158);
    // 씌인 실루엣이 배경에 묻히지 않게 뒤에서 옅게 비춰 준다
    var gr = ctx.createRadialGradient && ctx.createRadialGradient(W / 2, 138, 10, W / 2, 138, 130);
    if (gr && gr.addColorStop) {
      gr.addColorStop(0, 'rgba(168,106,216,0.30)');
      gr.addColorStop(1, 'rgba(168,106,216,0)');
      ctx.fillStyle = gr; ctx.fillRect(W / 2 - 130, 8, 260, 260);
    }

    A.drawChar(ctx, P.sheet, A.DIR.down, 0, W / 2, 184, { scale: 6, possessed: !b.spare, shadow: false });

    txt(P.name, W / 2, 210, 20, b.spare ? A.PAL.ribbon : A.PAL.white, 'center');
    var gw = 150, gx = W / 2 - gw / 2;
    ctx.fillStyle = 'rgba(120,110,130,0.5)'; ctx.fillRect(gx, 218, gw, 10);
    ctx.fillStyle = A.PAL.purpleLit;
    ctx.fillRect(gx, 218, gw * Math.max(0, b.shadow) / P.shadow, 10);
    txt(Math.max(0, b.shadow) + '/' + P.shadow, gx + gw + 10, 227, 14, A.PAL.white, 'left', 500);

    panel(8, 8, 222, 30, 0.62); drawGauge(16, 12); drawHelp();
    drawHearts(b.hearts, P.hearts, W - 108, 10);

    ctx.strokeStyle = A.PAL.white; ctx.lineWidth = 4;
    ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);
    ctx.fillStyle = 'rgba(8,6,12,0.6)'; ctx.fillRect(BOX.x + 2, BOX.y + 2, BOX.w - 4, BOX.h - 4);

    if (b.phase === 'enemy') {
      if (b.tell > 0) txt(D.BATTLE_UI.tell, W / 2, BOX.y + 76, 19, A.PAL.purpleLit, 'center');
      b.bullets.forEach(function (p) {
        if (p.stamp) {
          var h = p.s / 2;
          if (p.warn > 0) {
            // 예고: 테두리만. 남은 시간이 줄수록 진해져 언제 찍힐지 눈으로 읽힌다.
            ctx.globalAlpha = Math.max(0.35, Math.min(1, 1.1 - p.warn * 0.6));
            ctx.strokeStyle = A.PAL.purpleLit; ctx.lineWidth = 3;
            ctx.strokeRect(p.x - h, p.y - h, p.s, p.s);
            ctx.fillStyle = 'rgba(168,106,216,0.16)';
            ctx.fillRect(p.x - h + 3, p.y - h + 3, p.s - 6, p.s - 6);
            ctx.globalAlpha = 1;
            return;
          }
          ctx.fillStyle = A.PAL.purple; ctx.fillRect(p.x - h, p.y - h, p.s, p.s);
          ctx.fillStyle = A.PAL.red; ctx.fillRect(p.x - h + 5, p.y - h + 5, p.s - 10, p.s - 10);
          ctx.fillStyle = A.PAL.white; ctx.fillRect(p.x - h + 11, p.y - h + 11, p.s - 22, p.s - 22);
          return;
        }
        if (p.stain) {
          // 마르기 직전의 자국은 옅어진다 — 언제 사라지는지 눈으로 읽히게.
          ctx.globalAlpha = Math.max(0.35, Math.min(1, p.hold * 1.6));
          ctx.fillStyle = A.PAL.purple; ctx.fillRect(p.x - 12, p.y - 7, 24, 14);
          ctx.fillStyle = A.PAL.purpleLit; ctx.fillRect(p.x - 9, p.y - 4, 18, 8);
          ctx.globalAlpha = 1;
          return;
        }
        if (p.drop) {
          // 떨어지는 물감은 방울 모양 — 다른 탄막과 한눈에 갈린다.
          ctx.fillStyle = A.PAL.purple; ctx.fillRect(p.x - 7, p.y - 11, 14, 22);
          ctx.fillStyle = A.PAL.purpleLit; ctx.fillRect(p.x - 4, p.y - 8, 8, 17);
          ctx.fillStyle = A.PAL.white; ctx.fillRect(p.x - 2, p.y - 5, 3, 5);
          return;
        }
        ctx.fillStyle = A.PAL.purple; ctx.fillRect(p.x - p.s / 2 - 2, p.y - p.s / 2 - 2, p.s + 4, p.s + 4);
        ctx.fillStyle = A.PAL.purpleLit; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      });
      ctx.globalAlpha = b.inv > 0 ? (Math.floor(b.inv * 12) % 2 ? 0.35 : 1) : 1;
      if (!A.drawSprite(ctx, 'heart', 64, 0, 16, 16, b.hx - 11, b.hy - 11, 22, 22)) {
        ctx.fillStyle = A.PAL.red; ctx.fillRect(b.hx - 8, b.hy - 8, 16, 16);
      }
      ctx.globalAlpha = 1;
    }

    if (b.phase === 'menu') {
      panel(24, 384, W - 48, 104);
      if (b.spare) {
        txt('▶ ' + D.BATTLE_UI.spareLabel, 60, 442, 24, A.PAL.ribbon);
      } else {
        D.BATTLE_UI.menu.forEach(function (label, i) {
          var x = 60 + (i % 2) * 320, y = 424 + Math.floor(i / 2) * 42;
          txt((b.cursor === i ? '▶ ' : '   ') + label, x, y, 22,
            b.cursor === i ? A.PAL.ribbon : A.PAL.white);
        });
      }
    } else if (b.phase === 'sub') {
      panel(24, 384, W - 48, 104);
      heldIds().forEach(function (id, i) {
        var x = 60 + (i % 2) * 320, y = 424 + Math.floor(i / 2) * 42;
        txt((b.sub === i ? '▶ ' : '   ') + cardDef(id).label, x, y, 22,
          b.sub === i ? A.PAL.ribbon : A.PAL.white);
      });
      txt(D.BATTLE_UI.subHint, W - 44, 478, 15, A.PAL.blue, 'right', 500);
    }
  }

  // 타이틀 메뉴 — 저장이 있으면 [이어하기/처음부터], 처음부터는 확인 한 번.
  var title = { cursor: 0, confirm: false, confirmCursor: 1 };

  function titleOptions() {
    return hasSave() ? [D.T.resume, D.T.restart] : [D.T.start];
  }

  function updateTitle() {
    if (title.confirm) {
      if (tapped('left') || tapped('right') || tapped('up') || tapped('down')) title.confirmCursor = 1 - title.confirmCursor;
      if (tapped('no')) { title.confirm = false; return; }
      if (tapped('ok')) {
        title.confirm = false;
        if (title.confirmCursor === 0) { clearSave(); title.cursor = 0; newGame(); }
      }
      return;
    }
    if (tapped('teacher') && openTeacher()) return;
    var n = titleOptions().length;
    if (n > 1 && (tapped('up') || tapped('down'))) { title.cursor = 1 - title.cursor; sfx('cursor'); }
    if (!tapped('ok')) return;
    if (n === 1) { newGame(); return; }
    if (title.cursor === 0) { if (!load()) newGame(); return; }
    title.confirm = true; title.confirmCursor = 1; // 기본값은 거절 쪽 — 실수 방지
  }

  function drawTitle() {
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(232,120,60,0.10)'; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(58,43,74,' + (0.5 - i * 0.08) + ')';
      ctx.fillRect(0, 120 + i * 60, W, 30);
    }
    txt(D.T.title, W / 2, 200, 46, A.PAL.cream, 'center');
    txt(D.T.sub, W / 2, 240, 20, A.PAL.tan, 'center', 500);
    var opts = titleOptions();
    panel(W / 2 - 130, 292, 260, 30 + opts.length * 40);
    opts.forEach(function (label, i) {
      var sel = opts.length === 1 || title.cursor === i;
      txt((sel ? '▶ ' : '   ') + label, W / 2, 330 + i * 40, 24, sel ? A.PAL.ribbon : A.PAL.white, 'center');
    });
    txt(isTouch() ? D.T.keysTouch : D.T.keys, W / 2, 448, 17, A.PAL.blue, 'center', 500);
    txt('v' + VERSION, 14, H - 12, 13, 'rgba(224,168,120,0.55)', 'left', 400);
    // 교사 진입 — 아이 눈에 띄지 않게 작고 흐리게, 타이틀에만(같은 상자 문법).
    ctx.globalAlpha = 0.45;
    panel(TBTN.x, TBTN.y, TBTN.w, TBTN.h, 0.30);
    txt(D.TEACHER.entry, TBTN.x + TBTN.w / 2, TBTN.y + 21, 15, A.PAL.tan, 'center', 500);
    ctx.globalAlpha = 1;
    if (title.confirm) {
      panel(W / 2 - 220, 180, 440, 150, 0.95);
      txt(D.T.confirmWipe[0], W / 2, 222, 20, A.PAL.white, 'center');
      txt(D.T.confirmWipe[1], W / 2, 252, 20, A.PAL.white, 'center');
      [D.T.yes, D.T.no].forEach(function (label, i) {
        var sel = title.confirmCursor === i;
        txt((sel ? '▶ ' : '   ') + label, W / 2 - 110 + i * 220, 300, 21,
          sel ? A.PAL.ribbon : A.PAL.white, 'center');
      });
    }
  }

  // 터치 기기 감지 — 조작 안내 문구를 고르는 용도로만 쓴다.
  function isTouch() {
    try {
      return !!(g.matchMedia && g.matchMedia('(hover: none), (pointer: coarse)').matches)
        || ('ontouchstart' in g);
    } catch (e) { return false; }
  }

  var clearUi = { cursor: 0 };

  // 클리어 화면에서 저장을 지우지 않는다 — 삭제는 타이틀의 확인 경로 하나로 일원화.
  // (대화 넘기던 Z 연타 관성으로 기록이 증발하는 사고 방지)
  function updateClear() {
    if (tapped('up') || tapped('down')) { clearUi.cursor = 1 - clearUi.cursor; sfx('cursor'); }
    if (!tapped('ok')) return;
    sfx('ok');
    // 엔딩 화면 — [처음부터 다시 / 타이틀로]. 저장은 어느 쪽이든 지우지 않는다.
    if (S.ending) {
      if (clearUi.cursor === 0) { clearSave(); S = blankState(); title.cursor = 0; newGame(); }
      else { S = blankState(); title.cursor = 0; }
      return;
    }
    if (clearUi.cursor === 0) {          // 계속 둘러보기 — 계단 앞으로 복귀
      S.mode = 'world';
      var m = mapOf(S.map), f = m.stairs && m.stairs.face;
      if (f) {
        S.px = f.x * T + T / 2; S.py = f.y * T + T - 6;
        if (A.DIR[f.dir] !== undefined) S.dir = A.DIR[f.dir];
      }
      updateCam(); save();
    } else {                             // 타이틀로 — 저장은 그대로 둔다
      S = blankState(); title.cursor = 0;
    }
  }

  function drawClear() {
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, W, H);
    var end = !!S.ending;
    if (end) {
      // 본편 완결 화면 — 새벽 하늘빛 한 겹
      ctx.fillStyle = 'rgba(60,90,160,0.16)'; ctx.fillRect(0, 0, W, H);
      txt(D.CLEAR.escBanner, W / 2, 190, 42, A.PAL.ribbon, 'center');
      txt(S.ending === 'A' ? D.FINALE.endLabelA : D.FINALE.endLabelB,
        W / 2, 236, 19, A.PAL.blue, 'center', 500);
    } else {
      txt(S.floor + D.CLEAR.bannerFloor, W / 2, 210, 44, A.PAL.ribbon, 'center');
      txt(D.CLEAR.stairs[0][0], W / 2, 262, 20, A.PAL.white, 'center', 500);
    }
    // 내 기록 — 아이에겐 성취, 교사에겐 관찰 데이터
    var sec = Math.round(S.stats.sec), mm = Math.floor(sec / 60), ss = sec % 60;
    var line = D.CLEAR.statTime + ' ' + (mm ? mm + D.CLEAR.unitMin + ' ' : '') + ss + D.CLEAR.unitSec
      + ' · ' + D.CLEAR.statStolen + ' ' + S.stats.stolen + D.CLEAR.unitCnt
      + ' · ' + D.CLEAR.statRetreat + ' ' + S.stats.retreats + D.CLEAR.unitCnt;
    if (end) {
      line += ' · ' + D.CLEAR.statBack + ' ' + promiseIds().length + D.CLEAR.unitPeople;
    }
    txt(line, W / 2, end ? 282 : 300, 17, A.PAL.tan, 'center', 500);
    (end ? D.CLEAR.endMenu : D.CLEAR.menu).forEach(function (label, i) {
      var sel = clearUi.cursor === i;
      txt((sel ? '▶ ' : '   ') + label, W / 2, 342 + i * 42, 23, sel ? A.PAL.ribbon : A.PAL.white, 'center');
    });
    txt(end ? D.CLEAR.endNote : D.CLEAR.keepNote, W / 2, 452, 16, A.PAL.blue, 'center', 500);
  }

  // ── 교사 화면 (P7) ──────────────────────────────────────────────────────
  // 타이틀에서 T(또는 우하단 [선생님])로만 열린다. 본편 중에는 어떤 키로도 안 열린다.
  // 학생 상태를 바꾸는 길은 두 곳뿐 — 차시 시작과 기록 지우기(둘 다 확인 1회).
  var teacher = { tab: 0, cursor: 0, confirm: null, confirmCursor: 1, rep: null, note: 0 };
  var TBTN = { x: W - 122, y: H - 46, w: 108, h: 30 };

  function openTeacher() {
    if (!S || S.mode !== 'title' || title.confirm) return false;
    teacher.tab = 0; teacher.cursor = 0; teacher.confirm = null; teacher.confirmCursor = 1;
    teacher.rep = readReport(); teacher.note = 0;
    S.mode = 'teacher';
    sfx('ok');
    return true;
  }
  function closeTeacher() { S = blankState(); title.cursor = 0; }

  // 저장 1건을 읽기만 한다 — 엔진 상태에 손대지 않으므로 진행 중 기록이 오염되지 않는다.
  function readReport() {
    var o = null;
    try {
      var raw = g.localStorage.getItem(D.SAVE_KEY);
      if (raw) o = JSON.parse(raw);
    } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || o.v !== 1) return null;
    var st = (o.stats && typeof o.stats === 'object') ? o.stats : {};
    var k, back = 0, top = 1;
    for (k in (D.BATTLES || {})) if (o.clearedOf && o.clearedOf[k] === true) back++;
    for (k in (o.visited || {})) {
      if (o.visited[k] === true && D.MAPS[k]) top = Math.max(top, D.MAPS[k].fl || 1);
    }
    if (D.MAPS[o.map]) top = Math.max(top, D.MAPS[o.map].fl || 1);
    var end = st.ending === 'A' || st.ending === 'B' ? st.ending
      : (o.ending === 'A' || o.ending === 'B' ? o.ending : null);
    return {
      floor: top, back: back,
      sec: Math.max(0, Math.round(+st.sec || 0)),
      stolen: Math.max(0, st.stolen | 0),
      retreats: Math.max(0, st.retreats | 0),
      missSticker: Math.max(0, st.missSticker | 0),
      missPromise: Math.max(0, st.missPromise | 0),
      ending: end
    };
  }
  // 해석은 수치가 아니라 지도 힌트. 임계값을 넘은 첫 규칙 하나만 고른다.
  function reportHint(rep) {
    var rules = D.TEACHER.rules || [];
    for (var i = 0; i < rules.length; i++) {
      if (rep && rep[rules[i].stat] >= rules[i].min) return rules[i].line;
    }
    return D.TEACHER.hintOk;
  }

  function lessonAt(i) {
    var ls = D.TEACHER.lessons || [];
    return ls[i] || null;
  }
  function floorName(fl) {
    var ls = D.TEACHER.lessons || [];
    for (var i = 0; i < ls.length; i++) if (ls[i].fl === fl) return ls[i].name;
    return ls.length ? ls[0].name : '';
  }
  // 차시 시작 — 아래층 인물은 되돌아온 것으로 채우고 계단을 열어 둔다.
  // 게이지·카드·퍼즐은 blankState 그대로(그 층의 퍼즐은 아이가 푼다).
  function startLesson(L) {
    if (!L || !mapOf(L.map)) return false;
    S = blankState();
    for (var n in D.MAPS) {
      var m = D.MAPS[n];
      if (!m.npc || (m.fl || 1) >= L.fl) continue;
      S.clearedOf[m.npc.battle] = true;
      if (m.npc.opens) S.stairsOpen[m.npc.opens] = true;
    }
    S.flags.intro = true;      // 수업 중엔 도입 대사를 다시 보여 주지 않는다
    S.mode = 'world';
    enterMap(L.map, L.x, L.y, L.dir);
    return true;
  }

  function teacherRows() {
    if (teacher.tab === 0) return (D.TEACHER.lessons || []).length;
    if (teacher.tab === 1) return 1;     // [기록 지우기]
    return 0;                            // 차시 안내는 읽기 전용
  }

  function updateTeacher(dt) {
    if (teacher.note > 0) teacher.note -= dt;
    if (teacher.confirm) {
      if (tapped('left') || tapped('right') || tapped('up') || tapped('down')) {
        teacher.confirmCursor = 1 - teacher.confirmCursor;
      }
      if (tapped('no')) { teacher.confirm = null; return; }
      if (tapped('ok')) {
        var c = teacher.confirm;
        teacher.confirm = null;
        if (teacher.confirmCursor !== 0) return;
        sfx('ok');
        if (c.kind === 'wipe') { clearSave(); teacher.rep = readReport(); teacher.note = 2.4; }
        else startLesson(c.lesson);
      }
      return;
    }
    if (tapped('no')) { closeTeacher(); return; }
    var tabs = (D.TEACHER.tabs || []).length || 1;
    if (tapped('left')) { teacher.tab = (teacher.tab + tabs - 1) % tabs; teacher.cursor = 0; sfx('cursor'); }
    if (tapped('right')) { teacher.tab = (teacher.tab + 1) % tabs; teacher.cursor = 0; sfx('cursor'); }
    var n = teacherRows();
    if (!n) return;
    if (tapped('down')) { teacher.cursor = (teacher.cursor + 1) % n; sfx('cursor'); }
    if (tapped('up')) { teacher.cursor = (teacher.cursor + n - 1) % n; sfx('cursor'); }
    if (!tapped('ok')) return;
    // 상태를 바꾸는 두 길 — 반드시 확인 1회(기본값은 거절 쪽)
    teacher.confirm = teacher.tab === 0
      ? { kind: 'start', lesson: lessonAt(teacher.cursor) }
      : { kind: 'wipe' };
    teacher.confirmCursor = 1;
    sfx('ok');
  }

  function timeText(sec) {
    var mm = Math.floor(sec / 60), ss = sec % 60;
    return (mm ? mm + D.CLEAR.unitMin + ' ' : '') + ss + D.CLEAR.unitSec;
  }

  function drawTeacherStart() {
    var TE = D.TEACHER, ls = TE.lessons || [];
    txt(TE.startTitle, 52, 106, 19, A.PAL.ribbon);
    ls.forEach(function (L, i) {
      var x = 76 + (i % 2) * 330, y = 152 + Math.floor(i / 2) * 44;
      var on = teacher.cursor === i;
      txt((on ? '▶ ' : '   ') + L.name + ' ' + L.topic, x, y, 21, on ? A.PAL.ribbon : A.PAL.white);
    });
    var cur = lessonAt(teacher.cursor);
    if (cur) {
      txt(cur.name + ' · ' + cur.topic + ' · ' + cur.parts + ' · ' + TE.about + cur.min + TE.unitMin,
        W / 2, 330, 18, A.PAL.tan, 'center', 500);
    }
    txt(TE.confirmStart[0], W / 2, 366, 16, A.PAL.blue, 'center', 500);
  }

  function drawTeacherReport() {
    var TE = D.TEACHER, r = teacher.rep;
    txt(TE.repTitle, 52, 106, 19, A.PAL.ribbon);
    if (!r) {
      txt(TE.noSave, 52, 152, 18, A.PAL.white, 'left', 500);
    } else {
      [[TE.rowFloor, floorName(r.floor)],
      [TE.rowBack, r.back + D.CLEAR.unitPeople],
      [TE.rowTime, timeText(r.sec)],
      [TE.rowStolen, r.stolen + D.CLEAR.unitCnt],
      [TE.rowRetreat, r.retreats + D.CLEAR.unitCnt],
      [TE.rowSticker, r.missSticker + D.CLEAR.unitCnt]].forEach(function (row, i) {
        var x = 60 + (i % 2) * 330, y = 146 + Math.floor(i / 2) * 34;
        txt(row[0], x, y, 17, A.PAL.metal, 'left', 500);
        txt(row[1], x + 132, y, 17, A.PAL.white);
      });
      // 약속 오답·고른 엔딩은 값이 길어 두 칸을 쓰지 않고 한 줄씩 놓는다.
      txt(TE.rowPromise, 60, 248, 17, A.PAL.metal, 'left', 500);
      txt(r.missPromise + D.CLEAR.unitCnt, 192, 248, 17, A.PAL.white);
      txt(TE.rowEnding, 60, 282, 17, A.PAL.metal, 'left', 500);
      txt(r.ending === 'A' ? D.FINALE.endLabelA
        : (r.ending === 'B' ? D.FINALE.endLabelB : TE.endNone), 192, 282, 17, A.PAL.white);
      txt(TE.hintLabel, 60, 328, 17, A.PAL.blue, 'left', 500);
      txt(reportHint(r), 60, 356, 18, A.PAL.ribbon);
    }
    var on = teacher.cursor === 0;
    txt((on ? '▶ ' : '   ') + TE.wipe, 60, 414, 20, on ? A.PAL.ribbon : A.PAL.white);
  }

  function drawTeacherGuide() {
    var TE = D.TEACHER;
    txt(TE.guideTitle, 52, 106, 19, A.PAL.ribbon);
    (TE.lessons || []).forEach(function (L, i) {
      var y = 144 + i * 52;
      txt(L.name + ' · ' + L.topic + ' · ' + L.mech, 60, y, 18, A.PAL.white);
      txt(TE.askMark + ' ' + L.ask, 78, y + 22, 16, A.PAL.blue, 'left', 500);
    });
  }

  function drawTeacher() {
    var TE = D.TEACHER;
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(60,90,160,0.12)'; ctx.fillRect(0, 0, W, H);
    txt(TE.title, 28, 44, 21, A.PAL.cream);
    (TE.tabs || []).forEach(function (name, i) {
      var on = teacher.tab === i;
      txt((on ? '▶ ' : '   ') + name, 208 + i * 170, 44, 18,
        on ? A.PAL.ribbon : A.PAL.metal, 'left', on ? 700 : 500);
    });
    panel(24, 62, W - 48, H - 122, 0.72);
    if (teacher.tab === 0) drawTeacherStart();
    else if (teacher.tab === 1) drawTeacherReport();
    else drawTeacherGuide();
    txt(TE.hint, W / 2, H - 20, 15, A.PAL.blue, 'center', 500);
    if (teacher.note > 0) {
      panel(W / 2 - 190, 84, 380, 36, 0.92);
      txt(TE.wiped, W / 2, 108, 18, A.PAL.ribbon, 'center');
    }
    if (teacher.confirm) {
      var msg = teacher.confirm.kind === 'wipe' ? TE.confirmWipe : TE.confirmStart;
      panel(W / 2 - 220, 180, 440, 150, 0.95);
      txt(msg[0], W / 2, 222, 19, A.PAL.white, 'center');
      txt(msg[1], W / 2, 252, 19, A.PAL.white, 'center');
      [TE.yes, TE.no].forEach(function (label, i) {
        var sel = teacher.confirmCursor === i;
        txt((sel ? '▶ ' : '   ') + label, W / 2 - 110 + i * 220, 300, 21,
          sel ? A.PAL.ribbon : A.PAL.white, 'center');
      });
    }
  }

  // 타이틀 우하단 작은 버튼 — 터치 기기에서 T 키를 대신한다(타이틀에서만 반응).
  function canvasTap(x, y) {
    if (!S || S.mode !== 'title' || title.confirm) return false;
    if (x < TBTN.x || x > TBTN.x + TBTN.w || y < TBTN.y || y > TBTN.y + TBTN.h) return false;
    return openTeacher();
  }
  function onCanvasPointer(e) {
    if (!cv || !cv.getBoundingClientRect) return;
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (canvasTap((e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height))
      && e.preventDefault) e.preventDefault();
  }
  function bindCanvasTap() {
    if (!cv || !cv.addEventListener) return;
    if (g.PointerEvent) { cv.addEventListener('pointerdown', onCanvasPointer); return; }
    cv.addEventListener('mousedown', onCanvasPointer);
    cv.addEventListener('touchstart', function (e) {
      var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      if (!t) return;
      onCanvasPointer({
        clientX: t.clientX, clientY: t.clientY,
        preventDefault: function () { if (e.preventDefault) e.preventDefault(); }
      });
    }, { passive: false });
  }

  function drawLoading() {
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, W, H);
    txt(D.T.loading, W / 2, H / 2, 22, A.PAL.cream, 'center');
  }

  // ── 루프 ────────────────────────────────────────────────────────────────
  function update(dt) {
    S.time += dt;
    // 교사 화면에 머문 시간은 아이의 기록이 아니다 — 시계를 세지 않는다.
    if (S.mode !== 'title' && S.mode !== 'load' && S.mode !== 'teacher' && !S.paused) S.stats.sec += dt;
    if (S.paused) { if (tapped('ok')) S.paused = false; return; }
    if (S.flash > 0) S.flash -= dt;
    if (S.toast) { S.toast.t -= dt; if (S.toast.t <= 0) S.toast = null; }
    // 슬롯 UI는 P3. 단일 슬롯이되, 공유 태블릿을 위해 이어하기/처음부터를 고른다.
    if (S.mode === 'title') { updateTitle(); return; }
    if (S.mode === 'teacher') { updateTeacher(dt); return; }
    if (S.mode === 'clear') { updateClear(); return; }
    if (S.dialog) {
      if (tapped('ok')) {
        S.dialog.i++;
        if (S.dialog.i >= S.dialog.seq.length) {
          var then = S.dialog.then; S.dialog = null; if (then) then();
        }
      }
      return;
    }
    if (S.mode === 'world') updateWorld(dt);
    else if (S.mode === 'battle') updateBattle(dt);
    else if (S.mode === 'console') updateConsole(dt);
    else if (S.mode === 'finale') updateFinale(dt);
  }

  function render() {
    if (S.mode === 'load') { drawLoading(); return; }
    if (S.mode === 'title') { drawTitle(); return; }
    if (S.mode === 'teacher') { drawTeacher(); return; }
    if (S.mode === 'clear') { drawClear(); return; }
    if (S.mode === 'battle') drawBattle();
    else if (S.mode === 'finale') drawFinale();
    else drawWorld();
    if (S.mode === 'console') drawConsole();
    if (S.dialog) drawDialog();
    if (S.toast) drawToast();
    if (S.paused) drawPaused();
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,6,12,0.72)'; ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 190, H / 2 - 62, 380, 116, 0.95);
    txt(D.T.paused, W / 2, H / 2 - 12, 26, A.PAL.cream, 'center');
    txt(isTouch() ? D.T.pausedHelpTouch : D.T.pausedHelp, W / 2, H / 2 + 26, 17, A.PAL.blue, 'center', 500);
  }

  // 탄막 도중 자리를 비웠다 돌아오면 바로 맞지 않게 멈춰 준다.
  function pause() {
    if (S && (S.mode === 'battle' || S.mode === 'world') && !S.dialog) S.paused = true;
  }

  function loop(ts) {
    var t = typeof ts === 'number' ? ts : 0;
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    update(dt);
    render();
    clearEdges();
    raf = g.requestAnimationFrame(loop);
  }

  // ── 터치 (index.html의 DOM 스틱/버튼) ───────────────────────────────────
  function bindTouch() {
    var doc = g.document; if (!doc || !doc.getElementById) return;
    var stick = doc.getElementById('stick'), knob = doc.getElementById('knob');
    var btnA = doc.getElementById('btnA'), btnB = doc.getElementById('btnB');
    if (stick && stick.addEventListener) {
      var id = null, cx = 0, cy = 0, R = 44;
      var start = function (e) {
        var r = stick.getBoundingClientRect ? stick.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        id = e.pointerId; move(e);
        if (stick.setPointerCapture) stick.setPointerCapture(id);
        if (e.preventDefault) e.preventDefault();
      };
      var move = function (e) {
        if (id === null) return;
        var dx = e.clientX - cx, dy = e.clientY - cy;
        var len = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(1, len / R);
        touchVec.x = (dx / len) * k; touchVec.y = (dy / len) * k;
        if (knob) knob.style.transform = 'translate(' + (touchVec.x * R) + 'px,' + (touchVec.y * R) + 'px)';
        if (e.preventDefault) e.preventDefault();
      };
      var end = function () {
        id = null; touchVec.x = 0; touchVec.y = 0;
        if (knob) knob.style.transform = 'translate(0,0)';
      };
      if (g.PointerEvent) {
        stick.addEventListener('pointerdown', start);
        stick.addEventListener('pointermove', move);
        stick.addEventListener('pointerup', end);
        stick.addEventListener('pointercancel', end);
        stick.addEventListener('pointerleave', end);
      } else {
        // 구형 태블릿(iOS 12 등)엔 PointerEvent가 없다 — TouchEvent로 같은 동작.
        var wrapTouch = function (fn) {
          return function (e) {
            var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
            if (t) fn({ pointerId: 1, clientX: t.clientX, clientY: t.clientY, preventDefault: function () { e.preventDefault(); } });
            else fn({ pointerId: 1, clientX: cx, clientY: cy, preventDefault: function () { e.preventDefault(); } });
          };
        };
        stick.addEventListener('touchstart', wrapTouch(start), { passive: false });
        stick.addEventListener('touchmove', wrapTouch(move), { passive: false });
        stick.addEventListener('touchend', end);
        stick.addEventListener('touchcancel', end);
      }
    }
    var hook = function (el, key) {
      if (!el || !el.addEventListener) return;
      var on = function (e) {
        if (g.SFX) g.SFX.unlock();
        if (!keys[key]) edge[key] = true;
        keys[key] = true;
        if (e.preventDefault) e.preventDefault();
      };
      var off = function () { keys[key] = false; };
      if (g.PointerEvent) {
        el.addEventListener('pointerdown', on);
        el.addEventListener('pointerup', off);
        el.addEventListener('pointercancel', off);
        el.addEventListener('pointerleave', off);
      } else {
        el.addEventListener('touchstart', on, { passive: false });
        el.addEventListener('touchend', off);
        el.addEventListener('touchcancel', off);
      }
    };
    hook(btnA, 'ok'); hook(btnB, 'no');
  }

  // ── 시작 ────────────────────────────────────────────────────────────────
  function start() {
    var doc = g.document;
    cv = doc && doc.getElementById ? doc.getElementById('game') : null;
    ctx = cv && cv.getContext ? cv.getContext('2d') : null;
    // 캔버스를 못 얻으면(구형 브라우저·렌더 차단) 검은 화면 대신 안내를 띄운다.
    if (!ctx) {
      var fb = doc && doc.getElementById ? doc.getElementById('fallback') : null;
      if (fb && fb.style) fb.style.display = 'flex';
      return;
    }
    ctx.imageSmoothingEnabled = false; ctx.textBaseline = 'alphabetic';
    S = blankState(); S.mode = 'load';
    g.addEventListener('keydown', onKeyDown);
    g.addEventListener('keyup', onKeyUp);
    if (doc.addEventListener) {
      doc.addEventListener('visibilitychange', function () { if (doc.hidden) pause(); });
    }
    bindTouch();
    bindCanvasTap();
    A.load(A.SHEETS, function () { S.mode = 'title'; });
    last = 0;
    raf = g.requestAnimationFrame(loop);
  }

  g.GAME = {
    VERSION: VERSION,
    start: start, newGame: newGame, enterMap: enterMap,
    save: save, load: load, hasSave: hasSave, clearSave: clearSave,
    state: function () { return S; },
    setState: function (v) { S = v; },
    blankState: blankState,
    heldIds: heldIds, playerTile: playerTile, wallOffset: wallOffset,
    solidAt: solidAt, BOX: BOX, keys: keys,
    // 3층 검사용 — 안개 칸·소문 처리 여부를 밖에서 확인한다
    fogCells: function (name) { return (S && S.fog && S.fog[name]) || []; },
    rumorsDone: function () { return !!S && rumorsDone(); },
    // 4층 검사용 — 열린 유리문 칸·액자 완료 여부·서랍 개방을 밖에서 확인한다
    openedCells: function (name) { return (S && S.opened && S.opened[name]) || []; },
    framesDone: function () { return !!S && framesAllDone(); },
    drawerOpen: function () { return !!S && drawerOpen(); },
    // 5층 검사용 — 장치 개방·의존 감속·반짝임 표시를 밖에서 확인한다
    lockOpen: lockOpen, moveSpeed: moveSpeed, glintOn: glintOn, SPEED: SPEED,
    promiseIds: promiseIds, promiseDef: promiseDef,
    // 교사 도구 검사용 — 화면 상태·리포트·해석 규칙·차시 시작을 밖에서 확인한다
    teacherUi: function () { return teacher; },
    teacherReport: readReport, teacherHint: reportHint,
    teacherTap: canvasTap, TBTN: TBTN,
    pause: pause,
    press: function (k) { if (!keys[k]) edge[k] = true; keys[k] = true; },
    release: function (k) { keys[k] = false; }
  };
})(typeof window !== 'undefined' ? window : this);
