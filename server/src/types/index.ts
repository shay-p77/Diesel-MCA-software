export interface Deal {
  id: string
  businessName: string
  ownerName: string
  amountRequested: number
  dateSubmitted: string
  status: 'pending' | 'under_review' | 'approved' | 'declined'
  industry: string
  broker: string | null
  notes: string | null
  aiSummary: string | null
  bankData: BankData | null
  existingPositions: Position[]
  koncileTaskId: string | null
  koncileDocumentId: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed' | null
  pdfFileName: string | null
  createdAt: string
  updatedAt: string
}

export interface BankData {
  totalDeposits: number
  totalWithdrawals: number
  endingBalance: number
  beginningBalance: number
  avgDailyBalance: number
  dailyAvgDeposit: number
  nsfs: number
  negativeDays: number
  monthsOfStatements: number
  transactions: Transaction[]
}

export interface Transaction {
  date: string
  type: string
  amount: number
  description: string
  checkNumber?: string
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
  timestamp: string
}

export interface CreateDealRequest {
  businessName?: string
  amountRequested?: number
  dateSubmitted?: string
  broker?: string
  notes?: string
  ownerName?: string
  industry?: string
}

export interface ChatRequest {
  message: string
  history?: ChatMessage[]
}
