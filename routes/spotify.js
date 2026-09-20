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


// ============================================================
// REDIRECT URI
// ============================================================

function getRedirectUri(req) {
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }

  const proto =
    req.get("x-forwarded-proto") ||
    req.protocol;

  return `${proto}://${req.get("host")}/api/spotify/callback`;
}


// ============================================================
// CONFIGURACIÓN
// ============================================================

function requireConfig(res) {
  if (
    !process.env.SPOTIFY_CLIENT_ID ||
    !process.env.SPOTIFY_CLIENT_SECRET
  ) {
    res.status(503).json({
      mensaje:
        "Spotify todavía no está configurado en las variables de entorno."
    });

    return false;
  }

  return true;
}


// ============================================================
// DATOS PÚBLICOS DE SPOTIFY
// ============================================================

function publicSpotify(s) {
  if (!s?.conectado) {
    return null;
  }

  return {
    conectado: true,
    id: s.id || "",
    displayName: s.displayName || "Spotify",
    url: s.url || "",
    imagen: s.imagen || "",
    mostrarAhora: s.mostrarAhora !== false
  };
}


// ============================================================
// REFRESCAR ACCESS TOKEN
// ============================================================

async function refreshAccessToken(user) {
  if (!user.spotify?.refreshToken) {
    throw new Error(
      "No hay refresh token de Spotify"
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: user.spotify.refreshToken
  });

  const response = await axios.post(
    SPOTIFY_TOKEN,
    body.toString(),
    {
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      auth: {
        username:
          process.env.SPOTIFY_CLIENT_ID,

        password:
          process.env.SPOTIFY_CLIENT_SECRET
      }
    }
  );

  const data = response.data;

  const expiresAt = new Date(
    Date.now() +
      Math.max(
        30,
        data.expires_in || 3600
      ) *
        1000
  );

  const update = {
    "spotify.accessToken":
      data.access_token,

    "spotify.expiresAt":
      expiresAt
  };

  if (data.refresh_token) {
    update["spotify.refreshToken"] =
      data.refresh_token;

    user.spotify.refreshToken =
      data.refresh_token;
  }

  user.spotify.accessToken =
    data.access_token;

  user.spotify.expiresAt =
    expiresAt;

  await User.updateOne(
    { _id: user._id },
    { $set: update }
  );

  return data.access_token;
}


// ============================================================
// OBTENER TOKEN VÁLIDO
// ============================================================

async function getValidAccessToken(user) {
  if (!user.spotify?.conectado) {
    throw new Error(
      "Spotify no está conectado"
    );
  }

  const expires = user.spotify.expiresAt
    ? new Date(
        user.spotify.expiresAt
      ).getTime()
    : 0;

  if (
    user.spotify.accessToken &&
    expires > Date.now() + 60_000
  ) {
    return user.spotify.accessToken;
  }

  return refreshAccessToken(user);
}


// ============================================================
// CONECTAR SPOTIFY
// ============================================================
//
// IMPORTANTE:
// El frontend ahora hace fetch() con Authorization.
// Este endpoint devuelve la URL de Spotify en JSON.
// Ya NO hacemos res.redirect() directamente.
//

router.get(
  "/connect",
  auth,
  (req, res) => {
    if (!requireConfig(res)) {
      return;
    }

    try {
      const payload = {
        uid: String(req.usuario._id),

        nonce:
          crypto
            .randomBytes(16)
            .toString("hex")
      };

      const state = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        {
          expiresIn: "10m"
        }
      );

      const redirectUri =
        getRedirectUri(req);

      const params =
        new URLSearchParams({
          client_id:
            process.env.SPOTIFY_CLIENT_ID,

          response_type: "code",

          redirect_uri:
            redirectUri,

          state,

          scope: SCOPES,

          show_dialog: "true"
        });

      const url =
        `${SPOTIFY_AUTHORIZE}?${params.toString()}`;

      return res.json({
        ok: true,
        url
      });
    } catch (err) {
      console.error(
        "Spotify connect error:",
        err
      );

      return res.status(500).json({
        mensaje:
          "No se pudo iniciar la conexión con Spotify"
      });
    }
  }
);


// ============================================================
// CALLBACK DE SPOTIFY
// ============================================================

