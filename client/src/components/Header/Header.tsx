import { useNavigate } from 'react-router-dom'
import './Header.css'

interface HeaderProps {
  showUpload?: boolean
  showBack?: boolean
  title?: string
  onNewDeal?: () => void
}

export default function Header({ showUpload = true, showBack = false, title, onNewDeal }: HeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="header">
      <div className="header-left">
        {showBack && (
          <button className="btn-back" onClick={() => navigate('/')}>
            ← Back
          </button>
        )}
        <img
          src="/DF_logo.png"
          alt="Amkus"
          className="header-logo"
          onClick={() => navigate('/')}
        />
        {title && <span className="subtitle">{title}</span>}
      </div>
      <div className="header-right">
        {showUpload && (
          <button className="btn-upload" onClick={onNewDeal}>
            + New Deal
          </button>
        )}
      </div>
    </header>
  )
}
