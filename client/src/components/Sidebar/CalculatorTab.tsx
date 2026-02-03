import { useState, useMemo } from 'react'
import { Deal } from '../../types'
import { detectMCAPositions } from '../../utils/mcaDetection'
import './CalculatorTab.css'

interface CalculatorTabProps {
  deal: Deal
}

export default function CalculatorTab({ deal }: CalculatorTabProps) {
  const [fundingAmount, setFundingAmount] = useState(deal.amountRequested.toString())
  const [factorRate, setFactorRate] = useState('1.35')
  const [termWeeks, setTermWeeks] = useState('24')
  const [paymentFrequency, setPaymentFrequency] = useState<'daily' | 'weekly'>('daily')

  const amount = parseFloat(fundingAmount) || 0
  const factor = parseFloat(factorRate) || 1
  const weeks = parseInt(termWeeks) || 1

  const paybackAmount = amount * factor
  const totalPayments = paymentFrequency === 'daily' ? weeks * 5 : weeks // 5 business days per week
  const paymentAmount = paybackAmount / totalPayments

  // Calculate monthly payment for Diesel's new deal
  const dieselMonthlyPayment = paymentFrequency === 'daily'
    ? paymentAmount * 22 // ~22 business days per month
    : paymentAmount * 4.33 // ~4.33 weeks per month

  // Auto-detect MCA positions from bank transactions
  const autoDetectedPositions = useMemo(() => {
    if (!deal.bankData?.transactions) return []
    return detectMCAPositions(deal.bankData.transactions)
  }, [deal.bankData])

  // Combine manually entered positions with auto-detected ones
  // Prefer manual positions if they exist, otherwise use auto-detected
  const allPositions = deal.existingPositions.length > 0
    ? deal.existingPositions
    : autoDetectedPositions

  // Separate existing positions by frequency
  const dailyPositions = allPositions.filter(p => p.frequency === 'Daily')
  const weeklyPositions = allPositions.filter(p => p.frequency === 'Weekly')
  const monthlyPositions = allPositions.filter(p => p.frequency === 'Monthly')

  // Calculate totals
  const existingDailyObligation = dailyPositions.reduce((sum, p) => sum + p.payment, 0)
  const existingMonthlyPayments = useMemo(() => {
    const daily = dailyPositions.reduce((sum, p) => sum + (p.payment * 22), 0)
    const weekly = weeklyPositions.reduce((sum, p) => sum + (p.payment * 4.33), 0)
    const monthly = monthlyPositions.reduce((sum, p) => sum + p.payment, 0)
    return daily + weekly + monthly
  }, [dailyPositions, weeklyPositions, monthlyPositions])

  const totalMonthlyWithDiesel = existingMonthlyPayments + dieselMonthlyPayment

  // Calculate monthly revenues from transactions
  const monthlyRevenues = useMemo(() => {
    if (!deal.bankData?.transactions) return []

    const revenueByMonth: { [key: string]: number } = {}

    deal.bankData.transactions.forEach(txn => {
      if (txn.type === 'deposit' || txn.amount > 0) {
        const date = new Date(txn.date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + Math.abs(txn.amount)
      }
    })

    return Object.entries(revenueByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 12)
      .map(([month, total]) => ({ month, total }))
  }, [deal.bankData])

  const avgMonthlyIncome = monthlyRevenues.length > 0
    ? monthlyRevenues.reduce((sum, m) => sum + m.total, 0) / monthlyRevenues.length
    : 0

  const annualIncome = avgMonthlyIncome * 12
  const lengthOfDealMonths = weeks / 4.33

  // Calculate deductions (total withdrawals that aren't MCAs)
  const totalMonthlyWithdrawals = useMemo(() => {
    if (!deal.bankData?.transactions) return 0
    const withdrawals = deal.bankData.transactions.filter(
      txn => txn.amount < 0 || txn.type.toLowerCase().includes('withdrawal')
    )
    const totalWithdrawals = withdrawals.reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
    // Calculate average monthly withdrawals
    const months = deal.bankData.monthsOfStatements || 1
    return totalWithdrawals / months
  }, [deal.bankData])

  const deductions = totalMonthlyWithdrawals - existingMonthlyPayments
  const monthlyNetRevenue = avgMonthlyIncome - totalMonthlyWithdrawals

  const newDailyObligation = paymentFrequency === 'daily' ? paymentAmount : paymentAmount / 5
  const totalDailyObligation = existingDailyObligation + newDailyObligation

  const avgDailyDeposit = deal.bankData?.dailyAvgDeposit || 0
  const utilizationPercent = avgDailyDeposit > 0 ? (totalDailyObligation / avgDailyDeposit) * 100 : 0

  const holdbackPercent = avgMonthlyIncome > 0 ? (totalMonthlyWithDiesel / avgMonthlyIncome) * 100 : 0
  const paymentToIncomePercent = avgMonthlyIncome > 0 ? (dieselMonthlyPayment / avgMonthlyIncome) * 100 : 0
  const balanceToAnnualIncomePercent = annualIncome > 0 ? (paybackAmount / annualIncome) * 100 : 0

  return (
    <div className="calculator-tab">
      {/* Deal Info */}
      <section className="calc-section deal-info-section">
        <h4>Deal Information</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Merchant Name</span>
            <span className="value">{deal.businessName}</span>
          </div>
          <div className="info-item">
            <span className="label">Amount Requested</span>
            <span className="value">${amount.toLocaleString()}</span>
          </div>
          <div className="info-item">
            <span className="label">Factor Rate</span>
            <span className="value">{factorRate}</span>
          </div>
          <div className="info-item">
            <span className="label">Payback</span>
            <span className="value">${paybackAmount.toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* Existing MCA Positions */}
      <section className="calc-section positions-section">
        <h4>
          Existing MCA Positions
          {autoDetectedPositions.length > 0 && deal.existingPositions.length === 0 && (
            <span className="auto-detected-badge">Auto-Detected</span>
          )}
        </h4>

        {/* Daily Positions */}
        {dailyPositions.length > 0 && (
          <div className="position-group">
            <h5>Daily Positions</h5>
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Lender</th>
                  <th>Daily Payment</th>
                  <th>Monthly Payment</th>
                  <th>Est. Balance</th>
                </tr>
              </thead>
              <tbody>
                {dailyPositions.map((pos, idx) => (
                  <tr key={idx}>
                    <td>{pos.lender}</td>
                    <td>${pos.payment.toLocaleString()}</td>
                    <td>${(pos.payment * 22).toLocaleString()}</td>
                    <td>${pos.estimatedBalance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Weekly Positions */}
        {weeklyPositions.length > 0 && (
          <div className="position-group">
            <h5>Weekly Positions</h5>
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Lender</th>
                  <th>Weekly Payment</th>
                  <th>Monthly Payment</th>
                  <th>Est. Balance</th>
                </tr>
              </thead>
              <tbody>
                {weeklyPositions.map((pos, idx) => (
                  <tr key={idx}>
                    <td>{pos.lender}</td>
                    <td>${pos.payment.toLocaleString()}</td>
                    <td>${(pos.payment * 4.33).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td>${pos.estimatedBalance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Monthly Positions (non-MCA) */}
        {monthlyPositions.length > 0 && (
          <div className="position-group">
            <h5>Monthly Positions (non-MCA)</h5>
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Monthly Payment</th>
                  <th>Est. Balance</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPositions.map((pos, idx) => (
                  <tr key={idx}>
                    <td>{pos.lender}</td>
                    <td>${pos.payment.toLocaleString()}</td>
                    <td>${pos.estimatedBalance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deal.existingPositions.length === 0 && (
          <p className="no-positions">No existing positions detected</p>
        )}
      </section>

      {/* Diesel's Advance (Payment Calculator) */}
      <section className="calc-section diesel-advance-section">
        <h4>Diesel's Advance</h4>

        <div className="input-group">
          <label>Funding Amount</label>
          <div className="input-with-prefix">
            <span>$</span>
            <input
              type="number"
              value={fundingAmount}
              onChange={(e) => setFundingAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label>Factor Rate</label>
          <input
            type="number"
            step="0.01"
            value={factorRate}
            onChange={(e) => setFactorRate(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Term (weeks)</label>
          <input
            type="number"
            value={termWeeks}
            onChange={(e) => setTermWeeks(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Payment Frequency</label>
          <select
            value={paymentFrequency}
            onChange={(e) => setPaymentFrequency(e.target.value as 'daily' | 'weekly')}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        <div className="calc-results">
          <div className="result-row">
            <span>Payback Amount</span>
            <strong>${paybackAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
          </div>
          <div className="result-row">
            <span>{paymentFrequency === 'daily' ? 'Daily' : 'Weekly'} Payment</span>
            <strong>${paymentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
          </div>
          <div className="result-row">
            <span>Monthly Payment</span>
            <strong>${dieselMonthlyPayment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
          </div>
          <div className="result-row">
            <span>Total Payments</span>
            <strong>{totalPayments}</strong>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <section className="calc-section metrics-section">
        <h4>Info Needed For Sheet</h4>
        <div className="metrics-grid">
          <div className="metric-item">
            <span className="label">Total Monthly Payments</span>
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

      {/* Monthly Revenues */}
      {monthlyRevenues.length > 0 && (
        <section className="calc-section revenues-section">
          <h4>Total Revenues</h4>
          <div className="revenues-grid">
            {monthlyRevenues.map((rev, idx) => {
              const date = new Date(rev.month + '-01')
              const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              return (
                <div key={idx} className="revenue-item">
                  <span className="month-label">{monthName}</span>
                  <span className="revenue-value">${rev.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Position Stacking */}
      <section className="calc-section">
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

      {/* Quick Scenarios */}
      <section className="calc-section">
        <h4>Quick Scenarios</h4>
        <div className="scenarios">
          <button onClick={() => { setFundingAmount('25000'); setFactorRate('1.29'); setTermWeeks('16'); }}>
            $25k / 1.29 / 16wk
          </button>
          <button onClick={() => { setFundingAmount('50000'); setFactorRate('1.35'); setTermWeeks('24'); }}>
            $50k / 1.35 / 24wk
          </button>
          <button onClick={() => { setFundingAmount('75000'); setFactorRate('1.40'); setTermWeeks('32'); }}>
            $75k / 1.40 / 32wk
          </button>
          <button onClick={() => { setFundingAmount(deal.amountRequested.toString()); setFactorRate('1.35'); setTermWeeks('24'); }}>
            Reset to Request
          </button>
        </div>
      </section>
    </div>
  )
}
