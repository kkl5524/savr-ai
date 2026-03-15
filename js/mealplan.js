function renderMealPlanPlaceholder() {
  const grid = document.getElementById('meal-plan-grid');
  grid.innerHTML = MEAL_PLAN_TEMPLATE.map((d, i) => `
    <div class="day-card ${i === 0 ? 'active' : ''}" onclick="setActiveDay(this)">
      <div class="day-name">${d.day}</div>
      <div class="day-meal">–</div>
      <div class="day-meal-name" style="opacity:0.35;">No plan yet</div>
    </div>
  `).join('');
}

function generateMealPlan() {
  const grid = document.getElementById('meal-plan-grid');
  grid.innerHTML = MEAL_PLAN_TEMPLATE.map((d, i) => `
    <div class="day-card ${i === 0 ? 'active' : ''}" onclick="setActiveDay(this)">
      <div class="day-name">${d.day}</div>
      <div class="day-meal">${d.icon}</div>
      <div class="day-meal-name">${d.meal}</div>
    </div>
  `).join('');
}

function setActiveDay(el) {
  document.querySelectorAll('.day-card').forEach((d) => d.classList.remove('active'));
  el.classList.add('active');
}
