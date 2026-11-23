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

  function clearCache() { cache.playlists = null; cache.likes = null; }

  window.YmLibrary = { uid, playlists, playlistTracks, likes, clearCache };
})();
