// Night mode: a tap on the classic clock leaves only the big clock on a black screen.
// Any tap then brings the normal screen back. Widgets stay in place; they are only hidden while this mode is on.
(function bindNightMode() {
  const clock = document.querySelector(".hero-clock");
  if (!clock) return;

  let hint = null;
  let hintTimer = null;
  function showHint() {
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "night-hint";
      hint.textContent = "Нажмите на экран, чтобы выйти";
      document.body.appendChild(hint);
    }
    hint.classList.remove("show");
    void hint.offsetWidth;
    hint.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove("show"), 6000);
  }

  function isOn() { return document.body.classList.contains("night-mode"); }

  let exitedAt = 0;
  function exitNight() {
    exitedAt = performance.now();
    document.body.classList.remove("night-mode");
    clearTimeout(hintTimer);
    if (hint) hint.classList.remove("show");
  }

  // The tap that turned the mode on is ignored by the exit listener, so it cannot undo itself.
  let enteredAt = 0;
  function enterNight() {
    if (isOn()) return;
    enteredAt = performance.now();
    document.body.classList.add("night-mode");
    showHint();
  }

  document.addEventListener("click", () => {
    if (!isOn()) return;
    if (performance.now() - enteredAt < 400) return;
    exitNight();
  }, true);

  clock.addEventListener("click", () => {
    if (document.body.classList.contains("hw-edit")) return;
    // The same tap that left the mode must not enter it again.
    if (performance.now() - exitedAt < 400) return;
    enterNight();
  });
})();
