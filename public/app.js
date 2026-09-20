// ===== CONFIG =====
const API = "/api";

const token   = localStorage.getItem("fu_token");
const usuario = JSON.parse(localStorage.getItem("fu_usuario") || "null");
if (!token || !usuario) window.location.href = "/login.html";

let pagina     = 1;
let cargando   = false;
let hayMas     = true;
let imagenFile = null;
let stickerUrl = null; // URL del sticker IA seleccionado

const headers = () => ({ Authorization: `Bearer ${token}` });

// ===== HELPERS DE PERSONALIZACIÓN =====

function getMarcoStyle(p) {
  if (!p || !p.marco || p.marco === "none") return "";
  if (p.marco === "color")  return `box-shadow:0 0 0 2.5px ${p.marcoColor||'var(--green)'};`;
  if (p.marco === "neon")   return `box-shadow:0 0 0 2px ${p.marcoColor||'var(--green)'},0 0 12px ${p.marcoColor||'var(--green)'};`;
  if (p.marco === "gold")   return `box-shadow:0 0 0 2.5px #ffd43b;`;
  if (p.marco === "dashed") return `outline:2px dashed ${p.marcoColor||'var(--green)'};outline-offset:2px;`;
  if (p.marco === "doble")  return `box-shadow:0 0 0 2px ${p.marcoColor||'var(--green)'},0 0 0 4px ${p.marcoColor||'var(--green)'}40;`;
  return "";
}

function renderAvatarHTML(autor, size = 44) {
  const p    = autor.personalizacion || {};
  const ms   = getMarcoStyle(p);
  const extraClass = (p.marco === "rainbow") ? "avatar-rainbow" : (p.marco === "animated") ? "avatar-animated" : "";
  const style = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;${ms}`;

  if (autor.avatarTipo === "video") {
    return `<video src="${autor.avatar||''}" autoplay loop muted playsinline
                   class="${extraClass}" style="${style}"></video>`;
  }
  return `<img src="${autor.avatar||'https://api.dicebear.com/7.x/thumbs/svg?seed=default'}"
               class="${extraClass}" style="${style}" alt="" loading="lazy"/>`;
}

function renderNombreHTML(autor) {
  const p = autor.personalizacion || {};
  const badges = {
    verified: `<i class="ri-verified-badge-fill" style="color:#4dabf7;font-size:.85em;margin-left:3px;vertical-align:middle"></i>`,
    star:     `<i class="ri-star-fill" style="color:#ffd43b;font-size:.85em;margin-left:3px;vertical-align:middle"></i>`,
    fire:     `<i class="ri-fire-fill" style="color:#ff6b35;font-size:.85em;margin-left:3px;vertical-align:middle"></i>`,
    crown:    `<i class="ri-vip-crown-fill" style="color:#ffd43b;font-size:.85em;margin-left:3px;vertical-align:middle"></i>`,
    dev:      `<i class="ri-code-box-fill" style="color:#69db7c;font-size:.85em;margin-left:3px;vertical-align:middle"></i>`,
    vip:      `<span style="background:linear-gradient(90deg,#ffd43b,#ff6b35);color:#050505;font-size:.58em;padding:1px 6px;border-radius:4px;margin-left:3px;font-weight:900;vertical-align:middle">VIP</span>`,
    new:      `<span style="background:var(--green);color:#050505;font-size:.58em;padding:1px 6px;border-radius:4px;margin-left:3px;font-weight:900;vertical-align:middle">NEW</span>`
  };
  const badgeHTML = (p.badge && p.badge !== "none") ? (badges[p.badge] || "") : "";

  let style = "font-weight:700;font-size:.92rem;";
  const grads = {
    "green-blue": "linear-gradient(90deg,#5cdb6f,#4dabf7)",
    "fire":       "linear-gradient(90deg,#ff6b35,#ffd43b)",
    "purple":     "linear-gradient(90deg,#cc5de8,#845ef7)",
    "sunset":     "linear-gradient(90deg,#ff6b6b,#feca57)",
    "ocean":      "linear-gradient(90deg,#54a0ff,#5f27cd)",
    "custom":     `linear-gradient(90deg,${p.gradColor1||'#5cdb6f'},${p.gradColor2||'#4dabf7'})`
  };

  const ef = p.nombreEfecto || "none";
  if (ef === "gradient") {
    const g = grads[p.nombreGradiente || "green-blue"];
    style = `font-weight:700;font-size:.92rem;background:${g};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
  } else if (ef === "glow") {
    style += `color:${p.nombreColor||'var(--green)'};text-shadow:0 0 10px ${p.nombreColor||'var(--green)'};`;
  } else if (ef === "neon") {
    style += `color:${p.nombreColor||'#fff'};text-shadow:0 0 7px ${p.nombreColor||'var(--green)'},0 0 21px ${p.nombreColor||'var(--green)'};`;
  } else if (ef === "color") {
    style += `color:${p.nombreColor||'inherit'};`;
  } else if (ef === "shadow") {
    style += `text-shadow:2px 2px 4px rgba(0,0,0,.9);`;
  }

  return `<strong style="${style}">${escHtml(autor.nombre)}</strong>${badgeHTML}`;
}

