const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    nombre:   { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    handle:   { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 20, match: [/^[a-zA-Z0-9_]+$/, "Handle inválido"] },
    email:    { type: String, required: true, unique: true, lowercase: true, maxlength: 100 },
    password: { type: String, required: true },
    avatar:   { type: String, default: "" },
    avatarTipo: { type: String, default: "imagen" },
    bio:      { type: String, default: "", maxlength: 160 },
    seguidores: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    siguiendo:  [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ── Personalización ──
    personalizacion: {
      // Marco de avatar
      marco:       { type: String, default: "none" }, // none|color|neon|gold|rainbow|animated|dashed|doble
      marcoColor:  { type: String, default: "#5cdb6f" },

      // Banner
      bannerPreset: { type: String, default: "default" }, // default|purple|blue|sunset|ocean|fire|neon|custom
      bannerColor1: { type: String, default: "#0d2010" },
      bannerColor2: { type: String, default: "#1a3a14" },
      bannerUrl:    { type: String, default: "" },
      bannerTipo:   { type: String, default: "imagen" },
      bannerPublicId: { type: String, default: "" },

      // Nombre
      nombreEfecto:    { type: String, default: "none" }, // none|gradient|glow|neon|color|shadow
      nombreGradiente: { type: String, default: "green-blue" }, // green-blue|fire|purple|sunset|ocean|custom
      nombreColor:     { type: String, default: "#f0f0f0" },
      gradColor1:      { type: String, default: "#5cdb6f" },
      gradColor2:      { type: String, default: "#4dabf7" },

      // Badge
      badge: { type: String, default: "none" }, // none|verified|star|fire|crown|dev|new|vip

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
