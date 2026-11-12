// Cabin temperatures for driver and passenger, and their +/- commands.
function clearTempRequest() {
  clearTimeout(state.tempRequestTimer);
  state.tempRequestTimer = null;
  state.tempRequestPending = false;
  state.tempRequestId = null;
}

function pollCabinTemps() {
  if (!bridge.has("requestCarDataAsync") || state.tempRequestPending || state.commandInFlight) return;
  const requestId = nextRequestId("temp");
  state.tempRequestPending = true;
  state.tempRequestId = requestId;
  if (!bridge.requestCarDataAsync(requestId, "cabinTemp")) {
    clearTempRequest();
    return;
  }
  state.tempRequestTimer = setTimeout(clearTempRequest, COMMAND_WATCHDOG_MS);
}

// Swipe steps are sent at once (one Up/Down press = 1 degree, as in the Strelets dashboard) and the number
// on screen moves with them. The car value takes over again 2.5 s after the last step.
const TEMP_LIMITS = { min: 16, max: 30 };
const tempSwipeAt = { driver: 0, passenger: 0 };
// A burst of taps is one command: the head unit opens its own climate dialog for every climate command.
// The number on screen moves at once; the final value goes out once, 2 s after the last tap (at most 4 s).
const TEMP_BATCH_MS = 2000;
const TEMP_BATCH_MAX_MS = 4000;
const tempBatch = {};
function stepTemp(zone, dir) {
  const now = Date.now();
  const base = state.cabinTemps[zone] == null ? 22 : state.cabinTemps[zone];
  const next = Math.max(TEMP_LIMITS.min, Math.min(TEMP_LIMITS.max, base + dir));
  state.cabinTemps[zone] = next;
  tempSwipeAt[zone] = now;
  let batch = tempBatch[zone];
  if (!batch) batch = tempBatch[zone] = { startedAt: now, value: next, timer: null };
  batch.value = next;
  clearTimeout(batch.timer);
  const wait = Math.min(TEMP_BATCH_MS, batch.startedAt + TEMP_BATCH_MAX_MS - now);
  batch.timer = setTimeout(() => flushTemp(zone), Math.max(0, wait));
  renderSlots();
}
function flushTemp(zone) {
  const batch = tempBatch[zone];
  if (!batch) return;
  delete tempBatch[zone];
  tempSwipeAt[zone] = Date.now();
  if (!bridge.has("requestCarCommandAsync")) return;
  bridge.requestCarCommandAsync(
    "tset_" + zone + "_" + Date.now(),
    JSON.stringify({ cmd: "climate_set_temperature", zone: zone === "driver" ? 1 : 2, value: batch.value })
  );
}

// Temperatures from climate_get_state (driverTemperature / passengerTemperature), polled on their own.
// The answer comes back as a fan_get_ request and is forwarded from applyFanResponse.
window.applyClimateTempsFromState = function applyClimateTempsFromState(response) {
  if (!response || response.success === false) return;
  const now = Date.now();
  let changed = false;
  [["driver", "driverTemperature"], ["passenger", "passengerTemperature"]].forEach(([zone, key]) => {
    if (now - tempSwipeAt[zone] < 2500) return;
    const value = Number(response[key]);
    if (!Number.isFinite(value)) return;
    if (state.cabinTemps[zone] !== value) { state.cabinTemps[zone] = value; changed = true; }
  });
  if (changed) renderSlots();
};
function readClimateTemps() {
  if (document.hidden || !bridge.has("requestCarCommandAsync")) return;
  bridge.requestCarCommandAsync("fan_get_temp_" + Date.now(), JSON.stringify({ cmd: "climate_get_state" }));
}
setInterval(readClimateTemps, 2000);
setTimeout(readClimateTemps, 1200);

// Response format is not confirmed on the car: read numbers under driverTemp / passengerTemp, otherwise show "—".
function applyCabinTemps(response) {
  const payload = parseJson(response.value, response.value) || response;
  let changed = false;
  Object.entries(TEMP_ZONES).forEach(([zone, info]) => {
    const raw = payload?.[info.key] ?? response[info.key];
    const value = raw == null || raw === "" ? NaN : Number(raw);
    const next = Number.isFinite(value) ? value : null;
    if (state.cabinTemps[zone] !== next) {
      state.cabinTemps[zone] = next;
      changed = true;
    }
  });
  if (changed) renderSlots();
}

const TEMP_ZONES = {
  driver: { label: "Температура водителя", short: "Водитель", up: "Driver_Temp_Up", down: "Driver_Temp_Down", key: "driverTemp" },
  passenger: { label: "Температура пассажира", short: "Пассажир", up: "Passenger_Temp_Up", down: "Passenger_Temp_Down", key: "passengerTemp" }
};
// The raw +/- commands are hidden from the picker: one temperature slot per zone has both halves.
const TEMP_MERGED = Object.values(TEMP_ZONES).flatMap(zone => [zone.up, zone.down]);
const TEMP_POLL_MS = 5_000;


