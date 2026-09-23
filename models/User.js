const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");


const userSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50
    },

    handle: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: [/^[a-zA-Z0-9_]+$/, "Handle inválido"]
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      maxlength: 100
    },

    password: {
      type: String,
      required: true
    },

    avatar: {
      type: String,
      default: ""
    },

    avatarTipo: {
      type: String,
      default: "imagen"
    },

    avatarCloudinaryId: {
      type: String,
      default: ""
    },

    avatarCloudinaryResourceType: {
      type: String,
      default: ""
    },

    // Banner subido por el usuario.
    // Puede ser PNG/JPG/WEBP o GIF animado.
    banner: {
      type: String,
      default: ""
    },

    bannerTipo: {
      type: String,
      default: "imagen"
    },

    bannerCloudinaryId: {
      type: String,
      default: ""
    },

    bannerCloudinaryResourceType: {
      type: String,
      default: ""
    },

    bio: {
      type: String,
      default: "",
      maxlength: 160
    },

    seguidores: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    ],

    siguiendo: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    ],

    personalizacion: {
      // Marco de avatar
      marco:       { type: String, default: "none" },
      marcoColor:  { type: String, default: "#5cdb6f" },

      // Banner por preset / colores
      bannerPreset: { type: String, default: "default" },
      bannerColor1: { type: String, default: "#0d2010" },
      bannerColor2: { type: String, default: "#1a3a14" },

      // Estilo visual premium
      bannerEstilo: { type: String, default: "normal" },
      avatarEstilo: { type: String, default: "normal" },
      profundidad:  { type: Boolean, default: true },
      profundidadNivel: { type: Number, min: 0, max: 100, default: 55 },
      reflejo:     { type: Boolean, default: true },
      brillo:      { type: Boolean, default: true },

      // Nombre
      nombreEfecto:   { type: String, default: "none" },
      nombreGradiente:{ type: String, default: "green-blue" },
      nombreColor:    { type: String, default: "#f0f0f0" },
      gradColor1:     { type: String, default: "#5cdb6f" },
      gradColor2:     { type: String, default: "#4dabf7" },

      // Badge
      badge: { type: String, default: "none" },

      // Tema
      temaColor: { type: String, default: "#5cdb6f" }
    }
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.compararPassword = function (c) {
  return bcrypt.compare(c, this.password);
};

module.exports = mongoose.model("User", userSchema);
