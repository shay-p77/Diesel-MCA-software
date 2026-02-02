import { useNavigate } from 'react-router-dom'
import { Deal } from '../../types'
import './DealCard.css'

interface DealCardProps {
  deal: Deal
}

export default function DealCard({ deal }: DealCardProps) {
  const navigate = useNavigate()

  const positionCount = deal.existingPositions.length

  const dailyObligation = deal.existingPositions
    .filter(p => p.frequency === 'Daily')
    .reduce((sum, p) => sum + p.payment, 0)

  // Calculate total transactions from all accounts or use legacy data
  const hasMultipleAccounts = deal.bankAccounts && deal.bankAccounts.length > 0
  const totalTransactions = hasMultipleAccounts
    ? deal.bankAccounts.reduce((sum, acc) => sum + acc.bankData.transactions.length, 0)
    : deal.bankData?.transactions?.length || 0

  // Calculate total NSFs from all accounts or use legacy data
  const totalNSFs = hasMultipleAccounts
    ? deal.bankAccounts.reduce((sum, acc) => sum + acc.bankData.nsfs, 0)
    : deal.bankData?.nsfs || 0

  return (
    <div className="deal-card" onClick={() => navigate(`/deal/${deal.id}`)}>
      <div className="deal-main">
        <div className="deal-header">
          <h3>{deal.businessName}</h3>
        </div>

        <div className="deal-meta">
          <span className="deal-amount-inline">${deal.amountRequested.toLocaleString()}</span>
          <span className="separator">|</span>
          <span>{new Date(deal.dateSubmitted).toLocaleDateString()}</span>
          {deal.broker && (
            <>
              <span className="separator">|</span>
              <span>{deal.broker}</span>
            </>
          )}
        </div>

        <p className="deal-summary">
          {deal.aiSummary || (deal.extractionStatus === 'processing'
            ? 'Processing bank statement...'
            : deal.extractionStatus === 'done'
            ? `${totalTransactions} transactions extracted`
            : deal.pdfFileName
            ? 'Bank statement uploaded - awaiting extraction'
            : 'Upload bank statement for AI analysis')}
        </p>
        {deal.extractionStatus === 'processing' && (
          <span className="extraction-badge">Extracting data...</span>
        )}
        {deal.extractionStatus === 'done' && (
          <span className="extraction-badge done">✓ Extracted</span>
        )}
      </div>

      <div className="deal-indicators">
        <div className={`indicator ${positionCount === 0 ? 'good' : positionCount <= 2 ? 'warning' : 'danger'}`}>
          <span className="indicator-value">{positionCount}</span>
          <span className="indicator-label">Positions</span>
        </div>
        <div className={`indicator ${totalNSFs === 0 ? 'good' : totalNSFs <= 2 ? 'warning' : 'danger'}`}>
          <span className="indicator-value">{totalNSFs}</span>
          <span className="indicator-label">NSFs</span>
        </div>
        <div className="indicator">
          <span className="indicator-value">${dailyObligation.toLocaleString()}</span>
          <span className="indicator-label">Daily Oblig.</span>
        </div>
      </div>
    </div>
  )
}
