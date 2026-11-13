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

function refreshWeather(manual = false) {
  const widget = document.getElementById("weather-widget");
  if (!bridge.available()) {
    if (manual) showToast("Погода обновится в JCarTools");
    return;
  }
  if (!state.weatherLocation) {
    if (manual) showToast("Ожидаю GPS от Android");
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

