// Кольца топлива и АКБ в карточке состояния автомобиля (как в сборке Андрея Грачева): цифра в центре, подпись снизу.
// Топливо: литры из процента бака (объём бака 60 л, как в config и trips.js). АКБ: вольты, шкала 9–16 В.
const RING_TANK_LITERS = 60;
const RING_CIRC = 2 * Math.PI * 36;

function ringHtml(fraction, value, unit, sub) {
  const f = Math.max(0, Math.min(1, fraction || 0));
  return `<div class="hw-ring"><svg viewBox="0 0 84 84" aria-hidden="true"><circle class="hw-ring-bg" cx="42" cy="42" r="36"/>` +
    `<circle class="hw-ring-fg" cx="42" cy="42" r="36" stroke-dasharray="${(RING_CIRC * f).toFixed(1)} ${RING_CIRC.toFixed(1)}"/></svg>` +
    `<div class="hw-ring-val"><b>${value}</b><small>${unit}</small></div><div class="hw-ring-sub">${sub}</div></div>`;
}

function renderRings() {
  // Two stacked cards in the middle column of the home screen: fuel and battery.
  const box = document.getElementById("hw-rings-col");
  if (!box) return;
  const fuel = typeof tiggoState !== "undefined" && typeof tiggoState.fuel === "number" ? tiggoState.fuel : null;
  const volts = typeof tiggoState !== "undefined" && typeof tiggoState.voltage === "number" ? tiggoState.voltage : null;
  const comma = n => n.toFixed(1).replace(".", ",");
  const fuelRing = fuel === null
    ? ringHtml(0, "—", "литров", "нет данных")
    : ringHtml(fuel / 100, comma(fuel * RING_TANK_LITERS / 100), "литров", `${Math.round(fuel)}% бака из ${RING_TANK_LITERS} л`);
  const batRing = volts === null
    ? ringHtml(0, "—", "вольт", "нет данных")
    : ringHtml((volts - 9) / 7, comma(volts), "вольт", volts >= 12.4 && volts <= 15.5 ? "норма 12,4–15,5 В" : "вне нормы");
  box.innerHTML = `<section class="hw-card hw-ring-card">${fuelRing}</section><section class="hw-card hw-ring-card">${batRing}</section>`;
}
setInterval(renderRings, 1000);
renderRings();
