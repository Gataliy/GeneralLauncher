// Home wallpaper. The picture is loaded as an <img> (no fetch, so no CORS limits in the head unit WebView),
// checked, then set as the body background. The last good address is kept, and a new one is loaded once a day
// or when the empty area of the home screen is tapped.
const WALLPAPER_URL_KEY = "generic_launcher_wallpaper_url_v2";
const WALLPAPER_DAY_KEY = "generic_launcher_wallpaper_day";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// Where the picture comes from: "online" (servers below), "local" (files listed in LOCAL_WALLPAPERS) or "black".
const WALLPAPER_SOURCE_KEY = "generic_launcher_wallpaper_source_v1";
const WALLPAPER_SERVERS_KEY = "generic_launcher_wallpaper_servers_v1";
const WALLPAPER_CUSTOM_KEY = "generic_launcher_wallpaper_custom_v1";
// Pictures bundled with the launcher: copy the files to assets/wallpapers and list them here, for example "assets/wallpapers/lake.jpg".
const LOCAL_WALLPAPERS = [
  "images/wallpapers/Ave-calvar-cave.jpg",
  "images/wallpapers/Blue-wave-abstract.jpg",
  "images/wallpapers/Lotr-inspired-landscape-tyron603.jpg",
  "images/wallpapers/Tide-iswanto-arif.jpg",
  "images/wallpapers/Woods.jpg",
  "images/wallpapers/abstract-lighthouse-at-sea.jpg",
  "images/wallpapers/autumn-leaves-red-orange.jpg",
  "images/wallpapers/black-hole-field.jpg",
  "images/wallpapers/black-hole-illustration.jpg",
  "images/wallpapers/fw-tower.jpg",
  "images/wallpapers/gandalf-balrog-fire.jpg",
  "images/wallpapers/golden-gate-bridge-fog.jpg",
  "images/wallpapers/gradient-sunset-sky.jpg",
  "images/wallpapers/gruvbox-wave-crash-imagegonord.jpg",
  "images/wallpapers/guillaume-auceps-unsplash.jpg",
  "images/wallpapers/hanyijie.jpg",
  "images/wallpapers/jonny-gios-unsplash.jpg",
  "images/wallpapers/kace-rodriguez-unsplash.jpg",
  "images/wallpapers/kriegs-2024-february.jpg",
  "images/wallpapers/majestic-mountain-silhouette.jpg",
  "images/wallpapers/max-suleimanov-winter-ruins.jpg",
  "images/wallpapers/mountain-sunset-silhouette.jpg",
  "images/wallpapers/nord-mountain-sunset.jpg",
  "images/wallpapers/winding-mountain-road-sunset.jpg"
];
// Curated Unsplash photos (direct CDN links, the same list as in the Tomsk dashboard). They load on the head unit and are tried first.
const UNSPLASH_WALLPAPERS = [
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1473773508845-188df298d2d1?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1502139214982-d0ad755818d8?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1419833173245-f59e1b93f9ee?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1432251407527-504a6b4174a2?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1414609245224-afa02bfb3fda?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1557682260-96773eb01377?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1920&q=85"
];

// Online servers. Each one can be switched off in the settings sheet, Wallpapers tab.
const WALLPAPER_SERVER_IDS = [
  { id: "unsplash", name: "Unsplash (Томск)", url: () => UNSPLASH_WALLPAPERS[Math.floor(Math.random() * UNSPLASH_WALLPAPERS.length)] },
  { id: "loremflickr", name: "LoremFlickr", url: (w, h, r) => `https://loremflickr.com/${w}/${h}/landscape/all?lock=${r}` },
  { id: "loremflickrcn", name: "LoremFlickr CN (Россия)", url: (w, h, r) => `https://loremflickrcn.com/${w}/${h}/landscape?random&lock=${r}` },
  { id: "picsum_proxy", name: "Picsum через jcartools.ru (Россия)", url: (w, h, r) => `https://jcartools.ru/run/picsum_proxy.php?${w}/${h}&r=${r}` },
  { id: "picsum", name: "Picsum", url: (w, h, r) => `https://picsum.photos/${w}/${h}?r=${r}` },
  { id: "placekitten", name: "PlaceKitten", url: (w, h) => `https://placekitten.com/${w}/${h}?image=${Math.floor(Math.random() * 100)}` }
];

