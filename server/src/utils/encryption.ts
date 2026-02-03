import crypto from 'crypto'

// AES-256-GCM encryption (industry standard)
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // For AES, this is always 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 64

// Get encryption key from environment variable
// IMPORTANT: This must be a 32-byte (256-bit) key
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || generateDefaultKey()

function generateDefaultKey(): string {
  console.warn('⚠️  WARNING: Using default encryption key. Set ENCRYPTION_KEY in .env for production!')
  // Generate a consistent key for development (DO NOT use in production)
  return crypto.createHash('sha256').update('dev-encryption-key-change-in-production').digest('hex')
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * Returns: encrypted:iv:authTag format
 */
export function encrypt(text: string): string {
  try {
    if (!text) return ''

    // Create random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH)

    // Create cipher with our key and IV
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    )

    // Encrypt the data
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Get authentication tag for GCM mode (ensures data integrity)
    const authTag = cipher.getAuthTag()

    // Return format: encrypted:iv:authTag (all in hex)
    return `${encrypted}:${iv.toString('hex')}:${authTag.toString('hex')}`
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt data encrypted with AES-256-GCM
 * Expects: encrypted:iv:authTag format
 * Returns original data if it doesn't appear to be encrypted
 */
export function decrypt(encryptedData: string): string {
  try {
    if (!encryptedData) return ''

    // Split the encrypted data into components
    const parts = encryptedData.split(':')

    // If data doesn't have 3 parts, it's probably not encrypted - return as-is
    if (parts.length !== 3) {
      return encryptedData
    }

    const [encrypted, ivHex, authTagHex] = parts

    // Validate that parts look like hex strings
    if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(authTagHex)) {
      return encryptedData // Not encrypted, return as-is
    }

    // Convert hex strings back to buffers
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    // Create decipher
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    )

    // Set authentication tag
    decipher.setAuthTag(authTag)

    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    // If decryption fails, return original data (might be plain text or encrypted with different key)
    console.warn('Could not decrypt data, returning as-is')
    return encryptedData
  }
}

/**
 * Encrypt an object's sensitive fields
 */
export function encryptObject<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: (keyof T)[]
): T {
  const encrypted = { ...obj }

  for (const field of sensitiveFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      encrypted[field] = encrypt(obj[field] as string) as any
    }
  }

  return encrypted
}

/**
 * Decrypt an object's sensitive fields
 */
export function decryptObject<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: (keyof T)[]
): T {
  const decrypted = { ...obj }

  for (const field of sensitiveFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      try {
        decrypted[field] = decrypt(obj[field] as string) as any
      } catch (error) {
        console.error(`Failed to decrypt field ${String(field)}:`, error)
        // Keep original value if decryption fails (might not be encrypted)
        decrypted[field] = obj[field]
      }
    }
  }

  return decrypted
}

/**
 * Generate a secure random encryption key
 * Use this to generate your ENCRYPTION_KEY for production
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Log warning if using default key
if (!process.env.ENCRYPTION_KEY) {
  console.warn('')
  console.warn('═══════════════════════════════════════════════════════')
  console.warn('⚠️  SECURITY WARNING: Using default encryption key!')
  console.warn('   Set ENCRYPTION_KEY in .env for production')
  console.warn('   Generate a key by running: npm run generate-key')
  console.warn('═══════════════════════════════════════════════════════')
  console.warn('')
}
