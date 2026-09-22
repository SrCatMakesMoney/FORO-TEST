/* ============================================================
   FORO UBRE — NOTIFICACIONES + PUSHER REALTIME
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
      await fetch(`${API}/notifications/read-all`, {
        method: "PUT",
        headers: authHeaders()
      });
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
    if (panel.classList.contains("open")) {
      cargarNotificaciones();
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

  // Crear estilos una sola vez
  if (!document.getElementById("notificationToastStyles")) {
    const style = document.createElement("style");
    style.id = "notificationToastStyles";
    style.textContent = `
      .notification-toast {
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        z-index: 2147483647 !important;

        width: min(380px, calc(100vw - 32px));
        min-height: 68px;

        display: flex !important;
        align-items: center;
        gap: 12px;

        padding: 13px 15px;

        background:
          linear-gradient(
            135deg,
            rgba(30, 33, 38, .96),
            rgba(10, 12, 15, .97)
          ) !important;

        border: 1px solid rgba(255,255,255,.10);
        border-radius: 18px;

        color: #fff;
        box-shadow:
          0 20px 60px rgba(0,0,0,.55),
          0 0 0 1px rgba(255,255,255,.03),
          inset 0 1px 0 rgba(255,255,255,.06);

        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);

        cursor: pointer;

        opacity: 0;
        transform: translate3d(0,-20px,0) scale(.96);

        animation:
          notificationToastIn .35s cubic-bezier(.2,.8,.2,1) forwards;
      }

      .notification-toast-icon {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;

        display: grid;
        place-items: center;

        border-radius: 14px;

        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.08);

        color: #ff4d67;
        font-size: 19px;
      }

      .notification-toast-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .notification-toast-copy strong {
        color: #fff;
        font-size: 14px;
        font-weight: 750;

        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .notification-toast-copy span {
        color: #a7adb5;
        font-size: 12px;
        line-height: 1.35;

        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .notification-toast:hover {
        transform: translate3d(0,0,0) scale(1.01);
        border-color: rgba(255,255,255,.16);
      }

      @keyframes notificationToastIn {
        from {
          opacity: 0;
          transform: translate3d(0,-20px,0) scale(.96);
        }

        to {
          opacity: 1;
          transform: translate3d(0,0,0) scale(1);
        }
      }

      @keyframes notificationToastOut {
        from {
          opacity: 1;
          transform: translate3d(0,0,0) scale(1);
        }

        to {
          opacity: 0;
          transform: translate3d(0,-12px,0) scale(.97);
        }
      }

      @media (max-width: 600px) {
        .notification-toast {
          top: calc(10px + env(safe-area-inset-top)) !important;
          right: 10px !important;
          left: 10px !important;
          width: auto;
          max-width: none;

          border-radius: 17px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  const u = n.emisor || {};

  const toast = document.createElement("div");
  toast.className = "notification-toast";

  const tipoTexto = {
    mensaje: "te envió un mensaje",
    follow: "empezó a seguirte",
    like: "le dio me gusta a tu publicación",
    comentario: "comentó en tu publicación",
    like_comentario: "le dio me gusta a tu comentario"
  };

  const accion = tipoTexto[n.tipo] || "tienes una nueva notificación";

  toast.innerHTML = `
    <div class="notification-toast-icon">
      <i class="${icon[n.tipo] || "ri-notification-3-fill"}"></i>
    </div>

    <div class="notification-toast-copy">
      <strong>${esc(u.nombre || "Foro Ubre")}</strong>
      <span>${esc(accion)}</span>
    </div>
  `;

  toast.onclick = () => {
    toast.style.animation = "notificationToastOut .22s ease forwards";

    setTimeout(() => {
      toast.remove();
      abrirNotificacion(n._id, n.url);
    }, 180);
  };

  document.body.appendChild(toast);

  setTimeout(() => {
    if (!toast.isConnected) return;

    toast.style.animation =
      "notificationToastOut .25s ease forwards";

    setTimeout(() => toast.remove(), 260);
  }, 6000);
}

  function connectSocket() {
    socket = window.foroRealtime;
    if (!socket) return;

    socket.off("nuevaNotificacion");
    socket.on("nuevaNotificacion", (notification) => {
      if (!notification?._id) return;
      insertarNotificacionEnVivo(notification);
      cargarCount();
      showToast(notification);
    });
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



  // Web Push nativo desactivado: Pusher maneja el realtime dentro de Foro Ubre.
  async function limpiarWebPushAntiguo() {
    try {
      if (!("serviceWorker" in navigator)) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try {
          const sub = await reg.pushManager?.getSubscription?.();
          if (sub) await sub.unsubscribe();
        } catch {}
        try { await reg.unregister(); } catch {}
      }
    } catch {}
  }

  limpiarWebPushAntiguo();

})();
