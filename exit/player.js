// Media card: now-playing info, artwork and transport buttons.
const MEDIA_TOGGLE = "TOGGLE_MEDIA_PLAY";
// Hidden from the picker: the player on the home screen already has prev, play/pause and next.
const MEDIA_MERGED = ["MEDIA_PLAY", "MEDIA_PAUSE", "MEDIA_NEXT", "MEDIA_BLACK", "MEDIA_PLAY_PAUSE"];
const PLAY_STATE_KEY = "generic_launcher_play_v1";

// PlayStat format is not documented: accept clear text or booleans, otherwise leave the state unknown.
function parsePlayStat(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/pause|stop/.test(text)) return false;
  if (/play/.test(text)) return true;
  return null;
}

function renderPlayButton() {
  const playing = state.isPlaying === true;
  document.querySelectorAll('.player-controls .play').forEach(button => {
    button.textContent = playing ? "❚❚" : "▶";
    button.setAttribute("aria-label", playing ? "Пауза" : "Воспроизвести");
  });
}

function applyPlayStat(data) {
  if (!Object.prototype.hasOwnProperty.call(data, "PlayStat")) return;
  const playing = parsePlayStat(data.PlayStat);
  if (playing == null) return;
  const optimistic = state.playOptimistic;
  if (optimistic && Date.now() < optimistic.until && playing !== optimistic.value) return;
  if (optimistic) state.playOptimistic = null;
  state.isPlaying = playing;
  renderPlayButton();
}

function nextPlayCommand() {
  let playing = state.isPlaying;
  if (playing == null) {
    try { playing = localStorage.getItem(PLAY_STATE_KEY) === "playing"; }
    catch (error) { console.warn("Состояние воспроизведения не прочитано", error); playing = false; }
  }
  const next = playing ? "MEDIA_PAUSE" : "MEDIA_PLAY";
  const target = next === "MEDIA_PLAY";
  state.isPlaying = target;
  state.playOptimistic = { value: target, until: Date.now() + 4_000 };
  try { localStorage.setItem(PLAY_STATE_KEY, target ? "playing" : "paused"); }
  catch (error) { console.warn("Состояние воспроизведения не сохранено", error); }
  renderPlayButton();
  return next;
}

