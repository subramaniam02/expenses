import { useState, useCallback, useRef } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { openTellerConnect } from '../utils/tellerConnect'
import { openPlaidLink } from '../utils/plaidLink'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const TYPE_STYLES = {
  credit:     'bg-rose-50 text-rose-700 border border-rose-200',
  investment: 'bg-violet-50 text-violet-700 border border-violet-200',
  depository: 'bg-sky-50 text-sky-700 border border-sky-200',
}
function typeStyle(type) {
  return TYPE_STYLES[type] || 'bg-slate-100 text-slate-600 border border-slate-200'
}

function EditableAccountName({ account, onAccountsUpdated }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(account.name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  function startEditing() {
    setValue(account.name)
    setEditing(true)
  }

  async function save() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === account.name) { setEditing(false); return }
    setSaving(true)
    try {
      await axios.patch(`/api/accounts/${account.account_id}`, { name: trimmed })
      await onAccountsUpdated()
    } catch (err) {
      console.error('Failed to rename account', err)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={value}
        disabled={saving}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="font-semibold text-sm text-slate-800 border border-indigo-300 rounded px-1 -mx-1 w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    )
  }

  return (
    <p
      onClick={startEditing}
      title="Click to rename"
      className="font-semibold text-sm text-slate-800 truncate cursor-text hover:bg-slate-100 rounded px-1 -mx-1"
    >
      {account.name}
    </p>
  )
}

/** Toggles an account's `hidden` flag — hidden accounts drop out of every transaction-based
 * view (Overview, Breakdown, Budgets, etc.) but stay visible here so they can be un-hidden. */
function HideToggleButton({ account, onAccountsUpdated }) {
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    try {
      await axios.patch(`/api/accounts/${account.account_id}`, { hidden: !account.hidden })
      await onAccountsUpdated()
    } catch (err) {
      console.error('Failed to toggle hidden', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-60 transition-colors"
    >
      {loading ? '…' : account.hidden ? 'Unhide' : 'Hide'}
    </button>
  )
}

function describeError(errorCode) {
  if (errorCode === 'enrollment.disconnected.user_action.mfa_required') return 'Needs MFA verification'
  if (errorCode === 'enrollment.disconnected.user_action.credentials_required') return 'Needs sign-in again'
  return 'Needs reauthentication'
}

/** Opens Teller Connect (fresh link if `enrollmentId` is omitted, repair/update mode otherwise), then
 * posts the result to /api/teller/enroll. Shared by "Link Account" and each account's "Reconnect". */
function useTellerEnroll(onAccountsUpdated) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const connect = useCallback((enrollmentId) => {
    setError(null)
    try {
      openTellerConnect({
        enrollmentId,
        onInit: () => setLoading(true),
        onSuccess: async (enrollment) => {
          try {
            await axios.post('/api/teller/enroll', {
              access_token: enrollment.accessToken,
              enrollment_id: enrollment.enrollment.id,
              institution: enrollment.enrollment.institution,
              user_id: enrollment.user?.id,
            })
            await onAccountsUpdated()
          } catch (err) {
            setError('Failed to save account: ' + (err.response?.data?.error || err.message))
          } finally {
            setLoading(false)
          }
        },
        onExit: () => setLoading(false),
      })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [onAccountsUpdated])

  return { connect, loading, error }
}

/** Opens Plaid Link for a brand-new institution, then posts the result to /api/plaid/exchange.
 * Teller's API has shut down entirely, so this is the only working "link a new account" path —
 * see PlaidConnectButton below. Reconnect for existing Plaid items (update mode) isn't wired up
 * yet since there are no live Plaid accounts to reconnect until the first link succeeds. */
function usePlaidEnroll(onAccountsUpdated) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const connect = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data } = await axios.post('/api/plaid/link-token', {})
      openPlaidLink({
        linkToken: data.link_token,
        onSuccess: async ({ public_token, metadata }) => {
          try {
            await axios.post('/api/plaid/exchange', {
              public_token,
              institution: metadata.institution,
            })
            await onAccountsUpdated()
          } catch (err) {
            setError('Failed to save account: ' + (err.response?.data?.error || err.message))
          } finally {
            setLoading(false)
          }
        },
        onExit: () => setLoading(false),
      })
    } catch (err) {
      setError(err.response?.data?.error || err.message)
      setLoading(false)
    }
  }, [onAccountsUpdated])

  return { connect, loading, error }
}

function PlaidConnectButton({ onAccountsUpdated }) {
  const { connect, loading, error } = usePlaidEnroll(onAccountsUpdated)

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={loading}
        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
        {loading ? 'Connecting…' : 'Link Account (Plaid)'}
      </button>
      {error && <p className="text-rose-600 text-xs">{error}</p>}
    </div>
  )
}

// Teller's API has shut down entirely — "Link Account" no longer goes through Teller
// (see PlaidConnectButton above). useTellerEnroll is still used by ReconnectButton below,
// since existing Teller-linked accounts still show Reconnect/Link-as-new (even though
// clicking them now fails against Teller's dead API — that's expected, not a bug here).

