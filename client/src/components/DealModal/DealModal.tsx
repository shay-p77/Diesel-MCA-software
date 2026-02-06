import { useState, useRef, useEffect } from 'react'
import { Deal } from '../../types'
import { api } from '../../services/api'
import './DealModal.css'

interface DealModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (deal: Deal) => void
  deal?: Deal | null
}

export default function DealModal({ isOpen, onClose, onSave, deal }: DealModalProps) {
  const [businessName, setBusinessName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [amountRequested, setAmountRequested] = useState('')
  const [industry, setIndustry] = useState('')
  const [dateSubmitted, setDateSubmitted] = useState('')
  const [broker, setBroker] = useState('')
  const [notes, setNotes] = useState('')
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState(false)
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditMode = !!deal

  const formatAmount = (value: number) => {
    return value.toLocaleString('en-US')
  }

  const parseAmount = (value: string) => {
    return value.replace(/[^0-9]/g, '')
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseAmount(e.target.value)
    if (raw === '') {
      setAmountRequested('')
    } else {
      const num = parseInt(raw, 10)
      setAmountRequested(formatAmount(num))
    }
  }

  useEffect(() => {
    if (deal) {
      setBusinessName(deal.businessName || '')
      setOwnerName(deal.ownerName || '')
      setAmountRequested(deal.amountRequested ? formatAmount(deal.amountRequested) : '')
      setIndustry(deal.industry || '')
      setDateSubmitted(deal.dateSubmitted ? deal.dateSubmitted.split('T')[0] : '')
      setBroker(deal.broker || '')
      setNotes(deal.notes || '')
      setPdfFiles([])
      setExtracted(true)
      setExtracting(false)
    } else {
      setBusinessName('')
      setOwnerName('')
      setAmountRequested('')
      setIndustry('')
      setDateSubmitted(new Date().toISOString().split('T')[0])
      setBroker('')
      setNotes('')
      setPdfFiles([])
      setExtracted(false)
      setExtracting(false)
    }
    setError(null)
    setExtractionMessage(null)
  }, [deal, isOpen])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf')
      setPdfFiles(prev => [...prev, ...pdfFiles])
    }
  }

  const removeFile = (index: number) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleExtractMetadata = async () => {
    if (pdfFiles.length === 0) {
      setExtracted(true)
      return
    }

    setExtracting(true)
    setError(null)
    setExtractionMessage(null)

    try {
      const result = await api.extractMetadata(pdfFiles)

      if (result.metadata.businessName) setBusinessName(result.metadata.businessName)
      if (result.metadata.ownerName) setOwnerName(result.metadata.ownerName)
      if (result.metadata.amountRequested) setAmountRequested(formatAmount(result.metadata.amountRequested))
      if (result.metadata.industry) setIndustry(result.metadata.industry)
      if (result.metadata.broker) setBroker(result.metadata.broker)

      if (result.message) setExtractionMessage(result.message)

      setExtracted(true)
    } catch (err: any) {
      setError(err.message || 'Failed to extract metadata from PDFs')
      setExtracted(true)
    } finally {
      setExtracting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const rawAmount = parseAmount(amountRequested)
      const dealData = {
        businessName: businessName || undefined,
        ownerName: ownerName || undefined,
        amountRequested: rawAmount ? parseInt(rawAmount, 10) : undefined,
        dateSubmitted: dateSubmitted || undefined,
        broker: broker || undefined,
        notes: notes || undefined,
        industry: industry || undefined,
      }

      let savedDeal: Deal

      if (isEditMode && deal) {
        savedDeal = await api.updateDeal(deal.id, dealData)
      } else {
        savedDeal = await api.createDeal(dealData)
      }

      if (pdfFiles.length > 0) {
        const uploadResult = await api.uploadPdfs(savedDeal.id, pdfFiles)
        savedDeal = uploadResult.deal
      }

      onSave(savedDeal)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save deal')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditMode ? 'Edit Deal' : 'New Deal'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* PHASE 1: PDF Upload (new deals only, before extraction) */}
            {!isEditMode && !extracted && (
              <>
                <div className="form-group">
                  <label>Upload Bank Statements / Application PDFs</label>
                  <p className="form-hint">
                    Upload PDFs first and we'll auto-fill the deal information using AI.
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="pdf-file"
                  />
                  <div className="file-upload-area">
                    {pdfFiles.length > 0 ? (
                      <div className="files-list">
                        {pdfFiles.map((file, index) => (
                          <div key={index} className="file-selected">
                            <span className="file-icon">PDF</span>
                            <span className="file-name">{file.name}</span>
                            <button
                              type="button"
                              className="file-remove"
                              onClick={() => removeFile(index)}
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                        <label htmlFor="pdf-file" className="file-label-add">
                          <span>+ Add more PDFs</span>
                        </label>
                      </div>
                    ) : (
                      <label htmlFor="pdf-file" className="file-label">
                        <span>Click to upload PDFs (multiple allowed)</span>
                      </label>
                    )}
                  </div>
                </div>

                {extracting && (
                  <div className="extraction-loading">
                    <div className="spinner"></div>
                    <span>Analyzing documents with AI...</span>
                  </div>
                )}

                {error && <div className="form-error">{error}</div>}
              </>
            )}

            {/* PHASE 2: Form fields (edit mode or after extraction) */}
            {(isEditMode || extracted) && (
              <>
                {extractionMessage && (
                  <div className="extraction-message">{extractionMessage}</div>
                )}

                {/* Show uploaded files summary */}
                {!isEditMode && pdfFiles.length > 0 && (
                  <div className="form-group">
                    <label>Uploaded PDFs ({pdfFiles.length})</label>
                    <div className="files-summary">
                      {pdfFiles.map((file, index) => (
                        <span key={index} className="file-chip">
                          <span className="file-icon-small">PDF</span>
                          {file.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="businessName">Business Name</label>
                  <input
                    type="text"
                    id="businessName"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="Enter business name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="ownerName">Owner Name</label>
                  <input
                    type="text"
                    id="ownerName"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    placeholder="Enter owner name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="amountRequested">Amount Requested</label>
                  <div className="amount-input">
                    <span className="dollar-prefix">$</span>
                    <input
                      type="text"
                      id="amountRequested"
                      value={amountRequested}
                      onChange={handleAmountChange}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="industry">Industry</label>
                  <input
                    type="text"
                    id="industry"
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    placeholder="e.g. Restaurant, Retail, Construction"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dateSubmitted">Date</label>
                  <input
                    type="date"
                    id="dateSubmitted"
                    value={dateSubmitted}
                    onChange={e => setDateSubmitted(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="broker">Broker / ISO</label>
                  <input
                    type="text"
                    id="broker"
                    value={broker}
                    onChange={e => setBroker(e.target.value)}
                    placeholder="Enter broker or ISO name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="notes">Notes</label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add any notes about this deal..."
                    rows={3}
                  />
                </div>

                {/* PDF upload for edit mode */}
                {isEditMode && (
                  <div className="form-group">
                    <label>Bank Statement PDFs</label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".pdf"
                      multiple
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      id="pdf-file"
                    />
                    <div className="file-upload-area">
                      {pdfFiles.length > 0 || (deal?.bankAccounts && deal.bankAccounts.length > 0) ? (
                        <div className="files-list">
                          {pdfFiles.map((file, index) => (
                            <div key={index} className="file-selected">
                              <span className="file-icon">PDF</span>
                              <span className="file-name">{file.name}</span>
                              <button
                                type="button"
                                className="file-remove"
                                onClick={() => removeFile(index)}
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                          {deal?.bankAccounts && deal.bankAccounts.map((account, index) => (
                            <div key={`existing-${index}`} className="file-existing">
                              <span className="file-icon">PDF</span>
                              <span className="file-name">{account.pdfFileName}</span>
                              <span className="file-status">Uploaded</span>
                            </div>
                          ))}
                          <label htmlFor="pdf-file" className="file-label-add">
                            <span>+ Add more PDFs</span>
                          </label>
                        </div>
                      ) : (
                        <label htmlFor="pdf-file" className="file-label">
                          <span>Click to upload PDFs (multiple allowed)</span>
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {error && <div className="form-error">{error}</div>}
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}
              disabled={saving || extracting}>
              Cancel
            </button>

            {/* Phase 1: Upload actions */}
            {!isEditMode && !extracted && !extracting && (
              <>
                <button type="button" className="btn-skip"
                  onClick={() => setExtracted(true)}>
                  Skip
                </button>
                <button type="button" className="btn-save"
                  onClick={handleExtractMetadata}
                  disabled={pdfFiles.length === 0}>
                  Analyze & Continue
                </button>
              </>
            )}

            {/* Phase 2: Create/Save */}
            {(isEditMode || extracted) && (
              <button type="submit" className="btn-save" disabled={saving}>
                {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Deal'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
