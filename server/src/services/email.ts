import { Resend } from 'resend'

// Email configuration from environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'Diesel MCA <onboarding@resend.dev>'
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

// Initialize Resend client
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html: string
}

/**
 * Send an email using Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!resend) {
    throw new Error('Email service not configured. Set RESEND_API_KEY in .env')
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    })

    if (error) {
      console.error('Failed to send email:', error)
      throw new Error('Failed to send email')
    }

    console.log(`✓ Email sent to ${options.to} (ID: ${data?.id})`)
  } catch (error) {
    console.error('Failed to send email:', error)
    throw new Error('Failed to send email')
  }
}

/**
 * Send user invitation email
 */
export async function sendUserInvitation(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const setupUrl = `${APP_URL}/setup-password?token=${token}`

  const subject = 'Welcome to Diesel MCA - Set Up Your Account'

  const text = `
Hi ${name},

You've been invited to join Diesel MCA!

To set up your account and create your password, please click the link below:

${setupUrl}

This link will expire in 24 hours.

If you didn't expect this invitation, please ignore this email.

Best regards,
Diesel MCA Team
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border: 1px solid #e5e7eb;
      border-top: none;
    }
    .button {
      display: inline-block;
      background: #3d6b99;
      color: white;
      text-decoration: none;
      padding: 12px 30px;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 600;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Welcome to Diesel MCA!</h1>
  </div>
  <div class="content">
    <p>Hi ${name},</p>

    <p>You've been invited to join <strong>Diesel MCA</strong>, our merchant cash advance management platform.</p>

    <p>To get started, please set up your account by creating a password:</p>

    <center>
      <a href="${setupUrl}" class="button">Set Up My Account</a>
    </center>

    <p style="color: #6b7280; font-size: 14px;">
      Or copy and paste this link into your browser:<br>
      <a href="${setupUrl}">${setupUrl}</a>
    </p>

    <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
      <strong>Note:</strong> This invitation link will expire in 24 hours.
    </p>

    <p style="color: #6b7280; font-size: 14px;">
      If you didn't expect this invitation, please ignore this email.
    </p>
  </div>
  <div class="footer">
    <p>Diesel MCA - Merchant Cash Advance Management</p>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({ to: email, subject, text, html })
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY
}
