import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { createDeal, getDeal, getAllDeals, updateDeal, deleteDeal } from '../store/deals.js'
import { getKoncileService } from '../services/koncile.js'
import { getClaudeService } from '../services/claude.js'
import { extractPdfText, extractPdfTextFromBase64 } from '../services/pdfExtractor.js'
import { CreateDealRequest, ChatRequest } from '../types/index.js'

const router = Router()

// Helper function to parse dates for sorting (handles both ISO and DD/MM/YYYY)
function parseDateForSort(dateStr: string): number {
  if (!dateStr) return 0
  // ISO format: YYYY-MM-DD
  if (dateStr.includes('-')) {
    return new Date(dateStr).getTime()
  }
  // DD/MM/YYYY format (legacy Koncile)
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime()
  }
  return new Date(dateStr).getTime()
}

// Parse statement period string like "01/04/2025 through 30/04/2025"
function parseStatementPeriod(periodStr: string): { start: Date; end: Date } | null {
  if (!periodStr) return null
  const match = periodStr.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+through\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)
  if (match) {
    const start = parseDDMMYYYYToDate(match[1])
    const end = parseDDMMYYYYToDate(match[2])
    if (start && end) return { start, end }
  }
  return null
}

function parseDDMMYYYYToDate(dateStr: string): Date | null {
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }
  return null
}

// Parse any date string to a LOCAL Date (avoids UTC timezone shift issues)
function parseDateLocal(dateStr: string): Date {
  if (!dateStr) return new Date(0)
  // ISO format "YYYY-MM-DD" → create LOCAL date (not UTC)
  if (dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day || 1)
  }
  // DD/MM/YYYY format
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
  }
  return new Date(dateStr)
}

// Format a Date as YYYY-MM-DD using LOCAL time (not UTC)
function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Count NSF transactions by keyword detection
function countNSFs(transactions: any[]): number {
  const NSF_KEYWORDS = ['NSF', 'NON-SUFFICIENT', 'NON SUFFICIENT', 'INSUFFICIENT FUND',
    'RETURNED ITEM', 'OVERDRAFT FEE', 'OD FEE', 'RETURN ITEM FEE']
  return transactions.filter(txn => {
    const desc = (txn.description || '').toUpperCase()
    const type = (txn.type || '').toUpperCase()
    return NSF_KEYWORDS.some(kw => desc.includes(kw) || type.includes(kw))
  }).length
}

// Calculate running daily balances for avgDailyBalance and negativeDays
function calculateDailyBalances(
  transactions: any[],
  beginningBalance: number,
  startDate: Date,
  endDate: Date
): { avgDailyBalance: number; negativeDays: number } {
  // Group transaction net amounts by date key (YYYY-MM-DD)
  const txnsByDate = new Map<string, number>()
  for (const txn of transactions) {
    // Extract date key from the ISO string directly (no timezone conversion)
    const dateKey = txn.date.split('T')[0]
    txnsByDate.set(dateKey, (txnsByDate.get(dateKey) || 0) + txn.amount)
  }

  let balance = beginningBalance
  let totalBalance = 0
  let dayCount = 0
  let negativeDays = 0

  const current = new Date(startDate)
  while (current <= endDate) {
    // Use LOCAL time formatting to match transaction date keys
    const dateKey = formatDateKey(current)
    const dayNet = txnsByDate.get(dateKey) || 0
    balance += dayNet

    totalBalance += balance
    dayCount++
    if (balance < 0) negativeDays++

    current.setDate(current.getDate() + 1)
  }

  const avgDailyBalance = dayCount > 0 ? totalBalance / dayCount : beginningBalance
  return { avgDailyBalance, negativeDays }
}

