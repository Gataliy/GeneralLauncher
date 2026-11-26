// Weather card: last known value, refresh on tap, GPS-driven updates.
function weatherSymbol(condition) {
  const value = String(condition || "").toLocaleLowerCase("ru");
  if (/гроз/.test(value)) return "ϟ";
  if (/снег|метел/.test(value)) return "❄";
  if (/дожд|лив|морос/.test(value)) return "☂";
  if (/туман|дымк/.test(value)) return "≋";
  if (/ясно/.test(value)) return "☀";
  if (/облач|пасмур|прояснен/.test(value)) return "☁";
  return "◌";
}

function applyWeather(raw, persist = true) {
  const data = parseJson(raw, raw) || {};
  const widget = document.getElementById("weather-widget");
  widget.classList.remove("loading");
  if (data.error) {
    if (data.error !== "location_unavailable") showToast("Погода временно недоступна");
    return false;
  }
  // The car's own 10-day forecast (getWeather / weather event). Kept in memory and in the saved weather.
  if (Array.isArray(data.forecast) && data.forecast.length) window.carForecast = data.forecast;
  const value = String(data.temp ?? data.temperature ?? "").trim();
  if (!value) return false;
  const temperature = value.endsWith("°") ? value : `${value}°`;
  const city = String(data.city || "").trim();
  const condition = String(data.condition || "").trim();
  document.getElementById("weather-temperature").textContent = temperature;
  if (city && city !== "N/A") document.getElementById("weather-city").textContent = city;
  if (condition) {
    document.getElementById("weather-condition").textContent = condition;
    document.getElementById("weather-icon").textContent = weatherSymbol(condition);
  }
  if (persist) localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({
    temp: temperature,
    city: city || document.getElementById("weather-city").textContent,
    condition: condition || document.getElementById("weather-condition").textContent,
    forecast: Array.isArray(window.carForecast) ? window.carForecast : undefined
  }));
  return true;
}

// Tomsk from open-meteo (no key): the fallback while there is no car bridge or no GPS fix yet.
const ONLINE_WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=56.4972&longitude=85.0352&current=temperature_2m,weather_code&timezone=Asia%2FTomsk";
let onlineWeatherBusy = false;

// The condition words are the ones weatherSymbol() already knows.
function onlineWeatherCondition(code) {
  if (code === 0) return "ясно";
  if ([1, 2, 3].includes(code)) return "облачно";
  if (code === 45 || code === 48) return "туман";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "снег";
  if (code >= 95) return "гроза";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "дождь";
  return "облачно";
}

// With the car present, a background refresh does not replace a value the car has already given;
// a tap on the card always refreshes it.
async function refreshOnlineWeather(manual = false) {
  if (onlineWeatherBusy) return;
  const shown = document.getElementById("weather-temperature").textContent.trim();
  if (!manual && bridge.available() && shown && shown !== "—") return;
  const widget = document.getElementById("weather-widget");
  const before = document.getElementById("weather-temperature").textContent;
  onlineWeatherBusy = true;
  widget.classList.add("loading");
  try {
    const response = await fetch(ONLINE_WEATHER_URL, { cache: "no-store" });
    const body = await response.json();
    const current = body && body.current;
    if (!current || typeof current.temperature_2m !== "number") throw new Error("no current weather");
    // The car may have answered while this request was on its way: on a background refresh its value stays.
    if (!manual && bridge.available() && document.getElementById("weather-temperature").textContent !== before) return;
    const temp = Math.round(current.temperature_2m);
    applyWeather(JSON.stringify({
      temp: (temp > 0 ? "+" : "") + temp,
      city: "Томск",
      condition: onlineWeatherCondition(current.weather_code)
    }));
    if (manual) showToast("Погода обновлена");
  } catch (error) {
    if (manual) showToast("Погода временно недоступна");
  } finally {
    onlineWeatherBusy = false;
    widget.classList.remove("loading");
  }
}

function refreshWeather(manual = false) {
  const widget = document.getElementById("weather-widget");
  if (!bridge.available() || !state.weatherLocation) {
    refreshOnlineWeather(manual);
    return;
  }
  widget.classList.add("loading");
  const result = bridge.refreshWeather(state.weatherLocation.lat, state.weatherLocation.lon);
  if (result?.error) {
    widget.classList.remove("loading");
    if (manual) showToast(result.error === "location_unavailable" ? "Ожидаю координаты автомобиля" : "Погода временно недоступна");
  } else if (manual) {
    showToast("Обновляю погоду");
  }
  if (result?.status === "requested") state.lastWeatherRequestAt = Date.now();
  setTimeout(() => widget.classList.remove("loading"), 20_000);
}

