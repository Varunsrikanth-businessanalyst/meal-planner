// ===== Edamam Recipe Search (client-only demo) =====
const CONFIG = {
  APP_ID: "2befcb23",
  APP_KEY: "8f23abc226368ff9c39b71b668e43349",
  USER_ID: "Vaarun",   // Edamam account username (case-sensitive)
  MAX_RESULTS: 60,
  RETRIES: 3,
  RETRY_BASE_MS: 900   // base backoff (exponential)
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);

// ------- Unit conversion helpers -------
const kgToLb = (kg) => kg * 2.2046226218;
const lbToKg = (lb) => lb / 2.2046226218;
const cmToFtIn = (cm) => {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn - ft * 12);
  return { ft, inches };
};
const ftInToCm = (ft, inches) => ((Number(ft)||0) * 12 + (Number(inches)||0)) * 2.54;

// ------- Calorie math (Harris–Benedict) -------
function calcBMR({ gender, weightKg, heightCm, age }) {
  return (gender === "male")
    ? 88.362 + 13.397*weightKg + 4.799*heightCm - 5.677*age
    : 447.593 +  9.247*weightKg + 3.098*heightCm - 4.330*age;
}
function calcDailyCalories({ gender, weightKg, heightCm, age, activity }) {
  const bmr = calcBMR({ gender, weightKg, heightCm, age });
  return Math.round(bmr * activity);
}

// ------- Map UI to Edamam params -------
function mapDiet(d) {
  return ({ "Balanced":"balanced", "Low-Carb":"low-carb", "Low-Fat":"low-fat" }[d]) || "";
}
function mapSpecToHealth(s) {
  return ({ "vegan":"vegan", "vegetarian":"vegetarian", "alcohol-free":"alcohol-free", "peanut-free":"peanut-free" }[s]) || "";
}

// ------- Fetch with backoff/retries -------
async function fetchWithRetry(url, opts, onRetry) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    const res = await fetch(url, opts).catch(() => null);

    if (res && res.ok) return res;

    const status = res ? res.status : "network";
    const shouldRetry = status === 429 || (typeof status === "number" && status >= 500 && status < 600);

    if (!shouldRetry || attempt >= CONFIG.RETRIES) {
      if (res) return res; // final non-ok response
      throw new Error("Network error");
    }

    // backoff
    const delay = CONFIG.RETRY_BASE_MS * Math.pow(2, attempt - 1);
    onRetry?.(attempt, delay, status);
    await new Promise(r => setTimeout(r, delay));
  }
}

// ------- Edamam query & fetch -------
function buildQuery({ q, perMealCalories, diet, health, cuisines }) {
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
    "dietLabels","healthLabels"
  ].forEach(f => params.append("field", f));

  if (diet)   params.append("diet", diet);
  if (health) params.append("health", health);
  if (Array.isArray(cuisines) && cuisines.length) {
    cuisines.forEach(c => params.append("cuisineType", c));
  }

  return `https://api.edamam.com/api/recipes/v2?${params.toString()}`;
}

