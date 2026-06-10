// ─── Weekly recap share card ───────────────────────────────────────────────────
// Renders a 1080×1080 PNG on a canvas (no deps) in the app's visual language,
// then shares via the Web Share API or falls back to a download.

const C = {
  void: '#07070f',
  panel: '#13132e',
  border: '#1e1e4a',
  gold: '#f5a623',
  text: '#e2e8f0',
  muted: '#94a3b8',
  emerald: '#34d399',
  rose: '#f43f5e',
  violet: '#a78bfa',
  crystal: '#60a5fa',
  amber: '#fbbf24',
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function statRow(ctx, x, y, w, icon, label, value, valueColor) {
  ctx.textAlign = 'left'
  ctx.font = '34px "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = C.muted
  ctx.fillText(`${icon}  ${label}`, x, y)
  ctx.textAlign = 'right'
  ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = valueColor
  ctx.fillText(value, x + w, y)
}

export function renderWeekCard({
  username, level, levelTitle, streakDays,
  avgCalories, avgProtein, questsCompleted, xpEarned,
  weightDelta, goalDirection, daysLogged,
}) {
  const S = 1080
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = C.void
  ctx.fillRect(0, 0, S, S)

  // Subtle grid
  ctx.strokeStyle = 'rgba(30,30,74,0.5)'
  ctx.lineWidth = 1
  for (let i = 0; i <= S; i += 54) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke()
  }

  // Panel
  const PX = 90, PY = 110, PW = S - PX * 2, PH = S - PY * 2
  ctx.fillStyle = C.panel
  roundRect(ctx, PX, PY, PW, PH, 28)
  ctx.fill()
  ctx.strokeStyle = C.gold
  ctx.lineWidth = 3
  roundRect(ctx, PX, PY, PW, PH, 28)
  ctx.stroke()

  // Header
  ctx.textAlign = 'center'
  ctx.fillStyle = C.gold
  ctx.font = 'bold 56px "Segoe UI", Arial, sans-serif'
  ctx.fillText('⚔️ MacroQuest', S / 2, PY + 95)
  ctx.fillStyle = C.muted
  ctx.font = '32px "Segoe UI", Arial, sans-serif'
  ctx.fillText('WEEKLY BATTLE REPORT', S / 2, PY + 145)

  // Hero line
  ctx.fillStyle = C.text
  ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif'
  ctx.fillText(username, S / 2, PY + 225)
  ctx.fillStyle = C.gold
  ctx.font = '34px "Segoe UI", Arial, sans-serif'
  ctx.fillText(`LVL ${level} · ${levelTitle}`, S / 2, PY + 275)

  // Big streak number
  ctx.fillStyle = C.rose
  ctx.font = 'bold 130px "Segoe UI", Arial, sans-serif'
  ctx.fillText(`🔥 ${streakDays}`, S / 2, PY + 430)
  ctx.fillStyle = C.muted
  ctx.font = '34px "Segoe UI", Arial, sans-serif'
  ctx.fillText('DAY STREAK', S / 2, PY + 480)

  // Divider
  ctx.strokeStyle = C.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PX + 70, PY + 525)
  ctx.lineTo(PX + PW - 70, PY + 525)
  ctx.stroke()

  // Stat rows
  const rx = PX + 80, rw = PW - 160
  let ry = PY + 595
  statRow(ctx, rx, ry, rw, '📅', 'Days logged', `${daysLogged}/7`, C.text); ry += 62
  statRow(ctx, rx, ry, rw, '⚡', 'Avg energy', `${avgCalories} EP`, C.gold); ry += 62
  statRow(ctx, rx, ry, rw, '🔩', 'Avg protein', `${avgProtein} g`, C.crystal); ry += 62
  statRow(ctx, rx, ry, rw, '🏆', 'Quests done', `${questsCompleted}`, C.emerald); ry += 62
  statRow(ctx, rx, ry, rw, '✨', 'XP earned', `${xpEarned}`, C.violet); ry += 62

  if (weightDelta != null) {
    const goalLabels = { cut: 'cutting', bulk: 'bulking', maintain: 'maintaining' }
    const good = goalDirection === 'cut' ? weightDelta < 0
      : goalDirection === 'bulk' ? weightDelta > 0
      : Math.abs(weightDelta) <= 1.5
    statRow(
      ctx, rx, ry, rw, '⚗️', `Weight (${goalLabels[goalDirection] || 'maintaining'})`,
      `${weightDelta > 0 ? '+' : ''}${weightDelta} kg`,
      good ? C.emerald : C.amber,
    )
  }

  // Footer
  ctx.textAlign = 'center'
  ctx.fillStyle = C.muted
  ctx.font = '28px "Segoe UI", Arial, sans-serif'
  ctx.fillText('Level up your nutrition · MacroQuest', S / 2, PY + PH - 45)

  return canvas
}

// Share the card (mobile native share sheet) or download it as PNG.
export async function shareWeekCard(stats) {
  const canvas = renderWeekCard(stats)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('render failed')
  const file = new File([blob], 'macroquest-week.png', { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'My MacroQuest week',
        text: `🔥 ${stats.streakDays}-day streak on MacroQuest!`,
      })
      return 'shared'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled'
      // fall through to download
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'macroquest-week.png'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}
