import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, foodLogs, profiles, streaks, characters, dailySummaries } from '../lib/supabase'
import { nutritionToResources, calculateDayXP, getLevelFromXP, generateDailyQuests, getStreakBonus } from '../lib/gameEngine'

function getTodayLocal() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
}

// ─── Auth Store ───────────────────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false })
    supabase.auth.onAuthStateChange((_, session) => {
      set({ session, user: session?.user ?? null })
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
    useGameStore.getState().reset()
  },
}))

// ─── Game Store ───────────────────────────────────────────────────────────────
export const useGameStore = create(
  persist(
    (set, get) => ({
      // Profile
      profile: null,
      character: null,

      // Daily state
      todayLogs: [],
      todayTotals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      todayResources: { energy: 0, iron: 0, wood: 0, gold: 0, stamina: 0 },

      // Quests
      quests: [],
      completedQuestIds: [],
      lastQuestDate: null,

      // Streaks
      streakData: { logging: 0, protein: 0, budget: 0 },

      // Character / XP
      totalXP: 0,
      levelData: { level: 1, currentXP: 0, xpNeeded: 100 },

      // UI
      xpPopups: [],
      loading: false,
      profileLoaded: false,

      // ─── Load user data ─────────────────────────────────────────────────
      loadProfile: async (userId) => {
        set({ loading: true })
        try {
          const [profileRes, charRes, streakRes] = await Promise.all([
            profiles.get(userId),
            characters.get(userId),
            streaks.get(userId),
          ])
          const profile = profileRes.data
          const character = charRes.data
          const streakData = streakRes.data

          const levelData = getLevelFromXP(character?.total_xp || 0)

          set({
            profile,
            character,
            streakData: streakData || { logging: 0, protein: 0, budget: 0 },
            totalXP: character?.total_xp || 0,
            levelData,
            loading: false,
            profileLoaded: true,
          })
          await get().loadTodayLogs(userId)
        } catch (err) {
          console.error('Load profile error:', err)
          set({ loading: false })
        }
      },

      // ─── Load today's food logs ──────────────────────────────────────────
      loadTodayLogs: async (userId) => {
        const today = getTodayLocal()

        // Reset completed quest IDs at the start of a new calendar day
        if (get().lastQuestDate !== today) {
          set({ completedQuestIds: [], lastQuestDate: today })
        }

        const { data, error } = await foodLogs.getToday(userId)
        if (error) return

        const logs = data || []
        const totals = logs.reduce((acc, log) => ({
          calories: acc.calories + (log.calories || 0),
          protein:  acc.protein  + (log.protein  || 0),
          carbs:    acc.carbs    + (log.carbs     || 0),
          fat:      acc.fat      + (log.fat       || 0),
          fiber:    acc.fiber    + (log.fiber      || 0),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })

        const resources = nutritionToResources(totals, get().character?.character_type)
        const profile = get().profile

        const quests = generateDailyQuests(
          { calorieGoal: profile?.calorie_goal || 2000, proteinGoal: profile?.protein_goal || 150 },
          { ...totals, mealsLogged: logs.length }
        )

        const newlyCompleted = quests.filter(q => q.completed && !get().completedQuestIds.includes(q.id))
        if (newlyCompleted.length > 0) {
          await get().handleQuestCompletion(userId, newlyCompleted)
        }

        set({
          todayLogs: logs,
          todayTotals: totals,
          todayResources: resources,
          quests,
        })

        // Persist daily snapshot for weekly summaries (fire-and-forget)
        const completedCount = quests.filter(q => q.completed).length
        dailySummaries.upsert(userId, today, {
          total_calories:   totals.calories,
          total_protein:    totals.protein,
          total_carbs:      totals.carbs,
          total_fat:        totals.fat,
          quests_completed: completedCount,
        })
      },

      // ─── Add food log ────────────────────────────────────────────────────
      addFoodLog: async (userId, entry) => {
        const { data, error } = await foodLogs.add({ user_id: userId, ...entry })
        if (error) throw error

        // Save +15 XP for logging a meal
        await characters.addXP(userId, 15)

        // Update logging streak
        await get().updateStreak(userId)

        // Reload logs (which will also handle quest completion XP)
        await get().loadTodayLogs(userId)

        // Refresh character XP from DB so level display is accurate
        const { data: charData } = await characters.get(userId)
        if (charData) {
          set({ character: charData, totalXP: charData.total_xp, levelData: getLevelFromXP(charData.total_xp) })
        }

        get().addXPPopup('+15 XP', 'food')
        return data
      },

      // ─── Remove food log ─────────────────────────────────────────────────
      removeFoodLog: async (userId, logId) => {
        const { error } = await foodLogs.remove(logId)
        if (error) throw error

        // Reverse the +15 XP that was granted when this meal was logged (clamped at 0 in DB)
        await characters.addXP(userId, -15)
        await get().loadTodayLogs(userId)

        const { data: charData } = await characters.get(userId)
        if (charData) {
          set({ character: charData, totalXP: charData.total_xp, levelData: getLevelFromXP(charData.total_xp) })
        }
      },

      // ─── Quest completion handler — persists XP to DB ────────────────────
      handleQuestCompletion: async (userId, completedQuests) => {
        const ids = completedQuests.map(q => q.id)
        const xpGained = completedQuests.reduce((sum, q) => sum + (q.reward?.xp || 0), 0)

        set(state => ({
          completedQuestIds: [...state.completedQuestIds, ...ids],
        }))

        if (xpGained > 0) {
          await characters.addXP(userId, xpGained)
          get().addXPPopup(`+${xpGained} XP`, 'quest')

          // Refresh character state from DB
          const { data: charData } = await characters.get(userId)
          if (charData) {
            set({ character: charData, totalXP: charData.total_xp, levelData: getLevelFromXP(charData.total_xp) })
          }
        }
      },

      // ─── Update logging streak ───────────────────────────────────────────
      updateStreak: async (userId) => {
        const today = getTodayLocal()
        const current = get().streakData || { logging: 0, protein: 0, budget: 0 }
        const { data: streakRow } = await streaks.get(userId)

        const lastDate = streakRow?.last_log_date
        let newLogging = streakRow?.logging || 0

        if (lastDate === today) {
          // Already logged today — no change
          return
        }

        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toLocaleDateString('en-CA')

        if (lastDate === yesterdayStr) {
          newLogging += 1  // consecutive day
        } else if (!lastDate || lastDate < yesterdayStr) {
          newLogging = 1   // streak broken or first log ever
        }

        await streaks.upsert(userId, {
          logging: newLogging,
          last_log_date: today,
          updated_at: new Date().toISOString(),
        })

        set({ streakData: { ...current, logging: newLogging } })
      },

      // ─── XP Popup system ─────────────────────────────────────────────────
      addXPPopup: (text, type) => {
        const id = Date.now()
        set(state => ({ xpPopups: [...state.xpPopups, { id, text, type }] }))
        setTimeout(() => {
          set(state => ({ xpPopups: state.xpPopups.filter(p => p.id !== id) }))
        }, 2000)
      },

      // ─── Reset ───────────────────────────────────────────────────────────
      reset: () => set({
        profile: null, character: null, todayLogs: [], quests: [],
        completedQuestIds: [], lastQuestDate: null,
        streakData: { logging: 0, protein: 0, budget: 0 },
        totalXP: 0, levelData: { level: 1, currentXP: 0, xpNeeded: 100 },
        profileLoaded: false,
      }),
    }),
    {
      name: 'macroquest-game',
      partialize: (state) => ({
        completedQuestIds: state.completedQuestIds,
        lastQuestDate: state.lastQuestDate,
      }),
    }
  )
)

// ─── UI Store ─────────────────────────────────────────────────────────────────
export const useUIStore = create((set) => ({
  sidebarOpen: false,
  activeTab: 'dashboard',
  foodSearchOpen: false,
  ariaOpen: false,

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setActiveTab:   (v) => set({ activeTab: v }),
  setFoodSearchOpen: (v) => set({ foodSearchOpen: v }),
  setAriaOpen:    (v) => set({ ariaOpen: v }),
}))
