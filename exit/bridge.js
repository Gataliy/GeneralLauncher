// Transport to the JCarTools bridge (window.androidApi).
// Loaded before app.js; every function here is a plain global, same as before.
const TOKEN = "SECURE_TOKEN_2025";

const bridge = {
  available() { return !!(window.androidApi && typeof window.androidApi === "object"); },
  call(method, ...args) {
    if (!this.available() || typeof window.androidApi[method] !== "function") return null;
    try { return window.androidApi[method](...args); }
    catch (error) { console.error(`[Generic Launcher] ${method}`, error); return null; }
  },
  runEnum(command) { return this.call("runEnum", TOKEN, command); },
  seekMusic(ms) { return this.call("seekMusic", TOKEN, Math.round(ms)) !== null; },
  has(method) { return this.available() && typeof window.androidApi[method] === "function"; },
  runEnumAsync(requestId, command) { return this.call("requestRunEnumAsync", TOKEN, requestId, command) === true; },
  requestCarCommandAsync(requestId, json) { return this.call("requestCarCommandAsync", TOKEN, requestId, json) === true; },
  requestCarDataAsync(requestId, name) { return this.call("requestCarDataAsync", TOKEN, requestId, name) === true; },
  requestLauncherCatalogAsync(requestId) { return this.call("requestLauncherCatalogAsync", TOKEN, requestId) === true; },
  runAppAsync(requestId, packageName) { return this.call("requestRunAppAsync", TOKEN, requestId, packageName) === true; },
  runSavedSplitAsync(requestId, raw) { return this.call("requestRunSavedSplitAsync", TOKEN, requestId, raw) === true; },
  runApp(packageName) { return this.call("runApp", TOKEN, packageName); },
  runSavedSplit(raw) { return parseJson(this.call("runSavedSplit", TOKEN, raw), null); },
  getWeather() { return parseJson(this.call("getWeather", TOKEN), null); },
  refreshWeather(latitude, longitude) { return parseJson(this.call("refreshWeather", TOKEN, latitude, longitude), null); },
  getRunEnum() { return parseJson(this.call("getRunEnum", TOKEN), []); },
  getRunEnumPic(command) {
    const value = this.call("getRunEnumPic", TOKEN, command) || "";
    return typeof value === "string" && !value.trim().startsWith("{") ? value : "";
  },
  getUserApps() { return parseJson(this.call("getUserApps", TOKEN), []); },
  getSavedSplitActions() { return parseJson(this.call("getSavedSplitActions", TOKEN), []); }
};

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function nextRequestId(prefix) {
  state.requestSequence = (state.requestSequence + 1) % 1_000_000;
  return `${prefix}_${Date.now()}_${state.requestSequence}`;
}

