import { useState, useEffect, useMemo, Fragment } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'
import { useSort, SortIcon } from '../hooks/useSort'
import PieBreakdown, { buildPieSlices } from './PieBreakdown'
import { formatCat as formatCatBase } from '../utils/formatCat'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }
function formatCat(cat) { return formatCatBase(cat, '—') }
function getCategoryFromJson(json) {
  try {
    if (!json || json === 'null') return null
    const p = JSON.parse(json)
    return Array.isArray(p) ? p[0] : null
  } catch { return null }
}

const TH = 'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading merchants…</p>
      </div>
    </div>
  )
}

export default function MerchantBreakdown({ dateRange, syncVersion }) {
  const [merchants, setMerchants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [search, setSearch] = useState('')
  const [selectedMerchant, setSelectedMerchant] = useState(null)
  const { sorted, sortKey, sortDir, toggleSort } = useSort(merchants, 'total', 'desc')

  useEffect(() => { fetchData() }, [dateRange, syncVersion])

  async function fetchData() {
    setLoading(true); setError(null); setExpanded({}); setSelectedMerchant(null)
    try {
      const res = await axios.get('/api/transactions/merchants', {
        params: {
          start_date: format(dateRange.start, 'yyyy-MM-dd'),
          end_date: format(dateRange.end, 'yyyy-MM-dd'),
        },
      })
      setMerchants(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(m) { setExpanded(prev => ({ ...prev, [m]: !prev[m] })) }

  function handleSelectMerchant(id) {
    setSelectedMerchant(id)
    if (id && id !== '__other__') {
      setExpanded(prev => ({ ...prev, [id]: true }))
    }
  }

  // Pie always reflects the full data set, independent of the table's own search/sort
  const { slices: merchantSlices, byId: merchantById } = useMemo(() => buildPieSlices(merchants, {
    getId: m => m.merchant,
    getName: m => m.merchant || '(Unknown)',
    getValue: m => m.total,
    getCount: m => m.count,
    getTransactions: m => m.transactions || [],
    topN: 7,
  }), [merchants])
  const merchantGrandTotal = useMemo(() => merchants.reduce((s, m) => s + m.total, 0), [merchants])
  const selectedMerchantData = selectedMerchant ? merchantById[selectedMerchant] : null

  const filtered = search
    ? sorted.filter(m => m.merchant?.toLowerCase().includes(search.toLowerCase()))
    : sorted
  const grandTotal = filtered.reduce((s, m) => s + m.total, 0)

  const thCls = (col) => `${TH} ${sortKey === col ? 'text-indigo-600' : ''}`

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>
  if (merchants.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
      <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016 2.993 2.993 0 0 0 2.25-1.016 3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
      </svg>
      <p className="font-semibold text-slate-600">No merchant data found</p>
      <p className="text-sm mt-1">Try adjusting your date range or sync transactions.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Merchant Breakdown</h2>
          <p className="text-xs text-slate-500 mt-0.5">Click a row to expand transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Search merchants…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 w-44"
            />
          </div>
          <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
            {filtered.length} merchants
          </div>
        </div>
      </div>

      <PieBreakdown
        title="Spend by Merchant"
        slices={merchantSlices}
        selectedId={selectedMerchant}
        onSelect={handleSelectMerchant}
        centerContent={selectedMerchantData ? (
          <div className="text-center pointer-events-none px-2">
            <div className="text-[11px] text-slate-400 truncate max-w-[120px] mx-auto">{selectedMerchantData.name}</div>
            <div className="text-lg font-bold text-rose-600">{fmt.format(selectedMerchantData.value)}</div>
          </div>
        ) : (
          <div className="text-center pointer-events-none">
            <div className="text-[11px] text-slate-400">Total</div>
            <div className="text-lg font-bold text-slate-800">{fmt.format(merchantGrandTotal)}</div>
          </div>
        )}
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className={`text-left ${thCls('merchant')}`} onClick={() => toggleSort('merchant')}>
                Merchant <SortIcon col="merchant" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${thCls('count')}`} onClick={() => toggleSort('count')}>
                Txns <SortIcon col="count" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${thCls('total')}`} onClick={() => toggleSort('total')}>
                Total <SortIcon col="total" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((m) => {
              const isSelected = selectedMerchant === m.merchant
              return (
                <Fragment key={m.merchant}>
                <tr
                  key={m.merchant}
                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-indigo-50/40'}`}
                  onClick={() => toggleExpand(m.merchant)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-400 text-[10px] w-3 flex-shrink-0">
                        {expanded[m.merchant] ? '▼' : '▶'}
                      </span>
                      <span className={`text-sm font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>{m.merchant || '(Unknown)'}</span>
                    </div>
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-slate-500">{m.count}</td>
                  <td className="text-right px-4 py-3 text-sm font-semibold text-rose-600">{fmt.format(m.total)}</td>
                </tr>
                {expanded[m.merchant] && (
                  <tr key={`${m.merchant}-exp`}>
                    <td colSpan={3} className="px-4 py-2 bg-slate-50/50">
                      <SubTable transactions={m.transactions} />
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                Total <span className="text-slate-400 font-normal">({filtered.length} merchants)</span>
              </td>
              <td className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                {filtered.reduce((s, m) => s + m.count, 0)}
              </td>
              <td className="text-right px-4 py-3 text-sm font-bold text-rose-700">{fmt.format(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function SubTable({ transactions }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(transactions, 'amount', 'desc')
  const thCls = (col) =>
    `py-2 text-slate-500 font-semibold text-xs cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap ${sortKey === col ? 'text-indigo-600' : ''}`

  return (
    <table className="w-full text-xs my-1">
      <thead>
        <tr className="border-b border-slate-200">
          <th className={`text-left ${thCls('date')} pr-4`} onClick={() => toggleSort('date')}>
            Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
          </th>
          <th className={`text-left ${thCls('name')} pr-4`} onClick={() => toggleSort('name')}>
            Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
          </th>
          <th className={`text-left ${thCls('personal_finance_category')} pr-4`} onClick={() => toggleSort('personal_finance_category')}>
            Category <SortIcon col="personal_finance_category" sortKey={sortKey} sortDir={sortDir} />
          </th>
          <th className={`text-right ${thCls('amount')}`} onClick={() => toggleSort('amount')}>
            Amount <SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {sorted.map((tx, i) => (
          <tr key={tx.transaction_id || tx.id || i} className="hover:bg-indigo-50/30 transition-colors">
            <td className="py-1.5 pr-4 text-slate-400 whitespace-nowrap">{formatDate(tx.date)}</td>
            <td className="py-1.5 pr-4 text-slate-700 font-medium">{tx.name}</td>
            <td className="py-1.5 pr-4 text-slate-500">{formatCat(tx.personal_finance_category || getCategoryFromJson(tx.category))}</td>
            <td className="py-1.5 text-right text-rose-600 font-semibold">{fmt.format(tx.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
