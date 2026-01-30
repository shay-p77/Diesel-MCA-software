import { Deal, ChatMessage } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

class ApiService {
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || 'Request failed')
    }

    return response.json()
  }

  // Health check
  async getHealth(): Promise<{
    status: string
    services: { koncile: string; claude: string }
  }> {
    return this.fetch('/health')
  }

  // Deals
  async getDeals(): Promise<Deal[]> {
    return this.fetch('/deals')
  }

  async getDeal(id: string): Promise<Deal> {
    return this.fetch(`/deals/${id}`)
  }

  async createDeal(data: {
    businessName?: string
    amountRequested?: number
    dateSubmitted?: string
    broker?: string
    notes?: string
  }): Promise<Deal> {
    return this.fetch('/deals', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateDeal(id: string, data: {
    businessName?: string
    amountRequested?: number
    dateSubmitted?: string
    broker?: string
    notes?: string
  }): Promise<Deal> {
    return this.fetch(`/deals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async updateDealStatus(
    id: string,
    status: 'pending' | 'under_review' | 'approved' | 'declined'
  ): Promise<Deal> {
    return this.fetch(`/deals/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  }

  // PDF Upload
  async uploadPdf(dealId: string, file: File): Promise<{
    message: string
    taskId: string
    deal: Deal
  }> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_BASE}/deals/${dealId}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }))
      throw new Error(error.error || 'Upload failed')
    }

    return response.json()
  }

  // Extraction status
  async getExtractionStatus(dealId: string): Promise<{
    status: 'processing' | 'done' | 'failed'
    deal?: Deal
    message?: string
  }> {
    return this.fetch(`/deals/${dealId}/extraction`)
  }

  // Chat
  async sendChatMessage(
    dealId: string,
    message: string,
    history: ChatMessage[] = []
  ): Promise<ChatMessage> {
    return this.fetch(`/deals/${dealId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    })
  }

  // Generate AI summary
  async generateSummary(dealId: string): Promise<{ summary: string; deal: Deal }> {
    return this.fetch(`/deals/${dealId}/generate-summary`, {
      method: 'POST',
    })
  }
}

export const api = new ApiService()
