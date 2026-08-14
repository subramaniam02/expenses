import { useState, useEffect } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import Breakdown from './Breakdown'
import ExpenseIncomeTrend from './ExpenseIncomeTrend'
import { formatCat } from '../utils/formatCat'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const CARDS = [
  { key: 'total_income',    label: 'Total Income',    color: 'text-emerald-600', bg: 'bg-emerald-50', sub: 'Credits received',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /> },
  { key: 'total_expenses',  label: 'Total Expenses',  color: 'text-rose-600',    bg: 'bg-rose-50',    sub: 'Money spent',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" /> },
  { key: 'net',             label: 'Net Flow',         color: 'text-indigo-600',  bg: 'bg-indigo-50',  sub: 'Income − Expenses',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /> },
  { key: 'total_refunds',   label: 'Refunds',          color: 'text-amber-600',   bg: 'bg-amber-50',   sub: (s) => `${s?.refund_count || 0} credits`,
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /> },
]

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading overview…</p>
      </div>
    </div>
  )
}

function KPICard({ label, value, sub, color, bg, icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 min-w-[160px]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
          <svg className={`w-4 h-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>{icon}</svg>
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{fmt.format(Math.abs(value || 0))}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
}

function InsightCard({ dateRange }) {
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    axios.get('/api/transactions/overview-insight', {
      params: {
        start_date: format(dateRange.start, 'yyyy-MM-dd'),
        end_date: format(dateRange.end, 'yyyy-MM-dd'),
      },
    })
      .then(r => setInsight(r.data))
      .catch(() => setInsight(null))
      .finally(() => setLoading(false))
  }, [dateRange])

  if (loading) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 animate-pulse">
      <div className="h-3 w-24 bg-slate-100 rounded mb-3" />
      <div className="h-4 w-full bg-slate-100 rounded mb-2" />
      <div className="h-4 w-3/4 bg-slate-100 rounded" />
    </div>
  )

  if (!insight || insight.current_expenses === 0) return null

  const { current_expenses, prev_expenses, pct_change, top_categories, period_label } = insight
  const isUp = pct_change !== null && pct_change > 0
  const isDown = pct_change !== null && pct_change < 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Summary</p>
      <p className="text-sm text-slate-700 leading-relaxed">
        {'You spent '}
        <span className="font-bold text-slate-900">{fmt.format(current_expenses)}</span>
        {' between '}
        <span className="font-medium text-slate-700">{period_label}</span>
        {pct_change !== null && prev_expenses > 0 && (
          <>
            {' — '}
            <span className={`font-bold ${isUp ? 'text-rose-600' : isDown ? 'text-emerald-600' : 'text-slate-600'}`}>
              {isUp ? '▲' : isDown ? '▼' : ''}{' '}
              {Math.abs(pct_change).toFixed(1)}%{' '}
              {isUp ? 'more' : isDown ? 'less' : 'same'}
            </span>
            {' than the previous period ('}
            <span className="font-medium text-slate-600">{fmt.format(prev_expenses)}</span>
            {')'}
          </>
        )}
        {'.'}
        {top_categories.length > 0 && (
          <>
            {' Your top spending '}
            {top_categories.length === 1 ? 'category was ' : 'categories were '}
            {top_categories.map((c, i) => (
              <span key={c.category}>
                {i > 0 && i < top_categories.length - 1 ? ', ' : ''}
                {i > 0 && i === top_categories.length - 1 ? ', and ' : ''}
                <span className="font-bold text-slate-900">{formatCat(c.category)}</span>
                {' ('}
                <span className="text-rose-600 font-semibold">{fmt.format(c.total)}</span>
                {')'}
              </span>
            ))}
            {'.'}
          </>
        )}
      </p>
    </div>
  )
}

export default function Overview({ dateRange, syncVersion }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { fetchData() }, [dateRange, syncVersion])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const params = {
        start_date: format(dateRange.start, 'yyyy-MM-dd'),
        end_date: format(dateRange.end, 'yyyy-MM-dd'),
      }
      const summaryRes = await axios.get('/api/transactions/summary', { params })
      setSummary(summaryRes.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  return (
    <div className="space-y-5">

      {/* KPI Row */}
      <div className="flex flex-wrap gap-3">
        {CARDS.map(c => (
          <KPICard
            key={c.key}
            label={c.label}
            value={summary?.[c.key]}
            sub={typeof c.sub === 'function' ? c.sub(summary) : c.sub}
            color={c.color} bg={c.bg} icon={c.icon}
          />
        ))}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 min-w-[160px]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transactions</p>
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary?.transaction_count || 0}</p>
          <p className="text-xs text-slate-400 mt-1">Total count</p>
        </div>
      </div>

      {/* Summary text insight */}
      <InsightCard dateRange={dateRange} />

      {/* Expense & income trend (fixed trailing 12 months) */}
      <ExpenseIncomeTrend syncVersion={syncVersion} />

      {/* Breakdown */}
      <Breakdown dateRange={dateRange} syncVersion={syncVersion} />

      {(!summary || summary.transaction_count === 0) && (
        <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
          <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
          </svg>
          <p className="font-semibold text-slate-600">No transactions found</p>
          <p className="text-sm mt-1">Connect an account and sync to get started.</p>
        </div>
      )}
    </div>
  )
}
