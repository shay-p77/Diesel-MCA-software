import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { createDeal, getDeal, getAllDeals, updateDeal } from '../store/deals.js'
import { getKoncileService } from '../services/koncile.js'
import { getClaudeService } from '../services/claude.js'
import { CreateDealRequest, ChatRequest } from '../types/index.js'

const router = Router()

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  },
})

// GET /api/deals - List all deals
router.get('/', async (req: Request, res: Response) => {
  try {
    const deals = await getAllDeals()
    res.json(deals)
  } catch (error: any) {
    console.error('Error fetching deals:', error)
    res.status(500).json({ error: 'Failed to fetch deals' })
  }
})

// POST /api/deals - Create a new deal
router.post('/', async (req: Request<{}, {}, CreateDealRequest>, res: Response) => {
  try {
    const { businessName, amountRequested, dateSubmitted, broker, notes, ownerName, industry } = req.body

    const deal = await createDeal({
      businessName,
      amountRequested,
      dateSubmitted,
      broker,
      notes,
      ownerName,
      industry,
    })
    res.status(201).json(deal)
  } catch (error: any) {
    console.error('Error creating deal:', error)
    res.status(500).json({ error: 'Failed to create deal' })
  }
})

// GET /api/deals/:id - Get a single deal
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    res.json(deal)
  } catch (error: any) {
    console.error('Error fetching deal:', error)
    res.status(500).json({ error: 'Failed to fetch deal' })
  }
})

// PATCH /api/deals/:id - Update deal fields
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    const { businessName, amountRequested, dateSubmitted, broker, notes, ownerName, industry } = req.body

    const updatedDeal = await updateDeal(deal.id, {
      ...(businessName !== undefined && { businessName }),
      ...(amountRequested !== undefined && { amountRequested }),
      ...(dateSubmitted !== undefined && { dateSubmitted }),
      ...(broker !== undefined && { broker }),
      ...(notes !== undefined && { notes }),
      ...(ownerName !== undefined && { ownerName }),
      ...(industry !== undefined && { industry }),
    })

    res.json(updatedDeal)
  } catch (error: any) {
    console.error('Error updating deal:', error)
    res.status(500).json({ error: 'Failed to update deal' })
  }
})

// POST /api/deals/:id/upload - Upload PDF and send to Koncile
router.post('/:id/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const koncile = getKoncileService()

    // Upload to Koncile
    const uploadResult = await koncile.uploadBuffer(
      req.file.buffer,
      req.file.originalname
    )

    // Update deal with Koncile task info
    const updatedDeal = await updateDeal(deal.id, {
      koncileTaskId: uploadResult.task_id,
      extractionStatus: 'processing',
      pdfFileName: req.file.originalname,
    })

    res.json({
      message: 'File uploaded and processing started',
      taskId: uploadResult.task_id,
      deal: updatedDeal,
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    res.status(500).json({ error: error.message || 'Upload failed' })
  }
})

// GET /api/deals/:id/extraction - Get extraction status/results
router.get('/:id/extraction', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    if (!deal.koncileTaskId) {
      res.status(400).json({ error: 'No extraction in progress for this deal' })
      return
    }

    const koncile = getKoncileService()
    const result = await koncile.getTaskResult(deal.koncileTaskId)

    if (result.status === 'DONE') {
      // Parse the extraction result
      const parsed = koncile.parseExtractionResult(result)

      // Update deal with extracted data
      const updatedDeal = await updateDeal(deal.id, {
        koncileDocumentId: result.document_id,
        extractionStatus: 'done',
        bankData: {
          totalDeposits: parsed.bankData.totalDeposits,
          totalWithdrawals: parsed.bankData.totalWithdrawals,
          endingBalance: parsed.bankData.endingBalance || 0,
          beginningBalance: parsed.bankData.beginningBalance || 0,
          avgDailyBalance: 0, // Calculate from transactions if needed
          dailyAvgDeposit: 0, // Calculate from transactions if needed
          nsfs: 0, // Would need to detect from transactions
          negativeDays: 0, // Would need to calculate
          monthsOfStatements: 1,
          transactions: parsed.transactions,
        },
      })

      res.json({
        status: 'done',
        deal: updatedDeal,
        raw: parsed.raw,
      })
    } else if (result.status === 'FAILED') {
      await updateDeal(deal.id, { extractionStatus: 'failed' })
      res.json({
        status: 'failed',
        message: result.status_message,
      })
    } else {
      res.json({
        status: 'processing',
        message: result.status_message,
      })
    }
  } catch (error: any) {
    console.error('Extraction status error:', error)
    res.status(500).json({ error: error.message || 'Failed to get extraction status' })
  }
})

// POST /api/deals/:id/chat - Chat with Claude about the deal
router.post('/:id/chat', async (req: Request<{ id: string }, {}, ChatRequest>, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    const { message, history = [] } = req.body

    if (!message) {
      res.status(400).json({ error: 'Message is required' })
      return
    }

    const claude = getClaudeService()

    const response = await claude.chat(
      {
        businessName: deal.businessName,
        ownerName: deal.ownerName,
        amountRequested: deal.amountRequested,
        industry: deal.industry,
        bankData: deal.bankData || {
          totalDeposits: 0,
          totalWithdrawals: 0,
          endingBalance: 0,
        },
        existingPositions: deal.existingPositions,
      },
      message,
      history.map(m => ({ role: m.role, content: m.content }))
    )

    res.json({
      id: uuidv4(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Chat error:', error)

    // Check if it's an API key error
    if (error.message?.includes('API key') || error.message?.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: 'Claude AI is not configured. Please add your Anthropic API key.' })
      return
    }

    res.status(500).json({ error: error.message || 'Chat failed' })
  }
})

// POST /api/deals/:id/generate-summary - Generate AI summary
router.post('/:id/generate-summary', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    const claude = getClaudeService()

    const summary = await claude.generateSummary({
      businessName: deal.businessName,
      ownerName: deal.ownerName,
      amountRequested: deal.amountRequested,
      industry: deal.industry,
      bankData: deal.bankData || {
        totalDeposits: 0,
        totalWithdrawals: 0,
        endingBalance: 0,
      },
      existingPositions: deal.existingPositions,
    })

    const updatedDeal = await updateDeal(deal.id, { aiSummary: summary })

    res.json({ summary, deal: updatedDeal })
  } catch (error: any) {
    console.error('Summary generation error:', error)
    res.status(500).json({ error: error.message || 'Failed to generate summary' })
  }
})

// PATCH /api/deals/:id/status - Update deal status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    const { status } = req.body

    if (!['pending', 'under_review', 'approved', 'declined'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' })
      return
    }

    const updatedDeal = await updateDeal(deal.id, { status })
    res.json(updatedDeal)
  } catch (error: any) {
    console.error('Status update error:', error)
    res.status(500).json({ error: 'Failed to update status' })
  }
})

export default router
