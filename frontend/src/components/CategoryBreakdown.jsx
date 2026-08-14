import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'
import { useSort, SortIcon } from '../hooks/useSort'
import { useCategories } from '../hooks/useCategories'
import { formatCat } from '../utils/formatCat'
import PieBreakdown, { buildPieSlices, OTHER_SLICE_COLOR } from './PieBreakdown'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }

const TH = 'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap'

// ── Category table (click row = select, no inline expand) ─────────────────────
const COL = 'grid grid-cols-[1fr_5rem_7rem]'

function CategoryTable({ sorted, sortKey, sortDir, toggleSort, selectedCat, onSelect, categories, expenseTotal }) {
  const hdrCls = (col) =>
    `px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap ${sortKey === col ? 'text-indigo-600' : 'text-slate-500'}`

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header — outside scroll area so it stays fixed */}
      <div className={`${COL} border-b border-slate-100 bg-slate-50`}>
        <div className={`${hdrCls('category')} text-left`} onClick={() => toggleSort('category')}>
          Category <SortIcon col="category" sortKey={sortKey} sortDir={sortDir} />
        </div>
        <div className={`${hdrCls('count')} text-right`} onClick={() => toggleSort('count')}>
          Txns <SortIcon col="count" sortKey={sortKey} sortDir={sortDir} />
        </div>
        <div className={`${hdrCls('total')} text-right`} onClick={() => toggleSort('total')}>
          Total <SortIcon col="total" sortKey={sortKey} sortDir={sortDir} />
        </div>
      </div>

      {/* Scrollable rows */}
      <div className="overflow-y-auto divide-y divide-slate-100" style={{ maxHeight: '240px' }}>
        {sorted.map((cat) => {
          const isSelected = selectedCat === cat.category
          return (
            <div
              key={cat.category}
              className={`${COL} cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-indigo-50/40'}`}
              onClick={() => onSelect(isSelected ? null : cat.category)}
            >
              <div className="px-4 py-3 flex items-center gap-2.5 min-w-0">
                <span className="text-slate-400 text-[10px] w-3 flex-shrink-0">{isSelected ? '▼' : '▶'}</span>
                <span className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {formatCat(cat.category)}
                </span>
              </div>
              <div className="px-4 py-3 text-right text-sm text-slate-500">{cat.count}</div>
              <div className={`px-4 py-3 text-right text-sm font-semibold ${isSelected ? 'text-indigo-600' : 'text-rose-600'}`}>
                {fmt.format(cat.total)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer — outside scroll area */}
      <div className={`${COL} border-t-2 border-slate-200 bg-slate-50`}>
        <div className="px-4 py-3 text-sm font-semibold text-slate-700">
          Total <span className="text-slate-400 font-normal">({categories.length})</span>
        </div>
        <div className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
          {categories.reduce((s, c) => s + c.count, 0)}
        </div>
        <div className="px-4 py-3 text-right text-sm font-bold text-rose-700">
          {fmt.format(expenseTotal)}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading categories…</p>
      </div>
    </div>
  )
}

export default function CategoryBreakdown({ dateRange, syncVersion }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCat, setSelectedCat] = useState(null)
  const { sorted, sortKey, sortDir, toggleSort } = useSort(categories, 'total', 'desc')
  const { all: catNames, reload: reloadCats } = useCategories()

  useEffect(() => { fetchData() }, [dateRange, syncVersion])

  async function fetchData({ resetSelection = true } = {}) {
    setLoading(true); setError(null)
    if (resetSelection) setSelectedCat(null)
    try {
      const res = await axios.get('/api/transactions/categories', {
        params: {
          start_date: format(dateRange.start, 'yyyy-MM-dd'),
          end_date: format(dateRange.end, 'yyyy-MM-dd'),
        },
      })
      setCategories(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  // Build pie slices + catById here so both chart and transactions panel share the same mapping
  const { slices: pieSlices, byId: catById } = useMemo(() => buildPieSlices(categories, {
    getId: c => c.category,
    getName: c => formatCat(c.category),
    getValue: c => c.total,
    getCount: c => c.count,
    getTransactions: c => c.transactions || [],
    topN: 7,
  }), [categories])

  const expenseTotal = categories.reduce((s, c) => s + c.total, 0)
  const totalTxnCount = categories.reduce((s, c) => s + c.count, 0)
  const allTransactions = useMemo(() => categories.flatMap(c => c.transactions || []), [categories])
  const selectedData = selectedCat ? catById[selectedCat] : null
  const displayTransactions = selectedData ? (selectedData.transactions || []) : allTransactions

  function handleSelect(cat) {
    setSelectedCat(cat)
  }

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>
  if (categories.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
      <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      </svg>
      <p className="font-semibold text-slate-600">No categories found</p>
      <p className="text-sm mt-1">Try adjusting your date range or sync transactions.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Category Breakdown</h2>
          <p className="text-xs text-slate-500 mt-0.5">Click a slice or row to see transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
            {categories.length} categories
          </span>
          <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
            −{fmt.format(expenseTotal)} expenses
          </span>
        </div>
      </div>

      <PieBreakdown
        title="Spend by Category"
        slices={pieSlices}
        selectedId={selectedCat}
        onSelect={handleSelect}
        centerContent={selectedData ? (
          <div className="text-center pointer-events-none px-2">
            <div className="text-[11px] text-slate-400 truncate max-w-[120px] mx-auto">{selectedData.name}</div>
            <div className="text-lg font-bold text-rose-600">{fmt.format(selectedData.value)}</div>
          </div>
        ) : (
          <div className="text-center pointer-events-none">
            <div className="text-[11px] text-slate-400">Total</div>
            <div className="text-lg font-bold text-slate-800">{fmt.format(expenseTotal)}</div>
          </div>
        )}
      />

      {/* Transactions panel — always visible */}
      {displayTransactions.length > 0 && (
        <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedData ? (
                <>
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: selectedData.color ?? OTHER_SLICE_COLOR }}
                  />
                  <span className="text-sm font-semibold text-slate-800">{selectedData.name}</span>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {selectedData.count} transactions
                  </span>
                  <span className="text-sm font-semibold text-rose-600">{fmt.format(selectedData.value)}</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-slate-800">All Categories</span>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {totalTxnCount} transactions
                  </span>
                  <span className="text-sm font-semibold text-rose-600">{fmt.format(expenseTotal)}</span>
                </>
              )}
            </div>
            {selectedData && (
              <button onClick={() => handleSelect(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <SubTable transactions={displayTransactions} catNames={catNames} onRefresh={() => { fetchData({ resetSelection: false }); reloadCats() }} />
        </div>
      )}
    </div>
  )
}

function SubTable({ transactions, catNames = [], onRefresh }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSort(transactions, 'amount', 'desc')
  const [selected, setSelected] = useState(new Set())
  const [bulkCat, setBulkCat] = useState('')
  const [applying, setApplying] = useState(false)

  const thCls = (col) =>
    `py-2 text-slate-500 font-semibold text-xs cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap ${sortKey === col ? 'text-indigo-600' : ''}`

  const allChecked = sorted.length > 0 && selected.size === sorted.length

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(sorted.map(tx => tx.transaction_id)))
  }

  function toggleOne(id) {
    setSelected(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
    })
  }

  async function handleApply() {
    if (!bulkCat.trim() || selected.size === 0) return
    setApplying(true)
    try {
      await axios.post('/api/transactions/bulk-categorize', {
        transaction_ids: [...selected],
        category: bulkCat.trim(),
      })
      setSelected(new Set())
      setBulkCat('')
      onRefresh?.()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold text-indigo-700 flex-shrink-0">{selected.size} selected</span>
          <span className="text-slate-300">·</span>
          <input
            list="subtable-cat-list"
            value={bulkCat}
            onChange={e => setBulkCat(e.target.value)}
            placeholder="Set category… (type to create new)"
            className="flex-1 text-sm border border-indigo-200 bg-white text-slate-700 rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
          />
          <datalist id="subtable-cat-list">
            {[...new Set(catNames.map(c => formatCat(c)))].map(c => <option key={c} value={c} />)}
          </datalist>
          <button
            onClick={handleApply}
            disabled={applying || !bulkCat.trim()}
            className="flex-shrink-0 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); setSelected(new Set()) }}
            className="flex-shrink-0 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
      <table className="w-full text-xs my-1">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-2 pr-3 w-5">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => {}}
                onMouseDown={e => { e.preventDefault(); toggleAll() }}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
              />
            </th>
            <th className={`text-left ${thCls('date')} pr-4`} onClick={() => toggleSort('date')}>
              Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className={`text-left ${thCls('merchant_name')} pr-4`} onClick={() => toggleSort('merchant_name')}>
              Merchant <SortIcon col="merchant_name" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className={`text-left ${thCls('account_name')} pr-4`} onClick={() => toggleSort('account_name')}>
              Account <SortIcon col="account_name" sortKey={sortKey} sortDir={sortDir} />
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
          {sorted.map((tx, i) => {
            const isIncome = tx.amount < 0
            return (
              <tr
                key={tx.transaction_id || tx.id || i}
                className={`transition-colors ${selected.has(tx.transaction_id) ? 'bg-indigo-50/60' : 'hover:bg-indigo-50/30'}`}
              >
                <td className="py-1.5 pr-3">
                  <input
                    type="checkbox"
                    checked={selected.has(tx.transaction_id)}
                    onChange={() => {}}
                    onMouseDown={e => { e.preventDefault(); toggleOne(tx.transaction_id) }}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                  />
                </td>
                <td className="py-1.5 pr-4 text-slate-400 whitespace-nowrap">{formatDate(tx.date)}</td>
                <td className="py-1.5 pr-4 text-slate-700 font-medium">{tx.merchant_name || tx.name}</td>
                <td className="py-1.5 pr-4 text-slate-500">{tx.account_name}</td>
                <td className="py-1.5 pr-4">
                  {tx.personal_finance_category
                    ? <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full whitespace-nowrap">{formatCat(tx.personal_finance_category)}</span>
                    : <span className="text-slate-300">—</span>
                  }
                </td>
                <td className={`py-1.5 text-right font-semibold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isIncome ? '+' : ''}{fmt.format(Math.abs(tx.amount))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
