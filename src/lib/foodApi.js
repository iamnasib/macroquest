// ─── Food Search ──────────────────────────────────────────────────────────────
// Primary:  USDA FoodData Central — lab-tested data, excellent relevance for
//           generic and whole foods (bananas, chicken breast, dal, etc.)
// Fallback: Open Food Facts — packaged/branded products or when USDA is down
//
// USDA free API key: https://api.nal.usda.gov
// Add as VITE_USDA_API_KEY in Vercel env vars. DEMO_KEY works but rate-limits
// to 30 req/hour so register a free key before going public.

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'
const USDA_KEY  = import.meta.env.VITE_USDA_API_KEY || 'DEMO_KEY'
const OFF_BASE  = 'https://world.openfoodfacts.org'

// ─── USDA FoodData Central ────────────────────────────────────────────────────
async function searchUSDA(query) {
  const url = new URL(`${USDA_BASE}/foods/search`)
  url.searchParams.set('query',    query)
  url.searchParams.set('api_key',  USDA_KEY)
  // Search all data types in one call: generic whole foods come first in
  // USDA's own relevance ranking, branded products fill the tail.
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS),Branded')
  url.searchParams.set('pageSize', '20')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`USDA ${res.status}`)

  const data = await res.json()
  return (data.foods || [])
    .map(normalizeUSDAFood)
    .filter(f => f.per100g.calories > 0)   // discard incomplete entries
}

// USDA nutrient IDs (all values are per 100g regardless of data type)
const USDA_NUTRIENTS = {
  calories: [1008, 2047],   // Energy kcal — 2047 is the fallback field
  protein:  [1003],
  carbs:    [1005],
  fat:      [1004],
  fiber:    [1079],
  sugar:    [2000, 1063],   // 2000 is newer NLEA field, 1063 is legacy
}

function getNutrient(lookup, ...ids) {
  for (const id of ids) {
    if (lookup[id] != null && lookup[id] > 0) return lookup[id]
  }
  return 0
}

function normalizeUSDAFood(f) {
  // Build a flat id→value lookup from the nutrients array
  const n = {}
  for (const item of (f.foodNutrients || [])) {
    if (item.nutrientId != null) n[item.nutrientId] = item.value ?? 0
  }

  return {
    id:    `usda_${f.fdcId}`,
    name:  f.description || 'Unknown Food',
    brand: f.brandOwner || f.brandName || '',
    image: null,
    per100g: {
      calories: Math.round(getNutrient(n, ...USDA_NUTRIENTS.calories)),
      protein:  Math.round(getNutrient(n, ...USDA_NUTRIENTS.protein)  * 10) / 10,
      carbs:    Math.round(getNutrient(n, ...USDA_NUTRIENTS.carbs)    * 10) / 10,
      fat:      Math.round(getNutrient(n, ...USDA_NUTRIENTS.fat)      * 10) / 10,
      fiber:    Math.round(getNutrient(n, ...USDA_NUTRIENTS.fiber)    * 10) / 10,
      sugar:    Math.round(getNutrient(n, ...USDA_NUTRIENTS.sugar)    * 10) / 10,
    },
    defaultServing: 100,
    source: 'usda',
  }
}

// ─── Open Food Facts (fallback) ───────────────────────────────────────────────
async function searchOFF(query) {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=product_name,brands,nutriments,code`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OFF ${res.status}`)
  const data = await res.json()
  return (data.products || [])
    .filter(p => p.product_name && p.nutriments)
    .map(normalizeOFFProduct)
    .filter(f => f.per100g.calories > 0)
}

function normalizeOFFProduct(p) {
  const n = p.nutriments || {}
  return {
    id:    p.code || Math.random().toString(36).slice(2),
    name:  p.product_name || 'Unknown Food',
    brand: p.brands || '',
    image: null,
    per100g: {
      calories: Math.round(n['energy-kcal_100g'] || (n['energy_100g'] || 0) / 4.184 || 0),
      protein:  Math.round((n.proteins_100g      || 0) * 10) / 10,
      carbs:    Math.round((n.carbohydrates_100g  || 0) * 10) / 10,
      fat:      Math.round((n.fat_100g            || 0) * 10) / 10,
      fiber:    Math.round((n.fiber_100g          || 0) * 10) / 10,
      sugar:    Math.round((n.sugars_100g         || 0) * 10) / 10,
    },
    defaultServing: 100,
    source: 'openfoodfacts',
  }
}

