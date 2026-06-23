const CACHE_NAME = 'chocalho-v1';

// Recursos essenciais para cache (shell do app)
const SHELL_ASSETS = [
  '/',
  '/index.html',
];

// Instala o SW e faz cache do shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Ativa e limpa caches antigos
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Estratégia: Network First (sempre tenta buscar novo, cai no cache se offline)
// Recursos do Firebase, Cloudinary e APIs externas nunca são cacheados
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Não cacheia requisições do Firebase, Cloudinary, APIs externas
  const externalDomains = [
    'firebaseio.com',
    'googleapis.com',
    'cloudinary.com',
    'anthropic.com',
    'slack.com',
    'microsoft.com',
    'google.com',
    'emailjs.com',
    'awesomeapi.com.br',
    'script.google.com',
    'vercel.app',
  ];

  const isExternal = externalDomains.some(d => url.hostname.includes(d));
  if (isExternal) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para o shell do app: Network First com fallback pro cache
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Atualiza o cache com a versão mais nova
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        // Offline: serve do cache
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/index.html');
        });
      })
  );
});