// ===== INIT =====
window.addEventListener("DOMContentLoaded", () => {
  // Sidebar user
  const sidebarUser = document.getElementById("sidebarUser");
  if (sidebarUser) {
    const avHTML = renderAvatarHTML(usuario, 38);
    sidebarUser.innerHTML = `
      ${avHTML}
      <div>
        <div style="display:flex;align-items:center;gap:2px">${renderNombreHTML(usuario)}</div>
        <small>@${escHtml(usuario.handle)}</small>
      </div>
    `;
    sidebarUser.onclick = () => irAPerfil(usuario.handle);
  }

  // Composer avatar
  const composerWrap = document.getElementById("composerAvatarWrap");
  if (composerWrap) composerWrap.innerHTML = renderAvatarHTML(usuario, 44);

  // Nav links
  const navPerfil = document.getElementById("navPerfil");
  const bnPerfil  = document.getElementById("bnPerfil");
  if (navPerfil) navPerfil.href = `profile.html?handle=${usuario.handle}`;
  if (bnPerfil)  bnPerfil.href  = `profile.html?handle=${usuario.handle}`;

  cargarPosts();
  setupEventListeners();
});

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Textarea
  const postInput = document.getElementById("postInput");
  if (postInput) {
    postInput.addEventListener("input", function() {
      const rest = 280 - this.value.length;
      const el   = document.getElementById("charCount");
      if (el) {
        el.textContent = rest;
        el.style.color = rest < 20 ? "#ff4466" : rest < 50 ? "#f59e0b" : "var(--text-3)";
      }
    });
    postInput.addEventListener("keydown", e => {
      if (e.ctrlKey && e.key === "Enter") publicar();
    });
  }

  // Imagen
  const imageInput = document.getElementById("imageInput");
  if (imageInput) {
    imageInput.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { alert("Máximo 5MB"); imageInput.value = ""; return; }
      imagenFile = file;
      stickerUrl = null;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById("imagePreview").src = ev.target.result;
        document.getElementById("imagePreviewBox").classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    });
  }

  // Quitar imagen
  document.getElementById("btnRemoveImage")?.addEventListener("click", limpiarImagen);

  // Publicar
  document.getElementById("btnPost")?.addEventListener("click", publicar);

  // Sidebar post btn
  document.getElementById("btnNuevoPostSidebar")?.addEventListener("click", () => {
    document.getElementById("postInput")?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Logout
  document.getElementById("btnLogout")?.addEventListener("click", () => {
    if (confirm("¿Cerrar sesión?")) { localStorage.clear(); window.location.href = "/login.html"; }
  });

  // Load more
  document.getElementById("btnLoadMore")?.addEventListener("click", () => {
    pagina++;
    cargarPosts(false);
  });

  // Scroll infinito
  window.addEventListener("scroll", () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400 && !cargando && hayMas) {
      pagina++;
      cargarPosts(false);
    }
  });

  // ESC
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { cerrarModal(); cerrarModalSticker(); }
  });
}