// ─── Public Search Entry Point ────────────────────────────────────────────────
export async function searchFoods(query) {
  // USDA first — far better relevance for generic and whole foods
  try {
    const results = await searchUSDA(query)
    if (results.length > 0) return results
  } catch (err) {
    console.warn('USDA search unavailable, falling back to OFF:', err.message)
  }

  // OFF fallback — packaged/branded products or when USDA is unreachable
  try {
    return await searchOFF(query)
  } catch (err) {
    console.error('All food APIs failed:', err.message)
    return []
  }
}

// ─── Barcode Lookup (OFF only — barcodes are for packaged products) ───────────
export async function lookupBarcode(barcode) {
  try {
    const url = `${OFF_BASE}/api/v0/product/${barcode}.json?fields=product_name,brands,nutriments`
    const res  = await fetch(url)
    const data = await res.json()
    if (data.status === 1 && data.product) return normalizeOFFProduct(data.product)
    return null
  } catch (err) {
    console.error('Barcode lookup error:', err.message)
    return null
  }
}

// ─── Nutrition for a Given Serving Size ──────────────────────────────────────
export function calculateServing(food, servingGrams) {
  const r = servingGrams / 100
  return {
    calories: Math.round(food.per100g.calories * r),
    protein:  Math.round(food.per100g.protein  * r * 10) / 10,
    carbs:    Math.round(food.per100g.carbs     * r * 10) / 10,
    fat:      Math.round(food.per100g.fat       * r * 10) / 10,
    fiber:    Math.round(food.per100g.fiber     * r * 10) / 10,
  }
}

