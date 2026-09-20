const Notification = require("../models/Notification");

/**
 * Crea una notificación y la manda inmediatamente
 * por Socket.IO al usuario receptor.
 */
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

  // No notificarse a uno mismo
  if (String(receptor) === String(emisor)) {
    return null;
  }

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

  const completa = await Notification.findById(
    notification._id
  )
    .populate(
      "emisor",
      "nombre handle avatar avatarTipo personalizacion"
    )
    .lean();

  if (io) {
    io.to(`user_${String(receptor)}`).emit(
      "nuevaNotificacion",
      completa
    );
  }

  return completa;
}

module.exports = {
  crearNotificacion
};
