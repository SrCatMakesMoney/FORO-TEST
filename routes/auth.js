const express  = require("express");
const multer   = require("multer");
const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const auth     = require("../middleware/authMiddleware");
const { uploadFile, deleteFile } = require("../utils/gridfs");

const router = express.Router();

// ══════════════════════════════════════════════
// MULTER
// ══════════════════════════════════════════════

const uploadAvatar = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 3 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm"
    ].includes(file.mimetype);

    cb(null, ok);
  }
});

// ══════════════════════════════════════════════
// JWT
// ══════════════════════════════════════════════

const generarToken = (id) =>
  jwt.sign(
    { id },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );

// ══════════════════════════════════════════════
// AVATAR POR DEFECTO
// ══════════════════════════════════════════════

const avatarPorDefecto = (nombre) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(nombre)}`;

// ══════════════════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════════════════

router.post(
  "/register",
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {
      const {
        nombre,
        handle,
        email,
        password
      } = req.body;

      if (!nombre || !handle || !email || !password) {
        return res.status(400).json({
          mensaje: "Todos los campos son requeridos"
        });
      }

      if (nombre.length < 2 || nombre.length > 50) {
        return res.status(400).json({
          mensaje: "Nombre: 2–50 caracteres"
        });
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
        return res.status(400).json({
          mensaje:
            "Handle inválido (3–20 chars, solo letras/números/_)"
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          mensaje: "Contraseña mínimo 6 caracteres"
        });
      }

      const existe = await User.findOne({
        $or: [
          {
            email: email.toLowerCase()
          },
          {
            handle: handle.toLowerCase()
          }
        ]
      });

      if (existe) {
        return res.status(400).json({
          mensaje:
            existe.email === email.toLowerCase()
              ? "El email ya está registrado"
              : "El handle ya está en uso"
        });
      }

      // ─────────────────────────────────────────
      // AVATAR
      // ─────────────────────────────────────────

      let avatar = avatarPorDefecto(nombre);
      let avatarTipo = "imagen";

      if (req.file) {
        const fileId = await uploadFile(req.file);

        avatar = `/api/images/${fileId}`;

        avatarTipo = req.file.mimetype.startsWith("video/")
          ? "video"
          : "imagen";
      }

      // ─────────────────────────────────────────
      // CREAR USUARIO
      // ─────────────────────────────────────────

      const usuario = await User.create({
        nombre: nombre.trim(),
        handle: handle.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password,
        avatar,
        avatarTipo
      });

      res.status(201).json({
        token: generarToken(usuario._id),

        usuario: {
          _id: usuario._id,
          nombre: usuario.nombre,
          handle: usuario.handle,
          avatar: usuario.avatar,
          avatarTipo: usuario.avatarTipo,
          personalizacion: usuario.personalizacion
        }
      });

    } catch (err) {

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          mensaje: "Avatar máximo 3MB"
        });
      }

      console.error(err);

      res.status(500).json({
        mensaje: "Error al registrar"
      });
    }
  }
);

// ══════════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════════

router.post(
  "/login",
  async (req, res) => {
    try {
      const {
        email,
        password
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          mensaje: "Email y contraseña requeridos"
        });
      }

      const usuario = await User.findOne({
        email: email.toLowerCase()
      });

      if (
        !usuario ||
        !(await usuario.compararPassword(password))
      ) {
        return res.status(401).json({
          mensaje: "Credenciales incorrectas"
        });
      }

      res.json({
        token: generarToken(usuario._id),

        usuario: {
          _id: usuario._id,
          nombre: usuario.nombre,
          handle: usuario.handle,
          avatar: usuario.avatar,
          avatarTipo: usuario.avatarTipo,
          personalizacion: usuario.personalizacion
        }
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        mensaje: "Error al iniciar sesión"
      });
    }
  }
);

// ══════════════════════════════════════════════
// GET /api/auth/yo
// ══════════════════════════════════════════════

router.get(
  "/yo",
  auth,
  async (req, res) => {
    try {

      const usuario = await User
        .findById(req.usuario._id)
        .select("-password");

      if (!usuario) {
        return res.status(404).json({
          mensaje: "No encontrado"
        });
      }

      res.json(usuario);

    } catch (err) {

      res.status(500).json({
        mensaje: "Error"
      });
    }
  }
);

// ══════════════════════════════════════════════
// PUT /api/auth/perfil
// ══════════════════════════════════════════════

router.put(
  "/perfil",
  auth,
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {

      const {
        nombre,
        bio
      } = req.body;

      if (
        nombre &&
        (nombre.length < 2 || nombre.length > 50)
      ) {
        return res.status(400).json({
          mensaje: "Nombre: 2–50 caracteres"
        });
      }

      const update = {};

      if (nombre !== undefined) {
        update.nombre = nombre.trim();
      }

      if (bio !== undefined) {
        update.bio = bio.trim().slice(0, 160);
      }

      // ─────────────────────────────────────────
      // NUEVO AVATAR
      // ─────────────────────────────────────────

      if (req.file) {

        const viejo = await User
          .findById(req.usuario._id)
          .select("avatar");

        if (
          viejo?.avatar?.startsWith("/api/images/")
        ) {
          await deleteFile(viejo.avatar);
        }

        const fileId = await uploadFile(req.file);

        update.avatar = `/api/images/${fileId}`;

        update.avatarTipo =
          req.file.mimetype.startsWith("video/")
            ? "video"
            : "imagen";
      }

      const usuario = await User.findByIdAndUpdate(
        req.usuario._id,
        {
          $set: update
        },
        {
          new: true
        }
      ).select("-password");

      res.json({
        usuario: {
          _id: usuario._id,
          nombre: usuario.nombre,
          handle: usuario.handle,
          avatar: usuario.avatar,
          avatarTipo: usuario.avatarTipo,
          bio: usuario.bio,
          personalizacion: usuario.personalizacion
        }
      });

    } catch (err) {

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          mensaje: "Avatar máximo 3MB"
        });
      }

      console.error(err);

      res.status(500).json({
        mensaje: "Error al actualizar perfil"
      });
    }
  }
);

// ══════════════════════════════════════════════
// PUT /api/auth/personalizacion
// ══════════════════════════════════════════════

router.put(
  "/personalizacion",
  auth,
  async (req, res) => {
    try {

      // Todos los campos que permitimos modificar
      // desde el editor del perfil.

      const campos = [

        // Marco
        "marco",
        "marcoColor",

        // Banner
        "bannerPreset",
        "bannerColor1",
        "bannerColor2",

        // Estilo visual nuevo
        "bannerEstilo",
        "avatarEstilo",

        // Efectos
        "profundidad",
        "reflejo",
        "brillo",

        // Tema
        "tema",
        "temaColor",

        // Nombre
        "nombreEfecto",
        "nombreGradiente",
        "nombreColor",
        "gradColor1",
        "gradColor2",

        // Badge
        "badge"
      ];

      // ─────────────────────────────────────────
      // DOT NOTATION
      // ─────────────────────────────────────────
      //
      // Esto es importante:
      //
      // NO hacemos:
      //
      // $set: {
      //   personalizacion: {...}
      // }
      //
      // porque eso podría reemplazar otros ajustes.
      //
      // En cambio actualizamos cada propiedad
      // individualmente.

      const setUpdate = {};

      campos.forEach((campo) => {

        if (req.body[campo] !== undefined) {

          setUpdate[
            `personalizacion.${campo}`
          ] = req.body[campo];

        }

      });

      if (!Object.keys(setUpdate).length) {

        return res.status(400).json({
          mensaje: "Nada que actualizar"
        });

      }

      const usuario =
        await User.findByIdAndUpdate(
          req.usuario._id,

          {
            $set: setUpdate
          },

          {
            new: true,
            runValidators: false
          }
        ).select("-password");

      res.json({
        usuario
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        mensaje: "Error al guardar personalización"
      });
    }
  }
);

// ══════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════

module.exports = router;
