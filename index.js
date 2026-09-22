require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const { initBucket } = require("./utils/gridfs");

const app = express();
const server = http.createServer(app);

// ============================================================
// SOCKET.IO
// ============================================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Permite que las rutas accedan al mismo Socket.IO con req.app.get("io").
app.set("io", io);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

app.use(express.static(
  path.join(__dirname, "public")
));

// ============================================================
// MONGODB
// ============================================================

let mongoPromise = null;

async function conectarMongoDB() {

  // Ya conectado
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Verificar variable
  if (!process.env.MONGO_URI) {
    throw new Error(
      "MONGO_URI no está configurada en las variables de entorno de Vercel."
    );
  }

  // Evitar múltiples conexiones simultáneas
  if (!mongoPromise) {

    console.log("🔄 Intentando conectar a MongoDB...");

    mongoPromise = mongoose.connect(
      process.env.MONGO_URI,
      {
        serverSelectionTimeoutMS: 10000
      }
    )
      .then(() => {

        console.log("✅ MongoDB Atlas conectado");

        // Inicializar GridFS
        try {
          initBucket();
          console.log("✅ GridFS inicializado");
        } catch (error) {
          console.error(
            "⚠️ Error inicializando GridFS:",
            error
          );
        }

        return mongoose.connection;
      })
      .catch((error) => {

        mongoPromise = null;

        console.error(
          "❌ Error conectando MongoDB:"
        );

        console.error(error);

        throw error;
      });
  }

  return await mongoPromise;
}

// ============================================================
// DB TEST
// ============================================================

app.get("/api/db-test", async (req, res) => {

  try {

    const connection = await conectarMongoDB();

    res.status(200).json({
      ok: true,
      mongodb: connection.readyState,
      estado: "conectado",
      mensaje: "MongoDB Atlas conectado correctamente"
    });

  } catch (error) {

    console.error(
      "❌ DB TEST ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      mongodb: mongoose.connection.readyState,
      estado: "desconectado",
      error: error.message
    });
  }
});

// ============================================================
// PROTEGER LAS RUTAS API CON LA CONEXIÓN DE MONGODB
// ============================================================
//
// Esto hace que una ruta como:
//
// POST /api/auth/register
//
// no intente ejecutar User.findOne()
// hasta que MongoDB esté conectado.
//

app.use("/api", async (req, res, next) => {

  // db-test ya realiza su propia conexión
  if (req.path === "/db-test") {
    return next();
  }

  try {

    await conectarMongoDB();

    next();

  } catch (error) {

    console.error(
      "❌ MongoDB no disponible para:",
      req.method,
      req.originalUrl
    );

    console.error(error);

    res.status(503).json({
      ok: false,
      error: "La base de datos no está disponible.",
      details:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message
    });
  }
});

// ============================================================
// RUTAS
// ============================================================

app.use(
  "/api/videos",
  require("./routes/videos")
);

app.use(
  "/api/auth",
  require("./routes/auth")
);

app.use(
  "/api/posts",
  require("./routes/posts")
);

app.use(
  "/api/profile",
  require("./routes/profile")
);

app.use(
  "/api/messages",
  require("./routes/messages")
);

app.use(
  "/api/notifications",
  require("./routes/notifications")
);

app.use(
  "/api/push",
  require("./routes/push")
);

app.use(
  "/api/spotify",
  require("./routes/spotify")
);

app.use(
  "/api/search",
  require("./routes/search")
);

app.use(
  "/api/stickers",
  require("./routes/stickers")
);

app.use(
  "/api/images",
  require("./routes/images")
);

// ============================================================
// SOCKET.IO
// ============================================================

const usuariosOnline = new Map();

