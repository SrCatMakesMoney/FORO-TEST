const Notification = require("../models/Notification");
const { enviarPushAUsuario } = require("./push");
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

  const emisorData = completa?.emisor || {};
  const nombre = emisorData.nombre || "Alguien";
  const titulo = tipo === "mensaje" ? "Nuevo mensaje" : "Foro Ubre";
  const accion = TEXTOS_PUSH[tipo] || "tuvo una interacci贸n contigo";

  await enviarPushAUsuario(receptor, {
    title: titulo,
    body: `${nombre} ${accion}`,
    icon: "/generated-icon.png",
    badge: "/generated-icon.png",
    url: url || "/",
    notificationId: String(notification._id),
    tag: `foro-ubre-${tipo}-${String(notification._id)}`
  });

  return completa;
}

module.exports = { crearNotificacion };
