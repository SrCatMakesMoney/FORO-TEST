/* ============================================================
   FORO UBRE — SERVICE WORKER DE NOTIFICACIONES PUSH
   ============================================================ */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "Foro Ubre",
      body: event.data?.text() || "Tienes una nueva notificación."
    };
  }

  const title = data.title || "Foro Ubre";
  const options = {
    body: data.body || "Tienes una nueva notificación.",
    icon: data.icon || "/generated-icon.png",
    badge: data.badge || "/generated-icon.png",
    tag: data.tag || "foro-ubre-notificacion",
    renotify: true,
    vibrate: [120, 60, 120],
    data: {
      url: data.url || "/",
      notificationId: data.notificationId || null
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if ("navigate" in client && client.url !== targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
