// Mini calendar: a tap on the date under the clock opens it (Monday first).
// A tap on a day selects it and lists its events. A tap on the month name opens the month picker with year arrows.
// Events (title, start and optional end time) are kept in this head unit's localStorage, like the other launcher settings.
// The tap on the clock itself still toggles night mode (nightmode.js).
const CAL_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CAL_EVENTS_KEY = "generic_launcher_events_v1";
let calView = "days";     // "days" or "months"
let calMonth = null;      // a Date on the 1st of the month shown
let calYear = null;       // year shown in the month picker
let calSelected = null;   // the selected Date, or null
let calForm = false;      // the "new event" form is open for the selected day
let calOpenedAt = 0;     // when the calendar was last opened (see the overlay click guard)

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Local date as YYYY-MM-DD, used as the event key.
function dateKey(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readEvents() {
  try {
    const list = JSON.parse(localStorage.getItem(CAL_EVENTS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function writeEvents(list) {
  try {
    localStorage.setItem(CAL_EVENTS_KEY, JSON.stringify(list));
  } catch (error) {
    // Storage can be unavailable in some WebViews: the event then lasts until the screen is closed.
  }
}

function eventsOn(date) {
  const key = dateKey(date);
  return readEvents()
    .filter(item => item.date === key)
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
}

function ensureCalendarSheet() {
  let sheet = document.getElementById("calendar-sheet");
  if (sheet) return sheet;
  sheet = document.createElement("div");
  sheet.id = "calendar-sheet";
  sheet.className = "forecast-sheet";
  sheet.hidden = true;
  sheet.innerHTML = '<div class="forecast-card calendar-card" role="dialog" aria-label="Календарь">' +
    '<div class="calendar-head"><button type="button" class="calendar-nav" data-step="-1" aria-label="Назад">‹</button>' +
    '<h3><button type="button" class="calendar-title" id="calendar-title" aria-label="Выбрать месяц"></button></h3>' +
    '<button type="button" class="calendar-nav" data-step="1" aria-label="Вперёд">›</button></div>' +
    '<div id="calendar-body"></div>' +
    '<div id="calendar-events"></div>' +
    '<button type="button" class="calendar-today" id="calendar-today">Сегодня</button></div>';
  sheet.addEventListener("click", event => {
    // The click that ends a long press can land on this overlay just as it opens: ignore it for a moment.
    if (event.target === sheet) {
      if (performance.now() - calOpenedAt > 500) sheet.hidden = true;
      return;
    }
    const target = event.target;
    if (target.closest("#calendar-today")) {
      const now = new Date();
      calMonth = startOfMonth(now);
      calSelected = now;
      calView = "days";
      calForm = false;
      renderCalendar();
      return;
    }
    if (target.closest("#calendar-title")) {
      calView = calView === "days" ? "months" : "days";
      calYear = calMonth.getFullYear();
      renderCalendar();
      return;
    }
    const nav = target.closest(".calendar-nav");
    if (nav) {
      const step = Number(nav.dataset.step);
      if (calView === "days") calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + step, 1);
      else calYear += step;
      calForm = false;
      renderCalendar();
      return;
    }
    const day = target.closest("[data-day]");
    if (day) {
      calSelected = new Date(calMonth.getFullYear(), calMonth.getMonth(), Number(day.dataset.day));
      calForm = false;
      renderCalendar();
      return;
    }
    const month = target.closest("[data-month]");
    if (month) {
      calMonth = new Date(calYear, Number(month.dataset.month), 1);
      calView = "days";
      renderCalendar();
      return;
    }
    if (target.closest("[data-add]")) {
      calForm = true;
      renderCalendar();
      return;
    }
    if (target.closest("[data-cancel]")) {
      calForm = false;
      renderCalendar();
      return;
    }
    if (target.closest("[data-save]")) {
      saveEventFromForm();
      return;
    }
    const del = target.closest("[data-del]");
    if (del) {
      writeEvents(readEvents().filter(item => item.id !== del.dataset.del));
      renderCalendar();
    }
  });
  document.body.appendChild(sheet);
  return sheet;
}

// Reads the form, checks it, and stores the event for the selected day.
function saveEventFromForm() {
  const title = (document.getElementById("event-title")?.value || "").trim();
  const start = document.getElementById("event-start")?.value || "";
  const end = document.getElementById("event-end")?.value || "";
  const note = document.getElementById("event-error");
  if (!calSelected) return;
  if (!title) { if (note) note.textContent = "Введите название"; return; }
  if (!start) { if (note) note.textContent = "Укажите время начала"; return; }
  if (end && end <= start) { if (note) note.textContent = "Конец должен быть позже начала"; return; }
  const item = {
    id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
    date: dateKey(calSelected),
    start,
    end: end || "",
    title: title.slice(0, 120)
  };
  writeEvents(readEvents().concat(item));
  calForm = false;
  renderCalendar();
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
}

function renderDays() {
  const today = new Date();
  const offset = (calMonth.getDay() + 6) % 7; // Monday is the first column
  const days = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<span class="calendar-cell"></span>');
  for (let day = 1; day <= days; day++) {
    const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), day);
    const classes = ["calendar-cell", "calendar-day"];
    if (sameDay(date, today)) classes.push("today");
    if (sameDay(date, calSelected)) classes.push("selected");
    cells.push(`<button type="button" class="${classes.join(" ")}" data-day="${day}">${day}${eventsOn(date).length ? '<i class="calendar-dot"></i>' : ""}</button>`);
  }
  return `<div class="calendar-week"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>` +
    `<div class="calendar-grid">${cells.join("")}</div>`;
}

function renderEventsBlock() {
  if (!calSelected) return "";
  const list = eventsOn(calSelected);
  const rows = list.map(item => {
    const time = item.end ? `${item.start}–${item.end}` : item.start;
    return `<div class="calendar-event"><span class="calendar-event-time">${escapeText(time)}</span>` +
      `<span class="calendar-event-title">${escapeText(item.title)}</span>` +
      `<button type="button" class="calendar-event-del" data-del="${escapeText(item.id)}" aria-label="Удалить">×</button></div>`;
  }).join("");
  const header = `<div class="calendar-selected">Выбрано: ${calSelected.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</div>`;
  const empty = list.length ? "" : '<p class="calendar-empty">Событий нет</p>';
  if (calForm) {
    return header + rows + empty +
      '<div class="calendar-form">' +
      '<input id="event-title" type="text" maxlength="120" placeholder="Название события" autocomplete="off">' +
      '<div class="calendar-times"><label>Начало <input id="event-start" type="time" value="10:00"></label>' +
      '<label>Конец <input id="event-end" type="time"></label></div>' +
      '<p class="calendar-error" id="event-error"></p>' +
      '<div class="calendar-form-buttons"><button type="button" data-cancel>Отмена</button><button type="button" data-save>Сохранить</button></div>' +
      '</div>';
  }
  return header + rows + empty + '<button type="button" class="calendar-add" data-add>+ Событие</button>';
}

function renderMonths() {
  const current = calMonth.getMonth();
  const shownYear = calYear;
  const items = CAL_MONTHS.map((name, index) => {
    const classes = ["calendar-month"];
    if (shownYear === calMonth.getFullYear() && index === current) classes.push("selected");
    return `<button type="button" class="${classes.join(" ")}" data-month="${index}">${name.slice(0, 3)}</button>`;
  });
  return `<div class="calendar-grid calendar-months">${items.join("")}</div>`;
}

function renderCalendar() {
  const title = document.getElementById("calendar-title");
  const body = document.getElementById("calendar-body");
  const events = document.getElementById("calendar-events");
  if (!title || !body || !events || !calMonth) return;
  if (calView === "days") {
    title.textContent = calMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    body.innerHTML = renderDays();
    events.innerHTML = renderEventsBlock();
  } else {
    title.textContent = String(calYear);
    body.innerHTML = renderMonths();
    events.innerHTML = "";
  }
}

function openCalendar() {
  calOpenedAt = performance.now();
  const sheet = ensureCalendarSheet(); // create the markup first, so the render has somewhere to write
  const now = new Date();
  calMonth = startOfMonth(now);
  calSelected = now;
  calView = "days";
  calForm = false;
  renderCalendar();
  sheet.hidden = false;
}

// In cover mode a tap on the clock opens the calendar instead of the night screen.
// It is caught on the document in the capture phase, so it runs before the clock's own listeners (nightmode.js),
// whose order differs between WebView versions. On the main screen a tap still toggles night mode.
function bindClockInCover() {
  document.addEventListener("click", event => {
    if (!document.body.classList.contains("player-expanded")) return;
    if (!event.target || !event.target.closest || !event.target.closest(".hero-clock")) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    openCalendar();
  }, true);
}

function bindCalendar() {
  const date = document.getElementById("date");
  if (date) {
    date.addEventListener("click", event => {
      // The date sits inside .hero-clock, where a tap toggles night mode: keep it from reaching there.
      event.stopPropagation();
      openCalendar();
    });
  }
  bindClockInCover();
}

bindCalendar();

// Reminders: while the launcher is on screen, a toast shows CAL_REMIND_MINUTES before an event today.
// Each event is reminded once per launcher session. Reminders need the launcher open (see the notes on system notifications).
const CAL_REMIND_MINUTES = 10;
const calRemindedKeys = new Set();

function checkReminders() {
  const now = new Date();
  for (const item of eventsOn(now)) {
    const [hours, minutes] = String(item.start || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) continue;
    const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    const minutesLeft = (startsAt - now) / 60000;
    const key = dateKey(now) + "|" + item.id;
    if (calRemindedKeys.has(key) || minutesLeft <= 0 || minutesLeft > CAL_REMIND_MINUTES) continue;
    calRemindedKeys.add(key);
    if (typeof showToast === "function") {
      showToast(`Через ${Math.ceil(minutesLeft)} мин: ${item.title} (${item.start})`, 6000);
    }
  }
}

setTimeout(checkReminders, 2000);
setInterval(checkReminders, 20000);

// TEMPORARY DIAGNOSTIC (remove after the cover-mode clock issue is found): shows what a tap on the clock sees.
(function calDebugClock() {
  const describe = el => el ? (el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "")) : "none";
  // Window capture runs before every other listener, so the state is read before any handler changes it.
  window.addEventListener("click", event => {
    const onClock = !!(event.target && event.target.closest && event.target.closest(".hero-clock"));
    if (!onClock) return;
    const state = { expanded: document.body.classList.contains("player-expanded"), night: document.body.classList.contains("night-mode"), target: describe(event.target) };
    setTimeout(() => {
      const after = document.body.classList.contains("night-mode");
      if (typeof showToast === "function") {
        showToast(`DBG обл:${state.expanded ? 1 : 0} ночь:${state.night ? 1 : 0}→${after ? 1 : 0} цель:${state.target}`, 9000);
      }
    }, 80);
  }, true);
})();
