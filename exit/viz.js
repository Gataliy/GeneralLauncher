// Визуализатор под карточкой музыки: 8 стилей на canvas. Это анимация, а не спектр звука (из машины спектр не приходит).
// Анимирован, пока играет (state.isPlaying); на паузе столбики опускаются. Стиль выбирается в «Настройки > Музыка» или коротким тапом по визуализатору.
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

  el.addEventListener("click", next);
  window.addEventListener("resize", place);
  document.addEventListener("viz-style", () => {});
  window.vizStyles = STYLES;
  window.vizStyle = style;
  window.setVizStyle = setStyle;
  setInterval(place, 500);
  draw();
})();
