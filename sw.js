// AI 윤리 어드벤처 — 오프라인 서비스워커
// 모든 정적 자원을 처음 방문 때 캐시해, 이후 네트워크 없이도 실행되게 한다.
// 핵심 HTML/JS는 온라인일 때 네트워크를 먼저 확인해 배포 직후 구버전이 남지 않게 한다.
// 게임 코드/콘텐츠가 바뀌면 CACHE 버전을 올리면 된다.
const CACHE = 'ai-ethics-adventure-71a8d49a';
const ASSETS = [
  './',
  './index.html',
  './src/art.js',
  './src/sprites.js',
  './src/audio.js',
  './src/data.js',
  './src/game.js',
  './assets/art/player-sheet.png',
  './assets/art/bandi-sheet.png',
  './assets/art/ttara-expression-sheet.png',
  './assets/art/dama-expression-sheet.png',
  './assets/art/giul-expression-sheet.png',
  './assets/art/geureol-expression-sheet.png',
  './assets/art/banjjak-expression-sheet.png',
  './assets/art/lumi-expression-sheet.png',
  './assets/art/goyo-expression-sheet.png',
  './assets/art/yeongi-expression-sheet.png',
  './assets/cc0/ninja-adventure/tileset_floor.png',
  './assets/cc0/ninja-adventure/tileset_village_abandoned.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function remember(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return response;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const isNav = e.request.mode === 'navigate';
  const url = new URL(e.request.url);
  const isLocal = url.origin === self.location.origin;
  const isCore = isLocal && (
    isNav
    || url.pathname.endsWith('/index.html')
    || /\/src\/[^/]+\.js$/.test(url.pathname)
    || url.pathname.endsWith('/manifest.webmanifest')
  );

  // HTML·게임 코드: 네트워크 우선. 배포 직후에는 최신 버전을, 오프라인에서는
  // 프리캐시를 돌려준다. 쿼리 버전이 붙어도 같은 오프라인 파일을 찾는다.
  if (isCore) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((res) => remember(e.request, res))
        .catch(() => caches.match(e.request, { ignoreSearch: true })
          .then((hit) => hit || (isNav ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  // 이미지·아이콘: 캐시 우선. 없으면 네트워크에서 받아 캐시한다.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => remember(e.request, res)).catch(() => undefined);
    })
  );
});
