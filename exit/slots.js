// Slot storage, the pages (main, climate, windows, screen) and slot rendering.
// Loaded after commands.js and before app.js; the functions stay plain globals.
function loadSlots(key = STORAGE_KEY, defaults = DEFAULT_SLOTS) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved)) {
      return saved.slice(0, MAX_SLOTS).map(slot => (slot && typeof slot === "object" ? slot : { type: "empty" }));
    }
  } catch (error) { console.warn("Не удалось прочитать слоты", error); }
  return defaults.map(slot => ({ ...slot }));
}

const MAIN_RETIRED_KEY = "generic_launcher_main_retired_v6";

function saveSlots() {
  localStorage.setItem(CLIMATE_STORAGE_KEY, JSON.stringify(state.pages.climate));
  localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(state.pages.windows));
  localStorage.setItem(SCREEN_STORAGE_KEY, JSON.stringify(state.pages.screen));
  localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(state.pages.apps));
  localStorage.setItem(COMBOS_STORAGE_KEY, JSON.stringify(state.pages.combos));
}

// The page a slot belongs to now: seats and climate, windows and car, or the screen page (also apps and combinations).
function pageForSlot(slot) {
  if (slot?.type === "split") return "combos";
  if (slot?.type === "app") return "apps";
  const group = pickerGroup(slot);
  if (group === "apps") return "apps";
  if (group === "seats") return "climate";
  if (group === "car") return "windows";
  return "screen";
}

// The main page is gone: its slots move to the pages they belong to, once.
function retireMainPage() {
  (state.pages.main || []).forEach(slot => {
    if (slot?.type !== "empty") state.pages[pageForSlot(slot)].push({ ...slot });
  });
  delete state.pages.main;
  ["climate", "windows", "screen", "apps", "combos"].forEach(page => { state.pages[page] = state.pages[page].slice(0, MAX_SLOTS); });
  try {
    localStorage.setItem(MAIN_RETIRED_KEY, "1");
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* best effort */ }
  saveSlots();
}

function isClimateSlot(slot) {
  return slot?.type === "level" || slot?.type === "temp" || (slot?.type === "action" && CLIMATE_ACTIONS.has(slot.command));
}

