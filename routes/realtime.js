const express = require("express");
const auth = require("../middleware/authMiddleware");
const { authenticate, trigger, channelForUser, getConfig } = require("../utils/pusher");

const router = express.Router();



router.get("/config", auth, (req, res) => {
  try {
    const { key, cluster } = getConfig();
    res.json({ key, cluster });
  } catch (error) {
    res.status(503).json({ mensaje: error.message });
  }
});

router.post("/auth", auth, (req, res) => {
  try {
    const { socket_id: socketId, channel_name: channelName } = req.body || {};
    if (!socketId || !channelName) return res.status(400).json({ mensaje: "Datos de autenticación incompletos." });

    const expected = channelForUser(req.usuario._id);
    if (channelName !== expected) return res.status(403).json({ mensaje: "Canal no autorizado." });

    res.json(authenticate(socketId, channelName));
  } catch (error) {
    console.error("Pusher auth:", error);
    res.status(500).json({ mensaje: "No se pudo autenticar el canal." });
  }
});

const allowedEvents = new Set([
  "usuarioEscribiendo",
  "usuarioDejoEscribir",
  "llamada:invitar",
  "llamada:aceptada",
  "llamada:rechazada",
  "llamada:finalizada",
  "llamada:signal"
]);

router.post("/trigger", auth, async (req, res) => {
  try {
    const { destinatarioId, event, data } = req.body || {};
    if (!destinatarioId || !allowedEvents.has(event)) {
      return res.status(400).json({ mensaje: "Evento no permitido." });
    }

    const yo = String(req.usuario._id);
    const receptor = String(destinatarioId);
    const payload = { ...(data || {}) };

    if (event === "llamada:invitar") payload.callerId = yo;
    if (event === "llamada:aceptada" || event === "llamada:rechazada") payload.receiverId = yo;
    if (event === "llamada:finalizada") payload.fromId = yo;
    if (event === "llamada:signal") payload.fromId = yo;

    // "invitar" es un evento de salida; el receptor recibe "entrante".
    // El resto mantiene el mismo nombre lógico en ambos extremos.
    const recipientEvent = event === "llamada:invitar"
      ? "llamada:entrante"
      : event;

    // Pusher HTTP no acepta ":" en nombres de evento.
    const pusherEvent = String(recipientEvent).replace(/[^A-Za-z0-9_-]/g, "-");

    await trigger(channelForUser(receptor), pusherEvent, payload);
    res.json({ ok: true });
  } catch (error) {
    console.error("Pusher trigger:", error);
    res.status(500).json({ ok: false, mensaje: error.message });
  }
});

module.exports = router;
