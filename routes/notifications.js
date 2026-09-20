const express = require("express");

const Notification = require("../models/Notification");

const auth = require("../middleware/authMiddleware");

const router = express.Router();


// ============================================================
// GET /api/notifications
// ============================================================

router.get("/", auth, async (req, res) => {
  try {
    const limite = Math.min(
      parseInt(req.query.limite) || 30,
      50
    );

    const notifications =
      await Notification.find({
        receptor: req.usuario._id
      })
        .sort({ createdAt: -1 })
        .limit(limite)
        .populate(
          "emisor",
          "nombre handle avatar avatarTipo personalizacion"
        )
        .lean();

    res.json(notifications);

  } catch (error) {

    console.error(
      "Error obteniendo notificaciones:",
      error
    );

    res.status(500).json({
      mensaje: "Error al obtener notificaciones"
    });
  }
});


// ============================================================
// GET /api/notifications/count
// ============================================================

router.get("/count", auth, async (req, res) => {
  try {

    const count =
      await Notification.countDocuments({
        receptor: req.usuario._id,
        leida: false
      });

    res.json({
      count
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});


// ============================================================
// PUT /api/notifications/:id/read
// ============================================================

router.put("/:id/read", auth, async (req, res) => {
  try {

    const notification =
      await Notification.findOneAndUpdate(
        {
          _id: req.params.id,
          receptor: req.usuario._id
        },
        {
          $set: {
            leida: true
          }
        },
        {
          new: true
        }
      );

    if (!notification) {
      return res.status(404).json({
        mensaje: "Notificación no encontrada"
      });
    }

    res.json({
      ok: true
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});


// ============================================================
// PUT /api/notifications/read-all
// ============================================================

router.put("/read-all", auth, async (req, res) => {
  try {

    await Notification.updateMany(
      {
        receptor: req.usuario._id,
        leida: false
      },
      {
        $set: {
          leida: true
        }
      }
    );

    res.json({
      ok: true
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});


// ============================================================
// DELETE /api/notifications/:id
// ============================================================

router.delete("/:id", auth, async (req, res) => {
  try {

    await Notification.deleteOne({
      _id: req.params.id,
      receptor: req.usuario._id
    });

    res.json({
      ok: true
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      mensaje: "Error"
    });
  }
});


module.exports = router;
