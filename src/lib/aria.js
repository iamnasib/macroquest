// ─── MacroQuest AI Companion (NVIDIA NIM via Supabase Edge Function) ──────────
// Calls NVIDIA NIM server-side to avoid CORS issues and keep API key secure.
// Model: meta/llama-3.3-70b-instruct
// Edge Function: supabase/functions/aria/index.ts

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ARIA_ENDPOINT = `${SUPABASE_URL}/functions/v1/aria`;

// ─── Core AI Call (via Edge Function proxy) ───────────────────────────────────
async function callAI(messages, maxTokens = 300) {
  // Fall back to mock when no Supabase project is configured
  if (!SUPABASE_URL || SUPABASE_URL.includes('placeholder')) {
    return getMockResponse(messages);
  }

  const res = await fetch(ARIA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({messages, maxTokens}),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ARIA proxy error: ${err}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.content || "ARIA is gathering data...";
}

// ─── Companion Functions ──────────────────────────────────────────────────────

export async function getDailyInsight({
  calories,
  protein,
  carbs,
  fat,
  calorieGoal,
  proteinGoal,
  streakDays,
  level,
}) {
  const messages = [
    {
      role: "user",
      content: `My stats today:
- Energy consumed: ${calories}/${calorieGoal} EP
- Iron Crystals (protein): ${protein}/${proteinGoal}g
- Timber (carbs): ${carbs}g
- Gold (fats): ${fat}g
- Current streak: ${streakDays} days
- My level: ${level}

Give me a daily insight and what I should focus on for the rest of the day.`,
    },
  ];
  return callAI(messages);
}

export async function getSuggestion({remaining, type, userGoals}) {
  const messages = [
    {
      role: "user",
      content: `I need ${remaining}${type === "protein" ? "g more Iron Crystals (protein)" : " more Energy Points (calories)"} to complete today's quest. Suggest 2-3 specific Indian/Kashmiri food options that would help. Keep it practical.`,
    },
  ];
  return callAI(messages, 200);
}

export async function analyzeMeal({foodName, calories, protein, carbs, fat}) {
  const messages = [
    {
      role: "user",
      content: `I just logged: ${foodName} — ${calories} EP, ${protein}g Iron, ${carbs}g Timber, ${fat}g Gold. Give me a quick RPG-style assessment of this meal's value to my quest.`,
    },
  ];
  return callAI(messages, 150);
}

export async function getWeeklySummary({
  weekData,
  totalXP,
  questsCompleted,
  streakDays,
}) {
  const messages = [
    {
      role: "user",
      content: `Weekly battle report:
- Total XP earned: ${totalXP}
- Quests completed: ${questsCompleted}
- Current streak: ${streakDays} days
- Days logged: ${weekData?.daysLogged || 0}/7
- Average protein: ${weekData?.avgProtein || 0}g

Give me a warrior's weekly summary and my mission for next week.`,
    },
  ];
  return callAI(messages, 350);
}

export async function chat(userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory.slice(-6), // keep last 6 messages for context
    {role: "user", content: userMessage},
  ];
  return callAI(messages, 400);
}

// ─── Mock Responses (when API key not set) ────────────────────────────────────
function getMockResponse(messages) {
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || "";

  if (lastMsg.includes("daily") || lastMsg.includes("stats")) {
    return Promise.resolve(
      "⚡ Your energy reserves look solid, Champion! Your Iron Crystal stores are building strength for the Protein Forge. **Focus:** You're 40g of Iron Crystals away from completing today's Forge Quest — a serving of dal or paneer will seal the victory. Keep the streak alive!",
    );
  }
  if (lastMsg.includes("suggest") || lastMsg.includes("need")) {
    return Promise.resolve(
      "🔩 For Iron Crystal replenishment, try: **Chicken Breast** (31g Fe per 100g), **Rajma** (9g Fe per cup), or **Paneer** (18g Fe per 100g). Any of these will complete your Forge Quest and earn the daily bonus!",
    );
  }
  if (lastMsg.includes("logged") || lastMsg.includes("meal")) {
    return Promise.resolve(
      "✨ Strong resource acquisition! This meal contributes well to your daily haul. The Gold reserves from healthy fats will fuel your recovery quest tonight. **Next:** aim for a high-Iron meal before your next training session.",
    );
  }
  return Promise.resolve(
    "⚔️ Greetings, Champion! I'm ARIA, your quest companion. Connect your NVIDIA API key in the `.env` file to unlock my full intelligence. Until then, I'll guide you with my training data. What quest shall we tackle today?",
  );
}
