# ⚔️ MacroQuest — Level Up Your Nutrition

> The nutrition RPG where every meal is a quest and every calorie is a resource.

**Calories → Energy Points. Protein → Iron Crystals. Carbs → Timber. Fat → Gold.**

---

## 🚀 Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/macroquest
cd macroquest
npm install
cp .env.example .env    # fill in your keys
npm run dev
```

## 🔑 Keys You Need

| Key | Source | Cost |
|-----|--------|------|
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | [supabase.com](https://supabase.com) | Free |
| `VITE_NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com) | Free (1000 credits) |

After getting Supabase keys, run `supabase/migrations/001_initial.sql` in the Supabase SQL editor.

---

## 🎮 Game System

- **Resources**: Calories=⚡EP · Protein=🔩Iron · Carbs=🪵Timber · Fat=✨Gold · Fiber=💎Stamina
- **Levels 1–100** tied to consistency, not weight
- **Daily quests** (Easy → Legendary) generating XP
- **World stages**: Campsite → Outpost → Village → Kingdom → Empire
- **ARIA** — AI companion powered by NVIDIA NIM (Llama 3.1 70B)
- **Streak system** across logging, protein, and calorie budget

## 🗺️ Roadmap

- v1.0: Auth, Food log, Quests, Character, ARIA AI ✅
- v1.1: Barcode scanning, weekly analytics, notifications
- v2.0: Boss battles, guilds, mobile app (Capacitor), monetization

---

*MacroQuest — Because tracking macros shouldn't feel like homework.*
