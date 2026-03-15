
function renderIngredients() {
  const list = document.getElementById('ingredients-list');
  list.innerHTML = ingredients
    .map(
      (i, idx) =>
        `<span class="ingr-tag">${i}<button onclick="removeIngredient(${idx})" title="Remove">×</button></span>`
    )
    .join('');
  localStorage.setItem('savr_ingredients', JSON.stringify(ingredients));
}

function addIngredient() {
  const input = document.getElementById('ingredient-input');
  const val = input.value.trim();
  if (val && !ingredients.includes(val)) {
    ingredients.push(val);
    renderIngredients();
    input.value = '';
  }
  input.focus();
}

function removeIngredient(idx) {
  ingredients.splice(idx, 1);
  renderIngredients();
}

function initIngredients() {
  document.getElementById('ingredient-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addIngredient();
  });

  // Seed demo ingredients if storage is empty
  if (ingredients.length === 0) {
    ingredients = ['Eggs', 'Broccoli', 'Garlic', 'Tomatoes', 'Olive Oil'];
  }
  renderIngredients();
}
