import { useState, useEffect } from 'react'
import axios from 'axios'
import { format, parseISO, isToday, isTomorrow, differenceInDays } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
function formatDate(d) {
  try {
    const parsed = parseISO(d)
    if (isToday(parsed)) return 'Today'
    if (isTomorrow(parsed)) return 'Tomorrow'
    const diff = differenceInDays(parsed, new Date())
    if (diff < 7) return format(parsed, 'EEEE') // e.g. "Tuesday"
    return format(parsed, 'MMM d')
  } catch { return d }
}

const FREQ_COLORS = { monthly: '#6366f1', weekly: '#f59e0b', 'bi-weekly': '#f97316', quarterly: '#8b5cf6', annual: '#84cc16', daily: '#f43f5e' }

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Building forecast…</p>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">Week of {label}</p>
      <p className="text-rose-600 font-bold">{fmt.format(payload[0]?.value || 0)}</p>
    </div>
  )
}

export default function Forecast() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(60)

  useEffect(() => { fetchData() }, [days])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/forecast', { params: { days } })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  const chartData = Object.entries(data?.weekly_buckets || {})
    .map(([week, amount]) => ({ week: format(parseISO(week), 'MMM d'), amount }))
    .sort((a, b) => a.week.localeCompare(b.week))

  const projected = data?.projected || []
  const total = data?.total_projected || 0

  // Group upcoming items by date
  const byDate = {}
  for (const p of projected) {
    if (!byDate[p.date]) byDate[p.date] = []
    byDate[p.date].push(p)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Cash Flow Forecast</h2>
          <p className="text-xs text-slate-500 mt-0.5">Projected recurring expenses based on detected patterns</p>
        </div>
        <div className="flex gap-2">
          {[30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                days === d ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500">Projected in next {days} days</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{fmt.format(total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500">Upcoming charges</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{projected.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500">Average per week</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt.format(total / Math.max(Math.ceil(days / 7), 1))}</p>
        </div>
      </div>

      {/* Weekly bar chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Weekly projected spend</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={50} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Timeline */}
      {projected.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
          <p className="font-semibold text-slate-600">No forecast data</p>
          <p className="text-sm mt-1">Not enough recurring transactions detected yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upcoming charges</p>
          </div>
          <div className="divide-y divide-slate-100">
            {Object.entries(byDate).slice(0, 20).map(([date, items]) => (
              <div key={date} className="flex gap-4 px-4 py-3">
                <div className="w-16 flex-shrink-0 text-right">
                  <p className="text-xs font-semibold text-slate-700">{formatDate(date)}</p>
                  <p className="text-[10px] text-slate-400">{format(parseISO(date), 'MMM d')}</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: FREQ_COLORS[item.frequency] || '#6366f1' }}
                        />
                        <p className="text-sm text-slate-700 font-medium truncate">{item.merchant}</p>
                        <span className="text-[10px] text-slate-400 capitalize flex-shrink-0">{item.frequency}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 flex-shrink-0">
                        {fmt.format(item.amount)}
                        {!item.amount_fixed && <span className="text-[10px] font-normal text-slate-400 ml-1">est.</span>}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="w-20 flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-rose-600">{fmt.format(items.reduce((s, i) => s + i.amount, 0))}</p>
                </div>
              </div>
            ))}
            {Object.keys(byDate).length > 20 && (
              <div className="px-4 py-3 text-xs text-slate-400 text-center">
                +{projected.length - Object.values(byDate).slice(0, 20).flat().length} more charges not shown
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