// ─── Curated Local Food Database ──────────────────────────────────────────────
// ~80 common Indian / international foods with verified nutrition data.
// These are always shown FIRST in search results — instant, offline, accurate.
// Covers the majority of what Indian users log daily.
export const COMMON_FOODS = [
  // ── Proteins ──────────────────────────────────────────────────────────────
  { id: 'chicken_breast',    name: 'Chicken Breast',          brand: 'Raw',     per100g: { calories: 165, protein: 31,   carbs: 0,    fat: 3.6,  fiber: 0   }, defaultServing: 150 },
  { id: 'chicken_thigh',     name: 'Chicken Thigh',           brand: 'Cooked',  per100g: { calories: 209, protein: 26,   carbs: 0,    fat: 11,   fiber: 0   }, defaultServing: 150 },
  { id: 'egg_boiled',        name: 'Boiled Egg',              brand: 'Farm',    per100g: { calories: 155, protein: 13,   carbs: 1.1,  fat: 11,   fiber: 0   }, defaultServing: 60  },
  { id: 'egg_white',         name: 'Egg White',               brand: 'Farm',    per100g: { calories: 52,  protein: 11,   carbs: 0.7,  fat: 0.2,  fiber: 0   }, defaultServing: 100 },
  { id: 'mutton',            name: 'Mutton (cooked)',         brand: 'Home',    per100g: { calories: 234, protein: 25,   carbs: 0,    fat: 14,   fiber: 0   }, defaultServing: 150 },
  { id: 'salmon',            name: 'Salmon',                  brand: 'Raw',     per100g: { calories: 208, protein: 20,   carbs: 0,    fat: 13,   fiber: 0   }, defaultServing: 150 },
  { id: 'tuna_canned',       name: 'Tuna (canned)',           brand: 'Generic', per100g: { calories: 116, protein: 26,   carbs: 0,    fat: 1,    fiber: 0   }, defaultServing: 100 },
  { id: 'paneer',            name: 'Paneer',                  brand: 'Home',    per100g: { calories: 265, protein: 18,   carbs: 3,    fat: 20,   fiber: 0   }, defaultServing: 100 },
  { id: 'tofu',              name: 'Tofu (firm)',             brand: 'Generic', per100g: { calories: 76,  protein: 8,    carbs: 2,    fat: 4,    fiber: 0.3 }, defaultServing: 100 },
  { id: 'soya_chunks',       name: 'Soya Chunks (dry)',       brand: 'Nutrela', per100g: { calories: 345, protein: 52,   carbs: 33,   fat: 0.5,  fiber: 13  }, defaultServing: 50  },
  { id: 'whey_protein',      name: 'Whey Protein Powder',     brand: 'Generic', per100g: { calories: 375, protein: 80,   carbs: 10,   fat: 3,    fiber: 0   }, defaultServing: 30  },

  // ── Dairy ──────────────────────────────────────────────────────────────────
  { id: 'whole_milk',        name: 'Whole Milk',              brand: 'Dairy',   per100g: { calories: 61,  protein: 3.2,  carbs: 4.8,  fat: 3.3,  fiber: 0   }, defaultServing: 250 },
  { id: 'skimmed_milk',      name: 'Skimmed Milk',            brand: 'Dairy',   per100g: { calories: 34,  protein: 3.4,  carbs: 4.9,  fat: 0.1,  fiber: 0   }, defaultServing: 250 },
  { id: 'dahi',              name: 'Curd / Dahi',             brand: 'Home',    per100g: { calories: 61,  protein: 3.5,  carbs: 5,    fat: 3,    fiber: 0   }, defaultServing: 200 },
  { id: 'greek_yogurt',      name: 'Greek Yogurt',            brand: 'Generic', per100g: { calories: 100, protein: 10,   carbs: 3.6,  fat: 5,    fiber: 0   }, defaultServing: 150 },
  { id: 'lassi_sweet',       name: 'Lassi (sweet)',           brand: 'Home',    per100g: { calories: 80,  protein: 3.5,  carbs: 10,   fat: 3,    fiber: 0   }, defaultServing: 300 },
  { id: 'ghee',              name: 'Ghee',                    brand: 'Home',    per100g: { calories: 900, protein: 0,    carbs: 0,    fat: 100,  fiber: 0   }, defaultServing: 10  },
  { id: 'butter',            name: 'Butter',                  brand: 'Amul',    per100g: { calories: 717, protein: 0.9,  carbs: 0.1,  fat: 81,   fiber: 0   }, defaultServing: 10  },
  { id: 'cheddar_cheese',    name: 'Cheddar Cheese',          brand: 'Generic', per100g: { calories: 403, protein: 25,   carbs: 1.3,  fat: 33,   fiber: 0   }, defaultServing: 30  },

  // ── Rice & Grains ──────────────────────────────────────────────────────────
  { id: 'basmati_rice',      name: 'Basmati Rice (cooked)',   brand: 'Home',    per100g: { calories: 130, protein: 2.7,  carbs: 28,   fat: 0.3,  fiber: 0.4 }, defaultServing: 200 },
  { id: 'white_rice',        name: 'White Rice (cooked)',     brand: 'Home',    per100g: { calories: 130, protein: 2.7,  carbs: 28,   fat: 0.3,  fiber: 0.4 }, defaultServing: 200 },
  { id: 'brown_rice',        name: 'Brown Rice (cooked)',     brand: 'Home',    per100g: { calories: 112, protein: 2.3,  carbs: 24,   fat: 0.8,  fiber: 1.8 }, defaultServing: 200 },
  { id: 'oats',              name: 'Oats (dry)',              brand: 'Quaker',  per100g: { calories: 389, protein: 17,   carbs: 66,   fat: 7,    fiber: 11  }, defaultServing: 80  },
  { id: 'quinoa',            name: 'Quinoa (cooked)',         brand: 'Generic', per100g: { calories: 120, protein: 4.4,  carbs: 22,   fat: 1.9,  fiber: 2.8 }, defaultServing: 180 },
  { id: 'poha',              name: 'Poha',                    brand: 'Home',    per100g: { calories: 180, protein: 4,    carbs: 37,   fat: 2,    fiber: 1.5 }, defaultServing: 200 },
  { id: 'upma',              name: 'Upma',                    brand: 'Home',    per100g: { calories: 160, protein: 4,    carbs: 28,   fat: 4,    fiber: 2   }, defaultServing: 200 },
  { id: 'cornflakes',        name: 'Cornflakes',              brand: 'Kellogg', per100g: { calories: 357, protein: 7,    carbs: 84,   fat: 0.4,  fiber: 2   }, defaultServing: 40  },

  // ── Breads ─────────────────────────────────────────────────────────────────
  { id: 'wheat_roti',        name: 'Wheat Roti',              brand: 'Home',    per100g: { calories: 264, protein: 8,    carbs: 53,   fat: 3,    fiber: 2   }, defaultServing: 40  },
  { id: 'paratha',           name: 'Paratha (plain)',         brand: 'Home',    per100g: { calories: 300, protein: 6,    carbs: 40,   fat: 13,   fiber: 2   }, defaultServing: 80  },
  { id: 'aloo_paratha',      name: 'Aloo Paratha',            brand: 'Home',    per100g: { calories: 218, protein: 5,    carbs: 35,   fat: 7,    fiber: 2   }, defaultServing: 130 },
  { id: 'naan',              name: 'Naan',                    brand: 'Home',    per100g: { calories: 310, protein: 9,    carbs: 56,   fat: 5,    fiber: 2   }, defaultServing: 90  },
  { id: 'poori',             name: 'Poori',                   brand: 'Home',    per100g: { calories: 336, protein: 5,    carbs: 36,   fat: 19,   fiber: 2   }, defaultServing: 60  },
  { id: 'idli',              name: 'Idli',                    brand: 'Home',    per100g: { calories: 58,  protein: 2,    carbs: 12,   fat: 0.3,  fiber: 0.5 }, defaultServing: 150 },
  { id: 'dosa',              name: 'Dosa (plain)',            brand: 'Home',    per100g: { calories: 168, protein: 3.7,  carbs: 26,   fat: 5,    fiber: 0.7 }, defaultServing: 100 },
  { id: 'white_bread',       name: 'White Bread',             brand: 'Generic', per100g: { calories: 265, protein: 9,    carbs: 49,   fat: 3.3,  fiber: 2.7 }, defaultServing: 50  },
  { id: 'brown_bread',       name: 'Brown Bread',             brand: 'Generic', per100g: { calories: 247, protein: 9,    carbs: 41,   fat: 3.5,  fiber: 6   }, defaultServing: 50  },

  // ── Dals & Legumes ─────────────────────────────────────────────────────────
  { id: 'dal_makhani',       name: 'Dal Makhani',             brand: 'Home',    per100g: { calories: 110, protein: 6,    carbs: 15,   fat: 3,    fiber: 3   }, defaultServing: 200 },
  { id: 'dal_tadka',         name: 'Dal Tadka',               brand: 'Home',    per100g: { calories: 120, protein: 6,    carbs: 17,   fat: 3,    fiber: 4   }, defaultServing: 200 },
  { id: 'masoor_dal',        name: 'Masoor Dal (cooked)',     brand: 'Home',    per100g: { calories: 116, protein: 9,    carbs: 20,   fat: 0.4,  fiber: 7.9 }, defaultServing: 200 },
  { id: 'moong_dal',         name: 'Moong Dal (cooked)',      brand: 'Home',    per100g: { calories: 105, protein: 7,    carbs: 19,   fat: 0.4,  fiber: 4.1 }, defaultServing: 200 },
  { id: 'chana_dal',         name: 'Chana Dal (cooked)',      brand: 'Home',    per100g: { calories: 164, protein: 9,    carbs: 27,   fat: 2.7,  fiber: 8   }, defaultServing: 200 },
  { id: 'rajma',             name: 'Rajma (cooked)',          brand: 'Home',    per100g: { calories: 127, protein: 9,    carbs: 22,   fat: 0.5,  fiber: 7   }, defaultServing: 200 },
  { id: 'chhole',            name: 'Chhole / Chickpea Curry', brand: 'Home',    per100g: { calories: 164, protein: 8.9,  carbs: 27,   fat: 2.6,  fiber: 7.6 }, defaultServing: 200 },

  // ── Indian Dishes ──────────────────────────────────────────────────────────
  { id: 'palak_paneer',      name: 'Palak Paneer',            brand: 'Home',    per100g: { calories: 158, protein: 8,    carbs: 8,    fat: 11,   fiber: 2   }, defaultServing: 200 },
  { id: 'aloo_gobi',         name: 'Aloo Gobi',               brand: 'Home',    per100g: { calories: 95,  protein: 2.5,  carbs: 12,   fat: 4.5,  fiber: 2.5 }, defaultServing: 200 },
  { id: 'samosa',            name: 'Samosa',                  brand: 'Snack',   per100g: { calories: 262, protein: 4,    carbs: 30,   fat: 14,   fiber: 2   }, defaultServing: 100 },
  { id: 'pakoda',            name: 'Pakoda',                  brand: 'Snack',   per100g: { calories: 325, protein: 7,    carbs: 34,   fat: 18,   fiber: 3   }, defaultServing: 100 },

  // ── Vegetables ─────────────────────────────────────────────────────────────
  { id: 'boiled_potato',     name: 'Boiled Potato',           brand: 'Home',    per100g: { calories: 87,  protein: 1.9,  carbs: 20,   fat: 0.1,  fiber: 1.8 }, defaultServing: 150 },
  { id: 'sweet_potato',      name: 'Sweet Potato (boiled)',   brand: 'Home',    per100g: { calories: 76,  protein: 1.4,  carbs: 18,   fat: 0.1,  fiber: 2.5 }, defaultServing: 150 },
  { id: 'spinach_cooked',    name: 'Spinach (cooked)',        brand: 'Home',    per100g: { calories: 23,  protein: 2.9,  carbs: 3.6,  fat: 0.4,  fiber: 2.4 }, defaultServing: 100 },
  { id: 'broccoli',          name: 'Broccoli (cooked)',       brand: 'Fresh',   per100g: { calories: 35,  protein: 2.4,  carbs: 7,    fat: 0.4,  fiber: 3.3 }, defaultServing: 150 },
  { id: 'tomato',            name: 'Tomato',                  brand: 'Fresh',   per100g: { calories: 18,  protein: 0.9,  carbs: 3.9,  fat: 0.2,  fiber: 1.2 }, defaultServing: 100 },
  { id: 'avocado',           name: 'Avocado',                 brand: 'Fresh',   per100g: { calories: 160, protein: 2,    carbs: 9,    fat: 15,   fiber: 7   }, defaultServing: 100 },

  // ── Fruits ─────────────────────────────────────────────────────────────────
  { id: 'banana',            name: 'Banana',                  brand: 'Fresh',   per100g: { calories: 89,  protein: 1.1,  carbs: 23,   fat: 0.3,  fiber: 2.6 }, defaultServing: 120 },
  { id: 'apple',             name: 'Apple',                   brand: 'Fresh',   per100g: { calories: 52,  protein: 0.3,  carbs: 14,   fat: 0.2,  fiber: 2.4 }, defaultServing: 150 },
  { id: 'mango',             name: 'Mango',                   brand: 'Fresh',   per100g: { calories: 60,  protein: 0.8,  carbs: 15,   fat: 0.4,  fiber: 1.6 }, defaultServing: 200 },
  { id: 'papaya',            name: 'Papaya',                  brand: 'Fresh',   per100g: { calories: 43,  protein: 0.5,  carbs: 11,   fat: 0.3,  fiber: 1.7 }, defaultServing: 200 },
  { id: 'orange',            name: 'Orange',                  brand: 'Fresh',   per100g: { calories: 47,  protein: 0.9,  carbs: 12,   fat: 0.1,  fiber: 2.4 }, defaultServing: 150 },
  { id: 'watermelon',        name: 'Watermelon',              brand: 'Fresh',   per100g: { calories: 30,  protein: 0.6,  carbs: 7.6,  fat: 0.2,  fiber: 0.4 }, defaultServing: 300 },
  { id: 'grapes',            name: 'Grapes',                  brand: 'Fresh',   per100g: { calories: 67,  protein: 0.6,  carbs: 17,   fat: 0.4,  fiber: 0.9 }, defaultServing: 150 },

  // ── Nuts & Seeds ───────────────────────────────────────────────────────────
  { id: 'almonds',           name: 'Almonds',                 brand: 'Raw',     per100g: { calories: 579, protein: 21,   carbs: 22,   fat: 50,   fiber: 12  }, defaultServing: 28  },
  { id: 'cashews',           name: 'Cashews',                 brand: 'Raw',     per100g: { calories: 553, protein: 18,   carbs: 30,   fat: 44,   fiber: 3.3 }, defaultServing: 30  },
  { id: 'walnuts',           name: 'Walnuts',                 brand: 'Raw',     per100g: { calories: 654, protein: 15,   carbs: 14,   fat: 65,   fiber: 6.7 }, defaultServing: 30  },
  { id: 'peanuts_roasted',   name: 'Peanuts (roasted)',       brand: 'Raw',     per100g: { calories: 567, protein: 26,   carbs: 16,   fat: 49,   fiber: 8.5 }, defaultServing: 30  },
  { id: 'peanut_butter',     name: 'Peanut Butter',           brand: 'Sundrop', per100g: { calories: 588, protein: 25,   carbs: 20,   fat: 50,   fiber: 6   }, defaultServing: 32  },
  { id: 'chia_seeds',        name: 'Chia Seeds',              brand: 'Generic', per100g: { calories: 486, protein: 17,   carbs: 42,   fat: 31,   fiber: 34  }, defaultServing: 15  },

  // ── Other ──────────────────────────────────────────────────────────────────
  { id: 'dark_chocolate',    name: 'Dark Chocolate (70%)',    brand: 'Generic', per100g: { calories: 600, protein: 7,    carbs: 46,   fat: 43,   fiber: 11  }, defaultServing: 30  },
  { id: 'sweet_corn',        name: 'Sweet Corn (cooked)',     brand: 'Home',    per100g: { calories: 108, protein: 3.4,  carbs: 25,   fat: 1.3,  fiber: 2.8 }, defaultServing: 150 },
]

