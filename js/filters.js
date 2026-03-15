const FILTERS_KEY = 'savr_filters';

function toggleChip(el, style) {
  el.classList.toggle('active');
  if (style) el.classList.toggle(style, el.classList.contains('active'));
  saveFilters();
}

function saveFilters() {
  const activeChips = [...document.querySelectorAll('.chip.active')].map((chip) => ({
    text: chip.textContent.trim(),
    style: chip.dataset.chipStyle || null,
  }));
  localStorage.setItem(FILTERS_KEY, JSON.stringify(activeChips));
}

function restoreFilters() {
  const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || '[]');
  if (!saved.length) return;

  document.querySelectorAll('.chip').forEach((chip) => {
    const match = saved.find((s) => s.text === chip.textContent.trim());
    if (match) {
      chip.classList.add('active');
      if (match.style) chip.classList.add(match.style);
    }
  });
}

function initFilters() {
  document.querySelectorAll('#allergy-chips .chip').forEach((chip) => {
    chip.dataset.chipStyle = 'terra';
  });
  restoreFilters();
}