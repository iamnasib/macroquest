import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAuthStore, useGameStore} from "../store";
import {
  getLevelTitle,
  getLevelFromXP,
  getWorldStage,
  CHARACTERS,
  MODES,
  modeFromGoalDirection,
} from "../lib/gameEngine";
import {ProgressBar, Badge, StatCard} from "../components/ui";
import {supabase} from "../lib/supabase";
import toast from "react-hot-toast";

export default function Character() {
  const navigate = useNavigate();
  const {user} = useAuthStore();
  const {profile, character, levelData, streakData, totalXP, loadProfile} =
    useGameStore();
  const [selectedChar, setSelectedChar] = useState(
    character?.character_type || "warrior",
  );
  const [selectedMode, setSelectedMode] = useState(
    profile?.game_mode || "EMPIRE",
  );
  const [saving, setSaving] = useState(false);

  const totalDays = streakData?.logging || 0;
  const worldStage = getWorldStage(totalDays);
  const levelTitle = getLevelTitle(levelData.level);

  // Next 3 levels preview
  const nextLevels = [1, 2, 3].map((i) => {
    const l = levelData.level + i;
    return {
      level: l,
      title: getLevelTitle(l),
      xpNeeded: getLevelFromXP(totalXP + i * 200).xpNeeded,
    };
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const goalDirection = Object.values(MODES).find(m => m.id === selectedMode)?.goalDirection ?? 'maintain'
      await Promise.all([
        supabase
          .from("profiles")
          .update({ game_mode: selectedMode, goal_direction: goalDirection })
          .eq("id", user.id),
        supabase
          .from("characters")
          .update({character_type: selectedChar})
          .eq("user_id", user.id),
      ]);
      await loadProfile(user.id);
      toast.success("⚔️ Character updated!");
    } catch {
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='p-4 lg:p-6 max-w-4xl mx-auto space-y-6'>
      <div>
        <h2
          className='font-pixel text-gold glow-text-gold'
          style={{fontSize: "0.75rem"}}>
          🐉 CHARACTER
        </h2>
        <p className='text-text-muted font-ui text-sm mt-1'>
          Your hero, your journey
        </p>
      </div>

      {/* ── Hero card ── */}
      <div className='panel pixel-border-gold p-6'>
        <div className='flex flex-col sm:flex-row items-center sm:items-start gap-6'>
          {/* Avatar */}
          <div className='relative'>
            <div className='w-24 h-24 rounded-full bg-abyss border-2 border-gold/40 flex items-center justify-center text-5xl animate-float shadow-glow'>
              {CHARACTERS.find(
                (c) => c.id === (character?.character_type || "warrior"),
              )?.icon || "⚔️"}
            </div>
            <div
              className='absolute -bottom-2 -right-2 bg-gold text-void font-pixel px-2 py-0.5 rounded text-xs'
              style={{fontSize: "0.75rem"}}>
              LVL {levelData.level}
            </div>
          </div>

          {/* Stats */}
          <div className='flex-1 min-w-0 text-center sm:text-left'>
            <h3
              className='font-pixel text-gold glow-text-gold'
              style={{fontSize: "0.8rem"}}>
              {profile?.username || user?.email?.split("@")[0] || "Champion"}
            </h3>
            <p className='font-ui text-text-muted text-sm mt-0.5'>
              {levelTitle}
            </p>
            <p className='font-ui text-xs text-text-muted mt-1'>
              {worldStage.icon} {worldStage.name} · Day {Math.max(1, totalDays)}
            </p>

            {/* XP bar */}
            <div className='mt-4 max-w-sm'>
              <div className='flex justify-between mb-1'>
                <span className='text-xs font-ui text-text-muted'>
                  Level {levelData.level} Progress
                </span>
                <span className='text-xs font-ui text-gold'>
                  {levelData.currentXP} / {levelData.xpNeeded} XP
                </span>
              </div>
              <ProgressBar
                value={levelData.currentXP}
                max={levelData.xpNeeded}
                color='gold'
              />
              <p className='text-xs text-text-muted font-ui mt-1'>
                {levelData.xpNeeded - levelData.currentXP} XP to Level{" "}
                {levelData.level + 1} · Total: {totalXP} XP
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className='grid grid-cols-2 gap-2 w-full sm:w-40'>
            <MiniStat
              label='Total XP'
              value={totalXP}
              icon='⭐'
              color='text-violet'
            />
            <MiniStat
              label='Log Streak'
              value={`${streakData?.logging || 0}d`}
              icon='🔥'
              color='text-rose'
            />
            <MiniStat
              label='Pro Streak'
              value={`${streakData?.protein || 0}d`}
              icon='🔩'
              color='text-iron'
            />
            <MiniStat
              label='Budget'
              value={`${streakData?.budget || 0}d`}
              icon='⚡'
              color='text-gold'
            />
          </div>
        </div>
      </div>

      {/* ── World Stage ── */}
      <div className='panel p-4'>
        <h3 className='font-pixel text-text mb-4' style={{fontSize: "0.75rem"}}>
          🌍 YOUR WORLD
        </h3>
        <div className='flex gap-3 overflow-x-auto pb-2'>
          {WORLD_STAGES.map((stage) => {
            const unlocked = totalDays >= stage.daysNeeded;
            return (
              <div
                key={stage.name}
                className={`shrink-0 w-28 text-center p-3 rounded-lg border transition-all ${
                  unlocked
                    ? "border-gold/40 bg-gold/5"
                    : "border-border opacity-40"
                }`}>
                <div className={`text-3xl mb-1 ${unlocked ? "" : "grayscale"}`}>
                  {stage.icon}
                </div>
                <p
                  className={`font-pixel text-xs mb-0.5 ${unlocked ? "text-gold" : "text-text-muted"}`}
                  style={{fontSize: "0.75rem"}}>
                  {stage.name}
                </p>
                <p className='font-ui text-xs text-text-muted'>
                  Day {stage.daysNeeded}+
                </p>
                {unlocked && <span className='text-emerald text-xs'>✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Choose Character ── */}
      <div className='panel p-4'>
        <h3 className='font-pixel text-text mb-4' style={{fontSize: "0.75rem"}}>
          ⚔️ CHOOSE YOUR HERO
        </h3>
        <div className='grid grid-cols-3 sm:grid-cols-6 gap-3'>
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedChar(c.id)}
              className={`p-3 rounded-lg border text-center transition-all ${
                selectedChar === c.id
                  ? "border-gold/60 bg-gold/10 shadow-glow-sm"
                  : "border-border hover:border-gold/30"
              }`}>
              <div className='text-3xl mb-1'>{c.icon}</div>
              <p className='font-ui text-xs font-semibold text-text'>
                {c.name}
              </p>
              <p
                className='font-ui text-xs text-text-muted mt-0.5'
                style={{fontSize: "0.75rem"}}>
                {c.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Game Mode ── */}
      <div className='panel p-4'>
        <h3 className='font-pixel text-text mb-4' style={{fontSize: "0.75rem"}}>
          🌍 GAME MODE
        </h3>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
          {Object.values(MODES).map((mode) => (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(mode.id)}
              className={`p-4 rounded-lg border text-left transition-all ${
                selectedMode === mode.id
                  ? "border-gold/60 bg-gold/10"
                  : "border-border hover:border-gold/30"
              }`}>
              <div className='text-2xl mb-2'>{mode.icon}</div>
              <p className={`font-ui font-semibold text-sm ${selectedMode === mode.id ? 'text-gold' : 'text-text'}`}>
                {mode.name}
              </p>
              <p className='font-ui text-xs text-gold/70 mt-0.5'>{mode.goalDesc}</p>
              <p className='font-ui text-xs text-text-muted mt-1'>
                {mode.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Level roadmap ── */}
      <div className='panel p-4'>
        <h3 className='font-pixel text-text mb-4' style={{fontSize: "0.75rem"}}>
          📈 LEVEL ROADMAP
        </h3>
        <div className='space-y-2'>
          <div className='flex items-center gap-3 p-2 bg-gold/10 border border-gold/30 rounded-lg'>
            <span
              className='font-pixel text-gold w-12 text-center'
              style={{fontSize: "0.75rem"}}>
              LVL {levelData.level}
            </span>
            <div>
              <p className='font-ui font-semibold text-sm text-gold'>
                ← YOU ARE HERE
              </p>
              <p className='font-ui text-xs text-text-muted'>{levelTitle}</p>
            </div>
          </div>
          {nextLevels.map((l) => (
            <div
              key={l.level}
              className='flex items-center gap-3 p-2 border border-border rounded-lg opacity-60'>
              <span
                className='font-pixel text-text-muted w-12 text-center'
                style={{fontSize: "0.75rem"}}>
                LVL {l.level}
              </span>
              <div>
                <p className='font-ui text-sm text-text'>{l.title}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className='flex flex-col sm:flex-row gap-3'>
        <button
          onClick={handleSave}
          disabled={saving}
          className='btn-primary flex-1 justify-center'>
          {saving ? "⚔️ Saving..." : "💾 Save Character"}
        </button>
        <button
          onClick={() => navigate("/onboarding")}
          className='flex-1 justify-center font-pixel text-xs px-6 py-3 rounded border border-gold/40 text-gold hover:border-gold hover:bg-gold/10 active:scale-95 transition-all duration-150 cursor-pointer select-none'>
          ⚙️ Edit Profile
        </button>
      </div>
    </div>
  );
}

function MiniStat({label, value, icon, color}) {
  return (
    <div className='bg-abyss rounded p-2 text-center border border-border'>
      <span className='text-base'>{icon}</span>
      <p className={`font-ui font-bold text-sm ${color}`}>{value}</p>
      <p className='font-ui text-xs text-text-muted'>{label}</p>
    </div>
  );
}

const WORLD_STAGES = [
  {name: "Campsite", icon: "🔥", daysNeeded: 0},
  {name: "Outpost", icon: "🏕️", daysNeeded: 7},
  {name: "Village", icon: "🏘️", daysNeeded: 28},
  {name: "Kingdom", icon: "🏰", daysNeeded: 84},
  {name: "Empire", icon: "🌆", daysNeeded: 168},
];
