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
  const [amountRequested, setAmountRequested] = useState('')
  const [dateSubmitted, setDateSubmitted] = useState('')
  const [broker, setBroker] = useState('')
  const [notes, setNotes] = useState('')
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setAmountRequested(deal.amountRequested ? formatAmount(deal.amountRequested) : '')
      setDateSubmitted(deal.dateSubmitted ? deal.dateSubmitted.split('T')[0] : '')
      setBroker(deal.broker || '')
      setNotes(deal.notes || '')
      setPdfFiles([])
    } else {
      setBusinessName('')
      setAmountRequested('')
      setDateSubmitted(new Date().toISOString().split('T')[0])
      setBroker('')
      setNotes('')
      setPdfFiles([])
    }
    setError(null)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const rawAmount = parseAmount(amountRequested)
      const dealData = {
        businessName: businessName || undefined,
        amountRequested: rawAmount ? parseInt(rawAmount, 10) : undefined,
        dateSubmitted: dateSubmitted || undefined,
        broker: broker || undefined,
        notes: notes || undefined,
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

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
