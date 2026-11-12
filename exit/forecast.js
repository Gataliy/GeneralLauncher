// Long press on the weather opens a 10-day forecast from Open-Meteo (no key needed). A tap still refreshes the weather.
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 10;
const FORECAST_HOLD_MS = 600;
let forecastHoldTimer = null;
let forecastHoldFired = false;

function forecastSymbol(code) {
  const value = Number(code);
  if (value === 0) return "☀";
  if (value >= 1 && value <= 3) return "☁";
  if (value === 45 || value === 48) return "≋";
  if ((value >= 71 && value <= 77) || value === 85 || value === 86) return "❄";
  if (value >= 95) return "ϟ";
  if (value >= 51) return "☂";
  return "◌";
}

function forecastDayName(isoDate, index) {
  if (index === 0) return "Сегодня";
  if (index === 1) return "Завтра";
  return new Date(isoDate + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

function ensureForecastSheet() {
  let sheet = document.getElementById("forecast-sheet");
  if (sheet) return sheet;
  sheet = document.createElement("div");
  sheet.id = "forecast-sheet";
  sheet.className = "forecast-sheet";
  sheet.hidden = true;
  sheet.innerHTML = '<div class="forecast-card" role="dialog" aria-label="Прогноз на 10 дней"><h3>Прогноз на 10 дней</h3><div class="forecast-list"></div><p class="forecast-note"></p></div>';
  sheet.addEventListener("click", () => { sheet.hidden = true; });
  document.body.appendChild(sheet);
  return sheet;
}

async function openForecastSheet() {
  const location = state.weatherLocation;
  if (!location) {
    showToast("Ожидаю GPS от Android");
    return;
  }
  const sheet = ensureForecastSheet();
  const list = sheet.querySelector(".forecast-list");
  const note = sheet.querySelector(".forecast-note");
  list.innerHTML = "";
  note.textContent = "Загружаю прогноз…";
  sheet.hidden = false;
  const url = `${FORECAST_URL}?latitude=${location.lat.toFixed(4)}&longitude=${location.lon.toFixed(4)}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=${FORECAST_DAYS}&timezone=auto`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const daily = (await response.json()).daily;
    list.innerHTML = daily.time.map((day, index) => {
      const max = Math.round(daily.temperature_2m_max[index]);
      const min = Math.round(daily.temperature_2m_min[index]);
      return `<div class="forecast-row"><span class="forecast-day">${forecastDayName(day, index)}</span>` +
        `<span class="forecast-icon">${forecastSymbol(daily.weather_code[index])}</span>` +
        `<span class="forecast-temp"><b>${max}°</b> ${min}°</span></div>`;
    }).join("");
    note.textContent = "Open-Meteo";
  } catch (error) {
    note.textContent = "Прогноз недоступен: нет связи с сервером";
  }
}

function bindWeatherForecast() {
  const widget = document.getElementById("weather-widget");
  if (!widget) return;
  widget.addEventListener("pointerdown", () => {
    forecastHoldFired = false;
    clearTimeout(forecastHoldTimer);
    forecastHoldTimer = setTimeout(() => {
      forecastHoldFired = true;
      openForecastSheet();
    }, FORECAST_HOLD_MS);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(name => widget.addEventListener(name, () => clearTimeout(forecastHoldTimer)));
  // A long press must not also refresh the weather on release.
  widget.addEventListener("click", event => {
    if (!forecastHoldFired) return;
    forecastHoldFired = false;
    event.stopImmediatePropagation();
  }, true);
}
