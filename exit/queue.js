// Playlist of the media player: the car's music queue (getMusicQueue) in a sheet, tap a track to switch to it
// (selectMusicQueueItem). The button stays hidden when the player does not report a queue (available: false).
const QUEUE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8"/><path d="M18 15v6M18 15l3-1"/></svg>';
let queueData = null;
let queueQuery = "";

function readQueue() {
  const raw = bridge.call("getMusicQueue", TOKEN);
  const data = parseJson(raw, null);
  queueData = data && data.available && Array.isArray(data.items) && data.items.length ? data : null;
  return queueData;
}

function syncQueueButton() {
  const button = document.getElementById("player-queue");
  if (!button) return;
  button.hidden = !readQueue();
}

function ensureQueueSheet() {
  let sheet = document.getElementById("queue-sheet");
  if (sheet) return sheet;
  sheet = document.createElement("div");
  sheet.id = "queue-sheet";
  sheet.className = "forecast-sheet";
  sheet.hidden = true;
  sheet.innerHTML = '<div class="forecast-card queue-card" role="dialog" aria-label="Плейлист"><h3>Плейлист</h3>' +
    '<div class="search-field queue-search"><span>⌕</span><input id="queue-search-input" type="search" placeholder="Найти трек" autocomplete="off"></div>' +
    '<div class="queue-list"></div><p class="forecast-note"></p></div>';
  // No auto-focus: focusing the search field would bring up the on-screen keyboard.
  sheet.querySelector("#queue-search-input").addEventListener("input", event => { queueQuery = event.target.value; renderQueueList(); });
  sheet.addEventListener("click", event => { if (event.target === sheet) sheet.hidden = true; });
  document.body.appendChild(sheet);
  return sheet;
}

// Tracks whose title or subtitle contains the search text (case-insensitive).
function queueMatches(item, query) {
  if (!query) return true;
  return `${item.title || ""} ${item.subtitle || ""}`.toLowerCase().includes(query);
}

function renderQueueList() {
  const sheet = ensureQueueSheet();
  const list = sheet.querySelector(".queue-list");
  const note = sheet.querySelector(".forecast-note");
  const data = queueData;
  if (!data) { list.innerHTML = ""; note.textContent = "Плеер не отдаёт очередь"; return; }
  const selectable = data.canSelect !== false;
  const query = queueQuery.trim().toLowerCase();
  const items = data.items.filter(item => queueMatches(item, query));
  list.innerHTML = items.map(item => {
    const active = String(item.queueId) === String(data.activeQueueId);
    return `<button type="button" class="queue-row${active ? " on" : ""}" data-queue-id="${escapeHtml(item.queueId)}"${selectable ? "" : " disabled"}>` +
      `<span class="queue-title">${escapeHtml(item.title)}</span><span class="queue-sub">${escapeHtml(item.subtitle || "")}</span></button>`;
  }).join("");
  note.textContent = !selectable ? "Выбор трека этот плеер не поддерживает" : (items.length ? "" : "Ничего не найдено");
}

function renderQueueSheet() {
  const sheet = ensureQueueSheet();
  const input = sheet.querySelector("#queue-search-input");
  queueQuery = "";
  if (input) input.value = "";
  renderQueueList();
}

function selectQueueItem(queueId) {
  if (!queueData || queueData.canSelect === false) return;
  bridge.call("selectMusicQueueItem", TOKEN, queueData.packageName, String(queueId));
  ensureQueueSheet().hidden = true;
  setTimeout(syncQueueButton, 800);
}

function bindQueue() {
  const button = document.getElementById("player-queue");
  if (!button) return;
  button.innerHTML = QUEUE_ICON;
  button.hidden = true;
  button.addEventListener("click", () => {
    if (!readQueue()) { syncQueueButton(); return; }
    renderQueueSheet();
    ensureQueueSheet().hidden = false;
  });
  ensureQueueSheet().addEventListener("click", event => {
    const row = event.target.closest(".queue-row");
    if (!row || row.disabled) return;
    event.stopPropagation();
    selectQueueItem(row.dataset.queueId);
  }, true);
  setTimeout(syncQueueButton, 2500);
  setInterval(syncQueueButton, 5000);
}

bindQueue();
