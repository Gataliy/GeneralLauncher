// Меню слота по долгому нажатию: «Заменить», «Переставить» (режим перестановки) и «Удалить» (только у занятого слота).
function openSlotMenu(index, element) {
  document.querySelectorAll(".slot-menu-backdrop").forEach(node => node.remove());
  const filled = !!(state.slots[index] && state.slots[index].type !== "empty");
  const backdrop = document.createElement("div");
  backdrop.className = "slot-menu-backdrop";
  backdrop.innerHTML = `<div class="slot-menu" role="menu" aria-label="Слот">` +
    `<button type="button" role="menuitem" data-act="replace">Заменить</button>` +
    `<button type="button" role="menuitem" data-act="move">Переставить</button>` +
    (filled ? `<button type="button" role="menuitem" class="danger" data-act="delete">Удалить</button>` : "") +
    `</div>`;
  document.body.appendChild(backdrop);
  const menu = backdrop.querySelector(".slot-menu");
  const rect = element.getBoundingClientRect();
  const width = menu.offsetWidth || 200;
  const height = menu.offsetHeight || 150;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
  const top = rect.bottom + 8 + height <= window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - height - 8);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) { backdrop.remove(); return; }
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const act = button.dataset.act;
    backdrop.remove();
    if (act === "replace") openPicker(index);
    else if (act === "move") enterSlotOrder();
    else if (act === "delete") removeSlot(index);
  });
}
