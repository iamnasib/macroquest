import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, useGameStore } from '../store'
import { calculateTDEE } from '../lib/foodApi'
import { CHARACTERS, MODES, modeFromGoalDirection } from '../lib/gameEngine'
import { Input } from '../components/ui'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const STEPS = ['Body Stats', 'Battle Conditions', 'Set Goals', 'Choose Hero']

const HEALTH_CONDITIONS = [
  { id: 'diabetes',            icon: '🩸', name: 'Diabetes / Pre-diabetes', desc: 'Lower carb targets applied'        },
  { id: 'pcos',                icon: '💫', name: 'PCOS',                     desc: 'Reduced carbs, higher protein'     },
  { id: 'hypertension',        icon: '🫀', name: 'Hypertension',             desc: 'Higher fiber focus recommended'    },
  { id: 'high_cholesterol',    icon: '🌊', name: 'High Cholesterol',          desc: 'Lower fat goal applied'            },
  { id: 'hypothyroidism',      icon: '🦋', name: 'Hypothyroidism',            desc: 'TDEE adjusted −5%'                },
  { id: 'kidney_disease',      icon: '⚠️', name: 'Kidney Disease',            desc: 'Protein capped at 0.8g/kg'        },
  { id: 'gluten_intolerance',  icon: '🌾', name: 'Gluten Intolerance',        desc: 'Saved for food filtering'          },
  { id: 'lactose_intolerance', icon: '🥛', name: 'Lactose Intolerance',       desc: 'Saved for food filtering'          },
]

const DIET_TYPES = [
  { id: 'omnivore',   icon: '🍖', label: 'Omnivore',   desc: 'Eats everything'            },
  { id: 'vegetarian', icon: '🥗', label: 'Vegetarian', desc: 'No meat, allows dairy/eggs' },
  { id: 'vegan',      icon: '🌱', label: 'Vegan',      desc: 'Plant-based only'            },
]

const ACTIVITY_LEVELS = [
  { id: 'sedentary',   label: 'Sedentary',   desc: 'Little to no movement'    },
  { id: 'light',       label: 'Light',       desc: 'Light activity 1-2x/week' },
  { id: 'moderate',    label: 'Moderate',    desc: 'Active 3-5x/week'         },
  { id: 'active',      label: 'Active',      desc: 'Intense training daily'   },
  { id: 'very_active', label: 'Very Active', desc: 'Athlete-level, 2x/day'   },
]

