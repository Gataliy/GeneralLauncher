// Home screen in the Tiggo 9 layout: a sidebar, the car, clock, weather, music, car status, quick actions and favourite apps.
// It is a separate mode: the classic dashboard stays as it was. Switch it on in the diagnostics panel (long press on the clock).
// Loaded after diag.js and before app.js; the functions stay plain globals.
// Главный экран Tiggo 9 снят со сборки: код оставлен, но режим выключен.
const TIGGO_HOME_ENABLED = false;
const TIGGO_HOME_KEY = "generic_launcher_tiggo_home_v1";
const tiggoState = { view: "home", rpm: null, vehiclePending: false, fuel: null, outTemp: null, voltage: null, tyres: {} };
// Apps opened from the Tiggo home. The package names are the usual Yandex ones; if the head unit uses other names, change them here.
const TIGGO_MUSIC_PACKAGE = "ru.yandex.music";
const TIGGO_NAV_PACKAGE = "ru.yandex.yandexnavi";

function launchTiggoApp(packageName) {
  setTimeout(() => bridge.runApp(packageName), 0);
}

// Animated car highlight for the trunk, windows and roof. Regions are fractions of the top-view picture.
const CAR_ANIM_TEXT = { trunk: "Багажник", roof: "Люк", windows: "Окна" };

function carAnimKind(command) {
  const c = String(command || "");
  // Heating and defrost commands (e.g. TOGGLE_HEAT_REARWINDOW) are not window movements.
  if (/heat|defrost|vent|fan|climate/i.test(c)) return null;
  if (/trunk/i.test(c)) return "trunk";
  if (/sunroof|roof|shtork|shutter/i.test(c)) return "roof";
  if (/window|ajar/i.test(c)) return "windows";
  return null;
}

// Animation speed chosen in settings: off, fast or normal.
const CAR_ANIM_SPEEDS = { fast: { dur: 0.6, hold: 1200 }, normal: { dur: 1.6, hold: 2600 } };
function carAnimMode() {
  try { return localStorage.getItem("generic_launcher_car_anim_v1") || "normal"; } catch (error) { return "normal"; }
}

let carAnimTimer = null;
function showCarAnimation(command) {
  const kind = carAnimKind(command);
  if (!kind) return;
  const mode = carAnimMode();
  if (mode === "off" || !CAR_ANIM_SPEEDS[mode]) return;
  const speed = CAR_ANIM_SPEEDS[mode];
  const box = document.getElementById("car-anim");
  if (!box) return;
  box.style.setProperty("--ca-dur", speed.dur + "s");
  const closing = /close/i.test(String(command));
  box.querySelectorAll(".ca-part").forEach((part) => {
    part.classList.toggle("on", part.dataset.kind === kind);
    part.classList.toggle("closing", closing);
  });
  document.getElementById("car-anim-text").textContent = `${CAR_ANIM_TEXT[kind]} ${closing ? "закрывается" : "открывается"}`;
  box.classList.remove("show");
  void box.offsetWidth;
  box.hidden = false;
  box.classList.add("show");
  clearTimeout(carAnimTimer);
  carAnimTimer = setTimeout(() => { box.hidden = true; box.classList.remove("show"); }, speed.hold);
}

// Engine speed. The head unit may send it as an "rpm" event or in the "vehicle" snapshot; zero means no data on this car.
function applyRpm(data) {
  const value = Number(typeof data === "object" && data !== null ? data.value : data);
  tiggoState.rpm = Number.isFinite(value) ? value : null;
}

function applyVehicleSnapshot(response) {
  tiggoState.vehiclePending = false;
  const vehicle = response?.vehicle || response;
  const rpm = Number(vehicle?.rpm);
  if (Number.isFinite(rpm)) tiggoState.rpm = rpm;
  const speed = Number(vehicle?.speed);
  if (Number.isFinite(speed)) state.speedKmh = speed;
  const fuel = Number(vehicle?.fuelPercent);
  if (Number.isFinite(fuel)) tiggoState.fuel = fuel;
  const outTemp = Number(vehicle?.outTemp);
  if (Number.isFinite(outTemp)) tiggoState.outTemp = outTemp;
  const voltage = Number(vehicle?.batteryVoltage);
  if (Number.isFinite(voltage)) tiggoState.voltage = voltage;
}

function pollVehicle() {
  if (tiggoState.vehiclePending || !bridge.has("requestCarDataAsync")) return;
  const requestId = nextRequestId("veh");
  tiggoState.vehiclePending = true;
  if (!bridge.requestCarDataAsync(requestId, "all")) tiggoState.vehiclePending = false;
  setTimeout(() => { tiggoState.vehiclePending = false; }, 3000);
}

