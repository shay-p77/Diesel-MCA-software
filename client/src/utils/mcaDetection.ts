import { Transaction, Position } from '../types'

// MCA keyword indicators
const MCA_KEYWORDS = [
  'CAPITAL',
  'FUNDING',
  'ADVANCE',
  'CASH ADVANCE',
  'MERCHANT ADVANCE',
  'DAILY REPAY',
  'HOLDBACK',
  'HOLD BACK',
  'MCA',
  'MERCHANT CASH',
  'BUSINESS CAPITAL',
  'SPEEDY',
  'FUND-A-TREE',
  'JUPITER',
  'NATIONWIDE',
  'EMMY',
  'ESSENTIAL',
  'ACH DEBIT',
  'RECURRING WITHDRAWAL'
]

interface TransactionGroup {
  counterparty: string
  transactions: Transaction[]
  amounts: number[]
  dates: Date[]
}

interface DetectedPattern {
  counterparty: string
  frequency: 'Daily' | 'Weekly' | 'Monthly'
  avgAmount: number
  occurrences: number
  isWeekdayOnly: boolean
  confidence: number
}

/**
 * Detects MCA positions from bank transactions
 */
export function detectMCAPositions(transactions: Transaction[]): Position[] {
  if (!transactions || transactions.length === 0) return []

  // Filter to withdrawals/debits only (negative amounts or withdrawal type)
  const withdrawals = transactions.filter(
    txn => txn.amount < 0 || txn.type.toLowerCase().includes('withdrawal') || txn.type.toLowerCase().includes('debit')
  )

  // Group transactions by counterparty
  const groups = groupByCounterparty(withdrawals)

  // Analyze each group for MCA patterns
  const detectedPatterns: DetectedPattern[] = []

  for (const group of groups) {
    const pattern = analyzePattern(group)
    if (pattern && pattern.confidence > 0.6) {
      // Only include patterns with confidence > 60%
      detectedPatterns.push(pattern)
    }
  }

  // Convert detected patterns to Position objects
  return detectedPatterns.map(pattern => ({
    lender: pattern.counterparty,
    payment: Math.abs(pattern.avgAmount),
    frequency: pattern.frequency,
    estimatedBalance: Math.abs(pattern.avgAmount) * pattern.occurrences // Rough estimate
  }))
}

/**
 * Groups transactions by counterparty (merchant/description)
 */
function groupByCounterparty(transactions: Transaction[]): TransactionGroup[] {
  const groups = new Map<string, TransactionGroup>()

  for (const txn of transactions) {
    const counterparty = normalizeCounterparty(txn.description)

    if (!groups.has(counterparty)) {
      groups.set(counterparty, {
        counterparty,
        transactions: [],
        amounts: [],
        dates: []
      })
    }

    const group = groups.get(counterparty)!
    group.transactions.push(txn)
    group.amounts.push(Math.abs(txn.amount))
    group.dates.push(new Date(txn.date))
  }

  return Array.from(groups.values())
}

/**
 * Normalizes counterparty names for grouping
 */
function normalizeCounterparty(description: string): string {
  // Remove common prefixes/suffixes
  let normalized = description
    .toUpperCase()
    .replace(/^(ACH|DEBIT|WITHDRAWAL|PAYMENT|TRANSFER)\s+/i, '')
    .replace(/\s+(PAYMENT|PMT|PYMT|WITHDRAW|WD)$/i, '')
    .trim()

  // Extract the main merchant name (first few words)
  const words = normalized.split(/\s+/)
  return words.slice(0, 3).join(' ')
}

/**
 * Analyzes a transaction group to detect MCA patterns
 */
