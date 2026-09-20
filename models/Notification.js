const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    receptor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    emisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    tipo: {
      type: String,
      enum: ["mensaje", "follow", "like", "comentario", "like_comentario"],
      required: true
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null
    },
    comentario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null
    },
    conversacion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null
    },
    texto: { type: String, default: "", maxlength: 300 },
    url:   { type: String, default: "", maxlength: 500 },
    leida: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

notificationSchema.index({ receptor: 1, createdAt: -1 });
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

module.exports = mongoose.model("Notification", notificationSchema);