router.get(
  "/callback",
  async (req, res) => {
    try {
      if (
        !process.env.SPOTIFY_CLIENT_ID ||
        !process.env.SPOTIFY_CLIENT_SECRET
      ) {
        return res
          .status(503)
          .send(
            "Spotify no está configurado."
          );
      }


      // --------------------------------------------------------
      // Usuario canceló
      // --------------------------------------------------------

      if (req.query.error) {
        return res.redirect(
          `/profile.html?spotify=cancelado`
        );
      }


      // --------------------------------------------------------
      // Código y state
      // --------------------------------------------------------

      const {
        code,
        state
      } = req.query;

      if (!code || !state) {
        return res
          .status(400)
          .send(
            "Callback de Spotify incompleto."
          );
      }


      // --------------------------------------------------------
      // Verificar STATE
      // --------------------------------------------------------

      const payload =
        jwt.verify(
          state,
          process.env.JWT_SECRET
        );

      if (!payload?.uid) {
        return res
          .status(400)
          .send(
            "State de Spotify inválido."
          );
      }


      // --------------------------------------------------------
      // Buscar usuario
      // --------------------------------------------------------

      const user =
        await User.findById(
          payload.uid
        );

      if (!user) {
        return res
          .status(404)
          .send(
            "Usuario no encontrado."
          );
      }


      // --------------------------------------------------------
      // URI
      // --------------------------------------------------------

      const redirectUri =
        getRedirectUri(req);


      // --------------------------------------------------------
      // Intercambiar CODE por tokens
      // --------------------------------------------------------

      const body =
        new URLSearchParams({
          grant_type:
            "authorization_code",

          code: String(code),

          redirect_uri:
            redirectUri
        });


      const tokenResponse =
        await axios.post(
          SPOTIFY_TOKEN,
          body.toString(),
          {
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            auth: {
              username:
                process.env.SPOTIFY_CLIENT_ID,

              password:
                process.env.SPOTIFY_CLIENT_SECRET
            }
          }
        );


      const tokens =
        tokenResponse.data;


      // --------------------------------------------------------
      // Obtener información del usuario Spotify
      // --------------------------------------------------------

      const meResponse =
        await axios.get(
          `${SPOTIFY_API}/me`,
          {
            headers: {
              Authorization:
                `Bearer ${tokens.access_token}`
            }
          }
        );


      const me =
        meResponse.data;


      // --------------------------------------------------------
      // Imagen
      // --------------------------------------------------------

      const image =
        Array.isArray(me.images) &&
        me.images.length
          ? me.images[0].url
          : "";


      // --------------------------------------------------------
      // URL pública
      // --------------------------------------------------------

      const spotifyUrl =
        me.external_urls?.spotify ||
        `https://open.spotify.com/user/${me.id}`;


      // --------------------------------------------------------
      // Guardar conexión
      // --------------------------------------------------------

      user.spotify = {
        conectado: true,

        id:
          me.id || "",

        displayName:
          me.display_name ||
          me.id ||
          "Spotify",

        url:
          spotifyUrl,

        imagen:
          image,

        mostrarAhora:
          user.spotify?.mostrarAhora !== false,

        accessToken:
          tokens.access_token,

        refreshToken:
          tokens.refresh_token ||
          user.spotify?.refreshToken ||
          "",

        expiresAt:
          new Date(
            Date.now() +
              Math.max(
                30,
                tokens.expires_in ||
                  3600
              ) *
                1000
          )
      };


      await user.save();


      // --------------------------------------------------------
      // Volver al perfil
      // --------------------------------------------------------

      return res.redirect(
        `/profile.html?handle=${encodeURIComponent(
          user.handle
        )}&spotify=conectado`
      );

    } catch (err) {
      console.error(
        "Spotify callback error:",
        err.response?.data ||
          err.message ||
          err
      );

      return res.redirect(
        `/profile.html?spotify=error`
      );
    }
  }
);


// ============================================================
// STATUS PÚBLICO
// ============================================================

router.get(
  "/status/:handle",
  auth,
  async (req, res) => {
    try {
      const user =
        await User.findOne({
          handle:
            req.params.handle.toLowerCase()
        }).select("spotify");

      if (!user) {
        return res.status(404).json({
          mensaje:
            "Usuario no encontrado"
        });
      }

      return res.json(
        publicSpotify(
          user.spotify
        )
      );

    } catch (err) {
      console.error(
        "Spotify status error:",
        err
      );

      return res.status(500).json({
        mensaje:
          "Error obteniendo Spotify"
      });
    }
  }
);