function ReconnectButton({ account, onAccountsUpdated }) {
  const { connect, loading, error } = useTellerEnroll(onAccountsUpdated)
  const [connectingNew, setConnectingNew] = useState(false)

  function handleReconnect() {
    setConnectingNew(false)
    connect(account.enrollment_id)
  }
  function handleLinkAsNew() {
    setConnectingNew(true)
    connect(undefined)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleReconnect}
        disabled={loading}
        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-60 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        {loading && !connectingNew ? 'Connecting…' : 'Reconnect'}
      </button>
      <button
        onClick={handleLinkAsNew}
        disabled={loading}
        className="text-[11px] text-slate-500 hover:text-slate-700 underline disabled:opacity-60 transition-colors"
      >
        {loading && connectingNew ? 'Connecting…' : 'Or link as new'}
      </button>
      {error && <p className="text-rose-600 text-[10px] text-right max-w-[140px]">{error}</p>}
    </div>
  )
}

/** Unlinks a Plaid item (all its accounts + their transaction history) — e.g. to relink
 * from scratch and fix an Item's history window, which Plaid locks in at creation and
 * can't be extended by resyncing. Removing any one account under an item removes the
 * whole item, same as Teller's reconnect grouping in AccountAlerts. */
function RemovePlaidButton({ account, onAccountsUpdated }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleRemove() {
    if (!window.confirm(`Remove ${account.institution_name}? This unlinks all its accounts and deletes their transaction history.`)) return
    setLoading(true)
    setError(null)
    try {
      await axios.delete(`/api/plaid/items/${account.enrollment_id}`)
      await onAccountsUpdated()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRemove}
        disabled={loading}
        className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Removing…' : 'Remove'}
      </button>
      {error && <p className="text-rose-600 text-[10px] text-right max-w-[140px]">{error}</p>}
    </div>
  )
}

function QfxImport({ accounts }) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !accountId) return
    setResult(null); setError(null); setImporting(true)
    try {
      const content = await file.text()
      const res = await axios.post('/api/transactions/import/qfx', { content, account_id: accountId })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        Import QFX
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl min-w-[280px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Import QFX / OFX Statement</span>
        <button onClick={() => { setOpen(false); setResult(null); setError(null) }} className="text-slate-400 hover:text-slate-600">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <select
        value={accountId}
        onChange={e => setAccountId(e.target.value)}
        className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400"
      >
        <option value="">Select account…</option>
        {accounts.map(a => (
          <option key={a.account_id} value={a.account_id}>
            {a.institution_name} – {a.name}
          </option>
        ))}
      </select>
      <label className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
        accountId
          ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
      }`}>
        <svg className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          {importing
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          }
        </svg>
        {importing ? 'Importing…' : 'Choose .qfx / .ofx file'}
        <input
          ref={fileRef}
          type="file"
          accept=".qfx,.ofx"
          className="hidden"
          disabled={!accountId || importing}
          onChange={handleFile}
        />
      </label>
      {result && (
        <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-800 space-y-0.5">
          <p className="font-semibold">Import complete</p>
          <p>{result.imported} imported · {result.skipped_overlap} overlap · {result.skipped_duplicate} duplicate</p>
          {result.cutoff_date && <p className="text-emerald-600">Cutoff: {result.cutoff_date}</p>}
        </div>
      )}
      {error && (
        <div className="text-xs bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-700">{error}</div>
      )}
    </div>
  )
}

export default function AccountSetup({ accounts, onAccountsUpdated }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50/60 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
          </svg>
          <span className="text-sm font-semibold text-slate-800">Connected Accounts</span>
          <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {accounts.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div onClick={e => e.stopPropagation()} className="flex items-center gap-2">
            <QfxImport accounts={accounts} />
            <PlaidConnectButton onAccountsUpdated={onAccountsUpdated} />
          </div>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-400">
              <svg className="w-8 h-8 mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
              </svg>
              <p className="text-sm font-medium text-slate-500">No accounts linked yet</p>
              <p className="text-xs mt-0.5">Click "Link Account" to connect via Teller</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {accounts.map(acct => (
                <div key={acct.account_id} className={`bg-white border border-slate-200 rounded-xl p-3.5 hover:border-indigo-200 hover:shadow-sm transition-all ${acct.hidden ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="min-w-0 flex-1">
                      <EditableAccountName account={acct} onAccountsUpdated={onAccountsUpdated} />
                      <p className="text-xs text-slate-400 mt-0.5">{acct.institution_name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${typeStyle(acct.type)}`}>
                        {acct.subtype || acct.type}
                      </span>
                      {acct.hidden && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                          Hidden
                        </span>
                      )}
                    </div>
                  </div>
                  {acct.status === 'reauth_required' && (
                    <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2">
                      {describeError(acct.error_code)}
                    </p>
                  )}
                  <div className="space-y-1">
                    {acct.balance_current !== null && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Balance</span>
                        <span className="font-semibold text-slate-800">{fmt.format(acct.balance_current)}</span>
                      </div>
                    )}
                    {acct.balance_available !== null && acct.balance_available !== acct.balance_current && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Available</span>
                        <span className="font-medium text-slate-600">{fmt.format(acct.balance_available)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">History</span>
                      <span className="font-medium text-slate-600">
                        {acct.transaction_count > 0
                          ? `${acct.transaction_count} txns since ${format(new Date(acct.first_transaction_date + 'T00:00:00'), 'MMM d, yyyy')}`
                          : 'No transactions'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <HideToggleButton account={acct} onAccountsUpdated={onAccountsUpdated} />
                    {acct.provider === 'plaid'
                      ? <RemovePlaidButton account={acct} onAccountsUpdated={onAccountsUpdated} />
                      : <ReconnectButton account={acct} onAccountsUpdated={onAccountsUpdated} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