function initPages() {
  let mainRetired = false;
  try { mainRetired = localStorage.getItem(MAIN_RETIRED_KEY) === "1"; } catch { mainRetired = false; }
  state.pages = {
    main: mainRetired ? [] : loadSlots(STORAGE_KEY, DEFAULT_SLOTS),
    climate: loadSlots(CLIMATE_STORAGE_KEY, CLIMATE_DEFAULT_SLOTS),
    windows: loadSlots(WINDOWS_STORAGE_KEY, []),
    screen: loadSlots(SCREEN_STORAGE_KEY, []),
    apps: loadSlots(APPS_STORAGE_KEY, []),
    combos: loadSlots(COMBOS_STORAGE_KEY, [])
  };
  if (localStorage.getItem(CLIMATE_STORAGE_KEY) == null) {
    // One-time move: climate slots that were on the main page go to the climate page.
    const moved = state.pages.main.filter(isClimateSlot);
    state.pages.main = state.pages.main.map(slot => (isClimateSlot(slot) ? { type: "empty" } : slot));
    if (moved.length) state.pages.climate = moved.map(slot => ({ ...slot }));
    saveSlots();
  }
  const upgradedMain = upgradeTempSlots(state.pages.main);
  // Legacy climate pages: temperature slots move forward, right after the seat level slots.
  const legacyClimate = upgradeTempSlots(state.pages.climate);
  const upgradedClimate = legacyClimate !== state.pages.climate ? moveTempSlotsForward(legacyClimate) : state.pages.climate;
  if (upgradedMain !== state.pages.main || upgradedClimate !== state.pages.climate) {
    state.pages.main = upgradedMain;
    state.pages.climate = upgradedClimate;
    saveSlots();
  }
  // The climate page holds only climate slots: anything else saved there moves to the end of the main page.
  const isStray = slot => slot?.type !== "empty" && !isClimateSlot(slot);
  if (state.pages.climate.some(isStray)) {
    state.pages.climate.filter(isStray).forEach(slot => state.pages[pageForSlot(slot)].push({ ...slot }));
    state.pages.climate = state.pages.climate.map(slot => (isStray(slot) ? { type: "empty" } : slot));
    saveSlots();
  }
  // Buttons that left the default set (the player has its own controls): remove them from saved main pages once.
  const REMOVED_DEFAULTS_KEY = "generic_launcher_defaults_removed_v3";
  const REMOVED_DEFAULTS = ["RUN_START_APP_MENU", "RECENT_TASK_MANAGER", "MEDIA_PLAY_PAUSE"];
  let alreadyRemoved = false;
  try { alreadyRemoved = localStorage.getItem(REMOVED_DEFAULTS_KEY) === "1"; } catch { alreadyRemoved = true; }
  if (!alreadyRemoved) {
    const before = state.pages.main.length;
    state.pages.main = state.pages.main.filter(slot => !(slot.type === "action" && REMOVED_DEFAULTS.includes(slot.command)));
    try { localStorage.setItem(REMOVED_DEFAULTS_KEY, "1"); } catch { /* best effort */ }
    if (state.pages.main.length !== before) saveSlots();
  }
  // Apps belong to the Приложения page: remove app shortcuts from the main and climate pages once.
  const APP_SLOTS_KEY = "generic_launcher_app_slots_moved_v5";
  let appSlotsMoved = false;
  try { appSlotsMoved = localStorage.getItem(APP_SLOTS_KEY) === "1"; } catch { appSlotsMoved = true; }
  if (!appSlotsMoved) {
    const hadApps = [...state.pages.main, ...state.pages.climate].some(slot => slot.type === "app");
    state.pages.main = state.pages.main.filter(slot => slot.type !== "app");
    state.pages.climate = state.pages.climate.filter(slot => slot.type !== "app");
    try { localStorage.setItem(APP_SLOTS_KEY, "1"); } catch { /* best effort */ }
    if (hadApps) saveSlots();
  }
  // System app commands belong to the Приложения page: move them from the other pages once.
  const APP_ACTIONS_KEY = "generic_launcher_app_actions_moved_v1";
  let appActionsMoved = false;
  try { appActionsMoved = localStorage.getItem(APP_ACTIONS_KEY) === "1"; } catch { appActionsMoved = true; }
  if (!appActionsMoved) {
    const isAppAction = slot => slot?.type === "action" && APP_ACTIONS.includes(slot.command);
    let changed = false;
    ["main", "climate", "windows", "screen"].forEach(page => {
      if (!state.pages[page]) return;
      const moved = state.pages[page].filter(isAppAction);
      if (!moved.length) return;
      state.pages[page] = state.pages[page].filter(slot => !isAppAction(slot));
      state.pages.apps.push(...moved.map(slot => ({ ...slot })));
      changed = true;
    });
    state.pages.apps = state.pages.apps.slice(0, MAX_SLOTS);
    try { localStorage.setItem(APP_ACTIONS_KEY, "1"); } catch { /* best effort */ }
    if (changed) saveSlots();
  }
  // Saved combinations moved from the Приложения page to their own Комбинации page, once.
  const COMBOS_MOVED_KEY = "generic_launcher_combos_moved_v1";
  let combosMoved = false;
  try { combosMoved = localStorage.getItem(COMBOS_MOVED_KEY) === "1"; } catch { combosMoved = true; }
  if (!combosMoved) {
    const splits = state.pages.apps.filter(slot => slot?.type === "split");
    if (splits.length) {
      state.pages.apps = state.pages.apps.filter(slot => slot?.type !== "split");
      state.pages.combos.push(...splits.map(slot => ({ ...slot })));
      state.pages.combos = state.pages.combos.slice(0, MAX_SLOTS);
      saveSlots();
    }
    try { localStorage.setItem(COMBOS_MOVED_KEY, "1"); } catch { /* best effort */ }
  }
  // The central lock slot now sends the head unit's own command: rename it in every saved page, once.
  const LOCK_RENAME_KEY = "generic_launcher_central_lock_v1";
  let lockRenamed = false;
  try { lockRenamed = localStorage.getItem(LOCK_RENAME_KEY) === "1"; } catch { lockRenamed = true; }
  if (!lockRenamed) {
    let changed = false;
    Object.keys(state.pages).forEach(page => {
      state.pages[page] = state.pages[page].map(slot => {
        if (slot?.type === "action" && slot.command === "TOGGLE_CENTRAL_LOCK") {
          changed = true;
          return { ...slot, command: "TOGGLE_E_CENTRAL_LOCK" };
        }
        return slot;
      });
    });
    try { localStorage.setItem(LOCK_RENAME_KEY, "1"); } catch { /* best effort */ }
    if (changed) saveSlots();
  }
  // Per-window single toggles on the windows page become the four window buttons (tap / hold), once.
  const WINDOW_BUTTONS_KEY = "generic_launcher_window_buttons_v1";
  let windowButtonsDone = false;
  try { windowButtonsDone = localStorage.getItem(WINDOW_BUTTONS_KEY) === "1"; } catch { windowButtonsDone = true; }
  if (!windowButtonsDone && state.pages.windows) {
    const isSingleWindow = slot => slot?.type === "action" && /^TOGGLE_WINDOW_(FRONT_LEFT|FRONT_RIGHT|REAR_LEFT|REAR_RIGHT)_(AJAR|OPEN)$/.test(slot.command);
    const windows = state.pages.windows;
    const firstIndex = windows.findIndex(isSingleWindow);
    const kept = windows.filter(slot => !isSingleWindow(slot));
    const buttons = Object.keys(GESTURE_WINDOWS).map(id => ({ type: "action", command: id, label: GESTURE_WINDOWS[id].label }));
    const insertAt = firstIndex >= 0 ? firstIndex : kept.length;
    state.pages.windows = [...kept.slice(0, insertAt), ...buttons, ...kept.slice(insertAt)].slice(0, MAX_SLOTS);
    try { localStorage.setItem(WINDOW_BUTTONS_KEY, "1"); } catch { /* best effort */ }
    saveSlots();
  }
  // Buttons added to the default main set: append the ones missing from a saved main page, once.
  const ADDED_DEFAULTS_KEY = "generic_launcher_defaults_added_v4";
  let alreadyAdded = false;
  try { alreadyAdded = localStorage.getItem(ADDED_DEFAULTS_KEY) === "1"; } catch { alreadyAdded = true; }
  if (!alreadyAdded) {
    const present = new Set(state.pages.main.filter(slot => slot.type === "action").map(slot => slot.command));
    const missing = DEFAULT_SLOTS.filter(slot => slot.type === "action" && !present.has(slot.command));
    if (missing.length) {
      state.pages.main = [...state.pages.main, ...missing.map(slot => ({ ...slot }))];
      saveSlots();
    }
    try { localStorage.setItem(ADDED_DEFAULTS_KEY, "1"); } catch { /* best effort */ }
  }
  if (!mainRetired) retireMainPage();
  if (trimTrailingEmpties(state.pages.climate) | trimTrailingEmpties(state.pages.windows) | trimTrailingEmpties(state.pages.screen) | trimTrailingEmpties(state.pages.apps) | trimTrailingEmpties(state.pages.combos)) saveSlots();
  state.slots = state.pages[state.page];
}

