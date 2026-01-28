import { Deal } from '../../types'
import './StatsRow.css'

interface StatsRowProps {
  deals: Deal[]
}

export default function StatsRow({ deals }: StatsRowProps) {
  const totalRequested = deals.reduce((sum, d) => sum + d.amountRequested, 0)

  return (
    <div className="stats-row">
      <div className="stat-card">
        <span className="stat-value">{deals.length}</span>
        <span className="stat-label">Total Deals</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{deals.filter(d => d.status === 'pending').length}</span>
        <span className="stat-label">Pending</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{deals.filter(d => d.status === 'under_review').length}</span>
        <span className="stat-label">Under Review</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">${(totalRequested / 1000).toFixed(0)}k</span>
        <span className="stat-label">Total Requested</span>
      </div>
    </div>
  )
}