io.on("connection", (socket) => {

  console.log(
    "🔌 Socket conectado:",
    socket.id
  );

  // ----------------------------------------------------------
  // REGISTRAR USUARIO
  // ----------------------------------------------------------

  socket.on("registrar", (userId) => {

    if (!userId) return;

    const id = String(userId);

    socket.data.userId = id;

    usuariosOnline.set(
      id,
      socket.id
    );

    socket.join(
      `user_${id}`
    );

  });

  // ----------------------------------------------------------
  // ENVIAR MENSAJE
  // ----------------------------------------------------------

  socket.on(
    "enviarMensaje",
    ({
      convId,
      mensaje,
      destinatarioId
    }) => {

      if (!destinatarioId) return;

      io.to(
        `user_${destinatarioId}`
      ).emit(
        "nuevoMensaje",
        {
          convId,
          mensaje
        }
      );
    }
  );

  // ----------------------------------------------------------
  // ESCRIBIENDO
  // ----------------------------------------------------------

  socket.on(
    "escribiendo",
    ({
      convId,
      nombre,
      destinatarioId
    }) => {

      if (!destinatarioId) return;

      io.to(
        `user_${destinatarioId}`
      ).emit(
        "usuarioEscribiendo",
        {
          convId,
          nombre
        }
      );
    }
  );

  // ----------------------------------------------------------
  // DEJÓ DE ESCRIBIR
  // ----------------------------------------------------------

  socket.on(
    "dejoDeEscribir",
    ({
      convId,
      destinatarioId
    }) => {

      if (!destinatarioId) return;

      io.to(
        `user_${destinatarioId}`
      ).emit(
        "usuarioDejoEscribir",
        {
          convId
        }
      );
    }
  );

  // ----------------------------------------------------------
  // LLAMADAS / WEBRTC
  // ----------------------------------------------------------

  // El servidor solo hace señalización. El audio/video viaja
  // directamente entre navegadores mediante WebRTC.

  socket.on("llamada:invitar", ({ destinatarioId, callId, tipo, callerName, callerAvatar, callerAvatarTipo }) => {
    if (!destinatarioId || !callId) return;

    const callerId = socket.data.userId;
    if (!callerId) return;

    io.to(`user_${String(destinatarioId)}`).emit("llamada:entrante", {
      callId: String(callId),
      tipo: tipo === "video" ? "video" : "audio",
      callerId: String(callerId),
      callerName: callerName || "Usuario",
      callerAvatar: callerAvatar || "",
      callerAvatarTipo: callerAvatarTipo || "imagen"
    });
  });

  socket.on("llamada:aceptar", ({ callerId, callId }) => {
    if (!callerId || !callId || !socket.data.userId) return;

    io.to(`user_${String(callerId)}`).emit("llamada:aceptada", {
      callId: String(callId),
      receiverId: String(socket.data.userId)
    });
  });

  socket.on("llamada:rechazar", ({ callerId, callId }) => {
    if (!callerId || !callId || !socket.data.userId) return;

    io.to(`user_${String(callerId)}`).emit("llamada:rechazada", {
      callId: String(callId),
      receiverId: String(socket.data.userId)
    });
  });

  socket.on("llamada:finalizar", ({ destinatarioId, callId, razon }) => {
    if (!destinatarioId || !callId || !socket.data.userId) return;

    io.to(`user_${String(destinatarioId)}`).emit("llamada:finalizada", {
      callId: String(callId),
      fromId: String(socket.data.userId),
      razon: razon || "finalizada"
    });
  });

  socket.on("llamada:signal", ({ destinatarioId, callId, signal }) => {
    if (!destinatarioId || !callId || !signal || !socket.data.userId) return;

    io.to(`user_${String(destinatarioId)}`).emit("llamada:signal", {
      callId: String(callId),
      fromId: String(socket.data.userId),
      signal
    });
  });

  // ----------------------------------------------------------
  // DESCONECTAR
  // ----------------------------------------------------------

  socket.on("disconnect", () => {

    console.log(
      "🔌 Socket desconectado:",
      socket.id
    );

    for (
      const [uid, sid]
      of usuariosOnline
    ) {

      if (sid === socket.id) {

        usuariosOnline.delete(
          uid
        );

        break;
      }
    }
  });

});

// ============================================================
// SPA FALLBACK
// ============================================================

app.get(
  /.*/,
  (req, res) => {

    // Las rutas API que no existen no deben devolver index.html
    if (
      req.path.startsWith("/api")
    ) {

      return res.status(404).json({
        error: "Ruta API no encontrada"
      });
    }

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// ============================================================
// DESARROLLO LOCAL
// ============================================================
//
// En Vercel no hacemos server.listen().
// Vercel se encarga de ejecutar la aplicación.
//

if (
  process.env.NODE_ENV !== "production"
) {

  conectarMongoDB()
    .then(() => {

      const PORT =
        process.env.PORT || 5000;

      server.listen(
        PORT,
        "0.0.0.0",
        () => {

          console.log(
            `🚀 Servidor iniciado en http://localhost:${PORT}`
          );

        }
      );

    })
    .catch((error) => {

      console.error(
        "❌ No se pudo iniciar el servidor:",
        error
      );

    });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = app;

module.exports.server =
  server;

module.exports.io =
  io;

module.exports.conectarMongoDB =
  conectarMongoDB;
