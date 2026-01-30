import { Deal } from '../types'

export const mockDeals: Deal[] = [
  {
    id: '1',
    businessName: 'Metro Pizza & Grill',
    ownerName: 'Anthony Russo',
    amountRequested: 75000,
    dateSubmitted: '2025-01-25',
    status: 'pending',
    industry: 'Restaurant',
    aiSummary: 'Strong daily deposits averaging $3,200. 3 existing positions detected totaling $1,450/day. 2 NSFs in past 60 days. Revenue trending up 8% MoM.',
    bankData: {
      totalDeposits: 98500,
      totalWithdrawals: 91200,
      endingBalance: 12350,
      avgDailyBalance: 8920,
      nsfs: 2,
      negativeDays: 1,
      monthsOfStatements: 3,
      dailyAvgDeposit: 3283
    },
    existingPositions: [
      { lender: 'ABC Funding', payment: 650, frequency: 'Daily', estimatedBalance: 14000 },
      { lender: 'Quick Capital', payment: 450, frequency: 'Daily', estimatedBalance: 9500 },
      { lender: 'Rapid Finance', payment: 350, frequency: 'Daily', estimatedBalance: 7200 }
    ]
  },
  {
    id: '2',
    businessName: 'Sunrise Auto Repair',
    ownerName: 'Michael Chen',
    amountRequested: 50000,
    dateSubmitted: '2025-01-24',
    status: 'under_review',
    industry: 'Auto Services',
    aiSummary: 'Consistent deposit pattern with $2,100 daily average. No existing positions. Clean account with 0 NSFs. Seasonal dip in December, recovered in January.',
    bankData: {
      totalDeposits: 64200,
      totalWithdrawals: 58100,
      endingBalance: 18450,
      avgDailyBalance: 15200,
      nsfs: 0,
      negativeDays: 0,
      monthsOfStatements: 3,
      dailyAvgDeposit: 2140
    },
    existingPositions: []
  },
  {
    id: '3',
    businessName: 'Brooklyn Deli & Catering',
    ownerName: 'Sarah Goldman',
    amountRequested: 120000,
    dateSubmitted: '2025-01-24',
    status: 'pending',
    industry: 'Restaurant',
    aiSummary: 'High volume account with $5,400 avg daily deposits. 2 positions detected. 4 NSFs flagged - potential cash flow issues despite high revenue.',
    bankData: {
      totalDeposits: 162000,
      totalWithdrawals: 158500,
      endingBalance: 8200,
      avgDailyBalance: 6100,
      nsfs: 4,
      negativeDays: 3,
      monthsOfStatements: 3,
      dailyAvgDeposit: 5400
    },
    existingPositions: [
      { lender: 'Merchant Capital', payment: 890, frequency: 'Daily', estimatedBalance: 22000 },
      { lender: 'FastFunds LLC', payment: 1200, frequency: 'Daily', estimatedBalance: 28000 }
    ]
  },
  {
    id: '4',
    businessName: 'Elite Plumbing Services',
    ownerName: 'Robert Martinez',
    amountRequested: 35000,
    dateSubmitted: '2025-01-23',
    status: 'approved',
    industry: 'Construction',
    aiSummary: 'Solid account health. Irregular deposit pattern typical for service business. No positions, no NSFs. Strong ending balance relative to request.',
    bankData: {
      totalDeposits: 78900,
      totalWithdrawals: 71200,
      endingBalance: 22100,
      avgDailyBalance: 18500,
      nsfs: 0,
      negativeDays: 0,
      monthsOfStatements: 3,
      dailyAvgDeposit: 2630
    },
    existingPositions: []
  },
  {
    id: '5',
    businessName: 'Fashion Forward Boutique',
    ownerName: 'Lisa Thompson',
    amountRequested: 45000,
    dateSubmitted: '2025-01-22',
    status: 'declined',
    industry: 'Retail',
    aiSummary: 'Declining revenue trend -15% MoM. 5 existing positions with $2,100 daily obligation. Multiple NSFs. High risk of default.',
    bankData: {
      totalDeposits: 42100,
      totalWithdrawals: 48900,
      endingBalance: 1850,
      avgDailyBalance: 2100,
      nsfs: 6,
      negativeDays: 8,
      monthsOfStatements: 3,
      dailyAvgDeposit: 1403
    },
    existingPositions: [
      { lender: 'ABC Funding', payment: 450, frequency: 'Daily', estimatedBalance: 8000 },
      { lender: 'Quick Capital', payment: 380, frequency: 'Daily', estimatedBalance: 6500 },
      { lender: 'Metro Finance', payment: 520, frequency: 'Daily', estimatedBalance: 11000 },
      { lender: 'Rapid Advance', payment: 400, frequency: 'Daily', estimatedBalance: 7200 },
      { lender: 'Cash Flow Pro', payment: 350, frequency: 'Daily', estimatedBalance: 5800 }
    ]
  },
  {
    id: '6',
    businessName: 'Downtown Dental Care',
    ownerName: 'Dr. James Wilson',
    amountRequested: 200000,
    dateSubmitted: '2025-01-21',
    status: 'under_review',
    industry: 'Healthcare',
    aiSummary: 'Premium account with $8,200 daily average. 1 existing position nearly paid off. Insurance deposits consistent. Strong candidate.',
    bankData: {
      totalDeposits: 246000,
      totalWithdrawals: 228000,
      endingBalance: 42500,
      avgDailyBalance: 38200,
      nsfs: 0,
      negativeDays: 0,
      monthsOfStatements: 3,
      dailyAvgDeposit: 8200
    },
    existingPositions: [
      { lender: 'Healthcare Capital', payment: 750, frequency: 'Daily', estimatedBalance: 4200 }
    ]
  }
]
