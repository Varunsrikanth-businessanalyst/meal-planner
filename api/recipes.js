// /api/recipes.js  (Vercel Serverless Function)
export default async function handler(req, res) {
  try {
    const {
      q = "recipe",
      from = "0",
      to = "20",
      random = "true",
      calories = "",
      diet = "",
      health = "",
      imageSize = "REGULAR",
      field = ["label","image","url","yield","ingredientLines","calories","totalNutrients","dietLabels","healthLabels","totalTime"],
    } = req.query;

    const params = new URLSearchParams({
      type: "public",
      q,
      app_id: process.env.EDAMAM_APP_ID,
      app_key: process.env.EDAMAM_APP_KEY,
      imageSize,
      from,
      to,
      random,
    });

    if (calories) params.set("calories", calories);
    if (diet) params.set("diet", diet);
    if (health) params.set("health", health);
    (Array.isArray(field) ? field : [field]).forEach(f => params.append("field", f));

    const url = `https://api.edamam.com/api/recipes/v2?${params.toString()}`;

    const r = await fetch(url, {
      headers: { "edamam-account-user": process.env.EDAMAM_USER_ID || "" },
    });

    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e?.message || "Server error" });
  }
}
