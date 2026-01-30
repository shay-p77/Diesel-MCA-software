import mongoose, { Schema } from 'mongoose'
import { Deal } from '../../types/index.js'

const TransactionSchema = new Schema({
  date: String,
  type: String,
  amount: Number,
  description: String,
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
  lender: String,
  payment: Number,
  frequency: { type: String, enum: ['Daily', 'Weekly', 'Monthly'] },
  estimatedBalance: Number,
}, { _id: false })

const DealSchema = new Schema({
  _id: { type: String, required: true },
  businessName: { type: String, default: '' },
  ownerName: { type: String, default: '' },
  amountRequested: { type: Number, default: 0 },
  dateSubmitted: { type: String, default: () => new Date().toISOString() },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'declined'],
    default: 'pending',
  },
  industry: { type: String, default: '' },
  broker: { type: String, default: null },
  notes: { type: String, default: null },
  aiSummary: { type: String, default: null },
  bankData: { type: BankDataSchema, default: null },
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

// Helper to convert document to Deal type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function docToDeal(doc: any): Deal {
  const obj = doc.toObject()
  return {
    id: obj._id,
    businessName: obj.businessName,
    ownerName: obj.ownerName,
    amountRequested: obj.amountRequested,
    dateSubmitted: obj.dateSubmitted,
    status: obj.status,
    industry: obj.industry,
    broker: obj.broker,
    notes: obj.notes,
    aiSummary: obj.aiSummary,
    bankData: obj.bankData,
    existingPositions: obj.existingPositions || [],
    koncileTaskId: obj.koncileTaskId,
    koncileDocumentId: obj.koncileDocumentId,
    extractionStatus: obj.extractionStatus,
    pdfFileName: obj.pdfFileName,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  }
}

export const DealModel = mongoose.model('Deal', DealSchema)
