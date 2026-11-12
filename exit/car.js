// Car state: seat levels, action toggles, sunroof position. Polled from the bridge.
const SUNROOF_STATE_KEY = "generic_launcher_sunroof_v1";
const SUNROOF_POLL_MS = 3_000;
const SUNROOF_OPTIMISTIC_MS = 8_000;
// Measured on the car: getCarData("sun") === true reports the sunroof as closed (the car showed "открыт" while closed).
const SUNROOF_RAW_OPEN = false;

function nextSunroofCommand() {
  let open = state.sunroofOpen;
  if (open == null) {
    try { open = localStorage.getItem(SUNROOF_STATE_KEY) === "open"; }
    catch (error) { console.warn("Состояние шторки не прочитано", error); open = false; }
  }
  const next = open ? "CLOSE_SHTORKA" : "OPEN_SHTORKA";
  const target = next === "OPEN_SHTORKA";
  state.sunroofOpen = target;
  state.sunroofOptimistic = { open: target, until: Date.now() + SUNROOF_OPTIMISTIC_MS };
  try { localStorage.setItem(SUNROOF_STATE_KEY, target ? "open" : "closed"); }
  catch (error) { console.warn("Состояние шторки не сохранено", error); }
  return next;
}

function clearSunRequest() {
  clearTimeout(state.sunRequestTimer);
  state.sunRequestTimer = null;
  state.sunRequestPending = false;
  state.sunRequestId = null;
}

function pollSunroof() {
  if (!bridge.has("requestCarDataAsync") || state.sunRequestPending) return;
  const requestId = nextRequestId("sun");
  state.sunRequestPending = true;
  state.sunRequestId = requestId;
  if (!bridge.requestCarDataAsync(requestId, "sun")) {
    clearSunRequest();
    return;
  }
  state.sunRequestTimer = setTimeout(clearSunRequest, COMMAND_WATCHDOG_MS);
}

function applySunroof(response) {
  const raw = normalizeBoolean(response.value ?? response.sun);
  if (raw == null) return;
  const isOpen = raw === SUNROOF_RAW_OPEN;
  const optimistic = state.sunroofOptimistic;
  if (optimistic && Date.now() < optimistic.until && isOpen !== optimistic.open) return;
  if (optimistic) state.sunroofOptimistic = null;
  state.sunroofOpen = isOpen;
}

function normalizeLevel(value) {
  const level = Number(value);
  if (!Number.isFinite(level)) return null;
  const rounded = Math.round(level);
  if (rounded >= 1 && rounded <= 4) return rounded - 1;
  return rounded === 0 ? 0 : null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "on", "yes"].includes(normalized)) return true;
    if (["false", "0", "off", "no"].includes(normalized)) return false;
  }
  return null;
}

function applySeatLevels(raw) {
  const payload = parseJson(raw, raw) || {};
  const seats = payload.seats || payload;
  const front = seats.front || seats.frontSeats || {};
  const rear = seats.rear || seats.rearSeats || {};
  const frontLeft = front.frontLeft || {};
  const frontRight = front.frontRight || {};
  const rearLeft = rear.rearLeft || {};
  const rearRight = rear.rearRight || {};
  const levels = {
    heat_seat_l: normalizeLevel(frontLeft.heat),
    vent_seat_l: normalizeLevel(frontLeft.vent),
    heat_seat_r: normalizeLevel(frontRight.heat),
    vent_seat_r: normalizeLevel(frontRight.vent),
    heat_zad_seat_l: normalizeLevel(rearLeft.heat),
    vent_zad_seat_l: normalizeLevel(rearLeft.vent),
    heat_zad_seat_r: normalizeLevel(rearRight.heat),
    vent_zad_seat_r: normalizeLevel(rearRight.vent)
  };

  let changed = false;
  const now = Date.now();
  Object.values(state.pages).flat().forEach(slot => {
    if (slot?.type !== "level") return;
    const level = levels[slot.id];
    if (level == null) return;
    const optimistic = state.optimisticLevels[slot.id];
    if (optimistic && now < optimistic.until && level !== optimistic.level) return;
    if (optimistic && level === optimistic.level) delete state.optimisticLevels[slot.id];
    if (Number(slot.level) !== level) {
      slot.level = level;
      changed = true;
    }
  });
  if (changed) renderSlots();
}

function applyActionStates(raw) {
  const payload = parseJson(raw, raw) || {};
  const heat = payload.heat || payload;
  const now = Date.now();
  let changed = false;
  [...new Set(Object.values(ACTION_STATE_COMMANDS).map(item => item.key))].forEach(key => {
    const value = normalizeBoolean(heat[key]);
    if (value == null) return;
    const optimistic = state.optimisticActions[key];
    if (optimistic && now < optimistic.until && value !== optimistic.value) return;
    if (optimistic && value === optimistic.value) delete state.optimisticActions[key];
    if (state.actionStates[key] !== value) {
      state.actionStates[key] = value;
      changed = true;
    }
  });
  if (changed) renderSlots();
}

function applyCarState(payload) {
  const speed = payload?.vehicle?.speed ?? (typeof payload?.speed === "number" ? payload.speed : null);
  if (typeof speed === "number" && Number.isFinite(speed)) state.speedKmh = speed;
  applySeatLevels(payload);
  applyActionStates(payload);
}

