import { useState, useEffect } from 'react'
import axios from 'axios'
import { format, parseISO } from 'date-fns'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
function formatDate(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d } }

const SEVERITY = {
  high:   { label: 'High',   cls: 'bg-rose-100 text-rose-700 border border-rose-200',   dot: 'bg-rose-500',   card: 'border-rose-200' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 border border-amber-200', dot: 'bg-amber-500',  card: 'border-amber-200' },
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-600 border border-slate-200', dot: 'bg-slate-400',  card: 'border-slate-200' },
}

const TYPE_ICONS = {
  duplicate: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  ),
  unusually_large: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
    </svg>
  ),
  new_merchant: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016 2.993 2.993 0 0 0 2.25-1.016 3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
    </svg>
  ),
}

const TYPE_LABELS = {
  duplicate: 'Possible duplicate',
  unusually_large: 'Unusual charge',
  new_merchant: 'New merchant',
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Scanning for anomalies…</p>
      </div>
    </div>
  )
}

export default function Anomalies() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dismissed, setDismissed] = useState(new Set())
  const [filter, setFilter] = useState('all')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/anomalies')
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const visible = data
    .filter((_, i) => !dismissed.has(i))
    .filter(a => filter === 'all' || a.type === filter)

  const counts = {
    duplicate: data.filter(a => a.type === 'duplicate').length,
    unusually_large: data.filter(a => a.type === 'unusually_large').length,
    new_merchant: data.filter(a => a.type === 'new_merchant').length,
  }

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Anomaly Detection</h2>
          <p className="text-xs text-slate-500 mt-0.5">Flagged transactions from the last 90 days</p>
        </div>
        <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
          {visible.length} flag{visible.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: `All (${data.length})` },
          { key: 'duplicate', label: `Duplicates (${counts.duplicate})` },
          { key: 'unusually_large', label: `Unusual charges (${counts.unusually_large})` },
          { key: 'new_merchant', label: `New merchants (${counts.new_merchant})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
          <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="font-semibold text-slate-600">{data.length === 0 ? 'No anomalies detected' : 'All flagged items dismissed'}</p>
          <p className="text-sm mt-1">Your last 90 days of transactions look normal.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((anomaly, i) => {
            if (dismissed.has(i) || (filter !== 'all' && anomaly.type !== filter)) return null
            const sev = SEVERITY[anomaly.severity]
            return (
              <div key={i} className={`bg-white rounded-xl border shadow-sm p-4 ${sev.card}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    anomaly.severity === 'high' ? 'bg-rose-100 text-rose-600'
                    : anomaly.severity === 'medium' ? 'bg-amber-100 text-amber-600'
                    : 'bg-slate-100 text-slate-500'
                  }`}>
                    {TYPE_ICONS[anomaly.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sev.cls}`}>
                        {TYPE_LABELS[anomaly.type]}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sev.cls}`}>
                        {sev.label} severity
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{anomaly.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{anomaly.description}</p>
                    <div className="mt-2 space-y-1">
                      {anomaly.transactions.map((tx, j) => (
                        <div key={j} className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                          <span className="text-slate-400 w-20 flex-shrink-0">{formatDate(tx.date)}</span>
                          <span className="font-medium truncate">{tx.merchant_name || tx.name}</span>
                          <span className="ml-auto font-bold text-slate-800 flex-shrink-0">{fmt.format(tx.amount)}</span>
                          <span className="text-slate-400 flex-shrink-0">{tx.account_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setDismissed(prev => new Set([...prev, i]))}
                    className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
