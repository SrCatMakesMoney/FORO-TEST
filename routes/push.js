const express = require("express");
const PushSubscription = require("../models/PushSubscription");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// La clave pública NO es secreta y puede entregarse al navegador.
router.get("/vapid-public-key", auth, (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({
      mensaje: "Web Push no está configurado en el servidor"
    });
  }

  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.get("/status", auth, async (req, res) => {
  try {
    const count = await PushSubscription.countDocuments({
      usuario: req.usuario._id
    });

    res.json({
      configurado: Boolean(
        process.env.VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT
      ),
      suscrito: count > 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error" });
  }
});

router.post("/subscribe", auth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};

    if (
      typeof endpoint !== "string" ||
      !endpoint.startsWith("https://") ||
      !keys ||
      typeof keys.p256dh !== "string" ||
      typeof keys.auth !== "string"
    ) {
      return res.status(400).json({ mensaje: "Suscripción Push inválida" });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        usuario: req.usuario._id,
        endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth
        },
        userAgent: req.get("user-agent") || ""
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Error guardando Push subscription:", err);
    res.status(500).json({ mensaje: "No se pudo guardar la suscripción" });
  }
});

router.delete("/subscribe", auth, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ mensaje: "endpoint requerido" });
    }

    await PushSubscription.deleteOne({
      endpoint,
      usuario: req.usuario._id
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "No se pudo eliminar la suscripción" });
  }
});

module.exports = router;