function wallpaperSource() {
  try { return localStorage.getItem(WALLPAPER_SOURCE_KEY) || "online"; } catch (error) { return "online"; }
}

const WALLPAPER_SEEN_KEY = "generic_launcher_wallpaper_seen_v1";
// Servers added after the first lists were saved. They are switched on once for everyone; the others keep the user's list.
const LATE_SERVER_IDS = ["unsplash"];
function enabledServerIds() {
  const all = WALLPAPER_SERVER_IDS.map(server => server.id);
  let saved = null;
  let seen = null;
  try { saved = JSON.parse(localStorage.getItem(WALLPAPER_SERVERS_KEY)); } catch (error) { saved = null; }
  try { seen = JSON.parse(localStorage.getItem(WALLPAPER_SEEN_KEY)); } catch (error) { seen = null; }
  if (!Array.isArray(saved)) {
    try { localStorage.setItem(WALLPAPER_SEEN_KEY, JSON.stringify(all)); } catch (error) { /* keep going */ }
    return all;
  }
  // A server added in a later build is switched on once; after that the choice the user made is kept.
  const known = Array.isArray(seen) ? seen : [];
  const fresh = LATE_SERVER_IDS.filter(id => all.includes(id) && !known.includes(id) && !saved.includes(id));
  if (fresh.length) {
    saved = saved.concat(fresh);
    try { localStorage.setItem(WALLPAPER_SERVERS_KEY, JSON.stringify(saved)); } catch (error) { /* keep going */ }
  }
  try { localStorage.setItem(WALLPAPER_SEEN_KEY, JSON.stringify(all)); } catch (error) { /* keep going */ }
  return saved;
}

function customServerUrl() {
  try { return (localStorage.getItem(WALLPAPER_CUSTOM_KEY) || "").trim(); } catch (error) { return ""; }
}

function applyWallpaperUrl(url) {
  // The picture is shown only when the media player is expanded (see styles.css), not on the home screen.
  document.documentElement.style.setProperty("--wallpaper", url ? `url("${url}")` : "none");
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("тайм-аут")), 8_000);
    image.onload = () => { clearTimeout(timer); resolve(url); };
    image.onerror = () => { clearTimeout(timer); reject(new Error("не загрузилось")); };
    image.src = url;
  });
}

// The custom server goes first. {w} and {h} in its address are replaced with the screen size.
function wallpaperCandidates() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const stamp = Date.now();
  const enabled = enabledServerIds();
  const list = [];
  const custom = customServerUrl();
  if (/^https?:\/\//i.test(custom)) {
    let url = custom.replace(/\{w\}|%w%/g, String(width)).replace(/\{h\}|%h%/g, String(height));
    if (!/[?&](r|t|lock)=/i.test(url)) url += (url.includes("?") ? "&" : "?") + "r=" + stamp;
    list.push(url);
  }
  for (const server of WALLPAPER_SERVER_IDS) {
    if (enabled.includes(server.id)) list.push(server.url(width, height, stamp));
  }
  return list;
}

function localWallpaperFor(force) {
  if (!LOCAL_WALLPAPERS.length) return "";
  // Changes once a day, or on every "new picture" request.
  const index = force ? Math.floor(Math.random() * LOCAL_WALLPAPERS.length) : new Date().getDate() % LOCAL_WALLPAPERS.length;
  return LOCAL_WALLPAPERS[index];
}

