import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, foodLogs, profiles, streaks, characters } from '../lib/supabase'
import { nutritionToResources, calculateDayXP, getLevelFromXP, generateDailyQuests } from '../lib/gameEngine'

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

      // Streaks
      streakData: { logging: 0, protein: 0, budget: 0 },

      // Character / XP
      totalXP: 0,
      levelData: { level: 1, currentXP: 0, xpNeeded: 100 },

      // UI
      xpPopups: [],
      loading: false,

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
          })
          await get().loadTodayLogs(userId)
        } catch (err) {
          console.error('Load profile error:', err)
          set({ loading: false })
        }
      },

      // ─── Load today's food logs ──────────────────────────────────────────
      loadTodayLogs: async (userId) => {
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

        const resources = nutritionToResources(totals)
        const profile = get().profile

        const quests = generateDailyQuests(
          { calorieGoal: profile?.calorie_goal || 2000, proteinGoal: profile?.protein_goal || 150 },
          { ...totals, mealsLogged: logs.length }
        )

        const newlyCompleted = quests.filter(q => q.completed && !get().completedQuestIds.includes(q.id))
        if (newlyCompleted.length > 0) {
          get().handleQuestCompletion(newlyCompleted)
        }

        set({
          todayLogs: logs,
          todayTotals: totals,
          todayResources: resources,
          quests,
        })
      },

      // ─── Add food log ────────────────────────────────────────────────────
      addFoodLog: async (userId, entry) => {
        const { data, error } = await foodLogs.add({ user_id: userId, ...entry })
        if (error) throw error
        await get().loadTodayLogs(userId)
        // Trigger mini XP for logging
        get().addXPPopup('+15 XP', 'food')
        return data
      },

      // ─── Remove food log ─────────────────────────────────────────────────
      removeFoodLog: async (userId, logId) => {
        const { error } = await foodLogs.remove(logId)
        if (error) throw error
        await get().loadTodayLogs(userId)
      },

      // ─── Quest completion handler ────────────────────────────────────────
      handleQuestCompletion: (completedQuests) => {
        const ids = completedQuests.map(q => q.id)
        const xpGained = completedQuests.reduce((sum, q) => sum + (q.reward?.xp || 0), 0)
        set(state => ({
          completedQuestIds: [...state.completedQuestIds, ...ids],
        }))
        if (xpGained > 0) {
          get().addXPPopup(`+${xpGained} XP`, 'quest')
        }
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
        completedQuestIds: [], streakData: { logging: 0, protein: 0, budget: 0 },
        totalXP: 0, levelData: { level: 1, currentXP: 0, xpNeeded: 100 },
      }),
    }),
    {
      name: 'macroquest-game',
      partialize: (state) => ({
        completedQuestIds: state.completedQuestIds,
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
