// /api/recipes.js — Vercel serverless function (single, canonical proxy)
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Read secrets from Vercel env (already added in your screenshots)
    const APP_ID  = process.env.EDAMAM_APP_ID;
    const APP_KEY = process.env.EDAMAM_APP_KEY;
    const USER_ID = process.env.EDAMAM_USER_ID;

    if (!APP_ID || !APP_KEY || !USER_ID) {
      return res.status(500).json({ error: "Missing server config" });
    }

    // Incoming query params from the browser
    const {
      q = "recipe",
      from = "0",
      to = "20",
      random = "true",
      calories = "",              // optional direct calories range
      perMealCalories = "",       // optional single target -> we expand to a range
      diet = "",
      health = "",
      cuisine = "",
      timeRange = "",
      imageSize = "REGULAR",
      field = [
        "label","image","url","yield",
        "ingredientLines","calories","totalNutrients",
        "dietLabels","healthLabels","totalTime",
      ],
    } = req.query;

    // Build upstream query to Edamam v2
    const params = new URLSearchParams({
      type: "public",
      q,
      app_id: APP_ID,
      app_key: APP_KEY,
      imageSize,
      from,
      to,
      random,
    });

    // calories: prefer explicit range, else expand perMealCalories±120
    if (calories) {
      params.set("calories", calories);
    } else if (perMealCalories && Number.isFinite(Number(perMealCalories))) {
      const c = Number(perMealCalories);
      params.set("calories", `${Math.max(100, c - 120)}-${c + 120}`);
    }

    if (diet)    params.set("diet", diet);
    if (health)  params.set("health", health);
    if (cuisine) params.set("cuisineType", cuisine);
    if (timeRange) params.set("time", timeRange);

    (Array.isArray(field) ? field : [field]).forEach(f => params.append("field", f));

    const url = `https://api.edamam.com/api/recipes/v2?${params.toString()}`;

    // IMPORTANT: header name must be exactly lower-case like this:
    const upstream = await fetch(url, {
      headers: { "edamam-account-user": USER_ID },
    });

    const text = await upstream.text(); // return raw JSON text for pass-through

    // CORS isn’t strictly needed for same-origin calls, but harmless:
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    return res
      .status(upstream.ok ? 200 : upstream.status)
      .send(text || upstream.statusText);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
