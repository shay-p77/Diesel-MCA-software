import { useState, useRef, useEffect } from 'react'
import { Deal, ChatMessage } from '../../types'
import { api } from '../../services/api'
import './ChatTab.css'

interface ChatTabProps {
  deal: Deal
}

export default function ChatTab({ deal }: ChatTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load chat history from deal or initialize with welcome message
  useEffect(() => {
    if (deal.chatHistory && deal.chatHistory.length > 0) {
      setMessages(deal.chatHistory)
    } else {
      const hasData = deal.bankData && deal.extractionStatus === 'done'
      const welcomeMessage: ChatMessage = {
        id: '1',
        role: 'assistant',
        content: hasData
          ? `I've analyzed the bank statements for ${deal.businessName}. I can help you understand the financials, identify risks, or answer any questions about this deal. What would you like to know?`
          : `I'm ready to help analyze ${deal.businessName} once bank statement data is extracted. Upload a PDF to get started, or ask me general questions about the deal.`,
        timestamp: new Date().toISOString()
      }
      setMessages([welcomeMessage])
    }
  }, [deal.id, deal.chatHistory])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // Build history for context (exclude the initial welcome message if it's the only one)
      const history = messages.length === 1 && messages[0].id === '1'
        ? []
        : messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp
          }))

      const response = await api.sendChatMessage(deal.id, input, history)
      setMessages(prev => {
        const newMessages = [...prev, response]
        // Note: Chat history is now saved on the backend automatically
        return newMessages
      })
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to get response'

      // Add error message to chat
      const errorChatMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorMessage.includes('not configured')
          ? 'Claude AI is not configured yet. Please ask your administrator to add the Anthropic API key.'
          : `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, errorChatMessage])
    } finally {
      setLoading(false)
    }
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
            <div className="message-content">
              {msg.content.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant">
            <div className="message-content typing">
              <span className="typing-indicator">Analyzing</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && !loading && (
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
          disabled={loading}
        />
        <button onClick={handleSend} disabled={!input.trim() || loading}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
