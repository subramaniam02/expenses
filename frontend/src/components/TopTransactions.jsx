import { useState, useEffect } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'
import { useSort, SortIcon } from '../hooks/useSort'
import { formatCat as formatCatBase } from '../utils/formatCat'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }
function formatCat(cat) { return formatCatBase(cat, '—') }

const RANK = [
  'bg-amber-400 text-amber-900 ring-2 ring-amber-200',
  'bg-slate-300 text-slate-800 ring-2 ring-slate-200',
  'bg-orange-400 text-orange-900 ring-2 ring-orange-200',
]

const TH = 'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading top transactions…</p>
      </div>
    </div>
  )
}

export default function TopTransactions({ dateRange }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { sorted, sortKey, sortDir, toggleSort } = useSort(transactions, 'amount', 'desc')

  useEffect(() => { fetchData() }, [dateRange])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/top', {
        params: {
          start_date: format(dateRange.start, 'yyyy-MM-dd'),
          end_date: format(dateRange.end, 'yyyy-MM-dd'),
        },
      })
      setTransactions(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const thCls = (col) => `${TH} ${sortKey === col ? 'text-indigo-600' : ''}`

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>
  if (transactions.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
      <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
      <p className="font-semibold text-slate-600">No transactions found</p>
      <p className="text-sm mt-1">Try adjusting your date range or sync transactions.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Top Transactions</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            10 largest expenses · Click column headers to sort ·
            <span className="ml-1 text-amber-600 font-medium">Gold</span> = #1 ·
            <span className="ml-1 text-slate-500 font-medium">Silver</span> = #2 ·
            <span className="ml-1 text-orange-600 font-medium">Bronze</span> = #3
          </p>
        </div>
        <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
          {transactions.length} transactions
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className="w-12 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">#</th>
              <th className={`text-left ${thCls('date')}`} onClick={() => toggleSort('date')}>
                Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-left ${thCls('merchant_name')}`} onClick={() => toggleSort('merchant_name')}>
                Merchant <SortIcon col="merchant_name" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-left ${thCls('personal_finance_category')}`} onClick={() => toggleSort('personal_finance_category')}>
                Category <SortIcon col="personal_finance_category" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-left ${thCls('account_name')}`} onClick={() => toggleSort('account_name')}>
                Account <SortIcon col="account_name" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${thCls('amount')}`} onClick={() => toggleSort('amount')}>
                Amount <SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((tx, i) => {
              const isTop = i === 0 && sortKey === 'amount' && sortDir === 'desc'
              return (
                <tr
                  key={tx.transaction_id || tx.id || i}
                  className={`transition-colors ${
                    isTop ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                      i < 3 ? RANK[i] : 'bg-slate-100 text-slate-500'
                    }`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-semibold text-slate-800">{tx.merchant_name || tx.name}</p>
                    {tx.merchant_name && tx.name !== tx.merchant_name && (
                      <p className="text-xs text-slate-400 mt-0.5">{tx.name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-500">{formatCat(tx.personal_finance_category)}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-500">{tx.account_name || tx.account_id}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`text-sm font-bold ${isTop ? 'text-amber-700' : 'text-rose-600'}`}>
                      {fmt.format(tx.amount)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
