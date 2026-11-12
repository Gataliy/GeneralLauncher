// Волновая полоса плеера: 48 столбиков вместо прямой линии. Пройденная часть трека подсвечивается акцентом.
// Высоты столбиков фиксированы по номеру (это оформление, а не данные трека); прогресс берётся из #track-line-fill.
(function () {
  const COUNT = 48;
  function build() {
    const line = document.querySelector(".player-tl-line");
    if (!line || line.querySelector(".wv")) return;
    for (let i = 0; i < COUNT; i++) {
      const bar = document.createElement("i");
      bar.className = "wv";
      const h = 0.35 + 0.65 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
      bar.style.height = Math.round(h * 30) + "px";
      line.appendChild(bar);
    }
  }
  function paint() {
    const fill = document.getElementById("track-line-fill");
    if (!fill) return;
    const pct = parseFloat(fill.style.width) || 0;
    const lit = Math.round((pct / 100) * COUNT);
    document.querySelectorAll(".player-tl-line .wv").forEach((bar, i) => bar.classList.toggle("on", i < lit));
  }
  build();
  setInterval(() => { build(); paint(); }, 400);
})();
