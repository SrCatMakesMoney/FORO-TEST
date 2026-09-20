const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

const SPOTIFY_AUTHORIZE = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";
const SCOPES = [
  "user-read-private",
  "user-read-currently-playing",
  "user-read-playback-state"
].join(" ");

function getRedirectUri(req) {
  if (process.env.SPOTIFY_REDIRECT_URI) return process.env.SPOTIFY_REDIRECT_URI;
  const proto = req.get("x-forwarded-proto") || req.protocol;
  return `${proto}://${req.get("host")}/api/spotify/callback`;
}

function requireConfig(res) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    res.status(503).json({
      mensaje: "Spotify todavía no está configurado en las variables de entorno."
    });
    return false;
  }
  return true;
}

function publicSpotify(s) {
  if (!s?.conectado) return null;
  return {
    conectado: true,
    id: s.id || "",
    displayName: s.displayName || "Spotify",
    url: s.url || "",
    imagen: s.imagen || "",
    mostrarAhora: s.mostrarAhora !== false
  };
}

async function refreshAccessToken(user) {
  if (!user.spotify?.refreshToken) throw new Error("No hay refresh token de Spotify");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: user.spotify.refreshToken
  });

  const response = await axios.post(SPOTIFY_TOKEN, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    auth: {
      username: process.env.SPOTIFY_CLIENT_ID,
      password: process.env.SPOTIFY_CLIENT_SECRET
    }
  });

  const data = response.data;
  const update = {
    "spotify.accessToken": data.access_token,
    "spotify.expiresAt": new Date(Date.now() + Math.max(30, data.expires_in || 3600) * 1000)
  };

  if (data.refresh_token) {
    update["spotify.refreshToken"] = data.refresh_token;
    user.spotify.refreshToken = data.refresh_token;
  }

  user.spotify.accessToken = data.access_token;
  user.spotify.expiresAt = update["spotify.expiresAt"];
  await User.updateOne({ _id: user._id }, { $set: update });

  return data.access_token;
}

async function getValidAccessToken(user) {
  if (!user.spotify?.conectado) throw new Error("Spotify no está conectado");
  const expires = user.spotify.expiresAt ? new Date(user.spotify.expiresAt).getTime() : 0;
  if (user.spotify.accessToken && expires > Date.now() + 60_000) {
    return user.spotify.accessToken;
  }
  return refreshAccessToken(user);
}

// Iniciar conexión Spotify
router.get("/connect", auth, (req, res) => {
  if (!requireConfig(res)) return;

  const payload = {
    uid: String(req.usuario._id),
    nonce: crypto.randomBytes(16).toString("hex")
  };
  const state = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "10m" });
  const redirectUri = getRedirectUri(req);

  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
    show_dialog: "true"
  });

  res.redirect(`${SPOTIFY_AUTHORIZE}?${params.toString()}`);
});

// Callback OAuth
router.get("/callback", async (req, res) => {
  try {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      return res.status(503).send("Spotify no está configurado.");
    }

    if (req.query.error) {
      return res.redirect(`/profile.html?spotify=cancelado`);
    }

    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Callback de Spotify incompleto.");

    const payload = jwt.verify(state, process.env.JWT_SECRET);
    const user = await User.findById(payload.uid);
    if (!user) return res.status(404).send("Usuario no encontrado.");

    const redirectUri = getRedirectUri(req);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: redirectUri
    });

    const tokenResponse = await axios.post(SPOTIFY_TOKEN, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      auth: {
        username: process.env.SPOTIFY_CLIENT_ID,
        password: process.env.SPOTIFY_CLIENT_SECRET
      }
    });

    const tokens = tokenResponse.data;
    const meResponse = await axios.get(`${SPOTIFY_API}/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const me = meResponse.data;

    const image = Array.isArray(me.images) && me.images.length ? me.images[0].url : "";
    const spotifyUrl = me.external_urls?.spotify || `https://open.spotify.com/user/${me.id}`;

    user.spotify = {
      conectado: true,
      id: me.id || "",
      displayName: me.display_name || me.id || "Spotify",
      url: spotifyUrl,
      imagen: image,
      mostrarAhora: user.spotify?.mostrarAhora !== false,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || user.spotify?.refreshToken || "",
      expiresAt: new Date(Date.now() + Math.max(30, tokens.expires_in || 3600) * 1000)
    };

    await user.save();

    res.redirect(`/profile.html?handle=${encodeURIComponent(user.handle)}&spotify=conectado`);
  } catch (err) {
    console.error("Spotify callback error:", err.response?.data || err.message || err);
    res.redirect(`/profile.html?spotify=error`);
  }
});

// Datos públicos de la conexión del usuario
router.get("/status/:handle", auth, async (req, res) => {
  try {
    const user = await User.findOne({ handle: req.params.handle.toLowerCase() }).select("spotify");
    if (!user) return res.status(404).json({ mensaje: "Usuario no encontrado" });
    res.json(publicSpotify(user.spotify));
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error obteniendo Spotify" });
  }
});

// Canción actual del usuario, sin exponer tokens
router.get("/current/:handle", auth, async (req, res) => {
  try {
    const user = await User.findOne({ handle: req.params.handle.toLowerCase() });
    if (!user || !user.spotify?.conectado) return res.json({ conectado: false, playing: false });
    if (user.spotify.mostrarAhora === false) return res.json({ conectado: true, playing: false, oculto: true });

    let accessToken = await getValidAccessToken(user);
    let response;

    try {
      response = await axios.get(`${SPOTIFY_API}/me/player/currently-playing`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (err) {
      if (err.response?.status === 401) {
        accessToken = await refreshAccessToken(user);
        response = await axios.get(`${SPOTIFY_API}/me/player/currently-playing`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      } else if (err.response?.status === 204) {
        return res.json({ conectado: true, playing: false });
      } else {
        throw err;
      }
    }

    if (!response?.data || !response.data.item) {
      return res.json({ conectado: true, playing: false });
    }

    const item = response.data.item;
    if (item.type !== "track") return res.json({ conectado: true, playing: false });

    res.json({
      conectado: true,
      playing: Boolean(response.data.is_playing),
      progressMs: response.data.progress_ms || 0,
      durationMs: item.duration_ms || 0,
      track: {
        id: item.id,
        name: item.name,
        artists: Array.isArray(item.artists) ? item.artists.map(a => a.name).join(", ") : "",
        album: item.album?.name || "",
        image: item.album?.images?.[0]?.url || "",
        url: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`
      }
    });
  } catch (err) {
    console.error("Spotify current error:", err.response?.data || err.message || err);
    if (err.response?.status === 401) return res.json({ conectado: true, playing: false });
    res.status(500).json({ mensaje: "No se pudo consultar Spotify" });
  }
});

// Mostrar/ocultar la canción actual
router.put("/visibility", auth, async (req, res) => {
  try {
    const mostrarAhora = req.body.mostrarAhora !== false;
    const user = await User.findByIdAndUpdate(
      req.usuario._id,
      { $set: { "spotify.mostrarAhora": mostrarAhora } },
      { new: true }
    ).select("spotify");

    res.json({ ok: true, spotify: publicSpotify(user.spotify) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error actualizando visibilidad" });
  }
});

// Desconectar Spotify y eliminar tokens
router.delete("/disconnect", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.usuario._id, {
      $set: {
        spotify: {
          conectado: false,
          id: "",
          displayName: "",
          url: "",
          imagen: "",
          mostrarAhora: true,
          accessToken: "",
          refreshToken: "",
          expiresAt: null
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: "Error desconectando Spotify" });
  }
});

module.exports = router;
