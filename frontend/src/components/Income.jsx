import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'
import { useSort, SortIcon } from '../hooks/useSort'
import { formatCat as formatCatBase } from '../utils/formatCat'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }
function formatCat(cat) { return formatCatBase(cat, '—') }

const TH = 'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-emerald-600 transition-colors whitespace-nowrap'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading income…</p>
      </div>
    </div>
  )
}

export default function Income({ dateRange, syncVersion }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const { sorted, sortKey, sortDir, toggleSort } = useSort(transactions, '_abs_amount', 'desc')

  useEffect(() => { fetchData() }, [dateRange, syncVersion])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/income', {
        params: {
          start_date: format(dateRange.start, 'yyyy-MM-dd'),
          end_date: format(dateRange.end, 'yyyy-MM-dd'),
        },
      })
      setTransactions(res.data.map(tx => ({ ...tx, _abs_amount: Math.abs(tx.amount) })))
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const accounts = useMemo(() => {
    const seen = new Set()
    return transactions
      .map(t => ({ id: t.account_id, name: t.account_name || t.account_id }))
      .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
  }, [transactions])

  const filtered = useMemo(() => {
    return sorted.filter(tx => {
      const matchSearch = !search ||
        (tx.merchant_name || tx.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (tx.personal_finance_category || '').toLowerCase().includes(search.toLowerCase())
      const matchAccount = accountFilter === 'all' || tx.account_id === accountFilter
      return matchSearch && matchAccount
    })
  }, [sorted, search, accountFilter])

  const total = filtered.reduce((s, t) => s + Math.abs(t.amount), 0)
  const thCls = (col) => `${TH} ${sortKey === col ? 'text-emerald-600' : ''}`

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  if (transactions.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
      <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
      </svg>
      <p className="font-semibold text-slate-600">No income found</p>
      <p className="text-sm mt-1">No credits received in the selected date range.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Income</h2>
          <p className="text-xs text-slate-500 mt-0.5">All credit transactions in the selected period</p>
        </div>
      </div>

      {/* Summary banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-900">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</p>
            <p className="text-xs text-emerald-600">Credits received</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Total Income</p>
          <p className="text-2xl font-bold text-emerald-700">+{fmt.format(total)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search merchant or category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
          />
        </div>
        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {(search || accountFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setAccountFilter('all') }}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
          {filtered.length} of {transactions.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className={`text-left ${thCls('date')}`} onClick={() => toggleSort('date')}>
                Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
              <th className={`text-right ${thCls('amount')}`} onClick={() => toggleSort('amount')}>
                Amount <SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((tx, i) => (
              <tr key={tx.transaction_id || tx.id || i} className="hover:bg-emerald-50/20 transition-colors">
                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">{tx.merchant_name || tx.name}</p>
                  {tx.merchant_name && tx.name !== tx.merchant_name && (
                    <p className="text-xs text-slate-400 mt-0.5">{tx.name}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{formatCat(tx.personal_finance_category)}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{tx.account_name || tx.account_id}</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-emerald-600">+{fmt.format(Math.abs(tx.amount))}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-emerald-100 bg-emerald-50/50">
              <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-emerald-900">
                Total <span className="font-normal text-emerald-600">({filtered.length} transactions)</span>
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700">+{fmt.format(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
