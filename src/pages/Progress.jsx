import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore, useGameStore } from '../store'
import { Spinner } from '../components/ui'

export default function Progress() {
  const { user } = useAuthStore()
  const { weightHistory, todayWeight, loadWeightHistory, logWeight, deleteWeight } = useGameStore()
  const [inputKg, setInputKg] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    loadWeightHistory(user.id).finally(() => setLoading(false))
  }, [user?.id])

  const sorted = [...weightHistory].sort((a, b) => a.date.localeCompare(b.date))
  const startWeight = sorted[0]?.weight_kg ?? null
  const currentWeight = sorted[sorted.length - 1]?.weight_kg ?? null
  const delta = startWeight != null && currentWeight != null ? +(currentWeight - startWeight).toFixed(1) : null

  const handleLog = async () => {
    const kg = parseFloat(inputKg)
    if (!kg || kg < 20 || kg > 500) {
      toast.error('Enter a valid weight between 20 and 500 kg')
      return
    }
    setSaving(true)
    try {
      await logWeight(user.id, +kg.toFixed(1))
      setInputKg('')
      toast.success('⚗️ Power reading recorded!')
    } catch {
      toast.error('Failed to save weight')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (date) => {
    try {
      await deleteWeight(user.id, date)
      toast.success('Reading removed')
    } catch {
      toast.error('Failed to remove reading')
    }
  }

  return (
    <div className='p-4 lg:p-6 space-y-6 max-w-3xl mx-auto'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='font-pixel text-crystal' style={{ fontSize: '0.85rem' }}>⚗️ BODY FORGE</h1>
          <p className='text-text-muted font-ui text-sm mt-1'>
            Track your power level over time · one reading per day
          </p>
        </div>
        {loading && <Spinner size='sm' />}
      </div>

      {/* Log + Stats */}
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        {/* Input card */}
        <div className='panel p-4'>
          <p className='font-ui font-semibold text-text text-sm mb-3'>Log Today's Reading</p>
          <div className='flex gap-2'>
            <input
              type='number'
              value={inputKg}
              onChange={(e) => setInputKg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLog()}
              placeholder={todayWeight != null ? `${todayWeight} kg (update)` : 'e.g. 75.5'}
              step='0.1'
              min='20'
              max='500'
              className='flex-1 bg-deep border border-border rounded-lg px-3 py-2 text-text font-ui text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-crystal/60'
            />
            <button
              onClick={handleLog}
              disabled={saving || !inputKg.trim()}
              className='bg-crystal/20 hover:bg-crystal/30 border border-crystal/40 text-crystal px-4 rounded-lg transition-colors disabled:opacity-40 font-ui text-sm font-semibold'
            >
              {saving ? <Spinner size='sm' /> : '⚡'}
            </button>
          </div>
          <p className='text-xs text-text-muted font-ui mt-2'>
            {todayWeight != null
              ? `Today's reading: ${todayWeight} kg · submit to update`
              : 'No reading logged today'}
          </p>
        </div>

        {/* Stats grid */}
        <div className='grid grid-cols-2 gap-3'>
          <MetricTile label='Starting' value={startWeight != null ? `${startWeight} kg` : '–'} />
          <MetricTile label='Current' value={currentWeight != null ? `${currentWeight} kg` : '–'} color='text-crystal' />
          <MetricTile
            label='Change'
            value={delta != null ? `${delta > 0 ? '+' : ''}${delta} kg` : '–'}
            color={
              delta == null ? 'text-text'
              : delta < 0 ? 'text-emerald'
              : delta > 0 ? 'text-rose'
              : 'text-gold'
            }
          />
          <MetricTile label='Readings' value={weightHistory.length} />
        </div>
      </div>

      {/* Chart */}
      <div className='panel p-4'>
        <p className='font-ui font-semibold text-text text-sm mb-4'>📈 Power Level Trend (last 30 days)</p>
        {sorted.length >= 2 ? (
          <WeightChart data={sorted.slice(-30)} />
        ) : (
          <div className='text-center py-8'>
            <p className='text-3xl mb-2'>⚗️</p>
            <p className='font-ui text-text-muted text-sm'>Log at least 2 readings to see your trend</p>
          </div>
        )}
      </div>

      {/* History list */}
      {sorted.length > 0 && (
        <section>
          <h3 className='font-pixel text-text mb-3' style={{ fontSize: '0.75rem' }}>📋 READING HISTORY</h3>
          <div className='space-y-2'>
            {[...sorted].reverse().slice(0, 30).map((entry, i, arr) => {
              const [y, m, d] = entry.date.split('-').map(Number)
              const label = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
                weekday: 'short', month: 'short', day: 'numeric',
              })
              const prev = arr[i + 1]
              const diff = prev ? +(entry.weight_kg - prev.weight_kg).toFixed(1) : null
              return (
                <div key={entry.date} className='panel-deep p-3 flex items-center justify-between'>
                  <div>
                    <p className='font-ui font-semibold text-sm text-text'>{label}</p>
                    {diff != null && (
                      <p className={`text-xs font-ui ${diff < 0 ? 'text-emerald' : diff > 0 ? 'text-rose' : 'text-text-muted'}`}>
                        {diff > 0 ? '+' : ''}{diff} kg from prev
                      </p>
                    )}
                  </div>
                  <div className='flex items-center gap-3'>
                    <span className='font-ui font-bold text-crystal text-sm'>{entry.weight_kg} kg</span>
                    <button
                      onClick={() => handleDelete(entry.date)}
                      className='text-text-muted hover:text-rose transition-colors text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-rose/10'
                      title='Remove reading'
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {sorted.length === 0 && !loading && (
        <div className='text-center py-12'>
          <p className='text-5xl mb-3'>⚗️</p>
          <p className='font-pixel text-text-muted' style={{ fontSize: '0.7rem' }}>NO READINGS YET</p>
          <p className='font-ui text-text-muted text-sm mt-2'>
            Log your weight each day to track your progress over time.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricTile({ label, value, color = 'text-text' }) {
  return (
    <div className='bg-deep rounded-lg p-3 border border-border text-center'>
      <p className='text-xs text-text-muted font-ui mb-1'>{label}</p>
      <p className={`font-ui font-bold text-sm ${color}`}>{value}</p>
    </div>
  )
}

function WeightChart({ data }) {
  if (data.length < 2) return null

  const SVG_W = 520
  const SVG_H = 190
  const PAD_L = 46
  const PAD_R = 12
  const PAD_T = 12
  const PAD_B = 36
  const plotW = SVG_W - PAD_L - PAD_R
  const plotH = SVG_H - PAD_T - PAD_B

  const weights = data.map(d => +d.weight_kg)
  const rawMin = Math.min(...weights)
  const rawMax = Math.max(...weights)

  // Pick a "nice" axis step so labels land on round numbers
  const range = rawMax - rawMin || 1
  const niceSteps = [0.5, 1, 2, 5, 10, 20]
  const step = niceSteps.find(s => s >= range / 4) || 20
  const domainMin = Math.floor(rawMin / step) * step
  const domainMax = Math.ceil(rawMax / step) * step
  const domainRange = domainMax - domainMin || step

  const toX = (i) => PAD_L + (i / (data.length - 1)) * plotW
  const toY = (w) => PAD_T + ((domainMax - w) / domainRange) * plotH

  const pts = data.map((d, i) => [toX(i), toY(+d.weight_kg)])
  const linePath = 'M ' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)},${(PAD_T + plotH).toFixed(1)} L ${pts[0][0].toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`

  // Y-axis gridlines
  const yLines = []
  for (let w = domainMin; w <= domainMax + 0.001; w += step) {
    yLines.push(+w.toFixed(2))
  }

  // X-axis labels — avoid crowding
  const labelEvery = data.length <= 7 ? 1 : data.length <= 14 ? 2 : data.length <= 21 ? 3 : 5

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className='w-full'
      style={{ height: `${SVG_H}px`, maxHeight: '200px' }}
    >
      <defs>
        <linearGradient id='bfAreaGrad' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor='#a78bfa' stopOpacity='0.35' />
          <stop offset='100%' stopColor='#a78bfa' stopOpacity='0' />
        </linearGradient>
      </defs>

      {/* Grid lines + Y labels */}
      {yLines.map((w) => {
        const y = toY(w)
        return (
          <g key={w}>
            <line
              x1={PAD_L} y1={y.toFixed(1)}
              x2={SVG_W - PAD_R} y2={y.toFixed(1)}
              stroke='#1e1e4a' strokeWidth='1'
            />
            <text
              x={PAD_L - 5} y={(y + 4).toFixed(1)}
              fontSize='10' fill='#6b7280'
              textAnchor='end'
              fontFamily='"Exo 2", sans-serif'
            >
              {w % 1 === 0 ? w : w.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* Area fill */}
      <path d={areaPath} fill='url(#bfAreaGrad)' />

      {/* Line */}
      <path
        d={linePath}
        fill='none'
        stroke='#a78bfa'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />

      {/* Dots */}
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x.toFixed(1)} cy={y.toFixed(1)}
          r='3.5'
          fill='#f5a623'
          stroke='#07070f'
          strokeWidth='1.5'
        />
      ))}

      {/* X-axis date labels */}
      {data.map((d, i) => {
        const isLast = i === data.length - 1
        if (i % labelEvery !== 0 && !isLast) return null
        const [y, m, day] = d.date.split('-').map(Number)
        const label = new Date(y, m - 1, day).toLocaleDateString('en-IN', {
          month: 'short', day: 'numeric',
        })
        return (
          <text
            key={i}
            x={toX(i).toFixed(1)}
            y={SVG_H - 6}
            fontSize='9'
            fill='#6b7280'
            textAnchor='middle'
            fontFamily='"Exo 2", sans-serif'
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}
