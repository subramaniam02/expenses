import { useState, useEffect } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useSort, SortIcon } from '../hooks/useSort'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatPeriodLabel(label, period) {
  if (!label) return ''
  if (period === 'month' && /^\d{4}-\d{2}$/.test(label)) {
    const [year, month] = label.split('-')
    return new Date(year, parseInt(month) - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
  }
  return label
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.fill }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-semibold text-slate-900">{fmt.format(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading time breakdown…</p>
      </div>
    </div>
  )
}

const TH = 'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap'

export default function TimeBreakdown({ dateRange }) {
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { sorted, sortKey, sortDir, toggleSort } = useSort(data, 'period_key', 'asc')

  useEffect(() => { fetchData() }, [dateRange, period])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await axios.get('/api/transactions/by-period', {
        params: {
          start_date: format(dateRange.start, 'yyyy-MM-dd'),
          end_date: format(dateRange.end, 'yyyy-MM-dd'),
          period,
        },
      })
      setData(res.data.map(row => ({
        ...row,
        period_key: row.period_label,
        period_label: formatPeriodLabel(row.period_label, period),
      })))
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>

  if (data.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
      <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
      <p className="font-semibold text-slate-600">No data for this period</p>
      <p className="text-sm mt-1">Try adjusting your date range or sync transactions.</p>
    </div>
  )

  const totalIncome   = data.reduce((s, r) => s + r.income, 0)
  const totalExpenses = data.reduce((s, r) => s + r.expenses, 0)
  const totalNet      = data.reduce((s, r) => s + r.net, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Spending Over Time</h2>
          <p className="text-xs text-slate-500 mt-0.5">Income vs expenses by {period === 'month' ? 'month' : 'week'}</p>
        </div>

        {/* Period toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {['month', 'week'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                period === p
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p === 'month' ? 'Monthly' : 'Weekly'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="period_label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false} tickLine={false}
              interval={0}
              angle={data.length > 8 ? -30 : 0}
              textAnchor={data.length > 8 ? 'end' : 'middle'}
              height={data.length > 8 ? 50 : 30}
            />
            <YAxis
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false} tickLine={false} width={44}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#64748b', paddingTop: '12px' }} />
            <Bar dataKey="income"   name="Income"   fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className={`text-left ${TH} ${sortKey === 'period_key' ? 'text-indigo-600' : ''}`} onClick={() => toggleSort('period_key')}>
                Period <SortIcon col="period_key" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${TH} ${sortKey === 'income' ? 'text-indigo-600' : ''}`} onClick={() => toggleSort('income')}>
                Income <SortIcon col="income" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${TH} ${sortKey === 'expenses' ? 'text-indigo-600' : ''}`} onClick={() => toggleSort('expenses')}>
                Expenses <SortIcon col="expenses" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${TH} ${sortKey === 'net' ? 'text-indigo-600' : ''}`} onClick={() => toggleSort('net')}>
                Net <SortIcon col="net" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map(row => (
              <tr key={row.period_key} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-sm font-semibold text-slate-800">{row.period_label}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600">{fmt.format(row.income)}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-rose-600">{fmt.format(row.expenses)}</td>
                <td className={`px-4 py-3 text-right text-sm font-bold ${row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {row.net >= 0 ? '+' : ''}{fmt.format(row.net)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="px-4 py-3 text-sm font-semibold text-slate-700">Total</td>
              <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700">{fmt.format(totalIncome)}</td>
              <td className="px-4 py-3 text-right text-sm font-bold text-rose-700">{fmt.format(totalExpenses)}</td>
              <td className={`px-4 py-3 text-right text-sm font-bold ${totalNet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {totalNet >= 0 ? '+' : ''}{fmt.format(totalNet)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
