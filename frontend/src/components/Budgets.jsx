import { useState, useEffect } from 'react'
import axios from 'axios'
import { formatCat } from '../utils/formatCat'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading budgets…</p>
      </div>
    </div>
  )
}

function VelocityBar({ pct, projected, amount }) {
  const overshoot = projected > amount
  const barPct = Math.min(pct * 100, 100)
  const projectedPct = Math.min((projected / Math.max(amount, 0.01)) * 100, 100)

  return (
    <div className="space-y-1">
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
        {/* Projected ghost */}
        {projected > 0 && (
          <div
            className={`absolute inset-y-0 left-0 rounded-full opacity-30 ${overshoot ? 'bg-rose-500' : 'bg-indigo-400'}`}
            style={{ width: `${projectedPct}%` }}
          />
        )}
        {/* Actual spend */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${
            pct >= 1 ? 'bg-rose-500' : pct >= 0.8 ? 'bg-amber-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  )
}

export default function Budgets() {
  const [budgets, setBudgets] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category: '', amount: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const [bRes, sRes] = await Promise.all([
        axios.get('/api/budgets'),
        axios.get('/api/budgets/suggestions'),
      ])
      setBudgets(bRes.data)
      setSuggestions(sRes.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!form.category.trim() || !form.amount) return
    setSaving(true)
    try {
      await axios.post('/api/budgets', { category: form.category.trim(), amount: parseFloat(form.amount) })
      setForm({ category: '', amount: '' })
      setShowAdd(false)
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await axios.delete(`/api/budgets/${id}`)
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  const suggestionsMap = Object.fromEntries(suggestions.map(s => [s.category, s.suggested_monthly]))
  const budgetedCategories = new Set(budgets.map(b => b.category))
  const unbudgetedSuggestions = suggestions.filter(s => !budgetedCategories.has(s.category)).slice(0, 5)

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpend  = budgets.reduce((s, b) => s + b.current_spend, 0)
  const overCount   = budgets.filter(b => b.velocity_projected > b.amount).length

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Budget Envelopes</h2>
          <p className="text-xs text-slate-500 mt-0.5">Monthly spend targets with real-time velocity</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Budget
        </button>
      </div>

      {/* Summary */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <p className="text-xs text-slate-500">Total budget</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{fmt.format(totalBudget)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <p className="text-xs text-slate-500">Spent this month</p>
            <p className={`text-xl font-bold mt-1 ${totalSpend > totalBudget ? 'text-rose-600' : 'text-slate-900'}`}>{fmt.format(totalSpend)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <p className="text-xs text-slate-500">On track to overshoot</p>
            <p className={`text-xl font-bold mt-1 ${overCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{overCount} categor{overCount === 1 ? 'y' : 'ies'}</p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">New budget envelope</p>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-slate-500 mb-1 block">Category</label>
              <input
                list="cat-list"
                placeholder="e.g. Dining Out"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
              />
              <datalist id="cat-list">
                {suggestions.map(s => <option key={s.category} value={s.category} />)}
              </datalist>
            </div>
            <div className="w-36">
              <label className="text-xs text-slate-500 mb-1 block">
                Monthly limit
                {form.category && suggestionsMap[form.category] && (
                  <button
                    className="ml-2 text-indigo-500 underline"
                    onClick={() => setForm(f => ({ ...f, amount: suggestionsMap[f.category].toFixed(0) }))}
                  >
                    use avg ({fmt.format(suggestionsMap[form.category])})
                  </button>
                )}
              </label>
              <input
                type="number"
                min="0"
                placeholder="500"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !form.category || !form.amount}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowAdd(false)} className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Budget list */}
      {budgets.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
          <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="font-semibold text-slate-600">No budgets set</p>
          <p className="text-sm mt-1">Click "Add Budget" to create your first envelope.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => {
            const overshoot = b.velocity_projected > b.amount
            const atRisk = !overshoot && b.pct_used >= 0.8
            return (
              <div key={b.id} className={`bg-white rounded-xl border shadow-sm p-4 ${
                b.pct_used >= 1 ? 'border-rose-300' : atRisk ? 'border-amber-300' : 'border-slate-200'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{formatCat(b.category)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {b.days_elapsed}d of {b.days_in_month}d elapsed this month
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-sm font-bold ${b.pct_used >= 1 ? 'text-rose-600' : 'text-slate-800'}`}>
                        {fmt.format(b.current_spend)} <span className="text-xs font-normal text-slate-400">/ {fmt.format(b.amount)}</span>
                      </p>
                      {overshoot && (
                        <p className="text-xs text-rose-500 font-medium">
                          Projected: {fmt.format(b.velocity_projected)} (+{fmt.format(b.velocity_projected - b.amount)})
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="text-slate-300 hover:text-rose-500 transition-colors"
                      title="Remove budget"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <VelocityBar pct={b.pct_used} projected={b.velocity_projected} amount={b.amount} />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-slate-400">{(b.pct_used * 100).toFixed(0)}% used</span>
                  {overshoot
                    ? <span className="text-[10px] text-rose-500 font-medium">On track to overshoot by {fmt.format(b.velocity_projected - b.amount)}</span>
                    : <span className="text-[10px] text-slate-400">{fmt.format(b.amount - b.current_spend)} remaining</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Suggestions for unbudgeted categories */}
      {unbudgetedSuggestions.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-700 mb-2">Suggested budgets based on your last 3 months</p>
          <div className="flex flex-wrap gap-2">
            {unbudgetedSuggestions.map(s => (
              <button
                key={s.category}
                onClick={() => { setForm({ category: s.category, amount: s.suggested_monthly.toFixed(0) }); setShowAdd(true) }}
                className="text-xs bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                {formatCat(s.category)} — {fmt.format(s.suggested_monthly)}/mo
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
