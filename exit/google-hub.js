// Google-хаб (Tomsk Hub, встроен в лаунчер): задачи, календарь и почта из Google через Apps Script,
// чат Gemini и погода в Томске. Контракт бэкенда как у хаба: GET {адрес}?secret=…&_ts=…&action=… →
// { ok, tasks[], mail[], events[] } (или calendar[]). Адрес, ключ бэкенда и ключ Gemini вводятся в шторке,
// хранятся только на этом устройстве и в код не попадают. Ключ Gemini уходит в заголовке, не в ссылке.
// На ходу задачи не добавляются и не отмечаются, как и раскладка главного экрана; чат с Gemini доступен.
(function () {
  const URL_KEY = "generic_launcher_google_url_v1";
  const SECRET_KEY = "generic_launcher_google_secret_v1";
  const GEMINI_KEY = "generic_launcher_google_gemini_key_v1";
  const NAV_PACKAGE = "ru.yandex.yandexnavi";
  const GEMINI_MODEL = "gemini-2.5-flash";
  const CHAT_TURNS = 6;
  const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=56.4972&longitude=85.0352&current=temperature_2m,weather_code&timezone=Asia%2FTomsk";
  const TABS = [
    { key: "tasks", label: "Задачи", list: true, empty: "Задач нет" },
    { key: "calendar", label: "Календарь", list: true, empty: "Предстоящих событий нет" },
    { key: "mail", label: "Почта", list: true, empty: "Непрочитанных писем нет" },
    { key: "gemini", label: "Gemini", list: false }
  ];

  const STYLE = `
  body:not(.player-expanded) #open-google-hub { transform: translateY(25px); }
  body.player-expanded #open-google-hub { display: none !important; }
  #google-hub-sheet { padding-bottom: var(--safe-bottom); }
  .gh-card { width: min(760px, 100%); max-height: min(680px, calc(100vh - 48px - var(--safe-bottom))); display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; padding: 20px; border: 1px solid var(--line); border-radius: 28px; background: #0b1622; color: var(--text); }
  :root[data-theme="light"] .gh-card { background: #f5f6f8; }
  .gh-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .gh-title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .gh-title h3 { margin: 0; font-size: 24px; font-weight: 600; }
  .gh-weather { font-size: 15px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gh-head-actions { display: flex; gap: 8px; }
  .gh-icon, .gh-close { width: 48px; height: 48px; border: 0; border-radius: 50%; background: var(--surface-soft); color: var(--text); font-size: 22px; cursor: pointer; }
  .gh-close { font-size: 26px; }
  .gh-icon:disabled { opacity: .45; cursor: default; }
  .gh-status { font-size: 14px; color: var(--muted); }
  .gh-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .gh-tab { min-height: 44px; padding: 0 8px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface-soft); color: var(--text); font-size: 15px; cursor: pointer; }
  .gh-tab.active { background: var(--accent); color: #0b1620; border-color: transparent; }
  .gh-drive { margin: 0; min-height: 18px; font-size: 14px; color: var(--muted); visibility: hidden; }
  .gh-drive.on { visibility: visible; }
  .gh-pane { display: none; flex-direction: column; gap: 10px; }
  .gh-pane.active { display: flex; }
  .gh-add, .gh-chat-form { display: flex; gap: 8px; }
  .gh-add input, .gh-chat-form input { flex: 1; min-width: 0; min-height: 48px; padding: 0 16px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface-soft); color: var(--text); font-size: 16px; }
  .gh-add button { width: 48px; min-height: 48px; border: 0; border-radius: 50%; background: var(--accent); color: #0b1620; font-size: 26px; cursor: pointer; }
  .gh-chat-form button { min-height: 48px; padding: 0 20px; border: 0; border-radius: 24px; background: var(--accent); color: #0b1620; font-size: 16px; cursor: pointer; }
  .gh-add input:disabled, .gh-add button:disabled, .gh-done:disabled, .gh-chat-form button:disabled { opacity: .45; cursor: not-allowed; }
  .gh-list, .gh-chat { height: min(320px, 42vh); overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 2px; }
  .gh-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-soft); }
  .gh-item-text { min-width: 0; }
  .gh-item-title { font-size: 17px; word-break: break-word; }
  .gh-item-meta { margin-top: 2px; font-size: 14px; color: var(--muted); word-break: break-word; }
  .gh-done { min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 20px; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; flex-shrink: 0; }
  .gh-empty { padding: 8px 4px; font-size: 16px; color: var(--muted); }
  .gh-msg { max-width: 88%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-soft); font-size: 16px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
  .gh-msg.user { align-self: flex-end; background: rgba(111, 195, 250, .18); }
  .gh-msg.error { align-self: flex-start; color: #ff8a8a; }
  .gh-msg.system, .gh-msg.pending { align-self: center; max-width: 100%; color: var(--muted); font-size: 14px; }
  .gh-note { margin: 0; min-height: 18px; font-size: 14px; color: var(--muted); }
  .gh-note.error { color: #ff8a8a; }
  .gh-foot { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .gh-nav, .gh-save { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 22px; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; }
  .gh-settings { font-size: 15px; color: var(--muted); }
  .gh-settings label { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
  .gh-settings input { min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); color: var(--text); font-size: 15px; }
  `;

  const data = { tasks: [], calendar: [], mail: [] };
  const chatTurns = [];   // последние реплики для контекста Gemini; только в памяти, на диск не пишутся
  let tab = "tasks";
  let sheet = null;
  let busy = false;       // запрос к Apps Script идёт
  let chatBusy = false;   // запрос к Gemini идёт
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
      // Storage can be unavailable in some WebViews: the address and keys then have to be entered again.
    }
  }

  function execUrl() { return readStored(URL_KEY, "").trim(); }
  function secret() { return readStored(SECRET_KEY, "").trim(); }
  function geminiKey() { return readStored(GEMINI_KEY, "").trim(); }
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
    const gemini = sheet.querySelector(".gh-gemini").value.trim();
    if (url && !/^https:\/\//.test(url)) {
      setNote("Адрес должен начинаться с https://", true);
      return;
    }
    writeStored(URL_KEY, url);
    writeStored(SECRET_KEY, key);
    writeStored(GEMINI_KEY, gemini);
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
    sheet.querySelector(".gh-chat-form button").disabled = chatBusy;
  }

  function render() {
    if (!sheet) return;
    TABS.forEach(item => {
      const button = sheet.querySelector('.gh-tab[data-tab="' + item.key + '"]');
      button.textContent = item.list ? item.label + " (" + data[item.key].length + ")" : item.label;
      button.classList.toggle("active", tab === item.key);
      const pane = sheet.querySelector('.gh-pane[data-pane="' + item.key + '"]');
      pane.classList.toggle("active", tab === item.key);
      if (item.list) fillList(pane.querySelector(".gh-list"), data[item.key], item.empty, rowBuilders[item.key]);
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

  // ---- Погода в Томске (open-meteo, без ключа) ----
  function describeWeather(code) {
    if (code === 0) return "ясно";
    if ([1, 2, 3].includes(code)) return "облачно";
    if (code === 45 || code === 48) return "туман";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "снег";
    if (code >= 95) return "гроза";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "осадки";
    return "пасмурно";
  }

  async function loadWeather() {
    const line = sheet.querySelector(".gh-weather");
    try {
      const response = await fetch(WEATHER_URL, { cache: "no-store" });
      const body = await response.json();
      const current = body && body.current;
      if (!current || typeof current.temperature_2m !== "number") throw new Error("no current");
      const temp = Math.round(current.temperature_2m);
      line.textContent = "Томск " + (temp > 0 ? "+" : "") + temp + "°C · " + describeWeather(current.weather_code);
    } catch (error) {
      line.textContent = "Томск · погода недоступна";
    }
  }

  // ---- Чат с Gemini и быстрые задачи ----
  function appendMsg(text, kind) {
    const log = sheet.querySelector(".gh-chat");
    const bubble = element("div", "gh-msg" + (kind ? " " + kind : ""), text);
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  async function askGemini(text) {
    const key = geminiKey();
    if (!key) {
      appendMsg("Чтобы задавать вопросы Gemini, укажите ключ Gemini API в «Подключение».", "error");
      return;
    }
    chatBusy = true;
    syncDriving();
    const pending = appendMsg("Думаю…", "pending");
    let reply = "";
    let failure = "";
    try {
      const turns = chatTurns.slice(-CHAT_TURNS).concat([{ role: "user", text: text }]);
      const contents = turns.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] }));
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: contents })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error((body && body.error && body.error.message) || "HTTP " + response.status);
      const part = body && body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts && body.candidates[0].content.parts[0];
      reply = (part && part.text) || "";
      if (!reply) throw new Error("пустой ответ.");
    } catch (error) {
      failure = error.message || "ошибка";
    } finally {
      pending.remove();
      chatBusy = false;
      syncDriving();
    }
    if (reply) {
      chatTurns.push({ role: "user", text: text }, { role: "model", text: reply });
      appendMsg(reply, "model");
    } else {
      appendMsg("Ошибка Gemini: " + failure, "error");
    }
  }

  async function sendChat(text) {
    appendMsg(text, "user");
    if (/^задача[:\s]+/i.test(text)) {
      const title = text.replace(/^задача[:\s]+/i, "").trim();
      if (!title) { appendMsg("Напишите текст задачи после слова «задача:».", "error"); return; }
      if (moving()) { appendMsg("На ходу задачи не добавляем.", "error"); return; }
      if (busy) { appendMsg("Подождите, идёт синхронизация.", "error"); return; }
      const ok = await run("Добавляем…", { action: "addTask", title: title });
      appendMsg(ok ? "Задача «" + title + "» добавлена в Google Tasks." : "Не удалось добавить задачу.", ok ? "" : "error");
      return;
    }
    await askGemini(text);
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
      '<div class="gh-head"><div class="gh-title"><h3>Google</h3><span class="gh-weather">Томск · загрузка…</span></div>' +
      '<div class="gh-head-actions">' +
      '<button type="button" class="gh-icon gh-refresh" aria-label="Обновить">⟳</button>' +
      '<button type="button" class="gh-close" aria-label="Закрыть">×</button></div></div>' +
      '<div class="gh-status"></div>' +
      '<div class="gh-tabs">' + tabButtons + '</div>' +
      '<p class="gh-drive" hidden>На ходу задачи не добавляем и не отмечаем.</p>' +
      '<div class="gh-pane" data-pane="tasks"><form class="gh-add"><input type="text" placeholder="Новая задача" autocomplete="off" maxlength="200">' +
      '<button type="submit" aria-label="Добавить задачу">+</button></form><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="calendar"><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="mail"><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="gemini"><div class="gh-chat" aria-live="polite">' +
      '<div class="gh-msg system">Спросите Gemini. Чтобы добавить задачу, начните фразу со слова «задача:».</div></div>' +
      '<form class="gh-chat-form"><input type="text" placeholder="Сообщение для Gemini…" autocomplete="off" maxlength="1000">' +
      '<button type="submit">Отправить</button></form></div>' +
      '<p class="gh-note" aria-live="polite"></p>' +
      '<details class="gh-settings"><summary>Подключение</summary>' +
      '<label>Адрес веб-приложения (/exec)<input type="url" class="gh-url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
      '<label>Ключ (SECRET)<input type="password" class="gh-secret" autocomplete="off"></label>' +
      '<label>Ключ Gemini API (для чата, необязательно)<input type="password" class="gh-gemini" autocomplete="off" placeholder="AIza…"></label>' +
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
    sheet.querySelector(".gh-chat-form").addEventListener("submit", event => {
      event.preventDefault();
      const input = sheet.querySelector(".gh-chat-form input");
      const text = input.value.trim();
      if (!text || chatBusy) return;
      input.value = "";
      sendChat(text);
    });
    // While the sheet is open, keep the driving state in step with the car and the weather fresh.
    setInterval(() => { if (!sheet.hidden) syncDriving(); }, 1000);
    setInterval(() => { if (!sheet.hidden) loadWeather(); }, 600000);
    document.body.appendChild(sheet);
    return sheet;
  }

  function openSheet() {
    ensureSheet();
    sheet.querySelector(".gh-url").value = execUrl();
    sheet.querySelector(".gh-secret").value = secret();
    sheet.querySelector(".gh-gemini").value = geminiKey();
    sheet.hidden = false;
    render();
    loadWeather();
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