function analyzePattern(group: TransactionGroup): DetectedPattern | null {
  if (group.transactions.length < 3) {
    // Need at least 3 occurrences to establish a pattern
    return null
  }

  // Sort dates
  const sortedDates = [...group.dates].sort((a, b) => a.getTime() - b.getTime())

  // Analyze last 90 days only
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const recentDates = sortedDates.filter(d => d >= ninetyDaysAgo)

  if (recentDates.length < 3) return null

  // Calculate intervals between transactions
  const intervals: number[] = []
  for (let i = 1; i < recentDates.length; i++) {
    const daysDiff = Math.round(
      (recentDates[i].getTime() - recentDates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    )
    intervals.push(daysDiff)
  }

  // Check if amounts are consistent
  const recentAmounts = group.amounts.slice(-recentDates.length)
  const avgAmount = recentAmounts.reduce((sum, amt) => sum + amt, 0) / recentAmounts.length
  const amountVariance = calculateVariance(recentAmounts)
  const isConsistentAmount = amountVariance < (avgAmount * 0.1) // Within 10% variance

  // Check for weekday-only pattern
  const isWeekdayOnly = recentDates.every(date => {
    const day = date.getDay()
    return day >= 1 && day <= 5 // Monday = 1, Friday = 5
  })

  // Determine frequency
  const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length
  let frequency: 'Daily' | 'Weekly' | 'Monthly'

  if (avgInterval <= 2 && isWeekdayOnly) {
    frequency = 'Daily'
  } else if (avgInterval >= 6 && avgInterval <= 8) {
    frequency = 'Weekly'
  } else if (avgInterval >= 28 && avgInterval <= 32) {
    frequency = 'Monthly'
  } else {
    // Doesn't match a clear pattern
    return null
  }

  // Check interval consistency
  const intervalVariance = calculateVariance(intervals)
  const isConsistentInterval = intervalVariance < 3 // Within 3 days variance

  // Check for MCA keywords in description
  const hasKeyword = MCA_KEYWORDS.some(keyword =>
    group.counterparty.toUpperCase().includes(keyword)
  )

  // Calculate confidence score (0-1)
  let confidence = 0
  if (isConsistentAmount) confidence += 0.3
  if (isConsistentInterval) confidence += 0.3
  if (isWeekdayOnly && frequency === 'Daily') confidence += 0.2
  if (hasKeyword) confidence += 0.2

  // Bonus for multiple occurrences
  if (recentDates.length >= 10) confidence += 0.1
  if (recentDates.length >= 20) confidence += 0.1

  confidence = Math.min(confidence, 1.0)

  return {
    counterparty: group.counterparty,
    frequency,
    avgAmount,
    occurrences: recentDates.length,
    isWeekdayOnly,
    confidence
  }
}

/**
 * Calculates variance of an array of numbers
 */
function calculateVariance(numbers: number[]): number {
  if (numbers.length === 0) return 0
  const avg = numbers.reduce((sum, n) => sum + n, 0) / numbers.length
  const squaredDiffs = numbers.map(n => Math.pow(n - avg, 2))
  return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / numbers.length)
}

/**
 * Detects multiple MCA pulls in a single day from the same counterparty
 */
export function detectMultiplePullsPerDay(transactions: Transaction[]): {
  counterparty: string
  date: string
  count: number
  totalAmount: number
}[] {
  const dailyGroups = new Map<string, Map<string, Transaction[]>>()

  for (const txn of transactions) {
    if (txn.amount >= 0) continue // Skip deposits

    const counterparty = normalizeCounterparty(txn.description)
    const date = txn.date.split('T')[0] // Get date part only

    if (!dailyGroups.has(counterparty)) {
      dailyGroups.set(counterparty, new Map())
    }

    const counterpartyDays = dailyGroups.get(counterparty)!
    if (!counterpartyDays.has(date)) {
      counterpartyDays.set(date, [])
    }

    counterpartyDays.get(date)!.push(txn)
  }

  // Find days with multiple pulls
  const multiplePulls: {
    counterparty: string
    date: string
    count: number
    totalAmount: number
  }[] = []

  for (const [counterparty, days] of dailyGroups) {
    for (const [date, txns] of days) {
      if (txns.length > 1) {
        multiplePulls.push({
          counterparty,
          date,
          count: txns.length,
          totalAmount: txns.reduce((sum, t) => sum + Math.abs(t.amount), 0)
        })
      }
    }
  }

  return multiplePulls
}
