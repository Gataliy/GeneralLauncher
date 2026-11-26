// Mini calendar: a tap on the date under the clock opens it (Monday first).
// A tap on a day selects it and lists its events. A tap on the month name opens the month picker with year arrows.
// Events (title, start and optional end time) are kept in this head unit's localStorage, like the other launcher settings.
// Google events (google-hub.js, Apps Script) are shown here too, read-only: they have no delete button and are not saved here.
// The tap on the clock itself still toggles night mode (nightmode.js).
const CAL_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CAL_EVENTS_KEY = "generic_launcher_events_v1";
const GOOGLE_EVENTS_KEY = "generic_launcher_google_events_v1"; // written by google-hub.js
let googleCache = { raw: null, list: [] };                    // parsed Google events, redone only when the stored text changes
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

// Hours and minutes of a date as HH:MM, in the head unit's time.
function timeOfDay(date) {
  return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
}

// The Russian form the hub shows: "DD.MM.YYYY HH:MM", or "DD.MM HH:MM" for this year; the time part is optional.
function ruDateTime(text) {
  const m = String(text).match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?:[ ,]+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  return {
    year: m[3] ? Number(m[3]) : new Date().getFullYear(),
    month: Number(m[2]),
    day: Number(m[1]),
    hour: m[4] === undefined ? null : Number(m[4]),
    minute: m[5] === undefined ? 0 : Number(m[5])
  };
}

// An ISO date-time, or the Russian form above; null when neither reads as a moment.
function parseWhen(text) {
  const ru = ruDateTime(text);
  const at = ru ? new Date(ru.year, ru.month - 1, ru.day, ru.hour || 0, ru.minute) : new Date(String(text));
  return Number.isNaN(at.getTime()) ? null : at;
}

// The day as "DD.MM.YYYY", from "YYYY-MM-DD" (or an ISO date-time) or the Russian "DD.MM[.YYYY]" form; null otherwise.
function dayText(text) {
  const iso = String(text).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + "." + iso[2] + "." + iso[1];
  const ru = ruDateTime(text);
  if (ru && ru.hour === null) return String(ru.day).padStart(2, "0") + "." + String(ru.month).padStart(2, "0") + "." + ru.year;
  return null;
}

// Apps Script gives { title, start, end, location, date }. The start (or time) is an ISO date-time, a Russian date-time,
// a plain YYYY-MM-DD for an all-day event, or only a time ("15:00", "15:00–16:00"): its day then comes from the date field.
// "26.11.2026 15:00–16:00" gives the end too. The place is added to the title as "title · place".
// An all-day event has an empty start, so it is listed first and shown as "весь день". A time with no day is skipped.
function normalizeGoogleEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  let startText = String(raw.start || raw.time || "").trim();
  let endText = raw.end ? String(raw.end).trim() : "";
  if (!startText) return null;
  const place = String(raw.location || "").trim();
  const title = [String(raw.title || raw.summary || "(Без названия)").trim(), place].filter(Boolean).join(" · ").slice(0, 120);
  const onlyTime = startText.match(/^(\d{1,2}:\d{2})(?:\s*[–-]\s*(\d{1,2}:\d{2}))?$/);
  if (onlyTime) {
    const day = dayText(String(raw.date || raw.day || ""));
    if (!day) return null;
    startText = day + " " + onlyTime[1];
    if (onlyTime[2]) endText = day + " " + onlyTime[2];
  }
  const range = startText.match(/^(.*\d)\s+(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/);
  if (range) {
    startText = range[1] + " " + range[2];
    endText = range[1] + " " + range[3];
  }
  const ru = ruDateTime(startText);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startText) || (ru && ru.hour === null)) {
    const date = ru
      ? ru.year + "-" + String(ru.month).padStart(2, "0") + "-" + String(ru.day).padStart(2, "0")
      : startText;
    return { id: "g|" + date + "||" + title, date, start: "", end: "", title, source: "google" };
  }
  const startAt = parseWhen(startText);
  if (!startAt) return null;
  const date = dateKey(startAt);
  const start = timeOfDay(startAt);
  const endAt = endText ? parseWhen(endText) : null;
  const end = endAt && dateKey(endAt) === date ? timeOfDay(endAt) : "";
  return { id: "g|" + date + "|" + start + "|" + title, date, start, end, title, source: "google" };
}

function readGoogleEvents() {
  let raw = "";
  try {
    raw = localStorage.getItem(GOOGLE_EVENTS_KEY) || "";
  } catch (error) {
    return [];
  }
  if (raw === googleCache.raw) return googleCache.list;
  let list = [];
  try {
    const stored = raw ? JSON.parse(raw) : null;
    if (stored && Array.isArray(stored.events)) list = stored.events.map(normalizeGoogleEvent).filter(Boolean);
  } catch (error) {
    list = [];
  }
  googleCache = { raw, list };
  return list;
}

