import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, foodLogs, profiles, streaks, characters, dailySummaries, questProgress } from '../lib/supabase'
import { nutritionToResources, getLevelFromXP, generateDailyQuests, getStreakBonus } from '../lib/gameEngine'

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
    supabase.auth.onAuthStateChange(async (event, session) => {
      // For new users confirming email, bootstrap their DB rows before
      // setting user state — prevents loadProfile racing against missing rows.
      if (event === 'SIGNED_IN' && session?.user) {
        const userId = session.user.id
        const { data: existing } = await supabase
          .from('profiles').select('id').eq('id', userId).single()
        if (!existing) {
          const username =
            session.user.user_metadata?.username ||
            session.user.email?.split('@')[0] ||
            'Champion'
          await Promise.all([
            supabase.from('profiles').insert({
              id: userId,
              username,
              calorie_goal: 2000,
              protein_goal: 150,
              game_mode: 'EMPIRE',
            }),
            supabase.from('characters').insert({
              user_id: userId,
              character_type: 'warrior',
              avatar: '⚔️',
              total_xp: 0,
              level: 1,
            }),
            supabase.from('streaks').insert({
              user_id: userId,
              logging: 0,
              protein: 0,
              budget: 0,
            }),
          ])
        }
      }
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

        // Sync quest completions from DB — ensures cross-device consistency.
        // If the user completed quests on another device, those IDs are merged
        // into the local set so XP is not awarded a second time here.
        const { data: dbProgress } = await questProgress.getToday(userId)
        if (dbProgress?.length > 0) {
          const dbIds = dbProgress.map(r => r.quest_id)
          const merged = [...new Set([...(get().completedQuestIds || []), ...dbIds])]
          set({ completedQuestIds: merged })
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

      // ─── Apply character class XP multiplier (Mage: +10%) ───────────────
      applyXPBonus: (baseXP) => {
        const charType = get().character?.character_type
        return charType === 'mage' ? Math.round(baseXP * 1.1) : baseXP
      },

      // ─── Add food log ────────────────────────────────────────────────────
      addFoodLog: async (userId, entry) => {
        const { data, error } = await foodLogs.add({ user_id: userId, ...entry })
        if (error) throw error

        // +15 XP for logging, boosted by Mage bonus
        const logXP = get().applyXPBonus(15)
        await characters.addXP(userId, logXP)

        // Update logging streak
        await get().updateStreak(userId)

        // Reload logs (which will also handle quest completion XP)
        await get().loadTodayLogs(userId)

        // Refresh character XP from DB so level display is accurate
        const { data: charData } = await characters.get(userId)
        if (charData) {
          set({ character: charData, totalXP: charData.total_xp, levelData: getLevelFromXP(charData.total_xp) })
        }

        get().addXPPopup(`+${logXP} XP`, 'food')
        return data
      },

      // ─── Remove food log ─────────────────────────────────────────────────
      removeFoodLog: async (userId, logId) => {
        const { error } = await foodLogs.remove(logId)
        if (error) throw error

        const logXP = get().applyXPBonus(15)

        // Optimistic update — reflect XP removal in store immediately so
        // the UI doesn't wait for the DB round-trip to confirm the change.
        const newTotalXP = Math.max(0, get().totalXP - logXP)
        set({ totalXP: newTotalXP, levelData: getLevelFromXP(newTotalXP) })

        await characters.addXP(userId, -logXP)
        await get().loadTodayLogs(userId)

        // Confirm from DB (reconciles any quest-related XP side-effects)
        const { data: charData } = await characters.get(userId)
        if (charData) {
          set({ character: charData, totalXP: charData.total_xp, levelData: getLevelFromXP(charData.total_xp) })
        }
      },

      // ─── Quest completion handler — persists XP and quest state to DB ───
      handleQuestCompletion: async (userId, completedQuests) => {
        const ids = completedQuests.map(q => q.id)
        const today = getTodayLocal()
        const baseXP = completedQuests.reduce((sum, q) => sum + (q.reward?.xp || 0), 0)
        const xpGained = get().applyXPBonus(baseXP)

        set(state => ({
          completedQuestIds: [...state.completedQuestIds, ...ids],
        }))

        // Persist completions to DB (fire-and-forget) for cross-device sync
        questProgress.upsert(
          ids.map(quest_id => ({
            user_id: userId,
            quest_id,
            quest_date: today,
            completed: true,
            completed_at: new Date().toISOString(),
          }))
        )

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

        // Grant milestone XP only when the streak hits exactly 3, 7, 14, or 30.
        // Samurai gets +15% on top of the base bonus.
        const bonus = getStreakBonus(newLogging)
        if (bonus.xp > 0 && [3, 7, 14, 30].includes(newLogging)) {
          const charType = get().character?.character_type
          const streakXP = charType === 'samurai' ? Math.round(bonus.xp * 1.15) : bonus.xp
          await characters.addXP(userId, streakXP)
          get().addXPPopup(`+${streakXP} XP ${bonus.label}`, 'streak')
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
        completedQuestIds: [], lastQuestDate: null,
        streakData: { logging: 0, protein: 0, budget: 0 },
        totalXP: 0, levelData: { level: 1, currentXP: 0, xpNeeded: 100 },
        profileLoaded: false,
      }),
    }),
    {
      name: 'macroquest-game',
      partialize: () => ({}),
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
