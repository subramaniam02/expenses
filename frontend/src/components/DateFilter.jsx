import { useState } from 'react'
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns'

const today = () => new Date()

const PRESETS = [
  { label: 'This Month',   getRange: () => ({ start: startOfMonth(today()), end: today() }) },
  { label: 'Last Month',   getRange: () => { const l = subMonths(today(), 1); return { start: startOfMonth(l), end: endOfMonth(l) } } },
  { label: 'Last 3M',      getRange: () => ({ start: startOfMonth(subMonths(today(), 2)), end: today() }), default: true },
  { label: 'Last 6M',      getRange: () => ({ start: startOfMonth(subMonths(today(), 5)), end: today() }) },
  { label: 'Last 9M',      getRange: () => ({ start: startOfMonth(subMonths(today(), 8)), end: today() }) },
  { label: 'Last 12M',     getRange: () => ({ start: startOfMonth(subMonths(today(), 11)), end: today() }) },
  { label: 'Last Year',    getRange: () => { const l = subYears(today(), 1); return { start: startOfYear(l), end: endOfYear(l) } } },
  { label: 'This Year',    getRange: () => ({ start: startOfYear(today()), end: today() }) },
]

export default function DateFilter({ dateRange, onChange }) {
  const [activePreset, setActivePreset] = useState('Last 3M')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  function handlePreset(preset) {
    setActivePreset(preset.label)
    onChange(preset.getRange())
    setCustomStart('')
    setCustomEnd('')
  }

  function handleApply() {
    if (customStart && customEnd) {
      setActivePreset(null)
      onChange({ start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') })
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset pills */}
      <div className="flex items-center gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => handlePreset(p)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-100 border ${
              activePreset === p.label
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-slate-200 mx-1" />

      {/* Custom range */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={customStart}
          onChange={e => setCustomStart(e.target.value)}
          className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 w-32"
        />
        <span className="text-slate-400 text-xs">→</span>
        <input
          type="date"
          value={customEnd}
          onChange={e => setCustomEnd(e.target.value)}
          className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 w-32"
        />
        <button
          onClick={handleApply}
          disabled={!customStart || !customEnd}
          className="px-2.5 py-1 bg-slate-800 text-white text-xs font-medium rounded-md hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
