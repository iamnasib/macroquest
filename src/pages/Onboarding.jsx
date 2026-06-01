import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { calculateTDEE } from '../lib/foodApi'
import { CHARACTERS, MODES } from '../lib/gameEngine'
import { ProgressBar, Input } from '../components/ui'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const STEPS = ['Body Stats', 'Set Goals', 'Choose Hero', 'Choose Mode']

export default function Onboarding() {
  const { user } = useAuthStore()
  const navigate  = useNavigate()
  const [step, setStep]   = useState(0)
  const [saving, setSaving] = useState(false)

  const [stats, setStats]   = useState({ weight: '', height: '', age: '', gender: 'male', activity: 'moderate' })
  const [goals, setGoals]   = useState({ calorieGoal: '', proteinGoal: '', mode: 'bulk' })
  const [tdee, setTdee]     = useState(null)
  const [character, setCharacter] = useState('warrior')
  const [gameMode, setGameMode]   = useState('EMPIRE')

  const setStat = (k, v) => setStats(s => ({ ...s, [k]: v }))
  const setGoal = (k, v) => setGoals(g => ({ ...g, [k]: v }))

  const calcTDEE = () => {
    if (!stats.weight || !stats.height || !stats.age) return
    const result = calculateTDEE({
      weight:        Number(stats.weight),
      height:        Number(stats.height),
      age:           Number(stats.age),
      gender:        stats.gender,
      activityLevel: stats.activity,
    })
    setTdee(result)
    setGoal('calorieGoal', result[goals.mode === 'bulk' ? 'bulkCalories' : goals.mode === 'cut' ? 'cutCalories' : 'maintainCalories'])
    setGoal('proteinGoal', result.proteinGoal)
  }

  const finish = async () => {
    if (!user) return
    setSaving(true)
    try {
      await Promise.all([
        supabase.from('profiles').update({
          calorie_goal:   Number(goals.calorieGoal),
          protein_goal:   Number(goals.proteinGoal),
          game_mode:      gameMode,
          weight:         Number(stats.weight),
          height:         Number(stats.height),
          age:            Number(stats.age),
          gender:         stats.gender,
          activity_level: stats.activity,
          onboarded:      true,
        }).eq('id', user.id),
        supabase.from('characters').update({
          character_type: character,
          avatar: CHARACTERS.find(c => c.id === character)?.icon || '⚔️',
        }).eq('user_id', user.id),
      ])
      toast.success('🐉 Your empire awaits, Champion!')
      navigate('/dashboard')
    } catch (err) {
      toast.error('Failed to save profile. ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-void grid-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg relative z-10">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((s, i) => (
              <span key={s} className={`text-xs font-ui ${i === step ? 'text-gold' : i < step ? 'text-emerald' : 'text-text-muted'}`}>
                {i < step ? '✓' : `${i + 1}.`} {s}
              </span>
            ))}
          </div>
          <ProgressBar value={step + 1} max={STEPS.length} color="gold" />
        </div>

        <div className="panel pixel-border-gold p-6">
          {/* Step 0: Body Stats */}
          {step === 0 && (
            <div className="space-y-4">
              <StepHeader icon="📊" title="Body Stats" sub="Used to calculate your TDEE and goals" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">Weight (kg)</label>
                  <Input placeholder="e.g. 70" value={stats.weight} onChange={e => setStat('weight', e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">Height (cm)</label>
                  <Input placeholder="e.g. 175" value={stats.height} onChange={e => setStat('height', e.target.value)} type="number" />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted font-ui mb-1 block">Age</label>
                <Input placeholder="e.g. 24" value={stats.age} onChange={e => setStat('age', e.target.value)} type="number" />
              </div>
              <div>
                <label className="text-xs text-text-muted font-ui mb-2 block">Gender</label>
                <div className="flex gap-2">
                  {['male', 'female'].map(g => (
                    <button key={g} onClick={() => setStat('gender', g)}
                      className={`flex-1 py-2 rounded border font-ui text-sm capitalize transition-all ${stats.gender === g ? 'border-gold bg-gold/10 text-gold' : 'border-border text-text-muted'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted font-ui mb-2 block">Activity Level</label>
                <div className="grid grid-cols-2 gap-2">
                  {ACTIVITY_LEVELS.map(a => (
                    <button key={a.id} onClick={() => setStat('activity', a.id)}
                      className={`py-2 px-3 rounded border font-ui text-xs text-left transition-all ${stats.activity === a.id ? 'border-gold bg-gold/10 text-gold' : 'border-border text-text-muted'}`}>
                      <p className="font-semibold">{a.label}</p>
                      <p className="opacity-70">{a.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Goals */}
          {step === 1 && (
            <div className="space-y-4">
              <StepHeader icon="🎯" title="Set Goals" sub="What is your primary objective?" />
              <div className="flex gap-2">
                {[{ id: 'bulk', label: '🏋️ Bulk', desc: '+300 cal' }, { id: 'cut', label: '⚔️ Cut', desc: '-400 cal' }, { id: 'maintain', label: '🛡️ Maintain', desc: 'TDEE' }].map(m => (
                  <button key={m.id} onClick={() => { setGoal('mode', m.id); if (tdee) setGoal('calorieGoal', tdee[m.id === 'bulk' ? 'bulkCalories' : m.id === 'cut' ? 'cutCalories' : 'maintainCalories']) }}
                    className={`flex-1 py-2 rounded border font-ui text-xs text-center transition-all ${goals.mode === m.id ? 'border-gold bg-gold/10 text-gold' : 'border-border text-text-muted'}`}>
                    <p>{m.label}</p>
                    <p className="opacity-70">{m.desc}</p>
                  </button>
                ))}
              </div>
              {!tdee && stats.weight && stats.height && stats.age && (
                <button onClick={calcTDEE} className="btn-ghost w-full text-sm">🔢 Calculate My TDEE</button>
              )}
              {tdee && (
                <div className="bg-abyss rounded-lg p-3 border border-gold/20">
                  <p className="text-xs text-gold font-ui mb-1">⚡ TDEE: {tdee.tdee} kcal/day</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-ui text-text-muted">
                    <div><p className="text-text">{tdee.bulkCalories}</p><p>Bulk</p></div>
                    <div><p className="text-text">{tdee.maintainCalories}</p><p>Maintain</p></div>
                    <div><p className="text-text">{tdee.cutCalories}</p><p>Cut</p></div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">⚡ Calorie Goal (EP)</label>
                  <Input type="number" value={goals.calorieGoal} onChange={e => setGoal('calorieGoal', e.target.value)} placeholder="2000" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">🔩 Protein Goal (g)</label>
                  <Input type="number" value={goals.proteinGoal} onChange={e => setGoal('proteinGoal', e.target.value)} placeholder="150" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Character */}
          {step === 2 && (
            <div className="space-y-4">
              <StepHeader icon="⚔️" title="Choose Your Hero" sub="Pick your champion class" />
              <div className="grid grid-cols-3 gap-3">
                {CHARACTERS.map(c => (
                  <button key={c.id} onClick={() => setCharacter(c.id)}
                    className={`p-3 rounded-lg border text-center transition-all ${character === c.id ? 'border-gold/60 bg-gold/10 shadow-glow-sm' : 'border-border hover:border-gold/30'}`}>
                    <div className="text-3xl mb-1">{c.icon}</div>
                    <p className="font-ui text-xs font-semibold text-text">{c.name}</p>
                    <p className="font-ui text-xs text-text-muted mt-0.5" style={{ fontSize: '0.6rem' }}>{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Game Mode */}
          {step === 3 && (
            <div className="space-y-4">
              <StepHeader icon="🌍" title="Choose Game Mode" sub="How do you want to play?" />
              <div className="space-y-3">
                {Object.values(MODES).map(mode => (
                  <button key={mode.id} onClick={() => setGameMode(mode.id)}
                    className={`w-full p-4 rounded-lg border text-left transition-all ${gameMode === mode.id ? 'border-gold/60 bg-gold/10' : 'border-border hover:border-gold/30'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{mode.icon}</span>
                      <div>
                        <p className="font-ui font-semibold text-sm text-text">{mode.name}</p>
                        <p className="font-ui text-xs text-text-muted">{mode.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="btn-ghost flex-1">← Back</button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} className="btn-primary flex-1">Next →</button>
            ) : (
              <button onClick={finish} disabled={saving} className="btn-primary flex-1">
                {saving ? '⚔️ Forging...' : '🐉 Begin Quest'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepHeader({ icon, title, sub }) {
  return (
    <div className="mb-2">
      <h2 className="font-pixel text-gold" style={{ fontSize: '0.7rem' }}>{icon} {title}</h2>
      <p className="text-text-muted font-ui text-sm mt-1">{sub}</p>
    </div>
  )
}

const ACTIVITY_LEVELS = [
  { id: 'sedentary',   label: 'Sedentary',   desc: 'Desk job, no gym' },
  { id: 'light',       label: 'Light',       desc: '1-2x gym/week'   },
  { id: 'moderate',    label: 'Moderate',    desc: '3-5x gym/week'   },
  { id: 'active',      label: 'Active',      desc: '6-7x gym/week'   },
  { id: 'very_active', label: 'Very Active', desc: 'Athlete / 2x/day'},
]
