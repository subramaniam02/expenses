import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { subDays, format } from 'date-fns'
import DateFilter from './components/DateFilter'
import Overview from './components/Overview'
import Trends from './components/Trends'
import Refunds from './components/Refunds'
import Recurring from './components/Recurring'
import Budgets from './components/Budgets'
import Rules from './components/Rules'
import Forecast from './components/Forecast'
import Anomalies from './components/Anomalies'
import TaxReport from './components/TaxReport'
import AccountAlerts from './components/AccountAlerts'
import AccountSetup from './components/AccountSetup'
import Settings from './components/Settings'

// ── SVG Icons ────────────────────────────────────────────────────────────────
const Icon = ({ path, path2, className = 'w-[18px] h-[18px]' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    {path2 && <path strokeLinecap="round" strokeLinejoin="round" d={path2} />}
  </svg>
)

const ICONS = {
  overview:    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
  transactions:'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z',
  expenses:    'M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181',
  income:      'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941',
  categories:  'M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z',
  merchants:   'M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016 2.993 2.993 0 0 0 2.25-1.016 3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z',
  top:         'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941',
  refunds:     'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
  time:        'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  sync:        'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  chevronLeft: 'M15.75 19.5 8.25 12l7.5-7.5',
  chevronRight:'M8.25 4.5l7.5 7.5-7.5 7.5',
  logo:        'M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  recurring:   'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  budgets:     'M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  rules:       'M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z',
  forecast:    'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941',
  anomalies:   'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  taxreport:   'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
  accounts:    'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z',
  settings:    'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z',
}

const NAV_ITEMS = [
  { id: 'overview',      label: 'Overview',         icon: 'overview',    group: 'analyze' },
  { id: 'trends',       label: 'Trends',           icon: 'time',        group: 'analyze' },
  { id: 'refunds',      label: 'Refunds & Credits',icon: 'refunds',     group: 'analyze' },
  { id: 'recurring',    label: 'Recurring',        icon: 'recurring',   group: 'manage' },
  { id: 'budgets',      label: 'Budgets',          icon: 'budgets',     group: 'manage' },
  { id: 'forecast',     label: 'Forecast',         icon: 'forecast',    group: 'manage' },
  { id: 'anomalies',    label: 'Anomalies',        icon: 'anomalies',   group: 'manage' },
  { id: 'rules',        label: 'Auto-categorize',  icon: 'rules',       group: 'manage' },
  { id: 'taxreport',    label: 'Tax Report',       icon: 'taxreport',   group: 'manage' },
  { id: 'accounts',     label: 'Accounts',         icon: 'accounts',    group: 'manage' },
  { id: 'settings',     label: 'Settings',         icon: 'settings',    group: 'manage' },
]

const NAV_LABELS = {
  overview: 'Overview',
  trends: 'Trends',
  refunds: 'Refunds & Credits',
  recurring: 'Recurring', budgets: 'Budgets', forecast: 'Forecast',
  anomalies: 'Anomalies', rules: 'Auto-categorize', taxreport: 'Tax Report',
  accounts: 'Accounts', settings: 'Settings',
}

function getDefaultDateRange() {
  const end = new Date()
  return { start: subDays(end, 6), end }
}

function useRelativeTime(isoString) {
  const [label, setLabel] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    function update() {
      if (!isoString) { setLabel(null); return }
      const diff = Math.floor((Date.now() - new Date(isoString)) / 1000)
      if (diff < 60)         setLabel('just now')
      else if (diff < 3600)  setLabel(`${Math.floor(diff / 60)}m ago`)
      else if (diff < 86400) setLabel(`${Math.floor(diff / 3600)}h ago`)
      else                   setLabel(`${Math.floor(diff / 86400)}d ago`)
    }
    update()
    timerRef.current = setInterval(update, 30_000)
    return () => clearInterval(timerRef.current)
  }, [isoString])

  return label
}