async function fetchPool(opts, setStatus) {
  const url = buildQuery(opts);
  const res = await fetchWithRetry(url, {
    headers: { "Edamam-Account-User": CONFIG.USER_ID }
  }, (attempt, delay, status) => {
    setStatus?.(`API limit or server busy (status ${status}). Retrying ${attempt}/${CONFIG.RETRIES - 1} in ${Math.round(delay/1000)}s…`);
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || res.statusText || `HTTP ${res.status}`);
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
              ~${kcalPerServing(rec)} kcal/serving
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

  const setStatus = (msg) => {
    if (!statusEl) return;
    if (!msg) { statusEl.textContent = ""; statusEl.classList.remove("show"); return; }
    statusEl.textContent = msg;
    statusEl.classList.add("show");
  };

  // Soft reset: clear form + UI without reloading
  function resetAll() {
    $('meal-form').reset();
    $('results').innerHTML = "";
    setStatus("");
    calChip.textContent = "Daily calories: —";
    // Reset units to defaults (kg/cm)
    setWeightUnit('kg', true);
    setHeightUnit('cm', true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    $('age').focus();
  }

  // Title as "start over"
  $('home-reset')?.addEventListener('click', resetAll);

  // ----- Unit toggles -----
  let weightUnit = 'kg';
  let heightUnit = 'cm';

  function setWeightUnit(unit, force=false) {
    if (!force && unit === weightUnit) return;
    const w = $('weight');
    const val = Number(w.value);
    if (!Number.isNaN(val) && val > 0) {
      w.value = unit === 'kg' ? Math.round(lbToKg(val) * 10)/10
                              : Math.round(kgToLb(val) * 10)/10;
    }
    weightUnit = unit;
    // UI buttons
    document.querySelectorAll('[data-wu]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.wu === unit);
    });
  }
  function setHeightUnit(unit, force=false) {
    if (!force && unit === heightUnit) return;
    const cmInput = $('height');
    const ftinWrap = $('height-ftin');
    const ftInput = $('height-ft');
    const inInput = $('height-in');

    if (unit === 'ftin') {
      // convert cm -> ft/in if cm present
      const cmVal = Number(cmInput.value);
      if (!Number.isNaN(cmVal) && cmVal > 0) {
        const { ft, inches } = cmToFtIn(cmVal);
        ftInput.value = ft;
        inInput.value = inches;
      }
      cmInput.classList.add('hidden');
      ftinWrap.classList.remove('hidden');
    } else {
      // convert ft/in -> cm if ft/in present
      const ft = Number(ftInput.value);
      const inches = Number(inInput.value);
      if ((!Number.isNaN(ft) && ft > 0) || (!Number.isNaN(inches) && inches >= 0)) {
        cmInput.value = Math.round(ftInToCm(ft, inches));
      }
      ftinWrap.classList.add('hidden');
      cmInput.classList.remove('hidden');
    }
    heightUnit = unit;
    document.querySelectorAll('[data-hu]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.hu === unit);
    });
  }

  // bind toggle buttons
  document.querySelectorAll('[data-wu]').forEach(btn => {
    btn.addEventListener('click', () => setWeightUnit(btn.dataset.wu));
  });
  document.querySelectorAll('[data-hu]').forEach(btn => {
    btn.addEventListener('click', () => setHeightUnit(btn.dataset.hu));
  });

  // default to metric UI
  setWeightUnit('kg', true);
  setHeightUnit('cm', true);

  // Form submit → fetch & render
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const age = Number(($('age').value || "").trim());

    // Weight in kg regardless of unit
    let weightKg = Number(($('weight').value || "").trim());
    if (weightUnit === 'lb') weightKg = lbToKg(weightKg);

    // Height in cm regardless of unit
    let heightCm;
    if (heightUnit === 'cm') {
      heightCm = Number(($('height').value || "").trim());
    } else {
      const ft = Number(($('height-ft').value || "").trim());
      const inches = Number(($('height-in').value || "").trim());
      heightCm = ftInToCm(ft, inches);
    }

    const gender = $('gender').value;
    const activity = Number($('activityLevel').value);
    const meals = Number($('numOfMeals').value);
    const dietPreference = $('dietPreference').value;
    const healthSpec = $('healthSpec').value;

    // cuisines (multi)
    const cuisines = Array.from($('cuisine').selectedOptions).map(o => o.value);

    if ([age, weightKg, heightCm].some(x => Number.isNaN(x) || x <= 0)) {
      setStatus("Please provide valid Age, Weight and Height.");
      return;
    }

    const dailyCalories = calcDailyCalories({ gender, weightKg, heightCm, age, activity });
    calChip.textContent = `Daily calories: ${dailyCalories} kcal`;

    const perMeal = Math.round(dailyCalories / meals);
    const diet = mapDiet(dietPreference);
    const health = mapSpecToHealth(healthSpec);

    setStatus(""); resultsEl.innerHTML = "";

    try {
      const pool = await fetchPool({
        q: "recipe",
        perMealCalories: perMeal,
        diet,
        health,
        cuisines
      }, setStatus);

      if (!pool.length) { setStatus("No recipes matched. Try relaxing filters or cuisines."); return; }
      const grid = buildWeeklyPlan(pool, meals);
      resultsEl.innerHTML = renderTable(grid);
      setStatus("");
    } catch (err) {
      setStatus(err.message || "Something went wrong.");
    }
  });
});
