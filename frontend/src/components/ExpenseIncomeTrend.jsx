import { useState, useEffect } from 'react'
import axios from 'axios'
import { format, subMonths } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatMonthLabel(label) {
  if (!label || !/^\d{4}-\d{2}$/.test(label)) return label || ''
  const [year, month] = label.split('-')
  return new Date(year, parseInt(month) - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
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

/** Always shows the trailing 12 months, independent of the page's date-range picker. */
export default function ExpenseIncomeTrend({ syncVersion }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { fetchData() }, [syncVersion])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const end = new Date()
      const start = subMonths(end, 12)
      const res = await axios.get('/api/transactions/by-period', {
        params: {
          start_date: format(start, 'yyyy-MM-dd'),
          end_date: format(end, 'yyyy-MM-dd'),
          period: 'month',
        },
      })
      setData(res.data.map(row => ({ ...row, period_key: row.period_label, period_label: formatMonthLabel(row.period_label) })))
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48 bg-white rounded-xl border border-slate-200">
      <div className="w-7 h-7 border-[2.5px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )
  if (error) return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">Error: {error}</div>
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="text-base font-semibold text-slate-900">Expense &amp; Income Trend</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-4">Last 12 months</p>
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
  )
}
