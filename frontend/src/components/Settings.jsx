import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Settings({ onSettingsChanged }) {
  const [showTeller, setShowTeller] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    axios.get('/api/settings')
      .then(res => setShowTeller(res.data.show_teller))
      .finally(() => setLoading(false))
  }, [])

  async function toggle() {
    const next = !showTeller
    setSaving(true)
    try {
      await axios.put('/api/settings', { show_teller: next })
      setShowTeller(next)
      await onSettingsChanged?.()
    } catch (err) {
      console.error('Failed to update settings', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 max-w-lg">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Teller accounts</h2>
      <p className="text-xs text-slate-500 mb-4">
        Teller's API has shut down — its accounts and transaction history stay in your data
        but are hidden everywhere by default. Turn this on to show them again (e.g. to review
        old history) without needing to reconnect anything.
      </p>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="flex items-center gap-3 disabled:opacity-60"
      >
        <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          showTeller ? 'bg-indigo-600' : 'bg-slate-300'
        }`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            showTeller ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </span>
        <span className="text-sm text-slate-700">
          {showTeller ? 'Showing' : 'Hiding'} Teller accounts and transactions
        </span>
      </button>
    </div>
  )
}
