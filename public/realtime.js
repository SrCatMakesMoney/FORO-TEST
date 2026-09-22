/* FORO UBRE — Realtime sobre Pusher
   Mantiene una API compatible con el antiguo socket del chat.
*/
(() => {
  const token = localStorage.getItem("fu_token");
  const usuario = JSON.parse(localStorage.getItem("fu_usuario") || "null");

  const handlers = new Map();
  let pusher = null;
  let channel = null;
  let ready = false;

  // Pusher no acepta ":" en nombres de eventos publicados por HTTP.
  // Conservamos la API antigua de Foro Ubre y traducimos internamente:
  // "llamada:entrante" -> "llamada-entrante".
  const wireEvent = (event) => String(event || "").replace(/[^A-Za-z0-9_-]/g, "-");

  const adapter = {
    connected: true,

    on(event, fn) {
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

    async emit(event, data = {}, ack) {
      // Estos eventos ya se producen desde la API después de guardar el mensaje.
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
            destinatarioId: data.destinatarioId || data.callerId,
            event,
            data
          })
        });
        const result = await res.json().catch(() => ({}));
        if (typeof ack === "function") ack(result);
      } catch (error) {
        console.error("Realtime:", error);
        if (typeof ack === "function") ack({ ok: false, mensaje: "No se pudo conectar con realtime." });
      }
    }
  };

  window.foroRealtime = adapter;

  async function init() {
    if (!token || !usuario?._id) return;

    try {
      if (typeof window.Pusher === "undefined") {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://js.pusher.com/8.0.1/pusher.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const res = await fetch("/api/realtime/config", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const config = await res.json();
      if (!res.ok || !config.key || !config.cluster) throw new Error(config.mensaje || "Pusher no está configurado.");

      pusher = new window.Pusher(config.key, {
        cluster: config.cluster,
        forceTLS: true,
        authEndpoint: "/api/realtime/auth",
        auth: {
          headers: { Authorization: `Bearer ${token}` }
        }
      });

      pusher.connection.bind("error", (err) => console.warn("Pusher:", err));
      channel = pusher.subscribe(`private-user-${String(usuario._id)}`);

      channel.bind("pusher:subscription_succeeded", () => {
        ready = true;
        for (const [event, set] of handlers) {
          for (const fn of set) channel.bind(wireEvent(event), fn);
        }
        window.dispatchEvent(new CustomEvent("foro-realtime-ready"));
      });
    } catch (error) {
      console.error("No se pudo iniciar realtime:", error);
      window.dispatchEvent(new CustomEvent("foro-realtime-error", { detail: error }));
    }
  }

  init();
})();

