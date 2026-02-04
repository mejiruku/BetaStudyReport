const CACHE_NAME = 'StudyReport-v1'; // バージョン管理を
const urlsToCache = [
    './',              // index.html
    './index.html',
    './js/manifest.json',
    './css/style.css',     // CSSファイル
    './js/script.js',     // JSファイル
    './assets/logo.png' // 画像
];

// インストール時にキャッシュする
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(function(cache) {
            console.log('Opened cache');
            // addAllでエラーが起きても原因がわかるように
            return cache.addAll(urlsToCache).catch(err => {
                console.error('キャッシュの登録に失敗しました。ファイル名やパスを確認してください:', err);
            });
        })
    );
});
