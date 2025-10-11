// ===== Edamam Recipe Search (client-only demo) =====
// Your keys (public in client — OK for demo):
const CONFIG = {
  APP_ID: "f2e0b522",
  APP_KEY: "5f170ee4d248a029807749c667f14e7a",
  MAX_RESULTS: 60
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);

// --- 1) Calorie math (Harris–Benedict like in your screenshot) ---
function calcBMR({ gender, weight, height, age }) {
  // weight kg, height cm, age years
  if (gender === 'male') {
    // BMR = 88.362 + (13.397 × weight) + (4.799 × height) − (5.677 × age)
    return 88.362 + 13.397*weight + 4.799*height - 5.677*age;
  } else {
    // BMR = 447.593 + (9.247 × weight) + (3.098 × height) − (4.330 × age)
    return 447.593 + 9.247*weight + 3.098*height - 4.330*age;
  }
}
function calcDailyCalories({ gender, weight, height, age, activity }) {
  const bmr = calcBMR({ gender, weight, height, age });
  return Math.round(bmr * activity);
}

// --- 2) Map UI choices to Edamam params ---
function mapSpecToHealth(spec) {
  const m = {
    "vegan": "vegan",
    "vegetarian": "vegetarian",
    "non-vegetarian": "",         // no health filter
    "alcohol-free": "alcohol-free",
    "peanut-free": "peanut-free"
  };
  return m[spec] || "";
}
function mapDiet(diet) {
  // Edamam diet params: balanced, low-carb, low-fat, high-protein
  const m = {
    "Balanced": "balanced",
    "Low-Carb": "low-carb",
    "Low-Fat": "low-fat"
  };
  return m[diet] || "";
}

// --- 3) Edamam fetch helpers ---
function buildQuery({ q, perMealCalories, diet, health }) {
  const params = new URLSearchParams({
    type: "public",
    q: q || "meal",
    app_id: CONFIG.APP_ID,
    app_key: CONFIG.APP_KEY,
    imageSize: "REGULAR",
    field: "label",
    field: "image",
    field: "ingredientLines",
    field: "calories",
    field: "totalWeight",
    field: "dietLabels",
    field: "healthLabels",
    calories: `${Math.max(100, perMealCalories - 120)}-${perMealCalories + 120}`,
    random: "true",
    from: "0",
    to: String(CONFIG.MAX_RESULTS)
  });
  if (diet) params.append("diet", diet);
  if (health) params.append("health", health);
  return `https://api.edamam.com/api/recipes/v2?${params.toString()}`;
}
async function fetchPool(opts) {
  const url = buildQuery(opts);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Edamam error ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map(h => h.recipe);
}

// --- 4) Weekly table rendering ---
function ingredientsHTML(list, max = 6) {
  const items = (list || []).slice(0, max).map(x => `<li>${x}</li>`).join("");
  return `<ul style="margin:6px 0 0 18px;">${items}</ul>`;
}
function buildWeeklyPlan(recipes, mealsPerDay) {
  const grid = Array.from({ length: mealsPerDay }, () => Array(7).fill(null));
  let i = 0;
  for (let r = 0; r < mealsPerDay; r++) {
    for (let c = 0; c < 7; c++) {
      grid[r][c] = recipes[i % recipes.length];
      i++;
    }
  }
  return grid;
}
function renderTable(grid) {
  const thead = `
    <thead>
      <tr>
        <th style="text-align:left;">Meal</th>
        ${WEEKDAYS.map(d=>`<th>${d}</th>`).join("")}
      </tr>
    </thead>`;
  const tbody = `
    <tbody>
      ${grid.map((row, rIdx) => `
        <tr>
          <td style="font-weight:700;">Meal ${rIdx+1}</td>
          ${row.map(rec => `
            <td style="min-width:180px;">
              <div style="font-weight:700;margin-bottom:4px;">${rec.label}</div>
              <img class="recipe" src="${rec.image}" alt="${rec.label}" />
              ${ingredientsHTML(rec.ingredientLines)}
            </td>
          `).join("")}
        </tr>
      `).join("")}
    </tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

// --- 5) Main submit handler ---
document.getElementById('meal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const age = Number(($('age').value || "").trim());
  const weight = Number(($('weight').value || "").trim());
  const height = Number(($('height').value || "").trim());
  const gender = $('gender').value;
  const activity = Number($('activityLevel').value);
  const meals = Number($('numOfMeals').value);
  const dietPreference = $('dietPreference').value;
  const healthSpec = $('healthSpec').value;

  // 1) calories via Harris–Benedict (as in your screenshot)
  const dailyCalories = calcDailyCalories({ gender, weight, height, age, activity });
  $('cal-output').textContent = `Daily calories: ${dailyCalories} kcal`;

  // 2) per-meal target and Edamam filters
  const perMeal = Math.round(dailyCalories / meals);
  const diet = mapDiet(dietPreference);
  const health = mapSpecToHealth(healthSpec);

  $('status').textContent = `Fetching recipes near ~${perMeal} kcal per meal…`;
  $('results').innerHTML = "";

  try {
    const pool = await fetchPool({ q: "recipe", perMealCalories: perMeal, diet, health });
    if (!pool.length) {
      $('status').textContent = "No recipes found for your filters. Try changing options.";
      return;
    }
    const grid = buildWeeklyPlan(pool, meals);
    $('results').innerHTML = renderTable(grid);
    $('status').textContent = "Done.";
  } catch (err) {
    $('status').textContent = `Error: ${err.message}`;
  }
});