// Calculate all derived bank metrics from transactions
function calculateBankMetrics(
  transactions: any[],
  beginningBalance: number,
  statementPeriod: { start: Date; end: Date } | null
): {
  endingBalance: number
  avgDailyBalance: number
  dailyAvgDeposit: number
  nsfs: number
  negativeDays: number
  monthsOfStatements: number
} {
  const totalDeposits = transactions
    .filter((t: any) => t.amount > 0)
    .reduce((sum: number, t: any) => sum + t.amount, 0)

  const totalWithdrawals = transactions
    .filter((t: any) => t.amount < 0)
    .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)

  // Ending balance = beginning + deposits - withdrawals
  const endingBalance = beginningBalance + totalDeposits - totalWithdrawals

  // Determine date range (from statement period or transaction dates)
  let startDate: Date
  let endDate: Date
  let calendarDays: number

  if (statementPeriod) {
    startDate = statementPeriod.start
    endDate = statementPeriod.end
  } else if (transactions.length > 0) {
    // Fallback: derive from transaction date range (use LOCAL dates to avoid timezone shift)
    const sorted = [...transactions].sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date))
    startDate = parseDateLocal(sorted[0].date)
    endDate = parseDateLocal(sorted[sorted.length - 1].date)
  } else {
    return {
      endingBalance,
      avgDailyBalance: beginningBalance,
      dailyAvgDeposit: 0,
      nsfs: 0,
      negativeDays: 0,
      monthsOfStatements: 1,
    }
  }

  const msPerDay = 1000 * 60 * 60 * 24
  calendarDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1)
  const monthsOfStatements = Math.max(1, Math.round(calendarDays / 30))

  // Daily avg deposit = total deposits / calendar days
  const dailyAvgDeposit = totalDeposits / calendarDays

  // Count NSFs
  const nsfs = countNSFs(transactions)

  // Calculate running daily balance
  const { avgDailyBalance, negativeDays } = calculateDailyBalances(
    transactions, beginningBalance, startDate, endDate
  )

  return {
    endingBalance,
    avgDailyBalance,
    dailyAvgDeposit,
    nsfs,
    negativeDays,
    monthsOfStatements,
  }
}

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

