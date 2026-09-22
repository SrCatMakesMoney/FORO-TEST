require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const { initBucket } = require("./utils/gridfs");

const app = express();

// Permite que getUserMedia funcione desde la propia web en navegadores móviles.
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self)");
  next();
});
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


// ============================================================
// LLAMADAS WEBRTC — SEÑALIZACIÓN
// ============================================================
// Socket.IO no transporta audio/video. Solo coordina la llamada.
// El audio/video viaja por WebRTC entre los dos navegadores.

function emitirAlUsuario(userId, evento, data = {}) {
  if (!userId) return;
  io.to(`user_${String(userId)}`).emit(evento, data);
}

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

    usuariosOnline.set(
      id,
      socket.id
    );

    socket.join(
      `user_${id}`
    );

  });


  // ----------------------------------------------------------
  // LLAMADAS — INVITACIÓN
  // ----------------------------------------------------------
  socket.on("llamada:invitar", ({ destinatarioId, convId, tipo, emisor }) => {
    if (!destinatarioId || !convId || !["audio", "video"].includes(tipo)) return;

    emitirAlUsuario(destinatarioId, "llamada:entrante", {
      convId,
      tipo,
      emisor: {
        _id: emisor?._id || null,
        nombre: emisor?.nombre || "Usuario",
        handle: emisor?.handle || "",
        avatar: emisor?.avatar || ""
      },
      callerSocketId: socket.id
    });
  });

  // ----------------------------------------------------------
  // LLAMADAS — RESPUESTA
  // ----------------------------------------------------------
  socket.on("llamada:respuesta", ({ callerSocketId, convId, aceptada, motivo }) => {
    if (!callerSocketId) return;
    io.to(callerSocketId).emit("llamada:respuesta", {
      convId,
      aceptada: !!aceptada,
      motivo: motivo || ""
    });
  });

  // ----------------------------------------------------------
  // LLAMADAS — WEBRTC SIGNALING
  // ----------------------------------------------------------
  socket.on("llamada:signal", ({ targetSocketId, kind, data, convId }) => {
    if (!targetSocketId || !kind || data == null) return;
    io.to(targetSocketId).emit("llamada:signal", {
      kind,
      data,
      convId,
      fromSocketId: socket.id
    });
  });

  // ----------------------------------------------------------
  // LLAMADAS — FINALIZAR
  // ----------------------------------------------------------
  socket.on("llamada:finalizar", ({ targetSocketId, convId, motivo }) => {
    if (!targetSocketId) return;
    io.to(targetSocketId).emit("llamada:finalizada", {
      convId,
      motivo: motivo || "finalizada"
    });
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
