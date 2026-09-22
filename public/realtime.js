/* FORO UBRE — realtime estable sobre Pusher Channels.
   La API pública conserva los nombres usados por messages.html,
   pero Pusher recibe nombres HTTP válidos.
*/

(() => {
  const token = localStorage.getItem("fu_token");
  const usuario = JSON.parse(localStorage.getItem("fu_usuario") || "null");

  const handlers = new Map();
  let pusher = null;
  let channel = null;
  let ready = false;
  let initPromise = null;

  const wireEvent = (event) => String(event || "").replace(/[^A-Za-z0-9_-]/g, "-");

  const adapter = {
    get connected() { return ready; },

    on(event, fn) {
      if (typeof fn !== "function") return adapter;
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      if (ready && channel) channel.bind(wireEvent(event), fn);
      return adapter;
    },

    once(event, fn) {
      const wrapped = (...args) => {
        adapter.off(event, wrapped);
        fn(...args);
      };
      return adapter.on(event, wrapped);
    },

    off(event, fn) {
      const set = handlers.get(event);
      if (!set) return adapter;
      if (fn) set.delete(fn);
      else set.clear();
      if (ready && channel) {
        if (fn) channel.unbind(wireEvent(event), fn);
        else channel.unbind(wireEvent(event));
      }
      return adapter;
    },

    waitUntilReady(timeout = 8000) {
      if (ready) return Promise.resolve(true);
      return new Promise(resolve => {
        let done = false;
        const finish = value => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          window.removeEventListener("foro-realtime-ready", onReady);
          window.removeEventListener("foro-realtime-error", onError);
          resolve(value);
        };
        const onReady = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), timeout);
        window.addEventListener("foro-realtime-ready", onReady, { once: true });
        window.addEventListener("foro-realtime-error", onError, { once: true });
      });
    },

    async emit(event, data = {}, ack) {
      // El mensaje normal se guarda por REST y el backend emite nuevoMensaje.
      if (event === "registrar" || event === "enviarMensaje") {
        if (typeof ack === "function") ack({ ok: true });
        return;
      }

      try {
        const res = await fetch("/api/realtime/trigger", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            destinatarioId: data.destinatarioId || data.callerId || data.receiverId,
            event,
            data
          })
        });

        const result = await res.json().catch(() => ({}));
        if (typeof ack === "function") ack(result);
        return result;
      } catch (error) {
        console.error("Realtime emit:", error);
        const result = { ok: false, mensaje: "No se pudo conectar con realtime." };
        if (typeof ack === "function") ack(result);
        return result;
      }
    }
  };

  window.foroRealtime = adapter;

  async function init() {
    if (!token || !usuario?._id) return false;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        if (typeof window.Pusher === "undefined") {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://js.pusher.com/8.4.0/pusher.min.js";
            script.onload = resolve;
            script.onerror = () => reject(new Error("No se pudo cargar Pusher."));
            document.head.appendChild(script);
          });
        }

        const res = await fetch("/api/realtime/config", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const config = await res.json().catch(() => ({}));
        if (!res.ok || !config.key || !config.cluster) {
          throw new Error(config.mensaje || "Pusher no está configurado.");
        }

        pusher = new window.Pusher(config.key, {
          cluster: config.cluster,
          forceTLS: true,
          authEndpoint: "/api/realtime/auth",
          auth: { headers: { Authorization: `Bearer ${token}` } }
        });

        pusher.connection.bind("connected", () => {
          console.info("[FORO realtime] Pusher conectado");
        });
        pusher.connection.bind("error", err => {
          console.warn("[FORO realtime] Pusher error", err);
        });

        channel = pusher.subscribe(`private-user-${String(usuario._id)}`);

        channel.bind("pusher:subscription_succeeded", () => {
          ready = true;
          for (const [event, set] of handlers) {
            for (const fn of set) channel.bind(wireEvent(event), fn);
          }
          window.dispatchEvent(new CustomEvent("foro-realtime-ready"));
        });

        channel.bind("pusher:subscription_error", error => {
          console.error("[FORO realtime] Error suscribiendo canal privado", error);
          window.dispatchEvent(new CustomEvent("foro-realtime-error", { detail: error }));
        });

        return true;
      } catch (error) {
        ready = false;
        console.error("No se pudo iniciar realtime:", error);
        window.dispatchEvent(new CustomEvent("foro-realtime-error", { detail: error }));
        return false;
      }
    })();

    return initPromise;
  }

  init();
})();
