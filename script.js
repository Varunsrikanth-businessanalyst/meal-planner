// ===== Meal Planner — Frontend (uses Vercel /api/recipes proxy) =====
const CONFIG = {
  PROXY_BASE: "",   // same-origin; leave "" on Vercel
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
  return ({
    "vegan":"vegan",
    "vegetarian":"vegetarian",
    "alcohol-free":"alcohol-free",
    "peanut-free":"peanut-free"
  }[s]) || "";
}

// ------- Build URL for our PROXY (/api/recipes) -------
function buildProxyQuery({ q, perMealCalories, diet, health, cuisine, timeRange }) {
  const params = new URLSearchParams({
    q: q || "recipe",
    from: "0",
    to: String(CONFIG.MAX_RESULTS),
    random: "true"
  });

  if (Number.isFinite(perMealCalories)) {
    params.set("perMealCalories", String(perMealCalories)); // server converts to range
  }
  if (diet)      params.set("diet", diet);
  if (health)    params.set("health", health);
  if (cuisine)   params.set("cuisine", cuisine);
  if (timeRange) params.set("timeRange", timeRange);

  return `${CONFIG.PROXY_BASE}/api/recipes?${params.toString()}`;
}

async function fetchPool(opts) {
  const url = buildProxyQuery(opts);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || res.statusText || `Server ${res.status}`;
    throw new Error(msg);
  }
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
  const macro = (label, grams) =>
    `<span class="chip"><span class="chip__dot"></span>${label}: ${grams}g</span>`;
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
              <a href="${rec.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:#111;">
                ${rec.label}
              </a>
            </div>
            <img class="recipe" src="${rec.image}" alt="${rec.label}" />
            <div style="margin:6px 0 4px; font-size:13px;" class="muted">
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

// ------- print helpers -------
function waitForImages(container) {
  const imgs = Array.from(container.querySelectorAll('img'));
  if (!imgs.length) return Promise.resolve();
  return Promise.all(
    imgs.map(img => (img.complete ? Promise.resolve() : new Promise(res => {
      img.onload = img.onerror = () => res();
    })))
  );
}

// ------- main -------
document.addEventListener("DOMContentLoaded", () => {
  const form = $('meal-form');
  const statusEl = $('status');
  const resultsEl = $('results');
  const calChip = $('cal-output');
  const downloadBtn = $('download-pdf');

  const setStatus = (msg) => {
    if (!statusEl) return;
    if (!msg) { statusEl.textContent = ""; statusEl.classList.remove("show"); return; }
    statusEl.textContent = msg;
    statusEl.classList.add("show");
  };

  function resetAll() {
    form.reset();
    resultsEl.innerHTML = "";
    setStatus("");
    if (calChip) calChip.textContent = "Daily calories: —";
    if (downloadBtn) downloadBtn.disabled = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
    $('age')?.focus();
  }
  $('home-reset')?.addEventListener('click', resetAll);

  // Download PDF click
  downloadBtn?.addEventListener('click', async () => {
    if (!resultsEl.innerHTML.trim()) return;
    downloadBtn.disabled = true;
    document.body.classList.add('printing');
    try {
      await waitForImages(resultsEl);
    } finally {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing');
        downloadBtn.disabled = false;
      }, 300);
    }
  });

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
    const quick = $('quickSelect').value; // "none" | "10" | "20" | "30+"

    if ([age, weight, height].some(x => Number.isNaN(x))) {
      setStatus("Please fill Age, Weight and Height.");
      return;
    }

    const dailyCalories = calcDailyCalories({ gender, weight, height, age, activity });
    if (calChip) calChip.textContent = `Daily calories: ${dailyCalories} kcal`;

    const perMeal = Math.round(dailyCalories / meals);
    const diet = mapDiet(dietPreference);
    const health = mapSpecToHealth(healthSpec);

    // Map quick selection -> Edamam 'time' range
    let timeRange = "";
    if (quick === "10") timeRange = "1-10";
    else if (quick === "20") timeRange = "1-20";
    else if (quick === "30+") timeRange = "30-180";

    setStatus(""); resultsEl.innerHTML = "";
    downloadBtn && (downloadBtn.disabled = true);

    try {
      const pool = await fetchPool({
        q: "recipe",
        perMealCalories: perMeal,
        diet,
        health,
        cuisine: cuisine || "",
        timeRange: timeRange || ""
      });
      if (!pool.length) {
        setStatus("No recipes matched. Try a different 'Quick recipes' option or relax filters.");
        return;
      }
      const grid = buildWeeklyPlan(pool, meals);
      resultsEl.innerHTML = renderTable(grid);
      downloadBtn && (downloadBtn.disabled = false);
      resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStatus(err.message || "Something went wrong.");
    }
  });
});
