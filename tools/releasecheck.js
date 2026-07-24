// v6 출시 후보 정합성 점검 — 코드·에셋·오프라인 캐시·16차시 문서가
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
const artCode = read('src/art.js');
const artSrc = Array.from(artCode.matchAll(/load\('[^']+', '([^']+)'\)/g), (m) => m[1]);
const swAssets = vm.runInNewContext(
  read('sw.js').match(/const ASSETS = (\[[\s\S]*?\]);/)[1],
);
check('art.js 등록 자산이 모두 존재', artSrc.every((p) => fs.existsSync(path.join(ROOT, p))));
check('art.js 등록 자산이 오프라인 캐시에 모두 포함',
  artSrc.every((p) => swAssets.includes('./' + p)));
check('서비스워커 캐시 경로가 모두 존재',
  swAssets.filter((p) => p !== './').every((p) => fs.existsSync(path.join(ROOT, p.replace(/^\.\//, '')))));

const castSheets = [
  'assets/art/postal-courier-atlas.png',
  'assets/art/postal-cast-main.png',
  'assets/art/postal-cast-support.png',
];
const mapTextures = [
  'postal-central-hall', 'postal-permission-market', 'postal-one-sided-terminal',
  'postal-rumor-press', 'postal-prize-dispatch', 'postal-waiting-lounge',
  'postal-silent-route', 'postal-sender-chamber',
].map((id) => `assets/art/maps/${id}.png`);
const castInfo = castSheets.map(pngInfo);
check('v6 캐릭터 아틀라스 3개', castInfo.length === 3 && castInfo.every(Boolean));
check('v6 캐릭터 아틀라스 투명 PNG·고해상도',
  castInfo.every((p) => [3, 6].includes(p.colorType) && p.width >= 1000 && p.height >= 1000));
check('v6 우체국 전용 맵 원화 8개',
  mapTextures.every((p) => fs.existsSync(path.join(ROOT, p)) && artSrc.includes(p))
  && mapTextures.every((p) => swAssets.includes('./' + p)));
check('구 런타임 이미지가 자산 폴더에서 완전히 제거됨',
  !fs.existsSync(path.join(ROOT, 'assets/cc0'))
  && !fs.existsSync(path.join(ROOT, 'assets/art/player-sheet.png'))
  && !fs.existsSync(path.join(ROOT, 'assets/art/maps/v5-project-zero-archive.png')));
check('모든 맵이 새 우체국 배경을 사용하고 구 장식은 폴백에서만 그림',
  artCode.includes("postal_sender: new Set(['coreroom'])")
  && read('src/game.js').includes('if (!usedBackdrop) drawVillageAssetDetails')
  && read('src/game.js').includes('if (!usedBackdrop) {'));
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
check('미결 우체국의 여섯 답장 권리 스토리 축',
  game.includes('【미결 우체국 · 야간 반송 우편실】')
  && game.includes('【반송 기록 06 — 답장하지 않기】')
  && game.includes('끝내 배달되지 못한 한 통의 편지')
  && game.includes('답장이 없어도 기다릴게'));

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
check('v6 핵심 스크립트 캐시 식별자',
  ['art', 'sprites', 'audio', 'data', 'game']
    .every((name) => html.includes(`src="${`src/${name}.js?v=6.0.0-postal-clean`}"`)));
check('시작 화면에 v6 버전·에셋/스토리 전면 교체를 명시',
  html.includes('id="version-gate"')
  && html.includes('VERSION 6.0')
  && html.includes('ALL ASSETS &amp; STORY REPLACED')
  && html.includes('V6-20260724-CLEAN'));
check('v6 주인공 정체와 여섯 권리 오프닝',
  game.includes('발신인도 수신인도 없는 미결 편지')
  && game.includes('나래가 직접 답할지 기다리는 거야')
  && read('src/data.js').includes("name: '미결 우체국 · 중앙홀'"));
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
