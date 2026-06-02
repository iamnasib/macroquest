import { useGameStore } from '../store'
import { QUEST_COLORS } from '../lib/gameEngine'
import { ProgressBar, ResourceChip, Badge } from '../components/ui'
import { Link, useNavigate } from 'react-router-dom'

const BOSS_UNLOCKS_AT_LEVEL = 5

export default function Quests() {
  const { quests, levelData, streakData, completedQuestIds } = useGameStore()

  const bossUnlocked = levelData.level >= BOSS_UNLOCKS_AT_LEVEL
  const streak = streakData?.logging || 0

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-pixel text-gold glow-text-gold" style={{ fontSize: '0.75rem' }}>⚔️ QUEST BOARD</h2>
        <p className="text-text-muted font-ui text-sm mt-1">Complete quests to earn XP, resources, and build your empire</p>
      </div>

      {/* ── Daily Quests ── */}
      <section>
        <SectionHeader title="📋 DAILY QUESTS" sub="Resets at midnight" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quests.map(quest => <QuestCard key={quest.id} quest={quest} />)}
        </div>
      </section>

      {/* ── Streak Quests ── */}
      <section>
        <SectionHeader title="🔥 STREAK MILESTONES" sub="Cumulative achievements" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {STREAK_MILESTONES.map(m => (
            <div key={m.id} className={`quest-card ${streak >= m.days ? 'border-gold/40 bg-gold/5' : 'border-border'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{m.icon}</span>
                  <div>
                    <p className={`font-ui font-semibold text-sm ${streak >= m.days ? 'text-gold' : 'text-text'}`}>
                      {m.title}
                    </p>
                    <Badge variant={streak >= m.days ? 'gold' : 'default'}>{m.days}-day streak</Badge>
                  </div>
                </div>
                {streak >= m.days && <span className="text-gold text-xl">✓</span>}
              </div>
              <ProgressBar value={Math.min(streak, m.days)} max={m.days} color={streak >= m.days ? 'emerald' : 'gold'} />
              <p className="text-xs text-text-muted font-ui mt-1">{streak}/{m.days} days</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {m.rewards.map((r, i) => <ResourceChip key={i} type={r.type} amount={r.amount} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Boss Battle (locked/unlocked) ── */}
      <section>
        <SectionHeader title="💀 BOSS BATTLES" sub="Weekly community events" />
        <div className={`panel p-6 text-center ${bossUnlocked ? 'border-rose/30' : 'border-border opacity-60'}`}>
          {bossUnlocked ? (
            <div>
              <div className="text-5xl mb-3 animate-float">👿</div>
              <h3 className="font-pixel text-rose mb-2" style={{ fontSize: '0.75rem' }}>
                THE WEEKEND BOSS
              </h3>
              <p className="text-text-muted font-ui text-sm mb-1">Health: 10,000 / 10,000</p>
              <p className="text-text-muted font-ui text-sm mb-4">
                Deal damage by completing daily quests. Community event — coming soon!
              </p>
              <div className="bg-abyss rounded-lg p-3 max-w-sm mx-auto">
                <p className="text-xs font-ui text-text-muted">Appears every Friday. Deal damage by:</p>
                <ul className="text-xs font-ui text-text mt-2 space-y-1 text-left">
                  <li>⚡ Logging all meals → 500 damage</li>
                  <li>🔩 Hitting protein goal → 800 damage</li>
                  <li>✅ Completing all quests → 1,200 damage</li>
                </ul>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-3">🔒</div>
              <h3 className="font-pixel text-text-muted mb-2" style={{ fontSize: '0.75rem' }}>
                LOCKED — REACH LEVEL {BOSS_UNLOCKS_AT_LEVEL}
              </h3>
              <p className="text-text-muted font-ui text-sm">
                You are Level {levelData.level}. Keep logging and completing quests to unlock boss battles.
              </p>
              <ProgressBar
                value={levelData.level}
                max={BOSS_UNLOCKS_AT_LEVEL}
                color="rose"
                className="max-w-xs mx-auto mt-4"
                showLabel
                label={`Level ${levelData.level} / ${BOSS_UNLOCKS_AT_LEVEL}`}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Future quests teaser ── */}
      <section className="panel p-4 border-dashed border-border opacity-70">
        <p className="text-center text-text-muted font-ui text-sm">
          🚧 More quests, guilds, and co-op challenges coming in future updates
        </p>
      </section>
    </div>
  )
}

function QuestCard({ quest }) {
  const navigate = useNavigate()
  const pct = quest.total > 0 ? Math.min((quest.progress / quest.total) * 100, 100) : 0
  const progressText = quest.id === 'calorie_target'
    ? `${Math.round(quest.progress)} / ${quest.total} EP`
    : `${Math.round(quest.progress)} / ${quest.total}`

  return (
    <div
      role={quest.completed ? undefined : 'button'}
      tabIndex={quest.completed ? undefined : 0}
      onClick={quest.completed ? undefined : () => navigate('/log')}
      onKeyDown={quest.completed ? undefined : e => e.key === 'Enter' && navigate('/log')}
      className={`quest-card border ${quest.completed ? 'border-emerald/40 bg-emerald/5 cursor-default' : 'border-border hover:border-gold/40 cursor-pointer'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{quest.icon}</span>
          <div>
            <p className={`font-ui font-semibold text-sm ${quest.completed ? 'text-emerald' : 'text-text'}`}>
              {quest.title}
            </p>
            <Badge variant={quest.type}>{quest.type}</Badge>
          </div>
        </div>
        {quest.completed ? (
          <span className="text-emerald text-xl">✅</span>
        ) : (
          <span className="text-text-muted font-ui text-xs">{Math.round(pct)}%</span>
        )}
      </div>
      <p className="text-xs text-text-muted font-ui mb-3">{quest.desc}</p>
      <ProgressBar
        value={quest.progress}
        max={quest.total}
        color={quest.completed ? 'emerald' : 'gold'}
        className="mb-2"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted font-ui">{progressText}</p>
        <div className="flex gap-1.5 flex-wrap">
          {quest.reward?.xp    && <ResourceChip type="xp"     amount={quest.reward.xp}    size="sm" />}
          {quest.reward?.iron  && <ResourceChip type="iron"   amount={quest.reward.iron}   size="sm" />}
          {quest.reward?.gold  && <ResourceChip type="gold"   amount={quest.reward.gold}   size="sm" />}
          {quest.reward?.energy && <ResourceChip type="energy" amount={quest.reward.energy} size="sm" />}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, sub }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-pixel text-text" style={{ fontSize: '0.75rem' }}>{title}</h3>
      {sub && <p className="text-xs text-text-muted font-ui">{sub}</p>}
    </div>
  )
}

// XP values match getStreakBonus() in gameEngine.js exactly
const STREAK_MILESTONES = [
  {
    id: 's3', days: 3, icon: '🌱', title: '3-Day Sprout',
    rewards: [{ type: 'xp', amount: 15 }, { type: 'gold', amount: 25 }],
  },
  {
    id: 's7', days: 7, icon: '⚔️', title: 'Week Warrior',
    rewards: [{ type: 'xp', amount: 30 }, { type: 'iron', amount: 50 }],
  },
  {
    id: 's14', days: 14, icon: '🛡️', title: '2-Week Guardian',
    rewards: [{ type: 'xp', amount: 60 }, { type: 'gold', amount: 100 }],
  },
  {
    id: 's30', days: 30, icon: '👑', title: '30-Day Sovereign',
    rewards: [{ type: 'xp', amount: 100 }, { type: 'iron', amount: 200 }, { type: 'gold', amount: 200 }],
  },
]
