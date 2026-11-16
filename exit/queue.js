// Playlist of the media player: the car's music queue (getMusicQueue) in a sheet, tap a track to switch to it
// (selectMusicQueueItem). The button stays hidden when the player does not report a queue (available: false).
const QUEUE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8"/><path d="M18 15v6M18 15l3-1"/></svg>';
let queueData = null;

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
  sheet.innerHTML = '<div class="forecast-card" role="dialog" aria-label="Плейлист"><h3>Плейлист</h3><div class="queue-list"></div><p class="forecast-note"></p></div>';
  sheet.addEventListener("click", event => { if (event.target === sheet) sheet.hidden = true; });
  document.body.appendChild(sheet);
  return sheet;
}

function renderQueueSheet() {
  const sheet = ensureQueueSheet();
  const list = sheet.querySelector(".queue-list");
  const note = sheet.querySelector(".forecast-note");
  const data = queueData;
  if (!data) { list.innerHTML = ""; note.textContent = "Плеер не отдаёт очередь"; return; }
  const selectable = data.canSelect !== false;
  list.innerHTML = data.items.map(item => {
    const active = String(item.queueId) === String(data.activeQueueId);
    return `<button type="button" class="queue-row${active ? " on" : ""}" data-queue-id="${escapeHtml(item.queueId)}"${selectable ? "" : " disabled"}>` +
      `<span class="queue-title">${escapeHtml(item.title)}</span><span class="queue-sub">${escapeHtml(item.subtitle || "")}</span></button>`;
  }).join("");
  note.textContent = selectable ? "" : "Выбор трека этот плеер не поддерживает";
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
