// Google: задачи, календарь и почта из Google через Apps Script (Tomsk Hub, встроен в лаунчер).
// Контракт как у хаба: GET {адрес}?secret=…&_ts=…&action=… → { ok, tasks[], mail[], events[] } (или calendar[]).
// Адрес и ключ вводятся в шторке, хранятся только на этом устройстве и в код не попадают.
// Gemini-чат и погода сюда не входят: погода уже на главном экране, ассистент — отдельный модуль (assistant.js).
// На ходу задачи не добавляются и не отмечаются, как и раскладка главного экрана.
(function () {
  const URL_KEY = "generic_launcher_google_url_v1";
  const SECRET_KEY = "generic_launcher_google_secret_v1";
  const NAV_PACKAGE = "ru.yandex.yandexnavi";
  const TABS = [
    { key: "tasks", label: "Задачи", empty: "Задач нет" },
    { key: "calendar", label: "Календарь", empty: "Предстоящих событий нет" },
    { key: "mail", label: "Почта", empty: "Непрочитанных писем нет" }
  ];

  const STYLE = `
  body:not(.player-expanded) #open-google-hub { transform: translateY(25px); }
  body.player-expanded #open-google-hub { display: none !important; }
  #google-hub-sheet { padding-bottom: var(--safe-bottom); }
  .gh-card { width: min(760px, 100%); max-height: min(680px, calc(100vh - 48px - var(--safe-bottom))); display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; padding: 20px; border: 1px solid var(--line); border-radius: 28px; background: #0b1622; color: var(--text); }
  :root[data-theme="light"] .gh-card { background: #f5f6f8; }
  .gh-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .gh-head h3 { margin: 0; font-size: 24px; font-weight: 600; }
  .gh-head-actions { display: flex; gap: 8px; }
  .gh-icon, .gh-close { width: 48px; height: 48px; border: 0; border-radius: 50%; background: var(--surface-soft); color: var(--text); font-size: 22px; cursor: pointer; }
  .gh-close { font-size: 26px; }
  .gh-icon:disabled { opacity: .45; cursor: default; }
  .gh-status { font-size: 14px; color: var(--muted); }
  .gh-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .gh-tab { min-height: 44px; padding: 0 10px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface-soft); color: var(--text); font-size: 15px; cursor: pointer; }
  .gh-tab.active { background: var(--accent); color: #0b1620; border-color: transparent; }
  .gh-drive { margin: 0; min-height: 18px; font-size: 14px; color: var(--muted); visibility: hidden; }
  .gh-drive.on { visibility: visible; }
  .gh-pane { display: none; flex-direction: column; gap: 10px; }
  .gh-pane.active { display: flex; }
  .gh-add { display: flex; gap: 8px; }
  .gh-add input { flex: 1; min-width: 0; min-height: 48px; padding: 0 16px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface-soft); color: var(--text); font-size: 16px; }
  .gh-add button { width: 48px; min-height: 48px; border: 0; border-radius: 50%; background: var(--accent); color: #0b1620; font-size: 26px; cursor: pointer; }
  .gh-add input:disabled, .gh-add button:disabled, .gh-done:disabled { opacity: .45; cursor: not-allowed; }
  .gh-list { height: min(320px, 42vh); overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 2px; }
  .gh-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-soft); }
  .gh-item-text { min-width: 0; }
  .gh-item-title { font-size: 17px; word-break: break-word; }
  .gh-item-meta { margin-top: 2px; font-size: 14px; color: var(--muted); word-break: break-word; }
  .gh-done { min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 20px; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; flex-shrink: 0; }
  .gh-empty { padding: 8px 4px; font-size: 16px; color: var(--muted); }
  .gh-note { margin: 0; min-height: 18px; font-size: 14px; color: var(--muted); }
  .gh-note.error { color: #ff8a8a; }
  .gh-foot { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .gh-nav, .gh-save { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 22px; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; }
  .gh-settings { font-size: 15px; color: var(--muted); }
  .gh-settings label { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
  .gh-settings input { min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); color: var(--text); font-size: 15px; }
  `;

  const data = { tasks: [], calendar: [], mail: [] };
  let tab = "tasks";
  let sheet = null;
  let busy = false;
  let synced = "";

  function readStored(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Storage can be unavailable in some WebViews: the address and key then have to be entered again.
    }
  }

  function execUrl() { return readStored(URL_KEY, "").trim(); }
  function secret() { return readStored(SECRET_KEY, "").trim(); }
  function moving() { return typeof state !== "undefined" && !!state && typeof state.speedKmh === "number" && state.speedKmh > 0; }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function injectStyle() {
    if (document.getElementById("google-hub-style")) return;
    const style = document.createElement("style");
    style.id = "google-hub-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  // One request to the Apps Script web app. Every call is a GET (as in Tomsk Hub), so the head unit does not need CORS for POST.
  async function callApi(params) {
    const base = execUrl();
    if (!base) throw new Error("Укажите адрес веб-приложения (/exec) в «Подключение».");
    if (!/^https:\/\//.test(base)) throw new Error("Адрес должен начинаться с https://");
    const url = new URL(base);
    url.searchParams.set("secret", secret());
    url.searchParams.set("_ts", String(Date.now()));
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      throw new Error("Сервер ответил не JSON (HTTP " + response.status + ").");
    }
    if (!response.ok || !body || body.ok === false) throw new Error((body && body.error) || "HTTP " + response.status);
    return body;
  }

  function apply(body) {
    data.tasks = Array.isArray(body.tasks) ? body.tasks : [];
    data.mail = Array.isArray(body.mail) ? body.mail : [];
    const events = body.events || body.calendar;
    data.calendar = Array.isArray(events) ? events : [];
    synced = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  // Runs one request and updates the lists; a failed request keeps the lists as they were and shows the reason.
  async function run(status, params) {
    if (busy) return false;
    busy = true;
    setStatus(status);
    setNote("");
    render();
    try {
      apply(await callApi(params));
      setStatus("Обновлено в " + synced);
      return true;
    } catch (error) {
      setStatus("Не получилось");
      setNote(error.message || "Ошибка", true);
      return false;
    } finally {
      busy = false;
      render();
    }
  }

  function refresh() {
    if (!execUrl()) {
      setStatus("Не подключено");
      setNote("Укажите адрес веб-приложения и ключ в «Подключение».", true);
      sheet.querySelector(".gh-settings").open = true;
      return;
    }
    run("Синхронизация…", {});
  }

  function save() {
    const url = sheet.querySelector(".gh-url").value.trim();
    const key = sheet.querySelector(".gh-secret").value.trim();
    if (url && !/^https:\/\//.test(url)) {
      setNote("Адрес должен начинаться с https://", true);
      return;
    }
    writeStored(URL_KEY, url);
    writeStored(SECRET_KEY, key);
    sheet.querySelector(".gh-settings").open = false;
    if (!url) {
      data.tasks = [];
      data.calendar = [];
      data.mail = [];
      setStatus("Не подключено");
      setNote("Подключение сброшено.");
      render();
      return;
    }
    run("Синхронизация…", {});
  }

  // Dates from Apps Script arrive as ISO strings; show them in short form and keep anything unparsable as it is.
  function formatWhen(value) {
    if (!value) return "";
    const text = String(value);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    const withTime = /\d{2}:\d{2}/.test(text);
    return date.toLocaleString("ru-RU", withTime
      ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short" });
  }

  const rowBuilders = {
    tasks(task) {
      const row = element("div", "gh-item");
      const text = element("div", "gh-item-text");
      text.appendChild(element("div", "gh-item-title", task.title || "(Без названия)"));
      row.appendChild(text);
      const done = element("button", "gh-done", "Готово");
      done.type = "button";
      done.dataset.taskId = task.id ? String(task.id) : "";
      row.appendChild(done);
      return row;
    },
    calendar(event) {
      const row = element("div", "gh-item");
      const text = element("div", "gh-item-text");
      text.appendChild(element("div", "gh-item-title", event.title || "(Без названия)"));
      const when = formatWhen(event.start || event.time);
      if (when) text.appendChild(element("div", "gh-item-meta", when));
      row.appendChild(text);
      return row;
    },
    mail(message) {
      const row = element("div", "gh-item");
      const text = element("div", "gh-item-text");
      text.appendChild(element("div", "gh-item-title", message.subject || "(Без темы)"));
      if (message.from) text.appendChild(element("div", "gh-item-meta", message.from));
      row.appendChild(text);
      return row;
    }
  };

  function fillList(list, items, emptyText, build) {
    list.textContent = "";
    if (!items.length) {
      list.appendChild(element("div", "gh-empty", emptyText));
      return;
    }
    items.forEach(item => list.appendChild(build(item)));
  }

  // Adding and finishing tasks are off while the car moves; the lists can still be read.
  function syncDriving() {
    if (!sheet) return;
    const driving = moving();
    sheet.querySelector(".gh-drive").classList.toggle("on", driving);
    sheet.querySelectorAll(".gh-add input, .gh-add button").forEach(node => { node.disabled = driving || busy; });
    sheet.querySelectorAll(".gh-done").forEach(node => { node.disabled = driving || busy || !node.dataset.taskId; });
    sheet.querySelector(".gh-refresh").disabled = busy;
  }

  function render() {
    if (!sheet) return;
    TABS.forEach(item => {
      const button = sheet.querySelector('.gh-tab[data-tab="' + item.key + '"]');
      button.textContent = item.label + " (" + data[item.key].length + ")";
      button.classList.toggle("active", tab === item.key);
      const pane = sheet.querySelector('.gh-pane[data-pane="' + item.key + '"]');
      pane.classList.toggle("active", tab === item.key);
      fillList(pane.querySelector(".gh-list"), data[item.key], item.empty, rowBuilders[item.key]);
    });
    syncDriving();
  }

  function setStatus(text) {
    if (sheet) sheet.querySelector(".gh-status").textContent = text;
  }

  function setNote(text, isError) {
    if (!sheet) return;
    const note = sheet.querySelector(".gh-note");
    note.textContent = text || "";
    note.classList.toggle("error", !!isError);
  }

  // The navigator is opened as an app: its own saved home and work places are used there.
  function openNavigator() {
    if (!bridge.available()) {
      setNote("Навигатор открывается на головном устройстве.", true);
      return;
    }
    bridge.runApp(NAV_PACKAGE);
  }

  function ensureSheet() {
    if (sheet) return sheet;
    injectStyle();
    sheet = document.createElement("div");
    sheet.id = "google-hub-sheet";
    sheet.className = "forecast-sheet";
    sheet.hidden = true;
    const tabButtons = TABS.map(item => '<button type="button" class="gh-tab" data-tab="' + item.key + '"></button>').join("");
    sheet.innerHTML =
      '<div class="forecast-card gh-card" role="dialog" aria-label="Google">' +
      '<div class="gh-head"><h3>Google</h3><div class="gh-head-actions">' +
      '<button type="button" class="gh-icon gh-refresh" aria-label="Обновить">⟳</button>' +
      '<button type="button" class="gh-close" aria-label="Закрыть">×</button></div></div>' +
      '<div class="gh-status"></div>' +
      '<div class="gh-tabs">' + tabButtons + '</div>' +
      '<p class="gh-drive" hidden>На ходу задачи не добавляем и не отмечаем.</p>' +
      '<div class="gh-pane" data-pane="tasks"><form class="gh-add"><input type="text" placeholder="Новая задача" autocomplete="off" maxlength="200">' +
      '<button type="submit" aria-label="Добавить задачу">+</button></form><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="calendar"><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="mail"><div class="gh-list"></div></div>' +
      '<p class="gh-note" aria-live="polite"></p>' +
      '<details class="gh-settings"><summary>Подключение</summary>' +
      '<label>Адрес веб-приложения (/exec)<input type="url" class="gh-url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
      '<label>Ключ (SECRET)<input type="password" class="gh-secret" autocomplete="off"></label>' +
      '<button type="button" class="gh-save">Сохранить</button></details>' +
      '<div class="gh-foot"><button type="button" class="gh-nav">Открыть навигатор</button></div>' +
      '</div>';
    sheet.addEventListener("click", event => {
      const target = event.target;
      if (target === sheet) { sheet.hidden = true; return; }
      if (!(target instanceof Element)) return;
      const tabButton = target.closest(".gh-tab");
      if (tabButton) { tab = tabButton.dataset.tab; render(); return; }
      const done = target.closest(".gh-done");
      if (done) {
        if (!done.disabled) run("Отмечаем…", { action: "completeTask", taskId: done.dataset.taskId });
        return;
      }
      if (target.closest(".gh-close")) { sheet.hidden = true; return; }
      if (target.closest(".gh-refresh")) { refresh(); return; }
      if (target.closest(".gh-nav")) { openNavigator(); return; }
      if (target.closest(".gh-save")) save();
    });
    sheet.querySelector(".gh-add").addEventListener("submit", async event => {
      event.preventDefault();
      if (moving()) return;
      const input = sheet.querySelector(".gh-add input");
      const title = input.value.trim();
      if (!title) return;
      if (await run("Добавляем…", { action: "addTask", title: title })) input.value = "";
    });
    // While the sheet is open, keep the driving state (and the disabled controls) in step with the car.
    setInterval(() => { if (!sheet.hidden) syncDriving(); }, 1000);
    document.body.appendChild(sheet);
    return sheet;
  }

  function openSheet() {
    ensureSheet();
    sheet.querySelector(".gh-url").value = execUrl();
    sheet.querySelector(".gh-secret").value = secret();
    sheet.hidden = false;
    render();
    refresh();
  }

  // The button sits before «Ассистент» in the same row as «Настройки» (the settings are created by their own script).
  function bindButton() {
    if (document.getElementById("open-google-hub")) return true;
    const settings = document.getElementById("open-settings");
    if (!settings) return false;
    injectStyle();
    const button = document.createElement("button");
    button.type = "button";
    button.id = "open-google-hub";
    button.className = settings.className;
    button.textContent = "Google";
    button.addEventListener("click", openSheet);
    const anchor = document.getElementById("open-assistant") || settings;
    anchor.parentNode.insertBefore(button, anchor);
    return true;
  }

  if (!bindButton()) {
    const timer = setInterval(() => { if (bindButton()) clearInterval(timer); }, 500);
  }
})();
