import { useState, useEffect, useMemo, useRef } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'
import { useSort, SortIcon } from '../hooks/useSort'
import { useCategories } from '../hooks/useCategories'
import { formatCat as formatCatBase } from '../utils/formatCat'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }
function formatCat(cat) { return formatCatBase(cat, null) }

const TH = 'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading transactions…</p>
      </div>
    </div>
  )
}

const FIELD_LABELS = { any: 'Merchant or Name', merchant_name: 'Merchant name', name: 'Transaction name' }
const TYPE_LABELS  = { contains: 'contains', exact: 'exactly matches', starts_with: 'starts with' }

// ── Rule creation prompt (shown after bulk assign with active search) ───────
function RulePromptModal({ matchValue, category, categories, onClose }) {
  const [form, setForm] = useState({
    match_field: 'any',
    match_type: 'contains',
    match_value: matchValue,
    category,
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCreate() {
    if (!form.match_value.trim() || !form.category.trim()) return
    setSaving(true)
    try {
      await axios.post('/api/rules', form)
      await axios.post('/api/rules/apply')
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      console.error('Failed to create rule', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Create a rule?</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auto-categorize future transactions matching your search.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mr-1 -mt-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Rule created and applied.
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 block">Match field</label>
                  <select
                    value={form.match_field}
                    onChange={e => setForm(f => ({ ...f, match_field: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
                  >
                    <option value="any">Merchant or Name</option>
                    <option value="merchant_name">Merchant name</option>
                    <option value="name">Transaction name</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 block">Condition</label>
                  <select
                    value={form.match_type}
                    onChange={e => setForm(f => ({ ...f, match_type: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
                  >
                    <option value="contains">contains</option>
                    <option value="exact">exactly matches</option>
                    <option value="starts_with">starts with</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Value</label>
                <input
                  type="text"
                  value={form.match_value}
                  onChange={e => setForm(f => ({ ...f, match_value: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Set category to</label>
                <input
                  list="rule-prompt-cat-list"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
                />
                <datalist id="rule-prompt-cat-list">
                  {[...new Set(categories.map(c => formatCat(c)))].map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            {/* Preview */}
            {form.match_value.trim() && form.category.trim() && (
              <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 text-xs text-slate-600">
                When <span className="font-medium text-slate-700">{FIELD_LABELS[form.match_field]}</span>{' '}
                <span className="text-slate-400">{TYPE_LABELS[form.match_type]}</span>{' '}
                <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{form.match_value}</code>
                {' → '}
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">{form.category}</span>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
              <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg">
                Skip
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.match_value.trim() || !form.category.trim()}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium transition-colors"
              >
                {saving ? 'Creating…' : 'Create Rule'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Indeterminate checkbox ─────────────────────────────────────────────────
function Checkbox({ checked, indeterminate, onChange, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={`w-[15px] h-[15px] rounded border-slate-300 text-indigo-600 cursor-pointer accent-indigo-600 ${className}`}
    />
  )
}

// ── Bulk action bar ────────────────────────────────────────────────────────
function BulkActionBar({ count, onAssign, onClear, categories, selectedTransactions }) {
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const merchants = [...new Set(
      (selectedTransactions || []).map(tx => tx.merchant_name || tx.name).filter(Boolean)
    )]
    if (merchants.length === 0) { setSuggestions([]); return }
    const params = new URLSearchParams()
    merchants.slice(0, 10).forEach(m => params.append('merchants[]', m))
    axios.get(`/api/llm/suggestions/for-merchants?${params}`)
      .then(r => {
        const cats = Object.values(r.data).flat()
        const ranked = [...new Map(cats.map(c => [c.toLowerCase(), c])).values()].slice(0, 3)
        setSuggestions(ranked)
      })
      .catch(() => setSuggestions([]))
  }, [selectedTransactions])

  const trimmed = category.trim()
  const isNew = trimmed.length > 0 && !categories.some(c => c.toLowerCase() === trimmed.toLowerCase())

  async function handleAssign(cat) {
    const val = (cat || trimmed)
    if (!val) return
    setSaving(true)
    try {
      const catIsNew = !categories.some(c => c.toLowerCase() === val.toLowerCase())
      await onAssign(val, catIsNew)
      setCategory('')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAssign()
    if (e.key === 'Escape') onClear()
  }

  return (
    <div className="space-y-2">
      {suggestions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
          <span className="text-xs font-semibold text-indigo-600 whitespace-nowrap">AI suggestions:</span>
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => handleAssign(s)}
              disabled={saving}
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-lg">
        <span className="text-sm font-semibold whitespace-nowrap">
          {count} selected
        </span>
        <div className="w-px h-4 bg-indigo-400" />
        <span className="text-xs text-indigo-200 whitespace-nowrap">Set category:</span>
        <div className="relative flex flex-col gap-1">
          <input
            ref={inputRef}
            list="bulk-cat-suggestions"
            value={category}
            onChange={e => setCategory(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Groceries"
            disabled={saving}
            className="text-xs bg-indigo-500 border border-indigo-400 rounded-lg px-3 py-1.5 text-white placeholder-indigo-300 focus:outline-none focus:border-white focus:bg-indigo-500 w-44 disabled:opacity-50"
          />
          <datalist id="bulk-cat-suggestions">
            {[...new Set(categories.map(c => formatCat(c)))].map(c => <option key={c} value={c} />)}
          </datalist>
          {isNew && (
            <span className="text-[10px] text-indigo-200 leading-none">
              ✦ New category — will be saved
            </span>
          )}
        </div>
        <button
          onClick={() => handleAssign()}
          disabled={saving || !trimmed}
          className="text-xs font-semibold bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          {saving ? 'Saving…' : isNew ? 'Create & Assign' : 'Assign'}
        </button>
        <button
          onClick={onClear}
          className="text-xs text-indigo-300 hover:text-white transition-colors ml-auto whitespace-nowrap"
        >
          Clear selection
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Transactions({ dateRange, syncVersion }) {
  const { all: categories, reload: reloadCats } = useCategories()
  const [rulePrompt, setRulePrompt] = useState(null) // null | { matchValue, category }
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [accountFilter, setAccountFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const { sorted, sortKey, sortDir, toggleSort } = useSort(transactions, 'amount', 'desc')

  useEffect(() => { fetchAccounts() }, [])
  useEffect(() => { fetchTransactions() }, [dateRange, accountFilter, syncVersion])

  // Clear selection when filters change
  useEffect(() => { setSelectedIds(new Set()) }, [dateRange, accountFilter, search, typeFilter])

  async function fetchAccounts() {
    try {
      const res = await axios.get('/api/teller/accounts')
      setAccounts(res.data)
    } catch (err) {
      console.error('Failed to fetch accounts', err)
    }
  }

  async function fetchTransactions() {
    setLoading(true); setError(null)
    try {
      const params = {
        start_date: format(dateRange.start, 'yyyy-MM-dd'),
        end_date: format(dateRange.end, 'yyyy-MM-dd'),
      }
      if (accountFilter !== 'all') params.account_id = accountFilter
      const res = await axios.get('/api/transactions', { params })
      setTransactions(res.data.map(tx => ({ ...tx, _merchant: tx.merchant_name || tx.name || '' })))
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const accountsByInstitution = useMemo(() => {
    const groups = {}
    accounts.forEach(a => {
      if (!groups[a.institution_name]) groups[a.institution_name] = []
      groups[a.institution_name].push(a)
    })
    return groups
  }, [accounts])

  const filtered = useMemo(() => {
    return sorted.filter(tx => {
      const matchSearch = !search ||
        (tx.merchant_name || tx.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (tx.personal_finance_category || '').toLowerCase().includes(search.toLowerCase()) ||
        (tx.account_name || '').toLowerCase().includes(search.toLowerCase())
      const matchType =
        typeFilter === 'all' ||
        (typeFilter === 'expense' && tx.amount > 0) ||
        (typeFilter === 'income' && tx.amount < 0) ||
        (typeFilter === 'uncategorized' && !tx.personal_finance_category)
      return matchSearch && matchType
    })
  }, [sorted, search, typeFilter])

  const filteredIds = useMemo(() => new Set(filtered.map(tx => tx.transaction_id)), [filtered])
  const selectedInView = useMemo(() => [...selectedIds].filter(id => filteredIds.has(id)), [selectedIds, filteredIds])
  const allSelected = filteredIds.size > 0 && selectedInView.length === filteredIds.size
  const someSelected = selectedInView.length > 0 && !allSelected

  function toggleRow(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filteredIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => new Set([...prev, ...filteredIds]))
    }
  }

  async function handleBulkAssign(category, isNew) {
    const ids = [...selectedIds].filter(id => filteredIds.has(id))
    await axios.post('/api/transactions/bulk-categorize', { transaction_ids: ids, category })
    setTransactions(prev => prev.map(tx =>
      ids.includes(tx.transaction_id) ? { ...tx, personal_finance_category: category } : tx
    ))
    setSelectedIds(new Set())
    if (isNew) {
      try { await axios.post('/api/categories', { name: category.toLowerCase() }) } catch {}
      reloadCats()
    }
    if (search.trim()) {
      setRulePrompt({ matchValue: search.trim(), category })
    }
  }

  const totalExpenses = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalIncome  = filtered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const thCls = (col) => `${TH} ${sortKey === col ? 'text-indigo-600' : ''}`

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  return (
    <div className="space-y-4">
      {/* Rule creation prompt */}
      {rulePrompt && (
        <RulePromptModal
          matchValue={rulePrompt.matchValue}
          category={rulePrompt.category}
          categories={categories}
          onClose={() => setRulePrompt(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Transactions</h2>
          <p className="text-xs text-slate-500 mt-0.5">Select rows to bulk-assign a category · use Auto-categorize for rules</p>
        </div>
      </div>

      {/* Account filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setAccountFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            accountFilter === 'all'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          All Accounts
        </button>
        {Object.entries(accountsByInstitution).map(([institution, accts]) => (
          <div key={institution} className="flex items-center gap-1">
            <span className="text-xs text-slate-400">{institution}:</span>
            {accts.map(a => (
              <button
                key={a.account_id}
                onClick={() => setAccountFilter(a.account_id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  accountFilter === a.account_id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Summary + search row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {[['all','All'],['expense','Expenses'],['income','Income'],['uncategorized','Uncategorized']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                typeFilter === val ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search merchant, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />
        </div>

        {(search || typeFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setTypeFilter('all') }} className="text-xs text-slate-500 hover:text-slate-700 underline">Clear</button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
            {filtered.length} transactions
          </span>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            +{fmt.format(totalIncome)}
          </span>
          <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
            −{fmt.format(totalExpenses)}
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedInView.length > 0 && (
        <BulkActionBar
          count={selectedInView.length}
          onAssign={handleBulkAssign}
          onClear={() => setSelectedIds(new Set())}
          categories={categories}
          selectedTransactions={filtered.filter(tx => selectedIds.has(tx.transaction_id))}
        />
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
          <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          <p className="font-semibold text-slate-600">No transactions found</p>
          <p className="text-sm mt-1">Try adjusting your filters or date range.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="pl-4 pr-2 py-3 w-8">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className={`text-left ${thCls('date')}`} onClick={() => toggleSort('date')}>
                  Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={`text-left ${thCls('_merchant')}`} onClick={() => toggleSort('_merchant')}>
                  Merchant <SortIcon col="_merchant" sortKey={sortKey} sortDir={sortDir} />
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
              {filtered.map((tx, i) => {
                const isIncome = tx.amount < 0
                const isSelected = selectedIds.has(tx.transaction_id)
                const catLabel = formatCat(tx.personal_finance_category)
                return (
                  <tr
                    key={tx.transaction_id || tx.id || i}
                    className={`transition-colors ${tx.pending ? 'opacity-70' : ''} ${
                      isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <td className="pl-4 pr-2 py-3 w-8" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(tx.transaction_id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{tx.merchant_name || tx.name}</p>
                        {tx.pending ? <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Pending</span> : null}
                      </div>
                      {tx.merchant_name && tx.name !== tx.merchant_name && (
                        <p className="text-xs text-slate-400 mt-0.5">{tx.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {catLabel
                        ? <span className="text-sm text-slate-600">{catLabel}</span>
                        : <span className="text-sm text-slate-300 italic">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-600">{tx.account_name || tx.account_id}</p>
                      <p className="text-xs text-slate-400">{tx.institution_name}</p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={`text-sm font-bold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isIncome ? '+' : ''}{fmt.format(Math.abs(tx.amount))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td />
                <td colSpan={4} className="px-4 py-3 text-xs text-slate-500 font-medium">
                  {filtered.length} transactions
                  {selectedInView.length > 0 && (
                    <span className="ml-2 text-indigo-600 font-semibold">· {selectedInView.length} selected</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs font-bold text-emerald-600">+{fmt.format(totalIncome)}</span>
                    <span className="text-xs font-bold text-rose-600">−{fmt.format(totalExpenses)}</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
