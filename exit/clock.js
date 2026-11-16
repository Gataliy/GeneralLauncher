// Clock card: weekday and date on the home screen.
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const weekday = now.toLocaleDateString("ru-RU", { weekday: "long" });
  const weekdayLine = document.createElement("span");
  weekdayLine.textContent = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dayLine = document.createElement("span");
  // Non-breaking space keeps the day and month together ("16 ноября"), so the wrap goes before the day.
  dayLine.textContent = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).replace(/ /g, "\u00A0");
  document.getElementById("date").replaceChildren(weekdayLine, document.createTextNode(" "), dayLine);
}

