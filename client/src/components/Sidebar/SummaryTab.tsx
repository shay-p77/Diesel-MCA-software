import { useState, useEffect } from 'react'
import { Deal, BankAccount } from '../../types'
import { api } from '../../services/api'
import './SummaryTab.css'

interface SummaryTabProps {
  deal: Deal
  onEditDeal?: () => void
}

export default function SummaryTab({ deal, onEditDeal }: SummaryTabProps) {
  const [activeView, setActiveView] = useState<'extracted' | 'analysis'>('extracted')
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [localDeal, setLocalDeal] = useState(deal)

  // Update local deal when prop changes
  useEffect(() => {
    setLocalDeal(deal)
  }, [deal])

  // Auto-generate summary when switching to analysis view if not already generated
  useEffect(() => {
    const shouldGenerate =
      activeView === 'analysis' &&
      !localDeal.aiSummary &&
      !generatingSummary &&
      localDeal.extractionStatus === 'done'

    if (shouldGenerate) {
      handleGenerateSummary()
    }
  }, [activeView, localDeal.aiSummary, localDeal.extractionStatus])

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true)
    try {
      const result = await api.generateSummary(localDeal.id)
      setLocalDeal(result.deal)
    } catch (err) {
      console.error('Failed to generate summary:', err)
    } finally {
      setGeneratingSummary(false)
    }
  }

  const dailyObligation = localDeal.existingPositions
    .filter(p => p.frequency === 'Daily')
    .reduce((sum, p) => sum + p.payment, 0)

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

  // Calculate aggregated data across all accounts
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

  // Get bankData for AI insights (use first account or legacy)
  const primaryBankData = hasMultipleAccounts
    ? localDeal.bankAccounts[0]?.bankData
    : localDeal.bankData

  // Mock AI insights based on the extracted data
  const aiInsights = [
    {
      type: localDeal.existingPositions.length > 2 ? 'warning' : localDeal.existingPositions.length > 0 ? 'info' : 'positive',
      text: localDeal.existingPositions.length > 2
        ? `High stacking: ${localDeal.existingPositions.length} existing positions with $${dailyObligation}/day obligation`
        : localDeal.existingPositions.length > 0
        ? `${localDeal.existingPositions.length} existing position(s) detected - moderate stacking`
        : 'No existing positions - clean account'
    },
    {
      type: primaryBankData?.nsfs && primaryBankData.nsfs > 2 ? 'warning' : primaryBankData?.nsfs && primaryBankData.nsfs > 0 ? 'info' : 'positive',
      text: primaryBankData?.nsfs && primaryBankData.nsfs > 2
        ? `${primaryBankData.nsfs} NSFs detected - cash flow concerns`
        : primaryBankData?.nsfs && primaryBankData.nsfs > 0
        ? `${primaryBankData.nsfs} NSF(s) - minor concern`
        : 'No NSFs - healthy account management'
    },
    {
      type: primaryBankData?.negativeDays && primaryBankData.negativeDays > 0 ? 'warning' : 'positive',
      text: primaryBankData?.negativeDays && primaryBankData.negativeDays > 0
        ? `Account went negative ${primaryBankData.negativeDays} day(s)`
        : 'No negative balance days'
    },
    {
      type: 'info',
      text: `Daily deposit average: $${primaryBankData?.dailyAvgDeposit?.toLocaleString() || 'N/A'}`
    }
  ]

  if (totalInternalTransfers > 0) {
    aiInsights.unshift({
      type: 'info',
      text: `${totalInternalTransfers} internal transfer(s) detected between accounts`
    })
  }

  const getRiskLevel = () => {
    let score = 0
    if (localDeal.existingPositions.length > 3) score += 3
    else if (localDeal.existingPositions.length > 1) score += 1
    if (primaryBankData?.nsfs && primaryBankData.nsfs > 3) score += 3
    else if (primaryBankData?.nsfs && primaryBankData.nsfs > 0) score += 1
    if (primaryBankData?.negativeDays && primaryBankData.negativeDays > 3) score += 2

    if (score >= 5) return { level: 'High Risk', class: 'risk-high' }
    if (score >= 2) return { level: 'Moderate Risk', class: 'risk-moderate' }
    return { level: 'Low Risk', class: 'risk-low' }
  }

  const risk = getRiskLevel()

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

          {/* Existing Positions */}
          <section className="summary-section spreadsheet-section">
            <h4>Detected Positions ({localDeal.existingPositions.length})</h4>
            {localDeal.existingPositions.length > 0 ? (
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
                    {localDeal.existingPositions.map((pos, i) => (
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
            {generatingSummary ? (
              <p className="ai-summary loading">Generating summary...</p>
            ) : localDeal.aiSummary ? (
              <p className="ai-summary">{localDeal.aiSummary}</p>
            ) : (
              <p className="ai-summary empty">
                {localDeal.extractionStatus === 'done'
                  ? 'Summary will be generated automatically...'
                  : 'Upload bank statements to generate AI summary'}
              </p>
            )}
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