// Keeps the page length: temperature slots are inserted after the leading level slots and the rest shifts back.
function moveTempSlotsForward(slots) {
  const temps = slots.filter(slot => slot?.type === "temp");
  if (!temps.length) return slots;
  const rest = slots.filter(slot => slot?.type !== "temp");
  let insertAt = 0;
  while (insertAt < rest.length && rest[insertAt]?.type === "level") insertAt += 1;
  return [...rest.slice(0, insertAt), ...temps, ...rest.slice(insertAt)];
}

// Earlier saves kept four raw +/- buttons; each zone now becomes one temperature slot.
function upgradeTempSlots(slots) {
  const seen = new Set();
  let changed = false;
  const next = slots.map(slot => {
    if (slot?.type !== "action") return slot;
    const zoneName = Object.keys(TEMP_ZONES).find(name => slot.command === TEMP_ZONES[name].up || slot.command === TEMP_ZONES[name].down);
    if (!zoneName) return slot;
    changed = true;
    if (seen.has(zoneName)) return { type: "empty" };
    seen.add(zoneName);
    return { type: "temp", zone: zoneName };
  });
  return changed ? next : slots;
}

// Switching pages slides the slot row out and back in, in the direction of the tab order.
const PAGE_SWITCH_MS = 90;
let pageSwitchTimer = null;

