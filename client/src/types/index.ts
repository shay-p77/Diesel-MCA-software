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
  koncileTaskId: string | null
  koncileDocumentId: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed' | null
  pdfFileName: string | null
  createdAt: string
  updatedAt: string
}

export interface BankAccount {
  id: string
  accountNumber: string
  accountName: string
  bankName: string | null
  pdfFileName: string
  koncileTaskId: string | null
  koncileDocumentId: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed'
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
