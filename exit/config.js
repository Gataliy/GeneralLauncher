// Constants: storage keys, default slots, action names and labels, toggle groups.
const MAX_SLOTS = 9;
const STORAGE_KEY = "generic_launcher_slots_v1";
const CLIMATE_STORAGE_KEY = "generic_launcher_slots_climate_v1";
const WINDOWS_STORAGE_KEY = "generic_launcher_slots_windows_v1";
const SCREEN_STORAGE_KEY = "generic_launcher_slots_screen_v1";
const APPS_STORAGE_KEY = "generic_launcher_slots_apps_v1";
const COMBOS_STORAGE_KEY = "generic_launcher_slots_combos_v1";
const WEATHER_STORAGE_KEY = "generic_launcher_weather_v1";
const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const CAR_STATE_POLL_MS = 1_500;
const COMMAND_WATCHDOG_MS = 2_500;
const CAR_STATE_REQUEST_NAME = "widgets";

const FALLBACK_ACTIONS = [
  "GO_TO_PP", "RUN_BLACK", "OPEN_SHTORKA", "CLOSE_SHTORKA", "VIBOR_VODITEL",
  "GO_TO_GU", "RUN_START_APP_MENU", "GLOBAL_BACK", "GLOBAL_HOME", "TOGGLE_GU_PP",
  "RUN_FUN_CAR", "TOGGLE_GU_PP_CPP", "GO_CPP_TO_PP", "TOGGLE_CPP_PP",
  "MEDIA_PLAY", "MEDIA_PAUSE", "MEDIA_NEXT", "MEDIA_BLACK", "VIEW_ALL_MESSAGE",
  "b_fiksik_on", "b_fiksik_off",
  "heat_seat_l_0", "heat_seat_l_1", "heat_seat_l_2", "heat_seat_l_3",
  "vent_seat_l_0", "vent_seat_l_1", "vent_seat_l_2", "vent_seat_l_3",
  "heat_seat_r_0", "heat_seat_r_1", "heat_seat_r_2", "heat_seat_r_3",
  "vent_seat_r_0", "vent_seat_r_1", "vent_seat_r_2", "vent_seat_r_3",
  "heat_wheel_on", "heat_wheel_off", "heat_windshield_on", "heat_windshield_off",
  "heat_rearwindow_on", "heat_rearwindow_off",
  "heat_zad_seat_l_0", "heat_zad_seat_l_1", "heat_zad_seat_l_2", "heat_zad_seat_l_3",
  "heat_zad_seat_r_off", "heat_zad_seat_r_1", "heat_zad_seat_r_2", "heat_zad_seat_r_3",
  "voditel_seat_1", "voditel_seat_2", "voditel_seat_3", "SPLIT_RUN", "RUN_APP_MORE",
  "RUN_SPICH_FOCUS", "Recirculation_On", "Recirculation_Off", "Volume_Down", "Volume_Up",
  "Driver_Temp_Down", "Driver_Temp_Up", "Passenger_Temp_Down", "Passenger_Temp_Up",
  "vent_zad_seat_l_0", "vent_zad_seat_l_1", "vent_zad_seat_l_2", "vent_zad_seat_l_3",
  "vent_zad_seat_r_off", "vent_zad_seat_r_1", "vent_zad_seat_r_2", "vent_zad_seat_r_3",
  "RECENT_TASK_MANAGER", "MEDIA_PLAY_PAUSE", "TOGGLE_MOCK_GPS"
];

const LEVEL_GROUPS = [
  { id: "heat_seat_l", label: "Подогрев водителя", detail: "Переднее левое сиденье", icon: "♨", tone: "warm", off: "heat_seat_l_0" },
  { id: "vent_seat_l", label: "Вентиляция водителя", detail: "Переднее левое сиденье", icon: "❄", tone: "cool", off: "vent_seat_l_0" },
  { id: "heat_seat_r", label: "Подогрев пассажира", detail: "Переднее правое сиденье", icon: "♨", tone: "warm", off: "heat_seat_r_0" },
  { id: "vent_seat_r", label: "Вентиляция пассажира", detail: "Переднее правое сиденье", icon: "❄", tone: "cool", off: "vent_seat_r_0" },
  { id: "heat_zad_seat_l", label: "Подогрев сзади слева", detail: "Заднее левое сиденье", icon: "♨", tone: "warm", off: "heat_zad_seat_l_0" },
  { id: "heat_zad_seat_r", label: "Подогрев сзади справа", detail: "Заднее правое сиденье", icon: "♨", tone: "warm", off: "heat_zad_seat_r_off" },
  { id: "vent_zad_seat_l", label: "Вентиляция сзади слева", detail: "Заднее левое сиденье", icon: "❄", tone: "cool", off: "vent_zad_seat_l_0" },
  { id: "vent_zad_seat_r", label: "Вентиляция сзади справа", detail: "Заднее правое сиденье", icon: "❄", tone: "cool", off: "vent_zad_seat_r_off" }
];

