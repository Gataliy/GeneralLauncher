// Yandex Music library: playlists and liked tracks, through the public account API.
// Uses only the user's own OAuth token (saved in settings). No signing, no download links.
// Shapes follow the public API: /account/status -> account.uid; /users/{uid}/playlists/list -> [playlist];
// /users/{uid}/likes/tracks -> library.tracks[{id}]; /tracks (POST track-ids) -> [track].
(function () {
  const API = "https://api.music.yandex.net";
  const TOKEN_KEY = "generic_launcher_ym_token_v1";
  const cache = { uid: null, playlists: null, likes: null };

  function token() {
    try { return (localStorage.getItem(TOKEN_KEY) || "").trim(); } catch (error) { return ""; }
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
    cache.playlists = (Array.isArray(list) ? list : []).map(p => ({ kind: String(p.kind), title: p.title || "", trackCount: p.trackCount || 0 }));
    return cache.playlists;
  }

  // Tracks of one playlist, resolved to { id, title, artists }.
  async function playlistTracks(kind) {
    const id = await uid();
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
        artists: (t.artists || []).map(a => a.name).join(", ")
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
    return results.map(t => ({ id: String(t.id), title: t.title || "", artists: (t.artists || []).map(a => a.name).join(", ") }));
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
      id: String(t.id), title: t.title || "", artists: (t.artists || []).map(a => a.name).join(", ")
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

  // Radio stations: GET /rotor/stations/list -> [{ station: { id: { type, tag }, name } }].
  // A station is started with wave(seed) where seed = "type:tag" (best effort: shape not yet checked on the head unit).
  async function stations() {
    const data = await call("/rotor/stations/list");
    return (Array.isArray(data) ? data : []).map(item => item && item.station).filter(Boolean).map(station => {
      const id = station.id || {};
      return { seed: id.type && id.tag ? `${id.type}:${id.tag}` : "", title: station.name || "" };
    }).filter(item => item.seed && item.title);
  }

  function clearCache() { cache.playlists = null; cache.likes = null; }


  // Player button and the "Музыка" sheet: top tabs Яндекс Музыка / Яндекс Радио.
  // Music has sub-tabs Плейлисты, Поиск, Чарт; Radio lists stations (first one is "Моя волна").
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8"/><circle cx="18" cy="17" r="2.5"/><path d="M20.5 17V7"/></svg>';
  const SECTIONS = [["music", "Яндекс Музыка"], ["radio", "Яндекс Радио"]];
  const MUSIC_TABS = [["playlists", "Плейлисты"], ["search", "Поиск"], ["chart", "Чарт"]];
  let activeSection = "music";
  let activeTab = "playlists";
  let radioSession = null;

  if (!document.getElementById("ym-sheet-style")) {
    const style = document.createElement("style");
    style.id = "ym-sheet-style";
    style.textContent =
      "#ym-sheet .queue-card{width:min(1100px,94vw);max-width:94vw;max-height:88vh;height:auto;min-height:520px;padding:32px;box-sizing:border-box;overflow:auto}" +
      "#ym-sheet .queue-head h3{font-size:30px}" +
      ".ym-tabs{display:flex;gap:10px;margin:0 0 18px;flex-wrap:wrap}" +
      ".ym-tab{padding:12px 22px;border-radius:999px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);font-size:20px;cursor:pointer}" +
      ".ym-tab.on{border-color:var(--accent);background:rgba(111,195,250,.14);color:var(--text)}" +
      ".ym-subtabs{display:flex;gap:10px;margin:0 0 18px;flex-wrap:wrap}" +
      ".ym-station{cursor:pointer}" +
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
    button.hidden = !token();
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
    document.body.appendChild(sheet);
    return sheet;
  }

  function renderTabs(sheet) {
    sheet.querySelector(".ym-tabs").innerHTML = SECTIONS.map(([id, title]) =>
      `<button type="button" class="ym-tab${id === activeSection ? " on" : ""}" data-section="${id}">${title}</button>`).join("");
    sheet.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.section === activeSection) return;
      activeSection = button.dataset.section;
      activeTab = "playlists";
      renderTabs(sheet);
      renderTab(sheet);
    }));
    const sub = sheet.querySelector(".ym-subtabs");
    sub.hidden = activeSection !== "music";
    sub.innerHTML = activeSection === "music" ? MUSIC_TABS.map(([id, title]) =>
      `<button type="button" class="ym-tab${id === activeTab ? " on" : ""}" data-tab="${id}">${title}</button>`).join("") : "";
    sub.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      renderTabs(sheet);
      renderTab(sheet);
    }));
  }

  function rows(items, empty) {
    if (!items.length) return `<p class="forecast-note">${escapeText(empty)}</p>`;
    return items.slice(0, 50).map(item => `<div class="ym-row"><span>${escapeText(item.title)}${item.artists ? " — " + escapeText(item.artists) : ""}</span>` +
      (item.trackCount ? `<span class="ym-row-count">${item.trackCount} треков</span>` : "") + `</div>`).join("");
  }

  async function renderTab(sheet) {
    const body = sheet.querySelector("#ym-sheet-body");
    const note = sheet.querySelector("#ym-sheet-note");
    note.textContent = "";
    body.innerHTML = "";
    try {
      if (activeSection === "radio") {
        body.innerHTML = "<p class=\"forecast-note\">Загружаю…</p>";
        const extra = await stations().catch(() => []);
        const list = [{ seed: "user:onyourwave", title: "Моя волна" }].concat(extra);
        body.innerHTML = list.map(item => `<div class="ym-row ym-station" data-seed="${escapeText(item.seed)}"><span>${escapeText(item.title)}</span></div>`).join("") +
          '<div id="ym-radio-tracks"></div>';
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
      } else if (activeTab === "playlists") {
        body.innerHTML = "<p class=\"forecast-note\">Загружаю…</p>";
        body.innerHTML = rows(await playlists(), "Плейлистов нет.");
      } else if (activeTab === "search") {
        body.innerHTML = '<input class="ym-search" id="ym-search-input" type="search" placeholder="Найти трек" autocomplete="off"><div id="ym-search-list"></div>';
        const input = body.querySelector("#ym-search-input");
        input.addEventListener("keydown", async event => {
          if (event.key !== "Enter") return;
          const list = body.querySelector("#ym-search-list");
          list.innerHTML = "<p class=\"forecast-note\">Ищу…</p>";
          try { list.innerHTML = rows(await search(input.value), "Ничего не найдено."); }
          catch (error) { list.innerHTML = `<p class="forecast-note">${escapeText(error.message)}</p>`; }
        });
      } else if (activeTab === "chart") {
        body.innerHTML = "<p class=\"forecast-note\">Загружаю…</p>";
        body.innerHTML = rows(await chart(), "Чарт пуст.");
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

  window.YmLibrary = { uid, playlists, playlistTracks, likes, search, lyrics, wave, waveNext, chart, stations, clearCache };
})();
