const express  = require("express");
const multer   = require("multer");
const jwt      = require("jsonwebtoken");
const crypto    = require("crypto");
const { v2: cloudinary } = require("cloudinary");
const User     = require("../models/User");
const auth     = require("../middleware/authMiddleware");
const { uploadFile, deleteFile } = require("../utils/gridfs");

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============================================================
// UPLOADS DE PERFIL
// Avatar: conserva imagen + GIF + video como en la versión original.
// Banner: PNG/JPG/WEBP/GIF. Los videos NO se aceptan como banner.
// ============================================================
const uploadPerfil = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const imagenes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp"
    ];

    const videos = ["video/mp4", "video/webm"];

    if (file.fieldname === "banner") {
      return cb(null, imagenes.includes(file.mimetype));
    }

    if (file.fieldname === "avatar") {
      return cb(null, imagenes.includes(file.mimetype) || videos.includes(file.mimetype));
    }

    cb(null, false);
  }
});

const generarToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });

const avatarPorDefecto = (nombre) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(nombre)}`;

// ============================================================
// REGISTER
// ============================================================
router.post("/register", uploadPerfil.single("avatar"), async (req, res) => {
  try {
    const { nombre, handle, email, password } = req.body;

    if (!nombre || !handle || !email || !password)
      return res.status(400).json({ mensaje: "Todos los campos son requeridos" });

    if (nombre.length < 2 || nombre.length > 50)
      return res.status(400).json({ mensaje: "Nombre: 2–50 caracteres" });

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle))
      return res.status(400).json({ mensaje: "Handle inválido (3–20 chars, solo letras/números/_ )" });

    if (password.length < 6)
      return res.status(400).json({ mensaje: "Contraseña mínimo 6 caracteres" });

    const existe = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { handle: handle.toLowerCase() }
      ]
    });

    if (existe) {
      return res.status(400).json({
        mensaje: existe.email === email.toLowerCase()
          ? "El email ya está registrado"
          : "El handle ya está en uso"
      });
    }

    let avatar = avatarPorDefecto(nombre);
    let avatarTipo = "imagen";

    if (req.file) {
      const fileId = await uploadFile(req.file);
      avatar = `/api/images/${fileId}`;
      avatarTipo = req.file.mimetype.startsWith("video/") ? "video" : "imagen";
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
        bannerTipo: usuario.bannerTipo || "imagen",
        personalizacion: usuario.personalizacion
      }
    });
  } catch (err) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ mensaje: "El archivo puede pesar máximo 8MB" });

    console.error(err);
    res.status(500).json({ mensaje: "Error al registrar" });
  }
});

// ============================================================
// LOGIN
// ============================================================
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
        _id: usuario._id,
        nombre: usuario.nombre,
        handle: usuario.handle,
        avatar: usuario.avatar,
        avatarTipo: usuario.avatarTipo,
        banner: usuario.banner || "",
        bannerTipo: usuario.bannerTipo || "imagen",
        personalizacion: usuario.personalizacion
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al iniciar sesión" });
  }
});

// ============================================================
// YO
// ============================================================
router.get("/yo", auth, async (req, res) => {
  try {
    const usuario = await User.findById(req.usuario._id).select("-password");

    if (!usuario)
      return res.status(404).json({ mensaje: "No encontrado" });

    res.json(usuario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error" });
  }
});

// ============================================================
// MEDIA DE PERFIL — CLOUDINARY
// El archivo grande nunca pasa por Vercel: el navegador lo manda
// directamente a Cloudinary y el backend recibe solamente metadata.
// ============================================================
router.post("/perfil/media-signature", auth, async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ mensaje: "Cloudinary no está configurado en el servidor" });
    }

    const campo = String(req.body?.campo || "");
    if (!["avatar", "banner"].includes(campo)) {
      return res.status(400).json({ mensaje: "Media de perfil inválida" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `foro-ubre/perfiles/${req.usuario._id}/${campo}`;
    const publicId = `${folder}/${crypto.randomUUID()}`;
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

router.post("/perfil/media", auth, async (req, res) => {
  try {
    const { campo, secure_url, public_id, resource_type, format } = req.body || {};

    if (!["avatar", "banner"].includes(campo)) {
      return res.status(400).json({ mensaje: "Media de perfil inválida" });
    }
    if (!secure_url || !public_id || !resource_type) {
      return res.status(400).json({ mensaje: "Faltan datos de Cloudinary" });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ mensaje: "Cloudinary no está configurado" });
    }

    const expectedPrefix = `foro-ubre/perfiles/${req.usuario._id}/${campo}/`;
    if (!String(public_id).startsWith(expectedPrefix)) {
      return res.status(403).json({ mensaje: "Archivo no autorizado" });
    }

    const expectedResource = String(resource_type) === "video" ? "video" : "image";
    if (resource_type !== expectedResource) {
      return res.status(400).json({ mensaje: "Tipo de recurso inválido" });
    }

    const isVideo = expectedResource === "video";
    if (campo === "avatar" && !["image", "video"].includes(expectedResource)) {
      return res.status(400).json({ mensaje: "Tipo de avatar inválido" });
    }
    if (campo === "banner" && !["image", "video"].includes(expectedResource)) {
      return res.status(400).json({ mensaje: "Tipo de banner inválido" });
    }

    // Evita aceptar URLs que no pertenezcan al Cloudinary configurado.
    const cloudHost = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
    if (!String(secure_url).startsWith(cloudHost)) {
      return res.status(400).json({ mensaje: "URL de Cloudinary inválida" });
    }

    const viejo = await User.findById(req.usuario._id).select(
      "avatar avatarTipo banner bannerTipo avatarCloudinaryId avatarCloudinaryResourceType bannerCloudinaryId bannerCloudinaryResourceType"
    );
    if (!viejo) return res.status(404).json({ mensaje: "Usuario no encontrado" });

    const update = campo === "avatar"
      ? {
          avatar: secure_url,
          avatarTipo: isVideo ? "video" : "imagen",
          avatarCloudinaryId: public_id,
          avatarCloudinaryResourceType: expectedResource
        }
      : {
          banner: secure_url,
          bannerTipo: isVideo ? "video" : (String(format).toLowerCase() === "gif" ? "gif" : "imagen"),
          bannerCloudinaryId: public_id,
          bannerCloudinaryResourceType: expectedResource
        };

    const usuario = await User.findByIdAndUpdate(
      req.usuario._id,
      { $set: update },
      { new: true, runValidators: true }
    ).select("-password");

    if (!usuario) return res.status(404).json({ mensaje: "Usuario no encontrado" });

    // Borra el asset anterior de Cloudinary después de guardar el nuevo.
    const oldPublicId = campo === "avatar" ? viejo.avatarCloudinaryId : viejo.bannerCloudinaryId;
    const oldResource = campo === "avatar" ? viejo.avatarCloudinaryResourceType : viejo.bannerCloudinaryResourceType;
    if (oldPublicId && oldPublicId !== public_id) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, {
          resource_type: oldResource || "image",
          type: "upload",
          invalidate: true
        });
      } catch (e) {
        console.warn("No se pudo borrar el media anterior de Cloudinary:", e.message);
      }
    } else {
      // Compatibilidad con perfiles antiguos que todavía usan GridFS.
      const oldUrl = campo === "avatar" ? viejo.avatar : viejo.banner;
      if (oldUrl?.startsWith("/api/images/")) {
        try { await deleteFile(oldUrl); } catch (_) {}
      }
    }

    res.json({
      usuario: {
        _id: usuario._id,
        nombre: usuario.nombre,
        handle: usuario.handle,
        avatar: usuario.avatar,
        avatarTipo: usuario.avatarTipo,
        banner: usuario.banner || "",
        bannerTipo: usuario.bannerTipo || "imagen",
        bio: usuario.bio,
        personalizacion: usuario.personalizacion
      }
    });
  } catch (err) {
    console.error("Cloudinary profile media error:", err);
    res.status(500).json({ mensaje: "No se pudo guardar el archivo" });
  }
});

router.post("/perfil/media-cleanup", auth, async (req, res) => {
  try {
    const publicId = String(req.body?.public_id || "");
    const resourceType = req.body?.resource_type === "video" ? "video" : "image";
    const expectedPrefix = `foro-ubre/perfiles/${req.usuario._id}/`;
    if (!publicId || !publicId.startsWith(expectedPrefix)) {
      return res.status(403).json({ mensaje: "No autorizado" });
    }
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "upload",
      invalidate: true
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Cloudinary profile cleanup error:", err);
    res.status(500).json({ ok: false });
  }
});

// ============================================================
// PERFIL
// Acepta avatar y/o banner en la misma petición.
// ============================================================
router.put(
  "/perfil",
  auth,
  uploadPerfil.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banner", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { nombre, bio } = req.body;
      const avatarFile = req.files?.avatar?.[0];
      const bannerFile = req.files?.banner?.[0];

      if (nombre && (nombre.length < 2 || nombre.length > 50))
        return res.status(400).json({ mensaje: "Nombre: 2–50 caracteres" });

      const update = {};

      if (nombre !== undefined)
        update.nombre = nombre.trim();

      if (bio !== undefined)
        update.bio = bio.trim().slice(0, 160);

      // --------------------------------------------------------
      // AVATAR
      // --------------------------------------------------------
      if (avatarFile) {
        const viejo = await User.findById(req.usuario._id).select("avatar");

        if (viejo?.avatar?.startsWith("/api/images/")) {
          try {
            await deleteFile(viejo.avatar);
          } catch (e) {
            console.warn("No se pudo borrar el avatar anterior:", e.message);
          }
        }

        const fileId = await uploadFile(avatarFile);

        update.avatar = `/api/images/${fileId}`;
        update.avatarTipo = avatarFile.mimetype.startsWith("video/")
          ? "video"
          : "imagen";
      }

      // --------------------------------------------------------
      // BANNER
      // --------------------------------------------------------
      if (bannerFile) {
        const viejo = await User.findById(req.usuario._id).select("banner");

        if (viejo?.banner?.startsWith("/api/images/")) {
          try {
            await deleteFile(viejo.banner);
          } catch (e) {
            console.warn("No se pudo borrar el banner anterior:", e.message);
          }
        }

        const fileId = await uploadFile(bannerFile);

        update.banner = `/api/images/${fileId}`;
        update.bannerTipo = bannerFile.mimetype === "image/gif"
          ? "gif"
          : "imagen";
      }

      const usuario = await User.findByIdAndUpdate(
        req.usuario._id,
        { $set: update },
        { new: true, runValidators: true }
      ).select("-password");

      if (!usuario)
        return res.status(404).json({ mensaje: "Usuario no encontrado" });

      res.json({
        usuario: {
          _id: usuario._id,
          nombre: usuario.nombre,
          handle: usuario.handle,
          avatar: usuario.avatar,
          avatarTipo: usuario.avatarTipo,
          banner: usuario.banner || "",
          bannerTipo: usuario.bannerTipo || "imagen",
          bio: usuario.bio,
          personalizacion: usuario.personalizacion
        }
      });
    } catch (err) {
      if (err.code === "LIMIT_FILE_SIZE")
        return res.status(400).json({ mensaje: "El archivo puede pesar máximo 8MB" });

      console.error(err);
      res.status(500).json({ mensaje: "Error al actualizar perfil" });
    }
  }
);

// ============================================================
// PERSONALIZACIÓN
// ============================================================
router.put("/personalizacion", auth, async (req, res) => {
  try {
    const campos = [
      "marco", "marcoColor",
      "bannerPreset", "bannerColor1", "bannerColor2",
      "nombreEfecto", "nombreGradiente", "nombreColor", "gradColor1", "gradColor2",
      "badge", "temaColor",
      "bannerEstilo", "avatarEstilo", "profundidad", "reflejo", "brillo"
    ];

    const setUpdate = {};

    campos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        setUpdate[`personalizacion.${campo}`] = req.body[campo];
      }
    });

    if (!Object.keys(setUpdate).length)
      return res.status(400).json({ mensaje: "Nada que actualizar" });

    const usuario = await User.findByIdAndUpdate(
      req.usuario._id,
      { $set: setUpdate },
      { new: true, runValidators: false }
    ).select("-password");

    res.json({ usuario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al guardar personalización" });
  }
});

module.exports = router;
