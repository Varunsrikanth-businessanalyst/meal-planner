// ===== Config =====
const CONFIG = {
  APP_ID: "2befcb23",
  APP_KEY: "8f23abc226368ff9c39b71b668e43349",
  USER_ID: "Vaarun",        // Edamam username (case-sensitive)
  MAX_RESULTS: 60,
  RETRIES: 3,
  RETRY_BASE_MS: 900
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);

// cuisine list (value: what Edamam expects; label: UI text)
const CUISINES = [
  {value:"any", label:"Any"},
  {value:"american", label:"American"},
  {value:"asian", label:"Asian"},
  {value:"british", label:"British"},
  {value:"caribbean", label:"Caribbean"},
  {value:"central europe", label:"Central Europe"},
  {value:"chinese", label:"Chinese"},
  {value:"eastern europe", label:"Eastern Europe"},
  {value:"french", label:"French"},
  {value:"indian", label:"Indian"},
  {value:"italian", label:"Italian"},
  {value:"japanese", label:"Japanese"},
  {value:"mediterranean", label:"Mediterranean"},
  {value:"mexican", label:"Mexican"},
  {value:"middle eastern", label:"Middle Eastern"},
  {value:"nordic", label:"Nordic"},
  {value:"south american", label:"South American"},
  {value:"south east asian", label:"South East Asian"},
  {value:"world", label:"World"},
];

// ----- conversions -----
const kgToLb = (kg) => kg * 2.2046226218;
const lbToKg = (lb) => lb / 2.2046226218;
const ftInToCm = (ft, inches) => ((Number(ft)||0) * 12 + (Number(inches)||0)) * 2.54;

// ----- calories -----
function calcBMR({ gender, weightKg, heightCm, age }) {
  return (gender === "male")
    ? 88.362 + 13.397*weightKg + 4.799*heightCm - 5.677*age
    : 447.593 +  9.247*weightKg + 3.098*heightCm - 4.330*age;
}
function calcDailyCalories({ gender, weightKg, heightCm, age, activity }) {
  const bmr = calcBMR({ gender, weightKg, heightCm, age });
  return Math.round(bmr * activity);
}

// ----- mappings -----
function mapDiet(d) {
  return ({ "Balanced":"balanced", "Low-Carb":"low-carb", "Low-Fat":"low-fat" }[d]) || "";
}
function mapSpecToHealth(s) {
  return ({ "vegan":"vegan", "vegetarian":"vegetarian", "alcohol-free":"alcohol-free", "peanut-free":"peanut-free" }[s]) || "";
}

// ----- fetch with retry -----
async function fetchWithRetry(url, opts, onRetry) {
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url, opts).catch(() => null);
    if (res && res.ok) return res;

    const status = res ? res.status : "network";
    const retryable = status === 429 || (typeof status === "number" && status >= 500 && status < 600);
    if (!retryable || attempt >= CONFIG.RETRIES) {
      if (res) return res;
      throw new Error("Network error");
    }
    const delay = CONFIG.RETRY_BASE_MS * Math.pow(2, attempt - 1);
    onRetry?.(attempt, delay, status);
    await new Promise(r => setTimeout(r, delay));
  }
}

// ----- query builder -----
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

  ["label","image","url","yield","ingredientLines","calories","totalNutrients","dietLabels","healthLabels"]
    .forEach(f => params.append("field", f));

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
    setStatus?.(`API busy (status ${status}). Retrying ${attempt}/${CONFIG.RETRIES - 1} in ${Math.round(delay/1000)}s…`);
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || res.statusText || `HTTP ${res.status}`);
  const data = JSON.parse(text);
  return (data.hits || []).map(h => h.recipe);
}

// ----- macros helpers -----
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
      ${macro("Sugar", 
