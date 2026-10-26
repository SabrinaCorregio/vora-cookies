// Service worker: deixa o app abrir sem internet e guarda uma cópia dos arquivos.
// Sempre que publicar uma versão nova do app, troque o número abaixo (v1 -> v2...).
const VERSAO = 'v2';
const CACHE = 'vora-' + VERSAO;
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest', './favicon.png',
  './css/style.css', './js/main.js', './js/app.js', './js/platform.js',
  './js/firebase-adapter.js', './js/firebase-config.js',
  './icons/logo.png', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('vora-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function deveCuidar(url) {
  if (url.origin === self.location.origin) return true;
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) return true;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return true;
  return false; // chamadas do Firebase (banco e login) passam direto
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!deveCuidar(url)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
