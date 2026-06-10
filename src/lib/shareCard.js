// ─── Weekly recap share card ───────────────────────────────────────────────────
// Renders a 1080×1080 PNG on a canvas (no external deps) then shares via the
// Web Share API (mobile) or downloads as a file (desktop).
//
// Design rules:
//   • No emoji inside ctx.fillText() — emoji shift text baselines unpredictably
//     across platforms. Colored dot indicators replace icon columns.
//   • All Y positions derive from a single layout table so nothing overflows.
//   • Download fallback appends <a> to the DOM before .click() — required by
//     Chromium 120+ when triggered from async code.

const C = {
  void:    '#07070f',
  panel:   '#13132e',
  border:  '#1e1e4a',
  gold:    '#f5a623',
  text:    '#e2e8f0',
  muted:   '#94a3b8',
  emerald: '#34d399',
  rose:    '#f43f5e',
  violet:  '#a78bfa',
  crystal: '#60a5fa',
  amber:   '#fbbf24',
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

// Colored dot + plain-text label left, bold value right.
// y is the text baseline; dot is centered 11px above it.
function statRow(ctx, x, y, w, dotColor, label, value, valueColor) {
  ctx.fillStyle = dotColor
  ctx.beginPath()
  ctx.arc(x + 9, y - 11, 8, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.font = '32px "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = C.muted
  ctx.fillText(label, x + 26, y)

  ctx.textAlign = 'right'
  ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif'
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
  ctx.strokeStyle = 'rgba(30,30,74,0.4)'
  ctx.lineWidth = 1
  for (let i = 0; i <= S; i += 60) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke()
  }

  // Panel  (60px margin all sides → 960×960)
  const PX = 60, PY = 60, PW = S - 120, PH = S - 120
  ctx.fillStyle = C.panel
  roundRect(ctx, PX, PY, PW, PH, 28)
  ctx.fill()
  ctx.strokeStyle = C.gold
  ctx.lineWidth = 3
  roundRect(ctx, PX, PY, PW, PH, 28)
  ctx.stroke()

  const cx = S / 2
  const rx = PX + 76
  const rw = PW - 152
  const ROW_H = 60

  // Absolute Y baselines — derived from PY so nothing can overflow the panel
  const Y = {
    brand:      PY + 78,        // 138  "MacroQuest"
    subtitle:   PY + 122,       // 182  "WEEKLY BATTLE REPORT"
    username:   PY + 210,       // 270  player name
    levelLine:  PY + 258,       // 318  "LVL 5 · Iron Tracker"
    streakNum:  PY + 400,       // 460  big streak count
    streakLbl:  PY + 444,       // 504  "DAY STREAK"
    divider:    PY + 484,       // 544
    statsStart: PY + 550,       // 610  first stat row
    footer:     PY + PH - 44,   // 976
  }

  // Brand header
  ctx.textAlign = 'center'
  ctx.fillStyle = C.gold
  ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif'
  ctx.fillText('MacroQuest', cx, Y.brand)

  ctx.fillStyle = C.muted
  ctx.font = '28px "Segoe UI", Arial, sans-serif'
  ctx.fillText('WEEKLY BATTLE REPORT', cx, Y.subtitle)

  // Username + level
  ctx.fillStyle = C.text
  ctx.font = 'bold 46px "Segoe UI", Arial, sans-serif'
  ctx.fillText(username, cx, Y.username)

  ctx.fillStyle = C.gold
  ctx.font = '34px "Segoe UI", Arial, sans-serif'
  ctx.fillText(`LVL ${level}  ·  ${levelTitle}`, cx, Y.levelLine)

  // Streak pill background
  const pillW = 260, pillH = 130
  ctx.fillStyle = 'rgba(244,63,94,0.12)'
  roundRect(ctx, cx - pillW / 2, Y.streakNum - 92, pillW, pillH, 20)
  ctx.fill()

  // Big streak number (no emoji — reliable on all platforms)
  ctx.textAlign = 'center'
  ctx.fillStyle = C.rose
  ctx.font = 'bold 100px "Segoe UI", Arial, sans-serif'
  ctx.fillText(`${streakDays}`, cx, Y.streakNum)

  ctx.fillStyle = C.muted
  ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif'
  ctx.fillText('DAY STREAK', cx, Y.streakLbl)

  // Divider
  ctx.strokeStyle = C.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PX + 80, Y.divider)
  ctx.lineTo(PX + PW - 80, Y.divider)
  ctx.stroke()

  // Stat rows
  let ry = Y.statsStart
  statRow(ctx, rx, ry, rw, C.crystal,  'Days logged',  `${daysLogged} / 7`,   C.text);    ry += ROW_H
  statRow(ctx, rx, ry, rw, C.gold,     'Avg energy',   `${avgCalories} EP`,   C.gold);    ry += ROW_H
  statRow(ctx, rx, ry, rw, C.crystal,  'Avg protein',  `${avgProtein} g`,     C.crystal); ry += ROW_H
  statRow(ctx, rx, ry, rw, C.emerald,  'Quests done',  `${questsCompleted}`,  C.emerald); ry += ROW_H
  statRow(ctx, rx, ry, rw, C.violet,   'XP earned',    `${xpEarned}`,         C.violet);  ry += ROW_H

  if (weightDelta != null) {
    const goalLabels = { cut: 'cutting', bulk: 'bulking', maintain: 'maintaining' }
    const good = goalDirection === 'cut'  ? weightDelta < 0
               : goalDirection === 'bulk' ? weightDelta > 0
               : Math.abs(weightDelta) <= 1.5
    const sign = weightDelta > 0 ? '+' : ''
    statRow(
      ctx, rx, ry, rw, good ? C.emerald : C.amber,
      `Weight (${goalLabels[goalDirection] || 'maintaining'})`,
      `${sign}${weightDelta} kg`,
      good ? C.emerald : C.amber,
    )
  }

  // Footer
  ctx.textAlign = 'center'
  ctx.fillStyle = C.muted
  ctx.font = '26px "Segoe UI", Arial, sans-serif'
  ctx.fillText('Level up your nutrition  ·  MacroQuest', cx, Y.footer)

  return canvas
}

// Share via native share sheet (mobile) or download (desktop).
export async function shareWeekCard(stats) {
  const canvas = renderWeekCard(stats)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Canvas render failed')

  const file = new File([blob], 'macroquest-week.png', { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'My MacroQuest week',
        text: `${stats.streakDays}-day streak on MacroQuest!`,
      })
      return 'shared'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled'
      // fall through to download on other errors
    }
  }

  // Download fallback — must be appended to DOM before .click() in async context
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'macroquest-week.png'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}
