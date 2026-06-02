import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'
const MODEL = 'meta/llama-3.3-70b-instruct'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

Always end with one specific, actionable suggestion.`

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const NVIDIA_API_KEY = Deno.env.get('NVIDIA_API_KEY')
    if (!NVIDIA_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'NVIDIA_API_KEY not set in Edge Function secrets' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { messages, maxTokens = 300 } = await req.json()

    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: COMPANION_PERSONA }, ...messages],
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: false,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return new Response(
        JSON.stringify({ error: `NVIDIA API error: ${error}` }),
        { status: response.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || 'ARIA could not generate a response.'

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
