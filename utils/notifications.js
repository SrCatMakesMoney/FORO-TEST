const Notification = require("../models/Notification");
const { trigger, channelForUser } = require("./pusher");

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

  // Compatibilidad temporal con el Socket.IO antiguo si existe.
  if (io) {
    try {
      io.to(`user_${String(receptor)}`).emit("nuevaNotificacion", completa);
    } catch (error) {
      console.warn("Socket.IO legacy notification:", error.message);
    }
  }

  // Tiempo real principal: Pusher.
  try {
    await trigger(channelForUser(receptor), "nuevaNotificacion", completa);
  } catch (realtimeError) {
    console.error("Error enviando notificación por Pusher:", realtimeError);
  }

  // IMPORTANTE: no llamar a web-push aquí.
  // Foro Ubre usa Pusher para avisos en tiempo real y así no aparece
  // la notificación nativa gigante del navegador/dispositivo.

  return completa;
}

module.exports = { crearNotificacion };
