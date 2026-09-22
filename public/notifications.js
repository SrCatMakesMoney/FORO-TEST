/* ============================================================
   FORO UBRE — NOTIFICACIONES EN TIEMPO REAL
   Pusher + panel interno + toast aislado.
   Web Push nativo NO se registra desde este archivo.
   ============================================================ */
(() => {
  const API = "/api";
  const token = localStorage.getItem("fu_token");
  const usuario = JSON.parse(localStorage.getItem("fu_usuario") || "null");

  if (!token || !usuario?._id) return;

  // Retira service workers y suscripciones Web Push antiguas.
  // Esto evita que una instalación vieja siga mostrando avisos nativos.
  async function limpiarWebPushAntiguo() {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        try {
          const subscription = await registration.pushManager?.getSubscription();
          if (subscription) {
            try {
              await fetch(`${API}/push/subscribe`, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ endpoint: subscription.endpoint })
              });
            } catch {}
            try { await subscription.unsubscribe(); } catch {}
          }
        } catch {}
        try { await registration.unregister(); } catch {}
      }
    } catch {}
  }

  limpiarWebPushAntiguo();

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
    return new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  };

  const icon = {
    mensaje: "ri-message-3-fill",
    follow: "ri-user-follow-fill",
    like: "ri-heart-fill",
    comentario: "ri-chat-3-fill",
    like_comentario: "ri-heart-2-fill"
  };

  let panel = null;
  let list = null;
  let badge = null;
  let realtimeBound = false;

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
      <div class="notifications-list" id="notificationsList">
        <div class="notifications-empty"><i class="ri-loader-4-line ri-spin"></i>Cargando...</div>
      </div>
    `;

    document.body.appendChild(panel);
    list = panel.querySelector("#notificationsList");

    panel.querySelector("#notificationsReadAll").addEventListener("click", async () => {
      try {
        await fetch(`${API}/notifications/read-all`, {
          method: "PUT",
          headers: authHeaders()
        });
      } catch {}
      document.querySelectorAll(".notification-item.unread").forEach(el => el.classList.remove("unread"));
      updateCount(0);
    });

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
    if (panel.classList.contains("open")) cargarNotificaciones();
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
      bindNotificationItems();
    } catch {
      list.innerHTML = `<div class="notifications-empty"><i class="ri-error-warning-line"></i>No se pudieron cargar.</div>`;
    }
  }

  function renderNotification(n) {
    const u = n.emisor || {};
    let texto = `<strong>${esc(u.nombre || "Alguien")}</strong> tiene una nueva notificación`;

    if (n.tipo === "mensaje") texto = `<strong>${esc(u.nombre || "Alguien")}</strong> te envió un mensaje`;
    if (n.tipo === "follow") texto = `<strong>${esc(u.nombre || "Alguien")}</strong> empezó a seguirte`;
    if (n.tipo === "like") texto = `<strong>${esc(u.nombre || "Alguien")}</strong> le dio me gusta a tu publicación`;
    if (n.tipo === "comentario") texto = `<strong>${esc(u.nombre || "Alguien")}</strong> comentó en tu publicación`;
    if (n.tipo === "like_comentario") texto = `<strong>${esc(u.nombre || "Alguien")}</strong> le dio me gusta a tu comentario`;

    return `
      <article class="notification-item ${n.leida ? "" : "unread"}"
               data-id="${esc(n._id)}"
               data-url="${esc(n.url || "/")}">
        ${avatar(u)}
        <div class="notification-content">
          <div class="notification-text">${texto}</div>
          ${n.tipo === "comentario" && n.texto ? `<div class="notification-preview">“${esc(n.texto)}”</div>` : ""}
          <div class="notification-time">${timeAgo(n.createdAt)}</div>
        </div>
        <div class="notification-icon"><i class="${icon[n.tipo] || "ri-notification-3-fill"}"></i></div>
      </article>`;
  }

  function bindNotificationItems() {
    list?.querySelectorAll(".notification-item").forEach(el => {
      el.addEventListener("click", () => abrirNotificacion(el.dataset.id, el.dataset.url));
    });
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

  /* Toast aislado: NO usa .notification-toast para evitar cualquier CSS viejo. */
  function showToast(n) {
    document.querySelectorAll(".fu-live-toast").forEach(el => el.remove());

    const u = n?.emisor || {};
    const tipoTexto = {
      mensaje: "te envió un mensaje",
      follow: "empezó a seguirte",
      like: "le dio me gusta a tu publicación",
      comentario: "comentó en tu publicación",
      like_comentario: "le dio me gusta a tu comentario"
    };

    const toast = document.createElement("button");
    toast.type = "button";
    toast.className = "fu-live-toast";
    toast.setAttribute("aria-label", "Nueva notificación");

    /* Todo queda inline para que ningún CSS antiguo pueda convertirlo en un panel. */
    Object.assign(toast.style, {
      position: "fixed",
      top: "max(14px, env(safe-area-inset-top))",
      right: "14px",
      left: "auto",
      bottom: "auto",
      width: "min(360px, calc(100vw - 28px))",
      height: "auto",
      minHeight: "0",
      maxHeight: "92px",
      margin: "0",
      padding: "12px 14px",
      display: "flex",
      alignItems: "center",
      gap: "11px",
      boxSizing: "border-box",
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,.11)",
      borderRadius: "17px",
      background: "linear-gradient(135deg, rgba(28,31,36,.97), rgba(9,11,14,.98))",
      color: "#fff",
      boxShadow: "0 18px 45px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.06)",
      backdropFilter: "blur(22px) saturate(140%)",
      WebkitBackdropFilter: "blur(22px) saturate(140%)",
      zIndex: "2147483647",
      cursor: "pointer",
      textAlign: "left",
      font: "inherit",
      transform: "translateY(-8px)",
      opacity: "0",
      transition: "opacity .22s ease, transform .22s ease"
    });

    toast.innerHTML = `
      <span class="fu-live-toast-icon"><i class="${icon[n?.tipo] || "ri-notification-3-fill"}"></i></span>
      <span class="fu-live-toast-copy">
        <strong>${esc(u.nombre || "Foro Ubre")}</strong>
        <span>${esc(tipoTexto[n?.tipo] || "tienes una nueva notificación")}</span>
      </span>
      <span class="fu-live-toast-close" aria-hidden="true"><i class="ri-close-line"></i></span>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    const close = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      setTimeout(() => toast.remove(), 230);
    };

    toast.addEventListener("click", () => {
      close();
      setTimeout(() => abrirNotificacion(n._id, n.url), 100);
    });

    setTimeout(close, 4500);
  }

  function insertarNotificacionEnVivo(n) {
    if (!list || !n?._id) return;

    const selector = `[data-id="${CSS.escape(String(n._id))}"]`;
    if (list.querySelector(selector)) return;

    const empty = list.querySelector(".notifications-empty");
    if (empty) list.innerHTML = "";

    list.insertAdjacentHTML("afterbegin", renderNotification(n));
    bindNotificationItems();

    list.querySelectorAll(".notification-item").forEach((el, index) => {
      if (index >= 30) el.remove();
    });
  }

  function connectRealtime() {
    const realtime = window.foroRealtime;
    if (!realtime || realtimeBound) return false;

    realtimeBound = true;
    realtime.on("nuevaNotificacion", (notification) => {
      if (!notification?._id) return;
      insertarNotificacionEnVivo(notification);
      cargarCount();
      showToast(notification);
    });

    return true;
  }

  function init() {
    buildUI();
    cargarCount();
    connectRealtime();

    /* realtime.js puede terminar de cargar después de este script. */
    window.addEventListener("foro-realtime-ready", connectRealtime, { once: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
