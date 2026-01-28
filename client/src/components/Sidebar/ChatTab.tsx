import { useState } from 'react'
import { Deal, ChatMessage } from '../../types'
import './ChatTab.css'

interface ChatTabProps {
  deal: Deal
}

export default function ChatTab({ deal }: ChatTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `I've analyzed the bank statements for ${deal.businessName}. I can help you understand the financials, identify risks, or answer any questions about this deal. What would you like to know?`,
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    // Mock AI response
    const mockResponses: Record<string, string> = {
      'nsf': `Based on the bank statements, I found ${deal.bankData?.nsfs || 0} NSF fees. ${deal.bankData?.nsfs && deal.bankData.nsfs > 2 ? 'This is a concern as it indicates cash flow management issues.' : 'This is within acceptable range.'}`,
      'position': `I detected ${deal.existingPositions.length} existing MCA positions. ${deal.existingPositions.length > 2 ? 'High stacking - proceed with caution.' : deal.existingPositions.length > 0 ? 'Moderate stacking level.' : 'Clean - no existing positions.'}`,
      'deposit': `Average daily deposits are $${deal.bankData?.dailyAvgDeposit?.toLocaleString() || 'N/A'}. Total deposits for the period: $${deal.bankData?.totalDeposits?.toLocaleString() || 'N/A'}.`,
      'risk': `Key risk factors for this deal:\n${deal.bankData?.nsfs && deal.bankData.nsfs > 2 ? '- Multiple NSFs detected\n' : ''}${deal.existingPositions.length > 2 ? '- High position stacking\n' : ''}${deal.bankData?.negativeDays && deal.bankData.negativeDays > 0 ? '- Account went negative ' + deal.bankData.negativeDays + ' days\n' : ''}${deal.bankData?.nsfs === 0 && deal.existingPositions.length === 0 ? '- Low risk profile overall' : ''}`,
      'recommend': `Based on my analysis:\n\nAmount Requested: $${deal.amountRequested.toLocaleString()}\nDaily Deposits: $${deal.bankData?.dailyAvgDeposit?.toLocaleString() || 'N/A'}\nExisting Daily Obligation: $${deal.existingPositions.filter(p => p.frequency === 'Daily').reduce((s, p) => s + p.payment, 0).toLocaleString()}\n\n${deal.existingPositions.length > 3 || (deal.bankData?.nsfs || 0) > 4 ? 'Recommendation: DECLINE or reduce amount significantly.' : deal.existingPositions.length > 1 ? 'Recommendation: APPROVE with reduced amount and careful terms.' : 'Recommendation: Likely APPROVABLE pending final review.'}`
    }

    let aiResponse = "I'm analyzing the bank statements. In production, I would provide detailed insights based on your question. Try asking about: NSFs, positions, deposits, risks, or recommendations."

    const lowerInput = input.toLowerCase()
    if (lowerInput.includes('nsf')) aiResponse = mockResponses['nsf']
    else if (lowerInput.includes('position') || lowerInput.includes('stack')) aiResponse = mockResponses['position']
    else if (lowerInput.includes('deposit')) aiResponse = mockResponses['deposit']
    else if (lowerInput.includes('risk')) aiResponse = mockResponses['risk']
    else if (lowerInput.includes('recommend') || lowerInput.includes('approve') || lowerInput.includes('should')) aiResponse = mockResponses['recommend']

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    }

    setMessages([...messages, userMessage, assistantMessage])
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const suggestedQuestions = [
    "What are the risks?",
    "Any NSF issues?",
    "How many positions?",
    "Should I approve?"
  ]

  return (
    <div className="chat-tab">
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
      </div>

      {messages.length === 1 && (
        <div className="suggested-questions">
          {suggestedQuestions.map((q, i) => (
            <button key={i} onClick={() => setInput(q)} className="suggestion-btn">
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this deal..."
          rows={2}
        />
        <button onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
