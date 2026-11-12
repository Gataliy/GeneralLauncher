// Start-up: restore the two pages, then wire up the screen.
initPages();

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  applyWeather(localStorage.getItem(WEATHER_STORAGE_KEY), false);
  setInterval(updateClock, 30_000);
  setInterval(refreshWeather, WEATHER_REFRESH_MS);
  renderSlots();
  if (bridge.available()) {
    setInterval(pollCarState, CAR_STATE_POLL_MS);
    setInterval(pollSunroof, SUNROOF_POLL_MS);
    setInterval(pollCabinTemps, TEMP_POLL_MS);
    pollCabinTemps();
  }
  document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => setPage(button.dataset.page)));
  const header = document.querySelector(".actions-header");
  let swipeStartX = null;
  header.addEventListener("pointerdown", event => { swipeStartX = event.clientX; });
  header.addEventListener("pointercancel", () => { swipeStartX = null; });
  header.addEventListener("pointerup", event => {
    if (swipeStartX == null) return;
    const dx = event.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(dx) < 60) return;
    const order = ["climate", "windows", "screen", "apps", "combos"];
    const index = Math.min(order.length - 1, Math.max(0, order.indexOf(state.page) + (dx < 0 ? 1 : -1)));
    setPage(order[index]);
  });
  renderPageTabs();
  bindAppsDebug();
  bindPlayerTap();
  document.querySelectorAll("[data-media]").forEach(button => button.addEventListener("click", () => runCommand(button.dataset.media, "Команда плеера", button)));
  // Tapping an empty part of the home screen picks a new wallpaper.
  document.querySelector(".dashboard").addEventListener("click", event => {
    if (event.target.closest("button, article, nav, .action-slots, .page-tabs, .page-controls, .hero-clock, .weather-widget, .player-widget, .actions-header, .actions-title-row, .toast, .sheet-backdrop")) return;
    wallpaperTap();
  });
  document.getElementById("weather-widget").addEventListener("click", () => refreshWeather(true));
  bindWeatherForecast();
  document.getElementById("picker-close").addEventListener("click", closePicker);
  document.getElementById("add-slot").addEventListener("click", addSlot);
  document.getElementById("picker-remove").addEventListener("click", () => {
    if (state.pickerSlot != null) removeSlot(state.pickerSlot);
    closePicker();
  });
  document.getElementById("picker").addEventListener("click", event => { if (event.target.id === "picker") closePicker(); });
  document.getElementById("picker-search").addEventListener("input", event => { state.query = event.target.value; schedulePickerRender(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closePicker(); });
  document.addEventListener("contextmenu", event => event.preventDefault());

  bridge.call("onJsReady", TOKEN);
  afterFirstPaint(() => {
    setHeroWallpaper();
    loadHostCapabilities();
    applyWeather(bridge.getWeather());
    pollCarState();
    pollSunroof();
  });
});
