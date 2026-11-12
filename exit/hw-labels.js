// Card titles on the home screen: a tap on "Навигация" starts Yandex Navigator,
// a tap on "Состояние автомобиля" opens the full list of car readings (the same chips the card shows).
const NAV_APP_PACKAGE = "ru.yandex.yandexnavi";
let stateSheetTimer = null;

function ensureStateSheet() {
  let sheet = document.getElementById("state-sheet");
  if (sheet) return sheet;
  sheet = document.createElement("div");
  sheet.id = "state-sheet";
  sheet.className = "state-sheet";
  sheet.hidden = true;
  sheet.innerHTML = '<div class="state-card" role="dialog" aria-label="Состояние автомобиля"><h3>Состояние автомобиля</h3><div class="state-list"></div><p class="state-note">Нажмите, чтобы закрыть</p></div>';
  sheet.addEventListener("click", closeStateSheet);
  document.body.appendChild(sheet);
  return sheet;
}

function renderStateSheet() {
  const sheet = document.getElementById("state-sheet");
  const list = sheet.querySelector(".state-list");
  const esc = value => String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (typeof window.carDetailGroups === "function") {
    // The full list: Кузов, Шины, Двигатель и питание (the same groups as in the earlier build).
    list.innerHTML = window.carDetailGroups().map(group =>
      `<h5 class="state-group">${esc(group.title)}</h5>` + group.rows.map(row =>
        `<div class="state-row${row.open ? " open" : ""}"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join("")).join("");
    return;
  }
  const chips = document.querySelectorAll("#hw-chips .hw-chip");
  if (!chips.length) {
    list.innerHTML = '<div class="state-row"><span>Данных от машины пока нет</span></div>';
    return;
  }
  list.innerHTML = [...chips].map(chip => {
    const label = chip.querySelector("span")?.textContent || "";
    const value = chip.querySelector("b")?.textContent || "";
    return `<div class="state-row${chip.classList.contains("open") ? " open" : ""}"><span>${label}</span><b>${value}</b></div>`;
  }).join("");
}

function openStateSheet() {
  const sheet = ensureStateSheet();
  renderStateSheet();
  sheet.hidden = false;
  clearInterval(stateSheetTimer);
  stateSheetTimer = setInterval(() => {
    if (sheet.hidden) return clearInterval(stateSheetTimer);
    renderStateSheet();
  }, 1000);
}

function closeStateSheet() {
  const sheet = document.getElementById("state-sheet");
  if (sheet) sheet.hidden = true;
  clearInterval(stateSheetTimer);
}

document.addEventListener("click", event => {
  const navLabel = event.target.closest && event.target.closest(".hw-nav > .hw-eb");
  if (navLabel && !document.body.classList.contains("hw-edit")) {
    if (bridge.has("runApp")) bridge.runApp(NAV_APP_PACKAGE);
    else showToast("Навигатор недоступен");
    return;
  }
  const stateLabel = event.target.closest && event.target.closest(".hw-state > .hw-eb");
  if (stateLabel && !document.body.classList.contains("hw-edit")) openStateSheet();
});

// "На приборку" pill on the navigation card: a tap shows the instrument panel (GO_TO_PP).
function ensureNavPill() {
  const card = document.querySelector(".hw-nav");
  if (!card || card.querySelector("[data-tg-nav=cluster]")) return;
  const actions = document.createElement("div");
  actions.className = "hw-nav-actions";
  actions.innerHTML = '<button type="button" class="hw-nav-btn" data-tg-nav="cluster">На приборку</button>';
  const title = card.querySelector(".hw-eb");
  if (title) title.after(actions); else card.prepend(actions);
}
ensureNavPill();
setInterval(ensureNavPill, 1000);
document.addEventListener("click", event => {
  const pill = event.target.closest && event.target.closest("[data-tg-nav=cluster]");
  if (!pill || document.body.classList.contains("hw-edit")) return;
  event.stopPropagation();
  event.preventDefault();
  runCommand("GO_TO_PP", "Показать на приборной панели", pill);
}, true);