function setPage(name) {
  if (!state.pages[name]) return;
  if (state.page === name) return;
  if (state.playerExpanded) collapsePlayer(false);
  const row = document.getElementById("action-slots");
  const order = [...document.querySelectorAll("[data-page]")].map(button => button.dataset.page);
  const dir = order.indexOf(name) > order.indexOf(state.page) ? "next" : "prev";
  clearTimeout(pageSwitchTimer);
  row.classList.remove("entering-next", "entering-prev");
  row.classList.add(`leaving-${dir}`);
  pageSwitchTimer = setTimeout(() => {
    row.classList.remove(`leaving-${dir}`);
    state.page = name;
    state.slots = state.pages[name];
    renderPage();
    renderPageTabs();
    void row.offsetWidth;
    row.classList.add(`entering-${dir}`);
  }, PAGE_SWITCH_MS);
}

// Every page is a row of slots; the app drawer is no longer shown.
function renderPage() {
  document.getElementById("action-slots").hidden = false;
  document.getElementById("app-drawer").hidden = true;
  document.getElementById("add-slot").hidden = false;
  renderSlots();
}

function renderPageTabs() {
  document.querySelectorAll("[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === state.page));
}

// Removes empty slots at the end of a page. The slot whose picker is open is kept. Returns true when something was removed.
function trimTrailingEmpties(slots, keepIndex = null) {
  let removed = false;
  while (slots.length && slots[slots.length - 1].type === "empty" && slots.length - 1 !== keepIndex) {
    slots.pop();
    removed = true;
  }
  return removed;
}

function renderSlots() {
  if (trimTrailingEmpties(state.slots, state.pickerSlot)) saveSlots();
  const container = document.getElementById("action-slots");
  container.classList.toggle("climate-page", state.page === "climate");
  const fragment = document.createDocumentFragment();
  state.slots.forEach((slot, index) => fragment.appendChild(renderSlot(slot, index)));
  container.replaceChildren(fragment);
  fitSlotLabels(container);
}

// A single long word (e.g. "Дополнительные") can be wider than the label box and get cut off.
// Shrink that label's font until its longest word fits. Labels that already fit keep the normal size.
function fitSlotLabels(container) {
  container.querySelectorAll(".action-main strong").forEach(label => {
    label.style.fontSize = "";
    let size = 20;
    while (label.scrollWidth > label.clientWidth + 1 && size > 15) {
      size -= 1;
      label.style.fontSize = `${size}px`;
    }
  });
}

function addSlot() {
  if (state.slots.length >= MAX_SLOTS) {
    showToast(`Больше ${MAX_SLOTS} слотов не поместится`);
    return;
  }
  state.slots.push({ type: "empty" });
  saveSlots();
  openPicker(state.slots.length - 1);
  renderSlots();
}

function removeSlot(index) {
  if (!state.slots[index]) return;
  state.slots.splice(index, 1);
  saveSlots();
  renderSlots();
}

function renderSlot(slot, index) {
  const element = document.createElement("div");
  element.className = "action-slot";
  element.dataset.slot = String(index);
  element.tabIndex = 0;
  element.setAttribute("role", "button");

  if (!slot || slot.type === "empty") {
    element.classList.add("empty-slot");
    element.innerHTML = `
      <div class="action-icon">+</div>
      <div class="action-main"><strong>Добавить</strong></div>`;
    bindSlotPress(element, index, () => openPicker(index));
    return element;
  }

  if (slot.type === "level") {
    const group = levelGroup(slot.id);
    if (!group) return renderSlot({ type: "empty" }, index);
    element.classList.add("has-level", group.tone === "cool" ? "cool" : "warm");
    element.innerHTML = `
      <div class="action-icon">${group.icon}</div>
      <div class="action-main"><strong>${group.label}</strong><span>${Number(slot.level) ? `Уровень ${Number(slot.level)}` : ""}</span></div>
      <div class="level-lamps" aria-label="Уровень ${Number(slot.level) || 0}">
        ${[1, 2, 3].map(level => `<i class="${Number(slot.level) >= level ? "on" : ""}"></i>`).join("")}
      </div>`;
    bindSlotPress(element, index, () => cycleLevel(index));
    return element;
  }

  if (slot.type === "temp") {
    const zone = TEMP_ZONES[slot.zone];
    if (!zone) return renderSlot({ type: "empty" }, index);
    const value = state.cabinTemps[slot.zone];
    element.classList.add("temp-slot");
    element.innerHTML = `
      <div class="temp-top" data-tone="temp">
        <div class="temp-value">${value == null ? "—" : `${value}°C`}</div>
        <div class="temp-halves" aria-label="Плюс сверху, минус снизу"><i>+</i><i>−</i></div>
      </div>
      <div class="action-main"><strong>${zone.short}</strong></div>`;
    bindSlotPress(element, index, event => adjustTemp(index, event));
    return element;
  }

  const isApp = slot.type === "app";
  const isSplit = slot.type === "split";
  const heatToggle = slot.type === "action" ? HEAT_TOGGLES[slot.command] : null;
  const trackedAction = slot.type === "action" ? ACTION_STATE_COMMANDS[slot.command] : null;
  const trackedState = heatToggle ? state.actionStates[heatToggle.key] : trackedAction ? state.actionStates[trackedAction.key] : null;
  if (trackedState === true) element.classList.add("state-on");
  const label = slot.label || (isApp ? slot.packageName : isSplit ? "Сохранённая комбинация" : actionLabel(slot.command));
  const slotIcon = slot.icon || (slot.type === "action" ? actionIcon(slot.command) : "");
  const iconContent = slotIcon
    ? `<img src="${imageSource(slotIcon)}" alt="" decoding="async">`
    : (isApp ? (label.trim().charAt(0).toUpperCase() || "A") : isSplit ? "▥" : commandIcon(slot.command));
  element.innerHTML = `
    <div class="action-icon" data-tone="${isApp ? "app" : isSplit ? "split" : iconTone(slot.command)}">${iconContent}</div>
    <div class="action-main"><strong>${escapeHtml(label)}</strong><span>${isApp ? "Приложение" : isSplit ? `Комбинация · ${Number(slot.ratio) || 50}/${100 - (Number(slot.ratio) || 50)}` : ""}</span></div>
    <div class="single-lamp" aria-hidden="true"></div>`;
  bindSlotPress(element, index, () => executeSlot(index));
  return element;
}

function bindSlotPress(element, index, clickAction) {
  let timer = null;
  let holdTimer = null;
  let pressedAt = 0;
  let longPressed = false;
  const windowId = () => {
    const slot = state.slots[index];
    return slot?.type === "action" && GESTURE_WINDOWS[slot.command] ? slot.command : null;
  };
  const clearTimers = () => { clearTimeout(timer); clearTimeout(holdTimer); };
  const start = event => {
    if (event.type === "pointerdown" && event.button !== 0) return;
    longPressed = false;
    clearTimers();
    pressedAt = Date.now();
    if (windowId()) {
      // Window buttons: a hold of 0.65-2 s opens fully (decided on release), 2 s+ opens the picker.
      holdTimer = setTimeout(() => { longPressed = true; openPicker(index); }, 2000);
      return;
    }
    timer = setTimeout(() => {
      longPressed = true;
      enterSlotOrder();
      // The click that follows the release of this long press must not open the picker.
      slotSuppressClick = true;
    }, 650);
  };
  const finish = event => {
    const id = windowId();
    clearTimers();
    if (event.type !== "pointerup" || longPressed) return;
    if (id) {
      runCommand(id, GESTURE_WINDOWS[id].label, element, Date.now() - pressedAt >= 650);
      return;
    }
    if (clickAction && !event.target.closest(".level-control")) clickAction(event);
  };
  element.addEventListener("pointerdown", start);
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", clearTimers);
  element.addEventListener("pointerleave", clearTimers);
  element.addEventListener("contextmenu", event => event.preventDefault());
  element.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); clickAction ? clickAction() : openPicker(index); }
  });
}