const DEFAULT_SLOTS = [
  { type: "action", command: "SPLIT_RUN", label: "Разделение экрана" },
  { type: "action", command: "TOGGLE_TRUNK", label: "Багажник" },
  { type: "action", command: "SUNROOF_TOGGLE", label: "Шторка крыши" },
  { type: "action", command: "TOGGLE_DRIVER_PROFILE", label: "Профиль водителя" },
  { type: "action", command: "TOGGLE_SCREEN_TARGET", label: "Показ: панель / ГУ" },
  { type: "empty" },
  { type: "empty" }
];

const ACTION_STATE_COMMANDS = {
  heat_wheel_on: { key: "rulHeat", value: true },
  heat_wheel_off: { key: "rulHeat", value: false },
  heat_windshield_on: { key: "lobHeat", value: true },
  heat_windshield_off: { key: "lobHeat", value: false },
  heat_rearwindow_on: { key: "zadHeat", value: true },
  heat_rearwindow_off: { key: "zadHeat", value: false }
};

const ACTION_LABELS = {
  CAR_OPEN_SUNROOF: "Открыть люк",
  CAR_CLOSE_SUNROOF: "Закрыть люк",
  CAR_ROOF_TOGGLE: "Люк",
  CAR_OPEN_CENTRAL_LOCK: "Открыть центральный замок",
  CAR_CLOSE_CENTRAL_LOCK: "Закрыть центральный замок",
  heat_wheel_on: "Включить подогрев руля",
  heat_wheel_off: "Выключить подогрев руля",
  heat_windshield_on: "Включить обогрев лобового стекла",
  heat_windshield_off: "Выключить обогрев лобового стекла",
  heat_rearwindow_on: "Включить обогрев заднего стекла",
  heat_rearwindow_off: "Выключить обогрев заднего стекла",
  Recirculation_On: "Включить рециркуляцию",
  Recirculation_Off: "Выключить рециркуляцию",
  OPEN_SHTORKA: "Открыть шторку",
  CLOSE_SHTORKA: "Закрыть шторку",
  RUN_FUN_CAR: "Функции автомобиля",
  RUN_START_APP_MENU: "Все приложения",
  GLOBAL_HOME: "Домой",
  GLOBAL_BACK: "Назад",
  GO_TO_GU: "Показать на головном устройстве",
  GO_TO_PP: "Показать на приборной панели",
  VIEW_ALL_MESSAGE: "Сообщения с телефона",
  SPLIT_RUN: "Разделение экрана",
  RUN_APP_MORE: "Дополнительные приложения",
  RUN_SPICH_FOCUS: "Голосовой фокус",
  OPEN_FUEL_TANK: "Открыть лючок зарядки",
  OPEN_GLOVE_BOX: "Открыть бардачок",
  OPEN_CENTRAL_LOCK: "Открыть центральный замок",
  CLOSE_CENTRAL_LOCK: "Закрыть центральный замок",
  "SUNROOF_TOGGLE": "Шторка крыши",
  TOGGLE_HEAT_WHEEL: "Подогрев руля",
  TOGGLE_HEAT_WINDSHIELD: "Обогрев лобового стекла",
  TOGGLE_HEAT_REARWINDOW: "Обогрев заднего стекла",
  TOGGLE_RECIRCULATION: "Рециркуляция",
  TOGGLE_E_CENTRAL_LOCK: "Центральный замок",
  TOGGLE_TRUNK: "Багажник",
  TOGGLE_CLIMATE_POWER: "Климат",
  TOGGLE_CLIMATE_AC: "A/C",
  TOGGLE_CLIMATE_AUTO: "AUTO климат",
  TOGGLE_CLIMATE_SYNC: "SYNC климат",
  TOGGLE_CLIMATE_FRONT_DEFROST: "MAX-обдув лобового",
  TOGGLE_FIKSIK: "В fiksik",
  b_fiksik_on: "В fiksik: вкл",
  b_fiksik_off: "В fiksik: выкл",
  TOGGLE_WINDOWS_AJAR: "Приоткрыть окна",
  TOGGLE_WINDOWS_OPEN: "Открыть окна",
  "profile:open_trunk": "Открыть багажник",
  "profile:close_trunk": "Закрыть багажник",
  "profile:open_windows_10": "Приоткрыть окна",
  "profile:open_windows_full": "Открыть окна",
  "profile:close_windows": "Закрыть окна",
  TOGGLE_WINDOW_FRONT_LEFT_AJAR: "Приоткрыть окно водителя",
  TOGGLE_WINDOW_FRONT_LEFT_OPEN: "Открыть окно водителя",
  "profile:open_window_front_left_10": "Приоткрыть окно водителя",
  "profile:open_window_front_left_full": "Открыть окно водителя",
  "profile:close_window_front_left": "Закрыть окно водителя",
  TOGGLE_WINDOW_FRONT_RIGHT_AJAR: "Приоткрыть окно пассажира",
  TOGGLE_WINDOW_FRONT_RIGHT_OPEN: "Открыть окно пассажира",
  "profile:open_window_front_right_10": "Приоткрыть окно пассажира",
  "profile:open_window_front_right_full": "Открыть окно пассажира",
  "profile:close_window_front_right": "Закрыть окно пассажира",
  TOGGLE_WINDOW_REAR_LEFT_AJAR: "Приоткрыть окно сзади слева",
  TOGGLE_WINDOW_REAR_LEFT_OPEN: "Открыть окно сзади слева",
  "profile:open_window_rear_left_10": "Приоткрыть окно сзади слева",
  "profile:open_window_rear_left_full": "Открыть окно сзади слева",
  "profile:close_window_rear_left": "Закрыть окно сзади слева",
  TOGGLE_WINDOW_REAR_RIGHT_AJAR: "Приоткрыть окно сзади справа",
  TOGGLE_WINDOW_REAR_RIGHT_OPEN: "Открыть окно сзади справа",
  "profile:open_window_rear_right_10": "Приоткрыть окно сзади справа",
  "profile:open_window_rear_right_full": "Открыть окно сзади справа",
  "profile:close_window_rear_right": "Закрыть окно сзади справа",
  TOGGLE_SCREEN_TARGET: "Показ: панель / ГУ",
  TOGGLE_DRIVER_PROFILE: "Профиль водителя",
  VIBOR_VODITEL: "Выбор водителя",
  Driver_Temp_Up: "Температура водителя +",
  Driver_Temp_Down: "Температура водителя −",
  Passenger_Temp_Up: "Температура пассажира +",
  Passenger_Temp_Down: "Температура пассажира −",
  TOGGLE_MEDIA_PLAY: "Воспроизведение",
  MEDIA_PLAY: "Воспроизвести",
  MEDIA_PAUSE: "Пауза",
  voditel_seat_1: "Профиль водителя 1",
  voditel_seat_2: "Профиль водителя 2",
  voditel_seat_3: "Профиль водителя 3"
};

