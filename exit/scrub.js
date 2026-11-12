// Progress line: a tap seeks, a drag scrubs. The time follows the finger; the seek is sent on release (JCarTools seekMusic takes milliseconds).
let scrubLine = null;
let scrubFraction = null;

function trackDurationSeconds() {
  const clock = window.trackClock;
  if (!clock || !(clock.duration > 0)) return null;
  return clock.duration > 36000 ? clock.duration / 1000 : clock.duration;
}

function scrubFractionOf(line, clientX) {
  const rect = line.getBoundingClientRect();
  if (!rect.width) return null;
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

function paintScrub(fraction) {
  const seconds = trackDurationSeconds();
  if (seconds == null) return;
  const percent = fraction * 100;
  document.getElementById("track-progress-fill").style.width = `${percent}%`;
  document.getElementById("track-line-fill").style.width = `${percent}%`;
  document.getElementById("track-pos").textContent = formatTrackTime(seconds * fraction);
}

function seekTrackToFraction(fraction) {
  const clock = window.trackClock;
  if (!clock || !(clock.duration > 0)) return;
  const durationMs = clock.duration > 36000 ? clock.duration : clock.duration * 1000;
  const targetMs = Math.round(Math.min(1, Math.max(0, fraction)) * durationMs);
  if (!bridge.seekMusic(targetMs)) return;
  // Move the local clock at once so the line jumps without waiting for musicInfo.
  window.trackClock = { duration: clock.duration, position: clock.duration > 36000 ? targetMs : targetMs / 1000, at: Date.now() };
  applyTrackClockNow();
}

// Redraw the line from the local clock (the same numbers musicInfo gives).
function applyTrackClockNow() {
  const clock = window.trackClock;
  if (!clock) return;
  const percent = Math.min(100, (clock.position / clock.duration) * 100);
  document.getElementById("track-progress-fill").style.width = `${percent}%`;
  document.getElementById("track-line-fill").style.width = `${percent}%`;
}

document.addEventListener("pointerdown", event => {
  const line = event.target.closest && event.target.closest(".player-tl-line, #track-progress");
  if (!line || trackDurationSeconds() == null) return;
  scrubLine = line;
  scrubFraction = scrubFractionOf(line, event.clientX);
  if (scrubFraction != null) paintScrub(scrubFraction);
});
document.addEventListener("pointermove", event => {
  if (!scrubLine) return;
  const fraction = scrubFractionOf(scrubLine, event.clientX);
  if (fraction == null) return;
  scrubFraction = fraction;
  paintScrub(fraction);
});
function endScrub(event) {
  if (!scrubLine) return;
  const line = scrubLine;
  scrubLine = null;
  if (event.type === "pointercancel") return applyTrackClockNow();
  const fraction = scrubFractionOf(line, event.clientX);
  if (fraction != null) seekTrackToFraction(fraction);
  else applyTrackClockNow();
}
document.addEventListener("pointerup", endScrub);
document.addEventListener("pointercancel", endScrub);