function limpiarImagen() {
  imagenFile = null;
  stickerUrl = null;
  const imageInput = document.getElementById("imageInput");
  if (imageInput) imageInput.value = "";
  const preview = document.getElementById("imagePreview");
  if (preview) preview.src = "";
  document.getElementById("imagePreviewBox")?.classList.add("hidden");
}

// ===== CARGAR POSTS =====
async function cargarPosts(reset = true) {
  if (cargando) return;
  cargando = true;

  if (reset) {
    pagina = 1; hayMas = true;
    document.getElementById("feed").innerHTML = `<div class="loading"><i class="ri-loader-4-line spin"></i> Cargando...</div>`;
    document.getElementById("loadMoreBox")?.classList.add("hidden");
  }

  try {
    const res = await fetch(`${API}/posts?pagina=${pagina}&limite=20`, { headers: headers() });
    if (res.status === 401) { localStorage.clear(); window.location.href = "/login.html"; return; }

    const posts = await res.json();
    if (reset) document.getElementById("feed").innerHTML = "";

    if (posts.length === 0 && reset) {
      document.getElementById("feed").innerHTML = `
        <div class="empty-state">
          <div><i class="ri-inbox-2-line" style="font-size:3rem;color:var(--text-3)"></i></div>
          <p>No hay posts todavía.<br/>¡Sé el primero en publicar!</p>
        </div>
      `;
      return;
    }

    posts.forEach(p => renderPost(p, false));

    if (posts.length < 20) {
      hayMas = false;
      document.getElementById("loadMoreBox")?.classList.add("hidden");
    } else {
      document.getElementById("loadMoreBox")?.classList.remove("hidden");
    }
  } catch (err) {
    document.getElementById("feed").innerHTML = `
      <div class="loading" style="color:var(--red)">
        <i class="ri-error-warning-line"></i> Error al conectar
      </div>
    `;
  } finally { cargando = false; }
}

// ===== RENDER POST =====
function renderPost(post, prepend = true) {
  const feed  = document.getElementById("feed");
  if (!feed) return;

  const esMio  = post.autor._id === usuario._id;
  const tiempo = tiempoRelativo(post.createdAt);
  const avHTML = renderAvatarHTML(post.autor, 44);
  const nomHTML= renderNombreHTML(post.autor);

  // Imagen: puede ser upload o sticker externo
  const imagenHTML = post.imagen
    ? `<img src="${post.imagen}" class="post-img" alt="imagen"
             onclick="verImagen('${post.imagen}')" loading="lazy"/>`
    : "";

  const el = document.createElement("div");
  el.className = "post-card";
  el.id        = `post-${post._id}`;
  el.innerHTML = `
    <div style="cursor:pointer;flex-shrink:0" onclick="irAPerfil('${escHtml(post.autor.handle)}')">${avHTML}</div>
    <div class="post-body">
      <div class="post-user">
        <span style="cursor:pointer;display:flex;align-items:center;gap:3px"
              onclick="irAPerfil('${escHtml(post.autor.handle)}')">${nomHTML}</span>
        <span class="handle" style="cursor:pointer"
              onclick="irAPerfil('${escHtml(post.autor.handle)}')">@${escHtml(post.autor.handle)}</span>
        <span class="post-time">· ${tiempo}</span>
      </div>
      ${post.texto ? `<p class="post-text">${escHtml(post.texto)}</p>` : ""}
      ${imagenHTML}
      <div class="post-footer">
        <button class="post-btn ${post.yaLike ? 'liked' : ''}" onclick="toggleLike('${post._id}', this)">
          <i class="${post.yaLike ? 'ri-heart-fill' : 'ri-heart-line'}"></i>
          <span>${post.totalLikes}</span>
        </button>
        <button class="post-btn" onclick="toggleComentarios('${post._id}', this)">
          <i class="ri-chat-1-line"></i>
          <span id="commentCount-${post._id}">${post.totalComments || 0}</span>
        </button>
        <button class="post-btn"><i class="ri-repeat-2-line"></i></button>
        ${!esMio ? `
          <button class="post-btn" onclick="iniciarChat('${post.autor._id}')" title="Mensaje">
            <i class="ri-message-3-line"></i>
          </button>
        ` : `
          <button class="post-btn delete" onclick="eliminarPost('${post._id}')" style="margin-left:auto">
            <i class="ri-delete-bin-6-line"></i>
          </button>
        `}
      </div>
      <!-- Sección de comentarios (toggle) -->
      <div class="comments-section hidden" id="comments-${post._id}"></div>
    </div>
  `;

  if (prepend) {
    document.querySelector(".empty-state")?.remove();
    feed.prepend(el);
    requestAnimationFrame(() => {
      el.style.transition = "all .3s ease";
      el.style.opacity    = "1";
      el.style.transform  = "translateY(0)";
    });
    el.style.opacity    = "0";
    el.style.transform  = "translateY(-8px)";
  } else {
    feed.appendChild(el);
  }
}

