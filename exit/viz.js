// Визуализатор под карточкой музыки: 8 стилей на canvas. Это анимация, а не спектр звука (из машины спектр не приходит).
// Анимирован, пока играет (state.isPlaying); на паузе столбики опускаются. Стиль выбирается долгим нажатием на визуализатор или в «Настройки > Визуализатор».
(function () {
  const KEY = "generic_launcher_viz_v1";
  const STYLES = [
    ["bars", "Столбики"], ["mirror", "Зеркальные"], ["dots", "Точки"], ["lines", "Тонкие линии"],
    ["segments", "Сегменты"], ["bubbles", "Кружки"], ["wave", "Волна"], ["area", "Волна с заливкой"]
  ];
  const N = 36;
  const el = document.createElement("div");
  el.id = "viz";
  el.className = "viz";
  el.hidden = true;
  el.innerHTML = '<canvas></canvas>';
  document.body.appendChild(el);
  const canvas = el.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  let level = new Array(N).fill(0.12);
  let t = 0;
  let raf = 0;

  function style() {
    try { return localStorage.getItem(KEY) || "bars"; } catch (e) { return "bars"; }
  }
  function setStyle(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* keep the default */ }
    document.dispatchEvent(new CustomEvent("viz-style", { detail: id }));
  }
  function next() {
    const i = STYLES.findIndex(s => s[0] === style());
    setStyle(STYLES[(i + 1) % STYLES.length][0]);
  }

  // Keep the visualizer under the music card, between the card and the tab row.
  function place() {
    const player = document.querySelector(".player-widget");
    const tabs = document.querySelector(".actions-title-row");
    const hero = document.getElementById("hero");
    const show = player && hero && !document.body.classList.contains("player-expanded") && !document.body.classList.contains("trip-sheet-open");
    el.hidden = !show;
    if (!show) return;
    const p = player.getBoundingClientRect();
    const top = p.bottom + 20;
    const limit = tabs ? tabs.getBoundingClientRect().top - 12 : p.bottom + 120;
    el.style.left = p.left + "px";
    el.style.width = p.width + "px";
    el.style.top = top + "px";
    el.style.height = Math.max(60, Math.min(100, limit - top)) + "px";
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(p.width * dpr), h = Math.round(el.getBoundingClientRect().height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function target(i) {
    if (!state.isPlaying) return 0.12;
    return 0.35 + 0.65 * Math.abs(Math.sin(t * 0.07 + i * 0.6) * Math.cos(t * 0.031 + i * 1.3));
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    if (el.hidden) return;
    t += 1;
    for (let i = 0; i < N; i++) level[i] += (target(i) - level[i]) * 0.18;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const id = style();
    const pad = w * 0.04, gap = (w - pad * 2) / N, bw = gap * 0.62;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#6fc3fa"); grad.addColorStop(1, "#2f6fb4");
    ctx.fillStyle = grad; ctx.strokeStyle = "#6fc3fa"; ctx.lineWidth = Math.max(2, h * 0.02);
    const bottom = h * 0.92, maxH = h * 0.84;
    const rr = (x, y, ww, hh, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, ww, hh, r) : ctx.rect(x, y, ww, hh); ctx.fill(); };
    if (id === "bars") {
      for (let i = 0; i < N; i++) { const bh = level[i] * maxH; rr(pad + i * gap, bottom - bh, bw, bh, bw / 2); }
    } else if (id === "mirror") {
      const mid = h / 2;
      for (let i = 0; i < N; i++) { const bh = level[i] * maxH / 2; rr(pad + i * gap, mid - bh, bw, bh * 2, bw / 2); }
    } else if (id === "dots") {
      const rows = 6, cols = N, dx = (w - pad * 2) / cols, dy = h / rows;
      for (let c = 0; c < cols; c++) {
        const lit = Math.round(level[c] * rows);
        for (let r = 0; r < rows; r++) {
          ctx.globalAlpha = r < lit ? 1 : 0.18;
          ctx.beginPath(); ctx.arc(pad + c * dx + dx / 2, h - (r + 0.5) * dy, Math.min(dx, dy) * 0.28, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } else if (id === "lines") {
      for (let i = 0; i < N; i++) { const bh = level[i] * maxH; ctx.fillRect(pad + i * gap + gap / 2, bottom - bh, Math.max(2, bw * 0.3), bh); }
    } else if (id === "segments") {
      for (let i = 0; i < N; i++) {
        const segs = 8, sh = maxH / segs;
        const lit = Math.round(level[i] * segs);
        for (let s = 0; s < lit; s++) { ctx.globalAlpha = 0.45 + 0.55 * (s + 1) / segs; rr(pad + i * gap, bottom - (s + 1) * sh + 2, bw, sh - 3, 2); }
      }
      ctx.globalAlpha = 1;
    } else if (id === "bubbles") {
      for (let i = 0; i < N; i += 3) { const d = 6 + level[i] * (h * 0.7); ctx.beginPath(); ctx.arc(pad + i * gap + gap / 2, h / 2, d / 2, 0, Math.PI * 2); ctx.globalAlpha = 0.5 + level[i] * 0.5; ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (id === "wave") {
      ctx.beginPath();
      for (let i = 0; i < N; i++) { const x = pad + i * gap + gap / 2, y = h / 2 - (level[i] - 0.5) * maxH; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    } else if (id === "area") {
      ctx.beginPath(); ctx.moveTo(pad, bottom);
      for (let i = 0; i < N; i++) ctx.lineTo(pad + i * gap + gap / 2, bottom - level[i] * maxH);
      ctx.lineTo(w - pad, bottom); ctx.closePath();
      ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    }
  }

  // Choosing: a short tap moves to the next style; a long press (about 0.6 s) opens the list of styles.
  const chooser = document.createElement("div");
  chooser.id = "viz-chooser";
  chooser.className = "viz-chooser";
  chooser.hidden = true;
  // Small static picture of each style for the chooser (same look as the bars, dots, lines, etc.).
  function thumb(index) {
    const w = 64, h = 32, n = 12, bw = w / n;
    const vals = [0.8, 0.5, 0.9, 0.6, 0.7, 0.4, 0.85, 0.55, 0.65, 0.9, 0.5, 0.75];
    let body = "";
    if (index === 0) vals.forEach((v, k) => { const bh = v * (h - 4); body += `<rect x="${k * bw + bw * 0.2}" y="${h - 2 - bh}" width="${bw * 0.6}" height="${bh}" rx="1.5" fill="#6fc3fa"/>`; });
    if (index === 1) vals.forEach((v, k) => { const bh = v * (h - 4); body += `<rect x="${k * bw + bw * 0.2}" y="${h / 2 - bh / 2}" width="${bw * 0.6}" height="${bh}" rx="1.5" fill="#6fc3fa" opacity=".8"/>`; });
    if (index === 2) vals.forEach((v, k) => { body += `<circle cx="${k * bw + bw * 0.5}" cy="${h / 2}" r="${1 + v * 2.5}" fill="#6fc3fa"/>`; });
    if (index === 3) vals.forEach((v, k) => { const bh = v * (h - 4); body += `<line x1="${k * bw + bw * 0.5}" x2="${k * bw + bw * 0.5}" y1="${h / 2 - bh / 2}" y2="${h / 2 + bh / 2}" stroke="#6fc3fa" stroke-width="1.2"/>`; });
    if (index === 4) vals.forEach((v, k) => { for (let j = 0; j < 4; j++) if (v * 4 > j) body += `<rect x="${k * bw + bw * 0.2}" y="${h - 3 - j * 6}" width="${bw * 0.6}" height="3" fill="#6fc3fa"/>`; });
    if (index === 5) vals.forEach((v, k) => { body += `<circle cx="${k * bw + bw * 0.5}" cy="${h - 2 - v * (h - 6)}" r="${bw * 0.3}" fill="#6fc3fa"/>`; });
    if (index === 6) { let d = `M0 ${h / 2}`; vals.forEach((v, k) => { d += ` L${k * bw + bw / 2} ${h / 2 - (v - 0.5) * (h - 6)}`; }); body = `<path d="${d}" fill="none" stroke="#6fc3fa" stroke-width="1.6"/>`; }
    if (index === 7) { let d = `M0 ${h} `; vals.forEach((v, k) => { d += `L${k * bw + bw / 2} ${h - v * (h - 6)} `; }); d += `L${w} ${h}Z`; body = `<path d="${d}" fill="rgba(111,195,250,.35)" stroke="#6fc3fa" stroke-width="1.4"/>`; }
    return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
  }
  chooser.innerHTML = '<div class="viz-chooser-card" role="dialog" aria-label="Визуализатор"><div class="viz-chooser-head"><h3>Визуализатор</h3><button type="button" class="viz-chooser-close" data-viz-close aria-label="Закрыть">×</button></div><div class="viz-chooser-grid">' +
    STYLES.map(([id, title], i) => `<button type="button" data-viz="${id}"><span class="viz-thumb">${thumb(i)}</span><span class="viz-name">${title}</span></button>`).join("") +
    '</div><p class="viz-chooser-note">Нажмите × или за пределами окна, чтобы закрыть</p></div>';
  document.body.appendChild(chooser);
  function openChooser() {
    chooser.querySelectorAll("[data-viz]").forEach(b => b.classList.toggle("on", b.dataset.viz === style()));
    chooser.hidden = false;
  }
  chooser.addEventListener("click", event => {
    const button = event.target.closest("[data-viz]");
    if (button) { setStyle(button.dataset.viz); chooser.hidden = true; return; }
    if (event.target.closest("[data-viz-close]") || event.target === chooser) chooser.hidden = true;
  });
  let pressTimer = 0;
  let longPressed = false;
  el.addEventListener("pointerdown", () => {
    clearTimeout(pressTimer);
    longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; openChooser(); }, 600);
  });
  // A tap moves to the next style. The click that ends a long press is not a tap: it only clears the flag.
  el.addEventListener("click", () => {
    if (longPressed) { longPressed = false; return; }
    next();
  });
  const cancelPress = () => clearTimeout(pressTimer);
  el.addEventListener("pointerup", cancelPress);
  el.addEventListener("pointerleave", cancelPress);
  el.addEventListener("pointercancel", cancelPress);
  el.addEventListener("contextmenu", event => event.preventDefault());
  window.addEventListener("resize", place);
  window.vizStyles = STYLES;
  window.vizStyle = style;
  window.setVizStyle = setStyle;
  setInterval(place, 500);
  draw();
})();
