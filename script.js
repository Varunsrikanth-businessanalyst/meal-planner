// ===== Edamam Recipe Search (client-only demo) =====
const CONFIG = {
  APP_ID: "2befcb23",
  APP_KEY: "8f23abc226368ff9c39b71b668e43349",
  USER_ID: "Vaarun", // your Edamam account username (case-sensitive)
  MAX_RESULTS: 60
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);

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

// ------- Edamam query & fetch -------
function buildQuery({ q, perMealCalories, diet, health, cuisine, timeRange }) {
  const params = new URLSearchParams({
    type: "public",
    q: q || "meal",
    app_id: CONFIG.APP_ID,
    app_key: CONFIG.APP_KEY,
    imageSize: "REGULAR",
    from: "0",
    to: String(CONFIG.MAX_RESULTS),
    random: "true"
  });

  if (Number.isFinite(perMealCalories)) {
    params.append("calories", `${Math.max(100, perMealCalories - 120)}-${perMealCalories + 120}`);
  }

  [
    "label","image","url","yield",
    "ingredientLines","calories","totalNutrients",
    "dietLabels","healthLabels","totalTime"
  ].forEach(f => params.append("field", f));

  if (diet)     params.append("diet", diet);
  if (health)   params.append("health", health);
  if (cuisine)  params.append("cuisineType", cuisine);
  if (timeRange) params.append("time", timeRange);

  return `https://api.edamam.com/api/recipes/v2?${params.toString()}`;
}