async function setHeroWallpaper(force = false) {
  const source = wallpaperSource();
  if (source === "black") {
    applyWallpaperUrl("");
    return;
  }
  if (source === "local") {
    const path = localWallpaperFor(force);
    if (!path) {
      applyWallpaperUrl("");
      showToast("Своих обоев пока нет. Добавьте файлы в список LOCAL_WALLPAPERS в wallpaper.js", 5000);
      return;
    }
    applyWallpaperUrl(path);
    try { localStorage.setItem(WALLPAPER_URL_KEY, path); } catch (error) { /* keep going */ }
    if (force) showToast("Фон обновлён", 2000);
    return;
  }

  let saved = null;
  let savedDay = null;
  try {
    saved = localStorage.getItem(WALLPAPER_URL_KEY);
    savedDay = localStorage.getItem(WALLPAPER_DAY_KEY);
  } catch (error) { console.warn("Фон не прочитан", error); }

  // Show the saved picture straight away.
  if (saved) applyWallpaperUrl(saved);
  // Already set today: no new request unless the user asks for a new picture.
  if (!force && saved && savedDay === todayKey()) return;

  const candidates = wallpaperCandidates();
  if (!candidates.length) {
    showToast("Не выбран ни один сервер обоев. Включите его в настройках", 5000);
    return;
  }
  // Nothing saved yet: the built-in picture shows at once, and an online one replaces it when it loads.
  if (!saved && LOCAL_WALLPAPERS.length) applyWallpaperUrl(localWallpaperFor(false));
  const errors = [];
  for (const url of candidates) {
    try {
      await loadImage(url);
      applyWallpaperUrl(url);
      try {
        localStorage.setItem(WALLPAPER_URL_KEY, url);
        localStorage.setItem(WALLPAPER_DAY_KEY, todayKey());
      } catch (error) { console.warn("Фон не сохранён", error); }
      if (force) showToast("Фон обновлён", 3000);
      return;
    } catch (error) {
      errors.push(error.message);
      console.warn("Фон не загрузился", url, error);
    }
  }
  // No online picture: the built-in gallery is used, so the expanded player still has a wallpaper.
  if (LOCAL_WALLPAPERS.length) {
    applyWallpaperUrl(localWallpaperFor(false));
    showToast("Онлайн-обои не загрузились, показан фон из сборки", 3000);
    return;
  }
  showToast(saved ? "Не удалось загрузить новый фон, оставлен прежний" : "Фон не загрузился: " + errors.join(", "), 6000);
}

// Favourite wallpapers. A long press on an empty part of the home screen saves the current picture.
// A tap cycles through the favourites and, after the last one, asks for a new random picture.
const WALLPAPER_FAVORITES_KEY = "generic_launcher_wallpaper_favorites_v1";
const WALLPAPER_FAVORITES_MAX = 12;
let wallpaperFavIndex = -1;

function loadWallpaperFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem(WALLPAPER_FAVORITES_KEY));
    return Array.isArray(list) ? list.filter(item => typeof item === "string" && item) : [];
  } catch (error) { return []; }
}

function saveWallpaperFavorites(list) {
  try { localStorage.setItem(WALLPAPER_FAVORITES_KEY, JSON.stringify(list)); }
  catch (error) { console.warn("Избранное не сохранено", error); }
}

function currentWallpaperUrl() {
  try { return localStorage.getItem(WALLPAPER_URL_KEY) || ""; } catch (error) { return ""; }
}

function wallpaperTap() {
  const favorites = loadWallpaperFavorites();
  if (!favorites.length) { setHeroWallpaper(true); return; }
  wallpaperFavIndex += 1;
  if (wallpaperFavIndex >= favorites.length) {
    wallpaperFavIndex = -1;
    setHeroWallpaper(true);
    return;
  }
  const url = favorites[wallpaperFavIndex];
  applyWallpaperUrl(url);
  try { localStorage.setItem(WALLPAPER_URL_KEY, url); } catch (error) { /* keep going */ }
  showToast(`Избранные обои ${wallpaperFavIndex + 1} из ${favorites.length}`, 2000);
}

(function bindWallpaperFavorites() {
  const dashboard = document.querySelector(".dashboard");
  if (!dashboard) return;
  const SKIP = "button, article, nav, .action-slots, .page-tabs, .page-controls, .hero-clock, .weather-widget, .player-widget, .actions-header, .actions-title-row, .toast, .sheet-backdrop, .hero-widgets, .hw-card, .hw-edit-bar, #picker, #editor-root";
  let timer = null;
  let saved = false;
  dashboard.addEventListener("pointerdown", event => {
    saved = false;
    if (event.target.closest(SKIP) || document.body.classList.contains("hw-edit")) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const url = currentWallpaperUrl();
      if (!url) { showToast("Обои ещё не загружены"); return; }
      const list = loadWallpaperFavorites().filter(item => item !== url);
      list.unshift(url);
      saveWallpaperFavorites(list.slice(0, WALLPAPER_FAVORITES_MAX));
      saved = true;
      showToast("Обои сохранены в избранное");
    }, 800);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(type => dashboard.addEventListener(type, () => clearTimeout(timer)));
  // The tap that ends a long press must not also change the wallpaper.
  dashboard.addEventListener("click", event => {
    if (saved) { saved = false; event.stopPropagation(); event.preventDefault(); }
  }, true);
})();
