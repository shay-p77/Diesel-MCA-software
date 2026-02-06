import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { pdfjs } from 'react-pdf'
import Header from '../../components/Header'
import { SummaryTab, ChatTab, CalculatorTab } from '../../components/Sidebar'
import DealModal from '../../components/DealModal'
import PDFViewer, { countOccurrences } from '../../components/PDFViewer/PDFViewer'
import type { CrossStatementResult } from '../../components/PDFViewer/PDFViewer'
import { api } from '../../services/api'
import { Deal } from '../../types'
import './DealDetail.css'

type TabType = 'summary' | 'chat' | 'calculator'

export interface CalculatorState {
  fundingAmount: string
  factorRate: string
  termWeeks: string
  paymentFrequency: 'daily' | 'weekly'
}

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
  const [crossStatementResults, setCrossStatementResults] = useState<CrossStatementResult[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollPositionsRef = useRef<Map<number, number>>(new Map())
  const pdfScrollContainerRef = useRef<HTMLDivElement | null>(null)

  // Lifted calculator state (shared between CalculatorTab and SummaryTab)
  const [calcState, setCalcState] = useState<CalculatorState>({
    fundingAmount: '50000',
    factorRate: '1.35',
    termWeeks: '24',
    paymentFrequency: 'daily',
  })

  // Initialize calculator funding amount when deal loads
  useEffect(() => {
    if (deal) {
      setCalcState(prev => ({
        ...prev,
        fundingAmount: deal.amountRequested.toString(),
      }))
    }
  }, [deal?.id])

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

  // Save scroll position before switching statements
  const handleStatementSwitch = useCallback((newIndex: number) => {
    // Save current scroll position
    if (pdfScrollContainerRef.current) {
      scrollPositionsRef.current.set(selectedAccountIndex, pdfScrollContainerRef.current.scrollTop)
    }
    // If there's an active search, clear the saved scroll for the target
    // so the auto-search scroll takes priority
    if (searchTerm) {
      scrollPositionsRef.current.delete(newIndex)
    }
    setSelectedAccountIndex(newIndex)
  }, [selectedAccountIndex, searchTerm])

  // Callback for PDFViewer to register its scroll container
  const handleScrollContainerRef = useCallback((ref: HTMLDivElement | null) => {
    pdfScrollContainerRef.current = ref
  }, [])

  // Cross-statement search: when user searches in one PDF, check others
  const handleSearchTermChange = useCallback(async (term: string) => {
    setSearchTerm(term)

    if (!term || !deal || !deal.bankAccounts || deal.bankAccounts.length === 0) {
      setCrossStatementResults([])
      return
    }

    // Build allPdfSources inline (same logic as render)
    const sources = deal.bankAccounts.flatMap((account, accountIndex) => {
      if (account.statements && account.statements.length > 0) {
        return account.statements.map((stmt, stmtIndex) => ({
          id: stmt.id,
          label: `${account.accountName || `Account ${accountIndex + 1}`} - Stmt ${stmtIndex + 1}`,
          fileName: stmt.pdfFileName || 'statement.pdf'
        }))
      }
      return [{
        id: account.id,
        label: account.accountName || `Account ${accountIndex + 1}`,
        fileName: account.pdfFileName || 'statement.pdf'
      }]
    })

    if (sources.length <= 1) {
      setCrossStatementResults([])
      return
    }

    const baseUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'
    const results: CrossStatementResult[] = []
    const query = term.toLowerCase()

    // Search all OTHER statements (not the currently selected one)
    await Promise.all(
      sources.map(async (source, index) => {
        if (index === selectedAccountIndex) return

        try {
          const pdfUrl = `${baseUrl}/api/deals/${deal.id}/pdf/${source.id}`
          const pdf = await pdfjs.getDocument(pdfUrl).promise
          let totalCount = 0

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()

            // Use the same countOccurrences function as DOM highlighting
            for (const item of textContent.items) {
              const str = (item as any).str?.toLowerCase() || ''
              totalCount += countOccurrences(str, query)
            }
          }

          if (totalCount > 0) {
            results.push({
              statementIndex: index,
              label: source.fileName.replace('.pdf', '').replace(/\s*\(\d+\)$/, ''),
              count: totalCount
            })
          }

          pdf.destroy()
        } catch (err) {
          console.error(`Failed to search statement ${source.id}:`, err)
        }
      })
    )

    // Sort by count descending
    results.sort((a, b) => b.count - a.count)
    setCrossStatementResults(results)
  }, [deal, selectedAccountIndex])

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
    ? deal.bankAccounts.some(acc => acc.pdfFileName || (acc.statements && acc.statements.length > 0))
    : deal.pdfFileName

  // Build flat list of all PDF sources (handles both direct accounts and merged statements)
  const allPdfSources = hasMultipleAccounts
    ? deal.bankAccounts.flatMap((account, accountIndex) => {
        // If account has statements (merged), include each statement
        if (account.statements && account.statements.length > 0) {
          return account.statements.map((stmt, stmtIndex) => ({
            id: stmt.id,
            label: `${account.accountName || `Account ${accountIndex + 1}`} - Statement ${stmtIndex + 1}`,
            fileName: stmt.pdfFileName || 'statement.pdf'
          }))
        }
        // Otherwise include the account's PDF directly
        return [{
          id: account.id,
          label: account.accountName || `Account ${accountIndex + 1}`,
          fileName: account.pdfFileName || 'statement.pdf'
        }]
      })
    : []

  // Get the currently selected PDF
  const selectedPdf = allPdfSources[selectedAccountIndex] || allPdfSources[0]

  // Get saved scroll position for the selected statement
  const savedScrollPosition = scrollPositionsRef.current.get(selectedAccountIndex) || 0

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
              {/* Statement Tabs and Add Button */}
              {hasMultipleAccounts && (
                <div className="statement-tabs-bar">
                  {allPdfSources.length > 1 && (
                    <div className="statement-tabs">
                      {allPdfSources.map((pdf, index) => (
                        <button
                          key={pdf.id}
                          className={`statement-tab ${index === selectedAccountIndex ? 'active' : ''}`}
                          onClick={() => handleStatementSwitch(index)}
                        >
                          {pdf.fileName.replace('.pdf', '').replace(/\s*\(\d+\)$/, '')}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="btn-add-account"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : '+ Add'}
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

              {hasMultipleAccounts && selectedPdf ? (
                <PDFViewer
                  key={selectedPdf.id}
                  pdfUrl={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}/api/deals/${deal.id}/pdf/${selectedPdf.id}`}
                  fileName={selectedPdf.fileName}
                  savedScrollPosition={savedScrollPosition}
                  onScrollContainerRef={handleScrollContainerRef}
                  onSearchTermChange={handleSearchTermChange}
                  crossStatementResults={crossStatementResults}
                  onSwitchStatement={handleStatementSwitch}
                  initialSearchTerm={searchTerm}
                />
              ) : (
                <PDFViewer
                  pdfUrl={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000'}/api/deals/${deal.id}/pdf`}
                  fileName={deal.pdfFileName || 'document.pdf'}
                  savedScrollPosition={0}
                  onScrollContainerRef={handleScrollContainerRef}
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
            {activeTab === 'summary' && (
              <SummaryTab
                deal={deal}
                onEditDeal={() => setIsEditModalOpen(true)}
                calcState={calcState}
              />
            )}
            {activeTab === 'chat' && <ChatTab deal={deal} />}
            {activeTab === 'calculator' && (
              <CalculatorTab
                deal={deal}
                calcState={calcState}
                onCalcStateChange={setCalcState}
              />
            )}
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
