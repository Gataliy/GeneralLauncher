// Settings sheet with tabs: appearance, wallpapers, cards, about. Opened from the "Настройки" button next to the slots.
(function () {
  const BUILD = window.LAUNCHER_VERSION || (() => {
    const src = document.querySelector('script[src*="settings.js"]')?.getAttribute("src") || "";
    const match = src.match(/v=([\d.]+)/);
    return match ? match[1] : "—";
  })();
  const TABS = [
    { id: "look", title: "Внешний вид" },
    { id: "wallpapers", title: "Обои" },
    { id: "cards", title: "Карточки" },
    { id: "about", title: "О программе" }
  ];
  const sheet = document.createElement("div");
  sheet.className = "set-sheet";
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="set-card" role="dialog" aria-modal="true" aria-label="Настройки">
      <div class="set-head"><h2>Настройки</h2><button type="button" class="set-close" aria-label="Закрыть">×</button></div>
      <div class="set-tabs">${TABS.map((tab, i) => `<button type="button" data-tab="${tab.id}"${i === 0 ? ' class="active"' : ""}>${tab.title}</button>`).join("")}</div>
      <div class="set-body"></div>
    </div>`;
  document.body.appendChild(sheet);
  const body = sheet.querySelector(".set-body");
  let tab = "look";
  let resetArmed = false;
  let resetTimer = null;

  function themeChoice() {
    try { return localStorage.getItem("generic_launcher_theme_manual_v1") || "auto"; } catch (e) { return "auto"; }
  }

  function render() {
    sheet.querySelectorAll(".set-tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "look") renderLook();
    if (tab === "wallpapers") renderWallpapers();
    if (tab === "cards") renderCards();
    if (tab === "about") renderAbout();
  }

  function renderLook() {
    const current = themeChoice();
    const options = [["auto", "Как в машине"], ["light", "Светлая"], ["dark", "Тёмная"]];
    const carAnimOptions = [["off", "Выкл"], ["fast", "Быстро"], ["normal", "Обычно"]];
    body.innerHTML = `
      <p class="set-note">Тема по умолчанию берётся из машины. Выберите вручную, если машина присылает не то.</p>
      <div class="set-row">${options.map(([v, t]) => `<button type="button" data-theme="${v}" class="${current === v ? "on" : ""}">${t}</button>`).join("")}</div>
      <p class="set-note">Анимация открытия окон, багажника, люка и шторки на экране машины.</p>
      <div class="set-row">${carAnimOptions.map(([v, t]) => `<button type="button" data-caranim="${v}" class="${carAnimMode() === v ? "on" : ""}">${t}</button>`).join("")}</div>`;
    body.querySelectorAll("[data-caranim]").forEach(button => button.addEventListener("click", () => {
      try { localStorage.setItem("generic_launcher_car_anim_v1", button.dataset.caranim); } catch (e) { /* keep going */ }
      render();
    }));
    body.querySelectorAll("[data-theme]").forEach(button => button.addEventListener("click", () => {
      const mode = button.dataset.theme;
      try {
        if (mode === "auto") localStorage.removeItem("generic_launcher_theme_manual_v1");
        else localStorage.setItem("generic_launcher_theme_manual_v1", mode);
      } catch (e) { /* keep going */ }
      if (window.reapplyTheme) window.reapplyTheme();
      render();
    }));
  }

  function renderWallpapers() {
    const favorites = loadWallpaperFavorites();
    const items = favorites.length
      ? favorites.map((url, i) => `<div class="set-fav"><span>Обои ${i + 1}</span><button type="button" data-remove="${i}">Удалить</button></div>`).join("")
      : `<p class="set-note">Избранного пока нет. Долгое нажатие на пустом месте главного экрана сохраняет текущие обои.</p>`;
    const source = wallpaperSource();
    const servers = enabledServerIds();
    const sources = [["online", "Из сети"], ["local", "Свои файлы"], ["black", "Чёрный"]];
    let details = "";
    if (source === "online") {
      details = `
        <p class="set-note">Серверы используются по очереди. Выключенные не запрашиваются.</p>
        <div class="set-row">${WALLPAPER_SERVER_IDS.map(server => `<button type="button" data-server="${server.id}" class="${servers.includes(server.id) ? "on" : ""}">${server.name}</button>`).join("")}</div>
        <p class="set-note">Свой сервер: адрес картинки, где {w} и {h} заменяются размером экрана. Пусто — не использовать.</p>
        <div class="set-row set-custom"><input type="url" id="wall-custom" placeholder="https://..." value="${escapeHtml(customServerUrl())}"><button type="button" data-act="custom-save">Сохранить</button></div>`;
    } else if (source === "local") {
      details = `<p class="set-note">Свои обои в сборке: ${LOCAL_WALLPAPERS.length}. Файлы кладутся в assets/wallpapers и перечисляются в wallpaper.js.</p>`;
    } else {
      details = '<p class="set-note">Фон выключен: только чёрный экран.</p>';
    }
    body.innerHTML = `
      <div class="set-row">${sources.map(([v, t]) => `<button type="button" data-source="${v}" class="${source === v ? "on" : ""}">${t}</button>`).join("")}</div>
      ${details}
      <div class="set-row"><button type="button" data-act="new">Новые обои</button><button type="button" data-act="save">Сохранить текущие</button></div>
      ${items}
      ${favorites.length ? `<div class="set-row"><button type="button" data-act="clear">Очистить избранное</button></div>` : ""}`;
    body.querySelector('[data-act="new"]').addEventListener("click", () => { setHeroWallpaper(true); });
    body.querySelector('[data-act="save"]').addEventListener("click", () => {
      const url = currentWallpaperUrl();
      if (!url) { showToast("Обои ещё не загружены"); return; }
      const list = loadWallpaperFavorites().filter(item => item !== url);
      list.unshift(url);
      saveWallpaperFavorites(list.slice(0, WALLPAPER_FAVORITES_MAX));
      render();
    });
    body.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
      const list = loadWallpaperFavorites();
      list.splice(Number(button.dataset.remove), 1);
      saveWallpaperFavorites(list);
      render();
    }));
    body.querySelectorAll("[data-source]").forEach(button => button.addEventListener("click", () => {
      try { localStorage.setItem(WALLPAPER_SOURCE_KEY, button.dataset.source); } catch (error) { /* keep going */ }
      setHeroWallpaper(true);
      render();
    }));
    body.querySelectorAll("[data-server]").forEach(button => button.addEventListener("click", () => {
      const id = button.dataset.server;
      const current = enabledServerIds();
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      if (!next.length) { showToast("Включите хотя бы один сервер"); return; }
      try { localStorage.setItem(WALLPAPER_SERVERS_KEY, JSON.stringify(next)); } catch (error) { /* keep going */ }
      render();
    }));
    const customSave = body.querySelector('[data-act="custom-save"]');
    if (customSave) customSave.addEventListener("click", () => {
      const value = body.querySelector("#wall-custom").value.trim();
      if (value && !/^https?:\/\//i.test(value)) { showToast("Адрес должен начинаться с http:// или https://", 4000); return; }
      try { localStorage.setItem(WALLPAPER_CUSTOM_KEY, value); } catch (error) { /* keep going */ }
      showToast(value ? "Свой сервер сохранён" : "Свой сервер убран");
      setHeroWallpaper(true);
      render();
    });
    const clear = body.querySelector('[data-act="clear"]');
    if (clear) clear.addEventListener("click", () => { saveWallpaperFavorites([]); render(); });
  }

  function renderCards() {
    const names = window.hwCardNames || {};
    body.innerHTML = `
      <p class="set-note">Скрытая карточка запоминает своё место и вернётся на него.</p>
      ${Object.keys(names).map(id => `<button type="button" class="set-switch" data-card="${id}">${names[id]}<b>${window.hwIsHidden && window.hwIsHidden(id) ? "скрыта" : "показана"}</b></button>`).join("")}
      <p class="set-note">Плитки состояния автомобиля</p>
      ${(window.hwTileDefs ? window.hwTileDefs() : []).map(t => `<button type="button" class="set-switch" data-tile="${t.key}">${t.title}<b>${window.hwTileEnabled && window.hwTileEnabled(t.key) ? "показана" : "скрыта"}</b></button>`).join("")}
      <div class="set-row"><button type="button" data-act="layout">Сбросить раскладку карточек</button></div>`;
    body.querySelectorAll("[data-card]").forEach(button => button.addEventListener("click", () => {
      window.hwToggleCard(button.dataset.card);
      render();
    }));
    body.querySelectorAll("[data-tile]").forEach(button => button.addEventListener("click", () => {
      window.hwToggleTile(button.dataset.tile);
      render();
    }));
    body.querySelector('[data-act="layout"]').addEventListener("click", () => {
      window.hwResetLayout();
      render();
    });
  }

  // First press: look for a newer version. Second press (the button then says the version): download it and restart.
  async function checkUpdateClicked(event) {
    const button = event.currentTarget;
    const status = body.querySelector("#update-status");
    button.disabled = true;
    try {
      if (pendingUpdate) {
        status.textContent = "Скачиваю " + pendingUpdate.version + "…";
        const bundle = await downloadUpdate(pendingUpdate);
        status.textContent = "Скачано " + bundle.version + ". Перезапуск…";
        setTimeout(() => location.reload(), 600);
        return;
      }
      status.textContent = "Проверяю…";
      const info = await checkForUpdate();
      if (compareLauncherVersions(info.version, window.LAUNCHER_VERSION) > 0) {
        pendingUpdate = info;
        button.textContent = "Обновить до " + info.version;
        status.textContent = "Есть новая версия " + info.version + ". Нажмите кнопку, чтобы скачать.";
      } else {
        status.textContent = "Установлена последняя версия " + window.LAUNCHER_VERSION + ".";
      }
    } catch (error) {
      status.textContent = "Не получилось: " + error.message;
    } finally {
      button.disabled = false;
    }
  }

  function renderAbout() {
    resetArmed = false;
    body.innerHTML = `
      <div class="set-row"><button type="button" data-act="check-update">Проверить обновления</button>${window.LAUNCHER_FROM_UPDATE ? '<button type="button" data-act="drop-update">Вернуть версию с флешки</button>' : ""}</div>
      <p class="set-note" id="update-status">Generic Launcher, версия ${BUILD}${window.LAUNCHER_FROM_UPDATE ? ", из обновления" : ""}.</p>
      <div class="set-row"><button type="button" data-act="tour">Показать обучение</button></div>
      <div class="set-row"><button type="button" data-act="reset-all">Сбросить все настройки</button></div>
      <p class="set-note">Сбрасываются раскладка, карточки, обои, избранное, тема и слоты. Нужно нажать дважды.</p>`;
    body.querySelector('[data-act="check-update"]').addEventListener("click", checkUpdateClicked);
    const dropButton = body.querySelector('[data-act="drop-update"]');
    if (dropButton) dropButton.addEventListener("click", () => { dropUpdate(); location.reload(); });
    body.querySelector('[data-act="tour"]').addEventListener("click", () => {
      sheet.hidden = true;
      if (typeof window.startTutorial === "function") window.startTutorial();
    });
    body.querySelector('[data-act="reset-all"]').addEventListener("click", event => {
      const button = event.currentTarget;
      if (!resetArmed) {
        resetArmed = true;
        button.textContent = "Точно сбросить всё?";
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { resetArmed = false; button.textContent = "Сбросить все настройки"; }, 3000);
        return;
      }
      try {
        Object.keys(localStorage).filter(key => key.startsWith("generic_launcher_")).forEach(key => localStorage.removeItem(key));
      } catch (e) { /* nothing more to do */ }
      location.reload();
    });
  }

  sheet.querySelector(".set-tabs").addEventListener("click", event => {
    const id = event.target.closest("button")?.dataset.tab;
    if (!id) return;
    tab = id;
    render();
  });
  sheet.querySelector(".set-close").addEventListener("click", () => { sheet.hidden = true; });
  sheet.addEventListener("click", event => { if (event.target === sheet) sheet.hidden = true; });

  // Button next to the slot order button.
  const header = document.querySelector(".actions-title-row");
  if (header) {
    const open = document.createElement("button");
    open.type = "button";
    open.id = "open-settings";
    open.className = "add-slot-button";
    open.textContent = "Настройки";
    open.addEventListener("click", () => { sheet.hidden = false; render(); });
    header.appendChild(open);
  }
})();
