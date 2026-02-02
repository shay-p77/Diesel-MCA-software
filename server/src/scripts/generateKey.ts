import crypto from 'crypto'

/**
 * Generate a secure encryption key for production use
 */
function generateKey() {
  const key = crypto.randomBytes(32).toString('hex')

  console.log('\n✓ Secure encryption key generated!\n')
  console.log('Add this to your .env file:\n')
  console.log(`ENCRYPTION_KEY=${key}\n`)
  console.log('⚠️  IMPORTANT: Keep this key secret and never commit it to version control!\n')
}

generateKey()