// ─── TDEE / Goal Calculator ───────────────────────────────────────────────────
export function calculateTDEE({
  weight, height, age, gender, activityLevel,
  bodyFatPct = null, healthConditions = [], dietType = 'omnivore',
}) {
  let bmr
  if (bodyFatPct && bodyFatPct > 0 && bodyFatPct < 70) {
    // Katch-McArdle: more accurate when body composition is known
    const lbm = weight * (1 - bodyFatPct / 100)
    bmr = 370 + 21.6 * lbm
  } else {
    // Mifflin-St Jeor (default)
    bmr = gender === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161
  }

  const multipliers = {
    sedentary:   1.2,
    light:       1.375,
    moderate:    1.55,
    active:      1.725,
    very_active: 1.9,
  }

  let tdee = Math.round(bmr * (multipliers[activityLevel] || 1.55))

  // Hypothyroidism: metabolic rate reduced ~5%
  if (healthConditions.includes('hypothyroidism')) {
    tdee = Math.round(tdee * 0.95)
  }

  // Protein: standard 2g/kg; vegan 1.8g/kg (lower bioavailability); kidney disease 0.8g/kg
  let proteinPerKg = dietType === 'vegan' ? 1.8 : 2.0
  if (healthConditions.includes('kidney_disease')) proteinPerKg = 0.8
  const proteinGoal = Math.round(weight * proteinPerKg)

  // Carb/fat split as % of TDEE — adjusted by health conditions
  let carbPct = 0.45
  let fatPct  = 0.25
  if (healthConditions.includes('diabetes') || healthConditions.includes('pcos')) {
    carbPct = 0.35  // lower carbs for insulin resistance
    fatPct  = 0.30
  }
  if (healthConditions.includes('high_cholesterol')) {
    fatPct = 0.20  // reduce fat exposure
  }

  return {
    bmr:              Math.round(bmr),
    tdee,
    bulkCalories:     tdee + 300,
    cutCalories:      tdee - 400,
    maintainCalories: tdee,
    proteinGoal,
    carbGoal:         Math.round((tdee * carbPct) / 4),
    fatGoal:          Math.round((tdee * fatPct)  / 9),
  }
}
