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
  button.addEventListener("click", () => launchApp(appPackage(app), button));
  return button;
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
  renderAppDrawer();
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
    pre.textContent = JSON.stringify({ apps: state.apps || [], lastMusic: state.lastMusicRaw || null }, null, 1);
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
