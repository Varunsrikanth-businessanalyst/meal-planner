// ===== Config =====
const CONFIG = {
  APP_ID: "2befcb23",
  APP_KEY: "8f23abc226368ff9c39b71b668e43349",
  USER_ID: "Vaarun",        // case-sensitive Edamam account username
  MAX_RESULTS: 60,
  CACHE_TTL_MS: 1000 * 60 * 15, // 15 minutes
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);

// ===== Unit helpers =====
const toKg  = (val, unit) => unit === "lb" ? Number(val) * 0.45359237 : Number(val);
const cmFromFtIn = (ft, inch) => Number(ft)*30.48 + Number(inch)*2.54;

// ===== Calories (Harris–Benedict) =====
function calcBMR({ gender, weightKg, heightCm, age }) {
  return (gender === "male")
    ? 88.362 + 13.397*weightKg + 4.799*heightCm - 5.677*age
    : 447.593 +  9.247*weightKg + 3.098*heightCm - 4.330*age;
}
function calcDailyCalories({ gender, weightKg, heightCm, age, activityMult, goalAdj }) {
  const bmr = calcBMR({ gender, weightKg, heightCm, age });
  const maintenance = bmr * activityMult;
  return Math.round(maintenance * (1 + goalAdj));
}

// ===== Macros target (simple 40/30/30) =====
function macroTargets(kcal) {
  const carbsPct = 0.4, proteinPct = 0.3, fatPct = 0.3;
  const carbs = Math.round((kcal*carbsPct)/4);
  const protein = Math.round((kcal*proteinPct)/4);
  const fat = Math.round((kcal*fatPct)/9);
  return { carbs, protein, fat };
}

// ===== UI → API mapping =====
function mapDiet(d) {
  return ({ "Balanced":"balanced", "Low-Carb":"low-carb", "Low-Fat":"low-fat" }[d]) || "";
}
function mapSpecToHealth(s) {
  return ({ "vegan":"vegan", "vegetarian":"vegetarian", "alcohol-free":"alcohol-free", "peanut-free":"peanut-free" }[s]) || "";
}

// ===== Build query =====
function buildQuery({ q, perMealCalories, diet, health, cuisines, excluded }) {
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

  // Fields we use
  ["label","image","url","yield","ingredientLines","calories","totalNutrients","dietLabels","healthLabels"]
    .forEach(f => params.append("field", f));

  if (diet) params.append("diet", diet);
  if (health) params.append("health", health);

  // Multiple cuisineType allowed
  (cuisines || []).forEach(cui => params.append("cuisineType", cui));

  // Exclusions: repeated 'excluded'
  (excluded || []).forEach(x => params.append("excluded", x));

  return `https://api.edamam.com/api/recipes/v2?${params.toString()}`;
}

// ===== Networking (retry/backoff) =====
async function fetchWithRetry(url, headers, maxRetries = 3) {
  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr || new Error("Network error");
}

async function fetchPool(opts) {
  const url = buildQuery(opts);
  const data = await fetchWithRetry(url, { "Edamam-Account-User": CONFIG.USER_ID });
  return (data.hits || []).map(h => h.recipe);
}

// ===== Macros helpers =====
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
  const macro = (label, grams) => `<span class="chip"><span class="chip__dot"></span>${label}: ${grams}g</span>`;
  return `
    <div class="macros">
      ${macro("Carbs",  gPerServing(recipe,"CHOCDF"))}
      ${macro("Protein",gPerServing(recipe,"PROCNT"))}
      ${macro("Fat",    gPerServing(recipe,"FAT"))}
      ${macro("Fiber",  gPerServing(recipe,"FIBTG"))}
      ${macro("Sugar",  gPerServing(recipe,"SUGAR"))}
    </div>`;
}

