import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'
import './SetupPassword.css'

export default function SetupPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const token = searchParams.get('token')

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link')
    }
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!token) {
      setError('Invalid invitation token')
      return
    }

    setLoading(true)

    try {
      const response = await api.setupPassword(token, password)
      // Store token (login happens automatically after setup)
      localStorage.setItem('authToken', response.token)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to set up password')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="setup-password-page">
        <div className="setup-container">
          <div className="setup-header">
            <h1>Invalid Link</h1>
            <p>This invitation link is invalid or has expired.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="setup-password-page">
      <div className="setup-container">
        <div className="setup-header">
          <h1>Set Up Your Password</h1>
          <p>Create a secure password for your Diesel MCA account</p>
        </div>

        <form onSubmit={handleSubmit} className="setup-form">
          {error && <div className="setup-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password (min 6 characters)"
              required
              autoFocus
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="setup-button" disabled={loading}>
            {loading ? 'Setting up...' : 'Set Up Password'}
          </button>
        </form>

        <div className="setup-footer">
          <p>Already have an account? <a href="/login">Sign in</a></p>
        </div>
      </div>
    </div>
  )
}
