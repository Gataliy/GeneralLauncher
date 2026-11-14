// Command queue and car-state requests: one JCarTools command at a time, with a watchdog.
// Loaded after bridge.js and before app.js; the functions stay plain globals.
function clearStateRequest() {
  clearTimeout(state.stateRequestTimer);
  state.stateRequestTimer = null;
  state.stateRequestPending = false;
  state.stateRequestId = null;
}

function pollCarState() {
  if (!bridge.has("requestCarDataAsync") || state.stateRequestPending || state.commandInFlight) return;
  const requestId = nextRequestId("state");
  state.stateRequestPending = true;
  state.stateRequestId = requestId;
  if (!bridge.requestCarDataAsync(requestId, CAR_STATE_REQUEST_NAME)) {
    clearStateRequest();
    return;
  }
  state.stateRequestTimer = setTimeout(clearStateRequest, COMMAND_WATCHDOG_MS);
}

function enqueueEnumCommand(command, label, coalesceKey = null) {
  if (!bridge.available()) return;
  const item = { command, label, coalesceKey, requestId: null, watchdog: null };
  if (coalesceKey) {
    const queuedIndex = state.commandQueue.findIndex(queued => queued.coalesceKey === coalesceKey);
    if (queuedIndex >= 0) state.commandQueue[queuedIndex] = item;
    else state.commandQueue.push(item);
  } else {
    state.commandQueue.push(item);
  }
  dispatchNextEnumCommand();
}

function dispatchNextEnumCommand() {
  if (state.commandInFlight || !state.commandQueue.length) return;
  const item = state.commandQueue.shift();
  item.requestId = nextRequestId("enum");
  state.commandInFlight = item;

  const carJson = carCommandJson(item.command);
  if (carJson && bridge.has("requestCarCommandAsync")) {
    if (!bridge.requestCarCommandAsync(item.requestId, carJson)) {
      finishEnumCommand(item.requestId);
      showToast("Команда временно недоступна");
      return;
    }
    item.watchdog = setTimeout(() => finishEnumCommand(item.requestId), COMMAND_WATCHDOG_MS);
    return;
  }

  if (bridge.has("requestRunEnumAsync")) {
    if (!bridge.runEnumAsync(item.requestId, item.command)) {
      finishEnumCommand(item.requestId);
      showToast("Команда временно недоступна");
      return;
    }
    item.watchdog = setTimeout(() => finishEnumCommand(item.requestId), COMMAND_WATCHDOG_MS);
    return;
  }

  setTimeout(() => {
    bridge.runEnum(item.command);
    finishEnumCommand(item.requestId);
  }, 0);
}

function finishEnumCommand(requestId, response = null) {
  const item = state.commandInFlight;
  if (!item || item.requestId !== requestId) return;
  clearTimeout(item.watchdog);
  state.commandInFlight = null;
  if (response?.error) showToast("Команда не выполнена");
  setTimeout(dispatchNextEnumCommand, 70);
  setTimeout(pollCarState, 350);
  setTimeout(pollSunroof, 350);
  setTimeout(pollCabinTemps, 350);
}

function handleCarResponse(raw) {
  const event = parseJson(raw, raw) || {};
  const response = parseJson(event.response, event.response) || {};
  if (String(event.requestId || "").startsWith("carst_")) {
    if (typeof window.applyCarStateCommand === "function") window.applyCarStateCommand(String(event.requestId), response);
    return;
  }
  if (String(event.requestId || "").startsWith("dm_get_") || String(event.requestId || "").startsWith("dm_set_")) {
    if (typeof window.applyDriveMode === "function") window.applyDriveMode(response);
    return;
  }
  if (String(event.requestId || "").startsWith("fan_")) {
    if (String(event.requestId).startsWith("fan_get_") && typeof window.applyFanResponse === "function") window.applyFanResponse(response);
    return;
  }
  if (event.requestType === "runEnum" || event.requestType === "command") {
    finishEnumCommand(event.requestId, response);
    return;
  }
  if (event.requestType === "data" && String(event.requestId || "").startsWith("veh_")) {
    if (!response.error) applyVehicleSnapshot(response);
    return;
  }
  if (event.requestType === "data" && event.requestId === state.stateRequestId) {
    clearStateRequest();
    if (!response.error) applyCarState(response);
    return;
  }
  if (event.requestType === "data" && event.requestId === state.sunRequestId) {
    clearSunRequest();
    if (!response.error) applySunroof(response);
    return;
  }
  if (event.requestType === "data" && event.requestId === state.tempRequestId) {
    clearTempRequest();
    if (!response.error) applyCabinTemps(response);
    return;
  }
  if (event.requestType === "runApp" || event.requestType === "runSavedSplit") {
    const pending = state.uiRequests[event.requestId];
    delete state.uiRequests[event.requestId];
    if (!pending || !response.error) return;
    showToast(response.error === "split_not_found"
      ? "Комбинация больше не сохранена"
      : response.error === "app_not_found"
        ? "Приложение больше не установлено"
        : "Не удалось выполнить действие");
  }
}

