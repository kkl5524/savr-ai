let ingredients = JSON.parse(localStorage.getItem('savr_ingredients') || '[]');
let pinned = JSON.parse(localStorage.getItem('savr_pinned') || '[]');
let currentRecipes = [];
let currentModalId = null;
let aiResponseIndex = 0;
