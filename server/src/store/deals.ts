import { Deal } from '../types/index.js'
import { DealModel, docToDeal } from '../db/models/Deal.js'
import { isConnected } from '../db/connection.js'
import { v4 as uuidv4 } from 'uuid'

// In-memory fallback store
const memoryStore: Map<string, Deal> = new Map()

export async function createDeal(data: {
  businessName?: string
  amountRequested?: number
  dateSubmitted?: string
  broker?: string
  notes?: string
  ownerName?: string
  industry?: string
}): Promise<Deal> {
  const id = uuidv4()
  const now = new Date().toISOString()

  const dealData: Deal = {
    id,
    businessName: data.businessName || '',
    ownerName: data.ownerName || '',
    amountRequested: data.amountRequested || 0,
    industry: data.industry || '',
    broker: data.broker || null,
    notes: data.notes || null,
    dateSubmitted: data.dateSubmitted || now,
    status: 'pending',
    aiSummary: null,
    chatHistory: [],
    bankData: null,
    bankAccounts: [],
    existingPositions: [],
    koncileTaskId: null,
    koncileDocumentId: null,
    extractionStatus: null,
    pdfFileName: null,
    createdAt: now,
    updatedAt: now,
  }

  if (isConnected()) {
    const doc = new DealModel({ _id: id, ...dealData })
    await doc.save()
    return docToDeal(doc)
  }

  memoryStore.set(id, dealData)
  return dealData
}

export async function getDeal(id: string): Promise<Deal | null> {
  if (isConnected()) {
    const doc = await DealModel.findById(id)
    return doc ? docToDeal(doc) : null
  }

  return memoryStore.get(id) || null
}

export async function getAllDeals(): Promise<Deal[]> {
  if (isConnected()) {
    const docs = await DealModel.find().sort({ dateSubmitted: -1 })
    return docs.map(doc => docToDeal(doc))
  }

  return Array.from(memoryStore.values()).sort(
    (a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime()
  )
}

export async function updateDeal(id: string, updates: Partial<Deal>): Promise<Deal | null> {
  if (isConnected()) {
    // Use findById + save to trigger pre-save encryption hook
    const doc = await DealModel.findById(id)
    if (!doc) return null

    // Apply updates to the document
    Object.assign(doc, updates, { updatedAt: new Date().toISOString() })

    // Save triggers pre-save hook which encrypts sensitive data
    await doc.save()

    return docToDeal(doc)
  }

  const deal = memoryStore.get(id)
  if (!deal) return null

  const updated: Deal = {
    ...deal,
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  memoryStore.set(id, updated)
  return updated
}

export async function deleteDeal(id: string): Promise<boolean> {
  if (isConnected()) {
    const result = await DealModel.findByIdAndDelete(id)
    return !!result
  }

  return memoryStore.delete(id)
}

// Check if deals exist (for seeding)
export async function hasDeals(): Promise<boolean> {
  if (isConnected()) {
    const count = await DealModel.countDocuments()
    return count > 0
  }
  return memoryStore.size > 0
}

// Seed with demo data if empty
export async function seedDemoData() {
  const exists = await hasDeals()
  if (exists) {
    console.log('Database already has deals, skipping seed')
    return
  }

  const demoDeals = [
    {
      businessName: 'Metro Pizza & Grill',
      ownerName: 'Anthony Russo',
      amountRequested: 75000,
      industry: 'Restaurant',
    },
    {
      businessName: 'Sunrise Auto Repair',
      ownerName: 'Michael Chen',
      amountRequested: 50000,
      industry: 'Auto Services',
    },
    {
      businessName: 'Brooklyn Deli & Catering',
      ownerName: 'Sarah Goldman',
      amountRequested: 120000,
      industry: 'Restaurant',
    },
  ]

  for (const data of demoDeals) {
    const deal = await createDeal(data)
    await updateDeal(deal.id, {
      aiSummary: 'Awaiting bank statement upload for analysis.',
    })
  }

  console.log(`Seeded ${demoDeals.length} demo deals`)
}
