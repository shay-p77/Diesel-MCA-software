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
  koncileTaskId: string | null // Legacy - kept for backward compatibility
  koncileDocumentId: number | null // Legacy - kept for backward compatibility
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed' | null
  pdfFileName: string | null // Legacy - kept for backward compatibility
  createdAt: string
  updatedAt: string
}

export interface Statement {
  id: string // Unique identifier for this statement
  pdfFileName: string
  pdfData?: string | null // Base64 encoded PDF stored in MongoDB
  koncileTaskId: string | null
  koncileDocumentId: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed'
}

export interface BankAccount {
  id: string // Unique identifier for this account
  accountNumber: string // Last 4 digits or account identifier
  accountName: string // E.g., "Checking Account", "Savings Account"
  bankName: string | null // E.g., "Chase", "Bank of America"
  // Legacy single PDF fields (for backward compatibility)
  pdfFileName?: string | null
  pdfData?: string | null // Base64 encoded PDF stored in MongoDB
  koncileTaskId?: string | null
  koncileDocumentId?: number | null
  extractionStatus: 'pending' | 'processing' | 'done' | 'failed'
  // Multiple statements per account (merged from same account number)
  statements?: Statement[]
  bankData: BankData
  internalTransfers: InternalTransfer[] // Detected transfers between accounts
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

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password?: string
  name: string
  role?: 'admin' | 'user'
}

export interface SetupPasswordRequest {
  token: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}
