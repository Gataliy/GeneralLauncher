// Short guide with 14 steps. Each step lights up one part of the home screen and explains it.
// It starts once on the first launch and can be repeated from Settings → О программе.
(function () {
  const DONE_KEY = "generic_launcher_tour_done_v1";
  const STEPS = [
    { sel: "#weather-widget", text: "Погода. Нажмите, чтобы обновить." },
    { sel: ".hw-state", text: "Состояние автомобиля: люк, багажник, топливо и другие данные, которые присылает машина." },
    { sel: ".hw-nav", text: "Навигация: манёвр и маршрут из Яндекс Навигатора, если он запущен." },
    { sel: ".hw-compass", text: "Компас и скорость." },
    { sel: "#action-slots", text: "Ряд слотов: сиденья, климат и другие действия. Нажатие выполняет действие." },
    { sel: ".page-tabs", text: "Вкладки страниц: сиденья и климат, окна, экран, приложения." },
    { sel: ".album-art", text: "Нажмите на обложку, чтобы открыть плеер на весь верх." },
    { edge: "left", text: "Проведите по левому краю вверх или вниз: температура водителя." },
    { edge: "right", text: "Проведите по правому краю вверх или вниз: температура пассажира." },
    { sel: ".hero-clock", text: "Долгое нажатие на карточку открывает режим редактирования: переставить, изменить размер, скрыть." },
    { sel: "#action-slots", text: "Долгое нажатие на слот — порядок слотов. В этом режиме нажатие на слот выбирает действие." },
    { sel: ".hero", text: "Пустое место на главном экране: тап листает избранные обои, долгое нажатие сохраняет текущие." },
    { sel: "#open-settings", text: "Настройки: тема, обои, карточки и сброс." },
    { sel: "#open-settings", text: "Карточки обогрева руля и стекла скрыты. Включите их во вкладке «Карточки» в настройках." }
  ];

  const overlay = document.createElement("div");
  overlay.className = "tour";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="tour-edge tour-edge-left" hidden></div>
    <div class="tour-edge tour-edge-right" hidden></div>
    <div class="tour-card" role="dialog" aria-live="polite">
      <div class="tour-count"></div>
      <p class="tour-text"></p>
      <div class="tour-actions"><button type="button" data-act="skip">Пропустить</button><button type="button" data-act="next">Далее</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const card = overlay.querySelector(".tour-card");
  const countEl = overlay.querySelector(".tour-count");
  const textEl = overlay.querySelector(".tour-text");
  const nextButton = overlay.querySelector('[data-act="next"]');
  const edges = { left: overlay.querySelector(".tour-edge-left"), right: overlay.querySelector(".tour-edge-right") };
  let index = 0;
  let focused = null;

  function clearFocus() {
    if (focused) focused.classList.remove("tour-focus");
    focused = null;
  }

  function show() {
    const step = STEPS[index];
    clearFocus();
    edges.left.hidden = true;
    edges.right.hidden = true;
    if (step.edge) {
      edges[step.edge].hidden = false;
    } else {
      const el = document.querySelector(step.sel);
      if (el) {
        focused = el;
        el.classList.add("tour-focus");
        el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
    }
    countEl.textContent = `Шаг ${index + 1} из ${STEPS.length}`;
    textEl.textContent = step.text;
    nextButton.textContent = index === STEPS.length - 1 ? "Готово" : "Далее";
    placeCard(step);
  }

  // The card sits under the lit element when there is room, otherwise above it, otherwise in the middle.
  function placeCard(step) {
    const el = step.sel ? document.querySelector(step.sel) : null;
    if (!el) {
      card.style.left = "50%";
      card.style.top = "50%";
      card.style.transform = "translate(-50%, -50%)";
      return;
    }
    const r = el.getBoundingClientRect();
    card.style.transform = "translateX(-50%)";
    card.style.left = `${Math.min(window.innerWidth - 260, Math.max(260, r.left + r.width / 2))}px`;
    const below = r.bottom + 14;
    const cardH = card.offsetHeight || 150;
    card.style.top = below + cardH < window.innerHeight ? `${below}px` : `${Math.max(12, r.top - cardH - 14)}px`;
  }

  function finish() {
    clearFocus();
    overlay.hidden = true;
    try { localStorage.setItem(DONE_KEY, "1"); } catch (e) { /* not important */ }
  }

  overlay.querySelector(".tour-actions").addEventListener("click", event => {
    const act = event.target.closest("button")?.dataset.act;
    if (act === "skip") finish();
    if (act === "next") {
      if (index >= STEPS.length - 1) finish();
      else { index += 1; show(); }
    }
  });

  window.startTutorial = function startTutorial() {
    index = 0;
    overlay.hidden = false;
    show();
  };

  let done = false;
  try { done = localStorage.getItem(DONE_KEY) === "1"; } catch (e) { done = false; }
  if (!done) setTimeout(window.startTutorial, 1500);
})();