async function fetchPool(opts) {
  const url = buildQuery(opts);
  const res = await fetch(url, { headers: { "Edamam-Account-User": CONFIG.USER_ID } });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Edamam ${res.status}: ${text || res.statusText}`);
  const data = JSON.parse(text);
  return (data.hits || []).map(h => h.recipe);
}

// ------- helpers for macros -------
function kcalPerServing(recipe) {
  const servings = Math.max(1, recipe.yield || 1);
  return Math.round((recipe.calories || 0) / servings);
}
function gPerServing(recipe, key) {
  const qty = recipe.totalNutrients?.[key]?.quantity;
  const servings = Math.max(1, recipe.yield || 1);
  if (!qty || !isFinite(qty)) return 0;
  return Math.round(qty / servings);
}
function macroChipsHTML(recipe) {
  const macro = (label, grams) => `
    <span class="chip"><span class="chip__dot"></span>${label}: ${grams}g</span>`;
  return `
    <div class="macros">
      ${macro("Carbs",  gPerServing(recipe,"CHOCDF"))}
      ${macro("Protein",gPerServing(recipe,"PROCNT"))}
      ${macro("Fat",    gPerServing(recipe,"FAT"))}
      ${macro("Fiber",  gPerServing(recipe,"FIBTG"))}
      ${macro("Sugar",  gPerServing(recipe,"SUGAR"))}
    </div>`;
}

// ------- results rendering -------
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
  const thead = `<thead><tr><th>Meal</th>${WEEKDAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${
    grid.map((row, rIdx) => `
      <tr>
        <td>Meal ${rIdx+1}</td>
        ${row.map(rec => `
          <td style="min-width:220px;">
            <div style="font-weight:700;margin-bottom:4px;">
              <a href="${rec.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:#ffffff;">
                ${rec.label}
              </a>
            </div>
            <img class="recipe" src="${rec.image}" alt="${rec.label}" />
            <div style="margin:6px 0 4px; font-size:13px; color:#e5e7eb;">
              ~${kcalPerServing(rec)} kcal/serving${Number.isFinite(rec.totalTime) ? ` • ${rec.totalTime} min` : ""}
            </div>
            ${macroChipsHTML(rec)}
            ${ingredientsHTML(rec.ingredientLines)}
          </td>`).join("")}
      </tr>
    `).join("")
  }</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

// ------- main -------
document.addEventListener("DOMContentLoaded", () => {
  const form = $('meal-form');
  const statusEl = $('status');
  const resultsEl = $('results');
  const calChip = $('cal-output');

  // Quick recipes state
  const quickBtn = $('quick-btn');
  const quickMenu = $('quick-menu');
  const quickCaption = $('quick-caption');
  let quickChoice = ""; // "", "10", "20", "30+"

  const setStatus = (msg) => {
    if (!statusEl) return;
    if (!msg) { statusEl.textContent = ""; statusEl.classList.remove("show"); return; }
    statusEl.textContent = msg;
    statusEl.classList.add("show");
  };

  // Quick dropdown handlers
  function openQuickMenu() {
    quickMenu.classList.add('show');
    quickBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideQuick, { once: true });
  }
  function closeQuickMenu() {
    quickMenu.classList.remove('show');
    quickBtn.setAttribute('aria-expanded', 'false');
  }
  function onOutsideQuick(e){
    if (!quickMenu.contains(e.target) && e.target !== quickBtn) closeQuickMenu();
  }
  quickBtn.addEventListener('click', () => {
    if (quickMenu.classList.contains('show')) closeQuickMenu(); else openQuickMenu();
  });
  quickMenu.querySelectorAll('.menu__item').forEach(btn => {
    btn.addEventListener('click', () => {
      quickChoice = btn.dataset.time || "";
      // Update label & caption
      if (quickChoice === "10") {
        quickBtn.textContent = "10-minute recipes";
        quickCaption.textContent = "time ≤ 10 minutes";
      } else if (quickChoice === "20") {
        quickBtn.textContent = "20-minute recipes";
        quickCaption.textContent = "time ≤ 20 minutes";
      } else if (quickChoice === "30+") {
        quickBtn.textContent = "30+ minute recipes";
        quickCaption.textContent = "time ≥ 30 minutes";
      } else {
        quickBtn.textContent = "Quick recipes";
        quickCaption.textContent = "";
      }
      closeQuickMenu();
    });
  });

  // Soft reset: clear form + UI without reloading
  function resetAll() {
    $('meal-form').reset();
    resultsEl.innerHTML = "";
    setStatus("");
    calChip.textContent = "Daily calories: —";
    // Reset quick choice
    quickChoice = "";
    quickBtn.textContent = "Quick recipes";
    quickCaption.textContent = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    $('age')?.focus();
  }
  $('home-reset')?.addEventListener('click', resetAll);

  // Form submit → fetch & render
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const age = Number(($('age').value || "").trim());
    const weight = Number(($('weight').value || "").trim());
    const height = Number(($('height').value || "").trim());
    const gender = $('gender').value;
    const activity = Number($('activityLevel').value);
    const meals = Number($('numOfMeals').value);
    const dietPreference = $('dietPreference').value;
    const healthSpec = $('healthSpec').value;
    const cuisine = ($('cuisine').value || "").trim();

    if ([age, weight, height].some(x => Number.isNaN(x))) {
      setStatus("Please fill Age, Weight and Height.");
      return;
    }

    const dailyCalories = calcDailyCalories({ gender, weight, height, age, activity });
    calChip.textContent = `Daily calories: ${dailyCalories} kcal`;

    const perMeal = Math.round(dailyCalories / meals);
    const diet = mapDiet(dietPreference);
    const health = mapSpecToHealth(healthSpec);

    // Translate quickChoice -> time range
    let timeRange = "";
    if (quickChoice === "10") timeRange = "1-10";
    else if (quickChoice === "20") timeRange = "1-20";
    else if (quickChoice === "30+") timeRange = "30-180";

    setStatus(""); resultsEl.innerHTML = "";

    try {
      const pool = await fetchPool({
        q: "recipe",
        perMealCalories: perMeal,
        diet,
        health,
        cuisine: cuisine || "",
        timeRange: timeRange || ""
      });
      if (!pool.length) { setStatus("No recipes matched. Try a different quick option or relax filters."); return; }
      const grid = buildWeeklyPlan(pool, meals);
      resultsEl.innerHTML = renderTable(grid);
    } catch (err) {
      setStatus(err.message || "Something went wrong.");
    }
  });
});
