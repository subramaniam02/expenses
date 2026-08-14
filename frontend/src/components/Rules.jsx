import { useState, useEffect } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'
import { useSort, SortIcon } from '../hooks/useSort'
import { useCategories } from '../hooks/useCategories'
import { formatCat } from '../utils/formatCat'

const FIELD_LABELS = { any: 'Merchant or Name', merchant_name: 'Merchant name', name: 'Transaction name' }
const TYPE_LABELS  = { contains: 'contains', exact: 'exactly matches', starts_with: 'starts with' }
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    </div>
  )
}

// ── Rule creation modal ───────────────────────────────────────────────────────
function RuleModal({ row, form, onChange, onSave, onClose, categories, saving }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg mx-4 p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Create Auto-categorization Rule</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-semibold text-slate-700">{row.merchant}</span>
              {' · '}{row.count} transaction{row.count !== 1 ? 's' : ''}
              {' · '}{fmt.format(row.total)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mr-1 -mt-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Match field</label>
              <select
                value={form.match_field}
                onChange={e => onChange(f => ({ ...f, match_field: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
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
                onChange={e => onChange(f => ({ ...f, match_type: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
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
              onChange={e => onChange(f => ({ ...f, match_value: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Set category to</label>
            <input
              list="modal-cat-list"
              value={form.category}
              onChange={e => onChange(f => ({ ...f, category: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && onSave()}
              placeholder="e.g. Groceries"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
            />
            <datalist id="modal-cat-list">
              {[...new Set(categories.map(c => formatCat(c)))].map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Rename merchant to <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.rename_to}
              onChange={e => onChange(f => ({ ...f, rename_to: e.target.value }))}
              placeholder={`e.g. ${form.match_value || 'Whole Foods'}`}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
            />
            <p className="text-[11px] text-slate-400 mt-1">Rewrites the merchant name on all matching transactions.</p>
          </div>
        </div>

        {/* Rule preview */}
        {form.match_value.trim() && form.category.trim() && (
          <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 text-xs text-slate-600 space-y-1">
            <div>
              When <span className="font-medium text-slate-700">{FIELD_LABELS[form.match_field]}</span>{' '}
              <span className="text-slate-400">{TYPE_LABELS[form.match_type]}</span>{' '}
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{form.match_value}</code>
              {' → '}
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">{formatCat(form.category)}</span>
            </div>
            {form.rename_to.trim() && (
              <div className="text-slate-500">
                Rename: <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{form.match_value}</code>
                {' → '}
                <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{form.rename_to}</code>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving || !form.match_value.trim() || !form.category.trim()}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? 'Creating…' : 'Create Rule & Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Suggestions section ────────────────────────────────────────────────────
function AISuggestions({ categories, onCategoryCreated }) {
  const [suggestions, setSuggestions] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [editedCats, setEditedCats] = useState({})
  const [selected, setSelected] = useState(new Set())

  useEffect(() => { fetchSuggestions() }, [])

  async function fetchSuggestions() {
    setLoading(true)
    try {
      const [sugRes, statusRes] = await Promise.all([
        axios.get('/api/llm/suggestions?status=pending'),
        axios.get('/api/llm/status'),
      ])
      setSuggestions(sugRes.data)
      setStatus(statusRes.data)
      const initEdits = {}
      sugRes.data.forEach(s => { initEdits[s.id] = s.suggested_category })
      setEditedCats(initEdits)
      setSelected(new Set())
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  async function handleRun() {
    setRunning(true)
    try {
      await axios.post('/api/llm/categorize')
      await fetchSuggestions()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleAccept(id) {
    try {
      await axios.post(`/api/llm/suggestions/${id}/accept`, { category: editedCats[id] })
      setSuggestions(prev => prev.filter(s => s.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
      onCategoryCreated?.()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  async function handleReject(id) {
    try {
      await axios.post(`/api/llm/suggestions/${id}/reject`)
      setSuggestions(prev => prev.filter(s => s.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  async function handleAcceptSelected(ids) {
    const items = ids.map(id => ({ id, category: editedCats[id] || '' }))
    try {
      await axios.post('/api/llm/suggestions/accept-selected', items)
      const accepted = new Set(ids)
      setSuggestions(prev => prev.filter(s => !accepted.has(s.id)))
      setSelected(new Set())
      onCategoryCreated?.()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  const pendingCount = suggestions.length
  const selectedIds = [...selected]
  const allChecked = pendingCount > 0 && selected.size === pendingCount

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(suggestions.map(s => s.id)))
  }

  function toggleOne(id) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">AI Suggestions</h3>
          {pendingCount > 0 && (
            <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
          {status && (
            <span className="text-xs text-slate-400 font-normal">· {status.model}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => handleAcceptSelected(selectedIds)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Accept {selected.size === pendingCount ? 'All' : `${selected.size} Selected`}
            </button>
          )}
          {pendingCount > 0 && selected.size === 0 && (
            <button
              onClick={() => handleAcceptSelected(suggestions.map(s => s.id))}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Accept All
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            {running ? 'Analyzing…' : 'Run AI Analysis'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
          Loading suggestions…
        </div>
      ) : pendingCount === 0 ? (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          No pending suggestions. Click "Run AI Analysis" to categorize uncategorized merchants using Ollama.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => {}}
                    onMouseDown={e => { e.preventDefault(); toggleAll() }}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-400 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Merchant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Seen</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suggestions.map(s => (
                <tr key={s.id} className={`transition-colors ${selected.has(s.id) ? 'bg-violet-50/60' : 'hover:bg-slate-50/50'}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => {}}
                      onMouseDown={e => { e.preventDefault(); toggleOne(s.id) }}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-400 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{s.merchant}</span>
                      <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                        {s.transaction_count}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
                    {s.last_date ? formatDate(s.last_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-rose-600 tabular-nums">
                    {fmt.format(s.total_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      list={`ai-cat-list-${s.id}`}
                      value={editedCats[s.id] ?? formatCat(s.suggested_category)}
                      onChange={e => setEditedCats(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="text-sm border border-violet-200 bg-violet-50 text-violet-800 rounded-lg px-2.5 py-1 w-48 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
                    />
                    <datalist id={`ai-cat-list-${s.id}`}>
                      {[...new Set(categories.map(c => formatCat(c)))].map(c => <option key={c} value={c} />)}
                    </datalist>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleAccept(s.id)}
                        className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(s.id)}
                        className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Rules() {
  const { all: categories, reload: reloadCats } = useCategories()
  const [rules, setRules] = useState([])
  const { sorted: sortedRules, sortKey: rSortKey, sortDir: rSortDir, toggleSort: rToggleSort } = useSort(rules, 'id', 'asc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ match_field: 'any', match_type: 'contains', match_value: '', category: '', rename_to: '' })
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true); setError(null)
    try {
      const rulesRes = await axios.get('/api/rules')
      setRules(rulesRes.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!form.match_value.trim() || !form.category.trim()) return
    setSaving(true)
    try {
      await axios.post('/api/rules', form)
      setForm({ match_field: 'any', match_type: 'contains', match_value: '', category: '', rename_to: '' })
      setShowAdd(false)
      const rulesRes = await axios.get('/api/rules')
      setRules(rulesRes.data)
      reloadCats()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await axios.delete(`/api/rules/${id}`)
      setRules(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  async function handleApply() {
    setApplying(true); setApplyResult(null)
    try {
      const res = await axios.post('/api/rules/apply')
      setApplyResult(res.data.updated)
      const rulesRes = await axios.get('/api/rules')
      setRules(rulesRes.data)
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Auto-categorization Rules</h2>
          <p className="text-xs text-slate-500 mt-0.5">Rules run automatically on every sync. Manual edits are preserved.</p>
        </div>
        <div className="flex items-center gap-2">
          {applyResult !== null && (
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              {applyResult} transaction{applyResult !== 1 ? 's' : ''} re-categorized
            </span>
          )}
          <button
            onClick={handleApply}
            disabled={applying || rules.length === 0}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${applying ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {applying ? 'Applying…' : 'Apply to all'}
          </button>
          <button
            onClick={() => { setShowAdd(v => !v); setForm({ match_field: 'any', match_type: 'contains', match_value: '', category: '', rename_to: '' }) }}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Rule
          </button>
        </div>
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">New rule</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Where</label>
              <select
                value={form.match_field}
                onChange={e => setForm(f => ({ ...f, match_field: e.target.value }))}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
              >
                <option value="any">Merchant or Name</option>
                <option value="merchant_name">Merchant name</option>
                <option value="name">Transaction name</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Condition</label>
              <select
                value={form.match_type}
                onChange={e => setForm(f => ({ ...f, match_type: e.target.value }))}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
              >
                <option value="contains">contains</option>
                <option value="exact">exactly matches</option>
                <option value="starts_with">starts with</option>
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-slate-500 mb-1 block">Value</label>
              <input
                type="text"
                placeholder="e.g. WHOLEFDS"
                value={form.match_value}
                onChange={e => setForm(f => ({ ...f, match_value: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-slate-500 mb-1 block">Set category to</label>
              <input
                id="rule-category-input"
                list="rules-cat-list"
                placeholder="e.g. Groceries"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
              />
              <datalist id="rules-cat-list">
                {[...new Set(categories.map(c => formatCat(c)))].map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs text-slate-500 mb-1 block">Rename merchant to <span className="text-slate-400">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. Whole Foods"
                value={form.rename_to}
                onChange={e => setForm(f => ({ ...f, rename_to: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !form.match_value.trim() || !form.category.trim()}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowAdd(false)} className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rules table ── */}
      {rules.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
          <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
          </svg>
          <p className="font-semibold text-slate-600">No rules yet</p>
          <p className="text-sm mt-1">Rules auto-categorize transactions on every sync.</p>
        </div>
      ) : rules.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap ${rSortKey === 'match_field' ? 'text-indigo-600' : 'text-slate-500'}`} onClick={() => rToggleSort('match_field')}>
                  When <SortIcon col="match_field" sortKey={rSortKey} sortDir={rSortDir} />
                </th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap ${rSortKey === 'match_value' ? 'text-indigo-600' : 'text-slate-500'}`} onClick={() => rToggleSort('match_value')}>
                  Value <SortIcon col="match_value" sortKey={rSortKey} sortDir={rSortDir} />
                </th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap ${rSortKey === 'category' ? 'text-indigo-600' : 'text-slate-500'}`} onClick={() => rToggleSort('category')}>
                  Category <SortIcon col="category" sortKey={rSortKey} sortDir={rSortDir} />
                </th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap ${rSortKey === 'rename_to' ? 'text-indigo-600' : 'text-slate-500'}`} onClick={() => rToggleSort('rename_to')}>
                  Rename to <SortIcon col="rename_to" sortKey={rSortKey} sortDir={rSortDir} />
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRules.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <span className="font-medium">{FIELD_LABELS[r.match_field]}</span>{' '}
                    <span className="text-slate-400">{TYPE_LABELS[r.match_type]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">{r.match_value}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">{formatCat(r.category)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.rename_to
                      ? <code className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded font-mono">{r.rename_to}</code>
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-slate-300 hover:text-rose-500 transition-colors"
                      title="Delete rule"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ── AI Suggestions ── */}
      <AISuggestions categories={categories} onCategoryCreated={reloadCats} />

      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
        <strong>Note:</strong> Rules only apply to transactions you haven't manually categorized. Use "Apply to all" to run rules against your full history.
      </div>
    </div>
  )
}
