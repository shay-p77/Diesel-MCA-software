export interface Deal {
  id: string
  businessName: string
  ownerName: string
  amountRequested: number
  dateSubmitted: string
  status: 'pending' | 'under_review' | 'approved' | 'declined'
  industry: string
  aiSummary: string
  bankData: BankData | null
  existingPositions: Position[]
  pdfUrl?: string
}

export interface BankData {
  totalDeposits: number
  totalWithdrawals: number
  endingBalance: number
  avgDailyBalance: number
  nsfs: number
  negativeDays: number
  monthsOfStatements: number
  dailyAvgDeposit: number
}

export interface Position {
  lender: string
  payment: number
  frequency: 'Daily' | 'Weekly' | 'Monthly'
  estimatedBalance: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}
