import { useState, useEffect } from 'react'
import { Deal, BankAccount, AIAnalysis } from '../../types'
import { api } from '../../services/api'
import type { CalculatorState } from '../../pages/DealDetail/DealDetail'
import './SummaryTab.css'

interface SummaryTabProps {
  deal: Deal
  onEditDeal?: () => void
  calcState: CalculatorState
}

export default function SummaryTab({ deal, onEditDeal, calcState }: SummaryTabProps) {
  const [activeView, setActiveView] = useState<'extracted' | 'analysis'>('extracted')
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [localDeal, setLocalDeal] = useState(deal)
  const [positionReviews, setPositionReviews] = useState<Record<string, boolean | null>>({})

  // Update local deal when prop changes
  useEffect(() => {
    setLocalDeal(deal)
  }, [deal])

  // Auto-trigger analysis when switching to analysis view if not already analyzed
  useEffect(() => {
    const shouldAnalyze =
      activeView === 'analysis' &&
      !localDeal.aiAnalysis &&
      !analyzing &&
      localDeal.extractionStatus === 'done'

    if (shouldAnalyze) {
      handleAnalyze()
    }
  }, [activeView, localDeal.aiAnalysis, localDeal.extractionStatus])

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const result = await api.analyzeDeal(localDeal.id)
      setLocalDeal(result.deal)
    } catch (err: any) {
      console.error('Failed to analyze deal:', err)
      setAnalyzeError(err.message || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const handlePositionReview = async (lender: string, confirmed: boolean) => {
    setPositionReviews(prev => ({ ...prev, [lender]: confirmed }))
    try {
      await api.confirmMCAPosition(localDeal.id, lender, confirmed)
    } catch {
      // State is saved locally regardless
    }
  }

  const toggleAccount = (accountId: string) => {
    setExpandedAccounts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(accountId)) {
        newSet.delete(accountId)
      } else {
        newSet.add(accountId)
      }
      return newSet
    })
  }

  // Check if using multi-account structure
  const hasMultipleAccounts = localDeal.bankAccounts && localDeal.bankAccounts.length > 0
  const useLegacyData = !hasMultipleAccounts && localDeal.bankData

  // Calculate aggregated data across all accounts (for Extracted Data tab)
  const aggregatedData = hasMultipleAccounts ? localDeal.bankAccounts.reduce((acc, account) => ({
    totalDeposits: acc.totalDeposits + account.bankData.totalDeposits,
    totalWithdrawals: acc.totalWithdrawals + account.bankData.totalWithdrawals,
    totalTransactions: acc.totalTransactions + account.bankData.transactions.length,
    accountsProcessed: acc.accountsProcessed + (account.extractionStatus === 'done' ? 1 : 0),
  }), {
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalTransactions: 0,
    accountsProcessed: 0,
  }) : null

  // Count total internal transfers
  const totalInternalTransfers = hasMultipleAccounts
    ? localDeal.bankAccounts.reduce((sum, acc) => sum + (acc.internalTransfers?.length || 0), 0)
    : 0

  // ===== Claude AI Analysis data =====
  const analysis: AIAnalysis | null = localDeal.aiAnalysis

  // ===== Calculator-derived values (real-time, depend on user inputs) =====
  const { fundingAmount, factorRate, termWeeks, paymentFrequency } = calcState
  const amount = parseFloat(fundingAmount) || 0
  const factor = parseFloat(factorRate) || 1
  const weeks = parseInt(termWeeks) || 1

  const paybackAmount = amount * factor
  const totalPayments = paymentFrequency === 'daily' ? weeks * 5 : weeks
  const paymentAmount = paybackAmount / totalPayments

  const dieselMonthlyPayment = paymentFrequency === 'daily'
    ? paymentAmount * 22
    : paymentAmount * 4.33

  const lengthOfDealMonths = weeks / 4.33

  // Calculator metrics that combine Claude's base numbers with calc state
  // Recalculate obligations from active (non-rejected) positions
  const activePositions = (analysis?.mcaPositions || []).filter(
    p => positionReviews[p.lender] !== false
  )
  const existingDailyObligation = activePositions.reduce((sum, p) => {
    if (p.frequency === 'Daily') return sum + p.payment
    if (p.frequency === 'Weekly') return sum + p.payment / 5
    if (p.frequency === 'Monthly') return sum + p.payment / 22
    return sum
  }, 0)
  const existingMonthlyPayments = activePositions.reduce((sum, p) => {
    if (p.frequency === 'Daily') return sum + p.payment * 22
    if (p.frequency === 'Weekly') return sum + p.payment * 4.33
    if (p.frequency === 'Monthly') return sum + p.payment
    return sum
  }, 0)
  const avgMonthlyIncome = analysis?.avgMonthlyIncome || 0
  const avgMonthlyWithdrawals = analysis?.avgMonthlyWithdrawals || 0
  const annualIncome = analysis?.annualIncome || 0
  const avgDailyDeposit = analysis?.avgDailyDeposit || 0

  const newDailyObligation = paymentFrequency === 'daily' ? paymentAmount : paymentAmount / 5
  const totalDailyObligation = existingDailyObligation + newDailyObligation
  const totalMonthlyWithDiesel = existingMonthlyPayments + dieselMonthlyPayment

  const deductions = avgMonthlyWithdrawals - existingMonthlyPayments
  const monthlyNetRevenue = avgMonthlyIncome - avgMonthlyWithdrawals

  const holdbackPercent = avgMonthlyIncome > 0 ? (totalMonthlyWithDiesel / avgMonthlyIncome) * 100 : 0
  const paymentToIncomePercent = avgMonthlyIncome > 0 ? (dieselMonthlyPayment / avgMonthlyIncome) * 100 : 0
  const balanceToAnnualIncomePercent = annualIncome > 0 ? (paybackAmount / annualIncome) * 100 : 0
  const utilizationPercent = avgDailyDeposit > 0 ? (totalDailyObligation / avgDailyDeposit) * 100 : 0

  const renderBankAccountData = (account: BankAccount, index: number) => (
    <div key={account.id} className="bank-account-section">
      <div
        className="account-header"
        onClick={() => toggleAccount(account.id)}
        style={{ cursor: 'pointer' }}
      >
        <div className="account-info">
          <h5>
            {expandedAccounts.has(account.id) ? '▼ ' : '▶ '}
            {account.accountName || `Account ${index + 1}`}
          </h5>
          {account.bankName && <span className="bank-name">{account.bankName}</span>}
          {account.accountNumber && <span className="account-number"> (****{account.accountNumber.slice(-4)})</span>}
        </div>
        <span className={`extraction-status ${account.extractionStatus}`}>
          {account.extractionStatus === 'done' ? '✓' : account.extractionStatus === 'processing' ? '⏳' : '⚠'}
        </span>
      </div>

      {expandedAccounts.has(account.id) && account.extractionStatus === 'done' && (
        <div className="account-details">
          <table className="spreadsheet-table">
            <tbody>
              <tr>
                <td className="cell-label">Total Deposits</td>
                <td className="cell-value positive">${account.bankData.totalDeposits.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="cell-label">Total Withdrawals</td>
                <td className="cell-value negative">${account.bankData.totalWithdrawals.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="cell-label">Ending Balance</td>
                <td className="cell-value">${account.bankData.endingBalance.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="cell-label">Beginning Balance</td>
                <td className="cell-value">${account.bankData.beginningBalance.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="cell-label">Transactions</td>
                <td className="cell-value">{account.bankData.transactions.length}</td>
              </tr>
              {account.internalTransfers && account.internalTransfers.length > 0 && (
                <tr>
                  <td className="cell-label">Internal Transfers</td>
                  <td className="cell-value">{account.internalTransfers.length}</td>
                </tr>
              )}
            </tbody>
          </table>

          {account.internalTransfers && account.internalTransfers.length > 0 && (
            <div className="internal-transfers-list">
              <h6>Internal Transfers:</h6>
              {account.internalTransfers.map((transfer, idx) => (
                <div key={idx} className="transfer-item">
                  <span className="transfer-amount">${transfer.amount.toLocaleString()}</span>
                  <span className="transfer-date">{new Date(transfer.date).toLocaleDateString()}</span>
                  <span className="transfer-desc">{transfer.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Risk badge class from Claude's risk level
  const getRiskClass = (level: string) => {
    switch (level) {
      case 'low': return 'risk-low'
      case 'moderate': return 'risk-moderate'
      case 'high': return 'risk-high'
      default: return 'risk-moderate'
    }
  }

  const getRiskLabel = (level: string) => {
    switch (level) {
      case 'low': return 'Low Risk'
      case 'moderate': return 'Moderate Risk'
      case 'high': return 'High Risk'
      default: return level
    }
  }

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
                  <td className="cell-value">{localDeal.businessName}</td>
                </tr>
                <tr>
                  <td className="cell-label">Requesting</td>
                  <td className="cell-value">${localDeal.amountRequested.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="cell-label">Submitted</td>
                  <td className="cell-value">{new Date(localDeal.dateSubmitted).toLocaleDateString()}</td>
                </tr>
                {localDeal.broker && (
                  <tr>
                    <td className="cell-label">Broker / ISO</td>
                    <td className="cell-value">{localDeal.broker}</td>
                  </tr>
                )}
                {localDeal.notes && (
                  <tr>
                    <td className="cell-label">Notes</td>
                    <td className="cell-value">{localDeal.notes}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Multi-Account Summary */}
          {hasMultipleAccounts && (
            <>
              <section className="summary-section spreadsheet-section">
                <h4>Multi-Account Summary</h4>
                <table className="spreadsheet-table">
                  <tbody>
                    <tr>
                      <td className="cell-label">Total Accounts</td>
                      <td className="cell-value">{localDeal.bankAccounts.length}</td>
                    </tr>
                    <tr>
                      <td className="cell-label">Processed</td>
                      <td className="cell-value">{aggregatedData!.accountsProcessed} / {localDeal.bankAccounts.length}</td>
                    </tr>
                    <tr>
                      <td className="cell-label">Combined Deposits</td>
                      <td className="cell-value positive">${aggregatedData!.totalDeposits.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="cell-label">Combined Withdrawals</td>
                      <td className="cell-value negative">${aggregatedData!.totalWithdrawals.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="cell-label">Total Transactions</td>
                      <td className="cell-value">{aggregatedData!.totalTransactions}</td>
                    </tr>
                    {totalInternalTransfers > 0 && (
                      <tr>
                        <td className="cell-label">Internal Transfers</td>
                        <td className="cell-value info">{totalInternalTransfers}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              <section className="summary-section">
                <h4>Bank Accounts ({localDeal.bankAccounts.length})</h4>
                {localDeal.bankAccounts.map((account, index) => renderBankAccountData(account, index))}
              </section>
            </>
          )}

          {/* Legacy Single Account View */}
          {useLegacyData && (
            <section className="summary-section spreadsheet-section">
              <h4>Bank Statement Data</h4>
              <table className="spreadsheet-table">
                <tbody>
                  <tr>
                    <td className="cell-label">Total Deposits</td>
                    <td className="cell-value positive">${localDeal.bankData!.totalDeposits.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Total Withdrawals</td>
                    <td className="cell-value negative">${localDeal.bankData!.totalWithdrawals.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Ending Balance</td>
                    <td className="cell-value">${localDeal.bankData!.endingBalance.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Avg Daily Balance</td>
                    <td className="cell-value">${localDeal.bankData!.avgDailyBalance.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Avg Daily Deposit</td>
                    <td className="cell-value">${localDeal.bankData!.dailyAvgDeposit.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="cell-label">Statement Period</td>
                    <td className="cell-value">{localDeal.bankData!.monthsOfStatements} months</td>
                  </tr>
                  <tr className={localDeal.bankData!.nsfs > 0 ? 'row-warning' : ''}>
                    <td className="cell-label">NSF Count</td>
                    <td className={`cell-value ${localDeal.bankData!.nsfs > 0 ? 'warning' : 'good'}`}>
                      {localDeal.bankData!.nsfs}
                    </td>
                  </tr>
                  <tr className={localDeal.bankData!.negativeDays > 0 ? 'row-warning' : ''}>
                    <td className="cell-label">Negative Days</td>
                    <td className={`cell-value ${localDeal.bankData!.negativeDays > 0 ? 'warning' : 'good'}`}>
                      {localDeal.bankData!.negativeDays}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}
        </>
      ) : (
        <>
          {/* AI Source Badge */}
          <div className="source-badge ai-badge">
            <span className="source-icon">🤖</span>
            <span>Analysis by <strong>Claude AI</strong></span>
            {analysis && (
              <button className="btn-reanalyze" onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? 'Re-analyzing...' : 'Re-analyze'}
              </button>
            )}
          </div>

          {/* Loading / Error states */}
          {analyzing && !analysis && (
            <section className="summary-section ai-section">
              <div className="analysis-loading">
                <div className="loading-spinner" />
                <p>Claude is analyzing {localDeal.bankAccounts?.reduce((sum, a) => sum + (a.bankData?.transactions?.length || 0), 0) || 0} transactions...</p>
                <p className="ai-note">This may take 15-30 seconds</p>
              </div>
            </section>
          )}

          {analyzeError && !analysis && (
            <section className="summary-section ai-section">
              <p className="analysis-error">{analyzeError}</p>
              <button className="btn-reanalyze" onClick={handleAnalyze}>Retry</button>
            </section>
          )}

          {!analysis && !analyzing && !analyzeError && localDeal.extractionStatus !== 'done' && (
            <section className="summary-section ai-section">
              <p className="ai-summary empty">Upload bank statements to generate AI analysis</p>
            </section>
          )}

          {/* All analysis sections rendered from Claude's data */}
          {analysis && (
            <>
              {/* Risk Assessment */}
              <section className="summary-section ai-section">
                <h4>Risk Assessment</h4>
                <div className={`risk-badge ${getRiskClass(analysis.risk.level)}`}>
                  {getRiskLabel(analysis.risk.level)} ({analysis.risk.score}/10)
                </div>
                {analysis.risk.factors.length > 0 && (
                  <ul className="risk-factors">
                    {analysis.risk.factors.map((factor, i) => (
                      <li key={i}>{factor}</li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Deal Summary */}
              <section className="summary-section ai-section">
                <h4>Deal Summary</h4>
                <p className="ai-summary">{analysis.dealSummary}</p>
                <p className="ai-note">
                  Based on {analysis.totalTransactions} transactions across {analysis.monthsOfStatements} month(s)
                </p>
              </section>

              {/* Key Insights */}
              <section className="summary-section ai-section">
                <h4>Key Insights</h4>
                <ul className="insights-list">
                  {analysis.insights.map((insight, i) => (
                    <li key={i} className="insight-item info">
                      {insight}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Claude's Bank Metrics */}
              <section className="summary-section ai-section">
                <h4>Bank Metrics (AI Computed)</h4>
                <table className="spreadsheet-table">
                  <tbody>
                    <tr>
                      <td className="cell-label">Avg Daily Balance</td>
                      <td className="cell-value">${analysis.avgDailyBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td className="cell-label">Avg Daily Deposit</td>
                      <td className="cell-value">${analysis.avgDailyDeposit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr className={analysis.nsfs > 0 ? 'row-warning' : ''}>
                      <td className="cell-label">NSF Count</td>
                      <td className={`cell-value ${analysis.nsfs > 0 ? 'warning' : 'good'}`}>{analysis.nsfs}</td>
                    </tr>
                    <tr className={analysis.negativeDays > 0 ? 'row-warning' : ''}>
                      <td className="cell-label">Negative Days</td>
                      <td className={`cell-value ${analysis.negativeDays > 0 ? 'warning' : 'good'}`}>{analysis.negativeDays}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Existing MCA Positions (from Claude) */}
              <section className="summary-section positions-section">
                <h4>
                  Existing MCA Positions
                  {analysis.mcaPositions.length > 0 && (
                    <span className="auto-detected-badge">AI Detected</span>
                  )}
                </h4>

                {analysis.mcaPositions.length > 0 ? (
                  <div className="mca-review-list">
                    {analysis.mcaPositions.map((pos, idx) => {
                      const reviewStatus = positionReviews[pos.lender]
                      const isConfirmed = reviewStatus === true
                      const isRejected = reviewStatus === false
                      return (
                        <div
                          key={idx}
                          className={`mca-review-card ${isConfirmed ? 'confirmed' : ''} ${isRejected ? 'rejected' : ''}`}
                        >
                          <div className="mca-review-info">
                            <span className="mca-review-lender">{pos.lender}</span>
                            <span className="mca-review-details">
                              ${pos.payment.toLocaleString()} / {pos.frequency.toLowerCase()}
                              {pos.frequency === 'Daily' && ` ($${(pos.payment * 22).toLocaleString()}/mo)`}
                              {pos.frequency === 'Weekly' && ` ($${(pos.payment * 4.33).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo)`}
                            </span>
                            <span className="mca-review-balance">Est. balance: ${pos.estimatedBalance.toLocaleString()}</span>
                            <span className="mca-reasoning">{pos.reasoning}</span>
                          </div>
                          <div className="mca-review-actions">
                            {reviewStatus == null ? (
                              <>
                                <span className="mca-review-prompt">Is this an MCA?</span>
                                <button
                                  className="btn-mca-yes"
                                  onClick={() => handlePositionReview(pos.lender, true)}
                                >
                                  Yes
                                </button>
                                <button
                                  className="btn-mca-no"
                                  onClick={() => handlePositionReview(pos.lender, false)}
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <>
                                <span className={`mca-review-status ${isConfirmed ? 'confirmed' : 'rejected'}`}>
                                  {isConfirmed ? 'Confirmed MCA' : 'Not an MCA'}
                                </span>
                                <button
                                  className="btn-mca-undo"
                                  onClick={() => setPositionReviews(prev => ({ ...prev, [pos.lender]: null }))}
                                >
                                  Undo
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="no-positions">No existing MCA positions detected</p>
                )}
              </section>

              {/* Info Needed For Sheet (calculator-dependent metrics) */}
              <section className="summary-section metrics-section">
                <h4>Info Needed For Sheet</h4>
                <div className="metrics-grid">
                  <div className="metric-item">
                    <span className="label">Total Monthly Payments (Existing)</span>
                    <span className="value">${existingMonthlyPayments.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Diesel's Total Monthly Payments</span>
                    <span className="value">${dieselMonthlyPayment.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="metric-item highlight">
                    <span className="label">Total Monthly Payments (Including Diesel's new deal)</span>
                    <span className="value">${totalMonthlyWithDiesel.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Average Monthly Income</span>
                    <span className="value">${avgMonthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Deductions</span>
                    <span className="value">${deductions.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Monthly Net Revenue</span>
                    <span className="value">${monthlyNetRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Annual Income</span>
                    <span className="value">${annualIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Length of Deal (months)</span>
                    <span className="value">{lengthOfDealMonths.toFixed(2)}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Holdback Percentage / Monthly Holdback</span>
                    <span className="value">{holdbackPercent.toFixed(2)}%</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Monthly Payment to Monthly Income (as a percentage)</span>
                    <span className="value">{paymentToIncomePercent.toFixed(2)}%</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Original Balance to Annual Income (As a percentage)</span>
                    <span className="value">{balanceToAnnualIncomePercent.toFixed(2)}%</span>
                  </div>
                </div>
              </section>

              {/* Monthly Revenues (from Claude) */}
              {analysis.monthlyRevenues.length > 0 && (
                <section className="summary-section revenues-section">
                  <h4>Monthly Revenue Breakdown</h4>
                  <table className="spreadsheet-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Deposits</th>
                        <th>Withdrawals</th>
                        <th>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.monthlyRevenues.map((rev, idx) => {
                        const [yearStr, monthStr] = rev.month.split('-')
                        const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1)
                        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                        return (
                          <tr key={idx}>
                            <td className="cell-label">{monthName}</td>
                            <td className="cell-value positive">${rev.deposits.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="cell-value negative">${rev.withdrawals.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className={`cell-value ${rev.net >= 0 ? 'positive' : 'negative'}`}>
                              ${rev.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="cell-label"><strong>Average</strong></td>
                        <td className="cell-value positive"><strong>${avgMonthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
                        <td className="cell-value negative"><strong>${avgMonthlyWithdrawals.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></td>
                        <td className={`cell-value ${(avgMonthlyIncome - avgMonthlyWithdrawals) >= 0 ? 'positive' : 'negative'}`}>
                          <strong>${(avgMonthlyIncome - avgMonthlyWithdrawals).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              )}

              {/* Position Stacking Analysis (calculator-dependent) */}
              <section className="summary-section stacking-section">
                <h4>Position Stacking Analysis</h4>

                <div className="stacking-grid">
                  <div className="stack-item">
                    <span className="label">Existing Daily Obligation</span>
                    <span className="value">${existingDailyObligation.toLocaleString()}</span>
                  </div>
                  <div className="stack-item">
                    <span className="label">+ New Daily Obligation</span>
                    <span className="value">${newDailyObligation.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="stack-item total">
                    <span className="label">= Total Daily Obligation</span>
                    <span className="value">${totalDailyObligation.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="utilization">
                  <div className="utilization-header">
                    <span>Daily Deposit Utilization</span>
                    <span className={utilizationPercent > 50 ? 'danger' : utilizationPercent > 30 ? 'warning' : 'good'}>
                      {utilizationPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="utilization-bar">
                    <div
                      className={`utilization-fill ${utilizationPercent > 50 ? 'danger' : utilizationPercent > 30 ? 'warning' : 'good'}`}
                      style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                    />
                  </div>
                  <p className="utilization-note">
                    Avg Daily Deposits: ${avgDailyDeposit.toLocaleString()}
                  </p>
                </div>
              </section>

              {/* Data Source Reference */}
              <section className="summary-section data-reference">
                <p>
                  <small>
                    Analysis generated by Claude AI from Koncile-extracted data.
                    {analysis.analyzedAt && ` Analyzed: ${new Date(analysis.analyzedAt).toLocaleString()}`}
                  </small>
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