// POST /api/deals/extract-metadata - Extract metadata from PDFs using Claude AI
router.post('/extract-metadata', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' })
      return
    }

    console.log(`[Extract Metadata] Processing ${files.length} file(s)`)

    const pdfTexts: string[] = []
    for (const file of files) {
      console.log(`[Extract Metadata] Extracting text from: ${file.originalname}`)
      const text = await extractPdfText(file.buffer)
      if (text) {
        pdfTexts.push(text)
      }
    }

    if (pdfTexts.length === 0) {
      res.json({
        metadata: { businessName: null, ownerName: null, amountRequested: null, industry: null, broker: null },
        message: 'No text could be extracted from the uploaded PDFs',
      })
      return
    }

    const claude = getClaudeService()
    const metadata = await claude.extractDealMetadata(pdfTexts)
    console.log('[Extract Metadata] Result:', JSON.stringify(metadata))

    res.json({ metadata })
  } catch (error: any) {
    console.error('[Extract Metadata] Error:', error)

    if (error.message?.includes('API key') || error.message?.includes('ANTHROPIC_API_KEY')) {
      res.json({
        metadata: { businessName: null, ownerName: null, amountRequested: null, industry: null, broker: null },
        message: 'Claude AI is not configured. Fields must be filled manually.',
      })
      return
    }

    // Handle rate limit errors gracefully - don't fail the upload
    if (error.status === 429 || error.message?.includes('rate_limit') || error.message?.includes('Rate limit')) {
      console.warn('[Extract Metadata] Rate limited by Claude API, returning null metadata')
      res.json({
        metadata: { businessName: null, ownerName: null, amountRequested: null, industry: null, broker: null },
        message: 'AI is temporarily rate-limited. Fields can be filled manually or will be extracted on next attempt.',
      })
      return
    }

    res.status(500).json({ error: error.message || 'Failed to extract metadata' })
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
      // Clear AI summary so it can be regenerated with new data
      aiSummary: null,
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
            console.log(`[DEBUG RAW KONCILE] General Fields:`, JSON.stringify(dataToParseFrom.General_fields, null, 2))
            console.log(`[DEBUG RAW KONCILE] Line Fields keys:`, Object.keys(dataToParseFrom.Line_fields || {}))
            const sampleLineFields = dataToParseFrom.Line_fields || {}
            for (const [key, val] of Object.entries(sampleLineFields)) {
              const arr = Array.isArray(val) ? val : (val as any)?.values || []
              console.log(`[DEBUG RAW KONCILE] Line field "${key}": ${arr.length} items, sample:`, JSON.stringify(arr.slice(0, 3)))
            }

            const parsed = koncile.parseExtractionResult(dataToParseFrom)
            console.log(`[Extraction Poll] Parsed ${parsed.transactions.length} transactions for account ${account.id}`)
            console.log(`[DEBUG PARSED] bankData:`, JSON.stringify(parsed.bankData, null, 2))
            if (parsed.transactions.length > 0) {
              console.log(`[DEBUG PARSED] First 3 transactions:`, JSON.stringify(parsed.transactions.slice(0, 3), null, 2))
              console.log(`[DEBUG PARSED] Last 3 transactions:`, JSON.stringify(parsed.transactions.slice(-3), null, 2))
            }

            // Extract account info from parsed data (using Koncile General Fields)
            const generalFields = parsed.raw?.generalFields || {}
            const accountNumber = generalFields['Account Number']?.value ||
                                generalFields['Account number']?.value ||
                                generalFields['account_number']?.value || ''
            const bankName = generalFields['Bank Name']?.value ||
                           generalFields['Bank name']?.value ||
                           generalFields['bank_name']?.value || null

            // Parse statement period for proper date range calculations
            const statementPeriod = parseStatementPeriod(parsed.statementPeriod)
            console.log(`[Extraction] Statement period: ${parsed.statementPeriod}`, statementPeriod)

            // Calculate all derived bank metrics
            const metrics = calculateBankMetrics(
              parsed.transactions,
              parsed.bankData.beginningBalance,
              statementPeriod
            )

            console.log(`[Extraction] Account number extracted: ${accountNumber}, Bank: ${bankName}`)
            console.log(`[Extraction] Metrics:`, JSON.stringify(metrics))

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
                endingBalance: metrics.endingBalance,
                beginningBalance: parsed.bankData.beginningBalance,
                avgDailyBalance: Math.round(metrics.avgDailyBalance * 100) / 100,
                dailyAvgDeposit: Math.round(metrics.dailyAvgDeposit * 100) / 100,
                nsfs: metrics.nsfs,
                negativeDays: metrics.negativeDays,
                monthsOfStatements: metrics.monthsOfStatements,
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

      // Merge accounts with same account number and detect internal transfers if all are done
      const allDone = updatedAccounts.every(acc => acc.extractionStatus === 'done')
      if (allDone && updatedAccounts.length > 1) {
        // First merge accounts that have the same account number (multiple statements)
        console.log('[Account Merge] All accounts processed, checking for same-account statements to merge...')
        updatedAccounts = mergeAccountsByNumber(updatedAccounts)

        // Then detect internal transfers between different accounts
        if (updatedAccounts.length > 1) {
          console.log('[Internal Transfer Detection] Detecting internal transfers between accounts...')
          updatedAccounts = detectInternalTransfers(updatedAccounts)
        }
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

        // Calculate all derived metrics
        const legacyStatementPeriod = parseStatementPeriod(parsed.statementPeriod)
        const legacyMetrics = calculateBankMetrics(
          parsed.transactions,
          parsed.bankData.beginningBalance,
          legacyStatementPeriod
        )

        const updatedDeal = await updateDeal(deal.id, {
          koncileDocumentId: result.document_id,
          extractionStatus: 'done',
          bankData: {
            totalDeposits: parsed.bankData.totalDeposits,
            totalWithdrawals: parsed.bankData.totalWithdrawals,
            endingBalance: legacyMetrics.endingBalance,
            beginningBalance: parsed.bankData.beginningBalance,
            avgDailyBalance: Math.round(legacyMetrics.avgDailyBalance * 100) / 100,
            dailyAvgDeposit: Math.round(legacyMetrics.dailyAvgDeposit * 100) / 100,
            nsfs: legacyMetrics.nsfs,
            negativeDays: legacyMetrics.negativeDays,
            monthsOfStatements: legacyMetrics.monthsOfStatements,
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

// Helper function to merge accounts with the same account number
function mergeAccountsByNumber(accounts: any[]): any[] {
  console.log(`[Account Merge] Starting merge check for ${accounts.length} accounts`)

  // Group accounts by account number (skip empty account numbers)
  const accountsByNumber: { [key: string]: any[] } = {}

  for (const account of accounts) {
    const accNum = account.accountNumber?.trim()
    if (!accNum) {
      // No account number - keep as separate account
      if (!accountsByNumber['__no_account_number__']) {
        accountsByNumber['__no_account_number__'] = []
      }
      accountsByNumber['__no_account_number__'].push(account)
      continue
    }

    // Normalize account number (last 4 digits for matching)
    const normalizedNum = accNum.slice(-4)
    if (!accountsByNumber[normalizedNum]) {
      accountsByNumber[normalizedNum] = []
    }
    accountsByNumber[normalizedNum].push(account)
  }

  const mergedAccounts: any[] = []

  for (const [accNum, accs] of Object.entries(accountsByNumber)) {
    if (accNum === '__no_account_number__' || accs.length === 1) {
      // No merging needed - add accounts as-is
      mergedAccounts.push(...accs)
      continue
    }

    console.log(`[Account Merge] Merging ${accs.length} statements for account ending in ${accNum}`)

    // Sort accounts by earliest transaction date to determine chronological order
    const sortedAccs = [...accs].sort((a, b) => {
      const aFirst = a.bankData?.transactions?.[0]?.date || ''
      const bFirst = b.bankData?.transactions?.[0]?.date || ''
      return parseDateForSort(aFirst) - parseDateForSort(bFirst)
    })

    const primaryAccount = sortedAccs[0] // Earliest statement
    const allTransactions: any[] = []

    // Log transaction counts from each account being merged
    for (const acc of sortedAccs) {
      console.log(`[Account Merge]   - Account ${acc.id}: ${acc.bankData?.transactions?.length || 0} transactions`)
    }

    // Use the earliest statement's beginning balance
    const beginningBalance = primaryAccount.bankData?.beginningBalance || 0

    // Collect statements from all accounts
    const statements: any[] = []

    for (const acc of sortedAccs) {
      if (acc.statements && acc.statements.length > 0) {
        statements.push(...acc.statements)
      } else {
        statements.push({
          id: acc.id,
          pdfFileName: acc.pdfFileName,
          pdfData: acc.pdfData,
          koncileTaskId: acc.koncileTaskId,
          koncileDocumentId: acc.koncileDocumentId,
          extractionStatus: acc.extractionStatus,
        })
      }

      if (acc.bankData?.transactions) {
        allTransactions.push(...acc.bankData.transactions)
      }
    }

    // Sort transactions by date
    allTransactions.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date))

    // Remove duplicate transactions (same date, amount, and description)
    const uniqueTransactions = allTransactions.filter((txn, index, self) =>
      index === self.findIndex(t =>
        t.date === txn.date &&
        t.amount === txn.amount &&
        t.description === txn.description
      )
    )

    console.log(`[Account Merge] Combined ${allTransactions.length} transactions, ${allTransactions.length - uniqueTransactions.length} duplicates removed, ${uniqueTransactions.length} unique`)

    // Calculate totals from unique transactions (deposits positive, withdrawals negative)
    const totalDeposits = uniqueTransactions
      .filter((t: any) => t.amount > 0)
      .reduce((sum: number, t: any) => sum + t.amount, 0)
    const totalWithdrawals = uniqueTransactions
      .filter((t: any) => t.amount < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)

    // Sum actual monthsOfStatements from individual accounts (not from transaction date range)
    const actualMonths = sortedAccs.reduce((sum, acc) => sum + (acc.bankData?.monthsOfStatements || 1), 0)
    const actualCalendarDays = actualMonths * 30

    // Calculate derived metrics from merged data
    const metrics = calculateBankMetrics(uniqueTransactions, beginningBalance, null)

    // Override monthsOfStatements and dailyAvgDeposit with correct values
    const correctedMonths = actualMonths
    const correctedDailyAvgDeposit = actualCalendarDays > 0
      ? totalDeposits / actualCalendarDays
      : metrics.dailyAvgDeposit

    console.log(`[Account Merge] monthsOfStatements: transaction-derived=${metrics.monthsOfStatements}, actual sum=${correctedMonths}`)

    // Create merged account
    const mergedAccount = {
      id: primaryAccount.id,
      accountNumber: primaryAccount.accountNumber,
      accountName: primaryAccount.accountName,
      bankName: primaryAccount.bankName,
      pdfFileName: primaryAccount.pdfFileName,
      pdfData: primaryAccount.pdfData,
      koncileTaskId: primaryAccount.koncileTaskId,
      koncileDocumentId: primaryAccount.koncileDocumentId,
      extractionStatus: 'done' as const,
      statements: statements,
      bankData: {
        totalDeposits,
        totalWithdrawals,
        endingBalance: metrics.endingBalance,
        beginningBalance: beginningBalance,
        avgDailyBalance: Math.round(metrics.avgDailyBalance * 100) / 100,
        dailyAvgDeposit: Math.round(correctedDailyAvgDeposit * 100) / 100,
        nsfs: metrics.nsfs,
        negativeDays: metrics.negativeDays,
        monthsOfStatements: correctedMonths,
        transactions: uniqueTransactions,
      },
      internalTransfers: [],
    }

    console.log(`[Account Merge] Merged into single account with ${uniqueTransactions.length} unique transactions across ${statements.length} statements`)
    mergedAccounts.push(mergedAccount)
  }

  console.log(`[Account Merge] Final account count: ${mergedAccounts.length} (was ${accounts.length})`)
  return mergedAccounts
}

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

    // Collect all transactions from all bank accounts
    let allTransactions: any[] = []
    let aggregatedBankData = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      endingBalance: 0,
      avgDailyBalance: 0,
      nsfs: 0,
      negativeDays: 0,
    }

    console.log(`[Chat] Deal ${deal.id} has ${deal.bankAccounts?.length || 0} bank accounts`)

    if (deal.bankAccounts && deal.bankAccounts.length > 0) {
      for (const account of deal.bankAccounts) {
        console.log(`[Chat] Account ${account.accountName}: ${account.bankData?.transactions?.length || 0} transactions, status: ${account.extractionStatus}`)
        if (account.statements && account.statements.length > 0) {
          console.log(`[Chat]   - Has ${account.statements.length} merged statements`)
        }

        if (account.bankData) {
          // Aggregate bank data
          aggregatedBankData.totalDeposits += account.bankData.totalDeposits || 0
          aggregatedBankData.totalWithdrawals += account.bankData.totalWithdrawals || 0
          aggregatedBankData.endingBalance += account.bankData.endingBalance || 0
          aggregatedBankData.avgDailyBalance += account.bankData.avgDailyBalance || 0
          aggregatedBankData.nsfs += account.bankData.nsfs || 0
          aggregatedBankData.negativeDays += account.bankData.negativeDays || 0

          // Collect transactions with account info
          if (account.bankData.transactions && account.bankData.transactions.length > 0) {
            const accountTransactions = account.bankData.transactions.map((txn: any) => ({
              ...txn,
              accountName: account.accountName || 'Unknown Account',
            }))
            allTransactions.push(...accountTransactions)
          }
        }
      }

      // Sort transactions by date (handle DD/MM/YYYY format from Koncile)
      allTransactions.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date))
    } else if (deal.bankData) {
      // Legacy single account support
      aggregatedBankData = {
        totalDeposits: deal.bankData.totalDeposits || 0,
        totalWithdrawals: deal.bankData.totalWithdrawals || 0,
        endingBalance: deal.bankData.endingBalance || 0,
        avgDailyBalance: deal.bankData.avgDailyBalance || 0,
        nsfs: deal.bankData.nsfs || 0,
        negativeDays: deal.bankData.negativeDays || 0,
      }
      if (deal.bankData.transactions) {
        allTransactions = deal.bankData.transactions
      }
    }

    // Log transaction summary
    console.log(`[Chat] Total transactions collected: ${allTransactions.length}`)
    if (allTransactions.length > 0) {
      console.log(`[Chat] Date range: ${allTransactions[0]?.date} to ${allTransactions[allTransactions.length - 1]?.date}`)
    }

    // Extract raw PDF text from all statements for complete context
    const rawPdfTexts: string[] = []
    if (deal.bankAccounts && deal.bankAccounts.length > 0) {
      for (const account of deal.bankAccounts) {
        // Check if account has merged statements
        if (account.statements && account.statements.length > 0) {
          for (const stmt of account.statements) {
            if (stmt.pdfData) {
              console.log(`[Chat] Extracting text from statement: ${stmt.pdfFileName}`)
              const text = await extractPdfTextFromBase64(stmt.pdfData)
              if (text) {
                rawPdfTexts.push(text)
              }
            }
          }
        } else if (account.pdfData) {
          // Single PDF per account (not merged)
          console.log(`[Chat] Extracting text from account PDF: ${account.pdfFileName}`)
          const text = await extractPdfTextFromBase64(account.pdfData)
          if (text) {
            rawPdfTexts.push(text)
          }
        }
      }
    }
    console.log(`[Chat] Extracted text from ${rawPdfTexts.length} PDFs`)

    const response = await claude.chat(
      {
        businessName: deal.businessName,
        ownerName: deal.ownerName,
        amountRequested: deal.amountRequested,
        industry: deal.industry,
        bankData: aggregatedBankData,
        existingPositions: deal.existingPositions,
        transactions: allTransactions,
        aiSummary: deal.aiSummary,
        rawPdfText: rawPdfTexts,
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

    // Collect all transactions from all bank accounts (same logic as chat)
    let allTransactions: any[] = []
    let aggregatedBankData = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      endingBalance: 0,
      avgDailyBalance: 0,
      nsfs: 0,
      negativeDays: 0,
    }

    if (deal.bankAccounts && deal.bankAccounts.length > 0) {
      for (const account of deal.bankAccounts) {
        if (account.bankData) {
          aggregatedBankData.totalDeposits += account.bankData.totalDeposits || 0
          aggregatedBankData.totalWithdrawals += account.bankData.totalWithdrawals || 0
          aggregatedBankData.endingBalance += account.bankData.endingBalance || 0
          aggregatedBankData.avgDailyBalance += account.bankData.avgDailyBalance || 0
          aggregatedBankData.nsfs += account.bankData.nsfs || 0
          aggregatedBankData.negativeDays += account.bankData.negativeDays || 0

          if (account.bankData.transactions && account.bankData.transactions.length > 0) {
            const accountTransactions = account.bankData.transactions.map((txn: any) => ({
              ...txn,
              accountName: account.accountName || 'Unknown Account',
            }))
            allTransactions.push(...accountTransactions)
          }
        }
      }
      allTransactions.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date))
    } else if (deal.bankData) {
      aggregatedBankData = {
        totalDeposits: deal.bankData.totalDeposits || 0,
        totalWithdrawals: deal.bankData.totalWithdrawals || 0,
        endingBalance: deal.bankData.endingBalance || 0,
        avgDailyBalance: deal.bankData.avgDailyBalance || 0,
        nsfs: deal.bankData.nsfs || 0,
        negativeDays: deal.bankData.negativeDays || 0,
      }
      if (deal.bankData.transactions) {
        allTransactions = deal.bankData.transactions
      }
    }

    const summary = await claude.generateSummary({
      businessName: deal.businessName,
      ownerName: deal.ownerName,
      amountRequested: deal.amountRequested,
      industry: deal.industry,
      bankData: aggregatedBankData,
      existingPositions: deal.existingPositions,
      transactions: allTransactions,
    })

    const updatedDeal = await updateDeal(deal.id, { aiSummary: summary })

    res.json({ summary, deal: updatedDeal })
  } catch (error: any) {
    console.error('Summary generation error:', error)
    res.status(500).json({ error: error.message || 'Failed to generate summary' })
  }
})

