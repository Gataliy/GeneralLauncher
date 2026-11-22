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
    { id: "music", title: "Музыка" },
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
    if (tab === "music") renderMusic();
    if (tab === "about") renderAbout();
  }

  // Card style (solid or glass) and accent colour: stored per viewer, applied on load and on change.
  const CARD_STYLE_KEY = "generic_launcher_card_style_v1";
  const ACCENT_KEY = "generic_launcher_accent_v1";
  const ACCENTS = [["default", "#6fc3fa", "Голубой"], ["green", "#7bd88f", "Зелёный"], ["amber", "#ffb454", "Янтарный"], ["pink", "#ff6b8b", "Розовый"], ["violet", "#b39ddb", "Сиреневый"]];
  function cardStyleMode() { try { return localStorage.getItem(CARD_STYLE_KEY) || "solid"; } catch (e) { return "solid"; } }
  function accentMode() { try { return localStorage.getItem(ACCENT_KEY) || "default"; } catch (e) { return "default"; } }
  function applyLook() {
    document.documentElement.dataset.style = cardStyleMode();
    const accent = ACCENTS.find(item => item[0] === accentMode());
    if (accent && accent[0] !== "default") document.documentElement.style.setProperty("--accent", accent[1]);
    else document.documentElement.style.removeProperty("--accent");
  }
  applyLook();

  // Theme preview drawn with inline styles, so it does not depend on the stylesheet (it shows the same on every head unit).
  function themePreview(v) {
    const frame = "position:relative;display:block;width:100%;height:84px;overflow:hidden;border-radius:10px;";
    const box = (top, width, color) => `<i style="position:absolute;left:8px;top:${top};width:${width};height:36%;border-radius:8px;background:${color};"></i>`;
    const plate = (bg, color) => `<span class="look-prev" style="${frame}background:${bg};">${box("8px", "55%", color)}${box("auto", "40%", color).replace("top:auto;", "bottom:8px;")}</span>`;
    if (v === "light") return plate("#f2f5f9", "#ffffff");
    if (v === "dark") return plate("#0a1220", "#1c2b48");
    return `<span class="look-prev" style="${frame}background:linear-gradient(90deg,#0a1220 50%,#f2f5f9 50%);">${box("8px", "36%", "#3a4a63")}${box("auto", "28%", "#8a97a8").replace("top:auto;", "bottom:8px;")}</span>`;
  }
  function renderLook() {
    const current = themeChoice();
    const options = [["auto", "Как в машине"], ["light", "Светлая"], ["dark", "Тёмная"]];
    const carAnimOptions = [["off", "Выкл"], ["fast", "Быстро"], ["normal", "Обычно"]];
    body.innerHTML = `
      <p class="set-note">Тема по умолчанию берётся из машины. Выберите вручную, если машина присылает не то.</p>
      <div class="look-cards">${options.map(([v, t]) => `<button type="button" data-theme="${v}" class="look-card look-${v}${current === v ? " on" : ""}">${themePreview(v)}<span class="look-name">${t}</span><span class="look-radio"></span></button>`).join("")}</div>
      <p class="set-note">Оформление карточек: плотные или стеклянные.</p>
      <div class="set-row">${[["solid", "Плотные"], ["glass", "Стекло"]].map(([v, t]) => `<button type="button" data-cardstyle="${v}" class="${cardStyleMode() === v ? "on" : ""}">${t}</button>`).join("")}</div>
      <p class="set-note">Акцентный цвет кнопок и подсветки.</p>
      <div class="set-row">${ACCENTS.map(([v, c, t]) => `<button type="button" data-accent="${v}" class="accent-dot${accentMode() === v ? " on" : ""}" style="background:${c} !important" aria-label="${t}" title="${t}"></button>`).join("")}</div>
      <p class="set-note">Анимация открытия окон, багажника, люка и шторки на экране машины.</p>
      <div class="set-row">${carAnimOptions.map(([v, t]) => `<button type="button" data-caranim="${v}" class="${carAnimMode() === v ? "on" : ""}">${t}</button>`).join("")}</div>`;
    body.insertAdjacentHTML("beforeend", '<div class="look-actions"><button type="button" class="look-reset" data-look-reset>Сбросить</button><button type="button" class="look-done" data-look-done>Готово</button></div>');
    body.querySelector("[data-look-reset]").addEventListener("click", () => {
      try {
        localStorage.removeItem("generic_launcher_theme_manual_v1");
        localStorage.removeItem(CARD_STYLE_KEY);
        localStorage.removeItem(ACCENT_KEY);
      } catch (e) { /* keep going */ }
      applyLook();
      if (window.reapplyTheme) window.reapplyTheme();
      render();
    });
    body.querySelector("[data-look-done]").addEventListener("click", () => { sheet.hidden = true; });
    body.querySelectorAll("[data-caranim]").forEach(button => button.addEventListener("click", () => {
      try { localStorage.setItem("generic_launcher_car_anim_v1", button.dataset.caranim); } catch (e) { /* keep going */ }
      render();
    }));
    body.querySelectorAll("[data-cardstyle]").forEach(button => button.addEventListener("click", () => {
      try { localStorage.setItem(CARD_STYLE_KEY, button.dataset.cardstyle); } catch (e) { /* keep going */ }
      applyLook();
      render();
    }));
    body.querySelectorAll("[data-accent]").forEach(button => button.addEventListener("click", () => {
      try { localStorage.setItem(ACCENT_KEY, button.dataset.accent); } catch (e) { /* keep going */ }
      applyLook();
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
    const favCards = favorites.map((url, i) => `<div class="look-card fav-card"><span class="look-prev"><img src="${escapeHtml(url)}" alt=""></span><span class="look-name">Обои ${i + 1}</span><button type="button" class="fav-remove" data-remove="${i}">Удалить</button></div>`).join("");
    const source = wallpaperSource();
    const servers = enabledServerIds();
    const sources = [["online", "Из сети"], ["local", "Свои файлы"], ["black", "Чёрный"]];
    // Real pictures: the wallpaper now on screen for "Из сети" (a bundled one until a wallpaper loads), the first bundled picture for "Свои файлы", a black-and-white bundled picture for "Чёрный".
    const sourcePreview = v => {
      if (v === "black") return `<img class="bw-cycle" src="${escapeHtml(LOCAL_WALLPAPERS[bwIndex % LOCAL_WALLPAPERS.length])}" alt="">`;
      const url = v === "online" ? (currentWallpaperUrl() || LOCAL_WALLPAPERS[1] || "") : (LOCAL_WALLPAPERS[0] || "");
      return url ? `<img src="${escapeHtml(url)}" alt="">` : "<i></i><i></i>";
    };
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
      <div class="look-cards">${sources.map(([v, t]) => `<button type="button" data-source="${v}" class="look-card look-src-${v}${source === v ? " on" : ""}"><span class="look-prev">${sourcePreview(v)}</span><span class="look-name">${t}</span><span class="look-radio"></span></button>`).join("")}</div>
      ${details}
      <div class="set-row"><button type="button" data-act="new">Новые обои</button><button type="button" data-act="save">Сохранить текущие</button></div>
      ${favorites.length ? `<div class="fav-grid">${favCards}</div>` : items}
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
      if (button.dataset.source === "black" && source === "black") {
        bwIndex = (bwIndex + 1) % LOCAL_WALLPAPERS.length;
        render();
        return;
      }
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

  // Pictures for the "Чёрный" card: all bundled ones, shown grey, changing every few seconds.
  // Pictures for the black card: all bundled ones, shown grey. A tap on the card when it is already chosen moves to the next one.
  let bwIndex = 0;
  // Small pictures for the widgets in the Cards tab: the same glyph each widget shows on the home screen.
  const SVG_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true">';
  const CARD_ICONS = {
    state: SVG_OPEN + '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4h-2v-2H5v2H3z"/><circle cx="7.5" cy="15" r="1"/><circle cx="16.5" cy="15" r="1"/></svg>',
    nav: SVG_OPEN + '<path d="M12 3l7 17-7-4-7 4z"/></svg>',
    compass: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
    clock: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    weather: SVG_OPEN + '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3 3 0 0 0 7 18z"/></svg>'
  };
  function renderCards() {
    const names = window.hwCardNames || {};
    const cardHidden = id => !!(window.hwIsHidden && window.hwIsHidden(id));
    const tileOn = key => !!(window.hwTileEnabled && window.hwTileEnabled(key));
    body.innerHTML = `
      <div class="set-group">
        <p class="set-note">Виджеты главного экрана</p>
        <div class="set-grid">${Object.keys(names).map((id, i) => `<div class="set-item"><span class="set-thumb has-icon t${i % 3}">${CARD_ICONS[id] || ""}</span><span class="set-item-copy"><strong>${names[id]}</strong><small>${cardHidden(id) ? "Скрыта, вернётся на своё место" : "Показана"}</small></span><button type="button" class="toggle${cardHidden(id) ? "" : " on"}" data-card="${id}" aria-label="${names[id]}"></button></div>`).join("")}</div>
      </div>
      <div class="set-group">
        <p class="set-note">Плитки состояния автомобиля</p>
        <div class="set-grid">${(window.hwTileDefs ? window.hwTileDefs() : []).map(t => `<div class="set-item"><span class="set-item-copy"><strong>${t.title}</strong><small>${tileOn(t.key) ? "Показана" : "Скрыта"}</small></span><button type="button" class="toggle${tileOn(t.key) ? " on" : ""}" data-tile="${t.key}" aria-label="${t.title}"></button></div>`).join("")}</div>
      </div>
      <div class="set-row"><button type="button" data-act="layout">Сбросить раскладку карточек</button></div>
      <p class="set-note">Скрытая карточка запоминает своё место и вернётся на него.</p>`;
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


  // Calibration: lines on the player frame and its cover art, with the gaps above and below the cover (1.2.502).
  let calibFrame = null;
  function openCalibration() {
    let layer = document.getElementById("calib-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "calib-layer";
      layer.innerHTML = '<div class="calib-line" data-k="wt"></div><div class="calib-line" data-k="wb"></div><div class="calib-line" data-k="at"></div><div class="calib-line" data-k="ab"></div><div class="calib-info" id="calib-info"></div><div class="calib-hint"><button type="button" data-calib="cover">Открыть обложку</button><button type="button" data-calib="close">Закрыть</button></div>';
      layer.addEventListener("click", event => {
        const act = event.target.closest("[data-calib]");
        if (!act) return;
        if (act.dataset.calib === "close") { layer.hidden = true; cancelAnimationFrame(calibFrame); return; }
        // Expand the cover from here: the overlay stays on and keeps measuring.
        if (typeof window.expandPlayer === "function" && !state.playerExpanded) window.expandPlayer();
      });
      document.body.appendChild(layer);
    }
    layer.hidden = false;
    const place = () => {
      const widget = document.querySelector(".player-widget");
      const art = widget && widget.querySelector(".album-art");
      if (widget && art) {
        const w = widget.getBoundingClientRect();
        const a = art.getBoundingClientRect();
        const set = (k, y) => { layer.querySelector(`[data-k="${k}"]`).style.top = `${Math.round(y)}px`; };
        set("wt", w.top); set("wb", w.bottom); set("at", a.top); set("ab", a.bottom);
        layer.querySelector("#calib-info").textContent = `сверху ${Math.round(a.top - w.top)} px · снизу ${Math.round(w.bottom - a.bottom)} px`;
      }
      if (!layer.hidden) calibFrame = requestAnimationFrame(place);
    };
    place();
  }
  // Yandex Music token test (1.2.528 working copy). The token is kept only in this head unit's storage, never in the repository.
  const YM_TOKEN_KEY = "generic_launcher_ym_token_v1";
  function ymToken() {
    try { return localStorage.getItem(YM_TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function renderMusic() {
    resetArmed = false;
    const token = ymToken();
    body.innerHTML = `
      <div class="set-group">
        <div class="set-item set-item-head">
          <span class="set-item-copy"><strong>Яндекс Музыка</strong><small>Токен хранится только на этом ГУ</small></span>
          <span class="badge${token ? " ok" : ""}" id="ym-badge">${token ? "Сохранён" : "Не задан"}</span>
        </div>
        <div class="set-row set-custom"><input type="password" id="ym-token" placeholder="Токен OAuth" autocomplete="off" value="${escapeHtml(token)}"></div>
        <div class="set-row set-actions"><button type="button" class="primary" data-act="ym-check">Проверить</button><button type="button" data-act="ym-eye">Показать</button><button type="button" data-act="ym-clear">Удалить</button></div>
      </div>
      <div class="set-group">
        <p class="set-note">Визуализатор под музыкой. Коротким тапом по нему тоже можно переключить стиль.</p>
        <div class="set-grid viz-grid">${(window.vizStyles || []).map(([id, title]) => `<button type="button" class="viz-pick${(window.vizStyle && window.vizStyle()) === id ? " on" : ""}" data-viz="${id}">${title}</button>`).join("")}</div>
      </div>
      <p class="set-note">Неофициальный доступ: он может перестать работать.</p>
      <p class="set-note" id="ym-status">${token ? "Токен сохранён." : "Токен не задан."}</p>`;
    const status = body.querySelector("#ym-status");
    const badge = body.querySelector("#ym-badge");
    body.querySelectorAll("[data-viz]").forEach(button => button.addEventListener("click", () => {
      if (window.setVizStyle) window.setVizStyle(button.dataset.viz);
      body.querySelectorAll("[data-viz]").forEach(b => b.classList.toggle("on", b === button));
    }));
    const saveTyped = () => {
      const value = body.querySelector("#ym-token").value.trim();
      try { localStorage.setItem(YM_TOKEN_KEY, value); } catch (e) { status.textContent = "Токен не сохранён: нет памяти."; return false; }
      badge.textContent = value ? "Сохранён" : "Не задан";
      badge.classList.toggle("ok", !!value);
      return true;
    };
    // The token is saved when the field loses focus or when "Проверить" is pressed.
    body.querySelector("#ym-token").addEventListener("change", () => { if (saveTyped()) status.textContent = "Токен сохранён."; });
    // Shows the typed token so the user can check a paste; hides it again on the next tap.
    body.querySelector('[data-act="ym-eye"]').addEventListener("click", event => {
      const input = body.querySelector("#ym-token");
      const shown = input.type === "text";
      input.type = shown ? "password" : "text";
      event.currentTarget.textContent = shown ? "Показать" : "Скрыть";
    });
    body.querySelector('[data-act="ym-clear"]').addEventListener("click", () => {
      try { localStorage.removeItem(YM_TOKEN_KEY); } catch (e) { /* nothing stored */ }
      body.querySelector("#ym-token").value = "";
      badge.textContent = "Не задан";
      badge.classList.remove("ok");
      status.textContent = "Токен удалён.";
    });
    body.querySelector('[data-act="ym-check"]').addEventListener("click", async () => {
      if (!saveTyped()) return;
      const value = ymToken();
      if (!value) { status.textContent = "Сначала введите токен."; return; }
      status.textContent = "Проверяю…";
      try {
        const response = await fetch("https://api.music.yandex.net/account/status", { headers: { Authorization: "OAuth " + value } });
        if (!response.ok) { status.textContent = `Яндекс ответил ${response.status}. Токен не принят или запрос закрыт.`; return; }
        const data = await response.json();
        const name = data && data.result && data.result.account && data.result.account.login;
        status.textContent = name ? `Подключено: ${name}.` : "Подключено, но логин не получен.";
      } catch (error) {
        // Backup when the WebView blocks the request (CORS or no network): check only the token's shape, and say that the server was not reached.
        const shape = /^y0_[\w-]{20,}$/.test(value) ? "похож на OAuth-токен Яндекса" : "не похож на OAuth-токен (обычно начинается с y0_)";
        status.textContent = `Сервер Яндекса не проверен: WebView не пустил запрос (CORS или сеть). Формат токена ${shape}.`;
      }
    });
  }
  function renderAbout() {
    resetArmed = false;
    const from = window.LAUNCHER_FROM_UPDATE;
    body.innerHTML = `
      <div class="set-group">
        <div class="set-item set-item-head">
          <span class="set-item-copy"><strong>Generic Launcher</strong><b class="about-ver">${BUILD}</b><small id="update-status">Установлено${from ? " из обновления" : " на ГУ"}.</small></span>
          <span class="about-buttons"><button type="button" class="primary" data-act="check-update">Проверить обновления</button>${from ? '<button type="button" data-act="drop-update">Вернуть версию с флешки</button>' : ""}</span>
        </div>
      </div>
      <div class="set-group set-list">
        <button type="button" class="set-link" data-act="tour"><span>Показать обучение</span><i>›</i></button>
        <button type="button" class="set-link" data-act="calibrate"><span>Калибровка обложки</span><i>›</i></button>
        <button type="button" class="set-link danger" data-act="reset-all"><span>Сбросить все настройки</span><i>›</i></button>
      </div>
      <p class="set-note">Сбрасываются раскладка, карточки, обои, избранное, тема и слоты. Нужно нажать дважды.</p>`;
    body.querySelector('[data-act="check-update"]').addEventListener("click", checkUpdateClicked);
    const dropButton = body.querySelector('[data-act="drop-update"]');
    if (dropButton) dropButton.addEventListener("click", () => { dropUpdate(); location.reload(); });
    body.querySelector('[data-act="calibrate"]').addEventListener("click", () => { sheet.hidden = true; openCalibration(); });
    body.querySelector('[data-act="tour"]').addEventListener("click", () => {
      sheet.hidden = true;
      if (typeof window.startTutorial === "function") window.startTutorial();
    });
    body.querySelector('[data-act="reset-all"]').addEventListener("click", event => {
      const button = event.currentTarget.querySelector("span");
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
