// Уведомление о смене песни: пилюля сверху (обложка, название, исполнитель), 6 секунд, по нажатию открывает музыку.
// Полоса радара (если радар активен) занимает то же место сверху: тогда пилюля песни уходит.
let lastTrackKey = null;
let trackToastTimer = null;
let lastToastOpenAt = 0;
const TIGGO_MUSIC_APP = "ru.yandex.music";

// One row at the top centre for the track pill, the radar pill and any other top notice.
function topPillsElement() {
  let box = document.getElementById("top-pills");
  if (!box) {
    box = document.createElement("div");
    box.id = "top-pills";
    document.body.appendChild(box);
  }
  return box;
}

function trackToastElement() {
  let toast = document.getElementById("track-toast");
  if (toast) return toast;
  toast = document.createElement("div");
  toast.id = "track-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = '<span class="tt-art" aria-hidden="true"></span><div class="tt-text"><strong class="tt-title"></strong><span class="tt-artist"></span></div>';
  const open = () => {
    const now = Date.now();
    if (now - lastToastOpenAt < 500) return;
    lastToastOpenAt = now;
    hideTrackToast();
    if (bridge.has("runApp")) bridge.runApp(TIGGO_MUSIC_APP);
  };
  toast.addEventListener("pointerdown", open);
  toast.addEventListener("click", open);
  topPillsElement().appendChild(toast);
  return toast;
}

function showTrackToast(title, artist, picture) {
  const toast = trackToastElement();
  toast.querySelector(".tt-title").textContent = title;
  toast.querySelector(".tt-artist").textContent = artist || "";
  const url = typeof musicArtworkUrl === "function" ? musicArtworkUrl(picture) : "";
  toast.querySelector(".tt-art").style.backgroundImage = url ? `url("${url}")` : "";
  toast.classList.add("show");
  clearTimeout(trackToastTimer);
  trackToastTimer = setTimeout(hideTrackToast, 6000);
}

function hideTrackToast() {
  clearTimeout(trackToastTimer);
  const toast = document.getElementById("track-toast");
  if (toast) toast.classList.remove("show");
}

// Called on every musicInfo message. The first message after start-up only records the track, so nothing pops up on launch.
function noteTrackChange(title, artist, picture) {
  if (!title) return;
  const key = `${title}|${artist}`;
  if (lastTrackKey === null) { lastTrackKey = key; return; }
  if (key === lastTrackKey) return;
  lastTrackKey = key;
  showTrackToast(title, artist, picture);
}

// Radar strip at the top: shown while the car reports an active radar (window.navWarning.hud).
function radarStripElement() {
  let strip = document.getElementById("radar-strip");
  if (strip) return strip;
  strip = document.createElement("div");
  strip.id = "radar-strip";
  strip.hidden = true;
  strip.innerHTML = '<span class="ns-radar"></span>';
  topPillsElement().appendChild(strip);
  return strip;
}

function syncRadarStrip() {
  const hud = window.navWarning && window.navWarning.hud;
  const strip = radarStripElement();
  strip.hidden = !hud;
  document.body.classList.toggle("radar-only", !!hud);
  if (hud) {
    const limit = hud.limit ? ` ${hud.limit}` : "";
    strip.querySelector(".ns-radar").textContent = `Радар${limit}`;
  }
}
setInterval(syncRadarStrip, 1000);
