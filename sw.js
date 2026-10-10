/* Dailo service worker (V1.9): serves the app shell offline from a versioned cache.
   Bump VERSION together with APP_VERSION in js/release.js on every release (tests enforce it):
   a changed sw.js is how installed apps learn about a new version. */
'use strict';

const VERSION = '2.0.0-alpha.15';
const CACHE_PREFIX = 'dailo-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
// Every runtime file index.html, its stylesheets and the manifest reference (tests keep this complete).
const SHELL_FILES = [
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'vendor/jszip.min.js',
  'vendor/capacitor/capacitor.js',
  'vendor/fonts/fonts.css',
  'vendor/fonts/geist-latin-wght-normal.woff2',
  'vendor/fonts/geist-latin-ext-wght-normal.woff2',
  'vendor/fonts/space-grotesk-latin-wght-normal.woff2',
  'vendor/fonts/space-grotesk-latin-ext-wght-normal.woff2',
  'vendor/phosphor/regular.css',
  'vendor/phosphor/Phosphor.woff2',
  'vendor/phosphor/fill.css',
  'vendor/phosphor/Phosphor-Fill.woff2',
  'js/release.js',
  'js/i18n.js',
  'js/i18n-sr.js',
  'js/core.js',
  'js/storage.js',
  'js/attachments.js',
  'js/backup.js',
  'js/sync-config.js',
  'js/sync.js',
  'js/platform.js',
  'js/domain-modules.js',
  'js/knowledge.js',
  'js/goals-ui.js',
  'js/habits-ui.js',
  'js/saved-views-ui.js',
  'js/projects-ui.js',
  'js/areas-ui.js',
  'js/settings-ui.js',
  'js/templates-ui.js',
  'js/calendar-ui.js',
  'js/tasks-ui.js',
  'js/cleaning-ui.js',
  'js/review-ui.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

const scopeUrl = file => new URL(file, self.registration.scope).href;
const SHELL_URLS = new Set(SHELL_FILES.map(scopeUrl));
// Only the app itself falls back to the cached page; docs and downloads under the scope stay online.
const APP_PAGES = new Set([scopeUrl('./'), scopeUrl('index.html')]);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// A new version waits until the page asks for it after the user chooses to refresh.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  url.search = '';
  url.hash = '';
  if (request.mode === 'navigate') {
    if (!APP_PAGES.has(url.href)) return;
    event.respondWith(caches.match(scopeUrl('index.html')).then(cached => cached || fetch(request)));
    return;
  }
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith(caches.match(url.href).then(cached => cached || fetch(request)));
});
