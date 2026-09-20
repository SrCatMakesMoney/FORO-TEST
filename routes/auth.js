const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const { uploadFile, deleteFile } = require("../utils/gridfs");

const router = express.Router();

// ══════════════════════════════════════════════
// MULTER
// ══════════════════════════════════════════════

const uploadPerfil = multer({
  storage: multer.memoryStorage(),

  limits: {
    // Banner máximo 8 MB.
    // Esto también permite que los avatares existentes
    // sigan funcionando.
    fileSize: 8 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const imagenes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp"
    ];

    const videos = [
      "video/mp4",
      "video/webm"
    ];

    // AVATAR:
    // conserva soporte para imágenes + GIF + video.
    if (file.fieldname === "avatar") {
      if (imagenes.includes(file.mimetype) || videos.includes(file.mimetype)) {
        return cb(null, true);
      }

      return cb(
        new Error(
          "El avatar debe ser JPG, PNG, GIF, WEBP, MP4 o WEBM"
        )
      );
    }

    // BANNER:
    // solamente imágenes, incluyendo GIF animado.
    if (file.fieldname === "banner") {
      if (imagenes.includes(file.mimetype)) {
        return cb(null, true);
      }

      return cb(
        new Error(
          "El banner debe ser JPG, PNG, GIF o WEBP"
        )
      );
    }

    cb(
      new Error(
        "Campo de archivo no permitido"
      )
    );
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
// REGISTER
// ══════════════════════════════════════════════

router.post(
  "/register",
  uploadPerfil.single("avatar"),
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

      // ══════════════════════════════════════════
      // AVATAR
      // ══════════════════════════════════════════

      let avatar = avatarPorDefecto(nombre);
      let avatarTipo = "imagen";

      if (req.file) {
        const fileId = await uploadFile(req.file);

        avatar = `/api/images/${fileId}`;

        if (req.file.mimetype === "image/gif") {
          avatarTipo = "gif";
        } else if (req.file.mimetype.startsWith("video/")) {
          avatarTipo = "video";
        } else {
          avatarTipo = "imagen";
        }
      }

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
          banner: usuario.banner || "",
          bannerTipo: usuario.bannerTipo || "",
          personalizacion: usuario.personalizacion
        }
      });

    } catch (err) {
      console.error("ERROR REGISTER:", err);

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          mensaje: "El archivo no puede superar los 8MB"
        });
      }

      if (err.message?.includes("avatar")) {
        return res.status(400).json({
          mensaje: err.message
        });
      }

      res.status(500).json({
        mensaje: "Error al registrar"
      });
    }
  }
);

// ══════════════════════════════════════════════
// LOGIN
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
          banner: usuario.banner || "",
          bannerTipo: usuario.bannerTipo || "",
          personalizacion: usuario.personalizacion
        }
      });

    } catch (err) {
      console.error("ERROR LOGIN:", err);

      res.status(500).json({
        mensaje: "Error al iniciar sesión"
      });
    }
  }
);

// ══════════════════════════════════════════════
// YO
// ══════════════════════════════════════════════

router.get(
  "/yo",
  auth,
  async (req, res) => {
    try {
      const usuario = await User.findById(
        req.usuario._id
      ).select("-password");

      if (!usuario) {
        return res.status(404).json({
          mensaje: "No encontrado"
        });
      }

      res.json(usuario);

    } catch (err) {
      console.error("ERROR YO:", err);

      res.status(500).json({
        mensaje: "Error"
      });
    }
  }
);

// ══════════════════════════════════════════════
// ACTUALIZAR PERFIL
// AVATAR + BANNER
// ══════════════════════════════════════════════

