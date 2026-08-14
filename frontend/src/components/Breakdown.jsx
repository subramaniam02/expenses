import { useState } from 'react'
import CategoryBreakdown from './CategoryBreakdown'
import MerchantBreakdown from './MerchantBreakdown'
import Income from './Income'
import Transactions from './Transactions'

const TABS = [
  ['categories',   'Categories'],
  ['merchants',    'Merchants'],
  ['income',       'Income'],
  ['transactions', 'Transactions'],
]

export default function Breakdown({ dateRange, syncVersion }) {
  const [view, setView] = useState('categories')

  return (
    <div className="space-y-4">
      <div className="flex items-center bg-slate-100 rounded-lg p-0.5 w-fit">
        {TABS.map(([val, label]) => (
          <button
            key={val}
            onClick={() => setView(val)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              view === val ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'categories'   && <CategoryBreakdown dateRange={dateRange} syncVersion={syncVersion} />}
      {view === 'merchants'    && <MerchantBreakdown dateRange={dateRange} syncVersion={syncVersion} />}
      {view === 'income'       && <Income dateRange={dateRange} syncVersion={syncVersion} />}
      {view === 'transactions' && <Transactions dateRange={dateRange} syncVersion={syncVersion} />}
    </div>
  )
}
