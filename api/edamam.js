// api/edamam.js  — Vercel serverless function
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const APP_ID  = process.env.EDAMAM_APP_ID;
    const APP_KEY = process.env.EDAMAM_APP_KEY;
    const USER_ID = process.env.EDAMAM_USER_ID;
    if (!APP_ID || !APP_KEY || !USER_ID) {
      return res.status(500).json({ error: 'Missing server config' });
    }

    const {
      q = 'meal', perMealCalories, diet = '', health = '',
      cuisine = '', timeRange = '', from = '0', to = '60', random = 'true'
    } = req.query;

    const p = new URLSearchParams({ type:'public', q, app_id:APP_ID, app_key:APP_KEY, imageSize:'REGULAR', from, to, random });
    if (perMealCalories && Number.isFinite(Number(perMealCalories))) {
      const c = Number(perMealCalories);
      p.append('calories', `${Math.max(100, c - 120)}-${c + 120}`);
    }
    ['label','image','url','yield','ingredientLines','calories','totalNutrients','dietLabels','healthLabels','totalTime']
      .forEach(f => p.append('field', f));
    if (diet)    p.append('diet', diet);
    if (health)  p.append('health', health);
    if (cuisine) p.append('cuisineType', cuisine);
    if (timeRange) p.append('time', timeRange);

    const url = `https://api.edamam.com/api/recipes/v2?${p.toString()}`;
    const upstream = await fetch(url, { headers: { 'Edamam-Account-User': USER_ID } });
    const text = await upstream.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(upstream.ok ? 200 : upstream.status).send(text || upstream.statusText);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy error' });
  }
}
