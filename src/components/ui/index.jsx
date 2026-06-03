import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...args) { return twMerge(clsx(args)) }

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = 'gold', className, showLabel = false, label }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const colorMap = {
    gold:    'from-gold to-amber',
    emerald: 'from-emerald to-emerald/70',
    crystal: 'from-crystal to-crystal/70',
    rose:    'from-rose to-rose/70',
    violet:  'from-violet to-violet/70',
    wood:    'from-wood to-wood/70',
    amber:   'from-amber to-amber/70',
  }
  return (
    <div className={cn('relative', className)}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs text-text-muted font-ui">{label}</span>
          <span className="text-xs text-text font-ui font-semibold">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="xp-bar">
        <div
          className={cn('h-full bg-gradient-to-r rounded-full transition-all duration-700', colorMap[color] || colorMap.gold)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Resource Chip ─────────────────────────────────────────────────────────────
export function ResourceChip({ type, amount, size = 'sm' }) {
  const configs = {
    energy:  { icon: '⚡', label: 'EP',  bg: 'bg-gold/15',    text: 'text-gold'    },
    iron:    { icon: '🔩', label: 'Fe',  bg: 'bg-iron/15',    text: 'text-iron'    },
    wood:    { icon: '🪵', label: 'WD',  bg: 'bg-amber/15',   text: 'text-amber'   },
    gold:    { icon: '✨', label: 'AU',  bg: 'bg-amber/15',   text: 'text-amber'   },
    stamina: { icon: '💎', label: 'ST',  bg: 'bg-crystal/15', text: 'text-crystal' },
    xp:      { icon: '⭐', label: 'XP',  bg: 'bg-violet/15',  text: 'text-violet'  },
  }
  const c = configs[type] || configs.energy
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
  return (
    <span className={cn('resource-chip', c.bg, c.text, sizeClass)}>
      <span>{c.icon}</span>
      <span className="font-semibold">+{amount}</span>
      <span className="opacity-70">{c.label}</span>
    </span>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = 'text-gold', icon, trend, className }) {
  return (
    <div className={cn('panel p-4 flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted font-ui uppercase tracking-widest">{label}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className={cn('text-2xl font-pixel', color)} style={{ fontSize: '1.1rem' }}>
        {value}
      </div>
      {sub && <p className="text-xs text-text-muted font-ui">{sub}</p>}
      {trend && (
        <span className={cn('text-xs font-ui', trend > 0 ? 'text-emerald' : 'text-rose')}>
          {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
        </span>
      )}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ children, variant = 'default', className }) {
  const variants = {
    default:  'bg-border text-text-muted',
    gold:     'bg-gold/15 text-gold border border-gold/30',
    emerald:  'bg-emerald/15 text-emerald border border-emerald/30',
    crystal:  'bg-crystal/15 text-crystal border border-crystal/30',
    violet:   'bg-violet/15 text-violet border border-violet/30',
    rose:     'bg-rose/15 text-rose border border-rose/30',
    EASY:     'bg-emerald/15 text-emerald border border-emerald/30',
    MEDIUM:   'bg-crystal/15 text-crystal border border-crystal/30',
    HARD:     'bg-violet/15 text-violet border border-violet/30',
    LEGENDARY:'bg-gold/15 text-gold border border-gold/30',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-ui font-semibold', variants[variant] || variants.default, className)}>
      {children}
    </span>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={cn('relative', sizes[size], className)}>
      <div className="absolute inset-0 border-2 border-border rounded-full" />
      <div className="absolute inset-0 border-2 border-t-gold border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-pixel text-text mb-2" style={{ fontSize: '0.75rem' }}>{title}</h3>
      <p className="text-text-muted font-ui text-sm max-w-xs mb-4">{desc}</p>
      {action}
    </div>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ label, className }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex-1 h-px bg-border" />
      {label && <span className="text-xs text-text-muted font-ui uppercase tracking-widest">{label}</span>}
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({ className, icon, ...props }) {
  return (
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">{icon}</span>}
      <input
        className={cn(
          'w-full bg-abyss border border-border rounded px-3 py-2.5',
          'text-text font-ui text-sm placeholder:text-text-muted/50',
          'focus:outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/20',
          'transition-colors duration-150',
          icon && 'pl-9',
          className
        )}
        {...props}
      />
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, children, title }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
      <div
        className="relative panel w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-pixel text-gold" style={{ fontSize: '0.8rem' }}>{title}</h2>
            <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
export function Tooltip({ children, text }) {
  return (
    <div className="relative group">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-panel border border-border rounded text-xs font-ui text-text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {text}
      </div>
    </div>
  )
}
