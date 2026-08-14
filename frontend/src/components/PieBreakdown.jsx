import { useMemo, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const PIE_SLICE_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4']
export const OTHER_SLICE_COLOR = '#94a3b8'
const MIN_LABEL_PERCENT = 0.05

// ── Generic top-N + "Other" slice builder, shared by category & merchant views ──
export function buildPieSlices(records, {
  getId,
  getName,
  getValue,
  getCount = () => undefined,
  getTransactions = () => [],
  topN = 7,
  otherId = '__other__',
  otherName = 'Other',
} = {}) {
  const positive = records.filter(r => getValue(r) > 0)
  const byTotal = [...positive].sort((a, b) => getValue(b) - getValue(a))
  const top = byTotal.slice(0, topN)
  const rest = byTotal.slice(topN)

  const slices = []
  const byId = {}

  top.forEach((r, i) => {
    const value = getValue(r)
    const slice = {
      id: getId(r),
      name: getName(r),
      value,
      logValue: Math.log10(value + 1),
      color: PIE_SLICE_COLORS[i % PIE_SLICE_COLORS.length],
      isOther: false,
      count: getCount(r),
      transactions: getTransactions(r),
    }
    slices.push(slice)
    byId[slice.id] = slice
  })

  rest.forEach(r => {
    byId[getId(r)] = {
      id: getId(r),
      name: getName(r),
      value: getValue(r),
      logValue: Math.log10(getValue(r) + 1),
      color: OTHER_SLICE_COLOR,
      isOther: true,
      count: getCount(r),
      transactions: getTransactions(r),
    }
  })

  if (rest.length > 0) {
    const value = rest.reduce((s, r) => s + getValue(r), 0)
    const counts = rest.map(getCount)
    const otherSlice = {
      id: otherId,
      name: otherName,
      value,
      logValue: Math.log10(value + 1),
      color: OTHER_SLICE_COLOR,
      isOther: true,
      count: counts.every(c => c === undefined) ? undefined : counts.reduce((s, c) => s + (c || 0), 0),
      transactions: rest.flatMap(getTransactions),
    }
    slices.push(otherSlice)
    byId[otherId] = otherSlice
  }

  return { slices, byId }
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function SliceLabel({ cx, cy, midAngle, outerRadius, index, slices, totalValue }) {
  const s = slices[index]
  if (!s || totalValue <= 0) return null
  const pct = s.value / totalValue
  if (pct < MIN_LABEL_PERCENT) return null
  const { x, y } = polarToCartesian(cx, cy, outerRadius + 14, midAngle)
  return (
    <text x={x} y={y} textAnchor={x >= cx ? 'start' : 'end'} dominantBaseline="central" fontSize={10} fontWeight={600} fill="#64748b" pointerEvents="none">
      {(pct * 100).toFixed(0)}%
    </text>
  )
}

function CustomTooltip({ active, payload, totalValue }) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  const pct = totalValue > 0 ? ((s.value / totalValue) * 100).toFixed(1) : '0.0'
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-800 mb-1">{s.name}</p>
      <p className="text-rose-600 font-bold">{fmt.format(s.value)}</p>
      <p className="text-slate-400 mt-0.5">{pct}% of total</p>
    </div>
  )
}

function ChevronButton({ direction, onClick, disabled }) {
  const d = direction === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Previous slice' : 'Next slice'}
      title={direction === 'left' ? 'Previous slice (←)' : 'Next slice (→)'}
      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </button>
  )
}

export default function PieBreakdown({
  title,
  slices,
  selectedId,
  onSelect,
  centerContent,
  emptyHint = 'Click a slice to see transactions',
  height = 320,
}) {
  const totalValue = useMemo(() => slices.reduce((s, x) => s + x.value, 0), [slices])

  function gotoRelative(delta) {
    if (slices.length === 0) return
    const cur = selectedId ? slices.findIndex(s => s.id === selectedId) : -1
    const next = cur === -1 ? (delta > 0 ? 0 : slices.length - 1) : (cur + delta + slices.length) % slices.length
    onSelect(slices[next].id)
  }

  // Left/right arrow keys cycle slices, unless the user is typing somewhere (search box,
  // date inputs, bulk-categorize field) — those need their native arrow-key behavior.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.altKey || e.ctrlKey || e.metaKey || slices.length === 0) return
      const el = document.activeElement
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return
      e.preventDefault()
      gotoRelative(e.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slices, selectedId, onSelect])

  if (slices.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <div className="flex items-center gap-2">
          {!selectedId && <p className="text-xs text-slate-400 hidden sm:block">{emptyHint}</p>}
          {selectedId && (
            <button onClick={() => onSelect(null)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
          <div className="flex items-center gap-0.5 border-l border-slate-200 pl-2">
            <ChevronButton direction="left" onClick={() => gotoRelative(-1)} disabled={slices.length === 0} />
            <ChevronButton direction="right" onClick={() => gotoRelative(1)} disabled={slices.length === 0} />
          </div>
        </div>
      </div>

      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Tooltip content={<CustomTooltip totalValue={totalValue} />} />
            <Pie
              data={slices}
              dataKey="logValue"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              isAnimationActive={false}
              label={<SliceLabel slices={slices} totalValue={totalValue} />}
              labelLine={false}
              onClick={(_, index) => {
                const s = slices[index]
                if (s) onSelect(selectedId === s.id ? null : s.id)
              }}
              style={{ cursor: 'pointer' }}
            >
              {slices.map(s => (
                <Cell key={s.id} fill={s.color} opacity={selectedId && selectedId !== s.id ? 0.25 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {centerContent}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 justify-center">
        {slices.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(selectedId === s.id ? null : s.id)}
            className={`flex items-center gap-1.5 text-xs transition-opacity ${selectedId && selectedId !== s.id ? 'opacity-40' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-slate-700">{s.name}</span>
            <span className="text-slate-400">{fmt.format(s.value)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
