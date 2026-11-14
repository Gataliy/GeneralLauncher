// Home screen port: icons and actions for the car-state tiles, and the "Последняя поездка" card.
// Doors and trunk do not open or move while the car is moving (state.speedKmh > 0). Sunroof and windows always work.
(function () {
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const SPEED_LOCK_KMH = 1;

  window.TILE_ICON_SVG = {};
  function fillTileIcons() {
    if (typeof ICON_SVG === "undefined") return;
    // Roof (sunroof) from iconpantry.com, free for personal and commercial use, no attribution. Wheel: a plain tyre drawn for this launcher.
    const SUNROOF_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="12" height="20" x="6" y="2" rx="4"/><path d="M7 8.5q5-1.5 10 0M7 18q5 1.5 10 0"/><rect width="6" height="4.5" x="9" y="11" rx="1"/><path d="M6 8.5H4.5m13.5 0h1.5"/></svg>';
    const TYRE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.2M12 20.3v2.2M1.5 12h2.2M20.3 12h2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6"/></svg>';
    window.TILE_ICON_SVG = { lock: ICON_SVG.lock, roof: SUNROOF_ICON, window: ICON_SVG.window, trunk: ICON_SVG.trunk, wheel: TYRE_ICON };
    if (typeof window.renderChips === "function") window.renderChips();
  }
  fillTileIcons();

  function moving() {
    return typeof state !== "undefined" && typeof state.speedKmh === "number" && state.speedKmh >= SPEED_LOCK_KMH;
  }

  function sendCar(cmd) {
    const messages = { open_windows_10: "Окна открываются", open_windows_full: "Окна открываются", close_windows: "Окна закрываются", open_trunk: "Багажник открывается", close_trunk: "Багажник закрывается" };
    if (messages[cmd] && typeof showStatePill === "function") showStatePill(messages[cmd]);
    if (typeof bridge === "undefined" || !bridge.has("requestCarCommandAsync")) return false;
    return bridge.requestCarCommandAsync("tile_" + Date.now(), JSON.stringify({ cmd }));
  }

  function flash(tile, cls) {
    tile.classList.add(cls);
    setTimeout(() => tile.classList.remove(cls), 900);
  }

  function runTile(tile, longPress) {
    const key = tile.dataset.tile;
    const isOpen = tile.dataset.open === "1";
    if (key === "roof") return sendCar(isOpen ? "close_sunroof" : "open_sunroof");
    if (key === "window") {
      if (isOpen) return sendCar("close_windows");
      return sendCar(longPress ? "open_windows_full" : "open_windows_10");
    }
    if (key === "trunk") {
      if (moving()) return flash(tile, "blocked");
      return sendCar(isOpen ? "close_trunk" : "open_trunk");
    }
    if (key === "lock") {
      if (moving()) return flash(tile, "blocked");
      return sendCar("close_central_lock");
    }
    if (key === "wheel") {
      // Tyres have no command: the tap opens the full car-state list, same as the title.
      const title = document.querySelector(".hw-state > .hw-eb");
      if (title) title.click();
    }
  }

  // Tap runs the action; a long press on the windows tile opens them all.
  let pressTimer = null;
  let pressTile = null;
  let longFired = false;
  function bindTiles() {
    const box = document.getElementById("hw-chips");
    if (!box || box.dataset.bound === "1") return;
    box.dataset.bound = "1";
    box.addEventListener("pointerdown", event => {
      const tile = event.target.closest && event.target.closest(".hw-tile");
      if (!tile) return;
      pressTile = tile;
      longFired = false;
      if (tile.dataset.tile === "window") {
        pressTimer = setTimeout(() => {
          longFired = true;
          runTile(tile, true);
          flash(tile, "sent");
        }, 600);
      }
    });
    box.addEventListener("pointerup", () => {
      if (!pressTile) return;
      clearTimeout(pressTimer);
      if (!longFired) {
        runTile(pressTile, false);
        flash(pressTile, "sent");
      }
      pressTile = null;
    });
    box.addEventListener("pointerleave", () => { clearTimeout(pressTimer); pressTile = null; });
  }
  setInterval(bindTiles, 1000);
  bindTiles();

  // "Последняя поездка": the last trip from the journal (trips.js). Tap on the title opens the trips screen.
  function renderTripCard() {
    const body = document.getElementById("hw-trip-body");
    const title = document.getElementById("hw-trip-title");
    if (!body || !title) return;
    const t = typeof window.tripsLastSummary === "function" ? window.tripsLastSummary() : null;
    if (!t) {
      body.innerHTML = '<span class="hw-trip-empty">Поездок пока нет</span>';
      title.textContent = "Последняя поездка";
      return;
    }
    const d = new Date(t.start);
    title.textContent = `Последняя поездка · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const minutes = Math.round((t.movingMs || 0) / 60000);
    const dur = minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : `${minutes} мин`;
    const per100 = typeof t.per100 === "number" ? "≈" + String(t.per100).replace(".", ",") : "—";
    body.innerHTML =
      `<div class="hw-trip-main"><strong>${String(t.distKm).replace(".", ",")}</strong><small>км</small></div>` +
      `<div class="hw-trip-stats"><div><b>${dur}</b><span>в пути</span></div><div><b>${t.avgKmh}</b><span>ср. км/ч</span></div><div><b>${per100}</b><span>л/100 км</span></div></div>`;
  }
  const tripTitle = document.getElementById("hw-trip-title");
  if (tripTitle) tripTitle.addEventListener("click", () => { if (typeof window.openTripsScreen === "function") window.openTripsScreen(); });
  setInterval(renderTripCard, 3000);
  setTimeout(renderTripCard, 500);

  // Home port, as in the reference screen: car state, navigation and compass on the top row; clock, weather and player under them.
  // The fuel / battery rings are hidden on the home screen. Done once.
  function arrangeHomePort() {
    if (!document.body.classList.contains("home-port")) return;
    const top = document.querySelector(".hero-bottom");
    const state = document.querySelector(".hw-state");
    const nav = document.querySelector(".hw-nav");
    const compass = document.querySelector(".hw-compass");
    if (!top || !state || !nav || !compass) return;
    top.appendChild(state);
    top.appendChild(nav);
    top.appendChild(compass);
  }
  arrangeHomePort();

  // Top pill (green, no animation): a short message when a window or the trunk is commanded to open or close.
  // Shown for a few seconds; the message is set in sendCar above.
  let statePillTimer = null;
  function showStatePill(text) {
    // While the car animation is on screen it already shows the same state; the pill would be hidden under it.
    const anim = document.getElementById("car-anim");
    if (anim && !anim.hidden) return;
    let pill = document.getElementById("state-pill");
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "state-pill";
      pill.className = "state-pill";
      const box = typeof topPillsElement === "function" ? topPillsElement() : document.body;
      box.appendChild(pill);
    }
    pill.textContent = text;
    pill.hidden = false;
    clearTimeout(statePillTimer);
    statePillTimer = setTimeout(() => { pill.hidden = true; }, 3500);
  }
})();