// POST /api/deals/:id/analyze - Run Claude AI analysis on extracted data
router.post('/:id/analyze', async (req: Request, res: Response) => {
  try {
    const deal = await getDeal(req.params.id)

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' })
      return
    }

    const claude = getClaudeService()

    // Aggregate all transactions and bank data from all accounts
    let allTransactions: any[] = []
    let beginningBalance = 0
    let actualMonthsOfStatements = 0
    const statementPeriods: string[] = []

    if (deal.bankAccounts && deal.bankAccounts.length > 0) {
      for (const account of deal.bankAccounts) {
        if (account.bankData) {
          if (account.bankData.transactions && account.bankData.transactions.length > 0) {
            allTransactions.push(...account.bankData.transactions)
          }
          // Use earliest account's beginning balance
          if (beginningBalance === 0 && account.bankData.beginningBalance) {
            beginningBalance = account.bankData.beginningBalance
          }
          // Track max monthsOfStatements from Koncile extraction
          if (account.bankData.monthsOfStatements > actualMonthsOfStatements) {
            actualMonthsOfStatements = account.bankData.monthsOfStatements
          }
        }
      }
      allTransactions.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date))
    } else if (deal.bankData) {
      if (deal.bankData.transactions) {
        allTransactions = deal.bankData.transactions
      }
      beginningBalance = deal.bankData.beginningBalance || 0
      actualMonthsOfStatements = deal.bankData.monthsOfStatements || 1
    }

    if (allTransactions.length === 0) {
      res.status(400).json({ error: 'No transaction data available for analysis. Upload and extract bank statements first.' })
      return
    }

    console.log(`[Analyze] Running Claude analysis on ${allTransactions.length} transactions for deal ${deal.id}`)

    const analysis = await claude.analyzeExtractedData({
      businessName: deal.businessName,
      ownerName: deal.ownerName,
      amountRequested: deal.amountRequested,
      industry: deal.industry,
      beginningBalance,
      statementPeriods,
      transactions: allTransactions.map(t => ({
        date: t.date,
        type: t.type,
        amount: t.amount,
        description: t.description || '',
      })),
    })

    // Override monthsOfStatements with actual value from extraction
    if (actualMonthsOfStatements > 0 && analysis.monthsOfStatements !== actualMonthsOfStatements) {
      console.log(`[Analyze] Overriding monthsOfStatements: Claude=${analysis.monthsOfStatements}, actual=${actualMonthsOfStatements}`)
      analysis.monthsOfStatements = actualMonthsOfStatements
    }

    // Store analysis in DB with timestamp
    const aiAnalysis = {
      ...analysis,
      analyzedAt: new Date().toISOString(),
    }

    const updatedDeal = await updateDeal(deal.id, {
      aiAnalysis,
      // Also set aiSummary for backward compatibility
      aiSummary: analysis.dealSummary,
    })

    console.log(`[Analyze] Analysis complete. Risk: ${analysis.risk.level}, MCA positions: ${analysis.mcaPositions.length}`)

    res.json({ analysis: aiAnalysis, deal: updatedDeal })
  } catch (error: any) {
    console.error('[Analyze] Error:', error)

    if (error.message?.includes('API key') || error.message?.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: 'Claude AI is not configured. Please add your Anthropic API key.' })
      return
    }

    res.status(500).json({ error: error.message || 'Failed to run analysis' })
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

// GET /api/deals/:id/pdf/:accountId - Serve specific account's or statement's PDF file
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

    const requestedId = req.params.accountId
    let pdfData: string | null = null
    let pdfFileName: string | null = null

    // First, try to find as account ID
    const account = deal.bankAccounts.find(acc => acc.id === requestedId)

    if (account && account.pdfData) {
      pdfData = account.pdfData
      pdfFileName = account.pdfFileName || 'statement.pdf'
    } else {
      // Not found as account, search within statements (for merged accounts)
      for (const acc of deal.bankAccounts) {
        if (acc.statements && acc.statements.length > 0) {
          const statement = acc.statements.find((stmt: any) => stmt.id === requestedId)
          if (statement && statement.pdfData) {
            pdfData = statement.pdfData
            pdfFileName = statement.pdfFileName || 'statement.pdf'
            break
          }
        }
      }
    }

    if (!pdfData) {
      res.status(404).json({ error: 'PDF file not found' })
      return
    }

    // Convert base64 back to buffer
    const pdfBuffer = Buffer.from(pdfData, 'base64')

    // Set headers for PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`)
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
