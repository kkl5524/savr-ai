function generateGroceryList() {
  const pinnedRecipes = SAMPLE_RECIPES.filter((r) => pinned.includes(r.id));
  if (pinnedRecipes.length === 0) {
    alert('Pin some recipes first to generate a grocery list!');
    return;
  }

  const allIngredients = [...new Set(pinnedRecipes.flatMap((r) => r.ingredients))];
  const needed = allIngredients.filter(
    (i) => !ingredients.some((ui) => ui.toLowerCase().includes(i.toLowerCase()))
  );

  const list = document.getElementById('grocery-list');
  list.innerHTML = (needed.length ? needed : allIngredients)
    .map(
      (i) => `
      <li style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--stone-pale);">
        <input type="checkbox" style="accent-color:var(--moss);width:16px;height:16px;cursor:pointer;">
        <span style="font-size:0.9rem;">${i}</span>
      </li>
    `
    )
    .join('');

  document.getElementById('grocery-backdrop').classList.add('open');
}

function closeGrocery(e) {
  if (e.target === document.getElementById('grocery-backdrop')) {
    document.getElementById('grocery-backdrop').classList.remove('open');
  }
}
