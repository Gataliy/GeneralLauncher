// Yandex Music library: playlists and liked tracks, through the public account API.
// Uses only the user's own OAuth token (saved in settings). No signing, no download links.
// Shapes follow the public API: /account/status -> account.uid; /users/{uid}/playlists/list -> [playlist];
// /users/{uid}/likes/tracks -> library.tracks[{id}]; /tracks (POST track-ids) -> [track].
(function () {
  const API = "https://api.music.yandex.net";
  const TOKEN_KEY = "generic_launcher_ym_token_v1";
  const cache = { uid: null, playlists: null, likes: null };

  // Yandex image: "avatars.yandex.net/.../%%" -> https://.../200x200
  function pic(uri, size) {
    if (!uri) return "";
    const clean = String(uri).replace(/^https?:\/\//, "");
    return "https://" + clean.replace("%%", `${size || 200}x${size || 200}`);
  }

  function token() {
    try { return (localStorage.getItem(TOKEN_KEY) || "").trim(); } catch (error) { return ""; }
  }

  // Sign-in by device code with the user's OWN OAuth app (client_id from oauth.yandex.ru, optional client_secret).
  // No password is typed into the launcher and no third-party app identity is used.
  const OAUTH = "https://oauth.yandex.ru";
  const CLIENT_KEY = "generic_launcher_ym_client_id_v1";
  const SECRET_KEY = "generic_launcher_ym_client_secret_v1";
  const DEVICE_KEY = "generic_launcher_ym_device_v1";
  const SCOPE = "music:content music:read music:write";

  function readKey(key) {
    try { return (localStorage.getItem(key) || "").trim(); } catch (error) { return ""; }
  }
  function storeKey(key, value) {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (error) { /* storage unavailable */ }
  }
  function deviceId() {
    let id = readKey(DEVICE_KEY);
    if (!id) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      storeKey(DEVICE_KEY, id);
    }
    return id;
  }
  async function oauthPost(path, fields) {
    const response = await fetch(OAUTH + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString()
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json };
  }
  async function startDeviceLogin() {
    const client = readKey(CLIENT_KEY);
    if (!client) throw new Error("Укажите client_id приложения");
    const { ok, json } = await oauthPost("/device/code", { client_id: client, device_id: deviceId(), device_name: "Generic Launcher", scope: SCOPE });
    if (!ok || !json.device_code) throw new Error(json.error_description || "Яндекс не выдал код входа");
    return json;
  }
  // Polls /token until the user enters the code on ya.ru/device; saves the token and returns true.
  async function pollDeviceLogin(code, interval, expiresIn) {
    const until = Date.now() + (expiresIn || 300) * 1000;
    let wait = Math.max(1, interval || 5);
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, wait * 1000));
      const fields = { grant_type: "device_code", code, client_id: readKey(CLIENT_KEY) };
      const secret = readKey(SECRET_KEY);
      if (secret) fields.client_secret = secret;
      const { json } = await oauthPost("/token", fields);
      if (json.access_token) { storeKey(TOKEN_KEY, json.access_token); return true; }
      if (json.error === "slow_down") wait += 5;
      else if (json.error !== "authorization_pending") throw new Error(json.error_description || "Вход не удался");
    }
    throw new Error("Код истёк, запросите новый");
  }

  async function call(path, options) {
    const value = token();
    if (!value) throw new Error("Токен Яндекс Музыки не задан");
    const response = await fetch(API + path, {
      ...(options || {}),
      headers: { Authorization: "OAuth " + value, ...((options && options.headers) || {}) }
    });
    if (!response.ok) throw new Error("Яндекс Музыка: HTTP " + response.status);
    const json = await response.json();
    return json.result !== undefined ? json.result : json;
  }

  async function uid() {
    if (cache.uid) return cache.uid;
    const account = await call("/account/status");
    const id = account && account.account && account.account.uid;
    if (!id) throw new Error("Не удалось получить uid аккаунта");
    cache.uid = String(id);
    return cache.uid;
  }

  // Playlists of the account: [{ kind, title, trackCount }].
  async function playlists() {
    if (cache.playlists) return cache.playlists;
    const id = await uid();
    const list = await call(`/users/${id}/playlists/list`);
    cache.playlists = (Array.isArray(list) ? list : []).map(p => ({
      kind: String(p.kind), title: p.title || "", trackCount: p.trackCount || 0,
      cover: pic((p.cover && (p.cover.uri || (p.cover.itemsUri || [])[0])) || p.ogImage || "")
    }));
    return cache.playlists;
  }

  // Tracks of one playlist, resolved to { id, title, artists }.
  async function playlistTracks(kind, owner) {
    const id = owner || await uid();
    const data = await call(`/users/${id}/playlists/${encodeURIComponent(kind)}`);
    const items = (data && data.tracks) || [];
    const ids = items.map(item => (item.track ? item.track.id : item.id)).filter(Boolean);
    return resolve(ids);
  }

  // Liked tracks, resolved to { id, title, artists }.
  async function likes() {
    if (cache.likes) return cache.likes;
    const id = await uid();
    const data = await call(`/users/${id}/likes/tracks`);
    const ids = ((data && data.library && data.library.tracks) || []).map(t => t.id).filter(Boolean);
    cache.likes = await resolve(ids);
    return cache.likes;
  }

  // Track details by id (POST /tracks with track-ids). Batches of 100.
  async function resolve(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const body = "track-ids=" + encodeURIComponent(batch.join(","));
      const tracks = await call("/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      (Array.isArray(tracks) ? tracks : []).forEach(t => out.push({
        id: String(t.id),
        title: t.title || "",
        artists: (t.artists || []).map(a => a.name).join(", "),
        cover: pic(t.coverUri || "")
      }));
    }
    return out;
  }


  // Search tracks: GET /search?text=...&type=track -> result.tracks.results[].
  async function search(text) {
    const query = String(text || "").trim();
    if (!query) return [];
    const data = await call("/search?type=track&page=0&text=" + encodeURIComponent(query));
    const results = (data && data.tracks && data.tracks.results) || [];
    return results.map(t => ({ id: String(t.id), title: t.title || "", artists: (t.artists || []).map(a => a.name).join(", "), cover: pic(t.coverUri || "") }));
  }

  // "Для вас": GET /landing/skeleton/main -> blocks; playlist items (personal_playlist_item, playlist_item,
  // liked_playlist_item) carry playlist { uid, kind, title }. Other item types are skipped for now.
  async function recommendations() {
    const data = await call("/landing/skeleton/main?showWizard=false");
    const blocks = (data && data.blocks) || [];
    return blocks.filter(b => b && b.type !== "TABS").map(block => {
      const d = block.data || {};
      const items = (d.items || block.items || []).filter(it => /playlist_item$/.test(it.type || ""));
      const playlists = items.map(it => {
        const p = (it.data && (it.data.playlist || it.data)) || {};
        const owner = p.uid || (p.owner && p.owner.uid);
        return { owner: owner ? String(owner) : "", kind: p.kind ? String(p.kind) : "", title: p.title || "", trackCount: p.trackCount || 0,
          cover: pic((p.cover && (p.cover.uri || (p.cover.itemsUri || [])[0])) || p.ogImage || "") };
      }).filter(p => p.owner && p.kind && p.title);
      return { title: d.title || "", playlists };
    }).filter(block => block.playlists.length);
  }

  // Similar tracks: GET /tracks/{id}/similar -> similarTracks[].
  async function similar(trackId) {
    const data = await call("/tracks/" + encodeURIComponent(trackId) + "/similar");
    return ((data && data.similarTracks) || []).filter(t => t && t.id).map(t => ({
      id: String(t.id), title: t.title || "", artists: (t.artists || []).map(a => a.name).join(", "), cover: pic(t.coverUri || "")
    }));
  }

  // Like / unlike: POST /users/{uid}/likes/tracks/add-multiple or /remove, form field track-ids.
  async function setLike(trackId, remove) {
    const user = await uid();
    await call(`/users/${user}/likes/tracks/${remove ? "remove" : "add-multiple"}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "track-ids": String(trackId) }).toString()
    });
    cache.likes = null;
  }

  // Lyrics: POST /tracks/{id}/lyrics (format TEXT) returns a download link to the text; the text is then fetched.
  async function lyrics(trackId) {
    const data = await call(`/tracks/${encodeURIComponent(trackId)}/lyrics`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "format=TEXT&timeStamp=" + Date.now()
    });
    const link = data && data.downloadUrl;
    if (!link) throw new Error("Текст песни не найден");
    const response = await fetch(link);
    if (!response.ok) throw new Error("Текст песни: HTTP " + response.status);
    return (await response.text()).trim();
  }

  // Wave: POST /rotor/session/new (seeds) -> radioSessionId and first tracks;
  // GET /rotor/session/{id}/tracks gives the next batch. Returns { sessionId, tracks }.
  async function wave(seed) {
    const data = await call("/rotor/session/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seeds: [seed || "user:onyourwave"], includeTracksInResponse: true })
    });
    const sessionId = data && data.radioSessionId;
    const tracks = trackList((data && data.sequence) || []);
    return { sessionId, tracks };
  }

  async function waveNext(sessionId) {
    const data = await call(`/rotor/session/${encodeURIComponent(sessionId)}/tracks`);
    return trackList((data && data.sequence) || []);
  }

  function trackList(sequence) {
    return sequence.map(item => item.track || item).filter(t => t && t.id).map(t => ({
      id: String(t.id), title: t.title || "", artists: (t.artists || []).map(a => a.name).join(", "), cover: pic(t.coverUri || "")
    }));
  }

  // Chart: GET /landing/block/chart -> the tracks found in the block (best effort: the block's shape varies).
  async function chart() {
    const data = await call("/landing/block/chart");
    const found = [];
    (function walk(node) {
      if (!node || typeof node !== "object") return;
      if (node.type === "track" && node.data) { found.push(node.data); return; }
      if (Array.isArray(node)) node.forEach(walk); else Object.values(node).forEach(walk);
    })(data);
    return found.map(t => ({ id: String(t.id), title: t.title || "", artists: (t.artists || []).map(a => a.name).join(", ") }));
  }

  // Radio stations. Favourites: GET /rotor/stations/dashboard (the user's saved stations).
  // Catalogue: GET /rotor/stations/list (grouped by Жанры, Настроение, ...). Both are read by walking
  // the response for objects with station.id {type, tag} and station.name, because the exact nesting
  // is not verified on the head unit yet. A station is started with wave(seed), seed = "type:tag".
  function collectStations(node, found, seen) {
    if (!node || typeof node !== "object") return found;
    if (Array.isArray(node)) { node.forEach(item => collectStations(item, found, seen)); return found; }
    const station = node.station && typeof node.station === "object" ? node.station : null;
    const source = station || node;
    const id = source.id || {};
    if (source.name && id.type && id.tag) {
      const seed = `${id.type}:${id.tag}`;
      const icon = source.icon || {};
      const cover = pic(icon.imageUrl || icon.coverUri || "");
      if (!seen.has(seed)) { seen.add(seed); found.push({ seed, title: String(source.name), cover }); }
      return found;
    }
    Object.values(node).forEach(value => collectStations(value, found, seen));
    return found;
  }

  async function favouriteStations() {
    return collectStations(await call("/rotor/stations/dashboard"), [], new Set());
  }

  async function stations() {
    return collectStations(await call("/rotor/stations/list"), [], new Set());
  }

  function clearCache() { cache.playlists = null; cache.likes = null; }


  // Player button and the "Музыка" sheet: top tabs Яндекс Музыка / Яндекс Радио.
  // Music has sub-tabs Плейлисты, Волна, Поиск, Чарт; Radio lists favourite and catalogue stations.
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8"/><circle cx="18" cy="17" r="2.5"/><path d="M20.5 17V7"/></svg>';
  const NOTE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
  const RADIO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>';
  const SECTIONS = [["music", "Яндекс Музыка", NOTE_ICON, "Плейлисты, волна, поиск, чарт"], ["radio", "Яндекс Радио", RADIO_ICON, "Избранные станции и каталог"]];
  const MUSIC_TABS = [["foryou", "Для вас", "star"], ["playlists", "Плейлисты", "note"], ["wave", "Волна", "wave"], ["search", "Поиск", "search"], ["chart", "Чарт", "chart"]];
  let activeSection = "music";
  let activeTab = "playlists";
  let radioSession = null;
  let waveSession = null;

  if (!document.getElementById("ym-sheet-style")) {
    const style = document.createElement("style");
    style.id = "ym-sheet-style";
    style.textContent =
      "#ym-sheet .queue-card{width:min(1100px,94vw);max-width:94vw;max-height:88vh;height:auto;min-height:520px;padding:32px;box-sizing:border-box;overflow:auto}" +
      "#ym-sheet .queue-head h3{font-size:30px}" +
      ".ym-tabs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 16px}" +
      ".ym-section{display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:22px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);cursor:pointer;text-align:left;font:inherit}" +
      ".ym-section.on{border-color:var(--accent);background:rgba(111,195,250,.14)}" +
      ".ym-section-icon{width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#6fc3fa,#7b5cff);display:flex;align-items:center;justify-content:center;flex:none}" +
      ".ym-section-icon svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}" +
      ".ym-section-text{min-width:0}" +
      ".ym-section-title{display:block;font-size:24px;font-weight:600}" +
      ".ym-section-desc{display:block;font-size:16px;color:var(--muted);margin-top:2px}" +
      ".ym-tab{padding:12px 22px;border-radius:999px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);font-size:20px;cursor:pointer}" +
      ".ym-tab.on{border-color:var(--accent);background:rgba(111,195,250,.14);color:var(--text)}" +
      ".ym-subtabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 16px}" +
      ".ym-subtab{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:18px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);font:inherit;font-size:20px;cursor:pointer;text-align:left;min-width:0}" +
      ".ym-subtab.on{border-color:var(--accent);background:rgba(111,195,250,.14)}" +
      ".ym-subtab-icon{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#6fc3fa,#7b5cff);display:flex;align-items:center;justify-content:center;flex:none}" +
      ".ym-subtab-icon svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}" +
      ".ym-tab{display:inline-flex;align-items:center;gap:10px}" +
      ".ym-tab svg{width:24px;height:24px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
      ".ym-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}" +
      ".ym-grid .ym-row{border:1px solid var(--line);border-radius:16px;padding:16px 18px;background:var(--surface-soft);margin:0}" +
      ".ym-grid .ym-subhead,.ym-grid .forecast-note{grid-column:1/-1}" +
      ".ym-hero{display:flex;align-items:center;gap:20px;padding:20px;border-radius:24px;border:1px solid var(--line);background:var(--surface-soft);margin-bottom:16px}" +
      ".ym-art{width:88px;height:88px;border-radius:20px;background:linear-gradient(135deg,#6fc3fa,#7b5cff);display:flex;align-items:center;justify-content:center;flex:none}" +
      ".ym-art svg{width:44px;height:44px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round}" +
      ".ym-hero-text{flex:1;min-width:0}" +
      ".ym-hero-title{font-size:30px;font-weight:600;color:var(--text)}" +
      ".ym-hero-sub{font-size:18px;color:var(--muted);margin-top:4px}" +
      ".ym-hero-go{margin:0;white-space:nowrap}" +
      ".ym-wave-more{width:100%;margin:14px 0 0;text-align:center}" +
      ".ym-actions{display:flex;gap:8px;flex:none}" +
      ".ym-mini{width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);font-size:22px;cursor:pointer}" +
      ".ym-mini:disabled{opacity:.5}" +
      ".ym-similar-of{grid-column:1/-1;padding-left:18px;border-left:2px solid var(--accent);margin:0 0 8px}" +
      ".ym-code{font-size:56px;font-weight:700;letter-spacing:.12em;text-align:center;padding:18px;margin:8px 0;border-radius:20px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text)}" +
      ".ym-thumb{width:56px;height:56px;border-radius:12px;object-fit:cover;flex:none;background:var(--surface-soft)}" +
      ".ym-row{gap:14px}" +
      ".ym-row>span:not(.ym-row-count){flex:1;min-width:0}" +
      ".ym-row-count{flex:none;white-space:nowrap}" +
      ".ym-station{cursor:pointer}" +
      ".ym-subhead{margin:18px 0 6px;color:var(--muted);font-size:18px;letter-spacing:.02em}" +
      ".ym-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 8px;border-bottom:1px solid var(--line);font-size:24px;color:var(--text)}" +
      ".ym-row-count{color:var(--muted);font-size:18px;white-space:nowrap}" +
      ".ym-search{width:100%;box-sizing:border-box;padding:16px 22px;border-radius:999px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);font-size:22px;margin-bottom:12px}" +
      ".ym-action{padding:18px 24px;border-radius:24px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);font-size:22px;cursor:pointer;margin-bottom:14px}";
    document.head.appendChild(style);
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function syncButton() {
    const button = document.getElementById("player-playlists");
    if (!button) return;
    button.innerHTML = ICON;
    button.hidden = false;
  }

  function ensureSheet() {
    let sheet = document.getElementById("ym-sheet");
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "ym-sheet";
    sheet.className = "forecast-sheet";
    sheet.hidden = true;
    sheet.innerHTML = '<div class="forecast-card queue-card" role="dialog" aria-label="Музыка">' +
      '<div class="queue-head"><h3>Музыка</h3><button type="button" class="queue-close" aria-label="Закрыть">×</button></div>' +
      '<div class="ym-tabs"></div><div class="ym-subtabs"></div><div id="ym-sheet-body"></div><p class="forecast-note" id="ym-sheet-note"></p></div>';
    sheet.querySelector(".queue-close").addEventListener("click", () => { sheet.hidden = true; });
    sheet.addEventListener("click", event => { if (event.target === sheet) sheet.hidden = true; });
    sheet.addEventListener("click", async event => {
      const like = event.target.closest && event.target.closest("[data-like]");
      const similarBtn = event.target.closest && event.target.closest("[data-similar]");
      if (like) {
        const removing = like.dataset.liked === "1";
        like.disabled = true;
        try {
          await setLike(like.dataset.like, removing);
          like.dataset.liked = removing ? "0" : "1";
          like.textContent = removing ? "♡" : "♥";
        } catch (error) { like.title = error.message; }
        like.disabled = false;
      } else if (similarBtn) {
        const row = similarBtn.closest(".ym-row");
        const host = row && row.parentElement;
        if (!host) return;
        const existing = host.querySelector(".ym-similar-of[data-of=\"" + similarBtn.dataset.similar + "\"]");
        if (existing) { existing.remove(); return; }
        const box = document.createElement("div");
        box.className = "ym-similar-of ym-grid";
        box.dataset.of = similarBtn.dataset.similar;
        box.innerHTML = '<p class="forecast-note">Загружаю…</p>';
        row.after(box);
        try {
          box.innerHTML = rows(await similar(similarBtn.dataset.similar), "Похожих нет.");
        } catch (error) { box.innerHTML = `<p class="forecast-note">${escapeText(error.message)}</p>`; }
      }
    });
    document.body.appendChild(sheet);
    return sheet;
  }

  function renderTabs(sheet) {
    sheet.querySelector(".ym-tabs").innerHTML = SECTIONS.map(([id, title, icon, desc]) =>
      `<button type="button" class="ym-section${id === activeSection ? " on" : ""}" data-section="${id}">` +
      `<span class="ym-section-icon">${icon}</span><span class="ym-section-text"><span class="ym-section-title">${title}</span><span class="ym-section-desc">${desc}</span></span></button>`).join("");
    sheet.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.section === activeSection) return;
      activeSection = button.dataset.section;
      activeTab = "playlists";
      renderTabs(sheet);
      renderTab(sheet);
    }));
    const sub = sheet.querySelector(".ym-subtabs");
    sub.hidden = activeSection !== "music";
    sub.innerHTML = activeSection === "music" ? MUSIC_TABS.map(([id, title, icon]) =>
      `<button type="button" class="ym-subtab${id === activeTab ? " on" : ""}" data-tab="${id}">` +
      `<span class="ym-subtab-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[icon]}</svg></span><span>${title}</span></button>`).join("") : "";
    sub.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      renderTabs(sheet);
      renderTab(sheet);
    }));
  }

  function rows(items, empty) {
    if (!items.length) return `<p class="forecast-note">${escapeText(empty)}</p>`;
    return `<div class="ym-grid">` + items.slice(0, 50).map(item => `<div class="ym-row">` + (item.cover ? `<img class="ym-thumb" src="${escapeText(item.cover)}" alt="" loading="lazy">` : "") + `<span>${escapeText(item.title)}${item.artists ? " — " + escapeText(item.artists) : ""}</span>` +
      (item.trackCount ? `<span class="ym-row-count">${item.trackCount} треков</span>` : "") +
      (item.id && !item.trackCount ? `<span class="ym-actions"><button type="button" class="ym-mini" data-like="${escapeText(item.id)}" aria-label="Лайк">♡</button><button type="button" class="ym-mini" data-similar="${escapeText(item.id)}" aria-label="Похожие">≈</button></span>` : "") +
      `</div>`).join("") + `</div>`;
  }

  // Same header card for every tab: icon, title, one line of text, optional action on the right.
  const PATHS = {
    note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    wave: '<path d="M3 12h2M7 9v6M11 6v12M15 9v6M19 11v2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    chart: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
    star: '<path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8z"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>'
  };
  function hero(icon, title, text, action) {
    return '<div class="ym-hero"><div class="ym-art" aria-hidden="true"><svg viewBox="0 0 24 24">' + PATHS[icon] + '</svg></div>' +
      '<div class="ym-hero-text"><div class="ym-hero-title">' + escapeText(title) + '</div><div class="ym-hero-sub">' + escapeText(text) + '</div></div>' + (action || "") + '</div>';
  }


  function renderLogin(sheet) {
    const body = sheet.querySelector("#ym-sheet-body");
    const note = sheet.querySelector("#ym-sheet-note");
    note.textContent = "";
    const hasClient = !!readKey(CLIENT_KEY);
    body.innerHTML = hero("note", "Вход в Яндекс Музыку", "Введите код на ya.ru/device") +
      (hasClient
        ? '<button type="button" class="ym-action" id="ym-login-start">Получить код</button>'
        : '<p class="forecast-note">Нужен client_id вашего приложения на oauth.yandex.ru</p>' +
          '<input class="ym-search" id="ym-client-input" placeholder="client_id" autocomplete="off">' +
          '<input class="ym-search" id="ym-secret-input" placeholder="client_secret (если есть)" autocomplete="off">' +
          '<button type="button" class="ym-action" id="ym-client-save">Сохранить</button>') +
      '<div id="ym-login-code"></div>';
    const save = body.querySelector("#ym-client-save");
    if (save) save.addEventListener("click", () => {
      storeKey(CLIENT_KEY, body.querySelector("#ym-client-input").value.trim());
      storeKey(SECRET_KEY, body.querySelector("#ym-secret-input").value.trim());
      renderLogin(sheet);
    });
    const start = body.querySelector("#ym-login-start");
    if (start) start.addEventListener("click", async () => {
      const out = body.querySelector("#ym-login-code");
      out.innerHTML = '<p class="forecast-note">Получаю код…</p>';
      try {
        const info = await startDeviceLogin();
        out.innerHTML = `<div class="ym-code">${escapeText(info.user_code)}</div><p class="forecast-note">Откройте ${escapeText(info.verification_url || "ya.ru/device")} и введите код</p>`;
        await pollDeviceLogin(info.device_code, info.interval, info.expires_in);
        clearCache();
        syncButton();
        renderTabs(sheet);
        renderTab(sheet);
      } catch (error) { out.innerHTML = `<p class="forecast-note">${escapeText(error.message)}</p>`; }
    });
  }

  async function renderTab(sheet) {
    const body = sheet.querySelector("#ym-sheet-body");
    const note = sheet.querySelector("#ym-sheet-note");
    note.textContent = "";
    body.innerHTML = "";
    if (!token()) { renderLogin(sheet); return; }
    try {
      if (activeSection === "radio") {
        body.innerHTML = hero("radio", "Станции", "Избранные станции и весь каталог") + "<p class=\"forecast-note\">Загружаю…</p>";
        const [favourites, catalogue] = await Promise.all([
          favouriteStations().catch(() => []),
          stations().catch(() => [])
        ]);
        const taken = new Set(favourites.map(item => item.seed));
        const rest = catalogue.filter(item => !taken.has(item.seed));
        const line = item => `<div class="ym-row ym-station" data-seed="${escapeText(item.seed)}">` + (item.cover ? `<img class="ym-thumb" src="${escapeText(item.cover)}" alt="" loading="lazy">` : "") + `<span>${escapeText(item.title)}</span></div>`;
        body.innerHTML = hero("radio", "Станции", "Избранные станции и весь каталог") + '<div class="ym-grid">' +
          (favourites.length ? '<div class="ym-subhead">Избранные станции</div>' + favourites.map(line).join("") : "") +
          (rest.length ? '<div class="ym-subhead">Все станции</div>' + rest.map(line).join("") : "") +
          (!favourites.length && !rest.length ? '<p class="forecast-note">Станции не загрузились. Проверьте токен.</p>' : "") +
          '</div><div id="ym-radio-tracks"></div>';
        body.querySelectorAll("[data-seed]").forEach(row => row.addEventListener("click", async () => {
          const out = body.querySelector("#ym-radio-tracks");
          out.innerHTML = "<p class=\"forecast-note\">Загружаю…</p>";
          try {
            radioSession = await wave(row.dataset.seed);
            out.innerHTML = rows(radioSession.tracks, "Станция пуста.") + '<button type="button" class="ym-action" id="ym-radio-next">Ещё треки</button>';
            out.querySelector("#ym-radio-next").addEventListener("click", async () => {
              const more = await waveNext(radioSession.sessionId);
              out.insertAdjacentHTML("beforeend", rows(more, "Больше треков нет."));
            });
          } catch (error) { out.innerHTML = `<p class="forecast-note">${escapeText(error.message)}</p>`; }
        }));
      } else if (activeTab === "wave") {
        body.innerHTML = hero("wave", "Моя волна", "Поток по вашим лайкам и прослушанному",
          '<button type="button" class="ym-action ym-hero-go" id="ym-wave-start">' + (waveSession ? "Новая волна" : "Запустить") + '</button>') +
          '<div id="ym-wave-list"></div>';
        const list = body.querySelector("#ym-wave-list");
        const showMore = () => {
          const more = list.querySelector("#ym-wave-next");
          if (more) more.remove();
          list.insertAdjacentHTML("beforeend", '<button type="button" class="ym-action ym-wave-more" id="ym-wave-next">Ещё треки</button>');
          list.querySelector("#ym-wave-next").addEventListener("click", async () => {
            try {
              const extra = await waveNext(waveSession.sessionId);
              list.querySelector("#ym-wave-next").insertAdjacentHTML("beforebegin", rows(extra, "Больше треков нет."));
            } catch (error) { list.insertAdjacentHTML("beforeend", `<p class="forecast-note">${escapeText(error.message)}</p>`); }
          });
        };
        if (waveSession) { list.innerHTML = rows(waveSession.tracks, "Волна пуста."); showMore(); }
        body.querySelector("#ym-wave-start").addEventListener("click", async () => {
          list.innerHTML = "<p class=\"forecast-note\">Загружаю…</p>";
          try {
            waveSession = await wave();
            body.querySelector("#ym-wave-start").textContent = "Новая волна";
            list.innerHTML = rows(waveSession.tracks, "Волна пуста.");
            showMore();
          } catch (error) { list.innerHTML = `<p class="forecast-note">${escapeText(error.message)}</p>`; }
        });
      } else if (activeTab === "foryou") {
        body.innerHTML = hero("star", "Для вас", "Подборки Яндекс Музыки для вас") + "<p class=\"forecast-note\">Загружаю…</p>";
        const blocks = await recommendations();
        body.innerHTML = hero("star", "Для вас", "Подборки Яндекс Музыки для вас") +
          (blocks.length ? blocks.map(block => '<div class="ym-subhead">' + escapeText(block.title) + '</div><div class="ym-grid">' +
            block.playlists.map(p => `<div class="ym-row ym-station" data-owner="${escapeText(p.owner)}" data-kind="${escapeText(p.kind)}">` + (p.cover ? `<img class="ym-thumb" src="${escapeText(p.cover)}" alt="" loading="lazy">` : "") + `<span>${escapeText(p.title)}</span>` +
              (p.trackCount ? `<span class="ym-row-count">${p.trackCount} треков</span>` : "") + "</div>").join("") + "</div>").join("")
            : '<p class="forecast-note">Подборок нет.</p>') + '<div id="ym-foryou-tracks"></div>';
        body.querySelectorAll("[data-kind]").forEach(row => row.addEventListener("click", async () => {
          const out = body.querySelector("#ym-foryou-tracks");
          out.innerHTML = "<p class=\"forecast-note\">Загружаю…</p>";
          try { out.innerHTML = rows(await playlistTracks(row.dataset.kind, row.dataset.owner), "В плейлисте нет треков."); }
          catch (error) { out.innerHTML = `<p class="forecast-note">${escapeText(error.message)}</p>`; }
        }));
      } else if (activeTab === "playlists") {
        body.innerHTML = hero("note", "Плейлисты", "Ваши плейлисты из Яндекс Музыки") + "<p class=\"forecast-note\">Загружаю…</p>";
        body.innerHTML = hero("note", "Плейлисты", "Ваши плейлисты из Яндекс Музыки") + rows(await playlists(), "Плейлистов нет.");
      } else if (activeTab === "search") {
        body.innerHTML = hero("search", "Поиск", "Треки по названию и исполнителю") + '<input class="ym-search" id="ym-search-input" type="search" placeholder="Найти трек" autocomplete="off"><div id="ym-search-list"></div>';
        const input = body.querySelector("#ym-search-input");
        input.addEventListener("keydown", async event => {
          if (event.key !== "Enter") return;
          const list = body.querySelector("#ym-search-list");
          list.innerHTML = "<p class=\"forecast-note\">Ищу…</p>";
          try { list.innerHTML = rows(await search(input.value), "Ничего не найдено."); }
          catch (error) { list.innerHTML = `<p class="forecast-note">${escapeText(error.message)}</p>`; }
        });
      } else if (activeTab === "chart") {
        body.innerHTML = hero("chart", "Чарт", "Популярное сейчас") + "<p class=\"forecast-note\">Загружаю…</p>";
        body.innerHTML = hero("chart", "Чарт", "Популярное сейчас") + rows(await chart(), "Чарт пуст.");
      }
    } catch (error) {
      note.textContent = error.message || "Не получилось загрузить.";
    }
  }

  async function openSheet() {
    const sheet = ensureSheet();
    sheet.hidden = false;
    renderTabs(sheet);
    renderTab(sheet);
  }

  function bindPlayer() {
    const button = document.getElementById("player-playlists");
    if (!button) return;
    button.addEventListener("click", openSheet);
    syncButton();
    window.addEventListener("storage", event => { if (event.key === TOKEN_KEY) syncButton(); });
    window.setInterval(syncButton, 3000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindPlayer);
  else bindPlayer();

  window.YmLibrary = { startDeviceLogin, pollDeviceLogin, uid, playlists, playlistTracks, likes, search, lyrics, wave, waveNext, chart, favouriteStations, stations, similar, setLike, recommendations, clearCache };
})();
