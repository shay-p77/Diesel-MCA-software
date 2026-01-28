import { Deal } from '../../types'
import './SummaryTab.css'

interface SummaryTabProps {
  deal: Deal
}

export default function SummaryTab({ deal }: SummaryTabProps) {
  const dailyObligation = deal.existingPositions
    .filter(p => p.frequency === 'Daily')
    .reduce((sum, p) => sum + p.payment, 0)

  const totalPositionBalance = deal.existingPositions
    .reduce((sum, p) => sum + p.estimatedBalance, 0)

  return (
    <div className="summary-tab">
      {/* AI Summary */}
      <section className="summary-section">
        <h4>AI Summary</h4>
        <p className="ai-summary">{deal.aiSummary}</p>
      </section>

      {/* Bank Data */}
      {deal.bankData && (
        <section className="summary-section">
          <h4>Bank Statement Analysis</h4>
          <div className="data-grid">
            <div className="data-item">
              <span className="label">Total Deposits</span>
              <span className="value positive">${deal.bankData.totalDeposits.toLocaleString()}</span>
            </div>
            <div className="data-item">
              <span className="label">Total Withdrawals</span>
              <span className="value negative">${deal.bankData.totalWithdrawals.toLocaleString()}</span>
            </div>
            <div className="data-item">
              <span className="label">Ending Balance</span>
              <span className="value">${deal.bankData.endingBalance.toLocaleString()}</span>
            </div>
            <div className="data-item">
              <span className="label">Avg Daily Balance</span>
              <span className="value">${deal.bankData.avgDailyBalance.toLocaleString()}</span>
            </div>
            <div className="data-item">
              <span className="label">Daily Avg Deposit</span>
              <span className="value">${deal.bankData.dailyAvgDeposit.toLocaleString()}</span>
            </div>
            <div className="data-item">
              <span className="label">Months of Statements</span>
              <span className="value">{deal.bankData.monthsOfStatements}</span>
            </div>
            <div className="data-item">
              <span className="label">NSFs</span>
              <span className={`value ${deal.bankData.nsfs > 0 ? 'warning' : 'good'}`}>
                {deal.bankData.nsfs}
              </span>
            </div>
            <div className="data-item">
              <span className="label">Negative Days</span>
              <span className={`value ${deal.bankData.negativeDays > 0 ? 'warning' : 'good'}`}>
                {deal.bankData.negativeDays}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Existing Positions */}
      <section className="summary-section">
        <h4>Existing Positions ({deal.existingPositions.length})</h4>
        {deal.existingPositions.length > 0 ? (
          <>
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Lender</th>
                  <th>Payment</th>
                  <th>Freq</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {deal.existingPositions.map((pos, i) => (
                  <tr key={i}>
                    <td>{pos.lender}</td>
                    <td>${pos.payment.toLocaleString()}</td>
                    <td>{pos.frequency}</td>
                    <td>${pos.estimatedBalance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="position-totals">
              <div className="total-item">
                <span>Daily Obligation:</span>
                <strong>${dailyObligation.toLocaleString()}/day</strong>
              </div>
              <div className="total-item">
                <span>Total Balance:</span>
                <strong>${totalPositionBalance.toLocaleString()}</strong>
              </div>
            </div>
          </>
        ) : (
          <p className="no-positions">No existing positions detected</p>
        )}
      </section>

      {/* Deal Info */}
      <section className="summary-section">
        <h4>Deal Information</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Business Name</span>
            <span className="value">{deal.businessName}</span>
          </div>
          <div className="info-item">
            <span className="label">Owner</span>
            <span className="value">{deal.ownerName}</span>
          </div>
          <div className="info-item">
            <span className="label">Industry</span>
            <span className="value">{deal.industry}</span>
          </div>
          <div className="info-item">
            <span className="label">Amount Requested</span>
            <span className="value">${deal.amountRequested.toLocaleString()}</span>
          </div>
          <div className="info-item">
            <span className="label">Date Submitted</span>
            <span className="value">{new Date(deal.dateSubmitted).toLocaleDateString()}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
