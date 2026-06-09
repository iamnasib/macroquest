// ─── MacroQuest Game Engine ───────────────────────────────────────────────────
// Maps nutrition data to RPG resources, calculates XP, levels, streaks, quests

export const RESOURCES = {
  ENERGY:  { name: 'Energy',         icon: '⚡', color: '#f5a623', unit: 'EP'  },
  IRON:    { name: 'Iron Crystals',  icon: '🔩', color: '#94a3b8', unit: 'Fe'  },
  WOOD:    { name: 'Timber',         icon: '🪵', color: '#a3774a', unit: 'WD'  },
  GOLD:    { name: 'Gold',           icon: '✨', color: '#fbbf24', unit: 'AU'  },
  STAMINA: { name: 'Stamina Orbs',   icon: '💎', color: '#60a5fa', unit: 'ST'  },
}

export const MODES = {
  EXPEDITION:    { id: 'EXPEDITION',    name: 'Expedition',    icon: '⚔️',  goalDirection: 'cut',      goalDesc: 'Calorie deficit · lose weight',     desc: 'Burn stored energy, defeat bosses, travel regions'     },
  EMPIRE:        { id: 'EMPIRE',        name: 'Build Empire',  icon: '🏰', goalDirection: 'bulk',     goalDesc: 'Calorie surplus · gain weight',      desc: 'Gather resources, construct buildings, expand territory' },
  WORLD_BUILDER: { id: 'WORLD_BUILDER', name: 'World Builder', icon: '🌱', goalDirection: 'maintain', goalDesc: 'Maintenance calories · hold steady', desc: 'Grow a thriving ecosystem through healthy habits'       },
}

// Returns the MODES entry whose goalDirection matches, defaulting to EMPIRE.
export function modeFromGoalDirection(goalDirection) {
  return Object.values(MODES).find(m => m.goalDirection === goalDirection) ?? MODES.EMPIRE
}

export const CHARACTERS = [
  { id: 'warrior',  name: 'Warrior',  icon: '⚔️',  desc: '+10% Iron gains'   },
  { id: 'mage',     name: 'Mage',     icon: '🧙',  desc: '+10% XP gains'     },
  { id: 'ranger',   name: 'Ranger',   icon: '🏹',  desc: '+10% Stamina gains' },
  { id: 'dragon',   name: 'Dragon',   icon: '🐉',  desc: '+10% Energy gains' },
  { id: 'samurai',  name: 'Samurai',  icon: '🗡️',  desc: '+15% streak bonus' },
  { id: 'robot',    name: 'Robot',    icon: '🤖',  desc: '+10% Gold gains'   },
]

// ─── Nutrition → Resource Conversion ─────────────────────────────────────────
export function nutritionToResources(nutrition, characterType = null) {
  const { calories = 0, protein = 0, carbs = 0, fat = 0, fiber = 0 } = nutrition
  return {
    energy:  Math.round(calories * (characterType === 'dragon'  ? 1.1 : 1)),
    iron:    Math.round(protein * 1.5 * (characterType === 'warrior' ? 1.1 : 1)),
    wood:    Math.round(carbs * 0.8),
    gold:    Math.round(fat * 1.2 * (characterType === 'robot'   ? 1.1 : 1)),
    stamina: Math.round(fiber * 3   * (characterType === 'ranger'  ? 1.1 : 1)),
  }
}

// ─── Level System ─────────────────────────────────────────────────────────────
export function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5))
}

export function getLevelFromXP(totalXP) {
  let level = 1
  let accumulated = 0
  while (accumulated + xpForLevel(level) <= totalXP) {
    accumulated += xpForLevel(level)
    level++
    if (level >= 100) break
  }
  return { level, currentXP: totalXP - accumulated, xpNeeded: xpForLevel(level) }
}

export function getLevelTitle(level) {
  if (level < 5)   return 'Novice Adventurer'
  if (level < 10)  return 'Squire of the Forge'
  if (level < 20)  return 'Iron Tracker'
  if (level < 30)  return 'Protein Knight'
  if (level < 40)  return 'Macro Mage'
  if (level < 50)  return 'Quest Champion'
  if (level < 60)  return 'Nutrition Warlord'
  if (level < 75)  return 'Legendary Forger'
  if (level < 90)  return 'Realm Keeper'
  return 'MacroQuest Grandmaster'
}

