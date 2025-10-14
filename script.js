// ===== Meal Planner — Frontend (uses Vercel /api/recipes proxy) =====
const CONFIG = {
  PROXY_BASE: "",   // same-origin; leave "" on Vercel
  MAX_RESULTS: 60
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);

const isMobile = () => window.matchMedia("(max-width: 820px)").matches;

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
    // server converts this to a range
    params.set("perMealCalories", String(perMealCalories));
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

// ------- results rendering (desktop table) -------
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
            <img class="recipe" src="${rec.image}" alt="${rec.label}" loading="lazy" />
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

// ------- Phase 2: mobile card layout -------
function cardHTML(rec, mealIndex) {
  return `
    <article class="meal-card">
      <div class="meal-card__header">
        <div class="meal-card__title">Meal ${mealIndex + 1}</div>
        <div class="meal-card__meta">~${kcalPerServing(rec)} kcal${Number.isFinite(rec.totalTime) ? ` • ${rec.totalTime} min` : ""}</div>
      </div>
      <a class="meal-card__link" href="${rec.url}" target="_blank" rel="noopener noreferrer">
        <img class="meal-card__img" src="${rec.image}" alt="${rec.label}" loading="lazy" />
      </a>
      <div style="font-weight:700; margin:4px 0 2px;">
        <a class="meal-card__link" href="${rec.url}" target="_blank" rel="noopener noreferrer">${rec.label}</a>
      </div>
      ${macroChipsHTML(rec)}
      ${ingredientsHTML(rec.ingredientLines)}
    </article>`;
}

function renderMobile(grid, dayIndex = 0) {
  const tabsEl = $('day-tabs');
  const mobEl  = $('mobile-results');

  // Tabs
  tabsEl.innerHTML = WEEKDAYS.map((d, i) =>
    `<button class="day-tab ${i===dayIndex?'is-active':''}" data-day="${i}" type="button">${d}</button>`
  ).join("");
  tabsEl.hidden = false;

  // Cards for the selected day
  const cards = grid.map((row, rIdx) => cardHTML(row[dayIndex], rIdx)).join("");
  mobEl.innerHTML = `<section class="day-section">${cards}</section>`;
  mobEl.hidden = false;

  // Wire up tab clicks
  tabsEl.querySelectorAll(".day-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.day || 0);
      tabsEl.querySelectorAll(".day-tab").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      const html = grid.map((row, rIdx) => cardHTML(row[idx], rIdx)).join("");
      mobEl.innerHTML = `<section class="day-section">${html}</section>`;
      mobEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// ------- main -------
document.addEventListener("DOMContentLoaded", () => {
  const form = $('meal-form');
  const statusEl = $('status');
  const resultsEl = $('results');
  const calChip = $('cal-output');
  const dayTabsEl = $('day-tabs');
  const mobResultsEl = $('mobile-results');
  const pdfBtn = $('download-pdf');
  const pdfBar = $('pdf-bar');

  const setStatus = (msg) => {
    if (!statusEl) return;
    if (!msg) { statusEl.textContent = ""; statusEl.classList.remove("show"); return; }
    statusEl.textContent = msg;
    statusEl.classList.add("show");
  };

  function resetAll() {
    form.reset();
    resultsEl.innerHTML = "";
    mobResultsEl.innerHTML = "";
    pdfBar?.classList.add('hidden');
    pdfBtn?.classList.add('hidden');
    dayTabsEl.innerHTML = "";
    resultsEl.hidden = false;
    mobResultsEl.hidden = true;
    dayTabsEl.hidden = true;
    setStatus("");
    if (calChip) calChip.textContent = "Daily calories: —";
    window.scrollTo({ top: 0, behavior: "smooth" });
    $('age')?.focus();
  }
  $('home-reset')?.addEventListener('click', resetAll);

  // Print handler (mobile-safe, works in most WebViews)
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('#download-pdf');
  if (!btn) return;
  ev.preventDefault();
  btn.blur();

  // iOS Safari requires the print to be inside the user-initiated handler
  try { window.print(); } catch (_) {}

  // Some webviews react a tick later
  setTimeout(() => {
    try { window.print(); } catch (_) {}
  }, 0);
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

    setStatus("");
    resultsEl.innerHTML = "";
    mobResultsEl.innerHTML = "";
    dayTabsEl.innerHTML = "";

    // Hide desktop results pre-render on mobile
    resultsEl.hidden = isMobile();
    mobResultsEl.hidden = true;
    dayTabsEl.hidden = true;
    pdfBar?.classList.add('hidden');
    pdfBtn?.classList.add('hidden');

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

      if (isMobile()) {
        // Mobile: day tabs + meal cards
        resultsEl.hidden = true;
        renderMobile(grid, 0);

        // IMPORTANT: also render a hidden desktop table for printing
        resultsEl.innerHTML = renderTable(grid);

        // show PDF button on mobile too
        pdfBar?.classList.remove('hidden');
        pdfBtn?.classList.remove('hidden');
      } else {
        // Desktop: table
        dayTabsEl.hidden = true;
        mobResultsEl.hidden = true;
        resultsEl.hidden = false;
        resultsEl.innerHTML = renderTable(grid);
        pdfBar?.classList.remove('hidden');
        pdfBtn?.classList.remove('hidden');
      }
    } catch (err) {
      setStatus(err.message || "Something went wrong.");
    }
  });

  // Re-render layout type on resize (optional nicety)
  window.addEventListener("resize", () => {
    // No heavy rework here; next search will render into the new layout.
    // This just toggles visibility if content exists.
    const hasMobile = $('mobile-results')?.innerHTML.trim().length > 0;
    const hasDesktop = $('results')?.innerHTML.trim().length > 0;
    if (isMobile() && hasMobile) {
      $('results').hidden = true;
      $('day-tabs').hidden = false;
      $('mobile-results').hidden = false;
    } else if (!isMobile() && hasDesktop) {
      $('results').hidden = false;
      $('day-tabs').hidden = true;
      $('mobile-results').hidden = true;
    }
  });
});