function setLevel(index, level) {
  const slot = state.slots[index];
  const group = levelGroup(slot.id);
  if (!group) return;
  const command = level === 0 ? group.off : `${group.id}_${level}`;
  slot.level = level;
  state.optimisticLevels[group.id] = { level, until: Date.now() + 3_000 };
  saveSlots();
  renderSlots();
  const element = document.querySelector(`[data-slot="${index}"]`);
  pulse(element);
  enqueueEnumCommand(command, group.label, group.id);
}

function cycleLevel(index) {
  const current = Number(state.slots[index]?.level) || 0;
  setLevel(index, (current + 1) % 4);
}

// The "+" half is the top part of the strip, "−" the bottom part. A tap outside the strip uses the card's upper half.
// Keyboard activation (no pointer position) raises the temperature.
function adjustTemp(index, event = null) {
  const slot = state.slots[index];
  const zone = TEMP_ZONES[slot?.zone];
  if (!zone) return;
  const element = document.querySelector(`[data-slot="${index}"]`);
  const hit = event?.target?.closest?.(".temp-halves i");
  let up = true;
  if (hit) up = hit === hit.parentElement.firstElementChild;
  else if (event && element) up = event.clientY < element.getBoundingClientRect().top + element.offsetHeight / 2;
  const command = up ? zone.up : zone.down;
  runCommand(command, ACTION_LABELS[command], element);
}

