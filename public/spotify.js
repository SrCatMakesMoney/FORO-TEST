(() => {
  "use strict";

  const API = "/api";

  const token =
    localStorage.getItem("fu_token");

  const yo =
    JSON.parse(
      localStorage.getItem(
        "fu_usuario"
      ) || "null"
    );

  if (!token || !yo) {
    return;
  }


  // ==========================================================
  // ESTADO
  // ==========================================================

  let currentUser = null;

  let loadingCurrent = false;


  // ==========================================================
  // HEADERS
  // ==========================================================

  const headers = () => ({
    Authorization:
      `Bearer ${token}`
  });


  // ==========================================================
  // ESCAPE HTML
  // ==========================================================

  const esc = (value = "") => {
    return String(value).replace(
      /[&<>'"]/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      }[char])
    );
  };


  // ==========================================================
  // STATUS
  // ==========================================================

  async function getStatus(handle) {
    const response =
      await fetch(
        `${API}/spotify/status/${encodeURIComponent(
          handle
        )}`,
        {
          method: "GET",
          headers: headers()
        }
      );

    if (!response.ok) {
      throw new Error(
        "No se pudo consultar Spotify"
      );
    }

    return response.json();
  }


  // ==========================================================
  // CANCIÓN ACTUAL
  // ==========================================================

  async function getCurrent(handle) {
    try {
      const response =
        await fetch(
          `${API}/spotify/current/${encodeURIComponent(
            handle
          )}`,
          {
            method: "GET",
            headers: headers()
          }
        );

      if (!response.ok) {
        return {
          conectado: false,
          playing: false
        };
      }

      return response.json();

    } catch (err) {
      console.warn(
        "Spotify current:",
        err
      );

      return {
        conectado: false,
        playing: false
      };
    }
  }


  // ==========================================================
  // RENDER PERFIL
  // ==========================================================

  function renderCard(
    user,
    spotify,
    current
  ) {
    const host =
      document.getElementById(
        "spotifyProfileCard"
      );

    if (!host) {
      return;
    }


    // --------------------------------------------------------
    // Spotify desconectado / oculto
    // --------------------------------------------------------

    if (
      !spotify?.conectado ||
      spotify.mostrarAhora === false
    ) {
      host.innerHTML = "";
      return;
    }


    const account =
      esc(
        spotify.displayName ||
        "Spotify"
      );


    // --------------------------------------------------------
    // Está escuchando
    // --------------------------------------------------------

    if (
      current?.playing &&
      current.track
    ) {
      const track =
        current.track;


      const image =
        track.image ||
        spotify.imagen ||
        "";


      host.innerHTML = `
        <div class="spotify-profile-card">

          <div class="spotify-profile-top">

            <div class="spotify-profile-brand">
              <i class="ri-spotify-fill"></i>
              Spotify
            </div>

            <span class="spotify-profile-account">
              ${account}
            </span>

          </div>


          <a
            class="spotify-now"
            href="${esc(track.url)}"
            target="_blank"
            rel="noopener noreferrer"
          >

            ${
              image
                ? `
                  <img
                    class="spotify-now-art"
                    src="${esc(image)}"
                    alt=""
                    loading="lazy"
                  >
                `
                : `
                  <div class="spotify-now-art spotify-art-empty">
                    <i class="ri-music-2-fill"></i>
                  </div>
                `
            }


            <div class="spotify-now-info">

              <div class="spotify-now-label">
                <span></span>
                Escuchando ahora
              </div>

              <div class="spotify-now-title">
                ${esc(track.name)}
              </div>

              <div class="spotify-now-artist">
                ${esc(track.artists)}
                ${
                  track.album
                    ? ` · ${esc(track.album)}`
                    : ""
                }
              </div>

            </div>


            <i
              class="ri-external-link-line spotify-open-icon"
            ></i>

          </a>

        </div>
      `;

      return;
    }


    // --------------------------------------------------------
    // No está escuchando
    // --------------------------------------------------------

    host.innerHTML = `
      <div class="spotify-profile-card">

        <div
          class="spotify-profile-top"
          style="margin-bottom:0"
        >

          <div class="spotify-profile-brand">
            <i class="ri-spotify-fill"></i>
            Spotify
          </div>

          <span class="spotify-profile-account">
            ${account}
          </span>

        </div>

        <div class="spotify-idle">
          No está escuchando música ahora mismo.
        </div>

      </div>
    `;
  }


  // ==========================================================
  // CARGAR TARJETA
  // ==========================================================

  async function loadCard(user) {
    try {
      if (!user?.handle) {
        return;
      }


      let spotify =
        user.spotify;


      // Si el perfil no trae Spotify,
      // lo consultamos al servidor.

      if (!spotify) {
        spotify =
          await getStatus(
            user.handle
          );
      }


      if (
        !spotify?.conectado ||
        spotify.mostrarAhora === false
      ) {
        const host =
          document.getElementById(
            "spotifyProfileCard"
          );

        if (host) {
          host.innerHTML = "";
        }

        return;
      }


      // Evitar varias peticiones simultáneas.

      if (loadingCurrent) {
        return;
      }

      loadingCurrent = true;


      const current =
        await getCurrent(
          user.handle
        );


      renderCard(
        user,
        spotify,
        current
      );

    } catch (err) {
      console.warn(
        "Spotify:",
        err
      );

    } finally {
      loadingCurrent = false;
    }
  }


  // ==========================================================
  // PANEL DE CONEXIÓN
  // ==========================================================

  function fill(spotify) {
    const box =
      document.getElementById(
        "spotifyConnectBox"
      );

    const panel =
      document.getElementById(
        "spotifyConnectedPanel"
      );

    const image =
      document.getElementById(
        "spotifyAccountImage"
      );

    const name =
      document.getElementById(
        "spotifyAccountName"
      );

    const id =
      document.getElementById(
        "spotifyAccountId"
      );

    const open =
      document.getElementById(
        "spotifyOpenAccount"
      );

    const show =
      document.getElementById(
        "spotifyShowNow"
      );


    if (!box || !panel) {
      return;
    }


    // --------------------------------------------------------
    // CONECTADO
    // --------------------------------------------------------

    if (spotify?.conectado) {

      box.classList.add(
        "hidden"
      );

      panel.classList.remove(
        "hidden"
      );


      if (name) {
        name.textContent =
          spotify.displayName ||
          "Spotify";
      }


      if (id) {
        id.textContent =
          spotify.id
            ? `ID: ${spotify.id}`
            : "";
      }


      if (image) {
        if (spotify.imagen) {
          image.src =
            spotify.imagen;

          image.classList.remove(
            "hidden"
          );
        } else {
          image.removeAttribute(
            "src"
          );

          image.classList.add(
            "hidden"
          );
        }
      }


      if (open) {
        open.href =
          spotify.url ||
          "https://open.spotify.com/";
      }


      if (show) {
        show.checked =
          spotify.mostrarAhora !== false;
      }

      return;
    }


    // --------------------------------------------------------
    // DESCONECTADO
    // --------------------------------------------------------

    box.classList.remove(
      "hidden"
    );

    panel.classList.add(
      "hidden"
    );


    if (image) {
      image.removeAttribute(
        "src"
      );

      image.classList.add(
        "hidden"
      );
    }


    if (name) {
      name.textContent =
        "Spotify";
    }


    if (id) {
      id.textContent = "";
    }
  }


  // ==========================================================
  // INICIAR PANEL DE CONEXIONES
  // ==========================================================

  async function initConnections() {
    const connect =
      document.getElementById(
        "btnSpotifyConnect"
      );

    const disconnect =
      document.getElementById(
        "btnSpotifyDisconnect"
      );

    const show =
      document.getElementById(
        "spotifyShowNow"
      );


    if (!connect) {
      return;
    }


    // --------------------------------------------------------
    // Cargar estado
    // --------------------------------------------------------

    try {
      const spotify =
        await getStatus(
          yo.handle
        );

      fill(spotify);

    } catch (err) {
      console.warn(
        "Spotify status:",
        err
      );

      fill(null);
    }


    // --------------------------------------------------------
    // CONECTAR
    // --------------------------------------------------------
    //
    // IMPORTANTE:
    // No usamos:
    //
    // location.href = "/api/spotify/connect"
    //
    // porque eso NO envía Authorization.
    //
    // En su lugar hacemos fetch con Bearer Token,
    // obtenemos la URL de Spotify y luego navegamos.
    //

    connect.onclick =
      async () => {

        if (
          connect.disabled
        ) {
          return;
        }


        const originalText =
          connect.textContent;


        connect.disabled = true;

        connect.textContent =
          "Conectando...";


        try {

          const response =
            await fetch(
              `${API}/spotify/connect`,
              {
                method: "GET",

                headers:
                  headers()
              }
            );


          let data = null;


          try {
            data =
              await response.json();
          } catch (_) {
            data = null;
          }


          if (
            !response.ok ||
            !data?.url
          ) {

            throw new Error(
              data?.mensaje ||
              "No se pudo iniciar la conexión con Spotify"
            );
          }


          // --------------------------------------------------
          // Ir a Spotify
          // --------------------------------------------------

          window.location.href =
            data.url;

        } catch (err) {

          console.error(
            "Spotify connect:",
            err
          );


          alert(
            err.message ||
            "No se pudo conectar con Spotify"
          );


          connect.disabled =
            false;

          connect.textContent =
            originalText ||
            "Conectar Spotify";
        }
      };


    // --------------------------------------------------------
    // DESCONECTAR
    // --------------------------------------------------------

    if (disconnect) {

      disconnect.addEventListener(
        "click",
        async () => {

          if (
            !confirm(
              "¿Desconectar tu cuenta de Spotify?"
            )
          ) {
            return;
          }


          disconnect.disabled =
            true;


          try {

            const response =
              await fetch(
                `${API}/spotify/disconnect`,
                {
                  method:
                    "DELETE",

                  headers:
                    headers()
                }
              );


            let data = null;

            try {
              data =
                await response.json();
            } catch (_) {
              data = null;
            }


            if (!response.ok) {
              throw new Error(
                data?.mensaje ||
                "No se pudo desconectar"
              );
            }


            fill(null);


            // Actualizar usuario local

            yo.spotify = {
              conectado:
                false
            };


            localStorage.setItem(
              "fu_usuario",
              JSON.stringify(yo)
            );


            if (
              typeof window.cargarPerfil ===
              "function"
            ) {
              window.cargarPerfil();
            }

          } catch (err) {

            console.error(
              "Spotify disconnect:",
              err
            );

            alert(
              err.message ||
              "No se pudo desconectar Spotify"
            );

          } finally {

            disconnect.disabled =
              false;
          }
        }
      );
    }


    // --------------------------------------------------------
    // VISIBILIDAD
    // --------------------------------------------------------

    if (show) {

      show.addEventListener(
        "change",
        async () => {

          show.disabled =
            true;


          try {

            const response =
              await fetch(
                `${API}/spotify/visibility`,
                {
                  method:
                    "PUT",

                  headers: {
                    ...headers(),

                    "Content-Type":
                      "application/json"
                  },

                  body:
                    JSON.stringify({
                      mostrarAhora:
                        show.checked
                    })
                }
              );


            let data = null;

            try {
              data =
                await response.json();
            } catch (_) {
              data = null;
            }


            if (!response.ok) {
              throw new Error(
                data?.mensaje ||
                "No se pudo actualizar la visibilidad"
              );
            }


            // Actualizar la tarjeta inmediatamente

            if (currentUser) {
              await loadCard(
                currentUser
              );
            }

          } catch (err) {

            console.error(
              "Spotify visibility:",
              err
            );

            // Revertir checkbox

            show.checked =
              !show.checked;

            alert(
              err.message ||
              "No se pudo actualizar la visibilidad"
            );

          } finally {

            show.disabled =
              false;
          }
        }
      );
    }
  }


  // ==========================================================
  // FUNCIÓN PÚBLICA
  // ==========================================================

  window.initSpotifyProfile =
    async function(user) {

      currentUser =
        user || null;


      if (!currentUser) {
        return;
      }


      await loadCard(
        currentUser
      );


      if (
        currentUser.esTuPerfil
      ) {
        await initConnections();
      }
    };


  // ==========================================================
  // ACTUALIZAR CANCIÓN
  // ==========================================================

  setInterval(
    () => {

      if (
        currentUser?.spotify?.conectado &&
        currentUser.spotify
          .mostrarAhora !== false
      ) {
        loadCard(
          currentUser
        );
      }

    },
    30_000
  );

})();
