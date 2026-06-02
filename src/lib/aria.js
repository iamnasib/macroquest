// ─── MacroQuest AI Companion (NVIDIA NIM) ─────────────────────────────────────
// Powered by NVIDIA NIM — swap model or base URL easily
// Get your free key at: https://build.nvidia.com

const NVIDIA_API_KEY =
  import.meta.env.VITE_NVIDIA_API_KEY || "PLACEHOLDER_NVIDIA_API_KEY";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "meta/llama-3.3-70b-instruct";

const COMPANION_PERSONA = `You are ARIA (Adaptive Resource Intelligence Assistant), the AI companion inside MacroQuest — a nutrition RPG.

Your personality:
- Speak like a wise, encouraging game guide. Mix RPG language with nutritional coaching.
- Use terms like "resources", "energy points", "Iron Crystals" (protein), "quests", "forge", "champion"
- Be concise — 2-4 sentences max per response unless asked for a plan
- Always be positive and action-oriented
- Reference the user's actual data when provided

MacroQuest resource system:
- Calories = Energy Points (EP)  
- Protein = Iron Crystals (Fe)
- Carbs = Timber (WD)
- Fats = Gold (AU)
- Fiber = Stamina Orbs (ST)

Always end with one specific, actionable suggestion.`;

// ─── Core AI Call ─────────────────────────────────────────────────────────────
async function callAI(messages, maxTokens = 300) {
  if (NVIDIA_API_KEY === "PLACEHOLDER_NVIDIA_API_KEY") {
    return getMockResponse(messages);
  }

  const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{role: "system", content: COMPANION_PERSONA}, ...messages],
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ARIA API error: ${err}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || "ARIA is gathering data...";
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
