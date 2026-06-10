import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, foodLogs, profiles, streaks, characters, dailySummaries, questProgress, bodyMetrics } from '../lib/supabase'
import { nutritionToResources, getLevelFromXP, generateDailyQuests, getStreakBonus, modeFromGoalDirection } from '../lib/gameEngine'

function getTodayLocal() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
}

// Serializes daily_summaries writes so overlapping loadTodayLogs calls can't
// land out of order at the DB and persist a stale xp_earned snapshot.
let summaryWriteChain = Promise.resolve()

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
      todayXP: 0,
      levelData: { level: 1, currentXP: 0, xpNeeded: 100 },

      // Body metrics
      weightHistory: [],
      todayWeight: null,

      // UI
      xpPopups: [],
      loading: false,
      profileLoaded: false,
      loadVersion: 0,

      // ─── Load user data ─────────────────────────────────────────────────
      loadProfile: async (userId) => {
        set({ loading: true })
        try {
          const [profileRes, charRes, streakRes, metricsRes] = await Promise.all([
            profiles.get(userId),
            characters.get(userId),
            streaks.get(userId),
            bodyMetrics.getHistory(userId, 90),
          ])
          const profile = profileRes.data
          const character = charRes.data
          const streakData = streakRes.data
          const history = metricsRes.data || []
          const today = getTodayLocal()
          const todayEntry = history.find(e => e.date === today)

          const levelData = getLevelFromXP(character?.total_xp || 0)

          set({
            profile,
            character,
            streakData: streakData || { logging: 0, protein: 0, budget: 0 },
            totalXP: character?.total_xp || 0,
            levelData,
            weightHistory: history,
            todayWeight: todayEntry?.weight_kg ?? null,
            loading: false,
            profileLoaded: true,
          })

          // Keep the user's timezone fresh so scheduled reminders fire at the
          // correct LOCAL hour. Fire-and-forget — never block profile load.
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
            if (tz && profile && profile.timezone !== tz) {
              profiles.update(userId, { timezone: tz })
                .then(() => set(state => ({ profile: { ...state.profile, timezone: tz } })))
                .catch(() => {})
            }
          } catch { /* Intl unavailable — leave timezone as-is */ }

          await get().loadTodayLogs(userId, { grantXP: false })
        } catch (err) {
          console.error('Load profile error:', err)
          set({ loading: false })
        }
      },

      // ─── Load today's food logs ──────────────────────────────────────────
      // grantXP:true  → award quest XP if quests newly complete (user action)
      // grantXP:false → update display/tracking only, no XP granted (page load)
      loadTodayLogs: async (userId, { grantXP = true } = {}) => {
        // Version stamp — if a newer call starts while we're fetching, our
        // results are stale. We check before applying state to prevent a
        // slow call from overwriting a faster, more recent one.
        const myVersion = (get().loadVersion || 0) + 1
        set({ loadVersion: myVersion })

        const today = getTodayLocal()

        // Fetch BEFORE mutating any state, so a stale concurrent call can be
        // discarded without having left partial writes behind.
        const [{ data: dbProgress }, { data, error }] = await Promise.all([
          questProgress.getToday(userId),
          foodLogs.getToday(userId),
        ])
        if (error) return
        if (get().loadVersion !== myVersion) return // a newer call superseded us

        // Reset daily tracking at the start of a new calendar day
        if (get().lastQuestDate !== today) {
          set({ completedQuestIds: [], lastQuestDate: today, todayXP: 0 })
        }

        // Sync quest completions from DB — cross-device consistency
        if (dbProgress?.length > 0) {
          const dbIds = dbProgress.map(r => r.quest_id)
          const merged = [...new Set([...(get().completedQuestIds || []), ...dbIds])]
          set({ completedQuestIds: merged })
        }

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
          if (grantXP) {
            await get().handleQuestCompletion(userId, newlyCompleted)
          } else {
            // Track in memory so we don't re-check next time, but don't grant XP
            const ids = newlyCompleted.map(q => q.id)
            set(state => ({
              completedQuestIds: [...new Set([...state.completedQuestIds, ...ids])],
            }))
          }
        }

        // Discard results if a newer loadTodayLogs call has already started
        if (get().loadVersion !== myVersion) return

        set({
          todayLogs: logs,
          todayTotals: totals,
          todayResources: resources,
          quests,
        })

        // Persist daily snapshot for weekly summaries. Snapshot the payload NOW
        // and chain the write so two overlapping calls can't land out of order
        // and persist a stale xp_earned.
        const summaryPayload = {
          total_calories:   totals.calories,
          total_protein:    totals.protein,
          total_carbs:      totals.carbs,
          total_fat:        totals.fat,
          quests_completed: quests.filter(q => q.completed).length,
          xp_earned:        get().todayXP,
        }
        summaryWriteChain = summaryWriteChain
          .then(() => dailySummaries.upsert(userId, today, summaryPayload))
          .then(({ error }) => {
            if (error) console.error('daily_summaries upsert failed:', error)
          })
          .catch(err => console.error('daily_summaries upsert failed:', err))
      },

      // ─── Refresh character/XP/level from DB (single source of truth) ────
      refreshCharacter: async (userId) => {
        const { data: charData } = await characters.get(userId)
        if (charData) {
          set({ character: charData, totalXP: charData.total_xp, levelData: getLevelFromXP(charData.total_xp) })
        }
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

        // XP grant and streak update are independent — run in parallel to reduce
        // cold-start latency (saves ~400–800ms on the first DB call after refresh)
        await Promise.all([
          characters.addXP(userId, logXP),
          get().updateStreak(userId),
        ])
        set(state => ({ todayXP: state.todayXP + logXP }))

        // Show food XP popup first, before quest XP popup fires inside loadTodayLogs
        get().addXPPopup(`+${logXP} XP`, 'food')

        // Reload logs (which will also handle quest completion XP)
        await get().loadTodayLogs(userId)

        // Refresh character XP from DB so level display is accurate
        await get().refreshCharacter(userId)
        return data
      },

      // ─── Repeat yesterday's meals (one-tap bulk re-log) ──────────────────
      repeatYesterday: async (userId) => {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toLocaleDateString('en-CA')

        const { data: yLogs, error: fetchErr } = await foodLogs.getByDate(userId, yesterdayStr)
        if (fetchErr) throw fetchErr
        if (!yLogs?.length) return 0

        const today = getTodayLocal()
        const copies = yLogs.map(l => ({
          user_id: userId,
          food_name: l.food_name,
          brand: l.brand,
          serving_size: l.serving_size,
          meal_type: l.meal_type,
          log_date: today,
          calories: l.calories,
          protein: l.protein,
          carbs: l.carbs,
          fat: l.fat,
          fiber: l.fiber,
        }))

        const { error } = await foodLogs.addMany(copies)
        if (error) throw error

        // Same XP as logging each food individually, in one grant
        const logXP = get().applyXPBonus(15) * copies.length
        await Promise.all([
          characters.addXP(userId, logXP),
          get().updateStreak(userId),
        ])
        set(state => ({ todayXP: state.todayXP + logXP }))
        get().addXPPopup(`+${logXP} XP`, 'food')

        await get().loadTodayLogs(userId)
        await get().refreshCharacter(userId)
        return copies.length
      },

      // ─── Remove food log ─────────────────────────────────────────────────
      removeFoodLog: async (userId, logId) => {
        // Snapshot which quests were complete before this removal
        const questsBefore = get().quests.filter(q => q.completed)

        const { error } = await foodLogs.remove(logId)
        if (error) throw error

        // Reverse the 15 XP that was granted when this food was logged
        const logXP = get().applyXPBonus(15)
        await characters.addXP(userId, -logXP)
        set(state => ({ todayXP: Math.max(0, state.todayXP - logXP) }))

        // Reload quest/log state without granting XP
        await get().loadTodayLogs(userId, { grantXP: false })

        // Check which quests this removal just un-completed
        const questsAfter = get().quests
        const uncompletedQuests = questsBefore.filter(qb =>
          !questsAfter.find(qa => qa.id === qb.id && qa.completed)
        )

        if (uncompletedQuests.length > 0) {
          const baseXP = uncompletedQuests.reduce((sum, q) => sum + (q.reward?.xp || 0), 0)
          const xpToRemove = get().applyXPBonus(baseXP)
          const ids = uncompletedQuests.map(q => q.id)

          // Remove from in-memory tracking
          set(state => ({
            completedQuestIds: state.completedQuestIds.filter(id => !ids.includes(id)),
          }))

          // Remove from DB
          await questProgress.deleteForDate(userId, ids, getTodayLocal())

          // Reverse the quest XP
          if (xpToRemove > 0) {
            await characters.addXP(userId, -xpToRemove)
            set(state => ({ todayXP: Math.max(0, state.todayXP - xpToRemove) }))
          }
        }

        // If that was today's last log, today's streak credit must be revoked
        // — otherwise log+delete keeps a streak alive without tracking food.
        if (get().todayLogs.length === 0) {
          await get().revertTodayStreak(userId)
        }

        // Confirm final XP from DB
        await get().refreshCharacter(userId)
      },

      // ─── Revert today's streak credit (all of today's logs deleted) ─────
      revertTodayStreak: async (userId) => {
        const today = getTodayLocal()
        const { data: streakRow } = await streaks.get(userId)
        if (!streakRow || streakRow.last_log_date !== today) return

        const prevLogging = streakRow.logging || 0
        const newLogging = Math.max(0, prevLogging - 1)

        // Roll last_log_date back to the most recent earlier log day so the
        // next add re-derives the streak correctly (consecutive vs broken).
        const { data: prevRow } = await foodLogs.getLastLogDateBefore(userId, today)
        await streaks.upsert(userId, {
          logging: newLogging,
          last_log_date: prevRow?.log_date ?? null,
          updated_at: new Date().toISOString(),
        })
        set(state => ({ streakData: { ...state.streakData, logging: newLogging } }))

        // If today's credit was the milestone grant, take that XP back too
        const bonus = getStreakBonus(prevLogging)
        if (bonus.xp > 0 && [3, 7, 14, 30].includes(prevLogging)) {
          const charType = get().character?.character_type
          const streakXP = charType === 'samurai' ? Math.round(bonus.xp * 1.15) : bonus.xp
          await characters.addXP(userId, -streakXP)
        }
      },

      // ─── Edit food log (today only) — updates nutrition + cascades XP ───
      editFoodLog: async (userId, logId, { serving_size, meal_type, calories, protein, carbs, fat, fiber }) => {
        const questsBefore = get().quests.filter(q => q.completed)

        const { error } = await foodLogs.update(logId, {
          serving_size, meal_type, calories, protein, carbs, fat, fiber,
        })
        if (error) throw error

        await get().loadTodayLogs(userId, { grantXP: true })

        // Check which quests this edit just un-completed
        const questsAfter = get().quests
        const uncompletedQuests = questsBefore.filter(qb =>
          !questsAfter.find(qa => qa.id === qb.id && qa.completed)
        )

        if (uncompletedQuests.length > 0) {
          const baseXP = uncompletedQuests.reduce((sum, q) => sum + (q.reward?.xp || 0), 0)
          const xpToRemove = get().applyXPBonus(baseXP)
          const ids = uncompletedQuests.map(q => q.id)

          set(state => ({
            completedQuestIds: state.completedQuestIds.filter(id => !ids.includes(id)),
          }))
          await questProgress.deleteForDate(userId, ids, getTodayLocal())

          if (xpToRemove > 0) {
            await characters.addXP(userId, -xpToRemove)
            set(state => ({ todayXP: Math.max(0, state.todayXP - xpToRemove) }))
          }
        }

        await get().refreshCharacter(userId)
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

        // Persist completions to DB — awaited so refresh can't double-grant
        await questProgress.upsert(
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
          set(state => ({ todayXP: state.todayXP + xpGained }))
          get().addXPPopup(`+${xpGained} XP`, 'quest')

          // Refresh character state from DB
          await get().refreshCharacter(userId)
        }
      },

      // ─── Body metric actions ─────────────────────────────────────────────
      loadWeightHistory: async (userId) => {
        const { data } = await bodyMetrics.getHistory(userId, 90)
        const history = data || []
        const today = getTodayLocal()
        const todayEntry = history.find(e => e.date === today)
        set({ weightHistory: history, todayWeight: todayEntry?.weight_kg ?? null })
      },

      logWeight: async (userId, weightKg) => {
        const today = getTodayLocal()
        const { error } = await bodyMetrics.upsert(userId, today, weightKg)
        if (error) throw error
        await get().loadWeightHistory(userId)
      },

      deleteWeight: async (userId, date) => {
        const { error } = await bodyMetrics.remove(userId, date)
        if (error) throw error
        await get().loadWeightHistory(userId)
      },

      setGoalDirection: async (userId, direction) => {
        const prev = get().profile
        const gameMode = modeFromGoalDirection(direction).id
        set({ profile: { ...prev, goal_direction: direction, game_mode: gameMode } })
        const { error } = await profiles.update(userId, { goal_direction: direction, game_mode: gameMode })
        if (error) {
          set({ profile: prev })
          throw error
        }
      },

      // ─── Notification / email preferences ────────────────────────────────
      updateNotificationPrefs: async (userId, patch) => {
        const prev = get().profile
        set({ profile: { ...prev, ...patch } }) // optimistic
        const { error } = await profiles.update(userId, patch)
        if (error) {
          set({ profile: prev }) // revert on failure
          throw error
        }
      },

      // ─── Update logging streak ───────────────────────────────────────────
      // In-flight guard: this is a read-modify-write on the streaks row, so two
      // rapid food logs racing here could double-increment and double-grant
      // milestone XP. Concurrent calls are same-day duplicates — safe to skip.
      _streakUpdating: false,
      updateStreak: async (userId) => {
        if (get()._streakUpdating) return
        set({ _streakUpdating: true })
        try {
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

          let shieldUsedAt = streakRow?.shield_used_at ?? null

          if (lastDate === yesterdayStr) {
            newLogging += 1  // consecutive day
          } else if (!lastDate || lastDate < yesterdayStr) {
            // Streak broken — Streak Shield can bridge EXACTLY ONE missed day,
            // for streaks of 3+, at most once every 30 days.
            const dayBefore = new Date()
            dayBefore.setDate(dayBefore.getDate() - 2)
            const dayBeforeStr = dayBefore.toLocaleDateString('en-CA')
            const thirtyAgo = new Date()
            thirtyAgo.setDate(thirtyAgo.getDate() - 30)
            const shieldReady = !shieldUsedAt || shieldUsedAt <= thirtyAgo.toLocaleDateString('en-CA')

            if (lastDate === dayBeforeStr && newLogging >= 3 && shieldReady) {
              newLogging += 1
              shieldUsedAt = today
              get().addXPPopup('🛡️ Streak Shield saved your streak!', 'streak')
            } else {
              newLogging = 1   // streak broken or first log ever
            }
          }

          await streaks.upsert(userId, {
            logging: newLogging,
            last_log_date: today,
            shield_used_at: shieldUsedAt,
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
        } finally {
          set({ _streakUpdating: false })
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
        totalXP: 0, todayXP: 0, levelData: { level: 1, currentXP: 0, xpNeeded: 100 },
        weightHistory: [], todayWeight: null,
        profileLoaded: false, loadVersion: 0,
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
