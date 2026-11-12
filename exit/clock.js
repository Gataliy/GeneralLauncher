// Clock card: weekday and date on the home screen.
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const weekday = now.toLocaleDateString("ru-RU", { weekday: "long" });
  const weekdayLine = document.createElement("span");
  weekdayLine.textContent = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dayLine = document.createElement("span");
  dayLine.textContent = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  document.getElementById("date").replaceChildren(weekdayLine, dayLine);
}

