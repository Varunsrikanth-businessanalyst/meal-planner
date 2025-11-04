// ===== Meal Planner (frontend) =====
const CONFIG = {
  PROXY_BASE: "",   // same-origin; set to "" on Vercel if you have /api/* routes
  MAX_RESULTS: 12
};

// Utilities
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString();

// ------- Calorie math (Harris–Benedict) -------
function calcBMR({ gender, weight, height, age }) {
  return (gender === "male")
    ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    : 447.593 +  9.247 * weight + 3.098 * height - 4.330 * age;
}
function activityFactor(level) {
  switch (level) {
    case "light": return 1.375;
    case "moderate": return 1.55;
    case "active": return 1.725;
    case "very": return 1.9;
    default: return 1.2; // sedentary
  }
}
function calcDailyCalories({ gender, weight, height, age, activity }) {
  const bmr = calcBMR({ gender, weight, height, age });
  return bmr * activityFactor(activity);
}

// ------- DOM refs -------
const inputs = {
  age: $("age"),
  weight: $("weight"),
  height: $("height"),
  gender: $("gender"),
  activity: $("activity"),
  meals: $("meals"),
  cuisine: $("cuisine"),
  diet: $("diet"),
  time: $("time"),
  intolerances: $("intolerances")
};
const caloriesOut = $("caloriesOut");
const form = $("plannerForm");
const results = $("results");
const planMeta = $("planMeta");

// ------- Live calorie updater -------
function updateCalories() {
  const vals = {
    age: Number(inputs.age.value || 0),
    weight: Number(inputs.weight.value || 0),
    height: Number(inputs.height.value || 0),
    gender: inputs.gender.value,
    activity: inputs.activity.value
  };
  const cals = calcDailyCalories(vals);
  caloriesOut.textContent = isFinite(cals) && cals > 0 ? fmt(cals) : "—";
  return cals;
}
["input","change"].forEach(ev => {
  Object.values(inputs).forEach(el => el.addEventListener(ev, updateCalories));
});
updateCalories();

// ------- CTA scroll -------
$("ctaStart").addEventListener("click", () => {
  $("generator").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ------- Fetch recipes (scaffold) -------
async function fetchRecipes(query) {
  // Replace with your real API/proxy. This scaffold tries a local proxy first.
  const url = `${CONFIG.PROXY_BASE}/api/recipes?q=${encodeURIComponent(query)}&limit=${CONFIG.MAX_RESULTS}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
    return data;
  } catch (e) {
    // Fallback demo data so the UI still works
    console.warn("Using demo cards (no API configured).", e.message);
    return demoCards();
  }
}

function demoCards() {
  // Simple placeholders that roughly match a 3/4/5-meal plan
  const pool = [
    { title: "Protein Veggie Bowl", time: 20, kcal: 520, cuisine: "Mediterranean", img: "", url: "#" },
    { title: "Chicken Stir Fry", time: 25, kcal: 610, cuisine: "Thai", img: "", url: "#" },
    { ti
