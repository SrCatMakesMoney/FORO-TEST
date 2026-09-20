const express      = require("express");
const crypto       = require("crypto");
const Video        = require("../models/Video");
const VideoComment = require("../models/VideoComment");
const User         = require("../models/User");
const auth         = require("../middleware/authMiddleware");
const { deleteFile } = require("../utils/gridfs");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const router = express.Router();

// ── Helpers ──
const withMeta = (v, uid) => ({
  ...v,
  yaLike:           v.likes.some(id => id.toString() === uid),
  yaCompartio:      v.compartidos.some(id => id.toString() === uid),
  totalLikes:       v.likes.length,
  totalCompartidos: v.compartidos.length
});

// ── GET /api/videos ── feed
router.get("/", auth, async (req, res) => {
  try {
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite) || 10, 30);

    const videos = await Video.find()
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .populate("autor", "nombre handle avatar avatarTipo personalizacion")
      .lean();

    const uid = req.usuario._id.toString();

    const result = await Promise.all(
      videos.map(async v => ({
        ...withMeta(v, uid),
        totalComments: await VideoComment.countDocuments({
          video: v._id
        })
      }))
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error" });
  }
});

// ── GET /api/videos/user/:handle ──
router.get("/user/:handle", auth, async (req, res) => {
  try {
    const user = await User.findOne({
      handle: req.params.handle.toLowerCase()
    });

    if (!user) {
      return res.status(404).json({
        mensaje: "Usuario no encontrado"
      });
    }

    const videos = await Video.find({
      autor: user._id
    })
      .sort({ createdAt: -1 })
      .populate(
        "autor",
        "nombre handle avatar avatarTipo personalizacion"
      )
      .lean();

    const uid = req.usuario._id.toString();

    res.json(
      videos.map(v => ({
        ...withMeta(v, uid),
        totalComments: 0
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({
      mensaje: "Error"
    });
  }
});

// ── GET /api/videos/compartidos/:handle ──
router.get("/compartidos/:handle", auth, async (req, res) => {
  try {
    const user = await User.findOne({
      handle: req.params.handle.toLowerCase()
    });

    if (!user) {
      return res.status(404).json({
        mensaje: "Usuario no encontrado"
      });
    }

    const videos = await Video.find({
      compartidos: user._id
    })
      .sort({ createdAt: -1 })
      .populate(
        "autor",
        "nombre handle avatar avatarTipo personalizacion"
      )
      .lean();

    const uid = req.usuario._id.toString();

    res.json(
      videos.map(v => ({
        ...withMeta(v, uid),
        totalComments: 0
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({
      mensaje: "Error"
    });
  }
});

// ── POST /api/videos/comments/:commentId/like ──
router.post("/comments/:commentId/like", auth, async (req, res) => {
  try {
    const comment = await VideoComment.findById(
      req.params.commentId
    );

    if (!comment) {
      return res.status(404).json({
        mensaje: "No encontrado"
      });
    }

    const uid = req.usuario._id.toString();
    const idx = comment.likes.map(String).indexOf(uid);

    if (idx === -1) {
      comment.likes.push(req.usuario._id);
    } else {
      comment.likes.splice(idx, 1);
    }

    await comment.save();

    res.json({
      yaLike: idx === -1,
      totalLikes: comment.likes.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      mensaje: "Error"
    });
  }
});

// ── POST /api/videos/signature ──
// Genera una firma para subir DIRECTAMENTE a Cloudinary.
// El video nunca pasa por Vercel.
router.post("/signature", auth, async (req, res) => {
  try {
    if (
      !process.env.CLOUDINARY_API_SECRET ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_CLOUD_NAME
    ) {
      return res.status(500).json({
        mensaje: "Cloudinary no está configurado en el servidor"
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const folder = "foro-ubre/videos";

    const publicId =
      `${folder}/${req.usuario._id}/${crypto.randomUUID()}`;

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
        public_id: publicId
      },
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
    console.error(
      "Cloudinary signature error:",
      err
    );

    res.status(500).json({
      mensaje: "No se pudo preparar la subida"
    });
  }
});

// ── POST /api/videos/cleanup-upload ──
// Borra de Cloudinary si MongoDB falla después de subir.
router.post("/cleanup-upload", auth, async (req, res) => {
  try {
    const publicId = String(
      req.body?.public_id || ""
    );

    const ownPrefix =
      `foro-ubre/videos/${req.usuario._id}/`;

    if (
      !publicId ||
      !publicId.startsWith(ownPrefix)
    ) {
      return res.status(403).json({
        mensaje: "No autorizado"
      });
    }

    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: "video",
        type: "upload",
        invalidate: true
      }
    );

    res.json({
      ok: true
    });
  } catch (err) {
    console.error(
      "Cloudinary cleanup error:",
      err
    );

    res.status(500).json({
      ok: false
    });
  }
});

// ── POST /api/videos ──
// Guarda SOLO los datos del video.
// El archivo ya fue subido directamente a Cloudinary.
router.post("/", auth, async (req, res) => {
  try {
    const {
      secure_url,
      url,
      public_id,
      resource_type,
      format,
      duration
    } = req.body || {};

    const cloudUrl = secure_url || url;

    if (!cloudUrl || !public_id) {
      return res.status(400).json({
        mensaje: "Faltan los datos del video"
      });
    }

    if (
      resource_type &&
      resource_type !== "video"
    ) {
      return res.status(400).json({
        mensaje: "El archivo no es un video"
      });
    }

    const expectedPrefix =
      `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/`;

    if (!cloudUrl.startsWith(expectedPrefix)) {
      return res.status(400).json({
        mensaje: "URL de video no válida"
      });
    }

    if (
      !public_id.startsWith(
        "foro-ubre/videos/"
      )
    ) {
      return res.status(400).json({
        mensaje: "Video no válido"
      });
    }

    const descripcion =
      (req.body.descripcion || "")
        .trim()
        .slice(0, 300);

    const video = await Video.create({
      autor: req.usuario._id,

      url: cloudUrl,

      descripcion,

      cloudinaryPublicId:
        public_id,

      cloudinaryResourceType:
        resource_type || "video",

      cloudinaryFormat:
        format || null,

      cloudinaryDuration:
        Number.isFinite(Number(duration))
          ? Number(duration)
          : null
    });

    const populated =
      await video.populate(
        "autor",
        "nombre handle avatar avatarTipo personalizacion"
      );

    res.status(201).json({
      ...populated.toObject(),

      yaLike: false,

      yaCompartio: false,

      totalLikes: 0,

      totalCompartidos: 0,

      totalComments: 0
    });
  } catch (err) {
    console.error(
      "Error guardando video:",
      err
    );

    res.status(500).json({
      mensaje: "No se pudo publicar el video"
    });
  }
});

// ── DELETE /api/videos/:id ──
router.delete("/:id", auth, async (req, res) => {
  try {
    const video = await Video.findById(
      req.params.id
    );

    if (!video) {
      return res.status(404).json({
        mensaje: "No encontrado"
      });
    }

    if (
      video.autor.toString() !==
      req.usuario._id.toString()
    ) {
      return res.status(403).json({
        mensaje: "No autorizado"
      });
    }

    // Videos nuevos: Cloudinary
    if (video.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(
        video.cloudinaryPublicId,
        {
          resource_type:
            video.cloudinaryResourceType ||
            "video",

          type: "upload",

          invalidate: true
        }
      );
    }

    // Videos antiguos: GridFS
    else if (
      video.url?.startsWith("/api/images/")
    ) {
      await deleteFile(video.url);
    }

    await video.deleteOne();

    await VideoComment.deleteMany({
      video: req.params.id
    });

    res.json({
      mensaje: "Eliminado"
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});

// ── POST /api/videos/:id/like ──
router.post("/:id/like", auth, async (req, res) => {
  try {
    const video = await Video.findById(
      req.params.id
    );

    if (!video) {
      return res.status(404).json({
        mensaje: "No encontrado"
      });
    }

    const uid =
      req.usuario._id.toString();

    const idx =
      video.likes.map(String).indexOf(uid);

    if (idx === -1) {
      video.likes.push(
        req.usuario._id
      );
    } else {
      video.likes.splice(idx, 1);
    }

    await video.save();

    res.json({
      yaLike: idx === -1,
      totalLikes:
        video.likes.length
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});

// ── POST /api/videos/:id/share ──
router.post("/:id/share", auth, async (req, res) => {
  try {
    const video = await Video.findById(
      req.params.id
    );

    if (!video) {
      return res.status(404).json({
        mensaje: "No encontrado"
      });
    }

    const uid =
      req.usuario._id.toString();

    if (
      !video.compartidos
        .map(String)
        .includes(uid)
    ) {
      video.compartidos.push(
        req.usuario._id
      );
    }

    await video.save();

    res.json({
      yaCompartio: true,

      totalCompartidos:
        video.compartidos.length
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});

// ── POST /api/videos/:id/view ──
router.post("/:id/view", auth, async (req, res) => {
  try {
    await Video.findByIdAndUpdate(
      req.params.id,
      {
        $inc: {
          reproducciones: 1
        }
      }
    );

    res.json({
      ok: true
    });
  } catch (_) {
    res.json({
      ok: false
    });
  }
});

// ── GET /api/videos/:id/comments ──
router.get("/:id/comments", auth, async (req, res) => {
  try {
    const comments =
      await VideoComment.find({
        video: req.params.id
      })
        .sort({ createdAt: 1 })
        .populate(
          "autor",
          "nombre handle avatar avatarTipo personalizacion"
        )
        .lean();

    const uid =
      req.usuario._id.toString();

    res.json(
      comments.map(c => ({
        ...c,

        yaLike:
          c.likes.some(
            id =>
              id.toString() === uid
          ),

        totalLikes:
          c.likes.length
      }))
    );
  } catch (err) {
    console.error(err);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});

// ── POST /api/videos/:id/comments ──
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const { texto } =
      req.body;

    if (!texto?.trim()) {
      return res.status(400).json({
        mensaje: "Vacío"
      });
    }

    if (texto.length > 280) {
      return res.status(400).json({
        mensaje: "Máximo 280"
      });
    }

    const comment =
      await VideoComment.create({
        video: req.params.id,

        autor:
          req.usuario._id,

        texto:
          texto.trim()
      });

    const populated =
      await comment.populate(
        "autor",
        "nombre handle avatar avatarTipo personalizacion"
      );

    res.status(201).json({
      ...populated.toObject(),

      yaLike: false,

      totalLikes: 0
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});

module.exports = router;
