/**
 * Subly Service Worker
 * バージョン: v1.0.0
 * 役割: オフライン対応 + キャッシュ管理
 */

const CACHE_NAME = 'subly-cache-v1';
const RUNTIME_CACHE = 'subly-runtime-v1';

// プリキャッシュするファイル(アプリの基本)
const PRECACHE_URLS = [
  '/',
  '/index.html'
];

// インストール時: 主要ファイルをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install failed:', err))
  );
});

// アクティベート時: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ時: キャッシュ戦略を適用
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Firebase / Stripe / GA など外部APIはキャッシュしない(常に最新)
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebaseapp.com') ||
    event.request.method !== 'GET'
  ) {
    return; // デフォルトのfetch動作
  }

  // 同一オリジンのリソース: Network First (新鮮さ優先、フォールバックでキャッシュ)
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 成功したらキャッシュに保存
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // ネットワーク失敗時はキャッシュから返す
          return caches.match(event.request).then(cached => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // CDN/フォント等の外部リソース: Cache First (高速化優先)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => cached);
    })
  );
});

console.log('[SW] Subly Service Worker loaded');