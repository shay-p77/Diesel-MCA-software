import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { UserModel } from '../db/models/User.js'
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js'
import { authenticateToken, requireAdmin } from '../middleware/auth.js'
import { LoginRequest, RegisterRequest, AuthResponse, User, SetupPasswordRequest } from '../types/index.js'
import { sendUserInvitation, isEmailConfigured } from '../services/email.js'

const router = Router()

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Find user by email
    const user = await UserModel.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check if password is set up
    if (!user.passwordSetup || !user.password) {
      return res.status(401).json({ error: 'Please set up your password first using the invitation link' })
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password)
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    })

    // Return user data (password excluded by toJSON transform)
    const response: AuthResponse = {
      token,
      user: user.toJSON() as User,
    }

    res.json(response)
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

/**
 * POST /api/auth/invite
 * Invite a new user by email (admin only)
 */
router.post('/invite', authenticateToken, requireAdmin, async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { email, name, role = 'user' } = req.body

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' })
    }

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' })
    }

    // Generate secure invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex')
    const invitationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Create user with pending invitation
    const user = await UserModel.create({
      email: email.toLowerCase(),
      name,
      role,
      createdBy: req.user?.userId,
      invitationToken,
      invitationExpiry,
      passwordSetup: false,
    })

    // Send invitation email
    if (isEmailConfigured()) {
      try {
        await sendUserInvitation(email, name, invitationToken)
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError)
        // Delete the user if email fails
        await UserModel.findByIdAndDelete(user._id)
        return res.status(500).json({ error: 'Failed to send invitation email' })
      }
    } else {
      // For development without email configured
      console.warn('Email not configured. Invitation link:', `http://localhost:3000/setup-password?token=${invitationToken}`)
    }

    res.status(201).json({
      ...user.toJSON() as User,
      message: 'Invitation sent successfully'
    })
  } catch (error) {
    console.error('Invitation error:', error)
    res.status(500).json({ error: 'Failed to send invitation' })
  }
})

/**
 * POST /api/auth/setup-password
 * Set up password using invitation token
 */
router.post('/setup-password', async (req: Request<{}, {}, SetupPasswordRequest>, res: Response) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    // Find user by invitation token
    const user = await UserModel.findOne({ invitationToken: token })
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired invitation token' })
    }

    // Check if token expired
    if (user.invitationExpiry && new Date() > user.invitationExpiry) {
      return res.status(400).json({ error: 'Invitation token has expired' })
    }

    // Hash password and update user
    const hashedPassword = await hashPassword(password)
    user.password = hashedPassword
    user.passwordSetup = true
    user.invitationToken = null
    user.invitationExpiry = null
    await user.save()

    // Generate auth token
    const authToken = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    })

    // Return user data
    const response: AuthResponse = {
      token: authToken,
      user: user.toJSON() as User,
    }

    res.json(response)
  } catch (error) {
    console.error('Setup password error:', error)
    res.status(500).json({ error: 'Failed to set up password' })
  }
})

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.user?.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json(user.toJSON() as User)
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to get user info' })
  }
})

/**
 * GET /api/auth/users
 * Get all users (admin only)
 */
router.get('/users', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await UserModel.find().sort({ createdAt: -1 })
    res.json(users.map(u => u.toJSON() as User))
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to get users' })
  }
})

/**
 * DELETE /api/auth/users/:id
 * Delete a user (admin only)
 */
router.delete('/users/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Prevent deleting yourself
    if (id === req.user?.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    const user = await UserModel.findByIdAndDelete(id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

/**
 * PUT /api/auth/users/:id
 * Update a user (admin only)
 */
router.put('/users/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, email, role, password } = req.body

    const updates: any = {}
    if (name) updates.name = name
    if (email) updates.email = email.toLowerCase()
    if (role) updates.role = role
    if (password) updates.password = await hashPassword(password)

    const user = await UserModel.findByIdAndUpdate(id, updates, { new: true })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json(user.toJSON() as User)
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

export default router
