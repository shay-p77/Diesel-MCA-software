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
  chatHistory: ChatMessage[]
  bankData: BankData | null // Legacy - for backward compatibility
  bankAccounts: BankAccount[] // New multi-account support
  existingPositions: Position[]
  aiAnalysis: AIAnalysis | null
  koncileTaskId: string | null
  koncileDocumentId: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed' | null
  pdfFileName: string | null
  createdAt: string
  updatedAt: string
}

export interface Statement {
  id: string
  pdfFileName: string
  pdfData?: string | null
  koncileTaskId: string | null
  koncileDocumentId: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed'
}

export interface BankAccount {
  id: string
  accountNumber: string
  accountName: string
  bankName: string | null
  // Legacy single PDF fields (for backward compatibility)
  pdfFileName?: string | null
  koncileTaskId?: string | null
  koncileDocumentId?: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed'
  // Multiple statements per account (merged from same account number)
  statements?: Statement[]
  bankData: BankData
  internalTransfers: InternalTransfer[]
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

export interface InternalTransfer {
  fromAccountId: string
  toAccountId: string
  amount: number
  date: string
  description: string
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
  autoDetected?: boolean
  confirmed?: boolean | null
}

export interface AIMonthlyRevenue {
  month: string // YYYY-MM
  deposits: number
  withdrawals: number
  net: number
}

export interface AIMCAPosition {
  lender: string
  payment: number
  frequency: 'Daily' | 'Weekly' | 'Monthly'
  estimatedBalance: number
  reasoning: string
}

export interface AIRiskAssessment {
  level: 'low' | 'moderate' | 'high'
  score: number
  factors: string[]
}

export interface AIAnalysis {
  monthlyRevenues: AIMonthlyRevenue[]
  avgMonthlyIncome: number
  avgMonthlyWithdrawals: number
  avgMonthlyNet: number
  annualIncome: number
  nsfs: number
  negativeDays: number
  avgDailyBalance: number
  avgDailyDeposit: number
  risk: AIRiskAssessment
  mcaPositions: AIMCAPosition[]
  existingDailyObligation: number
  existingMonthlyPayments: number
  insights: string[]
  dealSummary: string
  monthsOfStatements: number
  totalTransactions: number
  analyzedAt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  createdAt: string
  updatedAt: string
  createdBy?: string
  passwordSetup: boolean
  invitationExpiry?: Date | null
}

export interface AuthResponse {
  token: string
  user: User
}
