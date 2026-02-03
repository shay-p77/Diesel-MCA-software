import mongoose, { Schema } from 'mongoose'
import { Deal } from '../../types/index.js'
import { encrypt, decrypt } from '../../utils/encryption.js'

const TransactionSchema = new Schema({
  date: String,
  type: String,
  amount: Number,
  description: String, // Will be encrypted
  checkNumber: String,
}, { _id: false })

const BankDataSchema = new Schema({
  totalDeposits: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },
  endingBalance: { type: Number, default: 0 },
  beginningBalance: { type: Number, default: 0 },
  avgDailyBalance: { type: Number, default: 0 },
  dailyAvgDeposit: { type: Number, default: 0 },
  nsfs: { type: Number, default: 0 },
  negativeDays: { type: Number, default: 0 },
  monthsOfStatements: { type: Number, default: 1 },
  transactions: [TransactionSchema],
}, { _id: false })

const PositionSchema = new Schema({
  lender: String, // Will be encrypted
  payment: Number,
  frequency: { type: String, enum: ['Daily', 'Weekly', 'Monthly'] },
  estimatedBalance: Number,
}, { _id: false })

const ChatMessageSchema = new Schema({
  id: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: String, required: true },
}, { _id: false })

const InternalTransferSchema = new Schema({
  fromAccountId: String,
  toAccountId: String,
  amount: Number,
  date: String,
  description: String, // Will be encrypted
}, { _id: false })

const BankAccountSchema = new Schema({
  id: { type: String, required: true },
  accountNumber: { type: String, default: '' }, // Will be encrypted
  accountName: { type: String, default: '' }, // Will be encrypted
  bankName: { type: String, default: null }, // Will be encrypted
  pdfFileName: { type: String, required: true },
  pdfData: { type: String, default: null }, // Base64 encoded PDF stored in MongoDB
  koncileTaskId: { type: String, default: null },
  koncileDocumentId: { type: Number, default: null },
  extractionStatus: {
    type: String,
    enum: ['pending', 'processing', 'done', 'failed'],
    default: 'pending',
  },
  bankData: { type: BankDataSchema, required: true },
  internalTransfers: { type: [InternalTransferSchema], default: [] },
}, { _id: false })

const DealSchema = new Schema({
  _id: { type: String, required: true },
  businessName: { type: String, default: '' }, // Will be encrypted
  ownerName: { type: String, default: '' }, // Will be encrypted
  amountRequested: { type: Number, default: 0 },
  dateSubmitted: { type: String, default: () => new Date().toISOString() },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'declined'],
    default: 'pending',
  },
  industry: { type: String, default: '' },
  broker: { type: String, default: null }, // Will be encrypted
  notes: { type: String, default: null }, // Will be encrypted
  aiSummary: { type: String, default: null },
  chatHistory: { type: [ChatMessageSchema], default: [] },
  bankData: { type: BankDataSchema, default: null },
  bankAccounts: { type: [BankAccountSchema], default: [] },
  existingPositions: { type: [PositionSchema], default: [] },
  koncileTaskId: { type: String, default: null },
  koncileDocumentId: { type: Number, default: null },
  extractionStatus: {
    type: String,
    enum: ['pending', 'processing', 'done', 'failed', null],
    default: null,
  },
  pdfFileName: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, {
  _id: false, // We manage our own _id
})

/**
 * Encrypt sensitive fields before saving to database
 */
DealSchema.pre('save', function() {
  // Encrypt top-level fields
  if (this.businessName) this.businessName = encrypt(this.businessName)
  if (this.ownerName) this.ownerName = encrypt(this.ownerName)
  if (this.broker) this.broker = encrypt(this.broker)
  if (this.notes) this.notes = encrypt(this.notes)

  // Encrypt bank accounts - iterate in place
  if (this.bankAccounts && this.bankAccounts.length > 0) {
    for (let i = 0; i < this.bankAccounts.length; i++) {
      const account = this.bankAccounts[i] as any
      if (account.accountNumber) account.accountNumber = encrypt(account.accountNumber)
      if (account.accountName) account.accountName = encrypt(account.accountName)
      if (account.bankName) account.bankName = encrypt(account.bankName)

      if (account.bankData && account.bankData.transactions) {
        for (let j = 0; j < account.bankData.transactions.length; j++) {
          const tx = account.bankData.transactions[j] as any
          if (tx.description) tx.description = encrypt(tx.description)
        }
      }

      if (account.internalTransfers) {
        for (let j = 0; j < account.internalTransfers.length; j++) {
          const transfer = account.internalTransfers[j] as any
          if (transfer.description) transfer.description = encrypt(transfer.description)
        }
      }
    }
  }

  // Encrypt legacy bank data transactions
  if (this.bankData && this.bankData.transactions) {
    for (let i = 0; i < this.bankData.transactions.length; i++) {
      const tx = this.bankData.transactions[i] as any
      if (tx.description) tx.description = encrypt(tx.description)
    }
  }

  // Encrypt existing positions
  if (this.existingPositions && this.existingPositions.length > 0) {
    for (let i = 0; i < this.existingPositions.length; i++) {
      const pos = this.existingPositions[i] as any
      if (pos.lender) pos.lender = encrypt(pos.lender)
    }
  }
})

