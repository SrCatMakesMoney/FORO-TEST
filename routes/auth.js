const express  = require("express");
const crypto    = require("crypto");
const multer   = require("multer");
const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const auth     = require("../middleware/authMiddleware");
const { uploadFile, deleteFile } = require("../utils/gridfs");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const router = express.Router();

// Multer memory storage para avatares
const uploadAvatar = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: 10 * 1024 * 1024 }, // imágenes/GIF hasta 10MB; video se limita abajo
  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg","image/png","image/gif","image/webp",
      "video/mp4","video/webm"
    ].includes(file.mimetype);
    cb(null, ok);
  }
});

const generarToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });

const avatarPorDefecto = (nombre) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(nombre)}`;

// ── POST /api/auth/register ──
router.post("/register", uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const { nombre, handle, email, password } = req.body;

    if (!nombre || !handle || !email || !password)
      return res.status(400).json({ mensaje: "Todos los campos son requeridos" });

    if (nombre.length < 2 || nombre.length > 50)
      return res.status(400).json({ mensaje: "Nombre: 2–50 caracteres" });

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle))
      return res.status(400).json({ mensaje: "Handle inválido (3–20 chars, solo letras/números/_)" });

    if (password.length < 6)
      return res.status(400).json({ mensaje: "Contraseña mínimo 6 caracteres" });

    const existe = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { handle: handle.toLowerCase() }]
    });
    if (existe) {
      return res.status(400).json({
        mensaje: existe.email === email.toLowerCase()
          ? "El email ya está registrado"
          : "El handle ya está en uso"
      });
    }

    // Avatar
    let avatar     = avatarPorDefecto(nombre);
    let avatarTipo = "imagen";

    if (req.file) {
      const fileId = await uploadFile(req.file);
      avatar       = `/api/images/${fileId}`;
      avatarTipo   = req.file.mimetype.startsWith("video/") ? "video" : "imagen";
    }

    const usuario = await User.create({
      nombre:  nombre.trim(),
      handle:  handle.trim().toLowerCase(),
      email:   email.trim().toLowerCase(),
      password,
      avatar,
      avatarTipo
    });

    res.status(201).json({
      token: generarToken(usuario._id),
      usuario: {
        _id:             usuario._id,
        nombre:          usuario.nombre,
        handle:          usuario.handle,
        avatar:          usuario.avatar,
        avatarTipo:      usuario.avatarTipo,
        personalizacion: usuario.personalizacion
      }
    });
  } catch (err) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ mensaje: "Imagen/GIF máximo 10MB" });
    console.error(err);
    res.status(500).json({ mensaje: "Error al registrar" });
  }
});

// ── POST /api/auth/login ──
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ mensaje: "Email y contraseña requeridos" });

    const usuario = await User.findOne({ email: email.toLowerCase() });
    if (!usuario || !(await usuario.compararPassword(password)))
      return res.status(401).json({ mensaje: "Credenciales incorrectas" });

    res.json({
      token: generarToken(usuario._id),
      usuario: {
        _id:             usuario._id,
        nombre:          usuario.nombre,
        handle:          usuario.handle,
        avatar:          usuario.avatar,
        avatarTipo:      usuario.avatarTipo,
        personalizacion: usuario.personalizacion
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al iniciar sesión" });
  }
});

// ── GET /api/auth/yo ──
router.get("/yo", auth, async (req, res) => {
  try {
    const usuario = await User.findById(req.usuario._id).select("-password");
    if (!usuario) return res.status(404).json({ mensaje: "No encontrado" });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ mensaje: "Error" });
  }
});

// ── PUT /api/auth/perfil ──
router.put("/perfil", auth, uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const { nombre, bio } = req.body;

    if (nombre && (nombre.length < 2 || nombre.length > 50))
      return res.status(400).json({ mensaje: "Nombre: 2–50 caracteres" });

    const update = {};
    if (nombre !== undefined) update.nombre = nombre.trim();
    if (bio    !== undefined) update.bio    = bio.trim().slice(0, 160);

    if (req.file) {
      if (req.file.mimetype.startsWith("video/") && req.file.size > 3 * 1024 * 1024)
        return res.status(400).json({ mensaje: "Los videos de avatar siguen limitados a 3MB" });

      // Borrar avatar viejo de GridFS si era interno
      const viejo = await User.findById(req.usuario._id).select("avatar");
      if (viejo?.avatar?.startsWith("/api/images/"))
        await deleteFile(viejo.avatar);

      const fileId   = await uploadFile(req.file);
      update.avatar    = `/api/images/${fileId}`;
      update.avatarTipo = req.file.mimetype.startsWith("video/") ? "video" : "imagen";
    }

    const usuario = await User.findByIdAndUpdate(
      req.usuario._id,
      { $set: update },
      { new: true }
    ).select("-password");

    res.json({
      usuario: {
        _id:             usuario._id,
        nombre:          usuario.nombre,
        handle:          usuario.handle,
        avatar:          usuario.avatar,
        avatarTipo:      usuario.avatarTipo,
        bio:             usuario.bio,
        personalizacion: usuario.personalizacion
      }
    });
  } catch (err) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ mensaje: "Imagen/GIF máximo 10MB" });
    console.error(err);
    res.status(500).json({ mensaje: "Error al actualizar perfil" });
  }
});

// ── POST /api/auth/personalizacion/signature ──
// Firma una subida DIRECTA de imágenes/GIFs del perfil a Cloudinary.
router.post("/personalizacion/signature", auth, async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ mensaje: "Cloudinary no está configurado en el servidor" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "foro-ubre/profiles";
    const publicId = `${folder}/${req.usuario._id}/${crypto.randomUUID()}`;

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, public_id: publicId },
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      signature,
      timestamp,
      folder,
      publicId,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME
    });
  } catch (err) {
    console.error("Cloudinary profile signature error:", err);
    res.status(500).json({ mensaje: "No se pudo preparar la subida" });
  }
});

// ── POST /api/auth/personalizacion/cleanup-upload ──
router.post("/personalizacion/cleanup-upload", auth, async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId || !publicId.startsWith(`foro-ubre/profiles/${req.usuario._id}/`)) {
      return res.status(400).json({ mensaje: "Public ID inválido" });
    }

    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Cloudinary profile cleanup error:", err);
    res.status(500).json({ mensaje: "No se pudo limpiar la subida" });
  }
});

// ── PUT /api/auth/personalizacion ──
router.put("/personalizacion", auth, async (req, res) => {
  try {
    const campos = [
      "marco", "marcoColor",
      "bannerPreset", "bannerColor1", "bannerColor2",
      "bannerUrl", "bannerTipo", "bannerPublicId",
      "nombreEfecto", "nombreGradiente", "nombreColor", "gradColor1", "gradColor2",
      "badge", "temaColor"
    ];

    // ✅ Dot notation → actualiza SOLO los campos enviados
    // ❌ Antes: $set: { personalizacion: { marco: "x" } } → borraba todo lo demás
    const setUpdate = {};
    campos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        setUpdate[`personalizacion.${campo}`] = req.body[campo];
      }
    });

    if (!Object.keys(setUpdate).length)
      return res.status(400).json({ mensaje: "Nada que actualizar" });

    const anterior = await User.findById(req.usuario._id).select("personalizacion.bannerPublicId");
    const oldPublicId = anterior?.personalizacion?.bannerPublicId || "";

    const usuario = await User.findByIdAndUpdate(
      req.usuario._id,
      { $set: setUpdate },
      { new: true, runValidators: false }
    ).select("-password");

    const newPublicId = usuario?.personalizacion?.bannerPublicId || "";
    if (oldPublicId && oldPublicId !== newPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, { resource_type: "image", invalidate: true });
      } catch (cleanupErr) {
        console.warn("No se pudo borrar el banner anterior:", cleanupErr.message);
      }
    }

    res.json({ usuario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al guardar personalización" });
  }
});

module.exports = router;
