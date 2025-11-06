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

  if (Number.isFinite(perMealCalories)) params.set("perMealCalories", String(perMealCalories));
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

// ------- slot logic (breakfast / snack / lunch / dinner) -------
function mealSlotsForCount(meals) {
  if (meals === 3) return ["breakfast", "lunch", "dinner"];
  if (meals === 4) return ["breakfast", "snack", "lunch", "dinner"];
  if (meals === 5) return ["breakfast", "snack", "lunch", "snack", "dinner"];
  return Array.from({ length: meals }, (_, i) => (i === 0 ? "breakfast" : i === meals - 1 ? "dinner" : "lunch"));
}

// Calorie weights per slot (sums ≈ 1.0)
function slotWeightsForSlots(slots) {
  const map = {
    breakfast: 0.30,
    snack:     0.10,
    lunch:     0.37,
    dinner:    0.23
  };
  const weights = slots.map(s => map[s] ?? 0.25);
  const total = weights.reduce((a,b)=>a+b,0) || 1;
  return weights.map(w => w / total);
}

// Slot-specific search query
function slotQueryFor(slot) {
  if (slot === "breakfast") return "breakfast";
  if (slot === "snack")     return "snack";
  if (slot === "lunch")     return "lunch";
  if (slot === "dinner")    return "dinner";
  return "recipe";
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
function buildWeeklyPlanFromPools(pools) {
  const mealsPerDay = pools.length;
  const grid = Array.from({ length: mealsPerDay }, () => Array(7).fill(null));
  for (let r = 0; r < mealsPerDay; r++) {
    const pool = pools[r] || [];
    for (let c = 0; c < 7; c++) {
      grid[r][c] = pool.length ? pool[c % pool.length] : null;
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

// ------- Mobile layout -------
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

  tabsEl.innerHTML = WEEKDAYS.map((d, i) =>
    `<button class="day-tab ${i===dayIndex?'is-active':''}" data-day="${i}" type="button">${d}</button>`
  ).join("");
  tabsEl.hidden = false;

  const cards = grid.map((row, rIdx) => cardHTML(row[dayIndex], rIdx)).join("");
  mobEl.innerHTML = `<section class="day-section">${cards}</section>`;
  mobEl.hidden = false;

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

  // Print handler
  document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('#download-pdf');
  if (!btn) return;

  // iOS is handled by the iOS-specific listener; skip here
  if (/iP(ad|hone|od)/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return;
  }

  // Ensure desktop table is visible for printing
  const res = $('results'), mob = $('mobile-results'), tabs = $('day-tabs');
  if (res) res.hidden = false;
  if (mob) mob.hidden = true;
  if (tabs) tabs.hidden = true;

  ev.preventDefault();
  btn.blur();
  try { window.print(); } catch (_) {}
  setTimeout(() => { try { window.print(); } catch (_) {} }, 0);
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
    const quick = $('quickSelect').value;

    if ([age, weight, height].some(x => Number.isNaN(x))) {
      setStatus("Please fill Age, Weight and Height.");
      return;
    }

    const dailyCalories = calcDailyCalories({ gender, weight, height, age, activity });
    if (calChip) calChip.textContent = `Daily calories: ${dailyCalories} kcal`;

    const perMeal = Math.round(dailyCalories / meals);
    const diet = mapDiet(dietPreference);
    const health = mapSpecToHealth(healthSpec);

    let timeRange = "";
    if (quick === "10") timeRange = "1-10";
    else if (quick === "20") timeRange = "1-20";
    else if (quick === "30+") timeRange = "30-180";

    setStatus("");
    resultsEl.innerHTML = "";
    mobResultsEl.innerHTML = "";
    dayTabsEl.innerHTML = "";

    resultsEl.hidden = isMobile();
    mobResultsEl.hidden = true;
    dayTabsEl.hidden = true;
    pdfBar?.classList.add('hidden');
    pdfBtn?.classList.add('hidden');

    try {
      const slots = mealSlotsForCount(meals);
      const weights = slotWeightsForSlots(slots);
      const perSlotCalories = weights.map(w => Math.max(120, Math.round(dailyCalories * w)));

      const pools = [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const baseOpts = {
          perMealCalories: perSlotCalories[i],
          diet,
          health,
          cuisine: cuisine || "",
          timeRange: timeRange || ""
        };

        let pool = await fetchPool({ q: slotQueryFor(slot), ...baseOpts }).catch(() => []);
        if (!pool.length) pool = await fetchPool({ q: "recipe", ...baseOpts }).catch(() => []);
        pools.push(pool);
      }

      const anyHits = pools.some(p => p && p.length);
      if (!anyHits) {
        setStatus("No recipes matched. Try changing 'Quick recipes' or relaxing filters.");
        return;
      }

      const grid = buildWeeklyPlanFromPools(pools);

      if (isMobile()) {
        resultsEl.hidden = true;
        renderMobile(grid, 0);
        resultsEl.innerHTML = renderTable(grid);
        pdfBar?.classList.remove('hidden');
        pdfBtn?.classList.remove('hidden');
      } else {
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

  // Re-render layout on resize
  window.addEventListener("resize", () => {
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

  // ✅ Footer credit INSIDE the card (centered)
  const card = document.querySelector(".card");
  if (card) {
    const footer = document.createElement("p");
    footer.innerHTML = `Built by <a href="https://varunthinksproduct.framer.website/" target="_blank" style="color:#7F8FFF;text-decoration:none;font-weight:600;">Varun</a> <span style="color:red;">❤️</span> where Product meets AI and smart eating begins.`;
    footer.style.textAlign = "center";
    footer.style.fontSize = "14px";
    footer.style.marginTop = "12px";
    footer.style.paddingTop = "6px";
    footer.style.borderTop = "1px solid rgba(255,255,255,0.08)";
    footer.style.color = "rgba(236,237,238,0.8)";
    footer.style.fontWeight = "500";
    footer.style.letterSpacing = "0.2px";
    footer.style.lineHeight = "1.6";
    card.appendChild(footer);

    // ✅ LinkedIn note OUTSIDE the card, bottom-right (after the card)
    const dm = document.createElement("p");
    dm.innerHTML = `Got feedback or ideas? <a href="https://www.linkedin.com/in/varun-srikanth/" target="_blank" rel="noopener" style="color:#7F8FFF;text-decoration:none;font-weight:600;">DM me on LinkedIn</a>.`;
    dm.style.margin = "8px 4px 0";
    dm.style.textAlign = "right";
    dm.style.fontSize = "13px";
    dm.style.color = "rgba(236,237,238,0.82)";
    dm.style.letterSpacing = "0.2px";
    card.insertAdjacentElement("afterend", dm);
  }

  // ---------- PRINT PDF fit fixes (APPENDED only; nothing above changed) ----------
  (function injectPrintFixes(){
    const css = `
      @page { size: A4 landscape; margin: 10mm; }
      @media print {
        html, body { background: #fff !important; width: 100% !important; overflow: visible !important; }
        /* Remove shadows/background effects to avoid widening the layout */
        .card { box-shadow: none !important; backdrop-filter: none !important; background: #fff !important; }

        /* Hide interactive chrome in print */
        #day-tabs, #mobile-results, #pdf-bar, #download-pdf { display: none !important; }

        /* Fit weekly grid to page width */
        #results { overflow: visible !important; }
        #results table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }

        /* Critical: allow columns to shrink & wrap so the right edge isn't cut */
        #results th, #results td {
          min-width: 0 !important; width: auto !important;
          word-wrap: break-word !important; overflow-wrap: anywhere !important;
          padding: 6px !important; font-size: 11px !important; line-height: 1.35 !important; color: #000 !important;
        }

        /* Keep header visible, no sticky positioning in print */
        #results th { position: static !important; background: #fff !important; }

        /* Images scale inside cells */
        img.recipe, .meal-card__img { max-width: 100% !important; height: auto !important; max-height: 140px !important; object-fit: cover !important; }

        /* Avoid mid-row breaks */
        tr, td, img.recipe { page-break-inside: avoid !important; }
      }
    `;
    const style = document.createElement("style");
    style.id = "print-fixes";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // Optional hooks (no visual change, just future-proof)
  window.addEventListener('beforeprint', () => document.documentElement.classList.add('is-print'));
  window.addEventListener('afterprint', () => document.documentElement.classList.remove('is-print'));
});
