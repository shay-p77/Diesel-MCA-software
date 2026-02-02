# Security Documentation

This document outlines the security measures implemented in the Diesel MCA application.

## 🔐 Encryption & Data Protection

### Database Encryption (AES-256-GCM)

All sensitive data stored in MongoDB is encrypted using **AES-256-GCM** (Advanced Encryption Standard with Galois/Counter Mode), which is an industry-standard encryption algorithm used by governments and financial institutions.

#### Encrypted Fields

**Deal Information:**
- `businessName` - Business name
- `ownerName` - Owner's full name
- `broker` - Broker contact information
- `notes` - Deal notes (may contain sensitive info)

**Bank Account Information:**
- `accountNumber` - Bank account numbers
- `accountName` - Account holder names
- `bankName` - Financial institution names
- `transactions[].description` - Transaction descriptions (may contain payee info)
- `internalTransfers[].description` - Transfer descriptions

**Existing Positions:**
- `lender` - Lender company names

### How Encryption Works

1. **Before Saving to Database:**
   - Mongoose pre-save hook automatically encrypts all sensitive fields
   - Each field is encrypted with a unique initialization vector (IV)
   - Authentication tags ensure data integrity (detects tampering)

2. **After Retrieving from Database:**
   - Mongoose post-find hooks automatically decrypt all sensitive fields
   - Data is decrypted transparently - application code works with plain text

3. **Format:**
   ```
   encrypted_data:initialization_vector:authentication_tag
   ```
   All components are stored as hexadecimal strings.

### Password Security

User passwords are **hashed** (not encrypted) using **bcrypt** with a salt factor of 10. Hashing is one-way - passwords cannot be decrypted, only verified.

### JWT Authentication

JSON Web Tokens (JWT) are used for authentication:
- Tokens expire after 7 days
- Tokens are signed with a secret key
- Stored in browser localStorage (client-side)

## 🔑 Setup & Configuration

### Generate Encryption Key

**For Production:**
```bash
npm run generate-key
```

This generates a cryptographically secure 256-bit (32-byte) encryption key. Add it to your `.env` file:

```env
ENCRYPTION_KEY=your_generated_key_here
JWT_SECRET=your_jwt_secret_here
```

### Environment Variables

Required security variables in `.env`:

```env
# Database encryption (32-byte hex string)
ENCRYPTION_KEY=778858e65b2e85e2bb2e93cfc7cae02c896ce53b43c53e01b02b215ea3a68329

# JWT token signing
JWT_SECRET=your-long-random-string-change-in-production
```

**⚠️ CRITICAL:**
- **Never commit `.env` to version control**
- Use different keys for development and production
- Store production keys securely (e.g., environment variables, secrets manager)
- Rotate keys periodically

## 🛡️ Security Best Practices

### What's Protected

✅ **Encrypted at Rest:**
- All sensitive data in MongoDB database
- Bank account numbers
- Business owner information
- Transaction descriptions

✅ **Encrypted in Transit:**
- Use HTTPS in production (SSL/TLS)
- MongoDB connection should use SSL (`mongodb+srv://`)

✅ **Password Security:**
- Bcrypt hashing with salt
- Passwords never stored in plain text
- Passwords never returned in API responses

✅ **Access Control:**
- Role-based authentication (admin/user)
- Protected API endpoints
- JWT token verification

### What's NOT Protected

❌ **Not Encrypted:**
- Financial amounts (needed for calculations/filtering)
- Deal status and dates
- Statistical data (deposits, withdrawals, balances)
- Industry information

These fields don't contain PII and are needed for business logic.

## 🔄 Data Migration

If you have existing unencrypted data:

1. **Backup your database first!**
2. Add `ENCRYPTION_KEY` to `.env`
3. Create a migration script to:
   - Read all deals
   - Re-save them (triggers encryption)

Example migration script:

```typescript
import { DealModel } from './db/models/Deal.js'

async function migrate() {
  const deals = await DealModel.find({})
  for (const deal of deals) {
    await deal.save() // Triggers pre-save encryption
  }
  console.log(`Migrated ${deals.length} deals`)
}

migrate()
```

## 📋 Compliance

This implementation helps meet compliance requirements for:

- **PCI DSS** - Payment Card Industry Data Security Standard
- **GLBA** - Gramm-Leach-Bliley Act (financial data)
- **SOC 2** - Service Organization Control 2
- **General Data Protection** - Sensitive PII encryption

## 🚨 Security Incident Response

If you suspect a security breach:

1. **Rotate encryption keys immediately**
2. **Revoke all JWT tokens** (change `JWT_SECRET`)
3. **Audit database access logs**
4. **Force all users to reset passwords**
5. **Notify affected parties as required by law**

## 📞 Security Contact

For security issues, please report to: [security contact email]

**Do not disclose security issues publicly.**
