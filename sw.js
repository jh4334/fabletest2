// AI 윤리 어드벤처 — 오프라인 서비스워커
// 모든 정적 자원을 처음 방문 때 캐시해, 이후 네트워크 없이도 실행되게 한다.
// 게임 코드/콘텐츠가 바뀌면 CACHE 버전을 올리면 된다.
const CACHE = 'ai-ethics-adventure-v21';
const ASSETS = [
  './',
  './index.html',
  './src/sprites.js',
  './src/audio.js',
  './src/data.js',
  './src/game.js',
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

// 캐시 우선(cache-first): 빠르고 오프라인에서도 동작. 없으면 네트워크에서 받아 캐시.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
