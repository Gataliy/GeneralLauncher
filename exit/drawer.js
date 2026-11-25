// App drawer: the third page. Lists the apps the head unit reports and launches them.
// Apps marked as built-in go in their own section. The flag name is not confirmed on the device yet.
// The last tile opens the head unit's own app menu, where the installed/built-in switch lives.
const BUILTIN_APP_FLAGS = ["system", "builtIn", "isSystem"];
const SYSTEM_MENU_COMMAND = "RUN_START_APP_MENU";

function isBuiltInApp(app) {
  return BUILTIN_APP_FLAGS.some(flag => app?.[flag] === true);
}

function appPackage(app) {
  return app.package || app.packageName || app.id || "";
}

function appTile(app) {
  const label = app.label || app.name || appPackage(app) || "Приложение";
  const icon = app.icon
    ? `<img src="${imageSource(app.icon)}" alt="" decoding="async">`
    : escapeHtml(label.trim().charAt(0).toUpperCase() || "A");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "app-tile";
  button.innerHTML = `<span class="app-tile-icon">${icon}</span><span class="app-tile-name">${escapeHtml(label)}</span>`;
  // A tap opens the app; a long press opens the same kind of menu as a slot (see openAppTileMenu).
  let pressTimer = null;
  let longPressed = false;
  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; openAppTileMenu(app, button); }, 700);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(type => button.addEventListener(type, () => clearTimeout(pressTimer)));
  button.addEventListener("click", () => {
    if (longPressed) { longPressed = false; return; }
    launchApp(appPackage(app), button);
  });
  return button;
}

// The menu of a slot, for an app tile. A tile is not a slot, so only the items that apply to an app are offered.
function openAppTileMenu(app, element) {
  document.querySelectorAll(".slot-menu-backdrop").forEach(node => node.remove());
  const canAdd = state.slots.length < MAX_SLOTS;
  const backdrop = document.createElement("div");
  backdrop.className = "slot-menu-backdrop";
  backdrop.innerHTML = `<div class="slot-menu" role="menu" aria-label="Приложение">` +
    `<button type="button" role="menuitem" data-act="open">Открыть</button>` +
    (canAdd ? `<button type="button" role="menuitem" data-act="add">Добавить слот</button>` : "") +
    `</div>`;
  document.body.appendChild(backdrop);
  const menu = backdrop.querySelector(".slot-menu");
  const rect = element.getBoundingClientRect();
  const width = menu.offsetWidth || 200;
  const height = menu.offsetHeight || 120;
  menu.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)) + "px";
  menu.style.top = (rect.bottom + 8 + height <= window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - height - 8)) + "px";
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) { backdrop.remove(); return; }
    const button = event.target.closest("[data-act]");
    if (!button) return;
    backdrop.remove();
    if (button.dataset.act === "open") launchApp(appPackage(app), element);
    else addAppSlot(app);
  });
}

// Puts the app into a new slot at the end of this page, the same as adding an app from the picker.
function addAppSlot(app) {
  if (state.slots.length >= MAX_SLOTS) {
    showToast(`Больше ${MAX_SLOTS} слотов не поместится`);
    return;
  }
  state.slots.push({ type: "app", packageName: appPackage(app), label: app.label || app.name || appPackage(app), icon: app.icon || "" });
  saveSlots();
  renderSlots();
  showToast("Приложение добавлено в слоты");
}

// Opens the head unit's own menu through the same command the old "Все приложения" slot used.
function systemMenuTile() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "app-tile";
  button.innerHTML = '<span class="app-tile-icon">▦</span><span class="app-tile-name">Встроенные приложения</span>';
  button.addEventListener("click", () => runCommand(SYSTEM_MENU_COMMAND, "Встроенные приложения", button));
  return button;
}

function launchApp(packageName, element) {
  if (!packageName) return;
  pulse(element);
  if (bridge.has("requestRunAppAsync")) {
    const requestId = nextRequestId("app");
    state.uiRequests[requestId] = { type: "app" };
    if (!bridge.runAppAsync(requestId, packageName)) {
      delete state.uiRequests[requestId];
      showToast("Приложение временно недоступно");
    }
  } else setTimeout(() => bridge.runApp(packageName), 0);
}

// Diagnostic: a long press on the "Приложения" tab shows the raw list the head unit sent.
function toggleAppsDebug() {
  state.appsDebug = !state.appsDebug;
  document.getElementById("app-drawer").hidden = !state.appsDebug;
  renderAppDrawer();
}

// On the Приложения page, after the slots: every app the head unit reports (installed first, then built-in), then the system menu.
function appendAppTiles(fragment) {
  // Apps already placed as slots on this page are not repeated.
  const placed = new Set(state.slots.filter(slot => slot.type === "app").map(slot => slot.packageName));
  const apps = (state.apps || []).filter(app => app && appPackage(app) && !placed.has(appPackage(app)));
  apps.filter(app => !isBuiltInApp(app)).forEach(app => fragment.appendChild(appTile(app)));
  apps.filter(isBuiltInApp).forEach(app => fragment.appendChild(appTile(app)));
  fragment.appendChild(systemMenuTile());
}

function bindAppsDebug() {
  // The apps tab is gone (apps live on the screen page now); nothing to bind.
  const tab = document.querySelector('[data-page="apps"]');
  if (!tab) return;
  let timer = null;
  tab.addEventListener("pointerdown", () => { timer = setTimeout(toggleAppsDebug, 800); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(type => tab.addEventListener(type, () => clearTimeout(timer)));
}

function renderAppDrawer() {
  const drawer = document.getElementById("app-drawer");
  drawer.replaceChildren();
  if (state.appsDebug) {
    const pre = document.createElement("pre");
    pre.className = "app-debug";
    pre.textContent = JSON.stringify({ apps: state.apps || [], userAppsRaw: state.userAppsRaw || "", catalogAccepted: state.catalogAcceptedAt || "", catalog: state.catalogLog || [], lastMusic: state.lastMusicRaw || null }, null, 1);
    drawer.appendChild(pre);
    return;
  }
  const apps = (state.apps || []).filter(app => app && appPackage(app));
  const builtIn = apps.filter(isBuiltInApp);
  const installed = apps.filter(app => !isBuiltInApp(app));
  const fragment = document.createDocumentFragment();
  const header = title => {
    const element = document.createElement("div");
    element.className = "picker-section eyebrow";
    element.textContent = title;
    fragment.appendChild(element);
  };
  const withHeaders = builtIn.length > 0;
  if (!apps.length) {
    const empty = document.createElement("div");
    empty.className = "picker-empty";
    empty.textContent = "Приложения появятся при запуске экрана в JCarTools";
    fragment.appendChild(empty);
  }
  if (installed.length) {
    if (withHeaders) header("Установленные");
    installed.forEach(app => fragment.appendChild(appTile(app)));
  }
  if (withHeaders) header("Встроенные");
  builtIn.forEach(app => fragment.appendChild(appTile(app)));
  fragment.appendChild(systemMenuTile());
  drawer.appendChild(fragment);
}
