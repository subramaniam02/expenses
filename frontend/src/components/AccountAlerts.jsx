import { useState, useMemo } from 'react'
import axios from 'axios'
import { openTellerConnect } from '../utils/tellerConnect'

function describeError(errorCode) {
  if (errorCode === 'enrollment.disconnected.user_action.mfa_required') return 'Needs MFA verification'
  if (errorCode === 'enrollment.disconnected.user_action.credentials_required') return 'Needs sign-in again'
  return 'Needs reauthentication'
}

export default function AccountAlerts({ accounts, onResolved }) {
  const [open, setOpen] = useState(false)
  const [connectingKey, setConnectingKey] = useState(null)
  const [error, setError] = useState(null)

  const flagged = accounts.filter(a => a.status === 'reauth_required')

  // Group by enrollment so a bank with multiple flagged accounts (e.g. checking + credit card
  // under one login) shows a single reconnect action instead of one per account.
  const groups = useMemo(() => {
    const byEnrollment = {}
    for (const a of flagged) {
      const key = a.enrollment_id || a.account_id
      if (!byEnrollment[key]) byEnrollment[key] = []
      byEnrollment[key].push(a)
    }
    return Object.values(byEnrollment)
  }, [flagged])

  if (flagged.length === 0) return null

  function handleConnect(key, enrollmentId) {
    setError(null)
    setConnectingKey(key)
    try {
      openTellerConnect({
        enrollmentId,
        onSuccess: async (enrollment) => {
          try {
            await axios.post('/api/teller/enroll', {
              access_token: enrollment.accessToken,
              enrollment_id: enrollment.enrollment.id,
              institution: enrollment.enrollment.institution,
              user_id: enrollment.user?.id,
            })
            await onResolved()
            setOpen(false)
          } catch (err) {
            setError('Failed to save account: ' + (err.response?.data?.error || err.message))
          } finally {
            setConnectingKey(null)
          }
        },
        onExit: () => setConnectingKey(null),
      })
    } catch (err) {
      setError(err.message)
      setConnectingKey(null)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        {flagged.length} account{flagged.length > 1 ? 's' : ''} need{flagged.length > 1 ? '' : 's'} attention
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Reconnect required</p>
          {groups.map(group => {
            const key = group[0].enrollment_id || group[0].account_id
            const newKey = `${key}:new`
            return (
              <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50/60 border border-amber-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{group.map(a => a.name).join(', ')}</p>
                  <p className="text-xs text-slate-500 truncate">{group[0].institution_name}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{describeError(group[0].error_code)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleConnect(key, group[0].enrollment_id)}
                    disabled={connectingKey === key || connectingKey === newKey}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    {connectingKey === key ? 'Connecting…' : 'Reconnect'}
                  </button>
                  <button
                    onClick={() => handleConnect(newKey, undefined)}
                    disabled={connectingKey === key || connectingKey === newKey}
                    className="text-xs text-slate-500 hover:text-slate-700 underline disabled:opacity-60"
                  >
                    {connectingKey === newKey ? 'Connecting…' : 'Or link as new'}
                  </button>
                </div>
              </div>
            )
          })}
          {error && <p className="text-xs text-rose-600 px-1">{error}</p>}
        </div>
      )}
    </div>
  )
}
