import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'

const KONCILE_API_URL = 'https://api.koncile.ai/v1'

interface KoncileConfig {
  apiKey: string
  folderId: number
  templateId: number
}

interface TaskResult {
  status: 'IN PROGRESS' | 'DONE' | 'FAILED' | 'DUPLICATE'
  status_message: string
  task_id: string | null
  document_id: number | null
  document_name: string | null
  General_fields: Record<string, any> | null
  Line_fields: Record<string, any> | null
}

interface UploadResponse {
  task_id: string
  message?: string
}

export class KoncileService {
  private config: KoncileConfig

  constructor(config: KoncileConfig) {
    this.config = config
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
    }
  }

  /**
   * Verify the API key is valid
   */
  async checkApiKey(): Promise<boolean> {
    try {
      const response = await axios.post(
        `${KONCILE_API_URL}/check_api_key/`,
        {},
        { headers: this.getHeaders() }
      )
      return response.data.success === true
    } catch (error) {
      console.error('Koncile API key check failed:', error)
      return false
    }
  }

  /**
   * Upload a PDF file to Koncile for extraction
   */
  async uploadFile(filePath: string, fileName: string): Promise<UploadResponse> {
    const form = new FormData()
    form.append('files', fs.createReadStream(filePath), fileName)

    const response = await axios.post(
      `${KONCILE_API_URL}/upload_file/`,
      form,
      {
        headers: {
          ...this.getHeaders(),
          ...form.getHeaders(),
        },
        params: {
          folder_id: this.config.folderId,
          template_id: this.config.templateId,
        },
      }
    )

    return response.data
  }

  /**
   * Upload a PDF from buffer (for multer uploads)
   */
  async uploadBuffer(buffer: Buffer, fileName: string): Promise<UploadResponse> {
    const form = new FormData()
    form.append('files', buffer, {
      filename: fileName,
      contentType: 'application/pdf',
    })

    const response = await axios.post(
      `${KONCILE_API_URL}/upload_file/`,
      form,
      {
        headers: {
          ...this.getHeaders(),
          ...form.getHeaders(),
        },
        params: {
          folder_id: this.config.folderId,
          template_id: this.config.templateId,
        },
      }
    )

    // Koncile returns {task_ids: [...]} but we need {task_id: ...}
    const data = response.data
    if (data.task_ids && Array.isArray(data.task_ids) && data.task_ids.length > 0) {
      return { task_id: data.task_ids[0] }
    }

    return response.data
  }

  /**
   * Get the extraction results for a task
   */
  async getTaskResult(taskId: string): Promise<TaskResult> {
    const response = await axios.get(
      `${KONCILE_API_URL}/fetch_tasks_results/`,
      {
        headers: this.getHeaders(),
        params: { task_id: taskId },
      }
    )

    return response.data
  }

  /**
   * Poll for task completion with timeout
   */
  async waitForTaskCompletion(
    taskId: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 2000
  ): Promise<TaskResult> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.getTaskResult(taskId)

      if (result.status === 'DONE' || result.status === 'FAILED' || result.status === 'DUPLICATE') {
        return result
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error(`Task ${taskId} did not complete within ${maxWaitMs}ms`)
  }

  /**
   * Get document data by document ID
   */
  async getDocumentData(documentId: number): Promise<any> {
    const response = await axios.get(
      `${KONCILE_API_URL}/fetch_document_data/`,
      {
        headers: this.getHeaders(),
        params: { document_id: documentId },
      }
    )

    return response.data
  }

  /**
   * Parse Koncile extraction result into our app's format
   */
  parseExtractionResult(result: TaskResult) {
    const generalFields = result.General_fields || {}
    const lineFields = result.Line_fields || {}

    // Log all available fields from Koncile for debugging
    console.log('[Koncile Parse] General fields available:', Object.keys(generalFields))
    console.log('[Koncile Parse] Line fields available:', Object.keys(lineFields))

    // Log the full line fields structure to understand what Koncile is returning
    for (const [fieldName, fieldData] of Object.entries(lineFields)) {
      const data = fieldData as any
      const count = Array.isArray(data) ? data.length : (data?.values?.length || 0)
      console.log(`[Koncile Parse]   - ${fieldName}: ${count} items`)
    }

    // Extract bank data from general fields
    const bankData = {
      beginningBalance: this.parseNumber(generalFields['Beginning Balance']?.value),
      depositsAndAdditions: this.parseNumber(generalFields['Deposits and Additions']?.value),
      checksPaid: this.parseNumber(generalFields['Checks Paid']?.value),
      endingBalance: this.parseNumber(generalFields['Ending Balance']?.value),
      // Add more fields as needed based on what Koncile extracts
    }

    // Extract transactions from line fields
    const transactions = this.parseLineFields(lineFields)

    // Calculate derived metrics
    const totalDeposits = transactions
      .filter(t => t.type === 'Deposit')
      .reduce((sum, t) => sum + t.amount, 0)

    const totalWithdrawals = transactions
      .filter(t => t.type !== 'Deposit')
      .reduce((sum, t) => sum + t.amount, 0)

    return {
      raw: {
        generalFields,
        lineFields,
      },
      bankData: {
        ...bankData,
        totalDeposits,
        totalWithdrawals,
        transactionCount: transactions.length,
      },
      transactions,
    }
  }

  private parseNumber(value: any): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const cleaned = value.replace(/[,$]/g, '')
      return parseFloat(cleaned) || 0
    }
    return 0
  }

  private parseLineFields(lineFields: Record<string, any>): Array<{
    date: string
    description: string
    type: string
    amount: number
    checkNumber?: string
  }> {
    const transactions: any[] = []

    // Line fields can be either an object with .values or directly an array
    const getFieldArray = (fieldName: string) => {
      const field = lineFields[fieldName]
      if (!field) return []
      return Array.isArray(field) ? field : (field.values || [])
    }

    const dates = getFieldArray('Transaction date')
    const types = getFieldArray('Transaction type')
    const amounts = getFieldArray('Transaction amount')
    const checkNumbers = getFieldArray('Check number')
    const descriptions = getFieldArray('Transaction description')

    const count = Math.max(dates.length, types.length, amounts.length)

    console.log(`[Koncile Parse] Found ${count} transactions (dates: ${dates.length}, types: ${types.length}, amounts: ${amounts.length}, descriptions: ${descriptions.length})`)

    for (let i = 0; i < count; i++) {
      transactions.push({
        date: dates[i]?.value || '',
        type: types[i]?.value || 'Other',
        amount: this.parseNumber(amounts[i]?.value),
        checkNumber: checkNumbers[i]?.value || undefined,
        description: descriptions[i]?.value || '',
      })
    }

    // Log date range of extracted transactions
    if (transactions.length > 0) {
      const sortedByDate = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      console.log(`[Koncile Parse] Transaction date range: ${sortedByDate[0]?.date} to ${sortedByDate[sortedByDate.length - 1]?.date}`)
    }

    return transactions
  }
}

// Create singleton instance
let koncileService: KoncileService | null = null

export function getKoncileService(): KoncileService {
  if (!koncileService) {
    koncileService = new KoncileService({
      apiKey: process.env.KONCILE_API_KEY || '',
      folderId: parseInt(process.env.KONCILE_FOLDER_ID || '0'),
      templateId: parseInt(process.env.KONCILE_TEMPLATE_ID || '0'),
    })
  }
  return koncileService
}
