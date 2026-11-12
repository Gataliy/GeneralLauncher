// Предупреждения о камерах контроля по GPS (база из проекта Tomsk).
// Показывает ближайшую камеру впереди в карточке навигации (#tg-cam).
(function () {
  const ALERT_RADIUS = 600;      // м: показываем камеру, если она ближе
  const DIRECTION_TOLERANCE = 75;
  const MIN_MOVE = 15;           // м: минимальное смещение для расчёта курса
  const TYPE_LABELS = {
    speed_camera: "Камера скорости",
    red_light: "Камера на светофоре",
    stop_line: "Контроль стоп-линии",
    average_speed: "Средняя скорость",
    mobile: "Мобильный пост"
  };

  const track = { lat: null, lon: null, heading: null };

  function toRad(v) { return v * Math.PI / 180; }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bearingDeg(lat1, lon1, lat2, lon2) {
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function angleDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Курс считаем по последним двум точкам, когда машина заметно сместилась.
  function updateTrack(lat, lon) {
    if (track.lat !== null) {
      const moved = distanceMeters(track.lat, track.lon, lat, lon);
      if (moved >= MIN_MOVE) {
        track.heading = bearingDeg(track.lat, track.lon, lat, lon);
        track.lat = lat;
        track.lon = lon;
      }
    } else {
      track.lat = lat;
      track.lon = lon;
    }
  }

  function matchesDirection(cam, lat, lon) {
    if (cam[4] == null || track.heading == null) return true;
    const toCam = bearingDeg(lat, lon, cam[0], cam[1]);
    const direct = angleDiff(track.heading, Number(cam[4]));
    const towards = angleDiff(track.heading, toCam);
    return direct <= DIRECTION_TOLERANCE || towards <= DIRECTION_TOLERANCE;
  }

  function findNearest(lat, lon) {
    const list = window.JCT_CAMERAS;
    if (!Array.isArray(list)) return null;
    let best = null;
    let bestDist = ALERT_RADIUS;
    // Грубый отсев по широте/долготе, чтобы не считать расстояние для всей базы.
    const dLat = ALERT_RADIUS / 111000;
    const dLon = ALERT_RADIUS / (111000 * Math.cos(toRad(lat)));
    for (let i = 0; i < list.length; i++) {
      const cam = list[i];
      if (Math.abs(cam[0] - lat) > dLat || Math.abs(cam[1] - lon) > dLon) continue;
      const dist = distanceMeters(lat, lon, cam[0], cam[1]);
      if (dist > bestDist) continue;
      if (!matchesDirection(cam, lat, lon)) continue;
      bestDist = dist;
      best = { cam, dist };
    }
    return best;
  }

  function fmtDist(m) {
    if (!Number.isFinite(m)) return "—";
    return m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(1)} км`;
  }

  // Один слот предупреждения в карточке навигации: радар из HUD головного
  // устройства имеет приоритет над базой камер.
  window.navWarning = { hud: null, cam: null };
  window.renderNavWarning = function renderNavWarning() {
    const box = document.getElementById("tg-cam");
    if (!box) return;
    const hud = window.navWarning.hud;
    const cam = window.navWarning.cam;
    let name = "", dist = null, urgent = false, range = 1;
    if (hud) {
      name = "Радар";
      dist = hud.dist;
      urgent = Number.isFinite(dist) && dist < 250;
      range = 1000;
    } else if (cam) {
      name = TYPE_LABELS[cam.cam[2]] || "Камера";
      dist = cam.dist;
      range = ALERT_RADIUS;
    }
    if (!name) {
      box.hidden = true;
      return;
    }
    const nameEl = document.getElementById("tg-cam-name");
    const distEl = document.getElementById("tg-cam-dist");
    if (nameEl) nameEl.textContent = name;
    if (distEl) distEl.textContent = fmtDist(dist);
    // Полоска показывает, насколько близко: заполняется по мере приближения.
    const fill = document.getElementById("tg-cam-fill");
    if (fill) {
      const share = Number.isFinite(dist) ? Math.min(1, Math.max(0, 1 - dist / range)) : 0;
      fill.style.width = `${Math.round(share * 100)}%`;
    }
    box.classList.toggle("urgent", urgent);
    box.hidden = false;
  };

  function renderCamera(found) {
    window.navWarning.cam = found;
    window.renderNavWarning();
  }

  window.checkCameraAlerts = function checkCameraAlerts(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    updateTrack(lat, lon);
    window.vehicleHeading = track.heading;
    if (typeof window.renderCompass === "function") window.renderCompass();
    renderCamera(findNearest(lat, lon));
  };
})();
