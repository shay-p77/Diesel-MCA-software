import { useState } from 'react'
import { Deal } from '../../types'
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

  const existingDailyObligation = deal.existingPositions
    .filter(p => p.frequency === 'Daily')
    .reduce((sum, p) => sum + p.payment, 0)

  const newDailyObligation = paymentFrequency === 'daily' ? paymentAmount : paymentAmount / 5
  const totalDailyObligation = existingDailyObligation + newDailyObligation

  const avgDailyDeposit = deal.bankData?.dailyAvgDeposit || 0
  const utilizationPercent = avgDailyDeposit > 0 ? (totalDailyObligation / avgDailyDeposit) * 100 : 0

  return (
    <div className="calculator-tab">
      {/* Payment Calculator */}
      <section className="calc-section">
        <h4>Payment Calculator</h4>

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
            <span>Total Payments</span>
            <strong>{totalPayments}</strong>
          </div>
        </div>
      </section>

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
