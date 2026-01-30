import { useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../../components/Header'
import { SummaryTab, ChatTab, CalculatorTab } from '../../components/Sidebar'
import { mockDeals } from '../../data/mockData'
import './DealDetail.css'

type TabType = 'summary' | 'chat' | 'calculator'

export default function DealDetail() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState<TabType>('summary')
  const [pdfSearch, setPdfSearch] = useState('')

  const deal = mockDeals.find(d => d.id === id)

  if (!deal) {
    return (
      <div className="deal-detail">
        <Header showBack showUpload={false} />
        <div className="not-found">
          <h2>Deal not found</h2>
          <p>The deal you're looking for doesn't exist.</p>
        </div>
      </div>
    )
  }

  const getStatusBadgeClass = (status: typeof deal.status) => {
    switch (status) {
      case 'pending': return 'badge-pending'
      case 'under_review': return 'badge-review'
      case 'approved': return 'badge-approved'
      case 'declined': return 'badge-declined'
    }
  }

  const formatStatus = (status: typeof deal.status) => {
    return status.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
  }

  return (
    <div className="deal-detail">
      <Header showBack showUpload={false} title={deal.businessName} />

      {/* Deal Header Bar */}
      <div className="deal-header-bar">
        <div className="deal-info">
          <h2>{deal.businessName}</h2>
          <span className={`status-badge ${getStatusBadgeClass(deal.status)}`}>
            {formatStatus(deal.status)}
          </span>
        </div>
        <div className="deal-meta-bar">
          <span>{deal.ownerName}</span>
          <span className="separator">|</span>
          <span>{deal.industry}</span>
          <span className="separator">|</span>
          <span>Requesting ${deal.amountRequested.toLocaleString()}</span>
        </div>
        <div className="deal-actions">
          <button className="btn-secondary">Mark Under Review</button>
          <button className="btn-approve">Approve</button>
          <button className="btn-decline">Decline</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="deal-content">
        {/* PDF Viewer */}
        <div className="pdf-viewer">
          <div className="pdf-toolbar">
            <input
              type="text"
              placeholder="Search in PDF..."
              value={pdfSearch}
              onChange={(e) => setPdfSearch(e.target.value)}
              className="pdf-search"
            />
            <div className="pdf-controls">
              <button title="Zoom Out">-</button>
              <span>100%</span>
              <button title="Zoom In">+</button>
              <button title="Download">Download</button>
            </div>
          </div>
          <div className="pdf-container">
            <div className="pdf-placeholder">
              <div className="pdf-icon">PDF</div>
              <p>Bank Statement Preview</p>
              <p className="pdf-subtext">
                PDF viewer will display the uploaded bank statement here.
                <br />
                Search functionality will highlight matching text.
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-tabs">
            <button
              className={activeTab === 'summary' ? 'active' : ''}
              onClick={() => setActiveTab('summary')}
            >
              Summary
            </button>
            <button
              className={activeTab === 'chat' ? 'active' : ''}
              onClick={() => setActiveTab('chat')}
            >
              AI Chat
            </button>
            <button
              className={activeTab === 'calculator' ? 'active' : ''}
              onClick={() => setActiveTab('calculator')}
            >
              Calculator
            </button>
          </div>

          <div className="sidebar-content">
            {activeTab === 'summary' && <SummaryTab deal={deal} />}
            {activeTab === 'chat' && <ChatTab deal={deal} />}
            {activeTab === 'calculator' && <CalculatorTab deal={deal} />}
          </div>
        </div>
      </div>
    </div>
  )
}
