/* Service worker da Escala das Carretas.
   - Guarda SÓ arquivos do próprio site (telas, estilos, fontes, ícones e bibliotecas), para abrir rápido.
   - NUNCA guarda nada do Supabase (login, médicos, escalas): esses pedidos vão direto para a rede.
   - Rede primeiro: com internet, sempre usa a versão publicada mais nova; a cópia só é usada sem conexão. */
'use strict';
const CACHE = 'escala-app-v13';

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './manifest.webmanifest', './assets/icone-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(n => Promise.all(n.filter(x => x.startsWith('escala-app-') && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', ev => {
  const req = ev.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch(req);
      if (resp.ok && resp.type === 'basic') cache.put(req, resp.clone());
      return resp;
    } catch (_) {
      const salvo = await cache.match(req) || (req.mode === 'navigate' ? await cache.match('./') : undefined);
      return salvo || new Response('Sem conexão.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
