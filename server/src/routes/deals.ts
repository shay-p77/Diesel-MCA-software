import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { createDeal, getDeal, getAllDeals, updateDeal, deleteDeal } from '../store/deals.js'
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

// POST /api/deals/:id/upload - Upload PDF(s) and send to Koncile
router.post('/:id/upload', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' })
      return
    }

    console.log(`Uploading ${files.length} file(s) for deal ${deal.id}`)

    const koncile = getKoncileService()
    const newBankAccounts = []
    const errors = []

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      try {
        console.log(`Processing file ${i + 1}/${files.length}: ${file.originalname} (${file.size} bytes)`)

        // Generate unique ID for this bank account
        const accountId = uuidv4()

        // Convert PDF to base64 for storage in MongoDB
        const pdfBase64 = file.buffer.toString('base64')
        console.log(`PDF converted to base64 (${pdfBase64.length} chars)`)

        // Upload to Koncile
        console.log(`Sending ${file.originalname} to Koncile API...`)
        const uploadResult = await koncile.uploadBuffer(
          file.buffer,
          file.originalname
        )

        console.log(`Koncile API response for ${file.originalname}:`, JSON.stringify(uploadResult, null, 2))

        if (!uploadResult.task_id) {
          throw new Error('Koncile did not return a task_id. Response: ' + JSON.stringify(uploadResult))
        }

        console.log(`Koncile upload successful. Task ID: ${uploadResult.task_id}`)

        // Create bank account record with PDF stored in MongoDB
        newBankAccounts.push({
          id: accountId,
          accountNumber: '', // Will be populated from extraction
          accountName: `Account ${i + 1}`, // Temporary name, will be updated from extraction
          bankName: null,
          pdfFileName: file.originalname,
          pdfData: pdfBase64, // Store PDF in MongoDB instead of file system
          koncileTaskId: uploadResult.task_id,
          koncileDocumentId: null,
          extractionStatus: 'processing' as const,
          bankData: {
            totalDeposits: 0,
            totalWithdrawals: 0,
            endingBalance: 0,
            beginningBalance: 0,
            avgDailyBalance: 0,
            dailyAvgDeposit: 0,
            nsfs: 0,
            negativeDays: 0,
            monthsOfStatements: 0,
            transactions: [],
          },
          internalTransfers: [],
        })

        console.log(`Bank account ${accountId} created for ${file.originalname}`)
      } catch (fileError: any) {
        console.error(`Error processing file ${file.originalname}:`, fileError)
        errors.push({
          fileName: file.originalname,
          error: fileError.message,
        })
      }
    }

    // Update deal with new bank accounts
    const existingAccounts = deal.bankAccounts || []
    const updatedDeal = await updateDeal(deal.id, {
      bankAccounts: [...existingAccounts, ...newBankAccounts],
      extractionStatus: 'processing',
      // Keep legacy fields for backward compatibility (use first account)
      ...(newBankAccounts.length > 0 && {
        koncileTaskId: newBankAccounts[0].koncileTaskId,
        pdfFileName: newBankAccounts[0].pdfFileName,
      }),
    })

    console.log(`Deal ${deal.id} updated with ${newBankAccounts.length} new bank account(s)`)

    res.json({
      message: `${newBankAccounts.length} file(s) uploaded and processing started`,
      accountsCreated: newBankAccounts.length,
      errors: errors.length > 0 ? errors : undefined,
      deal: updatedDeal,
    })
  } catch (error: any) {
    console.error('Upload error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack,
    })

    res.status(500).json({
      error: error.response?.data?.message || error.message || 'Upload failed',
      details: error.response?.data
    })
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

    const bankAccounts = deal.bankAccounts || []

    // Check if using new multi-account structure
    if (bankAccounts.length > 0) {
      const koncile = getKoncileService()
      let anyProcessing = false
      let updatedAccounts = [...bankAccounts]

      // Process each account that's still extracting
      for (let i = 0; i < updatedAccounts.length; i++) {
        const account = updatedAccounts[i]

        if (account.extractionStatus === 'processing' && account.koncileTaskId) {
          console.log(`[Extraction Poll] Account ${account.id}, Task ID: ${account.koncileTaskId}`)

          const result = await koncile.getTaskResult(account.koncileTaskId)
          console.log(`[Extraction Poll] Koncile status: ${result.status}, message: ${result.status_message}`)

          if (result.status === 'DONE' || result.status === 'DUPLICATE') {
            console.log(`[Extraction Poll] Processing ${result.status} status for account ${account.id}`)

            // For DUPLICATE status, fetch the full document data
            let dataToParseFrom = result
            if (result.status === 'DUPLICATE' && result.document_id) {
              console.log(`[Extraction Poll] Fetching document data for document_id: ${result.document_id}`)
              const documentData = await koncile.getDocumentData(result.document_id)
              console.log('[Extraction Poll] Document data fetched, merging with task result')
              dataToParseFrom = { ...result, ...documentData }
            }

            // Parse the extraction result
            const parsed = koncile.parseExtractionResult(dataToParseFrom)
            console.log(`[Extraction Poll] Parsed ${parsed.transactions.length} transactions for account ${account.id}`)

            // Extract account info from parsed data (using Koncile General Fields)
            const generalFields = parsed.raw?.generalFields || {}
            const accountNumber = generalFields['Account Number']?.value ||
                                generalFields['Account number']?.value ||
                                generalFields['account_number']?.value || ''
            const bankName = generalFields['Bank Name']?.value ||
                           generalFields['Bank name']?.value ||
                           generalFields['bank_name']?.value || null

            // Calculate average daily deposit from transactions
            const deposits = parsed.transactions.filter((txn: any) => txn.amount > 0)
            const dailyAvgDeposit = deposits.length > 0
              ? deposits.reduce((sum: number, txn: any) => sum + txn.amount, 0) / deposits.length
              : 0

            console.log(`[Extraction] Account number extracted: ${accountNumber}, Bank: ${bankName}`)

            // Update this account with extracted data
            updatedAccounts[i] = {
              ...account,
              accountNumber: accountNumber,
              accountName: bankName ? `${bankName} ${accountNumber.slice(-4)}` : `Account ending in ${accountNumber.slice(-4)}`,
              bankName: bankName,
              koncileDocumentId: result.document_id,
              extractionStatus: 'done' as const,
              bankData: {
                totalDeposits: parsed.bankData.totalDeposits,
                totalWithdrawals: parsed.bankData.totalWithdrawals,
                endingBalance: parsed.bankData.endingBalance || 0,
                beginningBalance: parsed.bankData.beginningBalance || 0,
                avgDailyBalance: 0,
                dailyAvgDeposit: dailyAvgDeposit,
                nsfs: 0,
                negativeDays: 0,
                monthsOfStatements: 1,
                transactions: parsed.transactions,
              },
            }
          } else if (result.status === 'FAILED') {
            console.log(`[Extraction Poll] Status is FAILED for account ${account.id}`)
            updatedAccounts[i] = {
              ...account,
              extractionStatus: 'failed' as const,
            }
          } else {
            anyProcessing = true
          }
        } else if (account.extractionStatus === 'processing') {
          anyProcessing = true
        }
      }

      // Detect internal transfers between accounts if all are done
      const allDone = updatedAccounts.every(acc => acc.extractionStatus === 'done')
      if (allDone && updatedAccounts.length > 1) {
        console.log('[Internal Transfer Detection] All accounts processed, detecting internal transfers...')
        updatedAccounts = detectInternalTransfers(updatedAccounts)
      }

      // Update deal with processed accounts
      const overallStatus = allDone ? 'done' : anyProcessing ? 'processing' : 'failed'
      const updatedDeal = await updateDeal(deal.id, {
        bankAccounts: updatedAccounts,
        extractionStatus: overallStatus,
        // Update legacy fields for backward compatibility (use first account)
        ...(updatedAccounts.length > 0 && updatedAccounts[0].extractionStatus === 'done' && {
          koncileDocumentId: updatedAccounts[0].koncileDocumentId,
          bankData: updatedAccounts[0].bankData,
        }),
      })

      console.log('[Extraction Poll] Deal updated with account data')

      res.json({
        status: overallStatus,
        deal: updatedDeal,
        accountsProcessed: updatedAccounts.filter(a => a.extractionStatus === 'done').length,
        totalAccounts: updatedAccounts.length,
      })
    } else {
      // Legacy single-file support
      if (!deal.koncileTaskId) {
        res.status(400).json({ error: 'No extraction in progress for this deal' })
        return
      }

      console.log(`[Extraction Poll] Deal ${deal.id}, Task ID: ${deal.koncileTaskId}`)

      const koncile = getKoncileService()
      const result = await koncile.getTaskResult(deal.koncileTaskId)

      console.log(`[Extraction Poll] Koncile status: ${result.status}, message: ${result.status_message}`)

      if (result.status === 'DONE' || result.status === 'DUPLICATE') {
        console.log(`[Extraction Poll] Processing ${result.status} status - parsing results...`)

        let dataToParseFrom = result
        if (result.status === 'DUPLICATE' && result.document_id) {
          console.log(`[Extraction Poll] Fetching document data for document_id: ${result.document_id}`)
          const documentData = await koncile.getDocumentData(result.document_id)
          console.log('[Extraction Poll] Document data fetched, merging with task result')
          dataToParseFrom = { ...result, ...documentData }
        }

        const parsed = koncile.parseExtractionResult(dataToParseFrom)
        console.log(`[Extraction Poll] Parsed ${parsed.transactions.length} transactions`)

        const updatedDeal = await updateDeal(deal.id, {
          koncileDocumentId: result.document_id,
          extractionStatus: 'done',
          bankData: {
            totalDeposits: parsed.bankData.totalDeposits,
            totalWithdrawals: parsed.bankData.totalWithdrawals,
            endingBalance: parsed.bankData.endingBalance || 0,
            beginningBalance: parsed.bankData.beginningBalance || 0,
            avgDailyBalance: 0,
            dailyAvgDeposit: 0,
            nsfs: 0,
            negativeDays: 0,
            monthsOfStatements: 1,
            transactions: parsed.transactions,
          },
        })

        console.log('[Extraction Poll] Deal updated with extracted data')

        res.json({
          status: 'done',
          deal: updatedDeal,
          raw: parsed.raw,
        })
      } else if (result.status === 'FAILED') {
        console.log('[Extraction Poll] Status is FAILED')
        await updateDeal(deal.id, { extractionStatus: 'failed' })
        res.json({
          status: 'failed',
          message: result.status_message,
        })
      } else {
        console.log('[Extraction Poll] Status is still processing')
        res.json({
          status: 'processing',
          message: result.status_message,
        })
      }
    }
  } catch (error: any) {
    console.error('Extraction status error:', error)
    res.status(500).json({ error: error.message || 'Failed to get extraction status' })
  }
})

