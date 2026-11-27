// Google-хаб (Tomsk Hub, встроен в лаунчер): окно «Google» с календарём, почтой, контактами и новостями.
// Задачи живут в виджете календаря (calendar.js), там же их добавляют и отмечают.
// Всё из Google идёт через Apps Script. Адрес, ключи и лента вводятся в «Подключение», хранятся на этом устройстве и в код не попадают.
// Контракт (как у хаба): GET {адрес}?secret=…&_ts=…&listId=…&action=… → { ok, events[], tasks[], taskLists[], mail[], contacts[], news[] }.
// Действия: addTask и completeTask (с listId), addEvent (title, start, location), replyMail и deleteMail (threadId), getNews (feedUrl, newsApiKey).
// На ходу письма не отправляются и не удаляются; задачи и события добавляются и отмечаются из виджета и ассистента.
// Погода Томска — в карточке на главном экране (weather.js).
(function () {
  const URL_KEY = "generic_launcher_google_url_v1";
  const SECRET_KEY = "generic_launcher_google_secret_v1";
  const EVENTS_KEY = "generic_launcher_google_events_v1";     // кэш для календаря и виджета задач (читает calendar.js)
  const LIST_KEY = "generic_launcher_google_tasklist_v1";     // выбранный список задач
  const NEWS_KEY_KEY = "generic_launcher_google_newsapi_v1";  // ключ NewsAPI (необязательно)
  const FEED_KEY = "generic_launcher_google_newsfeed_v1";     // лента новостей (RSS)
  const DEFAULT_FEED = "https://ria.ru/export/rss2/index.xml";
  const CALENDAR_SYNC_MS = 15 * 60 * 1000;                    // событиям не чаще, чем раз в 15 минут
  const CALENDAR_TICK_MS = 5 * 60 * 1000;                     // проверка раз в 5 минут
  const REQUEST_TIMEOUT_MS = 15000;                           // запрос без ответа дольше этого считается неудачным
  const NAV_PACKAGE = "ru.yandex.yandexnavi";
  const NOT_CONNECTED = "Google не подключён: укажите адрес в кнопке «Google», раздел «Подключение».";
  const TABS = [
    { key: "calendar", label: "Календарь", empty: "Предстоящих событий нет" },
    { key: "mail", label: "Почта", empty: "Писем в выбранном разделе нет" },
    { key: "contacts", label: "Контакты", empty: "Контактов нет" },
    { key: "news", label: "Новости", empty: "Новостей нет" }
  ];
  const MAIL_FOLDERS = [["all", "Все"], ["inbox", "Входящие"], ["sent", "Исходящие"]];

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
  .gh-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .gh-tab { min-height: 44px; padding: 0 6px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface-soft); color: var(--text); font-size: 15px; cursor: pointer; }
  .gh-tab.active { background: var(--accent); color: #0b1620; border-color: transparent; }
  .gh-drive { margin: 0; min-height: 18px; font-size: 14px; color: var(--muted); visibility: hidden; }
  .gh-drive.on { visibility: visible; }
  .gh-pane { display: none; flex-direction: column; gap: 10px; }
  .gh-pane.active { display: flex; }
  .gh-subbar { display: flex; gap: 8px; flex-wrap: wrap; }
  .gh-subbar:empty { display: none; }
  .gh-filter { min-height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 18px; background: transparent; color: var(--text); font-size: 14px; cursor: pointer; }
  .gh-filter.active { background: var(--accent); color: #0b1620; border-color: transparent; }
  .gh-list { height: min(320px, 42vh); overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 2px; }
  .gh-item { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 12px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-soft); }
  .gh-item-text { min-width: 0; flex: 1 1 200px; }
  .gh-item-title { font-size: 17px; word-break: break-word; }
  .gh-item-meta { margin-top: 2px; font-size: 14px; color: var(--muted); word-break: break-word; }
  .gh-item-actions { display: flex; gap: 8px; }
  .gh-reply, .gh-delete, .gh-send { min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 20px; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; flex-shrink: 0; }
  .gh-delete.danger { background: #c0392b; border-color: transparent; color: #fff; }
  .gh-send.confirm { background: var(--accent); border-color: transparent; color: #0b1620; }
  .gh-reply-box { flex-basis: 100%; display: flex; gap: 8px; }
  .gh-reply-input { flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); color: var(--text); font-size: 15px; }
  .gh-mail-action:disabled, .gh-reply-input:disabled, .gh-filter:disabled { opacity: .45; cursor: not-allowed; }
  .gh-empty { padding: 8px 4px; font-size: 16px; color: var(--muted); }
  .gh-note { margin: 0; min-height: 18px; font-size: 14px; color: var(--muted); }
  .gh-note.error { color: #ff8a8a; }
  .gh-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .gh-hint { font-size: 14px; color: var(--muted); }
  .gh-nav, .gh-save { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 22px; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; }
  .gh-settings { font-size: 15px; color: var(--muted); }
  .gh-settings label { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
  .gh-settings input { min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); color: var(--text); font-size: 15px; }
  `;

  const data = { calendar: [], mail: [], contacts: [], news: [] };
  let tab = "calendar";
  let sheet = null;
  let pendingActions = 0;    // действия пользователя (добавить, отметить, ответить, обновить): ждут или идут
  let syncing = false;       // фоновая синхронизация календаря идёт; она не блокирует действия
  let queue = Promise.resolve();   // действия идут по одному, чтобы не перемешивать ответы Apps Script
  let synced = "";
  let lastError = "";
  let mailFolder = "all";
  let newsSource = "all";
  let openReplyId = "";      // письмо, у которого открыт ответ
  let confirmDeleteId = "";  // письмо, которое ждёт второго нажатия «Точно удалить»
  let confirmSendId = "";    // письмо, у которого ждём второго нажатия «Точно отправить»
  const replyDrafts = {};    // черновики ответов по письмам, чтобы не терялись при обновлении списка

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

  function readCache() {
    try {
      const raw = localStorage.getItem(EVENTS_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch (error) {
      return {};
    }
  }

  // The window starts with the events of the last sync: the same ones the calendar widget shows, even when the sync fails.
  data.calendar = Array.isArray(readCache().events) ? readCache().events : [];

  function execUrl() { return readStored(URL_KEY, "").trim(); }
  function secret() { return readStored(SECRET_KEY, "").trim(); }
  function activeList() { return readStored(LIST_KEY, "").trim() || "@default"; }
  function moving() { return typeof state !== "undefined" && !!state && typeof state.speedKmh === "number" && state.speedKmh > 0; }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, text, threadId) {
    const node = element("button", className, text);
    node.type = "button";
    node.dataset.thread = threadId;
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
    if (!("listId" in params)) url.searchParams.set("listId", activeList());
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
    });
    // Без таймаута запрос, который повис в сети, держал бы все действия до разрыва соединения.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { method: "GET", cache: "no-store", signal: controller.signal });
      let body = null;
      try {
        body = await response.json();
      } catch (error) {
        throw new Error("Сервер ответил не JSON (HTTP " + response.status + ").");
      }
      if (!response.ok || !body || body.ok === false) throw new Error((body && body.error) || "HTTP " + response.status);
      return body;
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("Google не ответил за " + REQUEST_TIMEOUT_MS / 1000 + " секунд.");
      if (error && error.name === "TypeError") throw new Error("Нет связи с Google.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // News: only the Apps Script fetches the feed, so the feed address and the NewsAPI key stay out of the page's own requests.
  function normalizeNews(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map(item => {
        if (!item) return null;
        const title = String(item.title || "").trim();
        if (!title) return null;
        return { source: String(item.source || "Новости").trim() || "Новости", title, date: String(item.date || "").trim() };
      })
      .filter(Boolean)
      .slice(0, 28);
  }

  // One event can come back more than once (the same event from two calendars): one row per event.
  // The key is the event's day, time, title and place; the calendar widget deduplicates by its own key as well.
  function uniqueEvents(list) {
    const seen = new Set();
    return list.filter(event => {
      if (!event || typeof event !== "object") return false;
      const key = JSON.stringify([
        String(event.date || "").trim(),
        String(event.start || event.time || "").trim(),
        String(event.end || "").trim(),
        String(event.title || event.summary || "").trim().toLowerCase(),
        String(event.location || "").trim().toLowerCase()
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Keeps the lists that the response does not carry (a quiet calendar sync does not always return news or contacts).
  function apply(body) {
    const cached = readCache();
    data.calendar = uniqueEvents(Array.isArray(body.events) ? body.events : (Array.isArray(body.calendar) ? body.calendar : []));
    data.mail = Array.isArray(body.mail) ? body.mail : [];
    if (Array.isArray(body.contacts)) data.contacts = body.contacts;
    if (Array.isArray(body.news)) data.news = normalizeNews(body.news);
    const tasks = Array.isArray(body.tasks) ? body.tasks : (Array.isArray(cached.tasks) ? cached.tasks : []);
    const taskLists = Array.isArray(body.taskLists) ? body.taskLists : (Array.isArray(cached.taskLists) ? cached.taskLists : []);
    writeStored(EVENTS_KEY, JSON.stringify({ at: Date.now(), events: data.calendar, tasks, taskLists, activeTaskListId: activeList() }));
    synced = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    window.dispatchEvent(new Event("google-calendar-updated"));
  }

  // Runs one request and updates the lists; a failed request keeps the lists as they were and shows the reason.
  // Действия идут по очереди: нажатие не отклоняется из-за того, что другой запрос ещё идёт.
  function run(status, params) {
    pendingActions += 1;
    setStatus(status);
    setNote("");
    render();
    const job = queue.then(async () => {
      try {
        apply(await callApi(params));
        setStatus("Обновлено в " + synced);
        return true;
      } catch (error) {
        lastError = error.message || "Ошибка";
        setStatus("Не получилось");
        setNote(lastError, true);
        return false;
      } finally {
        pendingActions -= 1;
        render();
      }
    });
    queue = job;
    return job;
  }

  // Used by the assistant («задача: …») and by the calendar's tasks block: adds a task to the chosen list.
  window.googleHubAddTask = async function (title) {
    const text = String(title || "").trim();
    if (!text) return { ok: false, reason: "Напишите текст задачи." };
    if (moving()) return { ok: false, reason: "На ходу задачи не добавляем." };
    if (!execUrl()) return { ok: false, reason: NOT_CONNECTED };
    const ok = await run("Добавляем…", { action: "addTask", title: text });
    return ok ? { ok: true } : { ok: false, reason: "Не удалось добавить задачу: " + lastError };
  };

  // Used by the calendar's tasks block: marks a task done in the chosen list.
  window.googleHubCompleteTask = async function (taskId) {
    const id = String(taskId || "").trim();
    if (!id) return { ok: false, reason: "Не найдена задача." };
    if (moving()) return { ok: false, reason: "На ходу задачи не отмечаем." };
    if (!execUrl()) return { ok: false, reason: NOT_CONNECTED };
    const ok = await run("Отмечаем…", { action: "completeTask", taskId: id });
    return ok ? { ok: true } : { ok: false, reason: "Не удалось отметить задачу: " + lastError };
  };

  // Used by the calendar's tasks block: switches the list the tasks come from.
  window.googleHubSetTaskList = async function (listId) {
    const id = String(listId || "").trim();
    if (!id || !execUrl()) return false;
    writeStored(LIST_KEY, id);
    return run("Список задач…", {});
  };

  // Used by the assistant after the driver confirms: adds an event to the Google calendar. start is ISO with the offset (+07:00).
  window.googleHubAddEvent = async function (title, start, location) {
    const text = String(title || "").trim();
    if (!text) return { ok: false, reason: "Напишите название события." };
    if (moving()) return { ok: false, reason: "На ходу события не добавляем." };
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(start || ""))) return { ok: false, reason: "Не поняла время события." };
    if (!execUrl()) return { ok: false, reason: NOT_CONNECTED };
    const ok = await run("Добавляем событие…", { action: "addEvent", title: text, start: String(start), location: String(location || "") });
    return ok ? { ok: true } : { ok: false, reason: "Не удалось добавить событие: " + lastError };
  };

  // Events for the launcher's own calendar: a quiet request that does not change the sheet's status line.
  // A failed request keeps the events that were stored before; the sheet shows its own errors on a manual refresh.
  let lastCalendarSync = 0;
  window.googleHubSyncCalendar = async function (force) {
    if (!execUrl() || syncing) return false;
    if (!force && Date.now() - lastCalendarSync < CALENDAR_SYNC_MS) return false;
    syncing = true;
    try {
      apply(await callApi({}));
      lastCalendarSync = Date.now();
      if (sheet) setStatus("Обновлено в " + synced);
      return true;
    } catch (error) {
      return false;
    } finally {
      syncing = false;
      render();
    }
  };

  // Mail, contacts and news in the window: the news come with their own action, so the sheet asks for them separately.
  async function loadNews() {
    if (!execUrl()) return;
    try {
      const body = await callApi({ action: "getNews", feedUrl: readStored(FEED_KEY, DEFAULT_FEED), newsApiKey: readStored(NEWS_KEY_KEY, "") });
      if (Array.isArray(body.news)) data.news = normalizeNews(body.news);
      render();
    } catch (error) {
      setNote("Новости: " + (error.message || "ошибка"), true);
    }
  }

  function refresh() {
    if (!execUrl()) {
      setStatus("Не подключено");
      setNote("Укажите адрес веб-приложения и ключ в «Подключение».", true);
      sheet.querySelector(".gh-settings").open = true;
      return;
    }
    run("Синхронизация…", {}).then(ok => { if (ok) loadNews(); });
  }

  function save() {
    const url = sheet.querySelector(".gh-url").value.trim();
    const key = sheet.querySelector(".gh-secret").value.trim();
    const newsKey = sheet.querySelector(".gh-newsapi").value.trim();
    const feed = sheet.querySelector(".gh-feed").value.trim() || DEFAULT_FEED;
    if (url && !/^https:\/\//.test(url)) {
      setNote("Адрес должен начинаться с https://", true);
      return;
    }
    writeStored(URL_KEY, url);
    writeStored(SECRET_KEY, key);
    writeStored(NEWS_KEY_KEY, newsKey);
    writeStored(FEED_KEY, feed);
    sheet.querySelector(".gh-settings").open = false;
    if (!url) {
      data.calendar = [];
      data.mail = [];
      data.contacts = [];
      data.news = [];
      writeStored(EVENTS_KEY, "");
      window.dispatchEvent(new Event("google-calendar-updated"));
      setStatus("Не подключено");
      setNote("Подключение сброшено.");
      render();
      return;
    }
    run("Синхронизация…", {}).then(ok => { if (ok) loadNews(); });
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
    calendar(event) {
      const row = element("div", "gh-item");
      const text = element("div", "gh-item-text");
      text.appendChild(element("div", "gh-item-title", event.title || "(Без названия)"));
      const when = formatWhen(event.start || event.time);
      const place = event.location ? " • " + event.location : "";
      if (when || place) text.appendChild(element("div", "gh-item-meta", (when || "") + place));
      row.appendChild(text);
      return row;
    },
    mail(message) {
      const threadId = String(message.threadId || message.id || "");
      const row = element("div", "gh-item gh-mail-row");
      const text = element("div", "gh-item-text");
      text.appendChild(element("div", "gh-item-title", message.subject || "(Без темы)"));
      const meta = [message.from, message.date].filter(Boolean).join(" • ");
      if (meta) text.appendChild(element("div", "gh-item-meta", meta));
      row.appendChild(text);
      const actions = element("div", "gh-item-actions");
      actions.appendChild(button("gh-reply gh-mail-action", "Ответить", threadId));
      const askDelete = confirmDeleteId === threadId;
      const del = button("gh-delete gh-mail-action" + (askDelete ? " danger" : ""), askDelete ? "Точно удалить" : "Удалить", threadId);
      actions.appendChild(del);
      row.appendChild(actions);
      if (openReplyId === threadId) {
        const box = element("div", "gh-reply-box");
        const input = element("input", "gh-reply-input");
        input.type = "text";
        input.placeholder = "Текст ответа";
        input.autocomplete = "off";
        input.maxLength = 1000;
        input.dataset.thread = threadId;
        input.value = replyDrafts[threadId] || "";
        box.appendChild(input);
        const askSend = confirmSendId === threadId;
        box.appendChild(button("gh-send gh-mail-action" + (askSend ? " confirm" : ""), askSend ? "Точно отправить" : "Отправить", threadId));
        row.appendChild(box);
      }
      return row;
    },
    contacts(contact) {
      const row = element("div", "gh-item");
      const text = element("div", "gh-item-text");
      text.appendChild(element("div", "gh-item-title", contact.name || "(Без имени)"));
      const meta = [contact.birthday ? "🎂 " + contact.birthday : "", contact.phone].filter(Boolean).join(" • ");
      if (meta) text.appendChild(element("div", "gh-item-meta", meta));
      row.appendChild(text);
      return row;
    },
    news(item) {
      const row = element("div", "gh-item");
      const text = element("div", "gh-item-text");
      text.appendChild(element("div", "gh-item-title", item.title));
      const meta = [item.source, item.date].filter(Boolean).join(" • ");
      if (meta) text.appendChild(element("div", "gh-item-meta", meta));
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

  function mailItems() {
    return mailFolder === "all" ? data.mail : data.mail.filter(item => item.folder === mailFolder);
  }

  function newsItems() {
    return newsSource === "all" ? data.news : data.news.filter(item => item.source === newsSource);
  }

  // The filter rows: mail folders, and the news sources that the feed actually has.
  function renderFilters() {
    const mailBar = sheet.querySelector(".gh-mail-bar");
    mailBar.textContent = "";
    MAIL_FOLDERS.forEach(([key, label]) => {
      const node = element("button", "gh-filter" + (mailFolder === key ? " active" : ""), label);
      node.type = "button";
      node.dataset.folder = key;
      mailBar.appendChild(node);
    });
    const newsBar = sheet.querySelector(".gh-news-bar");
    newsBar.textContent = "";
    const sources = ["all", ...Array.from(new Set(data.news.map(item => item.source)))];
    if (!sources.includes(newsSource)) newsSource = "all";
    sources.forEach(source => {
      const node = element("button", "gh-filter" + (newsSource === source ? " active" : ""), source === "all" ? "Все" : source);
      node.type = "button";
      node.dataset.source = source;
      newsBar.appendChild(node);
    });
  }

  // While the car moves, replies and deletions are off; the lists can still be read.
  function syncDriving() {
    if (!sheet) return;
    const driving = moving();
    sheet.querySelector(".gh-drive").classList.toggle("on", driving);
    sheet.querySelectorAll(".gh-mail-action, .gh-reply-input").forEach(node => { node.disabled = driving || pendingActions > 0; });
    sheet.querySelector(".gh-refresh").disabled = pendingActions > 0;
  }

  function render() {
    if (!sheet) return;
    const counts = { calendar: data.calendar, mail: data.mail, contacts: data.contacts, news: data.news };
    TABS.forEach(item => {
      const node = sheet.querySelector('.gh-tab[data-tab="' + item.key + '"]');
      node.textContent = item.label + " (" + counts[item.key].length + ")";
      node.classList.toggle("active", tab === item.key);
      sheet.querySelector('.gh-pane[data-pane="' + item.key + '"]').classList.toggle("active", tab === item.key);
    });
    renderFilters();
    fillList(sheet.querySelector('.gh-pane[data-pane="calendar"] .gh-list'), data.calendar, TABS[0].empty, rowBuilders.calendar);
    fillList(sheet.querySelector('.gh-pane[data-pane="mail"] .gh-list'), mailItems(), TABS[1].empty, rowBuilders.mail);
    fillList(sheet.querySelector('.gh-pane[data-pane="contacts"] .gh-list'), data.contacts, TABS[2].empty, rowBuilders.contacts);
    fillList(sheet.querySelector('.gh-pane[data-pane="news"] .gh-list'), newsItems(), TABS[3].empty, rowBuilders.news);
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

  async function sendReply(threadId, text) {
    const body = String(text || "").trim();
    if (!threadId || !body) return;
    if (moving()) { setNote("На ходу письма не отправляем.", true); return; }
    confirmSendId = "";
    const ok = await run("Отправляем ответ…", { action: "replyMail", threadId, body });
    if (ok) {
      delete replyDrafts[threadId];
      openReplyId = "";
      render();
    }
  }

  async function deleteMail(threadId) {
    if (!threadId) return;
    if (moving()) { setNote("На ходу письма не удаляем.", true); return; }
    confirmDeleteId = "";
    if (openReplyId === threadId) openReplyId = "";
    await run("Удаляем письмо…", { action: "deleteMail", threadId });
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
      '<div class="gh-head"><h3>Google</h3>' +
      '<div class="gh-head-actions">' +
      '<button type="button" class="gh-icon gh-refresh" aria-label="Обновить">⟳</button>' +
      '<button type="button" class="gh-close" aria-label="Закрыть">×</button></div></div>' +
      '<div class="gh-status"></div>' +
      '<div class="gh-tabs">' + tabButtons + '</div>' +
      '<p class="gh-drive">На ходу письма не отправляем и не удаляем.</p>' +
      '<div class="gh-pane" data-pane="calendar"><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="mail"><div class="gh-subbar gh-mail-bar"></div><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="contacts"><div class="gh-list"></div></div>' +
      '<div class="gh-pane" data-pane="news"><div class="gh-subbar gh-news-bar"></div><div class="gh-list"></div></div>' +
      '<p class="gh-note" aria-live="polite"></p>' +
      '<details class="gh-settings"><summary>Подключение</summary>' +
      '<label>Адрес веб-приложения (/exec)<input type="url" class="gh-url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
      '<label>Ключ (SECRET)<input type="password" class="gh-secret" autocomplete="off"></label>' +
      '<label>Ключ NewsAPI (необязательно)<input type="password" class="gh-newsapi" autocomplete="off"></label>' +
      '<label>Лента новостей (RSS)<input type="url" class="gh-feed" autocomplete="off" placeholder="https://…"></label>' +
      '<button type="button" class="gh-save">Сохранить</button></details>' +
      '<div class="gh-foot"><span class="gh-hint">Чат — в «Ассистенте»</span><button type="button" class="gh-nav">Открыть навигатор</button></div>' +
      '</div>';
    sheet.addEventListener("click", event => {
      const target = event.target;
      if (target === sheet) { sheet.hidden = true; return; }
      if (!(target instanceof Element)) return;
      const tabButton = target.closest(".gh-tab");
      if (tabButton) { tab = tabButton.dataset.tab; render(); return; }
      const filter = target.closest(".gh-filter");
      if (filter) {
        if (filter.dataset.folder) mailFolder = filter.dataset.folder;
        else newsSource = filter.dataset.source;
        render();
        return;
      }
      const reply = target.closest(".gh-reply");
      if (reply) {
        const id = reply.dataset.thread;
        openReplyId = openReplyId === id ? "" : id;
        confirmSendId = "";
        render();
        return;
      }
      const del = target.closest(".gh-delete");
      if (del) {
        const id = del.dataset.thread;
        if (confirmDeleteId !== id) { confirmDeleteId = id; render(); return; }
        deleteMail(id);
        return;
      }
      const send = target.closest(".gh-send");
      if (send) {
        const id = send.dataset.thread;
        const row = send.closest(".gh-mail-row");
        const input = row ? row.querySelector(".gh-reply-input") : null;
        if (!input || !input.value.trim()) { setNote("Напишите текст ответа.", true); return; }
        // Ответ нельзя отозвать: первое нажатие просит подтверждение, второе отправляет.
        if (confirmSendId !== id) { confirmSendId = id; render(); return; }
        sendReply(id, input.value);
        return;
      }
      if (target.closest(".gh-close")) { sheet.hidden = true; return; }
      if (target.closest(".gh-refresh")) { refresh(); return; }
      if (target.closest(".gh-nav")) { openNavigator(); return; }
      if (target.closest(".gh-save")) save();
    });
    sheet.addEventListener("input", event => {
      const input = event.target;
      if (!(input instanceof Element) || !input.classList.contains("gh-reply-input")) return;
      const id = input.dataset.thread;
      replyDrafts[id] = input.value;
      // The text changed after the confirmation: the confirmation no longer counts, the button goes back to «Отправить».
      if (confirmSendId === id) {
        confirmSendId = "";
        const row = input.closest(".gh-mail-row");
        const send = row ? row.querySelector(".gh-send") : null;
        if (send) { send.textContent = "Отправить"; send.classList.remove("confirm"); }
      }
    });
    // While the sheet is open, keep the driving state in step with the car.
    setInterval(() => { if (!sheet.hidden) syncDriving(); }, 1000);
    document.body.appendChild(sheet);
    return sheet;
  }

  function openSheet() {
    ensureSheet();
    sheet.querySelector(".gh-url").value = execUrl();
    sheet.querySelector(".gh-secret").value = secret();
    sheet.querySelector(".gh-newsapi").value = readStored(NEWS_KEY_KEY, "");
    sheet.querySelector(".gh-feed").value = readStored(FEED_KEY, DEFAULT_FEED);
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

  // Google events and tasks reach the launcher's calendar at start and then on a timer (see CALENDAR_SYNC_MS).
  setTimeout(() => window.googleHubSyncCalendar(true), 3000);
  setInterval(() => window.googleHubSyncCalendar(false), CALENDAR_TICK_MS);

  if (!bindButton()) {
    const timer = setInterval(() => { if (bindButton()) clearInterval(timer); }, 500);
  }
})();
