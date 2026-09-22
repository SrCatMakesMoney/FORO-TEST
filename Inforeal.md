# FORO UBRE — Pusher Realtime

Esta versión reemplaza el realtime dependiente de Socket.IO en el frontend por Pusher Channels, manteniendo Vercel + MongoDB.

## Variables de entorno en Vercel

Añade estas variables (no las pongas en el frontend):

```text
PUSHER_APP_ID=tu_app_id
PUSHER_KEY=tu_key
PUSHER_SECRET=tu_secret
PUSHER_CLUSTER=tu_cluster
```

`PUSHER_KEY` y `PUSHER_CLUSTER` se pueden entregar al navegador mediante `/api/realtime/config`; `PUSHER_SECRET` debe quedarse solamente en las variables del servidor.

## Qué hace esta versión

- Mensajes: se guardan en MongoDB y después se publican a Pusher como `nuevoMensaje`.
- Notificaciones: se guardan en MongoDB y después se publican como `nuevaNotificacion`.
- Escribiendo/dejó de escribir: viajan por Pusher.
- Llamadas de voz: la señalización viaja por Pusher; el audio sigue siendo WebRTC.
- Videollamadas: la señalización WebRTC viaja por Pusher; audio/video sigue siendo WebRTC.
- Los canales son privados por usuario: `private-user-ID`.

## Archivos incluidos

```text
index.js
routes/messages.js
routes/realtime.js
utils/notifications.js
utils/pusher.js
public/messages.html
public/messages.css
public/notifications.js
public/realtime.js
```

No reemplaces todo el proyecto. Copia estos archivos respetando sus rutas.