// ============================================================
// CANCIÓN ACTUAL
// ============================================================

router.get(
  "/current/:handle",
  auth,
  async (req, res) => {
    try {
      const user =
        await User.findOne({
          handle:
            req.params.handle.toLowerCase()
        });

      if (
        !user ||
        !user.spotify?.conectado
      ) {
        return res.json({
          conectado: false,
          playing: false
        });
      }


      if (
        user.spotify.mostrarAhora === false
      ) {
        return res.json({
          conectado: true,
          playing: false,
          oculto: true
        });
      }


      let accessToken =
        await getValidAccessToken(
          user
        );

      let response;


      try {
        response =
          await axios.get(
            `${SPOTIFY_API}/me/player/currently-playing`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`
              }
            }
          );

      } catch (err) {

        // ------------------------------------------------------
        // Token expirado
        // ------------------------------------------------------

        if (
          err.response?.status === 401
        ) {
          accessToken =
            await refreshAccessToken(
              user
            );

          response =
            await axios.get(
              `${SPOTIFY_API}/me/player/currently-playing`,
              {
                headers: {
                  Authorization:
                    `Bearer ${accessToken}`
                }
              }
            );

        // ------------------------------------------------------
        // Spotify no está reproduciendo
        // ------------------------------------------------------

        } else if (
          err.response?.status === 204
        ) {
          return res.json({
            conectado: true,
            playing: false
          });

        } else {
          throw err;
        }
      }


      // --------------------------------------------------------
      // Sin canción
      // --------------------------------------------------------

      if (
        !response?.data ||
        !response.data.item
      ) {
        return res.json({
          conectado: true,
          playing: false
        });
      }


      const item =
        response.data.item;


      if (
        item.type !== "track"
      ) {
        return res.json({
          conectado: true,
          playing: false
        });
      }


      // --------------------------------------------------------
      // Respuesta
      // --------------------------------------------------------

      return res.json({
        conectado: true,

        playing:
          Boolean(
            response.data.is_playing
          ),

        progressMs:
          response.data.progress_ms ||
          0,

        durationMs:
          item.duration_ms ||
          0,

        track: {
          id:
            item.id,

          name:
            item.name,

          artists:
            Array.isArray(
              item.artists
            )
              ? item.artists
                  .map(
                    a => a.name
                  )
                  .join(", ")
              : "",

          album:
            item.album?.name ||
            "",

          image:
            item.album?.images?.[0]
              ?.url ||
            "",

          url:
            item.external_urls
              ?.spotify ||
            `https://open.spotify.com/track/${item.id}`
        }
      });

    } catch (err) {
      console.error(
        "Spotify current error:",
        err.response?.data ||
          err.message ||
          err
      );

      if (
        err.response?.status === 401
      ) {
        return res.json({
          conectado: true,
          playing: false
        });
      }

      return res.status(500).json({
        mensaje:
          "No se pudo consultar Spotify"
      });
    }
  }
);


// ============================================================
// MOSTRAR / OCULTAR CANCIÓN ACTUAL
// ============================================================

router.put(
  "/visibility",
  auth,
  async (req, res) => {
    try {
      const mostrarAhora =
        req.body.mostrarAhora !== false;

      const user =
        await User.findByIdAndUpdate(
          req.usuario._id,

          {
            $set: {
              "spotify.mostrarAhora":
                mostrarAhora
            }
          },

          {
            new: true
          }
        ).select("spotify");


      return res.json({
        ok: true,

        spotify:
          publicSpotify(
            user.spotify
          )
      });

    } catch (err) {
      console.error(
        "Spotify visibility error:",
        err
      );

      return res.status(500).json({
        mensaje:
          "Error actualizando visibilidad"
      });
    }
  }
);


// ============================================================
// DESCONECTAR SPOTIFY
// ============================================================

router.delete(
  "/disconnect",
  auth,
  async (req, res) => {
    try {
      await User.findByIdAndUpdate(
        req.usuario._id,

        {
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
        }
      );


      return res.json({
        ok: true
      });

    } catch (err) {
      console.error(
        "Spotify disconnect error:",
        err
      );

      return res.status(500).json({
        mensaje:
          "Error desconectando Spotify"
      });
    }
  }
);


module.exports = router;
