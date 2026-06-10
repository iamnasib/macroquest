import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore, useGameStore } from '../store'
import { ProgressBar, ResourceChip, Badge, StatCard, EmptyState } from '../components/ui'
import { QUEST_COLORS, getWorldStage, getMacroStatus, MACRO_STATUS_COLORS, getWeightTrend, getLevelTitle } from '../lib/gameEngine'
import { getDailyInsight } from '../lib/aria'
import { dailySummaries } from '../lib/supabase'
import { shareWeekCard } from '../lib/shareCard'

function MiniSparkline({ data }) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
  if (sorted.length < 2) return null
  const W = 72, H = 24
  const weights = sorted.map(d => +d.weight_kg)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1
  const toX = (i) => (i / (sorted.length - 1)) * W
  const toY = (w) => H - ((w - minW) / range) * H
  const path = 'M ' + sorted.map((d, i) => `${toX(i).toFixed(1)},${toY(+d.weight_kg).toFixed(1)}`).join(' L ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className='shrink-0'>
      <path d={path} fill='none' stroke='#a78bfa' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
      <circle cx={toX(sorted.length - 1).toFixed(1)} cy={toY(+sorted[sorted.length - 1].weight_kg).toFixed(1)} r='2.5' fill='#f5a623' />
    </svg>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const { profile, character, todayLogs, todayTotals, todayResources, quests, levelData, streakData, xpPopups, weightHistory, todayWeight } = useGameStore()
  const [ariaInsight, setAriaInsight] = useState(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [sharing, setSharing] = useState(false)

  const handleShareWeek = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const { data: weekly } = await dailySummaries.getWeekly(user.id)
      const days = weekly?.length || 0
      const sortedW = [...weightHistory].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
      const wDelta = sortedW.length >= 2
        ? +((sortedW[sortedW.length - 1].weight_kg) - sortedW[0].weight_kg).toFixed(1)
        : null
      const result = await shareWeekCard({
        username: profile?.username || 'Champion',
        level: levelData.level,
        levelTitle: getLevelTitle(levelData.level),
        streakDays: streakData?.logging || 0,
        avgCalories: days ? Math.round(weekly.reduce((s, d) => s + Number(d.total_calories || 0), 0) / days) : 0,
        avgProtein: days ? Math.round(weekly.reduce((s, d) => s + Number(d.total_protein || 0), 0) / days) : 0,
        questsCompleted: weekly?.reduce((s, d) => s + (d.quests_completed || 0), 0) || 0,
        xpEarned: weekly?.reduce((s, d) => s + (d.xp_earned || 0), 0) || 0,
        weightDelta: wDelta,
        goalDirection: profile?.goal_direction || 'maintain',
        daysLogged: days,
      })
      if (result === 'downloaded') toast.success('📸 Recap card saved!')
      else if (result === 'shared') toast.success('📤 Shared!')
    } catch {
      toast.error('Could not create the recap card.')
    } finally {
      setSharing(false)
    }
  }

  const calorieGoal = profile?.calorie_goal || 2000
  const proteinGoal = profile?.protein_goal || 150
  const carbGoal    = profile?.carb_goal    || null
  const fatGoal     = profile?.fat_goal     || null
  const fiberGoal   = profile?.health_conditions?.includes('hypertension') ? 25 : null
  const totalDays   = streakData?.logging || 0
  const worldStage  = getWorldStage(totalDays)

  const calPct  = Math.min((todayTotals.calories / calorieGoal)  * 100, 100)
  const proPct  = Math.min((todayTotals.protein  / proteinGoal)  * 100, 100)
  const date    = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })

  const fetchInsight = async () => {
    setLoadingInsight(true)
    try {
      const insight = await getDailyInsight({
        calories:         todayTotals.calories,
        protein:          todayTotals.protein,
        carbs:            todayTotals.carbs,
        fat:              todayTotals.fat,
        calorieGoal,
        proteinGoal,
        streakDays:       streakData?.logging || 0,
        level:            levelData.level,
        healthConditions: profile?.health_conditions || [],
        dietType:         profile?.diet_type || 'omnivore',
      })
      setAriaInsight(insight)
    } finally {
      setLoadingInsight(false)
    }
  }

  const completedQuests = quests.filter(q => q.completed).length

  return (
    <div className="relative p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* XP Popups */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {xpPopups.map(p => (
          <div key={p.id} className="animate-xp-pop bg-gold/90 text-void font-pixel px-3 py-1 rounded text-xs shadow-glow">
            {p.text}
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-text-muted font-ui text-sm">{date}</p>
          <h2 className="font-pixel text-gold glow-text-gold mt-0.5" style={{ fontSize: '0.75rem' }}>
            {worldStage.icon} {worldStage.name} · Day {Math.max(1, totalDays)}
          </h2>
          <p className="text-text-muted font-ui text-xs mt-0.5">{worldStage.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/log" className="btn-primary text-xs py-2 px-4">
            ⚡ Log Food
          </Link>
          <Link to="/quests" className="btn-ghost text-xs">
            ⚔️ Quests
          </Link>
          <button onClick={handleShareWeek} disabled={sharing} className="btn-ghost text-xs" title="Share your weekly recap">
            {sharing ? '…' : '📸 Share week'}
          </button>
        </div>
      </div>

      {/* ── Energy + Protein main bars ── */}
      <div className="panel p-5 pixel-border-gold">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Calories */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-pixel text-gold" style={{ fontSize: '0.8rem' }}>⚡ ENERGY POINTS</span>
              <span className="font-ui text-sm text-text font-semibold">
                {todayTotals.calories.toFixed(0)}
                <span className="text-text-muted"> / {calorieGoal} EP</span>
              </span>
            </div>
            <ProgressBar value={todayTotals.calories} max={calorieGoal} color="gold" className="mb-1" />
            <p className={`text-xs font-ui ${MACRO_STATUS_COLORS[getMacroStatus(todayTotals.calories, calorieGoal)]}`}>
              {calorieGoal - todayTotals.calories > 0
                ? `${Math.round(calorieGoal - todayTotals.calories)} EP remaining`
                : `${Math.round(todayTotals.calories - calorieGoal)} EP over budget`
              }
            </p>
          </div>

          {/* Protein */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-pixel text-iron" style={{ fontSize: '0.8rem' }}>🔩 IRON CRYSTALS</span>
              <span className="font-ui text-sm text-text font-semibold">
                {todayTotals.protein.toFixed(0)}
                <span className="text-text-muted">g / {proteinGoal}g</span>
              </span>
            </div>
            <ProgressBar value={todayTotals.protein} max={proteinGoal} color="crystal" className="mb-1" />
            <p className={`text-xs font-ui ${MACRO_STATUS_COLORS[getMacroStatus(todayTotals.protein, proteinGoal)]}`}>
              {proteinGoal - todayTotals.protein > 0
                ? `${Math.round(proteinGoal - todayTotals.protein)}g Iron needed`
                : '✅ Iron Crystal goal forged!'
              }
            </p>
          </div>
        </div>

        {/* Secondary macros */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
          <MacroMini label="🪵 Timber"  value={todayTotals.carbs.toFixed(0)} goal={carbGoal} unit="g" color="wood"  />
          <MacroMini label="✨ Gold"    value={todayTotals.fat.toFixed(0)}   goal={fatGoal}  unit="g" color="amber" />
          <MacroMini label="💎 Stamina" value={todayTotals.fiber.toFixed(0)} goal={fiberGoal} unit="g" color="emerald" />
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Level"     value={`LVL ${levelData.level}`}     icon="🐉" color="text-gold"    sub={`${levelData.currentXP}/${levelData.xpNeeded} XP`} />
        <StatCard label="Streak"    value={`${streakData?.logging || 0}d`} icon="🔥" color="text-rose"
          sub={(() => {
            const used = streakData?.shield_used_at
            const thirtyAgo = new Date()
            thirtyAgo.setDate(thirtyAgo.getDate() - 30)
            const ready = !used || used <= thirtyAgo.toLocaleDateString('en-CA')
            return ready ? 'Logging streak · 🛡️ shield ready' : 'Logging streak'
          })()} />
        <StatCard label="Quests"    value={`${completedQuests}/4`}         icon="⚔️" color="text-emerald" sub="Completed today" />
        <StatCard label="Meals"     value={todayLogs.length}              icon="🍽️" color="text-crystal" sub="Logged today" />
      </div>

      {/* ── Body Forge widget ── */}
      {(() => {
        const sorted = [...weightHistory].sort((a, b) => a.date.localeCompare(b.date))
        const startW = sorted[0]?.weight_kg ?? null
        const currentW = sorted[sorted.length - 1]?.weight_kg ?? null
        const delta = startW != null && currentW != null ? +(currentW - startW).toFixed(1) : null
        const deltaColor = getWeightTrend(delta, profile?.goal_direction || 'maintain').color
        return (
          <div className='panel p-4 flex items-center gap-4'>
            <span className='text-xl shrink-0'>⚗️</span>
            <div className='flex-1 min-w-0'>
              <p className='font-ui font-semibold text-sm text-text'>
                {todayWeight != null ? `${todayWeight} kg today` : 'No weight logged today'}
              </p>
              <p className={`text-xs font-ui ${delta == null ? 'text-text-muted' : deltaColor}`}>
                {delta != null
                  ? `${delta > 0 ? '+' : ''}${delta} kg from start · ${weightHistory.length} readings`
                  : 'Log your weight to track progress'}
              </p>
            </div>
            {weightHistory.length >= 2 && <MiniSparkline data={weightHistory} />}
            <Link to='/progress' className='btn-ghost text-xs py-1.5 px-3 shrink-0'>
              {todayWeight != null ? '✎ Update' : '+ Log'}
            </Link>
          </div>
        )
      })()}

      {/* ── Daily Quests ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-pixel text-text" style={{ fontSize: '0.75rem' }}>⚔️ DAILY QUESTS</h3>
          <Link to="/quests" className="text-xs text-gold font-ui hover:underline">View all →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quests.map(quest => {
            const colors = QUEST_COLORS[quest.type]
            const pct = quest.total > 0 ? Math.min((quest.progress / quest.total) * 100, 100) : 0
            return (
              <div key={quest.id} className={`quest-card border ${quest.completed ? 'border-gold/40 bg-gold/5' : 'border-border'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{quest.icon}</span>
                    <div>
                      <p className={`font-ui font-semibold text-sm ${quest.completed ? 'text-gold' : 'text-text'}`}>
                        {quest.title}
                      </p>
                      <Badge variant={quest.type}>{quest.type}</Badge>
                    </div>
                  </div>
                  {quest.completed && <span className="text-emerald text-lg">✓</span>}
                </div>
                <ProgressBar value={quest.progress} max={quest.total} color={quest.completed ? 'emerald' : 'gold'} className="mb-2" />
                <div className="flex items-center gap-2 flex-wrap">
                  {quest.reward?.xp    && <ResourceChip type="xp"    amount={quest.reward.xp}    />}
                  {quest.reward?.iron  && <ResourceChip type="iron"  amount={quest.reward.iron}  />}
                  {quest.reward?.gold  && <ResourceChip type="gold"  amount={quest.reward.gold}  />}
                  {quest.reward?.energy && <ResourceChip type="energy" amount={quest.reward.energy} />}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── ARIA insight ── */}
      <section className="panel p-4 border-violet/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <h3 className="font-pixel text-violet" style={{ fontSize: '0.8rem' }}>ARIA COMPANION</h3>
              <p className="text-xs text-text-muted font-ui">AI Quest Guide</p>
            </div>
          </div>
          <button onClick={fetchInsight} disabled={loadingInsight} className="btn-ghost text-xs py-1.5 px-3">
            {loadingInsight ? '...' : '🔮 Ask ARIA'}
          </button>
        </div>
        {ariaInsight ? (
          <p className="text-sm font-ui text-text leading-relaxed">{ariaInsight}</p>
        ) : (
          <p className="text-text-muted font-ui text-sm">
            Click "Ask ARIA" for a personalized daily insight based on your current progress.
          </p>
        )}
      </section>

      {/* ── Recent logs ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-pixel text-text" style={{ fontSize: '0.75rem' }}>🍽️ TODAY'S MEALS</h3>
          <Link to="/log" className="text-xs text-gold font-ui hover:underline">+ Add food →</Link>
        </div>
        {todayLogs.length === 0 ? (
          <EmptyState
            icon="🏕️"
            title="NO MEALS LOGGED YET"
            desc="Your quest begins with the first meal. Log food to start earning resources and XP."
            action={<Link to="/log" className="btn-primary text-xs">⚡ Log First Meal</Link>}
          />
        ) : (
          <div className="space-y-2">
            {todayLogs.slice(-5).map(log => (
              <div key={log.id} className="panel-deep p-3 flex items-center justify-between">
                <div>
                  <p className="font-ui font-semibold text-sm text-text">{log.food_name}</p>
                  <p className="text-xs text-text-muted font-ui">{log.serving_size}g · {log.meal_type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ResourceChip type="energy" amount={Math.round(log.calories)} />
                  <ResourceChip type="iron"   amount={`${log.protein?.toFixed(0)}g`} />
                </div>
              </div>
            ))}
            {todayLogs.length > 5 && (
              <p className="text-center text-text-muted text-xs font-ui">
                +{todayLogs.length - 5} more meals · <Link to="/log" className="text-gold hover:underline">View all</Link>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function MacroMini({ label, value, goal, unit, color = 'gold' }) {
  return (
    <div className="text-center bg-abyss rounded p-2">
      <p className="text-xs text-text-muted font-ui mb-0.5">{label}</p>
      <p className="font-ui font-bold text-text text-sm">
        {value}
        {goal
          ? <span className="text-text-muted text-xs"> / {goal}{unit}</span>
          : <span className="text-text-muted text-xs">{unit}</span>
        }
      </p>
      {goal && (
        <ProgressBar value={Number(value)} max={goal} color={color} className="mt-1.5" />
      )}
    </div>
  )
}
