// 오프라인 서비스워커 — 방과 후: 그림자 학교
// 처음 방문에서 전부 캐시해 교실 와이파이가 끊겨도 수업이 계속되게 한다.
// CACHE 해시는 npm run bump 가 자산에서 계산해 갱신한다(validate가 대조).
const CACHE = 'shadow-school-391021eb';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './src/art.js', './src/sound.js', './src/data.js', './src/engine.js',
  './assets/pack/char/student.png', './assets/pack/char/teacher_blue.png',
  './assets/pack/char/teacher_green.png', './assets/pack/char/drop_shadow.png',
  './assets/pack/map/interior_floor.png', './assets/pack/map/wall_simple.png',
  './assets/pack/map/floor.png', './assets/pack/map/village_abandoned.png',
  './assets/pack/map/animated.png',
  './assets/pack/props/crate.png', './assets/pack/props/heart.png', './assets/pack/props/pot.png',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const isNav = e.request.mode === 'navigate';
  e.respondWith(
    caches.match(e.request, { ignoreSearch: isNav }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // 오프라인 + 캐시 미스: 문서 요청이면 캐시된 본문으로라도 연다
        if (isNav) return caches.match('./index.html');
        return undefined;
      });
    })
  );
});
