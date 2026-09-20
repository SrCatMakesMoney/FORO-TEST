const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

let configurado = false;

function configurarPush() {
  if (configurado) return true;

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.warn("⚠️ Web Push desactivado: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT.");
    return false;
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  configurado = true;
  return true;
}

async function enviarPushAUsuario(usuarioId, payload) {
  if (!configurarPush()) return;

  const subscriptions = await PushSubscription.find({
    usuario: usuarioId
  }).lean();

  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys
          },
          body,
          {
            TTL: 60 * 60 * 24
          }
        );
      } catch (error) {
        // 404/410 = suscripción caducada o eliminada.
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          return;
        }

        console.error("❌ Error enviando Web Push:", error.statusCode || error.message);
      }
    })
  );
}

module.exports = {
  configurarPush,
  enviarPushAUsuario
};