// ===== COMENTARIOS =====
async function toggleComentarios(postId, btn) {
  const section = document.getElementById(`comments-${postId}`);
  if (!section) return;

  if (!section.classList.contains("hidden")) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  section.innerHTML = `<div class="loading" style="padding:12px"><i class="ri-loader-4-line spin"></i></div>`;

  try {
    const res  = await fetch(`${API}/posts/${postId}/comments`, { headers: headers() });
    const data = await res.json();

    section.innerHTML = `
      <div class="comments-list" id="commentsList-${postId}">
        ${data.length === 0
          ? `<p class="no-comments"><i class="ri-chat-3-line"></i> Sin comentarios aún</p>`
          : data.map(c => renderComentarioHTML(c)).join("")
        }
      </div>
      <div class="comment-input-row">
        ${renderAvatarHTML(usuario, 32)}
        <div class="comment-input-wrap">
          <input type="text" class="comment-input" id="commentInput-${postId}"
                 placeholder="Escribe un comentario..." maxlength="280"
                 onkeydown="if(event.key==='Enter')agregarComentario('${postId}')"/>
          <button class="btn-send-comment" onclick="agregarComentario('${postId}')">
            <i class="ri-send-plane-fill"></i>
          </button>
        </div>
      </div>
    `;
  } catch(e) {
    section.innerHTML = `<p style="color:var(--red);padding:12px;font-size:.85rem">Error al cargar comentarios</p>`;
  }
}

function renderComentarioHTML(c) {
  const avHTML  = renderAvatarHTML(c.autor, 32);
  const nomHTML = renderNombreHTML(c.autor);
  const tiempo  = tiempoRelativo(c.createdAt);
  return `
    <div class="comment-item" id="comment-${c._id}">
      <div style="cursor:pointer" onclick="irAPerfil('${escHtml(c.autor.handle)}')">${avHTML}</div>
      <div class="comment-body">
        <div class="comment-header">
          <span style="cursor:pointer;display:flex;align-items:center;gap:3px"
                onclick="irAPerfil('${escHtml(c.autor.handle)}')">${nomHTML}</span>
          <span class="handle" style="font-size:.75rem">@${escHtml(c.autor.handle)}</span>
          <span class="post-time">· ${tiempo}</span>
        </div>
        <p class="comment-text">${escHtml(c.texto)}</p>
        <button class="post-btn ${c.yaLike ? 'liked' : ''}" style="padding:2px 6px;font-size:.75rem"
                onclick="likeComentario('${c._id}', this)">
          <i class="${c.yaLike ? 'ri-heart-fill' : 'ri-heart-line'}"></i>
          <span>${c.totalLikes}</span>
        </button>
      </div>
    </div>
  `;
}