function musicArtworkUrl(value) {
  const picture = String(value || "").trim();
  if (!picture) return "";
  if (/^data:image\//i.test(picture)) return picture.replace(/\s+/g, "");
  return `data:image/png;base64,${picture.replace(/\s+/g, "")}`;
}

// Track position (Trpos) and length (Trdur) from the JCarTools musicInfo event.
// Both values use one unit, so only their ratio matters; the old names stay as fallbacks.
function applyTrackProgress(data) {
  const duration = Number(data.Trdur ?? data.SongDuration ?? data.duration);
  const position = Number(data.Trpos ?? data.SongPosition ?? data.position ?? data.progress);
  const bar = document.getElementById("track-progress");
  if (!Number.isFinite(duration) || !Number.isFinite(position) || duration <= 0 || position < 0) {
    bar.classList.remove("has-data");
    document.getElementById("track-pos").textContent = "--:--";
    document.getElementById("track-end").textContent = "--:--";
    return;
  }
  window.trackClock = { duration, position, at: Date.now() };
  const percent = Math.min(100, (position / duration) * 100);
  document.getElementById("track-progress-fill").style.width = `${percent}%`;
  bar.classList.add("has-data");
  // Start and end of the track in the expanded player. Units are assumed to be seconds (milliseconds if the value is very large).
  const toSeconds = value => (value > 36000 ? value / 1000 : value);
  document.getElementById("track-line-fill").style.width = `${percent}%`;
  document.getElementById("track-pos").textContent = formatTrackTime(toSeconds(position));
  document.getElementById("track-end").textContent = formatTrackTime(toSeconds(duration));
}

function applyMusicInfo(raw) {
  const data = parseJson(raw, raw) || {};
  state.lastMusicRaw = raw;
  applyPlayStat(data);
  applyTrackProgress(data);
  document.getElementById("track-title").textContent = data.SongName || data.title || "Музыка не выбрана";
  document.getElementById("track-artist").textContent = data.SongArtist || data.artist || "Исполнитель не указан";
  const art = document.getElementById("album-art");
  if (Object.prototype.hasOwnProperty.call(data, "SongAlbumPicture") ||
      Object.prototype.hasOwnProperty.call(data, "albumArt")) {
    const picture = musicArtworkUrl(data.SongAlbumPicture || data.albumArt);
    if (picture) {
      art.style.backgroundImage = `url("${picture}")`;
      art.classList.add("has-image");
    } else {
      art.style.backgroundImage = "";
      art.classList.remove("has-image");
    }
  }
}

// Tapping the cover moves the whole top row (clock, weather, player) down into the slot area;
// the cover grows and the row fades in. Tapping the player again, or changing page, puts the row back up.
function expandPlayer() {
  const row = document.querySelector(".hero-bottom");
  const stage = document.getElementById("player-stage");
  if (!row || !stage || state.playerExpanded) return;
  row.classList.add("in-stage");
  stage.replaceChildren(row);
  stage.hidden = false;
  document.getElementById("action-slots").hidden = true;
  document.getElementById("app-drawer").hidden = true;
  document.getElementById("add-slot").hidden = true;
  state.playerExpanded = true;
  // Only the clock, weather and the player stay on screen while the player is open.
  document.body.classList.add("player-expanded");
  readVolume();
  // A moment later: the cover starts from its small size and grows (CSS transition).
  setTimeout(() => document.querySelector(".player-widget").classList.add("expanded"), 30);
}

// animated=false is used when the page changes, so the slots appear at once.
function collapsePlayer(animated = true) {
  if (!state.playerExpanded || state.playerLeaving) return;
  const row = document.querySelector("#player-stage .hero-bottom");
  if (!row) return;
  document.querySelector(".player-widget").classList.remove("expanded");
  if (!animated) {
    finishCollapse();
    return;
  }
  state.playerLeaving = true;
  row.classList.add("leaving");
  setTimeout(finishCollapse, 230);
}

function finishCollapse() {
  const stage = document.getElementById("player-stage");
  const row = stage.querySelector(".hero-bottom");
  if (row) {
    row.classList.remove("in-stage", "leaving");
    document.getElementById("hero").appendChild(row);
  }
  stage.replaceChildren();
  stage.hidden = true;
  state.playerExpanded = false;
  state.playerLeaving = false;
  document.body.classList.remove("player-expanded");
  renderPage();
}

// Only the cover opens and closes the top row; the rest of the card does nothing on tap.
function bindPlayerTap() {
  // Как раньше: обложка раскрывает верхний ряд на месте, повторное нажатие возвращает его.
  document.querySelector(".album-art").addEventListener("click", () => (state.playerExpanded ? collapsePlayer() : expandPlayer()));
  // Tapping the empty dark area around the player closes it; the controls and the text do not.
}

// Expanded player: track start / end time and a volume slider. The slider uses the car's absolute volume
// when the bridge provides setVolume / getVolume; otherwise it steps with the car's own Volume_Up / Volume_Down.
function formatTrackTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

let volumeShown = 50;
let volumeSentLevel = null;

function setVolumeView(value) {
  const level = Math.max(0, Math.min(100, Math.round(value)));
  volumeShown = level;
  document.getElementById("player-vol-fill").style.width = `${level}%`;
  document.getElementById("player-vol-thumb").style.left = `${level}%`;
  document.getElementById("player-vol-val").textContent = `${level}%`;
  document.getElementById("player-vol-line").setAttribute("aria-valuenow", String(level));
}

function readVolume() {
  if (!bridge.has("getVolume")) return;
  const value = Number(parseJson(bridge.call("getVolume", TOKEN), null));
  if (!Number.isFinite(value)) return;
  volumeSentLevel = value;
  setVolumeView(value);
}

function sendVolume(target) {
  if (bridge.has("setVolume")) {
    volumeSentLevel = target;
    bridge.call("setVolume", TOKEN, target);
    return;
  }
  // Volume_Up / Volume_Down change the level by 1 % each (core_manifest). At most 30 presses per move; the rest follows on the next move.
  const from = volumeSentLevel ?? target;
  const steps = Math.round(target - from);
  const count = Math.min(Math.abs(steps), 30);
  const command = steps > 0 ? "Volume_Up" : "Volume_Down";
  for (let i = 0; i < count; i += 1) bridge.runEnum(command);
  volumeSentLevel = from + Math.sign(steps) * count;
}

function bindVolumeSlider() {
  const line = document.getElementById("player-vol-line");
  if (!line) return;
  let dragging = false;
  let lastSent = 0;
  const pick = event => {
    const rect = line.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 100);
  };
  line.addEventListener("pointerdown", event => {
    if (!state.playerExpanded) return;
    dragging = true;
    line.setPointerCapture(event.pointerId);
    setVolumeView(pick(event));
    lastSent = Date.now();
    sendVolume(volumeShown);
  });
  line.addEventListener("pointermove", event => {
    if (!dragging) return;
    setVolumeView(pick(event));
    if (Date.now() - lastSent > 150) { lastSent = Date.now(); sendVolume(volumeShown); }
  });
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    if (volumeShown !== volumeSentLevel) sendVolume(volumeShown);
  };
  line.addEventListener("pointerup", finish);
  line.addEventListener("pointercancel", finish);
}
bindVolumeSlider();
