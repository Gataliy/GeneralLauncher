// Журнал поездок: поездка начинается, когда машина едет, и заканчивается после 3 минут стоянки.
// Данные берутся из уже существующих полей: скорость (state.speedKmh), обороты, топливо и температура за бортом (tiggoState).
// Расход приближённый: по падению уровня бака, в литрах по объёму бака из config.js.
(function () {
  const KEY = "generic_launcher_trips_v1";
  const TICK_MS = 1000;
  const SAMPLE_MS = 10000;
  const MOVE_KMH = 3;
  const END_STOP_MS = 180000;
  const MAX_SAMPLES = 600;
  const MAX_TRIPS = 40;
  const FUEL_TANK_LITERS = 60;

  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  }
  let trips = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(trips.slice(-MAX_TRIPS))); }
    catch (error) { console.warn("Журнал поездок не сохранён", error); }
  }

  let current = null;
  let lastTick = Date.now();
  let stoppedSince = 0;

  function fuelNow() {
    return typeof tiggoState.fuel === "number" ? tiggoState.fuel : null;
  }

  function tick() {
    const now = Date.now();
    const dtMs = Math.min(5000, now - lastTick);
    lastTick = now;
    const speed = typeof state.speedKmh === "number" ? state.speedKmh : null;
    if (speed === null) return;
    const moving = speed >= MOVE_KMH;

    if (!current) {
      if (!moving) return;
      current = {
        start: now, distKm: 0, movingMs: 0, maxKmh: 0, samples: [],
        fuel0: fuelNow(), fuel1: null, out: typeof tiggoState.outTemp === "number" ? tiggoState.outTemp : null,
        lastSample: 0
      };
    }

    if (moving) {
      current.distKm += speed * dtMs / 3600000;
      current.movingMs += dtMs;
      stoppedSince = 0;
    } else if (!stoppedSince) {
      stoppedSince = now;
    }
    current.maxKmh = Math.max(current.maxKmh, speed);

    if (now - current.lastSample >= SAMPLE_MS && current.samples.length < MAX_SAMPLES) {
      current.lastSample = now;
      current.samples.push({
        t: Math.round((now - current.start) / 1000),
        v: Math.round(speed),
        rpm: typeof tiggoState.rpm === "number" ? Math.round(tiggoState.rpm) : null,
        fuel: fuelNow()
      });
    }
    if (fuelNow() !== null) current.fuel1 = fuelNow();

    if (stoppedSince && now - stoppedSince >= END_STOP_MS) {
      current.end = stoppedSince;
      if (current.distKm >= 0.05) { trips.push(summarize(current)); save(); }
      current = null;
      stoppedSince = 0;
    }
  }

  function summarize(t) {
    const hours = t.movingMs / 3600000;
    const drop = t.fuel0 != null && t.fuel1 != null ? t.fuel0 - t.fuel1 : null;
    const liters = drop != null && drop > 0 ? drop * FUEL_TANK_LITERS / 100 : null;
    const per100 = liters != null && t.distKm >= 1 ? (liters / t.distKm) * 100 : null;
    return {
      start: t.start,
      end: t.end || Date.now(),
      distKm: Math.round(t.distKm * 10) / 10,
      movingMs: t.movingMs,
      avgKmh: hours > 0 ? Math.round(t.distKm / hours) : 0,
      maxKmh: Math.round(t.maxKmh),
      fuelDrop: drop,
      per100: per100 != null ? Math.round(per100 * 10) / 10 : null,
      out: t.out,
      samples: t.samples
    };
  }

  // ----- screen -----
  const pad = n => String(n).padStart(2, "0");
  const timeOf = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const durationOf = ms => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
  const dayOf = ms => {
    const d = new Date(ms); const today = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, today)) return "Сегодня";
    const y = new Date(); y.setDate(today.getDate() - 1);
    if (same(d, y)) return "Вчера";
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  };

  const panel = document.createElement("div");
  panel.id = "trip-sheet";
  panel.innerHTML = `<div class="ts-backdrop"></div><div class="ts-panel" role="dialog" aria-label="Поездки">
    <div class="ts-head"><span>Поездки</span><button class="ts-close" type="button" aria-label="Закрыть">×</button></div>
    <div class="ts-body"><aside class="ts-list"></aside><section class="ts-detail"></section></div>
  </div>`;
  document.body.appendChild(panel);
  let selected = null;

  function openTrips() {
    if (typeof closeStateSheet === "function") closeStateSheet();
    document.body.classList.add("trip-sheet-open");
    selected = trips.length ? trips.length - 1 : null;
    render();
  }
  function closeTrips() { document.body.classList.remove("trip-sheet-open"); }

  function render() {
    const list = panel.querySelector(".ts-list");
    const detail = panel.querySelector(".ts-detail");
    if (!trips.length) {
      list.innerHTML = `<div class="ts-empty">Поездок пока нет. Журнал начнёт писать, как только машина поедет.</div>`;
      detail.innerHTML = "";
      return;
    }
    const rows = [];
    let lastDay = null;
    trips.map((t, i) => ({ t, i })).reverse().forEach(({ t, i }) => {
      const day = dayOf(t.start);
      if (day !== lastDay) { rows.push(`<div class="ts-day">${day}</div>`); lastDay = day; }
      rows.push(`<button type="button" class="ts-trip${i === selected ? " sel" : ""}" data-i="${i}">
        <b>${timeOf(t.start)} – ${timeOf(t.end)}</b>
        <span>${t.distKm} км · ${durationOf(t.movingMs)} в пути · ср. ${t.avgKmh} км/ч</span></button>`);
    });
    list.innerHTML = rows.join("");
    const t = trips[selected];
    const fuelText = t.per100 != null ? `~${String(t.per100).replace(".", ",")}` : "мало данных";
    const unit = t.per100 != null ? " л/100" : "";
    const tiles = [
      ["Пробег", `${String(t.distKm).replace(".", ",")}`, "км"],
      ["В пути", durationOf(t.movingMs), ""],
      ["Ср. / макс.", `${t.avgKmh}`, `/ ${t.maxKmh} км/ч`],
      ["Расход (≈)", fuelText, unit],
      ["Температура за бортом", t.out != null ? `${t.out}` : "—", t.out != null ? "°C" : ""]
    ];
    detail.innerHTML = `<div class="ts-tiles">${tiles.map(([label, value, unitText]) =>
      `<div class="ts-tile"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b> <em>${escapeHtml(unitText)}</em></div>`).join("")}</div>
      <div class="ts-chart">${chartSvg(t)}</div>
      <div class="ts-note">Синий — скорость, красный — обороты, зелёный — топливо. Расход считается по падению уровня топлива, на коротких поездках он грубый.</div>`;
  }

  // Speed (blue), engine speed / 100 (red) and fuel % (green) over the trip; x is trip time.
  function chartSvg(t) {
    const pts = t.samples;
    if (pts.length < 2) return `<div class="ts-empty">Для графика мало точек</div>`;
    const W = 900, H = 260, total = Math.max(1, pts[pts.length - 1].t);
    const maxV = Math.max(10, ...pts.map(p => p.v));
    const x = p => (p.t / total) * W;
    const line = (key, scale, color, w) => {
      const coords = pts.filter(p => typeof p[key] === "number")
        .map(p => `${x(p).toFixed(1)},${(H - (p[key] / scale) * H).toFixed(1)}`).join(" ");
      return coords ? `<polyline fill="none" stroke="${color}" stroke-width="${w}" points="${coords}"/>` : "";
    };
    return `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" preserveAspectRatio="none" role="img" aria-label="График поездки">
      ${line("v", maxV, "#6fc3fa", 3)}
      ${line("rpm", 7000, "#ff8a6b", 2)}
      ${line("fuel", 100, "#7de3a4", 2)}
      <text x="2" y="${H + 18}" fill="#8aa0bd" font-size="13">${timeOf(t.start)}</text>
      <text x="${W - 2}" y="${H + 18}" fill="#8aa0bd" font-size="13" text-anchor="end">${timeOf(t.end)}</text>
    </svg>`;
  }

  panel.addEventListener("click", event => {
    if (event.target.classList.contains("ts-backdrop") || event.target.closest(".ts-close")) { closeTrips(); return; }
    const row = event.target.closest(".ts-trip");
    if (row) { selected = Number(row.dataset.i); render(); }
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeTrips(); });

  // Button "Поездки ›" in the header of the state sheet (#state-sheet, built lazily by hw-labels.js).
  function ensureTripsButton() {
    const title = document.querySelector("#state-sheet .state-card h3");
    if (!title || document.getElementById("trips-open")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "trips-open";
    button.textContent = "Поездки ›";
    button.addEventListener("click", event => { event.stopPropagation(); openTrips(); });
    title.after(button);
  }
  setInterval(ensureTripsButton, 1000);

  setInterval(tick, TICK_MS);
  window.tripsLog = () => trips.slice();
  // Home card "Последняя поездка": the last finished or current trip, and the screen opener.
  window.tripsLastSummary = () => (trips.length ? trips[trips.length - 1] : null);
  window.openTripsScreen = () => openTrips();
  window.tripsTick = tick;
})();
