/* ============================================================
   FORO UBRE — NOTIFICACIONES + WEB PUSH
   ============================================================ */
(() => {
  const API = "/api";
  const token = localStorage.getItem("fu_token");
  const usuario = JSON.parse(localStorage.getItem("fu_usuario") || "null");

  if (!token || !usuario) return;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  });

  const esc = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const avatar = (u) => {
    if (u?.avatarTipo === "video") {
      return `<video class="notification-avatar" src="${esc(u.avatar || "")}" autoplay muted loop playsinline></video>`;
    }
    return `<img class="notification-avatar" src="${esc(u?.avatar || "https://api.dicebear.com/7.x/thumbs/svg?seed=default")}" alt="" loading="lazy">`;
  };

  const timeAgo = (date) => {
    const diff = Math.max(0, Date.now() - new Date(date).getTime());
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "ahora";
    const min = Math.floor(sec / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    return new Date(date).toLocaleDateString("es-MX", { day:"numeric", month:"short" });
  };

  const icon = {
    mensaje: "ri-message-3-fill",
    follow: "ri-user-follow-fill",
    like: "ri-heart-fill",
    comentario: "ri-chat-3-fill",
    like_comentario: "ri-heart-2-fill"
  };

  let panel;
  let list;
  let badge;
  let socket;
  let pushStatus = null;

  function findNav() {
    return document.querySelector("aside .main-nav") ||
           document.querySelector("aside nav") ||
           document.querySelector(".main-nav");
  }

  function buildUI() {
    if (document.getElementById("notificationNavButton")) return;

    const nav = findNav();
    if (!nav) return;

    const button = document.createElement("a");
    button.href = "#";
    button.id = "notificationNavButton";
    button.className = "nav-item notification-nav";
    button.innerHTML = `
      <span class="nav-icon"><i class="ri-notification-3-line"></i></span>
      <span>Notificaciones</span>
      <span class="notification-badge hidden" id="notificationBadge">0</span>
    `;

    button.addEventListener("click", (e) => {
      e.preventDefault();
      togglePanel();
    });

    nav.appendChild(button);
    badge = button.querySelector("#notificationBadge");

    panel = document.createElement("section");
    panel.id = "notificationsPanel";
    panel.className = "notifications-panel";
    panel.innerHTML = `
      <header class="notifications-header">
        <div class="notifications-title">
          <i class="ri-notification-3-fill"></i>
          <span>Notificaciones</span>
        </div>
        <button class="notifications-readall" id="notificationsReadAll">Leer todo</button>
      </header>
      <div class="notifications-push" id="notificationsPushBox">
        <div class="notification-icon"><i class="ri-smartphone-line"></i></div>
        <div class="notifications-push-copy">
          <strong>Notificaciones del teléfono</strong>
          <span id="notificationsPushText">Actívalas para recibir avisos aunque cierres Foro Ubre.</span>
        </div>
        <button class="notifications-push-btn" id="notificationsPushBtn">Activar</button>
      </div>
      <div class="notifications-list" id="notificationsList">
        <div class="notifications-empty"><i class="ri-loader-4-line ri-spin"></i>Cargando...</div>
      </div>
    `;

    document.body.appendChild(panel);
    list = panel.querySelector("#notificationsList");

    panel.querySelector("#notificationsReadAll").addEventListener("click", async () => {
      await fetch(`${API}/notifications/read-all`, {
        method: "PUT",
        headers: authHeaders()
      });
      document.querySelectorAll(".notification-item.unread").forEach(el => el.classList.remove("unread"));
      updateCount(0);
    });

    panel.querySelector("#notificationsPushBtn").addEventListener("click", activarPush);

    document.addEventListener("click", (e) => {
      if (!panel?.classList.contains("open")) return;
      if (!panel.contains(e.target) && !document.getElementById("notificationNavButton")?.contains(e.target)) {
        panel.classList.remove("open");
      }
    });
  }

  function togglePanel() {
    if (!panel) return;
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      cargarNotificaciones();
      cargarPushStatus();
    }
  }

  function updateCount(count) {
    if (!badge) return;
    const n = Number(count) || 0;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("hidden", n <= 0);
  }

  async function cargarCount() {
    try {
      const res = await fetch(`${API}/notifications/count`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      updateCount(data.count);
    } catch {}
  }

  async function cargarNotificaciones() {
    if (!list) return;

    try {
      const res = await fetch(`${API}/notifications?limite=30`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (!data.length) {
        list.innerHTML = `
          <div class="notifications-empty">
            <i class="ri-notification-off-line"></i>
            No tienes notificaciones todavía.
          </div>`;
        return;
      }

      list.innerHTML = data.map(renderNotification).join("");
      list.querySelectorAll(".notification-item").forEach(el => {
        el.addEventListener("click", () => abrirNotificacion(el.dataset.id, el.dataset.url));
      });
    } catch {
      list.innerHTML = `<div class="notifications-empty"><i class="ri-error-warning-line"></i>No se pudieron cargar.</div>`;
    }
  }

  function renderNotification(n) {
    const u = n.emisor || {};
    const texto = n.tipo === "mensaje"
      ? `<strong>${esc(u.nombre || "Alguien")}</strong> te envió un mensaje`
      : n.tipo === "follow"
        ? `<strong>${esc(u.nombre || "Alguien")}</strong> empezó a seguirte`
        : n.tipo === "like"
          ? `<strong>${esc(u.nombre || "Alguien")}</strong> le dio me gusta a tu publicación`
          : n.tipo === "comentario"
            ? `<strong>${esc(u.nombre || "Alguien")}</strong> comentó en tu publicación`
            : `<strong>${esc(u.nombre || "Alguien")}</strong> le dio me gusta a tu comentario`;

    return `
      <article class="notification-item ${n.leida ? "" : "unread"}"
               data-id="${esc(n._id)}"
               data-url="${esc(n.url || "/")}">
        ${avatar(u)}
        <div class="notification-content">
          <div class="notification-text">${texto}</div>
          ${n.tipo === "comentario" && n.texto ? `<div style="margin-top:4px;color:#92979e;font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">“${esc(n.texto)}”</div>` : ""}
          <div class="notification-time">${timeAgo(n.createdAt)}</div>
        </div>
        <div class="notification-icon"><i class="${icon[n.tipo] || "ri-notification-3-fill"}"></i></div>
      </article>`;
  }

  async function abrirNotificacion(id, url) {
    try {
      await fetch(`${API}/notifications/${encodeURIComponent(id)}/read`, {
        method: "PUT",
        headers: authHeaders()
      });
    } catch {}

    if (url) window.location.href = url;
    else panel?.classList.remove("open");
    cargarCount();
  }

  function showToast(n) {
    const old = document.querySelector(".notification-toast");
    old?.remove();

    const u = n.emisor || {};
    const toast = document.createElement("div");
    toast.className = "notification-toast";
    toast.innerHTML = `
      <div class="notification-toast-icon"><i class="${icon[n.tipo] || "ri-notification-3-fill"}"></i></div>
      <div class="notification-toast-copy">
        <strong>${esc(u.nombre || "Foro Ubre")}</strong>
        <span>${esc(n.texto || "Tienes una nueva notificación")}</span>
      </div>`;

    toast.onclick = () => {
      toast.remove();
      abrirNotificacion(n._id, n.url);
    };

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  function connectSocket() {
    const registerSocket = () => {
      if (!socket) return;

      const registrar = () => {
        if (usuario?._id) socket.emit("registrar", usuario._id);
      };

      // Evita listeners duplicados si la página vuelve a inicializarse.
      socket.off("nuevaNotificacion");
      socket.off("connect", registrar);

      socket.on("nuevaNotificacion", (notification) => {
        if (!notification?._id) return;

        // Si el panel está abierto, insertamos la nueva notificación
        // inmediatamente sin esperar a otra petición HTTP.
        insertarNotificacionEnVivo(notification);
        cargarCount();
        showToast(notification);
      });

      socket.on("connect", registrar);
      registrar();
    };

    if (window.foroNotificationSocket) {
      socket = window.foroNotificationSocket;
      registerSocket();
      return;
    }

    const iniciar = () => {
      if (typeof window.io !== "function") return;
      socket = window.io({
        transports: ["websocket", "polling"],
        withCredentials: false
      });
      window.foroNotificationSocket = socket;
      registerSocket();
    };

    if (typeof window.io === "function") {
      iniciar();
      return;
    }

    const existing = document.querySelector('script[src*="socket.io.js"]');
    if (existing) {
      existing.addEventListener("load", iniciar, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.async = true;
    script.onload = iniciar;
    script.onerror = () => console.warn("No se pudo cargar Socket.IO");
    document.head.appendChild(script);
  }

  function insertarNotificacionEnVivo(n) {
    if (!list || !n?._id) return;

    // Evitar duplicados si el usuario recibió el evento y luego recargó el panel.
    if (list.querySelector(`[data-id="${CSS.escape(String(n._id))}"]`)) return;

    const empty = list.querySelector(".notifications-empty");
    if (empty) list.innerHTML = "";

    const html = renderNotification(n);
    list.insertAdjacentHTML("afterbegin", html);

    const item = list.querySelector(`[data-id="${CSS.escape(String(n._id))}"]`);
    item?.addEventListener("click", () => abrirNotificacion(item.dataset.id, item.dataset.url));

    // Mantener el panel ligero aunque lleguen muchas notificaciones seguidas.
    const items = list.querySelectorAll(".notification-item");
    items.forEach((el, index) => {
      if (index >= 30) el.remove();
    });
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  }

  async function cargarPushStatus() {
    const btn = document.getElementById("notificationsPushBtn");
    const text = document.getElementById("notificationsPushText");
    if (!btn || !text) return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      btn.style.display = "none";
      text.textContent = "Este navegador no admite Web Push.";
      return;
    }

    if (Notification.permission === "denied") {
      btn.textContent = "Bloqueadas";
      btn.disabled = true;
      text.textContent = "Las notificaciones están bloqueadas en los permisos del navegador.";
      return;
    }

    try {
      const res = await fetch(`${API}/push/status`, { headers: authHeaders() });
      pushStatus = await res.json();
      if (pushStatus.suscrito) {
        btn.textContent = "Activadas";
        btn.disabled = true;
        text.textContent = "Este dispositivo recibirá avisos aunque Foro Ubre esté cerrado.";
      } else {
        btn.textContent = "Activar";
        btn.disabled = false;
      }
    } catch {}
  }

  async function activarPush() {
    const btn = document.getElementById("notificationsPushBtn");
    const text = document.getElementById("notificationsPushText");
    if (!btn || !text) return;

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("Este navegador no admite notificaciones Push.");
      }

      btn.disabled = true;
      btn.textContent = "...";

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        btn.disabled = false;
        btn.textContent = "Activar";
        text.textContent = "Necesitas permitir las notificaciones en el navegador.";
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const keyRes = await fetch(`${API}/push/vapid-public-key`, {
        headers: authHeaders()
      });
      const keyData = await keyRes.json();
      if (!keyRes.ok || !keyData.publicKey) throw new Error(keyData.mensaje || "Falta VAPID_PUBLIC_KEY");

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        });
      }

      const subJson = subscription.toJSON();
      const saveRes = await fetch(`${API}/push/subscribe`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(subJson)
      });

      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saveData.mensaje || "No se pudo guardar la suscripción.");

      btn.textContent = "Activadas";
      text.textContent = "Listo. Este dispositivo recibirá avisos aunque cierres Foro Ubre.";
      pushStatus = { suscrito: true };
    } catch (error) {
      console.error("Push:", error);
      btn.disabled = false;
      btn.textContent = "Reintentar";
      text.textContent = error.message || "No se pudieron activar las notificaciones.";
    }
  }

  function init() {
    buildUI();
    cargarCount();
    connectSocket();

    // Registrar el service worker sin pedir permiso todavía.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
