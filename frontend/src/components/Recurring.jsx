import { useState, useEffect } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }

const FREQ_STYLES = {
  daily:      'bg-rose-50 text-rose-700 border border-rose-200',
  weekly:     'bg-amber-50 text-amber-700 border border-amber-200',
  'bi-weekly':'bg-orange-50 text-orange-700 border border-orange-200',
  monthly:    'bg-indigo-50 text-indigo-700 border border-indigo-200',
  quarterly:  'bg-violet-50 text-violet-700 border border-violet-200',
  annual:     'bg-slate-100 text-slate-700 border border-slate-200',
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Detecting recurring transactions…</p>
      </div>
    </div>
  )
}

export default function Recurring() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [freqFilter, setFreqFilter] = useState('all')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/recurring')
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const frequencies = ['all', ...Array.from(new Set(data.map(d => d.frequency)))]
  const filtered = freqFilter === 'all' ? data : data.filter(d => d.frequency === freqFilter)

  const monthlyTotal = data
    .filter(d => d.frequency === 'monthly')
    .reduce((s, d) => s + d.avg_amount, 0)
  const annualProjection = data.reduce((s, d) => {
    const multiplier = { daily: 365, weekly: 52, 'bi-weekly': 26, monthly: 12, quarterly: 4, annual: 1 }
    return s + d.avg_amount * (multiplier[d.frequency] || 1)
  }, 0)

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  if (data.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
      <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      <p className="font-semibold text-slate-600">No recurring transactions detected</p>
      <p className="text-sm mt-1">Need at least 2 transactions from the same merchant at regular intervals.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Recurring Transactions</h2>
          <p className="text-xs text-slate-500 mt-0.5">Subscriptions and regular charges detected automatically</p>
        </div>
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">{data.length} detected</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500">Monthly fixed costs</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt.format(monthlyTotal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500">Projected annual spend</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{fmt.format(annualProjection)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500">Subscriptions / services</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{data.length}</p>
        </div>
      </div>

      {/* Frequency filter */}
      <div className="flex gap-2 flex-wrap">
        {frequencies.map(f => (
          <button
            key={f}
            onClick={() => setFreqFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
              freqFilter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}
          >
            {f === 'all' ? 'All frequencies' : f}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((item, i) => {
          const upcoming = item.days_until_next >= 0 && item.days_until_next <= 7
          const overdue  = item.days_until_next < 0
          return (
            <div key={i} className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${
              upcoming ? 'border-amber-300' : overdue ? 'border-rose-200' : 'border-slate-200'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.merchant}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.account_name || item.institution_name}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${FREQ_STYLES[item.frequency] || 'bg-slate-100 text-slate-600'}`}>
                  {item.frequency}
                </span>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xl font-bold text-slate-900">
                    {fmt.format(item.avg_amount)}
                    {!item.amount_fixed && <span className="text-xs font-normal text-slate-400 ml-1">avg</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">last {formatDate(item.last_date)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-semibold ${upcoming ? 'text-amber-600' : overdue ? 'text-rose-500' : 'text-slate-500'}`}>
                    {overdue
                      ? `${Math.abs(item.days_until_next)}d overdue`
                      : item.days_until_next === 0
                        ? 'Due today'
                        : `in ${item.days_until_next}d`
                    }
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(item.next_expected)}</p>
                </div>
              </div>

              <div className="text-xs text-slate-400 border-t border-slate-100 pt-2">
                {item.count} charges · every ~{item.mean_interval}d · {item.amount_fixed ? 'fixed amount' : 'variable amount'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
