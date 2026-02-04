/**
 * Extract text content from a PDF buffer
 * Uses dynamic import to avoid crash on module load
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid crash at module load time
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule: any = await import('pdf-parse')
    const pdfParse = pdfParseModule.default || pdfParseModule
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
