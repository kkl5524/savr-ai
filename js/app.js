document.addEventListener('DOMContentLoaded', () => {
  initIngredients();
  initFilters();
  renderMealPlanPlaceholder();
  renderPinned();
  updatePinBadge();
});
