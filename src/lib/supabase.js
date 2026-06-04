import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase env vars missing. Check your .env file.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
export const auth = {
  signUp: (email, password, username) =>
    supabase.auth.signUp({ email, password, options: { data: { username } } }),
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signOut: () => supabase.auth.signOut(),
  getUser: () => supabase.auth.getUser(),
  onAuthChange: (cb) => supabase.auth.onAuthStateChange(cb),
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export const profiles = {
  get: (userId) =>
    supabase.from('profiles').select('*').eq('id', userId).single(),

  create: (userId, data) =>
    supabase.from('profiles').insert({ id: userId, ...data }),

  update: (userId, data) =>
    supabase.from('profiles').update(data).eq('id', userId),
}

// ─── Food Logs ────────────────────────────────────────────────────────────────
export const foodLogs = {
  getToday: (userId) => {
    const today = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
    return supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', today)
      .order('created_at', { ascending: true })
  },

  getByDate: (userId, date) =>
    supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', date)
      .order('created_at', { ascending: true }),

  add: (entry) => supabase.from('food_logs').insert(entry).select().single(),

  update: (id, data) => supabase.from('food_logs').update(data).eq('id', id).select().single(),

  remove: (id) => supabase.from('food_logs').delete().eq('id', id),

  getDailySummary: (userId, date) =>
    supabase.rpc('get_daily_summary', { p_user_id: userId, p_date: date }),
}

// ─── Streaks ──────────────────────────────────────────────────────────────────
export const streaks = {
  get: (userId) =>
    supabase.from('streaks').select('*').eq('user_id', userId).single(),

  upsert: (userId, data) =>
    supabase.from('streaks').upsert({ user_id: userId, ...data }, { onConflict: 'user_id' }),
}

// ─── Quest Progress ───────────────────────────────────────────────────────────
export const questProgress = {
  getToday: (userId) => {
    const today = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
    return supabase
      .from('quest_progress')
      .select('quest_id')
      .eq('user_id', userId)
      .eq('quest_date', today)
      .eq('completed', true)
  },

  upsert: (records) =>
    supabase
      .from('quest_progress')
      .upsert(records, { onConflict: 'user_id,quest_id,quest_date' }),

  deleteForDate: (userId, questIds, date) =>
    supabase
      .from('quest_progress')
      .delete()
      .eq('user_id', userId)
      .eq('quest_date', date)
      .in('quest_id', questIds),
}

// ─── Daily Summaries ─────────────────────────────────────────────────────────
export const dailySummaries = {
  upsert: (userId, date, data) =>
    supabase.from('daily_summaries').upsert(
      { user_id: userId, summary_date: date, ...data },
      { onConflict: 'user_id,summary_date' }
    ),

  getWeekly: (userId) => {
    const now = new Date()
    const today = now.toLocaleDateString('en-CA')
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toLocaleDateString('en-CA')
    return supabase
      .from('daily_summaries')
      .select('summary_date,total_calories,total_protein,quests_completed,xp_earned')
      .eq('user_id', userId)
      .gte('summary_date', sevenDaysAgo)
      .lte('summary_date', today)
      .order('summary_date', { ascending: true })
  },
}

// ─── Character / XP ───────────────────────────────────────────────────────────
export const characters = {
  get: (userId) =>
    supabase.from('characters').select('*').eq('user_id', userId).single(),

  update: (userId, data) =>
    supabase.from('characters').update(data).eq('user_id', userId),

  addXP: (userId, xp) =>
    supabase.rpc('add_xp', { p_user_id: userId, p_xp: xp }),
}
