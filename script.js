// ====== Edamam client-only demo (keys are PUBLIC here — fine for a quick demo) ======
const CONFIG = {
  APP_ID: "f2e0b522",                          // your App ID
  APP_KEY: "5f170ee4d248a029807749c667f14e7a", // your App Key
  MAX_RESULTS: 60
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);

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

// Fill [meals x 7] grid by cycling results
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

function ingredientsHTML(list, max = 6) {
  const items = (list || []).slice(0, max).map(x => `<li>${x}</li>`).join("");
  return `<ul style="margin:6px 0 0 18px;">${items}</ul>`;
}

function renderTable(grid) {
  const thead = `
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;">Meal</th>
        ${WEEKDAYS.map(d=>`<th style="padding:8px;">${d}</th>`).join("")}
      </tr>
    </thead>`;
  const tbody = `
    <tbody>
      ${grid.map((row, rIdx) => `
        <tr>
          <td style="padding:8px;font-weight:600;">Meal ${rIdx+1}</td>
          ${row.map(rec => `
            <td style="vertical-align:top;padding:8px;min-width:180px;">
              <div style="font-weight:600;margin-bottom:4px;">${rec.label}</div>
              <img src="${rec.image}" alt="${rec.label}" style="width:100%;height:auto;border-radius:10px;border:1px solid #334155;margin:6px 0;" />
              ${ingredientsHTML(rec.ingredientLines)}
            </td>
          `).join("")}
        </tr>
      `).join("")}
    </tbody>`;
  return `<table style="width:100%;border-collapse:separate;border-spacing:0 10px;">${thead}${tbody}</table>`;
}

async function generateMealPlan() {
  const meals = Number($('meals').value);
  const dietPref = $('diet').value;            // Balanced | Low-Carb | Low-Fat
  const healthSpec = $('health').value;        // vegan | vegetarian | non-vegetarian | alcohol-free | peanut-free
  const dailyCals = Number($('calories').value);

  const perMeal = Math.round(dailyCals / meals);
  const diet = mapDiet(dietPref);
  const health = mapSpecToHealth(healthSpec);

  $('results').innerHTML = "Fetching recipes…";

  const pool = await fetchPool({ q: "recipe", perMealCalories: perMeal, diet, health });
  if (!pool.length) {
    $('results').innerHTML = `<div>No recipes found for your filters. Try changing diet/health or calories.</div>`;
    return;
  }

  const grid = buildWeeklyPlan(pool, meals);
  $('results').innerHTML = renderTable(grid);
}

document.getElementById('meal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await generateMealPlan();
  } catch (err) {
    $('results').innerHTML = `<div>Error: ${err.message}</div>`;
  }
});
