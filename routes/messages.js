const express      = require("express");
const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");
const User         = require("../models/User");
const auth         = require("../middleware/authMiddleware");
const {
  crearNotificacion
} = require("../utils/notifications");

const router = express.Router();

// ── GET /api/messages ── Listar conversaciones
router.get("/", auth, async (req, res) => {
  try {
    const convs = await Conversation.find({
      participantes: req.usuario._id
    })
      .sort({ ultimaActividad: -1 })
      .populate("participantes", "nombre handle avatar avatarTipo")
      .populate({
        path:     "ultimoMensaje",
        populate: { path: "remitente", select: "nombre handle" }
      })
      .lean();

    // Añadir cantidad de mensajes no leídos
    const resultado = await Promise.all(
      convs.map(async (c) => {
        const noLeidos = await Message.countDocuments({
          conversacion: c._id,
          remitente:    { $ne: req.usuario._id },
          leido:        false
        });
        return { ...c, noLeidos };
      })
    );

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al listar conversaciones" });
  }
});

// ── POST /api/messages ── Crear o abrir conversación con un usuario
router.post("/", auth, async (req, res) => {
  try {
    const { usuarioId } = req.body;

    if (!usuarioId)
      return res.status(400).json({ mensaje: "usuarioId requerido" });

    if (usuarioId === req.usuario._id.toString())
      return res.status(400).json({ mensaje: "No puedes chatear contigo mismo" });

    const otroUsuario = await User.findById(usuarioId).select("nombre handle avatar avatarTipo");
    if (!otroUsuario)
      return res.status(404).json({ mensaje: "Usuario no encontrado" });

    // Buscar si ya existe una conversación
    let conv = await Conversation.findOne({
      participantes: { $all: [req.usuario._id, usuarioId], $size: 2 }
    }).populate("participantes", "nombre handle avatar avatarTipo");

    if (!conv) {
      conv = await Conversation.create({
        participantes: [req.usuario._id, usuarioId]
      });
      conv = await conv.populate("participantes", "nombre handle avatar avatarTipo");
    }

    res.json(conv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al crear conversación" });
  }
});

// ── GET /api/messages/:convId ── Obtener mensajes de una conversación
router.get("/:convId", auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.convId);
    if (!conv)
      return res.status(404).json({ mensaje: "Conversación no encontrada" });

    if (!conv.participantes.includes(req.usuario._id))
      return res.status(403).json({ mensaje: "No tienes acceso a esta conversación" });

    const mensajes = await Message.find({ conversacion: req.params.convId })
      .sort({ createdAt: 1 })
      .populate("remitente", "nombre handle avatar avatarTipo")
      .lean();

    // Marcar como leídos los mensajes del otro
    await Message.updateMany(
      { conversacion: req.params.convId, remitente: { $ne: req.usuario._id }, leido: false },
      { $set: { leido: true } }
    );

    res.json(mensajes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al obtener mensajes" });
  }
});

// ── POST /api/messages/:convId/send ── Enviar mensaje
router.post("/:convId/send", auth, async (req, res) => {
  try {
    const { contenido } = req.body;
    if (!contenido?.trim())
      return res.status(400).json({ mensaje: "El mensaje no puede estar vacío" });

    if (contenido.length > 1000)
      return res.status(400).json({ mensaje: "Máximo 1000 caracteres" });

    const conv = await Conversation.findById(req.params.convId);
    if (!conv)
      return res.status(404).json({ mensaje: "Conversación no encontrada" });

    if (!conv.participantes.map(String).includes(req.usuario._id.toString()))
      return res.status(403).json({ mensaje: "No tienes acceso" });

    const mensaje = await Message.create({
      conversacion: req.params.convId,
      remitente:    req.usuario._id,
      contenido:    contenido.trim()
    });

    await Conversation.findByIdAndUpdate(req.params.convId, {
      ultimoMensaje:   mensaje._id,
      ultimaActividad: new Date()
    });

    const populated = await mensaje.populate("remitente", "nombre handle avatar avatarTipo");
    // ============================================================
// NOTIFICACIÓN
// ============================================================

const destinatarioId =
  conv.participantes.find(
    id =>
      id.toString() !==
      req.usuario._id.toString()
  );

if (destinatarioId) {

  await crearNotificacion({
    io: req.app.get("io"),

    receptor: destinatarioId,

    emisor: req.usuario._id,

    tipo: "mensaje",

    conversacion: conv._id,

    texto: "te envió un mensaje",

    url: `/messages.html?conv=${conv._id}`
  });
}
    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al enviar mensaje" });
  }
});

module.exports = router;
