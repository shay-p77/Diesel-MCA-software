import { PDFParse } from 'pdf-parse'

/**
 * Extract text content from a PDF buffer
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    console.log('[PDF Extract] Parsing buffer of size:', pdfBuffer.length)
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) })
    const result = await parser.getText()
    await parser.destroy()
    console.log('[PDF Extract] Extracted text length:', result.text?.length || 0)
    return result.text || ''
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
