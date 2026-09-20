const express  = require("express");
const multer   = require("multer");
const Post     = require("../models/Post");
const Comment  = require("../models/Comment");
const auth     = require("../middleware/authMiddleware");
const { uploadFile, deleteFile } = require("../utils/gridfs");
const { crearNotificacion } = require("../utils/notifications");

const router = express.Router();

// Multer con memoryStorage (no toca el disco)
const upload = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg","image/png","image/gif","image/webp",
      "video/mp4","video/webm"
    ].includes(file.mimetype);
    cb(null, ok);
  }
});

// ── GET /api/posts ──
router.get("/", auth, async (req, res) => {
  try {
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite) || 20, 50);
    const skip   = (pagina - 1) * limite;

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limite)
      .populate("autor", "nombre handle avatar avatarTipo personalizacion")
      .lean();

    const result = await Promise.all(posts.map(async p => ({
      ...p,
      yaLike:        p.likes.some(id => id.toString() === req.usuario._id.toString()),
      totalLikes:    p.likes.length,
      totalComments: await Comment.countDocuments({ post: p._id })
    })));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al obtener posts" });
  }
});

// ── POST /api/posts ──
router.post("/", auth, upload.single("imagen"), async (req, res) => {
  try {
    const { texto, stickerUrl } = req.body;
    let imagen = null;

    if (req.file) {
      // Subir a GridFS → guardar URL interna
      const fileId = await uploadFile(req.file);
      imagen = `/api/images/${fileId}`;
    } else if (stickerUrl?.startsWith("https://")) {
      // Sticker IA: URL externa
      imagen = stickerUrl;
    }

    if (!texto?.trim() && !imagen)
      return res.status(400).json({ mensaje: "El post necesita texto o imagen" });

    if (texto && texto.length > 280)
      return res.status(400).json({ mensaje: "Máximo 280 caracteres" });

    const post = await Post.create({
      autor:  req.usuario._id,
      texto:  texto?.trim() || "",
      imagen
    });

    const populated = await post.populate(
      "autor", "nombre handle avatar avatarTipo personalizacion"
    );

    res.status(201).json({
      ...populated.toObject(),
      yaLike:        false,
      totalLikes:    0,
      totalComments: 0
    });
  } catch (err) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ mensaje: "Archivo máximo 5MB" });
    console.error(err);
    res.status(500).json({ mensaje: "Error al crear post" });
  }
});

// ── DELETE /api/posts/:id ──
router.delete("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post)
      return res.status(404).json({ mensaje: "Post no encontrado" });
    if (post.autor.toString() !== req.usuario._id.toString())
      return res.status(403).json({ mensaje: "No autorizado" });

    // Eliminar imagen de GridFS si es interna
    if (post.imagen?.startsWith("/api/images/"))
      await deleteFile(post.imagen);

    await post.deleteOne();
    await Comment.deleteMany({ post: req.params.id });

    res.json({ mensaje: "Post eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al eliminar" });
  }
});

// ── POST /api/posts/:id/like ──
router.post("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ mensaje: "No encontrado" });

    const uid = req.usuario._id.toString();
    const idx = post.likes.map(String).indexOf(uid);
    if (idx === -1) post.likes.push(req.usuario._id);
    else            post.likes.splice(idx, 1);

    await post.save();

    if (idx === -1) {
      try {
        await crearNotificacion({
          io: req.app.get("io"),
          receptor: post.autor,
          emisor: req.usuario._id,
          tipo: "like",
          post: post._id,
          texto: `${req.usuario.nombre} le dio me gusta a tu publicación`,
          url: `/index.html#post-${post._id}`
        });
      } catch (notifyError) {
        console.error("⚠️ Error creando notificación de like:", notifyError);
      }
    }

    res.json({ yaLike: idx === -1, totalLikes: post.likes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error" });
  }
});

// ── GET /api/posts/:id/comments ──
router.get("/:id/comments", auth, async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: 1 })
      .populate("autor", "nombre handle avatar avatarTipo personalizacion")
      .lean();

    res.json(comments.map(c => ({
      ...c,
      yaLike:     c.likes.some(id => id.toString() === req.usuario._id.toString()),
      totalLikes: c.likes.length
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al cargar comentarios" });
  }
});

// ── POST /api/posts/:id/comments ──
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto?.trim())
      return res.status(400).json({ mensaje: "Comentario vacío" });
    if (texto.length > 280)
      return res.status(400).json({ mensaje: "Máximo 280 caracteres" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ mensaje: "Post no encontrado" });

    const comment = await Comment.create({
      post:  req.params.id,
      autor: req.usuario._id,
      texto: texto.trim()
    });

    const populated = await comment.populate(
      "autor", "nombre handle avatar avatarTipo personalizacion"
    );

    try {
      await crearNotificacion({
        io: req.app.get("io"),
        receptor: post.autor,
        emisor: req.usuario._id,
        tipo: "comentario",
        post: post._id,
        comentario: comment._id,
        texto: texto.trim().slice(0, 160),
        url: `/index.html#post-${post._id}`
      });
    } catch (notifyError) {
      console.error("⚠️ Error creando notificación de comentario:", notifyError);
    }

    res.status(201).json({ ...populated.toObject(), yaLike: false, totalLikes: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al comentar" });
  }
});

// ── POST /api/posts/comments/:commentId/like ──
router.post("/comments/:commentId/like", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ mensaje: "No encontrado" });

    const uid = req.usuario._id.toString();
    const idx = comment.likes.map(String).indexOf(uid);
    if (idx === -1) comment.likes.push(req.usuario._id);
    else            comment.likes.splice(idx, 1);

    await comment.save();

    if (idx === -1) {
      try {
        await crearNotificacion({
          io: req.app.get("io"),
          receptor: comment.autor,
          emisor: req.usuario._id,
          tipo: "like_comentario",
          post: comment.post,
          comentario: comment._id,
          texto: `${req.usuario.nombre} le dio me gusta a tu comentario`,
          url: `/index.html#post-${comment.post}`
        });
      } catch (notifyError) {
        console.error("⚠️ Error creando notificación de like de comentario:", notifyError);
      }
    }

    res.json({ yaLike: idx === -1, totalLikes: comment.likes.length });
  } catch (err) {
    res.status(500).json({ mensaje: "Error" });
  }
});

module.exports = router;