// Window buttons: a short tap opens the window a little (ajar) or closes it, a hold opens it fully or closes it.
const GESTURE_WINDOWS = {
  GESTURE_WINDOW_FRONT_LEFT: { label: "Окно водителя", ajar: "profile:open_window_front_left_10", full: "profile:open_window_front_left_full", close: "profile:close_window_front_left" },
  GESTURE_WINDOW_FRONT_RIGHT: { label: "Окно пассажира", ajar: "profile:open_window_front_right_10", full: "profile:open_window_front_right_full", close: "profile:close_window_front_right" },
  GESTURE_WINDOW_REAR_LEFT: { label: "Окно сзади слева", ajar: "profile:open_window_rear_left_10", full: "profile:open_window_rear_left_full", close: "profile:close_window_rear_left" },
  GESTURE_WINDOW_REAR_RIGHT: { label: "Окно сзади справа", ajar: "profile:open_window_rear_right_10", full: "profile:open_window_rear_right_full", close: "profile:close_window_rear_right" }
};
const SUNROOF_TOGGLE = "SUNROOF_TOGGLE";
const SUNROOF_MERGED = ["OPEN_SHTORKA", "CLOSE_SHTORKA"];
// Roof (люк) goes through the car command channel (JSON), not runEnum.
const CAR_COMMANDS = {
  CAR_OPEN_SUNROOF: JSON.stringify({ command: "open_sunroof" }),
  CAR_CLOSE_SUNROOF: JSON.stringify({ command: "close_sunroof" }),
  // Central lock: the JCarTools car command names used by the other launchers; both key names are sent.
  CAR_OPEN_CENTRAL_LOCK: JSON.stringify({ command: "open_central_lock", cmd: "open_central_lock" }),
  CAR_CLOSE_CENTRAL_LOCK: JSON.stringify({ command: "close_central_lock", cmd: "close_central_lock" }),
};
// One central lock button: alternates lock / unlock, like the roof button.
const CENTRAL_TOGGLE = "CAR_CENTRAL_TOGGLE";
const CENTRAL_STATE_KEY = "generic_launcher_central_lock_v1";
function nextCentralCommand() {
  let locked = false;
  try { locked = localStorage.getItem(CENTRAL_STATE_KEY) === "locked"; } catch (error) { console.warn("Замок: состояние не прочитано", error); }
  const next = locked ? "CAR_OPEN_CENTRAL_LOCK" : "CAR_CLOSE_CENTRAL_LOCK";
  try { localStorage.setItem(CENTRAL_STATE_KEY, next === "CAR_CLOSE_CENTRAL_LOCK" ? "locked" : "unlocked"); }
  catch (error) { console.warn("Замок: состояние не сохранено", error); }
  return next;
}
// Per-window commands are sent as JSON car commands (documented open_window_<pos>_10/_full, close_window_<pos>),
// not as runEnum names, which the head unit does not recognise for single windows.
function carCommandJson(command) {
  if (CAR_COMMANDS[command]) return CAR_COMMANDS[command];
  const match = /^profile:((open|close)_window_(front_left|front_right|rear_left|rear_right)(_10|_full)?)$/.exec(command);
  return match ? JSON.stringify({ command: match[1] }) : null;
}
// One "Люк" button: alternates open / close, remembering the last press (roof state is not read back yet).
const ROOF_TOGGLE = "CAR_ROOF_TOGGLE";
const ROOF_STATE_KEY = "generic_launcher_roof_v1";
function nextRoofCommand() {
  let open = false;
  try { open = localStorage.getItem(ROOF_STATE_KEY) === "open"; } catch (error) { console.warn("Люк: состояние не прочитано", error); }
  const next = open ? "CAR_CLOSE_SUNROOF" : "CAR_OPEN_SUNROOF";
  try { localStorage.setItem(ROOF_STATE_KEY, next === "CAR_OPEN_SUNROOF" ? "open" : "closed"); }
  catch (error) { console.warn("Люк: состояние не сохранено", error); }
  return next;
}
const HEAT_TOGGLES = {
  TOGGLE_HEAT_WHEEL: { key: "rulHeat", on: "heat_wheel_on", off: "heat_wheel_off" },
  TOGGLE_HEAT_WINDSHIELD: { key: "lobHeat", on: "heat_windshield_on", off: "heat_windshield_off" },
  TOGGLE_HEAT_REARWINDOW: { key: "zadHeat", on: "heat_rearwindow_on", off: "heat_rearwindow_off" }
};
const HEAT_MERGED = Object.values(HEAT_TOGGLES).flatMap(toggle => [toggle.on, toggle.off]);
// No readable state for these in getCarData: the toggle alternates the last command it sent.
const MEMORY_TOGGLES = {
  TOGGLE_RECIRCULATION: { first: "Recirculation_On", second: "Recirculation_Off" },
  TOGGLE_TRUNK: { first: "profile:open_trunk", second: "profile:close_trunk" },
  TOGGLE_SCREEN_TARGET: { first: "GO_TO_PP", second: "GO_TO_GU" },
  TOGGLE_FIKSIK: { first: "b_fiksik_on", second: "b_fiksik_off" },
  // Climate on/off pairs: one button each, alternating on and off.
  TOGGLE_CLIMATE_POWER: { first: "profile:climate_power_on", second: "profile:climate_power_off" },
  TOGGLE_CLIMATE_AC: { first: "profile:climate_ac_on", second: "profile:climate_ac_off" },
  TOGGLE_CLIMATE_AUTO: { first: "profile:climate_auto_on", second: "profile:climate_auto_off" },
  TOGGLE_CLIMATE_SYNC: { first: "profile:climate_sync_on", second: "profile:climate_sync_off" },
  TOGGLE_CLIMATE_FRONT_DEFROST: { first: "profile:climate_front_defrost_on", second: "profile:climate_front_defrost_off" },
  // Windows: each button alternates its open position with "close", so closing is one press from any state.
  TOGGLE_WINDOWS_AJAR: { first: "profile:open_windows_10", second: "profile:close_windows" },
  TOGGLE_WINDOWS_OPEN: { first: "profile:open_windows_full", second: "profile:close_windows" },
  TOGGLE_WINDOW_FRONT_LEFT_AJAR: { first: "profile:open_window_front_left_10", second: "profile:close_window_front_left" },
  TOGGLE_WINDOW_FRONT_LEFT_OPEN: { first: "profile:open_window_front_left_full", second: "profile:close_window_front_left" },
  TOGGLE_WINDOW_FRONT_RIGHT_AJAR: { first: "profile:open_window_front_right_10", second: "profile:close_window_front_right" },
  TOGGLE_WINDOW_FRONT_RIGHT_OPEN: { first: "profile:open_window_front_right_full", second: "profile:close_window_front_right" },
  TOGGLE_WINDOW_REAR_LEFT_AJAR: { first: "profile:open_window_rear_left_10", second: "profile:close_window_rear_left" },
  TOGGLE_WINDOW_REAR_LEFT_OPEN: { first: "profile:open_window_rear_left_full", second: "profile:close_window_rear_left" },
  TOGGLE_WINDOW_REAR_RIGHT_AJAR: { first: "profile:open_window_rear_right_10", second: "profile:close_window_rear_right" },
  TOGGLE_WINDOW_REAR_RIGHT_OPEN: { first: "profile:open_window_rear_right_full", second: "profile:close_window_rear_right" }
};
const MEMORY_MERGED = Object.values(MEMORY_TOGGLES).flatMap(toggle => [toggle.first, toggle.second]);
// Commands that belong to the Приложения page: the system app menu and the extra apps.
const APP_ACTIONS = ["RUN_START_APP_MENU", "RUN_APP_MORE"];
// Several commands that cycle in order; the position is remembered between presses.
const CYCLE_TOGGLES = {
  TOGGLE_DRIVER_PROFILE: { commands: ["voditel_seat_1", "voditel_seat_2", "voditel_seat_3"] }
};
const CYCLE_MERGED = Object.values(CYCLE_TOGGLES).flatMap(toggle => toggle.commands);

