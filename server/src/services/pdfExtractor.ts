import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

/**
 * Extract text content from a PDF buffer
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(pdfBuffer)
    return data.text
  } catch (error) {
    console.error('[PDF Extract] Failed to extract text:', error)
    return ''
  }
}

/**
 * Extract text from a base64-encoded PDF
 */
export async function extractPdfTextFromBase64(base64Data: string): Promise<string> {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    return await extractPdfText(buffer)
  } catch (error) {
    console.error('[PDF Extract] Failed to extract text from base64:', error)
    return ''
  }
}
