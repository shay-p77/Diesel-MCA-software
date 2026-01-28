import { useNavigate } from 'react-router-dom'
import './Header.css'

interface HeaderProps {
  showUpload?: boolean
  showBack?: boolean
  title?: string
}

export default function Header({ showUpload = true, showBack = false, title }: HeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="header">
      <div className="header-left">
        {showBack && (
          <button className="btn-back" onClick={() => navigate('/')}>
            ← Back
          </button>
        )}
        <h1 onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Diesel</h1>
        <span className="subtitle">{title || 'MCA Underwriting'}</span>
      </div>
      <div className="header-right">
        {showUpload && (
          <button className="btn-upload">
            + Upload Statement
          </button>
        )}
      </div>
    </header>
  )
}
