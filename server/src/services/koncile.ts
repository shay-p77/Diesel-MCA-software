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

    // Line fields come as arrays - each index represents one transaction
    const dates = lineFields['Transaction date']?.values || []
    const types = lineFields['Transaction type']?.values || []
    const amounts = lineFields['Transaction amount']?.values || []
    const checkNumbers = lineFields['Check number']?.values || []
    const descriptions = lineFields['Transaction description']?.values || []

    const count = Math.max(dates.length, types.length, amounts.length)

    for (let i = 0; i < count; i++) {
      transactions.push({
        date: dates[i]?.value || '',
        type: types[i]?.value || 'Other',
        amount: this.parseNumber(amounts[i]?.value),
        checkNumber: checkNumbers[i]?.value || undefined,
        description: descriptions[i]?.value || '',
      })
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
