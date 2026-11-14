// Drive mode (ECO / NORMAL / SPORT) read from the car. Shown as a pill next to the date.
// Car codes from the StreletS27 README: get_drive_mode returns 0 eco, 1 normal, 2 sport.
(function () {
  const NAMES = { 0: "ECO", 1: "NORMAL", 2: "SPORT" };

  function pollDriveMode() {
    if (!bridge.has("requestCarCommandAsync")) return;
    bridge.requestCarCommandAsync("dm_get_" + Date.now(), JSON.stringify({ cmd: "get_drive_mode" }));
  }

  window.applyDriveMode = function applyDriveMode(response) {
    const el = document.getElementById("drive-mode");
    if (!el || !response || response.success === false) return;
    const value = Number(response.value);
    if (!Object.prototype.hasOwnProperty.call(NAMES, value)) return;
    el.textContent = NAMES[value];
    el.dataset.mode = NAMES[value].toLowerCase();
    el.hidden = false;
  };

  // Tap the pill: a small menu to choose the mode. The car gets set_drive_mode (0 eco, 1 normal, 2 sport) and the pill shows its answer.
  function setDriveMode(value) {
    if (!bridge.has("requestCarCommandAsync")) return;
    bridge.requestCarCommandAsync("dm_set_" + Date.now(), JSON.stringify({ cmd: "set_drive_mode", value }));
    setTimeout(pollDriveMode, 900);
  }
  function closeMenu() {
    const menu = document.getElementById("drive-menu");
    if (menu) menu.remove();
  }
  function openMenu(anchor) {
    closeMenu();
    const menu = document.createElement("div");
    menu.id = "drive-menu";
    menu.className = "drive-menu";
    [["eco", "ECO", 0], ["normal", "NORMAL", 1], ["sport", "SPORT", 2]].forEach(([key, label, value]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "drive-menu-btn";
      b.dataset.mode = key;
      b.textContent = label;
      b.addEventListener("click", event => { event.stopPropagation(); setDriveMode(value); closeMenu(); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.round(r.left + r.width / 2) + "px";
    menu.style.top = Math.round(r.top - 10) + "px";
  }
  const pill = document.getElementById("drive-mode");
  if (pill) {
    pill.classList.add("drive-pill-tap");
    pill.addEventListener("click", event => {
      event.stopPropagation();
      if (document.getElementById("drive-menu")) closeMenu(); else openMenu(pill);
    });
  }
  document.addEventListener("click", event => {
    if (event.target.closest && (event.target.closest("#drive-menu") || event.target.closest("#drive-mode"))) return;
    closeMenu();
  });

  setInterval(pollDriveMode, 10000);
  setTimeout(pollDriveMode, 2500);
})();
