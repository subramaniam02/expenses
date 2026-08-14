import { useState, useEffect } from 'react'
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
        <p className="text-sm text-slate-400">Loading refunds…</p>
      </div>
    </div>
  )
}

export default function Refunds({ dateRange }) {
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { sorted, sortKey, sortDir, toggleSort } = useSort(refunds, 'date', 'desc')

  useEffect(() => { fetchData() }, [dateRange])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/refunds', {
        params: {
          start_date: format(dateRange.start, 'yyyy-MM-dd'),
          end_date: format(dateRange.end, 'yyyy-MM-dd'),
        },
      })
      setRefunds(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalRefunds = refunds.reduce((s, tx) => s + Math.abs(tx.amount), 0)
  const thCls = (col) => `${TH} ${sortKey === col ? 'text-emerald-600' : ''}`

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>
  if (refunds.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
      <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
      </svg>
      <p className="font-semibold text-slate-600">No refunds found</p>
      <p className="text-sm mt-1">No credits or refunds in the selected date range.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Refunds & Credits</h2>
          <p className="text-xs text-slate-500 mt-0.5">Credits applied to your accounts</p>
        </div>
      </div>

      {/* Summary banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {refunds.length} refund{refunds.length !== 1 ? 's' : ''} found
            </p>
            <p className="text-xs text-emerald-600">Credits applied to your accounts</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Total Credits</p>
          <p className="text-2xl font-bold text-emerald-700">+{fmt.format(totalRefunds)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
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
            {sorted.map((tx, i) => (
              <tr key={tx.transaction_id || tx.id || i} className="hover:bg-emerald-50/30 transition-colors">
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
                  <span className="text-sm font-bold text-emerald-600">+{fmt.format(Math.abs(tx.amount))}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-emerald-100 bg-emerald-50/50">
              <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-emerald-900">
                Total <span className="font-normal text-emerald-700">({refunds.length} transactions)</span>
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700">
                +{fmt.format(totalRefunds)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
