// The slot picker: the sheet that assigns an action, app, combination or seat control to a slot.
// Each page offers its own group; the apps page offers installed apps and combinations.
// Loaded before app.js; the functions stay plain globals.

// Which group of actions each page offers.
const PAGE_GROUPS = { climate: "seats", windows: "car", screen: "screen" };

function openPicker(index) {
  state.pickerSlot = index;
  state.query = "";
  document.getElementById("picker-search").value = "";
  document.getElementById("picker").hidden = false;
  document.getElementById("picker-remove").hidden = false;
  renderPicker();
  // No auto-focus: focusing the search field would bring up the on-screen keyboard.
}

function closePicker() {
  document.getElementById("picker").hidden = true;
  state.pickerSlot = null;
  renderSlots();
}

// Commands of the climate page: seats, heating, temperature, fans and air flows.
const CLIMATE_PATTERN = /heat|vent|temp|recirc|defrost|climate|air_|fan|vibor/i;

function isClimateCommand(command) {
  return CLIMATE_ACTIONS.has(command) || CLIMATE_PATTERN.test(command);
}

// The group of one item. "sound" is hidden: its items are offered nowhere.
function pickerGroup(item) {
  if (item.type === "level" || item.type === "temp") return "seats";
  if (item.type === "split") return "splits";
  if (item.type !== "action") return "screen";
  const command = item.command || "";
  if (APP_ACTIONS.includes(command)) return "apps";
  if (CLIMATE_PATTERN.test(command)) return "seats";
  if (/window|trunk|shtork|sunroof|roof|parking|lock|fuel|glove|open_|close_/i.test(command)) return "car";
  if (/volume|mute|media|alisa|spich/i.test(command)) return "sound";
  return "screen";
}

// Saved combinations live in JCarTools; hiding one here only removes it from this launcher's list.
const HIDDEN_SPLITS_KEY = "generic_launcher_hidden_splits_v1";