function nextCycleCommand(id) {
  const { commands } = CYCLE_TOGGLES[id];
  const key = `generic_launcher_cycle_${id}_v1`;
  let last = -1;
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) last = Number(raw);
  } catch (error) { console.warn("Состояние переключателя не прочитано", error); }
  const index = Number.isInteger(last) && last >= 0 && last < commands.length ? (last + 1) % commands.length : 0;
  try { localStorage.setItem(key, String(index)); }
  catch (error) { console.warn("Состояние переключателя не сохранено", error); }
  return commands[index];
}

// Every window command goes through here, so all window buttons agree on whether the car's windows are open.
const WINDOWS_LAST_KEY = "generic_launcher_windows_last_v1";
const WINDOW_GESTURE_IDS = Object.keys(GESTURE_WINDOWS);

function readWindowsLast() {
  try { return localStorage.getItem(WINDOWS_LAST_KEY) || ""; }
  catch (error) { console.warn("Состояние окон не прочитано", error); return ""; }
}

function noteWindowCommand(command) {
  if (!command.startsWith("profile:open_window") && !command.startsWith("profile:close_window")) return;
  try { localStorage.setItem(WINDOWS_LAST_KEY, command); }
  catch (error) { console.warn("Состояние окон не сохранено", error); }
  // Whole-car commands also set the per-window buttons, so they stay in step.
  const next = command === "profile:close_windows" ? "closed" : command === "profile:open_windows_full" ? "open" : command === "profile:open_windows_10" ? "ajar" : null;
  if (!next) return;
  WINDOW_GESTURE_IDS.forEach(id => {
    try { localStorage.setItem(`generic_launcher_gesture_${id}_v1`, next); }
    catch (error) { console.warn("Состояние окна не сохранено", error); }
  });
}

function nextMemoryCommand(id) {
  const toggle = MEMORY_TOGGLES[id];
  if (toggle.first.startsWith("profile:open_windows")) {
    const last = readWindowsLast();
    const closed = !last || last === "profile:close_windows" || last.startsWith("profile:close_window");
    const next = closed ? toggle.first : toggle.second;
    noteWindowCommand(next);
    return next;
  }
  const key = `generic_launcher_toggle_${id}_v1`;
  let last = null;
  try { last = localStorage.getItem(key); }
  catch (error) { console.warn("Состояние переключателя не прочитано", error); }
  const next = last === toggle.first ? toggle.second : toggle.first;
  try { localStorage.setItem(key, next); }
  catch (error) { console.warn("Состояние переключателя не сохранено", error); }
  return next;
}
