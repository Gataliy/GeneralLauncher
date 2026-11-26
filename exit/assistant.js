// Ассистент Gemini: единственный чат с Gemini в лаунчере и одно действие климата с подтверждением.
// «задача: …» в модель не уходит: задачу добавляет Google-хаб (window.googleHubAddTask, google-hub.js).
// Модель только предлагает действие. Команда уходит в очередь лаунчера (enqueueEnumCommand) после «Да».
// Список команд повторяет серверный (assistant-proxy/worker.js). Окна, люк, багажник, двери и замки здесь не разрешены.
(function () {
  // Адрес прокси после развёртывания (assistant-proxy/README.md). Пока пусто, ассистент просит указать адрес.
  const DEFAULT_PROXY_URL = "";
  const URL_KEY = "generic_launcher_assistant_url_v1";
  const TOKEN_KEY = "generic_launcher_assistant_token_v1";
  const HISTORY_TURNS = 6;
  const TASK_COMMAND = /^задача[:\s]+/i;
  const ALLOWED = new Map([
    ["TOGGLE_HEAT_WHEEL", "Подогрев руля"],
    ["TOGGLE_HEAT_WINDSHIELD", "Обогрев лобового стекла"],
    ["TOGGLE_HEAT_REARWINDOW", "Обогрев заднего стекла"],
    ["TOGGLE_RECIRCULATION", "Рециркуляция"],
    ["Driver_Temp_Up", "Температура водителя выше"],
    ["Driver_Temp_Down", "Температура водителя ниже"],
    ["Passenger_Temp_Up", "Температура пассажира выше"],
    ["Passenger_Temp_Down", "Температура пассажира ниже"]
  ]);

  const STYLE = `
  #assistant-sheet { padding-bottom: var(--safe-bottom); }
  .assistant-card { width: min(760px, 100%); max-height: min(640px, calc(100vh - 48px - var(--safe-bottom))); display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; padding: 20px; border: 1px solid var(--line); border-radius: 28px; background: #1a1a1e; box-shadow: 0 30px 90px rgba(0, 0, 0, .55); }
  :root[data-theme="light"] .assistant-card { background: #f5f6f8; }
  .assistant-head { display: flex; justify-content: space-between; align-items: center; }
  .assistant-head h3 { margin: 0; font-size: 24px; font-weight: 600; }
  .assistant-close { width: 48px; height: 48px; border: 0; border-radius: 50%; background: var(--surface-soft); color: var(--text); font-size: 26px; cursor: pointer; }
  .assistant-log { flex: 1 1 auto; min-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px; }
  .assistant-msg { margin: 0; max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 17px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
  .assistant-msg.user { align-self: flex-end; background: rgba(111, 195, 250, .18); }
  .assistant-msg.assistant { align-self: flex-start; background: var(--surface-soft); }
  .assistant-msg.system { align-self: center; color: var(--muted); font-size: 14px; }
  .assistant-confirm { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border: 1px solid var(--accent); border-radius: 16px; }
  .assistant-confirm[hidden] { display: none; }
  .assistant-confirm-text { margin: 0; font-size: 17px; }
  .assistant-confirm-actions { display: flex; gap: 8px; }
  .assistant-confirm-actions button { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface-soft); color: var(--text); font-size: 16px; cursor: pointer; }
  .assistant-confirm-actions button[data-act="yes"] { background: var(--accent); color: #0b1620; border-color: transparent; }
  .assistant-form { display: flex; gap: 8px; }
  .assistant-input { flex: 1; min-width: 0; min-height: 52px; padding: 0 16px; border: 1px solid var(--line); border-radius: 26px; background: var(--surface-soft); color: var(--text); font-size: 17px; }
  .assistant-send { min-height: 52px; padding: 0 22px; border: 0; border-radius: 26px; background: var(--accent); color: #0b1620; font-size: 17px; cursor: pointer; }
  .assistant-settings { font-size: 15px; color: var(--muted); }
  .assistant-settings label { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
  .assistant-settings input { min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); color: var(--text); font-size: 15px; }
  .assistant-save { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 22px; background: transparent; color: var(--text); cursor: pointer; }
  .assistant-note { margin: 0; min-height: 18px; color: var(--muted); font-size: 14px; }
  `;

  const history = [];   // последние реплики для контекста; только в памяти, на диск не пишутся
  let pending = null;   // действие, ожидающее подтверждения
  let busy = false;
  let sheet = null;

  function readStored(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (error) { return fallback; }
  }
  function writeStored(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { console.warn("[Generic Launcher] assistant: настройка не сохранилась", error); }
  }
  function proxyUrl() { return readStored(URL_KEY, DEFAULT_PROXY_URL).trim(); }

  function injectStyle() {
    if (document.getElementById("assistant-style")) return;
    const style = document.createElement("style");
    style.id = "assistant-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function ensureSheet() {
    if (sheet) return sheet;
    injectStyle();
    sheet = document.createElement("div");
    sheet.id = "assistant-sheet";
    sheet.className = "forecast-sheet";
    sheet.hidden = true;
    sheet.innerHTML = '<div class="forecast-card assistant-card" role="dialog" aria-label="Ассистент">' +
      '<div class="assistant-head"><h3>Ассистент</h3><button type="button" class="assistant-close" aria-label="Закрыть">×</button></div>' +
      '<div class="assistant-log" aria-live="polite"></div>' +
      '<div class="assistant-confirm" hidden><p class="assistant-confirm-text"></p>' +
      '<div class="assistant-confirm-actions"><button type="button" data-act="yes">Да</button><button type="button" data-act="no">Нет</button></div></div>' +
      '<form class="assistant-form"><input type="text" class="assistant-input" placeholder="Спросите или «задача: …»" autocomplete="off" maxlength="1000">' +
      '<button type="submit" class="assistant-send">Отправить</button></form>' +
      '<details class="assistant-settings"><summary>Подключение</summary>' +
      '<label>Адрес прокси<input type="url" class="assistant-url" autocomplete="off" placeholder="https://…/chat"></label>' +
      '<label>Ключ доступа<input type="password" class="assistant-token" autocomplete="off"></label>' +
      '<button type="button" class="assistant-save">Сохранить</button></details>' +
      '<p class="assistant-note"></p></div>';
    sheet.querySelector(".assistant-close").addEventListener("click", () => { sheet.hidden = true; });
    // Закрытие по подложке, как у плейлиста.
    sheet.addEventListener("click", event => { if (event.target === sheet) sheet.hidden = true; });
    sheet.querySelector(".assistant-form").addEventListener("submit", event => {
      event.preventDefault();
      const input = sheet.querySelector(".assistant-input");
      const text = input.value.trim();
      if (!text || busy) return;
      input.value = "";
      if (TASK_COMMAND.test(text)) addTaskFromChat(text);
      else ask(text);
    });
    sheet.querySelector(".assistant-confirm").addEventListener("click", event => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "yes") confirmPending();
      if (act === "no") setPending(null);
    });
    sheet.querySelector(".assistant-save").addEventListener("click", () => {
      const url = sheet.querySelector(".assistant-url").value.trim();
      if (url && !/^https:\/\//.test(url)) { setNote("Адрес должен начинаться с https://"); return; }
      writeStored(URL_KEY, url);
      writeStored(TOKEN_KEY, sheet.querySelector(".assistant-token").value.trim());
      setNote(url ? "Сохранено" : "Адрес сброшен, используется стандартный");
    });
    document.body.appendChild(sheet);
    return sheet;
  }

  function fillSettings() {
    sheet.querySelector(".assistant-url").value = readStored(URL_KEY, DEFAULT_PROXY_URL);
    sheet.querySelector(".assistant-token").value = readStored(TOKEN_KEY, "");
    setNote(proxyUrl() ? "" : "Прокси ещё не подключён. Укажите адрес в разделе «Подключение».");
  }

  function setNote(text) { sheet.querySelector(".assistant-note").textContent = text; }

  // Текст реплик вставляется через textContent: ответ модели никогда не становится разметкой.
  function addBubble(role, text) {
    const log = sheet.querySelector(".assistant-log");
    const bubble = document.createElement("p");
    bubble.className = "assistant-msg " + role;
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }

  function remember(userText, reply) {
    history.push({ role: "user", text: userText }, { role: "model", text: reply });
    if (history.length > HISTORY_TURNS * 2) history.splice(0, history.length - HISTORY_TURNS * 2);
  }

  // Действие принимается только из списка и только с известной командой.
  function validAction(action) {
    if (!action || action.name !== "climate_command") return null;
    const command = String(action.command || "");
    return ALLOWED.has(command) ? { command, label: ALLOWED.get(command) } : null;
  }

  function setPending(action) {
    pending = action;
    const box = sheet.querySelector(".assistant-confirm");
    box.hidden = !action;
    if (action) sheet.querySelector(".assistant-confirm-text").textContent = `Выполнить: «${action.label}»?`;
  }

  function confirmPending() {
    const action = pending;
    setPending(null);
    // Повторная проверка перед отправкой в очередь команд.
    if (!action || !ALLOWED.has(action.command)) return;
    if (!bridge.available()) {
      addBubble("system", "Команду можно выполнить только на магнитоле.");
      return;
    }
    enqueueEnumCommand(action.command, action.label);
    addBubble("system", `Отправлено: ${action.label}`);
  }

  // «задача: …» добавляет задачу в Google, если хаб подключён; модель здесь не участвует.
  async function addTaskFromChat(text) {
    addBubble("user", text);
    setPending(null);
    const title = text.replace(TASK_COMMAND, "").trim();
    if (!title) { addBubble("system", "Напишите текст задачи после слова «задача:»."); return; }
    if (typeof window.googleHubAddTask !== "function") { addBubble("system", "Google в этой сборке не подключён."); return; }
    const result = await window.googleHubAddTask(title);
    addBubble("system", result.ok ? `Задача «${title}» добавлена в Google Tasks.` : (result.reason || "Не удалось добавить задачу."));
  }

  async function ask(text) {
    addBubble("user", text);
    setPending(null);
    const url = proxyUrl();
    if (!url) {
      addBubble("system", "Прокси ещё не подключён: укажите адрес в разделе «Подключение».");
      return;
    }
    busy = true;
    setNote("Думаю…");
    const headers = { "content-type": "application/json" };
    const token = readStored(TOKEN_KEY, "");
    if (token) headers["x-app-token"] = token;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text, history: history.slice(-HISTORY_TURNS * 2) })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const reply = typeof data?.reply === "string" ? data.reply.slice(0, 600) : "Нет ответа.";
      remember(text, reply);
      addBubble("assistant", reply);
      const action = validAction(data?.action);
      if (action) setPending(action);
    } catch (error) {
      console.error("[Generic Launcher] assistant", error);
      addBubble("system", "Ассистент недоступен. Проверьте подключение и ключ доступа.");
    } finally {
      busy = false;
      setNote("");
    }
  }

  // Кнопка «Ассистент» стоит перед «Настройками» в той же строке. Настройки создаются своим скриптом,
  // поэтому кнопку добавляем, когда они появятся.
  function bindButton() {
    if (document.getElementById("open-assistant")) return true;
    const settings = document.getElementById("open-settings");
    if (!settings) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "open-assistant";
    button.className = settings.className;
    button.textContent = "Ассистент";
    button.addEventListener("click", () => {
      ensureSheet();
      fillSettings();
      sheet.hidden = false;
    });
    settings.parentNode.insertBefore(button, settings);
    return true;
  }

  if (!bindButton()) {
    const timer = setInterval(() => { if (bindButton()) clearInterval(timer); }, 500);
  }
})();
