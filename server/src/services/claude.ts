import Anthropic from '@anthropic-ai/sdk'

interface DealContext {
  businessName: string
  ownerName: string
  amountRequested: number
  industry: string
  bankData: {
    totalDeposits: number
    totalWithdrawals: number
    endingBalance: number
    avgDailyBalance?: number
    nsfs?: number
    negativeDays?: number
  }
  existingPositions: Array<{
    lender: string
    payment: number
    frequency: string
    estimatedBalance: number
  }>
  transactions?: Array<{
    date: string
    type: string
    amount: number
    description?: string
  }>
  aiSummary?: string | null
  rawPdfText?: string[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AnalysisInput {
  businessName: string
  ownerName: string
  amountRequested: number
  industry: string
  beginningBalance: number
  statementPeriods: string[] // e.g. "01/04/2025 through 30/04/2025"
  transactions: Array<{
    date: string
    type: string
    amount: number
    description: string
  }>
}

export interface AIAnalysisResult {
  monthlyRevenues: Array<{ month: string; deposits: number; withdrawals: number; net: number }>
  avgMonthlyIncome: number
  avgMonthlyWithdrawals: number
  avgMonthlyNet: number
  annualIncome: number
  nsfs: number
  negativeDays: number
  avgDailyBalance: number
  avgDailyDeposit: number
  risk: { level: 'low' | 'moderate' | 'high'; score: number; factors: string[] }
  mcaPositions: Array<{
    lender: string
    payment: number
    frequency: 'Daily' | 'Weekly' | 'Monthly'
    estimatedBalance: number
    reasoning: string
  }>
  existingDailyObligation: number
  existingMonthlyPayments: number
  insights: string[]
  dealSummary: string
  monthsOfStatements: number
  totalTransactions: number
}

export interface ExtractedDealMetadata {
  businessName: string | null
  ownerName: string | null
  amountRequested: number | null
  industry: string | null
  broker: string | null
}

export class ClaudeService {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  /**
   * Generate a system prompt with deal context
   */
  private buildSystemPrompt(deal: DealContext): string {
    const dailyObligation = deal.existingPositions
      .filter(p => p.frequency === 'Daily')
      .reduce((sum, p) => sum + p.payment, 0)

    return `You are an expert MCA (Merchant Cash Advance) underwriting assistant. You have access to bank statement data that has been extracted and verified by Koncile.

CURRENT DEAL CONTEXT:
- Business: ${deal.businessName}
- Owner: ${deal.ownerName}
- Industry: ${deal.industry}
- Amount Requested: $${deal.amountRequested.toLocaleString()}

BANK STATEMENT DATA (from Koncile extraction):
- Total Deposits: $${deal.bankData.totalDeposits.toLocaleString()}
- Total Withdrawals: $${deal.bankData.totalWithdrawals.toLocaleString()}
- Ending Balance: $${deal.bankData.endingBalance.toLocaleString()}
${deal.bankData.avgDailyBalance ? `- Avg Daily Balance: $${deal.bankData.avgDailyBalance.toLocaleString()}` : ''}
${deal.bankData.nsfs !== undefined ? `- NSFs: ${deal.bankData.nsfs}` : ''}
${deal.bankData.negativeDays !== undefined ? `- Negative Days: ${deal.bankData.negativeDays}` : ''}

EXISTING POSITIONS (${deal.existingPositions.length} detected):
${deal.existingPositions.length > 0
  ? deal.existingPositions.map(p => `- ${p.lender}: $${p.payment}/${p.frequency} (Est. Balance: $${p.estimatedBalance.toLocaleString()})`).join('\n')
  : '- No existing positions detected'}
${dailyObligation > 0 ? `\nTotal Daily Obligation: $${dailyObligation}/day` : ''}

TRANSACTION DATA (Koncile extracted):
${this.formatTransactions(deal.transactions)}
${deal.aiSummary ? `
PREVIOUS AI ANALYSIS:
${deal.aiSummary}
` : ''}
RAW BANK STATEMENT TEXT:
${this.formatRawPdfText(deal.rawPdfText)}

YOUR ROLE:
- Answer questions about this specific deal
- Provide risk analysis based on the extracted data
- Help the underwriter make informed decisions
- Be concise and specific - reference actual numbers from the data
- Flag any concerns or red flags you notice
- When asked for recommendations, be direct
- You have access to detailed transaction-level data - use it to answer specific questions about deposits, withdrawals, patterns, and individual transactions

Remember: The underwriter can see the same extracted data, so your analysis should focus on insights and interpretation, not just repeating numbers.`
  }

  /**
   * Format raw PDF text for the prompt
   */
  private formatRawPdfText(pdfTexts?: string[]): string {
    if (!pdfTexts || pdfTexts.length === 0) {
      return 'No raw PDF text available'
    }

    let output = ''
    for (let i = 0; i < pdfTexts.length; i++) {
      const text = pdfTexts[i]
      // Truncate each PDF text to avoid token limits (keep first 8000 chars per statement)
      const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '\n... [truncated]' : text
      output += `\n--- Statement ${i + 1} ---\n${truncatedText}\n`
    }

    return output
  }

  /**
   * Format transactions for the prompt
   */
  private formatTransactions(transactions?: DealContext['transactions']): string {
    if (!transactions || transactions.length === 0) {
      return 'No transaction data available'
    }

    // Limit to most recent 100 transactions to avoid token limits
    const recentTransactions = transactions.slice(-100)
    const hasMoreTransactions = transactions.length > 100

    let output = `Total transactions: ${transactions.length}${hasMoreTransactions ? ' (showing most recent 100)' : ''}\n\n`

    // Group transactions by type for summary
    const deposits = transactions.filter(t => t.amount > 0)
    const withdrawals = transactions.filter(t => t.amount < 0)

    output += `Summary:\n`
    output += `- Total deposits: ${deposits.length} transactions totaling $${deposits.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}\n`
    output += `- Total withdrawals: ${withdrawals.length} transactions totaling $${Math.abs(withdrawals.reduce((sum, t) => sum + t.amount, 0)).toLocaleString()}\n\n`

    output += `Recent Transactions:\n`
    output += `Date | Type | Amount | Description\n`
    output += `-----|------|--------|------------\n`

    for (const txn of recentTransactions) {
      const amount = txn.amount >= 0 ? `+$${txn.amount.toLocaleString()}` : `-$${Math.abs(txn.amount).toLocaleString()}`
      const desc = txn.description ? txn.description.substring(0, 50) : 'N/A'
      output += `${txn.date} | ${txn.type} | ${amount} | ${desc}\n`
    }

    return output
  }

  /**
   * Chat with Claude about a deal
   */
  async chat(
    deal: DealContext,
    userMessage: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(deal)

    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    // Extract text from response
    const textContent = response.content.find(block => block.type === 'text')
    return textContent?.type === 'text' ? textContent.text : ''
  }

  /**
   * Generate an AI summary for a deal
   */
  async generateSummary(deal: DealContext): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(deal)

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Provide a brief 2-3 sentence summary of this deal for the dashboard. Focus on the key metrics and any immediate red flags or positive indicators. Be concise.',
        },
      ],
    })

    const textContent = response.content.find(block => block.type === 'text')
    return textContent?.type === 'text' ? textContent.text : ''
  }

  /**
   * Generate risk assessment
   */
  async generateRiskAssessment(deal: DealContext): Promise<{
    level: 'low' | 'moderate' | 'high'
    score: number
    factors: string[]
  }> {
    const systemPrompt = this.buildSystemPrompt(deal)

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze the risk of this deal and respond in this exact JSON format:
{
  "level": "low" | "moderate" | "high",
  "score": <number 1-10, where 10 is highest risk>,
  "factors": ["factor 1", "factor 2", ...]
}

Consider: existing positions, NSFs, negative days, cash flow patterns, and amount requested vs daily deposits.`,
        },
      ],
    })

    const textContent = response.content.find(block => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : '{}'

    try {
      // Extract JSON from response (it might have markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('Failed to parse risk assessment:', e)
    }

    // Default response if parsing fails
    return {
      level: 'moderate',
      score: 5,
      factors: ['Unable to assess - please review manually'],
    }
  }
  /**
   * Analyze all extracted bank data and produce comprehensive underwriting analysis.
   * This is the main analysis method - Claude reads ALL transactions and computes everything.
   */
  async analyzeExtractedData(input: AnalysisInput): Promise<AIAnalysisResult> {
    // Format transactions as compact CSV to send ALL data (not truncated)
    let txnCsv = 'date,type,amount,description\n'
    for (const t of input.transactions) {
      const desc = (t.description || '').replace(/,/g, ';').replace(/\n/g, ' ')
      txnCsv += `${t.date},${t.type},${t.amount},${desc}\n`
    }

    const systemPrompt = `You are an expert MCA (Merchant Cash Advance) underwriting analyst. You will be given ALL bank statement transactions for a business. Your job is to analyze this data and produce a comprehensive structured JSON analysis.

DEAL INFO:
- Business: ${input.businessName}
- Owner: ${input.ownerName}
- Industry: ${input.industry}
- Amount Requested: $${input.amountRequested.toLocaleString()}
- Beginning Balance: $${input.beginningBalance.toLocaleString()}
- Statement Periods: ${input.statementPeriods.join(', ') || 'Not specified'}

ANALYSIS INSTRUCTIONS:

1. **Monthly Revenue Breakdown**: Group transactions by month (YYYY-MM). For each month compute total deposits (positive amounts), total withdrawals (absolute value of negative amounts), and net (deposits - withdrawals).

2. **Averages**: Compute avgMonthlyIncome (average of monthly deposits), avgMonthlyWithdrawals (average of monthly withdrawal totals), avgMonthlyNet (average of monthly net), annualIncome (avgMonthlyIncome * 12).

3. **NSF Detection**: Count transactions where the description contains any of these keywords (case-insensitive): "NSF", "NON-SUFFICIENT", "INSUFFICIENT FUNDS", "RETURNED ITEM", "OVERDRAFT", "OD FEE", "RETURNED CHECK". Report the count.

4. **Daily Balance Simulation**: Starting from the beginning balance, walk through transactions day by day in chronological order. Track the running balance. Compute:
   - avgDailyBalance: average of end-of-day balances across all days in the statement period
   - negativeDays: number of days where the end-of-day balance was below zero

5. **Average Daily Deposit**: total deposits / number of calendar days in the statement period.

6. **MCA POSITION DETECTION** — This is CRITICAL. Scan ALL transaction descriptions for existing MCA (Merchant Cash Advance) positions. MCAs withdraw fixed amounts on a regular schedule (daily or weekly). Here is how to detect them:

   **Known MCA Lender Names** (look for these in transaction descriptions):
   - Funder names: Libertas, Yellowstone, Pearl Capital, Fox Capital, Credibly, Rapid Finance, Capytal, Kalamata, Samson, Forward, Unique, Greenbox, BFS Capital, Mantis, Vox, Everest, Velocity, TVP, Clear Balance, Kinetic, Forward Financing, QFS Capital, Mulligan Funding, OnDeck, CAN Capital, Kabbage, BlueVine, Fundbox, National Funding, United Capital Source, Lendr, Funding Circle, Celtic, ACH.com, Bizfi, Strategic Funding, PayPal Working Capital, Amazon Lending, Square Capital, Shopify Capital, Toast Capital
   - ISO/Broker names appearing as ACH originators

   **MCA Transaction Patterns**:
   - SAME exact dollar amount withdrawn repeatedly (daily M-F, or weekly)
   - Usually via ACH debit or electronic withdrawal
   - Description often contains: "ACH DEBIT", "ELECTRONIC PMT", "ACH PMT", "LOAN PMT", "MCA", "ADVANCE", "PURCHASE", "DEBIT"
   - Amount typically between $50-$5,000 per day
   - Pattern: 4-5 withdrawals per week of the same amount = Daily MCA
   - Pattern: 1 withdrawal per week of the same amount = Weekly MCA
   - Pattern: 1 withdrawal per month of the same amount = Monthly loan or MCA

   **How to confirm an MCA position**:
   a. Find recurring same-amount withdrawals
   b. Check if the description matches known lender names OR contains ACH/electronic payment keywords
   c. Verify the frequency (count occurrences: ~20/month = daily, ~4/month = weekly, ~1/month = monthly)
   d. Estimate remaining balance: payment × remaining term (if unknown, use payment × 60 for daily, payment × 26 for weekly)

   For each detected position, provide: lender name (from description), payment amount (positive number), frequency, estimated remaining balance, and reasoning explaining why you flagged it.

7. **Existing Obligations**: Sum up the daily obligation from all detected MCA positions (daily payment + weekly/5 + monthly/22). Also compute total monthly payments (daily×22 + weekly×4.33 + monthly).

8. **Risk Assessment**: Rate the deal as low/moderate/high risk with a score 1-10 and list specific factors. Consider:
   - NSF count (>3 is concerning, >8 is high risk)
   - Negative balance days (>5 is concerning)
   - Existing MCA stacking (multiple positions = higher risk)
   - Revenue trends (declining months = risk)
   - Amount requested vs monthly income ratio
   - Existing daily obligation vs daily deposits ratio

9. **Key Insights**: Provide 3-6 bullet-point insights an underwriter would want to know. Focus on red flags, positive indicators, and patterns.

10. **Deal Summary**: 2-3 sentence summary of the deal for the dashboard.

RESPOND WITH ONLY A VALID JSON OBJECT in this exact structure (no markdown, no explanation, just JSON):
{
  "monthlyRevenues": [{"month": "YYYY-MM", "deposits": number, "withdrawals": number, "net": number}],
  "avgMonthlyIncome": number,
  "avgMonthlyWithdrawals": number,
  "avgMonthlyNet": number,
  "annualIncome": number,
  "nsfs": number,
  "negativeDays": number,
  "avgDailyBalance": number,
  "avgDailyDeposit": number,
  "risk": {"level": "low|moderate|high", "score": 1-10, "factors": ["..."]},
  "mcaPositions": [{"lender": "...", "payment": number, "frequency": "Daily|Weekly|Monthly", "estimatedBalance": number, "reasoning": "..."}],
  "existingDailyObligation": number,
  "existingMonthlyPayments": number,
  "insights": ["..."],
  "dealSummary": "...",
  "monthsOfStatements": number,
  "totalTransactions": number
}`

    console.log(`[Claude Analysis] Sending ${input.transactions.length} transactions for analysis...`)

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here are ALL ${input.transactions.length} bank transactions to analyze:\n\n${txnCsv}`,
        },
      ],
    })

    const textContent = response.content.find(block => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : '{}'

    console.log(`[Claude Analysis] Response length: ${text.length} chars`)

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as AIAnalysisResult

        // Validation: override NSF count with deterministic keyword count
        const deterministicNSFs = this.countNSFsDeterministic(input.transactions)
        if (parsed.nsfs !== deterministicNSFs) {
          console.log(`[Claude Analysis] NSF count mismatch: Claude=${parsed.nsfs}, deterministic=${deterministicNSFs}. Using deterministic count.`)
          parsed.nsfs = deterministicNSFs
        }

        // Validation: log deposit total discrepancy
        const rawDepositTotal = input.transactions
          .filter(t => t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0)
        const claudeDepositTotal = parsed.monthlyRevenues.reduce((sum, m) => sum + m.deposits, 0)
        if (rawDepositTotal > 0 && Math.abs(claudeDepositTotal - rawDepositTotal) / rawDepositTotal > 0.05) {
          console.log(`[Claude Analysis] Deposit total discrepancy >5%: Claude=$${claudeDepositTotal.toFixed(2)}, raw=$${rawDepositTotal.toFixed(2)}`)
        }

        // Validation: log transaction count
        if (parsed.totalTransactions !== input.transactions.length) {
          console.log(`[Claude Analysis] Transaction count mismatch: Claude=${parsed.totalTransactions}, actual=${input.transactions.length}. Using actual count.`)
          parsed.totalTransactions = input.transactions.length
        }

        return parsed
      }
    } catch (e) {
      console.error('[Claude Analysis] Failed to parse analysis response:', e)
      console.error('[Claude Analysis] Raw response:', text.substring(0, 500))
    }

    throw new Error('Failed to parse Claude analysis response')
  }

  /**
   * Deterministic NSF count by keyword matching (more reliable than LLM counting)
   */
  private countNSFsDeterministic(transactions: Array<{ description: string; amount: number }>): number {
    const nsfKeywords = [
      'nsf', 'non-sufficient', 'non sufficient', 'insufficient fund',
      'returned item', 'overdraft', 'od fee', 'od charge',
      'returned check', 'nsf fee', 'nsf charge'
    ]
    let count = 0
    for (const t of transactions) {
      const desc = (t.description || '').toLowerCase()
      if (nsfKeywords.some(kw => desc.includes(kw))) {
        count++
      }
    }
    return count
  }

  /**
   * Extract deal metadata from raw PDF text (bank statements, MCA applications)
   */
  async extractDealMetadata(pdfTexts: string[]): Promise<ExtractedDealMetadata> {
    const combinedText = pdfTexts
      .map((text, i) => `--- Document ${i + 1} ---\n${text.substring(0, 10000)}`)
      .join('\n\n')

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a document data extraction assistant for an MCA (Merchant Cash Advance) underwriting platform. Extract key metadata from uploaded documents (bank statements, MCA applications, business documents).

CRITICAL RULES:
- Extract ONLY values that are EXPLICITLY written in the document text provided.
- NEVER fabricate any value. If a field is not present in the text, return null.
- Do NOT infer owner names from business names. A person's name must appear explicitly in the text to be extracted.
- You MAY infer industry from the business name if it's obvious (e.g. "Big World Travel" -> "Travel", "Joe's Pizza" -> "Restaurant").
- For owner name on bank statements: look for individual names in the account holder section or transaction details (e.g. ACH entries with individual names). Only extract if a clear person's name is present.

Important context:
- Bank statements typically contain: account holder name (business name), bank name, account number, statement period, transactions
- Bank statements may contain owner names in transaction descriptions (ACH entries, etc.)
- MCA applications may contain: business name, owner name, amount requested, industry, broker/ISO name
- The "amountRequested" should be a number (no dollar signs or commas) representing the funding amount requested
- The "industry" should be a brief category like "Restaurant", "Retail", "Construction", "Auto Services", etc.

Respond with ONLY a valid JSON object in this exact format:
{
  "businessName": "string or null",
  "ownerName": "string or null",
  "amountRequested": number or null,
  "industry": "string or null",
  "broker": "string or null"
}`,
      messages: [
        {
          role: 'user',
          content: `Extract deal metadata from these uploaded documents:\n\n${combinedText}`,
        },
      ],
    })

    const textContent = response.content.find(block => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : '{}'

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          businessName: parsed.businessName || null,
          ownerName: parsed.ownerName || null,
          amountRequested: typeof parsed.amountRequested === 'number' ? parsed.amountRequested : null,
          industry: parsed.industry || null,
          broker: parsed.broker || null,
        }
      }
    } catch (e) {
      console.error('[Claude] Failed to parse metadata extraction response:', e)
    }

    return {
      businessName: null,
      ownerName: null,
      amountRequested: null,
      industry: null,
      broker: null,
    }
  }
}

// Create singleton instance
let claudeService: ClaudeService | null = null

export function getClaudeService(): ClaudeService {
  if (!claudeService) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
    claudeService = new ClaudeService(apiKey)
  }
  return claudeService
}