function hiddenSplits() {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_SPLITS_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function hideSplit(raw) {
  const list = hiddenSplits();
  if (!list.includes(raw)) list.push(raw);
  try { localStorage.setItem(HIDDEN_SPLITS_KEY, JSON.stringify(list)); } catch { /* best effort */ }
}

function restoreSplits() {
  try { localStorage.removeItem(HIDDEN_SPLITS_KEY); } catch { /* best effort */ }
}

function pickerApps() {
  return state.apps.map(app => ({
    type: "app",
    packageName: app.package || app.packageName || app.id,
    label: app.name || app.label || app.package || "Приложение",
    detail: app.package || app.packageName || "Приложение",
    icon: app.icon || "",
    symbol: "A"
  })).filter(app => app.packageName);
}

function pickerItems() {
  const source = state.actions.length ? state.actions : FALLBACK_ACTIONS;
  const available = [...new Set([
    ...source.filter(command => ![...SUNROOF_MERGED, ...HEAT_MERGED, ...MEMORY_MERGED, ...CYCLE_MERGED, ...MEDIA_MERGED, ...TEMP_MERGED].includes(command)),
    SUNROOF_TOGGLE,
    ROOF_TOGGLE,
    ...Object.keys(HEAT_TOGGLES),
    ...Object.keys(MEMORY_TOGGLES),
    ...Object.keys(CYCLE_TOGGLES)
  ])];
  const groupedCommands = new Set();
  const onClimate = state.page === "climate";
  const levels = LEVEL_GROUPS
    .filter(group => hasLevelGroup(group, available))
    .map(group => {
      [group.off, `${group.id}_0`, `${group.id}_1`, `${group.id}_2`, `${group.id}_3`].forEach(command => groupedCommands.add(command));
      return { type: "level", id: group.id, label: group.label, detail: `${group.detail} · уровни 0–3`, symbol: group.icon };
    });
  const shownLevels = onClimate ? levels : [];
  const tempItems = onClimate
    ? Object.entries(TEMP_ZONES).map(([zone, info]) => ({ type: "temp", zone, label: info.label, detail: "+ сверху · − снизу", symbol: "°" }))
    : [];
  const actions = available
    .filter(command => !groupedCommands.has(command))
    .filter(command => (onClimate ? isClimateCommand(command) : !isClimateCommand(command)))
    .map(command => ({ type: "action", command, label: actionLabel(command), detail: command, symbol: commandIcon(command) }));
  const hidden = hiddenSplits();
  const splits = state.splits.map(split => {
    const ratio = [30, 50, 70].includes(Number(split.ratio)) ? Number(split.ratio) : 50;
    return {
      type: "split",
      raw: split.raw,
      packageName: split.packageName || "",
      packageName2: split.packageName2 || "",
      orient: Number(split.orient) === 2 ? 2 : 1,
      ratio,
      label: split.label || "Сохранённая комбинация",
      detail: `Комбинация · ${ratio}/${100 - ratio}`,
      icon: split.icon || "",
      symbol: "▥"
    };
  }).filter(split => split.raw && !hidden.includes(split.raw));

  // Each page offers its own group; the screen page also offers combinations and the installed apps.
  const group = PAGE_GROUPS[state.page];
  const groupItems = [...shownLevels, ...tempItems, ...actions].filter(item => pickerGroup(item) === group);
  if (state.page === "combos") return splits;
  if (state.page === "apps") {
    const appActions = actions.filter(item => pickerGroup(item) === "apps");
    return [...appActions, ...pickerApps()];
  }
  return groupItems;
}

function renderPicker() {
  const query = state.query.trim().toLocaleLowerCase("ru");
  const items = pickerItems().filter(item => !query || `${item.label} ${item.detail}`.toLocaleLowerCase("ru").includes(query));
  const grid = document.getElementById("picker-grid");
  grid.innerHTML = "";
  const combosPage = state.page === "combos";
  if (!items.length) {
    const empty = combosPage ? "Сохранённых комбинаций нет" : "Здесь пока нечего добавить";
    grid.innerHTML = `<div class="picker-empty">${query ? "Ничего не найдено" : empty}</div>`;
    if (combosPage && !query && hiddenSplits().length) {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "picker-restore";
      restore.textContent = "Вернуть скрытые комбинации";
      restore.addEventListener("click", () => { restoreSplits(); renderPicker(); });
      grid.appendChild(restore);
    }
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "picker-item";
    const itemIcon = item.icon || (item.type === "action" ? actionIcon(item.command) : "");
    const icon = itemIcon ? `<img src="${imageSource(itemIcon)}" alt="" loading="lazy" decoding="async">` : (String(item.symbol || "").startsWith("<svg") ? item.symbol : escapeHtml(item.symbol || "↗"));
    button.innerHTML = `<span class="picker-item-icon">${icon}</span><span class="picker-item-copy"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></span>`;
    button.addEventListener("click", () => assignPickerItem(item));
    if (combosPage && item.type === "split") {
      const row = document.createElement("div");
      row.className = "picker-split-row";
      row.appendChild(button);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "picker-split-delete";
      remove.setAttribute("aria-label", "Убрать из списка");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        hideSplit(item.raw);
        showToast("Убрано из лаунчера. Саму комбинацию удалите в JCarTools");
        renderPicker();
      });
      row.appendChild(remove);
      fragment.appendChild(row);
      return;
    }
    fragment.appendChild(button);
  });
  grid.appendChild(fragment);
}

function schedulePickerRender() {
  if (state.pickerRenderPending) return;
  state.pickerRenderPending = true;
  requestAnimationFrame(() => {
    state.pickerRenderPending = false;
    const picker = document.getElementById("picker");
    if (picker && !picker.hidden) renderPicker();
  });
}

function assignPickerItem(item) {
  if (state.pickerSlot == null) return;
  if (item.type === "level") {
    state.slots[state.pickerSlot] = { type: "level", id: item.id, level: 0 };
  } else if (item.type === "temp") {
    state.slots[state.pickerSlot] = { type: "temp", zone: item.zone };
  } else if (item.type === "app") {
    state.slots[state.pickerSlot] = { type: "app", packageName: item.packageName, label: item.label, icon: item.icon || "" };
  } else if (item.type === "split") {
    state.slots[state.pickerSlot] = {
      type: "split",
      raw: item.raw,
      packageName: item.packageName,
      packageName2: item.packageName2,
      orient: item.orient,
      ratio: item.ratio,
      label: item.label,
      icon: item.icon || ""
    };
  } else {
    state.slots[state.pickerSlot] = { type: "action", command: item.command, label: item.label, icon: actionIcon(item.command) };
  }
  saveSlots();
  renderSlots();
  closePicker();
  showToast("Слот обновлён");
}
