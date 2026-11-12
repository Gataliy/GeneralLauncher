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

  setInterval(pollDriveMode, 10000);
  setTimeout(pollDriveMode, 2500);
})();
