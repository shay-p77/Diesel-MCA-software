import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../../components/Header'
import { SummaryTab, ChatTab, CalculatorTab } from '../../components/Sidebar'
import DealModal from '../../components/DealModal'
import PDFViewer from '../../components/PDFViewer/PDFViewer'
import { api } from '../../services/api'
import { Deal } from '../../types'
import './DealDetail.css'

type TabType = 'summary' | 'chat' | 'calculator'

export default function DealDetail() {
  const { id } = useParams<{ id: string }>()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('summary')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleStatusChange = async (newStatus: 'pending' | 'under_review' | 'approved' | 'declined') => {
    if (!deal || statusUpdating) return

    try {
      setStatusUpdating(true)
      const updated = await api.updateDealStatus(deal.id, newStatus)
      setDeal(updated)
    } catch (err: any) {
      console.error('Failed to update status:', err)
    } finally {
      setStatusUpdating(false)
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'PENDING',
      under_review: 'UNDER REVIEW',
      approved: 'APPROVED',
      declined: 'DECLINED'
    }
    return labels[status] || status.toUpperCase()
  }

  // Fetch deal from API
  useEffect(() => {
    const fetchDeal = async () => {
      if (!id) return

      try {
        setLoading(true)
        const data = await api.getDeal(id)
        setDeal(data)
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to load deal')
      } finally {
        setLoading(false)
      }
    }

    fetchDeal()
  }, [id])

  // Poll for extraction status if processing
  useEffect(() => {
    if (!deal || deal.extractionStatus !== 'processing' || !id) return

    const pollInterval = setInterval(async () => {
      try {
        const result = await api.getExtractionStatus(id)
        if (result.status === 'done' && result.deal) {
          setDeal(result.deal)
        } else if (result.status === 'failed') {
          setDeal(prev => prev ? { ...prev, extractionStatus: 'failed' } : null)
        }
      } catch (err) {
        console.error('Failed to poll extraction status:', err)
      }
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [deal?.extractionStatus, id])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !id) return

    try {
      setUploading(true)
      setUploadError(null)
      const result = await api.uploadPdfs(id, Array.from(files))
      setDeal(result.deal)
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  if (loading) {
    return (
      <div className="deal-detail">
        <Header showBack showUpload={false} />
        <div className="loading-state">Loading deal...</div>
      </div>
    )
  }

  if (error || !deal) {
    return (
      <div className="deal-detail">
        <Header showBack showUpload={false} />
        <div className="not-found">
          <h2>Deal not found</h2>
          <p>{error || "The deal you're looking for doesn't exist."}</p>
        </div>
      </div>
    )
  }

  // Determine if using multi-account structure or legacy
  const hasMultipleAccounts = deal.bankAccounts && deal.bankAccounts.length > 0
  const hasPdf = hasMultipleAccounts
    ? deal.bankAccounts.some(acc => acc.pdfFileName)
    : deal.pdfFileName

  return (
    <div className="deal-detail">
      <Header showBack showUpload={false} title={deal.businessName} />

      {/* Deal Header Bar */}
      <div className="deal-header-bar">
        <div className="deal-info">
          <h2>{deal.businessName}</h2>
          <span className={`status-badge ${deal.status}`}>{getStatusLabel(deal.status)}</span>
        </div>
        <div className="deal-meta-bar">
          <span>{deal.ownerName}</span>
          <span className="separator">|</span>
          <span>{deal.industry}</span>
          <span className="separator">|</span>
          <span>Requesting ${deal.amountRequested.toLocaleString()}</span>
        </div>
        <div className="status-actions">
          {deal.status !== 'under_review' && (
            <button
              className="btn-status review"
              onClick={() => handleStatusChange('under_review')}
              disabled={statusUpdating}
            >
              Mark Under Review
            </button>
          )}
          {deal.status !== 'approved' && (
            <button
              className="btn-status approve"
              onClick={() => handleStatusChange('approved')}
              disabled={statusUpdating}
            >
              Approve
            </button>
          )}
          {deal.status !== 'declined' && (
            <button
              className="btn-status decline"
              onClick={() => handleStatusChange('declined')}
              disabled={statusUpdating}
            >
              Decline
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="deal-content">
        {/* PDF Viewer */}
        <div className="pdf-viewer">
          {hasPdf ? (
            <>
              {/* Account Selector for Multiple Accounts */}
              {hasMultipleAccounts && deal.bankAccounts.length > 1 && (
                <div className="account-selector">
                  <label htmlFor="account-select">View Account:</label>
                  <select
                    id="account-select"
                    value={selectedAccountIndex}
                    onChange={(e) => setSelectedAccountIndex(Number(e.target.value))}
                  >
                    {deal.bankAccounts.map((account, index) => (
                      <option key={account.id} value={index}>
                        {account.accountName || `Account ${index + 1}`}
                        {account.accountNumber && ` (****${account.accountNumber.slice(-4)})`}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-add-account"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    + Add Account
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf"
                    multiple
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              )}

              {hasMultipleAccounts ? (
                <PDFViewer
                  pdfUrl={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}/api/deals/${deal.id}/pdf/${deal.bankAccounts[selectedAccountIndex].id}`}
                  fileName={deal.bankAccounts[selectedAccountIndex].pdfFileName}
                />
              ) : (
                <PDFViewer
                  pdfUrl={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}/api/deals/${deal.id}/pdf`}
                  fileName={deal.pdfFileName || 'document.pdf'}
                />
              )}
            </>
          ) : (
            <div className="pdf-container">
              <div className="pdf-placeholder">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf"
                  multiple
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  id="pdf-upload"
                />
                <label htmlFor="pdf-upload" className="upload-area">
                  <div className="pdf-icon upload">+</div>
                  <p>{uploading ? 'Uploading...' : 'Upload Bank Statements'}</p>
                  <p className="pdf-subtext">
                    Click to select PDF files (multiple allowed)
                  </p>
                </label>
                {uploadError && <p className="upload-error">{uploadError}</p>}
              </div>
            </div>
          )}
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
            {activeTab === 'summary' && <SummaryTab deal={deal} onEditDeal={() => setIsEditModalOpen(true)} />}
            {activeTab === 'chat' && <ChatTab deal={deal} />}
            {activeTab === 'calculator' && <CalculatorTab deal={deal} />}
          </div>
        </div>
      </div>

      <DealModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={(updatedDeal) => setDeal(updatedDeal)}
        deal={deal}
      />
    </div>
  )
}
