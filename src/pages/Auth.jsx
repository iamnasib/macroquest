import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { auth } from '../lib/supabase'
import { Input, Divider, Spinner } from '../components/ui'
import toast from 'react-hot-toast'

export default function Auth() {
  const { user } = useAuthStore()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [form, setForm] = useState({ email: '', password: '', username: '' })
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.email || !form.password) return toast.error('Fill in all fields.')
    if (mode === 'signup' && !form.username) return toast.error('Enter a username.')
    setLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await auth.signIn(form.email, form.password)
        if (error) throw error
        toast.success('⚔️ Welcome back, Champion!')
      } else {
        const { data, error } = await auth.signUp(form.email, form.password, form.username)
        if (error) throw error
        if (data.user?.identities?.length === 0) throw new Error('Email already in use. Sign in instead.')
        // Bootstrap (profile/character/streaks) happens in onAuthStateChange
        // after email confirmation, using username stored in user_metadata
        toast.success('🐉 Your quest begins! Check email to verify.')
      }
    } catch (err) {
      toast.error(err.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-void grid-bg flex items-center justify-center p-4">
      <div className="scanline-overlay fixed inset-0 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4 animate-float inline-block">⚔️</div>
          <h1 className="font-pixel text-gold glow-text-gold block" style={{ fontSize: '1.1rem' }}>
            MacroQuest
          </h1>
          <p className="text-text-muted font-ui mt-2">Level Up Your Nutrition</p>
        </div>

        {/* Card */}
        <div className="panel pixel-border-gold p-6">
          {/* Toggle */}
          <div className="flex bg-abyss rounded-lg p-1 mb-6">
            {['signin', 'signup'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded text-sm font-ui font-semibold transition-all ${
                  mode === m ? 'bg-gold text-void' : 'text-text-muted hover:text-text'
                }`}
              >
                {m === 'signin' ? '⚔️ Sign In' : '🐉 New Hero'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {mode === 'signup' && (
              <Input
                placeholder="Your hero name (username)"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                icon="⚔️"
              />
            )}
            <Input
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              icon="📧"
            />
            <Input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              icon="🔒"
            />

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary w-full justify-center flex items-center gap-2"
            >
              {loading
                ? <><Spinner size="sm" /> <span>Entering realm...</span></>
                : mode === 'signin'
                  ? '⚡ Enter the Realm'
                  : '🐉 Begin Your Quest'
              }
            </button>
          </div>

          {mode === 'signup' && (
            <>
              <Divider label="YOUR JOURNEY INCLUDES" className="my-5" />
              <div className="grid grid-cols-2 gap-2">
                {FEATURES.map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs font-ui text-text-muted">
                    <span className="text-emerald">✓</span> {f}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <p className="text-center text-text-muted font-ui text-xs mt-4">
          {mode === 'signin' ? "No account? " : "Have an account? "}
          <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-gold hover:underline">
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}


const FEATURES = [
  'Daily quests & XP', 'Resource system', 'ARIA AI guide',
  'Streak tracking', 'Character levels', 'World building',
]
