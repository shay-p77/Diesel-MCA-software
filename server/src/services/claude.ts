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
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
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

YOUR ROLE:
- Answer questions about this specific deal
- Provide risk analysis based on the extracted data
- Help the underwriter make informed decisions
- Be concise and specific - reference actual numbers from the data
- Flag any concerns or red flags you notice
- When asked for recommendations, be direct

Remember: The underwriter can see the same extracted data, so your analysis should focus on insights and interpretation, not just repeating numbers.`
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
