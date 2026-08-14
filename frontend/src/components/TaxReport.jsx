import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { format, parseISO, startOfYear } from 'date-fns'
import { useSort, SortIcon } from '../hooks/useSort'
import { formatCat } from '../utils/formatCat'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }

const AVAILABLE_CATEGORIES = [
  'Medical', 'Healthcare', 'Charitable Giving', 'Donations',
  'Business Services', 'Professional Services', 'Education',
  'Home Improvement', 'Travel', 'Meals & Entertainment',
]

const SUB_TH = 'text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap'

function TaxSubTable({ transactions }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(transactions, 'date', 'desc')
  const thCls = col => `${SUB_TH} ${sortKey === col ? 'text-indigo-600' : ''}`
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/40">
          <th className={`text-left px-6 py-2 w-28 ${thCls('date')}`} onClick={() => toggleSort('date')}>
            Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
          </th>
          <th className={`text-left px-3 py-2 ${thCls('merchant_name')}`} onClick={() => toggleSort('merchant_name')}>
            Merchant <SortIcon col="merchant_name" sortKey={sortKey} sortDir={sortDir} />
          </th>
          <th className={`text-left px-3 py-2 ${thCls('account_name')}`} onClick={() => toggleSort('account_name')}>
            Account <SortIcon col="account_name" sortKey={sortKey} sortDir={sortDir} />
          </th>
          <th className={`text-right px-4 py-2 ${thCls('amount')}`} onClick={() => toggleSort('amount')}>
            Amount <SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {sorted.map((tx, i) => (
          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-6 py-2 text-xs text-slate-400 whitespace-nowrap">{formatDate(tx.date)}</td>
            <td className="px-3 py-2 text-xs text-slate-700 font-medium">{tx.merchant_name || tx.name}</td>
            <td className="px-3 py-2 text-xs text-slate-400">{tx.account_name}</td>
            <td className="px-4 py-2 text-xs font-semibold text-slate-800 text-right">{fmt.format(tx.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Generating tax report…</p>
      </div>
    </div>
  )
}

export default function TaxReport({ dateRange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCats, setSelectedCats] = useState(new Set(AVAILABLE_CATEGORIES))
  const [expanded, setExpanded] = useState({})
  const [useYTD, setUseYTD] = useState(true)

  const startDate = useYTD
    ? format(startOfYear(new Date()), 'yyyy-MM-dd')
    : format(dateRange.start, 'yyyy-MM-dd')
  const endDate = useYTD
    ? format(new Date(), 'yyyy-MM-dd')
    : format(dateRange.end, 'yyyy-MM-dd')

  useEffect(() => { fetchData() }, [selectedCats, useYTD, dateRange])

  async function fetchData() {
    if (selectedCats.size === 0) { setData({ summary: [], grand_total: 0, available_categories: AVAILABLE_CATEGORIES }); setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/tax-report', {
        params: {
          start_date: startDate,
          end_date: endDate,
          categories: Array.from(selectedCats).join(','),
        },
      })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleCat(cat) {
    setSelectedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function handleExport() {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      categories: Array.from(selectedCats).join(','),
    })
    const apiKey = localStorage.getItem('api_key') || ''
    // Build URL and trigger download
    const url = `/api/transactions/tax-report/export?${params}`
    const a = document.createElement('a')
    a.href = url
    a.download = `tax-report-${startDate}-${endDate}.csv`
    // Pass the API key header via a fetch + blob for auth
    fetch(url, { headers: { 'x-api-key': apiKey } })
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        a.href = blobUrl
        a.click()
        URL.revokeObjectURL(blobUrl)
      })
  }

  const grand = data?.grand_total || 0
  const summary = data?.summary || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tax Report</h2>
          <p className="text-xs text-slate-500 mt-0.5">Deductible and tax-relevant spending by category</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseYTD(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
              useYTD ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
            }`}
          >
            Year to date
          </button>
          <button
            onClick={handleExport}
            disabled={grand === 0}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Category toggles */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-slate-600 mb-2">Include categories</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCats(selectedCats.size === AVAILABLE_CATEGORIES.length ? new Set() : new Set(AVAILABLE_CATEGORIES))}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {selectedCats.size === AVAILABLE_CATEGORIES.length ? 'Deselect all' : 'Select all'}
          </button>
          {AVAILABLE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                selectedCats.has(cat)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>
      ) : (
        <>
          {/* Summary banner */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-indigo-900">
                {useYTD ? `YTD ${new Date().getFullYear()}` : `${startDate} – ${endDate}`}
              </p>
              <p className="text-xs text-indigo-600 mt-0.5">{summary.length} categories · {summary.reduce((s, g) => s + g.transactions.length, 0)} transactions</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide">Total deductible spend</p>
              <p className="text-2xl font-bold text-indigo-700">{fmt.format(grand)}</p>
            </div>
          </div>

          {/* Category groups */}
          {summary.length === 0 ? (
            <div className="flex flex-col items-center py-12 bg-white rounded-xl border border-slate-200 text-slate-400">
              <p className="font-semibold text-slate-600">No transactions found</p>
              <p className="text-sm mt-1">Try selecting more categories or adjusting the date range.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.map(group => (
                <div key={group.category} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition-colors"
                    onClick={() => setExpanded(prev => ({ ...prev, [group.category]: !prev[group.category] }))}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-400 text-[10px] w-3">{expanded[group.category] ? '▼' : '▶'}</span>
                      <span className="text-sm font-semibold text-slate-800">{formatCat(group.category)}</span>
                      <span className="text-xs text-slate-400">{group.transactions.length} transactions</span>
                    </div>
                    <span className="text-sm font-bold text-indigo-700">{fmt.format(group.total)}</span>
                  </button>
                  {expanded[group.category] && (
                    <div className="border-t border-slate-100">
                      <TaxSubTable transactions={group.transactions} />
                      <div className="border-t border-slate-200 bg-slate-50/70 flex justify-between px-6 py-2">
                        <span className="text-xs font-semibold text-slate-600">Subtotal</span>
                        <span className="text-xs font-bold text-indigo-700">{fmt.format(group.total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