export default function Onboarding() {
  const { user } = useAuthStore()
  const { profile, character: charData, profileLoaded, loadProfile } = useGameStore()
  const navigate  = useNavigate()
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)

  const [stats, setStats] = useState({
    weight: '', height: '', age: '', gender: 'male', activity: 'moderate', bodyFatPct: '',
  })
  const [healthConditions, setHealthConditions] = useState([])
  const [dietType, setDietType] = useState('omnivore')
  const [goals, setGoals] = useState({
    calorieGoal: '', proteinGoal: '', carbGoal: '', fatGoal: '', mode: 'bulk',
  })
  const [tdee, setTdee]         = useState(null)
  const [character, setCharacter] = useState('warrior')

  // Pre-fill when editing an existing profile
  useEffect(() => {
    if (!profileLoaded || !profile?.onboarded) return
    setStats({
      weight:     profile.weight         || '',
      height:     profile.height         || '',
      age:        profile.age            || '',
      gender:     profile.gender         || 'male',
      activity:   profile.activity_level || 'moderate',
      bodyFatPct: profile.body_fat_pct   || '',
    })
    setGoals({
      calorieGoal: profile.calorie_goal || '',
      proteinGoal: profile.protein_goal || '',
      carbGoal:    profile.carb_goal    || '',
      fatGoal:     profile.fat_goal     || '',
      mode: profile.goal_direction || 'maintain',
    })
    setHealthConditions(profile.health_conditions || [])
    setDietType(profile.diet_type || 'omnivore')
    setCharacter(charData?.character_type || 'warrior')
  }, [profileLoaded])

  const setStat = (k, v) => setStats(s => ({ ...s, [k]: v }))
  const setGoal = (k, v) => setGoals(g => ({ ...g, [k]: v }))

  const toggleCondition = (id) =>
    setHealthConditions(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )

  const calcTDEE = () => {
    if (!stats.weight || !stats.height || !stats.age) return
    const result = calculateTDEE({
      weight:           Number(stats.weight),
      height:           Number(stats.height),
      age:              Number(stats.age),
      gender:           stats.gender,
      activityLevel:    stats.activity,
      bodyFatPct:       stats.bodyFatPct ? Number(stats.bodyFatPct) : null,
      healthConditions,
      dietType,
    })
    setTdee(result)
    const mode = goals.mode
    const cal = result[mode === 'bulk' ? 'bulkCalories' : mode === 'cut' ? 'cutCalories' : 'maintainCalories']
    setGoals(g => ({
      ...g,
      calorieGoal: cal,
      proteinGoal: result.proteinGoal,
      carbGoal:    result.carbGoal,
      fatGoal:     result.fatGoal,
    }))
  }

  const handleNext = () => {
    if (step === 0) {
      if (!stats.weight || !stats.height || !stats.age)
        return toast.error('Please fill in your weight, height, and age.')
      if (Number(stats.weight) <= 0 || Number(stats.height) <= 0 || Number(stats.age) <= 0)
        return toast.error('Please enter valid body stats.')
    }
    if (step === 2) {
      if (!goals.calorieGoal || !goals.proteinGoal ||
          Number(goals.calorieGoal) <= 0 || Number(goals.proteinGoal) <= 0)
        return toast.error('Please set your calorie and protein goals before continuing.')
    }
    // Auto-calculate on first entry into Goals step so goals are pre-filled
    if (step === 1 && !tdee && stats.weight && stats.height && stats.age) {
      calcTDEE()
    }
    setStep(s => s + 1)
  }

  const finish = async () => {
    if (!user) return
    setSaving(true)
    try {
      await Promise.all([
        supabase.from('profiles').update({
          calorie_goal:      Number(goals.calorieGoal),
          protein_goal:      Number(goals.proteinGoal),
          carb_goal:         goals.carbGoal ? Number(goals.carbGoal) : null,
          fat_goal:          goals.fatGoal  ? Number(goals.fatGoal)  : null,
          goal_direction:    goals.mode,
          game_mode:         modeFromGoalDirection(goals.mode).id,
          weight:            Number(stats.weight),
          height:            Number(stats.height),
          age:               Number(stats.age),
          gender:            stats.gender,
          activity_level:    stats.activity,
          body_fat_pct:      stats.bodyFatPct ? Number(stats.bodyFatPct) : null,
          health_conditions: healthConditions,
          diet_type:         dietType,
          onboarded:         true,
        }).eq('id', user.id),
        supabase.from('characters').update({
          character_type: character,
          avatar: CHARACTERS.find(c => c.id === character)?.icon || '⚔️',
        }).eq('user_id', user.id),
      ])
      toast.success('🐉 Your empire awaits, Champion!')
      await loadProfile(user.id)
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

        {/* ── Step Progress ── */}
        <div className="mb-8">
          <div className="flex items-center mb-3">
            {STEPS.map((s, i) => (
              <Fragment key={s}>
                <div className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center font-ui text-xs font-bold transition-all
                  ${i === step
                    ? 'border-gold bg-gold/20 text-gold shadow-glow-sm'
                    : i < step
                      ? 'border-emerald bg-emerald/10 text-emerald'
                      : 'border-border text-text-muted'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px transition-all ${i < step ? 'bg-emerald/40' : 'bg-border'}`} />
                )}
              </Fragment>
            ))}
          </div>
          <p className="text-xs font-ui text-text-muted">
            Step {step + 1} of {STEPS.length} · <span className="text-gold">{STEPS[step]}</span>
          </p>
        </div>

        <div className="panel pixel-border-gold p-6">

          {/* ── Step 0: Body Stats ── */}
          {step === 0 && (
            <div className="space-y-4">
              <StepHeader icon="📊" title="Body Stats" sub="Used to calculate your personalized goals" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">Weight (kg)</label>
                  <Input placeholder="e.g. 70" value={stats.weight} onChange={e => setStat('weight', e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">Height (cm)</label>
                  <Input placeholder="e.g. 175" value={stats.height} onChange={e => setStat('height', e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">Age</label>
                  <Input placeholder="e.g. 24" value={stats.age} onChange={e => setStat('age', e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">
                    Body Fat % <span className="opacity-50">(optional)</span>
                  </label>
                  <Input placeholder="e.g. 18" value={stats.bodyFatPct} onChange={e => setStat('bodyFatPct', e.target.value)} type="number" />
                </div>
              </div>
              {stats.bodyFatPct && (
                <p className="text-xs text-gold/70 font-ui">
                  ⚡ Katch-McArdle formula will be used — more accurate when body composition is known
                </p>
              )}
              <div>
                <label className="text-xs text-text-muted font-ui mb-2 block">Gender</label>
                <div className="flex gap-2">
                  {['male', 'female'].map(g => (
                    <button key={g} onClick={() => setStat('gender', g)}
                      className={`flex-1 py-2 rounded border font-ui text-sm capitalize transition-all
                        ${stats.gender === g ? 'border-gold bg-gold/10 text-gold' : 'border-border text-text-muted hover:border-gold/20'}`}>
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
                      className={`py-2 px-3 rounded border font-ui text-xs text-left transition-all
                        ${stats.activity === a.id ? 'border-gold bg-gold/10 text-gold' : 'border-border text-text-muted hover:border-gold/20'}`}>
                      <p className="font-semibold">{a.label}</p>
                      <p className="opacity-70">{a.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Battle Conditions ── */}
          {step === 1 && (
            <div className="space-y-5">
              <StepHeader icon="🛡️" title="Battle Conditions" sub="Shapes your quest modifiers. Leave all unchecked if none apply." />

              {/* Diet type */}
              <div>
                <label className="text-xs text-text-muted font-ui mb-2 block uppercase tracking-widest">Dietary Allegiance</label>
                <div className="grid grid-cols-3 gap-2">
                  {DIET_TYPES.map(d => (
                    <button key={d.id} onClick={() => setDietType(d.id)}
                      className={`py-3 px-2 rounded-lg border font-ui text-center transition-all
                        ${dietType === d.id
                          ? 'border-gold/60 bg-gold/10 text-gold'
                          : 'border-border text-text-muted hover:border-gold/20'}`}>
                      <p className="text-xl mb-1">{d.icon}</p>
                      <p className="text-xs font-semibold">{d.label}</p>
                      <p className="text-xs opacity-60 mt-0.5 leading-tight">{d.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Health conditions checklist */}
              <div>
                <label className="text-xs text-text-muted font-ui mb-2 block uppercase tracking-widest">Health Conditions</label>
                <div className="space-y-1.5">
                  {HEALTH_CONDITIONS.map(c => {
                    const checked = healthConditions.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => toggleCondition(c.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all
                          ${checked ? 'border-gold/40 bg-gold/5' : 'border-border hover:border-gold/20'}`}>
                        {/* Custom themed checkbox */}
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all
                          ${checked ? 'border-gold bg-gold' : 'border-muted'}`}>
                          {checked && (
                            <span className="text-void font-bold leading-none" style={{ fontSize: '0.6rem' }}>✓</span>
                          )}
                        </div>
                        <span className="text-base leading-none">{c.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`font-ui text-sm font-semibold leading-tight ${checked ? 'text-gold' : 'text-text'}`}>
                            {c.name}
                          </p>
                          <p className="font-ui text-xs text-text-muted mt-0.5">{c.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Goals ── */}
          {step === 2 && (
            <div className="space-y-4">
              <StepHeader icon="🎯" title="Set Goals" sub="Choose your quest — this shapes your calorie target" />

              {/* Mode cards — each maps 1:1 to a goal direction */}
              <div className="space-y-2">
                {Object.values(MODES).map(mode => {
                  const active = goals.mode === mode.goalDirection
                  return (
                    <button key={mode.id} onClick={() => {
                      setGoal('mode', mode.goalDirection)
                      if (tdee) setGoal('calorieGoal', tdee[mode.goalDirection === 'bulk' ? 'bulkCalories' : mode.goalDirection === 'cut' ? 'cutCalories' : 'maintainCalories'])
                    }}
                      className={`w-full p-3 rounded-lg border text-left transition-all flex items-center gap-3
                        ${active ? 'border-gold/60 bg-gold/10' : 'border-border hover:border-gold/30'}`}>
                      <span className="text-2xl shrink-0">{mode.icon}</span>
                      <div className="min-w-0">
                        <p className={`font-ui font-semibold text-sm ${active ? 'text-gold' : 'text-text'}`}>{mode.name}</p>
                        <p className="font-ui text-xs text-text-muted mt-0.5">{mode.goalDesc}</p>
                      </div>
                      {active && <span className="ml-auto text-gold text-sm">✓</span>}
                    </button>
                  )
                })}
              </div>

              {/* Calculate / Recalculate */}
              {stats.weight && stats.height && stats.age && (
                <button onClick={calcTDEE} className="btn-ghost w-full text-sm">
                  🔢 {tdee ? 'Recalculate TDEE' : 'Calculate My TDEE'}
                </button>
              )}

              {/* TDEE breakdown panel */}
              {tdee && (
                <div className="bg-abyss rounded-lg p-3 border border-gold/20">
                  <p className="text-xs text-gold font-ui mb-1.5">
                    ⚡ TDEE: {tdee.tdee} kcal/day
                    {stats.bodyFatPct && <span className="text-text-muted ml-2">· Katch-McArdle</span>}
                    {healthConditions.includes('hypothyroidism') && <span className="text-text-muted ml-2">· −5% thyroid adj.</span>}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-ui text-text-muted">
                    <div><p className="text-text font-semibold">{tdee.bulkCalories}</p><p>Bulk</p></div>
                    <div><p className="text-text font-semibold">{tdee.maintainCalories}</p><p>Maintain</p></div>
                    <div><p className="text-text font-semibold">{tdee.cutCalories}</p><p>Cut</p></div>
                  </div>
                </div>
              )}

              {/* Kidney disease safety warning */}
              {healthConditions.includes('kidney_disease') && (
                <div className="bg-rose/10 border border-rose/30 rounded-lg p-3">
                  <p className="text-xs font-ui text-rose">
                    ⚠️ Kidney Disease mode — protein target set to 0.8g/kg. Consult your nephrologist before significant dietary changes.
                  </p>
                </div>
              )}

              {/* 4 macro goals */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">⚡ Calorie Goal (EP)</label>
                  <Input type="number" value={goals.calorieGoal} onChange={e => setGoal('calorieGoal', e.target.value)} placeholder="2000" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">🔩 Protein Goal (g)</label>
                  <Input type="number" value={goals.proteinGoal} onChange={e => setGoal('proteinGoal', e.target.value)} placeholder="150" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">🪵 Carb Goal (g)</label>
                  <Input type="number" value={goals.carbGoal} onChange={e => setGoal('carbGoal', e.target.value)} placeholder="225" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-ui mb-1 block">✨ Fat Goal (g)</label>
                  <Input type="number" value={goals.fatGoal} onChange={e => setGoal('fatGoal', e.target.value)} placeholder="55" />
                </div>
              </div>
              <p className="text-xs text-text-muted font-ui text-center">All goals are editable — auto-filled from your stats above</p>
            </div>
          )}

          {/* ── Step 3: Choose Hero ── */}
          {step === 3 && (
            <div className="space-y-4">
              <StepHeader icon="⚔️" title="Choose Your Hero" sub="Pick your champion class" />
              <div className="grid grid-cols-3 gap-3">
                {CHARACTERS.map(c => (
                  <button key={c.id} onClick={() => setCharacter(c.id)}
                    className={`p-3 rounded-lg border text-center transition-all
                      ${character === c.id ? 'border-gold/60 bg-gold/10 shadow-glow-sm' : 'border-border hover:border-gold/30'}`}>
                    <div className="text-3xl mb-1">{c.icon}</div>
                    <p className="font-ui text-xs font-semibold text-text">{c.name}</p>
                    <p className="font-ui text-xs text-text-muted mt-0.5" style={{ fontSize: '0.7rem' }}>{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex gap-3 mt-6">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="btn-ghost flex-1">← Back</button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={handleNext} className="btn-primary flex-1">Next →</button>
            ) : (
              <button onClick={finish} disabled={saving} className="btn-primary flex-1">
                {saving ? '⚔️ Saving...' : profile?.onboarded ? '💾 Save Changes' : '🐉 Begin Quest'}
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
      <h2 className="font-pixel text-gold" style={{ fontSize: '0.8rem' }}>{icon} {title}</h2>
      <p className="text-text-muted font-ui text-sm mt-1">{sub}</p>
    </div>
  )
}
