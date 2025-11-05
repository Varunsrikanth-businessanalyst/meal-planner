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
  if (Number.isFinite(perMealCalories)) params.set("perMealCalories", String(perMealCalories));
  if (diet)      params.set("diet", diet);
  if (health)    params.set("health", health);
  if (cuisine)   params.set("cuisine", cuisine);
@@ -70,7 +67,6 @@
  if (meals === 3) return ["breakfast", "lunch", "dinner"];
  if (meals === 4) return ["breakfast", "snack", "lunch", "dinner"];
  if (meals === 5) return ["breakfast", "snack", "lunch", "snack", "dinner"];
  // fallback
  return Array.from({ length: meals }, (_, i) => (i === 0 ? "breakfast" : i === meals - 1 ? "dinner" : "lunch"));
}

@@ -87,7 +83,7 @@
  return weights.map(w => w / total);
}

// Slot-specific search query (keep it to ONE keyword so Edamam doesn't AND-match everything)
// Slot-specific search query
function slotQueryFor(slot) {
  if (slot === "breakfast") return "breakfast";
  if (slot === "snack")     return "snack";
@@ -120,18 +116,18 @@
    </div>`;
}

// ------- results rendering (desktop table) -------
// ------- results rendering -------
function ingredientsHTML(list, max = 6) {
  const items = (list || []).slice(0, max).map(x => `<li>${x}</li>`).join("");
  return `<ul style="margin:6px 0 0 18px;">${items}</ul>`;
}
function buildWeeklyPlan(recipes, mealsPerDay) {
function buildWeeklyPlanFromPools(pools) {
  const mealsPerDay = pools.length;
  const grid = Array.from({ length: mealsPerDay }, () => Array(7).fill(null));
  let i = 0;
  for (let r = 0; r < mealsPerDay; r++) {
    const pool = pools[r] || [];
    for (let c = 0; c < 7; c++) {
      grid[r][c] = recipes[i % recipes.length];
      i++;
      grid[r][c] = pool.length ? pool[c % pool.length] : null;
    }
  }
  return grid;
@@ -162,20 +158,7 @@
  return `<table>${thead}${tbody}</table>`;
}

// Build weekly plan from separate pools per slot
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

// ------- Phase 2: mobile card layout -------
// ------- Mobile layout -------
function cardHTML(rec, mealIndex) {
  return `
    <article class="meal-card">
@@ -198,24 +181,20 @@
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
@@ -258,20 +237,14 @@
  }
  $('home-reset')?.addEventListener('click', resetAll);

  // Print handler (mobile-safe, works in most WebViews)
  // Print handler
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
    setTimeout(() => { try { window.print(); } catch (_) {} }, 0);
  });

  form.addEventListener("submit", async (e) => {
@@ -286,7 +259,7 @@
    const dietPreference = $('dietPreference').value;
    const healthSpec = $('healthSpec').value;
    const cuisine = ($('cuisine').value || "").trim();
    const quick = $('quickSelect').value; // "none" | "10" | "20" | "30+"
    const quick = $('quickSelect').value;

    if ([age, weight, height].some(x => Number.isNaN(x))) {
      setStatus("Please fill Age, Weight and Height.");
@@ -300,7 +273,6 @@
    const diet = mapDiet(dietPreference);
    const health = mapSpecToHealth(healthSpec);

    // Map quick selection -> Edamam 'time' range
    let timeRange = "";
    if (quick === "10") timeRange = "1-10";
    else if (quick === "20") timeRange = "1-20";
@@ -311,15 +283,13 @@
    mobResultsEl.innerHTML = "";
    dayTabsEl.innerHTML = "";

    // Hide desktop results pre-render on mobile
    resultsEl.hidden = isMobile();
    mobResultsEl.hidden = true;
    dayTabsEl.hidden = true;
    pdfBar?.classList.add('hidden');
    pdfBtn?.classList.add('hidden');

    try {
      // --- Slot-aware fetching with fallback ---
      const slots = mealSlotsForCount(meals);
      const weights = slotWeightsForSlots(slots);
      const perSlotCalories = weights.map(w => Math.max(120, Math.round(dailyCalories * w)));
@@ -335,36 +305,26 @@
          timeRange: timeRange || ""
        };

        // First try the slot keyword
        let pool = await fetchPool({ q: slotQueryFor(slot), ...baseOpts }).catch(() => []);
        // Fallback to generic if empty
        if (!pool.length) {
          pool = await fetchPool({ q: "recipe", ...baseOpts }).catch(() => []);
        }
        if (!pool.length) pool = await fetchPool({ q: "recipe", ...baseOpts }).catch(() => []);
        pools.push(pool);
      }

      // If *every* pool is empty, bail early
      const anyHits = pools.some(p => p && p.length);
      if (!anyHits) {
        setStatus("No recipes matched. Try changing 'Quick recipes' or relaxing filters.");
        return;
      }

      // Build weekly grid using per-slot pools (Meal 1 = breakfast, etc.)
      const grid = buildWeeklyPlanFromPools(pools);

      if (isMobile()) {
        // Mobile: day tabs + meal cards
        resultsEl.hidden = true;
        renderMobile(grid, 0);
        // also render a hidden desktop table for printing
        resultsEl.innerHTML = renderTable(grid);
        // show PDF button
        pdfBar?.classList.remove('hidden');
        pdfBtn?.classList.remove('hidden');
      } else {
        // Desktop: table
        dayTabsEl.hidden = true;
        mobResultsEl.hidden = true;
        resultsEl.hidden = false;
@@ -377,7 +337,7 @@
    }
  });

  // Re-render layout type on resize (optional nicety)
  // Re-render layout on resize
  window.addEventListener("resize", () => {
    const hasMobile = $('mobile-results')?.innerHTML.trim().length > 0;
    const hasDesktop = $('results')?.innerHTML.trim().length > 0;
@@ -391,4 +351,16 @@
      $('mobile-results').hidden = true;
    }
  });

  // ✅ Add footer credit line
  const footer = document.createElement("p");
  footer.innerHTML = `Built by <a href="https://varunthinksproduct.framer.website/" target="_blank" style="color:#7F8FFF;text-decoration:none;font-weight:600;">Varun</a> <span style="color:red;">❤️</span> where Product meets AI and smart eating begins.`;
  footer.style.textAlign = "center";
  footer.style.fontSize = "14px";
  footer.style.marginTop = "18px";
  footer.style.marginBottom = "12px";
  footer.style.color = "rgba(236,237,238,0.8)";
  footer.style.fontWeight = "500";
  footer.style.letterSpacing = "0.2px";
  document.querySelector("main")?.appendChild(footer);
});
