import { useState } from 'react'
import { Deal } from '../../types'
import './SummaryTab.css'

interface SummaryTabProps {
  deal: Deal
  onEditDeal?: () => void
}

export default function SummaryTab({ deal, onEditDeal }: SummaryTabProps) {
  const [activeView, setActiveView] = useState<'extracted' | 'analysis'>('extracted')

  const dailyObligation = deal.existingPositions
    .filter(p => p.frequency === 'Daily')
    .reduce((sum, p) => sum + p.payment, 0)

  // Mock AI insights based on the extracted data
  const aiInsights = [
    {
      type: deal.existingPositions.length > 2 ? 'warning' : deal.existingPositions.length > 0 ? 'info' : 'positive',
      text: deal.existingPositions.length > 2
        ? `High stacking: ${deal.existingPositions.length} existing positions with $${dailyObligation}/day obligation`
        : deal.existingPositions.length > 0
        ? `${deal.existingPositions.length} existing position(s) detected - moderate stacking`
        : 'No existing positions - clean account'
    },
    {
      type: deal.bankData?.nsfs && deal.bankData.nsfs > 2 ? 'warning' : deal.bankData?.nsfs && deal.bankData.nsfs > 0 ? 'info' : 'positive',
      text: deal.bankData?.nsfs && deal.bankData.nsfs > 2
        ? `${deal.bankData.nsfs} NSFs detected - cash flow concerns`
        : deal.bankData?.nsfs && deal.bankData.nsfs > 0
        ? `${deal.bankData.nsfs} NSF(s) - minor concern`
        : 'No NSFs - healthy account management'
    },
    {
      type: deal.bankData?.negativeDays && deal.bankData.negativeDays > 0 ? 'warning' : 'positive',
      text: deal.bankData?.negativeDays && deal.bankData.negativeDays > 0
        ? `Account went negative ${deal.bankData.negativeDays} day(s)`
        : 'No negative balance days'
    },
    {
      type: 'info',
      text: `Daily deposit average: $${deal.bankData?.dailyAvgDeposit?.toLocaleString() || 'N/A'}`
    }
  ]

  const getRiskLevel = () => {
    let score = 0
    if (deal.existingPositions.length > 3) score += 3
    else if (deal.existingPositions.length > 1) score += 1
    if (deal.bankData?.nsfs && deal.bankData.nsfs > 3) score += 3
    else if (deal.bankData?.nsfs && deal.bankData.nsfs > 0) score += 1
    if (deal.bankData?.negativeDays && deal.bankData.negativeDays > 3) score += 2

    if (score >= 5) return { level: 'High Risk', class: 'risk-high' }
    if (score >= 2) return { level: 'Moderate Risk', class: 'risk-moderate' }
    return { level: 'Low Risk', class: 'risk-low' }
  }

  const risk = getRiskLevel()

  return (
    <div className="summary-tab">
      {/* Toggle between Extracted Data and AI Analysis */}
      <div className="view-toggle">
        <button
          className={activeView === 'extracted' ? 'active' : ''}
          onClick={() => setActiveView('extracted')}
        >
          <span className="toggle-icon">📊</span>
          Extracted Data
        </button>
        <button
          className={activeView === 'analysis' ? 'active' : ''}
          onClick={() => setActiveView('analysis')}
        >
          <span className="toggle-icon">🤖</span>
          AI Analysis
        </button>
      </div>

      {activeView === 'extracted' ? (
        <>
          {/* Source Badge */}
          <div className="source-badge">
            <span className="source-icon">⚡</span>
            <span>Data extracted by <strong>Koncile</strong></span>
          </div>

          {/* Bank Data Spreadsheet View */}
          {deal.bankData && (
            <section className="summary-section spreadsheet-section">
              <h4>Bank Statement Data</h4>
              <table className="spreadsheet-table">
                <tbody>
                  <tr>
                    <td className="cell-label">Total Deposits</td>
                    <td className="cell-value positive">${deal.bankData.totalDeposits.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Total Withdrawals</td>
                    <td className="cell-value negative">${deal.bankData.totalWithdrawals.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Ending Balance</td>
                    <td className="cell-value">${deal.bankData.endingBalance.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Avg Daily Balance</td>
                    <td className="cell-value">${deal.bankData.avgDailyBalance.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Avg Daily Deposit</td>
                    <td className="cell-value">${deal.bankData.dailyAvgDeposit.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Statement Period</td>
                    <td className="cell-value">{deal.bankData.monthsOfStatements} months</td>
                  </tr>
                  <tr className={deal.bankData.nsfs > 0 ? 'row-warning' : ''}>
                    <td className="cell-label">NSF Count</td>
                    <td className={`cell-value ${deal.bankData.nsfs > 0 ? 'warning' : 'good'}`}>
                      {deal.bankData.nsfs}
                    </td>
                  </tr>
                  <tr className={deal.bankData.negativeDays > 0 ? 'row-warning' : ''}>
                    <td className="cell-label">Negative Days</td>
                    <td className={`cell-value ${deal.bankData.negativeDays > 0 ? 'warning' : 'good'}`}>
                      {deal.bankData.negativeDays}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          {/* Existing Positions */}
          <section className="summary-section spreadsheet-section">
            <h4>Detected Positions ({deal.existingPositions.length})</h4>
            {deal.existingPositions.length > 0 ? (
              <>
                <table className="spreadsheet-table positions">
                  <thead>
                    <tr>
                      <th>Lender</th>
                      <th>Payment</th>
                      <th>Freq</th>
                      <th>Est. Bal</th>
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
                  <tfoot>
                    <tr>
                      <td colSpan={2}><strong>Total Daily</strong></td>
                      <td colSpan={2}><strong>${dailyObligation.toLocaleString()}/day</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </>
            ) : (
              <p className="no-positions">No existing positions detected</p>
            )}
          </section>

          {/* Deal Info */}
          <section className="summary-section">
            <div className="section-header">
              <h4>Deal Information</h4>
              {onEditDeal && (
                <button className="btn-edit-deal" onClick={onEditDeal}>
                  Edit
                </button>
              )}
            </div>
            <table className="spreadsheet-table">
              <tbody>
                <tr>
                  <td className="cell-label">Business</td>
                  <td className="cell-value">{deal.businessName}</td>
                </tr>
                <tr>
                  <td className="cell-label">Requesting</td>
                  <td className="cell-value">${deal.amountRequested.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="cell-label">Submitted</td>
                  <td className="cell-value">{new Date(deal.dateSubmitted).toLocaleDateString()}</td>
                </tr>
                {deal.broker && (
                  <tr>
                    <td className="cell-label">Broker / ISO</td>
                    <td className="cell-value">{deal.broker}</td>
                  </tr>
                )}
                {deal.notes && (
                  <tr>
                    <td className="cell-label">Notes</td>
                    <td className="cell-value">{deal.notes}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <>
          {/* AI Source Badge */}
          <div className="source-badge ai-badge">
            <span className="source-icon">🤖</span>
            <span>Analysis by <strong>Claude AI</strong></span>
          </div>

          {/* Risk Assessment */}
          <section className="summary-section ai-section">
            <h4>Risk Assessment</h4>
            <div className={`risk-badge ${risk.class}`}>
              {risk.level}
            </div>
            <p className="ai-note">Based on extracted Koncile data</p>
          </section>

          {/* AI Summary */}
          <section className="summary-section ai-section">
            <h4>Deal Summary</h4>
            <p className="ai-summary">{deal.aiSummary}</p>
          </section>

          {/* AI Insights */}
          <section className="summary-section ai-section">
            <h4>Key Insights</h4>
            <ul className="insights-list">
              {aiInsights.map((insight, i) => (
                <li key={i} className={`insight-item ${insight.type}`}>
                  {insight.type === 'warning' && '⚠️ '}
                  {insight.type === 'positive' && '✓ '}
                  {insight.type === 'info' && 'ℹ️ '}
                  {insight.text}
                </li>
              ))}
            </ul>
          </section>

          {/* Data Source Reference */}
          <section className="summary-section data-reference">
            <p>
              <small>
                This analysis is based on the Koncile-extracted data.
                Switch to "Extracted Data" tab to verify the source numbers.
              </small>
            </p>
          </section>
        </>
      )}
    </div>
  )
}


/* =============================================================================
   ORIGINAL COMPONENT CODE (commented out for reference)
   =============================================================================

export default function SummaryTabOriginal({ deal }: SummaryTabProps) {
  const dailyObligation = deal.existingPositions
    .filter(p => p.frequency === 'Daily')
    .reduce((sum, p) => sum + p.payment, 0)

  const totalPositionBalance = deal.existingPositions
    .reduce((sum, p) => sum + p.estimatedBalance, 0)

  return (
    <div className="summary-tab">
      <section className="summary-section">
        <h4>AI Summary</h4>
        <p className="ai-summary">{deal.aiSummary}</p>
      </section>

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

============================================================================= */
