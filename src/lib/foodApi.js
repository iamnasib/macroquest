// ─── Open Food Facts API Client ───────────────────────────────────────────────
// Free, open food database — no API key required
// Docs: https://world.openfoodfacts.org/data

const OFF_BASE = 'https://world.openfoodfacts.org'
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'
const USDA_KEY = import.meta.env.VITE_USDA_API_KEY || 'DEMO_KEY'

// ─── Search Foods ─────────────────────────────────────────────────────────────
export async function searchFoods(query, page = 1) {
  try {
    const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page=${page}&page_size=20&fields=product_name,brands,nutriments,image_small_url,categories_tags,code`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Search failed')
    const data = await res.json()
    return (data.products || [])
      .filter(p => p.product_name && p.nutriments)
      .map(normalizeOFFProduct)
  } catch (err) {
    console.error('Food search error:', err)
    return getFallbackResults(query)
  }
}

// ─── Barcode Lookup ───────────────────────────────────────────────────────────
export async function lookupBarcode(barcode) {
  try {
    const url = `${OFF_BASE}/api/v0/product/${barcode}.json?fields=product_name,brands,nutriments,image_small_url`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === 1 && data.product) {
      return normalizeOFFProduct(data.product)
    }
    return null
  } catch (err) {
    console.error('Barcode lookup error:', err)
    return null
  }
}

// ─── Normalize Open Food Facts Product ───────────────────────────────────────
function normalizeOFFProduct(p) {
  const n = p.nutriments || {}
  return {
    id: p.code || Math.random().toString(36).slice(2),
    name: p.product_name || 'Unknown Food',
    brand: p.brands || '',
    image: p.image_small_url || null,
    per100g: {
      calories: Math.round(n['energy-kcal_100g'] || n['energy_100g'] / 4.184 || 0),
      protein:  Math.round((n.proteins_100g   || 0) * 10) / 10,
      carbs:    Math.round((n.carbohydrates_100g || 0) * 10) / 10,
      fat:      Math.round((n.fat_100g         || 0) * 10) / 10,
      fiber:    Math.round((n.fiber_100g        || 0) * 10) / 10,
      sugar:    Math.round((n.sugars_100g       || 0) * 10) / 10,
    },
    defaultServing: 100,
    source: 'openfoodfacts',
  }
}

// ─── Calculate Nutrition for Serving ─────────────────────────────────────────
export function calculateServing(food, servingGrams) {
  const ratio = servingGrams / 100
  return {
    calories: Math.round(food.per100g.calories * ratio),
    protein:  Math.round(food.per100g.protein  * ratio * 10) / 10,
    carbs:    Math.round(food.per100g.carbs     * ratio * 10) / 10,
    fat:      Math.round(food.per100g.fat       * ratio * 10) / 10,
    fiber:    Math.round(food.per100g.fiber     * ratio * 10) / 10,
  }
}

// ─── Common Indian / Kashmiri Foods (Local Fallback) ──────────────────────────
export const COMMON_FOODS = [
  { id: 'dal_makhani',    name: 'Dal Makhani',          brand: 'Home',    per100g: { calories: 110, protein: 6, carbs: 15, fat: 3,  fiber: 3  }, defaultServing: 200 },
  { id: 'chicken_breast', name: 'Chicken Breast',       brand: 'Raw',     per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }, defaultServing: 150 },
  { id: 'paneer',         name: 'Paneer',                brand: 'Home',    per100g: { calories: 265, protein: 18, carbs: 3, fat: 20, fiber: 0  }, defaultServing: 100 },
  { id: 'basmati_rice',   name: 'Basmati Rice (cooked)', brand: 'Home',   per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 }, defaultServing: 200 },
  { id: 'roti_wheat',     name: 'Wheat Roti',           brand: 'Home',    per100g: { calories: 264, protein: 8, carbs: 53, fat: 3,  fiber: 2  }, defaultServing: 40  },
  { id: 'rajma',          name: 'Rajma (cooked)',        brand: 'Home',    per100g: { calories: 127, protein: 9, carbs: 22, fat: 0.5, fiber: 7 }, defaultServing: 200 },
  { id: 'dahi',           name: 'Curd / Dahi',          brand: 'Home',    per100g: { calories: 61,  protein: 3.5, carbs: 5, fat: 3,  fiber: 0 }, defaultServing: 200 },
  { id: 'egg_boiled',     name: 'Boiled Egg',           brand: 'Farm',    per100g: { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0 }, defaultServing: 60 },
  { id: 'banana',         name: 'Banana',               brand: 'Fresh',   per100g: { calories: 89,  protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 }, defaultServing: 120 },
  { id: 'whole_milk',     name: 'Whole Milk',           brand: 'Dairy',   per100g: { calories: 61,  protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 }, defaultServing: 250 },
  { id: 'oats',           name: 'Oats (dry)',           brand: 'Quaker',  per100g: { calories: 389, protein: 17, carbs: 66, fat: 7,  fiber: 11 }, defaultServing: 80  },
  { id: 'almonds',        name: 'Almonds',              brand: 'Raw',     per100g: { calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 12 }, defaultServing: 28  },
  { id: 'peanut_butter',  name: 'Peanut Butter',        brand: 'Sundrop', per100g: { calories: 588, protein: 25, carbs: 20, fat: 50, fiber: 6  }, defaultServing: 32  },
  { id: 'chana_dal',      name: 'Chana Dal (cooked)',   brand: 'Home',    per100g: { calories: 164, protein: 9, carbs: 27, fat: 2.7, fiber: 8  }, defaultServing: 200 },
  { id: 'tuna_canned',    name: 'Tuna (canned)',        brand: 'Generic', per100g: { calories: 116, protein: 26, carbs: 0, fat: 1,  fiber: 0  }, defaultServing: 100 },
]

function getFallbackResults(query) {
  const q = query.toLowerCase()
  return COMMON_FOODS.filter(f =>
    f.name.toLowerCase().includes(q) || f.brand.toLowerCase().includes(q)
  ).slice(0, 6)
}

// ─── TDEE / Goal Calculator ───────────────────────────────────────────────────
export function calculateTDEE({ weight, height, age, gender, activityLevel }) {
  // Mifflin-St Jeor BMR
  let bmr = gender === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161

  const activityMultipliers = {
    sedentary:    1.2,
    light:        1.375,
    moderate:     1.55,
    active:       1.725,
    very_active:  1.9,
  }

  const tdee = Math.round(bmr * (activityMultipliers[activityLevel] || 1.55))
  return {
    bmr: Math.round(bmr),
    tdee,
    bulkCalories:   tdee + 300,
    cutCalories:    tdee - 400,
    maintainCalories: tdee,
    proteinGoal:    Math.round(weight * 2.0),  // 2g/kg bodyweight
    carbGoal:       Math.round((tdee * 0.45) / 4),
    fatGoal:        Math.round((tdee * 0.25) / 9),
  }
}
