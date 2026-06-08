import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore, useGameStore } from '../store'
import { Spinner } from '../components/ui'
import {
  pushSupported, iosNeedsInstall, permissionState,
  enablePush, disablePush, isSubscribedHere,
} from '../lib/notifications'

// Constrained to 8 AM–8 PM so a chosen reminder never lands inside quiet hours.
const HOUR_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

function fmtHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:00 ${ampm}`
}

export default function Settings() {
  const { user } = useAuthStore()
  const { profile, updateNotificationPrefs } = useGameStore()

  const [supported] = useState(pushSupported())
  const [iosInstall] = useState(iosNeedsInstall())
  const [perm, setPerm] = useState(permissionState())
  const [subscribedHere, setSubscribedHere] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    isSubscribedHere()
      .then(v => { if (active) setSubscribedHere(v) })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  // Local mirrors of server prefs (with sane fallbacks)
  const dailyOn   = profile?.push_daily_reminder ?? true
  const streakOn  = profile?.push_streak_saver ?? true
  const emailOn   = profile?.email_digest_enabled ?? true
  const reminderHour = profile?.daily_reminder_hour ?? 12

  const savePref = async (patch) => {
    try {
      await updateNotificationPrefs(user.id, patch)
    } catch {
      toast.error('Could not save — try again')
    }
  }

  const handleEnable = async () => {
    setBusy(true)
    try {
      const res = await enablePush(user.id)
      if (res.ok) {
        setSubscribedHere(true)
        setPerm('granted')
        toast.success('🔔 Notifications enabled on this device')
        // Client-side confirmation that the SW pipeline works
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        reg?.showNotification('⚔️ MacroQuest', {
          body: "You're all set — I'll nudge you so your streak stays alive!",
          icon: '/favicon.svg', badge: '/favicon.svg', tag: 'welcome',
        }).catch(() => {})
      } else {
        const messages = {
          unsupported: "This browser doesn't support push notifications.",
          'ios-install': 'On iPhone/iPad, add MacroQuest to your Home Screen first, then enable alerts from there.',
          denied: 'Notifications are blocked. Enable them in your browser settings, then reload.',
          'no-keys': 'Subscription failed — your browser returned an incomplete key.',
          'save-failed': 'Subscription created but saving failed. Try again.',
        }
        toast.error(messages[res.reason] || 'Could not enable notifications')
        setPerm(permissionState())
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    setBusy(true)
    try {
      await disablePush()
      setSubscribedHere(false)
      toast.success('Notifications disabled on this device')
    } catch {
      toast.error('Could not disable — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='p-4 lg:p-6 space-y-6 max-w-2xl mx-auto'>
      <div>
        <h1 className='font-pixel text-gold' style={{ fontSize: '0.85rem' }}>⚙️ SETTINGS</h1>
        <p className='text-text-muted font-ui text-sm mt-1'>
          Reminders and digests to keep your quest on track
        </p>
      </div>

      {/* ── Push notifications ── */}
      <section className='panel p-5 space-y-4'>
        <div className='flex items-center gap-2'>
          <span className='text-xl'>🔔</span>
          <h2 className='font-ui font-bold text-text'>Push Notifications</h2>
        </div>

        {/* Device-level status / enable control */}
        {!supported ? (
          <Notice tone='muted'>
            This browser doesn't support push notifications. Try Chrome, Edge, or Firefox on desktop or Android.
          </Notice>
        ) : iosInstall ? (
          <Notice tone='warn'>
            📲 On iPhone/iPad, web notifications only work when MacroQuest is added to your Home Screen.
            Open the Share menu → <strong>Add to Home Screen</strong>, then open it from there and return here.
          </Notice>
        ) : perm === 'denied' ? (
          <Notice tone='warn'>
            Notifications are <strong>blocked</strong> for this site. Enable them in your browser's site settings, then reload this page.
          </Notice>
        ) : checking ? (
          <div className='flex items-center gap-2 text-text-muted font-ui text-sm'>
            <Spinner size='sm' /> Checking device…
          </div>
        ) : subscribedHere ? (
          <div className='flex items-center justify-between gap-3 flex-wrap'>
            <span className='font-ui text-sm text-emerald'>✓ Enabled on this device</span>
            <button onClick={handleDisable} disabled={busy}
              className='btn-ghost text-xs py-1.5 px-3'>
              {busy ? '…' : 'Disable on this device'}
            </button>
          </div>
        ) : (
          <div className='flex items-center justify-between gap-3 flex-wrap'>
            <span className='font-ui text-sm text-text-muted'>Not enabled on this device</span>
            <button onClick={handleEnable} disabled={busy}
              className='btn-primary text-xs py-2 px-4'>
              {busy ? '…' : '🔔 Enable notifications'}
            </button>
          </div>
        )}

        {/* Per-type preferences (apply across all your devices) */}
        {supported && !iosInstall && (
          <div className={`space-y-3 pt-3 border-t border-border ${subscribedHere ? '' : 'opacity-50 pointer-events-none'}`}>
            <ToggleRow
              label='Streak saver'
              desc='Evening nudge at 8 PM only if you haven’t logged and a streak is at risk'
              checked={streakOn}
              onChange={(v) => savePref({ push_streak_saver: v })}
            />
            <ToggleRow
              label='Daily log reminder'
              desc='A gentle reminder to log your meals'
              checked={dailyOn}
              onChange={(v) => savePref({ push_daily_reminder: v })}
            />
            {dailyOn && (
              <div className='flex items-center justify-between pl-1'>
                <span className='font-ui text-sm text-text-muted'>Reminder time</span>
                <select
                  value={reminderHour}
                  onChange={(e) => savePref({ daily_reminder_hour: Number(e.target.value) })}
                  className='bg-deep border border-border rounded-lg px-3 py-1.5 text-text font-ui text-sm focus:outline-none focus:border-gold/60'
                >
                  {HOUR_OPTIONS.map(h => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
              </div>
            )}
            <p className='text-xs text-text-muted font-ui'>
              Quiet hours are always respected — nothing fires between 10 PM and 8 AM.
            </p>
          </div>
        )}
      </section>

      {/* ── Email digest ── */}
      <section className='panel p-5 space-y-4'>
        <div className='flex items-center gap-2'>
          <span className='text-xl'>📬</span>
          <h2 className='font-ui font-bold text-text'>Email Digest</h2>
        </div>
        <ToggleRow
          label='Progress digest'
          desc={`A battle report every 2 days at 1 PM${user?.email ? ` to ${user.email}` : ''}`}
          checked={emailOn}
          onChange={(v) => savePref({ email_digest_enabled: v })}
        />
        <p className='text-xs text-text-muted font-ui'>
          Includes your streak, weekly averages, weight trend, and a mission for the days ahead.
        </p>
      </section>
    </div>
  )
}

// ── Small UI helpers ───────────────────────────────────────────────────────────

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className='flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <p className='font-ui font-semibold text-sm text-text'>{label}</p>
        <p className='text-xs text-text-muted font-ui mt-0.5'>{desc}</p>
      </div>
      <button
        role='switch'
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-gold/80' : 'bg-deep border border-border'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  )
}

function Notice({ children, tone = 'muted' }) {
  const tones = {
    muted: 'border-border text-text-muted',
    warn: 'border-amber/40 text-amber',
  }
  return (
    <div className={`rounded-lg border px-3 py-2.5 font-ui text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}