// ─── Quest Generator ──────────────────────────────────────────────────────────
export function generateDailyQuests(userGoals, currentLog) {
  const { calorieGoal, proteinGoal } = userGoals
  const { calories = 0, protein = 0, mealsLogged = 0 } = currentLog

  const quests = [
    {
      id: 'log_meal',
      title: 'First Meal of the Day',
      desc: 'Log your first meal to claim the Morning Warrior bonus',
      type: 'EASY',
      reward: { xp: 50, gold: 10 },
      completed: mealsLogged >= 1,
      progress: Math.min(mealsLogged, 1),
      total: 1,
      icon: '🍽️',
    },
    {
      id: 'protein_80',
      title: 'Forge the Iron',
      desc: `Reach 80% of your protein goal (${Math.round(proteinGoal * 0.8)}g / ${proteinGoal}g)`,
      type: 'MEDIUM',
      reward: { xp: 100, iron: 50 },
      completed: protein >= proteinGoal * 0.8,
      progress: Math.min(protein, proteinGoal * 0.8),
      total: proteinGoal * 0.8,
      icon: '🔩',
    },
    {
      id: 'calorie_target',
      title: 'Defend the Energy Gate',
      desc: `Stay within ±200 calories of your goal (${calorieGoal} EP target)`,
      type: 'HARD',
      reward: { xp: 150, energy: 100 },
      completed: Math.abs(calories - calorieGoal) <= 200 && calories > calorieGoal * 0.7,
      progress: calories,
      total: calorieGoal,
      icon: '⚡',
    },
    {
      id: 'log_all_meals',
      title: 'The Legendary Chronicle',
      desc: 'Log 3 complete meals with full macros',
      type: 'LEGENDARY',
      reward: { xp: 300, gold: 50, iron: 30, wood: 30 },
      completed: mealsLogged >= 3,
      progress: Math.min(mealsLogged, 3),
      total: 3,
      icon: '👑',
    },
  ]
  return quests
}

// ─── Streak Bonus ─────────────────────────────────────────────────────────────
export function getStreakBonus(streak) {
  if (streak >= 30) return { xp: 100, label: '30-Day Legend', color: '#f5a623' }
  if (streak >= 14) return { xp: 60,  label: '2-Week Warrior', color: '#7c3aed' }
  if (streak >= 7)  return { xp: 30,  label: 'Week Warrior',  color: '#60a5fa' }
  if (streak >= 3)  return { xp: 15,  label: '3-Day Streak',  color: '#10b981' }
  return { xp: 0, label: '', color: '' }
}

// ─── World Growth ─────────────────────────────────────────────────────────────
export function getWorldStage(totalDays) {
  if (totalDays >= 168) return { name: 'Empire',  icon: '🌆', desc: 'A sprawling empire of discipline' }
  if (totalDays >= 84)  return { name: 'Kingdom', icon: '🏰', desc: 'A proud kingdom rises' }
  if (totalDays >= 28)  return { name: 'Village', icon: '🏘️', desc: 'Your village grows strong' }
  if (totalDays >= 7)   return { name: 'Outpost', icon: '🏕️', desc: 'A small camp takes shape' }
  return { name: 'Campsite', icon: '🔥', desc: 'Every empire starts here' }
}

// ─── Quest Difficulty Colors ───────────────────────────────────────────────────
export const QUEST_COLORS = {
  EASY:      { bg: 'bg-emerald-dim', text: 'text-emerald', border: 'border-emerald/30' },
  MEDIUM:    { bg: 'bg-crystal-dim', text: 'text-crystal',  border: 'border-crystal/30' },
  HARD:      { bg: 'bg-violet-dim',  text: 'text-violet',   border: 'border-violet/30'  },
  LEGENDARY: { bg: 'bg-gold/10',     text: 'text-gold',     border: 'border-gold/30'    },
}

export const RESOURCE_COLORS = {
  energy:  { bg: 'bg-gold/15',    text: 'text-gold',    icon: '⚡' },
  iron:    { bg: 'bg-iron/15',    text: 'text-iron',    icon: '🔩' },
  wood:    { bg: 'bg-wood/20',    text: 'text-wood',    icon: '🪵' },
  gold:    { bg: 'bg-amber/15',   text: 'text-amber',   icon: '✨' },
  stamina: { bg: 'bg-crystal/15', text: 'text-crystal', icon: '💎' },
}

// ─── Macro Health Check ───────────────────────────────────────────────────────
export function getMacroStatus(consumed, goal) {
  const pct = goal > 0 ? (consumed / goal) * 100 : 0
  if (pct >= 95 && pct <= 110) return 'perfect'
  if (pct >= 80)               return 'good'
  if (pct >= 50)               return 'partial'
  return 'low'
}

export const MACRO_STATUS_COLORS = {
  perfect: 'text-emerald',
  good:    'text-gold',
  partial: 'text-amber',
  low:     'text-text-muted',
}

// ─── Weight Trend Status ──────────────────────────────────────────────────────
// Colors a weight change according to the user's goal so "good" is goal-aware:
//   cut      → losing (delta < 0) is good
//   bulk     → gaining (delta > 0) is good
//   maintain → staying within a small band is good; drifting either way is a warning
// `delta` is (later weight − earlier weight) in kg; negative means weight went down.
export const MAINTAIN_BAND_KG = 1.5

export function getWeightTrend(delta, goalDirection = 'maintain') {
  if (delta == null || Number.isNaN(delta)) {
    return { color: 'text-text-muted', sense: 'none' }
  }
  const dir = goalDirection || 'maintain'

  if (dir === 'maintain') {
    if (Math.abs(delta) <= MAINTAIN_BAND_KG) return { color: 'text-emerald', sense: 'on-track' }
    return { color: 'text-amber', sense: 'drifting' }
  }

  const losing = delta < 0
  const gaining = delta > 0
  if (delta === 0) return { color: 'text-gold', sense: 'flat' }

  if (dir === 'cut') {
    return losing ? { color: 'text-emerald', sense: 'good' } : { color: 'text-rose', sense: 'bad' }
  }
  // bulk
  return gaining ? { color: 'text-emerald', sense: 'good' } : { color: 'text-rose', sense: 'bad' }
}

