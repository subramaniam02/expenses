import ExpenseIncomeTrend from './ExpenseIncomeTrend'
import Breakdown from './Breakdown'

export default function Trends({ dateRange, syncVersion }) {
  return (
    <div className="space-y-5">
      <ExpenseIncomeTrend syncVersion={syncVersion} />
      <Breakdown dateRange={dateRange} syncVersion={syncVersion} tabs={['categories', 'merchants']} />
    </div>
  )
}