/**
 * Decrypt sensitive fields after retrieving from database
 */
function decryptDeal(doc: any) {
  if (!doc) return doc

  try {
    // Decrypt top-level fields
    if (doc.businessName) doc.businessName = decrypt(doc.businessName)
    if (doc.ownerName) doc.ownerName = decrypt(doc.ownerName)
    if (doc.broker) doc.broker = decrypt(doc.broker)
    if (doc.notes) doc.notes = decrypt(doc.notes)

    // Decrypt bank accounts
    if (doc.bankAccounts && doc.bankAccounts.length > 0) {
      for (let i = 0; i < doc.bankAccounts.length; i++) {
        const account = doc.bankAccounts[i]
        if (account.accountNumber) account.accountNumber = decrypt(account.accountNumber)
        if (account.accountName) account.accountName = decrypt(account.accountName)
        if (account.bankName) account.bankName = decrypt(account.bankName)

        if (account.bankData && account.bankData.transactions) {
          for (let j = 0; j < account.bankData.transactions.length; j++) {
            const tx = account.bankData.transactions[j]
            if (tx.description) tx.description = decrypt(tx.description)
          }
        }

        if (account.internalTransfers) {
          for (let j = 0; j < account.internalTransfers.length; j++) {
            const transfer = account.internalTransfers[j]
            if (transfer.description) transfer.description = decrypt(transfer.description)
          }
        }
      }
    }

    // Decrypt legacy bank data transactions
    if (doc.bankData && doc.bankData.transactions) {
      for (let i = 0; i < doc.bankData.transactions.length; i++) {
        const tx = doc.bankData.transactions[i]
        if (tx.description) tx.description = decrypt(tx.description)
      }
    }

    // Decrypt existing positions
    if (doc.existingPositions && doc.existingPositions.length > 0) {
      for (let i = 0; i < doc.existingPositions.length; i++) {
        const pos = doc.existingPositions[i]
        if (pos.lender) pos.lender = decrypt(pos.lender)
      }
    }
  } catch (error) {
    console.error('Decryption error in deal:', error)
    // Return doc as-is if decryption fails (backward compatibility)
  }

  return doc
}

// Apply decryption after find operations
DealSchema.post('find', function(docs: any[]) {
  if (docs && docs.length > 0) {
    docs.forEach(decryptDeal)
  }
})

DealSchema.post('findOne', function(doc: any) {
  if (doc) decryptDeal(doc)
})

DealSchema.post('findOneAndUpdate', function(doc: any) {
  if (doc) decryptDeal(doc)
})

// Helper to convert document to Deal type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function docToDeal(doc: any): Deal {
  // Decrypt before converting
  const obj = doc.toObject ? doc.toObject() : doc
  const decrypted = decryptDeal(obj)

  return {
    id: decrypted._id,
    businessName: decrypted.businessName,
    ownerName: decrypted.ownerName,
    amountRequested: decrypted.amountRequested,
    dateSubmitted: decrypted.dateSubmitted,
    status: decrypted.status,
    industry: decrypted.industry,
    broker: decrypted.broker,
    notes: decrypted.notes,
    aiSummary: decrypted.aiSummary,
    chatHistory: decrypted.chatHistory || [],
    bankData: decrypted.bankData,
    bankAccounts: decrypted.bankAccounts || [],
    existingPositions: decrypted.existingPositions || [],
    koncileTaskId: decrypted.koncileTaskId,
    koncileDocumentId: decrypted.koncileDocumentId,
    extractionStatus: decrypted.extractionStatus,
    pdfFileName: decrypted.pdfFileName,
    createdAt: decrypted.createdAt,
    updatedAt: decrypted.updatedAt,
  }
}

export const DealModel = mongoose.model('Deal', DealSchema)
