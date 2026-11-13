// Три виджета над часами, погодой и плеером в классике: состояние авто, навигация с камерой, компас и скорость.
// Данные берутся из уже существующих источников: state, carOpen, tiggoState, window.vehicleHeading и элементы навигации.
(function () {
  const byId = id => document.getElementById(id);
  const text = id => (byId(id) ? byId(id).textContent : "");
  const POINTS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];

  // Car state commands ({"cmd": ...}). Answers are kept here; the first answer of each command goes to the diagnostics log.
  const CAR_STATE_COMMANDS = ["get_body_state", "get_sunroof_state", "get_windows_state", "get_trunk_state", "get_tpms"];
  const carStates = {};
  // Window numbers from the developer's list: 0 front left, 1 front right, 2 rear left, 3 rear right.
  const WINDOW_IDS = [0, 1, 2, 3];
  function pollCarStates() {
    if (!bridge.has("requestCarCommandAsync") || document.body.classList.contains("player-expanded")) return;
    const requests = CAR_STATE_COMMANDS.map(cmd => ({ name: cmd, body: { cmd } }))
      .concat(WINDOW_IDS.map(w => ({ name: "get_window_state_" + w, body: { cmd: "get_window_state", window: w } })));
    requests.forEach((item, i) => setTimeout(() => {
      bridge.requestCarCommandAsync("carst_" + item.name + "_" + Date.now(), JSON.stringify(item.body));
    }, i * 300));
  }
  window.applyCarStateCommand = function applyCarStateCommand(requestId, response) {
    const cmd = requestId.replace(/^carst_/, "").replace(/_\d+$/, "");
    if (!cmd) return;
    if (!carStates[cmd]) logDiag("carstate", cmd + " " + JSON.stringify(response));
    if (response && response.success !== false) carStates[cmd] = response;
    renderChips();
  };
  setInterval(pollCarStates, 15000);
  setTimeout(pollCarStates, 2000);

  // Temporary: the raw codes from the car are shown next to each state, to check how the car reports open and closed.
  function rawSuffix(item) {
    if (!item || typeof item !== "object") return "";
    const raw = item.rawState === null || item.rawState === undefined ? "—" : item.rawState;
    const pos = item.rawPosition === null || item.rawPosition === undefined ? "" : "/" + item.rawPosition;
    return " [raw " + raw + pos + "]";
  }

  function renderChips() {
    const chips = [];
    const OPEN_STATES = ["open", "partial", "tilted"];
    const STATE_WORDS = { closed: "закрыт", open: "открыт", partial: "частично", tilted: "наклон", ajar: "приоткрыт" };
    // Sunroof and trunk from the car's own state commands (see core_manifest). Old data is used only when these are missing.
    const sunCar = carStates.get_sunroof_state;
    const sun = state.sunroofOpen;
    if (sunCar && sunCar.available && typeof sunCar.state === "string" && sunCar.state) {
      const percent = typeof sunCar.openPercent === "number" ? " " + Math.round(sunCar.openPercent) + " %" : "";
      chips.push({ label: "Люк", value: (STATE_WORDS[sunCar.state] || sunCar.state) + percent + rawSuffix(sunCar), open: sunCar.state !== "closed" });
    } else if (sun != null) {
      chips.push({ label: "Люк", value: sun ? "открыт" : "закрыт", open: sun === true });
    }
    const trunkCar = carStates.get_trunk_state;
    if (trunkCar && trunkCar.available && typeof trunkCar.state === "string" && trunkCar.state) {
      chips.push({ label: "Багажник", value: (STATE_WORDS[trunkCar.state] || trunkCar.state) + rawSuffix(trunkCar), open: trunkCar.state !== "closed" });
    } else if (carOpen.trunk != null) {
      chips.push({ label: "Багажник", value: carOpen.trunk ? "открыт" : "закрыт", open: carOpen.trunk === true });
    }
    // Windows: the count of open ones from get_windows_state (four elements, each with its own state).
    const windowsCar = carStates.get_windows_state;
    const windows = windowsCar && Array.isArray(windowsCar.windows) ? windowsCar.windows.filter(w => w && w.available) : [];
    if (windows.length) {
      const openCount = windows.filter(w => w.state !== "closed").length;
      chips.push({ label: "Окна", value: openCount ? "открыто " + openCount : "закрыты", open: openCount > 0 });
    } else if (carOpen.windows != null) {
      chips.push({ label: "Окна", value: carOpen.windows ? "открыты" : "закрыты", open: carOpen.windows === true });
    }
    // Tyre pressure warnings (get_tpms): 1 means a warning on that wheel.
    const tpms = carStates.get_tpms;
    if (tpms) {
      const values = ["flWarning", "frWarning", "rlWarning", "rrWarning"].map(key => tpms[key]);
      if (values.some(v => v != null)) {
        const warned = values.filter(v => v === 1 || v === true).length;
        chips.push({ label: "Шины", value: warned ? "внимание: " + warned : "в норме", open: warned > 0 });
      }
    }
    if (typeof tiggoState.fuel === "number") chips.push({ label: "Топливо", value: `${Math.round(tiggoState.fuel)} %`, open: false });
    if (typeof tiggoState.voltage === "number") chips.push({ label: "АКБ", value: `${tiggoState.voltage.toFixed(1).replace(".", ",")} В`, open: false });
    // Engine speed: the car often sends 0 even when running, so a chip is shown only for a real value.
    if (typeof tiggoState.rpm === "number" && tiggoState.rpm > 0) chips.push({ label: "Обороты", value: `${Math.round(tiggoState.rpm)}`, open: false });
    // The card has room for six chips (two columns, three rows).
    chips.splice(6);
    const box = byId("hw-chips");
    if (!box) return;
    // Home screen: five tiles with an icon, the label and the state word under it. Tapping a tile runs its action (home-tiles.js).
    const TILES = window.hwTileDefs().filter(t => window.hwTileEnabled(t.key));
    box.replaceChildren(...TILES.map(t => {
      const chip = t.match ? chips.find(c => c.label === t.match) : null;
      const div = document.createElement("button");
      div.type = "button";
      div.className = "hw-chip hw-tile" + (chip && chip.open ? " open" : "");
      div.dataset.tile = t.key;
      div.dataset.open = chip && chip.open ? "1" : "0";
      div.innerHTML = `<i class="hw-tile-icon" aria-hidden="true">${(window.TILE_ICON_SVG && window.TILE_ICON_SVG[t.key]) || ""}</i><span class="hw-tile-label">${escapeHtml(t.label)}</span><em class="hw-tile-value">${chip ? escapeHtml(chip.value.replace(/\s*\[raw.*$/, "")) : ""}</em>`;
      return div;
    }));
  }

  function renderNav() {
    byId("hw-turn-icon") && byId("tg-turn-icon") && (byId("hw-turn-icon").innerHTML = byId("tg-turn-icon").innerHTML);
    byId("hw-turn-dist") && (byId("hw-turn-dist").textContent = text("tg-turn-dist") || "—");
    byId("hw-road") && (byId("hw-road").textContent = text("tg-next-road"));
    const camOn = !!byId("tg-cam") && !byId("tg-cam").hidden;
    const cam = byId("hw-cam");
    if (cam) cam.hidden = !camOn;
    if (camOn) {
      byId("hw-cam-name").textContent = text("tg-cam-name");
      byId("hw-cam-dist").textContent = text("tg-cam-dist");
    }
  }

  // Speed: a ten-segment bar (0-160 km/h) in place of the arc. Segments turn red above the radar limit.
  function paintSpeedBar(sp) {
    const gauge = document.querySelector(".hw-gauge-speed");
    if (!gauge) return;
    let bar = byId("hw-speedbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "hw-speedbar";
      bar.className = "hw-speedbar";
      bar.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>";
      gauge.appendChild(bar);
    }
    const lit = sp == null ? 0 : Math.min(10, Math.round(sp / 16));
    const radarLimit = window.navWarning && window.navWarning.hud ? window.navWarning.hud.limit : null;
    const limit = Number(radarLimit || window.navLimitValue);
    const over = Number.isFinite(limit) && limit > 0 && sp != null && sp > limit;
    [...bar.children].forEach((segment, index) => {
      segment.classList.toggle("on", index < lit);
      segment.classList.toggle("over", over && index < lit);
    });
  }

  function renderCompass() {
    const h = typeof window.vehicleHeading === "number" ? window.vehicleHeading : null;
    const needle = byId("hw-needle");
    if (needle) needle.style.transform = `rotate(${h == null ? 0 : h}deg)`;
    const dir = byId("hw-dir");
    if (dir) dir.textContent = h == null ? "" : `${POINTS[Math.round(h / 45) % 8]} ${Math.round(h)}°`;
    const sp = typeof state.speedKmh === "number" ? Math.round(state.speedKmh) : null;
    const speed = byId("hw-speed");
    if (speed) speed.textContent = sp == null ? "—" : sp;
    paintSpeedBar(sp);
  }

  const SHEET_STATE_WORDS = { closed: "закрыт", open: "открыт", partial: "частично открыт", tilted: "наклон" };
  const SHEET_OPEN_STATES = ["open", "partial", "tilted"];
  const SHEET_WINDOW_NAMES = ["водитель", "пассажир", "сзади слева", "сзади справа"];
  const SHEET_WHEELS = [["flWarning", "Переднее левое"], ["frWarning", "Переднее правое"], ["rlWarning", "Заднее левое"], ["rrWarning", "Заднее правое"]];
  const sheetRow = (label, value, open) => ({ label, value, open: !!open });
  function carDetailGroups() {
    const groups = [];
    const body = [];
    const sunCar = carStates.get_sunroof_state;
    if (sunCar && sunCar.available && SHEET_STATE_WORDS[sunCar.state]) body.push(sheetRow("Люк", SHEET_STATE_WORDS[sunCar.state], SHEET_OPEN_STATES.includes(sunCar.state)));
    else if (state.sunroofOpen != null) body.push(sheetRow("Люк", state.sunroofOpen ? "открыт" : "закрыт", state.sunroofOpen === true));
    else body.push(sheetRow("Люк", "нет данных"));
    const trunkCar = carStates.get_trunk_state;
    if (trunkCar && trunkCar.available && SHEET_STATE_WORDS[trunkCar.state]) body.push(sheetRow("Багажник", SHEET_STATE_WORDS[trunkCar.state], SHEET_OPEN_STATES.includes(trunkCar.state)));
    else if (carOpen.trunk != null) body.push(sheetRow("Багажник", carOpen.trunk ? "открыт" : "закрыт", carOpen.trunk === true));
    else body.push(sheetRow("Багажник", "нет данных"));
    const windowsCar = carStates.get_windows_state;
    const windowList = windowsCar && Array.isArray(windowsCar.windows) ? windowsCar.windows : [];
    if (windowList.length) {
      windowList.forEach((w, i) => {
        const index = w && typeof w.window === "number" ? w.window : i;
        const name = SHEET_WINDOW_NAMES[index] || ("окно " + index);
        const value = !w || !w.available || !SHEET_STATE_WORDS[w.state] ? "нет данных" : SHEET_STATE_WORDS[w.state];
        body.push(sheetRow("Окно: " + name, value, w && w.available && SHEET_OPEN_STATES.includes(w.state)));
      });
    } else if (carOpen.windows != null) body.push(sheetRow("Окна", carOpen.windows ? "открыты" : "закрыты", carOpen.windows === true));
    else body.push(sheetRow("Окна", "нет данных"));
    groups.push({ title: "Кузов", rows: body });

    const tpms = carStates.get_tpms;
    const tyres = SHEET_WHEELS.map(([key, label]) => {
      const v = tpms ? tpms[key] : null;
      if (v === 1 || v === true) return sheetRow(label, "внимание", true);
      if (v === 0 || v === false) return sheetRow(label, "в норме");
      return sheetRow(label, "нет данных");
    });
    groups.push({ title: "Шины", rows: tyres });

    const engine = [];
    engine.push(sheetRow("Топливо", typeof tiggoState.fuel === "number" ? `${Math.round(tiggoState.fuel)} %` : "нет данных"));
    engine.push(sheetRow("АКБ", typeof tiggoState.voltage === "number" ? `${tiggoState.voltage.toFixed(1).replace(".", ",")} В` : "нет данных"));
    engine.push(sheetRow("Обороты", typeof tiggoState.rpm === "number" ? `${Math.round(tiggoState.rpm)}` : "нет данных"));
    engine.push(sheetRow("За бортом", typeof tiggoState.outTemp === "number" ? `${tiggoState.outTemp} °C` : "нет данных"));
    engine.push(sheetRow("Скорость", typeof state.speedKmh === "number" ? `${Math.round(state.speedKmh)} км/ч` : "нет данных"));
    groups.push({ title: "Двигатель и питание", rows: engine });

    return groups;
  }
  window.carDetailGroups = carDetailGroups;
  window.renderChips = renderChips;
  // Which car tiles are shown (the state card). Chosen in Settings > Карточки; all five by default.
  const TILE_KEYS_STORAGE = "generic_launcher_tiles_v1";
  window.hwTileDefs = () => [
    { key: "lock", label: "Двери", match: null, title: "Двери" },
    { key: "roof", label: "Люк", match: "Люк", title: "Люк" },
    { key: "window", label: "Окна", match: "Окна", title: "Окна" },
    { key: "trunk", label: "Багаж.", match: "Багажник", title: "Багажник" },
    { key: "wheel", label: "Шины", match: "Шины", title: "Шины" }
  ];
  function savedTileKeys() {
    try {
      const raw = localStorage.getItem(TILE_KEYS_STORAGE);
      const list = raw ? JSON.parse(raw) : null;
      return Array.isArray(list) ? list : null;
    } catch (error) { return null; }
  }
  window.hwTileEnabled = key => {
    const list = savedTileKeys();
    return list ? list.includes(key) : true;
  };
  window.hwToggleTile = key => {
    const all = window.hwTileDefs().map(t => t.key);
    const current = all.filter(k => window.hwTileEnabled(k));
    const next = current.includes(key) ? current.filter(k => k !== key) : all.filter(k => current.includes(k) || k === key);
    try { localStorage.setItem(TILE_KEYS_STORAGE, JSON.stringify(next)); } catch (error) { /* keep the choice for this session only */ }
    renderChips();
  };

  function renderAll() {
    if (!byId("hero-widgets")) return;
    renderChips();
    renderNav();
    renderCompass();
  }

  renderAll();
  setInterval(renderAll, 1000);
})();



