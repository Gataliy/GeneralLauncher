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

  // Free storage in GB, from the car's storageFree data (see core_manifest). Empty until the first answer.
  let storageFreeText = "";
  function readStorageFree() {
    if (!bridge.has("getCarData")) return;
    const data = parseJson(bridge.call("getCarData", TOKEN, "storageFree"), null);
    if (data && data.display !== undefined && String(data.display).trim() !== "") {
      storageFreeText = String(data.display).trim() + " ГБ";
      renderChips();
    }
  }
  setTimeout(readStorageFree, 2500);
  setInterval(readStorageFree, 60000);

  function renderChips() {
    const chips = [];
    // Doors: the head unit reports no door state, so the label follows the last central-lock command sent from the launcher.
    // It is placed first so the six-chip limit below never cuts it off.
    let lastLock = null;
    try { lastLock = localStorage.getItem(CENTRAL_STATE_KEY); } catch (error) { lastLock = null; }
    if (lastLock === "locked") chips.push({ label: "Двери", value: "закрыты", open: false });
    else if (lastLock === "unlocked") chips.push({ label: "Двери", value: "открыты", open: true });
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
    // Free space on the head unit's storage (getCarData "storageFree", read in readStorageFree). Placed before fuel so it stays in the six.
    if (storageFreeText) chips.push({ label: "Память", value: storageFreeText, open: false });
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
    // Speed limit sign: shown only while the navigation reports one (the same value as on the Tiggo navigation tile).
    const limitOn = !!byId("tg-limit") && !byId("tg-limit").hidden;
    const limit = byId("hw-limit");
    if (limit) {
      limit.hidden = !limitOn;
      if (limitOn) byId("hw-limit-value").textContent = text("tg-limit-value");
    }
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
    { key: "lock", label: "Двери", match: "Двери", title: "Двери" },
    { key: "roof", label: "Люк", match: "Люк", title: "Люк" },
    { key: "window", label: "Окна", match: "Окна", title: "Окна" },
    { key: "trunk", label: "Багаж.", match: "Багажник", title: "Багажник" },
    { key: "wheel", label: "Шины", match: "Шины", title: "Шины" },
    { key: "storage", label: "Память", match: "Память", title: "Свободное место" }
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



// Режим редактирования главной (v5). Два ряда по 20 колонок. Карточки можно переставлять, менять ширину и высоту ряда,
// задавать правило показа (всегда / при навигации / при радаре / кроме радара), сдвигать на X/Y и собирать в группу
// (столбик или строка). Пока раскладку не меняли, главный экран держится на CSS, как и раньше.
// Режим открывается долгим нажатием на карточке на стоянке.
(function () {
  const bottomBox = document.querySelector(".hero-bottom");
  const hero = document.getElementById("hero");
  const player = bottomBox ? bottomBox.querySelector(".player-widget") : null;
  if (!bottomBox || !hero || !player) return;

  const KEY = "generic_launcher_hw_layout_v5";
  const KEY_V4 = "generic_launcher_hw_layout_v4";
  const COLS = 20;
  const EDITABLE = ["state", "nav", "clock", "weather", "player"];
  const CARD_NAMES = { state: "Состояние автомобиля", nav: "Навигация", clock: "Часы", weather: "Погода" };
  const MOVABLE = { state: ".hw-state", nav: ".hw-nav", clock: ".hero-clock", weather: "#weather-widget", player: ".player-widget" };
  const MIN_SPAN = { state: 4, nav: 4, clock: 3, weather: 3, player: 8 };
  const MIN_ROW_H = 100;
  const MAX_ROW_H = 260;
  const MAX_OFFSET = 300;
  const RULES = [["always", "Всегда"], ["nav", "При навигации"], ["radar", "При радаре"], ["noRadar", "Кроме радара"]];
  const ALIGNS = [["start", "К началу"], ["center", "По центру"], ["end", "К концу"], ["stretch", "Растянуть"]];
  const ALIGN_CSS = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
  // Same placement as the CSS home screen (20 columns, rows 150 px, gaps 14 px across and 28 px between rows).
  const DEFAULT = {
    colGap: 14,
    rowGap: 28,
    rowH: [150, 150],
    rows: [
      { justify: "start", items: [{ id: "state", span: 8 }, { id: "nav", span: 12 }] },
      { justify: "start", items: [{ id: "clock", span: 4 }, { id: "weather", span: 4 }, { id: "player", span: 12 }] }
    ]
  };
  // The heater and fan cards stay hidden by CSS (1.2.508), so the fan is not read from the car.
  const FAN_CARD_SHOWN = false;
  const PLACE_PROPS = ["grid-column", "grid-row", "height", "min-height", "max-height", "transform", "flex", "width", "min-width", "align-self"];

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
    if (!bridge.has("requestCarCommandAsync") || !FAN_CARD_SHOWN) return;
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
  // ---- Модель раскладки ----
  // Строка: { justify, items }. Элемент строки — карточка { id, span, when, x, y, hidden }
  // или группа { group: true, span, mode, gap, align, members: [карточка с grow] }.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clone = v => JSON.parse(JSON.stringify(v));
  const ruleIds = RULES.map(r => r[0]);
  const alignIds = ALIGNS.map(a => a[0]);
  let layout = null;

  function cardProps(c) {
    const player = c.id === "player";
    return {
      id: c.id,
      when: !player && ruleIds.includes(c.when) ? c.when : "always",
      x: clamp(Math.round(Number(c.x) || 0), -MAX_OFFSET, MAX_OFFSET),
      y: clamp(Math.round(Number(c.y) || 0), -MAX_OFFSET, MAX_OFFSET),
      hidden: !player && c.hidden === true
    };
  }
  function toSingle(c, span) {
    const p = cardProps(c);
    return { id: p.id, span, when: p.when, x: p.x, y: p.y, hidden: p.hidden };
  }
  function toMember(c) {
    const p = cardProps(c);
    return { id: p.id, grow: clamp(Math.round(Number(c.grow) || 1), 1, 6), when: p.when, x: p.x, y: p.y, hidden: p.hidden };
  }
  const minSpanOf = item => (item.group ? Math.max(...item.members.map(m => MIN_SPAN[m.id])) : MIN_SPAN[item.id]);
  const rowSpan = row => row.items.reduce((sum, it) => sum + it.span, 0);
  const rowIndexOf = item => layout.rows.findIndex(row => row.items.includes(item));

  // Shrinks the widest items (never the kept one first) until the row fits into COLS columns.
  function fitRow(row, keep) {
    while (rowSpan(row) > COLS) {
      const cands = row.items.filter(it => it !== keep && it.span > minSpanOf(it)).sort((a, b) => b.span - a.span);
      if (cands.length) cands[0].span--;
      else if (keep && keep.span > minSpanOf(keep)) keep.span--;
      else break;
    }
  }
  // Drops empty groups, turns a one-member group back into a card, keeps spans in range and the row within COLS.
  function tidyRow(row) {
    row.items = row.items.filter(it => !it.group || it.members.length)
      .map(it => (it.group && it.members.length === 1 ? toSingle(it.members[0], it.span) : it));
    row.items.forEach(it => { it.span = clamp(Math.round(it.span), minSpanOf(it), COLS); });
    fitRow(row, null);
  }
  function normalize(input) {
    if (!input || !Array.isArray(input.rows) || input.rows.length !== 2) return null;
    const seen = new Set();
    const take = c => {
      if (!c || !EDITABLE.includes(c.id) || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    };
    const rows = input.rows.map(row => ({
      justify: alignIds.includes(row.justify) ? row.justify : "start",
      items: (Array.isArray(row.items) ? row.items : []).map(it => {
        if (it.group) {
          const members = (Array.isArray(it.members) ? it.members : []).filter(take).map(toMember);
          return {
            group: true,
            span: Number(it.span) || 4,
            mode: it.mode === "row" ? "row" : "stack",
            gap: clamp(Math.round(Number(it.gap) || 0), 0, 80),
            align: alignIds.includes(it.align) ? it.align : "stretch",
            members
          };
        }
        return take(it) ? toSingle(it, Number(it.span) || 4) : null;
      }).filter(Boolean)
    }));
    if (seen.size !== EDITABLE.length) return null;
    const out = {
      colGap: clamp(Math.round(Number(input.colGap) || 0), 0, 60),
      rowGap: clamp(Math.round(Number(input.rowGap) || 0), 0, 80),
      rowH: [0, 1].map(i => clamp(Math.round(Number(input.rowH && input.rowH[i]) || 150), MIN_ROW_H, MAX_ROW_H)),
      rows
    };
    out.rows.forEach(tidyRow);
    return out;
  }
  const DEFAULT_N = normalize(clone(DEFAULT));

  function loadLayout() {
    try {
      const saved = normalize(JSON.parse(localStorage.getItem(KEY)));
      if (saved) return saved;
    } catch (error) { /* broken value: use the default */ }
    const base = normalize(clone(DEFAULT));
    // The old editor's hidden cards carry over once.
    try {
      const v4 = JSON.parse(localStorage.getItem(KEY_V4));
      if (v4 && Array.isArray(v4.hidden)) {
        base.rows.forEach(row => row.items.forEach(it => (it.group ? it.members : [it]).forEach(c => {
          if (v4.hidden.includes(c.id) && c.id !== "player") c.hidden = true;
        })));
      }
    } catch (error) { /* no old value */ }
    return base;
  }
  function saveLayout() {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); }
    catch (error) { console.warn("Раскладка не сохранена", error); }
  }
  const isDefault = () => JSON.stringify(layout) === JSON.stringify(DEFAULT_N);

  function allCards(l) {
    const out = [];
    l.rows.forEach(row => row.items.forEach(it => (it.group ? it.members : [it]).forEach(c => out.push(c))));
    return out;
  }
  // Where a card sits: row index r, item index i in the row, member index m in its group (-1 when it is a plain card).
  function locate(id) {
    for (let r = 0; r < layout.rows.length; r++) {
      const items = layout.rows[r].items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.group) { if (it.id === id) return { r, i, item: it, m: -1 }; }
        else {
          const m = it.members.findIndex(c => c.id === id);
          if (m >= 0) return { r, i, item: it, m };
        }
      }
    }
    return null;
  }
  const cardOf = id => {
    const loc = locate(id);
    return loc ? (loc.m >= 0 ? loc.item.members[loc.m] : loc.item) : null;
  };
  // Takes a card out of its row or group. Returns a record that can be put back as a card or a member.
  function takeOut(id) {
    const loc = locate(id);
    if (!loc) return null;
    if (loc.m < 0) {
      layout.rows[loc.r].items.splice(loc.i, 1);
      return { ...loc.item, grow: 1 };
    }
    const [c] = loc.item.members.splice(loc.m, 1);
    return { ...c, span: clamp(Math.min(loc.item.span, 4), MIN_SPAN[id], COLS) };
  }

  // ---- Видимость ----
  const radarOn = () => !!(window.navWarning && window.navWarning.hud);
  const stageMode = () => {
    const b = document.body.classList;
    return b.contains("player-expanded") || b.contains("night-mode") || bottomBox.classList.contains("in-stage");
  };
  // In the cover and night screens only the manual hide counts: the rules do not change what those screens show.
  function cardVisible(c, stage) {
    if (c.hidden) return false;
    if (stage) return true;
    if (c.when === "nav") return window.navRouteOn === true;
    if (c.when === "radar") return radarOn();
    if (c.when === "noRadar") return !radarOn();
    return true;
  }
  const itemVisible = (it, stage) => (it.group ? it.members.some(c => cardVisible(c, stage)) : cardVisible(it, stage));

  // Visible items of a row with their columns. Justify moves them to the start, the centre or the end, or stretches them.
  function planRow(row, stage) {
    const vis = row.items.filter(it => itemVisible(it, stage));
    const spans = vis.map(it => it.span);
    const total = spans.reduce((a, b) => a + b, 0);
    if (row.justify === "stretch" && total > 0) {
      let used = 0;
      for (let k = 0; k < spans.length; k++) {
        if (k === spans.length - 1) spans[k] = Math.max(1, COLS - used);
        else { spans[k] = Math.max(1, Math.round(spans[k] * COLS / total)); used += spans[k]; }
      }
    }
    const shown = spans.reduce((a, b) => a + b, 0);
    let col = 1;
    if (row.justify === "center") col += Math.floor((COLS - shown) / 2);
    else if (row.justify === "end") col += COLS - shown;
    return vis.map((item, k) => {
      const p = { item, col, span: spans[k] };
      col += spans[k];
      return p;
    });
  }

  // ---- Применение модели к странице ----
  const elOf = id => document.querySelector(MOVABLE[id]);
  const wrapOf = new WeakMap();
  function wrapperFor(group) {
    let w = wrapOf.get(group);
    if (!w) {
      w = document.createElement("div");
      w.className = "hw-group";
      const handle = document.createElement("span");
      handle.className = "hw-resize";
      handle.setAttribute("aria-hidden", "true");
      w.appendChild(handle);
      wrapOf.set(group, w);
    }
    w._group = group;
    return w;
  }
  const memberEls = w => [...w.children].filter(ch => ch.dataset && ch.dataset.hw);
  function setHidden(el, hide) {
    if (!el) return;
    if (hide) el.style.setProperty("display", "none", "important");
    else el.style.removeProperty("display");
  }
  function clearPlace(el) { PLACE_PROPS.forEach(p => el.style.removeProperty(p)); }
  function placeCell(el, r, col, span, h) {
    el.style.setProperty("grid-row", String(r + 1), "important");
    el.style.setProperty("grid-column", `${col} / span ${span}`, "important");
    el.style.setProperty("height", h + "px", "important");
    el.style.setProperty("min-height", "0", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("min-width", "0", "important");
  }
  function setOffset(el, c) {
    if (c.x || c.y) el.style.setProperty("transform", `translate(${c.x}px, ${c.y}px)`, "important");
    else el.style.removeProperty("transform");
  }
  function styleMember(el, c) {
    clearPlace(el);
    el.style.setProperty("flex", `${c.grow} 1 0px`, "important");
    el.style.setProperty("min-width", "0", "important");
    el.style.setProperty("min-height", "0", "important");
    el.style.setProperty("height", "auto", "important");
    el.style.setProperty("max-height", "none", "important");
    setOffset(el, c);
  }
  // Keeps the members of a group in their order inside its wrapper.
  function syncMembers(w, members) {
    members.forEach((c, k) => {
      const el = elOf(c.id);
      if (!el) return;
      const kids = memberEls(w);
      if (kids[k] !== el) w.insertBefore(el, kids[k] || null);
    });
  }
  function releaseWrapper(w) {
    memberEls(w).forEach(el => { clearPlace(el); bottomBox.appendChild(el); });
    w.remove();
  }
  function apply() {
    if (!layout) return;
    const stage = stageMode();
    const plain = stage || isDefault();
    allCards(layout).forEach(c => setHidden(elOf(c.id), !cardVisible(c, stage)));
    const live = new Set();
    if (plain) {
      // The CSS places the cards: no inline placement, no wrappers.
      allCards(layout).forEach(c => {
        const el = elOf(c.id);
        if (!el) return;
        clearPlace(el);
        if (el.parentNode !== bottomBox) bottomBox.appendChild(el);
      });
      ["grid-template-rows", "row-gap", "column-gap"].forEach(p => bottomBox.style.removeProperty(p));
    } else {
      bottomBox.style.setProperty("grid-template-rows", `${layout.rowH[0]}px ${layout.rowH[1]}px`, "important");
      bottomBox.style.setProperty("row-gap", layout.rowGap + "px", "important");
      bottomBox.style.setProperty("column-gap", layout.colGap + "px", "important");
      layout.rows.forEach((row, r) => {
        planRow(row, false).forEach(p => {
          const h = layout.rowH[r];
          if (!p.item.group) {
            const el = elOf(p.item.id);
            if (!el) return;
            if (el.parentNode !== bottomBox) bottomBox.appendChild(el);
            clearPlace(el);
            placeCell(el, r, p.col, p.span, h);
            setOffset(el, p.item);
            return;
          }
          const g = p.item;
          const w = wrapperFor(g);
          live.add(w);
          if (w.parentNode !== bottomBox) bottomBox.appendChild(w);
          placeCell(w, r, p.col, p.span, h);
          w.style.setProperty("display", "flex", "important");
          w.style.setProperty("flex-direction", g.mode === "row" ? "row" : "column", "important");
          w.style.setProperty("gap", g.gap + "px", "important");
          w.style.setProperty("align-items", ALIGN_CSS[g.align], "important");
          w.style.setProperty("position", "relative");
          syncMembers(w, g.members);
          g.members.forEach(c => { const el = elOf(c.id); if (el) styleMember(el, c); });
        });
      });
    }
    // Wrappers that are not placed (no visible member, or the plain layout) give their cards back.
    bottomBox.querySelectorAll(":scope > .hw-group").forEach(w => { if (!live.has(w)) releaseWrapper(w); });
  }

  // ---- Редактирование: состояние, панель, инспектор ----
  let editing = false;
  let selectedId = null;
  let press = null;      // { id, x, y, moved, longFired }
  let dragId = null;
  let dropInfo = null;
  let resize = null;     // { item, r, x, y, span, h, node }
  let pressTimer = null;
  let suppressClickUntil = 0;
  let resetArmed = false;
  let resetTimer = null;

  // Every change: tidy the rows, apply to the page, save, redraw the panel, the inspector and the card labels.
  function commit() {
    layout.rows.forEach(tidyRow);
    apply();
    saveLayout();
    renderInspector();
    renderPanel();
    renderTags();
  }
  function setCardHidden(id, hidden) {
    const c = cardOf(id);
    if (!c || id === "player") return;
    c.hidden = hidden;
    if (hidden && selectedId === id) selectedId = null;
    commit();
  }

  const bar = document.createElement("div");
  bar.className = "hw-edit-bar";
  bar.innerHTML = '<span class="hw-edit-hint">Нажми карточку · ⋮ — меню · угол — размер</span><button type="button" data-act="cards">Карточки</button><button type="button" data-act="reset">Сбросить</button><button type="button" data-act="done">Готово</button>';
  hero.appendChild(bar);
  const resetButton = bar.querySelector('[data-act="reset"]');
  const panel = document.createElement("div");
  panel.className = "hw-panel";
  hero.appendChild(panel);
  // On the body: the dock below the hero paints over elements inside it.
  const inspector = document.createElement("div");
  inspector.className = "hw-inspector";
  inspector.hidden = true;
  document.body.appendChild(inspector);

  // Panel: one switch per card, and the gaps between cards and rows.
  const stepRow = (key, label, value, s) => `<div class="hw-step-row"><span>${label}</span><span>`
    + `<button type="button" class="hw-step" data-gap="${key}" data-d="${-s}">−</button><b>${value} px</b>`
    + `<button type="button" class="hw-step" data-gap="${key}" data-d="${s}">+</button></span></div>`;
  function renderPanel() {
    panel.innerHTML = Object.keys(CARD_NAMES).map(id => {
      const shown = !cardOf(id).hidden;
      return `<button type="button" data-card="${id}">${CARD_NAMES[id]}<b>${shown ? "показана" : "скрыта"}</b></button>`;
    }).join("") + stepRow("colGap", "Зазор между карточками", layout.colGap, 2) + stepRow("rowGap", "Зазор между рядами", layout.rowGap, 4);
  }
  panel.addEventListener("click", event => {
    const b = event.target.closest("button");
    if (!b) return;
    if (b.dataset.card) { setCardHidden(b.dataset.card, !cardOf(b.dataset.card).hidden); return; }
    if (b.dataset.gap) {
      const d = Number(b.dataset.d);
      if (b.dataset.gap === "colGap") layout.colGap = clamp(layout.colGap + d, 0, 60);
      else layout.rowGap = clamp(layout.rowGap + d, 0, 80);
      commit();
    }
  });

  // Inspector: the settings of the selected card (its group when it is in one), and the order arrows.
  function renderInspector() {
    document.querySelectorAll(".hw-selected").forEach(el => el.classList.remove("hw-selected"));
    const loc = editing && selectedId ? locate(selectedId) : null;
    if (!loc) { selectedId = null; inspector.hidden = true; return; }
    const card = cardOf(selectedId);
    const cell = loc.item;
    const row = layout.rows[loc.r];
    const group = loc.m >= 0 ? cell : null;
    const isPlayer = selectedId === "player";
    const btns = (act, list, current) => list.map(([v, label]) =>
      `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${v === current}">${label}</button>`).join("");
    const step = (act, value, label, s) => `<span class="hw-ins-lab">${label}</span>`
      + `<button type="button" data-act="${act}" data-d="${-s}">−</button><b class="hw-ins-value">${value}</b>`
      + `<button type="button" data-act="${act}" data-d="${s}">+</button>`;
    const off = ok => (ok ? "" : " disabled");
    const parts = [`<div class="hw-ins-title">${CARD_NAMES[selectedId]}${group ? " · в группе" : ""}</div>`];
    if (!isPlayer) parts.push(`<div class="hw-ins-row"><span class="hw-ins-lab">Показывать</span>${btns("rule", RULES, card.when)}</div>`);
    parts.push(`<div class="hw-ins-row">${step("span", cell.span, "Ширина, колонок", 1)}${step("rowH", layout.rowH[loc.r], "Высота ряда", 10)}`
      + `<span class="hw-ins-lab">Распределение</span>${btns("justify", ALIGNS, row.justify)}</div>`);
    parts.push(`<div class="hw-ins-row"><span class="hw-ins-lab">Порядок</span>`
      + `<button type="button" data-act="swap" data-d="-1"${off(!!row.items[loc.i - 1])}>◀ раньше</button>`
      + `<button type="button" data-act="swap" data-d="1"${off(!!row.items[loc.i + 1])}>позже ▶</button>`
      + (group ? `<span class="hw-ins-lab">В группе</span>`
        + `<button type="button" data-act="memberSwap" data-d="-1"${off(loc.m > 0)}>${group.mode === "row" ? "◀ левее" : "▲ выше"}</button>`
        + `<button type="button" data-act="memberSwap" data-d="1"${off(loc.m < group.members.length - 1)}>${group.mode === "row" ? "правее ▶" : "▼ ниже"}</button>` : "")
      + `<span class="hw-ins-lab">Ряд</span>`
      + `<button type="button" data-act="toRow" data-v="0"${off(loc.r !== 0)}>▲ верхний</button>`
      + `<button type="button" data-act="toRow" data-v="1"${off(loc.r !== 1)}>▼ нижний</button></div>`);
    if (group) {
      parts.push(`<div class="hw-ins-row"><span class="hw-ins-lab">Группа</span>${btns("mode", [["stack", "Столбик"], ["row", "Строка"]], group.mode)}`
        + `${step("gap", group.gap, "Зазор", 2)}<span class="hw-ins-lab">Выравнивание</span>${btns("align", ALIGNS, group.align)}`
        + `${step("grow", card.grow, "Доля", 1)}<button type="button" data-act="out">Вынести из группы</button></div>`);
    }
    parts.push(`<div class="hw-ins-row">${step("x", card.x, "Сдвиг X", 10)}${step("y", card.y, "Сдвиг Y", 10)}`
      + `<button type="button" data-act="merge" data-d="-1"${off(!!row.items[loc.i - 1])}>← В группу слева</button>`
      + `<button type="button" data-act="merge" data-d="1"${off(!!row.items[loc.i + 1])}>В группу справа →</button>`
      + `${isPlayer ? "" : '<button type="button" data-act="hide">Скрыть</button>'}</div>`);
    inspector.innerHTML = parts.join("");
    inspector.hidden = false;
    elOf(selectedId).classList.add("hw-selected");
  }
  inspector.addEventListener("click", event => {
    const b = event.target.closest("button");
    if (!b || !selectedId || !locate(selectedId)) return;
    inspectorAction(b.dataset.act, b.dataset.v, Number(b.dataset.d));
  });
  function inspectorAction(act, v, d) {
    const loc = locate(selectedId);
    if (!loc) return;
    if (act === "swap") { swapItems(selectedId, d); return; }
    if (act === "memberSwap") { swapMember(selectedId, d); return; }
    if (act === "toRow") { moveToRow(selectedId, Number(v)); return; }
    if (act === "merge") { mergeInto(selectedId, d); return; }
    if (act === "out") { extract(selectedId); return; }
    if (act === "hide") { setCardHidden(selectedId, true); return; }
    const card = cardOf(selectedId);
    const cell = loc.item;
    const row = layout.rows[loc.r];
    switch (act) {
      case "rule": card.when = v; break;
      case "span": cell.span = clamp(cell.span + d, minSpanOf(cell), COLS - (rowSpan(row) - cell.span)); break;
      case "rowH": layout.rowH[loc.r] = clamp(layout.rowH[loc.r] + d, MIN_ROW_H, MAX_ROW_H); break;
      case "justify": row.justify = v; break;
      case "mode": cell.mode = v; break;
      case "gap": cell.gap = clamp(cell.gap + d, 0, 80); break;
      case "align": cell.align = v; break;
      case "grow": card.grow = clamp(card.grow + d, 1, 6); break;
      case "x": card.x = clamp(card.x + d, -MAX_OFFSET, MAX_OFFSET); break;
      case "y": card.y = clamp(card.y + d, -MAX_OFFSET, MAX_OFFSET); break;
      default: return;
    }
    commit();
  }

  // Groups: "в группу слева/справа" joins the neighbour in the row (a stack, or the neighbour's group).
  function mergeInto(id, dir) {
    const loc = locate(id);
    if (!loc) return;
    const row = layout.rows[loc.r];
    const other = row.items[loc.i + dir];
    if (!other) return;
    const card = takeOut(id);
    if (other.group) other.members.push(toMember(card));
    else {
      const members = dir < 0 ? [toMember(other), toMember(card)] : [toMember(card), toMember(other)];
      row.items.splice(row.items.indexOf(other), 1, { group: true, span: other.span, mode: "stack", gap: 14, align: "stretch", members });
    }
    commit();
  }
  // "Вынести из группы": the card goes right after its group in the same row.
  function extract(id) {
    const loc = locate(id);
    if (!loc || loc.m < 0) return;
    const group = loc.item;
    const row = layout.rows[loc.r];
    const card = takeOut(id);
    row.items.splice(row.items.indexOf(group) + 1, 0, toSingle(card, card.span));
    commit();
  }

  // ---- Порядок: стрелки в инспекторе ----
  // The selected item swaps with its neighbour in the row (a group moves as one item).
  function swapItems(id, dir) {
    const loc = locate(id);
    if (!loc) return;
    const items = layout.rows[loc.r].items;
    const j = loc.i + dir;
    if (j < 0 || j >= items.length) return;
    [items[loc.i], items[j]] = [items[j], items[loc.i]];
    commit();
  }
  // A member swaps with its neighbour inside its group.
  function swapMember(id, dir) {
    const loc = locate(id);
    if (!loc || loc.m < 0) return;
    const members = loc.item.members;
    const j = loc.m + dir;
    if (j < 0 || j >= members.length) return;
    [members[loc.m], members[j]] = [members[j], members[loc.m]];
    commit();
  }
  // The whole item (a card or a group) goes to the end of the other row.
  function moveToRow(id, r) {
    const loc = locate(id);
    if (!loc || loc.r === r) return;
    const [item] = layout.rows[loc.r].items.splice(loc.i, 1);
    layout.rows[r].items.push(item);
    commit();
  }

  // ---- Метки на карточках и меню ⋮ ----
  const RULE_LABEL = Object.fromEntries(RULES);
  // Each card gets a ⋮ button and a rule label. Both are shown in edit mode only (CSS); the player has no rule.
  function setupCardControls() {
    Object.keys(MOVABLE).forEach(id => {
      const el = elOf(id);
      if (!el) return;
      if (!el.querySelector(":scope > .hw-more")) {
        const more = document.createElement("span");
        more.className = "hw-more";
        more.textContent = "⋮";
        more.setAttribute("role", "button");
        more.setAttribute("aria-label", "Меню карточки");
        el.appendChild(more);
      }
      if (id !== "player" && !el.querySelector(":scope > .hw-rule-tag")) {
        const tag = document.createElement("span");
        tag.className = "hw-rule-tag";
        el.appendChild(tag);
      }
    });
    renderTags();
  }
  function renderTags() {
    Object.keys(MOVABLE).forEach(id => {
      const el = elOf(id);
      const tag = el ? el.querySelector(":scope > .hw-rule-tag") : null;
      const c = cardOf(id);
      if (tag && c) tag.textContent = RULE_LABEL[c.when] || "";
    });
  }

  // The menu sits on the body, above the inspector: the card's rule, its group actions and hiding.
  const menu = document.createElement("div");
  menu.className = "hw-menu";
  menu.hidden = true;
  document.body.appendChild(menu);
  let menuId = null;
  function openMenu(id, anchor) {
    menuId = id;
    selectedId = id;
    renderInspector();
    renderMenu();
    if (!menuId) return;
    menu.hidden = false;
    const box = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const below = box.bottom + 6;
    menu.style.left = `${clamp(box.right - w, 8, window.innerWidth - w - 8)}px`;
    menu.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, box.top - h - 6) : below}px`;
  }
  function closeMenu() {
    menuId = null;
    menu.hidden = true;
  }
  function renderMenu() {
    const loc = menuId ? locate(menuId) : null;
    if (!loc) { closeMenu(); return; }
    const card = cardOf(menuId);
    const row = layout.rows[loc.r];
    const btn = (act, v, label, cls) => `<button type="button" data-menu="${act}" data-v="${v}"${cls ? ` class="${cls}"` : ""}>${label}</button>`;
    const parts = [`<div class="hw-menu-title">${CARD_NAMES[menuId]}</div>`];
    if (menuId !== "player") {
      parts.push('<div class="hw-menu-sec">Показывать</div>');
      parts.push(RULES.map(([v, label]) => (card.when === v ? btn("rule", v, `✓ ${label}`, "on") : btn("rule", v, label))).join(""));
    }
    const group = [];
    if (loc.m >= 0) group.push(btn("out", "", "Вынести из группы"));
    if (row.items[loc.i - 1]) group.push(btn("merge", -1, "В группу слева"));
    if (row.items[loc.i + 1]) group.push(btn("merge", 1, "В группу справа"));
    if (group.length) parts.push('<div class="hw-menu-sec">Группа</div>', group.join(""));
    if (menuId !== "player") parts.push('<div class="hw-menu-sep"></div>', btn("hide", "", "Скрыть", "danger"));
    menu.innerHTML = parts.join("");
  }
  menu.addEventListener("click", event => {
    const b = event.target instanceof Element ? event.target.closest("button") : null;
    if (!b || menuId === null) return;
    const id = menuId;
    const v = b.dataset.v;
    const act = b.dataset.menu;
    closeMenu();
    if (act === "rule") { cardOf(id).when = v; commit(); }
    else if (act === "merge") mergeInto(id, Number(v));
    else if (act === "out") extract(id);
    else if (act === "hide") setCardHidden(id, true);
  });
  // A tap anywhere else closes the menu; the ⋮ buttons toggle it themselves.
  document.addEventListener("pointerdown", event => {
    if (menu.hidden) return;
    const t = event.target;
    if (t instanceof Element && t.closest(".hw-menu, .hw-more")) return;
    closeMenu();
  });

  // ---- Вход, выход, перетаскивание и размер ----
  function enterEdit() {
    const body = document.body.classList;
    if (body.contains("player-expanded") || body.contains("night-mode")) return false;
    if (typeof state !== "undefined" && typeof state.speedKmh === "number" && state.speedKmh > 0) {
      if (typeof showToast === "function") showToast("На ходу раскладку не меняем");
      return false;
    }
    editing = true;
    body.add("hw-edit");
    renderPanel();
    return true;
  }
  function exitEdit() {
    editing = false;
    dragId = null;
    dropInfo = null;
    resize = null;
    press = null;
    selectedId = null;
    closeMenu();
    resetArmed = false;
    clearTimeout(resetTimer);
    resetButton.textContent = "Сбросить";
    panel.classList.remove("open");
    document.body.classList.remove("hw-edit");
    document.querySelectorAll(".hw-dragging, .hw-resizing, .hw-drop, .hw-selected").forEach(el => el.classList.remove("hw-dragging", "hw-resizing", "hw-drop", "hw-selected"));
    renderInspector();
    saveLayout();
  }

  bar.addEventListener("click", event => {
    const act = event.target.closest("button") ? event.target.closest("button").dataset.act : null;
    if (act === "done") exitEdit();
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
      panel.classList.remove("open");
      selectedId = null;
      layout = clone(DEFAULT_N);
      commit();
    }
  });

  // The row of a point: the top half or the bottom half of the box (split between the rows).
  function rowAtY(y) {
    const box = bottomBox.getBoundingClientRect();
    return y < box.top + layout.rowH[0] + layout.rowGap / 2 ? 0 : 1;
  }
  // Where a dragged card would go: before or after a card, or a slot in a row (before the first item to the right).
  function computeDrop(x, y, id) {
    const under = document.elementFromPoint(x, y);
    const el = under && under.closest ? under.closest("[data-hw]") : null;
    const loc = el ? locate(el.dataset.hw) : null;
    if (el && el.dataset.hw !== id && loc) {
      const r = el.getBoundingClientRect();
      const before = loc.m >= 0 ? y < r.top + r.height / 2 : x < r.left + r.width / 2;
      return { kind: "card", id: el.dataset.hw, before };
    }
    const row = rowAtY(y);
    let beforeItem = null;
    for (const p of planRow(layout.rows[row], false)) {
      const node = p.item.group ? wrapOf.get(p.item) : elOf(p.item.id);
      if (!node) continue;
      const b = node.getBoundingClientRect();
      if (b.left + b.width / 2 > x) { beforeItem = p.item; break; }
    }
    return { kind: "slot", row, beforeItem };
  }
  function markDrop(info) {
    document.querySelectorAll(".hw-drop").forEach(el => el.classList.remove("hw-drop"));
    if (info && info.kind === "card") { const el = elOf(info.id); if (el) el.classList.add("hw-drop"); }
  }
  function moveCard(id, target) {
    if (target.kind === "card" && target.id === id) return;
    const card = takeOut(id);
    if (!card) return;
    if (target.kind === "card") {
      const loc = locate(target.id);
      if (!loc) return;
      if (loc.m >= 0) loc.item.members.splice(loc.m + (target.before ? 0 : 1), 0, toMember(card));
      else layout.rows[loc.r].items.splice(loc.i + (target.before ? 0 : 1), 0, toSingle(card, card.span));
    } else {
      const row = layout.rows[target.row];
      const at = target.beforeItem ? row.items.indexOf(target.beforeItem) : -1;
      row.items.splice(at < 0 ? row.items.length : at, 0, toSingle(card, card.span));
    }
    commit();
  }

  // Corner handle: the width in columns (the card or the group), the height of its row.
  function startResize(event, handle) {
    event.preventDefault();
    event.stopPropagation();
    const wrap = handle.closest(".hw-group");
    let item = null;
    let node = null;
    if (wrap && wrap.parentNode === bottomBox) { item = wrap._group; node = wrap; }
    else {
      const el = handle.closest("[data-hw]");
      const loc = el ? locate(el.dataset.hw) : null;
      if (!loc || loc.m >= 0) return;
      item = loc.item;
      node = el;
    }
    const r = rowIndexOf(item);
    if (r < 0) return;
    resize = { item, r, x: event.clientX, y: event.clientY, span: item.span, h: layout.rowH[r], node };
    node.classList.add("hw-resizing");
  }
  function updateResize(event) {
    const unit = (bottomBox.clientWidth - (COLS - 1) * layout.colGap) / COLS + layout.colGap;
    const others = rowSpan(layout.rows[resize.r]) - resize.item.span;
    const dx = event.clientX - resize.x;
    const dy = event.clientY - resize.y;
    const min = minSpanOf(resize.item);
    resize.item.span = clamp(Math.round(resize.span + dx / unit), min, Math.max(min, COLS - others));
    layout.rowH[resize.r] = clamp(Math.round(resize.h + dy), MIN_ROW_H, MAX_ROW_H);
    apply();
  }
  function finishResize() {
    resize.node.classList.remove("hw-resizing");
    resize = null;
    commit();
  }

  // Pointer: a press on a card selects it (in edit mode) or starts the long press that opens edit mode.
  bottomBox.addEventListener("pointerdown", event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (editing && t.closest(".hw-resize")) { startResize(event, t.closest(".hw-resize")); return; }
    if (t.closest(".hw-hide, .hw-more")) return;
    const el = t.closest("[data-hw]");
    if (!el) return;
    press = { id: el.dataset.hw, x: event.clientX, y: event.clientY, moved: false, longFired: false };
    if (!editing) {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (!press || !enterEdit()) return;
        press.longFired = true;
        dragId = press.id;
        elOf(dragId).classList.add("hw-dragging");
      }, 700);
    }
  });
  document.addEventListener("pointermove", event => {
    if (resize) { updateResize(event); return; }
    if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      press.moved = true;
      if (!editing) { clearTimeout(pressTimer); press = null; return; }
      dragId = press.id;
      elOf(dragId).classList.add("hw-dragging");
    }
    if (dragId) {
      dropInfo = computeDrop(event.clientX, event.clientY, dragId);
      markDrop(dropInfo);
    }
  });
  function endPointer() {
    clearTimeout(pressTimer);
    if (resize) finishResize();
    if (dragId) {
      const id = dragId;
      const target = dropInfo;
      dragId = null;
      dropInfo = null;
      markDrop(null);
      const el = elOf(id);
      if (el) el.classList.remove("hw-dragging");
      if (target) moveCard(id, target);
    } else if (press && editing && !press.moved && !press.longFired) {
      selectedId = press.id;
      renderInspector();
    }
    if (press && (press.longFired || press.moved)) suppressClickUntil = Date.now() + 300;
    press = null;
  }
  document.addEventListener("pointerup", endPointer);
  document.addEventListener("pointercancel", endPointer);

  // In edit mode a tap on a card does not run the card's own action; the hide button and the editor's controls still work.
  document.addEventListener("click", event => {
    if (Date.now() < suppressClickUntil) { event.stopPropagation(); event.preventDefault(); return; }
    if (!editing) return;
    const t = event.target;
    if (!(t instanceof Element) || t.closest(".hw-hide, .hw-more, .hw-resize, .hw-inspector, .hw-edit-bar, .hw-panel, .hw-menu")) return;
    if (t.closest("[data-hw], .hw-group")) { event.stopPropagation(); event.preventDefault(); }
  }, true);
  bottomBox.addEventListener("click", event => {
    const hide = event.target instanceof Element ? event.target.closest(".hw-hide") : null;
    if (!hide || !editing) return;
    event.stopPropagation();
    const el = hide.closest("[data-hw]");
    if (el) setCardHidden(el.dataset.hw, true);
  });

  // The ⋮ button opens the card's menu (a second tap closes it).
  bottomBox.addEventListener("click", event => {
    const more = event.target instanceof Element ? event.target.closest(".hw-more") : null;
    if (!more || !editing) return;
    event.stopPropagation();
    const el = more.closest("[data-hw]");
    if (!el) return;
    if (!menu.hidden && menuId === el.dataset.hw) closeMenu();
    else openMenu(el.dataset.hw, more);
  });

  // ---- Старт ----
  layout = loadLayout();
  Object.keys(MOVABLE).forEach(id => {
    const el = elOf(id);
    if (!el) return;
    el.dataset.hw = id;
    if (!el.querySelector(":scope > .hw-resize")) {
      const handle = document.createElement("span");
      handle.className = "hw-resize";
      handle.setAttribute("aria-hidden", "true");
      el.appendChild(handle);
    }
    if (id !== "player" && !el.querySelector(":scope > .hw-hide")) {
      const hide = document.createElement("span");
      hide.className = "hw-hide";
      hide.textContent = "×";
      hide.setAttribute("role", "button");
      el.appendChild(hide);
    }
  });
  setupCardControls();
  apply();
  renderPanel();
  renderInspector();
  // The cover, the night screen, the edit mode and the car's route/radar state all change the placement: re-apply on each change.
  setInterval(apply, 1000);
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(apply).observe(bottomBox, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("load", apply);
  window.hwToggleCard = id => setCardHidden(id, !(cardOf(id) && cardOf(id).hidden));
  window.hwIsHidden = id => { const c = cardOf(id); return !!(c && c.hidden); };
  window.hwCardNames = CARD_NAMES;
  window.hwResetLayout = () => { layout = clone(DEFAULT_N); selectedId = null; commit(); };
})();
