import {useState} from "react";
import {Link, useLocation} from "react-router-dom";
import {useAuthStore, useGameStore, useUIStore} from "../../store";
import {ProgressBar} from "../ui";
import {getLevelTitle} from "../../lib/gameEngine";

const NAV_ITEMS = [
  {path: "/dashboard", icon: "🏰", label: "Dashboard"},
  {path: "/log", icon: "⚡", label: "Food Log"},
  {path: "/quests", icon: "⚔️", label: "Quests"},
  {path: "/character", icon: "🐉", label: "Character"},
  {path: "/aria", icon: "🤖", label: "ARIA AI"},
];

export default function AppLayout({children}) {
  const location = useLocation();
  const {signOut, user} = useAuthStore();
  const {levelData, character, streakData} = useGameStore();
  const {sidebarOpen, setSidebarOpen} = useUIStore();
  const [collapsed, setCollapsed] = useState(false);

  const title = getLevelTitle(levelData.level);

  return (
    <div className='min-h-screen flex bg-void'>
      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className='fixed inset-0 bg-void/80 z-30 lg:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
        fixed lg:sticky top-0 h-screen z-40 flex flex-col
        bg-abyss border-r border-border transition-all duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        ${collapsed ? "w-16" : "w-60"}
      `}>
        {/* Logo */}
        <div className='p-4 border-b border-border flex items-center gap-3'>
          <span className='text-2xl shrink-0 animate-float'>⚔️</span>
          {!collapsed && (
            <div>
              <h1
                className='font-pixel text-gold glow-text-gold'
                style={{fontSize: "0.75rem"}}>
                MacroQuest
              </h1>
              <p className='text-text-muted font-ui text-xs'>
                Level Up Your Nutrition
              </p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className='ml-auto text-text-muted hover:text-gold transition-colors text-sm hidden lg:block'>
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        {/* Character mini-card */}
        {!collapsed && (
          <div className='p-3 border-b border-border'>
            <div className='bg-deep rounded-lg p-3 pixel-border'>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xl'>{character?.avatar || "🐉"}</span>
                <div className='min-w-0'>
                  <p className='font-ui font-semibold text-text text-sm truncate'>
                    {character?.character_type?.charAt(0).toUpperCase() +
                      character?.character_type?.slice(1) || "Champion"}
                  </p>
                  <p
                    className='text-xs text-gold font-ui'
                    style={{fontSize: "0.75rem"}}>
                    LVL {levelData.level} · {title}
                  </p>
                </div>
              </div>
              <ProgressBar
                value={levelData.currentXP}
                max={levelData.xpNeeded}
                color='gold'
              />
              <div className='flex justify-between mt-1'>
                <span className='text-xs text-text-muted font-ui'>
                  {levelData.currentXP} XP
                </span>
                <span className='text-xs text-text-muted font-ui'>
                  {levelData.xpNeeded} XP
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className='flex-1 p-2 overflow-y-auto'>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-all duration-150 font-ui
                  ${
                    active
                      ? "bg-gold/10 border border-gold/30 text-gold shadow-glow-sm"
                      : "text-text-muted hover:text-text hover:bg-panel"
                  }
                `}>
                <span className='text-lg shrink-0'>{item.icon}</span>
                {!collapsed && (
                  <span className='text-sm font-medium'>{item.label}</span>
                )}
                {active && !collapsed && (
                  <span className='ml-auto w-1.5 h-1.5 rounded-full bg-gold animate-pulse' />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Streak display */}
        {!collapsed && (
          <div className='p-3 border-t border-border'>
            <div className='flex gap-2'>
              <StreakBadge
                icon='🔥'
                label='Log'
                value={streakData?.logging || 0}
              />
              <StreakBadge
                icon='🔩'
                label='Pro'
                value={streakData?.protein || 0}
              />
              <StreakBadge
                icon='⚡'
                label='Cal'
                value={streakData?.budget || 0}
              />
            </div>
          </div>
        )}

        {/* Sign out */}
        <div className='p-3 border-t border-border'>
          <button
            onClick={signOut}
            className={`flex items-center gap-2 text-text-muted hover:text-rose transition-colors font-ui text-sm w-full px-2 py-2 rounded hover:bg-rose/10 ${collapsed ? "justify-center" : ""}`}>
            <span>🚪</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className='flex-1 flex flex-col min-h-screen min-w-0'>
        {/* Mobile topbar */}
        <header className='lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-abyss sticky top-0 z-20'>
          <button
            onClick={() => setSidebarOpen(true)}
            className='text-text-muted hover:text-gold transition-colors'>
            ☰
          </button>
          <span
            className='font-pixel text-gold glow-text-gold'
            style={{fontSize: "0.8rem"}}>
            MacroQuest
          </span>
          <span className='text-sm font-ui text-text-muted'>
            LVL {levelData.level}
          </span>
        </header>

        <main className='flex-1 overflow-auto'>{children}</main>
      </div>
    </div>
  );
}

function StreakBadge({icon, label, value}) {
  return (
    <div className='flex-1 bg-deep rounded p-1.5 text-center border border-border'>
      <div className='text-sm'>{icon}</div>
      <div
        className='text-xs font-pixel text-gold'
        style={{fontSize: "0.75rem"}}>
        {value}d
      </div>
      <div
        className='text-xs text-text-muted font-ui'
        style={{fontSize: "0.75rem"}}>
        {label}
      </div>
    </div>
  );
}
