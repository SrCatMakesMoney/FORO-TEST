const Notification = require("../models/Notification");
const { trigger, channelForUser } = require("./pusher");

const TEXTOS_PUSH = {
  mensaje: "te envio un mensaje",
  follow: "empezo a seguirte",
  like: "le dio me gusta a tu publicacion",
  comentario: "comento en tu publicacion",
  like_comentario: "le dio me gusta a tu comentario"
};

async function crearNotificacion({
  io,
  receptor,
  emisor,
  tipo,
  post = null,
  comentario = null,
  conversacion = null,
  texto = "",
  url = ""
}) {
  if (!receptor || !emisor) return null;
  if (String(receptor) === String(emisor)) return null;

  const notification = await Notification.create({
    receptor,
    emisor,
    tipo,
    post,
    comentario,
    conversacion,
    texto,
    url
  });

  const completa = await Notification.findById(notification._id)
    .populate("emisor", "nombre handle avatar avatarTipo personalizacion")
    .lean();

  if (io) {
    io.to(`user_${String(receptor)}`).emit("nuevaNotificacion", completa);
  }

  try {
    await trigger(channelForUser(receptor), "nuevaNotificacion", completa);
  } catch (realtimeError) {
    console.error("Error enviando notificación por Pusher:", realtimeError);
  }

  // Web Push nativo desactivado: las notificaciones en tiempo real se entregan exclusivamente por Pusher.

  return completa;
}

module.exports = { crearNotificacion };
