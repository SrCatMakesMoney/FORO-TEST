/*
 * FORO UBRE — SERVICE WORKER DESACTIVADO
 *
 * El proyecto usa Pusher para tiempo real.
 * Este archivo se conserva únicamente para retirar service workers
 * antiguos que todavía pudieran estar registrados en un dispositivo.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      await self.registration.unregister();
    } catch {}

    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    } catch {}

    try {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        client.postMessage({ type: "FORO_UBRE_PUSH_DISABLED" });
      }
    } catch {}
  })());
});
