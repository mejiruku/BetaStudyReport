const CACHE_NAME = 'study-report-v1';
const urlsToCache = [
    './',
    'https://mejiruku.github.io/study-report/',
    './manifest.json'
];

// インストール時にキャッシュする
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(function(cache) {
            console.log('Opened cache');
            return cache.addAll(urlsToCache);
        })
    );
});

// リクエスト時にキャッシュから返す（オフライン対応）
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
        .then(function(response) {
            // キャッシュにあればそれを返す
            if (response) {
                return response;
            }
            // なければネットに取りに行く
            return fetch(event.request);
        })
    );
});