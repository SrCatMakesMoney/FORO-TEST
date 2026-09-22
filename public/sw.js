/* ============================================================
   FORO UBRE — SERVICE WORKER DESACTIVADO
   Pusher maneja las notificaciones realtime dentro de la página.
   Este archivo queda como no-op para neutralizar instalaciones
   antiguas de Web Push que todavía puedan existir en el navegador.
   ============================================================ */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Intencionalmente no se llama a showNotification().
self.addEventListener("push", (event) => {
  // Consumir eventos antiguos sin mostrar una notificación del sistema.
  event.waitUntil(Promise.resolve());
});

self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();
});
