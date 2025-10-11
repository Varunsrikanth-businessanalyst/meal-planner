// ===== Edamam Recipe Search (client-only demo) =====
const CONFIG = {
  APP_ID: "2befcb23",
  APP_KEY: "8f23abc226368ff9c39b71b668e43349",
  MAX_RESULTS: 60
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ------- DOM helpers (safe with fallback IDs) -------
const el = (id) => document.getElementById(id);
const val = (idList) => {
  for (const id of idList) {
    const node = el(id);
    if (node) return node.value;
  }
  return null;
};

// ------- Calorie math (Harris–Benedict) -------
function calcBMR({ gender, weight, height, age }) {
  return (gender === "male")
    ? 88.362 + 13.397*weight + 4.799*height - 5.677*age
    : 447.593 +  9.247*weight + 3.098*height - 4.330*age;
}
function calcDailyCalories({ gender, weight, height, age, activity }) {
  const bmr = calcBMR({ gender, weight, height, age });
  return Math.round(bmr * activity);
}

// ------- Map UI to Edamam params -------
function mapDiet(d) {
  return ({ "Balanced":"balanced", "Low-Carb":"low-carb", "Low-Fat":"low-fat" }[d]) || "";
}
function mapSpecToHealth(s) {
  return ({ "vegan":"vegan", "vegetarian":"vegetarian", "alcohol-free":"alcohol-free", "peanut-free":"peanut-free" }[s]) || "";
}

// ------- Edamam fetch -------
function buildQuery({ q, perMealCalories, diet, health }) {
  const params = new URLSearchParams({
    type: "public",
    q: q || "meal",
    app_id: CONFIG.APP_ID,
    app_key: CONFIG.APP_KEY,
    imageSize: "REGULAR",
    calories: `${Math.max(100, perMealCalories - 120)}-${perMealCalories + 120}`,
    random: "true",
    from: "0",
    to: String(CONFIG.MAX_RESULTS)
  });
  ["label","image","ingredientLines","calories","totalWeight","dietLabels","healthLabels"]
    .forEach(f => params.append("field", f));
  if (diet) params.append("diet", diet);
  if (health) params.append("health", health);
  return `https://api.edamam.com/api/recipes/v2?${params.toString()}`;
}


async function fetchPool(opts) {
  const res = await fetch(buildQuery(opts));
  if (!res.ok) throw new Error(`Edamam error ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map(h => h.recipe);
}

// ------- Render weekly table -------
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
  const thead = `<thead><tr><th style="text-align:left;">Meal</th>${WEEKDAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${
    grid.map((row, rIdx) => `
      <tr>
        <td style="font-weight:700;">Meal ${rIdx+1}</td>
        ${row.map(rec => `
          <td style="min-width:180px;vertical-align:top;">
            <div style="font-weight:700;margin-bottom:4px;">${rec.label}</div>
            <img src="${rec.image}" alt="${rec.label}" style="width:100%;height:auto;border-radius:10px;border:1px solid #e5e7eb;margin:6px 0;" />
            ${ingredientsHTML(rec.ingredientLines)}
          </td>`).join("")}
      </tr>
    `).join("")
  }</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

// ------- Main submit handler -------
document.addEventListener("DOMContentLoaded", () => {
  const form = el("meal-form");
  const statusEl = el("status") || { textContent: "" };
  const resultsEl = el("results") || { innerHTML: "" };
  const calChip = el("cal-output") || { textContent: "" };

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Read values; support both old and new ID names
    const age = Number((val(["age"]) || "").trim());
    const weight = Number((val(["weight"]) || "").trim());
    const height = Number((val(["height"]) || "").trim());
    const gender = val(["gender"]) || "male";
    const activity = Number(val(["activityLevel"])) || 1.2;

    const meals = Number(val(["numOfMeals","meals"])) || 3;
    const dietPreference = val(["dietPreference","diet"]) || "Balanced";
    const healthSpec = val(["healthSpec","health"]) || "non-vegetarian";

    // Guard against missing fields
    if ([age, weight, height].some(x => Number.isNaN(x))) {
      statusEl.textContent = "Please fill Age, Weight, and Height.";
      return;
    }

    // 1) calories
    const dailyCalories = calcDailyCalories({ gender, weight, height, age, activity });
    calChip.textContent = `Daily calories: ${dailyCalories} kcal`;

    // 2) per-meal & filters
    const perMeal = Math.round(dailyCalories / meals);
    const diet = mapDiet(dietPreference);
    const health = mapSpecToHealth(healthSpec);

    statusEl.textContent = `Fetching recipes near ~${perMeal} kcal per meal…`;
    resultsEl.innerHTML = "";

    try {
      const pool = await fetchPool({ q: "recipe", perMealCalories: perMeal, diet, health });
      if (!pool.length) {
        statusEl.textContent = "No recipes found for your filters. Try different options.";
        return;
      }
      const grid = buildWeeklyPlan(pool, meals);
      resultsEl.innerHTML = renderTable(grid);
      statusEl.textContent = "Done.";
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });
});
