import { Deal } from '../../types'
import type { CalculatorState } from '../../pages/DealDetail/DealDetail'
import './CalculatorTab.css'

interface CalculatorTabProps {
  deal: Deal
  calcState: CalculatorState
  onCalcStateChange: (state: CalculatorState) => void
}

export default function CalculatorTab({ deal, calcState, onCalcStateChange }: CalculatorTabProps) {
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

  const update = (field: keyof CalculatorState, value: string) => {
    onCalcStateChange({ ...calcState, [field]: value })
  }

  return (
    <div className="calculator-tab">
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
              onChange={(e) => update('fundingAmount', e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label>Factor Rate</label>
          <input
            type="number"
            step="0.01"
            value={factorRate}
            onChange={(e) => update('factorRate', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Term (weeks)</label>
          <input
            type="number"
            value={termWeeks}
            onChange={(e) => update('termWeeks', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Payment Frequency</label>
          <select
            value={paymentFrequency}
            onChange={(e) => update('paymentFrequency', e.target.value)}
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

      {/* Quick Scenarios */}
      <section className="calc-section">
        <h4>Quick Scenarios</h4>
        <div className="scenarios">
          <button onClick={() => onCalcStateChange({ ...calcState, fundingAmount: '25000', factorRate: '1.29', termWeeks: '16' })}>
            $25k / 1.29 / 16wk
          </button>
          <button onClick={() => onCalcStateChange({ ...calcState, fundingAmount: '50000', factorRate: '1.35', termWeeks: '24' })}>
            $50k / 1.35 / 24wk
          </button>
          <button onClick={() => onCalcStateChange({ ...calcState, fundingAmount: '75000', factorRate: '1.40', termWeeks: '32' })}>
            $75k / 1.40 / 32wk
          </button>
          <button onClick={() => onCalcStateChange({ ...calcState, fundingAmount: deal.amountRequested.toString(), factorRate: '1.35', termWeeks: '24' })}>
            Reset to Request
          </button>
        </div>
      </section>
    </div>
  )
}
