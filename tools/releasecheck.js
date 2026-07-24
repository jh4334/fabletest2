// v3 출시 후보 정합성 점검 — 코드·에셋·오프라인 캐시·16차시 문서가
// 서로 어긋나는 회귀를 한 번에 잡는다. 외부 패키지 없이 Node.js만 사용한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log('  ✔ ' + label);
    passed += 1;
  } else {
    console.error('  ✘ ' + label + (detail ? ' — ' + detail : ''));
    failed += 1;
  }
}

function pngInfo(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  const sig = '89504e470d0a1a0a';
  if (b.length < 26 || b.subarray(0, 8).toString('hex') !== sig) return null;
  return {
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    bitDepth: b[24],
    colorType: b[25],
    bytes: b.length,
  };
}

const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) },
  console, Math, Set, Map, JSON, Object };
vm.createContext(ctx);
for (const f of ['src/art.js', 'src/sprites.js', 'src/audio.js', 'src/data.js']) {
  vm.runInContext(read(f), ctx, { filename: f });
}
const { SONGS, QUIZZES } = vm.runInContext('({ SONGS, QUIZZES })', ctx);

console.log('[에셋]');
const artSrc = Array.from(read('src/art.js').matchAll(/load\('[^']+', '([^']+)'\)/g), (m) => m[1]);
const swAssets = vm.runInNewContext(
  read('sw.js').match(/const ASSETS = (\[[\s\S]*?\]);/)[1],
);
check('art.js 등록 자산이 모두 존재', artSrc.every((p) => fs.existsSync(path.join(ROOT, p))));
check('art.js 등록 자산이 오프라인 캐시에 모두 포함',
  artSrc.every((p) => swAssets.includes('./' + p)));
check('서비스워커 캐시 경로가 모두 존재',
  swAssets.filter((p) => p !== './').every((p) => fs.existsSync(path.join(ROOT, p.replace(/^\.\//, '')))));

const bossSheets = [
  'ttara', 'dama', 'giul', 'geureol', 'banjjak', 'lumi', 'goyo', 'yeongi',
].map((id) => `assets/art/${id}-expression-sheet.png`);
const bossInfo = bossSheets.map(pngInfo);
check('보스 표정 시트 8개', bossInfo.length === 8 && bossInfo.every(Boolean));
check('보스 표정 시트 크기 통일',
  bossInfo.every((p) => p.width === bossInfo[0].width && p.height === bossInfo[0].height),
  bossInfo.map((p) => p && `${p.width}x${p.height}`).join(', '));
check('보스 표정 시트 RGBA·고해상도',
  bossInfo.every((p) => p.colorType === 6 && p.width >= 512 && p.height >= 512));
const artBytes = artSrc.reduce((n, p) => n + fs.statSync(path.join(ROOT, p)).size, 0);
check('프리캐시 이미지 총량 5MB 이하', artBytes <= 5 * 1024 * 1024,
  `${(artBytes / 1024 / 1024).toFixed(2)}MB`);

console.log('[사운드]');
for (const name of ['boss_ttara', 'boss_dama', 'boss_giul', 'boss_geureol',
  'boss_banjjak', 'boss_lumi', 'boss_goyo', 'boss_yeongi']) {
  const song = SONGS[name];
  const mix = song && song.tracks.reduce((n, t) => n + t.vol, 0);
  check(`${name} 테마·안전 음량`, !!song && mix >= 0.14 && mix <= 0.32,
    mix == null ? '곡 없음' : `트랙 합 ${mix.toFixed(2)}`);
}

console.log('[16차시·교사 도구]');
const activities = read('docs/차시별-활동지.md');
const lessons = Array.from(activities.matchAll(/^## (\d+)차시 ·/gm), (m) => Number(m[1]));
check('활동지 1~16차시 연속 구성',
  lessons.length === 16 && lessons.every((n, i) => n === i + 1), lessons.join(','));
const crosswalk = read('docs/16차시-게임구간-대응표-v3.md');
check('16차시 대응표가 실제 플래그를 명시',
  ['defeated.bekkyeomon', 'chapter1Clear', 'chapter5Clear', 'goyoClear', 'endingId']
    .every((s) => crosswalk.includes(s)));
const game = read('src/game.js');
const topicBlock = (game.match(/const TOPIC_SESSION = \{([\s\S]*?)\n  \};/) || [])[1] || '';
const mappedTopics = new Set(Array.from(topicBlock.matchAll(/\b([a-z][a-z0-9_]*)\s*:/g), (m) => m[1]));
const quizTopics = Object.keys(QUIZZES);
check('모든 퀴즈 주제가 16차시 추천에 연결',
  quizTopics.every((t) => mappedTopics.has(t)),
  quizTopics.filter((t) => !mappedTopics.has(t)).join(', '));
check('수업 모드 프롤로그~파이널 7개 시작 함수',
  ['applyPrologueClass', 'applyTraceRoomClass', 'applyTiltStreetClass',
    'applyRumorStreetClass', 'applyArcadeClass', 'applyCozyhomeClass', 'applyFinalClass']
    .every((fn) => game.includes(`function ${fn}(`)));
check('프롤로그 사전·사후 점검 5문항 연결',
  game.includes("prologue: { n: 0") && game.includes("openPrepost('post', 'prologue'"));

console.log('[문서·출시]');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const gameVersion = (game.match(/const GAME_VERSION = '([^']+)'/) || [])[1];
const sw = read('sw.js');
const html = read('index.html');
check('앱·패키지·잠금파일 버전 일치',
  pkg.version === gameVersion && lock.version === pkg.version &&
  lock.packages && lock.packages[''] && lock.packages[''].version === pkg.version,
  `${gameVersion} / ${pkg.version} / ${lock.version}`);
check('Pages 핵심 HTML·JS 네트워크 우선 갱신',
  sw.includes('const isCore =') && sw.includes("fetch(e.request, { cache: 'no-store' })")
  && sw.includes("caches.match(e.request, { ignoreSearch: true })"));
check('서비스워커 등록이 HTTP 캐시를 우회해 매 접속 갱신',
  html.includes("register('sw.js', { updateViaCache: 'none' })")
  && html.includes('reg.update().catch(() => {})')
  && html.includes('hadServiceWorkerController && Date.now() - registrationStartedAt'));
check('v3 핵심 스크립트 캐시 식별자',
  ['art', 'sprites', 'audio', 'data', 'game']
    .every((name) => html.includes(`src="${`src/${name}.js?v=3.0.0-artpass`}"`)));
for (const p of [
  'docs/스토리-전면개편안-v3.md',
  'docs/개발-및-현장적용-계획안-v3.md',
  'docs/16차시-게임구간-대응표-v3.md',
  'docs/모의수업-및-파일럿-운영팩-v3.md',
  'docs/v3-출시후보-QA-리포트.md',
  'docs/개인정보-안내.md',
  'assets/ATTRIBUTION.md',
]) check(`${p} 존재`, fs.existsSync(path.join(ROOT, p)));
check('파일럿 결과는 실측 대기 상태로 표시',
  read('docs/모의수업-및-파일럿-운영팩-v3.md').includes('[추후 입력]'));
check('README가 프롤로그 포함 수업 모드를 안내',
  read('README.md').includes('프롤로그·1~5장·파이널'));

console.log(`\n출시 정합성: ${passed} 통과 / ${failed} 실패`);
process.exit(failed ? 1 : 0);
