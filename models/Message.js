const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversacion: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    remitente:    { type: mongoose.Schema.Types.ObjectId, ref: "User",         required: true },
    contenido:    { type: String, required: true, trim: true, maxlength: 1000 },
    tipo:         { type: String, enum: ["texto", "llamada"], default: "texto" },
    llamadaId:    { type: String, default: null },
    llamadaTipo:  { type: String, enum: ["audio", "video"], default: null },
    llamadaEstado:{ type: String, enum: ["finalizada"], default: null },
    llamadaDuracion: { type: Number, default: 0, min: 0 },
    leido:        { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