function tiggoEnabled() {
  if (!TIGGO_HOME_ENABLED) return false;
  try { return localStorage.getItem(TIGGO_HOME_KEY) === "1"; } catch { return false; }
}

function setTiggoEnabled(on) {
  try { localStorage.setItem(TIGGO_HOME_KEY, on ? "1" : "0"); } catch { /* best effort */ }
  tiggoState.view = "home";
  renderTiggoMode();
}

// Shows the Tiggo home (view "home") or the classic dashboard with its slot pages (view "classic").
function renderTiggoMode() {
  const enabled = tiggoEnabled();
  const home = enabled && tiggoState.view === "home";
  const section = enabled && tiggoState.view === "section";
  document.body.classList.toggle("tg-on", home || section);
  document.body.classList.toggle("tg-section", section);
  navSubscribe(home);
  const goHome = document.getElementById("go-home");
  if (goHome) goHome.hidden = !enabled || section;
  document.querySelectorAll("#tg-home .tg-side button").forEach(b => b.classList.toggle("active", section ? b.dataset.tgPage === state.page : b.dataset.tgPage === "home"));
  // "Главная" is only useful when you are not on it: hide it on the home screen.
  document.querySelectorAll('#tg-home .tg-side button[data-tg-page="home"]').forEach(b => { b.hidden = home; });
  if (home) renderTiggoHome();
}

// Pages from the sidebar and quick actions open inside the Tiggo layout: slots only, without the clock and weather.
function openTiggoSection(name) {
  tiggoState.view = "section";
  setPage(name);
  renderTiggoMode();
}

// Opens a classic page from the sidebar or the quick actions.
function goClassicPage(name) {
  tiggoState.view = "classic";
  renderTiggoMode();
  setPage(name);
}

function tiggoTime() {
  const now = new Date();
  const time = document.getElementById("tg-time");
  const date = document.getElementById("tg-date");
  if (time) time.textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (date) date.textContent = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}

function renderTiggoHome() {
  if (!document.getElementById("tg-home")) return;
  tiggoTime();
  const weather = document.getElementById("weather-temperature")?.textContent || "—";
  document.getElementById("tg-weather").textContent = weather;
  document.getElementById("tg-title").textContent = document.getElementById("track-title").textContent;
  document.getElementById("tg-artist").textContent = document.getElementById("track-artist").textContent;
  const art = document.getElementById("album-art");
  const tgArt = document.getElementById("tg-art");
  tgArt.style.backgroundImage = art.style.backgroundImage;
  tgArt.classList.toggle("has-image", art.classList.contains("has-image"));
  const playing = state.isPlaying === true;
  document.querySelectorAll("#tg-home .tg-play").forEach(button => { button.textContent = playing ? "❚❚" : "▶"; });
  renderTiggoData();
  renderCarStates();
}

// Car data card: speed, engine speed, fuel, outside temperature and battery voltage.
function renderTiggoData() {
  const speed = typeof state.speedKmh === "number" ? Math.round(state.speedKmh) : null;
  const rpm = tiggoState.rpm;
  const fuel = tiggoState.fuel;
  const out = tiggoState.outTemp;
  const volt = tiggoState.voltage;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set("tg-d-speed", speed == null ? "—" : speed);
  set("tg-d-rpm", rpm && rpm > 0 ? Math.round(rpm) : "—");
  // Дуги: 0–200 км/ч и 0–7000 об/мин; без данных дуга пустая.
  setArc("tg-arc-speed", speed == null ? 0 : speed / 200);
  setArc("tg-arc-rpm", rpm && rpm > 0 ? rpm / 7000 : 0);
  set("tg-d-fuel", fuel == null ? "—" : Math.round(fuel));
  set("tg-d-out", out == null ? "—" : Math.round(out));
  set("tg-d-volt", volt == null ? "—" : volt.toFixed(1).replace(".", ","));
  // Tyre pressure (bar) and temperature (°C) per corner; the source is still to be confirmed, so until then they show "—".
  ["fl", "fr", "rl", "rr"].forEach(corner => {
    const tyre = tiggoState.tyres?.[corner] || {};
    set(`tg-tyre-${corner}-p`, tyre.pressure == null ? "— бар" : `${tyre.pressure.toFixed(1).replace(".", ",")} бар`);
    set(`tg-tyre-${corner}-t`, tyre.temp == null ? "— °C" : `${Math.round(tyre.temp)} °C`);
    // Ниже 2,2 бар метка становится красной; порог предварительный.
    document.querySelector(`.tg-tyre.${corner}`)?.classList.toggle("low", typeof tyre.pressure === "number" && tyre.pressure < 2.2);
  });
  // Среднее давление показываем только когда известны все четыре колеса.
  const pressures = ["fl", "fr", "rl", "rr"].map(c => tiggoState.tyres?.[c]?.pressure);
  const avgBox = document.getElementById("tg-avg");
  if (avgBox) {
    const known = pressures.every(v => typeof v === "number");
    avgBox.hidden = !known;
    if (known) set("tg-avg-v", `${(pressures.reduce((a, b) => a + b, 0) / 4).toFixed(2).replace(".", ",")} бар`);
  }
}

