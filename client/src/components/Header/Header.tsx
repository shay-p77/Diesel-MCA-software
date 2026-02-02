import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import './Header.css'

interface HeaderProps {
  showUpload?: boolean
  showBack?: boolean
  title?: string
  onNewDeal?: () => void
}

export default function Header({ showUpload = true, showBack = false, title, onNewDeal }: HeaderProps) {
  const navigate = useNavigate()
  const { user, logout, isAdmin } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="header">
      <div className="header-left">
        {showBack && (
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Back
          </button>
        )}
        <img
          src="/DF_logo.png"
          alt="Amkus"
          className="header-logo"
          onClick={() => navigate('/dashboard')}
        />
        {title && <span className="subtitle">{title}</span>}
      </div>
      <div className="header-right">
        {showUpload && (
          <button className="btn-upload" onClick={onNewDeal}>
            + New Deal
          </button>
        )}
        {isAdmin && (
          <button className="btn-users" onClick={() => navigate('/users')}>
            Manage Users
          </button>
        )}
        {user && (
          <div className="user-menu">
            <span className="user-name">
              {user.name}
              {isAdmin && <span className="admin-badge">Admin</span>}
            </span>
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