router.put(
  "/perfil",
  auth,

  uploadPerfil.fields([
    {
      name: "avatar",
      maxCount: 1
    },
    {
      name: "banner",
      maxCount: 1
    }
  ]),

  async (req, res) => {
    try {
      const {
        nombre,
        bio
      } = req.body;

      if (
        nombre &&
        (
          nombre.length < 2 ||
          nombre.length > 50
        )
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

      const archivos = req.files || {};

      // ══════════════════════════════════════════
      // AVATAR
      // ══════════════════════════════════════════

      const avatarFile = archivos.avatar?.[0];

      if (avatarFile) {
        const viejo = await User
          .findById(req.usuario._id)
          .select("avatar");

        if (
          viejo?.avatar?.startsWith("/api/images/")
        ) {
          await deleteFile(viejo.avatar);
        }

        const fileId = await uploadFile(
          avatarFile
        );

        update.avatar =
          `/api/images/${fileId}`;

        if (
          avatarFile.mimetype === "image/gif"
        ) {
          update.avatarTipo = "gif";
        } else if (
          avatarFile.mimetype.startsWith("video/")
        ) {
          update.avatarTipo = "video";
        } else {
          update.avatarTipo = "imagen";
        }
      }

      // ══════════════════════════════════════════
      // BANNER
      // ══════════════════════════════════════════

      const bannerFile = archivos.banner?.[0];

      if (bannerFile) {
        const viejo = await User
          .findById(req.usuario._id)
          .select("banner");

        // Borrar banner anterior de GridFS
        if (
          viejo?.banner?.startsWith("/api/images/")
        ) {
          try {
            await deleteFile(viejo.banner);
          } catch (deleteError) {
            console.error(
              "No se pudo borrar el banner anterior:",
              deleteError
            );
          }
        }

        const fileId = await uploadFile(
          bannerFile
        );

        update.banner =
          `/api/images/${fileId}`;

        update.bannerTipo =
          bannerFile.mimetype === "image/gif"
            ? "gif"
            : "imagen";
      }

      // ══════════════════════════════════════════
      // GUARDAR EN MONGODB
      // ══════════════════════════════════════════

      const usuario =
        await User.findByIdAndUpdate(
          req.usuario._id,

          {
            $set: update
          },

          {
            new: true,
            runValidators: true
          }
        ).select("-password");

      if (!usuario) {
        return res.status(404).json({
          mensaje: "Usuario no encontrado"
        });
      }

      console.log(
        "PERFIL ACTUALIZADO:",
        {
          usuario: usuario._id,
          banner: usuario.banner,
          bannerTipo: usuario.bannerTipo,
          avatar: usuario.avatar
        }
      );

      res.json({
        usuario: {
          _id: usuario._id,
          nombre: usuario.nombre,
          handle: usuario.handle,
          avatar: usuario.avatar,
          avatarTipo: usuario.avatarTipo,
          banner: usuario.banner || "",
          bannerTipo: usuario.bannerTipo || "",
          bio: usuario.bio,
          personalizacion:
            usuario.personalizacion
        }
      });

    } catch (err) {
      console.error(
        "ERROR ACTUALIZAR PERFIL:",
        err
      );

      if (
        err.code === "LIMIT_FILE_SIZE"
      ) {
        return res.status(400).json({
          mensaje:
            "El archivo no puede superar los 8MB"
        });
      }

      if (
        err.message?.includes(
          "banner"
        ) ||
        err.message?.includes(
          "JPG"
        ) ||
        err.message?.includes(
          "PNG"
        ) ||
        err.message?.includes(
          "GIF"
        ) ||
        err.message?.includes(
          "WEBP"
        )
      ) {
        return res.status(400).json({
          mensaje: err.message
        });
      }

      res.status(500).json({
        mensaje:
          "Error al actualizar perfil"
      });
    }
  }
);

// ══════════════════════════════════════════════
// PERSONALIZACIÓN
// ══════════════════════════════════════════════

router.put(
  "/personalizacion",
  auth,
  async (req, res) => {
    try {
      const campos = [

        "marco",
        "marcoColor",

        "bannerPreset",
        "bannerColor1",
        "bannerColor2",

        "bannerEstilo",
        "avatarEstilo",

        "profundidad",
        "reflejo",
        "brillo",

        "tema",
        "temaColor",

        "nombreEfecto",
        "nombreGradiente",
        "nombreColor",
        "gradColor1",
        "gradColor2",

        "badge"
      ];

      const setUpdate = {};

      campos.forEach(
        (campo) => {
          if (
            req.body[campo] !==
            undefined
          ) {
            setUpdate[
              `personalizacion.${campo}`
            ] = req.body[campo];
          }
        }
      );

      if (
        !Object.keys(setUpdate).length
      ) {
        return res.status(400).json({
          mensaje:
            "Nada que actualizar"
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
      console.error(
        "ERROR PERSONALIZACION:",
        err
      );

      res.status(500).json({
        mensaje:
          "Error al guardar personalización"
      });
    }
  }
);

module.exports = router;
