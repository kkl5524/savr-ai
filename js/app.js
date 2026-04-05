document.addEventListener('DOMContentLoaded', () => {
  initIngredients();
  initFilters();
  renderMealPlanPlaceholder();
  renderPinned();
  updatePinBadge();
  if (typeof loadRecentForum === 'function') loadRecentForum();
});