// ===== Render table =====
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
function renderTable(grid, dailyTotals) {
  const thead = `<thead>
    <tr><th>Meal</th>${WEEKDAYS.map(d=>`<th>${d}</th>`).join("")}</tr>
  </thead>`;
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
              ~${kcalPerServing(rec)} kcal/serving
            </div>
            ${macroChipsHTML(rec)}
            ${ingredientsHTML(rec.ingredientLines)}
          </td>`).join("")}
      </tr>
    `).join("")
  }</tbody>`;

  const totals = dailyTotals
    ? `<div class="macros" style="margin:8px 0">
         <span class="chip"><span class="chip__dot"></span>Total ~${dailyTotals.kcal} kcal/day</span>
         <span class="chip"><span class="chip__dot"></span>Carbs ~${dailyTotals.carbs} g</span>
         <span class="chip"><span class="chip__dot"></span>Protein ~${dailyTotals.protein} g</span>
         <span class="chip"><span class="chip__dot"></span>Fat ~${dailyTotals.fat} g</span>
       </div>`
    : "";

  return totals + `<table>${thead}${tbody}</table>`;
}

// ===== Cache helpers =====
function cacheKeyFromFilters(filters) {
  // Don't cache over large text; pick stable fields
  const keyObj = {
    perMealCalories: filters.perMealCalories,
    diet: filters.diet,
    health: filters.health,
    cuisines: filters.cuisines?.slice().sort(),
    excluded: filters.excluded?.slice().sort(),
  };
  return `mpg:${JSON.stringify(keyObj)}`;
}
function tryGetCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CONFIG.CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}
function setCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

// ===== Main =====
document.addEventListener("DOMContentLoaded", () => {
  const form = $('meal-form');
  const statusEl = $('status');
  const resultsEl = $('results');
  const calChip = $('cal-output');
  const goalPill = $('goal-pill');

  // Unit toggles
  let weightUnit = "kg";  // 'kg' | 'lb'
  let heightUnit = "cm";  // 'cm' | 'ftin'

  const setStatus = (msg) => {
    if (!statusEl) return;
    if (!msg) { statusEl.textContent = ""; statusEl.classList.remove("show"); return; }
    statusEl.textContent = msg;
    statusEl.classList.add("show");
  };

  function resetAll() {
    form.reset();
    // reset units UI
    document.querySelectorAll('[data-unit="kg"]').forEach(b=>b.classList.add('active'));
    document.querySelectorAll('[data-unit="lb"]').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('[data-unit="cm"]').forEach(b=>b.classList.add('active'));
    document.querySelectorAll('[data-unit="ftin"]').forEach(b=>b.classList.remove('active'));
    $('height-imperial').classList.add('hidden');
    $('height-cm').classList.remove('hidden');

    resultsEl.innerHTML = "";
    calChip.textContent = "Daily calories: —";
    goalPill.textContent = "Goal: Maintenance";
    setPreset("maintenance", false);
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    $('age').focus();
  }

  $('home-reset').addEventListener('click', resetAll);

  // ----- Presets -----
  const PRESETS = {
    fatloss:     { label:"Fat loss",     goalAdj:-0.15, suggest:{ meals:3, activity:"1.55" } },
    maintenance: { label:"Maintenance",  goalAdj:0.00,  suggest:{ meals:3, activity:"1.375" } },
    musclegain:  { label:"Muscle gain",  goalAdj:0.10,  suggest:{ meals:5, activity:"1.55" } },
  };
  let currentGoalAdj = PRESETS.maintenance.goalAdj;

  function setPreset(name, applySuggest=true) {
    document.querySelectorAll('.chip-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.preset === name);
    });
    const p = PRESETS[name] || PRESETS.maintenance;
    currentGoalAdj = p.goalAdj;
    goalPill.textContent = `Goal: ${p.label}`;
    if (applySuggest) {
      $('numOfMeals').value = String(p.suggest.meals);
      $('activityLevel').value = p.suggest.activity;
    }
  }
  document.querySelectorAll('.chip-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>setPreset(btn.dataset.preset));
  });

  // ----- Weight unit toggle -----
  document.querySelectorAll('.field .toggle [data-unit="kg"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      weightUnit = "kg";
      btn.classList.add('active');
      btn.nextElementSibling?.classList.remove('active');
    });
  });
  document.querySelectorAll('.field .toggle [data-unit="lb"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      weightUnit = "lb";
      btn.classList.add('active');
      btn.previousElementSibling?.classList.remove('active');
    });
  });

  // ----- Height unit toggle -----
  document.querySelectorAll('.field .toggle [data-unit="cm"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      heightUnit = "cm";
      btn.classList.add('active');
      btn.nextElementSibling?.classList.remove('active');
      $('height-imperial').classList.add('hidden');
      $('height-cm').classList.remove('hidden');
    });
  });
  document.querySelectorAll('.field .toggle [data-unit="ftin"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      heightUnit = "ftin";
      btn.classList.add('active');
      btn.previousElementSibling?.classList.remove('active');
      $('height-imperial').classList.remove('hidden');
      $('height-cm').classList.add('hidden');
    });
  });

  // ----- Submit -----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Collect + normalize
    const age = Number(($('age').value || "").trim());
    const gender = $('gender').value;
    const activityMult = Number($('activityLevel').value);
    const meals = Number($('numOfMeals').value);
    const dietPreference = $('dietPreference').value;
    const healthSpec = $('healthSpec').value;

    const weightKg = toKg($('weight').value || 0, weightUnit);
    let heightCm = 0;
    if (heightUnit === "cm") {
      heightCm = Number(($('height-cm').value || 0));
    } else {
      heightCm = cmFromFtIn(($('height-ft').value || 0), ($('height-in').value || 0));
    }

    // cuisines (multi)
    const cuisines = Array.from($('cuisine').selectedOptions || []).map(o => o.value).slice(0, 3);

    // exclusions
    const excludeRaw = ($('exclude').value || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);

    if (!age || !weightKg || !heightCm) {
      setStatus("Please fill Age, Weight and Height.");
      return;
    }

    // 1) calories target
    const dailyCalories = calcDailyCalories({ gender, weightKg, heightCm, age, activityMult, goalAdj: currentGoalAdj });
    const { carbs, protein, fat } = macroTargets(dailyCalories);
    calChip.textContent = `Daily calories: ${dailyCalories} kcal · C${carbs}g P${protein}g F${fat}g`;

    // 2) per-meal
    const perMeal = Math.round(dailyCalories / meals);
    const diet = mapDiet(dietPreference);
    const health = mapSpecToHealth(healthSpec);

    const filters = { perMealCalories: perMeal, diet, health, cuisines, excluded: excludeRaw };
    const key = cacheKeyFromFilters(filters);

    setStatus("Generating plan…");
    resultsEl.innerHTML = loadingSkeleton(meals);

    // Try cache
    let pool = tryGetCache(key);

    try {
      if (!pool) {
        pool = await fetchPool({ q: "recipe", ...filters });
        // If nothing and we had cuisines, try relaxing cuisines
        if (!pool.length && cuisines.length) {
          setStatus("No exact matches for selected cuisines — broadening search…");
          const relaxedKey = cacheKeyFromFilters({ ...filters, cuisines: [] });
          pool = tryGetCache(relaxedKey) || await fetchPool({ q: "recipe", ...filters, cuisines: [] });
          setCache(relaxedKey, pool);
        }
        setCache(key, pool);
      }

      if (!pool.length) {
        setStatus("No recipes matched. Try different filters or remove exclusions.");
        resultsEl.innerHTML = "";
        return;
      }

      const grid = buildWeeklyPlan(pool, meals);

      // compute day totals from first column meals (approx.)
      const approxKcal = grid.reduce((sum, row)=> sum + kcalPerServing(row[0]), 0);
      const approxCarb = grid.reduce((sum, row)=> sum + gPerServing(row[0],"CHOCDF"), 0);
      const approxProt = grid.reduce((sum, row)=> sum + gPerServing(row[0],"PROCNT"), 0);
      const approxFat  = grid.reduce((sum, row)=> sum + gPerServing(row[0],"FAT"), 0);

      resultsEl.innerHTML = renderTable(grid, {
        kcal: approxKcal, carbs: approxCarb, protein: approxProt, fat: approxFat
      });
      setStatus("");
    } catch (err) {
      if (String(err.message).includes("RATE_LIMIT")) {
        setStatus("We’re hitting rate limits. Please try again in a few seconds.");
      } else {
        setStatus("Something went wrong. Please tweak filters and try again.");
      }
      resultsEl.innerHTML = "";
    }
  });

  // simple loading skeleton
  function loadingSkeleton(meals){
    const cols = WEEKDAYS.length;
    const cells = Array.from({length: meals}).map((_,r)=>`
      <tr>
        <td>Meal ${r+1}</td>
        ${Array.from({length: cols}).map(()=>`
          <td>
            <div class="skeleton" style="height:14px;width:70%"></div>
            <div class="skeleton" style="height:160px;margin:8px 0"></div>
            <div class="skeleton" style="height:12px;width:60%"></div>
          </td>`).join("")}
      </tr>`).join("");
    return `<table>
      <thead><tr><th>Meal</th>${WEEKDAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead>
      <tbody>${cells}</tbody>
    </table>`;
  }
});