// Режим редактирования главной. Состояние, навигация и компас можно переносить между верхним и нижним рядом,
// а также менять ширину и высоту. Часы и погода остаются в нижнем ряду (в развёрнутом плеере они видны вместе с ним).
// Плеер не трогаем. Режим открывается долгим нажатием на стоянке.
(function () {
  const KEY = "generic_launcher_hw_layout_v4";
  const ALL = ["state", "nav", "compass", "clock", "weather", "heatWheel", "heatGlass", "fan"];
  const CROSS = ["state", "nav", "compass", "heatWheel", "heatGlass", "fan"];
  const BASE_IDS = ["state", "nav", "compass", "clock", "weather"];
  const RESIZABLE = ALL;
  const DEFAULT = {
    top: ["state", "nav", "compass"],
    bottom: ["clock", "weather"],
    hidden: ["heatWheel", "heatGlass", "fan"],
    memory: { heatWheel: { row: "bottom", index: 0 }, heatGlass: { row: "bottom", index: 1 }, fan: { row: "bottom", index: 2 } },
    widths: { state: 515, nav: 420, compass: 206, clock: 250, weather: 250, heatWheel: 190, heatGlass: 190, fan: 190 },
    heights: { state: 170, nav: 170, compass: 170, clock: 171, weather: 171, heatWheel: 170, heatGlass: 170, fan: 170 }
  };
  const CARD_NAMES = { state: "Состояние автомобиля", nav: "Навигация", compass: "Компас", clock: "Часы", weather: "Погода", heatWheel: "Обогрев руля", heatGlass: "Обогрев стекла", fan: "Вентилятор" };
  const MIN_W = 160;
  const MIN_H = 120;
  const MAX_H = { top: 190, bottom: 171 };
  const FILL_MIN = { top: 300, bottom: 480 };   // the flexible card of a row never shrinks below this
  const GAP = 15;
  const MOVABLE = {
    state: ".hw-state", nav: ".hw-nav", compass: ".hw-compass",
    clock: ".hero-clock", weather: "#weather-widget",
    heatWheel: ".hw-heat-wheel", heatGlass: ".hw-heat-glass", fan: ".hw-fan"
  };
  const topBox = document.getElementById("hero-widgets");
  const bottomBox = document.querySelector(".hero-bottom");
  const hero = document.getElementById("hero");
  const player = bottomBox ? bottomBox.querySelector(".player-widget") : null;
  if (!topBox || !bottomBox || !hero || !player) return;
  // Heater cards: a tap toggles the heater, the state comes from the slot bar. They are created here, hidden by default.
  const HEAT_CARDS = [
    { id: "heatWheel", cls: "hw-heat-wheel", title: "Обогрев руля", command: "TOGGLE_HEAT_WHEEL", key: "rulHeat" },
    { id: "heatGlass", cls: "hw-heat-glass", title: "Обогрев стекла", command: "TOGGLE_HEAT_WINDSHIELD", key: "lobHeat" }
  ];
  HEAT_CARDS.forEach(card => {
    const section = document.createElement("section");
    section.className = "hw-card hw-heat " + card.cls;
    section.innerHTML = `<div class="hw-eb">${card.title}</div><div class="hw-body"><button type="button" class="hw-heat-btn">—</button></div>`;
    section.querySelector(".hw-heat-btn").addEventListener("click", () => {
      if (document.body.classList.contains("hw-edit")) return;
      if (typeof runCommand === "function") runCommand(card.command, card.title, null);
    });
    bottomBox.insertBefore(section, player);
  });
  function renderHeat() {
    HEAT_CARDS.forEach(card => {
      const value = typeof state !== "undefined" && state.actionStates ? state.actionStates[card.key] : undefined;
      const text = value === true ? "включён" : value === false ? "выключен" : "—";
      const btn = document.querySelector("." + card.cls + " .hw-heat-btn");
      if (btn) btn.textContent = text;
    });
  }
  setInterval(renderHeat, 1000);
  renderHeat();

  // Fan speed 1..10 (car climate command). Read from the car every few seconds and after each change.
  const FAN_MIN = 1;
  const FAN_MAX = 10;
  let fanLevel = null;
  const fanSection = document.createElement("section");
  fanSection.className = "hw-card hw-fan";
  fanSection.innerHTML = '<div class="hw-eb">Вентилятор</div>'
    + '<div class="hw-fan-value">—</div>'
    + '<div class="hw-fan-bar">' + Array.from({ length: FAN_MAX }, (_, i) => '<i data-level="' + (i + 1) + '">' + (i + 1) + '</i>').join("") + '</div>';
  bottomBox.insertBefore(fanSection, player);
  function renderFan() {
    fanSection.querySelector(".hw-fan-value").textContent = fanLevel == null ? "—" : String(fanLevel);
    fanSection.querySelectorAll(".hw-fan-bar i").forEach(bar => bar.classList.toggle("on", fanLevel != null && Number(bar.dataset.level) <= fanLevel));
  }
  // A burst of taps is one command: the head unit opens its own climate dialog for every command.
  // The number moves at once; the final level goes out 2 s after the last tap (at most 4 s).
  const FAN_BATCH_MS = 2000;
  const FAN_BATCH_MAX_MS = 4000;
  let fanBatch = null;
  let fanHoldUntil = 0;
  function setFan(level) {
    if (document.body.classList.contains("hw-edit")) return;
    if (fanLevel == null) { showToast("Нет данных о вентиляторе от машины"); return; }
    const next = Math.max(FAN_MIN, Math.min(FAN_MAX, level));
    if (next === fanLevel) return;
    fanLevel = next;
    renderFan();
    const now = Date.now();
    fanHoldUntil = now + 2500;
    if (!fanBatch) fanBatch = { startedAt: now, timer: null };
    clearTimeout(fanBatch.timer);
    const wait = Math.min(FAN_BATCH_MS, fanBatch.startedAt + FAN_BATCH_MAX_MS - now);
    fanBatch.timer = setTimeout(flushFan, Math.max(0, wait));
  }
  function flushFan() {
    if (!fanBatch) return;
    fanBatch = null;
    fanHoldUntil = Date.now() + 2500;
    if (bridge.has("requestCarCommandAsync") && fanLevel != null) {
      bridge.requestCarCommandAsync("fan_set_" + Date.now(), JSON.stringify({ cmd: "climate_set_fan_speed", value: fanLevel }));
    }
    setTimeout(readFan, 2600);
  }
  function readFan() {
    if (!bridge.has("requestCarCommandAsync") || layout.hidden.includes("fan")) return;
    bridge.requestCarCommandAsync("fan_get_" + Date.now(), JSON.stringify({ cmd: "climate_get_state" }));
  }
  // Answer to "climate_get_state" (routed from commands.js by the fan_get_ request id).
  window.applyFanResponse = function applyFanResponse(response) {
    if (typeof window.applyClimateTempsFromState === "function") window.applyClimateTempsFromState(response);
    const value = Number(response && response.fanSpeed);
    if (!response || response.success === false || !Number.isFinite(value)) return;
    // Our own taps are on screen first; the car's number is read again once the batch has been sent.
    if (Date.now() < fanHoldUntil) return;
    fanLevel = Math.max(FAN_MIN, Math.min(FAN_MAX, Math.round(value)));
    renderFan();
  };
  fanSection.querySelectorAll(".hw-fan-bar i").forEach(bar => bar.addEventListener("click", () => setFan(Number(bar.dataset.level))));
  setInterval(readFan, 4000);
  renderFan();
  setTimeout(readFan, 1500);

  const elOf = id => document.querySelector(MOVABLE[id]);
  const rowOfId = id => (layout.top.includes(id) ? "top" : "bottom");
  const fillId = row => (row === "top" && layout.top.includes("nav") ? "nav" : null);
  const boxOf = row => (row === "top" ? topBox : bottomBox);

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function validLayout(v) {
    if (!v || !Array.isArray(v.top) || !Array.isArray(v.bottom)) return false;
    const hidden = Array.isArray(v.hidden) ? v.hidden : [];
    const all = [...v.top, ...v.bottom, ...hidden];
    return new Set(all).size === all.length && all.every(id => ALL.includes(id)) && BASE_IDS.every(id => all.includes(id));
  }
  function loadLayout() {
    const base = clone(DEFAULT);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (validLayout(saved)) {
        base.top = saved.top;
        base.bottom = saved.bottom;
        base.hidden = saved.hidden || [];
        base.memory = { ...base.memory, ...(saved.memory || {}) };
        // Cards added in a later build start hidden, unless the saved layout already places them.
        ALL.forEach(id => {
          if (!base.top.includes(id) && !base.bottom.includes(id) && !base.hidden.includes(id)) base.hidden.push(id);
        });
        ALL.forEach(id => {
          const w = Number(saved.widths && saved.widths[id]);
          if (Number.isFinite(w) && w >= MIN_W) base.widths[id] = Math.round(w);
          const h = Number(saved.heights && saved.heights[id]);
          if (Number.isFinite(h) && h >= MIN_H) base.heights[id] = Math.round(h);
        });
      }
    } catch (error) { /* broken value: keep defaults */ }
    return base;
  }
  let layout = loadLayout();

  function saveLayout() {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); }
    catch (error) { console.warn("Раскладка не сохранена", error); }
  }

  // Each row keeps its cards in the DOM container of that row, so moving a card between rows moves its element too.
  function placeCards() {
    layout.top.forEach(id => { const el = elOf(id); if (el.parentNode !== topBox) topBox.appendChild(el); });
    layout.bottom.forEach(id => { const el = elOf(id); if (el.parentNode !== bottomBox) bottomBox.insertBefore(el, player); });
  }

  function applyLayout() {
    // In the home port the cards stay where the markup puts them (navigation and car state on the bottom row).
    if (!document.body.classList.contains("home-port")) placeCards();
    ALL.forEach(id => { elOf(id).style.display = layout.hidden.includes(id) ? "none" : ""; });
    // The home port (body.home-port) sets the sizes and places in CSS, so the saved sizes do not override it.
    if (document.body.classList.contains("home-port")) {
      topBox.style.gridTemplateColumns = "";
      ALL.forEach(id => { const el = elOf(id); el.style.gridColumn = ""; el.style.order = ""; el.style.flex = ""; el.style.width = ""; el.style.height = ""; });
      return;
    }
    const fill = fillId("top");
    layout.top.forEach((id, index) => {
      const el = elOf(id);
      el.style.gridColumn = String(index + 1);
      el.style.order = "";
      el.style.flex = "";
      el.style.width = id === fill ? "" : `${layout.widths[id]}px`;
      el.style.height = `${layout.heights[id]}px`;
    });
    topBox.style.gridTemplateColumns = layout.top
      .map(id => (id === fill ? "minmax(0, 1fr)" : `${layout.widths[id]}px`)).join(" ");
    layout.bottom.forEach((id, index) => {
      const el = elOf(id);
      el.style.gridColumn = "";
      el.style.order = String(index + 1);
      el.style.flex = `0 0 ${layout.widths[id]}px`;
      el.style.width = `${layout.widths[id]}px`;
      el.style.height = `${layout.heights[id]}px`;
    });
    player.style.order = "99";
  }
  // Hiding a card keeps its row and place; showing it puts it back there.
  function hideCard(id) {
    const row = rowOfId(id);
    layout.memory[id] = { row, index: layout[row].indexOf(id) };
    layout[row] = layout[row].filter(other => other !== id);
    layout.hidden.push(id);
    applyLayout();
    saveLayout();
  }
  function showCard(id) {
    const memo = layout.memory[id] || { row: "bottom", index: layout.bottom.length };
    layout.hidden = layout.hidden.filter(other => other !== id);
    const row = memo.row === "top" || memo.row === "bottom" ? memo.row : "bottom";
    const index = Math.min(Math.max(0, memo.index), layout[row].length);
    layout[row].splice(index, 0, id);
    delete layout.memory[id];
    applyLayout();
    saveLayout();
  }
  applyLayout();

  // Largest width a card may take in its row: the row minus gaps, the other fixed cards and the flexible card.
  function maxWidth(id) {
    const row = rowOfId(id);
    const ids = layout[row];
    const fill = fillId(row) || (row === "bottom" ? "player" : null);
    const others = ids.filter(other => other !== id && other !== fill).reduce((sum, other) => sum + layout.widths[other], 0);
    const gaps = GAP * ids.length;
    return Math.max(MIN_W, boxOf(row).clientWidth - gaps - others - (FILL_MIN[row] || 0));
  }

  const bar = document.createElement("div");
  bar.className = "hw-edit-bar";
  bar.innerHTML = `<span class="hw-edit-hint">Перетащи карточку · потяни угол — размер</span><button type="button" data-act="cards">Карточки</button><button type="button" data-act="reset">Сбросить</button><button type="button" data-act="done">Готово</button>`;
  hero.appendChild(bar);
  // Panel with one switch per card: a hidden card keeps its place for when it is shown again.
  const panel = document.createElement("div");
  panel.className = "hw-panel";
  function renderPanel() {
    panel.innerHTML = ALL.map(id => {
      const shown = !layout.hidden.includes(id);
      return `<button type="button" data-card="${id}">${CARD_NAMES[id]}<b>${shown ? "показана" : "скрыта"}</b></button>`;
    }).join("");
  }
  panel.addEventListener("click", event => {
    const id = event.target.closest("button")?.dataset.card;
    if (!id) return;
    if (layout.hidden.includes(id)) showCard(id); else hideCard(id);
    renderPanel();
  });
  hero.appendChild(panel);
  renderPanel();
  const resetButton = bar.querySelector('[data-act="reset"]');
  let resetArmed = false;
  let resetTimer = null;

  ALL.forEach(id => {
    const handle = document.createElement("span");
    handle.className = "hw-resize";
    handle.setAttribute("aria-hidden", "true");
    elOf(id).appendChild(handle);
    const hide = document.createElement("span");
    hide.className = "hw-hide";
    hide.textContent = "×";
    hide.setAttribute("role", "button");
    elOf(id).appendChild(hide);
    hide.addEventListener("pointerdown", event => event.stopPropagation());
    hide.addEventListener("click", event => {
      event.stopPropagation();
      if (editing) { hideCard(id); renderPanel(); }
    });
    handle.addEventListener("pointerdown", event => {
      if (!editing) return;
      event.stopPropagation();
      event.preventDefault();
      resizing = { id, x: event.clientX, y: event.clientY, w: layout.widths[id], h: layout.heights[id] };
      elOf(id).classList.add("hw-resizing");
    });
  });

  let editing = false;
  let pressTimer = null;
  let dragId = null;
  let hoverLock = null;
  let longPressActive = false;
  let resizing = null;
  let startX = 0;
  let startY = 0;
  let suppressClickUntil = 0;

  function enterEdit() {
    // The expanded player shows a fixed set of cards: the layout is changed only on the main screen.
    if (document.body.classList.contains("player-expanded")) return false;
    if (typeof state !== "undefined" && typeof state.speedKmh === "number" && state.speedKmh > 0) {
      if (typeof showToast === "function") showToast("На ходу раскладку не меняем");
      return false;
    }
    editing = true;
    document.body.classList.add("hw-edit");
    return true;
  }

  function exitEdit() {
    editing = false;
    dragId = null;
    resizing = null;
    hoverLock = null;
    resetArmed = false;
    clearTimeout(resetTimer);
    resetButton.textContent = "Сбросить";
    document.body.classList.remove("hw-edit");
    document.querySelectorAll(".hw-dragging, .hw-resizing").forEach(el => el.classList.remove("hw-dragging", "hw-resizing"));
    saveLayout();
  }

  bar.addEventListener("click", event => {
    const act = event.target.closest("button")?.dataset.act;
    if (act === "done") { exitEdit(); panel.classList.remove("open"); }
    if (act === "cards") { renderPanel(); panel.classList.toggle("open"); }
    if (act === "reset") {
      if (!resetArmed) {
        resetArmed = true;
        resetButton.textContent = "Точно сбросить?";
        resetTimer = setTimeout(() => { resetArmed = false; resetButton.textContent = "Сбросить"; }, 3000);
        return;
      }
      clearTimeout(resetTimer);
      resetArmed = false;
      resetButton.textContent = "Сбросить";
      layout = clone(DEFAULT);
      panel.classList.remove("open");
      applyLayout();
      renderPanel();
      saveLayout();
    }
  });

  // The click that ends a long press must not also trigger the card's own action (for example the weather refresh).
  document.addEventListener("click", event => {
    if (Date.now() < suppressClickUntil) {
      event.stopPropagation();
      event.preventDefault();
    }
  }, true);

  ALL.forEach(id => {
    const el = elOf(id);
    el.addEventListener("pointerdown", event => {
      if (event.target.classList.contains("hw-resize")) return;
      startX = event.clientX;
      startY = event.clientY;
      if (editing) {
        dragId = id;
        el.classList.add("hw-dragging");
        return;
      }
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (!enterEdit()) return;
        longPressActive = true;
        dragId = id;
        el.classList.add("hw-dragging");
      }, 700);
    });
  });

  // Which row the pointer is over: the top band or the bottom band (split at the middle of the gap between them).
  function rowAt(y) {
    const top = topBox.getBoundingClientRect();
    const bottom = bottomBox.getBoundingClientRect();
    return y < (top.bottom + bottom.top) / 2 ? "top" : "bottom";
  }

  document.addEventListener("pointermove", event => {
    if (resizing) {
      const { id, x, y, w, h } = resizing;
      const row = rowOfId(id);
      if (fillId(row) !== id) {
        const nextW = Math.min(maxWidth(id), Math.max(MIN_W, w + (event.clientX - x)));
        layout.widths[id] = Math.round(nextW);
      }
      const nextH = Math.min(MAX_H[row], Math.max(MIN_H, h + (event.clientY - y)));
      layout.heights[id] = Math.round(nextH);
      applyLayout();
      return;
    }
    if (!editing) {
      if (pressTimer && Math.hypot(event.clientX - startX, event.clientY - startY) > 12) clearTimeout(pressTimer);
      return;
    }
    if (!dragId) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest(".hw-card, .hero-clock, #weather-widget");
    const targetId = ALL.find(id => elOf(id) === under) || null;
    if (!targetId) hoverLock = null;
    const from = rowOfId(dragId);
    const to = rowAt(event.clientY);
    if (to !== from) {
      if (!CROSS.includes(dragId)) return;
      layout[from] = layout[from].filter(id => id !== dragId);
      const index = targetId && layout[to].includes(targetId) ? layout[to].indexOf(targetId) : layout[to].length;
      layout[to].splice(index, 0, dragId);
      hoverLock = null;
      applyLayout();
      return;
    }
    if (!targetId || targetId === dragId || !layout[from].includes(targetId)) return;
    // After a swap the dragged card sits where the target was, so the pointer is over the target again: wait until it leaves.
    if (targetId === hoverLock) return;
    hoverLock = targetId;
    const row = layout[from];
    const a = row.indexOf(dragId);
    const b = row.indexOf(targetId);
    [row[a], row[b]] = [row[b], row[a]];
    applyLayout();
  });

  function endPointer() {
    clearTimeout(pressTimer);
    if (resizing) {
      elOf(resizing.id).classList.remove("hw-resizing");
      resizing = null;
      saveLayout();
    }
    if (dragId) {
      elOf(dragId).classList.remove("hw-dragging");
      dragId = null;
      hoverLock = null;
    }
    if (longPressActive) { suppressClickUntil = Date.now() + 300; longPressActive = false; }
  }
  document.addEventListener("pointerup", endPointer);
  document.addEventListener("pointercancel", endPointer);

  window.hwToggleCard = id => (layout.hidden.includes(id) ? showCard(id) : hideCard(id));
  window.hwIsHidden = id => layout.hidden.includes(id);
  window.hwCardNames = CARD_NAMES;
  window.hwResetLayout = () => { layout = clone(DEFAULT); applyLayout(); saveLayout(); };
})();
