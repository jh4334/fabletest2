// 게임 샌드박스 부트스트랩 공용 모듈 — shots.js와 onboarding-shots.js가 공유한다.
// node-canvas 위에 DOM/브라우저 스텁을 깔고 src 4파일을 vm으로 로드하는 하네스가
// 두 스크립트에 복제되어 있으면, 게임이 새 브라우저 API를 쓰기 시작할 때 한쪽만
// 고쳐져 다른 쪽이 로드 시점에 죽는다 — 스텁의 단일 출처를 여기로 모은다.
//
// 사용:
//   const { createGameSandbox, v3Flags } = require('./lib/game-sandbox');
//   const env = createGameSandbox();
//   env.storage.set(...);   // 시드는 반드시 boot() 전에 (게임이 로드 시 읽는다)
//   const g = env.boot();
//   env.tap('z'); env.shot('01-title.png'); ...
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas } = require('canvas');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'shots');

// 타이틀/수첩을 보기 좋게 채우는 공용 세이브 픽스처(v3 스키마 — migrateSlotV3 경로 검증 겸용)
function v3Flags(extra) {
  return Object.assign({
    talkedProf: true, bandiJoined: true, bandiRevealed: false, bandiSaid: {},
    defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: false,
      yuhokmon: false, hollimmon: false, finalboss: false, yeongi: false },
    mercyChoice: { bekkyeomon: 'mercy' },
    chapter1Clear: true, chapter1Mercy: true,
    chapter2Clear: true, chapter2Mercy: false,
    mercy: 3, visited: {}, trueEnding: false, correctCount: 52, battleCount: 9,
    evCards: ['ev_maker', 'ev_minimal', 'ev_footprint'], endingId: null,
  }, extra || {});
}

function createGameSandbox() {
  const mainCanvas = createCanvas(720, 528);
  mainCanvas.addEventListener = () => {};
  mainCanvas.removeEventListener = () => {};
  mainCanvas.focus = () => {};
  mainCanvas.blur = () => {};
  mainCanvas.setAttribute = () => {};
  mainCanvas.style = mainCanvas.style || {};
  function stubEl() {
    return { style: {}, value: '', addEventListener() {}, removeEventListener() {},
      focus() {}, blur() {}, classList: { add() {}, remove() {} } };
  }
  const listeners = {};
  let rafCb = null;
  const storage = new Map();

  const windowObj = {
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => { rafCb = cb; },
  };
  const sandbox = {
    window: windowObj,
    document: {
      getElementById: (id) => (id === 'game' ? mainCanvas : stubEl()),
      createElement: () => createCanvas(16, 16),
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    requestAnimationFrame: windowObj.requestAnimationFrame,
    console, Math, Set, Map, JSON, Object, setTimeout, clearTimeout, Date,
  };
  vm.createContext(sandbox);

  const env = {
    ROOT, OUT, mainCanvas, listeners, storage, windowObj, sandbox,
    g: null,
    // src 4파일 로드 — storage 시드가 끝난 뒤에 호출해야 한다(게임이 로드 시 읽는다)
    boot() {
      for (const f of ['src/sprites.js', 'src/audio.js', 'src/data.js', 'src/game.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
      }
      env.g = windowObj.__game;
      return env.g;
    },
    // 샌드박스 안에서 표현식 평가 (예: env.run('({QUIZZES})'))
    run(code) { return vm.runInContext(code, sandbox); },
    step(n = 1) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; cb(); } },
    dispatch(ev, obj) { for (const fn of (listeners[ev] || []).slice()) fn(Object.assign({ preventDefault() {} }, obj)); },
    tap(key) { env.dispatch('keydown', { key }); env.step(2); env.dispatch('keyup', { key }); },
    advanceDialog(max = 100) { for (let i = 0; i < max && env.g.mode === 'dialog'; i++) env.tap('z'); },
    shot(name) {
      env.step(1);
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, name), mainCanvas.toBuffer('image/png'));
      console.log('  saved shots/' + name);
    },
    setPlayer(x, y, dir) {
      const p = env.g.player;
      p.x = x; p.y = y; p.px = x * 48; p.py = y * 48; p.dir = dir || 'down';
    },
  };
  return env;
}

module.exports = { createGameSandbox, v3Flags, ROOT };
