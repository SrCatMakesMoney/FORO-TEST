(() => {
  const API = "/api";
  const token = localStorage.getItem("fu_token");
  const yo = JSON.parse(localStorage.getItem("fu_usuario") || "null");
  if (!token || !yo) return;
  let currentUser = null;
  const headers = () => ({ Authorization: `Bearer ${token}` });
  const esc = (v="") => String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  async function getStatus(handle){const r=await fetch(`${API}/spotify/status/${encodeURIComponent(handle)}`,{headers:headers()});if(!r.ok)throw new Error("No se pudo consultar Spotify");return r.json();}
  async function getCurrent(handle){const r=await fetch(`${API}/spotify/current/${encodeURIComponent(handle)}`,{headers:headers()});return r.ok?r.json():{conectado:false,playing:false};}
  function renderCard(user,sp,cur){
    const host=document.getElementById("spotifyProfileCard");if(!host)return;
    if(!sp?.conectado||sp.mostrarAhora===false){host.innerHTML="";return;}
    const account=esc(sp.displayName||"Spotify");
    if(cur?.playing&&cur.track){const t=cur.track;host.innerHTML=`<div class="spotify-profile-card"><div class="spotify-profile-top"><div class="spotify-profile-brand"><i class="ri-spotify-fill"></i> Spotify</div><span class="spotify-profile-account">${account}</span></div><a class="spotify-now" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"><img class="spotify-now-art" src="${esc(t.image||sp.imagen||"")}" alt="" loading="lazy"><div class="spotify-now-info"><div class="spotify-now-label"><span></span> Escuchando ahora</div><div class="spotify-now-title">${esc(t.name)}</div><div class="spotify-now-artist">${esc(t.artists)} · ${esc(t.album)}</div></div><i class="ri-external-link-line spotify-open-icon"></i></a></div>`;return;}
    host.innerHTML=`<div class="spotify-profile-card"><div class="spotify-profile-top" style="margin-bottom:0"><div class="spotify-profile-brand"><i class="ri-spotify-fill"></i> Spotify</div><span class="spotify-profile-account">${account}</span></div><div class="spotify-idle">No está escuchando música ahora mismo.</div></div>`;
  }
  async function loadCard(user){try{const sp=user.spotify||await getStatus(user.handle);if(!sp?.conectado||sp.mostrarAhora===false){const h=document.getElementById("spotifyProfileCard");if(h)h.innerHTML="";return;}renderCard(user,sp,await getCurrent(user.handle));}catch(e){console.warn("Spotify:",e);}}
  function fill(sp){const box=document.getElementById("spotifyConnectBox"),panel=document.getElementById("spotifyConnectedPanel"),img=document.getElementById("spotifyAccountImage"),name=document.getElementById("spotifyAccountName"),id=document.getElementById("spotifyAccountId"),open=document.getElementById("spotifyOpenAccount"),show=document.getElementById("spotifyShowNow");if(!box||!panel)return;if(sp?.conectado){box.classList.add("hidden");panel.classList.remove("hidden");name.textContent=sp.displayName||"Spotify";id.textContent=sp.id?`ID: ${sp.id}`:"";if(sp.imagen){img.src=sp.imagen;img.classList.remove("hidden");}open.href=sp.url||"https://open.spotify.com/";show.checked=sp.mostrarAhora!==false;}else{box.classList.remove("hidden");panel.classList.add("hidden");}}
  async function initConnections(){const connect=document.getElementById("btnSpotifyConnect"),disconnect=document.getElementById("btnSpotifyDisconnect"),show=document.getElementById("spotifyShowNow");if(!connect)return;try{fill(await getStatus(yo.handle));}catch(_){fill(null);}connect.onclick=()=>{location.href=`${API}/spotify/connect`;};disconnect?.addEventListener("click",async()=>{if(!confirm("¿Desconectar tu cuenta de Spotify?"))return;disconnect.disabled=true;try{const r=await fetch(`${API}/spotify/disconnect`,{method:"DELETE",headers:headers()});if(!r.ok)throw new Error("No se pudo desconectar");fill(null);yo.spotify={conectado:false};localStorage.setItem("fu_usuario",JSON.stringify(yo));if(typeof window.cargarPerfil==="function")window.cargarPerfil();}catch(e){alert(e.message);}finally{disconnect.disabled=false;}});show?.addEventListener("change",async()=>{show.disabled=true;try{await fetch(`${API}/spotify/visibility`,{method:"PUT",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({mostrarAhora:show.checked})});if(currentUser)loadCard(currentUser);}finally{show.disabled=false;}});}
  window.initSpotifyProfile=async function(user){currentUser=user;await loadCard(user);if(user.esTuPerfil)await initConnections();};
  setInterval(()=>{if(currentUser?.spotify?.conectado&&currentUser.spotify.mostrarAhora!==false)loadCard(currentUser);},30000);
})();