// Helper function to detect internal transfers between accounts
function detectInternalTransfers(accounts: any[]) {
  console.log(`[Internal Transfer Detection] Analyzing ${accounts.length} accounts`)

  const AMOUNT_THRESHOLD = 0.01 // Match amounts within 1 cent
  const DATE_THRESHOLD_DAYS = 3 // Match transactions within 3 days

  for (let i = 0; i < accounts.length; i++) {
    const account1 = accounts[i]
    const internalTransfers: any[] = []

    for (let j = 0; j < accounts.length; j++) {
      if (i === j) continue

      const account2 = accounts[j]

      // Check each withdrawal in account1 against deposits in account2
      for (const txn1 of account1.bankData.transactions) {
        if (txn1.amount >= 0) continue // Skip deposits

        const withdrawalAmount = Math.abs(txn1.amount)
        const txn1Date = new Date(txn1.date)

        for (const txn2 of account2.bankData.transactions) {
          if (txn2.amount <= 0) continue // Skip withdrawals

          const depositAmount = txn2.amount
          const txn2Date = new Date(txn2.date)

          // Check if amounts match
          const amountDiff = Math.abs(withdrawalAmount - depositAmount)
          if (amountDiff > AMOUNT_THRESHOLD) continue

          // Check if dates are close
          const daysDiff = Math.abs((txn1Date.getTime() - txn2Date.getTime()) / (1000 * 60 * 60 * 24))
          if (daysDiff > DATE_THRESHOLD_DAYS) continue

          // Found a potential internal transfer
          internalTransfers.push({
            fromAccountId: account1.id,
            toAccountId: account2.id,
            amount: withdrawalAmount,
            date: txn1.date,
            description: `Transfer: ${txn1.description} → ${txn2.description}`,
          })
        }
      }
    }

    if (internalTransfers.length > 0) {
      console.log(`[Internal Transfer Detection] Found ${internalTransfers.length} internal transfers for account ${account1.id}`)
      accounts[i] = {
        ...account1,
        internalTransfers,
      }
    }
  }

  return accounts
}

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

    // Create message objects
    const userMessage = {
      id: uuidv4(),
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    }

    const assistantMessage = {
      id: uuidv4(),
      role: 'assistant' as const,
      content: response,
      timestamp: new Date().toISOString(),
    }

    // Save messages to chat history
    const updatedChatHistory = [...history, userMessage, assistantMessage]
    await updateDeal(deal.id, { chatHistory: updatedChatHistory })

    res.json(assistantMessage)
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