export default function App() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange())
  const [accounts, setAccounts] = useState([])
  const [activeSection, setActiveSection] = useState('overview')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [syncVersion, setSyncVersion] = useState(0)
  const syncedLabel = useRelativeTime(lastSyncedAt)

  useEffect(() => {
    fetchAccounts()
    fetchStatus()
    // Catches accounts flagged by the background scheduler's sync (every 4h) without requiring a page reload.
    const id = setInterval(fetchAccounts, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  async function fetchAccounts() {
    try {
      const res = await axios.get('/api/teller/accounts')
      setAccounts(res.data)
    } catch (err) {
      console.error('Failed to fetch accounts', err)
    }
  }

  async function fetchStatus() {
    try {
      const res = await axios.get('/api/teller/status')
      setLastSyncedAt(res.data.last_synced_at)
    } catch (err) {
      console.error('Failed to fetch sync status', err)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await axios.post('/api/teller/sync')
      const failedCount = res.data.accounts_failed?.length || 0
      setSyncMessage({
        ok: failedCount === 0,
        text: failedCount === 0
          ? `Synced ${res.data.synced} transactions from ${res.data.accounts_synced} account(s)`
          : `Synced ${res.data.synced} transactions from ${res.data.accounts_synced}/${res.data.accounts_total} account(s) — ${failedCount} need attention`,
      })
      await fetchAccounts()
      fetchStatus()
      setSyncVersion(v => v + 1)
    } catch (err) {
      setSyncMessage({ ok: false, text: 'Sync failed: ' + (err.response?.data?.error || err.message) })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMessage(null), 5000)
    }
  }

  function renderSection() {
    const props = { dateRange, syncVersion }
    switch (activeSection) {
      case 'overview':     return <Overview {...props} />
      case 'trends':       return <Trends {...props} />
      case 'refunds':      return <Refunds {...props} />
      case 'recurring':    return <Recurring />
      case 'budgets':      return <Budgets />
      case 'forecast':     return <Forecast />
      case 'anomalies':    return <Anomalies />
      case 'rules':        return <Rules />
      case 'taxreport':    return <TaxReport {...props} />
      case 'accounts':     return <AccountSetup accounts={accounts} onAccountsUpdated={async () => { await fetchAccounts(); setSyncVersion(v => v + 1) }} />
      case 'settings':     return <Settings onSettingsChanged={async () => { await fetchAccounts(); setSyncVersion(v => v + 1) }} />
      default:             return <Overview {...props} />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-[60px]'} transition-all duration-200 ease-in-out bg-[#0d1117] flex flex-col flex-shrink-0 select-none`}>

        {/* Brand */}
        <div className={`h-14 flex items-center border-b border-white/[0.06] px-3 flex-shrink-0 ${sidebarOpen ? 'gap-2.5' : 'justify-center'}`}>
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon path={ICONS.logo} className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && <span className="text-white font-semibold text-[15px] tracking-tight">FinTrack</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {['analyze', 'manage'].map(group => (
            <div key={group} className="mb-2">
              {sidebarOpen && (
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 pt-2 pb-1">
                  {group === 'analyze' ? 'Analyze' : 'Manage'}
                </p>
              )}
              {!sidebarOpen && group === 'manage' && (
                <div className="border-t border-white/[0.06] my-2" />
              )}
              <div className="space-y-0.5">
                {NAV_ITEMS.filter(i => i.group === group).map(item => {
                  const active = activeSection === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      title={!sidebarOpen ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-100
                        ${sidebarOpen ? 'px-3 py-2' : 'justify-center px-0 py-2'}
                        ${active
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/40'
                          : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                        }`}
                    >
                      <Icon path={ICONS[item.icon]} />
                      {sidebarOpen && <span>{item.label}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-2 border-t border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className={`w-full flex items-center rounded-lg px-3 py-2 text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors text-xs font-medium gap-2 ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <Icon path={sidebarOpen ? ICONS.chevronLeft : ICONS.chevronRight} />
            {sidebarOpen && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-200/80 flex items-center px-5 gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-400 text-sm">/</span>
            <span className="text-sm font-semibold text-slate-800">{NAV_LABELS[activeSection]}</span>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <DateFilter dateRange={dateRange} onChange={setDateRange} />
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <AccountAlerts
              accounts={accounts}
              onResolved={async () => { await fetchAccounts(); setSyncVersion(v => v + 1) }}
            />
            {syncMessage && (
              <span className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
                syncMessage.ok
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {syncMessage.text}
              </span>
            )}
            {!syncMessage && (
              <span
                className="text-xs text-slate-400 whitespace-nowrap"
                title={lastSyncedAt ? format(new Date(lastSyncedAt), 'MMM d, yyyy h:mm a') : undefined}
              >
                {syncedLabel
                  ? `Synced ${syncedLabel} · ${format(new Date(lastSyncedAt), 'MMM d, h:mm a')}`
                  : 'Never synced'}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Icon path={ICONS.sync} className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto px-5 py-4">
          {renderSection()}
        </main>

        <footer className="border-t border-slate-200 py-2 text-center flex-shrink-0">
          <a
            href="http://localhost:3002/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            API Docs (Swagger)
          </a>
        </footer>
      </div>
    </div>
  )
}