function executeSlot(index) {
  const slot = state.slots[index];
  const element = document.querySelector(`[data-slot="${index}"]`);
  if (slot.type === "app") {
    pulse(element);
    if (bridge.has("requestRunAppAsync")) {
      const requestId = nextRequestId("app");
      state.uiRequests[requestId] = { type: "app" };
      if (!bridge.runAppAsync(requestId, slot.packageName)) {
        delete state.uiRequests[requestId];
        showToast("Приложение временно недоступно");
      }
    } else setTimeout(() => bridge.runApp(slot.packageName), 0);
  } else if (slot.type === "split") {
    pulse(element);
    if (bridge.has("requestRunSavedSplitAsync")) {
      const requestId = nextRequestId("split");
      state.uiRequests[requestId] = { type: "split" };
      if (!bridge.runSavedSplitAsync(requestId, slot.raw)) {
        delete state.uiRequests[requestId];
        showToast("Комбинация временно недоступна");
      }
    } else setTimeout(() => bridge.runSavedSplit(slot.raw), 0);
  } else if (slot.type === "action") {
    runCommand(slot.command, slot.label || actionLabel(slot.command), element);
  }
}

// A window button remembers its last state: closed -> ajar/full, anything open -> closed.
function gestureWindowCommand(id, hold) {
  const gesture = GESTURE_WINDOWS[id];
  const key = `generic_launcher_gesture_${id}_v1`;
  let current = "closed";
  try { current = localStorage.getItem(key) || "closed"; }
  catch (error) { console.warn("Состояние окна не прочитано", error); }
  const opening = current === "closed";
  const next = opening ? (hold ? "open" : "ajar") : "closed";
  try { localStorage.setItem(key, next); }
  catch (error) { console.warn("Состояние окна не сохранено", error); }
  return opening ? (hold ? gesture.full : gesture.ajar) : gesture.close;
}

// The trunk may open only when the car is standing still; closing is always allowed.
const TRUNK_MOVING_KMH = 5;
function trunkOpenWouldRun(command) {
  if (command === "profile:open_trunk") return true;
  if (command !== "TOGGLE_TRUNK") return false;
  let last = null;
  try { last = localStorage.getItem("generic_launcher_toggle_TOGGLE_TRUNK_v1"); } catch (error) { /* first press */ }
  return last !== "profile:open_trunk";
}
function runCommand(command, label, element, hold = false) {
  if (trunkOpenWouldRun(command) && typeof state.speedKmh === "number" && state.speedKmh > TRUNK_MOVING_KMH) {
    showToast("Багажник открывается только на стоянке");
    return;
  }
  showCarAnimation(command);
  if (GESTURE_WINDOWS[command]) {
    label = GESTURE_WINDOWS[command].label;
    command = gestureWindowCommand(command, hold);
  }
  if (command === SUNROOF_TOGGLE) {
    command = nextSunroofCommand();
    label = ACTION_LABELS[command];
  }
  if (command === "TOGGLE_E_CENTRAL_LOCK") command = CENTRAL_TOGGLE;
  if (command === CENTRAL_TOGGLE) {
    command = nextCentralCommand();
    label = ACTION_LABELS[command];
  }
  if (command === ROOF_TOGGLE) {
    command = nextRoofCommand();
    label = ACTION_LABELS[command];
  }
  const heatToggle = HEAT_TOGGLES[command];
  if (heatToggle) {
    command = state.actionStates[heatToggle.key] === true ? heatToggle.off : heatToggle.on;
    label = ACTION_LABELS[command];
  }
  if (MEMORY_TOGGLES[command]) {
    command = nextMemoryCommand(command);
    label = ACTION_LABELS[command];
  }
  if (CYCLE_TOGGLES[command]) {
    command = nextCycleCommand(command);
    label = ACTION_LABELS[command];
  }
  if (command === MEDIA_TOGGLE) {
    command = nextPlayCommand();
    label = ACTION_LABELS[command];
  }
  const trackedAction = ACTION_STATE_COMMANDS[command];
  if (trackedAction) {
    const slotIndex = element?.dataset.slot;
    state.actionStates[trackedAction.key] = trackedAction.value;
    state.optimisticActions[trackedAction.key] = { value: trackedAction.value, until: Date.now() + 3_000 };
    renderSlots();
    element = document.querySelector(`[data-slot="${slotIndex}"]`);
  }
  pulse(element);
  noteWindowCommand(command);
  enqueueEnumCommand(command, label);
}