function setArc(id, fraction) {
  const el = document.getElementById(id);
  if (!el) return;
  const share = Math.min(1, Math.max(0, fraction || 0));
  el.style.strokeDashoffset = String(100 * (1 - share));
}

function renderTiggoApps() {
  const box = document.getElementById("tg-apps");
  if (!box) return;
  const apps = (state.pages.apps || []).filter(slot => slot?.type === "app").slice(0, 5);
  box.replaceChildren(...(apps.length ? apps : [{ type: "empty" }]).map(slot => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tg-app";
    if (slot.type !== "app") {
      tile.disabled = true;
      tile.innerHTML = `<span class="tg-app-icon">+</span><span>Добавить в приложения</span>`;
    } else {
      tile.innerHTML = `<span class="tg-app-icon">${escapeHtml((slot.label || slot.packageName || "A").charAt(0).toUpperCase())}</span><span>${escapeHtml(slot.label || slot.packageName)}</span>`;
      tile.addEventListener("click", () => setTimeout(() => bridge.runApp(slot.packageName), 0));
    }
    return tile;
  }));
}

function initTiggoHome() {
  const home = document.getElementById("tg-home");
  if (!home) return;
  // Sidebar icons come from the launcher's own icon set.
  home.querySelectorAll("[data-tg-icon]").forEach(span => { span.innerHTML = ICON_SVG[span.dataset.tgIcon] || ""; });
  home.addEventListener("click", event => {
    const page = event.target.closest("[data-tg-page]");
    if (page) {
      if (page.dataset.tgPage === "diag") { bridge.call("onSettings", TOKEN); return; }
      if (page.dataset.tgPage === "classic") { goClassicPage("climate"); return; }
      if (page.dataset.tgPage === "music") { launchTiggoApp(TIGGO_MUSIC_PACKAGE); return; }
      if (page.dataset.tgPage === "nav") { launchTiggoApp(TIGGO_NAV_PACKAGE); return; }
      if (page.dataset.tgPage === "home") { tiggoState.view = "home"; renderTiggoMode(); return; }
      openTiggoSection(page.dataset.tgPage);
      return;
    }
    if (event.target.closest(".tg-top")) { launchTiggoApp(TIGGO_MUSIC_PACKAGE); return; }
    const cmd = event.target.closest("[data-tg-cmd]");
    if (cmd) runCommand(cmd.dataset.tgCmd, cmd.dataset.tgLabel, cmd);
  });
  document.getElementById("go-home")?.addEventListener("click", () => { tiggoState.view = "home"; renderTiggoMode(); });
  renderTiggoMode();
  setInterval(() => { if (document.body.classList.contains("tg-on")) renderTiggoHome(); }, 1000);
  // Vehicle data (speed, rpm, fuel) is polled on the classic screen too: the speed on the navigation card needs it.
  setInterval(pollVehicle, 1500);
}
window.addEventListener("load", () => setTimeout(initTiggoHome, 0));

// Live navigation: the map frames and turn data come from JCarTools (subscribeMiniMap, miniMapFrame, hud events).
const TG_TURN_SYMBOLS = { 2: "↰", 3: "↱", 4: "↖", 5: "↗", 6: "⬅", 7: "➡", 8: "↶", 9: "↑", 19: "↷", 24: "⟳" };
let navSubscribed = false;

function navSubscribe(on) {
  const api = window.androidApi;
  if (!api || on === navSubscribed) return;
  try {
    if (on) {
      const mode = document.documentElement.dataset.theme === "light" ? "day" : "night";
      api.setMiniMapTheme(TOKEN, mode);
      api.subscribeMiniMap(TOKEN);
    } else {
      api.unsubscribeMiniMap(TOKEN);
    }
    navSubscribed = on;
  } catch (e) {}
}

function navParse(raw) {
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(String(raw)); } catch (e) { return null; }
}

function navDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)} м`;
  const km = n / 1000;
  return `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} км`;
}

function applyNavFrame(raw) {
  const data = navParse(raw);
  const src = data?.image;
  if (typeof src !== "string" || !src) return;
  const img = document.getElementById("tg-map-img");
  const placeholder = document.getElementById("tg-map-placeholder");
  if (!img) return;
  img.src = src;
  img.hidden = false;
  if (placeholder) placeholder.hidden = true;
}

// Знак ограничения: при активном радаре показываем лимит камеры, если он есть,
// иначе ограничение из маршрута.
function renderLimitSign() {
  const limit = document.getElementById("tg-limit");
  const value = document.getElementById("tg-limit-value");
  if (!limit || !value) return;
  const radarLimit = window.navWarning && window.navWarning.hud ? window.navWarning.hud.limit : null;
  const shown = radarLimit || window.navLimitValue || null;
  limit.hidden = !shown;
  value.textContent = shown || "—";
}

function applyNavHud(raw) {
  const data = navParse(raw);
  if (!data) return;
  const sender = String(data.hudSenderType || "").toUpperCase();
  if (sender === "ARAD") {
    const dist = Number(data.remainDist);
    const camLimit = Number(data.speedLimit);
    window.navWarning.hud = data.aradarOn ? {
      dist: Number.isFinite(dist) ? dist : null,
      limit: Number.isFinite(camLimit) && camLimit > 0 ? Math.round(camLimit) : null
    } : null;
    if (typeof window.renderNavWarning === "function") window.renderNavWarning();
    renderLimitSign();
    return;
  }
  if (sender !== "NAVI") return;
  const turn = document.getElementById("tg-turn-icon");
  const dist = document.getElementById("tg-turn-dist");
  const road = document.getElementById("tg-next-road");
  const speedLimit = Number(data.speedLimit);
  window.navLimitValue = Number.isFinite(speedLimit) && speedLimit > 0 ? Math.round(speedLimit) : null;
  renderLimitSign();
  if (!turn || !dist || !road) return;
  if (!data.naviOn) {
    turn.innerHTML = TG_TURN_SVG[9];
    dist.textContent = "—";
    road.textContent = "Маршрут не запущен";
    return;
  }
  turn.innerHTML = TG_TURN_SVG[Number(data.turnType)] || TG_TURN_SVG[9];
  dist.textContent = navDistance(data.turnDist);
  const remain = navDistance(data.remainDist);
  const name = String(data.nextRoad || "Двигайтесь по маршруту");
  road.textContent = remain === "—" ? name : `${name} · осталось ${remain}`;
}

// Car state for the status card. Only values reported by the car are shown; the sunroof comes from vehicle.sun.
// Trunk and windows stay unknown until the car sends them (see the diagnostics probes).
const carOpen = { trunk: null, windows: null };

function renderCarStates() {
  const sun = state.sunroofOpen;
  const flags = { roof: sun === true, trunk: carOpen.trunk === true, windows: carOpen.windows === true };
  document.querySelectorAll(".tg-st").forEach(el => el.classList.toggle("on", flags[el.dataset.st] === true));
  // Only states the car has reported are listed; unknown ones are left out.
  const rows = [];
  if (sun != null) rows.push({ label: "Люк", value: sun ? "открыт" : "закрыт", open: sun === true });
  if (carOpen.trunk != null) rows.push({ label: "Багажник", value: carOpen.trunk ? "открыт" : "закрыт", open: carOpen.trunk === true });
  if (carOpen.windows != null) rows.push({ label: "Окна", value: carOpen.windows ? "открыты" : "закрыты", open: carOpen.windows === true });
  const list = document.getElementById("tg-state-list");
  if (list) {
    const anyOpen = rows.some(r => r.open);
    const items = rows.map(r => {
      const li = document.createElement("li");
      if (r.open) li.classList.add("open");
      li.innerHTML = `<span>${escapeHtml(r.label)}</span><b>${escapeHtml(r.value)}</b>`;
      return li;
    });
    // Итог показываем только когда все известные состояния закрыты.
    if (rows.length && !anyOpen) {
      const summary = document.createElement("li");
      summary.className = "summary";
      summary.innerHTML = `<span>Автомобиль</span><b>все закрыто</b>`;
      items.push(summary);
    }
    list.replaceChildren(...items);
    list.hidden = rows.length === 0;
    const title = document.getElementById("tg-state-title");
    if (title) title.hidden = rows.length === 0;
  }
}

// Компас: курс берётся из GPS-трека (camera-alerts.js). Без курса — только прочерк.
const COMPASS_POINTS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
function renderCompass() {
  const h = typeof window.vehicleHeading === "number" ? window.vehicleHeading : null;
  const ring = document.getElementById("tg-compass-ring");
  if (ring) ring.style.transform = `rotate(${h == null ? 0 : -h}deg)`;
  const deg = document.getElementById("tg-compass-deg");
  if (deg) deg.textContent = h == null ? "—" : `${Math.round(h)}°`;
  const dir = document.getElementById("tg-compass-dir");
  if (dir) dir.textContent = h == null ? "" : COMPASS_POINTS[Math.round(h / 45) % 8];
}
window.renderCompass = renderCompass;
