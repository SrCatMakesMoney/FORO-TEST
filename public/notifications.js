(() => {
  "use strict";

  /* ==========================================================
     CONFIG
  ========================================================== */

  const API = "/api";

  const token =
    localStorage.getItem("fu_token");

  const usuario =
    JSON.parse(
      localStorage.getItem("fu_usuario") || "null"
    );

  if (!token || !usuario) {
    return;
  }


  /* ==========================================================
     STATE
  ========================================================== */

  let socket = null;

  let notifications = [];

  let panel = null;

  let badge = null;


  /* ==========================================================
     HELPERS
  ========================================================== */

  function authHeaders() {
    return {
      Authorization:
        `Bearer ${token}`
    };
  }


  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function getAvatar(user) {
    if (!user) {
      return "";
    }

    if (user.avatar) {
      return user.avatar;
    }

    return "";
  }


  function getTime(date) {
    const timestamp =
      new Date(date).getTime();

    if (!Number.isFinite(timestamp)) {
      return "";
    }

    const seconds =
      Math.floor(
        (Date.now() - timestamp) / 1000
      );

    if (seconds < 10) {
      return "ahora";
    }

    if (seconds < 60) {
      return `hace ${seconds}s`;
    }

    const minutes =
      Math.floor(seconds / 60);

    if (minutes < 60) {
      return `hace ${minutes}m`;
    }

    const hours =
      Math.floor(minutes / 60);

    if (hours < 24) {
      return `hace ${hours}h`;
    }

    const days =
      Math.floor(hours / 24);

    if (days < 7) {
      return `hace ${days}d`;
    }

    return new Date(timestamp)
      .toLocaleDateString(
        "es-MX",
        {
          day: "numeric",
          month: "short"
        }
      );
  }


  function getIcon(type) {
    const icons = {
      mensaje:
        "ri-message-3-fill",

      follow:
        "ri-user-add-fill",

      like:
        "ri-heart-fill",

      comentario:
        "ri-chat-3-fill",

      like_comentario:
        "ri-heart-2-fill"
    };

    return (
      icons[type] ||
      "ri-notification-3-fill"
    );
  }


  function getActionText(notification) {
    const name =
      notification.emisor?.nombre ||
      notification.emisor?.handle ||
      "Alguien";

    const actions = {
      mensaje:
        "te envió un mensaje",

      follow:
        "comenzó a seguirte",

      like:
        "indicó que le gusta tu publicación",

      comentario:
        "comentó tu publicación",

      like_comentario:
        "indicó que le gusta tu comentario"
    };

    return `
      <strong>
        ${escapeHTML(name)}
      </strong>
      ${actions[notification.tipo] || ""}
    `;
  }


  /* ==========================================================
     CREAR BOTÓN
  ========================================================== */

  function createButton() {
    if (
      document.getElementById(
        "notificationNav"
      )
    ) {
      return;
    }

    /*
      Tu navegación puede tener distintos nombres
      dependiendo de la página. Buscamos cualquiera
      de los contenedores habituales.
    */

    const nav =
      document.querySelector(
        ".main-nav"
      ) ||
      document.querySelector(
        ".sidebar-nav"
      ) ||
      document.querySelector(
        ".nav-list"
      );

    if (!nav) {
      return;
    }


    const item =
      document.createElement("a");

    item.href = "#";

    item.id =
      "notificationNav";

    item.className =
      "nav-item notification-nav";


    item.innerHTML = `
      <span class="nav-icon">
        <i class="ri-notification-3-line"></i>

        <span
          class="notification-badge hidden"
          id="notificationBadge"
        ></span>
      </span>

      <span>
        Notificaciones
      </span>
    `;


    item.addEventListener(
      "click",
      event => {
        event.preventDefault();

        togglePanel();
      }
    );


    /*
      Intentamos ponerlo antes de mensajes.
      Si no existe, lo ponemos al final.
    */

    const messageNav =
      [...nav.querySelectorAll("a")]
        .find(link =>
          /mensaje|message/i.test(
            link.textContent
          )
        );


    if (messageNav) {
      nav.insertBefore(
        item,
        messageNav
      );
    } else {
      nav.appendChild(item);
    }


    badge =
      document.getElementById(
        "notificationBadge"
      );
  }


  /* ==========================================================
     CREAR PANEL
  ========================================================== */

  function createPanel() {
    if (
      document.getElementById(
        "notificationsPanel"
      )
    ) {
      return;
    }


    panel =
      document.createElement("div");

    panel.id =
      "notificationsPanel";

    panel.className =
      "notifications-panel";


    panel.innerHTML = `
      <div class="notifications-header">

        <div class="notifications-title">
          <i class="ri-notification-3-fill"></i>

          <span>
            Notificaciones
          </span>
        </div>

        <button
          type="button"
          class="notifications-readall"
          id="notificationsReadAll"
        >
          Marcar todo como leído
        </button>

      </div>

      <div
        class="notifications-list"
        id="notificationsList"
      ></div>
    `;


    document.body.appendChild(
      panel
    );


    document
      .getElementById(
        "notificationsReadAll"
      )
      ?.addEventListener(
        "click",
        markAllRead
      );


    /*
      Cerrar al tocar fuera.
    */

    document.addEventListener(
      "click",
      event => {

        if (
          !panel ||
          !panel.classList.contains(
            "open"
          )
        ) {
          return;
        }


        const button =
          document.getElementById(
            "notificationNav"
          );


        if (
          !panel.contains(
            event.target
          ) &&
          !button?.contains(
            event.target
          )
        ) {
          closePanel();
        }

      }
    );
  }


  /* ==========================================================
     PANEL OPEN/CLOSE
  ========================================================== */

  function togglePanel() {
    if (!panel) {
      return;
    }

    if (
      panel.classList.contains(
        "open"
      )
    ) {
      closePanel();
    } else {
      openPanel();
    }
  }


  function openPanel() {
    if (!panel) {
      return;
    }

    panel.classList.add(
      "open"
    );

    renderNotifications();
  }


  function closePanel() {
    if (!panel) {
      return;
    }

    panel.classList.remove(
      "open"
    );
  }


  /* ==========================================================
     RENDER
  ========================================================== */

  function renderNotifications() {
    const list =
      document.getElementById(
        "notificationsList"
      );

    if (!list) {
      return;
    }


    if (!notifications.length) {
      list.innerHTML = `
        <div class="notifications-empty">

          <i class="ri-notification-off-line"></i>

          <strong>
            Todo tranquilo
          </strong>

          <span>
            Cuando ocurra algo, aparecerá aquí.
          </span>

        </div>
      `;

      return;
    }


    list.innerHTML =
      notifications
        .map(notification => {

          const avatar =
            getAvatar(
              notification.emisor
            );


          return `
            <div
              class="
                notification-item
                ${
                  notification.leida
                    ? ""
                    : "unread"
                }
              "
              data-id="${escapeHTML(
                notification._id
              )}"
            >

              ${
                avatar
                  ? `
                    <img
                      class="notification-avatar"
                      src="${escapeHTML(
                        avatar
                      )}"
                      alt=""
                    >
                  `
                  : `
                    <div
                      class="notification-avatar"
                    ></div>
                  `
              }

              <div
                class="notification-content"
              >

                <div
                  class="notification-text"
                >
                  ${getActionText(
                    notification
                  )}
                </div>

                <div
                  class="notification-time"
                >
                  ${getTime(
                    notification.createdAt
                  )}
                </div>

              </div>

              <div
                class="notification-icon"
              >
                <i
                  class="${getIcon(
                    notification.tipo
                  )}"
                ></i>
              </div>

            </div>
          `;
        })
        .join("");


    list
      .querySelectorAll(
        ".notification-item"
      )
      .forEach(item => {

        item.addEventListener(
          "click",
          () => {

            openNotification(
              item.dataset.id
            );

          }
        );

      });
  }


  /* ==========================================================
     LOAD
  ========================================================== */

  async function loadNotifications() {
    try {

      const response =
        await fetch(
          `${API}/notifications?limite=30`,
          {
            headers:
              authHeaders()
          }
        );


      if (!response.ok) {
        return;
      }


      const data =
        await response.json();


      if (!Array.isArray(data)) {
        return;
      }


      notifications =
        data;


      updateBadge();

      renderNotifications();

    } catch (error) {

      console.error(
        "[Notificaciones]",
        error
      );

    }
  }


  /* ==========================================================
     BADGE
  ========================================================== */

  function updateBadge() {
    if (!badge) {
      return;
    }


    const unread =
      notifications.filter(
        notification =>
          !notification.leida
      ).length;


    if (unread <= 0) {

      badge.classList.add(
        "hidden"
      );

      badge.textContent = "";

      return;
    }


    badge.classList.remove(
      "hidden"
    );


    badge.textContent =
      unread > 99
        ? "99+"
        : String(unread);
  }


  /* ==========================================================
     OPEN NOTIFICATION
  ========================================================== */

  async function openNotification(id) {
    const notification =
      notifications.find(
        item =>
          item._id === id
      );


    if (!notification) {
      return;
    }


    if (!notification.leida) {

      notification.leida =
        true;

      updateBadge();

      fetch(
        `${API}/notifications/${encodeURIComponent(
          id
        )}/read`,
        {
          method: "PUT",
          headers:
            authHeaders()
        }
      ).catch(() => {});

    }


    renderNotifications();


    if (
      notification.url
    ) {

      window.location.href =
        notification.url;

    }
  }


  /* ==========================================================
     MARK ALL
  ========================================================== */

  async function markAllRead() {
    try {

      const response =
        await fetch(
          `${API}/notifications/read-all`,
          {
            method: "PUT",
            headers:
              authHeaders()
          }
        );


      if (!response.ok) {
        return;
      }


      notifications.forEach(
        notification => {
          notification.leida =
            true;
        }
      );


      updateBadge();

      renderNotifications();

    } catch (error) {

      console.error(
        "[Notificaciones]",
        error
      );

    }
  }


  /* ==========================================================
     TOAST
  ========================================================== */

  function showToast(notification) {

    document
      .querySelectorAll(
        ".notification-toast"
      )
      .forEach(
        element =>
          element.remove()
      );


    const toast =
      document.createElement(
        "div"
      );

    toast.className =
      "notification-toast";


    const avatar =
      getAvatar(
        notification.emisor
      );


    toast.innerHTML = `

      ${
        avatar
          ? `
            <img
              class="notification-toast-avatar"
              src="${escapeHTML(
                avatar
              )}"
              alt=""
            >
          `
          : ""
      }

      <div
        class="notification-toast-body"
      >

        <div
          class="notification-toast-title"
        >
          Nueva notificación
        </div>

        <div
          class="notification-toast-text"
        >
          ${getActionText(
            notification
          )}
        </div>

      </div>

    `;


    document.body.appendChild(
      toast
    );


    toast.addEventListener(
      "click",
      () => {

        if (
          notification.url
        ) {
          window.location.href =
            notification.url;
        }

      }
    );


    requestAnimationFrame(
      () => {
        toast.classList.add(
          "show"
        );
      }
    );


    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

        setTimeout(
          () => {
            toast.remove();
          },
          300
        );

      },
      4500
    );
  }


  /* ==========================================================
     SOCKET.IO
  ========================================================== */

  function connectSocket() {

    if (
      typeof window.io !==
      "function"
    ) {
      console.warn(
        "[Notificaciones] Socket.IO no está cargado."
      );

      return;
    }


    socket =
      window.io();


    /*
      Tu servidor ya utiliza este evento
      para meter al usuario en:

      user_ID
    */

    socket.emit(
      "registrar",
      String(
        usuario._id
      )
    );


    socket.on(
      "nuevaNotificacion",
      notification => {

        if (
          !notification ||
          !notification._id
        ) {
          return;
        }


        /*
          Evitar duplicados.
        */

        const exists =
          notifications.some(
            item =>
              String(item._id) ===
              String(
                notification._id
              )
          );


        if (exists) {
          return;
        }


        /*
          Nueva notificación
          entra como no leída.
        */

        notification.leida =
          false;


        notifications.unshift(
          notification
        );


        /*
          Máximo 30 en memoria.
        */

        notifications =
          notifications.slice(
            0,
            30
          );


        updateBadge();

        renderNotifications();

        showToast(
          notification
        );

      }
    );


    socket.on(
      "connect",
      () => {

        /*
          Si Socket.IO se reconecta,
          volvemos a registrar al usuario.
        */

        socket.emit(
          "registrar",
          String(
            usuario._id
          )
        );

      }
    );
  }


  /* ==========================================================
     SOCKET.IO FALLBACK
  ========================================================== */

  function loadSocketIO() {

    if (
      typeof window.io ===
      "function"
    ) {
      connectSocket();
      return;
    }


    /*
      Si tu HTML ya carga
      /socket.io/socket.io.js,
      simplemente esperamos.
    */

    const existing =
      document.querySelector(
        'script[src*="/socket.io/socket.io.js"]'
      );


    if (existing) {

      existing.addEventListener(
        "load",
        connectSocket
      );

      /*
        Por si ya terminó de cargar.
      */

      setTimeout(
        () => {

          if (
            typeof window.io ===
            "function" &&
            !socket
          ) {
            connectSocket();
          }

        },
        300
      );

      return;
    }


    /*
      Si la página no lo cargó,
      lo cargamos nosotros.
    */

    const script =
      document.createElement(
        "script"
      );

    script.src =
      "/socket.io/socket.io.js";

    script.onload =
      connectSocket;

    script.onerror =
      () => {

        console.error(
          "[Notificaciones] No se pudo cargar Socket.IO."
        );

      };


    document.head.appendChild(
      script
    );
  }


  /* ==========================================================
     INIT
  ========================================================== */

  function init() {

    createButton();

    createPanel();

    loadNotifications();

    loadSocketIO();

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();

  }

})();