// GET /api/deals/:id/pdf - Serve the PDF file (legacy or first account)
router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    // If using multi-account structure, serve first account's PDF from MongoDB
    if (deal.bankAccounts && deal.bankAccounts.length > 0) {
      const firstAccount = deal.bankAccounts[0]

      if (!firstAccount.pdfData) {
        res.status(404).json({ error: 'PDF file not found in database' })
        return
      }

      // Convert base64 back to buffer
      const pdfBuffer = Buffer.from(firstAccount.pdfData, 'base64')

      // Set headers for PDF
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${firstAccount.pdfFileName}"`)
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET')
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      res.setHeader('Content-Length', pdfBuffer.length)

      res.send(pdfBuffer)
    } else {
      // No bank accounts, no PDF
      res.status(404).json({ error: 'No PDF available for this deal' })
    }
  } catch (error: any) {
    console.error('PDF serve error:', error)
    res.status(500).json({ error: 'Failed to serve PDF' })
  }
})

// GET /api/deals/:id/pdf/:accountId - Serve specific account's PDF file
router.get('/:id/pdf/:accountId', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    if (!deal.bankAccounts || deal.bankAccounts.length === 0) {
      res.status(404).json({ error: 'No bank accounts found for this deal' })
      return
    }

    const account = deal.bankAccounts.find(acc => acc.id === req.params.accountId)

    if (!account) {
      res.status(404).json({ error: 'Bank account not found' })
      return
    }

    if (!account.pdfData) {
      res.status(404).json({ error: 'PDF file not found in database' })
      return
    }

    // Convert base64 back to buffer
    const pdfBuffer = Buffer.from(account.pdfData, 'base64')

    // Set headers for PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${account.pdfFileName}"`)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Content-Length', pdfBuffer.length)

    res.send(pdfBuffer)
  } catch (error: any) {
    console.error('PDF serve error:', error)
    res.status(500).json({ error: 'Failed to serve PDF' })
  }
})

// DELETE /api/deals/:id - Delete a deal
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    // Delete deal from database (PDFs are stored in MongoDB, will be deleted with the deal)
    await deleteDeal(req.params.id)

    res.json({ message: 'Deal deleted successfully' })
  } catch (error: any) {
    console.error('Delete error:', error)
    res.status(500).json({ error: 'Failed to delete deal' })
  }
})

export default router