const CLIMATE_ACTIONS = new Set([
  ...Object.keys(HEAT_TOGGLES), ...HEAT_MERGED, "TOGGLE_RECIRCULATION", "Recirculation_On", "Recirculation_Off",
  ...TEMP_MERGED,
  ...CYCLE_MERGED, "VIBOR_VODITEL"
]);

const CLIMATE_DEFAULT_SLOTS = [
  { type: "level", id: "heat_seat_l", level: 0 },
  { type: "level", id: "vent_seat_l", level: 0 },
  { type: "level", id: "heat_seat_r", level: 0 },
  { type: "level", id: "vent_seat_r", level: 0 },
  { type: "temp", zone: "driver" },
  { type: "temp", zone: "passenger" },
  { type: "action", command: "TOGGLE_HEAT_WHEEL", label: "Подогрев руля" },
  { type: "action", command: "TOGGLE_HEAT_WINDSHIELD", label: "Обогрев лобового стекла" },
  { type: "action", command: "TOGGLE_HEAT_REARWINDOW", label: "Обогрев заднего стекла" },
  { type: "action", command: "TOGGLE_RECIRCULATION", label: "Рециркуляция" }
];


// Temperature by swiping the screen edges: the left edge changes the driver's temperature, the right edge the passenger's.
// Every 40 px of vertical movement sends one step: up is warmer, down is cooler. Off while editing the home screen.
(function bindTempSwipe() {
  const EDGE = 26;
  const STEP_PX = 40;
  const MAX_STEPS = 6;
  let swipe = null;
  const SKIP = ".hero-clock, .hw-card, #weather-widget, .player-widget, .action-slot, button, .picker-sheet, .diag-sheet, .toast";

  // Small panel at the screen edge while a swipe is running: zone, temperature, level bar.
  const pill = document.createElement("div");
  pill.className = "temp-pill";
  pill.hidden = true;
  pill.innerHTML = '<span class="tp-who"></span><span class="tp-arr">▲</span><span class="tp-val">—</span><div class="tp-bar"><i></i></div><span class="tp-arr">▼</span>';
  document.body.appendChild(pill);
  let hideTimer = null;
  const TEMP_MIN = 16;
  const TEMP_MAX = 30;
  function updatePill(zone) {
    const info = TEMP_ZONES[zone];
    const value = state.cabinTemps[zone];
    pill.dataset.zone = zone;
    pill.classList.toggle("right", zone === "passenger");
    pill.classList.toggle("left", zone !== "passenger");
    pill.querySelector(".tp-who").textContent = info.short;
    pill.querySelector(".tp-val").textContent = value == null ? "—" : value.toFixed(1) + "°";
    const fill = value == null ? 0 : Math.max(0, Math.min(100, ((value - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100));
    pill.querySelector(".tp-bar i").style.height = fill + "%";
  }
  function showPill(zone) {
    clearTimeout(hideTimer);
    updatePill(zone);
    pill.hidden = false;
  }
  function hidePill() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { pill.hidden = true; }, 1500);
  }
  // The car reports the new value a moment after the command, so the open panel refreshes itself.
  setInterval(() => { if (!pill.hidden && pill.dataset.zone) updatePill(pill.dataset.zone); }, 400);

  document.addEventListener("pointerdown", event => {
    swipe = null;
    if (event.button !== 0) return;
    if (document.body.classList.contains("hw-edit") || document.body.classList.contains("player-expanded")) return;
    if (document.body.classList.contains("slots-order")) return;
    if (event.target.closest(SKIP)) return;
    const width = window.innerWidth;
    let zone = null;
    if (event.clientX <= EDGE) zone = "driver";
    else if (event.clientX >= width - EDGE) zone = "passenger";
    if (!zone) return;
    swipe = { zone, y: event.clientY, id: event.pointerId, steps: 0, moved: false };
  }, true);

  document.addEventListener("pointermove", event => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const target = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, Math.trunc((swipe.y - event.clientY) / STEP_PX)));
    const info = TEMP_ZONES[swipe.zone];
    while (swipe.steps < target) { swipe.steps += 1; stepTemp(swipe.zone, 1); }
    while (swipe.steps > target) { swipe.steps -= 1; stepTemp(swipe.zone, -1); }
    if (swipe.steps !== 0) swipe.moved = true;
    if (swipe.moved) showPill(swipe.zone);
  });

  const endSwipe = () => {
    if (swipe && swipe.moved) hidePill();
    swipe = null;
  };
  document.addEventListener("pointerup", endSwipe);
  document.addEventListener("pointercancel", endSwipe);
})();