async function agregarComentario(postId) {
  const inp  = document.getElementById(`commentInput-${postId}`);
  const texto = inp?.value.trim();
  if (!texto) return;

  inp.value    = "";
  inp.disabled = true;

  try {
    const res  = await fetch(`${API}/posts/${postId}/comments`, {
      method:  "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body:    JSON.stringify({ texto })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje);

    const list = document.getElementById(`commentsList-${postId}`);
    if (list) {
      const noMsg = list.querySelector(".no-comments");
      if (noMsg) noMsg.remove();
      list.insertAdjacentHTML("beforeend", renderComentarioHTML(data));
      list.lastElementChild.scrollIntoView({ behavior: "smooth" });
    }

    // Actualizar contador
    const counter = document.getElementById(`commentCount-${postId}`);
    if (counter) counter.textContent = parseInt(counter.textContent || "0") + 1;

  } catch(e) { alert(e.message); }
  finally { if (inp) inp.disabled = false; inp?.focus(); }
}

async function likeComentario(commentId, btn) {
  try {
    const res  = await fetch(`${API}/posts/comments/${commentId}/like`, {
      method: "POST", headers: headers()
    });
    const data = await res.json();
    btn.classList.toggle("liked", data.yaLike);
    btn.innerHTML = `<i class="${data.yaLike ? 'ri-heart-fill' : 'ri-heart-line'}"></i><span>${data.totalLikes}</span>`;
  } catch(e) {}
}

// ===== STICKERS IA =====
function abrirModalSticker() {
  const modal = document.getElementById("modalSticker");
  if (modal) {
    modal.classList.remove("hidden");
    document.getElementById("stickerPromptInput")?.focus();
    document.getElementById("stickerResults")?.classList.add("hidden");
    document.getElementById("stickerResults").innerHTML = "";
    document.getElementById("stickerSeleccionado")?.classList.add("hidden");
  }
}

function cerrarModalSticker() {
  document.getElementById("modalSticker")?.classList.add("hidden");
}

let stickerSeleccionadoUrl = null;

async function generarStickers() {
  const prompt  = document.getElementById("stickerPromptInput")?.value.trim();
  const btn     = document.getElementById("btnGenerarSticker");
  const results = document.getElementById("stickerResults");

  if (!prompt) { alert("Escribe un prompt para el sticker"); return; }

  btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Generando...';
  btn.disabled  = true;
  results.classList.remove("hidden");
  results.innerHTML = `
    <div class="sticker-loading">
      <i class="ri-loader-4-line spin" style="font-size:2rem;color:var(--green)"></i>
      <p>Generando stickers con IA...</p>
    </div>
  `;

  try {
    const res  = await fetch(`${API}/stickers?prompt=${encodeURIComponent(prompt)}`, {
      headers: headers()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje);

    results.innerHTML = `
      <p style="font-size:.8rem;color:var(--text-3);margin-bottom:10px">
        <i class="ri-cursor-line"></i> Haz clic en un sticker para seleccionarlo
      </p>
      <div class="sticker-grid">
        <div class="sticker-option" onclick="seleccionarSticker('${data.sticker1}', this)">
          <img src="${data.sticker1}" alt="sticker 1" loading="lazy"/>
        </div>
        <div class="sticker-option" onclick="seleccionarSticker('${data.sticker2}', this)">
          <img src="${data.sticker2}" alt="sticker 2" loading="lazy"/>
        </div>
      </div>
    `;
  } catch(e) {
    results.innerHTML = `<p style="color:var(--red);font-size:.85rem"><i class="ri-error-warning-line"></i> ${e.message}</p>`;
  } finally {
    btn.innerHTML = '<i class="ri-sparkling-2-line"></i> Generar';
    btn.disabled  = false;
  }
}

function seleccionarSticker(url, el) {
  document.querySelectorAll(".sticker-option").forEach(s => s.classList.remove("selected"));
  el.classList.add("selected");
  stickerSeleccionadoUrl = url;

  const box = document.getElementById("stickerSeleccionado");
  if (box) box.classList.remove("hidden");
}

function adjuntarStickerAPost() {
  if (!stickerSeleccionadoUrl) return;

  // Limpiar imagen si había
  imagenFile = null;
  stickerUrl = stickerSeleccionadoUrl;

  // Preview
  document.getElementById("imagePreview").src = stickerUrl;
  document.getElementById("imagePreviewBox").classList.remove("hidden");

  cerrarModalSticker();
}

// ===== PUBLICAR =====
async function publicar() {
  const texto = document.getElementById("postInput")?.value.trim();
  const btn   = document.getElementById("btnPost");
  if (!texto && !imagenFile && !stickerUrl) return;

  if (btn) { btn.innerHTML = '<i class="ri-loader-4-line spin"></i>'; btn.disabled = true; }

  try {
    const formData = new FormData();
    if (texto)      formData.append("texto", texto);
    if (imagenFile) formData.append("imagen", imagenFile);
    if (stickerUrl) formData.append("stickerUrl", stickerUrl);

    const res  = await fetch(`${API}/posts`, { method: "POST", headers: headers(), body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje);

    // Limpiar
    if (document.getElementById("postInput"))
      document.getElementById("postInput").value = "";
    if (document.getElementById("charCount")) {
      document.getElementById("charCount").textContent = "280";
      document.getElementById("charCount").style.color = "var(--text-3)";
    }
    limpiarImagen();

    renderPost(data, true);
  } catch(e) { alert("Error al publicar: " + e.message); }
  finally {
    if (btn) {
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> Publicar';
      btn.disabled  = false;
    }
  }
}

// ===== LIKE =====
async function toggleLike(postId, btn) {
  try {
    const res  = await fetch(`${API}/posts/${postId}/like`, { method: "POST", headers: headers() });
    const data = await res.json();
    btn.classList.toggle("liked", data.yaLike);
    btn.innerHTML = `<i class="${data.yaLike ? 'ri-heart-fill' : 'ri-heart-line'}"></i><span>${data.totalLikes}</span>`;
  } catch(e) {}
}

// ===== ELIMINAR =====
async function eliminarPost(postId) {
  if (!confirm("¿Eliminar este post?")) return;
  try {
    const res = await fetch(`${API}/posts/${postId}`, { method: "DELETE", headers: headers() });
    if (!res.ok) { const d = await res.json(); throw new Error(d.mensaje); }
    const el = document.getElementById(`post-${postId}`);
    if (el) {
      el.style.transition = "all .3s";
      el.style.opacity    = "0";
      el.style.transform  = "scale(0.97)";
      setTimeout(() => el.remove(), 300);
    }
  } catch(e) { alert("Error: " + e.message); }
}

// ===== NAVEGAR =====
function irAPerfil(handle) { window.location.href = `profile.html?handle=${handle}`; }

async function iniciarChat(userId) {
  try {
    const res  = await fetch(`${API}/messages`, {
      method:  "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body:    JSON.stringify({ usuarioId: userId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje);
    window.location.href = `messages.html?conv=${data._id}`;
  } catch(e) { alert("Error: " + e.message); }
}

// ===== MODAL IMAGEN =====
function verImagen(src) {
  document.getElementById("modalImgSrc").src = src;
  document.getElementById("modalImg").classList.add("active");
}
function cerrarModal() {
  document.getElementById("modalImg")?.classList.remove("active");
}

// ===== UTILS =====

function escHtml(s = "") {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function tiempoRelativo(f) {
  const d = (Date.now()-new Date(f))/1000;
  if(d<60)     return "ahora";
  if(d<3600)   return `${Math.floor(d/60)}m`;
  if(d<86400)  return `${Math.floor(d/3600)}h`;
  if(d<604800) return `${Math.floor(d/86400)}d`;
  return new Date(f).toLocaleDateString("es",{day:"numeric",month:"short"});
}
