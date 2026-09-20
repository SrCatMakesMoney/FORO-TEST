const express = require("express");
const User    = require("../models/User");
const Post    = require("../models/Post");
const auth    = require("../middleware/authMiddleware");
const { crearNotificacion } = require("../utils/notifications");

const router = express.Router();

// ── GET /api/profile/search?q= ── Buscar usuarios
router.get("/search", auth, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2)
      return res.json([]);

    const usuarios = await User.find({
      $or: [
        { nombre: { $regex: q, $options: "i" } },
        { handle: { $regex: q, $options: "i" } }
      ]
    })
      .select("nombre handle avatar avatarTipo seguidores")
      .limit(10)
      .lean();

    const resultado = usuarios.map(u => ({
      ...u,
      sigues: u.seguidores.some(id => id.toString() === req.usuario._id.toString()),
      totalSeguidores: u.seguidores.length
    }));

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al buscar" });
  }
});

// GET /api/profile/sugerencias
router.get("/sugerencias", auth, async (req, res) => {
  try {
    const yo = await User.findById(req.usuario._id).select("siguiendo");
    const excluir = [...(yo.siguiendo || []), req.usuario._id];

    const usuarios = await User.find({ _id: { $nin: excluir } })
      .select("nombre handle avatar avatarTipo personalizacion seguidores")
      .limit(5)
      .lean();

    res.json(usuarios.map(u => ({
      ...u,
      totalSeguidores: u.seguidores?.length || 0
    })));
  } catch(err) {
    res.status(500).json({ mensaje: "Error" });
  }
});

// ── GET /api/profile/:handle ── Ver perfil
router.get("/:handle", auth, async (req, res) => {
  try {
    const usuario = await User.findOne({ handle: req.params.handle.toLowerCase() })
      .select("-password")
      .populate("seguidores", "nombre handle avatar avatarTipo")
      .populate("siguiendo",  "nombre handle avatar avatarTipo")
      .lean();

    if (!usuario)
      return res.status(404).json({ mensaje: "Usuario no encontrado" });

    const posts = await Post.find({ autor: usuario._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate("autor", "nombre handle avatar avatarTipo")
      .lean();

    const postsConLike = posts.map(p => ({
      ...p,
      yaLike:     p.likes.some(id => id.toString() === req.usuario._id.toString()),
      totalLikes: p.likes.length
    }));

    res.json({
      usuario: {
        ...usuario,
        sigues:          usuario.seguidores.some(s => s._id.toString() === req.usuario._id.toString()),
        esTuPerfil:      usuario._id.toString() === req.usuario._id.toString(),
        totalSeguidores: usuario.seguidores.length,
        totalSiguiendo:  usuario.siguiendo.length
      },
      posts: postsConLike,
      totalPosts: postsConLike.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al obtener perfil" });
  }
});

// ── POST /api/profile/:id/follow ── Seguir / dejar de seguir
router.post("/:id/follow", auth, async (req, res) => {
  try {
    if (req.params.id === req.usuario._id.toString())
      return res.status(400).json({ mensaje: "No puedes seguirte a ti mismo" });

    const objetivo = await User.findById(req.params.id);
    if (!objetivo)
      return res.status(404).json({ mensaje: "Usuario no encontrado" });

    const yaSigue = objetivo.seguidores.includes(req.usuario._id);

    if (yaSigue) {
      // Dejar de seguir
      await User.findByIdAndUpdate(req.params.id,    { $pull: { seguidores: req.usuario._id } });
      await User.findByIdAndUpdate(req.usuario._id,  { $pull: { siguiendo:  req.params.id   } });
    } else {
      // Seguir
      await User.findByIdAndUpdate(req.params.id,    { $addToSet: { seguidores: req.usuario._id } });
      await User.findByIdAndUpdate(req.usuario._id,  { $addToSet: { siguiendo:  req.params.id   } });
    }

    const actualizado = await User.findById(req.params.id).select("seguidores");

    // Solo notificamos cuando empieza a seguir, no cuando deja de seguir.
    if (!yaSigue) {
      try {
        await crearNotificacion({
          io: req.app.get("io"),
          receptor: req.params.id,
          emisor: req.usuario._id,
          tipo: "follow",
          texto: `${req.usuario.nombre} empezó a seguirte`,
          url: `/profile.html?handle=${encodeURIComponent(req.usuario.handle)}`
        });
      } catch (notifyError) {
        console.error("⚠️ Error creando notificación de follow:", notifyError);
      }
    }

    res.json({
      sigues:          !yaSigue,
      totalSeguidores: actualizado.seguidores.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error al seguir" });
  }
});

module.exports = router;
