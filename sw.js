// 오프라인 서비스워커 — 방과 후: 그림자 학교
// 처음 방문에서 전부 캐시해 교실 와이파이가 끊겨도 수업이 계속되게 한다.
// CACHE 해시는 npm run bump 가 자산에서 계산해 갱신한다(validate가 대조).
const CACHE = 'shadow-school-a2dfd762';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './src/art.js', './src/sound.js', './src/data.js', './src/engine.js',
  './assets/pack/char/student.png', './assets/pack/char/teacher_blue.png',
  './assets/pack/char/teacher_green.png', './assets/pack/char/drop_shadow.png',
  './assets/pack/map/interior_floor.png', './assets/pack/map/wall_simple.png',
  './assets/pack/props/crate.png', './assets/pack/props/heart.png', './assets/pack/props/pot.png',
  './icons/icon-192.png', './icons/icon-512.png',
  // 생성형 AI 에셋 (assets/ai/PROMPTS.md)
  './assets/ai/bg_f1.png', './assets/ai/bg_f2.png', './assets/ai/bg_f3.png',
  './assets/ai/bg_f4.png', './assets/ai/bg_f5.png', './assets/ai/bg_roof.png',
  './assets/ai/bg_title.png', './assets/ai/ch_artTeacher.png', './assets/ai/ch_bro.png',
  './assets/ai/ch_mate.png', './assets/ai/ch_senior.png', './assets/ai/ch_vice.png',
  './assets/ai/grounds.png', './assets/ai/props.png'
];

// 설치는 HTTP 캐시를 우회한다 — 배포 직후 브라우저 캐시의 구버전 자산이 새 캐시 이름으로
// 고착되는 것을 막는다.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});
// 같은 출처(GitHub Pages 등)의 다른 앱 캐시는 건드리지 않는다 — 우리 접두어의 옛 캐시만 지운다.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('shadow-school-') && k !== CACHE)
        .map((k) => caches.delete(k))))
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