function pulse(element) {
  if (!element) return;
  element.classList.add("running");
  setTimeout(() => element.classList.remove("running"), 550);
}



// Slot order: a long press on a slot turns on reordering, like the home cards. In this mode drag a slot onto another to swap them,
// tap a slot to choose its action, and press "Готово" to finish. Window buttons keep their own hold behaviour.
let slotOrderMode = false;
let slotSuppressClick = false;
let slotDragIndex = null;
let slotMoved = false;
let slotDoneButton = null;

function enterSlotOrder() {
  if (slotOrderMode || document.body.classList.contains("hw-edit")) return;
  slotOrderMode = true;
  document.body.classList.add("slots-order");
  if (slotDoneButton) slotDoneButton.hidden = false;
  showToast("Перетащи слот · нажми, чтобы выбрать действие", 3000);
}

function exitSlotOrder() {
  slotOrderMode = false;
  slotDragIndex = null;
  document.body.classList.remove("slots-order");
  document.querySelectorAll(".action-slot.slot-dragging").forEach(el => el.classList.remove("slot-dragging"));
  if (slotDoneButton) slotDoneButton.hidden = true;
}

(function bindSlotOrder() {
  const header = document.querySelector(".actions-title-row");
  const container = document.getElementById("action-slots");
  if (!header || !container) return;
  slotDoneButton = document.createElement("button");
  slotDoneButton.type = "button";
  slotDoneButton.id = "slots-order-done";
  slotDoneButton.className = "add-slot-button";
  slotDoneButton.textContent = "Готово";
  slotDoneButton.hidden = true;
  slotDoneButton.addEventListener("click", exitSlotOrder);
  header.appendChild(slotDoneButton);

  container.addEventListener("pointerdown", event => {
    slotSuppressClick = false;
    if (!slotOrderMode) return;
    const element = event.target.closest(".action-slot");
    if (!element) return;
    event.stopPropagation();
    event.preventDefault();
    slotDragIndex = Number(element.dataset.slot);
    slotMoved = false;
    element.classList.add("slot-dragging");
  }, true);

  document.addEventListener("pointermove", event => {
    if (!slotOrderMode || slotDragIndex === null) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest(".action-slot");
    if (!under) return;
    const target = Number(under.dataset.slot);
    if (target === slotDragIndex || !state.slots[target] || !state.slots[slotDragIndex]) return;
    [state.slots[slotDragIndex], state.slots[target]] = [state.slots[target], state.slots[slotDragIndex]];
    slotDragIndex = target;
    slotMoved = true;
    saveSlots();
    renderSlots();
    container.querySelector(`[data-slot="${target}"]`)?.classList.add("slot-dragging");
  });

  const endDrag = () => {
    slotDragIndex = null;
    container.querySelectorAll(".slot-dragging").forEach(el => el.classList.remove("slot-dragging"));
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  // In this mode a click does not run the slot's action: a tap opens the picker, a drag only moves the slot.
  container.addEventListener("click", event => {
    if (!slotOrderMode) return;
    const element = event.target.closest(".action-slot");
    if (!element) return;
    event.stopPropagation();
    event.preventDefault();
    if (slotSuppressClick) { slotSuppressClick = false; return; }
    if (slotMoved) { slotMoved = false; return; }
    openPicker(Number(element.dataset.slot));
  }, true);
})();
