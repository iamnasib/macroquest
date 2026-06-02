import { useState, useEffect, useRef } from 'react'
import { useAuthStore, useGameStore } from '../store'
import { searchFoods, calculateServing, COMMON_FOODS } from '../lib/foodApi'
import { nutritionToResources } from '../lib/gameEngine'
import { ResourceChip, Input, Modal, ProgressBar, Spinner, EmptyState } from '../components/ui'
import { getSuggestion } from '../lib/aria'
import toast from 'react-hot-toast'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-workout', 'Post-workout']

export default function FoodLog() {
  const { user } = useAuthStore()
  const { todayLogs, todayTotals, profile, addFoodLog, removeFoodLog, loadTodayLogs } = useGameStore()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [serving, setServing] = useState(100)
  const [mealType, setMealType] = useState('Lunch')
  const [logging, setLogging] = useState(false)
  const [ariaSuggestion, setAriaSuggestion] = useState(null)
  const searchTimeout = useRef(null)
  const previewRef    = useRef(null)

  // On mobile the preview panel is below the search list — scroll to it when food is picked
  useEffect(() => {
    if (selected) {
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }, [selected])

  const calorieGoal = profile?.calorie_goal || 2000
  const proteinGoal = profile?.protein_goal || 150
  const remaining   = Math.max(0, proteinGoal - todayTotals.protein)

  useEffect(() => {
    if (user) loadTodayLogs(user.id)
  }, [user])

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults(COMMON_FOODS.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8))
      return
    }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const res = await searchFoods(query)
      setResults(res.length > 0 ? res : COMMON_FOODS.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6))
      setSearching(false)
    }, 500)
    return () => clearTimeout(searchTimeout.current)
  }, [query])

  // Show common foods initially
  useEffect(() => { setResults(COMMON_FOODS.slice(0, 10)) }, [])

  const preview = selected ? calculateServing(selected, serving) : null
  const previewResources = preview ? nutritionToResources(preview) : null

  const handleLog = async () => {
    if (!selected || !preview) return
    if (!serving || serving < 1 || serving > 5000) {
      toast.error('Serving size must be between 1g and 5000g.')
      return
    }
    setLogging(true)
    try {
      await addFoodLog(user.id, {
        food_name:    selected.name,
        brand:        selected.brand || '',
        serving_size: serving,
        meal_type:    mealType,
        log_date:     new Date().toLocaleDateString('en-CA'),
        calories: preview.calories,
        protein:  preview.protein,
        carbs:    preview.carbs,
        fat:      preview.fat,
        fiber:    preview.fiber,
      })
      toast.success(`🍽️ ${selected.name} logged! +${preview.calories} EP`)
      setSelected(null)
      setServing(100)
      setQuery('')
    } catch (err) {
      toast.error('Failed to log food. Try again.')
    } finally {
      setLogging(false)
    }
  }

  const handleRemove = async (logId, name) => {
    if (!window.confirm(`Remove "${name}" from today's log?`)) return
    try {
      await removeFoodLog(user.id, logId)
      toast.success(`Removed ${name}`)
    } catch {
      toast.error('Failed to remove entry.')
    }
  }

  const getAriaSuggestion = async () => {
    const suggestion = await getSuggestion({ remaining, type: 'protein' })
    setAriaSuggestion(suggestion)
  }

  // Group logs by meal type
  const groupedLogs = todayLogs.reduce((acc, log) => {
    const type = log.meal_type || 'Other'
    if (!acc[type]) acc[type] = []
    acc[type].push(log)
    return acc
  }, {})

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left: Food Search ── */}
        <div className="lg:col-span-3 space-y-4">
          <div>
            <h2 className="font-pixel text-gold glow-text-gold mb-1" style={{ fontSize: '0.8rem' }}>
              ⚡ LOG RESOURCES
            </h2>
            <p className="text-text-muted font-ui text-sm">Search or pick common foods</p>
          </div>

          {/* Search input */}
          <Input
            placeholder="🔍 Search food (e.g. 'dal', 'chicken', 'rice')"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          {/* Meal type selector */}
          <div className="flex gap-2 flex-wrap">
            {MEAL_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setMealType(t)}
                className={`text-xs font-ui px-3 py-1.5 rounded border transition-all ${
                  mealType === t
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-border text-text-muted hover:border-gold/40'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Results */}
          <div className="space-y-2">
            {searching && (
              <div className="flex items-center gap-2 text-text-muted font-ui text-sm py-2">
                <Spinner size="sm" /> Searching the food forge...
              </div>
            )}
            {!searching && results.map(food => (
              <button
                key={food.id}
                onClick={() => { setSelected(food); setServing(food.defaultServing || 100) }}
                className={`w-full text-left panel p-3 hover:border-gold/40 transition-all ${
                  selected?.id === food.id ? 'border-gold/60 bg-gold/5' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-ui font-semibold text-sm text-text truncate">{food.name}</p>
                    {food.brand && <p className="text-xs text-text-muted font-ui">{food.brand}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <span className="resource-chip bg-gold/15 text-gold text-xs px-1.5 py-0.5">
                      ⚡{food.per100g.calories}
                    </span>
                    <span className="resource-chip bg-iron/15 text-iron text-xs px-1.5 py-0.5">
                      🔩{food.per100g.protein}g
                    </span>
                  </div>
                </div>
                <p className="text-xs text-text-muted font-ui mt-0.5">per 100g</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Preview + Log ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Daily summary */}
          <div className="panel p-4">
            <h3 className="font-pixel text-text mb-3" style={{ fontSize: '0.8rem' }}>📊 TODAY'S HAUL</h3>
            <div className="space-y-2">
              <MacroRow label="⚡ Energy" value={todayTotals.calories.toFixed(0)} goal={calorieGoal} unit="EP" color="text-gold" />
              <MacroRow label="🔩 Iron"   value={todayTotals.protein.toFixed(1)}  goal={proteinGoal} unit="g"  color="text-iron" />
              <MacroRow label="🪵 Timber" value={todayTotals.carbs.toFixed(0)}   unit="g"  color="text-amber" />
              <MacroRow label="✨ Gold"   value={todayTotals.fat.toFixed(1)}     unit="g"  color="text-amber" />
            </div>
            {remaining > 10 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-text-muted font-ui mb-2">Need {remaining.toFixed(0)}g more Iron?</p>
                {ariaSuggestion ? (
                  <p className="text-xs text-text font-ui">{ariaSuggestion}</p>
                ) : (
                  <button onClick={getAriaSuggestion} className="btn-ghost text-xs py-1.5 w-full">
                    🤖 Ask ARIA
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Food preview */}
          {selected && (
            <div ref={previewRef} className="panel-deep p-4 pixel-border-gold animate-slide-in">
              <h3 className="font-pixel text-gold mb-3" style={{ fontSize: '0.8rem' }}>
                {selected.name}
              </h3>

              {/* Serving adjuster */}
              <div className="mb-4">
                <label className="text-xs text-text-muted font-ui mb-1 block">Serving Size (g)</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setServing(s => Math.max(10, s - 25))}
                    className="w-8 h-8 rounded border border-border text-text-muted hover:border-gold hover:text-gold transition-colors"
                  >−</button>
                  <input
                    type="number"
                    value={serving}
                    onChange={e => setServing(Number(e.target.value))}
                    className="flex-1 bg-abyss border border-border rounded px-2 py-1.5 text-center text-sm font-ui text-text focus:outline-none focus:border-gold/60"
                    min="1"
                  />
                  <button
                    onClick={() => setServing(s => s + 25)}
                    className="w-8 h-8 rounded border border-border text-text-muted hover:border-gold hover:text-gold transition-colors"
                  >+</button>
                </div>
              </div>

              {/* Nutrient preview */}
              {preview && (
                <div className="space-y-2 mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    <NutrientCard icon="⚡" label="Energy" value={preview.calories} unit="EP" color="text-gold" />
                    <NutrientCard icon="🔩" label="Iron"   value={preview.protein}  unit="g"  color="text-iron" />
                    <NutrientCard icon="🪵" label="Timber" value={preview.carbs}    unit="g"  color="text-amber" />
                    <NutrientCard icon="✨" label="Gold"   value={preview.fat}      unit="g"  color="text-amber" />
                  </div>
                  {previewResources && (
                    <div className="bg-abyss rounded p-2 flex flex-wrap gap-1.5">
                      <ResourceChip type="energy" amount={previewResources.energy} />
                      <ResourceChip type="iron"   amount={previewResources.iron}   />
                      <ResourceChip type="gold"   amount={previewResources.gold}   />
                    </div>
                  )}
                </div>
              )}

              <button onClick={handleLog} disabled={logging} className="btn-primary w-full justify-center">
                {logging ? '⚔️ Logging...' : '⚡ Log to Quest'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Logged meals ── */}
      {Object.keys(groupedLogs).length > 0 && (
        <div className="mt-6">
          <h3 className="font-pixel text-text mb-3" style={{ fontSize: '0.75rem' }}>🍽️ TODAY'S MEALS</h3>
          <div className="space-y-4">
            {Object.entries(groupedLogs).map(([mealType, logs]) => {
              const mealTotals = logs.reduce((a, l) => ({
                calories: a.calories + l.calories,
                protein: a.protein + l.protein,
              }), { calories: 0, protein: 0 })
              return (
                <div key={mealType}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-ui font-semibold text-sm text-text-muted uppercase tracking-widest text-xs">{mealType}</h4>
                    <div className="flex gap-2">
                      <span className="text-xs text-gold font-ui">⚡{Math.round(mealTotals.calories)} EP</span>
                      <span className="text-xs text-iron font-ui">🔩{mealTotals.protein.toFixed(0)}g</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {logs.map(log => (
                      <div key={log.id} className="panel-deep p-3 flex items-center justify-between group">
                        <div>
                          <p className="font-ui font-semibold text-sm text-text">{log.food_name}</p>
                          <p className="text-xs text-text-muted font-ui">{log.serving_size}g</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <ResourceChip type="energy" amount={Math.round(log.calories)} />
                          <button
                            onClick={() => handleRemove(log.id, log.food_name)}
                            className="text-text-muted hover:text-rose transition-colors text-sm p-1"
                            aria-label={`Remove ${log.food_name}`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MacroRow({ label, value, goal, unit, color }) {
  return (
    <div className="stat-row">
      <span className={`font-ui text-sm ${color}`}>{label}</span>
      <span className="font-ui text-sm text-text font-semibold">
        {value}{unit}{goal ? <span className="text-text-muted">/{goal}</span> : null}
      </span>
    </div>
  )
}

function NutrientCard({ icon, label, value, unit, color }) {
  return (
    <div className="bg-abyss rounded p-2 text-center">
      <p className="text-xs text-text-muted font-ui">{icon} {label}</p>
      <p className={`font-ui font-bold text-sm ${color}`}>{typeof value === 'number' ? value.toFixed(1) : value}{unit}</p>
    </div>
  )
}
