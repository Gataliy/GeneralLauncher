// Events from the Android side and small shared helpers.
// Events that arrive several times a second (map frames, GPS, speed, rpm, music progress) are not written to the
// diagnostics log, otherwise the log fills with lines. Background polls of car data (veh_, sun_, state_) are skipped too.
const DIAG_QUIET_EVENTS = ["minimapframe", "gps", "speed", "rpm", "musicinfo", "hud"];
const DIAG_QUIET_REQUESTS = /"requestId"\s*:\s*"(veh|sun|state|carst|fan)_/;
window.onAndroidEvent = function onAndroidEvent(type, data) {
  const quiet = DIAG_QUIET_EVENTS.includes(String(type).toLowerCase())
    || (type === "carResponse" && DIAG_QUIET_REQUESTS.test(typeof data === "string" ? data : JSON.stringify(data) || ""));
  if (!quiet) logDiag(type, data);
  if (type === "carResponse") handleCarResponse(data);
  if (type === "launcherCatalog") applyLauncherCatalog(data);
  if (type === "musicInfo") applyMusicInfo(data);
  if (type === "weather") applyWeather(data);
  if (type === "theme") applyTheme(data);
  if (type === "speed") noteSpeed(data);
  if (type === "rpm") applyRpm(data);
  if (String(type).toLowerCase() === "minimapframe") applyNavFrame(data);
  if (String(type).toLowerCase() === "hud") applyNavHud(data);
  if (type === "gps") {
    const latitude = Number(data?.lat);
    const longitude = Number(data?.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      state.weatherLocation = { lat: latitude, lon: longitude };
      if (typeof window.checkCameraAlerts === "function") window.checkCameraAlerts(latitude, longitude);
      if (!state.lastWeatherRequestAt) refreshWeather();
    }
  }
};

window.JctInsets = function (left, top, right, bottom) {
  const root = document.documentElement.style;
  root.setProperty("--safe-left", `${Math.max(0, Number(left) || 0)}px`);
  root.setProperty("--safe-top", `${Math.max(0, Number(top) || 0)}px`);
  root.setProperty("--safe-right", `${Math.max(0, Number(right) || 0)}px`);
  root.setProperty("--safe-bottom", `${Math.max(0, Number(bottom) || 0)}px`);
};

function showToast(message, duration = 1900) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), duration);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

// Day / night: the head unit sends "theme" with mode dark or light. The payload may arrive as an object,
// a JSON string, or a bare word, so all of these forms are accepted.
const THEME_KEY = "generic_launcher_theme_v1";
// Theme chosen by hand in the settings ("light" or "dark"). When it is set, neither the car nor the time of day changes it.
const THEME_MANUAL_KEY = "generic_launcher_theme_manual_v1";
function manualTheme() {
  try {
    const value = localStorage.getItem(THEME_MANUAL_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch (error) { return null; }
}
function themeFromPayload(data) {
  let value = data;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try { value = JSON.parse(value); } catch (error) { /* keep the raw string */ }
  }
  if (value && typeof value === "object") {
    value = value.mode ?? value.value ?? value.theme ?? value.uiMode ?? value.nightMode
      ?? value.isDark ?? value.isNight ?? value.dark ?? value.night ?? "";
  }
  if (typeof value === "boolean") return value ? "dark" : "light";
  const word = String(value ?? "").trim().toLowerCase();
  if (["dark", "night", "black", "1", "true"].includes(word)) return "dark";
  if (["light", "day", "white", "0", "false"].includes(word)) return "light";
  return null;
}
// Until the head unit has sent a theme, the theme follows the time of day (dark from 19:00 to 07:00).
let carThemeSeen = false;
function timeOfDayTheme() {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7 ? "dark" : "light";
}
function applyTimeOfDayTheme() {
  if (carThemeSeen || manualTheme()) return;
  const mode = timeOfDayTheme();
  if (document.documentElement.dataset.theme !== mode) document.documentElement.dataset.theme = mode;
}
setTimeout(applyTimeOfDayTheme, 1500);
setInterval(applyTimeOfDayTheme, 60_000);

function applyTheme(data) {
  const mode = themeFromPayload(data);
  if (!mode) {
    console.warn("Тема: не понял значение", data);
    return;
  }
  carThemeSeen = true;
  try { localStorage.setItem(THEME_KEY, mode); }
  catch (error) { console.warn("Тема не сохранена", error); }
  if (manualTheme()) return;
  const changed = document.documentElement.dataset.theme !== mode;
  document.documentElement.dataset.theme = mode;
  if (changed) showToast(mode === "light" ? "Светлая тема" : "Тёмная тема");
}
try {
  const manual = manualTheme();
  const saved = localStorage.getItem(THEME_KEY);
  if (manual) document.documentElement.dataset.theme = manual;
  else if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
} catch (error) { console.warn("Тема не прочитана", error); }
// Called by the settings after the choice changes: manual theme, else the car's last theme, else the time of day.
window.reapplyTheme = function reapplyTheme() {
  const manual = manualTheme();
  if (manual) { document.documentElement.dataset.theme = manual; return; }
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (error) { saved = null; }
  if (carThemeSeen && (saved === "light" || saved === "dark")) { document.documentElement.dataset.theme = saved; return; }
  carThemeSeen = false;
  applyTimeOfDayTheme();
};

// Theme can also be read directly from the head unit. Some builds do not send the "theme" event,
// so the launcher checks the same names the other JCarTools projects use, at start and every 20 s.
const THEME_PROPS = ["theme", "uiMode", "nightMode", "systemTheme", "isDark", "isDarkMode", "darkMode"];
const THEME_METHODS = ["getTheme", "getUiMode", "getNightMode", "getDarkMode", "isDarkMode", "getSystemTheme", "getDisplayTheme", "isDark", "getDayNightMode"];
function probeTheme() {
  const api = window.androidApi;
  if (!api || typeof api !== "object") return;
  const seen = [];
  let found = null;
  for (const prop of THEME_PROPS) {
    const value = api[prop];
    if (value == null || typeof value === "function") continue;
    seen.push(`${prop}=${JSON.stringify(value)}`);
    if (!found && themeFromPayload(value)) found = value;
  }
  for (const method of THEME_METHODS) {
    if (typeof api[method] !== "function") continue;
    let value = null;
    try { value = api[method](TOKEN); } catch (error) { continue; }
    if (value == null) continue;
    seen.push(`${method}()=${JSON.stringify(value)}`);
    if (!found && themeFromPayload(value)) found = value;
  }
  if (found !== null) applyTheme(found);
  // Diagnostic: show once what the head unit returned, so the theme source can be checked on the car.
  if (!window.__themeShown) {
    window.__themeShown = true;
    showToast("Тема от машины: " + (seen.length ? seen.join(", ") : "данных нет"), 8000);
  }
}
setTimeout(probeTheme, 500);
setInterval(probeTheme, 20_000);

// Vehicle speed (km/h). Used to block the trunk from opening while the car is moving.
function noteSpeed(data) {
  const value = data && typeof data === "object" ? data.value : data;
  const number = Number(value);
  if (value !== null && value !== "" && Number.isFinite(number)) state.speedKmh = number;
}