function eventsOn(date) {
  const key = dateKey(date);
  return readEvents().concat(readGoogleEvents())
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
    const fromGoogle = item.source === "google";
    const time = !item.start ? "весь день" : item.end ? `${item.start}–${item.end}` : item.start;
    // Google events are read-only here: no delete button, and a small "Google" mark instead.
    const mark = fromGoogle ? '<span class="calendar-event-source">Google</span>' : "";
    const del = fromGoogle ? "" : `<button type="button" class="calendar-event-del" data-del="${escapeText(item.id)}" aria-label="Удалить">×</button>`;
    return `<div class="calendar-event${fromGoogle ? " google" : ""}"><span class="calendar-event-time">${escapeText(time)}</span>` +
      `<span class="calendar-event-title">${escapeText(item.title)}</span>${mark}${del}</div>`;
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
  renderHomeCalendar();
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
  // Google events are refreshed in the background when the calendar opens (at most once every 15 minutes).
  if (typeof window.googleHubSyncCalendar === "function") window.googleHubSyncCalendar(false);
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

// Home screen card under the clock and weather: "Календарь · события" with today's and tomorrow's events.
// It sits in the row under those cards, at the same height as the visualizer (viz.js), and a tap opens the calendar.
// Created here, not in index.html, so it also appears on a head unit that gets the launcher only from an update.
// Compact on purpose: three lines must fit the strip between the cards and the tab row (60 px at the smallest).
const HOME_CAL_STYLE = ".home-cal{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:6px 20px 6px 36px;line-height:1.1;color:var(--text);text-align:left}" +
  ".home-cal-title{font-size:12px;color:#8fa0b8;white-space:nowrap}" +
  ".home-cal-line{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}" +
  ".home-cal-line span{color:var(--muted)}" +
  ".home-cal-line.tomorrow{font-size:13px;color:#6fc3fa}" +
  ".home-cal-line.tomorrow span{color:#6fc3fa}";

function ensureHomeCalendar() {
  let card = document.getElementById("home-calendar");
  if (card) return card;
  if (!document.getElementById("home-calendar-style")) {
    const style = document.createElement("style");
    style.id = "home-calendar-style";
    style.textContent = HOME_CAL_STYLE;
    document.head.appendChild(style);
  }
  card = document.createElement("div");
  card.id = "home-calendar";
  card.className = "viz home-cal";
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", "Открыть календарь");
  card.hidden = true;
  card.innerHTML = '<div class="home-cal-title">Календарь · события</div>' +
    '<div class="home-cal-line" id="home-cal-today"></div>' +
    '<div class="home-cal-line tomorrow" id="home-cal-tomorrow"></div>';
  card.addEventListener("click", openCalendar);
  document.body.appendChild(card);
  return card;
}

// "18:30 Встреча · 20:00 Ужин · ещё 1", or "событий нет".
function dayEventsText(date) {
  const list = eventsOn(date);
  if (!list.length) return "событий нет";
  const shown = list.slice(0, 2).map(item => `${item.start ? escapeText(item.start) : "весь день"} ${escapeText(item.title)}`).join(" · ");
  return list.length > 2 ? `${shown} · ещё ${list.length - 2}` : shown;
}

function renderHomeCalendar() {
  const card = ensureHomeCalendar();
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const todayLine = document.getElementById("home-cal-today");
  const tomorrowLine = document.getElementById("home-cal-tomorrow");
  if (todayLine) todayLine.innerHTML = `<span>Сегодня:</span> ${dayEventsText(today)}`;
  if (tomorrowLine) tomorrowLine.innerHTML = `<span>Завтра:</span> ${dayEventsText(tomorrow)}`;
  card.title = "Календарь";
}

// Same rules as the visualizer: the card is in the row under the clock and weather, and hidden in cover mode.
function placeHomeCalendar() {
  const card = ensureHomeCalendar();
  const clock = document.querySelector(".hero-clock");
  const weather = document.getElementById("weather-widget");
  const player = document.querySelector(".player-widget");
  const tabs = document.querySelector(".actions-title-row");
  const hidden = !clock || !player || document.body.classList.contains("player-expanded") || document.body.classList.contains("trip-sheet-open");
  card.hidden = hidden;
  if (hidden) return;
  const c = clock.getBoundingClientRect();
  const weatherVisible = weather && weather.offsetWidth > 0;
  const right = weatherVisible ? Math.max(c.right, weather.getBoundingClientRect().right) : c.right;
  const p = player.getBoundingClientRect();
  const top = p.bottom + 20;
  const limit = tabs ? tabs.getBoundingClientRect().top - 12 : p.bottom + 120;
  card.style.left = c.left + "px";
  card.style.width = Math.max(0, right - c.left) + "px";
  card.style.top = top + "px";
  card.style.height = Math.max(60, Math.min(100, limit - top)) + "px";
}

bindCalendar();
setInterval(placeHomeCalendar, 500);
window.addEventListener("resize", placeHomeCalendar);

// New Google events arrive from google-hub.js: the home card and an open calendar show them at once.
window.addEventListener("google-calendar-updated", () => {
  const sheet = document.getElementById("calendar-sheet");
  if (sheet && !sheet.hidden && !calForm) renderCalendar();
  else renderHomeCalendar();
});

// Reminders: while the launcher is on screen, a toast shows CAL_REMIND_MINUTES before an event today.
// Each event is reminded once per launcher session. Reminders need the launcher open (see the notes on system notifications).
const CAL_REMIND_MINUTES = 10;
const calRemindedKeys = new Set();

function checkReminders() {
  renderHomeCalendar();
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

