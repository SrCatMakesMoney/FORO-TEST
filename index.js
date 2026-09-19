const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const { initBucket } = require("./utils/gridfs");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────
// RUTAS
// ─────────────────────────────────────────────

app.use("/api/videos", require("./routes/videos"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/search", require("./routes/search"));
app.use("/api/stickers", require("./routes/stickers"));
app.use("/api/images", require("./routes/images"));

// ─────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────

const usuariosOnline = new Map();

io.on("connection", (socket) => {

  socket.on("registrar", (userId) => {
    if (!userId) return;

    usuariosOnline.set(String(userId), socket.id);

    socket.join(`user_${userId}`);
  });

  socket.on("enviarMensaje", ({
    convId,
    mensaje,
    destinatarioId
  }) => {

    if (!destinatarioId) return;

    io.to(`user_${destinatarioId}`).emit(
      "nuevoMensaje",
      {
        convId,
        mensaje
      }
    );
  });

  socket.on("escribiendo", ({
    convId,
    nombre,
    destinatarioId
  }) => {

    if (!destinatarioId) return;

    io.to(`user_${destinatarioId}`).emit(
      "usuarioEscribiendo",
      {
        convId,
        nombre
      }
    );
  });

  socket.on("dejoDeEscribir", ({
    convId,
    destinatarioId
  }) => {

    if (!destinatarioId) return;

    io.to(`user_${destinatarioId}`).emit(
      "usuarioDejoEscribir",
      {
        convId
      }
    );
  });

  socket.on("disconnect", () => {

    for (const [uid, sid] of usuariosOnline) {

      if (sid === socket.id) {
        usuariosOnline.delete(uid);
        break;
      }

    }

  });

});

// ─────────────────────────────────────────────
// SPA FALLBACK
// ─────────────────────────────────────────────

app.get(/.*/, (req, res) => {

  if (!req.path.startsWith("/api")) {
    res.sendFile(
      path.join(__dirname, "public", "index.html")
    );
  }

});

// ─────────────────────────────────────────────
// BASE DE DATOS
// ─────────────────────────────────────────────

let mongoPromise;

async function conectarMongoDB() {

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!mongoPromise) {

    mongoPromise = mongoose.connect(
      process.env.MONGO_URI
    )
    .then(() => {

      console.log("MongoDB Atlas conectado");

      initBucket();

      return mongoose.connection;

    })
    .catch((error) => {

      mongoPromise = null;

      console.error(
        "Error conectando MongoDB:",
        error
      );

      throw error;

    });

  }

  await mongoPromise;
}

// ─────────────────────────────────────────────
// VERCEL / NODE
// ─────────────────────────────────────────────

if (process.env.NODE_ENV !== "production") {

  conectarMongoDB()
    .then(() => {

      const PORT = process.env.PORT || 5000;

      server.listen(
        PORT,
        "0.0.0.0",
        () => {
          console.log(
            `Servidor iniciado en http://localhost:${PORT}`
          );
        }
      );

    })
    .catch(console.error);

}

module.exports = app;
module.exports.server = server;
module.exports.io = io;
module.exports.conectarMongoDB = conectarMongoDB;
