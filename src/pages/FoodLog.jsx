import { useState, useEffect, useRef } from 'react'
import { useAuthStore, useGameStore } from '../store'
import { searchFoods, calculateServing, COMMON_FOODS, filterFoodsByConditions } from '../lib/foodApi'
import { nutritionToResources } from '../lib/gameEngine'
import { foodLogs as foodLogsApi } from '../lib/supabase'
import { ResourceChip, Input, Modal, ProgressBar, Spinner, EmptyState } from '../components/ui'
import { getSuggestion } from '../lib/aria'
import toast from 'react-hot-toast'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-workout', 'Post-workout']

export default function FoodLog() {
  const { user } = useAuthStore()
  const { todayLogs, todayTotals, profile, character, addFoodLog, removeFoodLog, editFoodLog } = useGameStore()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [serving, setServing] = useState(100)
  const [mealType, setMealType] = useState('Lunch')
  const [logging, setLogging] = useState(false)
  const [ariaSuggestion, setAriaSuggestion] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [noResults, setNoResults] = useState(false)
  const [filterEnabled, setFilterEnabled] = useState(true)
  // Date navigation state
  const [viewDate, setViewDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [pastLogs, setPastLogs] = useState([])
  const [pastLoading, setPastLoading] = useState(false)
  // Inline edit state
  const [editingId, setEditingId] = useState(null)
  const [editServing, setEditServing] = useState(100)
  const [editMealType, setEditMealType] = useState('Lunch')
  const [editSaving, setEditSaving] = useState(false)
  const searchTimeout = useRef(null)
  const searchVersion = useRef(0)
  const previewRef    = useRef(null)

  const today = new Date().toLocaleDateString('en-CA')
  const isToday = viewDate === today

  // Computed display state — switches between live store state and fetched past logs
  const displayLogs = isToday ? todayLogs : pastLogs
  const displayTotals = isToday ? todayTotals : pastLogs.reduce((acc, log) => ({
    calories: acc.calories + (log.calories || 0),
    protein:  acc.protein  + (log.protein  || 0),
    carbs:    acc.carbs    + (log.carbs    || 0),
    fat:      acc.fat      + (log.fat      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  // Fetch past logs when viewDate changes
  useEffect(() => {
    if (isToday) { setPastLogs([]); return }
    if (!user?.id) return
    setPastLoading(true)
    foodLogsApi.getByDate(user.id, viewDate).then(({ data }) => {
      setPastLogs(data || [])
      setPastLoading(false)
    })
  }, [viewDate, user?.id])

  // On mobile the preview panel is below the search list — scroll to it when food is picked
  useEffect(() => {
    if (selected) {
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }, [selected])

  const calorieGoal = profile?.calorie_goal || 2000
  const proteinGoal = profile?.protein_goal || 150
  const remaining   = Math.max(0, proteinGoal - todayTotals.protein)

  const userConditions     = profile?.health_conditions || []
  const hasAllergenFilter  = userConditions.includes('lactose_intolerance') || userConditions.includes('gluten_intolerance')
  const effectiveConditions = filterEnabled ? userConditions : []

  // Debounced search — re-runs when query or filter toggle changes
  useEffect(() => {
    if (query.length < 3) {
      searchVersion.current++
      setSearching(false)
      setNoResults(false)
      const base = query
        ? COMMON_FOODS.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
        : COMMON_FOODS
      setResults(filterFoodsByConditions(base, effectiveConditions).slice(0, query ? 8 : 10))
      return
    }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      const version = ++searchVersion.current
      setSearching(true)
      setNoResults(false)

      const apiResults = await searchFoods(query)
      if (version !== searchVersion.current) return

      const q = query.toLowerCase()

      // Local curated foods first — filtered by allergens via tagged metadata
      const localMatches = filterFoodsByConditions(
        COMMON_FOODS
          .filter(f => f.name.toLowerCase().includes(q))
          .sort((a, b) => {
            const an = a.name.toLowerCase()
            const bn = b.name.toLowerCase()
            const score = n => n === q ? 2 : n.startsWith(q) ? 1 : 0
            return score(bn) - score(an)
          }),
        effectiveConditions
      )

      // API results filtered by name keywords (no allergen metadata available)
      const combined = [...localMatches, ...applyKeywordFilter(rankResults(apiResults, query), effectiveConditions)]

      if (combined.length > 0) {
        setResults(combined.slice(0, 25))
        setNoResults(false)
      } else {
        setResults([])
        setNoResults(true)
      }
      setSearching(false)
    }, 800)
    return () => clearTimeout(searchTimeout.current)
  }, [query, filterEnabled])

  const preview = selected ? calculateServing(selected, serving) : null
  const previewResources = preview ? nutritionToResources(preview, character?.character_type) : null

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
    if (confirmId !== logId) {
      setConfirmId(logId)
      return
    }
    setConfirmId(null)
    try {
      await removeFoodLog(user.id, logId)
      toast.success(`Removed ${name}`)
    } catch {
      toast.error('Failed to remove entry.')
    }
  }

  const startEdit = (log) => {
    setEditingId(log.id)
    setEditServing(log.serving_size)
    setEditMealType(log.meal_type || 'Lunch')
    setConfirmId(null)
  }

  const saveEdit = async () => {
    if (!editingId || editServing < 1) return
    const log = todayLogs.find(l => l.id === editingId)
    if (!log) return
    const per100g = {
      calories: log.serving_size > 0 ? (log.calories / log.serving_size) * 100 : 0,
      protein:  log.serving_size > 0 ? (log.protein  / log.serving_size) * 100 : 0,
      carbs:    log.serving_size > 0 ? (log.carbs    / log.serving_size) * 100 : 0,
      fat:      log.serving_size > 0 ? (log.fat      / log.serving_size) * 100 : 0,
      fiber:    log.serving_size > 0 ? (log.fiber    / log.serving_size) * 100 : 0,
    }
    const updated = calculateServing({ per100g }, editServing)
    setEditSaving(true)
    try {
      await editFoodLog(user.id, editingId, {
        serving_size: editServing,
        meal_type: editMealType,
        calories: updated.calories,
        protein:  updated.protein,
        carbs:    updated.carbs,
        fat:      updated.fat,
        fiber:    updated.fiber,
      })
      setEditingId(null)
      toast.success('✅ Entry updated!')
    } catch {
      toast.error('Failed to update entry.')
    } finally {
      setEditSaving(false)
    }
  }

  const getAriaSuggestion = async () => {
    const suggestion = await getSuggestion({
      remaining,
      type: 'protein',
      healthConditions: profile?.health_conditions || [],
      dietType: profile?.diet_type || 'omnivore',
    })
    setAriaSuggestion(suggestion)
  }

  // Group logs by meal type — uses displayLogs so it works for past dates too
  const groupedLogs = displayLogs.reduce((acc, log) => {
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

          {/* Active allergen filter chips */}
          {hasAllergenFilter && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-muted font-ui">Filtering:</span>
              {filterEnabled && userConditions.includes('lactose_intolerance') && (
                <span className="resource-chip bg-rose/15 text-rose text-xs px-2 py-0.5">🥛 No Lactose</span>
              )}
              {filterEnabled && userConditions.includes('gluten_intolerance') && (
                <span className="resource-chip bg-amber/15 text-amber text-xs px-2 py-0.5">🌾 No Gluten</span>
              )}
              <button
                onClick={() => setFilterEnabled(f => !f)}
                className="text-xs font-ui text-text-muted hover:text-gold transition-colors underline"
              >
                {filterEnabled ? 'Show all foods' : 'Apply filter'}
              </button>
            </div>
          )}

          {/* Results */}
          <div className="space-y-2">
            {searching && (
              <div className="flex items-center gap-2 text-text-muted font-ui text-sm py-2">
                <Spinner size="sm" /> Searching the food forge...
              </div>
            )}
            {!searching && noResults && (
              <div className="text-center py-8 space-y-1">
                <p className="text-3xl">🔍</p>
                <p className="font-ui text-sm text-text-muted">No results for "{query}"</p>
                <p className="font-ui text-xs text-text-muted/60">Try a shorter or different name (e.g. "chicken" instead of "grilled chicken breast")</p>
              </div>
            )}
            {!searching && !noResults && results.map(food => (
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
      <div className="mt-6">
        {/* Date navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => { if (canGoBack(viewDate)) { setViewDate(addDays(viewDate, -1)); setEditingId(null) } }}
            disabled={!canGoBack(viewDate)}
            className="p-1.5 rounded border border-border text-text-muted hover:border-gold/40 hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition-all font-ui text-sm"
          >
            ←
          </button>
          <div className="text-center">
            <h3 className="font-pixel text-text" style={{ fontSize: '0.75rem' }}>
              {isToday ? '🍽️ TODAY\'S MEALS' : `📅 ${formatViewDate(viewDate)}`}
            </h3>
            {!isToday && (
              <button
                onClick={() => { setViewDate(today); setEditingId(null) }}
                className="text-xs text-gold font-ui hover:underline mt-0.5"
              >
                Back to today
              </button>
            )}
          </div>
          <button
            onClick={() => { if (!isToday) { setViewDate(addDays(viewDate, 1)); setEditingId(null) } }}
            disabled={isToday}
            className="p-1.5 rounded border border-border text-text-muted hover:border-gold/40 hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition-all font-ui text-sm"
          >
            →
          </button>
        </div>

        {/* Logs content */}
        {pastLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-text-muted font-ui text-sm">
            <Spinner size="sm" /> Loading past logs...
          </div>
        ) : Object.keys(groupedLogs).length === 0 ? (
          isToday ? (
            <EmptyState
              icon="🏕️"
              title="NO MEALS LOGGED YET"
              desc="Search for a food above to start logging."
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-3xl">📜</p>
              <p className="font-ui text-sm text-text-muted mt-2">No meals logged on this day</p>
            </div>
          )
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedLogs).map(([mt, logs]) => {
              const mealTotals = logs.reduce((a, l) => ({
                calories: a.calories + l.calories,
                protein: a.protein + l.protein,
              }), { calories: 0, protein: 0 })
              return (
                <div key={mt}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-ui font-semibold text-text-muted uppercase tracking-widest text-xs">{mt}</h4>
                    <div className="flex gap-2">
                      <span className="text-xs text-gold font-ui">⚡{Math.round(mealTotals.calories)} EP</span>
                      <span className="text-xs text-iron font-ui">🔩{mealTotals.protein.toFixed(0)}g</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {logs.map(log => (
                      editingId === log.id ? (
                        <EditLogCard
                          key={log.id}
                          log={log}
                          editServing={editServing}
                          setEditServing={setEditServing}
                          editMealType={editMealType}
                          setEditMealType={setEditMealType}
                          editSaving={editSaving}
                          onSave={saveEdit}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <div key={log.id} className="panel-deep p-3 flex items-center justify-between group">
                          <div className="min-w-0 flex-1">
                            <p className="font-ui font-semibold text-sm text-text">{log.food_name}</p>
                            <p className="text-xs text-text-muted font-ui">{log.serving_size}g · {log.meal_type}</p>
                          </div>
                          {isToday ? (
                            confirmId === log.id ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleRemove(log.id, log.food_name)}
                                  className="py-1 px-2.5 rounded bg-rose/20 border border-rose/40 text-rose text-xs font-ui hover:bg-rose/30 transition-colors"
                                >
                                  ✕ Remove
                                </button>
                                <button
                                  onClick={() => setConfirmId(null)}
                                  className="py-1 px-2.5 rounded border border-border text-text-muted text-xs font-ui hover:border-gold/40 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 shrink-0">
                                <ResourceChip type="energy" amount={Math.round(log.calories)} />
                                <button
                                  onClick={() => startEdit(log)}
                                  className="text-text-muted hover:text-gold transition-colors text-sm p-1"
                                  aria-label={`Edit ${log.food_name}`}
                                  title="Edit"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleRemove(log.id, log.food_name)}
                                  className="text-text-muted hover:text-rose transition-colors text-sm p-1"
                                  aria-label={`Remove ${log.food_name}`}
                                >
                                  ✕
                                </button>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-2 shrink-0">
                              <ResourceChip type="energy" amount={Math.round(log.calories)} />
                              <span className="text-xs text-text-muted font-ui">🔩{log.protein?.toFixed(0)}g</span>
                            </div>
                          )}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d + n).toLocaleDateString('en-CA')
}

function canGoBack(viewDate) {
  const today = new Date().toLocaleDateString('en-CA')
  const [ty, tm, td] = today.split('-').map(Number)
  const [vy, vm, vd] = viewDate.split('-').map(Number)
  const diff = new Date(ty, tm - 1, td) - new Date(vy, vm - 1, vd)
  return diff < 30 * 24 * 60 * 60 * 1000
}

function formatViewDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
}

function EditLogCard({ log, editServing, setEditServing, editMealType, setEditMealType, editSaving, onSave, onCancel }) {
  const per100g = {
    calories: log.serving_size > 0 ? (log.calories / log.serving_size) * 100 : 0,
    protein:  log.serving_size > 0 ? (log.protein  / log.serving_size) * 100 : 0,
    carbs:    log.serving_size > 0 ? (log.carbs    / log.serving_size) * 100 : 0,
    fat:      log.serving_size > 0 ? (log.fat      / log.serving_size) * 100 : 0,
    fiber:    log.serving_size > 0 ? (log.fiber    / log.serving_size) * 100 : 0,
  }
  const preview = calculateServing({ per100g }, editServing)
  return (
    <div className="panel-deep p-3 border border-gold/30 animate-slide-in">
      <p className="font-ui font-semibold text-sm text-gold mb-3">{log.food_name}</p>
      <div className="mb-3">
        <label className="text-xs text-text-muted font-ui mb-1 block">Serving Size (g)</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditServing(s => Math.max(10, s - 25))}
            className="w-7 h-7 rounded border border-border text-text-muted hover:border-gold hover:text-gold transition-colors"
          >−</button>
          <input
            type="number"
            value={editServing}
            onChange={e => setEditServing(Number(e.target.value))}
            className="flex-1 bg-abyss border border-border rounded px-2 py-1 text-center text-sm font-ui text-text focus:outline-none focus:border-gold/60"
            min="1"
          />
          <button
            onClick={() => setEditServing(s => s + 25)}
            className="w-7 h-7 rounded border border-border text-text-muted hover:border-gold hover:text-gold transition-colors"
          >+</button>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {MEAL_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setEditMealType(t)}
            className={`text-xs font-ui px-2 py-1 rounded border transition-all ${
              editMealType === t
                ? 'border-gold bg-gold/10 text-gold'
                : 'border-border text-text-muted hover:border-gold/40'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <div className="bg-abyss rounded p-1.5 text-center">
          <p className="text-xs text-text-muted font-ui">⚡ EP</p>
          <p className="font-ui font-bold text-xs text-gold">{preview.calories.toFixed(0)}</p>
        </div>
        <div className="bg-abyss rounded p-1.5 text-center">
          <p className="text-xs text-text-muted font-ui">🔩 Iron</p>
          <p className="font-ui font-bold text-xs text-iron">{preview.protein.toFixed(1)}g</p>
        </div>
        <div className="bg-abyss rounded p-1.5 text-center">
          <p className="text-xs text-text-muted font-ui">🪵</p>
          <p className="font-ui font-bold text-xs text-amber">{preview.carbs.toFixed(0)}g</p>
        </div>
        <div className="bg-abyss rounded p-1.5 text-center">
          <p className="text-xs text-text-muted font-ui">✨</p>
          <p className="font-ui font-bold text-xs text-amber">{preview.fat.toFixed(1)}g</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={editSaving || editServing < 1}
          className="btn-primary text-xs py-1.5 flex-1 justify-center"
        >
          {editSaving ? '...' : '✓ Save'}
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs py-1.5 px-3">
          Cancel
        </button>
      </div>
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

function rankResults(results, query) {
  const q = query.toLowerCase().trim()
  const score = (name) => {
    const n = name.toLowerCase()
    if (n === q)           return 3
    if (n.startsWith(q))   return 2
    if (n.includes(` ${q}`)) return 1  // word boundary match (e.g. "raw banana")
    return 0
  }
  return [...results].sort((a, b) => score(b.name) - score(a.name))
}

// Name-based heuristic filter for API results that have no allergen metadata
const LACTOSE_KEYWORDS = ['milk', 'cheese', 'yogurt', 'cream', 'curd', 'lassi', 'paneer', 'whey', 'dahi']
const GLUTEN_KEYWORDS  = ['wheat', 'bread', 'roti', 'naan', 'paratha', 'atta', 'maida', 'semolina', 'flour']

function applyKeywordFilter(foods, conditions) {
  if (!conditions?.length) return foods
  return foods.filter(food => {
    const name = food.name.toLowerCase()
    if (conditions.includes('lactose_intolerance') && LACTOSE_KEYWORDS.some(k => name.includes(k))) return false
    if (conditions.includes('gluten_intolerance')  && GLUTEN_KEYWORDS.some(k => name.includes(k)))  return false
    return true
  })
}
